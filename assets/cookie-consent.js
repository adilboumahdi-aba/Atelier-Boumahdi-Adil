/* ============================================================
   ABA Paysage — Cookie Consent RGPD
   Affiché uniquement aux visiteurs depuis l'UE / EEE / UK
   Détection : api.country.is (IP → code pays, sans clé API)
   Résultat mis en cache 30 jours dans localStorage
   GA4 : window['ga-disable-G-P2MDTEBQVF'] = true si refus
   FR / EN / ES — suit localStorage 'aba-lang'
   ============================================================ */
(function () {
  'use strict';

  var GA_ID       = 'G-P2MDTEBQVF';
  var CONSENT_KEY = 'aba-cookie-consent';   /* 'accepted' | 'refused' */
  var GEO_KEY     = 'aba-geo-country';      /* 'FR' | 'MA' | … */
  var GEO_TTL_KEY = 'aba-geo-ts';           /* timestamp du cache */
  var GEO_TTL_MS  = 30 * 24 * 3600 * 1000; /* 30 jours */
  var GEO_API     = 'https://api.country.is/';

  /* Pays soumis au RGPD (UE 27 + EEE + Royaume-Uni) */
  var EU = {
    AT:1,BE:1,BG:1,CY:1,CZ:1,DE:1,DK:1,EE:1,ES:1,FI:1,FR:1,
    GR:1,HR:1,HU:1,IE:1,IT:1,LT:1,LU:1,LV:1,MT:1,NL:1,PL:1,
    PT:1,RO:1,SE:1,SI:1,SK:1,
    /* EEE */
    IS:1,LI:1,NO:1,
    /* Royaume-Uni (UK GDPR) */
    GB:1
  };

  /* ── 1. Blocage immédiat si déjà refusé ── */
  var consent = localStorage.getItem(CONSENT_KEY);
  if (consent === 'refused') {
    window['ga-disable-' + GA_ID] = true;
  }

  /* ── 2. Si déjà choisi, rien à afficher ── */
  if (consent) return;

  /* ── 3. Vérifier le cache géo ── */
  var cachedCountry = localStorage.getItem(GEO_KEY);
  var cachedTs      = parseInt(localStorage.getItem(GEO_TTL_KEY) || '0', 10);
  var cacheValid    = cachedCountry && (Date.now() - cachedTs < GEO_TTL_MS);

  if (cacheValid) {
    if (EU[cachedCountry]) initBanner();
    return;
  }

  /* ── 4. Appel API géo (une seule fois par appareil / 30 jours) ── */
  fetch(GEO_API)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var country = (data.country || '').toUpperCase();
      localStorage.setItem(GEO_KEY, country);
      localStorage.setItem(GEO_TTL_KEY, String(Date.now()));
      if (EU[country]) initBanner();
    })
    .catch(function () {
      /* En cas d'échec API → afficher le banner par sécurité */
      initBanner();
    });

  /* ══════════════════════════════════════════════════════════
     Banner
  ══════════════════════════════════════════════════════════ */

  var T = {
    fr: {
      msg:    'Nous utilisons Google Analytics pour mesurer l\'audience de notre site. Vos données restent anonymisées et ne sont jamais revendues.',
      accept: 'Accepter',
      refuse: 'Refuser',
      more:   'Politique de confidentialité',
    },
    en: {
      msg:    'We use Google Analytics to measure our website audience. Your data remains anonymised and is never sold.',
      accept: 'Accept',
      refuse: 'Decline',
      more:   'Privacy policy',
    },
    es: {
      msg:    'Utilizamos Google Analytics para medir la audiencia de nuestro sitio. Sus datos permanecen anonimizados y nunca se venden.',
      accept: 'Aceptar',
      refuse: 'Rechazar',
      more:   'Política de privacidad',
    },
  };

  function getLang() {
    var s = localStorage.getItem('aba-lang');
    if (s === 'fr' || s === 'en' || s === 'es') return s;
    var n = (navigator.language || '').toLowerCase();
    if (n.indexOf('es') === 0) return 'es';
    if (n.indexOf('en') === 0) return 'en';
    return 'fr';
  }

  function getPrivacyHref() {
    var p = window.location.pathname;
    if (p.indexOf('/blog/') !== -1 || p.indexOf('/assets/portfolio/') !== -1) {
      return '../mentions-legales.html';
    }
    return '/mentions-legales.html';
  }

  function injectStyles() {
    if (document.getElementById('aba-cookie-style')) return;
    var s = document.createElement('style');
    s.id = 'aba-cookie-style';
    s.textContent = [
      '#aba-cookie-banner{',
        'position:fixed;bottom:0;left:0;right:0;z-index:10000;',
        'background:#1d1b16;color:#ece6d8;',
        'padding:14px 20px;',
        'border-top:1px solid rgba(236,230,216,0.1);',
        'font-family:"Hanken Grotesk",system-ui,sans-serif;',
        'box-shadow:0 -4px 24px rgba(0,0,0,0.25);',
        'animation:aba-slide-up 320ms cubic-bezier(.22,.61,.36,1) both;',
      '}',
      '@keyframes aba-slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}',
      '.aba-ck-inner{',
        'max-width:1200px;margin:0 auto;',
        'display:flex;align-items:center;gap:20px;flex-wrap:wrap;',
      '}',
      '.aba-ck-msg{',
        'font-size:13px;line-height:1.6;',
        'color:rgba(236,230,216,0.72);',
        'margin:0;flex:1;min-width:220px;',
      '}',
      '.aba-ck-msg a{',
        'color:#a8c61c;text-decoration:none;',
        'border-bottom:1px solid rgba(168,198,28,0.4);',
        'white-space:nowrap;',
      '}',
      '.aba-ck-msg a:hover{border-color:#a8c61c;}',
      '.aba-ck-btns{display:flex;gap:8px;flex-shrink:0;}',
      '.aba-ck-refuse,.aba-ck-accept{',
        'font-family:"Hanken Grotesk",system-ui,sans-serif;',
        'font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;',
        'padding:9px 20px;border:none;cursor:pointer;transition:opacity 180ms;',
        'white-space:nowrap;',
      '}',
      '.aba-ck-refuse{',
        'background:transparent;color:rgba(236,230,216,0.55);',
        'border:1px solid rgba(236,230,216,0.18);',
      '}',
      '.aba-ck-refuse:hover{color:rgba(236,230,216,0.85);}',
      '.aba-ck-accept{background:#a8c61c;color:#1d1b16;}',
      '.aba-ck-accept:hover{opacity:0.88;}',
      '@media(max-width:480px){',
        '.aba-ck-inner{flex-direction:column;align-items:stretch;}',
        '.aba-ck-btns{justify-content:flex-end;}',
      '}',
    ].join('');
    document.head.appendChild(s);
  }

  function showBanner() {
    injectStyles();
    var lang = getLang();
    var t    = T[lang] || T.fr;

    var banner = document.createElement('div');
    banner.id = 'aba-cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label',
      lang === 'en' ? 'Cookie consent' :
      lang === 'es' ? 'Consentimiento de cookies' :
      'Consentement cookies');

    banner.innerHTML =
      '<div class="aba-ck-inner">' +
        '<p class="aba-ck-msg">' +
          t.msg + ' ' +
          '<a href="' + getPrivacyHref() + '">' + t.more + '</a>' +
        '</p>' +
        '<div class="aba-ck-btns">' +
          '<button class="aba-ck-refuse" type="button">' + t.refuse + '</button>' +
          '<button class="aba-ck-accept" type="button">' + t.accept + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(banner);

    banner.querySelector('.aba-ck-accept').addEventListener('click', function () {
      localStorage.setItem(CONSENT_KEY, 'accepted');
      if (window.gtag) {
        window.gtag('consent', 'update', { analytics_storage: 'granted' });
      }
      dismiss(banner);
    });

    banner.querySelector('.aba-ck-refuse').addEventListener('click', function () {
      localStorage.setItem(CONSENT_KEY, 'refused');
      window['ga-disable-' + GA_ID] = true;
      /* Supprimer les cookies GA4 déjà déposés */
      var cookies = document.cookie.split(';');
      for (var i = 0; i < cookies.length; i++) {
        var name = cookies[i].trim().split('=')[0];
        if (name.indexOf('_ga') === 0) {
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.' + location.hostname;
        }
      }
      dismiss(banner);
    });
  }

  function dismiss(el) {
    el.style.transition = 'transform 280ms ease-in';
    el.style.transform  = 'translateY(100%)';
    setTimeout(function () { el.remove(); }, 300);
  }

  function initBanner() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }

})();
