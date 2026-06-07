# ABA Paysage — Onboarding Claude Code
> Fichier de mémoire projet. Lis ce fichier en premier à chaque nouvelle session.
> Dernière mise à jour : 2026-06-07 12h20

---

## ⚡ REPRISE IMMÉDIATE — QUESTION EN ATTENTE

**À poser à Adil dès le début de la session :**

Le footer du site (`preview.html`) contient les liens suivants dans la colonne **ATELIER** :
- **Philosophie** → `#philosophie` ✅ fonctionne (ancre existante)
- **Équipe** → `#` ⚠️ lien vide
- **Presse** → `#` ⚠️ lien vide
- **Carrières** → `#` ⚠️ lien vide

**Quelle option choisissez-vous ?**

> **Option A — Pages dédiées** : Créer `equipe.html`, `presse.html`, `carrieres.html` avec design ABA complet + contenu FR/EN/ES (nécessite du contenu : bio équipe, dossier presse, offres emploi)
>
> **Option B — Ancres sur la page d'accueil** : Ajouter des sections `#equipe`, `#presse`, `#carrieres` directement dans `preview.html`, comme la section Philosophie (solution rapide, tout en une page)
>
> **Option C — Désactiver ces liens** : Supprimer ou griser Équipe/Presse/Carrières du footer jusqu'à ce que les pages soient prêtes (le plus propre pour le lancement officiel)

---

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
- Dernier commit : f529385 — Auto-memory 2026-06-07 12:20
- Statut : propre

### Stack
- HTML statique + CSS vanilla + JS vanilla — aucun framework
- Déploiement : GitHub Pages (push main → live ~2 min)
- Serveur local : `npx serve . -p 3002`

---

## 3. ARCHITECTURE DU SITE

```
/
├── preview.html              ← Page d'accueil (React inline, traduction propre)
├── blog.html                 ← Journal homepage (22 articles, 10 catégories) ✅ FR/EN/ES
├── portfolio.html            ← Portfolio (5 fiches projets) ✅ FR/EN/ES
├── mentions-legales.html     ← ✅ Fait — FR/EN/ES
├── conditions-generales.html ← ✅ Fait — FR/EN/ES
├── 404.html                  ← ✅ Fait — FR/EN/ES
├── sitemap.xml + robots.txt
├── assets/
│   ├── journal.css           ← Design system partagé
│   ├── i18n.js               ← Moteur FR/EN/ES (innerHTML + data-lang-block + getLang)
│   ├── newsletter-popup.js   ← Popup Variant A — 5sec+exit intent — FR/EN/ES — 29 pages
│   ├── aba-logo.png          ← Logo noir (thème clair)
│   ├── favicon.ico + favicon-*.png + apple-touch-icon.png ← Option B beige
│   └── portfolio/            ← 5 fiches HTML
└── blog/                     ← 22 articles (22 traduits FR/EN/ES ✅)
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

### ⚠️ RÈGLE PRIMORDIALE
**L'INTÉGRALITÉ du site doit être traduite en FR, EN et ES sans exception.**
Tous les articles, pages, navigation, footer, boutons, popups, textes présents et futurs.


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

## 6. ARTICLES (22 total — 22 traduits FR/EN/ES)

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
GA4         : G-P2MDTEBQVF  ✅ installé sur toutes les pages
```

⚠️ Données légales internes (NE PAS PUBLIER) :
RC: 165659 | Patente: 25713696 | IF: 53574503 | CNSS: 4817763 | ICE: 003208303000020

---

## 8. ÉQUIPE 9 AGENTS (team: aba-landscapes) — EN VEILLE

0 Directeur Éditorial · 1 Architecte Web · 2 Journaliste · 3 Portfolio
4 SEO · 5 Newsletter · 6 Social Media · 7 QA · 8 Analytics

⚠️ Ne réactiver aucun agent sans autorisation explicite d'Adil.

---

## 9. TÂCHES RESTANTES

### ✅ COMPLÉTÉES
- [x] T1 — Mentions légales (mentions-legales.html) ✅ FR/EN/ES
- [x] T1b — Conditions générales (conditions-generales.html) ✅ FR/EN/ES
- [x] T2 — Page 404 (404.html) ✅ FR/EN/ES
- [x] T3 — Favicon ABA — Option B beige ✅
- [x] T4 — GA4 G-P2MDTEBQVF — installé toutes les pages ✅
- [x] T6 — Mobile responsive — hamburger + overflow-x ✅
- [x] T7 — Google Search Console — DNS vérifié + 25 URLs soumis ✅
- [x] T8 — Newsletter popup Variant A — FR/EN/ES — 29 pages ✅
- [x] AUDIT i18n — 100% du site traduit FR/EN/ES ✅

### 🔴 PRIORITÉ 1 — Décision immédiate
- [ ] T-FOOTER — Liens Équipe/Presse/Carrières (voir section ⚡ REPRISE en haut)

### 🟠 PRIORITÉ 2
- [ ] T5 — Test formulaire contact (Adil teste manuellement depuis navigateur)
- [ ] T12 — Cookie banner RGPD
- [ ] T13 — Open Graph images par article

### 🟡 POST-LANCEMENT
- [ ] T10 — Vraies photos portfolio (Adil fournit)
- [ ] T11 — Social Media lancement (agent en VEILLE)

### 🔵 SAISON 2
- [ ] T14 — Articles 23-34
- [ ] T15 — Landing pages par ville (Rabat, Casablanca, Marrakech, Fès)
- [ ] T16 — Portfolio avec vraies photos

---

## 10. RÈGLES ÉDITORIALES ABA

**Ton** : expert, précis, données chiffrées, pas de jargon commercial, 1ère personne pluriel
**Auteurs** : Adil Boumahdi (AB) · Salma Othmani (SO) · Yassine El Fassi (YF) · Nadia Berrada (NB) · Atelier ABA
**Ne pas traduire** : noms botaniques latins, noms de lieux marocains, termes techniques (tadelakt, zellige, maâlem, chahar bagh)

---

## 11. PROCESSUS DE TRAVAIL

1. **Lire ce fichier en premier** à chaque nouvelle session
2. **Poser la question T-FOOTER** (Option A/B/C) si non encore résolue
3. **Expliquer le workflow** avant chaque tâche
4. **Attendre la validation** d'Adil
5. **Exécuter** la tâche
6. **Commit + push** systématiquement sur `adilboumahdi-aba`
7. **Prévenir** quand le site est mis à jour en ligne

---

## 12. AUTO-MEMORY SYSTEM

Ce fichier est mis à jour automatiquement par `scripts/auto-memory.py` :
- **Toutes les 30 min** via macOS LaunchAgent (`com.aba.auto-memory.plist`)
- **À chaque fermeture** de session via `.claude/settings.json` Stop hook
- **Compatible** avec tous les comptes Claude Team sur ce Mac

Fichiers mémoire : `MEMOIRE-SESSION-[date-heure].md` (un par session active)

---

*Source de vérité du projet ABA. Mise à jour automatique toutes les 30 min.*
