(function () {
  "use strict";
  if (window.LiquidizerTab) return;
  var CSS_ID = "liqCss";
  var FONT_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap";
  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var l = document.createElement("link");
    l.id = CSS_ID;
    l.rel = "stylesheet";
    l.href = "src/liquidizer/app.css";
    document.head.appendChild(l);
  }
  function loadFonts() {
    if (document.getElementById("liqFontCss") || document.getElementById("liqFontCssLink")) return;
    function link() {
      if (document.getElementById("liqFontCssLink")) return;
      var l = document.createElement("link");
      l.id = "liqFontCssLink";
      l.rel = "stylesheet";
      l.href = FONT_URL;
      document.head.appendChild(l);
    }
    function style(css) {
      var s = document.createElement("style");
      s.id = "liqFontCss";
      s.textContent = css;
      document.head.appendChild(s);
    }
    try {
      import("src/liquidizer/asset-cache.js")
        .then(function (a) { return a.fetchCached(FONT_URL); })
        .then(function (res) { return res.ok ? res.text() : ""; })
        .then(function (css) { if (css) style(css); else link(); })
        .catch(function () { link(); });
    } catch (e) { link(); }
  }
  function note(w, msg) {
    while (w.firstChild) w.removeChild(w.firstChild);
    var d = document.createElement("div");
    d.style.cssText = "text-align:center;opacity:0.7;padding:1.4rem 1rem;font-size:0.9rem;";
    d.textContent = msg;
    w.appendChild(d);
    return d;
  }
  function waitFlag(timeoutMs) {
    return new Promise(function (resolve) {
      var t0 = performance.now();
      (function poll() {
        if (window.__liquidizerBooted) return resolve(true);
        if (performance.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(poll, 120);
      })();
    });
  }
  function bootModule(fresh) {
    try { window.__liquidizerBooted = false; } catch (e) {}
    return new Promise(function (resolve) {
      var done = false;
      function fin(ok) { if (!done) { done = true; resolve(ok); } }
      var s = document.createElement("script");
      s.type = "module";
      s.src = "src/liquidizer/app.js" + (fresh ? "?v=" + Date.now() : "");
      s.onload = function () { waitFlag(15000).then(fin); };
      s.onerror = function () { fin(false); };
      document.body.appendChild(s);
      setTimeout(function () { waitFlag(15000).then(fin); }, 500);
    });
  }
  function failed(w, err) {
    var d = note(w, "Liquidizer could not start here (" + err + "). Save the generator once (src/ files need saving to preview) and reload. ");
    var b = document.createElement("button");
    b.type = "button";
    b.className = "pro-btn";
    b.textContent = "↻ Retry";
    b.style.cssText = "margin-left:0.5rem;cursor:pointer;";
    b.addEventListener("click", function () { render(w); });
    d.appendChild(b);
  }
  function render(w) {
    if (window.__liquidizerBooted && !w.firstChild) {
      reload(w);
      return;
    }
    ensureCss();
    loadFonts();
    note(w, "Loading Liquidizer…");
    fetch("src/liquidizer/markup.html").then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    }).then(function (html) {
      while (w.firstChild) w.removeChild(w.firstChild);
      var root = document.createElement("div");
      root.id = "liq-root";
      root.innerHTML = html;
      w.appendChild(root);
      return bootModule(false);
    }).then(function (ok) {
      if (!ok) failed(w, "app boot timed out");
    }).catch(function (e) {
      failed(w, (e && e.message) || e);
    });
  }
  function reload(w) {
    try { if (window.__liqCancelLoop) window.__liqCancelLoop(); } catch (e) {}
    ensureCss();
    loadFonts();
    note(w, "Reloading Liquidizer…");
    fetch("src/liquidizer/markup.html").then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    }).then(function (html) {
      while (w.firstChild) w.removeChild(w.firstChild);
      var root = document.createElement("div");
      root.id = "liq-root";
      root.innerHTML = html;
      w.appendChild(root);
      return bootModule(true);
    }).then(function (ok) {
      if (!ok) failed(w, "app boot timed out");
    }).catch(function (e) {
      failed(w, (e && e.message) || e);
    });
  }
  window.LiquidizerTab = { render: render, reload: reload };
})();
