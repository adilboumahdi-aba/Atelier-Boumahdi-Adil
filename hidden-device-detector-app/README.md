# ABA Privacy Shield

Application Android de contre-surveillance personnelle : elle aide à repérer des micros et
caméras cachés dans les hôtels, sanitaires et autres lieux publics, pour protéger votre vie
privée. **Aucune donnée ne quitte l'appareil** : pas de compte, pas de cloud, pas de télémétrie.

## Avertissement légal

Cette application est une **aide à la détection**, pas une preuve juridique formelle.
- Utilisez-la uniquement dans les lieux où vous êtes légalement présent, pour protéger votre
  propre vie privée.
- La loi encadre strictement la surveillance d'autrui : ne l'utilisez jamais pour espionner des
  tiers.
- En cas de découverte, contactez la gérance du lieu et, si nécessaire, les autorités compétentes
  de votre pays.

## Modules

| Module | Technique | Fiabilité |
|---|---|---|
| Détecteur d'objectifs | CameraX + analyse de luminance (grille + détection de blobs) pour repérer les reflets de lentille dans le noir, flash allumé | Bonne aide visuelle, dépend de l'obscurité de la pièce et de l'angle de balayage |
| Scanner réseau | Sonde TCP sur les ports typiques de caméras IP/DVR (RTSP 554, ONVIF, Dahua 37777, DVR génériques 34567…) sur le sous-réseau Wi-Fi local + heuristique de fabricant par préfixe MAC (OUI) | Heuristique : de nombreux faux positifs possibles (routeurs, imprimantes, box TV) |
| Radar Bluetooth | Scan BLE natif Android, tri par force de signal (RSSI), heuristiques sur les noms d'appareils suspects | Bonne pour les balises BLE ; ne détecte pas les caméras sans radio Bluetooth |
| Détecteur magnétique | Magnétomètre du téléphone, calibrage d'un niveau ambiant puis alerte sur écart | Auxiliaire uniquement : détecte des anomalies magnétiques (aimants, métal), pas les ondes radio |
| Checklist d'inspection | Guide physique statique (prises, détecteurs de fumée, miroirs, cadres, etc.) | Complète les scans électroniques |
| Historique | Sessions et rapports stockés localement (Room), exportables en texte via le partage système | Local uniquement, sauvegarde cloud désactivée (`allowBackup=false`) |

### Limite importante : pas d'analyse RF large bande

Une vraie détection radio (repérer un émetteur caché quelle que soit sa fréquence) nécessite un
récepteur RF dédié : un téléphone seul ne peut pas le faire de façon fiable. Cette app ne prétend
pas le faire — elle combine des techniques logicielles complémentaires (caméra, réseau,
Bluetooth, magnétomètre) qui couvrent une bonne partie des dispositifs espions grand public
(souvent en Wi-Fi ou en Bluetooth), mais pas un micro purement RF/GSM sans connexion IP.

## Stack technique

- Kotlin 1.9.24, Jetpack Compose (Material 3), Navigation Compose
- CameraX 1.3.4 (Preview + ImageAnalysis)
- Room 2.6.1 (via KSP) pour l'historique local
- Aucune dépendance à un framework d'injection (conteneur manuel dans `PrivacyShieldApp`)
- minSdk 26 / targetSdk & compileSdk 34

## Build

Ce projet a été écrit dans un environnement sans SDK Android installé (pas de compilation réelle
possible ici) : ouvrez-le dans **Android Studio** (Koala ou plus récent) pour compiler.

```bash
./gradlew assembleDebug
```

Android Studio proposera automatiquement l'installation du SDK/build-tools manquants au premier
ouverture du projet.

## Permissions demandées

- `CAMERA` / `FLASHLIGHT` — détecteur d'objectifs
- `INTERNET`, `ACCESS_WIFI_STATE`, `ACCESS_NETWORK_STATE` — scan du réseau **local** uniquement
- `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT` (Android 12+) ou `ACCESS_FINE_LOCATION` (Android ≤11,
  exigé par l'OS pour le scan BLE — **aucune position GPS n'est utilisée par l'app**)
- `VIBRATE` — retour haptique du détecteur magnétique

## Confidentialité

- Aucun compte, aucun serveur, aucune télémétrie.
- Sauvegarde cloud/transfert d'appareil désactivés pour la base de données locale.
- L'export de rapport se fait uniquement via le partage système (vous choisissez le destinataire).
