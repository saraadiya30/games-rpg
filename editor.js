
(function () {
  let booted = false;
  function editorBoot() {
    if (booted) return;
    booted = true;
    // ── DOM refs ──────────────────────────────────────────
  const fileInput       = document.getElementById('fileInput');
  const uploadBtn       = document.getElementById('uploadBtn');
  const zoomSelect      = document.getElementById('zoomSelect');
  const leftCol         = document.getElementById('leftColumn');
  const previewCanvas   = document.getElementById('previewCanvas');
  const previewCtx      = previewCanvas.getContext('2d');
  function thVar(name, fb){ try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; } catch (e) { return fb; } }
  function thAccent(){ return thVar('--th-accent', '#4CAF50'); }
  function thField(){ return thVar('--th-field', '#1e1f22'); }
  function thBorder(){ return thVar('--th-border', '#4a4a4a'); }
  function thText(){ return thVar('--th-text', '#d8d4cf'); }
  function thDim(){ return thVar('--th-text-dim', 'rgba(216,212,207,0.62)'); }
  const canvasContainer = document.getElementById('canvasContainer');
  const canvasWrapper   = document.getElementById('canvasWrapper');
  const cropOverlay     = document.getElementById('cropOverlay');
  const cropBox         = document.getElementById('cropBox');
  const loadingOverlay  = document.getElementById('loadingOverlay');
  const imgInfo         = document.getElementById('imgInfo');
  const historyInfo     = document.getElementById('historyInfo');
  const exportFormat    = document.getElementById('exportFormat');
  const exportQuality   = document.getElementById('exportQuality');
  const qualityDisplay  = document.getElementById('qualityDisplay');
  const qualityGroup    = document.getElementById('qualityGroup');
  const viewModeSelect  = document.getElementById('viewModeSelect');
  const sliderView      = document.getElementById('sliderView');
  const knobView        = document.getElementById('knobView');
  const plusminusView   = document.getElementById('plusminusView');
  const jogwheelView    = document.getElementById('jogwheelView');

  // ── Slider definitions ────────────────────────────────
  const sliderDefs = {
    br:         { id:'e_br',         def:100, unit:'%',  label:'Brightness',  step:1   },
    co:         { id:'e_co',         def:100, unit:'%',  label:'Contrast',    step:1   },
    sa:         { id:'e_sa',         def:100, unit:'%',  label:'Saturate',    step:1   },
    hr:         { id:'e_hr',         def:0,   unit:'°',  label:'Hue',         step:1   },
    bl:         { id:'e_bl',         def:0,   unit:'px', label:'Blur',        step:0.5 },
    op:         { id:'e_op',         def:100, unit:'%',  label:'Opacity',     step:1   },
    sepia:      { id:'e_sepia',      def:0,   unit:'%',  label:'Sepia',       step:1   },
    vibrance:   { id:'e_vibrance',   def:0,   unit:'%',  label:'Vibrance',    step:1   },
    pixel:      { id:'e_pixelate',   def:0,   unit:'',   label:'Pixelate',    step:1   },
    vig:        { id:'e_vignette',   def:0,   unit:'%',  label:'Vignette',    step:1   },
    grain:      { id:'e_grain',      def:0,   unit:'%',  label:'Grain',       step:1   },
    temp:       { id:'e_temp',       def:0,   unit:'',   label:'Temp',        step:1   },
    tint:       { id:'e_tint',       def:0,   unit:'',   label:'Tint',        step:1   },
    shadows:    { id:'e_shadows',    def:0,   unit:'%',  label:'Shadows',     step:1   },
    highlights: { id:'e_highlights', def:0,   unit:'%',  label:'Highlights',  step:1   },
    inv:        { id:'e_invert',     def:0,   unit:'%',  label:'Invert',      step:1   },
  };
  const displayIds = {
    br:'br-display', co:'co-display', sa:'sa-display', hr:'hr-display',
    bl:'bl-display', op:'op-display', sepia:'sepia-display', vibrance:'vib-display',
    pixel:'pix-display', vig:'vig-display', grain:'grain-display', temp:'temp-display',
    tint:'tint-display', shadows:'shadows-display', highlights:'highlights-display', inv:'inv-display',
  };

  const s = {}, d = {};
  Object.entries(sliderDefs).forEach(([k, def]) => {
    s[k] = document.getElementById(def.id);
    d[k] = document.getElementById(displayIds[k]);
  });

  const BASIC_KEYS    = ['br','co','sa','hr','bl','op','sepia','vibrance'];
  const CREATIVE_KEYS = ['pixel','vig','grain','temp','tint','shadows','highlights','inv'];
  const ALL_KEYS      = [...BASIC_KEYS, ...CREATIVE_KEYS];

  let originalImage = null;

  // ── Vignette map ─────────────────────────────────────
  const VS = 768;
  const vigMap = new Float32Array(VS * VS);
  (function () {
    const cx = VS / 2, cy = VS / 2, mx = Math.sqrt(cx * cx + cy * cy);
    for (let y = 0; y < VS; y++)
      for (let x = 0; x < VS; x++)
        vigMap[y * VS + x] = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / mx;
  })();

  function makeGrain(count, strength, seed) {
    const arr = new Float32Array(count); let st = seed >>> 0;
    for (let i = 0; i < count; i++) { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; arr[i] = (st / 0xFFFFFFFF * 2 - 1) * strength; }
    return arr;
  }
  let cachedGrain = null, cachedGrainStrength = -1;

  // ── History ───────────────────────────────────────────
  let history = [], historyIdx = -1;
  const MAX_H = 20;

  function getVals() { const o = {}; Object.keys(s).forEach(k => o[k] = parseFloat(s[k].value)); return o; }
  function setVals(v) { Object.keys(s).forEach(k => s[k].value = (v[k] !== undefined ? v[k] : sliderDefs[k].def)); }
  function updateHistoryUI() {
    historyInfo.textContent = `History: ${historyIdx + 1}/${history.length} (max ${MAX_H})`;
    document.getElementById('undoBtn').style.opacity = historyIdx > 0 ? '1' : '0.4';
    document.getElementById('redoBtn').style.opacity = historyIdx < history.length - 1 ? '1' : '0.4';
  }
  function saveState() {
    if (!originalImage) return;
    const off = document.createElement('canvas'); off.width = originalImage.width; off.height = originalImage.height;
    off.getContext('2d').drawImage(originalImage, 0, 0);
    if (historyIdx < history.length - 1) history = history.slice(0, historyIdx + 1);
    history.push({ dataURL: off.toDataURL('image/png'), vals: getVals() });
    if (history.length > MAX_H) history.shift();
    historyIdx = history.length - 1;
    updateHistoryUI();
  }
  function loadState(idx) {
    if (idx < 0 || idx >= history.length) return;
    const st = history[idx];
    const img = new Image();
    img.onload = () => { originalImage = img; setVals(st.vals); historyIdx = idx; updateHistoryUI(); drawPreview(); };
    img.src = st.dataURL;
  }

  document.getElementById('undoBtn').addEventListener('click', () => { if (historyIdx > 0) loadState(historyIdx - 1); });
  document.getElementById('redoBtn').addEventListener('click', () => { if (historyIdx < history.length - 1) loadState(historyIdx + 1); });
  document.addEventListener('keydown', e => {
    const edHost = document.getElementById('edit-app'); if (edHost && edHost.hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (historyIdx > 0) loadState(historyIdx - 1); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); if (historyIdx < history.length - 1) loadState(historyIdx + 1); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); downloadImage(); }
  });

  // ── Zoom ──────────────────────────────────────────────
  zoomSelect.addEventListener('change', e => {
    leftCol.style.width = (480 * parseInt(e.target.value) / 100) + 'px';
    setTimeout(refreshTextOverlays, 60);
  });
  window.addEventListener('resize', () => setTimeout(refreshTextOverlays, 60));

  // ── Helpers ───────────────────────────────────────────
  function getBounds(iw, ih, cw, ch) {
    const sc = Math.min(cw / iw, ch / ih), dw = iw * sc, dh = ih * sc;
    return { dw, dh, ox: (cw - dw) / 2, oy: (ch - dh) / 2 };
  }
  function getCSSFilter() {
    return `brightness(${s.br.value}%) contrast(${s.co.value}%) saturate(${s.sa.value}%) `
      + `hue-rotate(${s.hr.value}deg) blur(${s.bl.value}px) opacity(${s.op.value}%) sepia(${s.sepia.value}%)`;
  }

  // ── Pixel effects ─────────────────────────────────────
  function applyPixelFX(imageData, customVigMap) {
    const data = imageData.data, len = data.length, clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;
    const vm = customVigMap || vigMap;
    const inv = parseFloat(s.inv.value) / 100;
    if (inv > 0) for (let i = 0; i < len; i += 4) { data[i] = clamp(data[i] + (255 - 2 * data[i]) * inv); data[i + 1] = clamp(data[i + 1] + (255 - 2 * data[i + 1]) * inv); data[i + 2] = clamp(data[i + 2] + (255 - 2 * data[i + 2]) * inv); }
    const vib = parseFloat(s.vibrance.value) / 100;
    if (vib !== 0) for (let i = 0; i < len; i += 4) { const r = data[i], g = data[i + 1], b = data[i + 2], avg = (r + g + b) / 3, delta = (Math.max(r, g, b) - Math.min(r, g, b)) / 255, amt = vib * (1 - delta) * 2; data[i] = clamp(r + (r - avg) * amt); data[i + 1] = clamp(g + (g - avg) * amt); data[i + 2] = clamp(b + (b - avg) * amt); }
    const temp = parseFloat(s.temp.value) / 100, tint = parseFloat(s.tint.value) / 100;
    if (temp !== 0 || tint !== 0) for (let i = 0; i < len; i += 4) { let r = data[i], g = data[i + 1], b = data[i + 2]; r = clamp(r + r * temp * 0.5); b = clamp(b - b * temp * 0.5); g = clamp(g + g * tint * 0.3); r = clamp(r - r * tint * 0.15); b = clamp(b - b * tint * 0.15); data[i] = r; data[i + 1] = g; data[i + 2] = b; }
    const shad = parseFloat(s.shadows.value) / 100, high = parseFloat(s.highlights.value) / 100;
    if (shad !== 0 || high !== 0) for (let i = 0; i < len; i += 4) { const r = data[i], g = data[i + 1], b = data[i + 2], lum = 0.2126 * r + 0.7152 * g + 0.0722 * b, sw = Math.max(0, (128 - lum) / 128), hw = Math.max(0, (lum - 128) / 128), adj = sw * shad * 80 - hw * high * 80; data[i] = clamp(r + adj); data[i + 1] = clamp(g + adj); data[i + 2] = clamp(b + adj); }
    const grain = parseFloat(s.grain.value);
    if (grain > 0) { if (cachedGrainStrength !== grain || !cachedGrain || cachedGrain.length < len / 4) { cachedGrain = makeGrain(len / 4, grain, 42); cachedGrainStrength = grain; } for (let i = 0, gi = 0; i < len; i += 4, gi++) { const n = cachedGrain[gi]; data[i] = clamp(data[i] + n); data[i + 1] = clamp(data[i + 1] + n); data[i + 2] = clamp(data[i + 2] + n); } }
    const vig = parseFloat(s.vig.value) / 100;
    if (vig > 0) for (let i = 0; i < len; i += 4) { const f = 1 - vig * vm[i >> 2]; data[i] = clamp(data[i] * f); data[i + 1] = clamp(data[i + 1] * f); data[i + 2] = clamp(data[i + 2] * f); }
    const pix = parseInt(s.pixel.value);
    if (pix > 1) { const W = imageData.width, H = imageData.height; for (let y = 0; y < H; y += pix) for (let x = 0; x < W; x += pix) { const base = (y * W + x) * 4, pr = data[base], pg = data[base + 1], pb = data[base + 2]; for (let dy = 0; dy < pix && y + dy < H; dy++) for (let dx = 0; dx < pix && x + dx < W; dx++) { const idx = ((y + dy) * W + (x + dx)) * 4; data[idx] = pr; data[idx + 1] = pg; data[idx + 2] = pb; } } }
  }

  // ══════════════════════════════════════════════════════
  // ── VIEW MODE ─────────────────────────────────────────
  // ══════════════════════════════════════════════════════
  let currentView = 'sliders';
  function switchView(mode) {
    currentView = mode;
    sliderView.style.display    = mode === 'sliders'   ? 'block' : 'none';
    knobView.style.display      = mode === 'knobs'     ? 'block' : 'none';
    plusminusView.style.display = mode === 'plusminus' ? 'block' : 'none';
    jogwheelView.style.display  = mode === 'jogwheel'  ? 'block' : 'none';
    if (mode === 'knobs')     drawAllKnobs();
    if (mode === 'plusminus') updatePMDisplays();
    if (mode === 'jogwheel')  { jogVisualAngle = 0; drawJogWheel(); }
  }
  viewModeSelect.addEventListener('change', () => switchView(viewModeSelect.value));

  // ── Draw preview ──────────────────────────────────────
  let pendingFrame = false;
  function drawPreview() {
    if (!originalImage || pendingFrame) return;
    pendingFrame = true;
    requestAnimationFrame(() => {
      pendingFrame = false;
      previewCtx.clearRect(0, 0, VS, VS);
      const { dw, dh, ox, oy } = getBounds(originalImage.width, originalImage.height, VS, VS);
      previewCtx.filter = getCSSFilter();
      previewCtx.drawImage(originalImage, ox, oy, dw, dh);
      previewCtx.filter = 'none';
      const id = previewCtx.getImageData(0, 0, VS, VS);
      applyPixelFX(id, null);
      previewCtx.putImageData(id, 0, 0);
      updateDisplays();
      if (currentView === 'knobs')     drawAllKnobs();
      if (currentView === 'plusminus') updatePMDisplays();
      if (currentView === 'jogwheel')  drawJogWheel();
    });
  }

  function updateDisplays() {
    Object.keys(d).forEach(k => { d[k].textContent = s[k].value + (sliderDefs[k].unit || ''); });
  }

  // ── Sliders ───────────────────────────────────────────
  Object.values(s).forEach(el => {
    el.addEventListener('input', () => { document.getElementById('filter-preset').value = 'custom'; drawPreview(); });
    el.addEventListener('change', () => saveState());
    function touchToValue(e) {
      e.preventDefault();
      const touch = e.touches[0] || e.changedTouches[0];
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      const min = parseFloat(el.min), max = parseFloat(el.max), step = parseFloat(el.step) || 1;
      el.value = Math.round((min + ratio * (max - min)) / step) * step;
      document.getElementById('filter-preset').value = 'custom';
      drawPreview();
    }
    el.addEventListener('touchstart', touchToValue, { passive: false });
    el.addEventListener('touchmove',  touchToValue, { passive: false });
    el.addEventListener('touchend',   () => saveState(), { passive: true });
  });

  // ── Reset & presets ───────────────────────────────────
  function resetSliders() { Object.entries(sliderDefs).forEach(([k, def]) => s[k].value = def.def); }
  window.resetAllFilters = function () { resetSliders(); document.getElementById('filter-preset').value = 'normal'; drawPreview(); };

  const PRESETS = { normal:{},grayscale:{sa:0},sepia:{sepia:80,temp:20},invert:{inv:100},vintage:{sepia:30,vibrance:20,temp:15,highlights:-10},cold:{temp:-50,tint:20,sa:90},warm:{temp:50,tint:-20},noir:{co:150,sa:0,shadows:20},faded:{vibrance:-30,co:80},dramatic:{co:150,shadows:30,highlights:-30,vig:40},lomo:{co:130,sa:130,vig:60,grain:20,temp:-10},matte:{co:85,sa:80,shadows:30,highlights:-20},sunset:{temp:70,tint:-20,sa:130,highlights:15} };
  document.getElementById('filter-preset').addEventListener('change', function () {
    const preset = PRESETS[this.value]; if (!preset) return;
    resetSliders(); Object.entries(preset).forEach(([k, v]) => { if (s[k]) s[k].value = v; }); drawPreview();
  });

  // ══════════════════════════════════════════════════════
  // ── KNOB SYSTEM ───────────────────────────────────────
  // ══════════════════════════════════════════════════════
  const KNOB_SIZE = 58;
  const knobCanvases = {}, knobValEls = {};

  function drawKnob(key) {
    const cvs = knobCanvases[key]; if (!cvs) return;
    const ctx = cvs.getContext('2d'), W = cvs.width, H = cvs.height, cx = W / 2, cy = H / 2;
    const trackR = W / 2 - 5, bodyR = trackR - 7;
    const el = s[key], min = parseFloat(el.min), max = parseFloat(el.max), val = parseFloat(el.value);
    const t = (val - min) / (max - min);
    const startRad = 135 * Math.PI / 180;
    const currRad  = startRad + t * 270 * Math.PI / 180;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(cx, cy, trackR, startRad, (135 + 270) * Math.PI / 180); ctx.strokeStyle = thBorder(); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, trackR, startRad, currRad); ctx.strokeStyle = thAccent(); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, bodyR, 0, Math.PI * 2); ctx.fillStyle = thField(); ctx.fill(); ctx.strokeStyle = '#484848'; ctx.lineWidth = 1.5; ctx.stroke();
    const g = ctx.createRadialGradient(cx - bodyR * 0.25, cy - bodyR * 0.25, 1, cx, cy, bodyR);
    g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx, cy, bodyR, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    const indR = bodyR - 5;
    ctx.beginPath(); ctx.arc(cx + Math.cos(currRad) * indR, cy + Math.sin(currRad) * indR, 3, 0, Math.PI * 2); ctx.fillStyle = thAccent(); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fillStyle = thBorder(); ctx.fill();
    if (knobValEls[key]) knobValEls[key].textContent = val + (sliderDefs[key].unit || '');
  }

  function drawAllKnobs() { Object.keys(knobCanvases).forEach(k => drawKnob(k)); }

  function buildKnob(key) {
    const cvs = document.createElement('canvas'); cvs.width = KNOB_SIZE; cvs.height = KNOB_SIZE; cvs.style.cssText = `width:${KNOB_SIZE}px;height:${KNOB_SIZE}px;`;
    knobCanvases[key] = cvs;
    const label = document.createElement('div'); label.className = 'knob-label'; label.textContent = sliderDefs[key].label;
    const valEl = document.createElement('div'); valEl.className = 'knob-val'; knobValEls[key] = valEl;
    const wrap = document.createElement('div'); wrap.className = 'knob-wrap'; wrap.append(cvs, label, valEl);
    let startY = 0, startVal = 0, dragging = false;
    wrap.addEventListener('pointerdown', e => { e.preventDefault(); wrap.setPointerCapture(e.pointerId); startY = e.clientY; startVal = parseFloat(s[key].value); dragging = true; wrap.classList.add('active'); });
    wrap.addEventListener('pointermove', e => {
      if (!dragging) return; e.preventDefault();
      const el = s[key], min = parseFloat(el.min), max = parseFloat(el.max), step = sliderDefs[key].step, range = max - min;
      let newVal = Math.max(min, Math.min(max, Math.round((startVal - (e.clientY - startY) / 160 * range) / step) * step));
      el.value = newVal; document.getElementById('filter-preset').value = 'custom';
      drawKnob(key); if (d[key]) d[key].textContent = newVal + (sliderDefs[key].unit || ''); drawPreview();
    });
    function endKnob() { if (!dragging) return; dragging = false; wrap.classList.remove('active'); saveState(); }
    wrap.addEventListener('pointerup', endKnob); wrap.addEventListener('pointercancel', endKnob);
    drawKnob(key);
    return wrap;
  }

    let _buildKnobGridsBuilt = false;
  function buildKnobGrids() {
    if (_buildKnobGridsBuilt) return; _buildKnobGridsBuilt = true;

    const bg = document.getElementById('knobGrid_basic'), cg = document.getElementById('knobGrid_creative');
    BASIC_KEYS.forEach(k => bg.appendChild(buildKnob(k)));
    CREATIVE_KEYS.forEach(k => cg.appendChild(buildKnob(k)));
  
  }

  // ══════════════════════════════════════════════════════
  // ── +/- BUTTON SYSTEM ─────────────────────────────────
  // ══════════════════════════════════════════════════════
  let stepMultiplier = 1;

  document.querySelectorAll('.step-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.step-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      stepMultiplier = parseInt(btn.dataset.mult);
    });
  });

  function updatePMDisplays() {
    ALL_KEYS.forEach(key => {
      const el = document.getElementById(`pm-val-${key}`);
      if (el) el.textContent = s[key].value + (sliderDefs[key].unit || '');
    });
  }

  function makePMButton(key, direction) {
    const btn = document.createElement('button');
    btn.className = 'pm-btn';
    btn.textContent = direction > 0 ? '+' : '−';
    let repeatTimer = null, repeatInterval = null;
    function applyPMStep() {
      const el = s[key];
      const min = parseFloat(el.min), max = parseFloat(el.max);
      const base = sliderDefs[key].step;
      const delta = base * stepMultiplier * direction;
      let newVal = Math.round((parseFloat(el.value) + delta) / base) * base;
      newVal = parseFloat(Math.max(min, Math.min(max, newVal)).toFixed(10));
      el.value = newVal;
      document.getElementById('filter-preset').value = 'custom';
      if (d[key]) d[key].textContent = newVal + (sliderDefs[key].unit || '');
      const pmEl = document.getElementById(`pm-val-${key}`);
      if (pmEl) pmEl.textContent = newVal + (sliderDefs[key].unit || '');
      if (knobCanvases[key]) drawKnob(key);
      if (currentView === 'jogwheel' && jogSelectedKey === key) drawJogWheel();
      drawPreview();
    }
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      applyPMStep();
      repeatTimer = setTimeout(() => { repeatInterval = setInterval(applyPMStep, 80); }, 380);
    });
    function stopPM() { clearTimeout(repeatTimer); clearInterval(repeatInterval); repeatTimer = repeatInterval = null; saveState(); }
    btn.addEventListener('pointerup', stopPM);
    btn.addEventListener('pointercancel', stopPM);
    return btn;
  }

    let _buildPlusMinusViewBuilt = false;
  function buildPlusMinusView() {
    if (_buildPlusMinusViewBuilt) return; _buildPlusMinusViewBuilt = true;

    [BASIC_KEYS, CREATIVE_KEYS].forEach((keys, ci) => {
      const col = document.getElementById(ci === 0 ? 'pmColBasic' : 'pmColCreative');
      keys.forEach(key => {
        const row = document.createElement('div'); row.className = 'pm-row';
        const info = document.createElement('div'); info.className = 'pm-info';
        const nameSpan = document.createElement('span'); nameSpan.className = 'pm-name'; nameSpan.textContent = sliderDefs[key].label;
        const valSpan = document.createElement('span'); valSpan.className = 'pm-val'; valSpan.id = `pm-val-${key}`; valSpan.textContent = s[key].value + (sliderDefs[key].unit || '');
        info.append(nameSpan, valSpan);
        row.append(makePMButton(key, -1), info, makePMButton(key, +1));
        col.appendChild(row);
      });
    });
  
  }

  // ══════════════════════════════════════════════════════
  // ── JOG WHEEL ─────────────────────────────────────────
  // ══════════════════════════════════════════════════════
  let jogSelectedKey = BASIC_KEYS[0];
  let jogVisualAngle = 0;
  let jogDragging    = false;
  let jogLastAngle   = 0;

  function drawJogWheel() {
    const cvs = document.getElementById('jogCanvas'); if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height, cx = W / 2, cy = H / 2;
    const outerR = W / 2 - 3, rimW = 22, innerR = outerR - rimW;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(jogVisualAngle);
    ctx.beginPath(); ctx.arc(0, 0, outerR, 0, Math.PI * 2); ctx.fillStyle = thField(); ctx.fill();
    const numGrips = 32;
    for (let i = 0; i < numGrips; i++) {
      const ang = (i / numGrips) * Math.PI * 2;
      const isMarker = i === 0;
      const r1 = outerR - 2, r2 = outerR - (isMarker ? 18 : 9);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
      ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
      ctx.strokeStyle = isMarker ? thAccent() : thBorder();
      ctx.lineWidth   = isMarker ? 3 : 2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    const rimGrad = ctx.createRadialGradient(0, 0, innerR, 0, 0, outerR);
    rimGrad.addColorStop(0,   'rgba(255,255,255,0.06)');
    rimGrad.addColorStop(0.6, 'rgba(0,0,0,0)');
    rimGrad.addColorStop(1,   'rgba(0,0,0,0.35)');
    ctx.beginPath(); ctx.arc(0, 0, outerR, 0, Math.PI * 2); ctx.arc(0, 0, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = rimGrad; ctx.fill();
    ctx.restore();
    const bg = ctx.createRadialGradient(cx, cy - innerR * 0.2, 2, cx, cy, innerR);
    bg.addColorStop(0, thField()); bg.addColorStop(1, thField());
    ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = '#1a2060'; ctx.lineWidth = 1.5; ctx.stroke();
    const el  = s[jogSelectedKey];
    const min = parseFloat(el.min), max = parseFloat(el.max), val = parseFloat(el.value);
    const t   = (val - min) / (max - min);
    const arcR = innerR - 6;
    ctx.beginPath(); ctx.arc(cx, cy, arcR, 0, Math.PI * 2); ctx.strokeStyle = thBorder(); ctx.lineWidth = 6; ctx.stroke();
    if (t > 0.001) {
      ctx.beginPath(); ctx.arc(cx, cy, arcR, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
      ctx.strokeStyle = thAccent(); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.fillStyle = thText(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(innerR * 0.13)}px sans-serif`;
    ctx.fillText(sliderDefs[jogSelectedKey].label.toUpperCase(), cx, cy - innerR * 0.28);
    ctx.fillStyle = thAccent();
    ctx.font = `bold ${Math.round(innerR * 0.3)}px sans-serif`;
    ctx.fillText(val + (sliderDefs[jogSelectedKey].unit || ''), cx, cy + innerR * 0.1);
    ctx.fillStyle = thDim();
    ctx.font = `${Math.round(innerR * 0.1)}px sans-serif`;
    ctx.fillText('rotate to adjust', cx, cy + innerR * 0.44);
  }

  function getPointerAngle(e, cvs) {
    const rect = cvs.getBoundingClientRect();
    return Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2));
  }

    let _buildJogParamListBuilt = false;
  function buildJogParamList() {
    if (_buildJogParamListBuilt) return; _buildJogParamListBuilt = true;

    const list = document.getElementById('jogParamList');
    ALL_KEYS.forEach(key => {
      const chip = document.createElement('div');
      chip.className = 'jog-chip' + (key === jogSelectedKey ? ' active' : '');
      chip.textContent = sliderDefs[key].label;
      chip.dataset.key = key;
      chip.addEventListener('click', () => {
        jogSelectedKey = key;
        jogVisualAngle = 0;
        document.querySelectorAll('.jog-chip').forEach(c => c.classList.toggle('active', c.dataset.key === key));
        drawJogWheel();
      });
      list.appendChild(chip);
    });
  
  }

  (function attachJogEvents() {
    const cvs = document.getElementById('jogCanvas');
    cvs.addEventListener('pointerdown', e => {
      e.preventDefault();
      cvs.setPointerCapture(e.pointerId);
      jogDragging  = true;
      jogLastAngle = getPointerAngle(e, cvs);
      cvs.classList.add('dragging');
    });
    cvs.addEventListener('pointermove', e => {
      if (!jogDragging) return;
      e.preventDefault();
      const currAngle = getPointerAngle(e, cvs);
      let deltaAngle = currAngle - jogLastAngle;
      if (deltaAngle >  Math.PI) deltaAngle -= 2 * Math.PI;
      if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
      jogLastAngle    = currAngle;
      jogVisualAngle += deltaAngle;
      const el    = s[jogSelectedKey];
      const min   = parseFloat(el.min), max = parseFloat(el.max);
      const step  = sliderDefs[jogSelectedKey].step;
      const range = max - min;
      const sensitivity = range / (Math.PI * 3);
      let newVal = parseFloat(el.value) + deltaAngle * sensitivity;
      newVal = parseFloat(Math.max(min, Math.min(max, Math.round(newVal / step) * step)).toFixed(10));
      el.value = newVal;
      document.getElementById('filter-preset').value = 'custom';
      if (d[jogSelectedKey]) d[jogSelectedKey].textContent = newVal + (sliderDefs[jogSelectedKey].unit || '');
      updatePMDisplays();
      if (knobCanvases[jogSelectedKey]) drawKnob(jogSelectedKey);
      drawJogWheel();
      drawPreview();
    });
    function endJog() {
      if (!jogDragging) return;
      jogDragging = false;
      cvs.classList.remove('dragging');
      saveState();
    }
    cvs.addEventListener('pointerup',     endJog);
    cvs.addEventListener('pointercancel', endJog);
    drawJogWheel();
  })();

  // ── Sharpen ───────────────────────────────────────────
  document.getElementById('sharpenBtn').addEventListener('click', () => {
    if (!originalImage) return; saveState();
    const off = document.createElement('canvas'); off.width = originalImage.width; off.height = originalImage.height;
    const ctx = off.getContext('2d'); ctx.drawImage(originalImage, 0, 0);
    const id = ctx.getImageData(0, 0, off.width, off.height); const src = id.data.slice();
    const W = off.width, H = off.height, kern = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const idx = (y * W + x) * 4; for (let c = 0; c < 3; c++) { let sum = 0; for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) sum += src[((y + ky) * W + (x + kx)) * 4 + c] * kern[(ky + 1) * 3 + (kx + 1)]; id.data[idx + c] = Math.max(0, Math.min(255, sum)); } }
    ctx.putImageData(id, 0, 0);
    const img = new Image(); img.onload = () => { originalImage = img; drawPreview(); }; img.src = off.toDataURL();
  });

  // ── Transforms ───────────────────────────────────────
  function applyTransform(fn) {
    if (!originalImage) return; saveState();
    const img = new Image(); img.onload = () => { originalImage = img; imgInfo.textContent = `${img.width} × ${img.height} px`; drawPreview(); }; img.src = fn();
  }
  document.getElementById('rotateLeftBtn').addEventListener('click', () => applyTransform(() => { const off = document.createElement('canvas'); off.width = originalImage.height; off.height = originalImage.width; const ctx = off.getContext('2d'); ctx.translate(off.width / 2, off.height / 2); ctx.rotate(-Math.PI / 2); ctx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2); return off.toDataURL(); }));
  document.getElementById('rotateRightBtn').addEventListener('click', () => applyTransform(() => { const off = document.createElement('canvas'); off.width = originalImage.height; off.height = originalImage.width; const ctx = off.getContext('2d'); ctx.translate(off.width / 2, off.height / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2); return off.toDataURL(); }));
  document.getElementById('flipHBtn').addEventListener('click', () => applyTransform(() => { const off = document.createElement('canvas'); off.width = originalImage.width; off.height = originalImage.height; const ctx = off.getContext('2d'); ctx.translate(off.width, 0); ctx.scale(-1, 1); ctx.drawImage(originalImage, 0, 0); return off.toDataURL(); }));
  document.getElementById('flipVBtn').addEventListener('click', () => applyTransform(() => { const off = document.createElement('canvas'); off.width = originalImage.width; off.height = originalImage.height; const ctx = off.getContext('2d'); ctx.translate(0, off.height); ctx.scale(1, -1); ctx.drawImage(originalImage, 0, 0); return off.toDataURL(); }));

  // ── Crop ──────────────────────────────────────────────
  let cropActive = false, isDragging = false, csx, csy, cw, ch;
  document.getElementById('cropBtn').addEventListener('click', () => { if (!originalImage) return; cropActive = true; cropOverlay.style.display = 'block'; cropBox.style.cssText = 'position:absolute;border:2px solid var(--th-accent);background:var(--th-accent-soft);box-sizing:border-box;width:0;height:0;'; });
  function canvasPos(e) { const rect = previewCanvas.getBoundingClientRect(); const cx = e.touches ? e.touches[0].clientX : e.clientX; const cy = e.touches ? e.touches[0].clientY : e.clientY; return { x: (cx - rect.left) * (previewCanvas.width / rect.width), y: (cy - rect.top) * (previewCanvas.height / rect.height) }; }
  function updateCropBox() { let x = csx, y = csy, w = cw, h = ch; if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; } cropBox.style.left = (x / VS * 100) + '%'; cropBox.style.top = (y / VS * 100) + '%'; cropBox.style.width = (w / VS * 100) + '%'; cropBox.style.height = (h / VS * 100) + '%'; }
  cropOverlay.addEventListener('mousedown', e => { if (!cropActive) return; e.preventDefault(); isDragging = true; const p = canvasPos(e); csx = p.x; csy = p.y; cw = 0; ch = 0; });
  cropOverlay.addEventListener('mousemove', e => { if (!isDragging) return; e.preventDefault(); const p = canvasPos(e); cw = p.x - csx; ch = p.y - csy; updateCropBox(); });
  cropOverlay.addEventListener('mouseup', finishCrop);
  cropOverlay.addEventListener('touchstart', e => { if (!cropActive) return; e.preventDefault(); isDragging = true; const p = canvasPos(e); csx = p.x; csy = p.y; cw = 0; ch = 0; }, { passive: false });
  cropOverlay.addEventListener('touchmove',  e => { if (!isDragging) return; e.preventDefault(); const p = canvasPos(e); cw = p.x - csx; ch = p.y - csy; updateCropBox(); }, { passive: false });
  cropOverlay.addEventListener('touchend', finishCrop);
  function finishCrop() {
    if (!isDragging) return; isDragging = false; cropActive = false; cropOverlay.style.display = 'none';
    if (Math.abs(cw) < 5 || Math.abs(ch) < 5) return;
    const { dw, dh, ox, oy } = getBounds(originalImage.width, originalImage.height, VS, VS);
    let x = csx, y = csy, w = cw, h = ch;
    if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
    const sx = originalImage.width / dw, sy = originalImage.height / dh;
    let ix = (x - ox) * sx, iy = (y - oy) * sy, iw = w * sx, ih = h * sy;
    ix = Math.max(0, ix); iy = Math.max(0, iy); iw = Math.min(originalImage.width - ix, iw); ih = Math.min(originalImage.height - iy, ih);
    if (iw <= 0 || ih <= 0) return;
    saveState();
    const off = document.createElement('canvas'); off.width = iw; off.height = ih;
    off.getContext('2d').drawImage(originalImage, ix, iy, iw, ih, 0, 0, iw, ih);
    const img = new Image(); img.onload = () => { originalImage = img; imgInfo.textContent = `${img.width} × ${img.height} px`; drawPreview(); }; img.src = off.toDataURL();
  }

  // ── Load image ────────────────────────────────────────
  function loadImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = e => { const img = new Image(); img.onload = () => { originalImage = img; history = []; historyIdx = -1; resetSliders(); saveState(); imgInfo.textContent = `${img.width} × ${img.height} px`; drawPreview(); }; img.src = e.target.result; };
    reader.readAsDataURL(file);
  }
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) loadImageFromFile(e.target.files[0]); });
  const sampleBtn = document.getElementById('sampleBtn');
  const ED_SAMPLES = (window.t2i_poolPlace && window.t2i_poolPerson)
    ? [window.t2i_poolPlace().img, window.t2i_poolPerson().img]
    : ['src/samples/sample-coast.jpg', 'src/samples/sample-portrait.jpg'];
  let edSampleIdx = 0;
  if (sampleBtn) sampleBtn.addEventListener('click', () => {
    if (originalImage) { imgInfo.textContent = 'Sample skipped — a picture is already loaded.'; return; }
    sampleBtn.disabled = true;
    const url = ED_SAMPLES[edSampleIdx % ED_SAMPLES.length];
    edSampleIdx++;
    imgInfo.textContent = 'Loading sample photo…';
    fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }).then(blob => {
      loadImageFromFile(new File([blob], url.split('/').pop() || 'sample.jpg', { type: blob.type || 'image/jpeg' }));
    }).catch(() => { imgInfo.textContent = '⚠️ Couldn\'t load the sample photo.'; }).finally(() => { sampleBtn.disabled = false; });
  });
  canvasContainer.addEventListener('dragover', e => e.preventDefault());
  canvasContainer.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) loadImageFromFile(e.dataTransfer.files[0]); });

  // ── Upscale ───────────────────────────────────────────
  function ensurePica(){
    if (window.pica) return Promise.resolve();
    return new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pica@9.0.1/dist/pica.min.js';
      s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error('pica load failed')); };
      document.head.appendChild(s);
    });
  }
  document.getElementById('upscaleBtn').addEventListener('click', async () => {
    try { await ensurePica(); } catch (e) { document.getElementById('upscaleStatus').textContent = '❌ Upscale library failed to load'; return; }
    if (!originalImage) return alert("Upload an image first " + Quip.q("editNoImage", "— the editor needs raw material."));
    const picaInst = pica();
    const factor = parseInt(document.getElementById('upscaleFactor').value);
    const nw = Math.round(originalImage.width * factor), nh = Math.round(originalImage.height * factor);
    loadingOverlay.textContent = `⏳ Upscaling to ${nw}×${nh}…`; loadingOverlay.style.display = 'flex';
    document.getElementById('upscaleBtn').disabled = true;
    const src = document.createElement('canvas'); src.width = originalImage.width; src.height = originalImage.height; src.getContext('2d').drawImage(originalImage, 0, 0);
    const dst = document.createElement('canvas'); dst.width = nw; dst.height = nh;
    try {
      await picaInst.resize(src, dst, { quality: 3, alpha: true });
      const img = new Image(); img.onload = () => { originalImage = img; saveState(); imgInfo.textContent = `${img.width} × ${img.height} px`; drawPreview(); document.getElementById('upscaleStatus').textContent = '✅ Done!'; setTimeout(() => document.getElementById('upscaleStatus').textContent = '', 2500); document.getElementById('upscaleBtn').disabled = false; loadingOverlay.style.display = 'none'; }; img.src = dst.toDataURL('image/png');
    } catch (err) { console.error(err); document.getElementById('upscaleStatus').textContent = '❌ Failed'; document.getElementById('upscaleBtn').disabled = false; loadingOverlay.style.display = 'none'; }
  });

  // ── Export ────────────────────────────────────────────
  exportFormat.addEventListener('change', () => { qualityGroup.style.display = exportFormat.value !== 'png' ? 'flex' : 'none'; });
  exportQuality.addEventListener('input', () => { qualityDisplay.textContent = exportQuality.value + '%'; });

  // ══════════════════════════════════════════════════════
  // ── TEKST: POPRAWIONE MAPOWANIE ───────────────────────
  // ══════════════════════════════════════════════════════

  const TEXT_COLORS = [
    { label:'White',     value:'#FFFFFF' },
    { label:'Black',     value:'#000000' },
    { label:'Red',       value:'#FF3333' },
    { label:'Blue',      value:'#3B82F6' },
    { label:'Yellow',    value:'#FBBF24' },
    { label:'Green',     value:'#22C55E' },
    { label:'Orange',    value:'#F97316' },
    { label:'Pink',      value:'#EC4899' },
    { label:'Cyan',      value:'#06B6D4' },
    { label:'Purple',    value:'#A855F7' },
    { label:'Gold',      value:'#FFD700' },
    { label:'Silver',    value:'#C8C8C8' },
    { label:'Bronze',    value:'#CD7F32' },
    { label:'Copper',    value:'#B87333' },
    { label:'Rose Gold', value:'#C9788A' },
    { label:'Platinum',  value:'#E8E8F0' },
  ];

  const OUTLINE_COLORS = [
    { label:'Black',     value:'#000000' },
    { label:'White',     value:'#FFFFFF' },
    { label:'Dark Gray', value:'#222222' },
    { label:'Gold',      value:'#B8860B' },
    { label:'Red',       value:'#AA0000' },
    { label:'Blue',      value:'#003399' },
    { label:'Purple',    value:'#5B21B6' },
    { label:'Dark Green',value:'#14532D' },
  ];

  let textLayers = [];
  let textIdCounter = 0;
  let activeTColor = '#FFFFFF';
  let activeOColor = '#000000';
  let activeOutlineLevel = 'none';

  // Build text color swatches
    let _buildTextColorSwatchesBuilt = false;
  function buildTextColorSwatches() {
    if (_buildTextColorSwatchesBuilt) return; _buildTextColorSwatchesBuilt = true;

    const container = document.getElementById('textColorSwatches');
    TEXT_COLORS.forEach((c, i) => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (i === 0 ? ' active' : '');
      sw.style.background = c.value;
      sw.title = c.label;
      if (i >= 10) sw.style.boxShadow = 'inset 0 1px 2px rgba(255,255,255,0.5), inset 0 -1px 2px rgba(0,0,0,0.3)';
      sw.addEventListener('click', () => {
        activeTColor = c.value;
        container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        updateTextPreview();
      });
      container.appendChild(sw);
    });
  
  }

  // Build outline color swatches
    let _buildOutlineColorSwatchesBuilt = false;
  function buildOutlineColorSwatches() {
    if (_buildOutlineColorSwatchesBuilt) return; _buildOutlineColorSwatchesBuilt = true;

    const container = document.getElementById('outlineColorSwatches');
    OUTLINE_COLORS.forEach((c, i) => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (i === 0 ? ' active' : '');
      sw.style.background = c.value;
      sw.title = c.label;
      sw.addEventListener('click', () => {
        activeOColor = c.value;
        container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        updateTextPreview();
      });
      container.appendChild(sw);
    });
  
  }

  // Outline level buttons
  document.querySelectorAll('.outline-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.outline-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeOutlineLevel = btn.dataset.level;
      document.getElementById('outlineColorRow').style.display = activeOutlineLevel === 'none' ? 'none' : 'block';
      updateTextPreview();
    });
  });

  // Text input char counter
  document.getElementById('textInput').addEventListener('input', function() {
    document.getElementById('textCharCount').textContent = this.value.length;
    updateTextPreview();
  });

  // Text size slider
  document.getElementById('textSize').addEventListener('input', function() {
    document.getElementById('textSizeDisplay').textContent = this.value + 'px';
    updateTextPreview();
  });

  // Font selector
  document.getElementById('textFont').addEventListener('change', updateTextPreview);

  function getOutlineCSS(level, color) {
    if (level === 'none')   return 'none';
    if (level === 'small')  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}`;
    if (level === 'medium') return `0 0 6px ${color}, 0 0 8px ${color}, 2px 2px 4px ${color}, -2px -2px 4px ${color}`;
    if (level === 'big')    return `0 0 14px ${color}, 0 0 22px ${color}, 0 0 22px ${color}, 3px 3px 6px ${color}, -3px -3px 6px ${color}`;
  }

  function updateTextPreview() {
    const previewEl = document.getElementById('textPreviewEl');
    const rawText = document.getElementById('textInput').value || 'Preview text';
    const font = document.getElementById('textFont').value;
    const size = parseInt(document.getElementById('textSize').value);
    const previewSize = Math.min(size, 36);
    previewEl.textContent = rawText;
    previewEl.style.fontFamily = font;
    previewEl.style.fontSize = previewSize + 'px';
    previewEl.style.color = activeTColor;
    const shadow = getOutlineCSS(activeOutlineLevel, activeOColor);
    previewEl.style.textShadow = shadow === 'none' ? '' : shadow;
  }

  // Toggle text panel
  document.getElementById('addTextBtn').addEventListener('click', () => {
    const panel = document.getElementById('textPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') updateTextPreview();
  });
  document.getElementById('closeTextPanel').addEventListener('click', () => {
    document.getElementById('textPanel').style.display = 'none';
  });

  // ----- Funkcja pomocnicza do obliczania pozycji liter na łuku -----
  function getArcPositions(text, font, fontSize, arcMode, ctx = null) {
    if (arcMode === 'none' || !text) return [];

    let tempCtx = ctx;
    if (!tempCtx) {
      const canvas = document.createElement('canvas');
      tempCtx = canvas.getContext('2d');
    }
    tempCtx.save();
    tempCtx.font = `bold ${fontSize}px ${font}`;

    const chars = Array.from(text);
    const n = chars.length;
    if (n === 0) return [];

    const widths = chars.map(ch => tempCtx.measureText(ch).width);
    tempCtx.restore();

    const radius = fontSize * 4; // większy promień dla czytelności
    const totalAngle = widths.reduce((a, b) => a + b, 0) / radius;
    const startAngle = -totalAngle / 2;

    const positions = [];
    let cumulative = 0;

    for (let i = 0; i < n; i++) {
      const halfW = widths[i] / 2;
      const angle = startAngle + (cumulative + halfW) / radius;
      cumulative += widths[i];

      let x, y, rot;
      if (arcMode === 'up') {
        x = Math.sin(angle) * radius;
        y = -Math.cos(angle) * radius;
        rot = angle;
      } else { // down
        x = Math.sin(angle) * radius;
        y = Math.cos(angle) * radius;
        rot = -angle;
      }
      positions.push({ x, y, rot, char: chars[i] });
    }
    return positions;
  }

  // ----- Renderowanie do podglądu (HTML) -----
  function renderArcTextDOM(container, layer, fontSize) {
    container.innerHTML = '';
    if (layer.arcMode === 'none') {
      container.style.cssText = 'position:relative; display:inline; white-space:nowrap;';
      container.textContent = layer.text;
      return;
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const positions = getArcPositions(layer.text, layer.font, fontSize, layer.arcMode, tempCtx);

    const radius = fontSize * 4;
    const boxSize = radius * 2 + fontSize * 2;
    container.style.cssText = `position:relative; display:block; width:${boxSize}px; height:${boxSize}px;`;

    positions.forEach(pos => {
      const span = document.createElement('span');
      span.textContent = pos.char === ' ' ? '\u00A0' : pos.char;
      span.style.position = 'absolute';
      span.style.display = 'inline-block';
      span.style.whiteSpace = 'nowrap';
      span.style.fontFamily = layer.font;
      span.style.fontSize = fontSize + 'px';
      span.style.fontWeight = 'bold';
      span.style.color = layer.color;
      const shadow = getOutlineCSS(layer.outlineLevel, layer.outlineColor);
      if (shadow !== 'none') span.style.textShadow = shadow;

      const cx = boxSize / 2;
      const x = cx + pos.x - fontSize * 0.1;
      const y = cx + pos.y - fontSize * 0.3;
      span.style.left = x + 'px';
      span.style.top = y + 'px';
      span.style.transform = `rotate(${pos.rot * 180 / Math.PI}deg)`;
      span.style.transformOrigin = 'center center';
      container.appendChild(span);
    });
  }

  // ----- Tworzenie elementu DOM dla warstwy -----
  function createTextDOMElement(layer) {
    const wrapperW = canvasWrapper.offsetWidth || 460;

    const div = document.createElement('div');
    div.id = 'tl-' + layer.id;
    div.className = 'text-overlay';
    div.style.left      = layer.xPct + '%';
    div.style.top       = layer.yPct + '%';
    div.style.transform = `translate(-50%,-50%) rotate(${layer.rotation}deg)`;

    const textCont = document.createElement('div');
    textCont.style.cssText = 'position:relative; pointer-events:none;';
    div.appendChild(textCont);

    function applyTextStyles() {
      const cssFontSize = Math.max(8, layer.size * (wrapperW / 768));
      div.style.fontFamily = layer.font;
      div.style.fontSize   = cssFontSize + 'px';
      div.style.color      = layer.color;
      const shadow = getOutlineCSS(layer.outlineLevel, layer.outlineColor);
      div.style.textShadow = shadow === 'none' ? '' : shadow;
      renderArcTextDOM(textCont, layer, cssFontSize);
    }

    applyTextStyles();

    // Uchwyt usuwania
    const delBtn = document.createElement('button');
    delBtn.className = 'text-del-btn';
    delBtn.textContent = '×';
    delBtn.title = 'Usuń';
    delBtn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      e.preventDefault();
      removeTextLayer(layer.id);
    });

    // Uchwyt obrotu
    const rotHandle = document.createElement('button');
    rotHandle.className = 'text-handle text-rot-handle';
    rotHandle.innerHTML = '↻';
    rotHandle.title = 'Rotate (drag)';

    let rotating = false, rotStartAngle = 0, rotStartLayer = 0;
    rotHandle.addEventListener('pointerdown', e => {
      e.stopPropagation();
      e.preventDefault();
      rotHandle.setPointerCapture(e.pointerId);
      rotating = true;
      const r = div.getBoundingClientRect();
      rotStartAngle = Math.atan2(
        e.clientY - (r.top  + r.height / 2),
        e.clientX - (r.left + r.width  / 2)
      ) * 180 / Math.PI;
      rotStartLayer = layer.rotation;
    });
    rotHandle.addEventListener('pointermove', e => {
      if (!rotating) return;
      e.preventDefault();
      const r = div.getBoundingClientRect();
      const angle = Math.atan2(
        e.clientY - (r.top  + r.height / 2),
        e.clientX - (r.left + r.width  / 2)
      ) * 180 / Math.PI;
      layer.rotation      = rotStartLayer + (angle - rotStartAngle);
      div.style.transform = `translate(-50%,-50%) rotate(${layer.rotation}deg)`;
    });
    rotHandle.addEventListener('pointerup',     () => { rotating = false; });
    rotHandle.addEventListener('pointercancel', () => { rotating = false; });

    // Uchwyt skali
    const scaleHandle = document.createElement('button');
    scaleHandle.className = 'text-handle text-scale-handle';
    scaleHandle.innerHTML = '⤡';
    scaleHandle.title = 'change size (drag up/down)';

    let scaling = false, scaleStartY = 0, scaleStartSize = 0;
    scaleHandle.addEventListener('pointerdown', e => {
      e.stopPropagation();
      e.preventDefault();
      scaleHandle.setPointerCapture(e.pointerId);
      scaling = true;
      scaleStartY    = e.clientY;
      scaleStartSize = layer.size;
    });
    scaleHandle.addEventListener('pointermove', e => {
      if (!scaling) return;
      e.preventDefault();
      const newSize = Math.max(16, Math.min(120, Math.round(scaleStartSize + (scaleStartY - e.clientY) * 0.4)));
      if (newSize !== layer.size) {
        layer.size = newSize;
        applyTextStyles();
      }
    });
    scaleHandle.addEventListener('pointerup',     () => { scaling = false; });
    scaleHandle.addEventListener('pointercancel', () => { scaling = false; });

    // Uchwyt łuku
    const arcHandle = document.createElement('button');
    arcHandle.className = 'text-handle text-arc-handle';
    arcHandle.innerHTML = '⌢';
    arcHandle.title = 'Arch: none → top → down';
    const arcIcons = { none: '⌢', up: '◠', down: '◡' };
    const arcOrder = ['none', 'up', 'down'];
    arcHandle.addEventListener('click', e => {
      e.stopPropagation();
      layer.arcMode            = arcOrder[(arcOrder.indexOf(layer.arcMode) + 1) % 3];
      arcHandle.innerHTML      = arcIcons[layer.arcMode];
      arcHandle.style.background   = layer.arcMode !== 'none' ? '#2d1b69' : '';
      arcHandle.style.borderColor  = layer.arcMode !== 'none' ? '#8B5CF6' : '';
      arcHandle.style.color        = layer.arcMode !== 'none' ? '#c4b5fd' : '';
      applyTextStyles();
    });

    div.append(delBtn, rotHandle, scaleHandle, arcHandle);

    // Przeciąganie
    let dragging = false, startX, startY, startLeft, startTop;
    div.addEventListener('pointerdown', e => {
      if (e.target !== div && e.target !== textCont && !textCont.contains(e.target)) return;
      e.preventDefault();
      div.setPointerCapture(e.pointerId);
      dragging  = true;
      startX    = e.clientX;
      startY    = e.clientY;
      startLeft = layer.xPct;
      startTop  = layer.yPct;
      div.style.zIndex = 30;
    });
    div.addEventListener('pointermove', e => {
      if (!dragging) return;
      e.preventDefault();
      const rect = canvasWrapper.getBoundingClientRect();
      const dx = (e.clientX - startX) / rect.width  * 100;
      const dy = (e.clientY - startY) / rect.height * 100;
      layer.xPct = Math.max(1, Math.min(99, startLeft + dx));
      layer.yPct = Math.max(1, Math.min(99, startTop  + dy));
      div.style.left = layer.xPct + '%';
      div.style.top  = layer.yPct + '%';
    });
    div.addEventListener('pointerup',     () => { dragging = false; div.style.zIndex = 15; });
    div.addEventListener('pointercancel', () => { dragging = false; div.style.zIndex = 15; });

    canvasWrapper.appendChild(div);
  }

  function removeTextLayer(id) {
    textLayers = textLayers.filter(l => l.id !== id);
    const el = document.getElementById('tl-' + id);
    if (el) el.remove();
    updateTextLayersList();
  }

  function updateTextLayersList() {
    const list = document.getElementById('textLayersList');
    list.innerHTML = '';
    if (!textLayers.length) return;

    const header = document.createElement('div');
    header.style.cssText = 'font-size:10px; color:#666; margin-bottom:3px; margin-top:6px;';
    header.textContent = `Active text layers (${textLayers.length}):`;
    list.appendChild(header);

    textLayers.forEach(layer => {
      const item = document.createElement('div');
      item.className = 'text-layer-item';
      const colorDot = document.createElement('span');
      colorDot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${layer.color};flex-shrink:0;display:inline-block;`;
      const label = document.createElement('span');
      label.className = 'text-layer-item-label';
      label.title = layer.text;
      label.textContent = `"${layer.text.length > 18 ? layer.text.slice(0,18)+'…' : layer.text}"`;
      const delBtn = document.createElement('button');
      delBtn.className = 'text-layer-del';
      delBtn.textContent = '✕ Remove';
      delBtn.addEventListener('click', () => removeTextLayer(layer.id));
      item.append(colorDot, label, delBtn);
      list.appendChild(item);
    });
  }

  function refreshTextOverlays() {
    const wrapperW = canvasWrapper.offsetWidth || 460;
    textLayers.forEach(layer => {
      const div = document.getElementById('tl-' + layer.id);
      if (!div) return;
      div.style.fontSize  = Math.max(8, layer.size * (wrapperW / 768)) + 'px';
      div.style.transform = `translate(-50%,-50%) rotate(${layer.rotation}deg)`;
    });
  }

  // ----- Renderowanie na canvasie eksportowym (POPRAWIONE) -----
  function renderTextLayersToCanvas(ctx, FW, FH, previewBounds) {
    const { dw, dh, ox, oy } = previewBounds;

    textLayers.forEach(layer => {
      // Pozycja na canvasie podglądu (0..VS)
      const previewX = (layer.xPct / 100) * VS;
      const previewY = (layer.yPct / 100) * VS;

      // Mapowanie na oryginalny obraz
      const origX = (previewX - ox) / dw * FW;
      const origY = (previewY - oy) / dh * FH;

      // Rozmiar czcionki na oryginalnym obrazie
      const exportFontSize = Math.max(4, layer.size * (FW / dw));

      ctx.save();
      ctx.translate(origX, origY);
      if (layer.rotation) ctx.rotate(layer.rotation * Math.PI / 180);
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = `bold ${exportFontSize}px ${layer.font}`;
      ctx.fillStyle    = layer.color;

      function drawChar(ch, x, y, rotRad) {
        ctx.save();
        ctx.translate(x, y);
        if (rotRad) ctx.rotate(rotRad);
        if (layer.outlineLevel !== 'none') {
          ctx.strokeStyle = layer.outlineColor;
          ctx.lineJoin    = 'round';
          if (layer.outlineLevel === 'small') {
            ctx.lineWidth = Math.max(1, exportFontSize * 0.06);
          } else if (layer.outlineLevel === 'medium') {
            ctx.lineWidth    = Math.max(2, exportFontSize * 0.1);
            ctx.shadowBlur   = exportFontSize * 0.18;
            ctx.shadowColor  = layer.outlineColor;
          } else if (layer.outlineLevel === 'big') {
            ctx.lineWidth    = Math.max(3, exportFontSize * 0.2);
            ctx.shadowBlur   = exportFontSize * 0.38;
            ctx.shadowColor  = layer.outlineColor;
          }
          ctx.strokeText(ch, 0, 0);
          if (layer.outlineLevel !== 'small') ctx.strokeText(ch, 0, 0);
        }
        ctx.shadowBlur = 0;
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      }

      if (layer.arcMode === 'none') {
        drawChar(layer.text, 0, 0, 0);
      } else {
        const positions = getArcPositions(layer.text, layer.font, exportFontSize, layer.arcMode, ctx);
        positions.forEach(pos => {
          drawChar(pos.char, pos.x, pos.y, pos.rot);
        });
      }

      ctx.restore();
    });
  }

  // Place text button
  document.getElementById('placeTextBtn').addEventListener('click', () => {
    const text = document.getElementById('textInput').value.trim();
    if (!text) { alert('Please enter some text first ' + Quip.q("editNoText", "— mind-reading module sold separately.")); return; }

    const font    = document.getElementById('textFont').value;
    const size    = parseInt(document.getElementById('textSize').value);
    const id      = ++textIdCounter;
    const layer   = { id, text, font, size, color: activeTColor, outlineLevel: activeOutlineLevel, outlineColor: activeOColor, xPct: 50, yPct: 50, rotation: 0, arcMode: 'none' };

    textLayers.push(layer);
    createTextDOMElement(layer);
    updateTextLayersList();

    const statusEl = document.getElementById('placeTextStatus');
    statusEl.textContent = '✅ Placed! Drag to reposition. ' + Quip.q("editPlaced", "Looking sharp.");
    setTimeout(() => { statusEl.textContent = ''; }, 2500);

    document.getElementById('textInput').value = '';
    document.getElementById('textCharCount').textContent = '0';
    updateTextPreview();
  });

  // ── Download (poprawiony) ─────────────────────────────
  window.downloadImage = function () {
    if (!originalImage) return alert("Upload an image first " + Quip.q("editNoImage", "— the editor needs raw material."));
    const FW = originalImage.width, FH = originalImage.height;
    const off = document.createElement('canvas'); off.width = FW; off.height = FH;
    const ctx = off.getContext('2d');
    ctx.filter = getCSSFilter(); ctx.drawImage(originalImage, 0, 0); ctx.filter = 'none';
    const fvMap = new Float32Array(FW * FH);
    const fcx = FW / 2, fcy = FH / 2, fmx = Math.sqrt(fcx * fcx + fcy * fcy);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) fvMap[y * FW + x] = Math.sqrt((x - fcx) ** 2 + (y - fcy) ** 2) / fmx;
    const id = ctx.getImageData(0, 0, FW, FH); applyPixelFX(id, fvMap); ctx.putImageData(id, 0, 0);

    if (textLayers.length > 0) {
      const previewBounds = getBounds(originalImage.width, originalImage.height, VS, VS);
      document.fonts.ready.then(() => {
        renderTextLayersToCanvas(ctx, FW, FH, previewBounds);
        doDownload(off);
      });
    } else {
      doDownload(off);
    }
  };

  function doDownload(canvas) {
    const fmt = exportFormat.value, mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png', q = parseFloat(exportQuality.value) / 100;
    const link = document.createElement('a'); link.download = `edited_image.${fmt}`; link.href = canvas.toDataURL(mime, q); link.click();
  }

    updateHistoryUI();
    updateTextPreview();
    window.__editorThemeRefresh = function(){
      if (currentView === 'knobs') drawAllKnobs();
      if (currentView === 'jogwheel') drawJogWheel();
    };
    window.__editorOnShow = function(){ buildKnobGrids(); buildPlusMinusView(); buildJogParamList(); buildTextColorSwatches(); buildOutlineColorSwatches(); updateHistoryUI(); setTimeout(refreshTextOverlays, 60); };
    buildKnobGrids(); buildPlusMinusView(); buildJogParamList(); buildTextColorSwatches(); buildOutlineColorSwatches(); setTimeout(refreshTextOverlays, 60);
  }
  window.__editorOnShow = function(){ editorBoot(); };
  window.__editorOnThemeChange = function(){ if (window.__editorThemeRefresh) window.__editorThemeRefresh(); };
})();
