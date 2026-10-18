// Cadeado do livro: digital (passkey) no celular, senha em qualquer aparelho. O servidor é quem decide.
import { toast } from './api.js';

const form = document.getElementById('lock');
const input = form.elements.password;
const fingerBtn = form.querySelector('.lock__finger');
const enroll = document.getElementById('enroll');

const isPhone = matchMedia('(pointer: coarse)').matches;
const canPasskey = isSecureContext && 'PublicKeyCredential' in window;
const wait = ms => new Promise(r => setTimeout(r, ms));
const padlock = () => document.querySelector('.leaf__face:not([inert]) .padlock');

// Lembrete por aparelho (localStorage pode não existir em aba anônima)
const flag = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: k => { try { localStorage.setItem(k, '1'); } catch { /* sem memória local, tudo bem */ } },
};

// ---- WebAuthn: JSON do servidor <-> ArrayBuffers do navegador ----
const toBuf = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0)).buffer;
const toB64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ids = list => (list || []).map(c => ({ ...c, id: toBuf(c.id) }));

function credentialJSON(c) {
  if (c.toJSON) return c.toJSON();
  const r = c.response, out = { id: c.id, rawId: toB64(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults(), response: { clientDataJSON: toB64(r.clientDataJSON) } };
  if (r.attestationObject) Object.assign(out.response, { attestationObject: toB64(r.attestationObject), transports: r.getTransports?.() ?? [] });
  else Object.assign(out.response, { authenticatorData: toB64(r.authenticatorData), signature: toB64(r.signature), userHandle: r.userHandle && toB64(r.userHandle) });
  return out;
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });

async function passkeyLogin() {
  const o = await (await post('/api/passkey/login/options')).json();
  const cred = await navigator.credentials.get({ publicKey: { ...o, challenge: toBuf(o.challenge), allowCredentials: ids(o.allowCredentials) } });
  const res = await post('/api/passkey/login', { credential: credentialJSON(cred) });
  if (!res.ok) throw new Error('Digital não reconhecida');
}

async function passkeyRegister() {
  const res = await post('/api/passkey/register/options');
  if (!res.ok) throw new Error('Destranque com a senha primeiro');
  const o = await res.json();
  const cred = await navigator.credentials.create({ publicKey: {
    ...o, challenge: toBuf(o.challenge), user: { ...o.user, id: toBuf(o.user.id) }, excludeCredentials: ids(o.excludeCredentials),
  } });
  const done = await post('/api/passkey/register', { credential: credentialJSON(cred), name: 'celular' });
  if (!done.ok) throw new Error((await done.json().catch(() => null))?.detail ?? 'Não deu pra ativar a digital');
}

/** Depois de abrir com senha no celular: oferece ativar a digital (uma vez por aparelho). */
async function offerFingerprint() {
  if (!isPhone || !canPasskey || flag.get('passkey') || flag.get('passkey-skip')) return;
  if (!await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) return;
  enroll.showModal();
  enroll.onclose = async () => {
    if (enroll.returnValue !== 'yes') return flag.set('passkey-skip');
    try {
      await passkeyRegister();
      flag.set('passkey');
      toast('Digital ativada: na próxima vez é só encostar o dedo');
    } catch (err) {
      toast(err.name === 'NotAllowedError' ? 'Ativação cancelada' : err.message);
    }
  };
}

/** Resolve quando o livro estiver destrancado; true se acabou de destrancar agora. */
export async function ensureUnlocked() {
  const s = await (await fetch('/api/session')).json();
  if (s.unlocked) return false;
  document.body.classList.add('is-locked');
  input.placeholder = s.setup ? 'crie' : '••••';
  if (s.setup) toast('Crie a senha do livro (mínimo 4 caracteres)');
  const finger = isPhone && canPasskey && s.passkeys;
  fingerBtn.hidden = !finger;

  let viaPassword = false;
  await new Promise(resolve => {
    const opened = async () => {
      form.reset();
      const lock = padlock();
      lock?.classList.add('is-open', 'is-falling');
      await wait(lock ? 850 : 0);
      document.body.classList.remove('is-locked');
      lock?.classList.remove('is-open', 'is-falling');
      resolve();
    };
    const tryFinger = async () => {
      try {
        await passkeyLogin();
        flag.set('passkey');
        opened();
      } catch (err) {
        if (err.name !== 'NotAllowedError') toast(err.message); // cancelou: fica na senha
      }
    };
    fingerBtn.onclick = tryFinger;
    document.getElementById('book').addEventListener('click', e => {
      if (finger && document.body.classList.contains('is-locked') && e.target.closest('.clasp')) tryFinger();
    });
    form.onsubmit = async e => {
      e.preventDefault();
      const res = await post('/api/unlock', { password: input.value });
      if (!res.ok) {
        const detail = (await res.json().catch(() => null))?.detail;
        toast(typeof detail === 'string' ? detail : 'Senha errada');
        form.classList.remove('is-wrong');
        void form.offsetWidth; // reinicia a animação de tremida
        form.classList.add('is-wrong');
        input.select();
        return;
      }
      viaPassword = true;
      opened();
    };
    if (finger && flag.get('passkey')) tryFinger(); // este celular já tem digital: chama o leitor na hora
    else if (!isPhone) input.focus();
  });
  if (viaPassword) offerFingerprint();
  return true;
}

export async function lockBook() {
  await post('/api/lock');
  location.reload();
}
