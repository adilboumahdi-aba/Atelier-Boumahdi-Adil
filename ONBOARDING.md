# ABA Paysage — Onboarding Claude Code
> Fichier de mémoire projet. Lis ce fichier en premier à chaque nouvelle session.
> Dernière mise à jour automatique : 2026-06-17 16:33

---

## 🆕 0. PASSATION EN COURS — GEOFIELD (app GPS terrain)
> Ajouté manuellement le 26/07/2026 — ce bloc ne fait PAS partie du site ABA Paysage
> ci-dessous (sections 1-12). C'est un sous-projet distinct, démarré dans une session
> Claude Code Remote (cloud), à reprendre ici.

**Quoi** : une PWA de relevé de terrain géoréférencé pour ingénieurs/paysagistes —
levé GPS, mesures, fiches métier (arbres, réseaux, plantations…), photos localisées,
cartes hors ligne, exports SIG. Pensée pour être vendue en marque blanche à d'autres
bureaux d'études, pas seulement pour ABA.

**Où ça vit** : `/geofield/` à la racine de ce même dépôt. Statique, vanilla JS,
IndexedDB, aucun backend — compatible avec l'hébergement GitHub Pages existant.
Leaflet est vendorisé en local (`geofield/vendor/leaflet/`), aucun CDN externe.

**État git** :
- Branche : `claude/gps-app-engineer-features-1ru6th` (pas encore mergée sur `main`)
- PR (draft) : https://github.com/adilboumahdi-aba/Atelier-Boumahdi-Adil/pull/2
- 2 commits : ajout de la v1 complète + correction du bouton flottant du rapport PDF

**Ce qui est fait et testé** (tests bout-en-bout Playwright headless, 0 erreur JS) :
- Levé GPS point/ligne/polygone, moyennage de précision, mode marche, boussole
- 8 fiches métier configurables + champs libres (`geofield/js/templates.js`)
- Guidage d'implantation (stakeout), mesure distance/surface
- Photos géolocalisées (bug corrigé : elles restaient orphelines si prises avant
  d'enregistrer une nouvelle fiche — fix dans `js/app.js`, fonction `addPhotoToFeature`)
- Cartes hors ligne (téléchargement de tuiles par zone, IndexedDB) — `js/offline.js`
- Géodésie interne validée : WGS84, UTM, **Lambert 93**, **Lambert Maroc Nord/Sud**
  (`js/geo.js` — projections testées contre des valeurs de référence connues)
- Exports GeoJSON/CSV/GPX/KML + rapport PDF imprimable + sauvegarde complète
  (`js/exporter.js`)
- PWA installable (`manifest.webmanifest` + `sw.js`)

**Fichiers clés** :
```
geofield/
├── index.html          ← écran unique (projets + carte), toutes les feuilles modales
├── app.css             ← design system dédié (palette proche de journal.css)
├── js/app.js            ← orchestrateur — tout le câblage UI passe par là
├── js/geo.js             ← géodésie/projections (aucune dépendance)
├── js/store.js           ← état + CRUD au-dessus d'IndexedDB
├── js/map.js             ← carte Leaflet, dessin, mesure, implantation
├── js/exporter.js        ← tous les exports + rapport HTML imprimable
├── js/templates.js       ← les 8 modèles de fiche terrain
└── vendor/leaflet/       ← Leaflet vendorisé (pas de CDN)
```

**Maquette visuelle livrée** (captures réelles Android/web + proposition console bureau) :
https://claude.ai/code/artifact/2154ac98-4dcb-470f-977b-0d280a89d072

**⚠️ 3 arbitrages en attente d'Adil avant de continuer** :
1. Construit-on la **console bureau** (vue 3 volets calques/carte/fiche, tableau,
   prévu/réalisé) maintenant, ou est-ce que l'app mobile-first actuelle suffit pour l'instant ?
2. Reste-t-on **mono-appareil** (données locales sur le téléphone qui les a saisies),
   ou faut-il un **backend** pour partager un chantier en direct entre plusieurs personnes ?
3. Parmi les 8 modèles de fiche (générique, arbre, plantation, réseau, désordre,
   implantation, sondage, mesure), **lequel approfondir en premier** sur un vrai chantier ?

**Prochaine étape** : reprendre avec « Continue GeoField — [réponse aux 3 arbitrages] »,
ou juste demander l'état d'avancement si les décisions ne sont pas encore prises.

---

## 1. IDENTITÉ DU PROJET

**Client** : Adil Boumahdi — Fondateur & architecte paysagiste
**Studio** : ABA — Atelier Boumahdi Adil
**Email** : adil.boumahdi@ab-landscapes.com
**Villes** : Rabat · Casablanca · Marrakech · Fès
**Site live** : https://www.ab-landscapes.com

---

## 2. INFRASTRUCTURE TECHNIQUE

### Chemins
```
Local    : /Users/adilboumahdi/Desktop/ABA sarl au/MAC-IPAD EXCHANGE/00_AB LANDSCAPES_CLAUDE TEAM AI WORKSPACE/00_ABA WEBSITE DESIGN/
Repo     : github.com/adilboumahdi-aba/Atelier-Boumahdi-Adil
Branche  : main → déploiement auto GitHub Pages
```

### ⚠️ RÈGLE ABSOLUE
**GitHub account : UNIQUEMENT `adilboumahdi-aba`**
Ne jamais utiliser abhub-prog, ikenproapp ou tout autre compte.

### Git — État actuel
- Dernier commit : f08bfbc — Auto-memory — MAJ ONBOARDING + mémoire session 2026-06-15 12:49 (2 days ago)
- Fichiers en attente : 9

### Stack
- HTML statique + CSS vanilla + JS vanilla — aucun framework
- Déploiement : GitHub Pages (push main → live ~2 min)
- Serveur local : `npx serve . -p 3002`

---

## 3. ARCHITECTURE DU SITE

```
/
├── preview.html          ← Page d'accueil principale (React inline)
├── blog.html             ← Journal homepage (22 articles, 10 catégories)
├── portfolio.html        ← Portfolio (5 fiches projets)
├── sitemap.xml + robots.txt
├── 404.html              ← ⚠️ À CRÉER (T2)
├── assets/
│   ├── journal.css       ← Design system partagé
│   ├── i18n.js           ← Moteur traduction FR/EN/ES
│   ├── aba-logo.png      ← Logo noir (thème clair)
│   └── portfolio/        ← 5 fiches HTML
└── blog/                 ← 26 articles (26 traduits FR/EN/ES)
```

---

## 4. DESIGN SYSTEM — journal.css

### Typographie
- Display : Cormorant Garamond | Corps : Spectral | UI : Hanken Grotesk

### Palette
| Token | Light | Dark |
|---|---|---|
| `--bg` | `#efe9dd` | `#121316` |
| `--ink` | `#1d1b16` | `#ece6d8` |
| `--accent` | `#1f3a5f` | `#7ea0d0` |
| `--green` | `#a8c61c` | `#b4d422` |

### Logo PNG dans le journal
```html
<a href="../preview.html" class="aba-logo">
  <img class="aba-logo__img" src="../assets/aba-logo.png" alt="ABA">
  <div class="aba-logo__txt">
    <span class="aba-logo__aba">ABA</span>
    <span class="aba-logo__wm">Atelier Boumahdi Adil</span>
  </div>
</a>
```
Thème clair : `mix-blend-mode: multiply` | Sombre : `filter: invert(1)` + `mix-blend-mode: screen`

### 5 gabarits d'articles
`imm-hero` · `aside-grid` · `wrap-narrow prose` · `spread-body prose` · `gal gal--3`

---

## 5. SYSTÈME DE TRADUCTION FR/EN/ES

```html
<!-- Niveau 1 : UI -->
<a data-i18n="backToJournal">← Retour au sommaire</a>
<!-- Niveau 2 : Titres/deks -->
<h1 data-fr="Titre FR" data-en="Title EN" data-es="Título ES">Titre FR</h1>
<!-- Niveau 3 : Corps complet -->
<div data-lang-block="fr" class="prose">[FR]</div>
<div data-lang-block="en" class="prose" style="display:none">[EN]</div>
<div data-lang-block="es" class="prose" style="display:none">[ES]</div>
```

---

## 6. ARTICLES (26 total — 26 traduits FR/EN/ES)

### Handoff (10 articles) ✅ FR/EN/ES
eau-ecrite-dans-la-pierre · riad-jardin-clos · art-pierre-seche · tadelakt-zellige-lumiere
florilege-du-sec · ombre-sous-l-olivier · nuit-au-jardin · xeropaysage-luxe-sobre
villa-des-oudayas-patio · jeu-mineral

### ABA originaux (12 articles) ✅ FR/EN/ES
lire-un-terrain · la-pierre-seche-300-ans · plante-endemique · parc-merinide
lac-artificiel · revetements-exterieurs · arrosage-automatique · etang-rabat-koi
entretien-signe · eclairage-exterieur · espace-jeu-materiaux-naturels · arganier

---

## 7. IDENTIFIANTS TECHNIQUES

```
Web3Forms   : 1eba26f0-bd01-4151-ba20-80f605bce534
WhatsApp    : +212 661 920 316
Brevo       : https://2841c208.sibforms.com/serve/MUIFAK0S-[...]
GA4         : ⚠️ À RÉCUPÉRER (non encore installé — T4)
```

---

## 8. ÉQUIPE 9 AGENTS (team: aba-landscapes) — EN VEILLE

0 Directeur Éditorial · 1 Architecte Web · 2 Journaliste · 3 Portfolio
4 SEO · 5 Newsletter · 6 Social Media · 7 QA · 8 Analytics

⚠️ Ne réactiver aucun agent sans autorisation explicite d'Adil.

---

## 9. TÂCHES RESTANTES

### 🔴 BLOC 1 — Bloquant (lancement officiel)
- [ ] T1 — Mentions légales + Confidentialité
- [ ] T2 — Page 404 personnalisée
- [ ] T3 — Favicon ABA
- [ ] T4 — Google Analytics GA4 (attente code G-XXXXXXXXXX)
- [ ] T5 — Test formulaire contact (Adil teste)

### 🟠 BLOC 2 — Fortement recommandé
- [ ] T6 — Vérification mobile responsive
- [ ] T7 — Google Search Console + sitemap
- [ ] T8 — Test newsletter Brevo
- [ ] T9 — Newsletter annonce lancement Saison 2

### 🟡 BLOC 3 — Post-lancement
- [ ] T10 — Vraies photos portfolio
- [ ] T11 — Social Media lancement
- [ ] T12 — Cookie banner RGPD
- [ ] T13 — Open Graph images par article

### 🔵 BLOC 4 — Saison 2
- [ ] T14 — Planification articles 23-34
- [ ] T15 — Landing pages par ville
- [ ] T16 — Portfolio avec vraies photos

---

## 10. RÈGLES ÉDITORIALES ABA

**Ton** : expert, précis, données chiffrées, pas de jargon commercial, 1ère personne pluriel
**Auteurs** : Adil Boumahdi (AB) · Salma Othmani (SO) · Yassine El Fassi (YF) · Nadia Berrada (NB) · Atelier ABA
**Ne pas traduire** : noms botaniques latins, noms de lieux marocains, termes techniques (tadelakt, zellige, maâlem, chahar bagh)

---

## 11. PROCESSUS DE TRAVAIL

1. **Expliquer le workflow** avant chaque tâche
2. **Attendre la validation** d'Adil
3. **Exécuter** la tâche
4. **Commit + push** systématiquement sur `adilboumahdi-aba`
5. **Prévenir** quand le site est mis à jour en ligne

---

## 12. AUTO-MEMORY SYSTEM

Ce fichier est mis à jour automatiquement par `scripts/auto-memory.py` :
- **Toutes les 30 min** via macOS LaunchAgent (`com.aba.auto-memory.plist`)
- **À chaque fermeture** de session via `.claude/settings.json` Stop hook
- **Compatible** avec tous les comptes Claude Team sur ce Mac

Fichiers mémoire : `MEMOIRE-SESSION-[date-heure].md` (un par session active)

---

*Source de vérité du projet ABA. Mise à jour automatique toutes les 30 min.*
