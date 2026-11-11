export const ASSET_CACHE = 'liquidizer-assets-v1';

function api() {
  try { return typeof caches === 'undefined' ? null : caches; } catch (_) { return null; }
}

async function open() {
  const c = api();
  if (!c) return null;
  try { return await c.open(ASSET_CACHE); } catch (_) { return null; }
}

function external(url) {
  try { return new URL(url, location.href).origin !== location.origin; } catch (_) { return false; }
}

export async function match(url) {
  if (!external(url)) return null;
  const cache = await open();
  if (!cache) return null;
  try { return (await cache.match(url)) || null; } catch (_) { return null; }
}

async function keep(url, res) {
  if (!res || !res.ok || res.type === 'opaque' || !external(url)) return false;
  const cache = await open();
  if (!cache) return false;
  try { await cache.put(url, res.clone()); return true; } catch (_) { return false; }
}

export async function fetchCached(url, opts = {}) {
  if (!opts.fresh) {
    const hit = await match(url);
    if (hit) return hit;
  }
  const res = await fetch(url, opts.fetchOptions);
  await keep(url, res);
  return res;
}

export async function fetchBlob(url, opts) {
  const res = await fetchCached(url, opts);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.blob();
}

export async function entries() {
  const cache = await open();
  const out = [];
  if (!cache) return out;
  try {
    for (const req of await cache.keys()) {
      let bytes = 0;
      try { const r = await cache.match(req); if (r) bytes = (await r.clone().blob()).size; } catch (_) {   }
      out.push({ url: req.url, bytes });
    }
  } catch (_) {   }
  return out;
}

export async function totalBytes() {
  return (await entries()).reduce((a, e) => a + e.bytes, 0);
}

export async function clear() {
  let bytes = 0;
  try { bytes = await totalBytes(); } catch (_) {   }
  const c = api();
  if (c) { try { await c.delete(ASSET_CACHE); } catch (_) {   } }
  return bytes;
}
