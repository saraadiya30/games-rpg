(function () {
  "use strict";

  var CHUNK = 4096;
  var sizes = null;
  var sizePromise = null;
  var badFiles = {};

  function healthy(files) {
    var ok = [];
    for (var i = 0; i < files.length; i++) {
      if (!badFiles[files[i]] || Date.now() - badFiles[files[i]] > 600000) ok.push(files[i]);
    }
    return ok.length ? ok : files.slice();
  }

  function markBad(url) { badFiles[url] = Date.now(); }

  var RARITY = { FC: "Common", FU: "Uncommon", FR: "Rare", LC: "Common", LU: "Uncommon", LR: "Rare" };

  var FALLBACK_FIRST = ["Aiden", "Mira", "Kael", "Sera", "Dorian", "Lyra", "Rowan", "Isolde", "Corvin", "Elif", "Tam", "Odette", "Rurik", "Sable", "Ember", "Caspian", "Wren", "Alder", "Yuki", "Bram"];
  var FALLBACK_LAST = ["Ashford", "Blackwood", "Crowley", "Dunmore", "Ellery", "Fairfax", "Grimshaw", "Halloway", "Ironbrow", "Kestrel", "Lockhart", "Marlowe", "Nightingale", "Osric", "Pryce", "Quill", "Ravensworth", "Storm", "Thistlebrow", "Vane"];

  function kv() {
    try { return window.root && window.root.kv ? window.root.kv.t2iNameRoller : null; } catch (e) { return null; }
  }

  function sf() {
    try { return window.root && window.root.superFetch ? window.root.superFetch : null; } catch (e) { return null; }
  }

  async function probe(url, pos) {
    var r = await sf()(url, { headers: { Range: "bytes=" + pos + "-" + pos } });
    try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) {}
    return r.status;
  }

  async function measure(url) {
    async function pastEof(pos) {
      var st = await probe(url, pos);
      if (st === 416 || st === 200) return true;
      if (st === 206) return false;
      throw new Error("probe status " + st);
    }
    var lo = 0, hi = 1024;
    for (;;) {
      var past;
      try { past = await pastEof(hi); } catch (e) { throw new Error("probe failed"); }
      if (past) break;
      lo = hi + 1;
      hi *= 2;
      if (hi > 1073741824) throw new Error("file too big");
    }
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      var p;
      try { p = await pastEof(mid); } catch (e) { throw new Error("probe failed"); }
      if (p) hi = mid;
      else lo = mid + 1;
    }
    try { if (!(await pastEof(lo))) return lo + 1; } catch (e) {}
    return lo;
  }

  async function ensureSizes(progress) {
    if (sizes) return sizes;
    if (sizePromise) return sizePromise;
    sizePromise = (async function () {
      var store = kv();
      var urls = [];
      var pools = window.NAME_DATA.files;
      for (var k in pools) for (var i = 0; i < pools[k].length; i++) urls.push(pools[k][i]);
      sizes = {};
      var missing = [];
      try {
        if (store) {
          var cached = await store.get("sizes");
          if (cached && typeof cached === "object") {
            for (var u = 0; u < urls.length; u++) {
              if (cached[urls[u]] > 0) sizes[urls[u]] = cached[urls[u]];
              else missing.push(urls[u]);
            }
          } else missing = urls.slice();
        } else missing = urls.slice();
      } catch (e) { missing = urls.slice(); }
      if (missing.length) {
        var done = 0;
        await Promise.all(missing.map(function (u) {
          return measure(u).then(function (n) {
            sizes[u] = n;
            done++;
            if (progress) try { progress(done, missing.length); } catch (e) {}
          });
        }));
        try { if (store) await store.set("sizes", sizes); } catch (e) {}
      }
      return sizes;
    })();
    try { return await sizePromise; }
    catch (e) { sizePromise = null; throw e; }
  }

  function validName(s) {
    s = String(s || "").trim();
    if (s.length < 1 || s.length > 40) return null;
    if (/[\d_#@<>]/.test(s)) return null;
    return s;
  }

  async function sample(pool) {
    var files = healthy(window.NAME_DATA.files[pool]);
    var total = 0, i;
    for (i = 0; i < files.length; i++) total += sizes[files[i]] || 0;
    if (!total) { files = window.NAME_DATA.files[pool]; for (i = 0; i < files.length; i++) total += sizes[files[i]] || 0; }
    if (!total) throw new Error("no sizes");
    var pick = Math.random() * total, url = files[0];
    for (i = 0; i < files.length; i++) { pick -= sizes[files[i]]; if (pick <= 0) { url = files[i]; break; } }
    var size = sizes[url];
    for (var attempt = 0; attempt < 6; attempt++) {
      var off = Math.floor(Math.random() * Math.max(1, size - CHUNK));
      var r;
      try {
        r = await sf()(url, { headers: { Range: "bytes=" + off + "-" + (off + CHUNK - 1) } });
      } catch (e) { markBad(url); continue; }
      if (r.status !== 206 && r.status !== 200) { markBad(url); continue; }
      try {
        var cl = r.headers.get("content-length");
        if (cl && Number(cl) > 65536) { try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) {} continue; }
      } catch (e) {}
      var text = await r.text();
      if (!text) { markBad(url); continue; }
      var lines = String(text).split(/\r?\n/);
      lines.shift();
      if (off + CHUNK < size) lines.pop();
      var clean = [];
      for (i = 0; i < lines.length; i++) { var v = validName(lines[i]); if (v) clean.push(v); }
      if (clean.length) return clean[Math.floor(Math.random() * clean.length)];
    }
    throw new Error("empty chunk");
  }

  function pickPattern() {
    var ps = window.NAME_DATA.patterns, total = 0, i;
    for (i = 0; i < ps.length; i++) total += ps[i].w;
    var r = Math.random() * total;
    for (i = 0; i < ps.length; i++) { r -= ps[i].w; if (r <= 0) return ps[i]; }
    return ps[ps.length - 1];
  }

  function fallbackName() {
    var f = FALLBACK_FIRST[Math.floor(Math.random() * FALLBACK_FIRST.length)];
    var l = FALLBACK_LAST[Math.floor(Math.random() * FALLBACK_LAST.length)];
    return { name: f + " " + l, detail: "offline sample", offline: true };
  }

  async function rollName(progress) {
    if (!window.NAME_DATA || !sf()) return fallbackName();
    try {
      await ensureSizes(progress);
      var p = pickPattern();
      var parts = await Promise.all([sample(p.f)].concat(p.lasts.map(function (pool) { return sample(pool); })));
      var name = parts[0] + " " + parts.slice(1).join(p.sep);
      var rar = RARITY[p.f] || "?";
      var lrar = p.lasts.map(function (x) { return RARITY[x] || "?"; }).join(p.sep === "-" ? " + " : ", ");
      return { name: name, detail: "First: " + rar + " · Last: " + lrar, offline: false };
    } catch (e) {
      return fallbackName();
    }
  }

  function addRerollButton(input, opts) {
    opts = opts || {};
    if (!input || input.__nameReroll) return input ? input.__nameReroll : null;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = opts.cls || "pro-btn pro-btn-ghost";
    btn.textContent = "🎲";
    btn.title = opts.title || "Roll a random name (The Ultimate Random Name Generator)";
    btn.style.flexShrink = "0";
    var busy = false;
    btn.addEventListener("click", async function () {
      if (busy) return;
      busy = true;
      var orig = btn.textContent;
      var stopped = false;
      btn.textContent = "⏳";
      btn.disabled = true;
      var tick = 0;
      var dots = setInterval(function () { tick++; try { btn.textContent = "⏳"; } catch (e) {} }, 400);
      try {
        var res = await rollName(function (done, total) {
          try { btn.title = "Loading name lists… " + done + "/" + total; } catch (e) {}
        });
        clearInterval(dots);
        input.value = res.name;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        btn.title = res.name + " — " + res.detail + ". Click to reroll!";
      } catch (e) {
        clearInterval(dots);
        btn.title = "Name roll failed — click to try again";
      }
      btn.textContent = orig;
      btn.disabled = false;
      busy = false;
    });
    input.__nameReroll = btn;
    if (opts.insert !== false) {
      try {
        input.style.flex = "1";
        input.style.minWidth = "0";
        var wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.gap = "0.4rem";
        wrap.style.alignItems = "center";
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        wrap.appendChild(btn);
      } catch (e) {
        try { input.parentNode.insertBefore(btn, input.nextSibling); } catch (e2) {}
      }
    }
    return btn;
  }

  window.NameRoller = {
    rollName: rollName,
    ensureReady: function (progress) {
      if (!window.NAME_DATA || !sf()) return Promise.resolve(null);
      return ensureSizes(progress).catch(function () { return null; });
    },
    addRerollButton: addRerollButton
  };
})();
