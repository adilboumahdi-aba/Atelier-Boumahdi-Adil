/* ============================================================
   ABA Journal — Système de traduction FR / EN / ES
   Usage : data-i18n="key" sur les éléments UI
           data-fr="..." data-en="..." data-es="..." sur les titres/deks
   ============================================================ */
(function () {
  'use strict';

  /* ── Dictionnaire UI ── */
  var UI = {
    fr: {
      backToJournal  : '← Retour au sommaire',
      journalBtn     : '← Journal',
      initiateProject: 'Initier un projet',
      readingTime    : 'min de lecture',
      by             : 'Par',
      readNext       : 'À lire ensuite',
      footerStudio   : "L'atelier",
      footerJournal  : 'Journal',
      footerAllArt   : 'Tous les articles',
      footerTagline  : "Carnet d'idées et de matières d'un atelier de paysage au Maroc — taillé dans la pierre, écrit par l'eau, validé par le climat.",
      footerRights   : 'ABA — Atelier Boumahdi Adil · Rabat · Casablanca · Marrakech · Fès',
      /* blog.html */
      heroKicker     : 'Le journal de l\'atelier',
      issueLabel     : 'Numéro 01 — Été 2026',
      featured       : 'À la une',
      lectures       : 'Lectures',
      inIssue        : 'Dans ce numéro',
      readArticle    : 'Lire l\'article',
      newsletterHead : 'Journal hebdomadaire de l\'Atelier.',
      newsletterSub  : "Carnet d'idées et de matières d'un atelier de paysage au Maroc. Un regard par semaine.",
      nlLabel        : "S'abonner au Journal",
      nlPlaceholder  : 'votre@email.com',
      nlSubmit       : "S'abonner →",
      nlNote         : 'Un regard par semaine — sans spam. Désabonnement en un clic.',
      allJournal     : 'Tout le journal',
      /* categories */
      catHardscape   : 'Hardscape',
      catSoftscape   : 'Softscape',
      catWaterscape  : 'Waterscape',
      catPlayscape   : 'Playscape',
      catHistoire    : "Histoire de l'art des jardins",
      catLightscape  : 'Lightscape',
      catMatieres    : 'Matières & Métiers',
      catClimat      : 'Climat & Eau',
      catChantier    : 'Carnet de chantier',
      catBotanique   : 'Botanique endémique',
    },
    en: {
      backToJournal  : '← Back to contents',
      journalBtn     : '← Journal',
      initiateProject: 'Start a project',
      readingTime    : 'min read',
      by             : 'By',
      readNext       : 'Read next',
      footerStudio   : 'The studio',
      footerJournal  : 'Journal',
      footerAllArt   : 'All articles',
      footerTagline  : "A landscape studio's notebook of ideas and materials, from Morocco — carved in stone, written by water, approved by climate.",
      footerRights   : 'ABA — Atelier Boumahdi Adil · Rabat · Casablanca · Marrakech · Fès',
      heroKicker     : 'The studio journal',
      issueLabel     : 'Issue 01 — Summer 2026',
      featured       : 'Featured',
      lectures       : 'Reads',
      inIssue        : 'In this issue',
      readArticle    : 'Read article',
      newsletterHead : 'The weekly studio journal.',
      newsletterSub  : "A landscape studio's notebook of ideas and materials from Morocco. One perspective a week.",
      nlLabel        : 'Subscribe to the Journal',
      nlPlaceholder  : 'your@email.com',
      nlSubmit       : 'Subscribe →',
      nlNote         : 'One perspective a week — no spam. Unsubscribe in one click.',
      allJournal     : 'All articles',
      catHardscape   : 'Hardscape',
      catSoftscape   : 'Softscape',
      catWaterscape  : 'Waterscape',
      catPlayscape   : 'Playscape',
      catHistoire    : 'History of garden art',
      catLightscape  : 'Lightscape',
      catMatieres    : 'Materials & Craft',
      catClimat      : 'Climate & Water',
      catChantier    : 'Site notebook',
      catBotanique   : 'Endemic botany',
    },
    es: {
      backToJournal  : '← Volver al sumario',
      journalBtn     : '← Diario',
      initiateProject: 'Iniciar un proyecto',
      readingTime    : 'min de lectura',
      by             : 'Por',
      readNext       : 'Leer a continuación',
      footerStudio   : 'El taller',
      footerJournal  : 'Diario',
      footerAllArt   : 'Todos los artículos',
      footerTagline  : "Cuaderno de ideas y materias de un taller de paisaje en Marruecos — tallado en la piedra, escrito por el agua, validado por el clima.",
      footerRights   : 'ABA — Atelier Boumahdi Adil · Rabat · Casablanca · Marrakech · Fès',
      heroKicker     : 'El diario del taller',
      issueLabel     : 'Número 01 — Verano 2026',
      featured       : 'Destacado',
      lectures       : 'Lecturas',
      inIssue        : 'En este número',
      readArticle    : 'Leer el artículo',
      newsletterHead : 'El diario semanal del taller.',
      newsletterSub  : "Cuaderno de ideas y materias de un taller de paisaje en Marruecos. Una mirada por semana.",
      nlLabel        : 'Suscribirse al Diario',
      nlPlaceholder  : 'su@email.com',
      nlSubmit       : 'Suscribirse →',
      nlNote         : 'Una mirada por semana — sin spam. Baja en un clic.',
      allJournal     : 'Todo el diario',
      catHardscape   : 'Hardscape',
      catSoftscape   : 'Softscape',
      catWaterscape  : 'Waterscape',
      catPlayscape   : 'Playscape',
      catHistoire    : 'Historia del arte de los jardines',
      catLightscape  : 'Lightscape',
      catMatieres    : 'Materias y Oficios',
      catClimat      : 'Clima y Agua',
      catChantier    : 'Cuaderno de obra',
      catBotanique   : 'Botánica endémica',
    }
  };

  /* ── Moteur ── */
  function setLang(lang) {
    if (!UI[lang]) lang = 'fr';
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('aba-lang', lang);

    /* Boutons langue */
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-lang') === lang ? 'true' : 'false');
    });

    /* Éléments data-i18n */
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var t = UI[lang][key];
      if (t !== undefined) {
        /* Conserver les balises enfant si innerHTML requis */
        if (el.getAttribute('data-i18n-html')) {
          el.innerHTML = t;
        } else {
          el.textContent = t;
        }
      }
    });

    /* Éléments data-fr / data-en / data-es (titres, deks) */
    document.querySelectorAll('[data-fr]').forEach(function (el) {
      var text = el.getAttribute('data-' + lang) || el.getAttribute('data-fr');
      if (text) el.textContent = text;
    });

    /* Placeholders */
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-ph');
      var t = UI[lang][key];
      if (t) el.setAttribute('placeholder', t);
    });
  }

  /* Exposé globalement */
  window.setLang = setLang;

  /* Init au chargement */
  var saved = localStorage.getItem('aba-lang') || 'fr';
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setLang(saved); });
  } else {
    setLang(saved);
  }
})();

/* ── Blocs de contenu trilingues ──
   Usage : <div data-lang-block="fr">...</div>
            <div data-lang-block="en" style="display:none">...</div>
            <div data-lang-block="es" style="display:none">...</div>
   setLang() affiche le bon bloc et masque les autres.
──────────────────────────────────── */
var _origSetLang = window.setLang;
window.setLang = function(lang) {
  _origSetLang(lang);
  document.querySelectorAll('[data-lang-block]').forEach(function(el) {
    el.style.display = el.getAttribute('data-lang-block') === lang ? '' : 'none';
  });
};
