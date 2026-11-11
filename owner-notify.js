/* ---- 🔔 Owner-gated device notifications for community chat ----
 * Injects a "this device only" section into the 🔒 Owner console panel:
 *   • OS-permission status + enable button (Notification API — needs a user gesture)
 *   • 👑 Owner watch toggle: when ON *and* this browser is unlocked as owner,
 *     every community message pings this device even while looking at the chat,
 *     plus @owner/@admin/@mod/@everyone/@here mentions always tap the owner.
 *   • Test buttons for the chat ping and the broadcast ping.
 *
 * Owner gating model (deliberate, two-sided):
 *   SEND is owner-gated — only an unlocked owner can Broadcast, and only the
 *     owner's console has the watch toggle (the whole panel is password-locked).
 *   RECEIVE is user-gated — a broadcast ping only makes an OS pop-up on devices
 *     whose 🔔 bell is ON *and* that granted OS notification permission.
 *     Users who muted chat still see the banner, just with no pop-up.
 *
 * Hard limit (no code can dodge it here): there is no push server, so a device
 * can only be pinged while this site is OPEN in a tab (background tabs count on
 * desktop/Android; iOS needs the installed PWA with the page open). Closed tab /
 * killed browser = no ping. This panel says exactly that so nobody expects SMS.
 */
(function () {
  "use strict";
  if (window.__t2iOwnerNotifyLoaded) return;
  window.__t2iOwnerNotifyLoaded = true;

  var SEC_ID = "t2i-owner-notifysec";
  var injected = false;

  function notify() { return window.ChatNotify || null; }
  function isOwner() {
    try { if (typeof window.__t2iIsOwnerAuthed === "function") return !!window.__t2iIsOwnerAuthed(); } catch (e) {}
    try { return window.__t2iOwnerAuthed === true; } catch (e) { return false; }
  }
  function permText() {
    try {
      var n = notify();
      if (n && n.getPermission) return n.getPermission();
      if (!("Notification" in window)) return "unsupported";
      return Notification.permission;
    } catch (e) { return "?"; }
  }
  function bellOn() {
    try { var n = notify(); return n ? !!n.isEnabled() : true; }
    catch (e) { return true; }
  }
  function watchStored() {
    try { var n = notify(); return n ? !!n.isOwnerWatchStored() : false; }
    catch (e) { return false; }
  }

  function css() {
    if (document.getElementById("t2iOwnerNotifyCss")) return;
    var s = document.createElement("style");
    s.id = "t2iOwnerNotifyCss";
    s.textContent =
      "#t2i-owner-notifysec{border:1px solid var(--th-border,rgba(255,255,255,0.16));border-radius:12px;padding:0.6rem 0.7rem;margin-top:0.75rem;background:var(--th-field,rgba(255,255,255,0.05));}" +
      "#t2i-owner-notifysec .t2i-owner-lbl{margin-top:0;}" +
      ".t2i-owner-notifystat{font-size:0.76rem;line-height:1.6;opacity:0.88;margin:0.4rem 0;}" +
      ".t2i-owner-notifystat b{font-variant-numeric:tabular-nums;}" +
      ".t2i-owner-notifyrow{display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.4rem;}" +
      ".t2i-owner-notifyrow>.t2i-owner-btn{flex:1 1 0;font-size:0.78rem;}" +
      ".t2i-owner-watch{display:flex;align-items:flex-start;gap:0.45rem;font-size:0.78rem;line-height:1.45;margin-top:0.45rem;cursor:pointer;}" +
      ".t2i-owner-watch input{margin-top:0.15rem;width:1rem;height:1rem;accent-color:var(--th-accent,#ff69b4);flex-shrink:0;cursor:pointer;}" +
      ".t2i-owner-notifynote{font-size:0.7rem;line-height:1.5;opacity:0.65;margin-top:0.45rem;}";
    document.head.appendChild(s);
  }

  function sync() {
    try {
      var sec = document.getElementById(SEC_ID);
      if (!sec) return;
      var p = permText();
      var sig = p + "|" + (bellOn() ? "1" : "0") + "|" + (watchStored() ? "1" : "0") + "|" + (isOwner() ? "1" : "0");
      if (sig === sync._last) return;   // no DOM writes when nothing changed (else the
      sync._last = sig;                 // MutationObserver below would re-fire forever)
      var st = sec.querySelector("[data-nstat]");
      if (st) {
        var pTxt = p === "granted" ? "✅ granted" : p === "denied" ? "⛔ blocked (unblock in the browser's site settings)" : p === "unsupported" ? "❌ unsupported in this browser" : "⚪ not asked yet (" + p + ")";
        st.innerHTML =
          "This device: OS pop-ups <b>" + pTxt + "</b> · chat bell <b>" + (bellOn() ? "🔔 ON" : "🔕 OFF") + "</b>" +
          (isOwner() ? "" : " · <b>🔒 lock-state: not owner-unlocked</b> (watch is dormant until you unlock)");
      }
      var w = sec.querySelector("[data-nwatch]");
      if (w) w.checked = watchStored();
    } catch (e) {}
  }
  window.__t2iOwnerNotifySync = sync;

  function inject() {
    if (injected) { sync(); return true; }
    var panel = document.getElementById("t2i-owner-panel");
    if (!panel) return false;
    // Insert just above the site-wide announcement composer.
    var anchor = panel.querySelector('label[for="t2i-owner-msg"]');
    if (!anchor) return false;
    css();
    var sec = document.createElement("div");
    sec.id = SEC_ID;
    sec.innerHTML =
      '<div class="t2i-owner-lblrow"><span class="t2i-owner-lbl">🔔 Device notifications — community chat (this device only)</span></div>' +
      '<div class="t2i-owner-notifystat" data-nstat>Loading…</div>' +
      '<label class="t2i-owner-watch"><input type="checkbox" data-nwatch> <span><b>👑 Owner watch</b> — ping THIS device for <b>every</b> community message, even while I\'m looking at the chat (plus vibrate). Only works while this browser is unlocked as owner; locking drops back to normal pings without losing the setting.</span></label>' +
      '<div class="t2i-owner-notifyrow">' +
      '<button type="button" class="t2i-owner-btn" data-nenable>🔔 Enable OS pop-ups</button>' +
      '<button type="button" class="t2i-owner-btn" data-ntest>💬 Test chat ping</button>' +
      '<button type="button" class="t2i-owner-btn" data-ntesta>📣 Test broadcast ping</button>' +
      "</div>" +
      '<div class="t2i-owner-notifynote">How it works: anyone\'s device pings only if their 🔔 bell is ON <i>and</i> they allowed OS pop-ups — <b>the tab must stay open</b> (background tabs ping on desktop/Android; iOS needs the installed PWA with the page open). Closed tab = no ping: there is no push server here, so nothing can wake a killed page. Your <b>📣 Broadcast</b> below is the owner-gated ping — it shows a banner for everyone and pop-ups only the opted-in devices. Your watch toggle never affects anyone else\'s device.</div>';
    try { panel.insertBefore(sec, anchor); } catch (e) { return false; }
    injected = true;

    try {
      sec.querySelector("[data-nwatch]").addEventListener("change", function (e) {
        try { notify().setOwnerWatch(!!e.target.checked); } catch (err) {}
        sync();
        try { if (window.ChatNotify && window.ChatNotify.requestOsPermission && e.target.checked) window.ChatNotify.requestOsPermission(); } catch (err2) {}
      });
    } catch (e) {}
    try {
      sec.querySelector("[data-nenable]").addEventListener("click", function () {
        try {
          var n = notify();
          if (n && n.setEnabled) n.setEnabled(true);
          if (n && n.requestOsPermission) n.requestOsPermission().then(function () { sync(); });
          else sync();
        } catch (e) { sync(); }
      });
    } catch (e) {}
    try {
      sec.querySelector("[data-ntest]").addEventListener("click", function () {
        try { notify().test(); } catch (e) {}
      });
    } catch (e) {}
    try {
      sec.querySelector("[data-ntesta]").addEventListener("click", function () {
        try { notify().testAnnounce(); } catch (e) {}
      });
    } catch (e) {}
    sync();
    return true;
  }

  // The panel is built lazily on first open — poll + observe until the inject lands,
  // and re-sync on lock/unlock so the status line never lies.
  if (!inject()) {
    var tries = 0;
    (function retry() {
      if (inject() || ++tries > 120) return;
      setTimeout(retry, 500);
    })();
    try {
      var obs = new MutationObserver(function () {
        try {
          if (inject()) { try { obs.disconnect(); } catch (e2) {} }  // landed: stop observing
        } catch (e) {}                                               // (sync() writes DOM — never observe it)
      });
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  try {
    document.addEventListener("t2i-owner-auth", function () { setTimeout(sync, 100); });
    document.addEventListener("t2i-chatnotify-change", function () { setTimeout(sync, 100); });
    document.addEventListener("t2i-chatnotify-watch", function () { setTimeout(sync, 100); });
  } catch (e) {}
})();
