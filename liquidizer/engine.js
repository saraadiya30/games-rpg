export const TWO_PI = Math.PI * 2;

export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function smoothstep(e0, e1, x) {
  const d = e1 - e0;
  const t = clamp01(d === 0 ? 0 : (x - e0) / d);
  return t * t * (3 - 2 * t);
}

export function boxBlur(src, w, h, r) {
  const N = w * h;
  const tmp = new Float32Array(N);
  const out = new Float32Array(N);
  const div = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + (i < 0 ? 0 : i >= w ? w - 1 : i)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / div;
      const xa = x + r + 1, xb = x - r;
      sum += src[row + (xa >= w ? w - 1 : xa)] - src[row + (xb < 0 ? 0 : xb)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[(i < 0 ? 0 : i >= h ? h - 1 : i) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / div;
      const ya = y + r + 1, yb = y - r;
      sum += tmp[(ya >= h ? h - 1 : ya) * w + x] - tmp[(yb < 0 ? 0 : yb) * w + x];
    }
  }
  return out;
}

export function quantile(arr, p) {
  const n = arr.length;
  if (!n) return 0;
  const step = Math.max(1, Math.floor(n / 6000));
  const vals = [];
  for (let i = 0; i < n; i += step) vals.push(arr[i]);
  vals.sort((a, b) => a - b);
  return vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))];
}

export function stretch(arr, t0, t1) {
  const out = new Float32Array(arr.length);
  const inv = 1 / Math.max(1e-5, t1 - t0);
  for (let i = 0; i < arr.length; i++) out[i] = clamp01((arr[i] - t0) * inv);
  return out;
}

export function makeCxProfile(w) {
  const p = new Float32Array(w);
  for (let x = 0; x < w; x++) p[x] = Math.sin(TWO_PI * x / Math.max(1, w - 1));
  return p;
}

export function downsampleRGBA(src, w, h, aw, ah) {
  const out = new Uint8ClampedArray(aw * ah * 4);
  const sx = w / aw, sy = h / ah;
  for (let ay = 0; ay < ah; ay++) {
    const y0 = Math.floor(ay * sy), y1 = Math.max(y0 + 1, Math.min(h, Math.floor((ay + 1) * sy)));
    for (let ax = 0; ax < aw; ax++) {
      const x0 = Math.floor(ax * sx), x1 = Math.max(x0 + 1, Math.min(w, Math.floor((ax + 1) * sx)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        let o = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++, o += 4) { r += src[o]; g += src[o + 1]; b += src[o + 2]; a += src[o + 3]; n++; }
      }
      const o = (ay * aw + ax) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return out;
}

export function upsampleField(src, aw, ah, w, h) {
  const out = new Float32Array(w * h);
  const sx = aw / w, sy = ah / h;
  const awm = aw - 1, ahm = ah - 1;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) * sy - 0.5;
    let y0 = Math.floor(v), fy = v - y0;
    if (y0 < 0) { y0 = 0; fy = 0; } else if (y0 > ahm) { y0 = ahm; fy = 0; }
    const y1 = y0 < ahm ? y0 + 1 : y0;
    const row0 = y0 * aw, row1 = y1 * aw, row = y * w;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) * sx - 0.5;
      let x0 = Math.floor(u), fx = u - x0;
      if (x0 < 0) { x0 = 0; fx = 0; } else if (x0 > awm) { x0 = awm; fx = 0; }
      const x1 = x0 < awm ? x0 + 1 : x0;
      const a = src[row0 + x0], b = src[row0 + x1];
      const c = src[row1 + x0], d = src[row1 + x1];
      out[row + x] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    }
  }
  return out;
}

export function kmeansColours(pts, K, iters = 8) {
  const n = pts.length / 3;
  const cents = new Float32Array(K * 3);
  if (n === 0) return cents;
  for (let k = 0; k < K; k++) {
    const src = Math.min(n - 1, Math.floor((k + 0.5) * n / K)) * 3;
    cents[k * 3] = pts[src]; cents[k * 3 + 1] = pts[src + 1]; cents[k * 3 + 2] = pts[src + 2];
  }
  const sum = new Float64Array(K * 4);
  for (let it = 0; it < iters; it++) {
    sum.fill(0);
    for (let p = 0; p < n; p++) {
      const o = p * 3;
      let best = 0, bd = Infinity;
      for (let k = 0; k < K; k++) {
        const dr = pts[o] - cents[k * 3], dg = pts[o + 1] - cents[k * 3 + 1], db = pts[o + 2] - cents[k * 3 + 2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = k; }
      }
      sum[best * 4] += pts[o]; sum[best * 4 + 1] += pts[o + 1]; sum[best * 4 + 2] += pts[o + 2]; sum[best * 4 + 3]++;
    }
    for (let k = 0; k < K; k++) {
      const c = sum[k * 4 + 3];
      if (c > 0) {
        cents[k * 3] = sum[k * 4] / c; cents[k * 3 + 1] = sum[k * 4 + 1] / c; cents[k * 3 + 2] = sum[k * 4 + 2] / c;
      }
    }
  }
  return cents;
}

export function nearestColour(r, g, b, cents) {
  let bd = Infinity;
  for (let k = 0; k < cents.length; k += 3) {
    const dr = r - cents[k], dg = g - cents[k + 1], db = b - cents[k + 2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) bd = d;
  }
  return Math.sqrt(bd);
}

const CHROMA_LUMA = 0.45;

export function featOf(src, i) {
  const o = i << 2;
  const r = src[o], g = src[o + 1], b = src[o + 2];
  const L = (r + g + b) / 3;
  return [L * CHROMA_LUMA, r - L, g - L];
}

function pushFeat(out, src, i) {
  const o = i << 2;
  const r = src[o], g = src[o + 1], b = src[o + 2];
  const L = (r + g + b) / 3;
  out.push(L * CHROMA_LUMA, r - L, g - L);
}

function sampleBorder(src, w, h, ring) {
  const out = [];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (x < ring || x >= w - ring || y < ring || y >= h - ring) pushFeat(out, src, row + x);
    }
  }
  return out;
}

function connectedComps(flag, w, h, bias) {
  const N = w * h;
  const label = new Uint8Array(N);
  const stack = new Int32Array(N);
  const comps = [];
  for (let i0 = 0; i0 < N; i0++) {
    if (!flag[i0] || label[i0]) continue;
    let sp = 0;
    const idx = [];
    let area = 0, biasSum = 0;
    stack[sp++] = i0;
    label[i0] = 1;
    while (sp > 0) {
      const i = stack[--sp];
      idx.push(i);
      area++;
      biasSum += bias[i];
      const y = (i / w) | 0, x = i - y * w;
      if (x > 0 && flag[i - 1] && !label[i - 1]) { label[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && flag[i + 1] && !label[i + 1]) { label[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && flag[i - w] && !label[i - w]) { label[i - w] = 1; stack[sp++] = i - w; }
      if (y < h - 1 && flag[i + w] && !label[i + w]) { label[i + w] = 1; stack[sp++] = i + w; }
    }
    comps.push({ idx, area, biasSum });
  }
  return comps;
}

export function analyzeSubject(img, w, h, sens) {
  const N = w * h;
  const s = img;
  const minDim = Math.min(w, h);
  const luma = new Float32Array(N), lumaSq = new Float32Array(N), sat = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const o = i << 2;
    const r = s[o], g = s[o + 1], b = s[o + 2];
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    luma[i] = l; lumaSq[i] = l * l;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat[i] = mx > 6 ? (mx - mn) / mx : 0;
  }
  const rDetail = Math.max(1, Math.round(minDim * 0.018));
  const rFeat = Math.max(2, Math.round(minDim * 0.05));
  const rBlur = Math.max(2, Math.round(minDim * 0.045));
  const rFeather = Math.max(2, Math.round(minDim * 0.03));

  const mL = boxBlur(luma, w, h, rDetail);
  const mL2 = boxBlur(lumaSq, w, h, rDetail);
  const localStd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = mL2[i] - mL[i] * mL[i];
    localStd[i] = v > 0 ? Math.sqrt(v) : 0;
  }
  const grad = new Float32Array(N);
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const gx = luma[i + 1] - luma[i - 1];
      const gy = luma[i + w] - luma[i - w];
      grad[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  const edge = boxBlur(grad, w, h, rFeat);
  const tex = boxBlur(localStd, w, h, rFeat);
  const col = boxBlur(sat, w, h, rFeat);
  const nEdge = stretch(edge, quantile(edge, 0.45), quantile(edge, 0.985));
  const nTex = stretch(tex, quantile(tex, 0.45), quantile(tex, 0.985));
  const nCol = stretch(col, quantile(col, 0.45), quantile(col, 0.985));

    const cx = (w - 1) / 2, cy = (h - 1) / 2, rx = w * 0.62, ry = h * 0.62;
  const bias = new Float32Array(N);
  for (let y = 0; y < h; y++) {
    const ndy = (y - cy) / ry, row = y * w;
    for (let x = 0; x < w; x++) {
      const ndx = (x - cx) / rx;
      bias[row + x] = 0.72 * Math.exp(-0.5 * (ndx * ndx + ndy * ndy)) + 0.28;
    }
  }

              const ring = Math.max(2, Math.round(minDim * 0.06));
  const cRx = w * 0.36, cRy = h * 0.36;
  const bgC = kmeansColours(sampleBorder(s, w, h, ring), 5);
  const centreIdx = [];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const u = (x - cx) / cRx, v = (y - cy) / cRy;
      if (u * u + v * v <= 1 && !(x < ring || x >= w - ring || y < ring || y >= h - ring)) centreIdx.push(row + x);
    }
  }
      const centreDbg = new Float32Array(centreIdx.length);
  for (let k = 0; k < centreIdx.length; k++) centreDbg[k] = nearestColour(...featOf(s, centreIdx[k]), bgC);
  const dbgThr = quantile(centreDbg, 0.4);
  const fgPts = [];
  for (let k = 0; k < centreIdx.length; k++) {
    if (centreDbg[k] >= dbgThr) pushFeat(fgPts, s, centreIdx[k]);
  }
  const fgC = kmeansColours(fgPts.length >= 30 ? fgPts : sampleBorder(s, w, h, ring), 5);
  const contrast = new Float32Array(N);
  const inv255 = 1 / 255;
  for (let i = 0; i < N; i++) {
    const f = featOf(s, i);
    contrast[i] = (nearestColour(...f, bgC) - nearestColour(...f, fgC)) * inv255;
  }
  const cq50 = quantile(contrast, 0.5), cq90 = quantile(contrast, 0.9);
  const colourOn = (cq90 - cq50) > 0.022;
  const colourScore = new Float32Array(N);
  if (colourOn) {
    for (let i = 0; i < N; i++) colourScore[i] = smoothstep(cq50, cq90, contrast[i]);
  }

    const sal = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    sal[i] = (0.30 * nEdge[i] + 0.34 * nTex[i] + 0.10 * nCol[i]) * (0.7 + 0.3 * bias[i]);
  }
  const salB = boxBlur(sal, w, h, rBlur);
  const sq0 = quantile(salB, 0.5), sq1 = quantile(salB, 0.975);
  const salFlat = (sq1 - sq0) < 0.004;
  const salScore = new Float32Array(N);
  if (!salFlat) {
    for (let i = 0; i < N; i++) salScore[i] = smoothstep(sq0, sq1, salB[i]);
  }

    const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    raw[i] = colourOn ? Math.max(colourScore[i], salFlat ? 0 : 0.72 * salScore[i]) : salScore[i];
  }
  const bs0 = boxBlur(raw, w, h, rFeather);
  const thr = 0.5 - 0.22 * sens;
  const salFlag = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (bs0[i] > thr) salFlag[i] = 1;

  const cand = connectedComps(salFlag, w, h, bias);
  cand.sort((a, b) => (b.area * (0.55 + b.biasSum / b.area)) - (a.area * (0.55 + a.biasSum / a.area)));
  const region = new Uint8Array(N);
  let area = 0, kept = 0;
  if (cand.length) {
    const minArea = Math.max(0.015 * N, cand[0].area * 0.25);
    for (const c of cand) {
      if (kept > 0 && c.area < minArea) continue;
      if (c.area < 0.0025 * N) continue;
      const idx = c.idx;
      for (let k = 0; k < idx.length; k++) region[idx[k]] = 1;
      area += c.area;
      if (++kept >= 6) break;
    }
  }
  const fallback = area < 0.02 * N || !colourOn && salFlat;
  if (fallback) { region.fill(1); area = N; }

    const outside = new Uint8Array(N);
  const q2 = new Int32Array(N);
  let qt2 = 0;
  const seedOut = i => { if (!outside[i] && !region[i]) { outside[i] = 1; q2[qt2++] = i; } };
  for (let x = 0; x < w; x++) { seedOut(x); seedOut((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seedOut(y * w); seedOut(y * w + w - 1); }
  for (let qh = 0; qh < qt2; qh++) {
    const i = q2[qh];
    const y = (i / w) | 0, x = i - y * w;
    if (x > 0) seedOut(i - 1);
    if (x < w - 1) seedOut(i + 1);
    if (y > 0) seedOut(i - w);
    if (y < h - 1) seedOut(i + w);
  }
  for (let i = 0; i < N; i++) if (!outside[i]) region[i] = 1;

  const regionF = new Float32Array(N);
  for (let i = 0; i < N; i++) regionF[i] = region[i];
  const bs = boxBlur(regionF, w, h, rFeather);
  const soft = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = smoothstep(0.3, 0.72, bs[i]);
    soft[i] = v * (0.7 + 0.3 * bias[i]);
  }

  const rowSum = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let rs = 0;
    for (let x = 0; x < w; x++) rs += soft[row + x];
    rowSum[y] = rs;
  }
  let maxRS = 0;
  for (let y = 0; y < h; y++) if (rowSum[y] > maxRS) maxRS = rowSum[y];
  let top = 0, bot = h - 1;
  if (maxRS > 0) {
    const rt = maxRS * 0.22;
    while (top < h - 1 && rowSum[top] < rt) top++;
    while (bot > top && rowSum[bot] < rt) bot--;
  }
  return { soft, luma, bias, fallback, top, bot, bh: Math.max(2, bot - top + 1), subjectFrac: area / N };
}

export const MODES = [
  { id: 'none', label: 'None', hint: 'no motion — the picture sits still. Pick an effect when you want it to move.' },
  { id: 'breathing', label: 'Breathing', hint: 'rise and fall, with an optional chest puff' },
  { id: 'wave', label: 'Wave', hint: 'a travelling ripple across the image' },
  { id: 'flow', label: 'Flow', hint: 'directional drift — hair, water, smoke' },
  { id: 'flames', label: 'Flames', hint: 'a rising plume — the tongues lick upward and never fold back down' },
  { id: 'sway', label: 'Sway', hint: 'rotation around a pivot you pick' },
  { id: 'zoom', label: 'Zoom', hint: 'breathe in and out around a focus point' },
  { id: 'depth', label: '3D', hint: 'parallax dolly — the subject moves against the background. Compute AI depth below, or split the picture into depth layers' },
];

export const MODE_IDS = MODES.map(m => m.id);
export const isMode = id => MODE_IDS.indexOf(id) !== -1;

export const MAX_LAYERS = 4;

export const LAYER_PARAMS = {
  ampFrac: 0.022,
  speed: 1,
  waveFreq: 2.5,
  chestOn: true,
  chestAmt: 0.5,
  flowDir: -20,
  flowFreq: 2,
  flowRamp: 0.6,
  flameFlicker: 0.55,
  flameSpread: 0.5,
  flameSway: 0.45,
  swayPivotX: 0.5,
  swayPivotY: 1,
  zoomFocusX: 0.5,
  zoomFocusY: 0.45,
  zoomDir: 1,
  depthAmount: 0.5,
  depthPan: 0.5,
  depthBias: 0.5,
};
export const LAYER_PARAM_KEYS = Object.keys(LAYER_PARAMS);

export const LAYER_VIEW_KEYS = ['mode', 'maskSource'].concat(LAYER_PARAM_KEYS);

export const MAX_LAYER_CYCLES = 6;

export const MIN_TEMPO = 0.25;
export const MAX_TEMPO = 4;

export function layerCycles(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? clamp(n, 1, MAX_LAYER_CYCLES) : 1;
}

export function normalizeTempo(v) {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, MIN_TEMPO, MAX_TEMPO) : 1;
}

let layerSeq = 0;

export function makeLayer(name, mode, params) {
  const p = {};
  for (const k of LAYER_PARAM_KEYS) p[k] = params && params[k] !== undefined ? params[k] : LAYER_PARAMS[k];
  p.speed = layerCycles(p.speed);
  return {
    name: name || ('Layer ' + layerSeq),
    on: true,
    mode: isMode(mode) ? mode : 'none',
    opacity: 1,
    maskSource: 'auto',
    params: p,
  };
}

export function normalizeLayer(l, index) {
  if (!l || typeof l !== 'object') return makeLayer('Layer ' + (index + 1), 'none');
  const o = makeLayer(
    typeof l.name === 'string' && l.name.trim() ? l.name.trim().slice(0, 18) : ('Layer ' + (index + 1)),
    l.mode,
    l.params || l,
  );
  o.on = l.on !== false;
  o.opacity = typeof l.opacity === 'number' ? clamp01(l.opacity) : 1;
  o.maskSource = l.maskSource === 'manual' ? 'manual' : 'auto';
  return o;
}

export function installLayerView(settings) {
  if (!Array.isArray(settings.layers) || !settings.layers.length) settings.layers = [makeLayer('Layer 1', 'none')];
  settings.layers = settings.layers.slice(0, MAX_LAYERS).map((l, i) => normalizeLayer(l, i));
  const n = settings.layers.length;
  settings.activeLayer = clamp(typeof settings.activeLayer === 'number' ? settings.activeLayer | 0 : 0, 0, n - 1);
  settings.timelineSpeed = normalizeTempo(settings.timelineSpeed);
        normalizeGlitch(settings);
  normalizeGlow(settings);
  normalizeParticles(settings);
  for (const k of LAYER_VIEW_KEYS) {
    const d = Object.getOwnPropertyDescriptor(settings, k);
    if (d && d.get) continue;
    Object.defineProperty(settings, k, {
      enumerable: true,
      configurable: true,
      get() {
        const l = this.layers[this.activeLayer] || this.layers[0];
        if (!l) return k === 'mode' ? 'none' : (LAYER_PARAMS[k] !== undefined ? LAYER_PARAMS[k] : 'manual');
        if (k === 'mode') return l.mode;
        if (k === 'maskSource') return l.maskSource;
        return l.params[k];
      },
      set(v) {
        const l = this.layers[this.activeLayer] || this.layers[0];
        if (!l) return;
        if (k === 'mode') { if (isMode(v)) l.mode = v; }
        else if (k === 'maskSource') l.maskSource = v === 'auto' ? 'auto' : 'manual';
        else if (k === 'speed') l.params[k] = layerCycles(v);
        else l.params[k] = v;
      },
    });
  }
  return settings;
}

export function defaultSettings() {
  return installLayerView({
    layers: [makeLayer('Layer 1', 'none')],
    activeLayer: 0,
    timeline: 'loop',
    timelineSpeed: 1,
            glitch: makeGlitch(),
            glow: makeGlow(),
            particles: [],
    activeParticle: 0,
    autoSens: 0.5,
    brushMode: 'paint',
    brushSize: 44,
    brushFlow: 0.6,
    brushHardness: 0.5,
    brushSymmetry: false,
    transparent: false,
    seed: 1234567,
                depthSource: 'auto',
    depthPlanes: 6,
        depthBands: 3,
  });
}

export function layerList(s) {
  const src = Array.isArray(s.layers) && s.layers.length ? s.layers : [s];
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const l = src[i] || {};
    out.push({
      on: l.on !== false,
      mode: isMode(l.mode) ? l.mode : 'breathing',
      opacity: typeof l.opacity === 'number' ? clamp01(l.opacity) : 1,
      maskIndex: i,
      params: l.params || l,
    });
  }
  return out;
}

export function autoMaskProfile(mode, h, res) {
  const prof = new Float32Array(h);
  const topF = res.top / res.ah * h;
  const bhF = Math.max(2, res.bh / res.ah * h);
  const hm = Math.max(1, h - 1);
  if (mode === 'none') {
    return prof;
  } else if (mode === 'breathing') {
    const yc = topF + bhF * 0.58;
    const sigma = Math.max(2, bhF * 0.34);
    for (let y = 0; y < h; y++) { const d = (y - yc) / sigma; prof[y] = 0.2 + 0.8 * Math.exp(-0.5 * d * d); }
  } else if (mode === 'wave' || mode === 'zoom') {
    for (let y = 0; y < h; y++) {
      const t = clamp01((y - topF) / bhF);
      prof[y] = 0.3 + 0.7 * (t * t * (3 - 2 * t));
    }
  } else if (mode === 'flames') {
    for (let y = 0; y < h; y++) {
      const t = clamp01((y - topF) / bhF);
      prof[y] = 0.4 + 0.6 * (t * t * (3 - 2 * t));
    }
  } else if (mode === 'flow') {
    for (let y = 0; y < h; y++) {
      const fy = y / hm;
      prof[y] = 0.35 + 0.65 * smoothstep(1, 0.15, fy);
    }
  } else {
    for (let y = 0; y < h; y++) prof[y] = 1;
  }
  return prof;
}

export const GLITCH_PARAMS = {
  on: false,
  amount: 0.45,
  burst: 0.55,
  rate: 0.5,
          rgb: 0.35,
  blocks: 0.25,
  scan: 0.25,
  noise: 0.18,
  vhs: 0.22,
  sort: 0.12,
  crush: 0.18,
  trails: 0.18,
  seed: 48271,
};
export const GLITCH_KEYS = Object.keys(GLITCH_PARAMS);

export const GLITCH_EFFECTS = [
  { id: 'rgb', label: 'RGB split', hint: 'slides the red and blue channels apart, hardest inside a tear' },
  { id: 'blocks', label: 'Band shift', hint: 'datamosh: whole bands of rows slip sideways, or swap channels' },
  { id: 'scan', label: 'Scanlines', hint: 'CRT lines with a bright bar rolling down the frame' },
  { id: 'noise', label: 'Static', hint: 'analog snow in blocks and per pixel, plus the odd dropout line' },
  { id: 'vhs', label: 'VHS', hint: 'tape-tracking wobble that grows toward the bottom of the frame' },
  { id: 'sort', label: 'Pixel sort', hint: 'smears bright runs along a row, ordered by brightness' },
  { id: 'crush', label: 'Bit crush', hint: 'fewer colour levels, dithered so it reads as hardware' },
  { id: 'trails', label: 'Echo', hint: 'lets moving pixels leave a fading after-image' },
];

export const GLITCH_STYLES = [
  {
    id: 'subtle', label: 'Subtle',
    patch: { amount: 0.3, burst: 0.5, rate: 0.45, rgb: 0.35, blocks: 0.15, scan: 0.2, noise: 0.15, vhs: 0.18, sort: 0, crush: 0.15, trails: 0.25 },
  },
  {
    id: 'datamosh', label: 'Datamosh',
    patch: { amount: 0.65, burst: 0.8, rate: 0.35, rgb: 0.3, blocks: 0.7, scan: 0.1, noise: 0.12, vhs: 0.2, sort: 0, crush: 0.35, trails: 0.45 },
  },
  {
    id: 'vhs', label: 'VHS',
    patch: { amount: 0.6, burst: 0.3, rate: 0.3, rgb: 0.6, blocks: 0.3, scan: 0.65, noise: 0.45, vhs: 0.95, sort: 0.1, crush: 0.15, trails: 0.5 },
  },
  {
    id: 'brokentv', label: 'Broken TV',
    patch: { amount: 0.7, burst: 0.7, rate: 0.75, rgb: 0.7, blocks: 0.7, scan: 0.5, noise: 0.7, vhs: 0.55, sort: 0.25, crush: 0.45, trails: 0.4 },
  },
  {
    id: 'melt', label: 'Melt',
    patch: { amount: 0.65, burst: 0.45, rate: 0.25, rgb: 0.3, blocks: 0.45, scan: 0.05, noise: 0.12, vhs: 0.6, sort: 0.85, crush: 0.1, trails: 0.6 },
  },
];

export function makeGlitch() {
  const g = {};
  for (const k of GLITCH_KEYS) g[k] = GLITCH_PARAMS[k];
  return g;
}

export function normalizeGlitch(s) {
  const src = s.glitch && typeof s.glitch === 'object' ? s.glitch : {};
  const g = makeGlitch();
  for (const k of GLITCH_KEYS) if (typeof src[k] === 'number' && isFinite(src[k])) g[k] = src[k];
  g.on = src.on === true;
  g.amount = clamp(g.amount, 0, 1.6);
  g.burst = clamp01(g.burst);
  g.rate = clamp01(g.rate);
  for (const e of GLITCH_EFFECTS) g[e.id] = clamp01(g[e.id]);
  g.seed = (g.seed | 0) || GLITCH_PARAMS.seed;
  s.glitch = g;
  return s;
}

export const GLOW_PARAMS = {
  on: false,
  outline: 'subject',
  maskLayer: -1,
  style: 'run',
  color: '#45e0ff',
  color2: '#ffffff',
  amount: 0.85,
  reach: 0.055,
  softness: 0.45,
  speed: 1,
  seed: 7331,
};
export const GLOW_KEYS = Object.keys(GLOW_PARAMS);
export const GLOW_MAX_REPS = 4;

export const GLOW_OUTLINES = [
  { id: 'subject', label: 'Foreground object', hint: 'the outline of the subject the Auto mask found' },
  { id: 'mask', label: 'Layer mask', hint: 'the outline of one layer\u2019s mask \u2014 the Layer mask row picks which' },
];

export const GLOW_STYLES = [
  { id: 'run', label: 'Run around', hint: 'a hot spot travels around the outline and cools behind itself' },
  { id: 'pulse', label: 'Pulse', hint: 'the whole outline brightens and dims together' },
  { id: 'flicker', label: 'Neon', hint: 'sections of a failing tube stutter on and off, like a bad sign' },
  { id: 'rainbow', label: 'Rainbow', hint: 'the hue runs around the outline and drifts with time' },
  {
    id: 'fire', label: 'Fire',
    hint: 'flame tongues crawl along the outline, hot pale cores inside a deep orange bloom (sets a warm look to start from)',
    patch: { color: '#ff4d00', color2: '#fff3c4', softness: 0.34, reach: 0.09, amount: 1.5, speed: 1 },
  },
];

export function makeGlow() {
  const g = {};
  for (const k of GLOW_KEYS) g[k] = GLOW_PARAMS[k];
  return g;
}

export function normalizeGlow(s) {
  const src = s.glow && typeof s.glow === 'object' ? s.glow : {};
  const g = makeGlow();
  for (const k of GLOW_KEYS) if (typeof src[k] === 'number' && isFinite(src[k])) g[k] = src[k];
  g.on = src.on === true;
  g.outline = src.outline === 'mask' ? 'mask' : 'subject';
  g.style = GLOW_STYLES.some(st => st.id === src.style) ? src.style : GLOW_PARAMS.style;
  for (const c of ['color', 'color2']) if (typeof src[c] === 'string' && src[c]) g[c] = src[c];
  g.amount = clamp(g.amount, 0, 2);
  g.reach = clamp(g.reach, 0.008, 0.3);
  g.softness = clamp01(g.softness);
  const layers = Array.isArray(s.layers) && s.layers.length ? s.layers.length : 1;
  g.maskLayer = clamp(Math.round(g.maskLayer), -1, layers - 1);
  const reps = Math.round(g.speed);
  g.speed = Number.isFinite(reps) ? clamp(reps, 1, GLOW_MAX_REPS) : GLOW_PARAMS.speed;
  g.seed = (g.seed | 0) || GLOW_PARAMS.seed;
  s.glow = g;
  return s;
}

const REF_AREA = 512 * 342;
const MAX_PARTICLES = 900;
const P_DEG = Math.PI / 180;

export const PARTICLE_PARAMS = {
  amount: 1, size: 1, speed: 1, angle: -90, spread: 18, wind: 0.35, turb: 0.5,
  blur: 0.6, glow: 0.6, flash: 0, opacity: 0.85, blend: 'add',
  color: '#ffb15a', color2: '#ff3d00', depth: 1, behind: 0.3, seed: 1337,
};
export const PARTICLE_KEYS = Object.keys(PARTICLE_PARAMS);

export const PARTICLE_BLENDS = [
  { id: 'add', label: 'Add — glowing' },
  { id: 'screen', label: 'Screen — hazy light' },
  { id: 'normal', label: 'Normal — solid' },
];

export const FLASH_DEFAULTS = { rise: 0.0025, decay: 0.028, gain: 12, core: 5, size: 3, white: 0.9, cool: 0.65, scatter: 0.45 };

export const PARTICLE_KINDS = [
  {
    id: 'embers', label: 'Embers', hint: 'glowing motes that rise and cool behind them, with a comet trail',
    count: 130, trips: 1, form: 'glow', area: { x0: 0.20, y0: 0.60, x1: 0.80, y1: 0.94 }, sizeBase: 0.009, streak: 0.06,
    tilt: 12, sway: 0.030, swayFreq: 1.7, grow: 0, flicker: 0.45, gravity: 0.06,
    look: { spread: 22, wind: 0.45, turb: 0.6, blur: 0.75, glow: 1.0, opacity: 0.85, blend: 'add',
      color: '#ffcb6b', color2: '#ff3b00', behind: 0.35 },
  },
  {
                    id: 'flicker', label: 'Flicker embers',
    hint: 'embers that flare blindingly for an instant, then cool and fade back down',
    count: 110, trips: 1, form: 'glow', area: { x0: 0.20, y0: 0.60, x1: 0.80, y1: 0.94 }, sizeBase: 0.0085, streak: 0.05,
    tilt: 12, sway: 0.028, swayFreq: 1.6, grow: 0, flicker: 0, gravity: 0.05,
    look: { spread: 22, wind: 0.45, turb: 0.6, blur: 0.7, glow: 1.0, flash: 1, opacity: 0.8, blend: 'add',
      color: '#ffe9a8', color2: '#ff2f00', behind: 0.35 },
  },
  {
    id: 'smoke', label: 'Smoke', hint: 'slow soft plumes that grow as they drift up',
    count: 26, trips: 1, form: 'puff', area: { x0: 0.28, y0: 0.66, x1: 0.72, y1: 0.96 }, sizeBase: 0.055, streak: 0.012,
    tilt: 6, sway: 0.06, swayFreq: 0.6, grow: 0.7, flicker: 0,
    look: { spread: 26, speed: 0.55, wind: 0.55, turb: 1.0, blur: 0.1, glow: 0.15, opacity: 0.6,
      blend: 'screen', color: '#cdd3de', color2: '#40454f', behind: 0.85 },
  },
  {
    id: 'snow', label: 'Snow', hint: 'flakes falling and swaying, with near ones larger and brighter',
    count: 150, trips: 1, form: 'glow', area: { x0: 0.00, y0: 0.02, x1: 1.00, y1: 0.30 }, sizeBase: 0.008, streak: 0.02,
    tilt: 0, sway: 0.055, swayFreq: 2.2, grow: 0, flicker: 0.15,
    look: { angle: 90, spread: 10, speed: 0.8, wind: 0.5, turb: 0.7, blur: 0.25, glow: 0.15,
      opacity: 0.9, blend: 'normal', color: '#ffffff', color2: '#cfe0ff', behind: 0.5 },
  },
  {
    id: 'rain', label: 'Rain', hint: 'fast angled streaks — the motion blur is the streak',
    count: 320, trips: 2, form: 'streak', area: { x0: 0.00, y0: 0.01, x1: 1.00, y1: 0.22 }, sizeBase: 0.0015, streak: 0.16,
    tilt: 14, sway: 0.01, swayFreq: 1.2, grow: 0, flicker: 0,
    look: { angle: 76, spread: 13, speed: 1, wind: 0.2, turb: 0.1, blur: 1.05, glow: 0,
      opacity: 0.5, blend: 'screen', color: '#dceaff', color2: '#9dbcf0', behind: 0.55 },
  },
  {
    id: 'dust', label: 'Dust', hint: 'motes drifting through the light, in every direction',
    count: 130, trips: 1, form: 'glow', area: { x0: 0.14, y0: 0.30, x1: 0.86, y1: 0.72 }, sizeBase: 0.008, streak: 0.02,
    tilt: 10, sway: 0.075, swayFreq: 0.9, grow: 0, flicker: 0.25,
    look: { angle: -70, spread: 80, speed: 0.45, wind: 0.8, turb: 1.0, blur: 0.35, glow: 0.9,
      opacity: 0.85, blend: 'screen', color: '#ffe9c2', color2: '#8a7355', behind: 0.4 },
  },
  {
    id: 'sparks', label: 'Sparks', hint: 'white-hot glints that race outward, trailing a short tail',
    count: 150, trips: 3, form: 'spark', area: { x0: 0.22, y0: 0.55, x1: 0.78, y1: 0.90 }, sizeBase: 0.0055, streak: 0.075,
    tilt: 16, sway: 0.024, swayFreq: 1.4, grow: 0, flicker: 0.5, gravity: 0.16,
    look: { angle: -68, spread: 46, speed: 2.4, wind: 0.35, turb: 0.45, blur: 1.0, glow: 1.15,
      opacity: 1, blend: 'add', color: '#fff7dc', color2: '#ff4d00', behind: 0.15 },
  },
  {
    id: 'fireflies', label: 'Fireflies', hint: 'slow glows that wander in place and blink',
    count: 34, trips: 1, form: 'glow', area: { x0: 0.18, y0: 0.32, x1: 0.82, y1: 0.74 }, sizeBase: 0.016, streak: 0.012,
    tilt: 0, sway: 0.15, swayFreq: 0.5, grow: 0, flicker: 0.7,
    look: { spread: 180, speed: 0.3, wind: 1.0, turb: 1.2, blur: 0.15, glow: 1.2, opacity: 1,
      blend: 'add', color: '#e8ff8a', color2: '#2f5f14', behind: 0.6 },
  },
  {
    id: 'bubbles', label: 'Bubbles', hint: 'rings rising in a wobble, with a highlight',
    count: 60, trips: 1, form: 'ring', area: { x0: 0.25, y0: 0.60, x1: 0.75, y1: 0.95 }, sizeBase: 0.014, streak: 0.012,
    tilt: 5, sway: 0.045, swayFreq: 1.3, grow: 0.45, flicker: 0,
    look: { angle: -88, spread: 12, speed: 0.7, wind: 0.6, turb: 0.55, blur: 0.2, glow: 0.35,
      opacity: 0.85, blend: 'normal', color: '#d6f2ff', color2: '#7fc4e8', behind: 0.5 },
  },
];
export const MAX_EMITTERS = 4;

const KIND_BY_ID = {};
for (const k of PARTICLE_KINDS) KIND_BY_ID[k.id] = k;
const kindOf = id => KIND_BY_ID[id] || PARTICLE_KINDS[0];

export function kindArea(kindId) {
  const a = kindOf(kindId).area;
  if (!a) return { x0: 0.2, y0: 0.6, x1: 0.8, y1: 0.94 };
  return { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 };
}

export function makeEmitter(kindId, index) {
  const K = kindOf(kindId);
  const e = { on: true, kind: K.id, name: K.label + (index ? ' ' + (index + 1) : '') };
  for (const k of PARTICLE_KEYS) e[k] = K.look[k] !== undefined ? K.look[k] : PARTICLE_PARAMS[k];
  return e;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;
const hexOf = (v, dflt) => (typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : dflt);

export function normalizeEmitter(e, index) {
  const src = e && typeof e === 'object' ? e : {};
  const base = makeEmitter(src.kind, index);
  const o = { on: src.on !== false, kind: base.kind, name: base.name };
  for (const k of PARTICLE_KEYS) {
    const v = src[k];
    o[k] = typeof v === 'number' && isFinite(v) ? v : base[k];
  }
  o.amount = clamp(o.amount, 0, 3);
  o.size = clamp(o.size, 0.05, 4);
  o.speed = clamp(o.speed, 0.1, 4);
  o.angle = clamp(o.angle, -180, 180);
  o.spread = clamp(o.spread, 0, 90);
  o.wind = clamp(o.wind, 0, 2);
  o.turb = clamp(o.turb, 0, 2);
  o.blur = clamp(o.blur, 0, 1.5);
  o.glow = clamp(o.glow, 0, 1.5);
  o.opacity = clamp01(o.opacity);
      o.flash = clamp(o.flash, 0, 2);
  o.depth = clamp01(o.depth);
  o.behind = clamp01(o.behind);
  o.blend = PARTICLE_BLENDS.some(b => b.id === src.blend) ? src.blend : base.blend;
  o.color = hexOf(src.color, base.color);
  o.color2 = hexOf(src.color2, base.color2);
  o.seed = (o.seed | 0) || base.seed;
  if (typeof src.name === 'string' && src.name.trim()) o.name = src.name.trim().slice(0, 20);
  return o;
}

export function normalizeParticles(s) {
  const src = s && Array.isArray(s.particles) ? s.particles : [];
  s.particles = src.slice(0, MAX_EMITTERS).map((e, i) => normalizeEmitter(e, i));
  const n = s.particles.length;
  s.activeParticle = clamp(typeof s.activeParticle === 'number' ? s.activeParticle | 0 : 0, 0, Math.max(0, n - 1));
  return s;
}

export function particleCount(e, w, h) {
  const K = kindOf(e && e.kind);
  const amount = e && typeof e.amount === 'number' ? e.amount : 1;
  return clamp(Math.round(K.count * amount * (w * h) / REF_AREA), 1, MAX_PARTICLES);
}

const HEX_CACHE = new Map();
function hexRgb(hex) {
  const key = typeof hex === 'string' ? hex.toLowerCase() : '';
  const hit = HEX_CACHE.get(key);
  if (hit) return hit;
  let s = key.charAt(0) === '#' ? key.slice(1) : key;
  if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  const n = s.length === 6 ? parseInt(s, 16) : NaN;
  const v = Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
  HEX_CACHE.set(key, v);
  return v;
}

function h32(a, b, c) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35) ^ Math.imul(c, 0x27d4eb2d);
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491); h ^= h >>> 13;
  return h >>> 0;
}
const rnd01 = (a, b, c) => h32(a, b, c) / 4294967296;

function rgbHue(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return 0;
  let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hh /= 6;
  return hh < 0 ? hh + 1 : hh;
}

function hsvRgb(hh, ss, vv, out, off) {
  const i = (hh * 6) | 0;
  const f = hh * 6 - i;
  const p1 = vv * (1 - ss), p2 = vv * (1 - ss * f), p3 = vv * (1 - ss * (1 - f));
  let r, g, b;
  switch (i % 6) {
    case 0: r = vv; g = p3; b = p1; break;
    case 1: r = p2; g = vv; b = p1; break;
    case 2: r = p1; g = vv; b = p3; break;
    case 3: r = p1; g = p2; b = vv; break;
    case 4: r = p3; g = p1; b = vv; break;
    default: r = vv; g = p1; b = p2; break;
  }
  out[off] = r * 255; out[off + 1] = g * 255; out[off + 2] = b * 255;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function rowSample(T, rowBase, w, sx, c) {
  let x0 = Math.floor(sx);
  let a = sx - x0;
  if (x0 < 0) { x0 = 0; a = 0; } else if (x0 > w - 1) { x0 = w - 1; a = 0; }
  const x1 = x0 < w - 1 ? x0 + 1 : x0;
  const i0 = (rowBase + x0) * 4 + c, i1 = (rowBase + x1) * 4 + c;
  return T[i0] + (T[i1] - T[i0]) * a;
}

export class MotionEngine {
  constructor() {
    this.sw = 0; this.sh = 0;
    this.src = null; this.out = null;
    this.masks = [new Float32Array(0)];
    this.activeMask = 0;
    this.pmasks = [];
    this.maskTarget = { kind: 'layer', index: 0 };
    this.pSpawn = null;
    this.dx = null; this.dy = null; this.dw = null; this.lx = null; this.ly = null; this.warpSrc = null;
    this.subject = new Float32Array(0);
    this.depth = new Float32Array(0);
    this.depthVersion = 0;
    this.cxProf = new Float32Array(0);
    this.bg = null;
    this.analysis = null;
    this.lowImg = null;
    this.depthModel = null;
        this.gTmp = null; this.gTrail = null; this.gLastPhase = null;
    this.gBands = null; this.gLut = null; this.gRow = null; this.gKeys = null;
    this.glowCache = null; this.glowWheel = null; this.glowZones = null;
    this.glowFireH = null; this.glowFireO = null; this.glowFireV = null; this.glowFireW = null;
    this.glowNoiseCache = null;
  }

  setSource(rgba, w, h) {
    this.sw = w; this.sh = h;
    this.src = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
    this.out = new Uint8ClampedArray(w * h * 4);
    const maskN = this.masks && this.masks.length ? this.masks.length : 1;
    this.masks = [];
    for (let i = 0; i < maskN; i++) this.masks.push(new Float32Array(w * h));
    this.activeMask = Math.min(this.activeMask || 0, maskN - 1);
    const pmaskN = this.pmasks && this.pmasks.length ? this.pmasks.length : 0;
    this.pmasks = [];
    for (let i = 0; i < pmaskN; i++) this.pmasks.push(new Float32Array(w * h));
    this.maskTarget = { kind: 'layer', index: this.activeMask };
    this.pSpawn = null;
    this.subject = new Float32Array(w * h);
    this.depth = new Float32Array(w * h);
    this.depthVersion = 0;
    this.cxProf = makeCxProfile(w);
    this.bg = new Uint8ClampedArray(w * h * 4);
    this.analysis = null;
    this.analysisSens = null;
    this.lowImg = null;
        this.gTmp = null; this.gTrail = null; this.gLastPhase = null;
            this.depthModel = null;
    this.glowCache = null;
    this.glowNoiseCache = null;
  }

  setLowResImage(rgba, w, h) { this.lowImg = { data: rgba, w, h }; }

              setDepthModel(field) {
    this.depthModel = field && field.length === this.sw * this.sh ? field : null;
    this.analysisSens = null;
    return !!this.depthModel;
  }

  clearDepthModel() { this.depthModel = null; this.analysisSens = null; }
  hasDepthModel() { return !!this.depthModel && this.depthModel.length === this.sw * this.sh; }

          buildDepthBandMask(k, n) {
    const out = new Float32Array(this.sw * this.sh);
    const field = this.hasDepthModel() ? this.depthModel : this.depth;
    const bands = Math.max(2, Math.min(6, (n | 0) || 3));
    const lo = k / bands, hi = (k + 1) / bands;
    const feather = 0.5 / bands;
    for (let i = 0; i < out.length; i++) {
      const v = field[i];
      const a = smoothstep(lo - feather, lo + feather * 0.35, v);
      const b = 1 - smoothstep(hi - feather * 0.35, hi + feather, v);
      out[i] = clamp01(Math.min(a, b));
    }
    return out;
  }

  get mask() { return this.targetMask(); }
  set mask(v) { this.setTargetMask(v); }
  get baseMask() { return this.masks[0]; }

  // An emitter target keeps its identity even when its mask array has gone missing (the emitter list was
  // emptied, a project was opened before its image, the mask list is shorter than the emitter list). With
  // an image loaded that array can always be allocated at the current work size, so a stroke paints the
  // spawn area the user is aiming at — where it used to throw on a null mask (a silently dead brush) and
  // where it later fell back to quietly painting a layer mask instead.
  targetKind() {
    if (!this.maskTarget || this.maskTarget.kind !== 'emitter') return 'layer';
    return this.sw && this.sh ? 'emitter' : 'layer';
  }
  targetIndex() {
    if (this.targetKind() === 'emitter') {
      const n = this.pmasks.length;
      return n ? clamp(this.maskTarget.index | 0, 0, n - 1) : clamp(this.maskTarget.index | 0, 0, 63);
    }
    return clamp(this.activeMask | 0, 0, Math.max(0, this.masks.length - 1));
  }
  targetMask() {
    if (this.targetKind() === 'emitter') return this.ensurePMask(this.targetIndex());
    return this.masks[this.activeMask] || this.masks[0];
  }
  setTargetMask(v) {
    if (this.targetKind() === 'emitter') {
      // Same reasoning as targetMask(): allocate the slot if it is missing, so a write to an emitter's
      // spawn mask can never land on nothing.
      const i = this.targetIndex();
      const cur = this.ensurePMask(i);
      if (!cur) return;
      this.pmasks[i] = v && v.length === cur.length ? v : new Float32Array(cur.length);
      return;
    }
    const i = Math.min(this.activeMask, this.masks.length - 1);
    this.masks[i] = v;
  }

  pmaskAt(i) {
    if (!this.pmasks.length) return null;
    return this.pmasks[clamp(i | 0, 0, this.pmasks.length - 1)] || null;
  }
  pmaskCount() { return this.pmasks.length; }
  ensurePMask(i) {
    if (!this.sw || !this.sh) return null;
    i = clamp(i | 0, 0, 63);
    while (this.pmasks.length <= i) this.pmasks.push(new Float32Array(this.sw * this.sh));
    return this.pmasks[i];
  }
  setPMask(m, i) {
    const d = this.ensurePMask(i);
    if (!d) return;
    d.set(m && m.length === d.length ? m : new Float32Array(d.length));
  }
  clearPMaskAt(i) { const m = this.pmaskAt(i); if (m) m.fill(0); }
  clonePMask(i) { const m = this.pmaskAt(i); return m ? m.slice() : null; }
  addPMask() {
    this.pmasks.push(new Float32Array(this.sw * this.sh));
    return this.pmasks.length - 1;
  }
  removePMaskAt(i) {
    if (i < 0 || i >= this.pmasks.length) return;
    this.pmasks.splice(i, 1);
    if (!this.pmasks.length) { this.maskTarget = { kind: 'layer', index: this.activeMask }; return; }
    if (this.targetKind() === 'emitter') this.maskTarget.index = clamp(this.maskTarget.index, 0, Math.max(0, this.pmasks.length - 1));
  }
  movePMaskAt(from, to) {
    const n = this.pmasks.length;
    from = clamp(from | 0, 0, n - 1); to = clamp(to | 0, 0, n - 1);
    if (from === to || !n) return;
    const m = this.pmasks.splice(from, 1)[0];
    this.pmasks.splice(to, 0, m);
  }
  pmaskCoverage(i, threshold = 0.15) {
    const m = this.pmaskAt(i);
    if (!m) return 0;
    let c = 0;
    for (let k = 0; k < m.length; k++) if (m[k] > threshold) c++;
    return m.length ? c / m.length : 0;
  }
  selectEmitterMask(i) {
    const m = this.ensurePMask(i);
    if (!m) return this.activeMask;
    this.maskTarget = { kind: 'emitter', index: clamp(i | 0, 0, this.pmasks.length - 1) };
    return this.maskTarget.index;
  }

  maskAt(i) { return this.masks[clamp(i | 0, 0, this.masks.length - 1)]; }
  maskCount() { return this.masks.length; }
  setLayerMask(i) {
    this.activeMask = clamp(i | 0, 0, this.masks.length - 1);
    return this.activeMask;
  }
  selectMask(i) {
    this.activeMask = clamp(i | 0, 0, this.masks.length - 1);
    this.maskTarget = { kind: 'layer', index: this.activeMask };
    return this.activeMask;
  }
  addMask() {
    const last = this.masks[this.masks.length - 1];
    this.masks.push(new Float32Array(last ? last.length : this.sw * this.sh));
    return this.masks.length - 1;
  }
  removeMaskAt(i) {
    if (this.masks.length <= 1) return;
    this.masks.splice(clamp(i | 0, 0, this.masks.length - 1), 1);
    this.activeMask = clamp(this.activeMask, 0, this.masks.length - 1);
  }
  moveMaskAt(from, to) {
    const n = this.masks.length;
    from = clamp(from | 0, 0, n - 1); to = clamp(to | 0, 0, n - 1);
    if (from === to) return;
    const m = this.masks.splice(from, 1)[0];
    this.masks.splice(to, 0, m);
    this.activeMask = to;
  }
  clearMaskAt(i) { const m = this.maskAt(i); if (m) m.fill(0); }

  cloneMask(i) { return (i == null ? this.mask : this.maskAt(i)).slice(); }
  setMask(m, i) {
    const dst = i == null ? this.mask : this.maskAt(i);
    if (!dst) return;
    dst.set(m && m.length === dst.length ? m : new Float32Array(dst.length));
  }

  maskCoverage(threshold = 0.15, i) {
    const m = i == null ? this.mask : this.maskAt(i);
    let c = 0;
    for (let k = 0; k < m.length; k++) if (m[k] > threshold) c++;
    return m.length ? c / m.length : 0;
  }
  maskMax(i) {
    const m = i == null ? this.mask : this.maskAt(i);
    let mm = 0;
    for (let k = 0; k < m.length; k++) if (m[k] > mm) mm = m[k];
    return mm;
  }
  maskMean(i) {
    const m = i == null ? this.mask : this.maskAt(i);
    let sum = 0;
    for (let k = 0; k < m.length; k++) sum += m[k];
    return m.length ? sum / m.length : 0;
  }

  stamp(cx, cy, r, flow, erase, hardness = 0.5, symmetry = false) {
    const { sw: w, sh: h } = this;
    // A missing target mask must be a no-op, not a TypeError: there is a state (the brush pointed at
    // an emitter that no longer has a spawn mask — e.g. every emitter deleted) where `this.mask` is
    // null, and the throw killed the whole stroke silently.
    const mask = this.mask;
    if (!mask || !mask.length || !w || !h) return;
    const stamps = [[cx, cy]];
    if (symmetry) stamps.push([w - 1 - cx, cy]);
    const p = clamp(hardness, 0, 1);
    for (const [sx, sy] of stamps) {
      const x0 = Math.max(0, Math.floor(sx - r)), x1 = Math.min(w - 1, Math.ceil(sx + r));
      const y0 = Math.max(0, Math.floor(sy - r)), y1 = Math.min(h - 1, Math.ceil(sy + r));
      const inner = 1 - p;
      for (let y = y0; y <= y1; y++) {
        const row = y * w;
        for (let x = x0; x <= x1; x++) {
          const dist = Math.hypot((x - sx) / r, (y - sy) / r);
          if (dist >= 1) continue;
          const fall = p >= 0.999 ? 1 : smoothstep(1, inner, dist);
          const amt = flow * fall;
          const idx = row + x;
          if (erase) mask[idx] *= (1 - clamp01(amt));
          else mask[idx] = Math.max(mask[idx], clamp01(amt));
        }
      }
    }
  }

  strokeTo(from, to, r, flow, erase, hardness, symmetry) {
    if (!from) { this.stamp(to.x, to.y, r, flow, erase, hardness, symmetry); return; }
    const dx = to.x - from.x, dy = to.y - from.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(1, r * 0.3)));
    for (let i = 1; i <= steps; i++) this.stamp(from.x + dx * i / steps, from.y + dy * i / steps, r, flow, erase, hardness, symmetry);
  }

  grow(amount = 1) {
    const { sw: w, sh: h } = this;
    if (!this.mask || !this.mask.length) return;
    for (let k = 0; k < amount; k++) {
      const src = this.mask;
      const out = new Float32Array(src.length);
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const i = row + x;
          let m = src[i];
          if (x > 0) m = Math.max(m, src[i - 1] * 0.92);
          if (x < w - 1) m = Math.max(m, src[i + 1] * 0.92);
          if (y > 0) m = Math.max(m, src[i - w] * 0.92);
          if (y < h - 1) m = Math.max(m, src[i + w] * 0.92);
          out[i] = m;
        }
      }
      this.mask = out;
    }
  }

  feather(radius = 6) {
    const r = Math.max(1, Math.round(radius));
    if (!this.mask || !this.mask.length) return;
    const blurred = boxBlur(this.mask, this.sw, this.sh, r);
    const blur2 = boxBlur(blurred, this.sw, this.sh, r);
    for (let i = 0; i < this.mask.length; i++) this.mask[i] = clamp01(blur2[i] * 1.9);
  }

  invert() {
    if (!this.mask || !this.mask.length) return;
    for (let i = 0; i < this.mask.length; i++) this.mask[i] = clamp01(1 - this.mask[i]);
  }

  clear() { if (this.mask && this.mask.length) this.mask.fill(0); }

  smartSelect(sx, sy, tolerance = 0.16) {
    const { sw: w, sh: h, src } = this;
    if (!this.mask || !this.mask.length || !w || !h) return 0;
    sx = clamp(Math.round(sx), 0, w - 1); sy = clamp(Math.round(sy), 0, h - 1);
    const N = w * h;
    const o0 = (sy * w + sx) * 4;
    const r0 = src[o0], g0 = src[o0 + 1], b0 = src[o0 + 2];
    const tol = tolerance * 255 * tolerance * 255;
    const seen = new Uint8Array(N);
    const stack = new Int32Array(N);
    let sp = 0;
    const i0 = sy * w + sx;
    stack[sp++] = i0; seen[i0] = 1;
    const hit = new Uint8Array(N);
    let count = 0;
    while (sp > 0) {
      const i = stack[--sp];
      hit[i] = 1; count++;
      const y = (i / w) | 0, x = i - y * w;
      const o = i * 4;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (seen[j]) continue;
        seen[j] = 1;
        const oj = j * 4;
        const dr = src[oj] - r0, dg = src[oj + 1] - g0, db = src[oj + 2] - b0;
        if (dr * dr + dg * dg + db * db <= tol) stack[sp++] = j;
      }
    }
    if (!count) return 0;
    const f = new Float32Array(N);
    for (let i = 0; i < N; i++) f[i] = hit[i];
    const rBlur = Math.max(1, Math.round(Math.min(w, h) * 0.012));
    const soft = boxBlur(f, w, h, rBlur);
    for (let i = 0; i < N; i++) {
      const v = smoothstep(0.15, 0.75, soft[i]);
      if (v > this.mask[i]) this.mask[i] = v;
    }
    return count / N;
  }

  analyze(sens) {
    const { sw: w, sh: h, src } = this;
    this.depthVersion = (this.depthVersion || 0) + 1;
    const maxA = 176;
    const sc = Math.min(1, maxA / Math.max(w, h));
    const aw = Math.max(24, Math.round(w * sc)), ah = Math.max(24, Math.round(h * sc));
    const low = this.lowImg && this.lowImg.w === aw && this.lowImg.h === ah
      ? this.lowImg.data
      : downsampleRGBA(src, w, h, aw, ah);
    const res = analyzeSubject(low, aw, ah, sens);
    res.aw = aw; res.ah = ah; res.low = low;
    this.analysis = res;
    const softFull = upsampleField(res.soft, aw, ah, w, h);
    this.subject = softFull;
                    if (this.hasDepthModel()) {
      const dm = this.depthModel;
      for (let i = 0; i < dm.length; i++) this.depth[i] = clamp01(dm[i]);
      return res;
    }
    const lumaLow = res.luma;
    const lumaFull = upsampleField(lumaLow, aw, ah, w, h);
    const lumaBlur = boxBlur(lumaFull, w, h, Math.max(1, Math.round(Math.min(w, h) * 0.02)));
    const q0 = quantile(lumaBlur, 0.05), q1 = quantile(lumaBlur, 0.95);
    const inv = 1 / Math.max(1e-4, q1 - q0);
    for (let i = 0; i < softFull.length; i++) {
      const lrel = clamp01((lumaBlur[i] - q0) * inv);
      this.depth[i] = clamp01(0.12 + 0.88 * softFull[i] * (0.6 + 0.4 * lrel));
    }
    return res;
  }

    buildAutoMask(sens, settings, layerIndex) {
            if (!this.analysis || this.analysisSens !== sens) { this.analyze(sens); this.analysisSens = sens; }
    const res = this.analysis;
    const layers = layerList(settings);
    const li = clamp(layerIndex == null ? (typeof settings.activeLayer === 'number' ? settings.activeLayer : 0) : layerIndex, 0, layers.length - 1);
    const layer = layers[li] || layers[0];
    const mode = layer ? layer.mode : 'breathing';
    const prof = autoMaskProfile(mode, this.sh, res);
    const { sw: w, subject } = this;
    const mask = this.maskAt(li);
    const depthMode = mode === 'depth';
    if (depthMode) {
      for (let i = 0; i < mask.length; i++) mask[i] = clamp01(subject[i]);
    } else {
      for (let y = 0; y < this.sh; y++) {
        const row = y * w, py = prof[y];
        for (let x = 0; x < w; x++) {
          const i = row + x;
          mask[i] = clamp01(subject[i] * py);
        }
      }
    }
    return res;
  }

  render(phase, settings, opts = {}) {
    const s = settings;
    const ampMul = opts.ampMul == null ? 1 : opts.ampMul;
    let t = phase;
    if (s.timeline === 'boomerang') {
      const twoPi = TWO_PI;
      const u = (t % (2 * twoPi)) / (2 * twoPi);
      t = u < 0.5 ? u * 2 * twoPi : (1 - (u - 0.5) * 2) * twoPi;
    }
    this._renderMotion(t, s, ampMul);
            this._particles(t, s);
            this._glow(t, s);
            this._glitch(t, s);
    return this.out;
  }

    _renderMotion(t, s, ampMul) {
    const layers = layerList(s);
    if (layers[0] && layers[0].on && layers[0].mode === 'depth') {
      const t0 = t * layerCycles(layers[0].params && layers[0].params.speed);
                        if (s.depthSource === 'model' && this.hasDepthModel()) this._renderDepthModel(t0, s, ampMul, layers[0]);
      else this._renderDepth(t0, s, ampMul, layers[0]);
      const extras = [];
      for (let i = 1; i < layers.length; i++) if (layers[i].on && layers[i].opacity > 0) extras.push(layers[i]);
      if (extras.length) {
        const n = this.out.length;
        if (!this.warpSrc || this.warpSrc.length !== n) this.warpSrc = new Uint8ClampedArray(n);
        this.warpSrc.set(this.out);
        const saved = this.src;
        this.src = this.warpSrc;
        this._field(t, extras, ampMul);
        this._sample();
        this.src = saved;
      }
      return this.out;
    }
    this._field(t, layers, ampMul);
    this._sample();
    return this.out;
  }

                          _field(t, list, ampMul) {
    const n = this.sw * this.sh;
    if (!this.dx || this.dx.length !== n) {
      this.dx = new Float32Array(n);
      this.dy = new Float32Array(n);
      this.dw = new Float32Array(n);
      this.lx = new Float32Array(n);
      this.ly = new Float32Array(n);
    }
    this.dx.fill(0);
    this.dy.fill(0);
    for (const layer of list) {
      if (!layer.on || layer.opacity <= 0) continue;
      const fs = Object.assign({ mode: layer.mode }, LAYER_PARAMS, layer.params);
      if (fs.mode === 'none') continue;
            this.dw.fill(0);
      this._layerField(t * layerCycles(fs.speed), fs, layer, ampMul);
      const dxA = this.dx, dyA = this.dy, dwA = this.dw, lxA = this.lx, lyA = this.ly;
      for (let i = 0; i < n; i++) {
        const a = dwA[i];
        if (a <= 0) continue;
        const k = a >= 1 ? 1 : a;
        dxA[i] = lxA[i] * k + dxA[i] * (1 - k);
        dyA[i] = lyA[i] * k + dyA[i] * (1 - k);
      }
    }
  }

      _layerField(t, s, layer, ampMul) {
    const { sw: w, sh: h, cxProf, depth: depthField } = this;
    const mArr = this.masks[layer.maskIndex] || null;
    if (!mArr) return;
    const lxA = this.lx, lyA = this.ly, dwA = this.dw;
    const wm = w - 1, hm = h - 1;
    const mode = s.mode;
    const base = s.ampFrac * h * ampMul;
    const chestBase = s.chestOn ? s.chestAmt * base : 0;
    const tSin = Math.sin(t);
    const px = s.swayPivotX * wm, py = s.swayPivotY * hm;
    const zx = s.zoomFocusX * wm, zy = s.zoomFocusY * hm;
    const flowRad = (s.flowDir || 0) * Math.PI / 180;
    const flowCx = Math.cos(flowRad), flowSy = Math.sin(flowRad);
    const swayRad = s.ampFrac * 2.2 * ampMul * tSin;
    const zoomScale = 1 + s.ampFrac * 2.4 * ampMul * (s.zoomDir >= 0 ? tSin : -tSin);
    const zoomK = 1 - 1 / zoomScale;
            const c3 = s.ampFrac * 3.2 * ampMul;
    const panX = Math.sin(t) * c3 * wm * (0.4 + 0.6 * s.depthPan);
    const panY = Math.sin(t * 2) * c3 * hm * 0.35 * s.depthPan;
    const zoom3 = 1 + Math.sin(t) * c3 * 0.7 * (0.3 + 0.7 * s.depthAmount);
    const nearBias = 0.25 + 0.75 * s.depthBias;
    const dcx = wm * 0.5, dcy = hm * 0.5;
    let flameTop = null, flameBot = null, flameReach = null, flamePhase = null, flameLickPh = null, flameCx = 0.5, flameHalf = 1, flameFlick = 0, flameSpread = 0, flameLick = 0;
    if (mode === 'flames') {
      const fd = this._flameData(mArr, w, h, s.ampFrac * h * ampMul);
      flameTop = fd.top; flameBot = fd.bot; flameReach = fd.reach; flamePhase = fd.phase; flameLickPh = fd.lick;
      flameCx = fd.cx; flameHalf = fd.halfPx;
      flameFlick = clamp01(s.flameFlicker == null ? LAYER_PARAMS.flameFlicker : s.flameFlicker);
      flameSpread = clamp01(s.flameSpread == null ? LAYER_PARAMS.flameSpread : s.flameSpread);
      flameLick = clamp01(s.flameSway == null ? LAYER_PARAMS.flameSway : s.flameSway);
    }
    const op = layer.opacity;
    for (let y = 0; y < h; y++) {
      const fy = y / hm;
      const row = y * w;
      let dyRow = 0, dxAmp = 0;
      if (mode === 'breathing') {
        dyRow = base * tSin;
        dxAmp = chestBase * tSin;
      } else if (mode === 'wave') {
        const v = Math.sin(t - TWO_PI * s.waveFreq * fy) * Math.sin(Math.PI * fy);
        dyRow = base * v;
        dxAmp = 0.35 * base * v;
      }
      const flowGate = 0.3 + 0.7 * (1 - fy) * (0.5 + 0.5 * s.flowRamp) + 0.1 * s.flowRamp;
      const flowPhaseY = TWO_PI * s.flowFreq * flowSy * y / h;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const a = op * mArr[i];
        if (a <= 0) continue;
        let mx, my;
        if (mode === 'sway') {
          const rx = x - px, ry = y - py;
          mx = -ry * swayRad;
          my = rx * swayRad;
        } else if (mode === 'zoom') {
          mx = (x - zx) * zoomK;
          my = (y - zy) * zoomK;
        } else if (mode === 'flow') {
          const vv = Math.sin(t - flowPhaseY - TWO_PI * s.flowFreq * flowCx * x / w) * flowGate;
          mx = base * flowCx * vv;
          my = base * flowSy * vv;
        } else if (mode === 'depth') {
          const nb = nearBias + (1 - nearBias) * depthField[i];
          mx = (panX + (x - dcx) * (zoom3 - 1)) * nb;
          my = (panY + (y - dcy) * (zoom3 - 1)) * nb;
        } else if (mode === 'flames') {
          const bot = flameBot[x], top = flameTop[x];
          mx = 0; my = 0;
          if (bot >= top && y <= bot) {
            const span = bot - top + 1;
            const hn = clamp01((bot - y) / span);
            const ph = flamePhase[x];
            const reach = flameReach[x];
            const lp = flameLickPh[x];
            const s1 = Math.sin(t + ph);
            const s2 = Math.sin(2 * t - 4.0 * hn + ph * 0.75);
            const s3 = Math.sin(3 * t + ph * 1.6 + hn * 3.1);
            const env = hn * hn * (3 - 2 * hn);
            const W = 1 + flameFlick * (0.26 * s1 + 0.17 * s2) + (0.03 + 0.07 * flameFlick) * s3;
            const lift = reach * W * (0.14 + 0.86 * env);
            const off = (x - flameCx * w) / flameHalf;
            mx = lift * flameSpread * 0.45 * off * hn * (0.65 + 0.35 * s2) +
              flameLick * 0.24 * reach * hn * Math.sin(t + lp + hn * 1.2);
            my = -lift;
          }
        } else {
          mx = dxAmp * cxProf[x];
          my = dyRow;
        }
        lxA[i] = mx;
        lyA[i] = my;
        dwA[i] = a;
      }
    }
  }

    _flameData(m, w, h, base) {
    if (!this.fTop || this.fTop.length !== w) {
      this.fTop = new Uint16Array(w);
      this.fBot = new Uint16Array(w);
      this.fReach = new Float32Array(w);
      this.fPhase = new Float32Array(w);
      this.fLick = new Float32Array(w);
      this.fSpan = new Float32Array(w);
      this.fSpanSm = new Float32Array(w);
      this.fCols = null;
      this.fReachKey = null;
    }
    const top = this.fTop, bot = this.fBot, reach = this.fReach, phase = this.fPhase, lick = this.fLick;
    let sig = 0, ns = 0;
    for (let k = 0; k < m.length; k += 97) { sig += m[k]; ns++; }
    sig = sig * 31 + ns * 7 + w * 131 + h * 17;
    if (this.fCols !== sig) {
      this.fCols = sig;
      this.fReachKey = null;
      const TH = 0.06;
      for (let x = 0; x < w; x++) { top[x] = h; bot[x] = 0; }
      let sumX = 0, sumW = 0;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const v = m[row + x];
          if (v <= TH) continue;
          if (y < top[x]) top[x] = y;
          if (y > bot[x]) bot[x] = y;
          sumX += x * v; sumW += v;
        }
      }
      this.fCx = sumW > 0 ? (sumX / sumW) / w : 0.5;
      let x0 = w, x1 = 0;
      for (let x = 0; x < w; x++) if (bot[x] >= top[x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      this.fHalfPx = x1 >= x0 ? Math.max(1, (x1 - x0 + 1) * 0.5) : Math.max(1, w * 0.5);
    }
    const reachKey = Math.round(base * 20) * 1000 + w;
    if (this.fReachKey !== reachKey) {
      this.fReachKey = reachKey;
      const spanRaw = this.fSpan, spanSm = this.fSpanSm;
      for (let x = 0; x < w; x++) spanRaw[x] = bot[x] >= top[x] ? bot[x] - top[x] + 1 : 0;
      const R = Math.max(2, Math.round(w * 0.02));
      for (let x = 0; x < w; x++) {
        let s = 0, c = 0;
        for (let q = -R; q <= R; q++) { const xx = x + q; if (xx < 0 || xx >= w) continue; if (spanRaw[xx] > 0) { s += spanRaw[xx]; c++; } }
        spanSm[x] = c ? s / c : 0;
      }
      for (let x = 0; x < w; x++) {
        const span = spanSm[x] > 0 ? spanSm[x] : spanRaw[x];
        const tall = 0.5 + 0.5 * (0.66 * Math.sin(x * 0.043 + 0.9) + 0.34 * Math.sin(x * 0.017 + 2.4));
        const cap = span * 0.9;
        reach[x] = span > 0 ? Math.min(Math.max(base * 2.6, span * 0.3), cap) * (0.55 + 0.45 * clamp01(tall)) : 0;
        phase[x] = 2.8 * Math.sin(x * 0.052 + 0.3) + 1.5 * Math.sin(x * 0.021 + 1.7);
        lick[x] = 0.9 * Math.sin(x * 0.009 + 0.7) + 0.5 * Math.sin(x * 0.023 + 2.1);
      }
      const K = 1;
      for (let x = 1; x < w; x++) if (reach[x] > reach[x - 1] + K) reach[x] = reach[x - 1] + K;
      for (let x = w - 2; x >= 0; x--) if (reach[x] > reach[x + 1] + K) reach[x] = reach[x + 1] + K;
    }
    return { top, bot, reach, phase, lick, cx: this.fCx, halfPx: this.fHalfPx };
  }

  _sample() {
    const { sw: w, sh: h, src: S, out: O, dx: dxA, dy: dyA } = this;
    const wm = w - 1, hm = h - 1;
    for (let y = 0; y < h; y++) {
      const row = y * w, rowBase = row * 4;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const mx = dxA[i], my = dyA[i];
        const sx = x - mx, sy = y - my;
        let x0 = sx | 0, y0 = sy | 0;
        let ax = sx - x0, ay = sy - y0;
        if (x0 < 0) { x0 = 0; ax = 0; } else if (x0 > wm) { x0 = wm; ax = 0; }
        if (y0 < 0) { y0 = 0; ay = 0; } else if (y0 > hm) { y0 = hm; ay = 0; }
        const x1 = x0 < wm ? x0 + 1 : x0;
        const y1 = y0 < hm ? y0 + 1 : y0;
        const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
        const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
        const oi = rowBase + x * 4;
        O[oi] = S[i00] * w00 + S[i10] * w10 + S[i01] * w01 + S[i11] * w11;
        O[oi + 1] = S[i00 + 1] * w00 + S[i10 + 1] * w10 + S[i01 + 1] * w01 + S[i11 + 1] * w11;
        O[oi + 2] = S[i00 + 2] * w00 + S[i10 + 2] * w10 + S[i01 + 2] * w01 + S[i11 + 2] * w11;
        O[oi + 3] = S[i00 + 3] * w00 + S[i10 + 3] * w10 + S[i01 + 3] * w01 + S[i11 + 3] * w11;
      }
    }
    return O;
  }

  _renderDepth(t, s, ampMul, layer) {
    const { sw: w, sh: h, src: S, out: O, subject, depth, bg } = this;
    const mask = this.maskAt(layer ? layer.maskIndex : 0);
    const op = layer && typeof layer.opacity === 'number' ? layer.opacity : 1;
    const dp = layer ? Object.assign({}, LAYER_PARAMS, layer.params) : s;
    const wm = w - 1, hm = h - 1;
        const c = (dp.ampFrac == null ? s.ampFrac : dp.ampFrac) * 3.2 * ampMul * op;
    const panX = Math.sin(t) * c * wm * (0.4 + 0.6 * dp.depthPan);
    const panY = Math.sin(t * 2) * c * hm * 0.35 * dp.depthPan;
    const zoom = 1 + Math.sin(t) * c * 0.7 * (0.3 + 0.7 * dp.depthAmount);
    const cx = wm * 0.5, cy = hm * 0.5;
    const nearBias = 0.25 + 0.75 * dp.depthBias;

        const bgScale = 0.3;
    for (let y = 0; y < h; y++) {
      const row = y * w, rowBase = row * 4;
      for (let x = 0; x < w; x++) {
        const dx = (panX + (x - cx) * (zoom - 1)) * bgScale;
        const dy = (panY + (y - cy) * (zoom - 1)) * bgScale;
        let sx = x - dx, sy = y - dy;
        let x0 = Math.floor(sx), y0 = Math.floor(sy);
        let ax = sx - x0, ay = sy - y0;
                if (x0 < 0) { x0 = -x0 - 1; ax = 1 - ax; } else if (x0 > wm) { x0 = 2 * wm - x0 + 1; ax = 1 - ax; }
        if (y0 < 0) { y0 = -y0 - 1; ay = 1 - ay; } else if (y0 > hm) { y0 = 2 * hm - y0 + 1; ay = 1 - ay; }
        x0 = clamp(x0, 0, wm); y0 = clamp(y0, 0, hm);
        const x1 = x0 < wm ? x0 + 1 : x0, y1 = y0 < hm ? y0 + 1 : y0;
        const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
        const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
        const oi = rowBase + x * 4;
        bg[oi] = S[i00] * w00 + S[i10] * w10 + S[i01] * w01 + S[i11] * w11;
        bg[oi + 1] = S[i00 + 1] * w00 + S[i10 + 1] * w10 + S[i01 + 1] * w01 + S[i11 + 1] * w11;
        bg[oi + 2] = S[i00 + 2] * w00 + S[i10 + 2] * w10 + S[i01 + 2] * w01 + S[i11 + 2] * w11;
        bg[oi + 3] = S[i00 + 3] * w00 + S[i10 + 3] * w10 + S[i01 + 3] * w01 + S[i11 + 3] * w11;
      }
    }
        for (let y = 0; y < h; y++) {
      const row = y * w, rowBase = row * 4;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const oi = rowBase + x * 4;
        const gate = clamp01(subject[i] * (0.35 + 0.65 * mask[i]));
        const n = nearBias + (1 - nearBias) * depth[i];
        let dx = (panX + (x - cx) * (zoom - 1)) * n;
        let dy = (panY + (y - cy) * (zoom - 1)) * n;
        if (gate < 0.004) {
          O[oi] = bg[oi]; O[oi + 1] = bg[oi + 1]; O[oi + 2] = bg[oi + 2]; O[oi + 3] = bg[oi + 3];
          continue;
        }
        let sx = x - dx, sy = y - dy;
        let x0 = sx | 0, y0 = sy | 0;
        let ax = sx - x0, ay = sy - y0;
        if (x0 < 0) { x0 = 0; ax = 0; } else if (x0 > wm) { x0 = wm; ax = 0; }
        if (y0 < 0) { y0 = 0; ay = 0; } else if (y0 > hm) { y0 = hm; ay = 0; }
        const x1 = x0 < wm ? x0 + 1 : x0, y1 = y0 < hm ? y0 + 1 : y0;
        const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
        const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
        const r = S[i00] * w00 + S[i10] * w10 + S[i01] * w01 + S[i11] * w11;
        const g = S[i00 + 1] * w00 + S[i10 + 1] * w10 + S[i01 + 1] * w01 + S[i11 + 1] * w11;
        const b = S[i00 + 2] * w00 + S[i10 + 2] * w10 + S[i01 + 2] * w01 + S[i11 + 2] * w11;
        O[oi] = bg[oi] + (r - bg[oi]) * gate;
        O[oi + 1] = bg[oi + 1] + (g - bg[oi + 1]) * gate;
        O[oi + 2] = bg[oi + 2] + (b - bg[oi + 2]) * gate;
        O[oi + 3] = 255;
      }
    }
  }

                                _renderDepthModel(t, s, ampMul, layer) {
    const { sw: w, sh: h, src: SRC, out: O, depth } = this;
    const mask = this.maskAt(layer ? layer.maskIndex : 0);
    const op = layer && typeof layer.opacity === 'number' ? layer.opacity : 1;
    const dp = layer ? Object.assign({}, LAYER_PARAMS, layer.params) : s;
    const wm = w - 1, hm = h - 1;
    const c = (dp.ampFrac == null ? s.ampFrac : dp.ampFrac) * 3.2 * ampMul * op;
    const panX = Math.sin(t) * c * wm * (0.4 + 0.6 * dp.depthPan);
    const panY = Math.sin(t * 2) * c * hm * 0.35 * dp.depthPan;
    const zoom = 1 + Math.sin(t) * c * 0.7 * (0.3 + 0.7 * dp.depthAmount);
    const cx = wm * 0.5, cy = hm * 0.5;
                            const anchor = 0.1 + 0.8 * clamp01(dp.depthBias == null ? 0.5 : dp.depthBias);
    const invAnchor = 1 / Math.max(1e-3, 1 - anchor);
    const K = Math.max(2, Math.min(10, Math.round(s.depthPlanes || 6)));
    const n = w * h;
    if (!this.planeIdx || this.planeIdx.length !== n) {
      this.planeIdx = new Int32Array(n);
      this.planeOrder = new Int32Array(n);
      this.planeSize = new Int32Array(16);
      this.planeStart = new Int32Array(16);
      this.planeCursor = new Int32Array(16);
    }
    const idx = this.planeIdx, order = this.planeOrder, size = this.planeSize;
    const start = this.planeStart, cursor = this.planeCursor;
    if (size.length < K) {
      this.planeSize = size = new Int32Array(K);
      this.planeStart = start = new Int32Array(K);
      this.planeCursor = cursor = new Int32Array(K);
    }
    size.fill(0, 0, K);
    for (let i = 0; i < n; i++) {
      let k = (depth[i] * K) | 0;
      if (k < 0) k = 0; else if (k >= K) k = K - 1;
      idx[i] = k;
      size[k]++;
    }
    let acc = 0;
    for (let k = 0; k < K; k++) { start[k] = acc; cursor[k] = acc; acc += size[k]; }
    for (let i = 0; i < n; i++) order[cursor[idx[i]]++] = i;
            O.set(SRC);
    for (let k = 0; k < K; k++) {
      const from = start[k], to = from + size[k];
      if (from === to) continue;
      for (let q = from; q < to; q++) {
        const i = order[q];
        const x = i - ((i / w) | 0) * w, y = (i / w) | 0;
        const m = (depth[i] - anchor) * invAnchor * (0.35 + 0.65 * mask[i]);
        const dx = (panX + (x - cx) * (zoom - 1)) * m;
        const dy = (panY + (y - cy) * (zoom - 1)) * m;
        let sx = x - dx, sy = y - dy;
        let x0 = sx | 0, y0 = sy | 0;
        let ax = sx - x0, ay = sy - y0;
                        if (sx < 0) { x0 = -x0 - 1; ax = 1 - ax; } else if (x0 > wm) { x0 = 2 * wm - x0 + 1; ax = 1 - ax; }
        if (sy < 0) { y0 = -y0 - 1; ay = 1 - ay; } else if (y0 > hm) { y0 = 2 * hm - y0 + 1; ay = 1 - ay; }
        x0 = clamp(x0, 0, wm); y0 = clamp(y0, 0, hm);
        const x1 = x0 < wm ? x0 + 1 : x0, y1 = y0 < hm ? y0 + 1 : y0;
        const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
        const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
        const oi = i * 4;
        O[oi] = SRC[i00] * w00 + SRC[i10] * w10 + SRC[i01] * w01 + SRC[i11] * w11;
        O[oi + 1] = SRC[i00 + 1] * w00 + SRC[i10 + 1] * w10 + SRC[i01 + 1] * w01 + SRC[i11 + 1] * w11;
        O[oi + 2] = SRC[i00 + 2] * w00 + SRC[i10 + 2] * w10 + SRC[i01 + 2] * w01 + SRC[i11 + 2] * w11;
        O[oi + 3] = SRC[i00 + 3] * w00 + SRC[i10 + 3] * w10 + SRC[i01 + 3] * w01 + SRC[i11 + 3] * w11;
      }
    }
    return O;
  }

            _glitch(t, s) {
    const g = s && s.glitch;
    const { sw: w, sh: h, out: O } = this;
    if (!g || !g.on || g.amount <= 0 || !w || !O || O.length !== w * h * 4) {
      this.gTrail = null;
      this.gLastPhase = null;
      return;
    }
    const seed = g.seed | 0;
    const A = clamp(g.amount, 0, 1.6);
            const steps = Math.max(3, Math.round(4 + g.rate * 44));
    const idx = Math.floor(t / (TWO_PI / steps));
    const storm = Math.floor(idx / 6);
    const active = rnd01(seed, storm, 7) < 0.3 + 0.55 * g.burst;
    const gate = active ? 1 : 1 - g.burst;
    const k = A * gate;
    const kRgb = clamp01(k * g.rgb);
    const kBlocks = clamp01(k * g.blocks);
    const kScan = clamp01(k * g.scan);
    const kNoise = clamp01(k * g.noise);
    const kVhs = clamp01(k * g.vhs);
    const kSort = clamp01(k * g.sort);
    const kCrush = clamp01(k * g.crush);
    const kTrail = clamp01(k * g.trails);
    const size = O.length;
    if (kRgb + kBlocks + kScan + kNoise + kVhs + kSort + kCrush + kTrail <= 0) {
            this.gTrail = null;
      this.gLastPhase = null;
      return;
    }

                    if (kTrail > 0) {
      if (!this.gTrail || this.gTrail.length !== size) {
                        this.gTrail = new Uint8ClampedArray(size);
        this.gTrail.set(O);
      }
      const dt = this.gLastPhase == null ? 0 : Math.abs(t - this.gLastPhase);
      const decay = dt > 0 && dt < 1 ? Math.exp(-dt / ((0.06 + 0.4 * kTrail) * TWO_PI)) : 0;
      const mix = 0.12 + 0.7 * kTrail;
      const T = this.gTrail;
      for (let j = 0; j < size; j += 4) {
        for (let c = 0; c < 3; c++) {
          const p = O[j + c];
          const held = T[j + c] * decay;
          const v = p > held ? p : held;
          T[j + c] = v;
          O[j + c] = p + (v - p) * mix;
        }
      }
    } else this.gTrail = null;
    this.gLastPhase = t;

        if (kCrush > 0) {
      const stp = 255 / (Math.pow(2, Math.max(2, Math.round(8 - 5.4 * kCrush))) - 1);
      const inv = 1 / stp;
      for (let y = 0; y < h; y++) {
        const bRow = (y & 3) * 4, row = y * w * 4;
        for (let x = 0; x < w; x++) {
          const o = row + x * 4;
          const dth = (BAYER4[bRow + (x & 3)] / 16 - 0.5) * stp;
          O[o] = Math.round((O[o] + dth) * inv) * stp;
          O[o + 1] = Math.round((O[o + 1] + dth) * inv) * stp;
          O[o + 2] = Math.round((O[o + 2] + dth) * inv) * stp;
        }
      }
    }

                    if (kSort > 0) {
      if (!this.gRow || this.gRow.length !== w * 4) this.gRow = new Uint8ClampedArray(w * 4);
      if (!this.gKeys || this.gKeys.length !== w) this.gKeys = new Float64Array(w);
      if (!this.gLuma || this.gLuma.length !== w) this.gLuma = new Float32Array(w);
      const rowBuf = this.gRow, keys = this.gKeys, luma = this.gLuma;
      const base = 0.18 + 0.35 * (1 - kSort);
      for (let y = 0; y < h; y++) {
        const row = y * w * 4;
                                rowBuf.set(O.subarray(row, row + w * 4));
        for (let x = 0; x < w; x++) {
          const p = x * 4;
          luma[x] = (rowBuf[p] * 0.299 + rowBuf[p + 1] * 0.587 + rowBuf[p + 2] * 0.114) / 255;
        }
        const thr = base + (rnd01(seed, idx, 5000 + y) - 0.5) * 0.18;
        const desc = rnd01(seed, idx, 6000 + y) < 0.5;
        let x = 0;
        while (x < w) {
          while (x < w && luma[x] <= thr) x++;
          if (x >= w) break;
          let xe = x;
          while (xe < w && luma[xe] > thr) xe++;
          const len = xe - x;
                    if (len >= 6) {
            for (let q = 0; q < len; q++) {
              const l = (luma[x + q] * 4095) | 0;
              keys[q] = (desc ? 4095 - l : l) * 4096 + q;
            }
            const view = keys.subarray(0, len);
            view.sort();
            for (let q = 0; q < len; q++) {
              const from = (x + ((view[q] % 4096) | 0)) * 4, to = row + (x + q) * 4;
                            O[to] += (rowBuf[from] - O[to]) * kSort;
              O[to + 1] += (rowBuf[from + 1] - O[to + 1]) * kSort;
              O[to + 2] += (rowBuf[from + 2] - O[to + 2]) * kSort;
            }
          }
          x = xe;
        }
      }
    }

            let yc = 0, invYh = 1;
    if (kVhs > 0 || kScan > 0) {
      yc = (((t / TWO_PI) % 1) + 1) % 1 * h;
      const yh = Math.max(2, h * (0.02 + 0.05 * kVhs));
      invYh = 1 / (2 * yh * yh);
    }

                    if (kRgb > 0 || kBlocks > 0 || kVhs > 0) {
      if (!this.gTmp || this.gTmp.length !== size) this.gTmp = new Uint8ClampedArray(size);
      const T = this.gTmp;
      T.set(O);
      const split = kRgb * w * 0.03 * (0.4 + 1.2 * rnd01(seed, idx, 31));
      const wob = kVhs * w * 0.022;
      const bands = this.gBands || (this.gBands = {
        y0: new Int32Array(24), y1: new Int32Array(24), dx: new Float32Array(24),
        dy: new Int32Array(24), swap: new Uint8Array(24), n: 0,
      });
      bands.n = 0;
      if (kBlocks > 0 && rnd01(seed, idx, 11) < 0.25 + 0.75 * kBlocks) {
        const count = Math.min(24, 1 + ((rnd01(seed, idx, 12) * (1 + kBlocks * 7)) | 0));
        for (let b = 0; b < count; b++) {
          const r1 = rnd01(seed, idx, 20 + b * 7);
          const r2 = rnd01(seed, idx, 21 + b * 7);
          const r3 = rnd01(seed, idx, 22 + b * 7);
          const r4 = rnd01(seed, idx, 23 + b * 7);
          const y0 = (r1 * h) | 0;
          bands.y0[b] = y0;
                    bands.y1[b] = Math.min(h, y0 + Math.max(1, Math.round((0.006 + 0.14 * r2 * r2) * h)));
                                        bands.dx[b] = (r3 < 0.5 ? -1 : 1) * kBlocks * w * (0.006 + 0.16 * r4 * r4) * (0.4 + 0.6 * r4);
          bands.dy[b] = rnd01(seed, idx, 24 + b * 7) < 0.35
            ? Math.round((rnd01(seed, idx, 25 + b * 7) - 0.5) * kBlocks * 8) : 0;
          bands.swap[b] = rnd01(seed, idx, 26 + b * 7) < 0.12 * kBlocks ? 1 : 0;
        }
        bands.n = count;
      }
                  let j1 = 0, j2 = 0;
      for (let y = 0; y < h; y++) {
        let bx = 0, byy = 0, bsw = 0;
        for (let b = 0; b < bands.n; b++) {
          if (y >= bands.y0[b] && y < bands.y1[b]) { bx = bands.dx[b]; byy = bands.dy[b]; bsw = bands.swap[b]; }
        }
        if ((y & 3) === 0) { j1 = rnd01(seed, idx, 1000 + y); j2 = rnd01(seed, idx, 2000 + y); }
        const fy = h > 1 ? y / (h - 1) : 0;
        const track = kVhs > 0 ? Math.exp(-((y - yc) * (y - yc)) * invYh) : 0;
        const mx = bx
          + wob * (0.1 + 0.9 * fy * fy) * Math.sin(y * 0.055 + t * 1.9)
          + track * kVhs * w * 0.06 * Math.sin(y * 0.31 + t * 3.1);
        const sp = split * (1 + 3 * track) * (0.7 + 0.6 * j1);
        const oR = mx - sp, oB = mx + sp * (0.6 + 0.5 * j2);
                                const oRi = Math.round(oR) | 0, oBi = Math.round(oB) | 0;
        let sy = y - byy;
        if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
        const srcRow = sy * w, dstRow = y * w;
        for (let x = 0; x < w; x++) {
          const o = (dstRow + x) * 4;
          O[o + 1] = rowSample(T, srcRow, w, x - mx, 1);
          let xr = x - (bsw ? oBi : oRi);
          let xb = x - (bsw ? oRi : oBi);
          if (xr < 0) xr = 0; else if (xr >= w) xr = w - 1;
          if (xb < 0) xb = 0; else if (xb >= w) xb = w - 1;
          O[o] = T[(srcRow + xr) * 4];
          O[o + 2] = T[(srcRow + xb) * 4 + 2];
        }
      }
    }

        if (kScan > 0) {
      const hm = h > 1 ? h - 1 : 1;
      for (let y = 0; y < h; y++) {
        const shade = 0.5 + 0.5 * Math.cos(y * Math.PI);
        const track = Math.exp(-((y - yc) * (y - yc)) * invYh) * (0.3 + 0.7 * (y / hm));
        const mul = (1 - kScan * 0.55 * shade) * (1 + kScan * 0.35 * track);
        const row = y * w * 4;
        for (let x = 0; x < w; x++) {
          const o = row + x * 4;
          O[o] *= mul; O[o + 1] *= mul; O[o + 2] *= mul;
        }
      }
    }

        if (kNoise > 0) {
      const lut = this.gLut || (this.gLut = new Uint8Array(256));
      const rot = h32(seed, idx, 5) & 255;
      for (let i = 0; i < 256; i++) lut[i] = (rnd01(seed, idx, 3000 + i) * 255) | 0;
      const amp = kNoise * 0.9;
            const drops = Math.round(kNoise * 2.4);
      for (let d = 0; d < drops; d++) {
        if (rnd01(seed, idx, 4000 + d) > kNoise * 0.5) continue;
        const val = rnd01(seed, idx, 4400 + d) < 0.6 ? 214 : 26;
        const row = (((rnd01(seed, idx, 4200 + d) * h) | 0)) * w * 4;
        for (let x = 0; x < w; x++) {
          const o = row + x * 4;
          O[o] += (val - O[o]) * 0.75;
          O[o + 1] += (val - O[o + 1]) * 0.75;
          O[o + 2] += (val - O[o + 2]) * 0.75;
        }
      }
      for (let y = 0; y < h; y++) {
        const rowRot = (y * 57) ^ rot, row = y * w * 4;
        for (let x = 0; x < w; x++) {
          const o = row + x * 4;
          const pix = lut[((x * 97) ^ rowRot) & 255] - 128;
          const blk = lut[(((x >> 2) * 13) ^ ((y >> 2) * 7) ^ rot) & 255] - 128;
          const v = (pix * 0.7 + blk * 0.45) * amp;
          O[o] += v * 1.05;
          O[o + 1] += v * 0.85;
          O[o + 2] += v * 1.15;
        }
      }
    }
  }

  _glowNoise() {
    const { sw: w, sh: h } = this;
    const key = `${w}x${h}`;
    const cache = this.glowNoiseCache;
    if (cache && cache.key === key) return cache;
    const n = w * h;
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = rnd01(i, 21, 37);
    const short = Math.min(w, h);
    const nr = Math.max(1, Math.round(short * 0.02));
    const a = boxBlur(f, w, h, nr);
    const b = boxBlur(a, w, h, nr * 2);
    const res = {
      key, a, b,
      a0: quantile(a, 0.02), b0: quantile(b, 0.02),
      aInv: 0, bInv: 0,
    };
    res.aInv = 1 / Math.max(1e-6, quantile(a, 0.98) - res.a0);
    res.bInv = 1 / Math.max(1e-6, quantile(b, 0.98) - res.b0);
    this.glowNoiseCache = res;
    return res;
  }

  _glowField(g) {
    const { sw: w, sh: h, subject } = this;
    const n = w * h;
    if (!n || !subject || subject.length !== n) return null;
    const wantMask = g.outline === 'mask';
    const mi = wantMask
      ? (g.maskLayer >= 0 ? clamp(g.maskLayer | 0, 0, this.masks.length - 1) : this.activeMask)
      : -1;
    const field = wantMask ? this.maskAt(mi) : subject;
    if (!field || field.length !== n) return null;
    let sum = 0;
    for (let i = 0; i < n; i += 1021) sum += field[i];
    const key = `${w}x${h}:${wantMask ? mi : 's'}:${sum.toFixed(4)}:${g.reach.toFixed(5)}`;
    const cache = this.glowCache;
    if (cache && cache.key === key) return cache;

    const line = new Float32Array(n);
    let sx = 0, sy = 0, mass = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const up = (y > 0 ? y - 1 : 0) * w, dn = (y < h - 1 ? y + 1 : h - 1) * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : w - 1;
        const gx = field[row + xp] - field[row + xm];
        const gy = field[dn + x] - field[up + x];
        line[i] = Math.sqrt(gx * gx + gy * gy);
        const v = field[i];
        if (v > 0.02) { mass += v; sx += x * v; sy += y * v; }
      }
    }
    const peak = quantile(line, 0.997);
    if (peak > 1e-4) {
      const s = 1 / peak;
      for (let i = 0; i < n; i++) line[i] = clamp01(line[i] * s);
    }
    const short = Math.min(w, h);
    const r1 = Math.max(1, Math.round(g.reach * short * 0.45));
    const r2 = Math.max(1, Math.round(r1 * 0.65));
    let halo = boxBlur(boxBlur(line, w, h, r1), w, h, r2);
    const hp = quantile(halo, 0.998);
    if (hp > 1e-5) {
      const s = 1 / hp;
      for (let i = 0; i < n; i++) halo[i] = halo[i] * s > 1 ? 1 : halo[i] * s;
    }
    const cx = mass > 0 ? sx / mass : w * 0.5;
    const cy = mass > 0 ? sy / mass : h * 0.5;
    const idxA = new Uint32Array(n), hvA = new Float32Array(n), aiA = new Uint8Array(n), jtA = new Float32Array(n);
    const vyA = new Uint8Array(n);
    const vk = h > 1 ? 255 / (h - 1) : 0;
    let count = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w, dy = y - cy;
      const vy = (y * vk) | 0;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const v = halo[i];
        if (v <= 0.012) continue;
        let a = Math.atan2(dy, x - cx) / TWO_PI + 0.5;
        if (a < 0) a += 1; else if (a >= 1) a -= 1;
        idxA[count] = i;
        hvA[count] = v > 1 ? 1 : v;
        aiA[count] = a >= 1 ? 255 : (a * 256) | 0;
        vyA[count] = vy;
        jtA[count] = rnd01(i, 7, 11) - 0.5;
        count++;
      }
    }
    const res = {
      key, count, cx, cy,
      idx: idxA.subarray(0, count),
      hv: hvA.subarray(0, count),
      ai: aiA.subarray(0, count),
      vy: vyA.subarray(0, count),
      jt: jtA.subarray(0, count),
    };
    this.glowCache = res;
    return res;
  }

  _glow(t, s) {
    const g = s && s.glow;
    const { sw: w, sh: h, out: O } = this;
    if (!g || !g.on || !(g.amount > 0) || !w || !h || !O || O.length !== w * h * 4) return;
    const p = this._glowField(g);
    if (!p || !p.count) return;
    const A = clamp(g.amount, 0, 2);
    const reps = clamp(Math.round(g.speed) || 1, 1, GLOW_MAX_REPS);
    const ph = t * reps;
    const style = g.style;
    const seed = g.seed | 0;
    const c1 = hexRgb(g.color), c2 = hexRgb(g.color2);
    const idx = p.idx, hv = p.hv, ai = p.ai, vy = p.vy, jt = p.jt, n = p.count;
    const curve = this.glowCurve || (this.glowCurve = new Float32Array(256));
    const gamma = 0.55 + clamp01(g.softness) * 3.2;
    for (let i = 0; i < 256; i++) curve[i] = Math.pow(i / 255, gamma);

    if (style === 'rainbow') {
      const W = 256;
      const wheel = this.glowWheel || (this.glowWheel = new Float32Array(W * 3));
      const h0 = rgbHue(c1) + (ph % TWO_PI) / TWO_PI;
      const hh = h0 - Math.floor(h0);
      for (let i = 0; i < W; i++) hsvRgb(hh + i / W, 0.85, 1, wheel, i * 3);
      for (let k = 0; k < n; k++) {
        const e = curve[(hv[k] * 255) | 0];
        const q = e * A;
        if (q <= 0.002) continue;
        const l = ai[k] * 3;
        const hot = e * e * 0.35;
        const o = idx[k] << 2;
        const d = jt[k];
        O[o] += (wheel[l] + (c2[0] - wheel[l]) * hot) * q + d;
        O[o + 1] += (wheel[l + 1] + (c2[1] - wheel[l + 1]) * hot) * q + d;
        O[o + 2] += (wheel[l + 2] + (c2[2] - wheel[l + 2]) * hot) * q + d;
      }
      return;
    }

    if (style === 'flicker') {
      const zones = this.glowZones || (this.glowZones = new Float32Array(8));
      const step = clamp(Math.floor((ph % TWO_PI) * (8 / TWO_PI)), 0, 7);
      for (let z = 0; z < 8; z++) {
        const r = rnd01(seed + z * 7919, z >> 1, step);
        zones[z] = r < 0.16 ? 0.1 : r < 0.36 ? 0.55 : 1;
      }
      for (let k = 0; k < n; k++) {
        const zx = ai[k];
        const z0 = zx >> 5;
        const z1 = (z0 + 1) & 7;
        const lvl = zones[z0] + (zones[z1] - zones[z0]) * ((zx & 31) * 0.03125);
        const q = curve[(hv[k] * 255) | 0] * A * lvl;
        if (q <= 0.002) continue;
        const hot = lvl * lvl;
        const o = idx[k] << 2;
        const d = jt[k];
        O[o] += (c1[0] + (c2[0] - c1[0]) * hot) * q + d;
        O[o + 1] += (c1[1] + (c2[1] - c1[1]) * hot) * q + d;
        O[o + 2] += (c1[2] + (c2[2] - c1[2]) * hot) * q + d;
      }
      return;
    }

    if (style === 'pulse') {
      const u = 0.5 + 0.5 * Math.sin(ph);
      const m = (0.25 + 0.75 * Math.pow(u, 1.6)) * A;
      const cr = c1[0] + (c2[0] - c1[0]) * u;
      const cg = c1[1] + (c2[1] - c1[1]) * u;
      const cb = c1[2] + (c2[2] - c1[2]) * u;
      for (let k = 0; k < n; k++) {
        const q = curve[(hv[k] * 255) | 0] * m;
        if (q <= 0.002) continue;
        const o = idx[k] << 2;
        const d = jt[k];
        O[o] += cr * q + d; O[o + 1] += cg * q + d; O[o + 2] += cb * q + d;
      }
      return;
    }

    if (style === 'fire') {
      const fH = this.glowFireH || (this.glowFireH = new Float32Array(256));
      const fO = this.glowFireO || (this.glowFireO = new Float32Array(256));
      const fW = this.glowFireW || (this.glowFireW = new Float32Array(256));
      const fV = this.glowFireV || (this.glowFireV = new Float32Array(256));
      const NN = this._glowNoise();
      const s1 = rnd01(seed, 1, 5) * TWO_PI;
      const s2 = rnd01(seed, 3, 11) * TWO_PI;
      const short = Math.min(w, h);
      const R1 = Math.max(2, Math.round(short * 0.2));
      const R2 = Math.max(2, Math.round(short * 0.42));
      const nw = NN.a, n0 = NN.a0, ninv = NN.aInv;
      const ccx = p.cx, ccy = p.cy;
      const breathe = 0.85 + 0.15 * Math.sin(ph * 3 + s1);
      for (let i = 0; i < 256; i++) {
        const a = i / 256 * TWO_PI;
        const ca = Math.cos(a), sa = Math.sin(a);
        const n1 = nw[clamp((ccy + sa * R1) | 0, 0, h - 1) * w + clamp((ccx + ca * R1) | 0, 0, w - 1)];
        const n2 = nw[clamp((ccy + sa * R2) | 0, 0, h - 1) * w + clamp((ccx + ca * R2) | 0, 0, w - 1)];
        const nz = clamp01(((n1 - n0) * ninv) * 0.62 + ((n2 - n0) * ninv) * 0.38);
        let v = 0.5 + 0.5 * Math.cos(a * 5 - ph * 2 + s1);
        v = v * 0.66 + 0.34 * (0.5 + 0.5 * Math.cos(a * 11 + ph * 3 + s2));
        v *= v;
        const H = clamp01(0.05 + 1.15 * v * (0.3 + 0.9 * nz));
        fH[i] = 1 / Math.max(0.05, H);
        fO[i] = 1 - 1 / Math.max(0.05, H);
        fW[i] = clamp01((H - 0.18) / 0.34);
        fV[i] = 0.82 + 0.18 * (0.5 + 0.5 * Math.cos(i / 256 * TWO_PI * 4 + ph * 2));
      }
      const d0 = c2[0] - c1[0], d1 = c2[1] - c1[1], d2 = c2[2] - c1[2];
      for (let k = 0; k < n; k++) {
        const j = ai[k], h = hv[k];
        const f = h * fH[j] + fO[j];
        const e = curve[(h * 255) | 0];
        const body = f <= 0 ? 0 : f >= 1 ? 1 : Math.sqrt(f);
        const core = f <= 0 ? 0 : f >= 1 ? 1 : f * f;
        const heat = fV[vy[k]] * (0.55 + 0.45 * (1 - vy[k] * (1 / 255)));
        const q = e * A * breathe * heat * (0.05 + 0.95 * body) * (0.09 + 0.91 * fW[j]);
        if (q <= 0.002) continue;
        const o = idx[k] << 2;
        const d = jt[k];
        O[o] += (c1[0] + d0 * core) * q + d;
        O[o + 1] += (c1[1] + d1 * core) * q + d;
        O[o + 2] += (c1[2] + d2 * core) * q + d;
      }
      return;
    }

    const wave = this.glowWave || (this.glowWave = new Float32Array(256));
    for (let i = 0; i < 256; i++) wave[i] = 0.5 + 0.5 * Math.cos(i / 256 * TWO_PI - ph);
    const dr = c2[0] - c1[0], dg = c2[1] - c1[1], db = c2[2] - c1[2];
    for (let k = 0; k < n; k++) {
      const u = wave[ai[k]];
      const hot = u * u;
      const q = curve[(hv[k] * 255) | 0] * A * (0.12 + 0.88 * hot * u);
      if (q <= 0.002) continue;
      const o = idx[k] << 2;
      const d = jt[k];
      O[o] += (c1[0] + dr * hot) * q + d;
      O[o + 1] += (c1[1] + dg * hot) * q + d;
      O[o + 2] += (c1[2] + db * hot) * q + d;
    }
  }

  _particles(t, s) {
    const list = s && s.particles;
    if (!list || !list.length) return;
    const { sw: w, sh: h, out: O } = this;
    if (!w || !h || !O || O.length !== w * h * 4) return;
            const u = t / TWO_PI;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.on === false || e.amount <= 0 || e.opacity <= 0) continue;
      this._emit(u, e, i);
    }
  }

  _spawnPoints(i, seed) {
    const m = this.pmaskAt(i);
    if (!m || !m.length) return null;
    let sig = 0, n = 0;
    for (let k = 0; k < m.length; k += 97) { sig += m[k]; n++; }
    sig = sig * 31 + n;
    if (!this.pSpawn) this.pSpawn = [];
    const c = this.pSpawn[i];
    if (c && c.sig === sig && c.w === this.sw && c.h === this.sh && c.sd === (seed | 0)) return c.pts;
    const w = this.sw, h = this.sh;
    if (!w || !h) return null;
    const stride = Math.max(1, Math.round(Math.min(w, h) / 150));
    const xs = [], ys = [], cum = [];
    let total = 0, peak = 0;
    for (let y = 0; y < h; y += stride) {
      const row = y * w;
      for (let x = 0; x < w; x += stride) {
        const v = m[row + x];
        if (v <= 0.12) continue;
        xs.push(x); ys.push(y);
        total += v; cum.push(total);
        if (v > peak) peak = v;
      }
    }
    if (!xs.length || peak <= 0.12) { this.pSpawn[i] = { sig, w, h, sd: seed | 0, pts: null }; return null; }
    const N = 256;
    const pts = new Float32Array(N * 2);
    for (let k = 0; k < N; k++) {
      const r = rnd01(seed | 0, k, 71) * total;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
      pts[k * 2] = xs[lo]; pts[k * 2 + 1] = ys[lo];
    }
    this.pSpawn[i] = { sig, w, h, sd: seed | 0, pts };
    return pts;
  }

  _emit(u, e, i) {
    const { sw: w, sh: h } = this;
    const K = kindOf(e.kind);
    const seed = e.seed | 0;
    const n = particleCount(e, w, h);
    const blend = e.blend === 'add' ? 1 : e.blend === 'screen' ? 2 : 0;
    const c1 = hexRgb(e.color), c2 = hexRgb(e.color2);
    const a0 = e.angle * P_DEG;
        const tilt = e.wind * K.tilt * P_DEG;
    const dirx = Math.cos(a0 + tilt), diry = Math.sin(a0 + tilt);
    const spreadR = Math.max(0, e.spread) * P_DEG * 0.5;
    const trips = clamp(Math.round(K.trips * e.speed), 1, 9);
    const sizeBase = K.sizeBase * e.size * h;
    const streakBase = K.streak * e.blur * h;
    const swayAmp = (e.wind * 0.6 + e.turb * 0.4) * K.sway * h;
    const swayDeriv = swayAmp * TWO_PI * K.swayFreq;
    const grav = (K.gravity || 0) * h;
    const depthMin = 1 - clamp01(e.depth);
    const areaTravel = Math.min(w, h) * 0.45 * clamp(e.speed, 0.1, 4);
                const subject = this.subject && this.subject.length === w * h ? this.subject : null;
    const behind = e.behind;
    const flick = K.flicker;
    const FL = K.flash || FLASH_DEFAULTS;
    const flash = e.flash > 0 ? e.flash : 0;
    const form = K.form;
    const grow = K.grow;
    const pts = this._spawnPoints(i, seed);
    if (!pts) return;
    const nPts = pts.length >> 1;

    for (let i = 0; i < n; i++) {
      const birth = rnd01(seed, i, 17);
      const qi = i;
      const z = depthMin + (1 - depthMin) * rnd01(seed, qi, 11);
      const age = (trips * u + birth) % 1;
      const w1 = TWO_PI * (K.swayFreq * age + rnd01(seed, qi, 29));
      const w2 = TWO_PI * (K.swayFreq * 2.7 * age + rnd01(seed, qi, 31));
      const perp = swayAmp * (Math.sin(w1) + 0.5 * e.turb * Math.sin(w2));
                              const dPerp = swayDeriv * (Math.cos(w1) + 0.5 * e.turb * 2.7 * Math.cos(w2));
      const jit = spreadR * (rnd01(seed, qi, 23) * 2 - 1);
      let ux = dirx, uy = diry;
      if (jit !== 0) {
        const cj = Math.cos(jit), sj = Math.sin(jit);
        ux = dirx * cj - diry * sj;
        uy = dirx * sj + diry * cj;
      }
      const qx = -uy, qy = ux;
      let x, y, vx, vy;
      {
        const pi2 = ((qi * 2654435761) >>> 0) % nPts;
        const bx = pts[pi2 * 2], by = pts[pi2 * 2 + 1];
        x = bx + ux * areaTravel * age + qx * perp;
        y = by + uy * areaTravel * age + qy * perp + grav * age * age;
        vx = ux * areaTravel + qx * dPerp;
        vy = uy * areaTravel + qy * dPerp + 2 * grav * age;
      }
      const vlen = Math.sqrt(vx * vx + vy * vy) || 1;
      vx /= vlen; vy /= vlen;
                              let a = e.opacity * (0.45 + 0.55 * z) * smoothstep(0, 0.13, age) * (1 - smoothstep(0.8, 1, age));
      if (flick > 0) a *= 1 - flick * (0.5 + 0.5 * Math.sin(TWO_PI * ((form === 'spark' ? 6 : 2) * u + rnd01(seed, qi, 7))));
                                    let flare = 0, flame = 0;
      if (flash > 0) {
        const d = age - (0.12 + 0.68 * rnd01(seed, qi, 53));
        flare = d < 0 ? Math.exp(d / FL.rise) : Math.exp(-d / FL.decay);
        flame = flash * (1 - FL.scatter * rnd01(seed, qi, 59));
                                        a *= 1 + FL.gain * flame * flare;
                                if (d > 0) a *= 1 - FL.cool * flame * flare;
                                if (blend === 0 && a > 1) a = 1;
      }
      if (behind > 0 && subject) {
        const xi = x | 0, yi = y | 0;
        if (xi >= 0 && yi >= 0 && xi < w && yi < h) a *= 1 - behind * clamp01(subject[yi * w + xi]);
      }
      if (a <= 0.004) continue;

                        let r = sizeBase * (0.55 + 0.9 * z) * (0.45 + 1.15 * rnd01(seed, qi, 13));
      if (grow) r *= 1 + grow * age;
                        let glowEff = e.glow, hot = 0;
      if (flare > 0) {
        r *= 1 + FL.size * flame * flare;
        glowEff += FL.core * flame * flare;
        hot = clamp01(FL.white * flame * flare);
      }
      const dim = form === 'spark' ? 0.62 + 0.38 * rnd01(seed, qi, 5) : 0.7 + 0.3 * rnd01(seed, qi, 5);
                  const streak = streakBase * (form === 'streak' ? 0.45 + 1.5 * rnd01(seed, qi, 37) : form === 'spark' ? 0.22 + 1.9 * rnd01(seed, qi, 37) : 0.6 + 0.8 * rnd01(seed, qi, 37));
      this._drawOne(form, x, y, r, streak, vx, vy, c1, c2, a * dim, glowEff, blend, seed, qi, hot);
    }
  }

      _drawOne(form, x, y, r, streak, dirx, diry, c1, c2, a, glow, blend, seed, i, hot = 0) {
                                    if (hot > 0) c1 = [c1[0] + (255 - c1[0]) * hot, c1[1] + (255 - c1[1]) * hot, c1[2] + (255 - c1[2]) * hot];
    if (form === 'puff') {
                              const phi = Math.atan2(diry, dirx) + (rnd01(seed, i, 43) - 0.5) * 1.3;
      const cx2 = Math.cos(phi), cy2 = Math.sin(phi);
      for (let s = 0; s < 3; s++) {
        const off = r * 0.7 * (1 - s * 0.8) * (0.7 + 0.6 * rnd01(seed, i, 47 + s));
        const rr = r * (s === 0 ? 0.95 : s === 1 ? 0.62 : 0.34);
        const mix = s * 0.3;
        this._blob(x + cx2 * off, y + cy2 * off, rr,
          c2[0] + (c1[0] - c2[0]) * (1 - mix), c2[1] + (c1[1] - c2[1]) * (1 - mix), c2[2] + (c1[2] - c2[2]) * (1 - mix),
          a * (s === 0 ? 0.55 : s === 1 ? 0.75 : 1) * 0.8, 0, blend);
      }
      return;
    }
    if (form === 'ring') {
                              const seg = clamp(Math.ceil(TWO_PI * r / 0.85), 8, 32);
      const rr = Math.max(0.8, (TWO_PI * r / seg) * 0.85);
                  this._blob(x, y, r * 0.86, c1[0], c1[1], c1[2], a * 0.14, 0, blend);
      for (let k = 0; k < seg; k++) {
        const th = TWO_PI * (k + 0.5) / seg;
        this._blob(x + Math.cos(th) * r, y + Math.sin(th) * r, rr, c1[0], c1[1], c1[2], a * 0.9, 0, blend);
      }
      this._blob(x - r * 0.35, y - r * 0.35, Math.max(0.8, r * 0.38), 255, 255, 255, a, 0, blend);
      this._blob(x + r * 0.28, y + r * 0.34, Math.max(0.7, r * 0.26), c2[0], c2[1], c2[2], a * 0.55, 0, blend);
      return;
    }
    if (form === 'spark') {
      const steps = clamp(Math.ceil(streak / Math.max(0.4, r * 0.42)), 4, 64);
      const head = Math.min(1.5, a * 1.7);
      const hr = c1[0] + (c2[0] - c1[0]) * 0.5, hg = c1[1] + (c2[1] - c1[1]) * 0.5, hb = c1[2] + (c2[2] - c1[2]) * 0.5;
      for (let k = steps; k >= 1; k--) {
        const f = k / steps;
        const back = 1 - f;
        const mix = Math.pow(back, 0.8) * 0.62;
        const cr = c2[0] + (c1[0] - c2[0]) * mix;
        const cg = c2[1] + (c1[1] - c2[1]) * mix;
        const cb = c2[2] + (c1[2] - c2[2]) * mix;
        const sput = 0.78 + 0.44 * rnd01(seed, i * 71 + k * 131, 61);
        this._blob(x - dirx * streak * f, y - diry * streak * f,
          Math.max(0.62, r * (0.18 + 0.62 * back)), cr, cg, cb,
          head * (0.12 + 0.88 * Math.pow(back, 1.15)) * 0.4 * sput, 0, blend);
      }
      this._blob(x, y, r * 2.4, hr, hg, hb, head * 0.3, glow * 0.85, blend);
      this._blob(x - dirx * r * 0.6, y - diry * r * 0.6, r * 1.05, hr, hg, hb, head * 0.8, glow, blend);
      this._blob(x - dirx * r * 1.3, y - diry * r * 1.3, r * 0.8, hr, hg, hb, head * 0.45, glow * 0.6, blend);
      this._blob(x, y, r * 1.3, c1[0], c1[1], c1[2], head, glow, blend);
      return;
    }
                        const thin = form === 'streak';
    if (streak > 1) {
      const steps = clamp(Math.ceil(streak / Math.max(0.7, r * 1.25)), 2, 32);
      for (let k = steps; k >= 1; k--) {
        const f = k / steps;
        const back = 1 - f;
        const cr = c2[0] + (c1[0] - c2[0]) * back;
        const cg = c2[1] + (c1[1] - c2[1]) * back;
        const cb = c2[2] + (c1[2] - c2[2]) * back;
        const aa = a * (thin ? 0.25 + 0.75 * back : 0.15 + 0.85 * back);
        this._blob(x - dirx * streak * f, y - diry * streak * f, r * (thin ? 1 - 0.3 * f : 0.4 + 0.6 * back),
          cr, cg, cb, aa, 0, blend);
      }
    }
    this._blob(x, y, r, c1[0], c1[1], c1[2], a, glow, blend);
  }

                  _blob(cx, cy, r, cr, cg, cb, a, glow, blend) {
    const { sw: w, sh: h, out: O } = this;
    if (!(a > 0.002) || !(r > 0)) return;
    if (r < 0.45) {
            const x = Math.round(cx), y = Math.round(cy);
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const o = (y * w + x) * 4;
      if (blend === 1) { O[o] += cr * a; O[o + 1] += cg * a; O[o + 2] += cb * a; }
      else if (blend === 2) {
        O[o] += (255 - O[o]) * a * cr * 0.00392156862745098;
        O[o + 1] += (255 - O[o + 1]) * a * cg * 0.00392156862745098;
        O[o + 2] += (255 - O[o + 2]) * a * cb * 0.00392156862745098;
      } else {
        const ia = 1 - a;
        O[o] = O[o] * ia + cr * a; O[o + 1] = O[o + 1] * ia + cg * a; O[o + 2] = O[o + 2] * ia + cb * a;
      }
      return;
    }
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
    if (x0 > x1 || y0 > y1) return;
    const st = r >= 120 ? 4 : r >= 56 ? 3 : r >= 26 ? 2 : 1;
    const ir2 = 1 / (r * r);
    const g = glow > 0 ? glow : 0;
    for (let y = y0; y <= y1; y += st) {
      const dy = y - cy, dy2 = dy * dy;
      const yEnd = y + st - 1 < y1 ? y + st - 1 : y1;
      for (let x = x0; x <= x1; x += st) {
        const dx = x - cx;
        const d2 = (dx * dx + dy2) * ir2;
        if (d2 >= 1) continue;
        const f = 1 - d2;
        let wgt = f * (0.35 + 0.65 * f);
                        if (g) { const c = 1 - d2 * 2.6; if (c > 0) wgt += g * c * c; }
        let aa = a * wgt;
        if (aa <= 0.002) continue;
        if (aa > 1) aa = 1;
        const xEnd = x + st - 1 < x1 ? x + st - 1 : x1;
        if (blend === 1) {
          const ar = cr * aa, ag = cg * aa, ab = cb * aa;
          for (let yy = y; yy <= yEnd; yy++) {
            let o = yy * w * 4 + x * 4;
            for (let xx = x; xx <= xEnd; xx++, o += 4) { O[o] += ar; O[o + 1] += ag; O[o + 2] += ab; }
          }
        } else if (blend === 2) {
          for (let yy = y; yy <= yEnd; yy++) {
            let o = yy * w * 4 + x * 4;
            for (let xx = x; xx <= xEnd; xx++, o += 4) {
              O[o] += (255 - O[o]) * aa * cr * 0.00392156862745098;
              O[o + 1] += (255 - O[o + 1]) * aa * cg * 0.00392156862745098;
              O[o + 2] += (255 - O[o + 2]) * aa * cb * 0.00392156862745098;
            }
          }
        } else {
          const ia = 1 - aa, mr = cr * aa, mg = cg * aa, mb = cb * aa;
          for (let yy = y; yy <= yEnd; yy++) {
            let o = yy * w * 4 + x * 4;
            for (let xx = x; xx <= xEnd; xx++, o += 4) {
              O[o] = O[o] * ia + mr; O[o + 1] = O[o + 1] * ia + mg; O[o + 2] = O[o + 2] * ia + mb;
            }
          }
        }
      }
    }
  }
}
