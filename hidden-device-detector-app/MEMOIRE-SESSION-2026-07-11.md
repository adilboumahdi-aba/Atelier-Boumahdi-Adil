# ABA Privacy Shield — Mémoire de Session
> Générée le 2026-07-11 — session cloud Claude Code (web/mobile), sans SDK Android disponible.

## État instantané

| Élément | Valeur |
|---|---|
| Projet | ABA Privacy Shield — app Android de détection caméras/micros cachés |
| Dépôt hôte | `adilboumahdi-aba/Atelier-Boumahdi-Adil` (site vitrine ABA Paysage — projet distinct, voir HANDOFF.md §1) |
| Sous-dossier | `hidden-device-detector-app/` |
| Branche Git | `claude/hidden-device-detector-app-rqvkws` (poussée sur origin) |
| Fichiers créés | 60 (voir commit "Add ABA Privacy Shield…") |
| Build réel testé | ❌ Non — pas de SDK Android ni accès réseau Google dans cet environnement cloud |
| Revue de code indépendante | ✅ Faite — 2 bugs trouvés et corrigés (voir ci-dessous) |
| Pull request | Non créée (pas demandée) |

## Décisions prises pendant la session

1. **Périmètre validé avec l'utilisateur** (via questions) : app native Android (pas web/iOS/RN),
   toutes les techniques logicielles de détection incluses (caméra, réseau, Bluetooth,
   magnétomètre, checklist).
2. **Dépôt** : tentative de créer `aba-privacy-shield` en dépôt séparé → refusée par GitHub
   (permissions de l'intégration). L'utilisateur a choisi de développer dans ce dépôt existant,
   sous-dossier dédié, plutôt que de créer le dépôt manuellement dans l'immédiat.
3. **Pas de framework RF/hardware externe** : clarifié dès le départ que la détection radio large
   bande nécessite un matériel dédié, hors de portée d'un smartphone seul — documenté dans le
   README comme limite assumée.
4. **Pas de framework DI** (Hilt écarté) : conteneur manuel dans `PrivacyShieldApp.kt` pour
   limiter les risques de mauvaise configuration non vérifiable sans build réel.
5. **Confidentialité par design** : `allowBackup=false`, pas de GPS/localisation auto-tagging,
   pas de compte, pas de serveur, export uniquement via le partage système Android.

## Bugs trouvés et corrigés (revue indépendante)

- `AndroidManifest.xml` : suppression de `android.permission.FLASHLIGHT` (permission Android
  inexistante — le contrôle du flash passe par `CameraX.cameraControl.enableTorch()`, qui ne
  nécessite que `CAMERA`).
- `gradle/wrapper/gradle-wrapper.properties` : distribution recalée de Gradle 8.14.3 → 8.6, pour
  rester dans la plage de compatibilité documentée d'AGP 8.3.2 (Gradle 8.4–8.6).

## Prochaines tâches prioritaires

- T1 — 🔴 Ouvrir dans Android Studio et faire la **première compilation réelle** (jamais testée).
- T2 — 🔴 Corriger les éventuelles erreurs de compilation résiduelles si la revue en a manqué.
- T3 — 🟡 Tester chaque module sur appareil réel (permissions runtime, CameraX, BLE, réseau).
- T4 — 🟡 Décider : garder ce sous-dossier ici ou migrer vers un dépôt GitHub dédié.
- T5 — 🟢 Icône lanceur PNG soignée (actuellement un vecteur "bouclier" simple).
- T6 — 🟢 Tests unitaires (`SubnetUtils`, `LensGlintAnalyzer`, `SuspiciousBleCatalog`).

## Liens rapides

- Dépôt : https://github.com/adilboumahdi-aba/Atelier-Boumahdi-Adil
- Branche : https://github.com/adilboumahdi-aba/Atelier-Boumahdi-Adil/tree/claude/hidden-device-detector-app-rqvkws
- Documentation complète : `README.md` (usage, modules, limites) et `HANDOFF.md` (passation technique détaillée) dans ce même dossier.

## Pour reprendre le travail

1. Ouvre Claude Code (Desktop ou CLI) dans ce dossier, ou clone le dépôt et checkout la branche
   `claude/hidden-device-detector-app-rqvkws`.
2. Lis `HANDOFF.md` en premier (contexte complet, ce qui n'a pas pu être vérifié).
3. Dis : "Ouvre le projet dans Android Studio et corrige les erreurs de compilation" ou
   "Reprends à partir de T1".
