/* ============================================================
   ABA Paysage — Newsletter Popup
   Déclenché après 5 sec + exit intent
   Variante A — Fond clair #efe9dd
   Stockage : localStorage — 7 jours après fermeture, jamais après abonnement
   Brevo : formulaire existant
   FR / EN / ES via setLang / localStorage aba-lang
   ============================================================ */
(function () {
  'use strict';

  /* ── Config ── */
  var BREVO_URL = 'https://2841c208.sibforms.com/serve/MUIFAK0S-hOm74Fy1HPGKIimqMbEb4t2WvYZ_b5TwQ1gvP3nDDDZmH8PXZwcWOE_bjZ6_dJ7VT-UwbCILrU_wShXmeiRN2QKVOo2rrd904tQKFgE_EjQjY8gnrIfEfx_tUMxQPAJQ0hvLZ7hm6SljWafWrT8CnjQy6o1qnIdXXfiY0azyoaKm5e_n2wZP4jrObC7l9pzg63_Z1W3CA==';
  var DISMISS_KEY    = 'aba-popup-dismissed';
  var SUBSCRIBED_KEY = 'aba-popup-subscribed';
  var DISMISS_DAYS   = 7;
  var DELAY_MS       = 5000; /* 5 secondes */

  /* ── Traductions ── */
  var T = {
    fr: {
      kicker:   'Journal de l\'Atelier',
      title:    'Un regard par semaine',
      titleEm:  'sur le paysage.',
      sub:      'Rejoignez les lecteurs du Journal ABA — chaque semaine, une lettre d\'un atelier qui pense le dehors autrement.',
      b1: 'Conseils pratiques en jardinage & entretien',
      b2: 'Tendances & inspirations paysagères',
      b3: 'Projets & réalisations ABA en avant-première',
      b4: 'Promotions & offres exclusives',
      b5: 'Nouveautés du monde de l\'aménagement extérieur',
      b6: 'Plantes, matières & savoir-faire du Maroc',
      placeholder: 'votre@email.com',
      cta:     'S\'abonner →',
      note:    'Un email par semaine · Sans spam · Désabonnement en 1 clic',
      skip:    'Continuer sans s\'abonner',
      success: 'Bienvenue dans le Journal ABA. À très vite.',
    },
    en: {
      kicker:   'The Studio Journal',
      title:    'One perspective a week',
      titleEm:  'on landscape.',
      sub:      'Join ABA Journal readers — each week, a letter from a studio that thinks the outdoors differently.',
      b1: 'Practical gardening & maintenance tips',
      b2: 'Landscape trends & inspirations',
      b3: 'ABA projects & achievements — first look',
      b4: 'Exclusive promotions & offers',
      b5: 'News from the world of outdoor design',
      b6: 'Plants, materials & Moroccan craft',
      placeholder: 'your@email.com',
      cta:     'Subscribe →',
      note:    'One email per week · No spam · Unsubscribe in 1 click',
      skip:    'Continue without subscribing',
      success: 'Welcome to the ABA Journal. See you soon.',
    },
    es: {
      kicker:   'El Diario del Taller',
      title:    'Una mirada por semana',
      titleEm:  'sobre el paisaje.',
      sub:      'Únase a los lectores del Diario ABA — cada semana, una carta de un taller que piensa el exterior de otra manera.',
      b1: 'Consejos prácticos de jardinería & mantenimiento',
      b2: 'Tendencias e inspiraciones paisajísticas',
      b3: 'Proyectos ABA en primicia',
      b4: 'Promociones & ofertas exclusivas',
      b5: 'Novedades del mundo del diseño exterior',
      b6: 'Plantas, materiales & artesanía de Marruecos',
      placeholder: 'su@email.com',
      cta:     'Suscribirse →',
      note:    'Un email por semana · Sin spam · Baja en 1 clic',
      skip:    'Continuar sin suscribirse',
      success: 'Bienvenido al Diario ABA. Hasta pronto.',
    }
  };

  /* ── Helpers ── */
  function getLang() {
    return localStorage.getItem('aba-lang') || 'fr';
  }

  function shouldShow() {
    if (localStorage.getItem(SUBSCRIBED_KEY)) return false;
    var dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      var diff = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
      if (diff < DISMISS_DAYS) return false;
    }
    return true;
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    close();
  }

  function close() {
    var overlay = document.getElementById('aba-nl-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transform = 'translateY(12px)';
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 320);
    }
  }

  /* ── CSS ── */
  function injectCSS() {
    if (document.getElementById('aba-nl-style')) return;
    var s = document.createElement('style');
    s.id = 'aba-nl-style';
    s.textContent = [
      '#aba-nl-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(29,27,22,0.52);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);transition:opacity .32s ease,transform .32s ease;}',
      '#aba-nl-overlay.hidden{opacity:0;pointer-events:none;}',
      '#aba-nl-box{position:relative;background:#efe9dd;border-radius:20px;padding:clamp(28px,4vw,44px) clamp(24px,3vw,44px);width:100%;max-width:560px;box-shadow:0 24px 72px rgba(0,0,0,.28),0 6px 20px rgba(0,0,0,.14);font-family:"Hanken Grotesk",ui-sans-serif,sans-serif;}',
      '#aba-nl-close{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:50%;background:rgba(29,27,22,.08);border:none;cursor:pointer;font-size:14px;color:#5a5550;display:flex;align-items:center;justify-content:center;transition:background .18s;line-height:1;}',
      '#aba-nl-close:hover{background:rgba(29,27,22,.18);}',
      '.aba-nl-kicker{font-size:9px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#8B7355;margin-bottom:10px;display:flex;align-items:center;gap:8px;}',
      '.aba-nl-kicker::before{content:"";display:block;width:20px;height:1px;background:#8B7355;flex-shrink:0;}',
      '.aba-nl-title{font-family:"Cormorant Garamond","Georgia",serif;font-size:clamp(24px,3.5vw,34px);font-weight:400;line-height:1.1;color:#1d1b16;margin-bottom:8px;}',
      '.aba-nl-title em{font-style:italic;color:#5a7a3a;}',
      '.aba-nl-sub{font-family:"Spectral","Georgia",serif;font-size:14px;line-height:1.65;color:#5a5550;font-style:italic;margin-bottom:18px;}',
      '.aba-nl-benefits{list-style:none;border-top:1px solid rgba(29,27,22,.1);padding-top:14px;margin-bottom:20px;display:grid;grid-template-columns:1fr 1fr;gap:7px 16px;}',
      '@media(max-width:480px){.aba-nl-benefits{grid-template-columns:1fr;gap:6px;}}',
      '.aba-nl-benefits li{font-size:12px;color:#4a4540;line-height:1.4;display:flex;align-items:flex-start;gap:6px;}',
      '.aba-nl-benefits li::before{content:"→";color:#a8c61c;font-size:11px;flex-shrink:0;margin-top:1px;font-weight:700;}',
      '.aba-nl-form{display:flex;gap:0;margin-bottom:8px;}',
      '@media(max-width:420px){.aba-nl-form{flex-direction:column;gap:8px;}}',
      '.aba-nl-input{flex:1;background:rgba(29,27,22,.07);border:1px solid rgba(29,27,22,.14);border-right:none;color:#1d1b16;font-family:"Hanken Grotesk",sans-serif;font-size:14px;padding:11px 14px;outline:none;border-radius:8px 0 0 8px;transition:border .18s;}',
      '@media(max-width:420px){.aba-nl-input{border-right:1px solid rgba(29,27,22,.14);border-bottom:none;border-radius:8px 8px 0 0;}}',
      '.aba-nl-input::placeholder{color:rgba(29,27,22,.32);}',
      '.aba-nl-input:focus{border-color:#1f3a5f;background:rgba(29,27,22,.04);}',
      '.aba-nl-btn{background:#a8c61c;color:#1a1a1a;border:none;font-family:"Hanken Grotesk",sans-serif;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:11px 18px;cursor:pointer;border-radius:0 8px 8px 0;white-space:nowrap;transition:background .18s;}',
      '@media(max-width:420px){.aba-nl-btn{border-radius:0 0 8px 8px;padding:12px;}}',
      '.aba-nl-btn:hover{background:#96b018;}',
      '.aba-nl-note{font-size:10px;color:rgba(29,27,22,.38);text-align:center;margin-bottom:8px;}',
      '.aba-nl-skip{display:block;font-size:11px;color:rgba(29,27,22,.4);text-align:center;cursor:pointer;text-decoration:underline;text-underline-offset:3px;background:none;border:none;width:100%;}',
      '.aba-nl-skip:hover{color:rgba(29,27,22,.65);}',
      '.aba-nl-success{text-align:center;padding:16px 0;}',
      '.aba-nl-success .icon{font-size:32px;margin-bottom:12px;}',
      '.aba-nl-success p{font-family:"Cormorant Garamond",serif;font-size:20px;color:#1d1b16;font-style:italic;}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ── HTML ── */
  function buildHTML(lang) {
    var t = T[lang] || T.fr;
    var div = document.createElement('div');
    div.id = 'aba-nl-overlay';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-label', t.kicker);
    div.style.opacity = '0';
    div.style.transform = 'translateY(12px)';

    div.innerHTML = [
      '<div id="aba-nl-box">',
        '<button id="aba-nl-close" aria-label="Fermer">✕</button>',
        '<div class="aba-nl-kicker">' + t.kicker + '</div>',
        '<h2 class="aba-nl-title">' + t.title + '<br><em>' + t.titleEm + '</em></h2>',
        '<p class="aba-nl-sub">' + t.sub + '</p>',
        '<ul class="aba-nl-benefits">',
          '<li>' + t.b1 + '</li>',
          '<li>' + t.b2 + '</li>',
          '<li>' + t.b3 + '</li>',
          '<li>' + t.b4 + '</li>',
          '<li>' + t.b5 + '</li>',
          '<li>' + t.b6 + '</li>',
        '</ul>',
        '<form class="aba-nl-form" id="aba-nl-form">',
          '<input class="aba-nl-input" id="aba-nl-email" type="email" placeholder="' + t.placeholder + '" required />',
          '<button type="submit" class="aba-nl-btn">' + t.cta + '</button>',
        '</form>',
        '<p class="aba-nl-note">' + t.note + '</p>',
        '<button class="aba-nl-skip" id="aba-nl-skip">' + t.skip + '</button>',
      '</div>',
    ].join('');

    return div;
  }

  function showSuccess(lang) {
    var t = T[lang] || T.fr;
    var box = document.getElementById('aba-nl-box');
    if (!box) return;
    box.innerHTML = [
      '<div class="aba-nl-success">',
        '<div class="icon">🌿</div>',
        '<p>' + t.success + '</p>',
      '</div>',
    ].join('');
    setTimeout(close, 2400);
  }

  /* ── Soumission ── */
  function handleSubmit(e) {
    e.preventDefault();
    var email = document.getElementById('aba-nl-email');
    if (!email || !email.value) return;
    var lang = getLang();

    /* Soumettre à Brevo via fetch */
    var form = new FormData();
    form.append('EMAIL', email.value);
    form.append('email_address_check', '');
    form.append('locale', lang);

    fetch(BREVO_URL, { method: 'POST', body: form })
      .catch(function () { /* silencieux */ });

    localStorage.setItem(SUBSCRIBED_KEY, '1');

    /* Tracking GA4 */
    if (window.gtag) {
      gtag('event', 'newsletter_subscribe', {
        event_category: 'engagement',
        event_label: 'popup_' + lang
      });
    }

    showSuccess(lang);
  }

  /* ── Affichage ── */
  function show() {
    if (!shouldShow()) return;
    if (document.getElementById('aba-nl-overlay')) return;

    injectCSS();
    var lang = getLang();
    var overlay = buildHTML(lang);
    document.body.appendChild(overlay);

    /* Animation d'entrée */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.style.transition = 'opacity .32s ease, transform .32s ease';
        overlay.style.opacity = '1';
        overlay.style.transform = 'translateY(0)';
      });
    });

    /* Events */
    document.getElementById('aba-nl-close').addEventListener('click', dismiss);
    document.getElementById('aba-nl-skip').addEventListener('click', dismiss);
    document.getElementById('aba-nl-form').addEventListener('submit', handleSubmit);

    /* Fermer en cliquant l'overlay */
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) dismiss();
    });

    /* Fermer avec Échap */
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', esc); }
    });
  }

  /* ── Déclencheurs ── */
  function init() {
    if (!shouldShow()) return;

    /* 1. Après 5 secondes */
    var timer = setTimeout(function () {
      show();
      clearExitListener();
    }, DELAY_MS);

    /* 2. Exit intent — souris qui quitte la fenêtre par le haut */
    function exitListener(e) {
      if (e.clientY <= 8) {
        clearTimeout(timer);
        clearExitListener();
        show();
      }
    }
    function clearExitListener() {
      document.removeEventListener('mouseleave', exitListener);
    }
    document.addEventListener('mouseleave', exitListener);
  }

  /* ── Lancement ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
