'use strict';
const PARTS = ["model.part00", "model.part01", "model.part02", "model.part03", "model.part04", "model.part05", "model.part06", "model.part07"];
const SIZE = 153695702;
const MODEL = 'models/Xenova/clip-vit-base-patch32/onnx/';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const base = new URL(MODEL, self.registration.scope);
  if (event.request.url !== new URL('model_quantized.onnx', base).href) return;
  event.respondWith((async () => {
    const cache = await caches.open('travel-clip-0898a3facfdb');
    let index = 0, reader = null;
    const body = new ReadableStream({
      async pull(controller) {
        try {
          while (true) {
            if (!reader) {
              if (index === PARTS.length) { controller.close(); return; }
              const url = new URL(PARTS[index++], base).href;
              let response = await cache.match(url);
              if (!response) {
                response = await fetch(url);
                if (!response.ok) throw new Error('Model part unavailable: ' + response.status);
                try { await cache.put(url, response.clone()); } catch {}
              }
              reader = response.body.getReader();
            }
            const {done, value} = await reader.read();
            if (done) { reader.releaseLock(); reader = null; continue; }
            controller.enqueue(value); return;
          }
        } catch (error) { controller.error(error); }
      },
      cancel() { return reader?.cancel(); }
    });
    return new Response(body, {headers: {'Content-Type':'application/octet-stream', 'Content-Length':String(SIZE)}});
  })());
});
