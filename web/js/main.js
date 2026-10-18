// Boot: cadeado, receitas, livro, editor e instalação como app.
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

// Instalar como app: com HTTPS o Chrome entrega o convite e o botão abre a instalação na hora;
// sem ele (ou no iPhone, que não tem convite) o botão mostra o passo a passo
const installBtn = document.querySelector('[data-action="install"]');
let installPrompt = null;
if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('/sw.js');
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
addEventListener('appinstalled', () => { installBtn.hidden = true; api.toast('Livro instalado na tela inicial'); });
if (matchMedia('(display-mode: standalone)').matches) installBtn.hidden = true;
async function install() {
  if (!installPrompt) return document.getElementById('install-help').showModal();
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  if (outcome === 'accepted') installBtn.hidden = true;
}

book.render([]); // capa trancada enquanto espera a senha
const justUnlocked = await ensureUnlocked();
await refresh(location.hash.match(/^#\/receita\/(\w+)/)?.[1]);
if (justUnlocked && !location.hash) book.go('toc'); // abre o livro no sumário
