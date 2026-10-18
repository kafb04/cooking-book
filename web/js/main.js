// Boot: carrega as receitas, monta o livro e liga editor e importação.
import * as api from './api.js';
import * as book from './book.js';
import { initEditor, openEditor } from './editor.js';
import { ensureUnlocked, lockBook } from './lock.js';

let recipes = [];

async function refresh(focus) {
  try {
    recipes = await api.list();
  } catch (err) {
    api.toast(err.message);
  }
  book.render(recipes, focus);
}

const categories = () => [...new Set(recipes.map(r => r.category).filter(Boolean))].sort();

initEditor(id => refresh(id ?? 'toc'));

document.addEventListener('click', e => {
  const edit = e.target.closest('[data-edit]');
  if (edit) return openEditor(recipes.find(r => r.id === edit.dataset.edit), categories());
  if (e.target.closest('[data-action="new"]')) openEditor(null, categories());
  if (e.target.closest('[data-action="lock"]')) lockBook();
  if (e.target.closest('[data-action="install"]')) install();
});

document.getElementById('import').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  api.toast('Lendo as receitas...');
  try {
    const { created, failed } = await api.importDocx(files);
    api.toast(`${created.length} receita(s) importada(s)${failed.length ? ` · não li: ${failed.join(', ')}` : ''}`);
    await refresh(created[0]?.id);
    if (created.length === 1) openEditor(recipes.find(r => r.id === created[0].id), categories());
  } catch (err) {
    api.toast(err.message);
  }
});

// Instalar como app: usa o convite do navegador quando existe; senão mostra o passo a passo
let installPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
if (matchMedia('(display-mode: standalone)').matches) document.querySelector('[data-action="install"]').hidden = true;
function install() {
  if (installPrompt) { installPrompt.prompt(); installPrompt = null; } else document.getElementById('install-help').showModal();
}

book.render([]); // capa trancada enquanto espera a senha
const justUnlocked = await ensureUnlocked();
await refresh(location.hash.match(/^#\/receita\/(\w+)/)?.[1]);
if (justUnlocked && !location.hash) book.go('toc'); // abre o livro no sumário
