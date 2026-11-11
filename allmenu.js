(function () {
  "use strict";
  if (window.__allMenuLoaded) return;
  window.__allMenuLoaded = true;
  function $(id) { return document.getElementById(id); }

  function css() {
    if ($("allMenuCss")) return;
    var s = document.createElement("style");
    s.id = "allMenuCss";
    s.textContent =
      "#i2p-allmenu{position:fixed;inset:0;z-index:95000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,0.62);}" +
      "#i2p-allmenu[hidden]{display:none;}" +
      ".i2p-am-panel{width:min(880px,94vw);max-height:88vh;overflow-y:auto;box-sizing:border-box;background:var(--th-modal,var(--th-surface));border:1px solid var(--th-border);border-radius:16px;box-shadow:0 18px 50px -12px rgba(0,0,0,0.7);padding:0.9rem 1rem 1.1rem;text-align:left;font-family:inherit;color:inherit;}" +
      ".i2p-am-head{display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;}" +
      ".i2p-am-head b{font-size:1.05rem;}" +
      ".i2p-am-head span{font-size:0.72rem;opacity:0.6;flex:1;}" +
      ".i2p-am-x{cursor:pointer;background:transparent;color:inherit;border:1px solid var(--th-border);border-radius:6px;font:inherit;padding:0.1rem 0.5rem;}" +
      ".i2p-am-grp{margin:0.7rem 0 0.35rem;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.1em;opacity:0.5;padding-left:0.35rem;}" +
      ".i2p-am-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.4rem;}" +
      ".i2p-am-item{display:flex;gap:0.55rem;align-items:flex-start;text-align:left;cursor:pointer;font:inherit;font-size:0.85rem;color:inherit;background:var(--th-surface);border:1px solid var(--th-border);border-radius:12px;padding:0.5rem 0.6rem;}" +
      ".i2p-am-item:hover{border-color:var(--th-accent);background:var(--th-accent-soft);}" +
      ".i2p-am-item.i2p-tab-active{background:var(--th-accent);border-color:var(--th-accent);}" +
      ".i2p-am-name{font-weight:700;display:block;}" +
      ".i2p-am-desc{font-size:0.72rem;opacity:0.7;line-height:1.35;display:block;margin-top:0.1rem;}" +
      ".i2p-am-item.i2p-tab-active .i2p-am-desc{opacity:0.9;}" +
      ".i2p-am-note{font-size:0.72rem;opacity:0.65;line-height:1.45;margin:0.35rem 0.15rem 0;}" +
      ".i2p-am-danger{border-color:#b33 !important;}" +
      ".i2p-am-danger:hover{background:rgba(180,50,50,0.25) !important;border-color:#e66 !important;}" +
      ".i2p-am-back{cursor:pointer;background:transparent;color:inherit;border:1px solid var(--th-border);border-radius:8px;font:inherit;font-size:0.8rem;padding:0.25rem 0.6rem;margin-bottom:0.5rem;}" +
      ".i2p-am-sec{margin:0.55rem 0.15rem;}" +
      ".i2p-am-sec h4{margin:0 0 0.25rem;font-size:0.8rem;}" +
      ".i2p-am-sec p,.i2p-am-sec li{font-size:0.78rem;line-height:1.5;opacity:0.85;}" +
      ".i2p-am-sec p{margin:0.2rem 0;}" +
      ".i2p-am-sec ul{margin:0.25rem 0 0;padding-left:1.1rem;}" +
      ".i2p-am-sec li{margin:0.12rem 0;}";
    document.head.appendChild(s);
  }

  function collect() {
    var nav = $("i2p-tabs");
    if (!nav) return [];
    var groups = [];
    var grpEls = nav.querySelectorAll(".i2p-navgrp");
    for (var gi = 0; gi < grpEls.length; gi++) {
      var g = grpEls[gi];
      var lbl = g.querySelector(".i2p-navgrp-lbl");
      var items = [];
      var btns = g.querySelectorAll(".i2p-tab");
      for (var bi = 0; bi < btns.length; bi++) {
        var b = btns[bi];
        if (b.hidden) continue;
        var m = (b.id || "").match(/^i2p-tab-(.+)$/);
        if (!m) continue;
        items.push({ id: m[1], label: (b.textContent || "").trim(), desc: b.title || "" });
      }
      if (items.length) groups.push({ grp: lbl ? (lbl.textContent || "").trim() : "", items: items });
    }
    return groups;
  }

  function overlay() { return $("i2p-allmenu"); }

  function build() {
    if (overlay()) return;
    var ov = document.createElement("div");
    ov.id = "i2p-allmenu";
    ov.hidden = true;
    var panel = document.createElement("div");
    panel.className = "i2p-am-panel";
    var head = document.createElement("div");
    head.className = "i2p-am-head";
    var title = document.createElement("b");
    title.textContent = "☰ All tools";
    var sub = document.createElement("span");
    sub.textContent = "every tab on this site, one menu";
    var x = document.createElement("button");
    x.type = "button";
    x.className = "i2p-am-x";
    x.textContent = "✕";
    x.title = "Close";
    x.addEventListener("click", close);
    head.appendChild(title);
    head.appendChild(sub);
    head.appendChild(x);
    panel.appendChild(head);
    var body = document.createElement("div");
    body.id = "i2p-allmenu-body";
    panel.appendChild(body);
    ov.appendChild(panel);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  function render() {
    var body = $("i2p-allmenu-body");
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);
    var active = window.__activeTab || "home";
    var groups = collect();
    groups.forEach(function (g) {
      if (g.grp) {
        var lbl = document.createElement("div");
        lbl.className = "i2p-am-grp";
        lbl.textContent = g.grp;
        body.appendChild(lbl);
      }
      var grid = document.createElement("div");
      grid.className = "i2p-am-grid";
      g.items.forEach(function (t) {
        var it = document.createElement("button");
        it.type = "button";
        it.className = "i2p-am-item" + (t.id === active ? " i2p-tab-active" : "");
        var tx = document.createElement("span");
        var nm = document.createElement("span");
        nm.className = "i2p-am-name";
        nm.textContent = t.label;
        tx.appendChild(nm);
        if (t.desc) {
          var ds = document.createElement("span");
          ds.className = "i2p-am-desc";
          ds.textContent = t.desc;
          tx.appendChild(ds);
        }
        it.appendChild(tx);
        it.addEventListener("click", function () {
          close();
          if (window.showTab) window.showTab(t.id);
        });
        grid.appendChild(it);
      });
      body.appendChild(grid);
    });
    renderDataSection(body);
  }

  // ---------- site data: download all / import / delete all ----------
  // Everything the site stores lives in localStorage plus one IndexedDB
  // ("keyval-store", the kv-plugin backend). Personal Gallery images are the
  // t2iGalleryItems / t2iGalleryHidden localStorage keys — those are always
  // left alone: exports skip them, imports never overwrite them, delete keeps
  // them while wiping everything else.
  var IMG_KEYS = { t2iGalleryItems: 1, t2iGalleryHidden: 1 };
  function lsAll() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k == null || IMG_KEYS[k]) continue;
        try { out[k] = localStorage.getItem(k); } catch (e) {}
      }
    } catch (e) {}
    return out;
  }
  function idbOpen() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error("no indexedDB")); return; }
      var r;
      try { r = indexedDB.open("keyval-store"); } catch (e) { rej(e); return; }
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error("open failed")); };
    });
  }
  function idbAll(store) {
    return new Promise(function (res, rej) {
      try {
        var tx = store.transaction("keyval", "readonly");
        var st = tx.objectStore("keyval");
        if (st.getAllKeys && st.getAll) {
          Promise.all([new Promise(function (a, b) { var q = st.getAllKeys(); q.onsuccess = function () { a(q.result); }; q.onerror = function () { b(q.error); }; }), new Promise(function (a, b) { var q = st.getAll(); q.onsuccess = function () { a(q.result); }; q.onerror = function () { b(q.error); }; })]).then(function (kv) {
            res({ keys: kv[0], values: kv[1] });
          }, rej);
          return;
        }
        var keys = [], vals = [];
        var cur = st.openCursor();
        cur.onsuccess = function () {
          var c = cur.result;
          if (!c) { res({ keys: keys, values: vals }); return; }
          keys.push(c.key); vals.push(c.value); c.continue();
        };
        cur.onerror = function () { rej(cur.error); };
      } catch (e) { rej(e); }
    });
  }
  function encVal(v) {
    if (v instanceof Uint8Array) return { __typed: "uint8", data: Array.prototype.slice.call(v) };
    if (Object.prototype.toString.call(v) === "[object Uint8ClampedArray]") return { __typed: "uint8clamped", data: Array.prototype.slice.call(v) };
    return v;
  }
  function decVal(v) {
    if (v && typeof v === "object" && !(v instanceof Array)) {
      if (v.__typed === "uint8" && v.data instanceof Array) return new Uint8Array(v.data);
      if (v.__typed === "uint8clamped" && v.data instanceof Array) return new Uint8ClampedArray(v.data);
    }
    return v;
  }
  function download(name, text) {
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} if (a.isConnected) a.remove(); }, 4000);
  }
  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }
  async function exportAll(btn) {
    var orig = btn ? btn.disabled : false;
    if (btn) btn.disabled = true;
    try {
      var idbPairs = [];
      try {
        var db = await idbOpen();
        try {
          var kv = await idbAll(db);
          for (var i = 0; i < kv.keys.length; i++) {
            try { idbPairs.push([String(kv.keys[i]), encVal(kv.values[i])]); }
            catch (e) {}
          }
        } finally { try { db.close(); } catch (e) {} }
      } catch (e) {}
      var payload = {
        app: "perchance-studio-backup", version: 1,
        generator: (window.generatorName || ""),
        exportedAt: new Date().toISOString(),
        localStorage: lsAll(), indexedDB: idbPairs
      };
      var text = JSON.stringify(payload);
      download("site-data-" + stamp() + ".json", text);
      toast("⬇️ backup downloaded (" + Math.round(text.length / 1024) + " KB, gallery images excluded)");
    } catch (e) {
      toast("⚠️ export failed: " + (e && e.message ? e.message : e));
    }
    if (btn) btn.disabled = orig;
  }
  function toast(msg) {
    try {
      if (window.t2iToast) { window.t2iToast(msg); return; }
    } catch (e) {}
    try {
      var t = document.createElement("div");
      t.textContent = msg;
      t.style.cssText = "position:fixed;left:50%;bottom:1.2rem;transform:translateX(-50%);z-index:99999;background:#222;color:#fff;border:1px solid var(--th-border);border-radius:8px;padding:0.5rem 0.9rem;font-size:0.85rem;max-width:90vw;";
      document.body.appendChild(t);
      setTimeout(function () { if (t.isConnected) t.remove(); }, 3500);
    } catch (e) {}
  }
  function confirmDanger(text, okText) {
    try {
      if (typeof window.uiConfirm === "function") return window.uiConfirm(text, { okText: okText || "Delete", danger: true });
    } catch (e) {}
    return Promise.resolve(window.confirm(text));
  }
  function importFile(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var data;
      try { data = JSON.parse(String(rd.result || "")); }
      catch (e) { toast("⚠️ that file isn't valid JSON"); return; }
      if (!data || typeof data !== "object" || (!data.localStorage && !data.indexedDB)) { toast("⚠️ not a site-data backup"); return; }
      var nLs = data.localStorage && typeof data.localStorage === "object" ? Object.keys(data.localStorage).length : 0;
      var nDb = data.indexedDB instanceof Array ? data.indexedDB.length : 0;
      confirmDanger("Import this backup?\n\n" + nLs + " settings entries + " + nDb + " stored items will overwrite what's here now. Gallery images are never touched.\n\nThe page reloads afterwards.", "Import").then(function (ok) {
        if (!ok) return;
        (async function () {
          try {
            var ls = data.localStorage || {};
            Object.keys(ls).forEach(function (k) {
              if (IMG_KEYS[k]) return;
              try { localStorage.setItem(k, String(ls[k])); } catch (e) {}
            });
            if (data.indexedDB instanceof Array && data.indexedDB.length) {
              var db = await idbOpen();
              try {
                await new Promise(function (res, rej) {
                  try {
                    var tx = db.transaction("keyval", "readwrite");
                    var st = tx.objectStore("keyval");
                    data.indexedDB.forEach(function (p) {
                      if (!p || !(p instanceof Array)) return;
                      try { st.put(decVal(p[1]), String(p[0])); } catch (e) {}
                    });
                    tx.oncomplete = function () { res(); };
                    tx.onerror = function () { rej(tx.error); };
                  } catch (e) { rej(e); }
                });
              } finally { try { db.close(); } catch (e) {} }
            }
            toast("✅ imported — reloading");
            setTimeout(function () { location.reload(); }, 600);
          } catch (e) {
            toast("⚠️ import failed: " + (e && e.message ? e.message : e));
          }
        })();
      });
    };
    rd.onerror = function () { toast("⚠️ couldn't read that file"); };
    rd.readAsText(file);
  }
  async function deleteAll() {
    var ok = await confirmDanger("Delete ALL site data on this browser?\n\nCharacters, chats, prompts, vault, settings, gallery folders and history — everything except your Personal Gallery images, which are kept.\n\nThis cannot be undone.", "Delete everything");
    if (!ok) return;
    var ok2 = await confirmDanger("Last chance — really erase everything except gallery images?", "Yes, erase it");
    if (!ok2) return;
    try {
      var keep = {};
      Object.keys(IMG_KEYS).forEach(function (k) {
        try { var v = localStorage.getItem(k); if (v != null) keep[k] = v; } catch (e) {}
      });
      try { localStorage.clear(); } catch (e) {}
      Object.keys(keep).forEach(function (k) {
        try { localStorage.setItem(k, keep[k]); } catch (e) {}
      });
      try { sessionStorage.clear(); } catch (e) {}
      try {
        var db = await idbOpen();
        try {
          await new Promise(function (res, rej) {
            try {
              var tx = db.transaction("keyval", "readwrite");
              var st = tx.objectStore("keyval");
              if (st.clear) { var q = st.clear(); q.onsuccess = function () { res(); }; q.onerror = function () { rej(q.error); }; }
              else res();
            } catch (e) { rej(e); }
          });
        } finally { try { db.close(); } catch (e) {} }
      } catch (e) {}
      toast("🗑️ wiped — reloading");
      setTimeout(function () { location.reload(); }, 600);
    } catch (e) {
      toast("⚠️ delete failed: " + (e && e.message ? e.message : e));
    }
  }
  function isMobileMenu() {
    try { if (document.body && document.body.classList.contains("is-android-mobile")) return true; } catch (e) {}
    try { if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) return true; } catch (e) {}
    return false;
  }
  function dataButtons(grid) {
    function btn(ico, name, desc, danger, onClick) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "i2p-am-item" + (danger ? " i2p-am-danger" : "");
      var tx = document.createElement("span");
      var nm = document.createElement("span");
      nm.className = "i2p-am-name";
      nm.textContent = ico + " " + name;
      tx.appendChild(nm);
      var ds = document.createElement("span");
      ds.className = "i2p-am-desc";
      ds.textContent = desc;
      tx.appendChild(ds);
      b.appendChild(tx);
      b.addEventListener("click", onClick);
      grid.appendChild(b);
      return b;
    }
    btn("⬇️", "Download all data", "One .json backup of everything saved here — except gallery images.", false, function () { exportAll(this); });
    var file = document.createElement("input");
    file.type = "file";
    file.accept = ".json,application/json";
    file.hidden = true;
    file.addEventListener("change", function () {
      if (file.files && file.files[0]) importFile(file.files[0]);
      file.value = "";
    });
    btn("⬆️", "Import data", "Restore a backup .json — old data works again after a reload.", false, function () { file.click(); });
    btn("🗑️", "Delete all data", "Erase everything on this browser except gallery images. Asks twice.", true, function () { deleteAll(); });
    return file;
  }
  function dataExplainer(body) {
    function sec(title, lines) {
      var d = document.createElement("div");
      d.className = "i2p-am-sec";
      var h = document.createElement("h4");
      h.textContent = title;
      d.appendChild(h);
      lines.forEach(function (ln) {
        if (ln.charAt(0) === "•") {
          var ul = d.querySelector("ul");
          if (!ul) { ul = document.createElement("ul"); d.appendChild(ul); }
          var li = document.createElement("li");
          li.textContent = ln.slice(1).trim();
          ul.appendChild(li);
        } else {
          var p = document.createElement("p");
          p.textContent = ln;
          d.appendChild(p);
        }
      });
      body.appendChild(d);
    }
    sec("What is stored on this site", [
      "• Settings and preferences — theme, layout, toggles and per-tool options.",
      "• Your stuff — characters, personas, chats, prompts, vault items, roster entries and gallery folders.",
      "• History and progress — recent work, explorer progress and counts shown on Home.",
      "• Personal Gallery images themselves are kept separately and are never included in backups — they always stay put."
    ]);
    sec("How saving works", [
      "Everything saves automatically in this browser only — there is no account and nothing is sent to a server. It stays until you clear browser data or delete it below.",
      "• Small text (settings, names, options) lives in localStorage.",
      "• Larger data (chats, vault, history) lives in the IndexedDB store used by the save plugin.",
      "• A backup file is a dated snapshot of both stores (gallery images excluded). Importing it overwrites what is here now, then reloads so every tool picks it up."
    ]);
  }
  function openData() {
    css();
    build();
    var body = $("i2p-allmenu-body");
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);
    var back = document.createElement("button");
    back.type = "button";
    back.className = "i2p-am-back";
    back.textContent = "← All tools";
    back.addEventListener("click", render);
    body.appendChild(back);
    var lbl = document.createElement("div");
    lbl.className = "i2p-am-grp";
    lbl.textContent = "💾 Data Stored";
    body.appendChild(lbl);
    dataExplainer(body);
    var grid = document.createElement("div");
    grid.className = "i2p-am-grid";
    body.appendChild(grid);
    var file = dataButtons(grid);
    body.appendChild(file);
    var ov = overlay();
    if (ov) ov.hidden = false;
  }
  function renderDataSection(body) {
    var lbl = document.createElement("div");
    lbl.className = "i2p-am-grp";
    lbl.textContent = "Site data";
    body.appendChild(lbl);
    // Mobile: one "Data Stored" entry that opens the full explainer + tools.
    // Desktop keeps the three direct buttons (already verified behaviour).
    if (isMobileMenu()) {
      var grid = document.createElement("div");
      grid.className = "i2p-am-grid";
      var b = document.createElement("button");
      b.type = "button";
      b.className = "i2p-am-item";
      var tx = document.createElement("span");
      var nm = document.createElement("span");
      nm.className = "i2p-am-name";
      nm.textContent = "💾 Data Stored";
      tx.appendChild(nm);
      var ds = document.createElement("span");
      ds.className = "i2p-am-desc";
      ds.textContent = "What this browser keeps, how saving works, plus backup / restore / delete.";
      tx.appendChild(ds);
      b.appendChild(tx);
      b.addEventListener("click", openData);
      grid.appendChild(b);
      body.appendChild(grid);
      return;
    }
    var grid2 = document.createElement("div");
    grid2.className = "i2p-am-grid";
    body.appendChild(grid2);
    var file = dataButtons(grid2);
    var note = document.createElement("div");
    note.className = "i2p-am-note";
    note.textContent = "Backups hold settings, characters, chats, prompts and history — never the gallery images themselves, which always stay put.";
    body.appendChild(note);
    body.appendChild(file);
  }

  function open() {
    css();
    build();
    render();
    var ov = overlay();
    if (ov) ov.hidden = false;
  }
  function close() {
    var ov = overlay();
    if (ov) ov.hidden = true;
  }
  function toggle() {
    var ov = overlay();
    if (ov && !ov.hidden) close();
    else open();
  }

  function ensureButton() {
    if ($("i2p-menu-btn")) return;
    var hub = $("i2p-hubbar");
    if (!hub) return;
    var b = document.createElement("button");
    b.id = "i2p-menu-btn";
    b.type = "button";
    b.className = "i2p-hubbtn";
    b.title = "All tools — every tab on one fullscreen menu";
    var ico = document.createElement("span");
    ico.className = "i2p-hubico";
    ico.textContent = "☰";
    var lbl = document.createElement("span");
    lbl.className = "i2p-hublbl";
    lbl.textContent = "Menu";
    b.appendChild(ico);
    b.appendChild(lbl);
    b.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    hub.insertBefore(b, hub.firstChild);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });

  ensureButton();
  setTimeout(ensureButton, 0);

  window.__allMenu = { open: open, close: close, toggle: toggle, openData: openData };
})();
