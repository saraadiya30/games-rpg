import {
  MotionEngine, TWO_PI, clamp, clamp01, downsampleRGBA, boxBlur,
} from './engine.js';
import { writeZip } from './zip.js';

export const FORMATS = [
  { id: 'mp4', label: 'MP4 · H.264', ext: 'mp4', maxDim: 2160, needsCodec: true },
  { id: 'webm', label: 'WebM · VP9', ext: 'webm', maxDim: 2160, needsCodec: true },
  { id: 'gif', label: 'GIF', ext: 'gif', maxDim: 540, maxFrames: 150, alpha: true },
  { id: 'png', label: 'PNG sequence (zip)', ext: 'zip', maxDim: 720, maxFrames: 240, alpha: true },
];

export const ASPECTS = [
  { id: 'source', label: 'Source', w: 0, h: 0 },
  { id: '9:16', label: '9:16', w: 9, h: 16 },
  { id: '1:1', label: '1:1', w: 1, h: 1 },
  { id: '4:5', label: '4:5', w: 4, h: 5 },
  { id: '16:9', label: '16:9', w: 16, h: 9 },
];

export const OPTIMISERS = [
  { id: 'off', label: 'Off — best quality', bitrate: 1, keyFrame: 2, maxDim: 0, gifColors: 256, gifDelta: 0 },
  { id: 'web', label: 'Web — small file', bitrate: 0.45, keyFrame: 6, maxDim: 0, gifColors: 128, gifDelta: 6 },
  { id: 'tiny', label: 'Tiny — chat & email', bitrate: 0.16, keyFrame: 10, maxDim: 480, gifColors: 48, gifDelta: 14 },
  { id: 'target', label: 'Target file size…', bitrate: 0.5, keyFrame: 8, maxDim: 480, gifColors: 96, gifDelta: 10 },
];

export function findOptimiser(id) {
  return OPTIMISERS.find(o => o.id === id) || OPTIMISERS[0];
}

export function bitrateFor(w, h, fps, quality) {
  return Math.round(clamp(w * h * fps * 0.13 * quality, 8e4, 40e6));
}

export function frameCount(fps, cycles, cycleSeconds, per = 1) {
  return Math.max(2, Math.round(cycles * cycleSeconds * fps * per));
}

function fitTransform(sw, sh, dw, dh, fit) {
  const s = fit === 'cover' ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh);
  return { s, ox: (dw - sw * s) / 2, oy: (dh - sh * s) / 2 };
}

function sampleBilinear(src, w, h, x, y, out) {
  const wm = w - 1, hm = h - 1;
  let x0 = Math.floor(x), y0 = Math.floor(y);
  let ax = x - x0, ay = y - y0;
  if (x0 < 0) { x0 = 0; ax = 0; } else if (x0 > wm) { x0 = wm; ax = 0; }
  if (y0 < 0) { y0 = 0; ay = 0; } else if (y0 > hm) { y0 = hm; ay = 0; }
  const x1 = x0 < wm ? x0 + 1 : x0, y1 = y0 < hm ? y0 + 1 : y0;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
  out[0] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
  out[1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
  out[2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
  out[3] = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
}

export function buildFrameSource(src, sw, sh, dw, dh, opts = {}) {
  const fit = opts.fit || 'contain';
  const { s, ox, oy } = fitTransform(sw, sh, dw, dh, fit);
  const rgba = new Uint8ClampedArray(dw * dh * 4);
  const tmp = new Float64Array(4);
    const lowW = Math.max(8, Math.min(48, sw)), lowH = Math.max(8, Math.min(48, sh));
  const low = downsampleRGBA(src, sw, sh, lowW, lowH);
  const lowBlur = boxBlur2D(low, lowW, lowH, 1);
  const cover = fitTransform(sw, sh, dw, dh, 'cover');
  const padColor = opts.padColor || [12, 14, 20];
  const useBlur = opts.pad !== 'color';
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const o = (y * dw + x) * 4;
      const u = (x + 0.5 - ox) / s, v = (y + 0.5 - oy) / s;
      if (u >= 0 && v >= 0 && u < sw && v < sh) {
        sampleBilinear(src, sw, sh, u - 0.5, v - 0.5, tmp);
        rgba[o] = tmp[0]; rgba[o + 1] = tmp[1]; rgba[o + 2] = tmp[2]; rgba[o + 3] = 255;
      } else if (useBlur) {
        const bu = (x + 0.5 - cover.ox) / cover.s, bv = (y + 0.5 - cover.oy) / cover.s;
        sampleBilinear(lowBlur, lowW, lowH, clamp(bu - 0.5, 0, lowW - 1), clamp(bv - 0.5, 0, lowH - 1), tmp);
        rgba[o] = tmp[0]; rgba[o + 1] = tmp[1]; rgba[o + 2] = tmp[2]; rgba[o + 3] = 255;
      } else {
        rgba[o] = padColor[0]; rgba[o + 1] = padColor[1]; rgba[o + 2] = padColor[2]; rgba[o + 3] = 255;
      }
    }
  }
  return { rgba, w: dw, h: dh, transform: { s, ox, oy } };
}

function boxBlur2D(rgba, w, h, r) {
  const n = w * h;
  const out = new Uint8ClampedArray(n * 4);
  for (let c = 0; c < 3; c++) {
    const src = new Float32Array(n);
    for (let i = 0; i < n; i++) src[i] = rgba[i * 4 + c];
    const b = boxBlur(src, w, h, r);
    for (let i = 0; i < n; i++) out[i * 4 + c] = b[i];
  }
  for (let i = 0; i < n; i++) out[i * 4 + 3] = 255;
  return out;
}

export function resampleMask(mask, sw, sh, dw, dh, transform) {
  const { s, ox, oy } = transform;
  const sy = transform.sy || s;
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const v = (y + 0.5 - oy) / sy;
    if (v < 0 || v >= sh) continue;
    const y0 = clamp(Math.round(v - 0.5), 0, sh - 1);
    for (let x = 0; x < dw; x++) {
      const u = (x + 0.5 - ox) / s;
      if (u < 0 || u >= sw) continue;
      const x0 = clamp(Math.round(u - 0.5), 0, sw - 1);
      out[y * dw + x] = mask[y0 * sw + x0];
    }
  }
  return out;
}

export function resampleField(src, sw, sh, dw, dh, transform) {
  const { s, ox, oy } = transform;
  const sy = transform.sy || s;
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const v = (y + 0.5 - oy) / sy;
    if (v < 0 || v > sh) continue;
    const y0 = clamp(Math.floor(v - 0.5), 0, sh - 1);
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = clamp01(v - 0.5 - y0);
    for (let x = 0; x < dw; x++) {
      const u = (x + 0.5 - ox) / s;
      if (u < 0 || u >= sw) continue;
      const x0 = clamp(Math.floor(u - 0.5), 0, sw - 1);
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = clamp01(u - 0.5 - x0);
      const a = src[y0 * sw + x0], b = src[y0 * sw + x1];
      const c = src[y1 * sw + x0], d = src[y1 * sw + x1];
      out[y * dw + x] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
  }
  return out;
}

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

export function exportPlan(opts) {
  const fps = opts.fps;
  const cycleSeconds = opts.cycleSeconds;
  const speed = clamp(opts.speed == null ? 1 : opts.speed, MIN_SPEED, MAX_SPEED);
  const fmt = FORMATS.find(f => f.id === opts.format) || FORMATS[0];
  const per = opts.boomerang ? 2 : 1;
  let cycles = Math.max(1, opts.cycles);
  let frames = Math.max(2, Math.round(frameCount(fps, cycles, cycleSeconds, per) / speed));
  let capped = false;
  let truncated = false;
  if (fmt.maxFrames && frames > fmt.maxFrames) {
    const whole = Math.max(1, Math.floor((fmt.maxFrames * speed) / (cycleSeconds * fps * per) + 1e-9));
    if (whole < cycles) {
      cycles = whole;
      capped = true;
      frames = Math.max(2, Math.round(frameCount(fps, cycles, cycleSeconds, per) / speed));
    }
    if (frames > fmt.maxFrames) {
      frames = fmt.maxFrames;
      truncated = true;
    }
  }
  return {
    fps, speed, cycles, cycleSeconds, boomerang: per === 2, phaseCycles: cycles * per,
    frames, capped, truncated, format: fmt, seconds: frames / fps,
  };
}

export function targetSize(srcW, srcH, aspect, maxDim) {
  let w, h;
  if (!aspect || aspect === 'source') { w = srcW; h = srcH; }
  else {
    const [aw, ah] = aspect.split(':').map(Number);
    const ar = aw / ah, srcAr = srcW / srcH;
    if (srcAr > ar) { w = maxDim; h = Math.round(maxDim / ar); }
    else { h = maxDim; w = Math.round(maxDim * ar); }
  }
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.max(2, Math.round(w * scale / 2) * 2);
  h = Math.max(2, Math.round(h * scale / 2) * 2);
  return { w, h };
}

export async function encodeFrames(job) {
  const {
    fullSrc, mask, masks, settings, plan, canvas, watermark, transparent, pad, depth,
    onProgress = () => {}, onPass = null, isCancelled = () => false, allowRecorder = false,
  } = job;
      const maskList = Array.isArray(masks) && masks.length ? masks : (mask && mask.data ? [mask] : []);

  const fmt = plan.format;
  const aspect = job.aspect;
  const fps = plan.fps;
  const userMaxDim = Math.min(job.maxDim || 1080, fmt.maxDim);
        const opt = Object.assign({}, findOptimiser(job.optimise && job.optimise.id), job.optimise || {});
  const targetBytes = opt.targetBytes > 0 ? opt.targetBytes : 0;
  const useWebCodecs = typeof VideoEncoder !== 'undefined' && !job.forceRecorder && !job.noMediaLib;
        const STALL_MS = 45000;
  let lastProgressAt = Date.now();

          const renderPass = async (dim, brScale, tag) => {
                const maxDim = Math.max(32, Math.min(userMaxDim, dim));
    const size = targetSize(fullSrc.w, fullSrc.h, aspect, maxDim);
    const fw = size.w, fh = size.h;
                const cnv = newCanvasLike(canvas, fw, fh);
    const report = (p, label) => { lastProgressAt = Date.now(); onProgress(p, label); };

    report(0, tag + 'preparing');
    const frameSrc = buildFrameSource(fullSrc.data, fullSrc.w, fullSrc.h, fw, fh, { fit: job.fit, pad, padColor: job.padColor });
    const tx = frameSrc.transform;
                const gridTx = (gw, gh) => ({
      s: tx.s * fullSrc.w / gw,
      sy: tx.s * fullSrc.h / gh,
      ox: tx.ox,
      oy: tx.oy,
    });

    const eng = new MotionEngine();
    eng.setSource(frameSrc.rgba, fw, fh);
        for (let i = 0; i < Math.max(1, maskList.length); i++) {
      if (i > 0) eng.addMask();
      const src = maskList[Math.min(i, maskList.length - 1)];
      if (!src || !src.data) continue;
      eng.setMask(resampleMask(src.data, src.w, src.h, fw, fh, gridTx(src.w, src.h)), i);
    }
    const spawnList = Array.isArray(job.spawnMasks) ? job.spawnMasks : [];
    for (let i = 0; i < spawnList.length; i++) {
      const src = spawnList[i];
      if (!src || !src.data) continue;
      eng.setPMask(resampleMask(src.data, src.w, src.h, fw, fh, gridTx(src.w, src.h)), i);
    }
    eng.selectMask(0);
                if (depth && depth.data && depth.data.length && settings.depthSource === 'model') {
      eng.setDepthModel(resampleField(depth.data, depth.w, depth.h, fw, fh, gridTx(depth.w, depth.h)));
    }
        eng.analyze(settings.autoSens);

    const cycles = plan.phaseCycles || plan.cycles;
    const frames = plan.frames;
    const dPhase = (cycles * TWO_PI) / frames;

    const drawFrame = i => {
      const phase = i * dPhase;
      const ampMul = 1;
      eng.render(phase, settings, { ampMul });
      return eng.out;
    };

    let ctx2d = null;
    const ctx = () => (ctx2d || (ctx2d = cnv.getContext('2d', { willReadFrequently: true })));

    const putToCanvas = (rgba) => {
      const g = ctx();
      const img = g.createImageData(fw, fh);
      if (transparent && eng.subject.length === rgba.length / 4) {
        const d = img.data;
        for (let p = 0, q = 0, s = 0; p < d.length; p += 4, q += 4, s++) {
          d[p] = rgba[q]; d[p + 1] = rgba[q + 1]; d[p + 2] = rgba[q + 2];
          d[p + 3] = Math.round(255 * clamp01(eng.subject[s] * 1.25));
        }
      } else {
        img.data.set(rgba);
      }
      g.putImageData(img, 0, 0);
      if (watermark && watermark.on && watermark.text) {
        g.save();
        g.globalAlpha = watermark.opacity == null ? 0.55 : watermark.opacity;
        g.font = `${Math.max(11, Math.round(fh * 0.028))}px system-ui, sans-serif`;
        g.textAlign = 'right';
        g.textBaseline = 'bottom';
        g.fillStyle = '#fff';
        g.shadowColor = 'rgba(0,0,0,.55)';
        g.shadowBlur = 6;
        g.fillText(watermark.text, fw - Math.round(fw * 0.03), fh - Math.round(fh * 0.028));
        g.restore();
      }
    };

    if (fmt.id === 'gif') {
                  const gifenc = await import('https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js');
      const { GIFEncoder, quantize, applyPalette } = gifenc;
                                    const colors = Math.round(clamp(opt.gifColors || 256, 8, 256));
      const deltaOn = opt.gifDelta > 0;
            const samples = [];
      const pick = 6;
      for (let k = 0; k < pick; k++) {
        const i = Math.floor(k * frames / pick);
        if (isCancelled()) return null;
        putToCanvas(drawFrame(i));
        const d = ctx().getImageData(0, 0, fw, fh).data;
        samples.push(new Uint8ClampedArray(d));
      }
      let palette = null, transparentIndex = -1;
      {
        const total = fw * fh * pick;
        const all = new Uint8ClampedArray(total * 4);
        let o = 0;
        for (const s of samples) { all.set(s, o); o += s.length; }
        palette = quantize(all, Math.max(2, colors - (deltaOn ? 1 : 0)), { format: 'rgba4444' });
        for (let i = 0; i < palette.length; i++) if (palette[i][3] < 128) { transparentIndex = i; break; }
                if (deltaOn && transparentIndex < 0) { palette.push([0, 0, 0, 0]); transparentIndex = palette.length - 1; }
      }
      const enc = GIFEncoder();
      const delay = Math.max(20, Math.round(1000 / plan.fps));
      const thresh = opt.gifDelta;
      let prev = null;
      for (let i = 0; i < frames; i++) {
        if (isCancelled()) return null;
        putToCanvas(drawFrame(i));
        const raw = new Uint8ClampedArray(ctx().getImageData(0, 0, fw, fh).data);
        let d = raw;
        if (deltaOn) {
          if (prev) {
            d = new Uint8ClampedArray(raw);
            for (let q = 0; q < d.length; q += 4) {
              if (Math.abs(d[q] - prev[q]) <= thresh && Math.abs(d[q + 1] - prev[q + 1]) <= thresh &&
                  Math.abs(d[q + 2] - prev[q + 2]) <= thresh && Math.abs(d[q + 3] - prev[q + 3]) <= thresh) {
                d[q] = 0; d[q + 1] = 0; d[q + 2] = 0; d[q + 3] = 0;
              }
            }
          }
          prev = raw;
        }
        const index = applyPalette(d, palette, 'rgba4444');
        const frameOpts = { palette, delay };
        if (transparentIndex >= 0) {
          frameOpts.transparent = true;
          frameOpts.transparentIndex = transparentIndex;
                    frameOpts.dispose = deltaOn ? 1 : 2;
        }
        enc.writeFrame(index, fw, fh, frameOpts);
        report((i + 1) / frames, `${tag}frame ${i + 1}/${frames}`);
        if ((i & 7) === 0) await tick();
      }
      enc.finish();
      const blob = new Blob([enc.bytesView()], { type: 'image/gif' });
      return { blob, bytes: blob.size };
    }

    if (fmt.id === 'png') {
      const files = [];
      const pad0 = String(frames).length;
      for (let i = 0; i < frames; i++) {
        if (isCancelled()) return null;
        putToCanvas(drawFrame(i));
        const blob = await canvasToBlob(cnv, 'image/png', job.quality || 1);
        files.push({ name: `frame-${String(i).padStart(pad0, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
        report((i + 1) / frames, `${tag}frame ${i + 1}/${frames}`);
        if ((i & 7) === 0) await tick();
      }
      const blob = new Blob([await writeZip(files, { compress: false })], { type: 'application/zip' });
      return { blob, bytes: blob.size };
    }

                const bitrate = Math.round(bitrateFor(fw, fh, fps, job.quality || 1) * opt.bitrate * brScale);
    if (useWebCodecs) {
      const mb = await import('https://esm.sh/mediabunny@1.56.3');
      const isMp4 = fmt.id === 'mp4';
      const format = isMp4 ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat();
      const output = new mb.Output({ format, target: new mb.BufferTarget() });
      const source = new mb.CanvasSource(cnv, {
        codec: isMp4 ? 'avc' : 'vp9',
        quality: new mb.Quality({ bitrate }),
                        keyFrameInterval: opt.keyFrame,
      });
      output.addVideoTrack(source, { frameRate: fps });
      await output.start();
      const dur = 1 / fps;
      for (let i = 0; i < frames; i++) {
        if (isCancelled()) { await output.cancel(); return null; }
        putToCanvas(drawFrame(i));
        await source.add(i / fps, dur);
        report((i + 1) / frames, `${tag}frame ${i + 1}/${frames}`);
        if ((i & 3) === 0) await tick();
      }
      await output.finalize();
      const blob = new Blob([output.target.buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' });
      return { blob, bytes: blob.size };
    }

    if (!allowRecorder) throw new Error('WebCodecs is unavailable in this environment');
    const mimes = fmt.id === 'mp4'
      ? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = mimes.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } });
    if (!mime) throw new Error('No supported recorder format');
    const capture = cnv.captureStream(0);
    const track = capture.getVideoTracks()[0];
    if (!track) throw new Error('canvas capture is unavailable');
    const rec = new MediaRecorder(capture, { mimeType: mime, videoBitsPerSecond: bitrate });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(res => { rec.onstop = res; });
    rec.start();
    const t0 = performance.now();
    const nextTick = () => (typeof requestAnimationFrame === 'function'
      ? new Promise(r => requestAnimationFrame(() => r()))
      : new Promise(r => setTimeout(r, 4)));
    const endBy = frames / fps + 0.25;
    let drawn = -1;
    for (let guard = 0; guard <= (frames + Math.ceil(0.25 * fps) + 4) * 60; guard++) {
      if (isCancelled()) break;
      const seconds = (performance.now() - t0) / 1000;
      if (seconds >= endBy) break;
      const want = Math.min(frames - 1, Math.floor(seconds * fps));
      if (want !== drawn) {
        putToCanvas(drawFrame(want));
        if (track.requestFrame) track.requestFrame();
        drawn = want;
        report(Math.min(1, (want + 1) / frames), `${tag}frame ${want + 1}/${frames}`);
      } else if (drawn >= 0 && track.requestFrame) {
        track.requestFrame();
      }
      await nextTick();
    }
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    return { blob, bytes: blob.size };
  };

                    let dim = opt.maxDim ? Math.min(userMaxDim, opt.maxDim) : userMaxDim;
  let brScale = 1;
  let blind = false;
  let usedDims = false;
  let prevBytes = 0, prevScale = 1;
  const dims = [];
      const canIterate = !!targetBytes && (useWebCodecs || fmt.id === 'gif' || fmt.id === 'png');
  const passes = canIterate ? 3 : 1;
  let blob = null;
  for (let pass = 0; pass < passes; pass++) {
    if (isCancelled()) return null;
    lastProgressAt = Date.now();
    const tag = passes > 1 ? `pass ${pass + 1}/${passes} · ` : '';
        let watchdog = 0;
    const stall = new Promise((_, reject) => {
      watchdog = setInterval(() => {
        if (Date.now() - lastProgressAt > STALL_MS) {
          clearInterval(watchdog);
          reject(new Error('the encoder stopped responding — try a smaller size or the other format'));
        }
      }, 1000);
    });
    let r = null;
    try {
      r = await Promise.race([renderPass(dim, brScale, tag), stall]);
    } finally {
      clearInterval(watchdog);
    }
    if (!r) return null;
    blob = r.blob;
            if (typeof onPass === 'function') onPass({ pass: pass + 1, passes, dim, bytes: r.bytes });
    if (!canIterate || pass === passes - 1) break;
    const f = targetBytes / Math.max(1, r.bytes);
    if (f >= 0.97) break;
    if (prevBytes) {
      const asked = prevScale / brScale;
      const got = prevBytes / Math.max(1, r.bytes);
      if (asked > 1.25 && got < 1.12) blind = true;
    }
    prevBytes = r.bytes;
    prevScale = brScale;
    dims.push({ dim, bytes: r.bytes });
                    const margin = fmt.id === 'gif' || fmt.id === 'png' ? 0.72 : 0.8;
    const goal = (pass === passes - 2 ? targetBytes * margin : targetBytes) / Math.max(1, r.bytes);
    if ((fmt.id === 'mp4' || fmt.id === 'webm') && !blind && !usedDims) {
      const next = clamp(brScale * goal, 0.03, 4);
      if (next < brScale * 0.98) { brScale = next; continue; }
      blind = true;
    }
                usedDims = true;
    brScale = 1;
                    let exp = fmt.id === 'gif' || fmt.id === 'png' ? 2 : 3;
    for (let i = dims.length - 1; i >= 0; i--) {
      const s = dims[i];
      if (s.dim === dim) continue;
      const e = Math.log(s.bytes / r.bytes) / Math.log(s.dim / dim);
      if (isFinite(e) && e > 1.1 && e < 5) exp = e;
      break;
    }
    const floor = fmt.id === 'gif' || fmt.id === 'png' ? 96 : 160;
    dim = Math.max(floor, Math.round(dim * Math.pow(clamp(goal, 0.02, 1), 1 / exp)));
  }
  return blob;
}

function tick() { return new Promise(r => setTimeout(r, 0)); }

function newCanvasLike(ref, w, h) {
  if (ref && typeof ref.convertToBlob === 'function') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality);
  });
}
