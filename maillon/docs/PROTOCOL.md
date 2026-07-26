# Maillon — spécification du protocole, v1

Réseau maillé chiffré de bout en bout, sans internet, sans serveur, sans compte.
Ce document est normatif : le code de `src/` en est l'implémentation de référence.

## 0. Principes

1. **Aucune infrastructure.** Pas de DNS, pas de serveur d'annuaire, pas de
   signalisation centrale. Deux appareils à portée radio doivent pouvoir
   communiquer, et deux appareils hors de portée doivent pouvoir communiquer via
   les appareils intermédiaires.
2. **Un seul cœur protocolaire.** Le format binaire, la crypto et le routage
   sont indépendants du transport et de la plateforme. Une seule
   implémentation, testée hors radio contre un simulateur.
3. **Le transport est un détail.** BLE, Wi-Fi local, USB, audio, QR : tout
   transport capable de livrer des trames opaques de taille bornée convient.
4. **Dégradation progressive.** L'absence d'un transport réduit le débit ou la
   portée, jamais la sécurité.

## 1. Modèle de nœud

Chaque nœud possède :

| Élément | Nature | Rôle |
|---|---|---|
| Clé d'identité | Ed25519 (32 o) | signature, identité vérifiable à long terme |
| Clé d'accord | X25519 (32 o), dérivée de l'identité | établissement de session |
| Empreinte | `SHA-256(pubEd)` tronquée à 8 o | vérification hors-bande (QR, mots) |
| Identifiants éphémères | 6 o, rotatifs | adressage sur le réseau |

L'identité est **locale et facultative** : aucun numéro de téléphone, aucun
courriel, aucun enregistrement. Une identité peut être jetée et régénérée à
tout instant.

### 1.1 Rôles

Un nœud annonce ses capacités dans ses trames `HELLO` :

- **`PEER`** — téléphone ordinaire. Émet et reçoit en BLE, budget batterie
  contraint, cache de relais réduit.
- **`SUPERNODE`** — ordinateur fixe, portable ou tablette sur secteur. Ne
  dépend pas du mode BLE *peripheral* (mal supporté sur les OS de bureau) :
  il opère en **BLE central** — balayage et connexion vers les téléphones qui
  émettent — et **ponte les grappes BLE sur le Wi-Fi local**. Sans contrainte
  de batterie, il assure un cache de relais large et une disponibilité
  continue.

Le super-nœud est l'écart de conception majeur avec les messageries maillées
existantes : il transforme un portable posé sur une table en épine dorsale du
réseau, et contourne le point de blocage réel du BLE de bureau.

### 1.2 Identifiants éphémères

```
ephId(epoch) = HKDF-SHA256(ikm = pubEd, salt = "maillon/eph/v1", info = LE64(epoch))[0..6]
epoch = floor(unixSeconds / 900)          # rotation toutes les 15 minutes
```

Conséquence voulue : **un contact qui connaît votre clé publique peut
recalculer votre identifiant et donc vous retrouver ; un observateur qui ne la
connaît pas ne peut pas corréler vos identifiants entre deux époques.**

En `AnonymityMode.STRICT`, l'identifiant éphémère est purement aléatoire et
renouvelé à chaque époque : même les contacts ne peuvent plus vous découvrir
passivement, la mise en relation passe par un échange explicite (QR).

`dst = 000000000000` désigne la diffusion générale.

## 2. Format de trame

Entiers en gros-boutiste. En-tête de **23 octets**, suivi de la charge utile.

```
 offset  taille  champ
 ------  ------  -----------------------------------------------------------
      0       1  version (4 bits hauts) | type (4 bits bas)
      1       1  drapeaux
      2       1  ttl — sauts restants
      3       6  packetId — aléatoire, clé de déduplication
      9       6  src — identifiant éphémère de l'émetteur d'origine
     15       6  dst — identifiant éphémère du destinataire, ou diffusion
     21       1  fragIndex
     22       1  fragCount
     23       n  charge utile (chiffrée si le drapeau ENCRYPTED est posé)
```

### 2.1 Types

| Val | Type | Rôle |
|---:|---|---|
| 0 | `HELLO` | annonce de voisinage : capacités, époque, densité observée |
| 1 | `HANDSHAKE` | messages 1–3 de la poignée de main Noise XX |
| 2 | `MESSAGE` | charge applicative chiffrée (direct ou canal) |
| 3 | `ACK` | accusé de livraison de bout en bout |
| 4 | `DIGEST` | anti-entropie : filtre de Bloom des trames détenues |
| 5 | `WANT` | demande explicite de trames par clé |
| 6 | `SOS` | diffusion d'urgence, priorité maximale |
| 7 | `FRAG_NACK` | demande de fragments manquants |
| 8 | `LAN_BEACON` | présence d'un super-nœud sur le réseau local |

### 2.2 Drapeaux

| Bit | Nom | Sens |
|---:|---|---|
| 0x01 | `ENCRYPTED` | charge utile chiffrée en AEAD |
| 0x02 | `SIGNED` | charge utile signée par la clé d'identité |
| 0x04 | `RELAYABLE` | éligible au relais et au stockage-transfert |
| 0x08 | `PRIORITY` | à relayer avant tout, gigue réduite |
| 0x10 | `SUPERNODE` | l'émetteur du saut disposait d'un lien réseau local |
| 0x20 | `PADDED` | charge utile complétée à un palier de taille fixe |

### 2.3 Fragmentation

Un transport déclare sa taille de trame maximale `maxFrameSize`. Le profil BLE
conservateur retient **185 octets** (MTU ATT négociée typique sur iOS), soit
**162 octets de charge utile par fragment**. Le profil réseau local retient
64 Kio.

Les fragments d'un même paquet **partagent le `packetId`** et se distinguent
par `fragIndex`. La clé de déduplication et de stockage est donc :

```
frameKey = packetId (6 o) || fragIndex (1 o)      # 7 octets
```

**Les relais ne réassemblent pas.** Ils acheminent des fragments individuels,
comme le fait un vrai réseau maillé : un relais n'a pas besoin de pouvoir
déchiffrer, ni même de connaître, le message qu'il transporte. Le réassemblage
n'a lieu qu'au destinataire.

## 3. Routage — inondation contrôlée

L'inondation naïve avec TTL s'effondre en forte densité (tempête de diffusion) :
chaque nœud rediffuse, les collisions radio explosent, la batterie fond. Maillon
combine trois correctifs, tous testés en simulation.

À la réception d'une trame `RELAYABLE` :

1. **Déduplication.** Si `frameKey` est déjà connue, incrémenter son compteur
   d'écoutes et **supprimer** le relais. Retour.
2. **Épuisement.** Enregistrer `frameKey`. Si `ttl <= 1`, ne pas relayer.
3. **Probabilité adaptative.** Rediffuser avec la probabilité
   `p = clamp(K / max(1, voisins), pMin, 1)`, `K = 3` par défaut. Isolé, on
   relaie toujours ; au milieu de cinquante appareils, on relaie rarement — la
   couverture reste assurée collectivement.
4. **Gigue.** Programmer l'émission après un délai aléatoire dans
   `[0, jitterMax]`. Un super-nœud et une trame `PRIORITY` obtiennent une gigue
   réduite : ils parlent en premier, donc couvrent le voisinage et dispensent
   les téléphones d'émettre.
5. **Suppression par comptage.** À l'échéance, si la trame a été entendue
   rediffusée par au moins `suppressThreshold` voisins (3 par défaut), annuler
   sa propre émission : le voisinage est déjà couvert.
6. Sinon émettre avec `ttl - 1`.

`ttl` initial : 7 sauts.

## 4. Stockage-transfert et anti-entropie

Un message destiné à un nœud absent n'est pas perdu : tout nœud sur le trajet
conserve la trame dans un magasin borné (`TTL` temporel, éviction par priorité
puis ancienneté).

La réconciliation à la rencontre d'un pair **n'est pas une réinondation
aveugle**. Chaque nœud envoie un `DIGEST` — un filtre de Bloom de ses
`frameKey` détenues. Le pair teste **ses propres** clés contre ce filtre : les
clés absentes du filtre sont celles que l'émetteur ne possède pas, et sont
poussées vers lui. Les deux sens opèrent symétriquement, donc l'échange
converge.

Le filtre de Bloom peut produire des faux positifs, jamais de faux négatifs :
une trame peut donc être omise à une rencontre, et sera transmise à la
suivante. C'est le compromis correct pour du routage épidémique — on échange
une convergence légèrement plus lente contre une consommation de bande passante
très inférieure à celle d'une réinondation.

## 5. Cryptographie

Primitives : **X25519** (accord), **Ed25519** (signature),
**XChaCha20-Poly1305** (AEAD, nonce 24 o donc tirage aléatoire sûr),
**HKDF-SHA256** (dérivation), **Argon2id** (mots de passe de canal).

### 5.1 Établissement de session — Noise XX

Trois messages, motif `XX` :

```
-> e
<- e, ee, s, es
-> s, se
```

Propriétés obtenues : authentification mutuelle, confidentialité persistante
(*forward secrecy*), et dissimulation de l'identité de l'initiateur face à un
observateur passif. Le chiffrement interne à la poignée de main suit la
spécification Noise : ChaCha20-Poly1305, nonce de 12 octets `0000 || LE64(n)`.

### 5.2 Messages — double cliquet

La poignée de main produit une clé racine qui alimente un **double cliquet**
(*double ratchet*), et non un simple secret de session :

- cliquet symétrique par message → **confidentialité persistante par message** ;
- cliquet Diffie-Hellman à chaque changement de sens → **sécurité
  post-compromission** : la capture d'un appareil ne déchiffre pas
  indéfiniment la suite de la conversation.

**Tolérance au désordre.** Dans un réseau maillé, les messages arrivent dans un
ordre arbitraire — c'est la règle, pas l'exception. Les clés de message
sautées sont donc conservées (`MAX_SKIP` par chaîne) afin qu'une trame en
retard reste déchiffrable. C'est une exigence structurelle, non un
raffinement.

### 5.3 Canaux

- **Canal protégé par mot de passe** : `clé = Argon2id(mot de passe, salt = nom du canal)`.
  Adhésion sans serveur : connaître le mot de passe suffit.
- **Clé d'émetteur** : chaque membre dispose de sa propre chaîne symétrique, si
  bien qu'un message de groupe est chiffré une fois et non une fois par
  destinataire.

### 5.4 Résistance aux métadonnées

Le contenu n'est pas le seul secret : la taille, la fréquence et les
identifiants en disent long.

- **Complétion par paliers.** Les charges utiles sont complétées à
  `{64, 256, 1024, 4096}` octets. Un observateur ne distingue pas « ok » de
  « rendez-vous annulé ».
- **Identifiants rotatifs** (§1.2), corrélables par les contacts uniquement.
- **Trafic de couverture** facultatif : émission de trames indiscernables du
  bruit à intervalles aléatoires, de sorte que le silence ne se distingue pas
  de la conversation.

## 6. Urgence

Le type `SOS` est une diffusion prioritaire portant une position compacte, un
horodatage et un niveau de batterie. Elle est signée mais **non chiffrée** :
son objet est d'être lue par quiconque peut aider. `ttl` maximal, gigue
minimale, éviction en dernier dans le magasin de relais.

C'est le cas d'usage qui justifie le projet : en zone blanche ou après une
coupure, un appel à l'aide doit franchir plusieurs sauts sans aucune
infrastructure.

## 7. Ce que le protocole ne fait pas

Énoncé explicitement, parce qu'un protocole qui prétend tout garantir ne
garantit rien :

- **Il ne cache pas votre présence radio.** Émettre en BLE est détectable par
  qui écoute à portée. Le contenu et les corrélations sont protégés ; le fait
  d'émettre ne l'est pas.
- **Il ne résiste pas au brouillage.** Un brouilleur radio coupe la couche
  physique, aucun protocole n'y répond.
- **Il ne garantit pas la livraison.** Sans chemin, un message expire. La
  livraison est *tolérante aux délais*, pas certaine.
- **Il n'a pas été audité.** L'implémentation est neuve. Elle utilise des
  primitives auditées et suit des constructions établies, ce qui n'équivaut pas
  à un audit de l'assemblage.
