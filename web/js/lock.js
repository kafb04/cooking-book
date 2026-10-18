// Cadeado do livro: pergunta a senha na plaquinha e abre o cadeado da capa quando o servidor aceita.
import { toast } from './api.js';

const form = document.getElementById('lock');
const input = form.elements.password;

const padlock = () => document.querySelector('.leaf__face:not([inert]) .padlock');
const wait = ms => new Promise(r => setTimeout(r, ms));

/** Resolve quando o livro estiver destrancado; true se a senha acabou de ser digitada. */
export async function ensureUnlocked() {
  const s = await (await fetch('/api/session')).json();
  if (s.unlocked) return false;
  document.body.classList.add('is-locked');
  input.placeholder = s.setup ? 'crie' : '••••';
  if (s.setup) toast('Crie a senha do livro (mínimo 4 caracteres)');
  input.focus();
  await new Promise(resolve => {
    form.onsubmit = async e => {
      e.preventDefault();
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: input.value }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => null))?.detail;
        toast(typeof detail === 'string' ? detail : 'Senha errada');
        form.classList.remove('is-wrong');
        void form.offsetWidth; // reinicia a animação de tremida
        form.classList.add('is-wrong');
        input.select();
        return;
      }
      form.reset();
      const lock = padlock();
      lock?.classList.add('is-open', 'is-falling');
      await wait(lock ? 850 : 0);
      document.body.classList.remove('is-locked');
      lock?.classList.remove('is-open', 'is-falling');
      resolve();
    };
  });
  return true;
}

export async function lockBook() {
  await fetch('/api/lock', { method: 'POST' });
  location.reload();
}
