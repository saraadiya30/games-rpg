import {
  MotionEngine, MODES, MAX_LAYERS, defaultSettings, makeLayer, installLayerView,
  GLITCH_EFFECTS, GLITCH_STYLES, GLOW_STYLES, GLOW_OUTLINES, PARTICLE_KINDS, PARTICLE_BLENDS, MAX_EMITTERS, FLASH_DEFAULTS,
  makeEmitter, particleCount, kindArea,
  clamp, clamp01, TWO_PI, layerCycles, MAX_LAYER_CYCLES, normalizeTempo, MIN_TEMPO, MAX_TEMPO,
} from './engine.js';
import { FORMATS, ASPECTS, OPTIMISERS, findOptimiser, bitrateFor, frameCount, encodeFrames, exportPlan } from './exporter.js';
import { PRESETS, applyPreset, shareUrl, readHashShare } from './presets.js';
import * as models from './models.js';
import * as assets from './asset-cache.js';
import { writeZip, readZip } from './zip.js';

const CFG = (() => { try { return (root && root.liquidizerConfig) || {}; } catch (_) { return {}; } })();
const WORK_MAX = num(CFG.workMax, 512);
const FULL_MAX = num(CFG.fullMax, 2560);
const SHARE_IMG_MAX = 1400;

const SAMPLE_URL = CFG.sampleUrl || 'https://user.uploads.dev/file/520ceacda87ae00ad4b2d07d9c02ff7d.jpg';
const SAMPLE_PROJECT = CFG.sampleProject || 'src/sample.liquidizer.json';
const SAMPLE_AUTO = CFG.sampleAuto == null ? true : !!CFG.sampleAuto;
const SAMPLE_NAME = 'Sample';
const SAMPLE_FOLDER = 'liquidizerSample';
const SAMPLE_CACHE_KEY = 'builtIn';
let sampleCache = null;

function isSampleName(name) {
  return String(name == null ? '' : name).trim().toLowerCase() === SAMPLE_NAME.toLowerCase();
}

function sampleStore() { try { return root.kv[SAMPLE_FOLDER]; } catch (_) { return null; } }

const S = {
  settings: defaultSettings(),
  eng: new MotionEngine(),
  w: 0, h: 0,
  full: null,
  source: null,
  ctx: null, maskCtx: null, maskImgData: null, imageData: null,
  maskWash: null, washU32: null, outU32: null,
  overlayStrength: 1, antShift: 0, antLast: 0, ovEdgeN: 0, ovDash: 4, ovEdgeAlpha: 1,
  viewScale: 0,
  playing: true,
  phase: 0,
  animTime: 0,
  lastTs: 0,
  fps: 60,
  pick: null,
  painting: false,
  strokeFrom: null,
  undo: [], redo: [],
  maskDirty: true,
  lastExport: null,
  busy: false,
  scrubActive: false,
      libs: models.readPrefsSync(),
  libsReport: null,
  depth: null,
  depthBusy: false,
  depthCancel: false,
  syncFns: [],
};

const $ = id => document.getElementById(id);
const el = {};
const IDS = [
  'stageWrap', 'stage', 'stageCanvas', 'maskCanvas', 'dropzone',
  'placeBar', 'placeTint', 'placeTextEl', 'placeDoneBtn', 'pickSwayMark', 'pickZoomMark',
  'browseBtn', 'lq-sampleBtn', 'chooseBtn', 'sampleBtn2',
  'lq-fileInput', 'aiPromptInput', 'aiResSelect', 'aiGenBtn', 'aiStatusEl', 'imgStatusEl',
  'playPauseBtn', 'scrub', 'timeEl', 'fpsEl', 'infoEl', 'showMaskChk',
  'menuWrap', 'menuBtn', 'menuPanel', 'themeBtn', 'themeLabel', 'themeIcon',
  'timelineSeg', 'tempoInput', 'modeGrid', 'modeHintEl', 'presetGrid',
  'layerList', 'layerAddBtn', 'layerOpacity', 'layerOpacityVal', 'maskTargetSel', 'maskSwatch',
  'maskOverlay',
  'ampInput', 'speedInput', 'chestChk', 'chestAmt', 'waveFreq', 'flowDir', 'flowFreq', 'flowRamp',
  'flameFlicker', 'flameSpread', 'flameSway',
  'pickSwayBtn', 'swayPosEl', 'pickZoomBtn', 'zoomPosEl', 'zoomDirSel', 'depthAmount', 'depthPan', 'depthBias',
  'depthSrcSel', 'depthComputeBtn', 'depthCancelBtn', 'depthStatusEl', 'depthThumb', 'depthBands', 'depthBandsVal', 'depthBandsBtn',
  'breathOpts', 'waveOpts', 'flowOpts', 'flameOpts', 'swayOpts', 'zoomOpts', 'depthOpts',
  'brushSeg', 'brushSize', 'brushFlow', 'brushHardness', 'symmetryChk', 'autoSens',
  'autoMaskBtn', 'invertMaskBtn', 'growBtn', 'featherBtn', 'clearMaskBtn', 'lq-undoBtn', 'lq-redoBtn', 'maskStatusEl',
  'glitchOnChk', 'glitchAmount', 'glitchBurst', 'glitchRate', 'glitchStyles', 'glitchGrid',
  'glitchSeedBtn', 'glitchStatusEl', 'glitchAmountVal', 'glitchBurstVal', 'glitchRateVal',
  'glowOnChk', 'glowSrcSel', 'glowLayerSel', 'glowLayerRow', 'glowStyles', 'glowAmount', 'glowReach', 'glowSoftness', 'glowSpeed',
  'glowColor1', 'glowColor2', 'glowSeedBtn', 'glowStatusEl',
  'glowAmountVal', 'glowReachVal', 'glowSoftnessVal', 'glowSpeedVal',
  'fxList', 'fxAddBtn', 'fxEmptyEl', 'fxEditCtn', 'fxKindGrid', 'fxBlendSel', 'fxColor1', 'fxColor2',
  'fxAreaBtn',
  'fxAmount', 'fxSize', 'fxSpeed', 'fxAngle', 'fxSpread', 'fxWind', 'fxTurb', 'fxBlur', 'fxGlow',
  'fxFlash', 'fxOpacity', 'fxDepth', 'fxBehind', 'fxSeedBtn', 'fxStatusEl',
  'fxAmountVal', 'fxSizeVal', 'fxSpeedVal', 'fxAngleVal', 'fxSpreadVal', 'fxWindVal', 'fxTurbVal',
  'fxBlurVal', 'fxGlowVal', 'fxFlashVal', 'fxOpacityVal', 'fxDepthVal', 'fxBehindVal',
  'fmtSelect', 'resSelect', 'aspectSelect', 'fpsSelect', 'lenModeSelect', 'lenCyclesRow', 'lenSecsRow', 'cyclesSelect',
  'durInput', 'lenNoteEl', 'speedSelect', 'qualityInput', 'padSelect',
  'optSelect', 'optTargetInput', 'optTargetRow', 'optNoteEl',
  'transparentChk', 'wmChk', 'wmText', 'exportHintEl', 'exportRunBtn', 'exportStatusEl',
  'uploadExportBtn', 'uploadExportStatusEl',
  'exportModal', 'exportTitle', 'progressBar', 'exportSub', 'cancelExportBtn', 'exportSpinner',
  'exportResultCtn', 'exportVideoEl', 'exportResultInfo', 'exportDownloadBtn', 'exportCloseBtn',
  'uploaderBtn', 'uploaderOverlay', 'uploaderFrame', 'uploaderCloseBtn', 'uploaderNote',
  'uploadedModal', 'uploadedSub', 'uploadedUrl', 'uploadedCopyBtn', 'uploadedOpenBtn', 'uploadedCloseBtn', 'uploadedNote',
  'saveNameInput', 'saveBtn', 'shareBtn', 'shareImgChk', 'shareOut', 'projectList', 'projectListLabel',
  'projectSaveFileBtn', 'projectOpenFileBtn', 'projectFileInput', 'projectFileStatusEl', 'projectUploadBtn',
  'libsCard', 'useModelsChk', 'useVideoLibChk', 'libsStatusEl', 'libsInfoBtn', 'infoBtn',
  'libsModal', 'libsCloseBtn', 'libsSummaryEl', 'libsTableCtn', 'libsCheckBtn', 'libsClearBtn', 'libsCopyBtn', 'libsNote',
  'aboutBtn', 'aboutModal', 'aboutCloseBtn',
  'toast',
  'ampVal', 'speedVal', 'chestAmtVal', 'waveFreqVal', 'flowDirVal', 'flowFreqVal', 'flowRampVal',
  'depthAmountVal', 'depthPanVal', 'depthBiasVal',
  'brushSizeVal', 'brushFlowVal', 'brushHardnessVal',
  'autoSensVal', 'qualityVal', 'maskOverlayVal',
];

function liqRootEl() { return document.getElementById('liq-root'); }
function collect() {
  for (const id of IDS) el[id] = $(id);
}

function toast(msg, ms = 2600) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), ms);
}

function icon(id, extraClass) {
  return '<svg class="ic' + (extraClass ? ' ' + extraClass : '') + '"><use href="#' + id + '"/></svg>';
}

function num(v, dflt) {
  if (v == null) return dflt;
  const s = typeof v === 'object' && v.evaluateItem != null ? String(v.evaluateItem) : String(v);
  const n = Number(s);
  return Number.isFinite(n) ? n : dflt;
}

function clipTempo() { return normalizeTempo(S.settings.timelineSpeed); }
function cycleSeconds() { return TWO_PI / clipTempo(); }
function visualPeriod() { return S.settings.timeline === 'boomerang' ? cycleSeconds() * 2 : cycleSeconds(); }

const MAX_CLIP_SECONDS = 30;

function lenMode() { return el.lenModeSelect && el.lenModeSelect.value === 'seconds' ? 'seconds' : 'cycles'; }

function requestedSeconds() {
  const v = parseFloat(el.durInput.value);
  return clamp(Number.isFinite(v) ? v : MAX_CLIP_SECONDS, 1, MAX_CLIP_SECONDS);
}

function lengthCycles() {
  if (lenMode() === 'seconds') return Math.max(1, Math.round(requestedSeconds() * exportSpeed() / visualPeriod()));
  const n = parseInt(el.cyclesSelect.value, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function clipSeconds(cycles) { return cycles * visualPeriod() / exportSpeed(); }

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function setStatus(node, msg, kind) {
  node.textContent = msg;
  node.className = kind ? 'sub ' + kind : 'sub';
}

function busyStatus(node, msg) {
  node.innerHTML = '<span class="spin-dot"></span> ' + msg;
  node.className = 'sub';
}

function selectOptions(select, items, valueId, labelId) {
  select.innerHTML = '';
  for (const it of items) {
    const o = document.createElement('option');
    o.value = String(valueId(it));
    o.textContent = labelId(it);
    select.appendChild(o);
  }
}

function debounce(fn, ms) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const refreshAutoMask = debounce(() => { if (S.w) rebuildAutoMasks(true); }, 180);

async function drawableFrom(src) {
  if (typeof src === 'string') {
                    if (/^https?:/i.test(src)) {
      try { return await createImageBitmap(await assets.fetchBlob(src)); } catch (_) {   }
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('the image could not be loaded'));
      img.src = src;
    });
    return img;
  }
  if (src instanceof Blob) {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(src);
    const url = URL.createObjectURL(src);
    try { return await drawableFrom(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }
  return src;
}

function sizeOf(src) {
  return {
    w: src.naturalWidth || src.width,
    h: src.naturalHeight || src.height,
  };
}

async function useSource(src, label, opts = {}) {
  const fresh = opts.fresh === true;
  const drawable = await drawableFrom(src);
  const { w: iw, h: ih } = sizeOf(drawable);
  if (!iw || !ih) throw new Error('that image has no pixels');
      S.srcSize = { w: iw, h: ih };
        S.srcBlob = src instanceof Blob ? src : null;

  const wm = Math.min(1, WORK_MAX / Math.max(iw, ih));
  const w = Math.max(16, Math.round(iw * wm / 2) * 2);
  const h = Math.max(16, Math.round(ih * wm / 2) * 2);
  const wc = document.createElement('canvas');
  wc.width = w; wc.height = h;
  const wctx = wc.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(drawable, 0, 0, w, h);
  let workData;
  try {
    workData = wctx.getImageData(0, 0, w, h);
  } catch (err) {
    throw new Error('this image cannot be read (it is not CORS-enabled)');
  }

  const fm = Math.min(1, FULL_MAX / Math.max(iw, ih));
  const fw = Math.max(16, Math.round(iw * fm));
  const fh = Math.max(16, Math.round(ih * fm));
  const fc = document.createElement('canvas');
  fc.width = fw; fc.height = fh;
  const fctx = fc.getContext('2d', { willReadFrequently: true });
  fctx.drawImage(drawable, 0, 0, fw, fh);
  const fullData = fctx.getImageData(0, 0, fw, fh);

  if (fresh) {
    S.settings = installLayerView(defaultSettings());
    S.maskDirty = true;
  }
  S.w = w; S.h = h;
  el.stageCanvas.width = w; el.stageCanvas.height = h;
  S.ctx = el.stageCanvas.getContext('2d', { willReadFrequently: true });
  el.maskCanvas.width = w; el.maskCanvas.height = h;
  S.maskCtx = el.maskCanvas.getContext('2d');
  S.maskImgData = S.maskCtx.createImageData(w, h);
  S.imageData = null;

  S.eng.setSource(workData.data, w, h);
  S.full = { data: fullData.data, w: fw, h: fh };
  S.source = wc;
  S.undo = []; S.redo = []; S.phase = 0; S.animTime = 0;
  clearDepthField();
  syncDepthUI();

  el.stage.hidden = false;
  el.dropzone.hidden = true;
  el.maskCanvas.hidden = !el.showMaskChk.checked;
  setTransportReady(true);

  fitStage();
  syncLayerMasks();
  S.eng.selectMask(S.settings.activeLayer);
  rebuildMasksForImage();
  if (fresh) { syncAll(); updateTimelineButtons(); } else syncLayerUI();
  S.maskDirty = true;
  updateMaskStatus();
  updateInfo();
  setStatus(el.imgStatusEl, `${label} · ${iw}×${ih} (working ${w}×${h})`, 'good');
  if (fresh) toast('New picture — nothing is moving yet. Pick an effect in the Motion card, then paint where it should move.');
}

async function loadUrl(url, label, opts) {
  try {
    await useSource(url, label, opts);
  } catch (err) {
    toast(String(err.message || err));
    throw err;
  }
}

// How much vertical room the controls under the photo are taking right now (they appear, disappear and
// change height: the place bar only stands while the brush is on a target, the tempo row only for some
// effects). Measured rather than guessed, because guessing is how the photo ended up sized for a window
// that did not exist. The bar is counted separately from the transport/timeline/tempo rows because the
// bar is *the instruction* for what the finger is doing and the others are not.
function stageOverheadParts() {
  let controls = 0;
  for (const node of [document.querySelector('.zoomBar'), $('timelineSeg'), $('tempoRow')]) {
    if (node && !node.hidden) controls += node.offsetHeight + 10;
  }
  const bar = el.placeBar && !el.placeBar.hidden ? el.placeBar.offsetHeight + 10 : 0;
  return { bar, controls };
}

// The height the user can actually see. `visualViewport` when it exists (it is the one that moves when a
// phone's URL bar or keyboard does), but *never* larger than `innerHeight`: the two can disagree for a
// frame or two while the window is being resized, and taking the larger one sizes the photo for a window
// that is not there — the photo ends up below the fold, which is the bug this whole pass exists to kill.
function viewportHeight() {
  const vp = window.visualViewport;
  const cands = [window.innerHeight || 0, vp && vp.height ? vp.height : 0].filter(n => n > 0);
  return cands.length ? Math.round(Math.min.apply(null, cands)) : 0;
}

// What fitStage() depends on. Checked from the render loop so a window that changes size without ever
// firing a resize the page hears (the editor rescaling its preview pane) still gets a fitting photo.
// Deliberately *only* the window and the controls around the photo — never the photo's own box. The
// stage hugs the photo, so keying on the photo's width would make the photo's height decide the key
// that decides the photo's height: a feedback loop that re-sizes the picture forever.
function stageFitKey() {
  const vp = window.visualViewport;
  let k = viewportHeight() + '|' +
    Math.round((vp && vp.width) || window.innerWidth || 0);
  for (const node of [document.querySelector('.zoomBar'), $('timelineSeg'), $('tempoRow'), el.placeBar]) {
    k += '|' + (node && !node.hidden ? node.offsetHeight : 0);
  }
  return k;
}

// The photo is sized to the window it is *actually* in — `visualViewport` when the browser exposes it,
// because on a phone the layout viewport (and therefore `vh`) does not move when the URL bar or the
// keyboard does, so a `vh`-based size can be half again as tall as what the user can see. One scale
// factor drives both dimensions, so the picture is never stretched.
function fitStage() {
  if (!S.w) return;
  const vh = Math.max(150, viewportHeight());
  const head = (document.querySelector('header.topbar') || {}).offsetHeight || 62;
  const availW = Math.max(180, el.stageWrap.clientWidth - 30);
  // The floor matters: the photo has to be able to fit inside the *window* even when the window is tiny
  // (a phone in the editor with the chat panel open can leave a couple of hundred pixels), because a
  // photo taller than the window can never be brought fully into view — and a photo you cannot see is a
  // photo you cannot brush.
  const room = Math.max(100, vh - head - 46); // 46 = the stage box's own 2x14px padding + 18px of breathing room
  const { bar, controls } = stageOverheadParts();
  // The photo comes first. If keeping the transport, timeline and tempo row on screen would leave a
  // picture too small to paint on (a phone in the editor gives the whole app a couple of hundred px),
  // the photo takes the room and those controls wait just below the fold — during a stroke they are not
  // what the finger is doing, and the instruction bar stays either way.
  const availH = Math.max(100, room - bar - (controls <= room - bar - 190 ? controls : 0));
  const scale = Math.min(availW / S.w, availH / S.h, 3);
  const cw = Math.max(80, Math.round(S.w * scale));
  const ch = Math.max(80, Math.round(S.h * scale));
  el.stageCanvas.style.width = cw + 'px';
  el.stageCanvas.style.height = ch + 'px';
      const sc = cw / S.w;
  if (!el.maskCanvas.hidden && Math.abs(sc - (S.viewScale || 0)) > 0.005) { S.maskDirty = true; paintMaskOverlay(); }
  S.viewScale = sc;
}

function drawFrame() {
  if (!S.w || !S.eng.src) return;
  const s = S.settings;
  const phase = S.phase;
  const ampMul = 1;
  const out = S.eng.render(phase, s, { ampMul });
  if (!S.imageData) S.imageData = new ImageData(out, S.w, S.h);
  S.ctx.putImageData(S.imageData, 0, 0);
  if (!el.maskCanvas.hidden && S.maskDirty) paintMaskOverlay();
}

const OVERLAY_FILL = 0.45, OVERLAY_OFF_SCALE = 0.4;
const OVERLAY_HATCH = 0.42, OVERLAY_HATCH_MIN = 0.45;
const OVERLAY_HATCH_DARK = 0.55;
const OVERLAY_EDGE = 0.92;
const OVERLAY_EDGE_THRESH = 0.2;
const OVERLAY_MIN = 0.015;
const OVERLAY_HATCH_CSS = 11;
const OVERLAY_EDGE_CSS = 2.6;
const OVERLAY_DASH_CSS = 5;
const OVERLAY_DARK = [16, 17, 22];
const ANT_STEP_MS = 110;

function overlayScale() {
  const cw = el.stageCanvas ? el.stageCanvas.clientWidth : 0;
  return S.w && cw ? clamp(cw / S.w, 0.05, 4) : 1;
}

function paintMaskOverlay() {
  const eng = S.eng, ls = S.settings.layers;
  const w = S.w, h = S.h;
  if (!w || !S.maskCtx) return;
  const st = S.overlayStrength == null ? 1 : S.overlayStrength;

  if (!S.maskWash || S.maskWash.width !== w || S.maskWash.height !== h) {
    S.maskWash = S.maskCtx.createImageData(w, h);
    S.washU32 = null;
  }
  if (!S.washU32 || S.washU32.buffer !== S.maskWash.data.buffer) S.washU32 = new Uint32Array(S.maskWash.data.buffer);
  if (!S.maskImgData || S.maskImgData.width !== w || S.maskImgData.height !== h) {
    S.maskImgData = S.maskCtx.createImageData(w, h);
    S.outU32 = null;
  }
      if (!S.outU32 || S.outU32.buffer !== S.maskImgData.data.buffer) S.outU32 = new Uint32Array(S.maskImgData.data.buffer);
  const d = S.maskWash.data;
  d.fill(0);

  const sc = overlayScale();
  const period = Math.max(3, Math.round(OVERLAY_HATCH_CSS / sc));
  const half = Math.max(1, Math.round(period * 0.46));
  const lightW = Math.max(1, half - Math.max(1, Math.round(half * 0.4)));
  const band = Math.max(2, Math.round(OVERLAY_EDGE_CSS / sc));
  const outerCut = Math.max(1, Math.round(band * 0.45));
  S.ovDash = Math.max(2, Math.round(OVERLAY_DASH_CSS / sc));
  S.ovEdgeAlpha = st;

  const len = w * h;
  if (!S.edgeIdx || S.edgeIdx.length < len) {
    S.edgeIdx = new Uint32Array(len);
    S.edgeLayer = new Uint8Array(len);
    S.edgeEm = new Uint8Array(len);
    S.edgeOuter = new Uint8Array(len);
  }
  const edgeIdx = S.edgeIdx, edgeLayer = S.edgeLayer, edgeEm = S.edgeEm, edgeOuter = S.edgeOuter;
  let edgeN = 0;

  const active = S.settings.activeLayer;
  const isEm = eng.targetKind() === 'emitter';
  const order = [eng.targetIndex()];
  if (isEm && !eng.pmaskAt(order[0])) { S.ovEdgeN = 0; S.ovDash = 4; compositeOverlay(); S.maskDirty = false; return; }

  const ts = OVERLAY_EDGE_THRESH;
  for (const li of order) {
    const m = isEm ? eng.pmaskAt(li) : eng.maskAt(li);
    if (!m) continue;
    const layer = ls[li];
    const k = (isEm || !layer || layer.on ? 1 : OVERLAY_OFF_SCALE) * st;
    const fill = OVERLAY_FILL * k;
    const hatch = OVERLAY_HATCH * k;
    const dir = (li & 1) ? -1 : 1;
    const t = isEm ? emitterTint(li) : layerTint(li);
    const tr = t[0], tg = t[1], tb = t[2];
    const hr = tr + (255 - tr) * 0.5, hg = tg + (255 - tg) * 0.5, hb = tb + (255 - tb) * 0.5;
    const dr = tr * 0.38 + OVERLAY_DARK[0] * 0.62, dg = tg * 0.38 + OVERLAY_DARK[1] * 0.62, db = tb * 0.38 + OVERLAY_DARK[2] * 0.62;
                    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i++) {
        const v = m[i];
        if (v <= OVERLAY_MIN) continue;
        let ar = 0, ag = 0, ab = 0, aa = 0;
        const wa = v * fill;
        if (wa > 0.002) { ar = tr * wa; ag = tg * wa; ab = tb * wa; aa = wa; }
                                        const ph = (((x * dir + y) % period) + period) % period;
        if (ph < half) {
          const dark = ph >= lightW;
          const ha = hatch * (OVERLAY_HATCH_MIN + (1 - OVERLAY_HATCH_MIN) * Math.min(1, v * 1.5)) * (dark ? OVERLAY_HATCH_DARK : 1);
          const cr = dark ? dr : hr, cg = dark ? dg : hg, cb = dark ? db : hb;
          const ia = 1 - ha;
          ar = cr * ha + ar * ia; ag = cg * ha + ag * ia; ab = cb * ha + ab * ia; aa = ha + aa * ia;
        }
        if (v >= ts) {
                                        let dm = 0;
          for (let q = 1; q <= band; q++) {
            if (x - q < 0 || x + q >= w || y - q < 0 || y + q >= h) { dm = 1; break; }
            if (m[i - q] < ts || m[i + q] < ts || m[i - q * w] < ts || m[i + q * w] < ts) { dm = q; break; }
          }
          if (dm) { edgeIdx[edgeN] = i; edgeLayer[edgeN] = li; edgeEm[edgeN] = isEm ? 1 : 0; edgeOuter[edgeN] = dm <= outerCut ? 1 : 0; edgeN++; }
        }
        const p = i * 4;
        if (aa > 0.002) {
          const inv = 1 / aa;
          d[p] = ar * inv; d[p + 1] = ag * inv; d[p + 2] = ab * inv; d[p + 3] = aa * 255;
        }
      }
    }
  }
  S.ovEdgeN = edgeN;
  compositeOverlay();
      S.maskDirty = false;
}

function compositeOverlay() {
  if (!S.maskImgData || !S.washU32 || !S.outU32) return;
  S.outU32.set(S.washU32);
  const d = S.maskImgData.data;
  const edgeN = S.ovEdgeN | 0;
  const active = S.settings.activeLayer;
  const w = S.w, dash = S.ovDash || 4, ant = S.antShift | 0;
  const st = S.ovEdgeAlpha == null ? 1 : S.ovEdgeAlpha;
  for (let e = 0; e < edgeN; e++) {
    const i = S.edgeIdx[e], li = S.edgeLayer[e], p = i * 4;
    let cr, cg, cb;
    if (!S.edgeOuter[e]) {
      const t = S.edgeEm && S.edgeEm[e] ? emitterTint(li) : layerTint(li);
      const bx = (((i % w) + ant) / dash) | 0, by = ((((i / w) | 0) + ant) / dash) | 0;
      if ((bx + by) % 2 === 0) {
        cr = t[0] + (255 - t[0]) * 0.55; cg = t[1] + (255 - t[1]) * 0.55; cb = t[2] + (255 - t[2]) * 0.55;
      } else { cr = OVERLAY_DARK[0]; cg = OVERLAY_DARK[1]; cb = OVERLAY_DARK[2]; }
    } else { cr = OVERLAY_DARK[0]; cg = OVERLAY_DARK[1]; cb = OVERLAY_DARK[2]; }
    const ca = OVERLAY_EDGE * st;
    const a0 = d[p + 3] / 255, ia = 1 - ca, na = ca + a0 * ia;
    if (na > 0.004) {
      d[p] = (cr * ca + d[p] * a0 * ia) / na;
      d[p + 1] = (cg * ca + d[p + 1] * a0 * ia) / na;
      d[p + 2] = (cb * ca + d[p + 2] * a0 * ia) / na;
      d[p + 3] = na * 255;
    }
  }
  S.maskCtx.putImageData(S.maskImgData, 0, 0);
}

function loop(ts) {
  S.rafId = requestAnimationFrame(loop);
  const dtRaw = S.lastTs ? (ts - S.lastTs) / 1000 : 0;
  S.lastTs = ts;
  const dt = Math.min(0.06, Math.max(0, dtRaw));
  if (dt > 0.0005) S.fps = S.fps * 0.9 + (1 / dt) * 0.1;
  if (!S.w) return;

  // The window the app is in can change without ever firing a resize the script hears: the editor's
  // preview pane is rescaled as the chat panel opens and closes, and a phone's visual viewport moves on
  // its own. A stale photo size here is not cosmetic — it is a photo the user cannot put a finger on.
  if (ts - (S.fitCheckAt || 0) > 400) {
    S.fitCheckAt = ts;
    const key = stageFitKey();
    if (key !== S.fitKey) { S.fitKey = key; fitStage(); }
  }

  if (S.playing) {
    S.phase += (dt / cycleSeconds()) * TWO_PI;
    S.animTime += dt;
  }
  if (S.phase > TWO_PI * 4096) S.phase -= TWO_PI * 4096;

      if (!el.maskCanvas.hidden && S.ovEdgeN) {
    if (ts - S.antLast >= ANT_STEP_MS) {
      S.antLast = ts;
      S.antShift = (S.antShift + 1) % 4096;
      compositeOverlay();
    }
  }

  drawFrame();
  updateHud();
}

function updateHud() {
  if (!S.w) return;
  const period = visualPeriod();
  const per = TWO_PI * (S.settings.timeline === 'boomerang' ? 2 : 1);
  if (!S.scrubActive) el.scrub.value = String(Math.round(((S.phase % per) / per) * 1000));
  el.timeEl.textContent = (S.animTime % period).toFixed(1) + 's';
  el.fpsEl.textContent = Math.round(S.fps) + ' fps';
}

function updateInfo() {
  if (!S.w) { setStatus(el.infoEl, 'Load an image to begin.'); return; }
  const n = S.settings.layers.length;
  const cov = Math.round(S.eng.maskCoverage(0.15, S.settings.activeLayer) * 100);
  const mode = (MODES.find(m => m.id === S.settings.mode) || {}).label || S.settings.mode;
  const extra = n > 1 ? ` +${n - 1} layer${n > 2 ? 's' : ''}` : '';
  const full = S.full ? `${S.full.w}×${S.full.h}` : '-';
  const g = S.settings.glitch;
  const gl = g && g.on && g.amount > 0 ? ` · glitch ${Math.round(g.amount * 100)}%` : '';
  const gw = S.settings.glow;
  const glw = gw && gw.on && gw.amount > 0 ? ` · glow ${Math.round(gw.amount * 100)}%` : '';
  const fx = S.settings.particles.filter((e, i) => e.on && e.amount > 0 && hasSpawnArea(i));
  const idle = S.settings.particles.filter((e, i) => e.on && e.amount > 0 && !hasSpawnArea(i)).length;
  const fxt = fx.length ? ` · ${fx.length} emitter${fx.length > 1 ? 's' : ''}` : '';
  const still = !fx.length && S.settings.layers.every(l => l.mode === 'none');
  el.infoEl.className = 'sub' + (still ? ' warn' : '');
  el.infoEl.textContent = still
    ? `Nothing is moving yet — pick an effect in the Motion card, then paint where it should move. Working ${S.w}×${S.h} · export source ${full}.`
    : `${mode}${extra} · working ${S.w}×${S.h} · export source ${full} · mask ${cov}% · period ${visualPeriod().toFixed(1)}s${gl}${glw}${fxt}` +
      (idle ? ` · ${idle} emitter${idle > 1 ? 's' : ''} without a spawn area (nothing shows)` : '');
}

function syncAll() {
  syncEmitterMasks();
  for (const fn of S.syncFns) fn();
  updateModeVisibility();
  syncLayerUI();
  syncPlaceBar();
  updateExportHint();
  updateInfo();
}

function bindRange(id, read, write, fmt) {
  const input = el[id];
            const outId = id.replace(/Input$/, '') + 'Val';
  const out = () => $(outId) || el[outId];
  const paint = () => {
    const span = out();
    if (span) span.textContent = fmt ? fmt(input.value) : input.value;
  };
  input.addEventListener('input', () => {
    write(parseFloat(input.value));
    paint();
    updateInfo();
    updateExportHint();
  });
  const sync = () => {
    input.value = String(read());
    paint();
  };
  S.syncFns.push(sync);
  sync();
}

function bindCheck(id, key) {
  const input = el[id];
  const sync = () => { input.checked = !!S.settings[key]; };
  input.addEventListener('change', () => { S.settings[key] = input.checked; updateInfo(); });
  S.syncFns.push(sync);
  sync();
}

function G() { return S.settings.glitch; }

function syncGlitchStatus() {
  const g = G();
  if (!g.on) { setStatus(el.glitchStatusEl, 'Off — the frame is unchanged.'); return; }
  const live = GLITCH_EFFECTS.filter(f => g[f.id] > 0.01);
  setStatus(el.glitchStatusEl,
    `${Math.round(g.amount * 100)}% · ${g.burst > 0.01 ? 'bursts ' + Math.round(g.burst * 100) + '%' : 'steady'} · ` +
    (live.length ? live.length + ' effect' + (live.length > 1 ? 's' : '') : 'every effect at zero') + ' · seed ' + g.seed);
}

function initGlitchControls() {
  bindRange('glitchAmount', () => Math.round(G().amount * 100), v => { G().amount = v / 100; }, pct);
  bindRange('glitchBurst', () => Math.round(G().burst * 100), v => { G().burst = v / 100; }, pct);
        bindRange('glitchRate', () => Math.round(G().rate * 100), v => { G().rate = v / 100; },
    v => (4 + Math.round(v * 0.44)) + '×');
  el.glitchOnChk.addEventListener('change', () => {
    G().on = el.glitchOnChk.checked;
    updateInfo();
    syncGlitchStatus();
  });
  S.syncFns.push(() => { el.glitchOnChk.checked = !!G().on; });

  el.glitchStyles.innerHTML = '';
  for (const st of GLITCH_STYLES) {
    const b = document.createElement('button');
    b.textContent = st.label;
    b.title = 'Glitch style — sets every effect and the master knobs at once';
    b.addEventListener('click', () => {
      Object.assign(G(), st.patch);
      G().on = true;
      syncAll();
      toast('Glitch: ' + st.label);
    });
    el.glitchStyles.appendChild(b);
  }

  el.glitchGrid.innerHTML = '';
  for (const fx of GLITCH_EFFECTS) {
    const row = document.createElement('div');
    row.className = 'glitchRow';
    const lab = document.createElement('label');
    lab.textContent = fx.label;
    lab.title = fx.hint;
    const rng = document.createElement('input');
    rng.type = 'range';
    rng.min = '0';
    rng.max = '100';
    const val = document.createElement('span');
    val.className = 'val';
    const paint = () => {
      const v = Math.round(clamp01(G()[fx.id]) * 100);
      rng.value = String(v);
      val.textContent = v + '%';
      lab.classList.toggle('on', v > 0);
    };
    rng.addEventListener('input', () => {
      G()[fx.id] = parseFloat(rng.value) / 100;
      paint();
      syncGlitchStatus();
    });
    row.append(lab, rng, val);
    el.glitchGrid.appendChild(row);
    S.syncFns.push(paint);
    paint();
  }

      el.glitchSeedBtn.addEventListener('click', () => {
    G().seed = (Math.random() * 0x7fffffff) | 0;
    G().on = true;
    el.glitchOnChk.checked = true;
    updateInfo();
    syncGlitchStatus();
  });

  S.syncFns.push(syncGlitchStatus);
  syncGlitchStatus();
}

function glow() { return S.settings.glow; }

function glowTargetLayer() {
  const g = glow();
  const n = S.settings.layers.length;
  return g.maskLayer >= 0 ? Math.min(g.maskLayer, n - 1) : S.settings.activeLayer;
}

function paintGlowTarget() {
  const g = glow();
  const ls = S.settings.layers;
  const sel = el.glowLayerSel;
  if (sel) {
    const sig = ls.map(l => l.name + '|' + l.maskSource).join(',');
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig;
      sel.innerHTML = '';
      const auto = document.createElement('option');
      auto.value = '-1';
      auto.textContent = 'Active layer (follows the brush)';
      sel.appendChild(auto);
      for (let i = 0; i < ls.length; i++) {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = ls[i].name + ' \u2014 ' + layerTintName(i) + ' mask';
        sel.appendChild(o);
      }
    }
    if (g.maskLayer >= ls.length) g.maskLayer = -1;
    sel.value = String(g.maskLayer);
  }
  if (el.glowLayerRow) el.glowLayerRow.hidden = g.outline !== 'mask';
  if (el.glowSrcSel) el.glowSrcSel.value = g.outline;
}

function syncGlowStatus() {
  const g = glow();
  if (!g.on) { setStatus(el.glowStatusEl, 'Off — the frame is unchanged.'); return; }
  const st = GLOW_STYLES.find(s => s.id === g.style);
  const p = S.eng && S.eng.sw ? S.eng._glowField(g) : null;
  if (p && !p.count) {
    setStatus(el.glowStatusEl, g.outline === 'mask'
      ? 'That mask is empty — paint it or press Auto mask, or pick another layer mask.'
      : 'No outline to light — raise the Motion mask sensitivity, or switch Outline to a Layer mask.', 'warn');
    return;
  }
  const name = (S.settings.layers[glowTargetLayer()] || {}).name || 'layer';
  setStatus(el.glowStatusEl,
    (st ? st.label : g.style) + ' · intensity ' + Math.round(g.amount * 100) + '%' +
    ' · reach ' + (g.reach * 100).toFixed(1) + '% of the short side' +
    (g.outline === 'mask' ? ' · ' + name + ' mask' : '') +
    (p ? ' · ' + p.count.toLocaleString() + ' outline pixels' : ''));
}

function initGlowControls() {
  bindRange('glowAmount', () => Math.round(glow().amount * 100), v => { glow().amount = v / 100; syncGlowStatus(); }, pct);
  bindRange('glowReach', () => Math.round(glow().reach * 1000), v => { glow().reach = v / 1000; syncGlowStatus(); },
    v => (v / 10).toFixed(1) + '%');
  bindRange('glowSoftness', () => Math.round(glow().softness * 100), v => { glow().softness = v / 100; syncGlowStatus(); }, pct);
  bindRange('glowSpeed', () => Math.round(glow().speed), v => { glow().speed = clamp(Math.round(v) || 1, 1, 4); syncGlowStatus(); },
    v => v + '\u00d7');

  selectOptions(el.glowSrcSel, GLOW_OUTLINES, o => o.id, o => o.label);
  el.glowSrcSel.addEventListener('change', () => {
    glow().outline = el.glowSrcSel.value === 'mask' ? 'mask' : 'subject';
    syncAll();
  });
  el.glowLayerSel.addEventListener('change', () => {
    const v = parseInt(el.glowLayerSel.value, 10);
    glow().maskLayer = Number.isFinite(v) ? v : -1;
    syncGlowStatus();
  });
  el.glowOnChk.addEventListener('change', () => {
    glow().on = el.glowOnChk.checked;
    updateInfo();
    syncGlowStatus();
  });

  el.glowStyles.innerHTML = '';
  for (const st of GLOW_STYLES) {
    const b = document.createElement('button');
    b.textContent = st.label;
    b.title = st.hint;
    b.dataset.glowStyle = st.id;
    b.addEventListener('click', () => {
      if (st.patch) Object.assign(glow(), st.patch);
      glow().style = st.id;
      glow().on = true;
      syncAll();
      toast('Glow: ' + st.label);
    });
    el.glowStyles.appendChild(b);
  }
  const paintStyles = () => {
    const g = glow();
    for (const b of el.glowStyles.querySelectorAll('button')) {
      b.classList.toggle('active', g.on && b.dataset.glowStyle === g.style);
    }
  };

  for (const [id, key] of [['glowColor1', 'color'], ['glowColor2', 'color2']]) {
    el[id].addEventListener('input', () => { glow()[key] = el[id].value; });
    S.syncFns.push(() => { el[id].value = glow()[key]; });
  }

  el.glowSeedBtn.addEventListener('click', () => {
    glow().seed = (Math.random() * 0x7fffffff) | 0;
    glow().on = true;
    el.glowOnChk.checked = true;
    updateInfo();
    syncGlowStatus();
  });

  S.syncFns.push(paintStyles);
  S.syncFns.push(() => { el.glowOnChk.checked = !!glow().on; });
  S.syncFns.push(paintGlowTarget);
  S.syncFns.push(syncGlowStatus);
  paintStyles();
  paintGlowTarget();
  syncGlowStatus();
}

const pct = v => Math.round(v) + '%';

function fxList() { return S.settings.particles; }
const fxKind = id => PARTICLE_KINDS.find(k => k.id === id) || PARTICLE_KINDS[0];

function fxSelected() {
  const l = fxList();
  if (!l.length) return null;
  return l[clamp(S.settings.activeParticle | 0, 0, l.length - 1)];
}

// Picking an emitter in the Particles card points the brush at *its* spawn area, the same way
// picking a layer row points it at that layer's mask (selectLayer does exactly this). Without it a
// tap on the row — which is the big, obvious part of the row, and the only thing a thumb reliably
// hits — left the brush on whatever layer was last selected, so "brush where its particles are
// born" quietly painted the last layer's mask instead.
function fxSelect(i, opts = {}) {
  const l = fxList();
  if (!l.length) return;
  const next = clamp(i | 0, 0, l.length - 1);
  S.settings.activeParticle = next;
  // A pending pivot/focus pick would swallow the very next tap on the photo instead of painting, so
  // selecting an emitter always cancels it — even when this emitter is already the brush's target.
  clearPick();
  // Arm unless the brush is already on this emitter's spawn area — a deliberate tap on a row means
  // "work on this emitter", and pressing Done only moves the brush back until the next such tap.
  if (S.w && opts.arm !== false && engTargetParticle() !== next) armEmitterSpawn(next, { toast: true, via: 'row-tap', reveal: true });
  // No picture, no brush: say it rather than selecting the emitter and looking like a dead tap.
  else if (!S.w && opts.arm !== false) toast('Load a picture first — a spawn area is brushed onto the photo.');
  syncAll();
}

// Points the brush (and the overlay, and the undo ring) at an emitter's spawn area. The caller does
// the UI sync — this is the one place that decides *what* gets painted.
function armEmitterSpawn(i, opts = {}) {
  const e = fxList()[i];
  if (!S.w || !e) return false;
  clearPick();
  S.settings.activeParticle = i;
  S.eng.selectEmitterMask(i);
  S.maskDirty = true;
  trace({ ev: 'arm-emitter', index: i, name: e.name, via: opts.via || 'silent' });
  // A spawn area is painted, always. A brush left in "smart" mode does nothing at all on a drag (it
  // only answers the first press), so aiming at a spawn area puts the brush back to painting — and
  // says so, because a silent mode change is the same bug in a different coat.
  if (S.settings.brushMode === 'smart') {
    setBrushMode('paint', true);
    toast('Smart select is for layer masks — the brush is painting again for this spawn area.');
  }
  if (!el.showMaskChk.checked) {
    el.showMaskChk.checked = true;
    el.maskCanvas.hidden = false;
  }
  if (opts.toast === true) {
    toast('Now brushing “' + e.name + '” spawn area — press Done to go back to ' + currentLayer().name + '.');
  }
  updateMaskStatus();
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  if (opts.reveal === true) revealStage();
  return true;
}

function fxFreshKind() {
  const used = {};
  for (const e of fxList()) used[e.kind] = true;
  for (const k of PARTICLE_KINDS) if (!used[k.id]) return k.id;
  return PARTICLE_KINDS[0].id;
}

function uniqueEmitterName(kind, list) {
  let name = fxKind(kind).label;
  let n = 2;
  const taken = {};
  for (const x of list) taken[x.name] = true;
  while (taken[name]) name = fxKind(kind).label + ' ' + n++;
  return name;
}

function addEmitter(kindId) {
  const l = fxList();
  if (l.length >= MAX_EMITTERS) { toast('That is the most emitters (' + MAX_EMITTERS + ').'); return; }
  const kind = kindId && fxKind(kindId).id === kindId ? kindId : fxFreshKind();
  const e = makeEmitter(kind, l.length);
  e.name = uniqueEmitterName(kind, l);
  l.push(e);
  S.settings.activeParticle = l.length - 1;
  syncAll();
  updateInfo();
  if (S.w) {
    selectEmitterSpawn(l.length - 1, { quiet: true, reveal: false });
    updateInfo();
    toast(e.name + ' has no spawn area yet, so nothing shows — brush over the photo where its particles should be born. An overlay shows the area as you paint.');
    return;
  }
  toast(e.name + ' — ' + fxKind(kind).hint);
}

function removeEmitter(i) {
  const l = fxList();
  if (i < 0 || i >= l.length) return;
  const gone = l[i].name;
  l.splice(i, 1);
  S.eng.removePMaskAt(i);
  S.settings.activeParticle = clamp(S.settings.activeParticle, 0, Math.max(0, l.length - 1));
  syncEmitterMasks();
  syncAll();
  updateInfo();
  updateMaskStatus();
  toast('Removed ' + gone + '.');
}

function duplicateEmitter(i) {
  const l = fxList();
  if (l.length >= MAX_EMITTERS) { toast('That is the most emitters (' + MAX_EMITTERS + ').'); return; }
  const e = Object.assign({}, l[i]);
  e.seed = (Math.random() * 0x7fffffff) | 0;
  e.name = uniqueEmitterName(e.kind, l);
  l.splice(i + 1, 0, e);
  S.eng.addPMask();
  S.eng.movePMaskAt(S.eng.pmaskCount() - 1, i + 1);
  S.settings.activeParticle = i + 1;
  syncAll();
  updateInfo();
  toast(e.name + ' — same spawn area and settings as the one it was copied from.');
}

function moveEmitter(i, d) {
  const l = fxList();
  const j = i + d;
  if (j < 0 || j >= l.length) return;
  const t = l[i]; l[i] = l[j]; l[j] = t;
  S.eng.movePMaskAt(i, j);
  S.settings.activeParticle = j;
  syncAll();
}

function toggleEmitter(i) {
  const l = fxList();
  if (!l[i]) return;
  l[i].on = !l[i].on;
  syncAll();
  updateInfo();
}

function renameEmitter(i) {
  const e = fxList()[i];
  if (!e) return;
  const name = prompt('Emitter name:', e.name);
  if (name == null) return;
  e.name = name.trim().slice(0, 20) || e.name;
  syncAll();
}

const FX_AUTO_NAME = new RegExp('^(' + PARTICLE_KINDS.map(k => k.label).join('|') + ')( [0-9]+)?$');

function setEmitterKind(id) {
  const e = fxSelected();
  if (!e || !id) return;
  const l = fxList();
  const others = l.filter(x => x !== e);
  const keep = {
    on: e.on,
    name: FX_AUTO_NAME.test(e.name) ? uniqueEmitterName(id, others) : e.name,
    seed: e.seed, depth: e.depth, behind: e.behind, opacity: e.opacity,
  };
  Object.assign(e, makeEmitter(id, 0), keep);
  syncAll();
  updateInfo();
  toast(fxKind(id).label + ' — ' + fxKind(id).hint);
}

function syncFxStatus() {
  const e = fxSelected();
  if (!e) { setStatus(el.fxStatusEl, 'No emitter selected.'); return; }
  const i = clamp(S.settings.activeParticle | 0, 0, Math.max(0, fxList().length - 1));
  const count = particleCount(e, S.w || 512, S.h || 342);
  if (!hasSpawnArea(i)) {
    setStatus(el.fxStatusEl,
      (e.on ? '' : 'Muted · ') + fxKind(e.kind).label +
      ' — waiting for a spawn area, so nothing appears yet. Press the target button on its row, then brush over the photo where its particles should be born.',
      'warn');
    return;
  }
  setStatus(el.fxStatusEl,
    (e.on ? '' : 'Muted · ') + fxKind(e.kind).label + ' · ' + count + ' particles' +
    ' · ' + Math.round(S.eng.pmaskCoverage(i, 0.12) * 100) + '% of the frame spawns them' +
    ' · ' + Math.round(e.amount * 100) + '%' +
    ' · ' + Math.round(e.angle) + '\u00b0' +
    (e.speed !== 1 ? ' · ' + e.speed.toFixed(2) + '\u00d7' : '') +
    (e.flash > 0.005 ? ' · flicker ' + Math.round(e.flash * 100) + '%' : '') +
    (e.behind > 0.01 ? ' · ' + Math.round(e.behind * 100) + '% behind the subject' : '') +
    ' · seed ' + e.seed);
}

function fxKindChip(e) { return (PARTICLE_BLENDS.find(b => b.id === e.blend) || PARTICLE_BLENDS[0]).label.split(' ')[0]; }

function buildFxList() {
  const l = fxList();
  const active = clamp(S.settings.activeParticle | 0, 0, Math.max(0, l.length - 1));
  el.fxList.innerHTML = '';
  const mk = (ic, label, title, fn) => {
    const b = document.createElement('button');
    b.className = 'layerTool';
    b.innerHTML = icon(ic);
    b.setAttribute('aria-label', label);
    b.title = title;
    b.addEventListener('click', ev => { ev.stopPropagation(); fn(); });
    return b;
  };
    for (let i = l.length - 1; i >= 0; i--) {
    const e = l[i];
    const count = particleCount(e, S.w || 512, S.h || 342);
    const row = document.createElement('div');
    row.className = 'layerRow fxRow' + (i === active ? ' active' : '') + (e.on ? '' : ' muted');
    const areaOn = hasSpawnArea(i);
    const armed = engTargetParticle() === i;
    row.dataset.i = String(i);
    row.title = e.name + ' — ' + fxKind(e.kind).label + ', ' + count + ' particles' + (e.on ? '' : ' (muted)') +
      (areaOn ? ', spawning from its painted area' : ', waiting for a spawn area — press the target button and paint where they come from') +
      '. Click to edit, double-click the name to rename.';

    const on = document.createElement('button');
    on.className = 'layerOn';
    on.innerHTML = icon(e.on ? 'ic-eye' : 'ic-eye-off');
    on.title = e.on ? 'Mute this emitter' : 'Unmute this emitter';
    on.addEventListener('click', ev => { ev.stopPropagation(); toggleEmitter(i); });

    const name = document.createElement('span');
    name.className = 'layerName';
    name.textContent = e.name;
    name.title = 'Double-click to rename';
    name.addEventListener('dblclick', ev => { ev.stopPropagation(); renameEmitter(i); });

    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = fxKindChip(e) + (armed ? ' · brushing' : areaOn ? ' · area' : ' · no area');
    chip.title = 'Blending: ' + (PARTICLE_BLENDS.find(b => b.id === e.blend) || {}).label +
      (armed ? ' — the brush is on this emitter’s spawn area right now'
        : areaOn ? ' — spawning from the painted area' : ' — needs a spawn area before anything appears');

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = areaOn ? String(count) : '\u2014';

    const spawnBtn = mk('ic-target', 'Spawn area',
      areaOn
        ? 'Spawning from a painted area — click to edit where its particles are born'
        : 'Nothing appears until you paint a spawn area — click, then brush over the photo',
      () => selectEmitterSpawn(i));
    spawnBtn.classList.add('spawnTool');
    if (armed) spawnBtn.classList.add('armed');
    spawnBtn.insertAdjacentHTML('beforeend', '<span class="toolLabel">Area</span>');
    if (areaOn) spawnBtn.style.color = 'rgb(' + emitterTint(i).join(',') + ')';
    else spawnBtn.classList.add('needsArea');

    const tools = document.createElement('span');
    tools.className = 'layerTools';
    tools.append(
      spawnBtn,
      mk('ic-arrow-up', 'Move later', 'Move later — drawn over the emitters before it', () => moveEmitter(i, 1)),
      mk('ic-arrow-down', 'Move earlier', 'Move earlier', () => moveEmitter(i, -1)),
      mk('ic-copy', 'Duplicate', 'Duplicate this emitter', () => duplicateEmitter(i)),
      mk('ic-trash', 'Remove emitter', 'Remove this emitter', () => removeEmitter(i)),
    );

    row.append(on, name, chip, badge, tools);
    row.addEventListener('click', () => fxSelect(i));
    el.fxList.appendChild(row);
  }
}

function syncFxUI() {
  const l = fxList();
  const active = clamp(S.settings.activeParticle | 0, 0, Math.max(0, l.length - 1));
  S.settings.activeParticle = active;
  el.fxEmptyEl.hidden = l.length > 0;
  el.fxEditCtn.hidden = l.length === 0;
  el.fxAddBtn.disabled = l.length >= MAX_EMITTERS;
  el.fxAddBtn.innerHTML = icon('ic-plus') + (l.length >= MAX_EMITTERS ? 'Max ' + MAX_EMITTERS : 'Emitter');
  buildFxList();

  const sel = fxSelected();
  el.fxKindGrid.innerHTML = '';
  for (const k of PARTICLE_KINDS) {
    const b = document.createElement('button');
    b.textContent = k.label;
    b.title = k.hint;
    b.classList.toggle('active', !!sel && sel.kind === k.id);
    b.addEventListener('click', () => setEmitterKind(k.id));
    el.fxKindGrid.appendChild(b);
  }
  if (sel) {
    el.fxBlendSel.value = sel.blend;
    el.fxColor1.value = sel.color;
    el.fxColor2.value = sel.color2;
  }
  syncFxAreaBtn();
  syncFxStatus();
}

// The selected emitter's own spawn-area control, at the top of its settings: the row's "Area" button
// is a small target in a list, and this is the thing you do with an emitter, so it gets a full-width
// button that says what it will do (and what state the area is in) in words.
function syncFxAreaBtn() {
  const b = el.fxAreaBtn;
  if (!b) return;
  const i = clamp(S.settings.activeParticle | 0, 0, Math.max(0, fxList().length - 1));
  if (!fxList().length) { b.hidden = true; return; }
  b.hidden = false;
  const armed = engTargetParticle() === i;
  const cov = Math.round(S.eng.pmaskCoverage(i, 0.12) * 100);
  b.classList.toggle('primary', !armed);
  b.disabled = false;
  b.innerHTML = icon(armed ? 'ic-check' : 'ic-target') + (
    armed ? 'Painting its spawn area — done'
      : cov > 0 ? 'Paint its spawn area · ' + cov + '% of the frame'
        : 'Paint its spawn area — it has none yet, so it shows nothing'
  );
  b.title = armed
    ? 'The brush is on this emitter’s spawn area — click to hand it back to ' + currentLayer().name
    : 'Sends the brush to this emitter’s spawn area: brush over the photo where “' + (fxSelected() || {}).name + '” should be born';
  b.style.borderColor = cov > 0 ? 'rgb(' + emitterTint(i).join(',') + ')' : '';
}

function initFxControls() {
  el.fxAddBtn.addEventListener('click', () => addEmitter());
  el.fxAreaBtn.addEventListener('click', () => {
    const l = fxList();
    if (!l.length) return;
    const i = clamp(S.settings.activeParticle | 0, 0, l.length - 1);
    if (engTargetParticle() === i) finishPlacing();
    else selectEmitterSpawn(i);
  });
  el.fxSeedBtn.addEventListener('click', () => {
    const e = fxSelected();
    if (!e) return;
    e.seed = (Math.random() * 0x7fffffff) | 0;
    syncFxUI();
    toast('New particle pattern.');
  });
  selectOptions(el.fxBlendSel, PARTICLE_BLENDS, b => b.id, b => b.label);
  el.fxBlendSel.addEventListener('change', () => {
    const e = fxSelected();
    if (!e) return;
    e.blend = el.fxBlendSel.value;
    syncFxUI();
  });
  el.fxColor1.addEventListener('input', () => {
    const e = fxSelected();
    if (!e) return;
    e.color = el.fxColor1.value;
    buildFxList();
  });
  el.fxColor2.addEventListener('input', () => {
    const e = fxSelected();
    if (!e) return;
    e.color2 = el.fxColor2.value;
    buildFxList();
  });

      const R = (id, get, set, fmt) => bindRange(id,
    () => { const e = fxSelected(); return e ? get(e) : 0; },
    v => { const e = fxSelected(); if (e) set(e, v); },
    fmt);
  R('fxAmount', e => Math.round(e.amount * 100), (e, v) => { e.amount = v / 100; }, pct);
  R('fxSize', e => Math.round(e.size * 100), (e, v) => { e.size = v / 100; }, v => (v / 100).toFixed(2) + '\u00d7');
  R('fxSpeed', e => Math.round(e.speed * 100), (e, v) => { e.speed = v / 100; }, v => (v / 100).toFixed(2) + '\u00d7');
  R('fxAngle', e => Math.round(e.angle), (e, v) => { e.angle = v; }, v => Math.round(v) + '\u00b0');
  R('fxSpread', e => Math.round(e.spread), (e, v) => { e.spread = v; }, v => Math.round(v) + '\u00b0');
  R('fxWind', e => Math.round(e.wind * 100), (e, v) => { e.wind = v / 100; }, pct);
  R('fxTurb', e => Math.round(e.turb * 100), (e, v) => { e.turb = v / 100; }, pct);
  R('fxBlur', e => Math.round(e.blur * 100), (e, v) => { e.blur = v / 100; }, pct);
  R('fxGlow', e => Math.round(e.glow * 100), (e, v) => { e.glow = v / 100; }, pct);
      R('fxFlash', e => Math.round(e.flash * 100), (e, v) => { e.flash = v / 100; },
    v => (v < 1 ? 'off' : Math.round(v) + '%'));
  R('fxOpacity', e => Math.round(e.opacity * 100), (e, v) => { e.opacity = v / 100; }, pct);
  R('fxDepth', e => Math.round(e.depth * 100), (e, v) => { e.depth = v / 100; },
    v => (v >= 100 ? 'all' : 'near ' + Math.round(v) + '%'));
  R('fxBehind', e => Math.round(e.behind * 100), (e, v) => { e.behind = v / 100; },
    v => (v < 1 ? 'off' : Math.round(v) + '%'));
    for (const id of ['fxAmount', 'fxSpeed', 'fxAngle', 'fxFlash', 'fxBehind', 'fxOpacity']) {
    el[id].addEventListener('input', syncFxStatus);
  }
  S.syncFns.push(syncFxUI);
  syncFxUI();
}

function initControls() {
    el.modeGrid.innerHTML = '';
  for (const m of MODES) {
    const b = document.createElement('button');
    b.dataset.mode = m.id;
    b.textContent = m.label;
    b.title = m.hint;
    b.addEventListener('click', () => setMode(m.id));
    el.modeGrid.appendChild(b);
  }

    el.presetGrid.innerHTML = '';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.textContent = p.name;
    b.addEventListener('click', () => applyPresetStack(p));
    el.presetGrid.appendChild(b);
  }

    selectOptions(el.fmtSelect, FORMATS, f => f.id, f => f.label);
  selectOptions(el.resSelect, [
    { id: 'working', label: 'Working (fast)' },
    { id: '540', label: '540p' },
    { id: '720', label: '720p HD' },
    { id: '1080', label: '1080p HD' },
    { id: '1440', label: '1440p' },
    { id: '2160', label: '2160p 4K' },
  ], r => r.id, r => r.label);
  selectOptions(el.aspectSelect, ASPECTS, a => a.id, a => a.label);
  selectOptions(el.fpsSelect, [12, 15, 20, 24, 25, 30, 60].map(v => ({ id: v, label: v + ' fps' })), f => f.id, f => f.label);
  selectOptions(el.cyclesSelect, [1, 2, 3, 4, 6].map(v => ({ id: v, label: v + (v === 1 ? ' cycle' : ' cycles') })), c => c.id, c => c.label);
  selectOptions(el.lenModeSelect, [
    { id: 'cycles', label: 'Whole cycles' },
    { id: 'seconds', label: 'Seconds (up to 30)' },
  ], m => m.id, m => m.label);
      selectOptions(el.speedSelect, [
    { id: 0.25, label: '0.25\u00d7 slowest' },
    { id: 0.5, label: '0.5\u00d7 slower' },
    { id: 1, label: '1\u00d7 normal' },
    { id: 1.5, label: '1.5\u00d7' },
    { id: 2, label: '2\u00d7 faster' },
    { id: 3, label: '3\u00d7' },
    { id: 4, label: '4\u00d7 fastest' },
  ], s => s.id, s => s.label);
  selectOptions(el.padSelect, [
    { id: 'blur', label: 'Blurred background' },
    { id: 'color', label: 'Solid colour' },
  ], p => p.id, p => p.label);
  el.fmtSelect.value = 'mp4';
  el.resSelect.value = '1080';
  el.aspectSelect.value = 'source';
  el.fpsSelect.value = '30';
  el.cyclesSelect.value = '2';
  el.lenModeSelect.value = 'cycles';
  el.durInput.value = '10';
  el.speedSelect.value = '1';
  el.padSelect.value = 'blur';
  el.qualityInput.value = '100';
  el.qualityVal.textContent = '1.0\u00d7';
  selectOptions(el.optSelect, OPTIMISERS, o => o.id, o => o.label);
  el.optSelect.value = 'off';
  el.optTargetInput.value = '1';
  el.optTargetRow.hidden = true;

  el.zoomDirSel.innerHTML = '';
  for (const [v, label] of [['1', 'Breathes out'], ['-1', 'Breathes in']]) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    el.zoomDirSel.appendChild(o);
  }

    bindRange('ampInput', () => Math.round(S.settings.ampFrac / 0.0012), v => { S.settings.ampFrac = v * 0.0012; }, v => (v / 100 * 12).toFixed(1) + '%');
  bindRange('speedInput', () => layerCycles(S.settings.speed), v => { S.settings.speed = layerCycles(v); syncLayerUI(); }, v => layerCycles(v) + '× per loop');
  bindRange('chestAmt', () => Math.round(S.settings.chestAmt * 100), v => { S.settings.chestAmt = v / 100; }, pct);
  bindRange('waveFreq', () => Math.round(S.settings.waveFreq * 10), v => { S.settings.waveFreq = v / 10; }, v => (v / 10).toFixed(1));
  bindRange('flowDir', () => Math.round(S.settings.flowDir), v => { S.settings.flowDir = v; }, v => v + '\u00b0');
  bindRange('flowFreq', () => Math.round(S.settings.flowFreq * 10), v => { S.settings.flowFreq = v / 10; }, v => (v / 10).toFixed(1));
  bindRange('flowRamp', () => Math.round(S.settings.flowRamp * 100), v => { S.settings.flowRamp = v / 100; }, pct);
  bindRange('flameFlicker', () => Math.round(S.settings.flameFlicker * 100), v => { S.settings.flameFlicker = v / 100; }, pct);
  bindRange('flameSpread', () => Math.round(S.settings.flameSpread * 100), v => { S.settings.flameSpread = v / 100; }, pct);
  bindRange('flameSway', () => Math.round(S.settings.flameSway * 100), v => { S.settings.flameSway = v / 100; }, pct);
  bindRange('depthAmount', () => Math.round(S.settings.depthAmount * 100), v => { S.settings.depthAmount = v / 100; }, pct);
  bindRange('depthPan', () => Math.round(S.settings.depthPan * 100), v => { S.settings.depthPan = v / 100; }, pct);
  bindRange('depthBias', () => Math.round(S.settings.depthBias * 100), v => { S.settings.depthBias = v / 100; }, pct);

  bindCheck('chestChk', 'chestOn');
  el.zoomDirSel.addEventListener('change', () => { S.settings.zoomDir = parseFloat(el.zoomDirSel.value); });

    el.layerAddBtn.addEventListener('click', addLayer);
  el.layerOpacity.addEventListener('input', () => {
    currentLayer().opacity = parseFloat(el.layerOpacity.value) / 100;
    el.layerOpacityVal.textContent = Math.round(currentLayer().opacity * 100) + '%';
    updateInfo();
  });
  el.maskTargetSel.addEventListener('change', () => {
    const v = String(el.maskTargetSel.value || '');
    const i = parseInt(v.slice(1), 10);
    if (!Number.isFinite(i)) return;
    if (v.charAt(0) === 'E') selectEmitterSpawn(i, { quiet: false });
    else selectLayer(i);
  });
  for (const b of el.brushSeg.querySelectorAll('button')) {
    b.addEventListener('click', () => setBrushMode(b.dataset.brush));
  }
  bindRange('brushSize', () => Math.round(S.settings.brushSize), v => { S.settings.brushSize = v; }, v => v + 'px');
  bindRange('brushFlow', () => Math.round(S.settings.brushFlow * 100), v => { S.settings.brushFlow = v / 100; }, pct);
  bindRange('brushHardness', () => Math.round(S.settings.brushHardness * 100), v => { S.settings.brushHardness = v / 100; }, pct);
  bindRange('autoSens', () => Math.round(S.settings.autoSens * 100), v => { S.settings.autoSens = v / 100; refreshAutoMask(); }, pct);
      const ovInput = el.maskOverlay;
  const ovSync = () => {
    ovInput.value = String(Math.round(S.overlayStrength * 100));
    el.maskOverlayVal.textContent = Math.round(S.overlayStrength * 100) + '%';
  };
  ovInput.addEventListener('input', () => {
    S.overlayStrength = parseFloat(ovInput.value) / 100;
    el.maskOverlayVal.textContent = Math.round(S.overlayStrength * 100) + '%';
    if (!el.maskCanvas.hidden) { S.maskDirty = true; paintMaskOverlay(); }
  });
  S.syncFns.push(ovSync);
  ovSync();
  el.symmetryChk.addEventListener('change', () => { S.settings.brushSymmetry = el.symmetryChk.checked; });
  el.autoMaskBtn.addEventListener('click', () => autoMask(false));
  el.invertMaskBtn.addEventListener('click', () => maskOp(() => S.eng.invert()));
  el.growBtn.addEventListener('click', () => maskOp(() => S.eng.grow(2)));
  el.featherBtn.addEventListener('click', () => maskOp(() => S.eng.feather(Math.max(2, Math.round(Math.min(S.w, S.h) * 0.018)))));
  el.clearMaskBtn.addEventListener('click', () => clearTargetMask());
  el['lq-undoBtn'].addEventListener('click', undoMask);
  el['lq-redoBtn'].addEventListener('click', redoMask);
  el.showMaskChk.addEventListener('change', () => {
    el.maskCanvas.hidden = !el.showMaskChk.checked;
    if (el.showMaskChk.checked) { S.maskDirty = true; paintMaskOverlay(); }
  });

  initGlitchControls();
  initGlowControls();
  initFxControls();

  bindRange('tempoInput', () => Math.round(clipTempo() * 100), v => { S.settings.timelineSpeed = normalizeTempo(v / 100); }, v => (v / 100).toFixed(2) + '×');

    for (const b of el.timelineSeg.querySelectorAll('button[data-timeline]')) {
    b.addEventListener('click', () => {
      S.settings.timeline = b.dataset.timeline;
      for (const o of el.timelineSeg.querySelectorAll('button[data-timeline]')) o.classList.toggle('active', o === b);
      updateExportHint();
      updateInfo();
    });
  }

    el.pickSwayBtn.addEventListener('click', () => setPick('sway', el.pickSwayBtn));
  el.pickZoomBtn.addEventListener('click', () => setPick('zoom', el.pickZoomBtn));
  el.placeDoneBtn.addEventListener('click', finishPlacing);

    el.playPauseBtn.addEventListener('click', togglePlay);
  el.exportRunBtn.addEventListener('click', runExport);
  el.cancelExportBtn.addEventListener('click', requestExportCancel);
  el.exportDownloadBtn.addEventListener('click', () => {
    if (S.lastExport && S.lastExport.blob) download(S.lastExport.blob, S.lastExport.name);
  });
  el.exportCloseBtn.addEventListener('click', closeExportModal);
  el.exportModal.addEventListener('click', ev => { if (ev.target === el.exportModal && !S.busy) closeExportModal(); });
  window.addEventListener('resize', () => { if (!el.exportModal.hidden && !el.exportResultCtn.hidden) fitExportVideo(); });
  el.scrub.addEventListener('pointerdown', () => { S.scrubActive = true; });
  el.scrub.addEventListener('pointerup', () => { S.scrubActive = false; });
  el.scrub.addEventListener('input', () => {
    const u = parseFloat(el.scrub.value) / 1000;
    S.phase = u * TWO_PI * (S.settings.timeline === 'boomerang' ? 2 : 1);
  });
  el.qualityInput.addEventListener('input', () => { el.qualityVal.textContent = (parseFloat(el.qualityInput.value) / 100).toFixed(1) + '\u00d7'; });
  for (const id of ['fmtSelect', 'resSelect', 'aspectSelect', 'fpsSelect', 'lenModeSelect', 'cyclesSelect', 'speedSelect', 'padSelect', 'optSelect']) {
    el[id].addEventListener('change', updateExportHint);
  }
  el.durInput.addEventListener('input', updateExportHint);
  el.durInput.addEventListener('change', () => {
    el.durInput.value = String(requestedSeconds());
    updateExportHint();
  });
  el.optTargetInput.addEventListener('input', updateExportHint);
  el.qualityInput.addEventListener('change', updateExportHint);
  bindCheck('transparentChk', 'transparent');
  el.transparentChk.addEventListener('change', updateExportHint);
  el.wmChk.addEventListener('change', () => { S.wmOn = el.wmChk.checked; });
  el.wmText.value = '';

    for (const id of ['browseBtn', 'chooseBtn']) el[id].addEventListener('click', () => el['lq-fileInput'].click());
  for (const id of ['lq-sampleBtn', 'sampleBtn2']) el[id].addEventListener('click', () => loadSample());
  el['lq-fileInput'].addEventListener('change', () => {
    const f = el['lq-fileInput'].files && el['lq-fileInput'].files[0];
    el['lq-fileInput'].value = '';
    if (f) useSource(f, f.name, { fresh: true }).catch(err => toast(String(err.message || err)));
  });
  el.aiGenBtn.addEventListener('click', generateAiImage);

    selectOptions(el.depthSrcSel, [
    { id: 'auto', label: 'Built-in estimate' },
    { id: 'model', label: 'AI depth map' },
  ], d => d.id, d => d.label);
  el.depthSrcSel.addEventListener('change', () => {
    S.settings.depthSource = el.depthSrcSel.value === 'model' ? 'model' : 'auto';
    syncDepthUI();
    S.maskDirty = true;
    updateExportHint();
  });
  el.depthComputeBtn.addEventListener('click', computeDepthNow);
  el.depthCancelBtn.addEventListener('click', () => {
    S.depthCancel = true;
    busyStatus(el.depthStatusEl, 'cancelling…');
            if (modelWorkerPromise) modelWorkerPromise.then(w => w.postMessage({ type: 'cancel' })).catch(() => {});
  });
  bindRange('depthBands', () => Math.round(S.settings.depthBands || 3), v => { S.settings.depthBands = v; }, v => v + ' slices');
  el.depthBandsBtn.addEventListener('click', splitDepthLayers);

    el.useModelsChk.addEventListener('change', () => setLibPref('models', el.useModelsChk.checked));
  el.useVideoLibChk.addEventListener('change', () => setLibPref('videoLib', el.useVideoLibChk.checked));
  for (const id of ['infoBtn', 'libsInfoBtn']) el[id].addEventListener('click', openInfo);
  el.libsCloseBtn.addEventListener('click', () => { el.libsModal.hidden = true; });
  el.libsCheckBtn.addEventListener('click', checkLibsUpdates);
  el.libsClearBtn.addEventListener('click', clearModelCache);
  el.libsCopyBtn.addEventListener('click', copyLibsReport);

    el.aboutBtn.addEventListener('click', () => { el.aboutModal.hidden = false; });
  el.aboutCloseBtn.addEventListener('click', () => { el.aboutModal.hidden = true; });
    el.aboutModal.addEventListener('click', e => { if (e.target === el.aboutModal) el.aboutModal.hidden = true; });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.aboutModal.hidden) el.aboutModal.hidden = true; });

    el.projectSaveFileBtn.addEventListener('click', projectToFile);
  el.projectOpenFileBtn.addEventListener('click', () => el.projectFileInput.click());
  el.projectFileInput.addEventListener('change', () => {
    const f = el.projectFileInput.files && el.projectFileInput.files[0];
    el.projectFileInput.value = '';
    if (f) projectFromFile(f);
  });

    el.projectUploadBtn.addEventListener('click', uploadProjectZip);
  el.uploadExportBtn.addEventListener('click', uploadLastExport);
  el.uploaderBtn.addEventListener('click', () => setUploader(true));
  el.uploaderCloseBtn.addEventListener('click', () => setUploader(false));
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && uploaderIsOpen()) setUploader(false); });
    el.uploadedCloseBtn.addEventListener('click', () => { el.uploadedModal.hidden = true; });
  el.uploadedModal.addEventListener('click', e => { if (e.target === el.uploadedModal) el.uploadedModal.hidden = true; });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.uploadedModal.hidden) el.uploadedModal.hidden = true; });
  el.uploadedCopyBtn.addEventListener('click', async () => {
    const url = el.uploadedUrl.value;
    if (!url) return;
    el.uploadedUrl.select();
    toast(await copyText(url) ? 'Link copied' : 'Copy it from the box above.');
  });
  el.uploadedOpenBtn.addEventListener('click', () => {
    const url = el.uploadedUrl.value;
    if (url) window.open(url, '_blank', 'noopener');
  });

    el.saveBtn.addEventListener('click', saveProject);
  el.shareBtn.addEventListener('click', copyShareLink);

    el.menuBtn.addEventListener('click', e => { e.stopPropagation(); setMenu(!menuIsOpen()); });
      el.themeBtn.addEventListener('click', () => { toggleTheme(); });
    el.menuPanel.addEventListener('click', () => setMenu(false));
    document.addEventListener('click', e => { if (menuIsOpen() && !el.menuWrap.contains(e.target)) setMenu(false); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && menuIsOpen()) setMenu(false); });

    for (const evt of ['dragenter', 'dragover']) {
    el.stageWrap.addEventListener(evt, e => { e.preventDefault(); el.stageWrap.classList.add('dragover'); });
  }
  for (const evt of ['dragleave', 'drop']) {
    el.stageWrap.addEventListener(evt, e => { e.preventDefault(); el.stageWrap.classList.remove('dragover'); });
  }
  el.stageWrap.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type)) useSource(f, f.name, { fresh: true }).catch(err => toast(String(err.message || err)));
    else if (f) toast('That is not an image file.');
  });
  document.addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.indexOf('image') === 0) {
        const f = it.getAsFile();
        if (f) { useSource(f, 'Pasted image', { fresh: true }).catch(err => toast(String(err.message || err))); return; }
      }
    }
  });

    window.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'z' || e.key === 'Z') { if (e.shiftKey) redoMask(); else undoMask(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (!S.w) return;
      S.playing = false;
      syncPlayButtons();
      const d = (e.key === 'ArrowLeft' ? -1 : 1) * TWO_PI * 0.04;
      S.phase = (S.phase + d + TWO_PI * 4096) % (TWO_PI * 4096);
    }
  });

  window.addEventListener('resize', debounce(fitStage, 120));
  // On a phone the visual viewport moves on its own: the URL bar slides away, the keyboard opens, the
  // on-screen controls appear. `vh` (and the layout viewport) ignore all of that, so the photo is
  // re-fitted from the height the user can actually see.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', debounce(fitStage, 80));
    window.visualViewport.addEventListener('scroll', debounce(fitStage, 120));
  }
}

function syncPlayButtons() {
  el.playPauseBtn.innerHTML = icon(S.playing ? 'ic-pause' : 'ic-play');
  el.playPauseBtn.title = S.playing ? 'Pause' : 'Play';
}

function themeIsLight() { return liqRootEl().classList.contains('light'); }

function applyTheme(mode) {
  const light = mode === 'light';
  liqRootEl().classList.toggle('light', light);
      el.themeIcon.innerHTML = icon(light ? 'ic-moon' : 'ic-sun');
  el.themeLabel.textContent = light ? 'Dark mode' : 'Light mode';
  el.themeBtn.title = light ? 'Switch to the dark theme' : 'Switch to the light theme';
}

async function setTheme(mode) {
  applyTheme(mode);
  try { S.libs = await models.savePrefs(prefStore(), Object.assign({}, S.libs, { theme: mode })); }
  catch (_) {   }
}

function toggleTheme() { return setTheme(themeIsLight() ? 'dark' : 'light'); }

function menuIsOpen() { return !el.menuPanel.hidden; }

function setMenu(open) {
  el.menuPanel.hidden = !open;
  el.menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  el.menuBtn.classList.toggle('active', open);
}

function togglePlay() {
  S.playing = !S.playing;
  syncPlayButtons();
}

function setMode(id) {
  const m = MODES.find(x => x.id === id) || {};
  if (id === S.settings.mode) { el.modeHintEl.textContent = m.hint || ''; return; }
  S.settings.mode = id;
  el.modeHintEl.textContent = m.hint || '';
  updateModeVisibility();
  syncLayerUI();
  if (currentLayer().maskSource === 'auto' && S.w) autoMask(true);
  updateInfo();
}

function updateModeVisibility() {
  const m = S.settings.mode;
  for (const node of document.querySelectorAll('[data-only-mode]')) node.hidden = node.dataset.onlyMode !== m;
  for (const b of el.modeGrid.querySelectorAll('button')) b.classList.toggle('active', b.dataset.mode === m);
  syncAdvToggles();
}

const ADVANCED_GROUPS = [
  ['sourceCard', [
    '#aiHeadRow', '#aiPromptInput', '#aiGenBtn', '#aiStatusEl',
  ]],
  ['motionCard', [
    '#layerOpacity', '#speedInput',
    ['#chestChk', 'breathing'], ['#chestAmt', 'breathing'],
    ['#flowFreq', 'flow'], ['#flowRamp', 'flow'],
    ['#flameSpread', 'flames'], ['#flameSway', 'flames'],
    ['#swayPosEl', 'sway'],
    ['#zoomPosEl', 'zoom'], ['#zoomDirSel', 'zoom'],
    // The AI depth map and the depth-layer split are *features*, not fine-tuning knobs, so they stay in
    // the depth block's default view: folding them into "Advanced settings" (where the subject-bias
    // slider below belongs) hid the whole function — you saw the depth preview and "Compute AI depth"
    // but no way to pick the AI map or split the picture into background/foreground layers.
    ['#depthBias', 'depth'],
  ]],
  ['maskCard', [
    '#brushFlow', '#brushHardness', '#symmetryChk', '#autoSens',
    '#growBtn', '#lq-undoBtn', '#maskSubAll',
  ]],
  ['fxCard', [
    '#fxAngle', '#fxSpread', '#fxWind', '#fxTurb', '#fxBlur', '#fxGlow',
    '#fxFlash', '#fxOpacity', '#fxDepth', '#fxBehind', '#fxBlendSel', '#fxSeedBtn', '#fxSub',
  ]],
  ['glitchCard', [
    '#glitchBurst', '#glitchRate', '#glitchGrid', '#glitchSeedBtn',
  ]],
  ['glowCard', [
    '#glowSoftness', '#glowSpeed', '#glowSeedBtn', '#glowSub',
  ]],
  ['exportCard', [
    '#speedSelect', '#padSelect', '#optSelect', '#optNoteEl', '#optTargetRow',
    '#qualityInput', '#transparentChk', '#wmChk', '#wmText',
    '#uploadExportBtn', '#uploadExportStatusEl',
  ]],
  ['projCard', [
    '#projectSaveFileBtn', '#projectFileStatusEl', '#projectUploadBtn', '#shareImgChk', '#shareOut', '#projHint',
  ]],
];

const ADV_OPEN_KEY = 'liquidizer.advOpen';
let advOpen = (() => { try { return JSON.parse(localStorage.getItem(ADV_OPEN_KEY) || '{}') || {}; } catch (_) { return {}; } })();

function initAdvanced() {
  for (const [cardId, items] of ADVANCED_GROUPS) {
    const card = document.getElementById(cardId);
    if (!card) continue;
    const body = card.querySelector('.cardBody') || card;
    const adv = document.createElement('div');
    adv.className = 'advBody';
    adv.hidden = true;
    let moved = 0;
    for (const item of items) {
      const sel = Array.isArray(item) ? item[0] : item;
      const mode = Array.isArray(item) ? item[1] : null;
      const node = sel.charAt(0) === '#' ? document.getElementById(sel.slice(1)) : card.querySelector(sel);
      if (!node || node.dataset.advMoved) continue;
      let target = node.closest('.row, .btnrow, .check');
      if (!target || target === body || !body.contains(target)) target = node;
      if (target.dataset.advMoved) continue;
      target.dataset.advMoved = '1';
      if (mode) target.dataset.onlyMode = mode;
      adv.appendChild(target);
      moved++;
    }
    if (!moved) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'advToggle';
    btn.innerHTML = icon('ic-arrow-down') + '<span>Advanced settings</span><span class="advCount">' + moved + '</span>';
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      advOpen[cardId] = !advOpen[cardId];
      try { localStorage.setItem(ADV_OPEN_KEY, JSON.stringify(advOpen)); } catch (_) {}
      applyAdvState(cardId);
    });
    body.append(btn, adv);
  }
  syncAdvToggles();
}

function advChildVisible(c) {
  if (c.hidden) return false;
  if (c.dataset.onlyMode && c.dataset.onlyMode !== S.settings.mode) return false;
  return true;
}

function applyAdvState(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const adv = card.querySelector('.advBody');
  const btn = card.querySelector('.advToggle');
  if (!adv || !btn) return;
  const anyVisible = Array.prototype.some.call(adv.children, advChildVisible);
  btn.hidden = !anyVisible;
  const open = !!advOpen[cardId] && anyVisible;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  adv.hidden = !open;
}

function syncAdvToggles() {
  for (const [cardId] of ADVANCED_GROUPS) applyAdvState(cardId);
}

function setPick(kind, btn) {
  if (S.pick === kind) { S.pick = null; btn.classList.remove('primary'); updatePickLabels(); syncPlaceBar(); return; }
  S.pick = kind;
  for (const b of [el.pickSwayBtn, el.pickZoomBtn]) b.classList.remove('primary');
  btn.classList.add('primary');
  updatePickLabels();
  toast('Click the image to place the ' + (kind === 'sway' ? 'pivot' : 'focus point'));
  syncPlaceBar();
  revealStage();
}

// An armed pick ("the next tap on the photo places the pivot") beats a brush target: while one is
// armed, a tap on the photo places the pivot instead of painting, which reads as "the brush does
// nothing". Arming a brush target therefore cancels it — the tap the user is about to make is a
// brush stroke, and that is the only thing it can be.
function clearPick() {
  if (!S.pick) return;
  S.pick = null;
  for (const b of [el.pickSwayBtn, el.pickZoomBtn]) b.classList.remove('primary');
  updatePickLabels();
  syncPlaceBar();
}

// The stage is the only place anything can be painted or picked, but on a phone it sits above
// every card — and the canvas swallows scroll gestures (touch-action: none), so a flick that
// starts on it paints instead of scrolling. Arming a target therefore brings the preview to the
// user rather than making them scroll to it (which is what used to cancel the gesture).
function revealStage() {
  const wrap = el.stageWrap;
  if (!wrap || wrap.hidden || !S.w) return;
  const se = document.scrollingElement || document.documentElement;
  const vh = viewportHeight() || Math.round(se.clientHeight || 0);
  if (!vh) return;
  const hdr = document.querySelector('header.topbar');
  const pad = (hdr ? hdr.getBoundingClientRect().height : 0) + 8;
  // Size the photo for the window we are in *now*, then bring the photo itself into view. The photo is
  // what has to be under the thumb, and it is not the same box as the wrapping stage: with a tall
  // min-height the picture sat centred inside a box that was too big to fit, so "scroll the stage into
  // view" could leave the photo entirely below the fold — a brush that works perfectly and cannot
  // reach anything.
  fitStage();
  const box = (el.stage && !el.stage.hidden) ? el.stage : wrap;
  const r = box.getBoundingClientRect();
  const under = (el.placeBar && !el.placeBar.hidden ? el.placeBar.offsetHeight + 12 : 0);
  if (r.top >= pad && r.bottom <= vh - under - 6) return;
  const room = Math.max(60, vh - pad - under);
  const top = r.height <= room
    ? window.scrollY + r.top - pad - Math.max(0, (room - r.height) / 2)
    : window.scrollY + r.top - pad;
  if (se.scrollHeight - se.clientHeight > 4) {
    // 'instant', not the page's smooth scrolling: a smooth scroll is still moving when the thumb
    // lands on the photo, and the tap or drag that stops it never reaches the canvas.
    window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: 'instant' });
    return;
  }
  try { box.scrollIntoView({ behavior: 'instant', block: 'nearest' }); }
  catch (_) { box.scrollIntoView(); }
}

// Everything that has to be finished on the image gets a persistent bar next to it, because the
// instructions used to live in a toast that had faded long before a phone user had scrolled there.
function syncPlaceBar() {
  const bar = el.placeBar;
  if (!bar) return;
  const t = S.w ? maskTarget() : null;
  let text = '', tint = null, action = 'Done';
  if (S.pick === 'sway') { text = 'Tap the photo to place the pivot.'; action = 'Cancel'; }
  else if (S.pick === 'zoom') { text = 'Tap the photo to place the focus point.'; action = 'Cancel'; }
  else if (t && t.kind === 'emitter') {
    const e = fxList()[t.index];
    const nm = e ? e.name + '’s' : 'this emitter’s';
    tint = emitterTint(t.index);
    text = hasSpawnArea(t.index)
      ? 'Placing ' + nm + ' spawn area — brush over the photo.'
      : 'Brush the photo to place ' + nm + ' spawn area — nothing shows until you do.';
  }
  bar.hidden = !text;
  if (!text) { fitStage(); return; }
  el.placeTextEl.textContent = text;
  el.placeTint.hidden = !tint;
  if (tint) el.placeTint.style.background = 'rgb(' + tint.join(',') + ')';
  el.placeDoneBtn.textContent = action;
  fitStage();
}

function finishPlacing() {
  if (S.pick) {
    const btn = S.pick === 'sway' ? el.pickSwayBtn : el.pickZoomBtn;
    setPick(S.pick, btn);
    return;
  }
  S.eng.selectMask(S.settings.activeLayer);
  S.maskDirty = true;
  trace({ ev: 'brush-back-to-layer', layer: S.settings.activeLayer });
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  syncAll();
  updateMaskStatus();
  toast('Painting ' + currentLayer().name + ' again.');
}

const LAYER_TINTS = [[255, 105, 70], [86, 190, 255], [176, 130, 255], [120, 226, 150]];
const LAYER_TINT_NAMES = ['orange', 'blue', 'violet', 'green'];

function layerTint(i) { return LAYER_TINTS[i % LAYER_TINTS.length]; }
function layerTintCss(i) { return 'rgb(' + layerTint(i).join(',') + ')'; }
function layerTintName(i) { return LAYER_TINT_NAMES[i % LAYER_TINT_NAMES.length]; }

function hexRgbLocal(h) {
  if (typeof h !== 'string' || !/^#[0-9a-f]{6}$/i.test(h)) return null;
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function emitterTint(i) {
  const e = S.settings.particles[i];
  return hexRgbLocal(e && e.color) || LAYER_TINTS[0];
}

function currentLayer() {
  const ls = S.settings.layers;
  return ls[S.settings.activeLayer] || ls[0];
}

function syncLayerMasks() {
  const n = S.settings.layers.length;
  while (S.eng.masks.length < n) S.eng.addMask();
  while (S.eng.masks.length > n) S.eng.removeMaskAt(S.eng.masks.length - 1);
  S.eng.setLayerMask(S.settings.activeLayer);
}

function syncEmitterMasks() {
  const n = S.settings.particles.length;
  while (S.eng.pmaskCount() < n) S.eng.addPMask();
  while (S.eng.pmaskCount() > n) S.eng.removePMaskAt(S.eng.pmaskCount() - 1);
}

// The engine's masks outlive a swap of `S.settings`, so a load has to blank them: any emitter the payload
// does not carry a spawn area for must start empty rather than silently reuse the previous project's.
function resetSpawnAreas() {
  for (let i = 0; i < S.eng.pmaskCount(); i++) S.eng.clearPMaskAt(i);
}

function maskTarget() {
  const kind = S.eng.targetKind();
  return { kind, index: S.eng.targetIndex() };
}

// The emitter whose spawn area the brush is on right now (-1 when the brush is on a layer mask).
function engTargetParticle() {
  return S.eng.targetKind() === 'emitter' ? S.eng.targetIndex() : -1;
}

function targetName(t) {
  if (t.kind === 'emitter') {
    const e = fxList()[t.index];
    return (e ? e.name : 'Emitter') + ' spawn area';
  }
  const l = S.settings.layers[t.index];
  return l ? l.name : 'Layer';
}

function selectEmitterSpawn(i, opts = {}) {
  if (!S.w) { toast('Load an image first.'); return; }
  const e = fxList()[i];
  if (!e) return;
  armEmitterSpawn(i, { via: 'area-button', reveal: opts.reveal !== false });
  fxSelect(i);
  syncAll();
  updateMaskStatus();
  paintMaskOverlay();
  if (opts.reveal !== false) revealStage();
  if (!opts.quiet) {
    toast(hasSpawnArea(i)
      ? 'Editing the “' + e.name + '” spawn area — brush over the photo to change it. Erase rubs it out.'
      : '“' + e.name + '” has no spawn area yet, so nothing shows. Brush over the photo where its particles should be born.');
  }
}

function hasSpawnArea(i) {
  if (!S.w) return false;
  return S.eng.pmaskCoverage(i, 0.12) > 0.0005;
}

function seedEmitterArea(i, area) {
  const m = S.eng.ensurePMask(i);
  if (!m || !S.w || !S.h) return false;
  const a = area || { x0: 0.2, y0: 0.6, x1: 0.8, y1: 0.94 };
  const w = S.w, h = S.h;
  const x0 = a.x0 * w, x1 = a.x1 * w, y0 = a.y0 * h, y1 = a.y1 * h;
  const feather = Math.max(1, Math.min(x1 - x0, y1 - y0) * 0.28);
  m.fill(0);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const dy = Math.min(y - y0, y1 - y);
    for (let x = 0; x < w; x++) {
      const dx = Math.min(x - x0, x1 - x);
      const d = Math.min(dx, dy);
      if (d <= -feather) continue;
      m[row + x] = d >= 0 ? 1 : smoothstepLocal(0, feather, d + feather);
    }
  }
  return true;
}

function smoothstepLocal(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
}

function resetHistory() {
  S.undo.length = 0;
  S.redo.length = 0;
  updateMaskButtons();
}

function selectLayer(i) {
  const ls = S.settings.layers;
  if (!ls.length) return;
  clearPick();
  S.settings.activeLayer = Math.max(0, Math.min(ls.length - 1, i | 0));
  S.eng.selectMask(S.settings.activeLayer);
  S.maskDirty = true;
  syncAll();
  updateMaskStatus();
  if (!el.maskCanvas.hidden) paintMaskOverlay();
}

function pickFreshMode() {
  const used = {};
  for (const l of S.settings.layers) used[l.mode] = true;
  for (const m of MODES) if (!used[m.id] && m.id !== 'depth' && m.id !== 'none') return m.id;
  return 'flow';
}

function addLayer() {
  if (!S.w) { toast('Load an image first.'); return; }
  if (S.settings.layers.length >= MAX_LAYERS) { toast('That is the most layers (' + MAX_LAYERS + ').'); return; }
  const mode = pickFreshMode();
  const l = makeLayer('Layer ' + (S.settings.layers.length + 1), mode);
  S.settings.layers.push(l);
  S.eng.addMask();
  S.settings.activeLayer = S.settings.layers.length - 1;
  S.eng.selectMask(S.settings.activeLayer);
  S.eng.buildAutoMask(S.settings.autoSens, S.settings, S.settings.activeLayer);
  resetHistory();
  S.maskDirty = true;
  syncAll();
  updateMaskStatus();
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  const label = (MODES.find(m => m.id === mode) || {}).label || mode;
  toast(l.name + ' · ' + label + ' — paint where it should move.');
}

async function removeLayer(i) {
  if (S.settings.layers.length <= 1) { toast('The base layer cannot be removed.'); return; }
  const l = S.settings.layers[i];
  if (!(await window.uiConfirm('Remove “' + l.name + '”?', { okText: 'Remove', danger: true }))) return;
  S.settings.layers.splice(i, 1);
  S.eng.removeMaskAt(i);
  S.settings.activeLayer = Math.min(S.settings.activeLayer, S.settings.layers.length - 1);
  S.eng.selectMask(S.settings.activeLayer);
  resetHistory();
  S.maskDirty = true;
  syncAll();
  updateMaskStatus();
  if (!el.maskCanvas.hidden) paintMaskOverlay();
}

function moveLayer(i, d) {
  const ls = S.settings.layers;
  const j = i + d;
  if (j < 0 || j >= ls.length) return;
  const t = ls[i]; ls[i] = ls[j]; ls[j] = t;
  S.eng.moveMaskAt(i, j);
  S.settings.activeLayer = j;
  S.eng.selectMask(j);
  resetHistory();
  syncAll();
}

function toggleLayer(i) {
  S.settings.layers[i].on = !S.settings.layers[i].on;
  syncAll();
  updateMaskStatus();
}

function renameLayer(i) {
  const l = S.settings.layers[i];
  const name = prompt('Layer name:', l.name);
  if (name == null) return;
  l.name = name.trim().slice(0, 18) || l.name;
  syncAll();
}

function rebuildAutoMasks(quiet) {
  if (!S.w) return 0;
  const ls = S.settings.layers;
  let n = 0;
  for (let i = 0; i < ls.length; i++) {
    if (ls[i].maskSource !== 'auto') continue;
    S.eng.buildAutoMask(S.settings.autoSens, S.settings, i);
    n++;
  }
  refreshDepthThumb();
  if (n) afterMaskChange();
  if (!quiet && n) toast('Auto mask rebuilt for ' + n + (n === 1 ? ' layer' : ' layers'));
  return n;
}

function rebuildMasksForImage() {
  const ls = S.settings.layers;
  for (let i = 0; i < ls.length; i++) {
                if (ls[i].maskSource === 'auto') S.eng.buildAutoMask(S.settings.autoSens, S.settings, i);
    else S.eng.clearMaskAt(i);
  }
  S.eng.selectMask(S.settings.activeLayer);
  refreshDepthThumb();
}

function applyLoadedMasks(list, forceManual) {
  if (!S.w || !Array.isArray(list) || !list.length) return false;
  const n = S.settings.layers.length;
  let any = false;
  for (let i = 0; i < n; i++) {
    const raw = list[i];
    if (raw == null) continue;
    const m = typeof raw === 'string' ? maskFromB64(raw, S.w * S.h) : maskFromShare(raw, S.w, S.h);
    if (!m) continue;
    S.eng.setMask(m, i);
    if (forceManual) S.settings.layers[i].maskSource = 'manual';
    any = true;
  }
  return any;
}

function applyLoadedSpawnMasks(list) {
  if (!S.w || !Array.isArray(list) || !list.length) return false;
  const n = S.settings.particles.length;
  let any = false;
  for (let i = 0; i < n; i++) {
    const raw = list[i];
    if (raw == null) continue;
    const m = typeof raw === 'string' ? maskFromB64(raw, S.w * S.h) : maskFromShare(raw, S.w, S.h);
    if (!m) continue;
    S.eng.setPMask(m, i);
    any = true;
  }
  return any;
}

function applyPresetStack(preset) {
  const replacesEmitters = !!(preset && preset.patch && Array.isArray(preset.patch.particles));
  applyPreset(S.settings, preset);
  installLayerView(S.settings);
  syncLayerMasks();
  syncEmitterMasks();
  if (S.w) {
    if (replacesEmitters) {
      const fl = fxList();
      for (let i = 0; i < fl.length; i++) { S.eng.clearPMaskAt(i); seedEmitterArea(i, kindArea(fl[i].kind)); }
    }
    rebuildAutoMasks(true);
  }
  S.eng.selectMask(S.settings.activeLayer);
  syncAll();
  updateMaskStatus();
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  toast('Preset: ' + preset.name);
}

function migrateSpawnAreas(hasData) {
  if (hasData || !S.w) return;
  const fl = fxList();
  for (let i = 0; i < fl.length; i++) seedEmitterArea(i, kindArea(fl[i].kind));
}

function maskBadge(i) {
  const l = S.settings.layers[i];
        if (!l) return '';
  if (!l.on) return 'muted';
  const cov = Math.round(S.eng.maskCoverage(0.15, i) * 100);
  return (l.maskSource === 'auto' ? 'auto ' : 'paint ') + cov + '%';
}

function updateLayerBadges() {
  for (const row of el.layerList.querySelectorAll('.layerRow')) {
    const b = row.querySelector('.badge');
    if (b) b.textContent = maskBadge(parseInt(row.dataset.i, 10));
  }
}

function syncLayerUI() {
  const ls = S.settings.layers;
  const active = S.settings.activeLayer;
  el.layerList.innerHTML = '';
  const mk = (ic, label, title, fn) => {
    const b = document.createElement('button');
    b.className = 'layerTool';
    b.innerHTML = icon(ic);
    b.setAttribute('aria-label', label);
    b.title = title;
    b.addEventListener('click', ev => { ev.stopPropagation(); fn(); });
    return b;
  };
  for (let i = ls.length - 1; i >= 0; i--) {
    const l = ls[i];
    const row = document.createElement('div');
    row.className = 'layerRow' + (i === active ? ' active' : '') + (l.on ? '' : ' muted');
    row.dataset.i = String(i);
    row.title = l.name + (l.on ? '' : ' (muted)') + ' — ' + (l.maskSource === 'auto' ? 'auto' : 'painted') +
      ' mask, ' + Math.round(S.eng.maskCoverage(0.15, i) * 100) + '% of the frame moves. Click to edit, double-click the name to rename.';

    const on = document.createElement('button');
    on.className = 'layerOn';
    on.innerHTML = icon(l.on ? 'ic-eye' : 'ic-eye-off');
    on.title = (l.on ? 'Mute this layer' : 'Unmute this layer') + ' — its mask paints in ' + layerTintName(i) + ' in the overlay';
    if (l.on) on.style.color = layerTintCss(i);
    on.addEventListener('click', ev => { ev.stopPropagation(); toggleLayer(i); });

    const name = document.createElement('span');
    name.className = 'layerName';
    name.textContent = l.name;
    name.title = 'Double-click to rename';
    name.addEventListener('dblclick', ev => { ev.stopPropagation(); renameLayer(i); });

    const chip = document.createElement('span');
    chip.className = 'chip';
    const cyc = layerCycles(l.params.speed);
    chip.textContent = ((MODES.find(m => m.id === l.mode) || {}).label || l.mode) + (cyc > 1 ? ' · ' + cyc + '×' : '');
    chip.title = cyc + ' motion cycle' + (cyc > 1 ? 's' : '') + ' per loop, just for this layer';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = maskBadge(i);

    const tools = document.createElement('span');
    tools.className = 'layerTools';
    tools.append(
      mk('ic-arrow-up', 'Move forward', 'Move forward (painted over the layers it passes)', () => moveLayer(i, 1)),
      mk('ic-arrow-down', 'Move back', 'Move back', () => moveLayer(i, -1)),
      mk('ic-ban', 'Clear mask', 'Clear this layer\u2019s mask (it stops moving its area, and the layers below get theirs back)', () => clearLayerMask(i)),
      mk('ic-trash', 'Remove layer', 'Remove this layer', () => removeLayer(i)),
    );

    row.append(on, name, chip, badge, tools);
    row.addEventListener('click', () => selectLayer(i));
    el.layerList.appendChild(row);
  }

  el.layerAddBtn.innerHTML = ls.length >= MAX_LAYERS
    ? icon('ic-layers') + 'Max ' + MAX_LAYERS + ' layers'
    : icon('ic-plus') + 'Layer';
  el.layerAddBtn.disabled = ls.length >= MAX_LAYERS;

  const sel = el.maskTargetSel;
  sel.innerHTML = '';
  for (let i = 0; i < ls.length; i++) {
    const o = document.createElement('option');
    o.value = 'L' + i;
    o.textContent = ls[i].name + ' · ' + ((MODES.find(m => m.id === ls[i].mode) || {}).label || ls[i].mode) +
      ' · ' + (ls[i].maskSource === 'auto' ? 'auto' : 'painted');
    sel.appendChild(o);
  }
  const fl = fxList();
  for (let i = 0; i < fl.length; i++) {
    const o = document.createElement('option');
    o.value = 'E' + i;
    o.textContent = fl[i].name + ' · ' + (hasSpawnArea(i) ? 'spawn area' : 'spawn area (empty)');
    sel.appendChild(o);
  }
  const tk = S.eng.targetKind(), ti = S.eng.targetIndex();
  sel.value = (tk === 'emitter' ? 'E' : 'L') + ti;
  if (!sel.value) sel.value = 'L' + active;
  sel.disabled = ls.length + fl.length < 2;

  const l = currentLayer();
  const target = maskTarget();
  if (target.kind === 'emitter') {
    const e = fl[target.index];
    const tt = emitterTint(target.index);
    el.maskSwatch.style.background = 'rgb(' + tt.join(',') + ')';
    el.maskSwatch.title = (e ? e.name : 'Emitter') + ' — paint where its particles are born';
  } else {
    el.maskSwatch.style.background = layerTintCss(active);
    el.maskSwatch.title = l.name + ' — this layer paints in ' + layerTintName(active) + ' in the overlay';
  }
  el.layerOpacity.value = String(Math.round(l.opacity * 100));
  el.layerOpacityVal.textContent = Math.round(l.opacity * 100) + '%';
  el.layerOpacity.disabled = !l.on;
  el.modeHintEl.textContent = (MODES.find(x => x.id === l.mode) || {}).hint || '';
  el.zoomDirSel.value = String(l.params.zoomDir);
  updatePickLabels();
}

function targetEntry() {
  const k = S.eng.targetKind(), i = S.eng.targetIndex();
  return k === 'emitter'
    ? { kind: 'emitter', index: i, mask: S.eng.clonePMask(i) }
    : { kind: 'layer', index: i, mask: S.eng.cloneMask(i) };
}

function pushUndo(layerIndex) {
  if (layerIndex == null) {
    S.undo.push(targetEntry());
  } else {
    const i = Math.max(0, Math.min(S.settings.layers.length - 1, layerIndex | 0));
    S.undo.push({ kind: 'layer', index: i, mask: S.eng.cloneMask(i) });
  }
  if (S.undo.length > 24) S.undo.shift();
  S.redo.length = 0;
  updateMaskButtons();
}

function updateMaskButtons() {
  el['lq-undoBtn'].disabled = !S.undo.length;
  el['lq-redoBtn'].disabled = !S.redo.length;
}

function restoreMaskEntry(e) {
  if (!e) return;
  if (e.kind === 'emitter') {
    S.eng.setPMask(e.mask, e.index);
    S.eng.selectEmitterMask(e.index);
    S.settings.activeParticle = clamp(e.index, 0, Math.max(0, fxList().length - 1));
  } else {
    const i = Math.max(0, Math.min(S.settings.layers.length - 1, (e.index == null ? e.layer : e.index) | 0));
    S.settings.activeLayer = i;
    S.eng.setMask(e.mask, i);
    S.eng.selectMask(i);
  }
  syncAll();
  afterMaskChange();
}

function undoMask() {
  if (!S.undo.length) return;
  S.redo.push(targetEntry());
  restoreMaskEntry(S.undo.pop());
  updateMaskButtons();
}

function redoMask() {
  if (!S.redo.length) return;
  S.undo.push(targetEntry());
  restoreMaskEntry(S.redo.pop());
  updateMaskButtons();
}

function maskOp(fn) {
  if (!S.w) return;
  pushUndo();
  fn();
  if (S.eng.targetKind() === 'layer') S.settings.maskSource = 'manual';
  afterMaskChange();
}

function clearTargetMask(quiet) {
  if (!S.w) return;
  const t = maskTarget();
  if (t.kind !== 'emitter') { clearLayerMask(t.index, quiet); return; }
  const e = fxList()[t.index];
  pushUndo();
  S.eng.clearPMaskAt(t.index);
  S.maskDirty = true;
  afterMaskChange();
  syncFxUI();
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  if (!quiet) toast('Cleared the spawn area for “' + (e ? e.name : 'the emitter') + '” — paint where it should come from.');
}

function clearLayerMask(i, quiet) {
  if (!S.w) return;
  const l = S.settings.layers[i];
  if (!l) return;
  pushUndo(i);
  S.eng.clearMaskAt(i);
  l.maskSource = 'manual';
  S.maskDirty = true;
  if (i === S.settings.activeLayer) afterMaskChange();
  else { updateLayerBadges(); updateInfo(); }
  syncLayerUI();
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  if (!quiet) toast('Cleared “' + l.name + '” — hit Auto mask or paint to bring its motion back.');
}

function afterMaskChange() {
  S.maskDirty = true;
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  updateLayerBadges();
  updateMaskStatus();
  updateInfo();
}

function updateMaskStatus() {
  if (!S.w) { setStatus(el.maskStatusEl, ''); return; }
  const t = maskTarget();
  const act = S.settings.brushMode === 'erase' ? 'erasing' : S.settings.brushMode === 'smart' ? 'selecting into' : 'painting';
  if (t.kind === 'emitter') {
    const e = fxList()[t.index];
    const cov = Math.round(S.eng.pmaskCoverage(t.index) * 100);
    const warn = cov === 0 ? ' — paint where the particles should be born (an empty area means nothing appears)' : '';
    setStatus(el.maskStatusEl, `${e ? e.name : 'Emitter'} spawn area · ${act} · ${cov}% of the frame is a spawn point${warn}`, cov === 0 ? 'warn' : null);
    return;
  }
  const l = S.settings.layers[t.index] || currentLayer();
  const cov = Math.round(S.eng.maskCoverage(0.15, t.index) * 100);
  const mean = Math.round(S.eng.maskMean(t.index) * 100);
  const src = l.maskSource === 'auto' ? 'auto' : 'painted';
  const warn = cov === 0 ? ' — paint here (or hit Auto mask) so this layer moves' : '';
  const off = l.on ? '' : ' (muted)';
  setStatus(el.maskStatusEl, `${l.name}${off} · ${act} · ${src} mask · ${cov}% of the frame moves (mean strength ${mean}%)${warn}`, cov === 0 || !l.on ? 'warn' : null);
}

function autoMask(quiet) {
  if (!S.w) return;
  if (S.eng.targetKind() === 'emitter') { toast('Auto mask builds a layer’s motion mask — pick a layer in the mask card first.'); return; }
  pushUndo();
  S.eng.buildAutoMask(S.settings.autoSens, S.settings, S.settings.activeLayer);
  S.settings.maskSource = 'auto';
  refreshDepthThumb();
  afterMaskChange();
  if (!quiet) toast('Auto mask · ' + Math.round(S.eng.maskCoverage() * 100) + '% of the frame');
}

function toWork(ev) {
  const r = el.stageCanvas.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) / Math.max(1, r.width) * S.w,
    y: (ev.clientY - r.top) / Math.max(1, r.height) * S.h,
  };
}

// A brush stroke must never fail silently: this is the one interaction with no other feedback, so an
// exception in the engine surfaces as a toast (once per distinct message) instead of a stroke that
// quietly does nothing while the console fills up.
let brushErrSeen = '';
function safeStroke(fn) {
  try {
    fn();
    return true;
  } catch (err) {
    const msg = String((err && err.message) || err);
    console.error('brush stroke failed:', err);
    if (msg !== brushErrSeen) {
      brushErrSeen = msg;
      toast('The brush could not paint there — ' + msg);
    }
    return false;
  }
}

function syncBrushCursor() {
  if (!el.stageCanvas) return;
  const m = S.settings.brushMode;
  el.stageCanvas.style.cursor = m === 'erase' ? 'cell' : (m === 'smart' ? 'copy' : 'crosshair');
}

// One way to change the brush mode, so the buttons, the cursor and the status line can never disagree
// with `S.settings.brushMode`. A brush that is silently in the wrong mode is indistinguishable from a
// brush that does not work: "smart" only does anything on the press, and erasing an empty mask does
// nothing at all.
function setBrushMode(mode, quiet) {
  const next = (mode === 'erase' || mode === 'smart') ? mode : 'paint';
  if (S.settings.brushMode === next) { syncBrushUI(); return; }
  S.settings.brushMode = next;
  syncBrushUI();
  if (!quiet) {
    toast(next === 'erase' ? 'Erase — strokes rub the mask out.'
      : next === 'smart' ? 'Smart select — a tap selects the pixels like the one you tapped.'
        : 'Paint — strokes add to the mask.');
  }
}

function syncBrushUI() {
  if (el.brushSeg) {
    for (const b of el.brushSeg.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.brush === S.settings.brushMode);
    }
  }
  syncBrushCursor();
  updateMaskStatus();
}

// The worst report to work from is "the brush does nothing on my phone": a touch that never reaches the
// canvas, a brush pointed at something else, and a stroke that lands but changes nothing all look the
// same from the outside. This keeps the raw evidence — which element each touch hit, of what kind, and
// what the stroke then decided — readable from the console with __liquidizerDebug.trace(). Discrete
// events only (no pointermove), 60 entries, no DOM work, so it is cheap enough to leave on.
const TRACE = [];
function trace(entry) {
  entry.ms = Date.now();
  TRACE.push(entry);
  if (TRACE.length > 60) TRACE.splice(0, TRACE.length - 60);
}
function tracePointer(ev) {
  const t = ev.target;
  const on = !t ? 'none' : (t.id ? '#' + t.id
    : (typeof t.className === 'string' && t.className.trim() ? '.' + t.className.trim().split(/\s+/)[0]
      : String(t.tagName || '').toLowerCase()));
  trace({ ev: ev.type, kind: ev.pointerType || 'touch', x: Math.round(ev.clientX), y: Math.round(ev.clientY), on });
}

// The brush is additive, so a stroke that lands entirely on a mask that is already full changes nothing
// at all — which looks exactly like a brush that is not working. Counting the painted pixels at the start
// and the end of a stroke is how the app can tell the difference and say so (see `end` below).
function targetPaintCount() {
  const t = maskTarget();
  const m = t.kind === 'emitter' ? S.eng.pmaskAt(t.index) : (S.eng.masks || [])[t.index];
  if (!m) return -1;
  let n = 0;
  for (let i = 0; i < m.length; i++) if (m[i] > 0.02) n++;
  return n;
}

let pointersTraced = false;
// Is this event a brush gesture on the photo? The brush listens on the stage *box* rather than on the
// canvas element, because a stroke must not depend on the canvas being the element under the finger: a
// tap that lands on the box around the photo, on a pick marker, or on the mask overlay all mean "brush
// here". A tap on a control inside the box (the dropzone's own buttons) is still a tap on that control.
function strokeEventTarget(ev) {
  const t = ev.target;
  if (!t || t === el.stageCanvas || t === el.stage || t === el.stageWrap) return true;
  const tag = String(t.tagName || '').toLowerCase();
  return !(tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea' ||
    tag === 'a' || tag === 'label' || tag === 'summary' || tag === 'svg' || tag === 'use');
}
function insideCanvas(ev) {
  const r = el.stageCanvas.getBoundingClientRect();
  const m = 2;
  return ev.clientX >= r.left - m && ev.clientX <= r.right + m && ev.clientY >= r.top - m && ev.clientY <= r.bottom + m;
}

function bindCanvas() {
  const c = el.stageCanvas;
  const host = el.stageWrap || c;
  if (!pointersTraced) {
    pointersTraced = true;
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'pointerleave', 'touchstart', 'touchend', 'touchcancel']) {
      document.addEventListener(type, tracePointer, { capture: true, passive: true });
    }
  }
  host.addEventListener('pointerdown', ev => {
    if (!strokeEventTarget(ev)) return;
    if (!S.w) { trace({ ev: 'brush-tap', kind: ev.pointerType, note: 'no image loaded' }); return; }
    if (!insideCanvas(ev)) {
      trace({ ev: 'brush-outside-photo', kind: ev.pointerType, x: Math.round(ev.clientX), y: Math.round(ev.clientY) });
      return;
    }
    const p = toWork(ev);
    trace({ ev: 'brush-tap', kind: ev.pointerType, target: targetName(maskTarget()), brush: S.settings.brushMode, size: S.settings.brushSize, flow: S.settings.brushFlow });
    if (S.pick === 'sway') {
      S.settings.swayPivotX = clamp01(p.x / S.w);
      S.settings.swayPivotY = clamp01(p.y / S.h);
      S.pick = null;
      el.pickSwayBtn.classList.remove('primary');
      updatePickLabels();
      syncPlaceBar();
      trace({ ev: 'pick-placed', pick: 'sway', x: Math.round(p.x), y: Math.round(p.y) });
      toast('Pivot set');
      return;
    }
    if (S.pick === 'zoom') {
      S.settings.zoomFocusX = clamp01(p.x / S.w);
      S.settings.zoomFocusY = clamp01(p.y / S.h);
      S.pick = null;
      el.pickZoomBtn.classList.remove('primary');
      updatePickLabels();
      syncPlaceBar();
      trace({ ev: 'pick-placed', pick: 'zoom', x: Math.round(p.x), y: Math.round(p.y) });
      toast('Focus point set');
      return;
    }
    const s = S.settings;
    if (s.brushMode === 'smart' && maskTarget().kind !== 'emitter') {
      pushUndo();
      let cov = 0;
      if (!safeStroke(() => { cov = S.eng.smartSelect(p.x, p.y, 0.16); })) cov = 0;
      s.maskSource = 'manual';
      afterMaskChange();
      trace({ ev: 'smart-select', cov: Math.round(cov * 1000) / 1000, target: targetName(maskTarget()) });
      toast(cov > 0 ? 'Selected ' + Math.round(cov * 100) + '% of the frame' : 'Nothing similar found there');
      return;
    }
    // A capture failure must not abort the stroke: the tap can outlive the pointer (a fast tap on a
    // busy frame comes back "no active pointer"), and throwing here used to lose the dab entirely.
    try { host.setPointerCapture(ev.pointerId); } catch (_) {}
    S.pointingId = ev.pointerId;
    S.painting = true;
    S.strokeCount0 = targetPaintCount();
    pushUndo();
    S.strokeFrom = null;
    if (!safeStroke(() => S.eng.strokeTo(null, p, s.brushSize, s.brushFlow, s.brushMode === 'erase', s.brushHardness, s.brushSymmetry))) {
      trace({ ev: 'stroke-failed', target: targetName(maskTarget()) });
      S.painting = false; S.strokeFrom = null; return;
    }
    S.strokeFrom = p;
    s.maskSource = 'manual';
    afterMaskChange();
    trace({ ev: 'stroke', target: targetName(maskTarget()), erase: s.brushMode === 'erase' });
  }, true);
  host.addEventListener('pointermove', ev => {
    if (!S.painting || !S.w) return;
    if (S.pointingId != null && ev.pointerId !== S.pointingId) return;
    const p = toWork(ev);
    if (!safeStroke(() => S.eng.strokeTo(S.strokeFrom, p, S.settings.brushSize, S.settings.brushFlow, S.settings.brushMode === 'erase', S.settings.brushHardness, S.settings.brushSymmetry))) {
      S.painting = false; S.strokeFrom = null; return;
    }
    S.strokeFrom = p;
    S.maskDirty = true;
  }, true);
  const end = () => {
    S.painting = false; S.strokeFrom = null; S.pointingId = null;
    if (S.strokeCount0 >= 0) {
      const now = targetPaintCount();
      if (now === S.strokeCount0) {
        toast(S.settings.brushMode === 'erase'
          ? 'There is nothing painted there to rub out.'
          : 'That is already painted — brushing it again changes nothing. Erase or Clear it first to redo it.');
      }
      S.strokeCount0 = -1;
    }
    updateMaskStatus(); updateInfo();
  };
  host.addEventListener('pointerup', () => { if (S.painting) end(); }, true);
  host.addEventListener('pointercancel', () => { if (S.painting) end(); }, true);
  // The platform owes us the pointer events until pointerup, but a phone can lose them anyway (the
  // finger leaves the window, the browser takes the gesture back for a system swipe). Without this a
  // lost stroke stays "painting" and the next touch continues a line from somewhere else.
  window.addEventListener('pointerup', ev => {
    if (S.painting && (S.pointingId == null || ev.pointerId === S.pointingId)) end();
  }, true);
  window.addEventListener('pointercancel', ev => {
    if (S.painting && (S.pointingId == null || ev.pointerId === S.pointingId)) end();
  }, true);
  // A captured pointer is still ours wherever the finger goes — the photo can be a fifth of the screen on
  // a phone, so a stroke that wanders off it must keep painting. Only an *uncaptured* leave ends it.
  host.addEventListener('pointerleave', () => {
    if (!S.painting) return;
    try { if (S.pointingId != null && host.hasPointerCapture(S.pointingId)) return; } catch (_) {}
    S.painting = false; S.pointingId = null; updateMaskStatus();
  }, true);
  updatePickLabels();
  updateMaskButtons();
  syncBrushCursor();
}

function updatePickLabels() {
  const s = S.settings;
  el.swayPosEl.textContent = `pivot at ${Math.round(s.swayPivotX * 100)}% / ${Math.round(s.swayPivotY * 100)}%`;
  el.zoomPosEl.textContent = `focus at ${Math.round(s.zoomFocusX * 100)}% / ${Math.round(s.zoomFocusY * 100)}%`;
  syncPickMarks();
}

// The pivot / focus markers, so a tap that places one is visibly *not* a brush stroke.
function syncPickMarks() {
  const s = S.settings;
  const mode = (currentLayer() || {}).mode;
  placePickMark(el.pickSwayMark, S.pick === 'sway' || mode === 'sway', s.swayPivotX, s.swayPivotY);
  placePickMark(el.pickZoomMark, S.pick === 'zoom' || mode === 'zoom', s.zoomFocusX, s.zoomFocusY);
}

function placePickMark(node, show, x, y) {
  if (!node) return;
  node.hidden = !show || !S.w;
  if (node.hidden) return;
  node.style.left = (clamp01(x) * 100).toFixed(2) + '%';
  node.style.top = (clamp01(y) * 100).toFixed(2) + '%';
}

async function generateAiImage() {
  const prompt = el.aiPromptInput.value.trim();
  if (!prompt) { toast('Describe the image you want first.'); return; }
  if (!root.generateImage) { toast('The image generator is not available.'); return; }
  busyStatus(el.aiStatusEl, 'generating…');
  el.aiGenBtn.disabled = true;
  try {
    const res = await root.generateImage({
      prompt,
      resolution: el.aiResSelect.value,
      negativePrompt: 'blurry, low quality, text, watermark, extra limbs',
    });
    const source = (res && (res.canvas || res.dataUrl)) || res;
    await useSource(source, 'AI image', { fresh: true });
    setStatus(el.aiStatusEl, 'done — vary the prompt to try again.', 'good');
  } catch (err) {
    setStatus(el.aiStatusEl, String((err && err.message) || err), 'bad');
  } finally {
    el.aiGenBtn.disabled = false;
  }
}

function padMode() { return el.padSelect.value || 'blur'; }
function exportQuality() { return parseFloat(el.qualityInput.value) / 100; }

function optimiseJob() {
  const opt = findOptimiser(el.optSelect.value);
  if (opt.id === 'target') {
    const mb = parseFloat(el.optTargetInput.value);
    return Object.assign({}, opt, { targetBytes: Math.max(0.02, isFinite(mb) ? mb : 1) * 1048576 });
  }
  return Object.assign({}, opt, { targetBytes: 0 });
}

function exportSpeed() {
  const v = parseFloat(el.speedSelect.value);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function exportMaxDim() {
  const v = el.resSelect.value;
  const user = v === 'working' ? Math.max(S.w, S.h) : parseInt(v, 10);
  const opt = findOptimiser(el.optSelect.value);
  return opt.maxDim ? Math.min(user, opt.maxDim) : user;
}

function updateExportHint() {
  const fmt = FORMATS.find(f => f.id === el.fmtSelect.value) || FORMATS[0];
  const plan = exportPlan({
    fps: parseInt(el.fpsSelect.value, 10),
    cycles: lengthCycles(),
    cycleSeconds: cycleSeconds(),
    speed: exportSpeed(),
    format: fmt.id,
    boomerang: S.settings.timeline === 'boomerang',
  });
  let maxDim = exportMaxDim();
  const opt = optimiseJob();
  const userDim = el.resSelect.value === 'working' ? Math.max(S.w, S.h) : parseInt(el.resSelect.value, 10);
  const fmtCap = Math.min(userDim, fmt.maxDim);
  const capped = Math.min(maxDim, fmt.maxDim);
  let tw = 0, th = 0;
  if (S.full) {
    const aspect = el.aspectSelect.value;
    tw = aspect === 'source' ? Math.min(S.full.w, capped) : capped;
    th = aspect === 'source' ? Math.min(S.full.h, capped) : capped;
  }
  const size = tw ? ` · up to ${tw}×${th}` : '';
  const secs = plan.seconds;
  const optNotes = [];
  if (opt.id !== 'off') {
    if (tw && fmt.needsCodec) {
      const eff = bitrateFor(tw, th, plan.fps, exportQuality()) * opt.bitrate;
      optNotes.push(eff >= 1e6 ? `~${(eff / 1e6).toFixed(1)} Mbps` : `~${Math.round(eff / 1000)} kbps`);
    }
    if (fmt.needsCodec) optNotes.push(`key frames every ${opt.keyFrame}s`);
    if (opt.targetBytes) optNotes.push(`target ≤ ${fmtBytes(opt.targetBytes)} (up to 3 passes)`);
    if (opt.id === 'target' && fmt.needsCodec && !S.libs.videoLib) {
      optNotes.push('needs the encoder library');
    }
    if (!fmt.needsCodec && fmt.id === 'png') optNotes.push('PNG is lossless — use MP4 or GIF for small files');
  }

  el.exportHintEl.textContent = `${plan.frames} frames · ${secs.toFixed(1)}s · ${plan.fps} fps${size}` +
    (capped < fmtCap ? ` (capped at ${capped}px${maxDim < userDim ? ' by the optimiser' : ` for ${fmt.id.toUpperCase()}`})` : '') +
    (plan.speed !== 1 ? ` · ${plan.speed}\u00d7 speed` : '') +
    (plan.boomerang ? ' · boomerang — each cycle plays both directions' : '') +
    (plan.capped
      ? ` · shortened to ${plan.cycles} whole ${plan.cycles === 1 ? 'cycle' : 'cycles'} to fit ${fmt.maxFrames} frames and keep the loop seamless`
      : (plan.truncated ? ` · ${fmt.id.toUpperCase()} is limited to ${fmt.maxFrames} frames — the loop will jump, lower the frame rate` : '')) +
    (S.settings.transparent && !fmt.alpha ? ' · transparency needs GIF or PNG' : '') +
    (fmt.needsCodec && !S.libs.videoLib ? ' · browser recorder (real time, no library)' : '') +
    (S.settings.depthSource === 'model' && !S.depth ? ' · no AI depth map yet — using the built-in estimate' : '') +
    (optNotes.length ? ' · ' + optNotes.join(' · ') : '') +
    (S.lastExport
      ? (exportIsStale()
        ? ` · the last export (${fmtBytes(S.lastExport.size)}) is out of date — export again to include your changes`
        : ` · last export ${fmtBytes(S.lastExport.size)}`)
      : '');
  if (S.lastExport && exportIsStale() && !el.uploadExportBtn.disabled) el.uploadExportBtn.disabled = true;
  el.optNoteEl.hidden = opt.id === 'off';
  el.optTargetRow.hidden = opt.id !== 'target';
  const bySeconds = lenMode() === 'seconds';
  el.lenCyclesRow.hidden = bySeconds;
  el.lenSecsRow.hidden = !bySeconds;
  el.lenNoteEl.hidden = !bySeconds;
  if (bySeconds && !el.lenNoteEl.hidden) {
    const got = clipSeconds(plan.cycles);
    const want = requestedSeconds();
    const name = fmt.id.toUpperCase();
    let text;
    if (plan.truncated) {
      text = `One whole cycle needs ${Math.round(frameCount(plan.fps, 1, cycleSeconds(), plan.boomerang ? 2 : 1))} frames at ${plan.fps} fps, but ${name} holds at most ${fmt.maxFrames} — the clip stops part-way through the cycle, so the loop jumps. Lower the frame rate for a seamless loop.`;
    } else {
      text = `Rounded to ${plan.cycles} whole ${plan.cycles === 1 ? 'cycle' : 'cycles'} · ${plan.seconds.toFixed(1)}s, so the clip's last frame joins its first with no jump.`;
      if (plan.capped) text += ` ${name} holds at most ${fmt.maxFrames} frames, so the length was reduced to the longest whole number of cycles that fits.`;
      else if (plan.cycles === 1 && got > want * 1.15) {
        text += ` One cycle of this motion lasts ${got.toFixed(1)}s — raise the animation Speed for a shorter clip.`;
      }
    }
    el.lenNoteEl.textContent = text;
  }
  const sel = el.cyclesSelect;
  for (const o of sel.options) {
    const c = parseInt(o.value, 10);
    o.textContent = c + (c === 1 ? ' cycle · ' : ' cycles · ') + clipSeconds(c).toFixed(1) + 's';
  }
}

function currentJob(filename) {
  const fmt = FORMATS.find(f => f.id === el.fmtSelect.value) || FORMATS[0];
  const fps = parseInt(el.fpsSelect.value, 10);
  const cycles = lengthCycles();
  const plan = exportPlan({
    fps, cycles, cycleSeconds: cycleSeconds(), speed: exportSpeed(), format: fmt.id,
    boomerang: S.settings.timeline === 'boomerang',
  });
  const settings = JSON.parse(JSON.stringify(S.settings));
  return {
    filename,
    job: {
      fullSrc: { data: S.full.data, w: S.full.w, h: S.full.h },
      masks: S.eng.masks.map(m => ({ data: m, w: S.w, h: S.h })),
      spawnMasks: S.eng.pmasks.map(m => ({ data: m, w: S.w, h: S.h })),
      settings,
      plan,
      aspect: el.aspectSelect.value,
      maxDim: exportMaxDim(),
      fit: 'contain',
      pad: padMode(),
      quality: exportQuality(),
                  optimise: optimiseJob(),
      transparent: !!S.settings.transparent,
      watermark: { on: el.wmChk.checked && !!el.wmText.value.trim(), text: el.wmText.value.trim(), opacity: 0.55 },
      ext: fmt.ext,
            depth: S.depth && S.settings.depthSource === 'model' && S.depth.data
        ? { data: S.depth.data, w: S.depth.w, h: S.depth.h } : null,
            noMediaLib: !S.libs.videoLib,
    },
  };
}

let exportWorkerPromise = null;
let exportClientId = 0;

async function moduleText(name) {
  const res = await fetch(new URL(name, import.meta.url));
  if (!res.ok) throw new Error('could not load ' + name);
  return await res.text();
}

async function makeExportWorker() {
  const [engineSrc, zipSrc, exporterSrc, workerSrc] = await Promise.all([
    moduleText('./engine.js'), moduleText('./zip.js'), moduleText('./exporter.js'), moduleText('./worker.js'),
  ]);
  const dropImports = src => src.replace(/^[ \t]*import[\s\S]*?from[ \t]*['"][^'"]+['"];?[ \t]*$/gm, '');
  const bundle = dropImports(engineSrc) + '\n' + dropImports(zipSrc) + '\n' + dropImports(exporterSrc) + '\n' + dropImports(workerSrc);
  const url = URL.createObjectURL(new Blob([bundle], { type: 'text/javascript' }));
  const worker = new Worker(url, { type: 'module' });
  worker._bundleUrl = url;
  return worker;
}

function getWorker() {
  if (!exportWorkerPromise) {
    exportWorkerPromise = makeExportWorker().catch(err => {
      exportWorkerPromise = null;
      throw err;
    });
  }
  return exportWorkerPromise;
}

function dropWorker() {
  const p = exportWorkerPromise;
  exportWorkerPromise = null;
  if (!p) return;
  p.then(w => {
    try { w.terminate(); } catch (e) {   }
    try { URL.revokeObjectURL(w._bundleUrl); } catch (e) {   }
  }).catch(() => {});
}

const EXPORT_STALL_TEXT = 'the encoder stopped responding';

let exportResultUrl = null;

function requestExportCancel() {
  S.cancelExport = true;
  const p = exportWorkerPromise;
  if (p) p.then(w => { try { w.postMessage({ type: 'cancel' }); } catch (e) {} }).catch(() => {});
}

function resetExportModal() {
  el.exportSpinner.hidden = false;
  el.exportResultCtn.hidden = true;
  el.cancelExportBtn.hidden = false;
  el.progressBar.style.width = '0%';
  el.exportVideoEl.pause();
  el.exportVideoEl.removeAttribute('src');
  el.exportVideoEl.style.width = '';
  el.exportVideoEl.style.height = '';
  try { el.exportVideoEl.load(); } catch (e) {}
  if (exportResultUrl) { URL.revokeObjectURL(exportResultUrl); exportResultUrl = null; }
  const box = el.exportModal.querySelector('.modalBox');
  if (box) box.classList.remove('resultMode');
}

function closeExportModal() {
  el.exportModal.hidden = true;
  el.exportVideoEl.pause();
  el.exportVideoEl.removeAttribute('src');
  if (exportResultUrl) { URL.revokeObjectURL(exportResultUrl); exportResultUrl = null; }
}

function fitExportVideo() {
  const v = el.exportVideoEl;
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return;
  const availW = Math.max(140, el.exportModal.querySelector('.modalBox').clientWidth - 40);
  const availH = Math.min(Math.max(64, window.innerHeight - 250), Math.round(window.innerHeight * 0.62));
  const s = Math.min(availW / vw, availH / vh, 6);
  v.style.width = Math.max(80, Math.round(vw * s)) + 'px';
  v.style.height = Math.max(60, Math.round(vh * s)) + 'px';
}

function showExportResult(blob, name, plan, fmt, secs, usedWorker) {
  el.exportSpinner.hidden = true;
  el.cancelExportBtn.hidden = true;
  el.exportResultCtn.hidden = false;
  el.exportTitle.textContent = 'Your clip';
  el.progressBar.style.width = '100%';
  el.exportSub.textContent = 'This is exactly what was exported — compare it with the preview.';
  const box = el.exportModal.querySelector('.modalBox');
  if (box) box.classList.add('resultMode');
  if (exportResultUrl) URL.revokeObjectURL(exportResultUrl);
  exportResultUrl = URL.createObjectURL(blob);
  el.exportVideoEl.style.width = '';
  el.exportVideoEl.style.height = '';
  el.exportVideoEl.onloadedmetadata = fitExportVideo;
  el.exportVideoEl.src = exportResultUrl;
  el.exportVideoEl.muted = true;
  const p = el.exportVideoEl.play();
  if (p && p.catch) p.catch(() => {});
  el.exportResultInfo.textContent = `${name} · ${plan.frames} frames · ${plan.seconds.toFixed(2)}s · ${plan.fps} fps · ${fmtBytes(blob.size)} in ${secs}s` +
    (usedWorker ? '' : ' (browser recorder)');
}

function maskSample(m) {
  let s = 0;
  for (let i = 0; i < m.length; i += 97) s += m[i];
  return s;
}

function sourceSample() {
  if (!S.full || !S.full.data) return 0;
  const d = S.full.data;
  let s = 0;
  for (let i = 0; i < d.length; i += 997) s += d[i];
  return s;
}

function exportSignature() {
  if (!S.full || !S.w || !S.eng || !S.eng.masks) return 'no-image';
  const { job } = currentJob(null);
  if (!job.plan || !isFinite(job.plan.frames)) return 'no-plan';
  return JSON.stringify({
    plan: [job.plan.frames, job.plan.fps, job.plan.speed, job.plan.boomerang ? 1 : 0, +job.plan.seconds.toFixed(4)],
    out: [job.aspect, job.maxDim, job.pad, job.quality, job.transparent, job.watermark, job.optimise.id, job.optimise.targetBytes || 0],
    img: [S.w, S.h, S.full ? S.full.w + 'x' + S.full.h : '-', sourceSample()],
    masks: S.eng.masks.map(m => m.length + ':' + maskSample(m)),
    pmasks: S.eng.pmasks.map(m => m.length + ':' + maskSample(m)),
    settings: S.settings,
  });
}

function exportIsStale() {
  return !!(S.lastExport && S.lastExport.sig && S.lastExport.sig !== exportSignature());
}

async function runExport() {
  if (!S.w || !S.full) { toast('Load an image first.'); return; }
  if (S.busy) return;
  const fmt = FORMATS.find(f => f.id === el.fmtSelect.value) || FORMATS[0];
  const { filename, job } = currentJob(null);
  const name = `liquidizer-${S.settings.mode}-${job.plan.frames}f.${fmt.ext}`;

  S.busy = true;
  S.cancelExport = false;
  resetExportModal();
  el.exportModal.hidden = false;
  el.exportTitle.textContent = 'Rendering ' + fmt.label + (job.optimise && job.optimise.id !== 'off' ? ` · ${job.optimise.label}` : '');
  el.progressBar.style.width = '0%';
  el.exportSub.textContent = 'preparing…';
  setStatus(el.exportStatusEl, '');
  const started = performance.now();

  const onProgress = (p, label) => {
    el.progressBar.style.width = Math.round(clamp01(p) * 100) + '%';
    el.exportSub.textContent = `${Math.round(p * 100)}% — ${label}`;
  };

  let blob = null;
  let showed = false;
  const passLog = [];
  const notePass = info => { passLog.push(info); };
  try {
    let usedWorker = true;
    try {
      blob = await runInWorker(job, filename || name, onProgress, notePass);
    } catch (err) {
      dropWorker();
      if (S.cancelExport) { blob = null; usedWorker = true; }
      else if (err && err.noFallback) throw err;
      else {
        usedWorker = false;
        console.warn('worker export failed, falling back to the main thread:', err);
        blob = await runOnMainThread(job, onProgress, notePass);
      }
    }
    if (!blob) {
      setStatus(el.exportStatusEl, 'Export cancelled.', 'warn');
      return;
    }
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    download(blob, name);
    S.lastExport = {
      blob, name, seconds: job.plan.seconds, format: fmt.id, size: blob.size,
      sig: exportSignature(),
    };
            const target = job.optimise && job.optimise.targetBytes;
    const hit = !target ? '' : blob.size <= target
      ? ` of the ${fmtBytes(target)} target` : ` — over the ${fmtBytes(target)} target`;
    const trace = passLog.length > 1
      ? ` · ${passLog.map(p => fmtBytes(p.bytes) + (p.dim ? ' @' + p.dim + 'px' : '')).join(' → ')}` : '';
    setStatus(el.exportStatusEl, `Done — ${fmtBytes(blob.size)}${hit} in ${secs}s${trace}${usedWorker ? '' : ' (main thread)'}`, 'good');
    el.uploadExportBtn.disabled = false;
    setStatus(el.uploadExportStatusEl, 'Upload it to Perchance if you want a link to share.', '');
    showed = true;
    showExportResult(blob, name, job.plan, fmt, secs, usedWorker);
  } catch (err) {
    setStatus(el.exportStatusEl, 'Export failed: ' + String((err && err.message) || err), 'bad');
  } finally {
    S.busy = false;
    if (!showed) { resetExportModal(); el.exportModal.hidden = true; }
  }
}

async function runInWorker(job, filename, onProgress, onPass) {
  const worker = await getWorker();
  return await new Promise((resolve, reject) => {
    const id = ++exportClientId;
    const onMessage = ev => {
      const msg = ev.data || {};
      if (msg.type === 'progress') { onProgress(msg.p, msg.label); return; }
      if (msg.type === 'pass') { if (onPass) onPass(msg.info); return; }
      cleanup();
      if (msg.type === 'done') resolve(msg.blob);
      else if (msg.type === 'cancelled') resolve(null);
      else {
        const err = new Error(msg.message || 'the export worker failed');
        if (String(msg.message || '').indexOf(EXPORT_STALL_TEXT) === 0) err.noFallback = true;
        reject(err);
      }
    };
    const onError = ev => { cleanup(); reject(new Error(ev.message || 'worker error')); };
    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ type: 'run', sid: id, job: Object.assign({}, job, { filename }) });
  });
}

async function runOnMainThread(job, onProgress, onPass) {
  const canvas = document.createElement('canvas');
  return await encodeFrames(Object.assign({}, job, {
    canvas,
    onProgress,
    onPass,
    isCancelled: () => !!S.cancelExport,
    allowRecorder: true,
  }));
}

function workPixels() {
  if (!S.source) return null;
  const ctx = S.source.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, S.w, S.h);
    return { data: img.data, w: img.width, h: img.height };
}

let modelWorkerPromise = null;

async function makeModelWorker() {
  const [modelsSrc, workerSrc] = await Promise.all([
    moduleText('./models.js'), moduleText('./model-worker.js'),
  ]);
  const dropImports = src => src.replace(/^[ \t]*import[\s\S]*?from[ \t]*['"][^'"]+['"];?[ \t]*$/gm, '');
  const bundle = dropImports(modelsSrc) + '\n' + dropImports(workerSrc);
  const url = URL.createObjectURL(new Blob([bundle], { type: 'text/javascript' }));
  const worker = new Worker(url, { type: 'module' });
  worker._bundleUrl = url;
  return worker;
}

function getModelWorker() {
  if (!modelWorkerPromise) {
    modelWorkerPromise = makeModelWorker().catch(err => { modelWorkerPromise = null; throw err; });
  }
  return modelWorkerPromise;
}

function runDepthInWorker(pixels, onProgress) {
  return getModelWorker().then(worker => new Promise((resolve, reject) => {
    const onMessage = ev => {
      const msg = ev.data || {};
      if (msg.type === 'progress') { onProgress(msg.p, msg.label); return; }
      cleanup();
      if (msg.type === 'done') resolve(msg);
      else if (msg.type === 'cancelled') resolve(null);
      else reject(new Error(msg.message || 'the depth model failed'));
    };
    const onError = ev => { cleanup(); reject(new Error(ev.message || 'the depth worker failed')); };
    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ type: 'depth', pixels: { data: pixels.data, w: pixels.w, h: pixels.h } });
  }));
}

let depthThumbKey = null;
function depthThumbField() {
  const eng = S.eng;
  if (!eng || !eng.depth || !S.w || !S.h) return null;
  if (eng.depth.length !== S.w * S.h) return null;
  return eng.depth;
}

function refreshDepthThumb() {
  const cv = el.depthThumb;
  if (!cv) return;
  const field = depthThumbField();
  if (!field) { cv.hidden = true; depthThumbKey = null; return; }
  cv.hidden = false;
  const key = S.w + 'x' + S.h + '#' + (S.eng.depthVersion || 0);
  if (key === depthThumbKey) return;
  depthThumbKey = key;
  const max = 170;
  const scale = Math.min(1, max / Math.max(S.w, S.h));
  const tw = Math.max(2, Math.round(S.w * scale)), th = Math.max(2, Math.round(S.h * scale));
  if (cv.width !== tw || cv.height !== th) { cv.width = tw; cv.height = th; }
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(tw, th);
  let mn = 1, mx = 0;
  for (let y = 0; y < th; y++) {
    const sy = Math.min(S.h - 1, Math.round(y / scale)) * S.w;
    for (let x = 0; x < tw; x++) {
      const f = clamp01(field[sy + Math.min(S.w - 1, Math.round(x / scale))] || 0);
      if (f < mn) mn = f;
      if (f > mx) mx = f;
      const v = Math.round(255 * f);
      const o = (y * tw + x) * 4;
      img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
    }
  }
  if (!mx) { cv.hidden = true; depthThumbKey = null; return; }
  ctx.putImageData(img, 0, 0);
  cv.dataset.range = Math.round(mn * 100) + '–' + Math.round(mx * 100);
}

function clearDepthField() {
  S.depth = null;
  S.settings.depthSource = 'auto';
  depthThumbKey = null;
  refreshDepthThumb();
}

function installDepthField(field, w, h, meta) {
  if (!field || field.length !== S.w * S.h) return false;
  S.eng.setDepthModel(field);
  S.eng.analyze(S.settings.autoSens);
  S.depth = { data: field, w: S.w, h: S.h, meta: meta || {} };
  S.settings.depthSource = 'model';
  const li = S.settings.activeLayer;
  const layer = S.settings.layers[li];
  if (layer && layer.maskSource === 'auto') S.eng.buildAutoMask(S.settings.autoSens, S.settings, li);
  refreshDepthThumb();
  syncDepthUI();
  syncAll();
  S.maskDirty = true;
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  updateMaskStatus();
  return true;
}

function syncDepthUI() {
  if (!el.depthSrcSel) return;
  const has = S.eng.hasDepthModel();
  el.depthSrcSel.value = S.settings.depthSource === 'model' ? 'model' : 'auto';
  el.depthComputeBtn.hidden = !!S.depthBusy;
  el.depthCancelBtn.hidden = !S.depthBusy;
  el.depthComputeBtn.innerHTML = icon('ic-brain') + (has ? 'Recompute AI depth' : 'Compute AI depth');
  el.depthBandsBtn.disabled = !S.w;
  refreshDepthThumb();
  if (S.depthBusy) return;
  if (has && S.depth) {
    const m = S.depth.meta || {};
    const how = m.from === 'project' ? 'restored from the project' : (m.ms ? 'computed in ' + (m.ms / 1000).toFixed(1) + 's' : 'ready');
    setStatus(el.depthStatusEl, 'AI depth map ' + how + ' — real per-pixel parallax.', 'good');
  } else if (S.settings.depthSource === 'model') {
    setStatus(el.depthStatusEl, 'No AI depth map yet — using the built-in estimate.', 'warn');
  } else {
    setStatus(el.depthStatusEl, 'Built-in estimate — instant, no download.');
  }
}

async function computeDepthNow() {
  if (!S.w) { toast('Load an image first.'); return; }
  if (S.depthBusy) return;
  if (!S.libs.models) {
    toast('The AI depth model is switched off — turn it on in “Libraries & downloads”.');
    openInfo();
    return;
  }
  const pixels = workPixels();
  if (!pixels) { toast('Load an image first.'); return; }
  const forImage = { w: S.w, h: S.h };

  S.depthBusy = true;
  S.depthCancel = false;
      const wasPlaying = S.playing;
  if (S.playing) { S.playing = false; syncPlayButtons(); }
  syncDepthUI();
  const onProgress = (p, label) => {
    if (S.depthBusy) busyStatus(el.depthStatusEl, Math.round(clamp01(p) * 100) + '% — ' + label);
  };
  busyStatus(el.depthStatusEl, 'starting the model…');

  let res = null;
  let errMsg = '';
  try {
    try {
      res = await runDepthInWorker(pixels, onProgress);
    } catch (err) {
      console.warn('depth worker failed, running the model on the main thread:', err);
      res = await models.computeDepth(pixels, onProgress, () => S.depthCancel);
    }
  } catch (err) { errMsg = String((err && err.message) || err); }

      S.depthBusy = false;
  if (wasPlaying) { S.playing = true; syncPlayButtons(); }
  syncDepthUI();
  if (errMsg) { setStatus(el.depthStatusEl, 'Depth failed: ' + errMsg, 'bad'); return; }
  if (S.depthCancel) { setStatus(el.depthStatusEl, 'Cancelled.', 'warn'); return; }
  if (!res) { setStatus(el.depthStatusEl, 'The model returned nothing.', 'bad'); return; }
  if (forImage.w !== S.w || forImage.h !== S.h) {
    setStatus(el.depthStatusEl, 'The image changed while the model was running — compute it again.', 'warn');
    return;
  }
  installDepthField(res.data, res.w, res.h, { ms: res.ms, stats: res.stats, from: 'model' });
  const st = res.stats || {};
  toast('AI depth ready — ' + Math.round((st.mean || 0) * 100) + '% average nearness across the frame.');
}

async function splitDepthLayers() {
  if (!S.w) { toast('Load an image first.'); return; }
  const field = S.eng.hasDepthModel() ? S.eng.depthModel : S.eng.depth;
  if (!field || !field.length) { toast('Analyse an image first.'); return; }
  const n = Math.max(2, Math.min(MAX_LAYERS, parseInt(el.depthBands.value, 10) || 3));
  if (!(await window.uiConfirm('Replace the layer stack with ' + n + ' depth slices?', { okText: 'Replace', danger: true }))) return;
  const names = n === 2 ? ['Background', 'Foreground']
    : n === 3 ? ['Background', 'Middle', 'Foreground']
      : ['Distant', 'Mid-far', 'Mid-near', 'Near'];
    const scales = n === 2 ? [0.55, 1] : n === 3 ? [0.45, 0.72, 1] : [0.4, 0.6, 0.8, 1];
  const base = S.settings.ampFrac;
  const layers = [];
  for (let k = 0; k < n; k++) {
    const l = makeLayer(names[k], 'depth', { ampFrac: base * scales[k] });
    l.maskSource = 'manual';
    layers.push(l);
  }
  S.settings.layers = layers;
  S.settings.activeLayer = n - 1;
  installLayerView(S.settings);
  syncLayerMasks();
  for (let k = 0; k < n; k++) S.eng.setMask(S.eng.buildDepthBandMask(k, n), k);
  S.eng.selectMask(S.settings.activeLayer);
  S.eng.analyze(S.settings.autoSens);
  refreshDepthThumb();
  resetHistory();
  S.maskDirty = true;
  syncAll();
  updateMaskStatus();
  // Show the slices on the photo: the point of the split is seeing which part of the picture went to which
  // layer, and with the overlay off the new stack looks like nothing happened.
  if (!el.showMaskChk.checked) { el.showMaskChk.checked = true; el.maskCanvas.hidden = false; }
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  toast(n + ' depth slices — each one is a layer you can paint.');
}

const PROJECTS_FOLDER = 'liquidizerProjects';
const PREFS_FOLDER = 'liquidizerPrefs';
const LEGACY_PROJECTS_FOLDER = 'motionProjects';
const LEGACY_PREFS_FOLDER = 'motionPrefs';
const BRAND_MIGRATION_KEY = 'brandMigration';

function projectsStore() { try { return root.kv[PROJECTS_FOLDER]; } catch (_) { return null; } }

function prefStore() { try { return root.kv[PREFS_FOLDER]; } catch (_) { return null; } }

async function deleteProjectEverywhere(name) {
  for (const folder of [PROJECTS_FOLDER, LEGACY_PROJECTS_FOLDER]) {
    try { await root.kv[folder].delete(name); } catch (err) {   }
  }
}

async function copyFolder(fromName, toName, keys) {
  const from = root.kv[fromName];
  const to = root.kv[toName];
  const wanted = keys || await from.keys();
  if (!wanted.length) return 0;
  const have = new Set(await to.keys());
  let copied = 0;
  for (const k of wanted) {
    if (have.has(k)) continue;
    const v = await from.get(k);
    if (v == null) continue;
    await to.set(k, v);
    copied++;
  }
  return copied;
}

async function retireLegacyKeys(fromName, toName) {
  const from = root.kv[fromName];
  const to = root.kv[toName];
  const keys = await from.keys();
  if (!keys.length) return 0;
  const have = new Set(await to.keys());
  let gone = 0;
  for (const k of keys) {
    if (!have.has(k)) continue;
    if (await to.get(k) == null) continue;
    await from.delete(k);
    gone++;
  }
  return gone;
}

async function migrateBrandStorage() {
  const prefs = prefStore();
  try {
                if (prefs && await prefs.get(BRAND_MIGRATION_KEY)) return;
  } catch (err) {
      }
  try {
    const projects = await copyFolder(LEGACY_PROJECTS_FOLDER, PROJECTS_FOLDER);
    const prefCount = await copyFolder(LEGACY_PREFS_FOLDER, PREFS_FOLDER);
    const retired = await retireLegacyKeys(LEGACY_PROJECTS_FOLDER, PROJECTS_FOLDER);
    const retiredPrefs = await retireLegacyKeys(LEGACY_PREFS_FOLDER, PREFS_FOLDER);
    if (projects || prefCount || retired || retiredPrefs) {
      console.info(`Liquidizer: brand-storage migration — carried ${projects} saved project(s) and ${prefCount} pref record(s) over from the old storage names and retired ${retired} duplicate project(s) and ${retiredPrefs} duplicate pref record(s) from them.`);
    }
            if (prefs) await prefs.set(BRAND_MIGRATION_KEY, { at: Date.now(), projects, prefs: prefCount, retired, retiredPrefs });
  } catch (err) {
        console.warn('storage rename migration skipped:', err);
  }
}

function syncLibsUI() {
  if (!el.useModelsChk) return;
  el.useModelsChk.checked = !!S.libs.models;
  el.useVideoLibChk.checked = !!S.libs.videoLib;
  const parts = [
    'AI depth model: ' + (S.libs.models ? 'on' : 'off'),
    'video encoder library: ' + (S.libs.videoLib ? 'on' : 'off'),
  ];
      const tails = [];
  if (S.libs.models) tails.push('depth model: one download, on first use');
  if (S.libs.videoLib) tails.push('encoder library: one download, on first MP4/WebM export');
  setStatus(el.libsStatusEl, parts.join(' · ') + (tails.length
    ? ' — ' + tails.join('; ') + '.'
    : ' — no big downloads (GIF adds 3.8 KB once).'));
  updateExportHint();
  syncDepthUI();
}

async function setLibPref(key, value) {
  S.libs = await models.savePrefs(prefStore(), Object.assign({}, S.libs, { [key]: value }));
  syncLibsUI();
  if (key === 'models' && !value && S.settings.depthSource === 'model' && !S.eng.hasDepthModel()) {
    toast('AI depth is off — the 3D mode uses the built-in estimate.');
  }
  if (key === 'videoLib' && !value) toast('MP4 / WebM will use the browser recorder instead.');
}

function fmtBytes(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024) return Math.round(n) + ' B';
  if (n < 1048576) return (n / 1024).toFixed(n < 102400 ? 1 : 0) + ' KB';
  return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
}

const ownSizes = { list: null, total: 0 };

async function measureOwnCode() {
  const list = [];
  for (const name of models.OWN_FILES) {
    try {
      const res = await fetch(new URL('./' + name, import.meta.url));
      if (res.ok) list.push({ label: name, bytes: (await res.arrayBuffer()).byteLength });
    } catch (_) {   }
  }
          try {
    const html = document.documentElement.outerHTML;
    list.push({ short: 'the page as rendered', label: 'the page as rendered — index.html + main.pjs + everything the engine built (approx.)', bytes: new Blob([html]).size, approx: true });
  } catch (_) {   }
  ownSizes.list = list;
  ownSizes.total = list.filter(f => !f.approx).reduce((a, f) => a + f.bytes, 0);
  return list;
}

function cachedFor(report, lib) {
  if (!report || !report.cacheFiles) return null;
  const hit = report.cacheFiles.filter(f => f.bytes > 0 && (f.url.indexOf(lib.pkg) !== -1 ||
    (lib.id === 'depthModel' && (f.url.indexOf('huggingface') !== -1 || f.url.indexOf('hf.co') !== -1))));
  if (!hit.length) return null;
  return hit.reduce((a, f) => a + f.bytes, 0);
}

function updateFor(report, lib) {
  if (!report) return null;
  if (lib.id === 'depthModel') return report.model || null;
  if (!report.libs) return null;
  return report.libs.find(l => l.id === lib.id) || null;
}

function renderLibsInfo() {
  if (!el.libsTableCtn) return;
  const report = S.libsReport;
  const on = lib => !lib.pref || !!S.libs[lib.pref];
  const usable = models.LIBS.filter(l => on(l));
  const optional = usable.reduce((a, l) => a + l.dl, 0);
  el.libsSummaryEl.textContent = 'Liquidizer’s own code is ' + fmtBytes(ownSizes.total) +
    '. With the AI depth model switched on, the first computation adds about ' +
    fmtBytes(models.DEPTH_MODEL.dl + models.TRANSFORMERS_DL + models.ORT_DL) +
    ' over the wire, and then it is cached and reused. Switched off, those bytes are never requested — ' +
    'the 3D mode falls back to its own estimate. Every file is downloaded once: after the first visit ' +
    'a page start or refresh asks the network for nothing — the sample photo and the font stylesheet ' +
    'come from this app’s own cache, and the libraries and models from theirs.';

  const rows = [];
  for (const lib of models.LIBS) {
    const enabled = on(lib);
    const cached = cachedFor(report, lib);
    const upd = updateFor(report, lib);
    rows.push({ lib, enabled, cached, upd });
  }

  const t = document.createElement('table');
  t.className = 'libTable';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Library</th><th>Version</th><th class="num">Download</th><th>Status</th></tr>';
  t.appendChild(thead);
  const tb = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (!r.enabled) tr.className = 'off';
    const nameTd = document.createElement('td');
    nameTd.innerHTML = '<span class="libName"></span><span class="libMeta"></span>';
    nameTd.querySelector('.libName').textContent = r.lib.label;
    nameTd.querySelector('.libMeta').textContent = r.lib.purpose + ' · ' + r.lib.when +
      (r.lib.fallback ? ' · fallback: ' + r.lib.fallback : '');
    const verTd = document.createElement('td');
    verTd.className = 'num';
            verTd.textContent = r.lib.id === 'depthModel' ? 'rev ' + String(r.lib.version).slice(0, 7) : r.lib.version;
    const sizeTd = document.createElement('td');
    sizeTd.className = 'num';
    sizeTd.textContent = fmtBytes(r.lib.dl);
    const statusTd = document.createElement('td');
    const tags = [];
    if (!r.enabled) tags.push(['', 'switched off']);
    if (r.cached) tags.push(['on', 'cached ' + fmtBytes(r.cached)]);
    if (!r.cached && r.enabled && r.lib.cached) tags.push(['', 'not downloaded yet']);
    if (r.upd && r.upd.error) tags.push(['bad', 'check failed']);
    if (r.upd && r.upd.changed) {
      const latest = r.upd.latest || (r.upd.latestRevision || '').slice(0, 10);
      tags.push(['warn', 'newer: ' + latest + (r.upd.latestBytes ? ' (' + fmtBytes(r.upd.latestBytes) + ')' : '')]);
    }
    for (const [cls, text] of tags) {
      const s = document.createElement('span');
      s.className = 'tag' + (cls ? ' ' + cls : '');
      s.textContent = text;
      statusTd.appendChild(s);
      statusTd.appendChild(document.createTextNode(' '));
    }
    if (!tags.length) statusTd.innerHTML = '<span class="tag on">up to date</span>';
    tr.append(nameTd, verTd, sizeTd, statusTd);
    tb.appendChild(tr);
  }
  const ownTr = document.createElement('tr');
  ownTr.className = 'own';
  const a = document.createElement('td');
  a.innerHTML = '<span class="libName">Liquidizer (this page)</span><span class="libMeta"></span>';
  a.querySelector('.libMeta').textContent = 'the app code, always loaded' + (ownSizes.list && ownSizes.list.length
    ? ' · ' + ownSizes.list.map(f => (f.short || f.label.split(' ')[0]) + ' ' + fmtBytes(f.bytes)).join(', ')
    : '');
  const b = document.createElement('td'); b.className = 'num'; b.textContent = '—';
  const c = document.createElement('td'); c.className = 'num'; c.textContent = fmtBytes(ownSizes.total);
  const d = document.createElement('td'); d.innerHTML = '<span class="tag on">always loaded</span>';
  ownTr.append(a, b, c, d);
  tb.appendChild(ownTr);

        const own = report && report.assets;
  const cacheTr = document.createElement('tr');
  const ca = document.createElement('td');
  ca.innerHTML = '<span class="libName">Cached for you</span><span class="libMeta"></span>';
      const assetLabel = url => url.indexOf('fonts.googleapis') >= 0 ? 'the font stylesheet'
    : url.indexOf('uploads.dev') >= 0 ? 'the sample photo'
    : url.replace(/^https?:\/\//, '').split('/')[0];
  ca.querySelector('.libMeta').textContent = 'what a page start needs from outside the app, kept in the app’s own cache — ' +
    'downloaded once, then never again' + (own && own.files.length
      ? ' · ' + own.files.map(f => assetLabel(f.url) + ' ' + fmtBytes(f.bytes)).join(', ') : '');
  const cb = document.createElement('td'); cb.className = 'num'; cb.textContent = '—';
  const cc = document.createElement('td'); cc.className = 'num'; cc.textContent = own ? fmtBytes(own.bytes) : '—';
  const cd = document.createElement('td');
  cd.innerHTML = own && own.bytes
    ? '<span class="tag on">cached ' + fmtBytes(own.bytes) + '</span>'
    : '<span class="tag">nothing yet</span>';
  cacheTr.append(ca, cb, cc, cd);
  tb.appendChild(cacheTr);
  t.appendChild(tb);
  el.libsTableCtn.innerHTML = '';
  el.libsTableCtn.appendChild(t);

  const total = document.createElement('div');
  total.className = 'kvRow';
  total.innerHTML = '<span>Optional libraries switched on, over the wire</span><b>' + fmtBytes(optional) + '</b>';
  el.libsTableCtn.appendChild(total);

  el.libsNote.textContent = report && report.checkedAt
    ? 'Last update check: ' + new Date(report.checkedAt).toLocaleString() +
      (report.errors && report.errors.length ? ' · could not check: ' + report.errors.join(', ') : '')
    : '“Check for updates” asks npm and Hugging Face for the latest versions, then measures the size of the file that version would actually download.';
}

async function gatherAssetCache() {
  try {
    const files = await assets.entries();
    return { files, bytes: files.reduce((a, f) => a + f.bytes, 0) };
  } catch (_) { return { files: [], bytes: 0 }; }
}

async function openInfo() {
  el.libsModal.hidden = false;
  if (!ownSizes.list) {
            setStatus(el.libsNote, 'Measuring the app’s own files…');
    await measureOwnCode();
  }
  renderLibsInfo();
  if (!S.libsReport) {
    const cache = await models.cachedBytes(models.DEPTH_MODEL.repo);
    const own = await gatherAssetCache();
    S.libsReport = Object.assign({}, S.libsReport, {
      cacheFiles: cache.files, cacheBytes: cache.bytes, cacheAvailable: cache.available, assets: own,
    });
    renderLibsInfo();
  }
}

async function checkLibsUpdates() {
  el.libsCheckBtn.disabled = true;
  try {
    const report = await models.checkUpdates(s => {
      el.libsCheckBtn.innerHTML = icon('ic-loader', 'ic-spin') + s;
      setStatus(el.libsNote, s + '…');
    });
    const cache = await models.cachedBytes(models.DEPTH_MODEL.repo);
    const own = await gatherAssetCache();
    S.libsReport = Object.assign({}, S.libsReport, report, {
      cacheFiles: cache.files, cacheBytes: cache.bytes, cacheAvailable: cache.available, assets: own,
    });
    renderLibsInfo();
    const changed = (report.libs || []).filter(l => l.changed).length + (report.model && report.model.changed ? 1 : 0);
    setStatus(el.libsNote, changed ? changed + ' update' + (changed === 1 ? '' : 's') + ' available.' : 'Everything is up to date.', 'good');
  } catch (err) {
    setStatus(el.libsNote, 'Update check failed: ' + String((err && err.message) || err), 'bad');
  } finally {
    el.libsCheckBtn.disabled = false;
    el.libsCheckBtn.innerHTML = icon('ic-refresh') + 'Check for updates';
  }
}

async function clearModelCache() {
  if (typeof caches === 'undefined') { toast('This browser does not expose the cache API.'); return; }
  if (!(await window.uiConfirm('Delete the downloaded files (the AI model and the cached sample photo / font stylesheet)? ' +
    'They are downloaded again when next needed.', { okText: 'Delete files', danger: true }))) return;
  let bytes = 0, n = 0;
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const url = req.url;
        if (url.indexOf('huggingface') === -1 && url.indexOf('hf.co') === -1 && url.indexOf(models.DEPTH_MODEL.repo) === -1) continue;
        const res = await cache.match(req);
        let size = 0;
        try { if (res) size = (await res.clone().blob()).size; } catch (_) {   }
        if (await cache.delete(req)) { bytes += size; n++; }
      }
    }
  } catch (err) {
    toast('Could not clear the cache: ' + String((err && err.message) || err));
    return;
  }
  let ownBytes = 0, ownN = 0;
  try { ownN = (await assets.entries()).length; ownBytes = await assets.clear(); } catch (_) {   }
  bytes += ownBytes; n += ownN;
  const cache = await models.cachedBytes(models.DEPTH_MODEL.repo);
  const own = await gatherAssetCache();
  S.libsReport = Object.assign({}, S.libsReport, {
    cacheFiles: cache.files, cacheBytes: cache.bytes, cacheAvailable: cache.available, assets: own,
  });
  renderLibsInfo();
  setStatus(el.libsNote, 'Freed ' + fmtBytes(bytes) + ' across ' + n + ' file' + (n === 1 ? '' : 's') + '.', 'good');
}

function libsReportText() {
  const lines = ['Liquidizer — libraries and downloads', ''];
  lines.push('app code: ' + fmtBytes(ownSizes.total) + (ownSizes.list ? ' (' + ownSizes.list.map(f => f.label + ' ' + fmtBytes(f.bytes)).join(', ') + ')' : ''));
  for (const lib of models.LIBS) {
    const on = !lib.pref || !!S.libs[lib.pref];
    const cached = cachedFor(S.libsReport, lib);
    const upd = updateFor(S.libsReport, lib);
    lines.push([
      lib.label, 'v' + lib.version, 'download ' + fmtBytes(lib.dl), on ? 'on' : 'off',
      cached ? 'cached ' + fmtBytes(cached) : 'not cached',
      upd && upd.changed ? 'newer: ' + (upd.latest || upd.latestRevision) : '',
    ].filter(Boolean).join(' | '));
  }
  const own = S.libsReport && S.libsReport.assets;
  lines.push('cached for you: ' + (own && own.files.length
    ? own.files.map(f => f.url + ' ' + fmtBytes(f.bytes)).join(' | ')
    : 'nothing yet'));
  lines.push('', 'user agent: ' + navigator.userAgent);
  return lines.join('\n');
}

async function copyLibsReport() {
  const text = libsReportText();
  try { await navigator.clipboard.writeText(text); toast('Copied the details.'); }
  catch (_) { toast('Clipboard is blocked — the details are in the panel.'); }
}

function bytesToB64url(u8) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  const pad = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function maskToB64(mask) {
  const u8 = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) u8[i] = Math.round(clamp01(mask[i]) * 255);
  return bytesToB64url(u8);
}

function maskFromB64(str, length) {
  try {
    const src = b64urlToBytes(str);
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) out[i] = (src[i] || 0) / 255;
    return out;
  } catch (err) {
    return null;
  }
}

const SHARE_MASK_MAX = 64;
const PROJECT_MASK_MAX = 192;

function maskToShare(mask, w, h, max = SHARE_MASK_MAX) {
  const scale = Math.min(1, max / Math.max(w, h));
  const dw = Math.max(4, Math.round(w * scale));
  const dh = Math.max(4, Math.round(h * scale));
  const u8 = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * h) / dh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * w) / dw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / dw));
      let sum = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        const row = sy * w;
        for (let sx = x0; sx < x1; sx++) { sum += mask[row + sx]; n++; }
      }
      u8[y * dw + x] = Math.round(clamp01(sum / Math.max(1, n)) * 255);
    }
  }
  return { w: dw, h: dh, d: bytesToB64url(u8) };
}

function maskFromShare(obj, outW, outH) {
  if (!obj || typeof obj !== 'object' || !obj.d) return null;
  const sw = obj.w || 0, sh = obj.h || 0;
  if (!sw || !sh) return null;
  let src;
  try { src = b64urlToBytes(obj.d); } catch (err) { return null; }
  if (src.length < sw * sh) return null;
  const out = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const fy = ((y + 0.5) / outH) * sh - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = Math.max(0, Math.min(1, fy - y0));
    for (let x = 0; x < outW; x++) {
      const fx = ((x + 0.5) / outW) * sw - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = Math.max(0, Math.min(1, fx - x0));
      const a = src[y0 * sw + x0] / 255, b = src[y0 * sw + x1] / 255;
      const c = src[y1 * sw + x0] / 255, d = src[y1 * sw + x1] / 255;
      out[y * outW + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

function sourceThumbDataUrl(max = SHARE_IMG_MAX) {
  if (!S.source) return null;
  const { w: iw, h: ih } = sizeOf(S.source);
  const m = Math.min(1, max / Math.max(iw, ih));
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(iw * m));
  c.height = Math.max(8, Math.round(ih * m));
  c.getContext('2d').drawImage(S.source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

function imageHasAlpha(data) {
  for (let i = 3; i < data.length; i += 68) if (data[i] < 250) return true;
  return false;
}

const PROJECT_PNG_MAX = 6 * 1024 * 1024;

function fullImageDataUrl(max = FULL_MAX, quality = 0.92) {
  const src = S.full;
  if (!src || !src.w || !src.h) return sourceThumbDataUrl(Math.min(max, SHARE_IMG_MAX));
  const m = Math.min(1, max / Math.max(src.w, src.h));
  const cw = Math.max(8, Math.round(src.w * m));
  const ch = Math.max(8, Math.round(src.h * m));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  if (cw === src.w && ch === src.h) {
    ctx.putImageData(new ImageData(src.data, src.w, src.h), 0, 0);
  } else {
            const tmp = document.createElement('canvas');
    tmp.width = src.w; tmp.height = src.h;
    tmp.getContext('2d').putImageData(new ImageData(src.data, src.w, src.h), 0, 0);
    ctx.drawImage(tmp, 0, 0, cw, ch);
  }
  if (!imageHasAlpha(src.data)) return c.toDataURL('image/jpeg', quality);
  const png = c.toDataURL('image/png');
  if (png.length > PROJECT_PNG_MAX && max > WORK_MAX) {
    return fullImageDataUrl(Math.max(WORK_MAX, Math.round(max * 0.6)), quality);
  }
  return png;
}

function imageSizeLabel(snap) {
  const w = (snap && snap.imageW) || (S.full ? S.full.w : 0);
  const h = (snap && snap.imageH) || (S.full ? S.full.h : 0);
  if (!w || !h) return 'no image';
  const rawW = (snap && snap.srcW) || (S.srcSize && S.srcSize.w) || w;
  const rawH = (snap && snap.srcH) || (S.srcSize && S.srcSize.h) || h;
  return w + '\u00d7' + h + (rawW > w || rawH > h ? ' (from ' + rawW + '\u00d7' + rawH + ')' : '');
}

const PROJECT_IMG_QUALITY = 0.92;
const PROJECT_DEPTH_MAX = 192;
const PROJECT_RAW_MAX = 5 * 1024 * 1024;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error || new Error('could not read the image file'));
    fr.readAsDataURL(blob);
  });
}

async function projectImage() {
  if (S.srcBlob && S.srcBlob.size > 0 && S.srcBlob.size <= PROJECT_RAW_MAX) {
    try {
      const url = await blobToDataUrl(S.srcBlob);
      if (url) return url;
    } catch (err) {   }
  }
  return fullImageDataUrl(FULL_MAX, PROJECT_IMG_QUALITY);
}

async function projectSnapshot() {
  const snap = {
            app: 'liquidizer',
    version: 4,
    savedAt: Date.now(),
    image: await projectImage(),
    imageW: S.full ? S.full.w : 0,
    imageH: S.full ? S.full.h : 0,
    srcW: S.srcSize ? S.srcSize.w : 0,
    srcH: S.srcSize ? S.srcSize.h : 0,
    settings: JSON.parse(JSON.stringify(S.settings)),
    masks: S.settings.layers.map((l, i) => (l.maskSource === 'manual' ? maskToShare(S.eng.masks[i], S.w, S.h, PROJECT_MASK_MAX) : null)),
    spawnMasks: fxList().map((e, i) => (hasSpawnArea(i) ? maskToShare(S.eng.pmaskAt(i), S.w, S.h, PROJECT_MASK_MAX) : null)),
    depth: S.depth && S.depth.data && S.settings.depthSource === 'model'
      ? maskToShare(S.depth.data, S.depth.w, S.depth.h, PROJECT_DEPTH_MAX) : null,
    libs: Object.assign({}, S.libs),
  };
      if (!snap.depth) snap.settings.depthSource = 'auto';
  return snap;
}

async function saveProject() {
  if (!S.w) { toast('Nothing to save yet.'); return; }
  const name = (el.saveNameInput.value || '').trim() || ('Project ' + new Date().toLocaleString());
      if (isSampleName(name)) {
    toast('“' + SAMPLE_NAME + '” is the built-in example — save yours under another name.');
    return;
  }
      toast('Saving “' + name + '”…');
  try {
    const snap = await projectSnapshot();
    const kb = Math.round(JSON.stringify(snap).length / 1024);
    await projectsStore().set(name, snap);
    toast('Saved “' + name + '” · ' + kb + ' KB · image ' + imageSizeLabel(snap));
    refreshProjectList();
  } catch (err) {
    toast('Could not save: ' + String((err && err.message) || err));
  }
}

function projectFileStem() {
  const raw = (el.saveNameInput.value || '').trim() || 'liquidizer-' + new Date().toISOString().slice(0, 10);
  return raw.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'liquidizer';
}

async function projectToFile() {
  if (!S.w) { toast('Nothing to save yet.'); return; }
  busyStatus(el.projectFileStatusEl, 'packing the image…');
  try {
    const snap = await projectSnapshot();
    const blob = new Blob([JSON.stringify(snap)], { type: 'application/json' });
    download(blob, projectFileStem() + '.liquidizer.json');
    const depthNote = snap.depth ? ' · depth map included' : '';
    setStatus(el.projectFileStatusEl, 'Saved ' + (blob.size / 1024).toFixed(0) + ' KB · image ' +
      imageSizeLabel(snap) + depthNote + '.', 'good');
  } catch (err) {
    setStatus(el.projectFileStatusEl, 'Could not save: ' + String((err && err.message) || err), 'bad');
  }
}

async function projectFromFile(file) {
  if (!file) return;
  busyStatus(el.projectFileStatusEl, 'opening ' + file.name + '…');
  try {
    let text;
    const zipped = /\.zip$/i.test(file.name) || /zip/.test(file.type || '');
    if (zipped) {
      const entries = await readZip(new Uint8Array(await file.arrayBuffer()),
        n => /\.liquidizer\.json$|\.json$/i.test(n));
      const hit = entries.find(e => /\.liquidizer\.json$/i.test(e.name)) || entries[0];
      if (!hit) throw new Error('that zip has no Liquidizer project inside it');
      text = new TextDecoder().decode(hit.data);
    } else {
      text = await file.text();
    }
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !data.settings) throw new Error('that is not a Liquidizer project file');
    await applySnapshot(data);
    el.saveNameInput.value = String(file.name).replace(/\.zip$|\.liquidizer\.json$|\.mstudio\.json$|\.json$/i, '');
    setStatus(el.projectFileStatusEl, 'Opened ' + file.name + ' (v' + (data.version || 1) + ') · image ' +
      imageSizeLabel() + (data.depth ? ' · with its depth map' : '') + legacyImageNote(data), 'good');
  } catch (err) {
    setStatus(el.projectFileStatusEl, 'Could not open: ' + String((err && err.message) || err), 'bad');
  }
}

async function refreshProjectList() {
          el.projectList.innerHTML = '';
  el.projectList.appendChild(sampleRow());
  let names = [];
  try {
    names = await projectsStore().keys();
  } catch (err) {
    setStatus(el.projectListLabel, 'Saved projects (storage unavailable)', 'warn');
    return;
  }
  names = names.filter(name => !isSampleName(name));
  setStatus(el.projectListLabel, names.length ? 'Saved projects' : 'No saved projects yet — the example above is built in.');
  for (const name of names.slice(0, 40)) {
    const row = document.createElement('div');
    row.className = 'listRow';
    const span = document.createElement('span');
    span.textContent = name;
    const load = document.createElement('button');
    load.className = 'sm';
    load.innerHTML = icon('ic-folder-open') + 'Open';
    load.addEventListener('click', () => openProject(name));
    const del = document.createElement('button');
    del.className = 'sm ghost';
    del.innerHTML = icon('ic-x');
    del.setAttribute('aria-label', 'Delete this saved project');
    del.title = 'Delete this saved project';
    del.addEventListener('click', async () => {
                  if (isSampleName(name)) { toast('The built-in example cannot be deleted.'); return; }
      if (!(await window.uiConfirm('Delete “' + name + '”?', { okText: 'Delete', danger: true }))) return;
            await deleteProjectEverywhere(name);
      refreshProjectList();
    });
    row.append(span, load, del);
    el.projectList.appendChild(row);
  }
}

async function openProject(name) {
      if (isSampleName(name)) { loadSample(); return; }
  toast('Opening “' + name + '”…');
  try {
    const data = await projectsStore().get(name);
    if (!data) { toast('That project is gone.'); return; }
    await applySnapshot(data);
    el.saveNameInput.value = name;
    const missing = data.image ? '' : ' — no image in it, load one to continue';
    toast('Opened “' + name + '” · image ' + imageSizeLabel() + missing + legacyImageNote(data));
  } catch (err) {
    toast('Could not open: ' + String((err && err.message) || err));
  }
}

function legacyImageNote(data) {
  return data && data.version && data.version < 4
    ? ' — saved by an older version, so this is a small copy of the photo: load the photo again and save to keep it at full resolution.'
    : '';
}

async function applySnapshot(data) {
  if (data.image) {
                let src = data.image;
    if (typeof data.image === 'string' && data.image.indexOf('data:') === 0) {
      try { src = await (await fetch(data.image)).blob(); } catch (err) { src = data.image; }
    } else if (typeof data.image === 'string' && /^https?:/i.test(data.image)) {
                        try { src = await assets.fetchBlob(data.image); } catch (err) { src = data.image; }
    }
    await useSource(src, 'Saved image');
                if (data.srcW && data.srcH && (!S.full || (data.srcW >= S.full.w && data.srcH >= S.full.h))) {
      S.srcSize = { w: data.srcW, h: data.srcH };
    }
  } else if (S.w) {
    toast('That project has no image — keeping the one you have.');
  }
  const legacy = !(data.settings && Array.isArray(data.settings.layers));
  if (data.settings) {
    S.settings = installLayerView(Object.assign(defaultSettings(), data.settings));
  }
  syncLayerMasks();
  syncEmitterMasks();
  resetSpawnAreas();
  const list = Array.isArray(data.masks) ? data.masks : (data.mask ? [data.mask] : []);
  applyLoadedMasks(list, legacy);
  applyLoadedSpawnMasks(data.spawnMasks);
  migrateSpawnAreas(Array.isArray(data.spawnMasks));
      if (data.depth && S.w) {
    const field = typeof data.depth === 'string'
      ? maskFromB64(data.depth, S.w * S.h)
      : maskFromShare(data.depth, S.w, S.h);
    if (field) installDepthField(field, S.w, S.h, { from: 'project' });
    else S.depth = null;
  } else {
    S.depth = null;
  }
  rebuildAutoMasks(true);
  S.eng.selectMask(S.settings.activeLayer);
  el.zoomDirSel.value = String(S.settings.zoomDir);
  el.wmChk.checked = false;
  syncAll();
  updateTimelineButtons();
  S.maskDirty = true;
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  updateMaskStatus();
}

let sampleProjectPromise = null;

async function fetchSampleProject() {
  if (!sampleProjectPromise) {
    sampleProjectPromise = (async () => {
      const tried = [];
                  for (const url of [SAMPLE_PROJECT, new URL('./sample.liquidizer.json', import.meta.url).href]) {
        try {
          const res = await assets.fetchCached(url);
          if (!res.ok) { tried.push(url + ' -> ' + res.status); continue; }
          const data = await res.json();
          if (data && data.settings) { cacheSampleProject(data); return data; }
          tried.push(url + ' -> not a project');
        } catch (err) {
          tried.push(url + ' -> ' + String((err && err.message) || err));
        }
      }
      const cached = await readSampleCache();
      if (cached) {
        console.info('Liquidizer: the sample project file was unavailable, using the cached copy (' + tried.join('; ') + ')');
        return cached;
      }
      console.warn('Liquidizer: could not fetch the sample project (' + tried.join('; ') + ')');
      return null;
    })();
  }
  return sampleProjectPromise;
}

async function cacheSampleProject(data) {
  sampleCache = data;
  try {
    const existing = await sampleStore().get(SAMPLE_CACHE_KEY);
            if (existing && existing.image === data.image && existing.version === data.version &&
        JSON.stringify(existing.settings) === JSON.stringify(data.settings)) return;
    await sampleStore().set(SAMPLE_CACHE_KEY, data);
  } catch (_) {}
}

async function readSampleCache() {
  if (sampleCache) return sampleCache;
  try {
    const data = await sampleStore().get(SAMPLE_CACHE_KEY);
    if (data && data.settings) { sampleCache = data; return data; }
  } catch (_) {}
  return null;
}

async function loadSample() {
  setStatus(el.imgStatusEl, 'Loading the sample…');
  let data = null;
  try {
    data = await fetchSampleProject();
    if (data) await applySnapshot(data);
    else await useSource(SAMPLE_URL, 'Sample');
  } catch (err) {
    toast('The sample could not be loaded: ' + String((err && err.message) || err));
    return;
  }
    S.playing = true;
  syncPlayButtons();
  setTransportReady(true);
}

function autoSample() {
  if (SAMPLE_AUTO) loadSample();
}

function sampleRow() {
  const row = document.createElement('div');
  row.className = 'listRow pinned';
  row.title = 'The built-in example always loads with the page and cannot be deleted.';
  const span = document.createElement('span');
  span.textContent = SAMPLE_NAME;
  const tag = document.createElement('span');
  tag.className = 'tag on';
  tag.textContent = 'built in';
  const play = document.createElement('button');
  play.className = 'sm';
  play.innerHTML = icon('ic-play') + 'Play';
  play.title = 'Play the built-in example';
  play.addEventListener('click', () => loadSample());
  row.append(span, tag, play);
  return row;
}

function updateTimelineButtons() {
  for (const b of el.timelineSeg.querySelectorAll('button[data-timeline]')) {
    b.classList.toggle('active', b.dataset.timeline === S.settings.timeline);
  }
  for (const b of el.brushSeg.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.brush === S.settings.brushMode);
  }
}

async function copyShareLink() {
  if (!S.w) { toast('Load an image first.'); return; }
  let img = null;
  if (el.shareImgChk.checked) {
            const dataUrl = fullImageDataUrl(SHARE_IMG_MAX);
    if (!dataUrl) { toast('No image to share.'); return; }
    toast('Uploading the image for the link…');
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const up = await root.uploadPlugin(blob, { expires: Date.now() + 1000 * 60 * 60 * 24 * 365 });
      if (!up || up.error) throw new Error(up && up.error ? up.error : 'upload failed');
      img = up.url;
    } catch (err) {
      toast('Could not upload the image: ' + String((err && err.message) || err));
      return;
    }
  }
  const payload = {
    settings: S.settings,
    masks: el.shareImgChk.checked && S.w
      ? S.settings.layers.map((l, i) => (l.maskSource === 'manual'
        ? maskToShare(S.eng.masks[i], S.w, S.h, S.settings.layers.length > 1 ? 48 : SHARE_MASK_MAX)
        : null))
      : undefined,
    img: img || undefined,
    spawnMasks: el.shareImgChk.checked && S.w
      ? fxList().map((e, i) => (hasSpawnArea(i) ? maskToShare(S.eng.pmaskAt(i), S.w, S.h, 40) : null))
      : undefined,
  };
  const url = shareUrl(payload);
  el.shareOut.hidden = false;
  el.shareOut.value = url;
  el.shareOut.select();
  try {
    await navigator.clipboard.writeText(url);
    toast('Share link copied (' + url.length.toLocaleString() + ' characters)');
  } catch (err) {
    toast('Link is in the box below — copy it manually.');
  }
}

let uploading = false;

const UPLOAD_EXPIRY_MS = 1000 * 60 * 60 * 24 * 365;

function uploaderIsOpen() { return !el.uploaderOverlay.hidden; }

function setUploader(open) {
  if (open && !el.uploaderFrame.getAttribute('src')) {
    el.uploaderFrame.setAttribute('src', 'https://perchance.org/upload');
  }
  el.uploaderOverlay.hidden = !open;
  document.body.style.overflow = open ? 'hidden' : '';
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (err) { return false; }
}

function showUploaded(url, name, size, kind, note) {
  el.uploadedSub.textContent = name + ' · ' + fmtBytes(size) + (kind ? ' · ' + kind : '');
  el.uploadedUrl.value = url;
  el.uploadedNote.textContent = note || 'The link is permanent enough to paste anywhere — it works for anyone, for at least a year.';
  el.uploadedModal.hidden = false;
  el.uploadedUrl.select();
  copyText(url).then(ok => { if (ok) toast('Uploaded — the link is on your clipboard'); });
}

async function uploadBlob(blob, name, statusEl, kind, note) {
  if (uploading) return;
  uploading = true;
  const btnWas = [el.uploadExportBtn.disabled, el.projectUploadBtn.disabled];
  el.uploadExportBtn.disabled = true;
  el.projectUploadBtn.disabled = true;
  busyStatus(statusEl, 'uploading ' + fmtBytes(blob.size) + ' to Perchance…');
  try {
    const res = await root.uploadPlugin(blob, { expires: Date.now() + UPLOAD_EXPIRY_MS });
    if (!res || res.error || !res.url) throw new Error((res && res.error) || 'the upload did not come back with a link');
    setStatus(statusEl, 'Uploaded ' + fmtBytes(res.size || blob.size) + '.', 'good');
    showUploaded(res.url, name, res.size || blob.size, kind, note);
  } catch (err) {
    const msg = String((err && err.message) || err);
    const tooBig = /file_too_big|over_daily_allowance/.test(msg);
    setStatus(statusEl, 'Could not upload: ' + msg + (tooBig ? ' — the Perchance uploader (in the menu) takes big files.' : ''), 'bad');
  } finally {
    uploading = false;
    el.projectUploadBtn.disabled = btnWas[1];
    el.uploadExportBtn.disabled = btnWas[0];
  }
}

async function uploadLastExport() {
  if (!S.lastExport || !S.lastExport.blob) { toast('Export a file first — then upload it.'); return; }
  const fmt = FORMATS.find(f => f.id === S.lastExport.format);
  await uploadBlob(S.lastExport.blob, S.lastExport.name, el.uploadExportStatusEl,
    fmt ? fmt.label : String(S.lastExport.format || '').toUpperCase(),
    'The link plays or downloads the clip straight from Perchance — paste it anywhere, no account needed.');
}

function projectZipReadme(stem, snap) {
  const layers = S.settings.layers.length;
  const name = (window.generatorName || 'liquidizer');
  return [
    'Liquidizer project — ' + stem,
    '',
    'Saved ' + new Date().toLocaleString() + ' from liQuiDiZeR (perchance.org/' + name + ').',
    layers + ' motion layer' + (layers === 1 ? '' : 's') + (snap.depth ? ', the AI depth map' : '') +
      ', the full-resolution image and every mask are inside ' + stem + '.liquidizer.json.',
    '',
    'To open it: liQuiDiZeR → Projects & sharing → "Open a file" — it reads this .zip, or the .liquidizer.json on its own.',
    ''
  ].join('\n');
}

async function uploadProjectZip() {
  if (!S.w) { toast('Nothing to upload yet.'); return; }
  if (uploading) return;
  busyStatus(el.projectFileStatusEl, 'packing the project…');
  try {
    const snap = await projectSnapshot();
    const stem = projectFileStem();
    const json = JSON.stringify(snap);
    const bytes = await writeZip([
      { name: stem + '.liquidizer.json', data: json },
      { name: 'README.txt', data: projectZipReadme(stem, snap) },
    ], { compress: true });
    const saved = json.length - bytes.length;
    const ratio = saved > 0 ? Math.round((saved / json.length) * 100) + '% smaller than the raw project file' : 'packed';
    await uploadBlob(new Blob([bytes], { type: 'application/zip' }), stem + '.zip', el.projectFileStatusEl,
      'zip · ' + ratio, 'Anyone can download the .zip and open it in liQuiDiZeR — it carries the image, the masks and the depth map.');
  } catch (err) {
    setStatus(el.projectFileStatusEl, 'Could not pack the project: ' + String((err && err.message) || err), 'bad');
  }
}

async function loadFromHash() {
  const data = readHashShare();
  if (!data) return false;
    const legacy = !(data.s && Array.isArray(data.s.layers));
  if (data.i) {
    try { await useSource(data.i, 'Shared image'); }
    catch (err) { toast('The shared image could not be loaded.'); }
  }
  if (!S.w) {
    // A picture is optional in a share link (it is a checkbox, and a setup is worth sharing on its own).
    // Without one there is nothing to paint, place or pick — and the link's row taps then go nowhere — so
    // bring in the built-in example's picture and let the shared settings ride on it. `useSource` without
    // `fresh` keeps the settings that are about to be applied, so nothing of the share is lost.
    try { await useSource(SAMPLE_URL, 'Sample'); } catch (_) {}
  }
  if (data.s) {
    S.settings = installLayerView(Object.assign(defaultSettings(), data.s));
  }
  syncLayerMasks();
  syncEmitterMasks();
  // The engine's masks outlive a change of settings, so a load has to blank them: a link that carries no
  // spawn areas (or fewer than the new emitter count) must not inherit the areas of whatever was on
  // screen before. Inheriting them is how a brush ends up over a mask that is already full at every point
  // the user tries — and a stroke there changes nothing, so the brush reads as dead.
  resetSpawnAreas();
  const list = Array.isArray(data.m) ? data.m : (data.m ? [data.m] : []);
  applyLoadedMasks(list, legacy);
  applyLoadedSpawnMasks(data.pm ? (Array.isArray(data.pm) ? data.pm : [data.pm]) : []);
  // No invented areas for a shared setup: the sharer's areas are in `pm` if they had any, and seeding a
  // default bottom band for the ones they left unpainted puts a full-strength mask exactly where a hand
  // brushes first (embers rise from the bottom), so the brush appears to do nothing. Left empty, the
  // emitter says "nothing shows until you paint" and the first stroke lands.
  rebuildAutoMasks(true);
  S.eng.selectMask(S.settings.activeLayer);
  el.zoomDirSel.value = String(S.settings.zoomDir);
  syncAll();
  updateTimelineButtons();
  S.maskDirty = true;
  updateMaskStatus();
  if (!el.maskCanvas.hidden) paintMaskOverlay();
  if (!S.w) return false;
  toast(!data.i
    ? 'Loaded a shared setup — the link carried no photo, so this is the example’s picture.'
    : 'Loaded a shared setup');
  return true;
}

function boot() {
  window.__liquidizerBooted = true;
  collect();
  initControls();
  bindCanvas();
  syncPlayButtons();
  initAdvanced();
  updateModeVisibility();
  syncLayerUI();
  el.modeHintEl.textContent = (MODES.find(m => m.id === S.settings.mode) || {}).hint || '';
  updateExportHint();
  updateInfo();
      applyTheme(S.libs.theme);
  syncLibsUI();
  syncDepthUI();
          migrateBrandStorage()
    .then(() => {
      refreshProjectList();
      return models.loadPrefs(prefStore());
    })
    .then(p => { S.libs = p; syncLibsUI(); applyTheme(S.libs.theme); })
    .catch(() => {});
  setStatus(el.maskStatusEl, '');
  setTransportReady(false);
  requestAnimationFrame(loop);

            loadFromHash()
    .then(fromHash => { if (!fromHash) autoSample(); })
    .catch(err => { console.warn(err); autoSample(); });
}

function setTransportReady(ready) {
  liqRootEl().classList.toggle('no-image', !ready);
  fitStage();
}

function whenDomReady(fn) {
  const ready = () => IDS.every(id => $(id));
  if (ready()) { fn(); return; }
  // The gate is exact, so a page whose HTML is older than this script never opens it — and the app
  // used to just sit there looking broken. After a few seconds of waiting, say what is missing.
  const t0 = performance.now();
  let warned = false;
  const wait = () => {
    if (ready()) { fn(); return; }
    if (!warned && performance.now() - t0 > 4000) {
      warned = true;
      const missing = IDS.filter(id => !$(id));
      console.error('[liquidizer] this page cannot start: index.html is an older version than ' +
        'src/app.js, and ' + missing.length + ' of the ' + IDS.length + ' elements the app needs are ' +
        'missing: ' + missing.join(', ') + '. The HTML must match the app code.');
      const bar = document.createElement('div');
      bar.setAttribute('data-skew-notice', '');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;padding:10px 14px;' +
        'background:#7f1d1d;color:#fff;font:600 13px/1.45 system-ui,sans-serif;text-align:left;' +
        'pointer-events:none;';
      bar.textContent = 'This page can\u2019t start: its HTML is an older version than the app code (' +
        missing.length + ' element' + (missing.length === 1 ? '' : 's') + ' missing \u2014 ' +
        missing.slice(0, 4).join(', ') + (missing.length > 4 ? ', \u2026' : '') + '). See the console.';
      document.body.appendChild(bar);
    }
    requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
}

whenDomReady(boot);
window.__liqCancelLoop = function () { try { if (S.rafId) cancelAnimationFrame(S.rafId); } catch (_) {} S.rafId = 0; };

window.__liquidizerDebug = {
  S,
  get settings() { return S.settings; },
  engine: () => S.eng,
  useSource,
  runExport,
  currentJob,
    OPTIMISERS,
  optimiseJob,
  exportMaxDim,
  fmtBytes,
  loadUrl,
  autoMask,
  applySnapshot,
  layers: () => S.settings.layers,
  masks: () => S.eng.masks,
  pmasks: () => S.eng.pmasks,
  maskTarget,
  selectEmitterSpawn,
  armEmitterSpawn,
  engTargetParticle,
  clearPick,
  syncFxAreaBtn,
  syncPickMarks,
  safeStroke,
  trace: () => TRACE.slice(),
  traceClear: () => { TRACE.length = 0; },
  hasSpawnArea,
  seedEmitterArea,
  kindArea,
  migrateSpawnAreas,
  targetName,
  currentLayer,
  selectLayer,
  addLayer,
  removeLayer,
  moveLayer,
  toggleLayer,
  renameLayer,
  clearLayerMask,
  rebuildAutoMasks,
  syncLayerUI,
  glowTargetLayer,
  paintGlowTarget,
  syncGlowStatus,
  paintMaskOverlay,
  compositeOverlay,
  applyPresetStack,
  initAdvanced,
  syncAdvToggles,
  ADVANCED_GROUPS,
    particles: () => S.settings.particles,
  PARTICLE_KINDS,
      FLASH_DEFAULTS,
  MAKE_EMITTER: makeEmitter,
  particleCount,
  fxSelected,
  fxSelect,
  addEmitter,
  removeEmitter,
  duplicateEmitter,
  moveEmitter,
  toggleEmitter,
  setEmitterKind,
  syncFxUI,
  saveProject,
  openProject,
  loadFromHash,
  copyShareLink,
  readHashShare,
  maskToB64,
  maskFromB64,
  maskToShare,
  maskFromShare,
  SAMPLE_URL,
  SAMPLE_PROJECT,
  SAMPLE_AUTO,
        SAMPLE_NAME,
  isSampleName,
  loadSample,
  autoSample,
  sampleRow,
  fetchSampleProject,
    computeDepth: computeDepthNow,
  installDepthField,
  splitDepthLayers,
  syncDepthUI,
  refreshDepthThumb,
  depthThumbField,
  syncPlaceBar,
  revealStage,
  finishPlacing,
      assets,
  gatherAssetCache,
  libs: () => S.libs,
  setLibPref,
    get theme() { return themeIsLight() ? 'light' : 'dark'; },
  setTheme,
  toggleTheme,
  depth: () => S.depth,
  openInfo,
  checkLibsUpdates,
  clearModelCache,
  models,
  projectSnapshot,
  projectToFile,
  projectFromFile,
  uploadLastExport,
  uploadProjectZip,
  setUploader,
  writeZip,
  readZip,
  workPixels,
};

window.__msDebug = window.__liquidizerDebug;
