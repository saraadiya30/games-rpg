/* flux/loader.js — lazy loader for the owner-only 🐺 Fluxinator private tab.
 *
 * The six src/flux/*.js modules are deliberately NOT static <script> tags in
 * index.html (they total ~220KB and only the owner ever opens that tab). The
 * private tab's native embed pulls this loader in via its `src:` property
 * (see src/private-tab.js), and dev-audit probes the result via `ensureFlux`
 * + the `__fluxLoaded` flag. Render path: loader -> window.FluxTab ->
 * renderNativeInto() re-entry renders into the pane.
 */
(function () {
  "use strict";
  if (window.__fluxLoaded || window.__fluxLoading) return;
  window.__fluxLoading = true;

  function cssOnce(id, href) {
    if (document.getElementById(id)) return;
    var l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }
  cssOnce("fluxCss", "src/flux/flux.css");
  cssOnce("fluxBoxesCss", "src/flux/boxes.css");

  var files = [
    "src/flux/prompt.js",
    "src/flux/boxes.js",
    "src/flux/std.js",
    "src/flux/photo.js",
    "src/flux/girls.js",
    "src/flux/tab.js"
  ];
  function next(i) {
    if (i >= files.length) {
      window.__fluxLoading = false;
      window.__fluxLoaded = true;
      return;
    }
    var s = document.createElement("script");
    s.src = files[i];
    s.onload = function () { next(i + 1); };
    s.onerror = function () {
      window.__fluxLoading = false;
      console.error("Failed to load " + files[i]);
    };
    document.body.appendChild(s);
  }
  next(0);
})();
