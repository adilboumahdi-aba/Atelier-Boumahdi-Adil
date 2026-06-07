/* ============================================================
   ABA ADMIN — Interface d'édition du site ab-landscapes.com
   Gère : auth, GitHub API, parsing HTML i18n, éditeur, Claude
   ============================================================ */

'use strict';

const REPO = 'adilboumahdi-aba/Atelier-Boumahdi-Adil';
const GH_API = 'https://api.github.com';
const BLOG_DIR = 'blog';

/* ── Utilitaires crypto ── */
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── Utilitaires base64 ── */
function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(b64) {
  return decodeURIComponent(escape(atob(b64)));
}
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/* ── Toast ── */
function toast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, duration - 300);
  setTimeout(() => el.remove(), duration);
}

/* ── GitHub API ── */
const GH = {
  get pat() { return sessionStorage.getItem('aba-admin-pat') || ''; },

  headers() {
    return {
      'Authorization': `Bearer ${this.pat}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  },

  async get(path) {
    const res = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
    return res.json();
  },

  async put(path, content, sha, message) {
    const body = {
      message,
      content: b64encode(content),
    };
    if (sha) body.sha = sha;
    const res = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub ${res.status}`);
    }
    return res.json();
  },

  async putBinary(path, base64Content, sha, message) {
    const body = { message, content: base64Content };
    if (sha) body.sha = sha;
    const res = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub ${res.status}`);
    }
    return res.json();
  },

  async testConnection() {
    try {
      const res = await fetch(`${GH_API}/repos/${REPO}`, { headers: this.headers() });
      return res.ok;
    } catch { return false; }
  },
};

/* ── Parser d'article HTML ── */
const Parser = {
  parse(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const data = {};

    /* Métadonnées SEO */
    data.ogTitle   = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    data.ogDesc    = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    data.metaTitle = doc.querySelector('title')?.textContent?.replace(/\s*—\s*ABA.*$/, '') || '';

    /* Catégorie */
    const catEl = doc.querySelector('.a-cat');
    data.category = catEl?.textContent?.trim() || '';

    /* Titre h1 multilingue */
    const h1 = doc.querySelector('h1[data-fr], h1.a-title');
    data.titleFr = h1?.getAttribute('data-fr') || h1?.textContent?.trim() || '';
    data.titleEn = h1?.getAttribute('data-en') || '';
    data.titleEs = h1?.getAttribute('data-es') || '';

    /* Dek / sous-titre */
    const dek = doc.querySelector('[data-fr].a-dek, p.a-dek[data-fr]');
    data.dekFr = dek?.getAttribute('data-fr') || dek?.textContent?.trim() || '';
    data.dekEn = dek?.getAttribute('data-en') || '';
    data.dekEs = dek?.getAttribute('data-es') || '';

    /* Byline */
    const byline = doc.querySelector('.a-byline');
    if (byline) {
      const spans = byline.querySelectorAll('span:not(.dotsep)');
      data.author   = spans[0]?.textContent?.replace(/^Par\s+/, '').trim() || '';
      data.date     = spans[1]?.textContent?.trim() || '';
      data.readtime = spans[2]?.textContent?.replace(/\s*de lecture\s*/, '').trim() || '';
    }

    /* Contenu par langue (data-lang-block) */
    ['fr', 'en', 'es'].forEach(lang => {
      const block = doc.querySelector(`[data-lang-block="${lang}"]`);
      data[`content${lang.toUpperCase()}`] = block ? block.innerHTML.trim() : '';
    });

    /* SHA du fichier (stocké séparément lors du fetch) */
    return data;
  },

  reconstruct(originalHtml, data) {
    const doc = new DOMParser().parseFromString(originalHtml, 'text/html');

    /* OG tags */
    const setMeta = (sel, val) => {
      const el = doc.querySelector(sel);
      if (el) el.setAttribute('content', val);
    };
    setMeta('meta[property="og:title"]', data.ogTitle);
    setMeta('meta[property="og:description"]', data.ogDesc);

    /* Titre page */
    if (data.ogTitle && doc.querySelector('title')) {
      doc.querySelector('title').textContent = data.ogTitle + ' — ABA Paysage';
    }

    /* h1 */
    const h1 = doc.querySelector('h1[data-fr], h1.a-title');
    if (h1) {
      h1.setAttribute('data-fr', data.titleFr);
      h1.setAttribute('data-en', data.titleEn);
      h1.setAttribute('data-es', data.titleEs);
      h1.textContent = data.titleFr;
    }

    /* Dek */
    const dek = doc.querySelector('[data-fr].a-dek, p.a-dek[data-fr]');
    if (dek) {
      dek.setAttribute('data-fr', data.dekFr);
      dek.setAttribute('data-en', data.dekEn);
      dek.setAttribute('data-es', data.dekEs);
      dek.textContent = data.dekFr;
    }

    /* Byline */
    const byline = doc.querySelector('.a-byline');
    if (byline) {
      const spans = byline.querySelectorAll('span:not(.dotsep)');
      if (spans[0]) spans[0].innerHTML = `Par <b>${data.author}</b>`;
      if (spans[1]) spans[1].textContent = data.date;
      if (spans[2]) spans[2].textContent = `${data.readtime} de lecture`;
    }

    /* Blocs de contenu */
    ['fr', 'en', 'es'].forEach(lang => {
      const block = doc.querySelector(`[data-lang-block="${lang}"]`);
      const key = `content${lang.toUpperCase()}`;
      if (block && data[key] !== undefined) {
        block.innerHTML = data[key];
      }
    });

    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  },
};

/* ── Template nouvel article ── */
function articleTemplate(slug, titleFr, category, author, date) {
  const url = `https://www.ab-landscapes.com/blog/${slug}.html`;
  return `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <script src="/assets/cookie-consent.js"><\/script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-P2MDTEBQVF"><\/script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-P2MDTEBQVF');
  <\/script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleFr} — ABA Paysage</title>
  <meta name="description" content="" />
  <meta property="og:title" content="${titleFr} — ABA" />
  <meta property="og:description" content="" />
  <meta property="og:image" content="https://www.ab-landscapes.com/assets/og-cover.jpg" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="article" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://www.ab-landscapes.com/assets/og-cover.jpg" />
  <link rel="canonical" href="${url}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Spectral:ital,wght@0,300;0,400;1,300;1,400&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../assets/journal.css" />
  <link rel="icon" type="image/x-icon" href="../assets/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="../assets/apple-touch-icon.png" />
  <meta name="theme-color" content="#efe9dd" />
</head>
<body>

<header class="masthead">
  <div class="wrap">
    <div class="masthead__bar">
      <div class="masthead__left">
        <a href="../preview.html" class="aba-logo" aria-label="ABA — Atelier Boumahdi, retour à l'accueil">
          <img class="aba-logo__img" src="../assets/aba-logo.png" alt="ABA">
          <div class="aba-logo__txt">
            <span class="aba-logo__aba">ABA</span>
            <span class="aba-logo__wm">Atelier Boumahdi</span>
          </div>
        </a>
        <div class="masthead__rule"></div>
        <span class="eyebrow" style="white-space:nowrap;">Journal de l'Atelier</span>
      </div>
      <div class="masthead__tools">
        <div class="seg" role="group" aria-label="Langue" style="margin-right:4px">
          <button data-lang="fr" aria-pressed="true" onclick="setLang('fr')">FR</button>
          <button data-lang="en" aria-pressed="false" onclick="setLang('en')">EN</button>
          <button data-lang="es" aria-pressed="false" onclick="setLang('es')">ES</button>
        </div>
        <div class="seg" role="group" aria-label="Thème de lecture">
          <button id="btn-dark" onclick="setTheme('dark')" aria-pressed="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <button id="btn-light" onclick="setTheme('light')" aria-pressed="false">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          </button>
        </div>
        <a href="../blog.html" class="btn-ghost" style="font-size:11.5px;padding:8px 14px;" data-i18n="journalBtn">← Journal</a>
        <a href="../preview.html#contact" class="btn btn--brand" style="font-size:11px;padding:10px 20px;" data-i18n="initiateProject">Initier un projet</a>
      </div>
    </div>
  </div>
</header>

<div class="wrap">
  <div class="backbar">
    <a href="../blog.html" class="back-link">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
      Retour au Journal
    </a>
  </div>
</div>
<hr class="hr" />

<article class="article fade-up">

  <header class="wrap-narrow" style="text-align:center;padding-top:clamp(16px,3vw,36px)">
    <div style="display:flex;justify-content:center;margin-bottom:6px">
      <span class="a-cat">
        <span class="chip__dot" style="background:#a8946f"></span>
        ${category}
      </span>
    </div>
    <h1 class="a-title" style="font-size:clamp(34px,5vw,62px);margin:10px 0 18px"
        data-fr="${titleFr}" data-en="" data-es="">${titleFr}</h1>
    <p class="a-dek" style="font-size:clamp(19px,1.7vw,23px);max-width:32ch;margin:0 auto 24px"
       data-fr="" data-en="" data-es=""></p>
    <div class="a-byline" style="justify-content:center">
      <span>Par <b>${author}</b></span>
      <span class="dotsep"></span>
      <span>${date}</span>
      <span class="dotsep"></span>
      <span>8 min de lecture</span>
    </div>
  </header>

  <div data-lang-block="fr" class="wrap-narrow prose">
    <p>Contenu FR à rédiger.</p>
  </div>

  <div data-lang-block="en" class="wrap-narrow prose" hidden>
    <p>English content to be written.</p>
  </div>

  <div data-lang-block="es" class="wrap-narrow prose" hidden>
    <p>Contenido ES por redactar.</p>
  </div>

  <footer class="article-foot wrap-narrow">
    <div class="author-bio">
      <img src="../assets/adil-boumahdi-portrait.jpg" alt="${author}" class="author-bio__img" />
      <div>
        <div class="author-bio__name">${author}</div>
        <div data-lang-block="fr" class="author-bio__role">Ingénieur agronome paysagiste, fondateur de l'Atelier Boumahdi.</div>
        <div data-lang-block="en" class="author-bio__role" hidden>Landscape agronomist engineer, founder of Atelier Boumahdi.</div>
        <div data-lang-block="es" class="author-bio__role" hidden>Ingeniero agrónomo paisajista, fundador del Atelier Boumahdi.</div>
      </div>
    </div>
  </footer>

</article>

<script src="../assets/i18n.js"><\/script>
</body>
</html>`;
}

/* ══════════════════════════════════════════════
   ABA — Objet principal
══════════════════════════════════════════════ */
const ABA = {
  articles: [],
  filtered: [],
  currentArticle: null, /* { path, sha, data, originalHtml } */
  isDirty: false,
  desyncLangs: new Set(),

  /* ── Init ── */
  async init() {
    const hasHash = localStorage.getItem('aba-admin-hash');
    if (!hasHash) {
      this.showSetup();
    } else {
      /* Auth screen is default-visible */
    }
  },

  /* ── Setup (première utilisation) ── */
  showSetup() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
  },

  async setup() {
    const pwd  = document.getElementById('setup-pwd').value;
    const pwd2 = document.getElementById('setup-pwd2').value;
    const pat  = document.getElementById('setup-pat').value.trim();
    const errEl = document.getElementById('setup-error');
    const msgEl = document.getElementById('setup-error-msg');

    errEl.classList.add('hidden');

    if (pwd.length < 8) {
      msgEl.textContent = 'Le mot de passe doit faire au moins 8 caractères';
      errEl.classList.remove('hidden'); return;
    }
    if (pwd !== pwd2) {
      msgEl.textContent = 'Les mots de passe ne correspondent pas';
      errEl.classList.remove('hidden'); return;
    }
    if (!pat.startsWith('ghp_') && !pat.startsWith('github_pat_')) {
      msgEl.textContent = 'Token GitHub invalide (doit commencer par ghp_ ou github_pat_)';
      errEl.classList.remove('hidden'); return;
    }

    const hash = await sha256(pwd);
    localStorage.setItem('aba-admin-hash', hash);
    sessionStorage.setItem('aba-admin-pat', pat);

    document.getElementById('setup-screen').classList.add('hidden');
    await this.onAuthSuccess();
  },

  /* ── Login ── */
  async login() {
    const pwd = document.getElementById('auth-pwd').value;
    const pat = document.getElementById('auth-pat').value.trim();
    const errEl = document.getElementById('auth-error');
    const msgEl = document.getElementById('auth-error-msg');

    errEl.classList.add('hidden');

    if (!pwd || !pat) {
      msgEl.textContent = 'Veuillez remplir les deux champs';
      errEl.classList.remove('hidden'); return;
    }

    const hash = await sha256(pwd);
    const stored = localStorage.getItem('aba-admin-hash');

    if (hash !== stored) {
      msgEl.textContent = 'Mot de passe incorrect';
      errEl.classList.remove('hidden'); return;
    }

    sessionStorage.setItem('aba-admin-pat', pat);
    document.getElementById('auth-screen').classList.add('hidden');
    await this.onAuthSuccess();
  },

  async onAuthSuccess() {
    document.getElementById('app').classList.remove('hidden');

    /* Test connexion GitHub */
    const ok = await GH.testConnection();
    const dot = document.getElementById('github-status-dot');
    const label = document.getElementById('github-status-label');
    if (ok) {
      dot.classList.remove('offline');
      label.textContent = 'GitHub connecté';
    } else {
      dot.classList.add('offline');
      label.textContent = 'GitHub — erreur token';
      toast('Token GitHub invalide ou expiré', 'error', 6000);
    }

    await this.loadArticleList();
  },

  logout() {
    sessionStorage.removeItem('aba-admin-pat');
    location.reload();
  },

  /* ── Liste des articles ── */
  async loadArticleList() {
    const listEl = document.getElementById('article-list');
    listEl.innerHTML = '<div style="padding:20px;color:var(--text3);font-size:13px;text-align:center"><div class="spinner" style="margin:0 auto 12px"></div>Chargement…</div>';

    try {
      const files = await GH.get(BLOG_DIR);
      this.articles = files
        .filter(f => f.name.endsWith('.html'))
        .map(f => ({ name: f.name, path: f.path, sha: f.sha }));
      this.filtered = [...this.articles];
      this.renderArticleList();
    } catch (err) {
      listEl.innerHTML = `<div style="padding:20px;color:var(--red);font-size:13px">${err.message}</div>`;
    }
  },

  renderArticleList() {
    const listEl = document.getElementById('article-list');
    if (!this.filtered.length) {
      listEl.innerHTML = '<div style="padding:20px;color:var(--text3);font-size:13px;text-align:center">Aucun article trouvé</div>';
      return;
    }
    listEl.innerHTML = this.filtered.map(a => {
      const active = this.currentArticle?.path === a.path ? 'active' : '';
      const displayName = a.name.replace('.html', '').replace(/-/g, ' ');
      return `<div class="article-item ${active}" onclick="ABA.openArticle('${a.path}','${a.sha}')">
        <div class="article-item__title">${displayName}</div>
        <div class="article-item__meta">
          <span style="font-family:var(--mono)">${a.name}</span>
        </div>
      </div>`;
    }).join('');
  },

  filterArticles(q) {
    q = q.toLowerCase();
    this.filtered = q
      ? this.articles.filter(a => a.name.toLowerCase().includes(q))
      : [...this.articles];
    this.renderArticleList();
  },

  /* ── Ouvrir un article ── */
  async openArticle(path, sha) {
    if (this.isDirty) {
      if (!confirm('Modifications non sauvegardées. Continuer ?')) return;
    }

    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('new-article-panel').classList.add('hidden');
    document.getElementById('editor').classList.remove('hidden');

    document.getElementById('editor-filename').textContent = path;
    document.getElementById('editor-body').style.opacity = '0.4';

    try {
      const file = await GH.get(path);
      const html = b64decode(file.content);
      const data = Parser.parse(html);

      this.currentArticle = { path, sha: file.sha, data, originalHtml: html };
      this.isDirty = false;
      this.desyncLangs.clear();

      this.fillEditor(data);
      this.renderArticleList(); /* update active state */
      document.getElementById('btn-save').disabled = false;
      document.getElementById('btn-save-top').disabled = false;
    } catch (err) {
      toast(`Erreur de chargement : ${err.message}`, 'error');
    } finally {
      document.getElementById('editor-body').style.opacity = '1';
    }
  },

  fillEditor(data) {
    /* SEO */
    document.getElementById('f-og-title').value  = data.ogTitle  || '';
    document.getElementById('f-og-desc').value   = data.ogDesc   || '';
    document.getElementById('f-category').value  = data.category || '';

    /* Titre */
    document.getElementById('f-title-fr').value  = data.titleFr  || '';
    document.getElementById('f-title-en').value  = data.titleEn  || '';
    document.getElementById('f-title-es').value  = data.titleEs  || '';

    /* Dek */
    document.getElementById('f-dek-fr').value    = data.dekFr    || '';
    document.getElementById('f-dek-en').value    = data.dekEn    || '';
    document.getElementById('f-dek-es').value    = data.dekEs    || '';

    /* Byline */
    document.getElementById('f-author').value    = data.author   || '';
    document.getElementById('f-date').value      = data.date     || '';
    document.getElementById('f-readtime').value  = data.readtime || '';

    /* Contenu */
    document.getElementById('content-fr').value  = data.contentFR || '';
    document.getElementById('content-en').value  = data.contentEN || '';
    document.getElementById('content-es').value  = data.contentES || '';

    /* Désync */
    document.getElementById('desync-banner').classList.add('hidden');
    document.getElementById('tab-badge-en').classList.add('hidden');
    document.getElementById('tab-badge-es').classList.add('hidden');
  },

  collectEditorData() {
    return {
      ogTitle:   document.getElementById('f-og-title').value,
      ogDesc:    document.getElementById('f-og-desc').value,
      category:  document.getElementById('f-category').value,
      titleFr:   document.getElementById('f-title-fr').value,
      titleEn:   document.getElementById('f-title-en').value,
      titleEs:   document.getElementById('f-title-es').value,
      dekFr:     document.getElementById('f-dek-fr').value,
      dekEn:     document.getElementById('f-dek-en').value,
      dekEs:     document.getElementById('f-dek-es').value,
      author:    document.getElementById('f-author').value,
      date:      document.getElementById('f-date').value,
      readtime:  document.getElementById('f-readtime').value,
      contentFR: document.getElementById('content-fr').value,
      contentEN: document.getElementById('content-en').value,
      contentES: document.getElementById('content-es').value,
    };
  },

  /* ── Éditeur helpers ── */
  editor: {
    switchTab(lang) {
      document.querySelectorAll('.lang-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === lang));
      document.querySelectorAll('.lang-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${lang}`));
    },

    markDirty(lang) {
      ABA.isDirty = true;
      if (lang === 'fr') {
        /* FR modifié → marquer EN et ES comme désynchronisés */
        const enEmpty = !document.getElementById('content-en').value.trim();
        const esEmpty = !document.getElementById('content-es').value.trim();
        if (!enEmpty) {
          document.getElementById('tab-badge-en').classList.remove('hidden');
          document.getElementById('desync-banner').classList.remove('hidden');
        }
        if (!esEmpty) {
          document.getElementById('tab-badge-es').classList.remove('hidden');
          document.getElementById('desync-banner').classList.remove('hidden');
        }
      }
    },

    onContentChange(lang) {
      ABA.isDirty = true;
      if (lang === 'fr') {
        this.markDirty('fr');
      } else {
        /* EN ou ES mis à jour → retirer badge si rempli */
        const val = document.getElementById(`content-${lang}`).value.trim();
        if (val) document.getElementById(`tab-badge-${lang}`).classList.add('hidden');
        /* Vérifier si tous les badges sont cachés */
        const enBadge = document.getElementById('tab-badge-en');
        const esBadge = document.getElementById('tab-badge-es');
        if (enBadge.classList.contains('hidden') && esBadge.classList.contains('hidden')) {
          document.getElementById('desync-banner').classList.add('hidden');
        }
      }
    },

    preview() {
      if (!ABA.currentArticle) return;
      const data = ABA.collectEditorData();
      const html = Parser.reconstruct(ABA.currentArticle.originalHtml, data);
      const blob = new Blob([html], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    },

    saveAndCommit() {
      if (!ABA.currentArticle) return;
      const msg = `Admin: mise à jour ${ABA.currentArticle.path.split('/').pop().replace('.html', '')}`;
      document.getElementById('commit-message').value = msg;
      document.getElementById('commit-modal').classList.remove('hidden');
    },
  },

  /* ── Commit ── */
  closeCommitModal() {
    document.getElementById('commit-modal').classList.add('hidden');
  },

  async doCommit() {
    const message = document.getElementById('commit-message').value.trim();
    if (!message) { toast('Message de commit requis', 'warning'); return; }

    this.closeCommitModal();

    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    btn.textContent = '↑ Publication…';

    try {
      const data = this.collectEditorData();
      const html = Parser.reconstruct(this.currentArticle.originalHtml, data);
      const result = await GH.put(this.currentArticle.path, html, this.currentArticle.sha, message);

      /* Mettre à jour le SHA local */
      this.currentArticle.sha = result.content.sha;
      this.currentArticle.data = data;
      this.currentArticle.originalHtml = html;
      this.isDirty = false;

      toast(`✓ Publié — en ligne dans ~2 min`, 'success');
      btn.textContent = '↑ Publier sur GitHub';
      btn.disabled = false;

      /* Refresh liste */
      await this.loadArticleList();
    } catch (err) {
      toast(`Erreur : ${err.message}`, 'error', 8000);
      btn.textContent = '↑ Publier sur GitHub';
      btn.disabled = false;
    }
  },

  /* ── Nouvel article ── */
  newArticle() {
    if (this.isDirty && !confirm('Modifications non sauvegardées. Continuer ?')) return;
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('editor').classList.add('hidden');
    document.getElementById('new-article-panel').classList.remove('hidden');
    document.getElementById('new-slug').value = '';
    document.getElementById('new-title-fr').value = '';
    document.getElementById('slug-preview').textContent = 'blog/—.html';
  },

  cancelNewArticle() {
    document.getElementById('new-article-panel').classList.add('hidden');
    if (this.currentArticle) {
      document.getElementById('editor').classList.remove('hidden');
    } else {
      document.getElementById('empty-state').classList.remove('hidden');
    }
  },

  updateSlugPreview(val) {
    const slug = val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    document.getElementById('slug-preview').textContent = `blog/${slug || '—'}.html`;
    document.getElementById('new-slug').value = slug;
  },

  async createArticle() {
    const slug     = document.getElementById('new-slug').value.trim();
    const titleFr  = document.getElementById('new-title-fr').value.trim();
    const category = document.getElementById('new-category').value.trim();
    const author   = document.getElementById('new-author').value.trim() || 'Adil Boumahdi';
    const prompt   = document.getElementById('new-claude-prompt').value.trim();

    if (!slug || !titleFr) {
      toast('Slug et titre FR requis', 'warning'); return;
    }

    const path = `${BLOG_DIR}/${slug}.html`;
    const now  = new Date();
    const date = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    let html = articleTemplate(slug, titleFr, category, author, date);

    /* Génération Claude si prompt fourni */
    if (prompt) {
      const key = document.getElementById('claude-key').value.trim();
      if (!key) {
        toast('Clé API Anthropic requise pour la génération', 'warning'); return;
      }
      toast('Claude génère le contenu…', 'info', 15000);
      try {
        const generated = await this.claude._callClaude(key,
          `Tu es rédacteur pour ABA Paysage, cabinet marocain de paysagisme haut de gamme fondé par Adil Boumahdi (ingénieur agronome, IAV Hassan II + CIHEAM Montpellier). Ton ton est expert, sobre, élégant.

Crée un article complet avec ce titre : "${titleFr}"
Catégorie : ${category || 'Paysagisme'}
${prompt}

Réponds UNIQUEMENT avec un JSON valide :
{
  "titleFr": "...",
  "titleEn": "...",
  "titleEs": "...",
  "dekFr": "...",
  "dekEn": "...",
  "dekEs": "...",
  "contentFR": "<p>...</p><p>...</p>",
  "contentEN": "<p>...</p>",
  "contentES": "<p>...</p>"
}

Les champs content* doivent contenir du HTML valide avec balises <p>, <h2>, <h3>, <em>, <strong>.`);

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const h1 = doc.querySelector('h1');
        if (h1) { h1.setAttribute('data-fr', generated.titleFr || titleFr); h1.setAttribute('data-en', generated.titleEn || ''); h1.setAttribute('data-es', generated.titleEs || ''); h1.textContent = generated.titleFr || titleFr; }
        const dek = doc.querySelector('p.a-dek');
        if (dek) { dek.setAttribute('data-fr', generated.dekFr || ''); dek.setAttribute('data-en', generated.dekEn || ''); dek.setAttribute('data-es', generated.dekEs || ''); dek.textContent = generated.dekFr || ''; }
        ['fr', 'en', 'es'].forEach(lang => {
          const block = doc.querySelector(`[data-lang-block="${lang}"]`);
          const key2 = `content${lang.toUpperCase()}`;
          if (block && generated[key2]) block.innerHTML = generated[key2];
        });
        html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        toast('Contenu généré !', 'success');
      } catch (err) {
        toast(`Claude : ${err.message}`, 'error');
        return;
      }
    }

    try {
      await GH.put(path, html, null, `Admin: nouvel article "${titleFr}"`);
      toast(`✓ Article créé : ${path}`, 'success');
      await this.loadArticleList();
      await this.openArticle(path, null);
    } catch (err) {
      toast(`Erreur création : ${err.message}`, 'error', 8000);
    }
  },

  /* ── Images ── */
  images: {
    async handleUpload(files) {
      if (!files.length) return;
      const progress = document.getElementById('upload-progress');
      progress.classList.remove('hidden');

      for (const file of files) {
        if (file.size > 4 * 1024 * 1024) {
          toast(`${file.name} : trop lourd (max 4 Mo)`, 'warning'); continue;
        }
        try {
          const buf    = await file.arrayBuffer();
          const b64    = arrayBufferToBase64(buf);
          const ext    = file.name.split('.').pop().toLowerCase();
          const safe   = file.name.replace(/[^a-z0-9._-]/gi, '-').toLowerCase();
          const path   = `assets/blog/${safe}`;
          await GH.putBinary(path, b64, null, `Admin: upload image ${safe}`);
          toast(`✓ ${safe} uploadé`, 'success');
          ABA.images.addToGrid(path, safe);
        } catch (err) {
          toast(`${file.name} : ${err.message}`, 'error');
        }
      }
      progress.classList.add('hidden');
    },

    addToGrid(path, name) {
      const grid = document.getElementById('image-grid');
      const card = document.createElement('div');
      card.className = 'image-card';
      card.innerHTML = `
        <div class="image-card__thumb">
          <img src="https://www.ab-landscapes.com/${path}" alt="${name}" loading="lazy" />
        </div>
        <div class="image-card__info">
          <div class="image-card__name">${name}</div>
          <select class="treatment-select" title="Traitement visuel">
            <option value="">— Traitement image —</option>
            <option value="span-full">Plein cadre (bord à bord)</option>
            <option value="span-feat">Débordement de marge</option>
            <option value="span-wide">Légèrement élargie</option>
            <option value="fig-float">Flottante (texte enveloppant)</option>
            <option value="duo">Diptyque (2 images côte à côte)</option>
            <option value="duet">Duo à défilement (image collante)</option>
            <option value="plan">Plan annoté avec repères</option>
          </select>
          <button onclick="ABA.images.copySnippet('${path}', this)" style="margin-top:6px;font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0">
            📋 Copier le code HTML
          </button>
        </div>`;
      grid.insertBefore(card, grid.firstChild);
    },

    copySnippet(path, btn) {
      const select = btn.parentElement.querySelector('select');
      const treatment = select.value;
      let code = '';
      const url = `https://www.ab-landscapes.com/${path}`;
      const name = path.split('/').pop();

      if (treatment === 'fig-float') {
        code = `<figure class="fig-float">\n  <div class="plate__frame" style="aspect-ratio:4/3"><img src="${url}" alt="${name}" /></div>\n  <figcaption>Légende…</figcaption>\n</figure>`;
      } else if (treatment === 'duo') {
        code = `<div class="duo span-wide">\n  <figure class="plate"><div class="plate__frame" style="aspect-ratio:4/3"><img src="${url}" alt="${name}" /></div></figure>\n  <figure class="plate"><div class="plate__frame" style="aspect-ratio:4/3"><img src="" alt="" /></div></figure>\n</div>`;
      } else if (treatment === 'duet') {
        code = `<section class="duet">\n  <div class="duet__in">\n    <div class="duet__media">\n      <figure class="plate"><div class="plate__frame" style="aspect-ratio:3/4"><img src="${url}" alt="${name}" /></div></figure>\n    </div>\n    <div class="duet__text">\n      <h2>Titre section</h2>\n      <p>Texte qui défile pendant que l'image reste collée…</p>\n    </div>\n  </div>\n</section>`;
      } else if (treatment === 'plan') {
        code = `<section class="plan">\n  <div class="plan__in">\n    <div class="plan__head"><p class="plan__kicker">Plan</p><h2 class="plan__title">Titre du plan</h2></div>\n    <div class="plan__stage">\n      <img src="${url}" alt="${name}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />\n      <div class="plan__grid"></div>\n      <div class="pin" style="left:30%;top:40%">1</div>\n    </div>\n    <div class="plan__legend">\n      <div class="plan__item"><div class="plan__num">1</div><div><div class="plan__k">Élément</div><div class="plan__v">Description</div></div></div>\n    </div>\n  </div>\n</section>`;
      } else {
        const cls = treatment ? ` ${treatment}` : '';
        code = `<figure class="plate${cls}">\n  <div class="plate__frame" style="aspect-ratio:16/9"><img src="${url}" alt="${name}" /></div>\n  <figcaption>Légende de l'image.</figcaption>\n</figure>`;
      }

      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = '✓ Copié !';
        setTimeout(() => { btn.textContent = '📋 Copier le code HTML'; }, 2000);
      });
    },
  },

  /* ── Renvois .xref ── */
  xref: {
    add() {
      const list = document.getElementById('xref-list');
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center';
      row.innerHTML = `
        <input type="text" placeholder="Mot-clé dans le texte" style="padding:7px 10px" />
        <input type="text" placeholder="Slug article cible" style="padding:7px 10px;font-family:var(--mono);font-size:12px" />
        <button onclick="this.parentElement.remove()" style="color:var(--red);font-size:18px;line-height:1;padding:4px 8px">×</button>`;
      list.appendChild(row);
    },
  },

  /* ── Claude AI ── */
  claude: {
    async _callClaude(key, prompt) {
      const status = document.getElementById('claude-status');
      const msg = document.getElementById('claude-status-msg');
      status.classList.remove('hidden');
      msg.textContent = 'Claude travaille…';

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-calls': 'true',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `API ${res.status}`);
        }

        const data = await res.json();
        const text = data.content[0].text.trim();

        /* Extraire le JSON de la réponse */
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Réponse Claude non-JSON');
        return JSON.parse(jsonMatch[0]);
      } finally {
        status.classList.add('hidden');
      }
    },

    async translateEN() {
      const key = document.getElementById('claude-key').value.trim();
      if (!key) { toast('Clé API Anthropic requise', 'warning'); return; }
      const frContent = document.getElementById('content-fr').value;
      const titleFr   = document.getElementById('f-title-fr').value;
      const dekFr     = document.getElementById('f-dek-fr').value;
      if (!frContent) { toast('Contenu FR vide', 'warning'); return; }

      try {
        const result = await this._callClaude(key,
          `Traduis en anglais de haute qualité (niveau magazine international) ce contenu d'article de paysagisme. Garde la structure HTML exacte (balises <p>, <h2>, <h3>, <em>, <strong>).

Titre FR : ${titleFr}
Dek FR : ${dekFr}
Contenu FR :
${frContent}

Réponds UNIQUEMENT avec un JSON :
{
  "titleEn": "...",
  "dekEn": "...",
  "contentEN": "<p>...</p>..."
}`);

        if (result.titleEn) document.getElementById('f-title-en').value = result.titleEn;
        if (result.dekEn)   document.getElementById('f-dek-en').value   = result.dekEn;
        if (result.contentEN) document.getElementById('content-en').value = result.contentEN;

        document.getElementById('tab-badge-en').classList.add('hidden');
        toast('✓ Traduction EN générée', 'success');
      } catch (err) {
        toast(`Claude EN : ${err.message}`, 'error', 8000);
      }
    },

    async translateES() {
      const key = document.getElementById('claude-key').value.trim();
      if (!key) { toast('Clé API Anthropic requise', 'warning'); return; }
      const frContent = document.getElementById('content-fr').value;
      const titleFr   = document.getElementById('f-title-fr').value;
      const dekFr     = document.getElementById('f-dek-fr').value;
      if (!frContent) { toast('Contenu FR vide', 'warning'); return; }

      try {
        const result = await this._callClaude(key,
          `Traduis en espagnol de haute qualité (niveau magazine) ce contenu d'article de paysagisme. Garde la structure HTML exacte.

Titre FR : ${titleFr}
Dek FR : ${dekFr}
Contenu FR :
${frContent}

Réponds UNIQUEMENT avec un JSON :
{
  "titleEs": "...",
  "dekEs": "...",
  "contentES": "<p>...</p>..."
}`);

        if (result.titleEs) document.getElementById('f-title-es').value = result.titleEs;
        if (result.dekEs)   document.getElementById('f-dek-es').value   = result.dekEs;
        if (result.contentES) document.getElementById('content-es').value = result.contentES;

        document.getElementById('tab-badge-es').classList.add('hidden');
        toast('✓ Traduction ES générée', 'success');
      } catch (err) {
        toast(`Claude ES : ${err.message}`, 'error', 8000);
      }
    },

    async generate() {
      const key    = document.getElementById('claude-key').value.trim();
      const prompt = document.getElementById('claude-prompt').value.trim();
      if (!key)    { toast('Clé API Anthropic requise', 'warning'); return; }
      if (!prompt) { toast('Prompt requis', 'warning'); return; }
      if (!ABA.currentArticle) { toast('Ouvrez d\'abord un article', 'warning'); return; }

      try {
        const titleFr = document.getElementById('f-title-fr').value;
        const result  = await this._callClaude(key,
          `Tu es rédacteur pour ABA Paysage (cabinet marocain de paysagisme haut de gamme, fondateur Adil Boumahdi). Ton ton : expert, sobre, élégant, voix éditoriale française.

Article : "${titleFr}"
Demande : ${prompt}

Réponds UNIQUEMENT avec un JSON :
{
  "titleFr": "...", "titleEn": "...", "titleEs": "...",
  "dekFr": "...", "dekEn": "...", "dekEs": "...",
  "contentFR": "<p>...</p>",
  "contentEN": "<p>...</p>",
  "contentES": "<p>...</p>"
}`);

        /* Remplir tous les champs */
        if (result.titleFr) document.getElementById('f-title-fr').value  = result.titleFr;
        if (result.titleEn) document.getElementById('f-title-en').value  = result.titleEn;
        if (result.titleEs) document.getElementById('f-title-es').value  = result.titleEs;
        if (result.dekFr)   document.getElementById('f-dek-fr').value    = result.dekFr;
        if (result.dekEn)   document.getElementById('f-dek-en').value    = result.dekEn;
        if (result.dekEs)   document.getElementById('f-dek-es').value    = result.dekEs;
        if (result.contentFR) document.getElementById('content-fr').value = result.contentFR;
        if (result.contentEN) document.getElementById('content-en').value = result.contentEN;
        if (result.contentES) document.getElementById('content-es').value = result.contentES;

        ABA.isDirty = true;
        toast('✓ Article généré dans les 3 langues', 'success');
      } catch (err) {
        toast(`Claude : ${err.message}`, 'error', 8000);
      }
    },
  },
};

/* ── Démarrage ── */
document.addEventListener('DOMContentLoaded', () => ABA.init());
