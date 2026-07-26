# Maillon

Messagerie chiffrée de bout en bout fonctionnant **sans internet, sans serveur et
sans compte**. Les appareils forment un réseau maillé et se relaient les messages
les uns aux autres.

État : **phase 1 terminée** — cœur protocolaire complet et testé. Pas encore
d'application installable. Voir la feuille de route.

```bash
npm install
npm test          # 87 tests
npm run demo      # démonstration exécutable, sans aucune radio
```

## Ce que c'est

Un cœur protocolaire en TypeScript, sans aucune dépendance de plateforme :
format binaire, cryptographie, routage maillé, stockage-transfert. La même
implémentation sert iOS, Android, Windows, macOS, Linux et le web.

Ce choix est structurant. Trois implémentations d'un protocole chiffré, ce
serait trois jeux de bogues de sécurité à trouver — et les bogues de crypto ne
se voient pas à l'usage.

```
┌──────────── interface (React / React Native) ────────────┐
├──────── mesh-core — ce dépôt, aucune dépendance radio ────┤
│  trames · fragmentation · Noise XX · double cliquet       │
│  inondation contrôlée · anti-entropie · magasin de relais │
├──────────────── interface Transport ─────────────────────┤
│  BLE natif │ réseau local │ audio │ QR │ SIMULÉ (tests)   │
└──────────────────────────────────────────────────────────┘
```

## En quoi cela diffère des messageries maillées existantes

**Les ordinateurs deviennent l'épine dorsale.** C'est l'écart principal. Un
téléphone doit émettre en BLE pour être découvert, ce qui coûte de la batterie ;
un ordinateur de bureau, lui, ne sait généralement pas émettre en BLE — le mode
*peripheral* est mal pris en charge par les OS de bureau. On inverse donc les
rôles : **les téléphones émettent, les ordinateurs écoutent** (mode *central*,
parfaitement supporté partout) **et pontent les grappes BLE sur le Wi-Fi local**.
Un portable posé sur une table devient un relais permanent, sans contrainte de
batterie, avec un grand cache — mesuré dans la démonstration : 286 trames
conservées contre 256 au plafond d'un téléphone.

Conséquence de conception qu'il a fallu corriger en cours de route : un
super-nœud est presque toujours un **point d'articulation** du graphe. Le
soumettre à la modération probabiliste des rediffusions revient à amputer tout
le réseau situé derrière lui. Les super-nœuds relaient donc systématiquement —
voir `src/router.ts`.

**Confidentialité persistante par message.** Un double cliquet complet (cliquet
symétrique par message, cliquet Diffie-Hellman à chaque changement de sens), et
non un simple secret de session. La capture d'un appareil ne déchiffre pas
indéfiniment la suite de la conversation.

**Tolérance au désordre, traitée comme une exigence.** Dans un maillage, les
messages arrivent dans un ordre arbitraire — c'est la règle, pas l'exception.
Les clés de message sautées sont conservées, dans des bornes strictes. Testé sur
des permutations complètes et à travers les pas de cliquet.

**Réconciliation anti-entropie, pas de réinondation.** À la rencontre d'un pair,
chaque camp résume ses trames dans un filtre de Bloom ; seul le manquant est
transmis. C'est aussi ce qui porte la garantie de livraison : l'inondation est
au mieux-effort, l'anti-entropie finit par aboutir. Mesuré : 11/29 appareils
couverts immédiatement, 29/29 après réconciliation.

**Résistance aux métadonnées.** Complétion par paliers de taille — « ok » et
« rendez-vous annulé » produisent des trames identiques. Identifiants éphémères
rotatifs, recalculables par vos contacts, incorrélables par un inconnu.

**Urgence.** Les appels de détresse échappent à la modération de densité, portent
un TTL maximal et sont les derniers évincés du magasin de relais.

## Ce qui est fait, et ce qui reste

| Phase | Contenu | État |
|---|---|---|
| 0 | Spécification du protocole (`docs/PROTOCOL.md`) | ✅ |
| 1 | Cœur : trames, crypto, routage, magasin, simulateur | ✅ 87 tests |
| 2 | Transports web : réseau local (WebRTC), audio, QR | à faire |
| 3 | PWA installable, utilisable sur un Wi-Fi coupé d'internet | à faire |
| 4 | Coques natives : BLE mobile (Expo), desktop (Tauri) | à faire |

La phase 4 est celle qui produit une application réellement sans infrastructure.
Elle exige des appareils physiques et une chaîne de compilation mobile — elle ne
peut pas être validée en environnement automatisé.

## Pourquoi un simulateur

`src/sim/network.ts` fait tourner des réseaux entiers sans une seule radio :
temps simulé, aléa à graine, donc **tout échec est reproductible**. C'est ce qui
permet de tester la partie réellement difficile — multi-sauts, tempêtes de
diffusion, partitions, pertes, appareils qui vont et viennent.

Trois bogues sérieux ont été trouvés ainsi, dont deux relevant de la sécurité :

- **Déni de service à un paquet.** Le cliquet appliquait le pas Diffie-Hellman
  sur la foi d'un en-tête non encore authentifié. Une unique trame forgée
  détruisait donc définitivement une session. Corrigé : toute mutation d'état est
  différée jusqu'au succès de l'authentification.
- **Sécurité post-compromission annulée.** Les nouvelles clés de cliquet étaient
  dérivées de la clé racine, donc prédictibles par qui capture l'état — ce qui
  détruisait précisément la propriété recherchée. Corrigé : tirage aléatoire.
- **Stockage-transfert silencieusement inopérant.** La réconciliation n'était
  déclenchée qu'à la découverte d'un voisin. Un appareil qui sortait de portée et
  revenait avant l'expiration du voisinage — s'éloigner une minute suffit —
  n'était jamais réconcilié. Corrigé : réconciliation également périodique.

## Ce que Maillon ne fait pas

Énoncé explicitement, parce qu'un projet de ce genre qui prétend tout garantir ne
garantit rien.

- **Il ne cache pas votre présence radio.** Émettre en BLE est détectable à
  portée. Le contenu et les corrélations sont protégés ; le fait d'émettre ne
  l'est pas.
- **Il ne résiste pas au brouillage.** Aucun protocole ne répond à une coupure
  de la couche physique.
- **Il ne garantit pas la livraison immédiate.** Sans chemin, un message attend
  puis expire. La livraison est *tolérante aux délais*, pas instantanée.
- **Il n'a pas été audité.** Le code est neuf. Il s'appuie sur des primitives
  auditées (`@noble/*`) et des constructions établies (Noise, double cliquet),
  ce qui n'équivaut pas à un audit de l'assemblage. Ne pas en dépendre pour
  protéger une vie sans revue indépendante préalable.
- **Un pair « non vérifié » signifie non vérifié.** Le chiffrement est réel, mais
  tant qu'une empreinte n'a pas été confirmée hors-bande — QR ou lecture à voix
  haute — rien ne prouve *qui* est en face.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `src/wire.ts` | format binaire, fragmentation, réassemblage |
| `src/identity.ts` | identités, empreintes, identifiants éphémères |
| `src/crypto/noise.ts` | poignée de main Noise XX |
| `src/crypto/ratchet.ts` | double cliquet, tolérance au désordre |
| `src/crypto/padding.ts` | complétion par paliers |
| `src/session.ts` | liaison Noise ↔ identité Ed25519 vérifiable |
| `src/router.ts` | inondation contrôlée (densité, gigue, comptage) |
| `src/store.ts` | magasin de relais, éviction par priorité |
| `src/bloom.ts` | résumés anti-entropie |
| `src/node.ts` | assemblage ; aucune horloge propre |
| `src/sim/network.ts` | simulateur à événements discrets |

Licence : AGPL-3.0-or-later (le texte de la licence reste à ajouter au dépôt).
