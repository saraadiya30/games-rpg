(function () {
  "use strict";
  function fireText(el, ev) {
    try {
      var fn = window.___inputElInputEvent746291937;
      if (typeof fn === "function" && el && el.dataset && el.dataset.name) {
        fn.call(el, ev || {});
        return;
      }
    } catch (e) {}
    try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
  }
  function fireSelect(el, ev) {
    try {
      var fn = window.___selectElChangeEvent746291937;
      if (typeof fn === "function" && el && el.dataset && el.dataset.name) {
        fn.call(el, ev || {});
        return;
      }
    } catch (e) {}
    try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
  }
  function fixEl(el) {
    try {
      if (!el || el.nodeType !== 1) return;
      var tag = el.tagName;
      if ((tag === "INPUT" || tag === "TEXTAREA") && typeof el.oninput !== "function") {
        el.oninput = function (ev) { fireText(el, ev); };
      }
      if (tag === "SELECT" && typeof el.onchange !== "function") {
        el.onchange = function (ev) { fireSelect(el, ev); };
      }
    } catch (e) {}
  }
  function ensure(node) {
    try {
      if (!node) return;
      if (node.nodeType === 1) fixEl(node);
      var list = node.querySelectorAll ? node.querySelectorAll(".input-ctn input, .input-ctn textarea, .input-ctn select") : [];
      for (var i = 0; i < list.length; i++) fixEl(list[i]);
    } catch (e) {}
  }
  window.__fireFrameworkInput = function (el) {
    try {
      if (!el || el.nodeType !== 1) return false;
      if (el.tagName === "SELECT") fireSelect(el, {});
      else fireText(el, {});
      return true;
    } catch (e) { return false; }
  };
  ensure(document);
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) ensure(added[j]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
  var n = 0;
  (function backstop() {
    ensure(document);
    if (++n < 40) setTimeout(backstop, 500);
  })();
})();
