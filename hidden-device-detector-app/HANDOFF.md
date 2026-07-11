# HANDOFF — ABA Privacy Shield (app Android de détection caméras/micros cachés)

> Document de passation pour reprendre ce projet sur Claude Code Desktop.
> Généré le 2026-07-11.

## 1. Contexte — pourquoi ce dossier est ici

Ce projet **n'a rien à voir** avec le site vitrine ABA Paysage (le reste de ce dépôt
`Atelier-Boumahdi-Adil`). C'est une application Android indépendante, développée dans un
sous-dossier (`hidden-device-detector-app/`) de ce même dépôt parce que :
- L'utilisateur voulait au départ un dépôt GitHub séparé (`aba-privacy-shield`).
- L'intégration GitHub de la session cloud n'avait pas la permission de créer un nouveau dépôt
  (`403 Resource not accessible by integration`).
- L'utilisateur a choisi, en attendant, de développer dans ce dépôt existant plutôt que de créer
  le dépôt manuellement.

**Recommandation pour la suite** : si tu as la main sur GitHub (via Claude Code Desktop ou
directement), il serait plus propre de migrer ce sous-dossier vers son propre dépôt
(`aba-privacy-shield` ou autre nom), pour ne pas mélanger un outil de sécurité personnelle avec
le site vitrine d'une entreprise de paysagisme. Ce n'est pas bloquant, juste une clarification
d'hygiène de dépôt à faire quand c'est pratique.

## 2. Ce que fait l'application

Détection de caméras/micros cachés (hôtels, sanitaires, lieux publics) pour protéger sa propre
vie privée — **jamais** pour surveiller autrui. 5 modules, tous fonctionnels en local, sans
cloud ni télémétrie :

1. **Détecteur d'objectifs** — CameraX + analyse de luminance par grille pour repérer les reflets
   de lentille dans le noir (flash + curseur de sensibilité).
2. **Scanner réseau** — sonde TCP sur le Wi-Fi local (ports RTSP/ONVIF/DVR typiques) + heuristique
   fabricant par préfixe MAC (OUI).
3. **Radar Bluetooth LE** — scan BLE natif, tri par force de signal (RSSI), heuristiques sur noms
   suspects.
4. **Détecteur magnétique** — magnétomètre du téléphone, calibrage + alerte sur écart.
5. **Checklist d'inspection physique** — guide statique (miroirs, détecteurs de fumée, prises…).
6. **Historique local (Room)** — sessions de scan par lieu, export de rapport texte via le partage
   système Android.

Détails complets, avertissement légal et limites techniques (pas d'analyse RF large bande) dans
`README.md` à la racine de ce dossier.

## 3. État exact du code à la reprise

- **60 fichiers**, ~3600 lignes, écrits intégralement dans cette session cloud.
- Architecture : Kotlin + Jetpack Compose (Material 3, thème sombre "HUD tactique"), pas de
  framework DI (conteneur manuel dans `PrivacyShieldApp.kt`), Room 2.6.1 pour la persistance
  locale, CameraX 1.3.4, Navigation Compose 2.7.7.
- **Une revue de code indépendante** (agent séparé, sans mémoire de la session d'écriture) a
  relu les 39 fichiers Kotlin + le manifeste + les fichiers Gradle. Deux problèmes réels ont été
  trouvés et corrigés :
  1. `AndroidManifest.xml` déclarait `android.permission.FLASHLIGHT`, qui **n'existe pas** en tant
     que permission Android réelle → supprimée.
  2. Le wrapper Gradle pointait vers Gradle 8.14.3, hors de la plage de compatibilité documentée
     d'AGP 8.3.2 (Gradle 8.4–8.6) → `gradle/wrapper/gradle-wrapper.properties` recalé sur
     `gradle-8.6-bin.zip`.
- Aucun autre problème de compilation identifié par la revue (imports, signatures d'API Room/
  CameraX/Compose/Navigation, annotations Room, cohérence des versions KSP/Kotlin/Compose
  compiler — tout vérifié cohérent).

## 4. ⚠️ Ce qui n'a PAS pu être vérifié ici (important)

L'environnement cloud où ce projet a été écrit **n'a pas le SDK Android installé**, et l'accès
réseau vers `dl.google.com` / `services.gradle.org` est bloqué par le proxy. Conséquence :
- **Aucune compilation Gradle réelle n'a été exécutée.** Le code a été écrit avec soin et relu
  par un agent indépendant, mais la toute première compilation se fera quand tu ouvriras le
  projet dans Android Studio (ou via `./gradlew assembleDebug` sur une machine avec le SDK).
- Il est possible (bien que peu probable vu la relecture) qu'il reste une erreur mineure de
  compilation (import manquant, typo) qui n'apparaît qu'à la compilation réelle.
- **Aucun test sur appareil réel** n'a été fait : permissions runtime (caméra, Bluetooth,
  localisation héritée pré-Android 12), comportement CameraX, scan réseau, tout reste à valider
  manuellement.

## 5. Prochaines étapes recommandées

1. Ouvrir `hidden-device-detector-app/` dans Android Studio (Koala ou plus récent) — le SDK/
   build-tools manquants seront proposés à l'installation automatiquement.
2. Lancer `./gradlew assembleDebug` (ou le bouton Run) et corriger les éventuelles erreurs de
   compilation résiduelles (peu probables mais possibles, cf. section 4).
3. Installer sur un appareil/émulateur Android 8+ (minSdk 26) et tester chaque module :
   - Détecteur d'objectifs : vérifier que le flash s'allume et que les reflets sont bien encerclés.
   - Scanner réseau : vérifier sur un vrai Wi-Fi domestique (le scan est borné à un /24, ~254 hôtes).
   - Bluetooth : vérifier la demande de permission BLUETOOTH_SCAN (Android 12+) ou
     ACCESS_FINE_LOCATION (Android ≤11).
   - Magnétomètre : vérifier calibrage + alerte + vibration.
   - Historique : vérifier la persistance après redémarrage de l'app et l'export via le partage
     système.
4. Décider si ce sous-dossier reste dans ce dépôt ou migre vers un dépôt dédié (voir section 1).
5. Si tout fonctionne : envisager une release signée (`signingConfig`), une icône lanceur PNG plus
   soignée que le vecteur "bouclier" actuel, et éventuellement des tests unitaires sur
   `SubnetUtils`, `LensGlintAnalyzer` (logique de blobs) et `SuspiciousBleCatalog`.

## 6. Git

- Branche : `claude/hidden-device-detector-app-rqvkws`
- Poussée sur `origin` (dépôt `adilboumahdi-aba/Atelier-Boumahdi-Adil`).
- Aucune pull request créée pour l'instant (non demandée explicitement par l'utilisateur).
- Commit principal : "Add ABA Privacy Shield: Android app to detect hidden cameras/microphones".

## 7. Pour reprendre avec Claude Code Desktop

- Si tu cloues/ouvres ce même dépôt : `git checkout claude/hidden-device-detector-app-rqvkws`,
  puis lis ce fichier + `MEMOIRE-SESSION-2026-07-11.md` + `README.md`.
- Si tu pars du fichier `.zip` fourni séparément : décompresse-le, ouvre le dossier obtenu comme
  un projet Android Studio, puis initialise un dépôt git si besoin (`git init`) avant de
  continuer — le zip ne contient pas d'historique git, seulement l'arborescence du projet.
