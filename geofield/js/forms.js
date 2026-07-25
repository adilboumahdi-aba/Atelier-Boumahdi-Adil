/* GeoField — génération et lecture des formulaires de fiche terrain. */

import { getTemplate } from './templates.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function fieldControl(field, value) {
  const id = `fld_${field.id}`;
  let input;

  switch (field.type) {
    case 'textarea':
      input = el('textarea');
      input.rows = 3;
      input.value = value ?? '';
      break;
    case 'number':
      input = el('input');
      input.type = 'number';
      input.inputMode = 'decimal';
      if (field.step) input.step = field.step;
      input.value = value ?? '';
      break;
    case 'select':
      input = el('select');
      input.appendChild(new Option('—', ''));
      for (const opt of field.options || []) {
        input.appendChild(new Option(opt, opt, false, String(value) === opt));
      }
      break;
    case 'checkbox':
      input = el('input');
      input.type = 'checkbox';
      input.checked = Boolean(value);
      break;
    case 'date':
      input = el('input');
      input.type = 'date';
      input.value = value ?? '';
      break;
    default:
      input = el('input');
      input.type = 'text';
      input.value = value ?? '';
  }

  input.id = id;
  input.name = field.id;
  input.dataset.type = field.type || 'text';
  if (field.placeholder) input.placeholder = field.placeholder;
  return input;
}

/** Construit le formulaire d'un modèle dans `container`. */
export function renderFields(container, templateId, values = {}) {
  container.innerHTML = '';
  const tpl = getTemplate(templateId);

  for (const field of tpl.fields) {
    const row = el('div', `field field--${field.type || 'text'}`);
    const label = el('label', 'field__label', field.label + (field.unit ? ` (${field.unit})` : ''));
    label.htmlFor = `fld_${field.id}`;
    const input = fieldControl(field, values[field.id]);

    if (field.type === 'checkbox') {
      row.classList.add('field--inline');
      row.append(input, label);
    } else {
      row.append(label, input);
    }
    container.appendChild(row);
  }
  return tpl;
}

/** Lit les valeurs saisies dans `container`. */
export function readFields(container, templateId) {
  const tpl = getTemplate(templateId);
  const out = {};
  for (const field of tpl.fields) {
    const input = container.querySelector(`[name="${field.id}"]`);
    if (!input) continue;
    if (field.type === 'checkbox') {
      if (input.checked) out[field.id] = true;
    } else if (field.type === 'number') {
      if (input.value !== '') out[field.id] = Number(input.value);
    } else if (input.value !== '') {
      out[field.id] = input.value;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- champs libres */

export function renderCustomFields(container, custom = []) {
  container.innerHTML = '';
  custom.forEach((c, i) => container.appendChild(customRow(c, i)));
}

export function addCustomRow(container) {
  container.appendChild(customRow({ key: '', value: '' }, container.children.length));
}

function customRow(c) {
  const row = el('div', 'custom-row');
  const k = el('input');
  k.type = 'text';
  k.placeholder = 'Champ';
  k.className = 'custom-key';
  k.value = c.key || '';
  const v = el('input');
  v.type = 'text';
  v.placeholder = 'Valeur';
  v.className = 'custom-value';
  v.value = c.value || '';
  const del = el('button', 'btn-icon btn-icon--danger', '✕');
  del.type = 'button';
  del.title = 'Supprimer ce champ';
  del.addEventListener('click', () => row.remove());
  row.append(k, v, del);
  return row;
}

export function readCustomFields(container) {
  return Array.from(container.querySelectorAll('.custom-row'))
    .map((row) => ({
      key: row.querySelector('.custom-key').value.trim(),
      value: row.querySelector('.custom-value').value.trim(),
    }))
    .filter((c) => c.key);
}
