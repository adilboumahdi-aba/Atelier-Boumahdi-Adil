/* GeoField — modèles de fiches métier.
   Chaque modèle décrit les champs du formulaire de saisie terrain et le style cartographique. */

const T = (id, label, opts) => ({ id, label, ...opts });

export const FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'checkbox', 'date'];

export const TEMPLATES = {
  generique: {
    id: 'generique',
    label: 'Point d\'intérêt',
    icon: '📍',
    color: '#1f3a5f',
    geometry: ['point', 'line', 'polygon'],
    fields: [
      T('categorie', 'Catégorie', { type: 'select', options: ['Repère', 'Accès', 'Obstacle', 'Équipement', 'Autre'] }),
      T('description', 'Description', { type: 'textarea' }),
      T('etat', 'État', { type: 'select', options: ['Bon', 'Moyen', 'Mauvais', 'Non évalué'] }),
    ],
  },

  arbre: {
    id: 'arbre',
    label: 'Inventaire arboré',
    icon: '🌳',
    color: '#3f7d34',
    geometry: ['point'],
    fields: [
      T('essence', 'Essence', { type: 'text', placeholder: 'Ex. Olea europaea' }),
      T('nom_commun', 'Nom commun', { type: 'text', placeholder: 'Ex. Olivier' }),
      T('circonference', 'Circonférence à 1 m', { type: 'number', unit: 'cm', step: 1 }),
      T('hauteur', 'Hauteur', { type: 'number', unit: 'm', step: 0.5 }),
      T('couronne', 'Diamètre de couronne', { type: 'number', unit: 'm', step: 0.5 }),
      T('etat_sanitaire', 'État sanitaire', { type: 'select', options: ['Bon', 'Moyen', 'Dépérissant', 'Mort'] }),
      T('risque', 'Niveau de risque', { type: 'select', options: ['Faible', 'Modéré', 'Élevé', 'Critique'] }),
      T('preconisation', 'Préconisation', { type: 'select', options: ['Aucune', 'Taille douce', 'Élagage', 'Haubanage', 'Abattage', 'Diagnostic approfondi'] }),
      T('date_plantation', 'Date de plantation', { type: 'date' }),
      T('protege', 'Sujet protégé / remarquable', { type: 'checkbox' }),
      T('observations', 'Observations', { type: 'textarea' }),
    ],
  },

  plantation: {
    id: 'plantation',
    label: 'Zone de plantation',
    icon: '🌿',
    color: '#a8c61c',
    geometry: ['polygon'],
    fields: [
      T('couvert', 'Type de couvert', { type: 'select', options: ['Gazon', 'Prairie', 'Massif arbustif', 'Couvre-sol', 'Vivaces', 'Paillage minéral', 'Verger'] }),
      T('essence_dominante', 'Essence dominante', { type: 'text' }),
      T('densite', 'Densité', { type: 'number', unit: 'plants/m²', step: 0.1 }),
      T('arrosage', 'Arrosage', { type: 'select', options: ['Goutte-à-goutte', 'Aspersion', 'Manuel', 'Aucun'] }),
      T('sol', 'Nature du sol', { type: 'select', options: ['Sableux', 'Limoneux', 'Argileux', 'Rocheux', 'Terre végétale rapportée'] }),
      T('avancement', 'Avancement', { type: 'select', options: ['À faire', 'Préparation sol', 'Planté', 'Réceptionné'] }),
      T('observations', 'Observations', { type: 'textarea' }),
    ],
  },

  reseau: {
    id: 'reseau',
    label: 'Réseau / regard',
    icon: '🔧',
    color: '#b45309',
    geometry: ['point', 'line'],
    fields: [
      T('type_reseau', 'Type de réseau', { type: 'select', options: ['Eaux usées', 'Eaux pluviales', 'Eau potable', 'Électricité', 'Télécom', 'Gaz', 'Arrosage', 'Inconnu'] }),
      T('ouvrage', 'Ouvrage', { type: 'select', options: ['Regard', 'Vanne', 'Bouche', 'Chambre', 'Poteau', 'Canalisation', 'Fourreau'] }),
      T('diametre', 'Diamètre', { type: 'number', unit: 'mm', step: 10 }),
      T('profondeur', 'Profondeur du fil d\'eau', { type: 'number', unit: 'm', step: 0.05 }),
      T('materiau', 'Matériau', { type: 'select', options: ['PVC', 'PEHD', 'Fonte', 'Béton', 'Grès', 'Acier', 'Inconnu'] }),
      T('classe_precision', 'Classe de précision', { type: 'select', options: ['A (±40 cm)', 'B (±1,5 m)', 'C (> 1,5 m)'] }),
      T('accessible', 'Ouvrage accessible', { type: 'checkbox' }),
      T('etat', 'État', { type: 'select', options: ['Bon', 'Moyen', 'Dégradé', 'Hors service'] }),
      T('observations', 'Observations', { type: 'textarea' }),
    ],
  },

  desordre: {
    id: 'desordre',
    label: 'Désordre / anomalie',
    icon: '⚠️',
    color: '#c0392b',
    geometry: ['point', 'line', 'polygon'],
    fields: [
      T('type_desordre', 'Type', { type: 'select', options: ['Fissure', 'Affaissement', 'Fuite', 'Corrosion', 'Casse', 'Défaut de finition', 'Non-conformité', 'Autre'] }),
      T('gravite', 'Gravité', { type: 'select', options: ['Mineure', 'Moyenne', 'Majeure', 'Critique'] }),
      T('urgence', 'Urgence de traitement', { type: 'select', options: ['Sous 24 h', 'Sous 1 semaine', 'Sous 1 mois', 'À planifier'] }),
      T('lot', 'Lot / entreprise concernée', { type: 'text' }),
      T('description', 'Description', { type: 'textarea' }),
      T('leve', 'Levé (corrigé)', { type: 'checkbox' }),
    ],
  },

  implantation: {
    id: 'implantation',
    label: 'Point d\'implantation',
    icon: '🎯',
    color: '#6d28d9',
    geometry: ['point'],
    fields: [
      T('reference', 'Référence', { type: 'text', placeholder: 'Ex. A12' }),
      T('nature', 'Nature', { type: 'select', options: ['Piquet', 'Axe', 'Angle bâti', 'Niveau', 'Borne', 'Arbre à planter', 'Luminaire'] }),
      T('altitude_projet', 'Altitude projet', { type: 'number', unit: 'm NGM', step: 0.01 }),
      T('tolerance', 'Tolérance', { type: 'number', unit: 'cm', step: 1 }),
      T('implante', 'Implanté sur le terrain', { type: 'checkbox' }),
      T('observations', 'Observations', { type: 'textarea' }),
    ],
  },

  sondage: {
    id: 'sondage',
    label: 'Sondage / essai',
    icon: '🕳️',
    color: '#7c5c3e',
    geometry: ['point'],
    fields: [
      T('numero', 'Numéro de sondage', { type: 'text' }),
      T('methode', 'Méthode', { type: 'select', options: ['Fouille à la pelle', 'Tarière', 'Pénétromètre', 'Carottage', 'Essai de perméabilité'] }),
      T('profondeur', 'Profondeur atteinte', { type: 'number', unit: 'm', step: 0.1 }),
      T('nature_sol', 'Nature du sol', { type: 'textarea', placeholder: '0-0,4 m terre végétale ; 0,4-1,2 m argile…' }),
      T('nappe', 'Nappe rencontrée', { type: 'checkbox' }),
      T('profondeur_nappe', 'Profondeur de la nappe', { type: 'number', unit: 'm', step: 0.1 }),
      T('refus', 'Refus', { type: 'checkbox' }),
    ],
  },

  mesure: {
    id: 'mesure',
    label: 'Mesure / métré',
    icon: '📐',
    color: '#0e7490',
    geometry: ['line', 'polygon'],
    fields: [
      T('objet', 'Objet du métré', { type: 'text', placeholder: 'Ex. Bordure T2, allée en stabilisé…' }),
      T('lot', 'Lot', { type: 'text' }),
      T('quantite_theorique', 'Quantité au marché', { type: 'number', step: 0.01 }),
      T('unite', 'Unité', { type: 'select', options: ['ml', 'm²', 'm³', 'u'] }),
      T('observations', 'Observations', { type: 'textarea' }),
    ],
  },
};

export const TEMPLATE_LIST = Object.values(TEMPLATES);

export function getTemplate(id) {
  return TEMPLATES[id] || TEMPLATES.generique;
}

export function templatesFor(geometry) {
  return TEMPLATE_LIST.filter((t) => t.geometry.includes(geometry));
}

/** Valeur lisible d'un champ pour l'affichage et les exports. */
export function formatValue(field, value) {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'checkbox') return value ? 'Oui' : 'Non';
  if (field.type === 'number' && field.unit) return `${value} ${field.unit}`;
  return String(value);
}

/** Résumé court d'une fiche : les 3 premiers champs renseignés. */
export function summarize(feature) {
  const tpl = getTemplate(feature.template);
  const parts = [];
  for (const f of tpl.fields) {
    const v = formatValue(f, feature.props?.[f.id]);
    if (v) parts.push(v);
    if (parts.length === 3) break;
  }
  return parts.join(' · ');
}
