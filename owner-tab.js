(function () {
  "use strict";
  if (window.__ownerTabLoaded) return;
  window.__ownerTabLoaded = true;
  function $(id) { return document.getElementById(id); }
  function authed() {
    try { if (typeof window.__t2iIsOwnerAuthed === "function") return !!window.__t2iIsOwnerAuthed(); } catch (e) {}
    return window.__t2iOwnerAuthed === true;
  }
  function css() {
    if ($("ownerTabCss")) return;
    var s = document.createElement("style");
    s.id = "ownerTabCss";
    s.textContent =
      "#owner-tabhost .t2i-owner-box{width:min(720px,100%);margin:0 auto;max-height:none;overflow:visible;}" +
      "#owner-tabhost .t2i-owner-log{max-height:140px;}";
    document.head.appendChild(s);
  }
  function box() { return document.querySelector("#t2i-owner-overlay .t2i-owner-box") || document.querySelector("#owner-tabhost .t2i-owner-box"); }
  function overlay() { return $("t2i-owner-overlay"); }
  function hookOpen() {
    if (window.__ownerTabOpenHooked || !window.__t2iOwner) return;
    var orig = window.__t2iOwner.open;
    if (typeof orig !== "function") return;
    window.__ownerTabOpenHooked = true;
    window.__t2iOwner.open = function () {
      try {
        var ov = overlay(), b = box();
        if (ov && b && b.parentNode !== ov) ov.appendChild(b);
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  }
  function mountToTab() {
    var host = $("owner-tabhost"), ov = overlay(), b = box();
    if (!host || !ov || !b) return false;
    if (b.parentNode !== host) host.appendChild(b);
    ov.hidden = true;
    return true;
  }
  window.ensureOwnerTab = function (quiet) {
    css();
    hookOpen();
    var app = $("owner-app"), locked = $("owner-locked"), host = $("owner-tabhost");
    if (!app || !host) return;
    if (!authed()) {
      if (locked) locked.hidden = false;
      return;
    }
    if (locked) locked.hidden = true;
    if (!overlay() || !box()) {
      if (window.__t2iOwner && typeof window.__t2iOwner.open === "function") {
        try { window.__t2iOwner.open(); } catch (e) {}
        try { window.__t2iOwner.close(); } catch (e) {}
        hookOpen();
      } else {
        host.innerHTML = "";
        var n = document.createElement("div");
        n.style.cssText = "text-align:center;opacity:0.7;padding:2rem 1rem;";
        n.textContent = "Loading owner console…";
        host.appendChild(n);
        var tries = 0;
        (function wait() {
          if (authed() && window.__t2iOwner && overlay()) { try { window.ensureOwnerTab(); } catch (e) {} return; }
          if (++tries > 100) return;
          setTimeout(wait, 100);
        })();
        return;
      }
    }
    if (!mountToTab()) return;
    if (!quiet) {
      try { if (typeof window.__t2iOwnerRefresh === "function") window.__t2iOwnerRefresh(); } catch (e) {}
    } else {
      try { if (typeof window.__t2iOwnerRefresh === "function") window.__t2iOwnerRefresh(); } catch (e) {}
    }
  };
  function sync() {
    css();
    hookOpen();
    var b = $("i2p-tab-owner");
    if (b) b.hidden = !authed();
    var locked = $("owner-locked");
    if (locked && !authed()) locked.hidden = false;
    if (!authed()) {
      try {
        var ov = overlay(), bx = document.querySelector("#owner-tabhost .t2i-owner-box");
        if (ov && bx) ov.appendChild(bx);
      } catch (e) {}
      var host = $("owner-tabhost");
      if (host && !host.querySelector(".t2i-owner-box")) host.innerHTML = "";
      if (window.__activeTab === "owner" && window.showTab) window.showTab("home");
    } else if (window.__activeTab === "owner") {
      try { window.ensureOwnerTab(true); } catch (e) {}
    }
  }
  document.addEventListener("t2i-owner-auth", sync);
  window.addEventListener("focus", function () { try { sync(); } catch (e) {} });
  sync();
})();
