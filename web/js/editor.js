// Janela de criar/editar receita: texto, caneta por seção, foto e exclusão.
import * as api from './api.js';
import { inkPad } from './ink.js';

const SECTIONS = { ingredients: 'Ingredientes', steps: 'Modo de preparo', notes: 'Observações' };
const MEDIA = id => `/media/${id}`;

const dlg = document.getElementById('editor');
const form = dlg.querySelector('form');
const preview = dlg.querySelector('.photo--mini');
const photoInput = document.getElementById('photo');
const saveBtn = form.querySelector('[value="save"]');
const pads = {};
const modes = {};

let recipe = null;
let photo; // undefined = sem mudança, null = remover, Blob = nova foto
let onSaved = () => {};

for (const [key, label] of Object.entries(SECTIONS)) {
  const sec = document.getElementById('tpl-section').content.firstElementChild.cloneNode(true);
  sec.querySelector('legend').textContent = label;
  sec.querySelector('textarea').name = key;
  const padEl = sec.querySelector('.ink-pad');
  const pad = pads[key] = inkPad(sec.querySelector('canvas'));
  const tabs = sec.querySelectorAll('.tab');

  modes[key] = mode => {
    tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.mode === mode));
    sec.querySelector('textarea').hidden = mode !== 'text';
    padEl.hidden = mode !== 'ink';
  };
  tabs.forEach(t => t.addEventListener('click', () => modes[key](t.dataset.mode)));

  const tools = sec.querySelectorAll('[data-tool]');
  tools.forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tool === 'clear') return pad.clear();
    pad.setTool(b.dataset.tool);
    tools.forEach(o => o.setAttribute('aria-pressed', o === b));
  }));
  tools[0].setAttribute('aria-pressed', true);
  document.getElementById('sections').append(sec);
}

function showPhoto(src) {
  const img = preview.querySelector('img');
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.hidden = !src;
  if (src) img.src = src; else img.removeAttribute('src');
}

/** Reduz a foto do celular (vários MB) pra no máx. 1600px antes de enviar. */
async function shrink(file, max = 1600) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
}

photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  photoInput.value = '';
  if (!file) return;
  try {
    photo = await shrink(file);
    showPhoto(URL.createObjectURL(photo));
  } catch {
    api.toast('Não consegui abrir essa foto. Tente JPG ou PNG.');
  }
});

dlg.querySelector('[data-photo-clear]').addEventListener('click', () => { photo = null; showPhoto(null); });

dlg.querySelector('[data-delete]').addEventListener('click', async () => {
  if (!recipe || !confirm(`Apagar "${recipe.title}" do livro? Não tem volta.`)) return;
  try {
    await api.remove(recipe.id);
    dlg.close();
    api.toast('Receita apagada');
    onSaved(null);
  } catch (err) {
    api.toast(err.message);
  }
});

form.addEventListener('submit', async e => {
  if (e.submitter?.value !== 'save') return; // "✕" fecha pelo method="dialog"
  e.preventDefault();
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';
  try {
    const fields = Object.fromEntries(['title', 'category', ...Object.keys(SECTIONS)]
      .map(k => [k, form.elements[k].value.trim()]));
    const saved = recipe ? await api.update(recipe.id, fields) : await api.create(fields);
    for (const key of Object.keys(SECTIONS)) {
      if (!pads[key].dirty) continue;
      const blob = await pads[key].blob();
      if (blob) await api.putMedia(saved.id, `ink_${key}`, blob);
      else if (saved[`ink_${key}`]) await api.dropMedia(saved.id, `ink_${key}`);
    }
    if (photo) await api.putMedia(saved.id, 'photo', photo);
    else if (photo === null && saved.photo) await api.dropMedia(saved.id, 'photo');
    dlg.close();
    api.toast('Receita guardada no livro');
    onSaved(saved.id);
  } catch (err) {
    api.toast(err.message); // janela continua aberta: nada do que foi escrito se perde
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar no livro';
  }
});

export function initEditor(savedCallback) {
  onSaved = savedCallback;
}

export async function openEditor(r, categories = []) {
  recipe = r;
  photo = undefined;
  form.reset();
  dlg.querySelector('.sheet__title').textContent = r ? 'Editar receita' : 'Nova receita';
  dlg.querySelector('[data-delete]').hidden = !r;
  for (const k of ['title', 'category', ...Object.keys(SECTIONS)]) form.elements[k].value = r?.[k] ?? '';
  document.getElementById('categories').replaceChildren(
    ...categories.map(c => Object.assign(document.createElement('option'), { value: c })));
  showPhoto(r?.photo ? MEDIA(r.photo) : null);
  dlg.showModal();
  await Promise.all(Object.keys(SECTIONS).map(k => {
    const ink = r?.[`ink_${k}`];
    modes[k](ink && !r[k] ? 'ink' : 'text');
    return pads[k].load(ink ? MEDIA(ink) : null);
  }));
}
