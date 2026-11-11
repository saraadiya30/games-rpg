const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(v) { return [v & 0xff, (v >> 8) & 0xff]; }
function u32(v) { return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]; }

function join(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (err) {
    return null;
  }
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (err) {
    return null;
  }
}

export async function writeZip(files, options = {}) {
  const compress = options.compress !== false;
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const raw = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data));
    let method = 0;
    let body = raw;
    if (compress && raw.length > 128) {
      const def = await deflateRaw(raw);
      if (def && def.length < raw.length) { method = 8; body = def; }
    }
    const name = enc.encode(f.name);
    const crc = crc32(raw);
    const head = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(body.length), u32(raw.length), u16(name.length), u16(0)));
    parts.push(head, name, body);
    const rec = new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(body.length), u32(raw.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset)));
    central.push(rec, name);
    offset += head.length + name.length + body.length;
  }
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cdSize), u32(offset), u16(0)));
  return join(parts.concat(central, [end]));
}

function endOffset(view, length) {
  const lowest = Math.max(0, length - 22 - 65535);
  for (let i = length - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

export async function readZip(bytes, filter) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = endOffset(view, bytes.length);
  if (eocd < 0) throw new Error('that file is not a zip archive');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (/\/$/.test(name)) continue;
    if (filter && !filter(name)) continue;
    const lNameLen = view.getUint16(local + 26, true);
    const lExtraLen = view.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const stored = bytes.subarray(start, start + compSize);
    let data = stored;
    if (method === 8) {
      const inflated = await inflateRaw(stored);
      if (!inflated) throw new Error('“' + name + '” is compressed in a way this browser cannot unpack');
      data = inflated;
    } else if (method !== 0) {
      throw new Error('“' + name + '” uses an unsupported compression method');
    }
    const cut = size && size <= data.length ? size : data.length;
    out.push({ name, data: data.slice(0, cut) });
  }
  return out;
}
