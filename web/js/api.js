// Chamadas ao servidor. Erros viram Error com a mensagem do backend.
async function call(method, url, body) {
  const json = body != null && !(body instanceof FormData);
  const res = await fetch(url, {
    method,
    body: json ? JSON.stringify(body) : body,
    headers: json ? { 'content-type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.detail;
    throw new Error(typeof detail === 'string' ? detail : 'Algo deu errado. Tente de novo.');
  }
  return res.status === 204 ? null : res.json();
}

const form = (key, items) => {
  const fd = new FormData();
  for (const [blob, name] of items) fd.append(key, blob, name);
  return fd;
};

export const list = () => call('GET', '/api/recipes');
export const create = fields => call('POST', '/api/recipes', fields);
export const update = (id, fields) => call('PUT', `/api/recipes/${id}`, fields);
export const remove = id => call('DELETE', `/api/recipes/${id}`);
export const putMedia = (id, field, blob) => call('POST', `/api/recipes/${id}/media/${field}`, form('file', [[blob, field]]));
export const dropMedia = (id, field) => call('DELETE', `/api/recipes/${id}/media/${field}`);
export const importDocx = files => call('POST', '/api/import', form('files', [...files].map(f => [f, f.name])));

let timer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('is-on'), 3200);
}
