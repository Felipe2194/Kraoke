const CACHE_NAME = "kraoke-models-v1";

/**
 * Downloads a model file once and keeps it in the Cache API, so the
 * ~170 MB download only happens on the first visit.
 */
export async function fetchCached(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(url);
  if (hit) return hit.arrayBuffer();

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar el modelo (${res.status})`);
  const total = Number(res.headers.get("Content-Length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total || loaded);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  await cache.put(url, new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }));
  return bytes.buffer;
}
