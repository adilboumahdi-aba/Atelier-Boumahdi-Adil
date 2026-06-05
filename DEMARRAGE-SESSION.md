# ABA Paysage — Comment démarrer une session Claude Code
> À lire avant toute nouvelle session. Valable pour tous les comptes Claude Team.

---

## CAS 1 — Continuer dans le compte principal (adil.boumahdi@ab-landscapes.com)

**Rien à faire de spécial.** À chaque nouvelle session :

1. Ouvrez **Claude Code** dans le dossier du projet :
   ```
   /Users/adilboumahdi/Desktop/ABA sarl au/MAC-IPAD EXCHANGE/
   00_AB LANDSCAPES_CLAUDE TEAM AI WORKSPACE/00_ABA WEBSITE DESIGN/
   ```

2. Claude lit automatiquement `ONBOARDING.md` au démarrage

3. Dites simplement :
   > **"Reprends le projet ABA — tâche T[N]"**
   *(remplacez N par le numéro de la tâche en cours)*

✅ Le contexte est restauré en 5 secondes.

---

## CAS 2 — Nouvelle session sur un autre compte (aba@, sales@, ceo@...)

### Étape 1 — Connectez-vous avec le bon compte
Ouvrez Claude Code et connectez-vous avec le compte souhaité :
- `aba@ab-landscapes.com`
- `sales@ab-landscapes.com`
- `ceo@ab-landscapes.com`
- ou tout autre compte de l'équipe

### Étape 2 — Ouvrez le même dossier projet
```
/Users/adilboumahdi/Desktop/ABA sarl au/MAC-IPAD EXCHANGE/
00_AB LANDSCAPES_CLAUDE TEAM AI WORKSPACE/00_ABA WEBSITE DESIGN/
```

### Étape 3 — Premier message à envoyer à Claude

Copiez-collez exactement ce message :

```
Lis ONBOARDING.md et reprends le projet ABA.

RÈGLE ABSOLUE : le compte GitHub à utiliser est UNIQUEMENT adilboumahdi-aba.
Ne jamais utiliser abhub-prog, ikenproapp ou tout autre compte GitHub.

Tâche en cours : T[N] — [nom de la tâche]
```

✅ Claude lira le fichier et sera immédiatement opérationnel.

---

## Ce qui fonctionne automatiquement (tous les comptes)

| Élément | Automatique | Pourquoi |
|---|---|---|
| Lecture `ONBOARDING.md` | ✅ Oui | Fichier dans le dossier projet |
| `MEMOIRE-SESSION.md` toutes les 30 min | ✅ Oui | macOS LaunchAgent (niveau OS) |
| Sauvegarde à la fermeture de session | ✅ Oui | Hook Stop dans `.claude/settings.json` |
| `git push` vers `adilboumahdi-aba` | ✅ Oui | Credentials dans le keychain macOS |
| Accès aux fichiers du projet | ✅ Oui | Même dossier physique sur le Mac |

---

## ⚠️ Règle critique — GitHub

**Toujours pousser vers ce compte uniquement :**
```
adilboumahdi-aba
```

**Ne jamais utiliser :**
- `abhub-prog`
- `ikenproapp`
- Tout autre compte

---

## Fichiers clés à connaître

| Fichier | Rôle |
|---|---|
| `ONBOARDING.md` | Mémoire complète du projet — lu au démarrage |
| `MEMOIRE-SESSION-[date].md` | Snapshot horodaté créé toutes les 30 min |
| `DEMARRAGE-SESSION.md` | Ce fichier — instructions de démarrage |
| `scripts/auto-memory.py` | Script qui génère les fichiers mémoire |
| `.claude/settings.json` | Hook Stop automatique |

---

## Liste des tâches en cours (mise à jour dans ONBOARDING.md)

### 🔴 BLOC 1 — Bloquant avant lancement
- [ ] **T1** — Mentions légales + Politique de confidentialité
- [ ] **T2** — Page 404 personnalisée ABA
- [ ] **T3** — Favicon ABA
- [ ] **T4** — Google Analytics GA4 *(Adil fournit le code G-XXXXXXXXXX)*
- [ ] **T5** — Test formulaire contact *(Adil teste manuellement)*

### 🟠 BLOC 2 — Fortement recommandé
- [ ] **T6** — Vérification mobile responsive
- [ ] **T7** — Google Search Console + soumission sitemap
- [ ] **T8** — Test inscription newsletter Brevo
- [ ] **T9** — Newsletter annonce lancement Saison 2

### 🟡 BLOC 3 — Post-lancement
- [ ] **T10** — Vraies photos portfolio *(Adil fournit les photos)*
- [ ] **T11** — Social Media — annonce lancement
- [ ] **T12** — Cookie banner RGPD
- [ ] **T13** — Open Graph images par article

### 🔵 BLOC 4 — Saison 2
- [ ] **T14** — Planification articles 23-34
- [ ] **T15** — Landing pages par ville (Rabat, Casablanca, Fès, Marrakech)
- [ ] **T16** — Portfolio avec vraies photos

---

## Site live
**https://www.ab-landscapes.com**
Journal : https://www.ab-landscapes.com/blog.html

*Dernière mise à jour : 5 juin 2026*

---

## ⚠️ RÈGLE ABSOLUE — À RAPPELER À CHAQUE SESSION

**TOUT le site doit être traduit en FR / EN / ES sans exception.**

Inclut : articles, mentions légales, 404, portfolio, navigation, footer,
boutons, titres, textes futurs — toute nouvelle page ou section créée.

Méthode : `data-i18n`, `data-fr/en/es`, `data-lang-block` + sélecteur langue sur chaque page.
