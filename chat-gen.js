/* ---- 🧹 Community-chat generations: owner-gated "reset every room at once" ----
 * The comments plugin has no edit / delete-own / clear-channel API (verified against
 * the shipped app bundle: delete is admin-password-only, no edit endpoint exists, and
 * the feed renders in a cross-origin iframe we cannot touch). So "reset" is done by
 * moving every community room to a fresh channel generation instead of deleting:
 *
 *   generation 0 (default)  ->  general, chat1, chat2, chat3, prompts, story + 17 per-tool rooms   (as today)
 *   generation N (N = 1..255) -> general-gN, chat1-gN, ..., story-gN, <tool>-gN   (fresh rooms)
 *
 * The generation lives in ONE durable byte of the server-plugin state (header byte
 * 13 — see the x-server-plugin block; the presence fingerprint table is untouched).
 * `ownerChatGenReset` (admin-only RPC) bumps it and fans it out on "owner:chatgen";
 * every client then hot-swaps its single SharedComm dock to the new rooms.
 *
 * Guarantees that matter:
 *  - NOTHING is ever deleted. Old rooms stay under their old names (archived, and
 *    re-visible by going back to that generation — the data is never wiped).
 *  - 💡 Feedback ("feedback" channel) is deliberately NOT versioned: the owner's
 *    bug-report inbox is never reset. Everything else (general/help/showcase/lounge/prompts/story + all per-tool rooms) moves.
 *  - First-visit boot waits for the generation (≤2.5s), so newcomers never strand
 *    themselves on stale rooms; returnees boot instantly from their last-known value.
  *  - The whole panel + section below is password-locked: only an unlocked owner can
  *    press Reset. Everyone else just sees the rooms switch silently (no toast).
 */
window.ChatGen = (function () {
  "use strict";
  if (window.__chatGenLoaded) return window.ChatGen;
  window.__chatGenLoaded = true;

  var LS_KEY = "t2iChatGen";
  var LAST_VIEW_KEY = "__tabbedCommentsPluginLastViewedChannel";
  var WRAP_ID = "shared-comm-wrap";
  // Versioned rooms. "feedback" is intentionally absent (owner inbox — never reset).
  var BASES = ["general", "chat1", "chat2", "chat3", "prompts", "story", "gen", "evo", "gallery", "explore", "comm", "forge", "i2p", "aiedit", "edit", "comic", "persona", "board", "chat", "chatlite", "links", "social", "theme"];

  var gen = 0;
  try { gen = Math.max(0, Math.min(255, parseInt(localStorage.getItem(LS_KEY) || "0", 10) || 0)); } catch (e) {}
  var settled = false;

  function isOwner() {
    try { if (typeof window.__t2iIsOwnerAuthed === "function") return !!window.__t2iIsOwnerAuthed(); } catch (e) {}
    try { return window.__t2iOwnerAuthed === true; } catch (e) { return false; }
  }
  // Base channel name of a commentChannels node (strips any -g<N> suffix we set before).
  function baseOf(node) {
    try {
      var c = node && node.channel;
      if (c !== undefined && c !== null) {
        c = c.toString();
        if (c) return c.replace(/-g\d+$/, "");
      }
      var n = node && node.getName;
      if (typeof n === "string" && n) return n === "general" ? "general" : n.replace(/-g\d+$/, "");
    } catch (e) {}
    return null;
  }
  // Point every versioned room at the current generation. Idempotent: safe to call
  // before each tabbedCommentsPlugin construction (fresh or rebuilt).
  function applyChannels(list) {
    try {
      if (!list || !list.selectAll) return list;
      var arr = list.selectAll;
      for (var i = 0; i < arr.length; i++) {
        var node = arr[i];
        if (!node || typeof node === "string") continue;
        var base = baseOf(node);
        if (!base || BASES.indexOf(base) < 0) continue;   // feedback + custom/unknown: untouched
        node.channel = gen > 0 ? base + "-g" + gen : (base === "general" ? "general" : "");
      }
    } catch (e) {}
    return list;
  }
  function resolve(base) {
    try { if (gen > 0 && BASES.indexOf(base) >= 0) return base + "-g" + gen; } catch (e) {}
    return base;
  }
  // Display form of a channel ("general-g3" -> "general") for toasts and labels.
  function disp(channel) {
    try { return String(channel || "").replace(/-g\d+$/, ""); } catch (e) { return channel; }
  }
  function persist() { try { localStorage.setItem(LS_KEY, String(gen)); } catch (e) {} }

  // Small toast reusing the chat-notify look (same class names, so it matches the theme).
  function chatToast(text) {
    try {
      var stack = document.getElementById("chat-toast-stack");
      if (!stack) {
        stack = document.createElement("div");
        stack.id = "chat-toast-stack";
        document.body.appendChild(stack);
      }
      var t = document.createElement("button");
      t.type = "button";
      t.className = "chat-toast";
      if (!window.ChatNotify) {
        t.style.cssText = "cursor:pointer;font:inherit;text-align:left;color:inherit;background:#222;border:1px solid #888;border-radius:12px;padding:0.6rem 0.75rem;display:flex;flex-direction:column;gap:0.2rem;";
      }
      var h = document.createElement("div");
      h.className = "chat-toast-head";
      h.textContent = "💬 Community chat";
      var b = document.createElement("div");
      b.className = "chat-toast-body";
      b.textContent = text;
      t.appendChild(h);
      t.appendChild(b);
      t.addEventListener("click", function () { try { t.remove(); } catch (e) {} });
      stack.appendChild(t);
      while (stack.children.length > 4) stack.firstChild.remove();
      setTimeout(function () { try { t.remove(); } catch (e) {} }, 9000);
    } catch (e) {}
  }

  function hotSwap(reason) {
    try {
      var w = document.getElementById(WRAP_ID);
      if (w && w.parentNode) w.parentNode.removeChild(w);
      // A Pro-tab-local instance (built while SharedComm couldn't boot) would go stale —
      // drop it so the fresh shared wrap docks in on re-dock.
      try {
        var pro = document.getElementById("pro-comments-ctn");
        if (pro) {
          var stale = pro.querySelector(":scope > .tabbed-comments-plugin-outer-ctn");
          if (stale) stale.remove();
        }
      } catch (e2) {}
      try { localStorage.removeItem(LAST_VIEW_KEY); } catch (e3) {}
      try { if (window.ChatNotify && window.ChatNotify.clearUnread) window.ChatNotify.clearUnread(); } catch (e4) {}
      try { if (window.SharedComm && window.SharedComm.dockTab) window.SharedComm.dockTab(window.__activeTab || "home"); } catch (e5) {}
      if (reason) chatToast(reason);
    } catch (e) {}
  }

  // The single doorway for generation changes (socket broadcast, RPC fetch, owner UI,
  // tests). Returns true when something actually changed.
  function applyGen(g, opts) {
    g = Math.max(0, Math.min(255, parseInt(g, 10) || 0));
    if (g === gen) return false;
    gen = g;
    persist();
    try { syncOwnerUi(); } catch (e) {}
    hotSwap(opts && opts.toast);
    return true;
  }

  function settleNow() {
    if (!settled) { settled = true; api.settled = true; }
  }

  // Fetch the authoritative generation; boot uses the last-known value meanwhile.
  function fetchGen() {
    function upgrade(v) {
      v = Math.max(0, Math.min(255, parseInt(v, 10) || 0));
      if (v !== gen) { gen = v; persist(); }
      settleNow();
      // If the dock already booted on a stale generation (first visit racing the RPC),
      // rebuild onto the fresh rooms instead of stranding the user on old ones.
      try {
        var w = document.getElementById(WRAP_ID);
        if (w) {
          var want = resolve("general"), has = false;
          var tabs = w.querySelectorAll(".tabbed-comments-plugin-tab");
          for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].dataset && tabs[i].dataset.channel === want) { has = true; break; }
          }
          if (!has) hotSwap(null);
        }
      } catch (e) {}
      try { syncOwnerUi(); } catch (e2) {}
    }
    try {
      var net = window.__t2iNet;
      if (!net || typeof net.whenOpen !== "function") { settleNow(); return; }
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; settleNow(); } }, 2500);
      net.whenOpen().then(function (sock) {
        if (done) return;
        if (!sock.rpc || typeof sock.rpc.chatGen !== "function") { done = true; clearTimeout(to); settleNow(); return; }
        return sock.rpc.chatGen("").then(function (v) {
          if (done) return; done = true; clearTimeout(to); upgrade(v);
        }).catch(function () { if (!done) { done = true; clearTimeout(to); settleNow(); } });
      }).catch(function () { if (!done) { done = true; clearTimeout(to); settleNow(); } });
    } catch (e) { settleNow(); }
  }

  // Live resets + replay-on-open arrive as a window event from the socket layer.
  // Silent on purpose: no toast — visitors just find fresh rooms, no reset notice.
  try {
    window.addEventListener("t2i-chatgen", function (ev) {
      try { applyGen(ev && ev.detail, null); } catch (e) {}
    });
  } catch (e) {}

  // ---------- owner console section (owner-gated Reset button) ----------
  var SEC_ID = "t2i-owner-chatgensec";
  var injected = false;
  function callRpc(method, arg) {
    return window.__t2iNet.whenOpen().then(function (sock) { return sock.rpc[method](arg === undefined ? "" : arg); });
  }
  function syncOwnerUi() {
    try {
      var sec = document.getElementById(SEC_ID);
      if (!sec) return;
      var sig = gen + "|" + (isOwner() ? "1" : "0");
      if (syncOwnerUi._last === sig) return;   // no DOM writes when nothing changed
      syncOwnerUi._last = sig;                 // (else the observer below re-fires forever)
      var st = sec.querySelector("[data-cgstat]");
      if (st) {
        st.innerHTML = "Rooms live on generation <b>" + gen + "</b>" +
          (gen > 0 ? " (channels suffixed <b>-g" + gen + "</b>)" : " (original room names)") +
          (isOwner() ? "" : " · <b>🔒 not owner-unlocked</b>");
      }
      var btn = sec.querySelector("[data-cgreset]");
      if (btn) btn.disabled = !isOwner();
    } catch (e) {}
  }
  function inject() {
    if (injected) { syncOwnerUi(); return true; }
    var panel = document.getElementById("t2i-owner-panel");
    if (!panel) return false;
    var anchor = panel.querySelector('label[for="t2i-owner-msg"]');
    if (!anchor) return false;
    if (!document.getElementById("t2iChatGenCss")) {
      var s = document.createElement("style");
      s.id = "t2iChatGenCss";
      s.textContent =
        "#t2i-owner-chatgensec{border:1px solid var(--th-border,rgba(255,255,255,0.16));border-radius:12px;padding:0.6rem 0.7rem;margin-top:0.75rem;background:var(--th-field,rgba(255,255,255,0.05));}" +
        "#t2i-owner-chatgensec .t2i-owner-lbl{margin-top:0;}" +
        ".t2i-owner-cgstat{font-size:0.76rem;line-height:1.6;opacity:0.88;margin:0.4rem 0;}" +
        ".t2i-owner-cgnote{font-size:0.7rem;line-height:1.5;opacity:0.65;margin-top:0.45rem;}" +
        ".t2i-owner-cgstatus{font-size:0.78rem;font-weight:600;margin-top:0.4rem;min-height:1.1em;color:var(--th-accent,#ff69b4);}";
      document.head.appendChild(s);
    }
    var sec = document.createElement("div");
    sec.id = SEC_ID;
    sec.innerHTML =
      '<div class="t2i-owner-lrow t2i-owner-lblrow"><span class="t2i-owner-lbl">🧹 Community chat reset — fresh rooms (owner only)</span></div>' +
      '<div class="t2i-owner-cgstat" data-cgstat>Loading…</div>' +
      '<div class="t2i-owner-notifyrow t2i-owner-row"><button type="button" class="t2i-owner-btn" data-cgreset>🧹 Reset all community rooms</button></div>' +
      '<div class="t2i-owner-cgstatus" data-cgstatus></div>' +
      '<div class="t2i-owner-cgnote">Moves General · Help · Showcase · Lounge · Prompts to a fresh, empty generation for <b>everyone at once</b> (this device switches too). <b>Nothing is deleted</b> — old rooms stay saved under their old names. 💡 Feedback is never reset. Visitors on very old code keep seeing the old rooms until they refresh.</div>';
    try { panel.insertBefore(sec, anchor); } catch (e) { return false; }
    injected = true;
    try {
      sec.querySelector("[data-cgreset]").addEventListener("click", function () {
        var statusEl = sec.querySelector("[data-cgstatus]");
        function status(t) { if (statusEl) statusEl.textContent = t; }
        if (!isOwner()) { status("🔒 unlock the owner console first"); return; }
        if (!window.confirm("Reset ALL community rooms to a fresh generation?\n\nOld messages stay saved under the old room names (nothing is deleted). 💡 Feedback is untouched.")) return;
        status("Resetting…");
        callRpc("ownerChatGenReset", "").then(function (g) {
          status("✅ fresh rooms live — generation " + g);
          try { applyGen(g, null); } catch (e) {}
        }).catch(function () {
          status("⚠️ couldn't reach the reset service — save the generator so the new server code is live, then retry.");
        });
      });
    } catch (e) {}
    syncOwnerUi();
    return true;
  }
  if (!inject()) {
    var tries = 0;
    (function retry() {
      if (inject() || ++tries > 120) return;
      setTimeout(retry, 500);
    })();
    try {
      var obs = new MutationObserver(function () {
        try { if (inject()) { try { obs.disconnect(); } catch (e2) {} } } catch (e) {}
      });
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  try {
    document.addEventListener("t2i-owner-auth", function () { setTimeout(syncOwnerUi, 100); });
  } catch (e) {}

  var api = {
    gen: function () { return gen; },
    settled: false,
    resolve: resolve,
    disp: disp,
    applyChannels: applyChannels,
    applyGen: applyGen,   // socket path, owner console and tests share this doorway
    refresh: fetchGen
  };
  fetchGen();
  return api;
})();
