(function () {
  "use strict";
  if (window.FluxPrompt) return;
  function node(listName, key) {
    try {
      var list = window.root && window.root[listName];
      if (!list) return null;
      var n = list[key];
      return n || null;
    } catch (e) { return null; }
  }
  function evProp(n, prop) {
    try {
      if (!n || !n[prop]) return "";
      var v = n[prop].evaluateItem;
      return v == null ? "" : String(v);
    } catch (e) { return ""; }
  }
  function childNames(n) {
    try {
      var c = n && n.getChildNames;
      if (Array.isArray(c)) return c;
      if (typeof c === "function") return c.call(n) || [];
    } catch (e) {}
    return [];
  }
  function styleNodeByName(name) {
    return node("fluxArtStyles", name) || node("fluxTestStyles", name);
  }
  function styleKeys() {
    try { return window.root.fluxArtStyles.getAllKeys.slice(); } catch (e) { return ["no style"]; }
  }
  function testKeys() {
    try { return window.root.fluxTestStyles.getAllKeys.slice(); } catch (e) { return ["no test style"]; }
  }
  function longName(listName, key) {
    var n = node(listName, key);
    var s = evProp(n, "name");
    return s || key;
  }
  // Native port of styleFine()'s genre routing (read-only; mixer drop/manual layers need its UI).
  function fineTune(activeName) {
    var ff = window.fluxStyleFine || {};
    var enabled = ff.enabled !== false;
    var applyPos = (typeof ff.posOn === "boolean") ? ff.posOn : enabled;
    var applyNeg = (typeof ff.negOn === "boolean") ? ff.negOn : enabled;
    var overrides = ff.overrides || {};
    var name = String(activeName || "no style");
    var tags = null, genre = "", genrePos = "", genreNeg = "", tweakPos = "", tweakNeg = "";
    try {
      var sel = styleNodeByName(name);
      if (sel) {
        try {
          var m = sel["meta:tags"];
          if (m !== undefined && m !== null) {
            var v = (m && typeof m.evaluateItem === "object" && m.evaluateItem !== null) ? m.evaluateItem : m;
            if (v && typeof v === "object") tags = v;
          }
        } catch (e) {}
        var best = null, bestScore = 0;
        try {
          var all = window.root.styleGenres.selectAll;
          for (var gi = 0; gi < all.length; gi++) {
            var g = all[gi], score = 0, inList = false;
            try { inList = childNames(g.styles).includes(name); } catch (e2) {}
            if (inList) score = 999;
            else if (tags) {
              try {
                var tn = childNames(g.tags);
                for (var ti = 0; ti < tn.length; ti++) score = Math.max(score, Number(tags[tn[ti]] || 0));
              } catch (e3) {}
            }
            var ov = overrides[g.getName];
            if (ov === "off") score = 0;
            if (ov === "on") score = 999;
            if (score > bestScore) { bestScore = score; best = g; }
          }
        } catch (e4) {}
        if (best && bestScore > 0) {
          genre = best.getName;
          genrePos = evProp(best, "pos");
          genreNeg = evProp(best, "neg");
        }
        try {
          if (name && childNames(window.root.styleTweaks).includes(name)) {
            var tw = window.root.styleTweaks[name];
            tweakPos = evProp(tw, "pos");
            tweakNeg = evProp(tw, "neg");
            genre = genre ? (genre + " + " + name) : name;
          }
        } catch (e5) {}
      }
    } catch (e6) {}
    var R = window.root;
    var pos = R.joinStandard(genrePos, tweakPos);
    var neg = R.joinStandard(genreNeg, tweakNeg);
    return { pos: applyPos ? pos : "", neg: applyNeg ? neg : "", genre: genre };
  }
  function compose(st) {
    var R = window.root;
    try { window.__fluxDesc = String(st.desc || ""); } catch (e) {}
    try { window.__fluxNeg = String(st.neg || ""); } catch (e) {}
    try { window.__fluxStyle = String(st.style || "no style"); } catch (e) {}
    var tName = st.testStyle || "no test style";
    var tNode = node("fluxTestStyles", tName) || node("fluxTestStyles", "no test style");
    var testPrompt = evProp(tNode, "prompt");
    var testNeg = evProp(tNode, "negative");
    var activeName = (tName !== "no test style") ? tName : String(st.style || "no style");
    var fine = fineTune(activeName);
    var pos = testPrompt;
    try { pos = R.mixFilter(testPrompt, "pos"); } catch (e) {}
    try { pos = R.gushFilter(pos); } catch (e2) {}
    try { pos = R.ensureTags(R.ensureTags(pos, fine.pos)); } catch (e3) {}
    var neg = "";
    if (st.negOn !== false) {
      try { neg = R.ensureTags(R.mixFilter(testNeg, "neg"), fine.neg); } catch (e4) { neg = testNeg; }
    }
    // 👱‍♀️ Girls traits (merged from the Girls Generator tab): trait/booster/garment text
    // appends AFTER the Flux base. Flux wins on overlap — the girls side never supplies the
    // description, style, shape, count, guidance, seed, resolution or quality tails, so when
    // every trait is Default this block is empty and the prompt is byte-identical to Flux's.
    var girlsFlag = false;
    try {
      if (window.FluxGirls && typeof window.FluxGirls.extra === "function") {
        var g = window.FluxGirls.extra(String(st.desc || ""), activeName);
        if (g) {
          if (g.prompt) { pos = pos ? (pos + " " + g.prompt) : g.prompt; girlsFlag = true; }
          if (g.negative) { neg = neg ? (neg + ", " + g.negative) : g.negative; girlsFlag = true; }
        }
      }
    } catch (eG) {}
    var res = "768x512";
    try {
      var sh = String(st.shape || "auto");
      if (/^\d+x\d+$/.test(sh)) res = sh;
      else if (sh === "square") res = "512x512";
      else if (sh === "portrait") res = "512x768";
      else if (sh === "landscape") res = "768x512";
      else if (sh === "squarehd") res = "768x768";
    } catch (e5) {}
    var cfg = 7;
    try { cfg = Math.min(30, Math.max(1, Math.round(Number(st.cfg) || 7))); } catch (e6) {}
    var seed = null;
    try {
      var s = String(st.seed == null ? "" : st.seed).trim();
      if (s !== "" && Number.isFinite(Number(s))) seed = Math.floor(Number(s));
    } catch (e7) {}
    var title = "(" + activeName + ") " + String(st.desc || "").trim().slice(0, 80);
    // Kept in sync for promptBreakdown() + the flux prompt inspector convention.
    try { window.__fluxPromptPos = pos; } catch (e8) {}
    try { window.__fluxPromptNeg = neg; } catch (e9) {}
    return { prompt: pos, negative: neg, resolution: res, guidance: cfg, seed: seed, title: title, genre: fine.genre, activeStyle: activeName, girls: girlsFlag };
  }
  window.FluxPrompt = {
    styleKeys: styleKeys, testKeys: testKeys, longName: longName,
    fineTune: fineTune, compose: compose
  };
})();
