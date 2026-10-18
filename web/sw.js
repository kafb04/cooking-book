// Guarda a "casca" do app (HTML, CSS, JS, fontes) pra abrir rápido e funcionar como app instalado.
// Receitas e fotos (/api, /media) nunca ficam aqui: continuam atrás do cadeado, sempre direto do servidor.
const CACHE = 'livro-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return;
  // rede primeiro (pega sempre a versão nova); sem internet, usa a última cópia
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request)));
});
