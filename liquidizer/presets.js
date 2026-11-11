import { MAX_LAYERS, LAYER_VIEW_KEYS, GLITCH_STYLES, makeEmitter } from './engine.js';

const glitchStyle = id => Object.assign({ on: true }, (GLITCH_STYLES.find(s => s.id === id) || {}).patch);

const emitter = (kind, patch) => Object.assign(makeEmitter(kind), patch || {});

export const PRESETS = [
  {
    id: 'gentle', name: 'Gentle breath',
    patch: { mode: 'breathing', ampFrac: 0.016, speed: 1, chestOn: true, chestAmt: 0.45, timeline: 'loop', maskSource: 'auto' },
  },
  {
    id: 'deep', name: 'Deep breath',
    patch: { mode: 'breathing', ampFrac: 0.032, speed: 1, chestOn: true, chestAmt: 0.7, timeline: 'loop', maskSource: 'auto' },
  },
  {
    id: 'ocean', name: 'Ocean swell',
    patch: { mode: 'wave', ampFrac: 0.028, speed: 1, waveFreq: 1.5, maskSource: 'auto' },
  },
  {
    id: 'ripple', name: 'Fine ripple',
    patch: { mode: 'wave', ampFrac: 0.014, speed: 2, waveFreq: 4.2, maskSource: 'auto' },
  },
  {
    id: 'hairwind', name: 'Hair in wind',
    patch: { mode: 'flow', ampFrac: 0.02, speed: 2, flowDir: -32, flowFreq: 1.7, flowRamp: 0.75, maskSource: 'auto' },
  },
  {
    id: 'underwater', name: 'Underwater',
    patch: { mode: 'flow', ampFrac: 0.026, speed: 1, flowDir: 88, flowFreq: 2.6, flowRamp: 0.4, maskSource: 'auto' },
  },
  {
    id: 'risingflames', name: 'Rising flames',
    patch: { mode: 'flames', ampFrac: 0.05, speed: 1, flameFlicker: 0.6, flameSpread: 0.5, flameSway: 0.5, maskSource: 'auto' },
  },
  {
    id: 'candle', name: 'Candle sway',
    patch: { mode: 'sway', ampFrac: 0.03, speed: 1, swayPivotX: 0.5, swayPivotY: 1, timeline: 'boomerang', maskSource: 'auto' },
  },
  {
    id: 'pulse', name: 'Pulse zoom',
    patch: { mode: 'zoom', ampFrac: 0.022, speed: 1, zoomFocusX: 0.5, zoomFocusY: 0.45, zoomDir: 1, maskSource: 'auto' },
  },
  {
    id: 'portrait3d', name: 'Portrait 3D',
    patch: { mode: 'depth', ampFrac: 0.03, speed: 1, depthAmount: 0.5, depthPan: 0.5, depthBias: 0.6, maskSource: 'auto' },
  },
  {
    id: 'dreamdolly', name: 'Dreamy dolly',
    patch: { mode: 'depth', ampFrac: 0.045, speed: 1, depthAmount: 0.9, depthPan: 0.85, depthBias: 0.35, maskSource: 'auto' },
  },
  {
    id: 'glitchdrift', name: 'Datamosh drift',
    patch: {
      mode: 'flow', ampFrac: 0.024, speed: 2, flowDir: -30, flowFreq: 1.8, flowRamp: 0.7,
      timeline: 'loop', maskSource: 'auto', glitch: glitchStyle('datamosh'),
    },
  },
  {
    id: 'vhsportrait', name: 'VHS portrait',
    patch: {
      mode: 'breathing', ampFrac: 0.018, speed: 1, chestOn: true, chestAmt: 0.4,
      timeline: 'loop', maskSource: 'auto', glitch: glitchStyle('vhs'),
    },
  },
      {
    id: 'layeredportrait', name: 'Layered portrait',
    patch: {
      timeline: 'loop',
      layers: [
        { name: 'Base breath', mode: 'breathing', ampFrac: 0.014, speed: 1, chestOn: true, chestAmt: 0.35, maskSource: 'auto', opacity: 1 },
        { name: 'Hair drift', mode: 'flow', ampFrac: 0.02, speed: 2, flowDir: -30, flowFreq: 1.7, flowRamp: 0.75, maskSource: 'auto', opacity: 0.85 },
      ],
    },
  },
  {
    id: 'deepdrift', name: '3D + hair drift',
    patch: {
      timeline: 'loop',
      layers: [
        { name: 'Dolly', mode: 'depth', ampFrac: 0.032, speed: 1, depthAmount: 0.5, depthPan: 0.55, depthBias: 0.6, maskSource: 'auto', opacity: 1 },
        { name: 'Hair drift', mode: 'flow', ampFrac: 0.018, speed: 2, flowDir: -28, flowFreq: 1.8, flowRamp: 0.7, maskSource: 'auto', opacity: 0.55 },
        { name: 'Breath', mode: 'breathing', ampFrac: 0.012, speed: 1, chestOn: true, chestAmt: 0.3, maskSource: 'auto', opacity: 0.4 },
      ],
    },
  },
      {
    id: 'emberglow', name: 'Ember glow',
    patch: {
      mode: 'flow', ampFrac: 0.016, speed: 1, flowDir: -20, flowFreq: 1.6, flowRamp: 0.65,
      timeline: 'loop', maskSource: 'auto',
      particles: [
        emitter('smoke', { amount: 0.7, opacity: 0.45 }),
        emitter('embers', { amount: 1 }),
      ],
    },
  },
  {
    id: 'snowfall', name: 'Snowfall',
    patch: {
      mode: 'wave', ampFrac: 0.012, speed: 1, waveFreq: 1.4,
      timeline: 'loop', maskSource: 'auto',
      particles: [
        emitter('snow', { amount: 1.1 }),
        emitter('dust', { amount: 0.5, opacity: 0.5 }),
      ],
    },
  },
  {
    id: 'rainmist', name: 'Rain & mist',
    patch: {
      mode: 'flow', ampFrac: 0.014, speed: 1, flowDir: 74, flowFreq: 2.4, flowRamp: 0.35,
      timeline: 'loop', maskSource: 'auto',
      particles: [
        emitter('smoke', { amount: 0.5, angle: -86, speed: 0.4, opacity: 0.3, color: '#9fb4c8' }),
        emitter('rain', { amount: 1 }),
      ],
    },
  },
];

export function applyPreset(settings, preset) {
  const p = preset.patch || preset;
  for (const k of Object.keys(p)) {
    const v = p[k];
    if (k === 'layers' && Array.isArray(v)) {
            settings.layers = v.slice(0, MAX_LAYERS);
      settings.activeLayer = 0;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) settings[k] = Object.assign({}, settings[k], v);
    else settings[k] = v;
  }
  return settings;
}

function b64url(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeShare(payload) {
  const deflate = compact(payload);
  return b64url(new TextEncoder().encode(JSON.stringify(deflate)));
}

export function decodeShare(str) {
  try {
    return JSON.parse(new TextDecoder().decode(fromB64url(str)));
  } catch (err) {
    return null;
  }
}

function compact(state) {
  const out = { v: 2 };
  const s = state.settings || {};
  const layered = Array.isArray(s.layers) && s.layers.length > 0;
  const keep = {};
  for (const k of Object.keys(s)) {
    if (k === 'brushMode') continue;
        if (layered && (k === 'maskSource' || LAYER_VIEW_KEYS.indexOf(k) !== -1)) continue;
    keep[k] = shape(s[k]);
  }
  out.s = keep;
  if (state.masks) out.m = state.masks;
  else if (state.mask) out.m = state.mask;
  if (state.spawnMasks) out.pm = state.spawnMasks.map(x => (x == null ? null : shape(x)));
  if (state.img) out.i = state.img;
  return out;
}

function shape(v) {
  if (Array.isArray(v)) return v.map(shape);
  if (!v || typeof v !== 'object') return v;
  const sub = {};
  for (const k of Object.keys(v)) sub[k] = shape(v[k]);
  return sub;
}

export function readHashShare() {
  const h = (location.hash || '').replace(/^#/, '');
  if (!h) return null;
  const params = new URLSearchParams(h);
  const p = params.get('p');
  if (!p) return null;
  const data = decodeShare(p);
  return data && data.v ? data : null;
}

export function shareUrl(payload) {
  const name = window.generatorName || 'liquidizer';
  return `https://perchance.org/${name}#p=${encodeShare(payload)}`;
}
