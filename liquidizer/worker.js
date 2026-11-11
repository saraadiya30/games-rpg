import { encodeFrames } from './exporter.js';

let cancelled = false;

self.onmessage = async e => {
  const msg = e.data || {};
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'run') return;
  cancelled = false;
  const canvas = new OffscreenCanvas(16, 16);
  try {
    const blob = await encodeFrames({
      ...msg.job,
      canvas,
      onProgress: (p, label) => self.postMessage({ type: 'progress', p, label }),
      onPass: info => self.postMessage({ type: 'pass', info }),
      isCancelled: () => cancelled,
    });
    if (!blob) { self.postMessage({ type: 'cancelled' }); return; }
    self.postMessage({ type: 'done', blob, filename: msg.job.filename, mime: blob.type });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err), stack: String((err && err.stack) || '') });
  }
};
