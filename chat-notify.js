window.ChatNotify = (function () {
  var LS_KEY = "t2iChatNotify";
  var WATCH_KEY = "t2iChatOwnerWatch";
  var WRAP_ID = "shared-comm-wrap";
  var seen = Object.create(null);
  var unread = 0;
  var baseTitle = document.title;
  var lastAnnounceNotified = null;

  function enabled() {
    try { return localStorage.getItem(LS_KEY) !== "0"; } catch (e) { return true; }
  }
  function setEnabled(v) {
    try { localStorage.setItem(LS_KEY, v ? "1" : "0"); } catch (e) {}
    if (!v) clearUnread();
    paintBells();
    try { document.dispatchEvent(new CustomEvent("t2i-chatnotify-change", { detail: { on: !!v } })); } catch (e) {}
  }
  // ---- owner gate: loud "watch" mode only works while this browser holds the owner grant ----
  function isOwner() {
    try { if (typeof window.__t2iIsOwnerAuthed === "function") return !!window.__t2iIsOwnerAuthed(); } catch (e) {}
    try { return window.__t2iOwnerAuthed === true; } catch (e) { return false; }
  }
  function watchStored() {
    try { return localStorage.getItem(WATCH_KEY) === "1"; } catch (e) { return false; }
  }
  // Effective = stored preference AND currently unlocked as owner. Locking the console
  // drops back to normal (non-loud) behavior without losing the preference.
  function watchOn() { return watchStored() && isOwner(); }
  function setWatch(v) {
    try { localStorage.setItem(WATCH_KEY, v ? "1" : "0"); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent("t2i-chatnotify-watch", { detail: { on: !!v } })); } catch (e) {}
  }
  function mentionsOwner(text) {
    try { return /@(owner|admin|mods?\b|everyone|here)\b/i.test(String(text || "")); } catch (e) { return false; }
  }
  function getPermission() {
    try { return ("Notification" in window) ? Notification.permission : "unsupported"; }
    catch (e) { return "unsupported"; }
  }
  function keyOf(c) {
    try { return c.channel + "|" + c.id; } catch (e) { return String((c && c.id) || Math.random()); }
  }
  function textOf(html) {
    try {
      var d = document.createElement("div");
      d.innerHTML = String(html == null ? "" : html);
      return (d.textContent || "").trim().replace(/\s+/g, " ");
    } catch (e) { return ""; }
  }
  function authorOf(c) {
    try {
      var u = c.user || {};
      var label = String(u.nickname || u.name || "").trim();
      var tag = u.visualId ? String(u.visualId).toUpperCase() : "";
      if (label && tag) return label + " (" + tag + ")";
      if (label) return label;
      if (tag) return "User " + tag;
    } catch (e) {}
    return "Someone";
  }
  function wrap() {
    try { return document.getElementById(WRAP_ID); } catch (e) { return null; }
  }
  function chatVisible() {
    try {
      if (document.visibilityState !== "visible") return false;
      var w = wrap();
      if (!w || !document.body.contains(w)) return false;
      var r = w.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return false;
      var n = w;
      while (n && n !== document.body) {
        if (n.hidden) return false;
        n = n.parentNode;
      }
      return true;
    } catch (e) { return false; }
  }
  function paintTitle() {
    try {
      document.title = unread > 0 ? "(" + unread + ") " + baseTitle : baseTitle;
    } catch (e) {}
  }
  function clearUnread() {
    if (!unread) return;
    unread = 0;
    paintTitle();
    paintBells();
  }
  function buzz(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern || [40, 40, 40]); } catch (e) {}
  }
  function bellHint() {
    var os = "";
    try {
      if ("Notification" in window) {
        if (Notification.permission === "granted") os = "OS pop-ups on";
        else if (Notification.permission === "denied") os = "OS pop-ups blocked in browser settings";
        else os = "click again to allow OS pop-ups";
      } else os = "OS pop-ups unsupported here";
    } catch (e) {}
    if (watchOn()) os += " · 👑 owner watch LOUD";
    return enabled()
      ? "Community chat notifications: ON (" + os + "). Click to mute."
      : "Community chat notifications: OFF. Click to unmute.";
  }
  function paintBells() {
    try {
      var sig = (enabled() ? "1" : "0") + "|" + unread + "|" + (watchOn() ? "w" : "");
      var btns = document.querySelectorAll(".chat-nbell");
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (b.dataset.paint === sig) continue;
        b.dataset.paint = sig;
        b.textContent = "";
        var ic = document.createElement("span");
        ic.textContent = enabled() ? "🔔" : "🔕";
        b.appendChild(ic);
        if (unread > 0 && enabled()) {
          var n = document.createElement("span");
          n.className = "chat-ncount";
          n.textContent = unread > 99 ? "99+" : String(unread);
          b.appendChild(n);
        }
        b.title = bellHint();
        b.setAttribute("aria-label", bellHint());
      }
    } catch (e) {}
  }
  function ensureBells() {
    try {
      var heads = document.querySelectorAll(".shared-comm .pro-card-head, #hm-community-wrap .hm-section-head, #comm-pop-head");
      for (var i = 0; i < heads.length; i++) {
        var h = heads[i];
        if (h.querySelector(":scope > .chat-nbell")) continue;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chat-nbell";
        b.addEventListener("click", function () {
          var on = !enabled();
          setEnabled(on);
          if (on) requestOsPermission();
        });
        h.appendChild(b);
      }
      paintBells();
    } catch (e) {}
  }
  function requestOsPermission() {
    try {
      if ("Notification" in window && Notification.permission === "default") {
        var p = Notification.requestPermission();
        if (p && p.then) {
          p.then(function () { paintBells(); syncOwnerUi(); }, function () { paintBells(); syncOwnerUi(); });
          return p;
        }
      }
    } catch (e) {}
    try { paintBells(); syncOwnerUi(); } catch (e2) {}
    return Promise.resolve(getPermission());
  }
  function goToChat() {
    clearUnread();
    try {
      // Community chat now lives in the floating 💬 pop-up — open that instead of
      // jumping to the Home tab (the old inline cards are hidden).
      if (typeof window.__openCommPop === "function") { window.__openCommPop(); flashWrap(); return; }
      if (chatVisible()) { flashWrap(); return; }
      if (typeof window.showTab === "function") window.showTab("home");
      var tries = 0;
      (function wait() {
        if (chatVisible() || ++tries > 25) { flashWrap(); return; }
        setTimeout(wait, 250);
      })();
    } catch (e) {}
  }
  function flashWrap() {
    try {
      var w = wrap();
      if (!w) return;
      try { w.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e2) {}
      w.classList.remove("chat-flash");
      void w.offsetWidth;
      w.classList.add("chat-flash");
      setTimeout(function () { try { w.classList.remove("chat-flash"); } catch (e3) {} }, 1600);
    } catch (e) {}
  }
  function toast(who, snippet, channel) {
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
      var h = document.createElement("div");
      h.className = "chat-toast-head";
      h.textContent = "💬 " + who + (channel ? " · #" + channel : "");
      var b = document.createElement("div");
      b.className = "chat-toast-body";
      b.textContent = snippet || "New message in community chat — tap to view.";
      t.appendChild(h);
      t.appendChild(b);
      t.addEventListener("click", function () {
        try { t.remove(); } catch (e) {}
        goToChat();
      });
      stack.appendChild(t);
      while (stack.children.length > 4) stack.firstChild.remove();
      setTimeout(function () { try { t.remove(); } catch (e) {} }, 9000);
    } catch (e) {}
  }
  function osNotify(who, snippet, tag) {
    try {
      if (!("Notification" in window)) return false;
      if (Notification.permission !== "granted") return false;
      var n = new Notification(who, {
        body: snippet || "New message in community chat",
        tag: "t2i-chat-" + tag
      });
      n.onclick = function () {
        try { window.focus(); } catch (e) {}
        goToChat();
        try { n.close(); } catch (e2) {}
      };
      buzz();
      return true;
    } catch (e) { return false; }
  }
  function pageInFocus() {
    try { return document.visibilityState === "visible" && !!document.hasFocus(); }
    catch (e) { return false; }
  }
  function onNewComment(c) {
    try {
      if (!c) return;
      var k = keyOf(c);
      if (seen[k]) return;
      seen[k] = 1;
      if (c.byCurrentUser) return;
      if (!enabled()) return;
      var loud = watchOn();   // owner watch: ping even while staring at the chat
      var snippet = textOf(c.message).slice(0, 140);
      // Owner-gated mention ping: @owner/@admin/@mod/@everyone/@here always taps the
      // owner's device, even without full watch mode (still requires notifications on).
      var mention = isOwner() && mentionsOwner(c.message + " " + snippet);
      if (chatVisible() && !loud && !mention) return;
      unread += 1;
      paintTitle();
      paintBells();
      var who = authorOf(c);
      toast(who, snippet, (window.ChatGen ? window.ChatGen.disp(c.channel) : c.channel));
      osNotify("💬 " + who, snippet, k);
    } catch (e) {}
  }
  // ---- owner broadcast -> device ping (owner-gated send, user-gated receive) ----
  // Called for every NEW owner announcement (never for the replay on page load).
  // Respects the per-device bell: users who muted chat get the banner but no ping.
  function onAnnounce(text) {
    try {
      text = String(text == null ? "" : text);
      if (!text) return;
      if (text === lastAnnounceNotified) return;
      lastAnnounceNotified = text;
      if (!enabled()) return;
      unread += 1;
      paintTitle();
      paintBells();
      var short = text.length > 140 ? text.slice(0, 140) + "…" : text;
      toast("📣 Owner announcement", short, "");
      // Already looking at the site? Banner + toast is enough — save the OS ping
      // for backgrounded tabs, which is where device notifications matter.
      if (!pageInFocus()) osNotify("📣 Owner announcement", short, "announce");
      else buzz([30]);
    } catch (e) {}
  }
  function onLoadList(list) {
    try {
      var arr = list || [];
      for (var i = 0; i < arr.length; i++) seen[keyOf(arr[i])] = 1;
    } catch (e) {}
  }
  function hookDefaults(base) {
    try {
      var o = Object.create(base);
      o.onComment = function (c) { onNewComment(c); };
      o.onLoad = function (list) { onLoadList(list); };
      return o;
    } catch (e) { return base; }
  }
  function hookSingle(o) {
    try {
      o.onComment = function (c) { onNewComment(c); };
      o.onLoad = function (list) { onLoadList(list); };
    } catch (e) {}
    return o;
  }
  function hookShowTab() {
    try {
      if (typeof window.showTab !== "function" || window.__chatNotifyTabHook) return false;
      window.__chatNotifyTabHook = true;
      var prev = window.showTab;
      window.showTab = function () {
        var r = prev.apply(this, arguments);
        setTimeout(function () {
          try { if (chatVisible()) clearUnread(); } catch (e) {}
        }, 400);
        return r;
      };
      return true;
    } catch (e) { return false; }
  }
  // Wrap the owner-console banner renderer so live broadcasts also ping devices.
  // Safe vs. load-time replay: this script runs AFTER the console script installed
  // __t2iAnnounce, so the replay already happened and only NEW broadcasts notify.
  function hookAnnounce() {
    try {
      if (window.__chatNotifyAnnHook) return;
      if (typeof window.__t2iAnnounce !== "function") return false;
      window.__chatNotifyAnnHook = true;
      try { lastAnnounceNotified = String(window.__t2iLastAnnounce || "") || null; } catch (e) {}
      var prev = window.__t2iAnnounce;
      window.__t2iAnnounce = function (text) {
        var r = prev.apply(this, arguments);
        try { onAnnounce(text); } catch (e) {}
        return r;
      };
      return true;
    } catch (e) { return false; }
  }
  // Owner-console panel sync hook (filled in by src/owner-notify.js when it loads).
  function syncOwnerUi() {
    try { if (typeof window.__t2iOwnerNotifySync === "function") window.__t2iOwnerNotifySync(); } catch (e) {}
  }
  try {
    var st = document.createElement("style");
    st.textContent = "#chat-toast-stack{position:fixed;right:12px;bottom:12px;z-index:900;display:flex;flex-direction:column;gap:0.5rem;max-width:min(340px,calc(100vw - 24px));}body.is-android-mobile #chat-toast-stack{bottom:calc(76px + env(safe-area-inset-bottom));}.chat-toast{cursor:pointer;font:inherit;text-align:left;color:inherit;background:var(--th-modal,var(--th-surface));border:1px solid var(--th-accent);border-radius:12px;box-shadow:0 18px 50px -16px rgba(0,0,0,0.65);padding:0.6rem 0.75rem;display:flex;flex-direction:column;gap:0.2rem;animation:chat-toast-in 0.22s ease-out;}@keyframes chat-toast-in{from{transform:translateY(10px);opacity:0;}to{transform:none;opacity:1;}}.chat-toast-head{font-size:0.78rem;font-weight:700;opacity:0.9;}.chat-toast-body{font-size:0.84rem;line-height:1.4;opacity:0.85;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}.chat-nbell{float:right;margin-left:0.5rem;cursor:pointer;font:inherit;font-size:0.95rem;line-height:1;background:transparent;border:1px solid var(--th-border);border-radius:999px;padding:0.15rem 0.5rem;color:inherit;display:inline-flex;align-items:center;gap:0.3rem;}.chat-nbell:hover{border-color:var(--th-accent);}.chat-ncount{background:var(--th-accent);color:#fff;font-size:0.68rem;font-weight:700;border-radius:999px;padding:0.05rem 0.4rem;}#hm-community-wrap .chat-nbell{margin-left:auto;float:none;}#shared-comm-wrap.chat-flash{outline:2px solid var(--th-accent);outline-offset:4px;border-radius:12px;}";
    document.head.appendChild(st);
  } catch (e) {}
  ensureBells();
  hookAnnounce();
  try {
    var bellTimer = null;
    new MutationObserver(function () {
      if (bellTimer) return;
      bellTimer = setTimeout(function () {
        bellTimer = null;
        try { ensureBells(); } catch (e) {}
        try { if (hookAnnounce()) syncOwnerUi(); } catch (e2) {}
        try { paintBells(); } catch (e3) {}
      }, 300);
    }).observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  if (!hookShowTab()) {
    var nt = 0;
    (function retry() {
      if (hookShowTab() || ++nt > 40) return;
      setTimeout(retry, 500);
    })();
  }
  (function retryAnn() {
    if (hookAnnounce()) return;
    if (retryAnn.n == null) retryAnn.n = 0;
    if (++retryAnn.n > 40) return;
    setTimeout(retryAnn, 500);
  })();
  try {
    document.addEventListener("visibilitychange", function () {
      try { if (!document.hidden && chatVisible()) clearUnread(); } catch (e) {}
    });
    window.addEventListener("focus", function () {
      try { if (chatVisible()) clearUnread(); } catch (e) {}
    });
    document.addEventListener("pointerdown", function (e) {
      try {
        if (e.target && e.target.closest && e.target.closest("#" + WRAP_ID)) clearUnread();
      } catch (e2) {}
    }, true);
    // Owner lock/unlock flips loud mode effective state -> repaint bells + owner panel.
    document.addEventListener("t2i-owner-auth", function () { try { paintBells(); syncOwnerUi(); } catch (e) {} });
  } catch (e) {}
  return {
    hookDefaults: hookDefaults,
    hookSingle: hookSingle,
    goToChat: goToChat,
    clearUnread: clearUnread,
    isEnabled: enabled,
    setEnabled: setEnabled,
    isOwner: isOwner,
    isOwnerWatch: watchOn,
    isOwnerWatchStored: watchStored,
    setOwnerWatch: setWatch,
    getPermission: getPermission,
    requestOsPermission: requestOsPermission,
    onAnnounce: onAnnounce,
    test: function () {
      // Explicit test ping: bypasses the "looking at the chat" hush (the user asked for it).
      try {
        if (!enabled()) { toast("🔔 Muted", "Chat notifications are OFF — enable the 🔔 bell first.", ""); return true; }
        unread += 1;
        paintTitle();
        paintBells();
        var snippet = "Hello from the test bench — notifications work.";
        toast("Tester", snippet, "general");
        osNotify("💬 Tester", snippet, "selftest" + Date.now());
      } catch (e) {}
      return true;
    },
    testAnnounce: function () {
      onAnnounce("Test owner announcement — if you got an OS pop-up, broadcasts will reach this device.");
      return true;
    }
  };
})();
