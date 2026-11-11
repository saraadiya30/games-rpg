import { computeDepth } from './models.js';

let cancelled = false;

self.onmessage = async e => {
  const msg = e.data || {};
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'depth') return;
  cancelled = false;
  try {
    const res = await computeDepth(msg.pixels, (p, label) => self.postMessage({ type: 'progress', p, label }), () => cancelled);
    if (!res) { self.postMessage({ type: 'cancelled' }); return; }
    self.postMessage({ type: 'done', data: res.data, w: res.w, h: res.h, ms: res.ms, stats: res.stats }, [res.data.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
