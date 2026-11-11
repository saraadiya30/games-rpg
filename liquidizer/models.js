export const TRANSFORMERS_PKG = '@huggingface/transformers';
export const TRANSFORMERS_VERSION = '3.3.3';
export const TRANSFORMERS_URL = `https://cdn.jsdelivr.net/npm/${TRANSFORMERS_PKG}@${TRANSFORMERS_VERSION}`;
export const TRANSFORMERS_BYTES = 820359;
export const TRANSFORMERS_DL = 207824;

export const GIFENC_VERSION = '1.0.3';
export const GIFENC_URL = `https://cdn.jsdelivr.net/npm/gifenc@${GIFENC_VERSION}/dist/gifenc.esm.js`;
export const GIFENC_BYTES = 9098;
export const GIFENC_DL = 3926;

export const MEDIABUNNY_VERSION = '1.56.3';
export const MEDIABUNNY_URL = `https://esm.sh/mediabunny@${MEDIABUNNY_VERSION}`;
export const MEDIABUNNY_BYTES = 690819;
export const MEDIABUNNY_DL = 177446;

export const ORT_VERSION = '1.21.0-dev.20250206-d981b153d3';
export const ORT_BYTES = 23013109 + 49241;
export const ORT_DL = 4458795 + 49241;

export const DEPTH_MODEL = {
  id: 'depth',
  label: 'Depth Anything V2 Small',
  repo: 'onnx-community/depth-anything-v2-small',
  revision: '4472b7362082ad9968fee890ca0f1e5aca36b93d',
  dtype: 'q8',
  device: 'wasm',
  license: 'Apache-2.0',
  task: 'depth-estimation',
  file: 'onnx/model_quantized.onnx',
  bytes: 27258801,
  dl: 21627097,
  meta: ['config.json', 'preprocessor_config.json', 'quantize_config.json'],
  note: 'A per-pixel depth map makes the 3D mode a true multi-plane parallax instead of a ' +
        'subject/background split, and lets the depth bands become layers.',
};

export const OWN_FILES = ['app.js', 'engine.js', 'exporter.js', 'presets.js', 'zip.js',
  'worker.js', 'models.js', 'model-worker.js', 'asset-cache.js'];

export const LIBS = [
  {
    id: 'media', pkg: 'mediabunny', version: MEDIABUNNY_VERSION,
    size: MEDIABUNNY_BYTES, dl: MEDIABUNNY_DL,
    label: 'mediabunny', purpose: 'MP4 / WebM encoding (H.264 + VP9)',
    when: 'first video export', url: MEDIABUNNY_URL, pref: 'videoLib',
    fallback: 'MediaRecorder (lower quality, renders in real time)',
  },
  {
    id: 'gif', pkg: 'gifenc', version: GIFENC_VERSION,
    size: GIFENC_BYTES, dl: GIFENC_DL,
    label: 'gifenc', purpose: 'GIF encoding', when: 'first GIF export',
    url: GIFENC_URL, pref: null,
    fallback: 'none needed — 9KB, and GIF is the only GIF exporter',
  },
  {
    id: 'transformers', pkg: TRANSFORMERS_PKG, version: TRANSFORMERS_VERSION,
    size: TRANSFORMERS_BYTES, dl: TRANSFORMERS_DL,
    label: '@huggingface/transformers', purpose: 'runs the ONNX models (AI depth; the image generator’s background removal shares it)',
    when: 'first AI depth computation', url: TRANSFORMERS_URL, pref: 'models',
    fallback: 'the heuristic depth analysis (no download at all)',
  },
  {
    id: 'ort', pkg: 'onnxruntime-web', version: ORT_VERSION,
    size: ORT_BYTES, dl: ORT_DL, label: 'onnxruntime-web',
    purpose: 'the wasm inference engine transformers.js drives',
    when: 'first AI depth computation', url: null, pref: 'models',
    fallback: 'the heuristic depth analysis',
  },
  {
    id: 'depthModel', pkg: DEPTH_MODEL.repo, version: DEPTH_MODEL.revision.slice(0, 10),
    size: DEPTH_MODEL.bytes, dl: DEPTH_MODEL.dl, label: DEPTH_MODEL.label + ' (q8 ONNX)',
    purpose: 'per-pixel depth for the 3D mode and the depth layers',
    when: 'first AI depth computation', url: null, pref: 'models', cached: true,
    fallback: 'the heuristic depth analysis (no download at all)',
  },
];

export const PREF_KEY = 'liquidizerPrefs.v1';
export const PREF_KEY_LEGACY = 'motionStudioPrefs.v1';
export const DEFAULT_PREFS = { models: false, videoLib: true, theme: 'dark' };

export function readPrefsSync() {
  try {
    const raw = localStorage.getItem(PREF_KEY) || localStorage.getItem(PREF_KEY_LEGACY);
    if (!raw) return Object.assign({}, DEFAULT_PREFS);
    return Object.assign({}, DEFAULT_PREFS, JSON.parse(raw) || {});
  } catch (_) { return Object.assign({}, DEFAULT_PREFS); }
}

export async function loadPrefs(store) {
  const local = readPrefsSync();
  if (!store) return local;
  try {
    const saved = await store.get('prefs');
    if (saved && typeof saved === 'object') return Object.assign({}, DEFAULT_PREFS, local, saved);
  } catch (_) {   }
  return local;
}

export async function savePrefs(store, prefs) {
  const clean = Object.assign({}, DEFAULT_PREFS, prefs);
  try { localStorage.setItem(PREF_KEY, JSON.stringify(clean)); } catch (_) {   }
  if (store) { try { await store.set('prefs', clean); } catch (_) {   } }
  return clean;
}

let tfPromise = null;

export function transformers() {
  if (!tfPromise) {
    tfPromise = import(TRANSFORMERS_URL).then(tf => {
      tf.env.allowLocalModels = false;
      try {
        tf.env.backends.onnx.wasm.proxy = true;
        tf.env.backends.onnx.wasm.numThreads = 1;
      } catch (_) {   }
      return tf;
    });
  }
  return tfPromise;
}

function makeProgress(onProgress) {
  const expected = DEPTH_MODEL.bytes + 4000;
  const seen = new Map();
  let lastP = 0;
  return (info) => {
    if (!info || !onProgress) return;
    if (info.status === 'progress' && info.file) {
      const loaded = Math.max(seen.get(info.file) || 0, info.loaded || 0);
      seen.set(info.file, loaded);
      let done = 0;
      for (const v of seen.values()) done += v;
      const p = 0.35 + 0.6 * Math.min(1, done / expected);
      if (p > lastP + 0.004) {
        lastP = p;
        onProgress(p, `downloading ${info.file.replace(/^.*\//, '')} — ${(loaded / 1048576).toFixed(1)}MB`);
      }
      return;
    }
    if (info.status === 'ready') { lastP = 0.99; onProgress(0.99, 'starting the model'); }
  };
}

let depthPipe = null;
let depthPipePromise = null;

async function depthPipeline(onProgress) {
  if (depthPipe) return depthPipe;
  if (!depthPipePromise) {
    const tf = await transformers();
    depthPipePromise = tf.pipeline(DEPTH_MODEL.task, DEPTH_MODEL.repo, {
      dtype: DEPTH_MODEL.dtype,
      device: DEPTH_MODEL.device,
      progress_callback: makeProgress(onProgress),
    }).then(p => { depthPipe = p; return p; }).catch(err => { depthPipePromise = null; throw err; });
  }
  return await depthPipePromise;
}

function resampleField(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * yr - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * xr - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(sw - 1, x0 + 1), fx = sx - x0;
      const a = src[y0 * sw + x0], b = src[y0 * sw + x1], c = src[y1 * sw + x0], d = src[y1 * sw + x1];
      out[y * dw + x] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
  }
  return out;
}

function normalizeDepth(values) {
  const n = values.length;
  const hist = new Uint32Array(4096);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const v = values[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo)) return new Float32Array(n);
  const inv = 4095 / (hi - lo);
  for (let i = 0; i < n; i++) hist[((values[i] - lo) * inv) | 0]++;
  const q = (frac) => {
    let acc = 0; const target = frac * n;
    for (let b = 0; b < hist.length; b++) { acc += hist[b]; if (acc >= target) return lo + (b / 4095) * (hi - lo); }
    return hi;
  };
  const q0 = q(0.02), q1 = q(0.995);
  const span = Math.max(1e-6, q1 - q0);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (values[i] - q0) / span;
    out[i] = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  return out;
}

export async function computeDepth(pixels, onProgress, isCancelled) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (onProgress) onProgress(0.02, 'loading the runtime (~5MB)');
  const tf = await transformers();
  if (onProgress && !depthPipe) onProgress(0.3, 'loading the runtime');
  const pipe = await depthPipeline(onProgress);
  if (isCancelled && isCancelled()) return null;
  const { data, w, h } = pixels;
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data.buffer ? data : new Uint8ClampedArray(data)), w, h), 0, 0);
  const image = tf.RawImage ? tf.RawImage.fromCanvas(canvas) : canvas;
  if (onProgress) onProgress(0.997, 'running the model');
  const out = await pipe(image);
  if (isCancelled && isCancelled()) return null;
      const dep = out && (out.depth || out.predicted_depth);
  if (!dep || !dep.data) throw new Error('the model returned no depth map');
  const raw = dep.data;
  const u8 = raw instanceof Uint8Array || raw instanceof Uint8ClampedArray;
  const vals = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) vals[i] = u8 ? raw[i] / 255 : raw[i];
  const dw = dep.width || (dep.dims ? dep.dims[1] : w);
  const dh = dep.height || (dep.dims ? dep.dims[0] : h);
    const field = (dw === w && dh === h) ? vals : resampleField(vals, dw, dh, w, h);
  const norm = normalizeDepth(field);
  let sum = 0, mn = Infinity, mx = -Infinity, near = 0;
  for (let i = 0; i < norm.length; i++) {
    const v = norm[i]; sum += v; if (v < mn) mn = v; if (v > mx) mx = v; if (v > 0.6) near++;
  }
  const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  if (onProgress) onProgress(1, 'done');
  return {
    data: norm, w, h, ms,
    stats: { min: mn, max: mx, mean: sum / norm.length, nearFrac: near / norm.length, raw: [dw, dh] },
  };
}

export async function cachedBytes(hint) {
  if (typeof caches === 'undefined') return { available: false, bytes: 0, files: [] };
  const files = [];
  let bytes = 0;
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const url = req.url;
        if (hint && url.indexOf(hint) === -1 && url.indexOf('huggingface') === -1 && url.indexOf('hf.co') === -1) continue;
        let size = 0;
        try { const res = await cache.match(req); if (res) size = (await res.clone().blob()).size; } catch (_) {   }
        bytes += size;
        files.push({ url, bytes: size, cache: name });
      }
    }
  } catch (_) { return { available: false, bytes: 0, files: [] }; }
  return { available: true, bytes, files };
}

async function headBytes(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    if (res.body && res.body.cancel) { const b = await res.clone().arrayBuffer(); res.body.cancel().catch(() => {}); return b.byteLength; }
    return (await res.arrayBuffer()).byteLength;
  } catch (_) { return null; }
}

async function npmLatest(pkg) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg.replace('/', '%2F')}/latest`);
    if (!res.ok) return null;
    const j = await res.json();
    return { version: j.version, unpacked: j.dist && j.dist.unpackedSize };
  } catch (_) { return null; }
}

export async function checkUpdates(onStep) {
  const step = (s) => { if (onStep) onStep(s); };
  const out = { libs: [], model: null, checkedAt: Date.now(), errors: [] };

  for (const lib of LIBS) {
    if (!lib.pkg || lib.pkg === DEPTH_MODEL.repo) continue;
    step('checking ' + lib.label);
    const latest = await npmLatest(lib.pkg);
    if (!latest) { out.errors.push(lib.label); out.libs.push({ id: lib.id, pinned: lib.version, error: true }); continue; }
    const entry = { id: lib.id, label: lib.label, pinned: lib.version, latest: latest.version, changed: latest.version !== lib.version };
        if (entry.changed) {
      try {
        if (lib.id === 'media') {
          const r = await fetch(`https://esm.sh/mediabunny@${latest.version}`);
          const txt = await r.text();
          const m = txt.match(/["']([^"']+\.mjs)["']/);
          if (m) entry.latestBytes = await headBytes(new URL(m[1], `https://esm.sh/mediabunny@${latest.version}`).href);
          if (!entry.latestBytes) entry.latestBytes = (await r.clone().arrayBuffer()).byteLength;
        } else if (lib.id === 'gif') {
          entry.latestBytes = await headBytes(`https://cdn.jsdelivr.net/npm/gifenc@${latest.version}/dist/gifenc.esm.js`);
        }
      } catch (_) {   }
    }
    out.libs.push(entry);
  }

  step('checking the depth model');
  try {
    const res = await fetch(`https://huggingface.co/api/models/${DEPTH_MODEL.repo}?blobs=true`);
    const j = await res.json();
    const fileRow = (j.siblings || []).find(s => s.rfilename === DEPTH_MODEL.file);
    const metaBytes = (j.siblings || [])
      .filter(s => DEPTH_MODEL.meta.indexOf(s.rfilename) !== -1)
      .reduce((a, s) => a + (s.size || 0), 0);
    out.model = {
      repo: DEPTH_MODEL.repo, file: DEPTH_MODEL.file,
      pinnedRevision: DEPTH_MODEL.revision, latestRevision: j.sha,
      changed: j.sha !== DEPTH_MODEL.revision,
      latestBytes: fileRow ? fileRow.size : null,
      latestMetaBytes: metaBytes,
    };
  } catch (_) { out.errors.push('depth model'); out.model = { repo: DEPTH_MODEL.repo, error: true }; }

  step('done');
  return out;
}
