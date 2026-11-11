(function () {
  "use strict";
  if (window.__appFsLoaded) return;
  window.__appFsLoaded = true;
  function $(id) { return document.getElementById(id); }
  function isActive() { return !!document.fullscreenElement; }

  function css() {
    if ($("appFsCss")) return;
    var s = document.createElement("style");
    s.id = "appFsCss";
    s.textContent =
      "#appfs-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:96000;background:var(--th-modal,var(--th-surface));border:1px solid var(--th-border);border-radius:999px;padding:0.45rem 0.9rem;font-size:0.82rem;box-shadow:0 12px 30px -12px rgba(0,0,0,0.7);}" +
      "#appfs-toast[hidden]{display:none;}" +
      "html.app-fs #i2p-brand{display:none;}" +
      "html.app-fs body #i2p-tabs{display:none;}" +
      "html.app-fs body #i2p-simplebar{display:none;}" +
      "html.app-fs #i2p-headbar{padding:0.4rem 0.9rem;}" +
      "html.app-fs #i2p-hubbar{margin:0 auto;justify-content:center;}";
    document.head.appendChild(s);
  }

  var toastTimer = null;
  function toast(msg) {
    css();
    var t = $("appfs-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "appfs-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  function sync() {
    var b = $("i2p-fs-btn");
    var on = isActive();
    document.documentElement.classList.toggle("app-fs", on);
    if (b) {
      var ico = b.querySelector(".i2p-hubico");
      var lbl = b.querySelector(".i2p-hublbl");
      if (ico) ico.textContent = on ? "✕" : "⛶";
      if (lbl) lbl.textContent = on ? "Exit" : "Fullscreen";
      b.title = on ? "Exit fullscreen (Esc)" : "Fill the screen with this studio";
    }
  }

  function enter() {
    var el = document.documentElement;
    if (!el.requestFullscreen) { toast("Fullscreen isn't supported in this browser."); return; }
    try {
      var p = el.requestFullscreen();
      if (p && p.catch) p.catch(function () {
        toast("Fullscreen was blocked here — open the public page for true fullscreen.");
      });
    } catch (e) {
      toast("Fullscreen was blocked here — open the public page for true fullscreen.");
    }
  }
  function exit() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        var p = document.exitFullscreen();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) {}
  }
  function toggle() { if (isActive()) exit(); else enter(); }

  function ensureButton() {
    if ($("i2p-fs-btn")) { sync(); return; }
    var hub = $("i2p-hubbar");
    if (!hub) return;
    css();
    var b = document.createElement("button");
    b.id = "i2p-fs-btn";
    b.type = "button";
    b.className = "i2p-hubbtn";
    var ico = document.createElement("span");
    ico.className = "i2p-hubico";
    ico.textContent = "⛶";
    var lbl = document.createElement("span");
    lbl.className = "i2p-hublbl";
    lbl.textContent = "Fullscreen";
    b.appendChild(ico);
    b.appendChild(lbl);
    b.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    var menu = $("i2p-menu-btn");
    if (menu && menu.nextSibling) hub.insertBefore(b, menu.nextSibling);
    else if (menu) hub.appendChild(b);
    else hub.insertBefore(b, hub.firstChild);
    sync();
  }

  document.addEventListener("fullscreenchange", sync);
  ensureButton();
  setTimeout(ensureButton, 0);

  window.__appFs = { toggle: toggle, enter: enter, exit: exit, isActive: isActive };
})();
