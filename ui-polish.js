/* ===== UI polish pack v1 — new elements + gentle motion =======================
   - #ui-scroll-progress: fixed top bar showing page scroll progress
   - #ui-backtop: floating back-to-top button (appears after scrolling)
   - .ui-reveal stagger: fades tool/stat/flow cards in on first view
   Runs once (guard __uiPolish), respects prefers-reduced-motion, and never
   touches layout logic — presentation only.
   ============================================================================ */
(function () {
  "use strict";
  if (window.__uiPolish) return;
  window.__uiPolish = true;

  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }

  /* ---- scroll progress + back-to-top ---- */
  var bar = document.createElement("div");
  bar.id = "ui-scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);

  var top = document.createElement("button");
  top.id = "ui-backtop";
  top.type = "button";
  top.title = "Back to top";
  top.setAttribute("aria-label", "Back to top");
  top.textContent = "↑";
  document.body.appendChild(top);
  top.addEventListener("click", function () {
    try { window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); }
    catch (e) { window.scrollTo(0, 0); }
  });

  var ticking = false;
  function update() {
    ticking = false;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var y = window.scrollY || window.pageYOffset || 0;
    var p = max > 0 ? Math.max(0, Math.min(1, y / max)) : 0;
    try { bar.style.transform = "scaleX(" + p + ")"; } catch (e) {}
    var show = y > 600;
    try { top.classList.toggle("show", show); } catch (e) {}
  }
  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    try { requestAnimationFrame(update); } catch (e) { update(); }
  }
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  update();

  /* ---- gentle reveal for cards (skip entirely under reduced motion) ---- */
  if (reducedMotion()) return;
  try {
    var sel = "#home-app .hm-tool, #home-app .hm-stat, #home-app .hm-flow, #home-app .hm-quick .hm-card";
    var els = Array.prototype.slice.call(document.querySelectorAll(sel));
    if (!els.length || !("IntersectionObserver" in window)) return;
    els.forEach(function (el) { el.classList.add("ui-reveal"); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("ui-in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
    /* safety: never leave cards invisible if the observer stalls */
    setTimeout(function () {
      try {
        Array.prototype.slice.call(document.querySelectorAll(".ui-reveal:not(.ui-in)")).forEach(function (el) { el.classList.add("ui-in"); });
      } catch (e) {}
    }, 2000);
    window.__uiPolishReveal = function () {
      try {
        Array.prototype.slice.call(document.querySelectorAll(sel)).forEach(function (el) {
          if (!el.classList.contains("ui-reveal")) {
            el.classList.add("ui-reveal");
            io.observe(el);
          }
        });
      } catch (e) {}
    };
  } catch (e) {}
})();
