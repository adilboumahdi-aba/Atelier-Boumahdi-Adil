/* ============================================================
   ABA ADMIN v2 — Éditeur visuel avec preview iframe
   Layout 3 colonnes : sidebar | iframe preview | edit panel
   ============================================================ */
'use strict';

const REPO    = 'adilboumahdi-aba/Atelier-Boumahdi-Adil';
const GH_API  = 'https://api.github.com';
const SITE    = 'https://www.ab-landscapes.com';
const BLOG    = 'blog';

/* ── Crypto ── */
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ── Base64 ── */
function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64dec(b64) { return decodeURIComponent(escape(atob(b64))); }
function buf2b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/* ── Toasts ── */
function toast(msg, type = 'info', ms = 4000) {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, ms - 300);
  setTimeout(() => el.remove(), ms);
}

/* ── GitHub API ── */
const GH = {
  get pat() { return sessionStorage.getItem('aba-pat') || ''; },
  hdrs() {
    return {
      'Authorization': `Bearer ${this.pat}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  },
  async get(path) {
    const r = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, { headers: this.hdrs() });
    if (!r.ok) throw new Error(`GitHub ${r.status} — ${path}`);
    return r.json();
  },
  async put(path, content, sha, message) {
    const body = { message, content: b64enc(content) };
    if (sha) body.sha = sha;
    const r = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
      method: 'PUT', headers: this.hdrs(), body: JSON.stringify(body),
    });
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.message || `GitHub ${r.status}`); }
    return r.json();
  },
  async putBin(path, b64, sha, message) {
    const body = { message, content: b64 };
    if (sha) body.sha = sha;
    const r = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
      method: 'PUT', headers: this.hdrs(), body: JSON.stringify(body),
    });
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.message || `GitHub ${r.status}`); }
    return r.json();
  },
  async ping() {
    try {
      const r = await fetch(`${GH_API}/repos/${REPO}`, { headers: this.hdrs() });
      return r.ok;
    } catch { return false; }
  },
};

/* ── Parser HTML ── */
const Parser = {
  parse(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const g = (sel, attr) => doc.querySelector(sel)?.[attr] || '';
    const ga = (sel, at) => doc.querySelector(sel)?.getAttribute(at) || '';

    const h1  = doc.querySelector('h1[data-fr], h1.a-title');
    const dek = doc.querySelector('p.a-dek[data-fr], [data-fr].a-dek');
    const byline = doc.querySelector('.a-byline');
    const spans  = byline ? [...byline.querySelectorAll('span:not(.dotsep)')] : [];

    const block = (lang) => doc.querySelector(`[data-lang-block="${lang}"]`)?.innerHTML?.trim() || '';

    return {
      ogTitle:   ga('meta[property="og:title"]', 'content'),
      ogDesc:    ga('meta[property="og:description"]', 'content'),
      category:  doc.querySelector('.a-cat')?.textContent?.trim() || '',
      titleFr:   h1?.getAttribute('data-fr') || h1?.textContent?.trim() || '',
      titleEn:   h1?.getAttribute('data-en') || '',
      titleEs:   h1?.getAttribute('data-es') || '',
      dekFr:     dek?.getAttribute('data-fr') || dek?.textContent?.trim() || '',
      dekEn:     dek?.getAttribute('data-en') || '',
      dekEs:     dek?.getAttribute('data-es') || '',
      author:    spans[0]?.textContent?.replace(/^Par\s+/,'').trim() || '',
      date:      spans[1]?.textContent?.trim() || '',
      readtime:  spans[2]?.textContent?.replace(/\s*de lecture\s*/,'').trim() || '',
      contentFr: block('fr'),
      contentEn: block('en'),
      contentEs: block('es'),
    };
  },

  reconstruct(html, d) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const setMeta = (sel, val) => { const el = doc.querySelector(sel); if (el) el.setAttribute('content', val); };
    setMeta('meta[property="og:title"]',       d.ogTitle);
    setMeta('meta[property="og:description"]', d.ogDesc);

    const titleEl = doc.querySelector('title');
    if (titleEl && d.ogTitle) titleEl.textContent = d.ogTitle + ' — ABA Paysage';

    const h1 = doc.querySelector('h1[data-fr], h1.a-title');
    if (h1) {
      h1.setAttribute('data-fr', d.titleFr);
      h1.setAttribute('data-en', d.titleEn);
      h1.setAttribute('data-es', d.titleEs);
      h1.textContent = d.titleFr;
    }

    const dek = doc.querySelector('p.a-dek[data-fr], [data-fr].a-dek');
    if (dek) {
      dek.setAttribute('data-fr', d.dekFr);
      dek.setAttribute('data-en', d.dekEn);
      dek.setAttribute('data-es', d.dekEs);
      dek.textContent = d.dekFr;
    }

    const cat = doc.querySelector('.a-cat');
    if (cat) {
      const dot = cat.querySelector('.chip__dot');
      cat.textContent = d.category;
      if (dot) cat.insertBefore(dot, cat.firstChild);
    }

    const byline = doc.querySelector('.a-byline');
    if (byline) {
      const spans = [...byline.querySelectorAll('span:not(.dotsep)')];
      if (spans[0]) spans[0].innerHTML = `Par <b>${d.author}</b>`;
      if (spans[1]) spans[1].textContent = d.date;
      if (spans[2]) spans[2].textContent = `${d.readtime} de lecture`;
    }

    ['fr','en','es'].forEach(lang => {
      const block = doc.querySelector(`[data-lang-block="${lang}"]`);
      const key = `content${lang.charAt(0).toUpperCase() + lang.slice(1)}`;
      if (block && d[key] !== undefined) block.innerHTML = d[key];
    });

    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  },
};

/* ── Template nouvel article ── */
function newArticleTemplate(slug, titleFr, category, author, date) {
  const url = `${SITE}/${BLOG}/${slug}.html`;
  return `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <script src="/assets/cookie-consent.js"><\/script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-P2MDTEBQVF"><\/script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-P2MDTEBQVF');<\/script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleFr} — ABA Paysage</title>
  <meta name="description" content="" />
  <meta property="og:title" content="${titleFr} — ABA" />
  <meta property="og:description" content="" />
  <meta property="og:image" content="${SITE}/assets/og-cover.jpg" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="article" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${SITE}/assets/og-cover.jpg" />
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
  <div class="wrap"><div class="masthead__bar">
    <div class="masthead__left">
      <a href="../preview.html" class="aba-logo" aria-label="ABA — retour accueil">
        <img class="aba-logo__img" src="../assets/aba-logo.png" alt="ABA">
        <div class="aba-logo__txt"><span class="aba-logo__aba">ABA</span><span class="aba-logo__wm">Atelier Boumahdi</span></div>
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
      <div class="seg" role="group" aria-label="Thème">
        <button id="btn-dark" onclick="setTheme('dark')" aria-pressed="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>
        <button id="btn-light" onclick="setTheme('light')" aria-pressed="false"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg></button>
      </div>
      <a href="../blog.html" class="btn-ghost" style="font-size:11.5px;padding:8px 14px;" data-i18n="journalBtn">← Journal</a>
      <a href="../preview.html#contact" class="btn btn--brand" style="font-size:11px;padding:10px 20px;" data-i18n="initiateProject">Initier un projet</a>
    </div>
  </div></div>
</header>
<div class="wrap"><div class="backbar">
  <a href="../blog.html" class="back-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg> Retour au Journal</a>
</div></div>
<hr class="hr" />
<article class="article fade-up">
  <header class="wrap-narrow" style="text-align:center;padding-top:clamp(16px,3vw,36px)">
    <div style="display:flex;justify-content:center;margin-bottom:6px">
      <span class="a-cat"><span class="chip__dot" style="background:#a8946f"></span>${category || 'Paysagisme'}</span>
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
    <p>Contenu à rédiger.</p>
  </div>
  <div data-lang-block="en" class="wrap-narrow prose" hidden>
    <p>Content to be written.</p>
  </div>
  <div data-lang-block="es" class="wrap-narrow prose" hidden>
    <p>Contenido por redactar.</p>
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

  /* État */
  articles: [],
  filtered: [],
  current: null,    /* { path, sha, data, html } */
  lang: 'fr',       /* langue active dans l'éditeur */
  dirty: false,
  desync: new Set(),
  debounceTimer: null,

  /* ── Init ── */
  async init() {
    if (!localStorage.getItem('aba-hash')) {
      this.showSetup();
    }
    /* auth-screen visible par défaut */
  },

  /* ── Écrans auth ── */
  showSetup() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
  },
  showAuth() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
  },

  async setup() {
    const pwd  = document.getElementById('setup-pwd').value;
    const pwd2 = document.getElementById('setup-pwd2').value;
    const pat  = document.getElementById('setup-pat').value.trim();
    const err  = (msg) => {
      document.getElementById('setup-error-msg').textContent = msg;
      document.getElementById('setup-error').classList.remove('hidden');
    };
    document.getElementById('setup-error').classList.add('hidden');
    if (pwd.length < 8) return err('Minimum 8 caractères requis');
    if (pwd !== pwd2)  return err('Les mots de passe ne correspondent pas');
    if (!pat.startsWith('ghp_') && !pat.startsWith('github_pat_'))
      return err('Token GitHub invalide (doit commencer par ghp_)');
    localStorage.setItem('aba-hash', await sha256(pwd));
    sessionStorage.setItem('aba-pat', pat);
    document.getElementById('setup-screen').classList.add('hidden');
    await this.launch();
  },

  async login() {
    const pwd = document.getElementById('auth-pwd').value;
    const pat = document.getElementById('auth-pat').value.trim();
    const err = (msg) => {
      document.getElementById('auth-error-msg').textContent = msg;
      document.getElementById('auth-error').classList.remove('hidden');
    };
    document.getElementById('auth-error').classList.add('hidden');
    if (!pwd || !pat) return err('Remplissez les deux champs');
    if (await sha256(pwd) !== localStorage.getItem('aba-hash')) return err('Mot de passe incorrect');
    sessionStorage.setItem('aba-pat', pat);
    document.getElementById('auth-screen').classList.add('hidden');
    await this.launch();
  },

  logout() {
    sessionStorage.removeItem('aba-pat');
    location.reload();
  },

  /* ── Lancement ── */
  async launch() {
    document.getElementById('app').classList.remove('hidden');
    const ok = await GH.ping();
    const dot = document.getElementById('gh-dot');
    const lbl = document.getElementById('gh-label');
    dot.classList.toggle('offline', !ok);
    lbl.textContent = ok ? 'GitHub connecté' : 'Token invalide';
    if (!ok) toast('Token GitHub invalide ou expiré', 'error', 7000);
    await this.loadList();
  },

  /* ── Liste des articles ── */
  async loadList() {
    const listEl = document.getElementById('article-list');
    listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3)"><div class="spinner" style="margin:0 auto 12px"></div>Chargement…</div>';
    try {
      const files = await GH.get(BLOG);
      this.articles = files
        .filter(f => f.name.endsWith('.html'))
        .sort((a,b) => a.name.localeCompare(b.name))
        .map(f => ({ name: f.name, path: f.path, sha: f.sha }));
      this.filtered = [...this.articles];
      document.getElementById('article-count').textContent = this.articles.length;
      this.renderList();
    } catch(e) {
      listEl.innerHTML = `<div style="padding:20px;color:var(--red);font-size:13px">${e.message}</div>`;
    }
  },

  renderList() {
    const el = document.getElementById('article-list');
    if (!this.filtered.length) {
      el.innerHTML = '<div style="padding:20px;color:var(--text3);font-size:13px;text-align:center">Aucun article</div>';
      return;
    }
    el.innerHTML = this.filtered.map(a => {
      const active = this.current?.path === a.path ? 'active' : '';
      const title = a.name.replace('.html','').replace(/-/g,' ');
      return `<div class="article-item ${active}" onclick="ABA.open('${a.path}','${a.sha}')">
        <div class="article-item__title">${title}</div>
        <div class="article-item__file">${a.name}</div>
      </div>`;
    }).join('');
  },

  filter(q) {
    q = q.toLowerCase();
    this.filtered = q ? this.articles.filter(a => a.name.toLowerCase().includes(q)) : [...this.articles];
    this.renderList();
  },

  /* ── Ouvrir un article ── */
  async open(path, sha) {
    if (this.dirty && !confirm('Modifications non sauvegardées. Continuer ?')) return;

    /* Activer dans la sidebar */
    this.current = null;
    this.renderList();

    try {
      const file = await GH.get(path);
      const html = b64dec(file.content);
      const data = Parser.parse(html);

      this.current = { path, sha: file.sha, data, html };
      this.dirty = false;
      this.desync.clear();
      this.lang = 'fr';

      /* UI */
      document.getElementById('panel-filename').textContent = path;
      document.getElementById('preview-url').textContent = `${SITE}/${path}`;
      document.getElementById('panel-empty').classList.add('hidden');
      document.getElementById('panel-content').classList.remove('hidden');
      document.getElementById('preview-empty').classList.add('hidden');
      document.getElementById('preview-frame').classList.remove('hidden');
      document.getElementById('btn-save').disabled = false;
      document.getElementById('btn-publish').disabled = false;

      this.fillFields();
      this.renderList();
      this.updatePreviewNow();

    } catch(e) {
      toast(`Erreur : ${e.message}`, 'error');
    }
  },

  /* ── Remplir les champs depuis data ── */
  fillFields() {
    const d = this.current.data;
    const lang = this.lang;
    const cap = l => l.charAt(0).toUpperCase() + l.slice(1);

    /* Labels de langue */
    document.getElementById('title-lang-label').textContent   = `(${lang.toUpperCase()})`;
    document.getElementById('dek-lang-label').textContent     = `(${lang.toUpperCase()})`;
    document.getElementById('content-lang-label').textContent = `Prose ${lang.toUpperCase()}`;

    /* Champs dépendants de la langue */
    document.getElementById('f-title').value   = d[`title${cap(lang)}`]   || '';
    document.getElementById('f-dek').value     = d[`dek${cap(lang)}`]     || '';
    document.getElementById('f-content').value = d[`content${cap(lang)}`] || '';

    /* Champs communs */
    document.getElementById('f-author').value   = d.author   || '';
    document.getElementById('f-date').value     = d.date     || '';
    document.getElementById('f-readtime').value = d.readtime || '';
    document.getElementById('f-category').value = d.category || '';
    document.getElementById('f-og-title').value = d.ogTitle  || '';
    document.getElementById('f-og-desc').value  = d.ogDesc   || '';

    /* Onglets de langue */
    document.querySelectorAll('.lang-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === lang));

    /* Désync */
    this.updateDesyncUI();
  },

  /* ── Changer de langue d'édition ── */
  switchLang(lang) {
    /* Sauvegarder la valeur actuelle */
    this.saveCurrentLangFields();
    this.lang = lang;
    this.fillFields();
  },

  saveCurrentLangFields() {
    if (!this.current) return;
    const d = this.current.data;
    const lang = this.lang;
    const cap = l => l.charAt(0).toUpperCase() + l.slice(1);
    d[`title${cap(lang)}`]   = document.getElementById('f-title').value;
    d[`dek${cap(lang)}`]     = document.getElementById('f-dek').value;
    d[`content${cap(lang)}`] = document.getElementById('f-content').value;
    d.author   = document.getElementById('f-author').value;
    d.date     = document.getElementById('f-date').value;
    d.readtime = document.getElementById('f-readtime').value;
    d.category = document.getElementById('f-category').value;
    d.ogTitle  = document.getElementById('f-og-title').value;
    d.ogDesc   = document.getElementById('f-og-desc').value;
  },

  /* ── Modification d'un champ ── */
  onEdit() {
    this.dirty = true;
    /* Si on modifie FR → marquer EN/ES désynchronisés */
    if (this.lang === 'fr') {
      if (this.current?.data.contentEn) this.desync.add('en');
      if (this.current?.data.contentEs) this.desync.add('es');
    } else {
      this.desync.delete(this.lang);
    }
    this.updateDesyncUI();
    this.schedulePreviewUpdate();
  },

  updateDesyncUI() {
    const hasDesync = this.desync.size > 0;
    document.getElementById('desync-banner').classList.toggle('hidden', !hasDesync);
    document.getElementById('desync-en').classList.toggle('hidden', !this.desync.has('en'));
    document.getElementById('desync-es').classList.toggle('hidden', !this.desync.has('es'));
  },

  /* ── Preview iframe ── */
  schedulePreviewUpdate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.updatePreviewNow(), 600);
  },

  updatePreviewNow() {
    if (!this.current) return;
    this.saveCurrentLangFields();
    const html = Parser.reconstruct(this.current.html, this.current.data);

    /* Injecter base href pour charger les assets depuis le site live */
    const previewHtml = html
      .replace('<head>', `<head>\n  <base href="${SITE}/">`)
      /* Supprimer cookie consent pour l'aperçu */
      .replace(/<script[^>]*cookie-consent[^>]*><\/script>/gi, '');

    const frame = document.getElementById('preview-frame');
    frame.srcdoc = previewHtml;
  },

  refreshPreview() {
    this.updatePreviewNow();
  },

  /* ── Langue de la preview ── */
  previewLang(lang) {
    document.querySelectorAll('.preview-bar__lang button').forEach(b => {
      b.classList.toggle('active', b.textContent.toLowerCase() === lang);
    });
    const frame = document.getElementById('preview-frame');
    if (frame.contentWindow) {
      try { frame.contentWindow.setLang && frame.contentWindow.setLang(lang); } catch(e) {}
    }
  },

  /* ── Sections toggle ── */
  toggleSection(btn) {
    const body = btn.nextElementSibling;
    const open = btn.classList.toggle('open');
    body.classList.toggle('collapsed', !open);
  },

  /* ── Commit ── */
  openCommitModal() {
    if (!this.current) return;
    const name = this.current.path.split('/').pop().replace('.html','');
    document.getElementById('commit-msg').value = `Admin: mise à jour "${name}"`;
    document.getElementById('commit-modal').classList.remove('hidden');
  },

  closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  },

  async doCommit() {
    const msg = document.getElementById('commit-msg').value.trim();
    if (!msg) { toast('Message requis', 'warning'); return; }
    this.closeModal('commit-modal');

    const btn = document.getElementById('btn-save');
    const btnTop = document.getElementById('btn-publish');
    btn.disabled = btnTop.disabled = true;
    btn.textContent = '↑ Publication…';

    try {
      this.saveCurrentLangFields();
      const html = Parser.reconstruct(this.current.html, this.current.data);
      const result = await GH.put(this.current.path, html, this.current.sha, msg);
      this.current.sha  = result.content.sha;
      this.current.html = html;
      this.dirty = false;
      toast('✓ Publié — en ligne dans ~2 min', 'success');
      btn.textContent = '↑ Publier';
      btn.disabled = btnTop.disabled = false;
      await this.loadList();
    } catch(e) {
      toast(`Erreur : ${e.message}`, 'error', 8000);
      btn.textContent = '↑ Publier';
      btn.disabled = btnTop.disabled = false;
    }
  },

  /* ── Nouvel article ── */
  newArticleModal() {
    document.getElementById('new-title').value  = '';
    document.getElementById('new-slug').value   = '';
    document.getElementById('new-category').value = '';
    document.getElementById('new-author').value = 'Adil Boumahdi';
    document.getElementById('new-prompt').value = '';
    document.getElementById('slug-preview').textContent = '—';
    document.getElementById('new-modal').classList.remove('hidden');
  },

  autoSlug(title) {
    const slug = title.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9\s-]/g,'')
      .trim().replace(/\s+/g,'-').replace(/-+/g,'-')
      .slice(0, 60);
    document.getElementById('new-slug').value = slug;
    document.getElementById('slug-preview').textContent = slug || '—';
  },

  updateSlugPreview(val) {
    const slug = val.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').slice(0,60);
    document.getElementById('new-slug').value = slug;
    document.getElementById('slug-preview').textContent = slug || '—';
  },

  async createArticle() {
    const title    = document.getElementById('new-title').value.trim();
    const slug     = document.getElementById('new-slug').value.trim();
    const category = document.getElementById('new-category').value.trim();
    const author   = document.getElementById('new-author').value.trim() || 'Adil Boumahdi';
    const prompt   = document.getElementById('new-prompt').value.trim();
    const claudeKey= document.getElementById('new-claude-key').value.trim();

    if (!title || !slug) { toast('Titre et slug requis', 'warning'); return; }

    const path = `${BLOG}/${slug}.html`;
    const now  = new Date();
    const date = now.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
    let html = newArticleTemplate(slug, title, category, author, date);

    if (prompt && claudeKey) {
      document.getElementById('new-loading').classList.remove('hidden');
      try {
        const gen = await this.claude._call(claudeKey,
          `Tu es rédacteur senior pour ABA Paysage, cabinet marocain de paysagisme haut de gamme (fondateur Adil Boumahdi, ingénieur agronome IAV Hassan II + CIHEAM Montpellier). Ton ton est expert, sobre, élégant.

Article : "${title}" — Catégorie : ${category || 'Paysagisme'}

${prompt}

Réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{"titleFr":"...","titleEn":"...","titleEs":"...","dekFr":"...","dekEn":"...","dekEs":"...","contentFr":"<p>...</p>","contentEn":"<p>...</p>","contentEs":"<p>...</p>"}`);

        /* Injecter le contenu généré dans le template */
        const doc2 = new DOMParser().parseFromString(html, 'text/html');
        const h1 = doc2.querySelector('h1');
        if (h1) { h1.setAttribute('data-fr', gen.titleFr||title); h1.setAttribute('data-en', gen.titleEn||''); h1.setAttribute('data-es', gen.titleEs||''); h1.textContent = gen.titleFr||title; }
        const dek = doc2.querySelector('p.a-dek');
        if (dek) { dek.setAttribute('data-fr', gen.dekFr||''); dek.setAttribute('data-en', gen.dekEn||''); dek.setAttribute('data-es', gen.dekEs||''); dek.textContent = gen.dekFr||''; }
        ['fr','en','es'].forEach(l => {
          const b = doc2.querySelector(`[data-lang-block="${l}"]`);
          const k = `content${l.charAt(0).toUpperCase()+l.slice(1)}`;
          if (b && gen[k]) b.innerHTML = gen[k];
        });
        html = '<!DOCTYPE html>\n' + doc2.documentElement.outerHTML;
        toast('Contenu généré par Claude ✓', 'success');
      } catch(e) {
        toast(`Claude : ${e.message}`, 'error');
        document.getElementById('new-loading').classList.add('hidden');
        return;
      }
      document.getElementById('new-loading').classList.add('hidden');
    }

    try {
      await GH.put(path, html, null, `Admin: nouvel article "${title}"`);
      toast(`✓ Article créé : ${path}`, 'success');
      this.closeModal('new-modal');
      await this.loadList();
      /* Chercher le sha du nouveau fichier */
      const file = await GH.get(path);
      await this.open(path, file.sha);
    } catch(e) {
      toast(`Erreur création : ${e.message}`, 'error', 8000);
    }
  },

  /* ── Upload images ── */
  async uploadImages(files) {
    if (!files.length) return;
    for (const file of files) {
      if (file.size > 4*1024*1024) { toast(`${file.name} : trop lourd (max 4 Mo)`, 'warning'); continue; }
      try {
        const b64  = buf2b64(await file.arrayBuffer());
        const safe = file.name.replace(/[^a-z0-9._-]/gi,'-').toLowerCase();
        const path = `assets/blog/${safe}`;
        await GH.putBin(path, b64, null, `Admin: image ${safe}`);
        toast(`✓ ${safe} uploadé`, 'success');
        this.addImageCard(path, safe);
      } catch(e) {
        toast(`${file.name} : ${e.message}`, 'error');
      }
    }
  },

  addImageCard(path, name) {
    const grid = document.getElementById('img-grid');
    const card = document.createElement('div');
    card.className = 'img-card';
    const url = `${SITE}/${path}`;
    card.innerHTML = `
      <div class="img-card__thumb"><img src="${url}" alt="${name}" loading="lazy"/></div>
      <div class="img-card__foot">
        <div class="img-card__name">${name}</div>
        <button class="img-card__copy" onclick="ABA.copyImgSnippet('${url}','${name}',this)">📋 Copier code HTML</button>
      </div>`;
    grid.insertBefore(card, grid.firstChild);
  },

  copyImgSnippet(url, name, btn) {
    const code = `<figure class="plate span-feat">\n  <div class="plate__frame" style="aspect-ratio:16/9"><img src="${url}" alt="${name}" /></div>\n  <figcaption>Légende de l'image.</figcaption>\n</figure>`;
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = '✓ Copié !';
      setTimeout(() => { btn.textContent = '📋 Copier code HTML'; }, 2000);
    });
  },

  /* ── Claude AI ── */
  claude: {
    async _call(key, prompt) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error?.message || `API ${r.status}`); }
      const data = await r.json();
      const text = data.content[0].text.trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Réponse Claude non-JSON');
      return JSON.parse(m[0]);
    },

    async translate(targetLang) {
      const key = document.getElementById('claude-key').value.trim();
      if (!key) { toast('Clé API Anthropic requise', 'warning'); return; }
      if (!ABA.current) { toast('Ouvrez un article', 'warning'); return; }

      ABA.saveCurrentLangFields();
      const d = ABA.current.data;
      if (!d.contentFr) { toast('Contenu FR vide — rédigez le FR en premier', 'warning'); return; }

      const loadEl = document.getElementById('claude-loading');
      loadEl.classList.remove('hidden');

      const cap = l => l.charAt(0).toUpperCase() + l.slice(1);
      const tname = targetLang === 'en' ? 'anglais' : 'espagnol';
      const jkey  = `content${cap(targetLang)}`;
      const tkey  = `title${cap(targetLang)}`;
      const dkey  = `dek${cap(targetLang)}`;

      try {
        const result = await this._call(key,
          `Traduis en ${tname} de haute qualité (niveau magazine international) ce contenu d'article de paysagisme. Respecte la structure HTML exacte.

Titre FR : ${d.titleFr}
Dek FR : ${d.dekFr}
Contenu FR :
${d.contentFr}

Réponds UNIQUEMENT avec un JSON valide :
{"title":"...","dek":"...","content":"<p>...</p>"}`);

        d[tkey] = result.title || '';
        d[dkey] = result.dek  || '';
        d[jkey] = result.content || '';
        ABA.desync.delete(targetLang);
        ABA.updateDesyncUI();
        if (ABA.lang === targetLang) ABA.fillFields();
        ABA.dirty = true;
        toast(`✓ Traduction ${targetLang.toUpperCase()} générée`, 'success');
      } catch(e) {
        toast(`Claude : ${e.message}`, 'error', 8000);
      } finally {
        loadEl.classList.add('hidden');
      }
    },

    async generate() {
      const key    = document.getElementById('claude-key').value.trim();
      const prompt = document.getElementById('claude-prompt').value.trim();
      if (!key)    { toast('Clé API requise', 'warning'); return; }
      if (!prompt) { toast('Prompt requis', 'warning'); return; }
      if (!ABA.current) { toast('Ouvrez un article', 'warning'); return; }

      ABA.saveCurrentLangFields();
      const loadEl = document.getElementById('claude-loading');
      loadEl.classList.remove('hidden');

      try {
        const d = ABA.current.data;
        const result = await this._call(key,
          `Tu es rédacteur senior pour ABA Paysage. Voix éditoriale experte, sobre, élégante.

Article : "${d.titleFr || 'Sans titre'}"
${prompt}

Génère ou modifie le contenu dans les 3 langues.
Réponds UNIQUEMENT avec un JSON valide :
{"titleFr":"...","titleEn":"...","titleEs":"...","dekFr":"...","dekEn":"...","dekEs":"...","contentFr":"<p>...</p>","contentEn":"<p>...</p>","contentEs":"<p>...</p>"}`);

        Object.assign(d, {
          titleFr: result.titleFr || d.titleFr,
          titleEn: result.titleEn || d.titleEn,
          titleEs: result.titleEs || d.titleEs,
          dekFr:   result.dekFr   || d.dekFr,
          dekEn:   result.dekEn   || d.dekEn,
          dekEs:   result.dekEs   || d.dekEs,
          contentFr: result.contentFr || d.contentFr,
          contentEn: result.contentEn || d.contentEn,
          contentEs: result.contentEs || d.contentEs,
        });
        ABA.desync.clear();
        ABA.fillFields();
        ABA.dirty = true;
        ABA.updatePreviewNow();
        toast('✓ Article généré dans les 3 langues', 'success');
      } catch(e) {
        toast(`Claude : ${e.message}`, 'error', 8000);
      } finally {
        loadEl.classList.add('hidden');
      }
    },
  },
};

/* ── Démarrage ── */
document.addEventListener('DOMContentLoaded', () => ABA.init());
