/* ============================================================================
   src/vault.js — the shared hub for the whole site.
   Built for the "one pipeline" features: a cross-tab PROMPT VAULT, a universal
   "Send to ▸" bridge, a ⌘K command palette, portable RECIPE links, full
   EXPORT/IMPORT backup, and a CHARACTER roster for consistency.

   Exposed globals:
     window.Vault        — { init, add, addImage, list, remove, update, open, pick, count }
     window.Characters   — { add, list, remove, setAvatar, open, generateScene, captureFromImage }
     window.PromptBridge — { sendTo, menuButton, destinations, applyTo }
     window.Recipe       — { encode, decode, shareUrl, copy, current, apply, offer }
     window.SiteBackup   — { exportAll, importFromFile, importFromObject }
     window.CommandPalette — { open, close }

   Loaded lazily via ensureVault() in index.html (see README "Performance
   architecture"). Everything here is idempotent and self-bootstrapping.
   ========================================================================== */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nowTag() { return new Date().toISOString(); }
  function AVKind(url, hint) {
    try { if (window.AvatarMedia) return window.AvatarMedia.kindOf(url, hint); } catch (e) {}
    if (hint === "video") return "video";
    if (/^data:video\//i.test(String(url || ""))) return "video";
    if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(String(url || ""))) return "video";
    return url ? "image" : "";
  }
  function AVThumb(url, cls, hint, poster) {
    try { if (window.AvatarMedia) return window.AvatarMedia.thumbHtml(url, cls, hint, poster); } catch (e) {}
    if (!url) return '<div class="' + cls + '"></div>';
    if (AVKind(url, hint) === "video") return '<video class="' + cls + '" src="' + esc(url) + '"' + (poster ? ' poster="' + esc(poster) + '"' : "") + ' muted loop playsinline autoplay preload="metadata"></video>';
    return '<img class="' + cls + '" src="' + esc(url) + '" alt="">';
  }
  function copyText(text) {
    var legacy = function () {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(legacy);
    }
    legacy();
    return Promise.resolve();
  }

  /* ---------------------------------------------------------------- styles */
  var CSS = [
    ".vault-btn-inline{border:1px solid var(--th-border,rgba(128,128,128,.4));background:transparent;color:inherit;cursor:pointer;border-radius:6px;padding:.15rem .4rem;font:inherit;font-size:.82em;line-height:1.2;}",
    ".vault-btn-inline:hover{background:var(--th-surface-hover,rgba(255,255,255,.09));}",
    ".vault-overlay{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:1rem;}",
    ".vault-modal{position:relative;width:min(980px,100%);max-height:100%;background:var(--th-modal,#1c1e22);color:inherit;border:1px solid var(--th-border,rgba(128,128,128,.35));border-radius:14px;display:flex;flex-direction:column;overflow:hidden;font-family:var(--th-font);box-shadow:0 24px 70px -20px rgba(0,0,0,.7);}",
    ".vault-head{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;padding:.7rem .9rem;border-bottom:1px solid var(--th-border);}",
    ".vault-head h3{margin:0;font-size:1.05rem;font-weight:800;display:flex;align-items:center;gap:.4rem;}",
    ".vault-spacer{flex-grow:1;}",
    ".vault-tabbtn{border:1px solid var(--th-border);background:transparent;color:inherit;cursor:pointer;border-radius:8px;padding:.28rem .6rem;font-size:.84rem;}",
    ".vault-tabbtn.active{background:var(--th-accent);color:var(--th-accent-text,#fff);border-color:var(--th-accent);}",
    ".vault-toolbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;padding:.55rem .9rem;border-bottom:1px solid var(--th-border);}",
    ".vault-search{flex:1;min-width:180px;background:var(--th-field,rgba(0,0,0,.25));color:inherit;border:1px solid var(--th-border);border-radius:9px;padding:.4rem .6rem;font:inherit;}",
    ".vault-chip{border:1px solid var(--th-border);background:transparent;color:inherit;cursor:pointer;border-radius:999px;padding:.15rem .55rem;font-size:.76rem;}",
    ".vault-chip.active{background:var(--th-accent);color:var(--th-accent-text,#fff);border-color:var(--th-accent);}",
    ".vault-body{flex-grow:1;overflow-y:auto;padding:.8rem .9rem;display:flex;flex-direction:column;gap:.6rem;}",
    ".vault-item{border:1px solid var(--th-border);border-radius:11px;padding:.6rem .7rem;display:flex;gap:.7rem;align-items:flex-start;background:var(--th-surface,rgba(255,255,255,.03));}",
    ".vault-thumb{width:84px;height:84px;flex-shrink:0;border-radius:8px;object-fit:cover;background:#000;border:1px solid var(--th-border);}",
    ".vault-item-main{flex-grow:1;min-width:0;display:flex;flex-direction:column;gap:.3rem;}",
    ".vault-text{font-size:.86rem;line-height:1.45;white-space:pre-wrap;word-break:break-word;max-height:6.6rem;overflow-y:auto;cursor:text;}",
    ".vault-meta{font-size:.72rem;opacity:.6;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;}",
    ".vault-tag{font-size:.7rem;border:1px solid var(--th-border);border-radius:999px;padding:.02rem .4rem;opacity:.85;background:transparent;color:inherit;cursor:pointer;}",
    ".vault-item-acts{display:flex;flex-direction:column;gap:.28rem;flex-shrink:0;}",
    ".vault-iconbtn{border:1px solid var(--th-border);background:transparent;color:inherit;cursor:pointer;border-radius:7px;padding:.2rem .45rem;font:inherit;font-size:.9rem;line-height:1.1;}",
    ".vault-iconbtn:hover{background:var(--th-surface-hover,rgba(255,255,255,.09));}",
    ".vault-empty{opacity:.6;font-size:.88rem;text-align:center;padding:1.6rem .5rem;}",
    ".vault-add{display:flex;flex-direction:column;gap:.4rem;}",
    ".vault-add textarea{width:100%;min-height:4.5rem;background:var(--th-field,rgba(0,0,0,.25));color:inherit;border:1px solid var(--th-border);border-radius:9px;padding:.5rem;font:inherit;resize:vertical;}",
    ".vault-add input{background:var(--th-field,rgba(0,0,0,.25));color:inherit;border:1px solid var(--th-border);border-radius:9px;padding:.4rem .6rem;font:inherit;}",
    ".vault-primary{border:1px solid var(--th-accent);background:var(--th-accent);color:var(--th-accent-text,#fff);cursor:pointer;border-radius:9px;padding:.42rem .8rem;font:inherit;font-weight:700;}",
    /* send-to popover */
    ".pbridge-menu{position:fixed;z-index:100002;background:var(--th-modal,#1c1e22);color:inherit;border:1px solid var(--th-border,rgba(128,128,128,.4));border-radius:11px;box-shadow:0 16px 40px -12px rgba(0,0,0,.7);padding:.35rem;display:flex;flex-direction:column;gap:.15rem;min-width:210px;font-family:var(--th-font);}",
    ".pbridge-menu button{text-align:left;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:8px;padding:.4rem .55rem;font:inherit;font-size:.84rem;}",
    ".pbridge-menu button:hover{background:var(--th-surface-hover,rgba(255,255,255,.1));}",
    ".pbridge-menu .sep{height:1px;background:var(--th-border);margin:.2rem .1rem;}",
    ".pbridge-menu .hint{font-size:.7rem;opacity:.55;padding:.1rem .55rem .25rem;}",
    /* command palette */
    ".cpal-overlay{position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding:8vh 1rem 1rem;}",
    ".cpal{width:min(620px,100%);background:var(--th-modal,#1c1e22);color:inherit;border:1px solid var(--th-border,rgba(128,128,128,.4));border-radius:14px;overflow:hidden;font-family:var(--th-font);box-shadow:0 24px 70px -20px rgba(0,0,0,.75);}",
    ".cpal input{width:100%;border:0;border-bottom:1px solid var(--th-border);background:transparent;color:inherit;padding:.85rem 1rem;font:inherit;font-size:1rem;outline:none;}",
    ".cpal-list{max-height:56vh;overflow-y:auto;padding:.35rem;}",
    ".cpal-row{display:flex;align-items:center;gap:.6rem;padding:.5rem .65rem;border-radius:9px;cursor:pointer;font-size:.9rem;}",
    ".cpal-row.sel{background:var(--th-accent);color:var(--th-accent-text,#fff);}",
    ".cpal-row .k{margin-left:auto;font-size:.72rem;opacity:.6;}",
    ".cpal-cat{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;opacity:.5;padding:.5rem .65rem .15rem;}",
    /* recipe banner */
    ".recipe-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:1rem;z-index:100001;background:var(--th-modal,#1c1e22);color:inherit;border:1px solid var(--th-accent);border-radius:12px;padding:.6rem .7rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;box-shadow:0 16px 44px -14px rgba(0,0,0,.7);font-family:var(--th-font);font-size:.85rem;max-width:min(680px,94vw);}",
    ".recipe-banner button{border:1px solid var(--th-border);background:transparent;color:inherit;cursor:pointer;border-radius:8px;padding:.3rem .6rem;font:inherit;}",
    ".recipe-banner .go{border-color:var(--th-accent);background:var(--th-accent);color:var(--th-accent-text,#fff);font-weight:700;}",
    /* toast */
    ".vault-toast{position:fixed;left:50%;bottom:1.2rem;transform:translateX(-50%);z-index:100003;background:rgba(20,20,20,.94);color:#fff;border-radius:10px;padding:.5rem .85rem;font-size:.85rem;font-family:var(--th-font);box-shadow:0 10px 30px -8px rgba(0,0,0,.7);opacity:0;transition:opacity .2s ease;}",
    ".vault-toast.show{opacity:1;}",
    ".vault-gen-grid{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.5rem;}",
    ".vault-gen-grid img{width:130px;height:130px;object-fit:cover;border-radius:8px;border:1px solid var(--th-border);background:#000;}",
    ".vault-row-btn{border:1px solid var(--th-border);background:transparent;color:inherit;cursor:pointer;border-radius:8px;padding:.28rem .55rem;font:inherit;font-size:.82rem;}",
    ".vault-row-btn:hover{background:var(--th-surface-hover,rgba(255,255,255,.09));}"
  ].join("\n");
  function injectStyles() {
    if ($("vaultStyles")) return;
    var s = document.createElement("style");
    s.id = "vaultStyles";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var toastTimer = null;
  function toast(msg) {
    injectStyles();
    var el = $("vaultToast");
    if (!el) { el = document.createElement("div"); el.id = "vaultToast"; el.className = "vault-toast"; document.body.appendChild(el); }
    el.textContent = msg;
    requestAnimationFrame(function () { el.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1900);
  }
  window.vaultToast = toast;

  /* ------------------------------------------------------------- data layer */
  var mem = { items: null, chars: null };
  function folder() {
    var r = window.root;
    return r && r.kv ? r.kv.promptVault : null;
  }
  async function loadKey(key) {
    if (mem[key]) return mem[key];
    var f = folder();
    if (!f) return [];
    try {
      var v = await f.get(key);
      mem[key] = Array.isArray(v) ? v : [];
    } catch (e) { mem[key] = []; }
    return mem[key];
  }
  async function saveKey(key) {
    var f = folder();
    var val = mem[key] || [];
    if (!f) return;
    try { await f.set(key, val); } catch (e) { console.error("vault save failed", e); }
  }
  async function ready() {
    for (var i = 0; i < 40; i++) {
      if (folder()) return true;
      await new Promise(function (r) { setTimeout(r, 150); });
    }
    return false;
  }

  /* ---------------------------------------------------------------- Vault API */
  var LS_TAGS = "vaultRecentTags";
  function recentTags() { try { return JSON.parse(localStorage.getItem(LS_TAGS) || "[]"); } catch (e) { return []; } }
  function pushRecentTag(t) {
    var arr = recentTags().filter(function (x) { return x !== t; });
    arr.unshift(t); arr = arr.slice(0, 12);
    try { localStorage.setItem(LS_TAGS, JSON.stringify(arr)); } catch (e) {}
  }

  var Vault = {
    async list() { return (await loadKey("items")).slice(); },
    async count() { return (await loadKey("items")).length; },
    async add(text, opts) {
      text = String(text == null ? "" : text).trim();
      if (!text) return null;
      await ready();
      var items = await loadKey("items");
      var tags = (opts && opts.tags ? opts.tags : []).map(function (t) { return String(t).trim().toLowerCase(); }).filter(Boolean);
      var existing = items.filter(function (it) { return it.text === text; })[0];
      if (existing) return existing;
      var item = {
        id: uid(), text: text, tags: tags,
        tab: (opts && opts.tab) || (window.__activeTab || ""),
        label: (opts && opts.label) || "",
        thumb: (opts && opts.thumb) || "",
        thumbKind: (opts && (opts.thumbKind || opts.kind)) || AVKind((opts && opts.thumb) || ""),
        thumbPoster: (opts && (opts.thumbPoster || opts.poster)) || "",
        ts: Date.now()
      };
      items.unshift(item);
      while (items.length > 800) items.pop();
      await saveKey("items");
      document.dispatchEvent(new CustomEvent("vault-changed"));
      if (!(opts && opts.silent)) toast("📚 Saved to vault");
      return item;
    },
    async addImage(dataUrl, text, opts) {
      // downscale the image to a compact thumb, then store the prompt + thumb
      return new Promise(async function (resolve) {
        try {
          var thumb = await downscale(dataUrl, 128);
          resolve(Vault.add(text, Object.assign({ thumb: thumb }, opts || {})));
        } catch (e) { resolve(Vault.add(text, opts || {})); }
      });
    },
    async remove(id) {
      var items = await loadKey("items");
      mem.items = items.filter(function (it) { return it.id !== id; });
      await saveKey("items");
      document.dispatchEvent(new CustomEvent("vault-changed"));
    },
    async update(id, patch) {
      var items = await loadKey("items");
      items.forEach(function (it) { if (it.id === id) Object.assign(it, patch); });
      await saveKey("items");
      document.dispatchEvent(new CustomEvent("vault-changed"));
    },
    open: function () { openVault("prompts"); },
    // open a picker: user taps an item, cb(text, item) fires
    pick: function (cb, opts) { openVault("prompts", { pick: cb, title: (opts && opts.title) || "Pick a prompt" }); }
  };
  window.Vault = Vault;

  function downscale(dataUrl, max) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.72));
        } catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /* ------------------------------------------------------- Characters roster */
  var Characters = {
    async list() { return (await loadKey("chars")).slice(); },
    async add(data) {
      await ready();
      var chars = await loadKey("chars");
      var c = {
        id: uid(),
        name: (data.name || "Unnamed").trim(),
        prompt: String(data.prompt || "").trim(),
        negative: String(data.negative || "").trim(),
        seed: (data.seed === 0 || data.seed) ? Number(data.seed) : null,
        shape: data.shape || "512x768",
        thumb: data.thumb || "",
        thumbKind: data.thumbKind || data.kind || AVKind(data.thumb || ""),
        thumbPoster: data.thumbPoster || data.poster || "",
        ts: Date.now()
      };
      if (!c.prompt) { toast("⚠️ no prompt to save"); return null; }
      chars.unshift(c);
      await saveKey("chars");
      document.dispatchEvent(new CustomEvent("vault-changed"));
      toast("🧑 Character saved");
      return c;
    },
    async remove(id) {
      var chars = await loadKey("chars");
      mem.chars = chars.filter(function (c) { return c.id !== id; });
      await saveKey("chars");
      document.dispatchEvent(new CustomEvent("vault-changed"));
    },
    // point an existing character's thumbnail/avatar at a saved image URL
    async setAvatar(id, url, kind, poster) {
      if (!url) return false;
      await ready();
      var chars = await loadKey("chars");
      var c = chars.filter(function (x) { return x.id === id; })[0];
      if (!c) { toast("⚠️ character not found"); return false; }
      c.thumb = url;
      c.thumbKind = kind || AVKind(url);
      c.thumbPoster = poster || "";
      await saveKey("chars");
      document.dispatchEvent(new CustomEvent("vault-changed"));
      toast("🧑 avatar updated");
      return true;
    },
    open: function () { openVault("chars"); },
    // capture from an already-generated image + prompt + seed
    captureFromImage: function (dataUrl, prompt, opts) {
      opts = opts || {};
      return new Promise(async function (resolve) {
        var name = window.prompt("Name this character (for your roster):", opts.name || "");
        if (name === null) { resolve(null); return; }
        var thumb = "";
        try { thumb = await downscale(dataUrl, 128); } catch (e) {}
        resolve(Characters.add({ name: name, prompt: prompt, seed: opts.seed, shape: opts.shape, thumb: thumb }));
      });
    },
    generateScene: function (character) { openCharScene(character); }
  };
  window.Characters = Characters;

  /* ------------------------------------------------------- Send-to bridge */
  function ensureTab(tab) {
    if (tab === "gen") { if (window.ensureGallery) window.ensureGallery(); if (window.ensureGenExtras) window.ensureGenExtras(); }
    else if (tab === "pro") { if (window.ensureProApp) window.ensureProApp(); }
    else if (tab === "evo") { if (window.ensureEvo) window.ensureEvo(); }
    else if (tab === "aiedit") { if (window.ensureAiedit) window.ensureAiedit(); }
    else if (tab === "comic") { if (window.ensureComic) window.ensureComic(); }
    else if (tab === "persona") { if (window.ensurePersona) window.ensurePersona(); }
  }
  function waitFor(sel, ms) {
    ms = ms || 6000;
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        var el = document.querySelector(sel);
        if (el) return resolve(el);
        if (Date.now() - t0 >= ms) return resolve(null);
        setTimeout(tick, 120);
      })();
    });
  }
  var destinations = [
    { id: "gen", label: "🎨 Image Generator", hint: "description box", tab: "gen", sel: '#i2p-imggen [data-name="description"]' },
    { id: "pro", label: "🚀 Pro Imager", hint: "“Your Vision” box", tab: "pro", sel: "#pro-desc", ready: function () { return !!window.__proReady; }, setter: "__proSetDesc" },
    { id: "evo", label: "🧬 Prompt Evolution", hint: "the idea box", tab: "evo", sel: "#evo-idea", setter: "__evoSetIdea" },
    { id: "aiedit", label: "✨ AI Photo Editor", hint: "edit instruction", tab: "aiedit", sel: "#ae-instruction", setter: "__aieditSetInstruction" },
    { id: "comic", label: "📚 Comic Scanner", hint: "focus box", tab: "comic", sel: "#cb-focus", setter: "__comicSetFocus" },
    { id: "persona", label: "🧑 Persona Generator", hint: "as a reference prompt", tab: "persona", setter: "__personaAddPrompt", ready: function () { return !!window.__personaAddPrompt; } }
  ];
  function waitFn(pred, ms) {
    ms = ms || 8000;
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        var ok = false;
        try { ok = !!pred(); } catch (e) {}
        if (ok) return resolve(true);
        if (Date.now() - t0 >= ms) return resolve(false);
        setTimeout(tick, 150);
      })();
    });
  }
  async function applyTo(dest, text) {
    text = String(text == null ? "" : text);
    var d = destinations.filter(function (x) { return x.id === dest; })[0];
    if (!d) return false;
    ensureTab(d.tab);
    if (window.showTab) window.showTab(d.tab);
    if (d.ready) await waitFn(d.ready, 9000);
    if (d.setter && typeof window[d.setter] === "function") {
      try { window[d.setter](text); toast("▸ sent to " + d.label); return true; } catch (e) { console.error(e); }
    }
    var el = await waitFor(d.sel, 8000);
    if (!el) { toast("⚠️ couldn't find the " + d.label + " box"); return false; }
    if ("value" in el) {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.textContent = text;
    }
    try { el.focus(); } catch (e) {}
    toast("▸ sent to " + d.label);
    return true;
  }
  var PromptBridge = {
    destinations: destinations,
    applyTo: applyTo,
    async sendTo(text, opts) {
      // if opts.tab targeted directly, apply
      if (opts && opts.to) return applyTo(opts.to, text);
      openSendMenu(text, opts || {});
    },
    // returns a small 📚 button that opens the send-to menu for the given text getter
    menuButton(getText, opts) {
      opts = opts || {};
      var b = document.createElement("button");
      b.type = "button";
      b.className = "vault-btn-inline";
      b.title = opts.title || "Save / send this prompt";
      b.textContent = opts.label || "📚";
      b.addEventListener("click", function (e) {
        e.stopPropagation(); e.preventDefault();
        var t = typeof getText === "function" ? getText() : getText;
        openSendMenu(t, Object.assign({ anchor: b }, opts));
      });
      return b;
    }
  };
  window.PromptBridge = PromptBridge;

  function closeSendMenu() {
    var m = $("pbridgeMenu");
    if (m) m.remove();
    document.removeEventListener("mousedown", onSendOutside, true);
  }
  function onSendOutside(e) {
    var m = $("pbridgeMenu");
    if (m && !m.contains(e.target)) closeSendMenu();
  }
  function openSendMenu(text, opts) {
    injectStyles();
    closeSendMenu();
    text = String(text == null ? "" : text);
    var menu = document.createElement("div");
    menu.id = "pbridgeMenu";
    menu.className = "pbridge-menu";
    var html = '<div class="hint">' + esc(opts.preview ? opts.preview.slice(0, 64) : "Send this prompt to…") + "</div>";
    destinations.forEach(function (d) { html += '<button data-dest="' + d.id + '">' + d.label + ' <span style="opacity:.55;font-size:.86em">· ' + d.hint + "</span></button>"; });
    html += '<div class="sep"></div>';
    html += '<button data-dest="__vault">📚 Save to vault</button>';
    html += '<button data-dest="__copy">📋 Copy</button>';
    menu.innerHTML = html;
    document.body.appendChild(menu);
    var anchor = opts.anchor;
    var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    if (r) {
      var top = r.bottom + 6, left = r.left;
      if (left + 230 > window.innerWidth) left = Math.max(6, window.innerWidth - 236);
      if (top + 300 > window.innerHeight) top = Math.max(6, r.top - 6 - menu.offsetHeight);
      menu.style.top = top + "px"; menu.style.left = left + "px";
    } else {
      menu.style.top = "18vh"; menu.style.left = "50%"; menu.style.transform = "translateX(-50%)";
    }
    menu.addEventListener("click", async function (e) {
      var b = e.target.closest("button[data-dest]");
      if (!b) return;
      var dest = b.getAttribute("data-dest");
      closeSendMenu();
      if (dest === "__copy") { await copyText(text); toast("📋 Copied"); return; }
      if (dest === "__vault") { await Vault.add(text, { thumb: opts.thumb, thumbKind: opts.thumbKind, thumbPoster: opts.thumbPoster, tags: opts.tags, tab: opts.tab }); return; }
      applyTo(dest, text);
    });
    setTimeout(function () { document.addEventListener("mousedown", onSendOutside, true); }, 0);
  }

  /* ------------------------------------------------------------- Vault modal */
  var vaultView = "prompts";
  var vaultPick = null;
  var vaultEsc = null;
  async function openVault(view, opts) {
    opts = opts || {};
    injectStyles();
    vaultView = view || "prompts";
    vaultPick = opts.pick || null;
    var existing = $("vaultOverlay");
    if (existing) closeVault();
    var overlay = document.createElement("div");
    overlay.id = "vaultOverlay";
    overlay.className = "vault-overlay";
    overlay.innerHTML =
      '<div class="vault-modal">' +
        '<div class="vault-head">' +
          '<h3>📚 Prompt Vault</h3>' +
          '<span class="vault-spacer"></span>' +
          '<button class="vault-tabbtn" data-view="prompts">Prompts</button>' +
          '<button class="vault-tabbtn" data-view="chars">🧑 Characters</button>' +
          '<button class="vault-tabbtn" id="vaultExportBtn" title="Download everything on this site as a backup file">⬇️ Export all</button>' +
          '<button class="vault-tabbtn" id="vaultCompactBtn" title="Download a much smaller backup: thumbnail previews dropped, short field names, gzipped. Restores the same prompts, characters and personas.">🗜️ Compact</button>' +
          '<button class="vault-tabbtn" id="vaultImportBtn" title="Restore a backup file">⬆️ Import</button>' +
          '<button class="vault-tabbtn" id="vaultCloseBtn">✖️</button>' +
        "</div>" +
        '<div class="vault-toolbar" id="vaultToolbar"></div>' +
        '<div class="vault-body" id="vaultBody"></div>' +
        '<input type="file" id="vaultImportFile" accept=".json,.json.gz,.gz,application/json,application/gzip" hidden>' +
      "</div>";
    document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) closeVault(); });
    $("vaultCloseBtn").addEventListener("click", closeVault);
    vaultEsc = function (e) { if (e.key === "Escape") { e.stopPropagation(); closeVault(); } };
    document.addEventListener("keydown", vaultEsc, true);
    $("vaultExportBtn").addEventListener("click", function () { SiteBackup.exportAll(); });
    $("vaultCompactBtn").addEventListener("click", function () { SiteBackup.exportCompact(); });
    $("vaultImportBtn").addEventListener("click", function () { $("vaultImportFile").click(); });
    $("vaultImportFile").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) SiteBackup.importFromFile(f);
      e.target.value = "";
    });
    overlay.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () { vaultView = b.getAttribute("data-view"); renderVault(); });
    });
    if (opts.title) overlay.querySelector("h3").textContent = "📚 " + opts.title;
    renderVault();
  }
  function closeVault() {
    if (vaultEsc) { document.removeEventListener("keydown", vaultEsc, true); vaultEsc = null; }
    var o = $("vaultOverlay"); if (o) o.remove(); vaultPick = null;
  }

  async function renderVault() {
    var overlay = $("vaultOverlay");
    if (!overlay) return;
    overlay.querySelectorAll("[data-view]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-view") === vaultView); });
    var body = $("vaultBody"), toolbar = $("vaultToolbar");
    body.innerHTML = '<div class="vault-empty">Loading…</div>';
    if (vaultView === "chars") { await renderCharsView(toolbar, body); return; }
    var items = await Vault.list();
    var allTags = {};
    items.forEach(function (it) { (it.tags || []).forEach(function (t) { allTags[t] = (allTags[t] || 0) + 1; }); });
    var tagList = Object.keys(allTags).sort(function (a, b) { return allTags[b] - allTags[a]; }).slice(0, 14);
    toolbar.innerHTML =
      '<input class="vault-search" id="vaultSearch" placeholder="Search prompts…">' +
      '<span class="vault-spacer"></span>' +
      '<button class="vault-row-btn" id="vaultAddToggle">＋ Add prompt</button>';
    var chips = document.createElement("div");
    chips.style.cssText = "display:flex;gap:.3rem;flex-wrap:wrap;width:100%;";
    tagList.forEach(function (t) {
      var c = document.createElement("button");
      c.className = "vault-chip"; c.textContent = "#" + t;
      c.addEventListener("click", function () { c.classList.toggle("active"); applyFilter(); });
      chips.appendChild(c);
    });
    toolbar.appendChild(chips);
    body.innerHTML = '<div class="vault-add" id="vaultAdd" hidden><textarea id="vaultAddText" placeholder="Paste a prompt to keep…"></textarea><div style="display:flex;gap:.4rem;flex-wrap:wrap;"><input id="vaultAddTags" placeholder="tags (comma separated)" style="flex:1;min-width:160px;"><button class="vault-primary" id="vaultAddSave">Save</button></div></div>';

    var listWrap = document.createElement("div");
    listWrap.id = "vaultList";
    listWrap.style.cssText = "display:flex;flex-direction:column;gap:.6rem;";
    body.appendChild(listWrap);

    function applyFilter() {
      var q = ($("vaultSearch").value || "").toLowerCase().trim();
      var active = [].slice.call(chips.querySelectorAll(".vault-chip.active")).map(function (c) { return c.textContent.slice(1); });
      var shown = 0;
      listWrap.querySelectorAll(".vault-item").forEach(function (el) {
        var text = (el.querySelector(".vault-text").textContent || "").toLowerCase();
        var tags = (el.getAttribute("data-tags") || "").split(",");
        var okQ = !q || text.indexOf(q) !== -1 || tags.some(function (t) { return t.indexOf(q) !== -1; });
        var okT = !active.length || active.every(function (t) { return tags.indexOf(t) !== -1; });
        var on = okQ && okT;
        el.hidden = !on; if (on) shown++;
      });
      var none = listWrap.querySelector(".vault-empty");
      if (none) none.hidden = shown !== 0;
    }
    $("vaultSearch").addEventListener("input", applyFilter);
    $("vaultAddToggle").addEventListener("click", function () { var a = $("vaultAdd"); a.hidden = !a.hidden; if (!a.hidden) $("vaultAddText").focus(); });
    $("vaultAddSave").addEventListener("click", async function () {
      var text = $("vaultAddText").value.trim();
      if (!text) return;
      var tags = $("vaultAddTags").value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
      tags.forEach(pushRecentTag);
      await Vault.add(text, { tags: tags });
      renderVault();
    });

    if (!items.length) {
      listWrap.innerHTML = '<div class="vault-empty">Your vault is empty. Save prompts from any tab — the 🎨 Image Generator, 🧬 Evolution winners, 🚀 Pro Imager, 📚 comic characters — and they all show up here.</div>';
    } else {
      items.forEach(function (it) { listWrap.appendChild(vaultItemEl(it, applyFilter)); });
    }
    applyFilter();

    $("vaultSearch").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { var first = listWrap.querySelector(".vault-item:not([hidden])"); if (first) first.querySelector("[data-act=send]").click(); }
    });
  }

  function vaultItemEl(it, onChange) {
    var el = document.createElement("div");
    el.className = "vault-item";
    el.setAttribute("data-tags", (it.tags || []).join(","));
    var thumb = it.thumb ? AVThumb(it.thumb, "vault-thumb", it.thumbKind, it.thumbPoster) : "";
    el.innerHTML = thumb +
      '<div class="vault-item-main">' +
        '<div class="vault-text"></div>' +
        '<div class="vault-meta"><span>' + (it.tab ? esc(it.tab) : "saved") + "</span><span>" + new Date(it.ts || Date.now()).toLocaleDateString() + "</span></div>" +
        '<div class="vault-meta vault-tags"></div>' +
      "</div>" +
      '<div class="vault-item-acts">' +
        '<button class="vault-iconbtn" data-act="send" title="Send to a tab">▸</button>' +
        '<button class="vault-iconbtn" data-act="copy" title="Copy">📋</button>' +
        '<button class="vault-iconbtn" data-act="tag" title="Edit tags">🏷️</button>' +
        '<button class="vault-iconbtn" data-act="del" title="Delete">🗑️</button>' +
        '<button class="vault-iconbtn" data-act="use" title="Use (pick)">✅</button>' +
      "</div>";
    el.querySelector(".vault-text").textContent = it.text;
    var tagWrap = el.querySelector(".vault-tags");
    (it.tags || []).forEach(function (t) {
      var b = document.createElement("button");
      b.className = "vault-tag"; b.textContent = "#" + t;
      b.addEventListener("click", function (e) { e.stopPropagation(); });
      tagWrap.appendChild(b);
    });
    el.querySelector('[data-act=copy]').addEventListener("click", async function () { await copyText(it.text); toast("📋 Copied"); });
    el.querySelector('[data-act=send]').addEventListener("click", function (e) { openSendMenu(it.text, { anchor: e.currentTarget, thumb: it.thumb, thumbKind: it.thumbKind, thumbPoster: it.thumbPoster, tags: it.tags }); });
    el.querySelector('[data-act=tag]').addEventListener("click", async function () {
      var v = window.prompt("Tags (comma separated):", (it.tags || []).join(", "));
      if (v === null) return;
      var tags = v.split(",").map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
      await Vault.update(it.id, { tags: tags });
      renderVault();
    });
    el.querySelector('[data-act=del]').addEventListener("click", async function () { await Vault.remove(it.id); renderVault(); });
    var useBtn = el.querySelector('[data-act=use]');
    if (vaultPick) {
      useBtn.title = "Use this prompt";
      useBtn.addEventListener("click", function () {
        var cb = vaultPick; closeVault();
        try { cb(it.text, it); } catch (e) { console.error(e); }
      });
    } else { useBtn.hidden = true; }
    return el;
  }

  async function renderCharsView(toolbar, body) {
    var chars = await Characters.list();
    toolbar.innerHTML = '<span style="font-size:.84rem;opacity:.75">Characters you keep here can be re-generated in new scenes with the same look &amp; seed.</span>';
    if (!chars.length) {
      body.innerHTML = '<div class="vault-empty">No characters yet. On the 🚀 Pro Imager tab, tap 🧑 on any generated image to add it to your roster.</div>';
      return;
    }
    body.innerHTML = "";
    chars.forEach(function (c) {
      var el = document.createElement("div");
      el.className = "vault-item";
      el.innerHTML =
        (c.thumb ? AVThumb(c.thumb, "vault-thumb", c.thumbKind, c.thumbPoster) : '<div class="vault-thumb"></div>') +
        '<div class="vault-item-main">' +
          '<div style="font-weight:700">' + esc(c.name) + (c.seed != null ? ' <span style="opacity:.6;font-weight:400;font-size:.8em">seed ' + c.seed + "</span>" : "") + "</div>" +
          '<div class="vault-text"></div>' +
        "</div>" +
        '<div class="vault-item-acts">' +
          '<button class="vault-iconbtn" data-act="scene" title="Generate a new scene">🎬</button>' +
          '<button class="vault-iconbtn" data-act="send" title="Send the prompt to a tab">▸</button>' +
          '<button class="vault-iconbtn" data-act="del" title="Delete">🗑️</button>' +
        "</div>";
      el.querySelector(".vault-text").textContent = c.prompt;
      el.querySelector('[data-act=scene]').addEventListener("click", function () { openCharScene(c); });
      el.querySelector('[data-act=send]').addEventListener("click", function (e) { openSendMenu(c.prompt, { anchor: e.currentTarget, thumb: c.thumb, thumbKind: c.thumbKind, thumbPoster: c.thumbPoster }); });
      el.querySelector('[data-act=del]').addEventListener("click", async function () { await Characters.remove(c.id); renderVault(); });
      body.appendChild(el);
    });
  }

  /* --------------------------------------------------- character scene modal */
  function openCharScene(c) {
    injectStyles();
    var ex = $("charSceneOverlay"); if (ex) ex.remove();
    var overlay = document.createElement("div");
    overlay.id = "charSceneOverlay";
    overlay.className = "vault-overlay";
    overlay.innerHTML =
      '<div class="vault-modal" style="width:min(640px,100%)">' +
        '<div class="vault-head"><h3>🎬 ' + esc(c.name) + " — new scene</h3><span class=\"vault-spacer\"></span><button class=\"vault-tabbtn\" id=\"charSceneClose\">✖️</button></div>" +
        '<div class="vault-body">' +
          '<div style="display:flex;gap:.6rem;align-items:flex-start;">' +
            (c.thumb ? AVThumb(c.thumb, "vault-thumb", c.thumbKind, c.thumbPoster).replace('class="vault-thumb"', 'class="vault-thumb" style="width:110px;height:110px"') : "") +
            '<div style="flex:1;font-size:.82rem;opacity:.8">' + esc(c.prompt.slice(0, 220)) + "…</div>" +
          "</div>" +
          '<textarea id="charSceneText" placeholder="Describe the new scene / pose / outfit — e.g. \'standing in a rainy neon street, looking over her shoulder\'" style="width:100%;min-height:4.5rem;background:var(--th-field,rgba(0,0,0,.25));color:inherit;border:1px solid var(--th-border);border-radius:9px;padding:.5rem;font:inherit;"></textarea>' +
          '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">' +
            '<select id="charSceneCount" style="background:var(--th-field);color:inherit;border:1px solid var(--th-border);border-radius:8px;padding:.3rem .5rem;font:inherit;"><option value="1">1 image</option><option value="2">2 images</option><option value="4" selected>4 images</option></select>' +
            '<label style="font-size:.82rem;display:flex;gap:.3rem;align-items:center;"><input type="checkbox" id="charSceneKeepSeed" checked> keep same seed</label>' +
            '<span style="flex:1"></span>' +
            '<button class="vault-primary" id="charSceneGo">✨ Generate</button>' +
          "</div>" +
          '<div id="charSceneStatus" style="font-size:.84rem;opacity:.75"></div>' +
          '<div class="vault-gen-grid" id="charSceneGrid"></div>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) overlay.remove(); });
    $("charSceneClose").addEventListener("click", function () { overlay.remove(); });
    $("charSceneGo").addEventListener("click", async function () {
      if (!window.root || !window.root.generateImage) { toast("⚠️ image generator not ready"); return; }
      var scene = $("charSceneText").value.trim();
      var prompt = c.prompt + (scene ? ", " + scene : "");
      var n = Number($("charSceneCount").value) || 1;
      var keep = $("charSceneKeepSeed").checked;
      var status = $("charSceneStatus"), grid = $("charSceneGrid");
      status.textContent = "⏳ generating " + n + "…";
      var stopFunny = window.FunnyGen ? window.FunnyGen.start(function (line) { status.textContent = "⏳ generating… " + line; }) : null;
      for (var i = 0; i < n; i++) {
        try {
          var res = await window.root.generateImage(prompt, {
            resolution: c.shape || "512x768",
            seed: keep && c.seed != null ? c.seed : -1,
            negativePrompt: c.negative || undefined,
            hideGalleryButtons: true
          });
          var url = res && (res.dataUrl || res.url);
          if (!url) continue;
          var img = document.createElement("img");
          img.src = url; img.title = prompt;
          img.title = prompt + "  (click to save/download)";
          img.style.cursor = "pointer";
          img.addEventListener("click", function () { window.open(this.src, "_blank"); });
          grid.appendChild(img);
        } catch (e) { console.error(e); if (stopFunny) { try { stopFunny(); } catch (_e) {} stopFunny = null; } status.textContent = "⚠️ one image failed"; }
      }
      if (stopFunny) { try { stopFunny(); } catch (_e) {} stopFunny = null; }
      status.textContent = "✅ done";
    });
  }

  /* -------------------------------------------------------- Cookbook (recipes) */
  var Recipe = {
    encode: function (type, data) {
      var payload = JSON.stringify({ v: 1, type: type, data: data });
      try { return btoa(unescape(encodeURIComponent(payload))).replace(/=+$/, ""); } catch (e) { return ""; }
    },
    decode: function (str) {
      try {
        var b = str.replace(/-/g, "+").replace(/_/g, "/");
        while (b.length % 4) b += "=";
        return JSON.parse(decodeURIComponent(escape(atob(b))));
      } catch (e) { return null; }
    },
    shareUrl: function (type, data) {
      var base = "https://perchance.org/" + (window.generatorName || "");
      return base + "#recipe=" + Recipe.encode(type, data);
    },
    copy: async function (type, data) {
      var url = Recipe.shareUrl(type, data);
      await copyText(url);
      toast("🔗 Recipe link copied");
      return url;
    },
    current: function () {
      var m = (location.hash || "").match(/recipe=([A-Za-z0-9+/_=-]+)/);
      return m ? Recipe.decode(m[1]) : null;
    },
    apply: function (recipe) {
      recipe = recipe || Recipe.current();
      if (!recipe) return false;
      var fn = null;
      if (recipe.type === "gen" && window.__genApplyRecipe) fn = window.__genApplyRecipe;
      if (recipe.type === "pro" && window.__proApplyRecipe) fn = window.__proApplyRecipe;
      if (recipe.type === "theme" && window.__themeApplyRecipe) fn = window.__themeApplyRecipe;
      if (recipe.type === "persona" && window.__personaApplyRecipe) fn = window.__personaApplyRecipe;
      if (!fn) { toast("⚠️ that recipe type isn't available yet"); return false; }
      fn(recipe.data);
      return true;
    }
  };
  Recipe.offer = offerRecipe; // let the page ask (e.g. on a '#recipe=' hash change) without a reload
  window.Recipe = Recipe;

  function offerRecipe() {
    var r = Recipe.current();
    if (!r) return;
    if ($("recipeBanner")) return;
    var LABEL = { gen: "Image Generator", pro: "Pro Imager", theme: "Theme", persona: "Persona Generator" };
    var banner = document.createElement("div");
    banner.id = "recipeBanner";
    banner.className = "recipe-banner";
    banner.innerHTML = '<span>🔗 A shared <b>' + (LABEL[r.type] || r.type) + "</b> recipe was found in this link.</span>" +
      '<button class="go" id="recipeApply">Apply it</button><button id="recipeDismiss">Dismiss</button>';
    document.body.appendChild(banner);
    $("recipeApply").addEventListener("click", async function () {
      // ensure the target module is loaded before applying
      if (r.type === "gen") ensureTab("gen");
      if (r.type === "pro") ensureTab("pro");
      if (r.type === "persona") ensureTab("persona");
      for (var i = 0; i < 30 && !Recipe.apply(r); i++) await new Promise(function (x) { setTimeout(x, 200); });
      banner.remove();
    });
    $("recipeDismiss").addEventListener("click", function () { banner.remove(); });
  }

  /* ------------------------------------------------------------ Site backup */
  var SiteBackup = {
    async collect() {
      var data = { app: "image-to-prompt-suite", v: 1, ts: Date.now(), localStorage: {}, vault: {}, chars: [], persona: [], personaSaved: [] };
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (/^t2i|^evo|^imagerPro|^aiag_|^thTheme|^rememberedInput|^generateClickCount|^vaultRecentTags/.test(k)) {
            data.localStorage[k] = localStorage.getItem(k);
          }
        }
      } catch (e) {}
      try { data.vault = { items: await Vault.list() }; } catch (e) {}
      try { data.chars = await Characters.list(); } catch (e) {}
      try { if (typeof window.t2i_personaPromptHistory === "function") data.persona = await window.t2i_personaPromptHistory(); } catch (e) {}
      try { if (typeof window.__personaListSaved === "function") data.personaSaved = await window.__personaListSaved(); } catch (e) {}
      return data;
    },
    async exportAll() {
      var data = await SiteBackup.collect();
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "image-suite-backup-" + new Date().toISOString().slice(0, 10) + ".json");
      toast("⬇️ Backup downloaded");
    },
    measure(data) {
      function bytes(s) { try { return new Blob([s]).size; } catch (e) { return s.length; } }
      var secs = {
        localStorage: bytes(JSON.stringify(data.localStorage || {})),
        vault: bytes(JSON.stringify((data.vault && data.vault.items) || [])),
        chars: bytes(JSON.stringify(data.chars || [])),
        persona: bytes(JSON.stringify(data.persona || [])),
        personaSaved: bytes(JSON.stringify(data.personaSaved || []))
      };
      secs.total = secs.localStorage + secs.vault + secs.chars + secs.persona + secs.personaSaved;
      return secs;
    },
    compact(data) {
      function slimVault(it) {
        var o = { t: it.text };
        if (it.tags && it.tags.length) o.g = it.tags;
        if (it.tab) o.b = it.tab;
        if (it.label) o.l = it.label;
        return o;
      }
      function slimChar(c) {
        var o = { name: c.name, prompt: c.prompt };
        if (c.negative) o.neg = c.negative;
        if (c.seed !== null && c.seed !== undefined && c.seed !== "") o.seed = c.seed;
        if (c.shape && c.shape !== "512x768") o.shape = c.shape;
        return o;
      }
      function slimPersonaRec(r) {
        var o = { source: r.source || "gen" };
        if (r.imagePrompt) o.ip = r.imagePrompt;
        if (r.instruction) o.in = r.instruction;
        if (r.name) o.n = r.name;
        if (r.description) o.d = r.description;
        return o;
      }
      function slimSaved(p) {
        var o = { name: p.name || "Imported persona", description: p.description };
        if (p.tone && p.tone !== "auto") o.tone = p.tone;
        if (p.rating && p.rating !== "sfw") o.rating = p.rating;
        if (p.language && p.language !== "English") o.lang = p.language;
        if (p.depth && p.depth !== "balanced") o.depth = p.depth;
        if (Array.isArray(p.extras) && p.extras.length) o.extras = p.extras;
        if (p.lorebook) o.lorebook = p.lorebook;
        return o;
      }
      var items = ((data.vault && data.vault.items) || []).filter(function (it) { return it && it.text; }).map(slimVault);
      var chars = (data.chars || []).filter(function (c) { return c && c.prompt; }).map(slimChar);
      var persona = (data.persona || []).filter(function (r) { return r && (r.imagePrompt || r.instruction || r.description); }).map(slimPersonaRec);
      var personaSaved = (data.personaSaved || []).filter(function (p) { return p && p.description; }).map(slimSaved);
      return { app: "image-to-prompt-suite", v: 1, compact: true, ts: data.ts || Date.now(), localStorage: data.localStorage || {}, vault: { items: items }, chars: chars, persona: persona, personaSaved: personaSaved };
    },
    async exportCompact() {
      toast("🗜️ Compressing backup…");
      var full = await SiteBackup.collect();
      var fullBytes = new Blob([JSON.stringify(full)]).size;
      var small = SiteBackup.compact(full);
      var json = JSON.stringify(small);
      var name = "image-suite-backup-compact-" + new Date().toISOString().slice(0, 10);
      if (typeof CompressionStream !== "undefined") {
        try {
          var gz = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
          downloadBlob(new Blob([gz], { type: "application/gzip" }), name + ".json.gz");
          toast("🗜️ " + fmtBytes(fullBytes) + " → " + fmtBytes(gz.byteLength));
          return;
        } catch (e) {}
      }
      downloadBlob(new Blob([json], { type: "application/json" }), name + ".min.json");
      toast("🗜️ " + fmtBytes(fullBytes) + " → " + fmtBytes(new Blob([json]).size) + " (no gzip here)");
    },
    async importFromFile(file) {
      try {
        var buf = await file.arrayBuffer();
        var bytes = new Uint8Array(buf);
        if (bytes.length > 2 && bytes[0] === 31 && bytes[1] === 139 && typeof DecompressionStream !== "undefined") {
          buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
        }
        await SiteBackup.importFromObject(JSON.parse(new TextDecoder().decode(buf)));
      } catch (e) { console.error(e); toast("⚠️ could not read that file"); }
    },
    async importFromObject(obj) {
      if (!obj || obj.app !== "image-to-prompt-suite") { toast("⚠️ not a site backup file"); return; }
      var n = 0;
      try {
        Object.keys(obj.localStorage || {}).forEach(function (k) { localStorage.setItem(k, obj.localStorage[k]); n++; });
      } catch (e) {}
      if (obj.vault && Array.isArray(obj.vault.items)) {
        for (var i = 0; i < obj.vault.items.length; i++) {
          var it = obj.vault.items[i];
          var text = it && (it.text || it.t);
          if (text) await Vault.add(text, { tags: it.tags || it.g || [], tab: it.tab || it.b || "imported", label: it.label || it.l || "", thumb: it.thumb || "", thumbKind: it.thumbKind || it.kind || "", thumbPoster: it.thumbPoster || it.poster || "", silent: true });
        }
      }
      if (Array.isArray(obj.chars)) {
        for (var j = 0; j < obj.chars.length; j++) {
          var c = obj.chars[j];
          if (c && c.prompt) await Characters.add({ name: c.name, prompt: c.prompt, negative: c.negative || c.neg || "", seed: (c.seed === 0 || c.seed) ? c.seed : null, shape: c.shape || "512x768", thumb: c.thumb || "", thumbKind: c.thumbKind || c.kind || "", thumbPoster: c.thumbPoster || c.poster || "" });
        }
      }
      if (typeof window.__personaImportSaved === "function" && Array.isArray(obj.personaSaved)) {
        try {
          await window.__personaImportSaved(obj.personaSaved.map(function (p) {
            if (!p || !p.description || p.tone) return p;
            return { name: p.name, description: p.description, thumb: "", tone: p.tone || "auto", rating: p.rating || "sfw", language: p.lang || "English", depth: p.depth || "balanced", extras: p.extras || [], lorebook: p.lorebook };
          }));
        } catch (e) {}
      }
      if (typeof window.t2i_autosavePersonaPrompt === "function" && Array.isArray(obj.persona)) {
        for (var p = 0; p < obj.persona.length; p++) {
          var r = obj.persona[p];
          if (r && (r.imagePrompt === undefined && r.ip !== undefined)) r = { source: r.source, imagePrompt: r.ip || "", instruction: r.in || "", name: r.n || "", description: r.d || "" };
          try { await window.t2i_autosavePersonaPrompt(r); } catch (e) {}
        }
      }
      toast("⬆️ Imported " + n + " settings · reloading…");
      setTimeout(function () { location.reload(); }, 1200);
    }
  };
  function downloadBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 600);
  }
  function fmtBytes(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  }
  window.SiteBackup = SiteBackup;

  /* -------------------------------------------------------- Command palette */
  var cpalEsc = null;
  var CommandPalette = {
    open: function () { openPalette(); },
    close: function () {
      if (cpalEsc) { document.removeEventListener("keydown", cpalEsc, true); cpalEsc = null; }
      var o = $("cpalOverlay"); if (o) o.remove();
    }
  };
  window.CommandPalette = CommandPalette;

  function paletteActions() {
    var tabs = [
      ["home", "🏠 Home"], ["i2p", "🖼️ Image to Prompt"], ["gen", "🎨 Image Generator"], ["evo", "🧬 Prompt Evolution"],
      ["theme", "🎨 Theme Studio"], ["helper", "🤖 AI Helper"], ["edit", "🖌️ Image Editor"], ["pro", "🚀 Pro Imager"],
      ["aiedit", "✨ AI Photo Editor"], ["comic", "📚 Comic Scanner"], ["persona", "🧑 Persona Generator"], ["chat", "💬 AI Chat"], ["chatlite", "💬 AI Chat Lite"], ["world", "🌍 Living World"], ["links", "🔗 Media to Links"], ["nexus", "📋 Generator List"], ["social", "👥 Social DB"],
      ["gallery", "🖼️ Personal Gallery"], ["comm", "🖼️ Community"], ["explore", "🌐 Explore"], ["story", "📖 Light Novel Maker"], ["listings", "📋 Generator Listings"]
    ];
    try {
      var __liqAuthed = (typeof window.__t2iIsOwnerAuthed === "function") ? !!window.__t2iIsOwnerAuthed() : !!window.__t2iOwnerAuthed;
      if (__liqAuthed) tabs.push(["liq", "🌊 Motion Lab"]);
      if (__liqAuthed) tabs.push(["private", "🔒 Private"]);
    } catch (e) {}
    var acts = tabs.map(function (t) {
      return { cat: "Go to", label: t[1], run: function () { if (window.showTab) window.showTab(t[0]); } };
    });
    acts.push({ cat: "Actions", label: "📚 Open Prompt Vault", run: function () { Vault.open(); } });
    acts.push({ cat: "Actions", label: "💬 Chat Prompt Builder — ngobrol dengan AI untuk meracik prompt", run: function () { try { if (window.__openPromptChat) { window.__openPromptChat(); return; } if (window.ensurePromptChat) window.ensurePromptChat(); var n = 0; (function wait() { if (window.__openPromptChat) window.__openPromptChat(); else if (++n < 40) setTimeout(wait, 250); })(); } catch (e) {} } });
    try { if (typeof window.__t2iIsOwnerAuthed === "function" ? window.__t2iIsOwnerAuthed() : window.__t2iOwnerAuthed) acts.push({ cat: "Go to", label: "🎛️ Owner console", run: function () { try { if (window.showTab) window.showTab("owner"); else if (window.__t2iOwner) window.__t2iOwner.open(); } catch (e) {} } }); } catch (e) {}
    acts.push({ cat: "Actions", label: "🧑 Open Character roster", run: function () { Characters.open(); } });
    acts.push({ cat: "Actions", label: "💾 Save all prompts (.txt)", run: function () { if (window.i2pSaveAllPrompts) window.i2pSaveAllPrompts(); } });
    acts.push({ cat: "Actions", label: "⬇️ Export full backup (.json)", run: function () { SiteBackup.exportAll(); } });
    acts.push({ cat: "Actions", label: "🗜️ Export compact backup (.json.gz)", run: function () { SiteBackup.exportCompact(); } });
    acts.push({ cat: "Actions", label: "⬆️ Import backup…", run: function () { Vault.open(); setTimeout(function () { var b = $("vaultImportBtn"); if (b) b.click(); }, 60); } });
    acts.push({ cat: "Actions", label: "🎨 Reset theme to default", run: function () { try { if (window.__themeStudio && window.__themeStudio.reset) window.__themeStudio.reset(); } catch (e) {} } });
    acts.push({ cat: "Actions", label: "📖 Reload page", run: function () { location.reload(); } });
    return acts;
  }
  async function openPalette() {
    injectStyles();
    CommandPalette.close();
    var overlay = document.createElement("div");
    overlay.id = "cpalOverlay";
    overlay.className = "cpal-overlay";
    overlay.innerHTML = '<div class="cpal"><input id="cpalInput" placeholder="Type a command or search your vault…" autocomplete="off"><div class="cpal-list" id="cpalList"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) CommandPalette.close(); });
    cpalEsc = function (e) { if (e.key === "Escape") { e.stopPropagation(); CommandPalette.close(); } };
    document.addEventListener("keydown", cpalEsc, true);
    var acts = paletteActions();
    var vaultItems = [];
    try { vaultItems = (await Vault.list()).slice(0, 60).map(function (it) { return { cat: "Vault", label: "📚 " + it.text.replace(/\s+/g, " ").slice(0, 70), run: function () { openSendMenu(it.text, { thumb: it.thumb }); } }; }); } catch (e) {}
    var rows = acts.concat(vaultItems);
    var input = $("cpalInput"), list = $("cpalList");
    if (!input || !list) return; // palette was closed while its vault items were loading
    var sel = 0, filtered = rows;
    function render() {
      list.innerHTML = "";
      if (!filtered.length) { list.innerHTML = '<div class="cpal-cat">no matches</div>'; return; }
      var lastCat = "";
      filtered.forEach(function (r, i) {
        if (r.cat !== lastCat) { lastCat = r.cat; var c = document.createElement("div"); c.className = "cpal-cat"; c.textContent = r.cat; list.appendChild(c); }
        var d = document.createElement("div");
        d.className = "cpal-row" + (i === sel ? " sel" : "");
        d.innerHTML = "<span>" + esc(r.label) + '</span><span class="k">↵</span>';
        d.addEventListener("mouseenter", function () { sel = i; render(); });
        d.addEventListener("click", function () { run_(i); });
        list.appendChild(d);
      });
    }
    function run_(i) { var r = filtered[i]; if (!r) return; CommandPalette.close(); setTimeout(function () { r.run(); }, 0); }
    function filter() {
      var q = input.value.toLowerCase().trim();
      filtered = q ? rows.filter(function (r) { return r.label.toLowerCase().indexOf(q) !== -1; }) : rows;
      sel = 0; render();
    }
    input.addEventListener("input", filter);
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { sel = Math.min(filtered.length - 1, sel + 1); render(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
      else if (e.key === "Enter") { run_(sel); e.preventDefault(); }
      else if (e.key === "Escape") { CommandPalette.close(); }
    });
    filter();
    input.focus();
  }

  /* --------------------------------------------------------------- bootstrap */
  function bindGlobalKeys() {
    if (window.__vaultKeysBound) return;
    window.__vaultKeysBound = true;
    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName || "").toLowerCase();
      var typing = tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        CommandPalette.open();
      } else if (!typing && e.key === "Escape") {
        closeSendMenu();
      }
    });
  }

  async function boot() {
    injectStyles();
    bindGlobalKeys();
    // wire the tab-bar vault button if present
    var vb = $("i2p-vault-btn");
    if (vb && !vb.__wired) { vb.__wired = true; vb.addEventListener("click", function () { Vault.open(); }); }
    // keep vault open across lazy loads
    document.addEventListener("vault-changed", function () {});
    await ready();
    offerRecipe();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.__vaultBoot = boot;
})();
