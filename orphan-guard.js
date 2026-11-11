(function () {
  "use strict";
  if (window.__orphanGuardLoaded) return;
  window.__orphanGuardLoaded = true;

  var CHECKS = [
    { file: "src/chat-notify.js", hint: "chat notification bells (window.ChatNotify)", test: function () { return window.ChatNotify; } },
    { file: "src/custom-styles.js", hint: "custom styles panel (#t2iCustomStyles)", test: function () { return document.getElementById("t2iCustomStyles") || !document.querySelector('#i2p-imggen select[data-name="artStyle"]'); } },
    { file: "src/gen-reset.js", hint: "gen reset button (#gen-reset-btn)", test: function () { return document.getElementById("gen-reset-btn") || window.t2iResetImageGenerator || !document.getElementById("nexModeBar"); } },
    { file: "src/artstyle-search.js", hint: "art-style search box (#i2p-imggen .as-input)", test: function () { return document.querySelector('#i2p-imggen .as-input') || !document.querySelector('#i2p-imggen select[data-name="artStyle"]'); } },
    { file: "src/section-favorites.js", hint: "section favorites (window.__sectionFavs)", test: function () { return window.__sectionFavs || !document.querySelector('#i2p-imggen select[data-name="artStyle"]'); } },
    { file: "src/style-hints.js", hint: "art-style hover hints (window.__styleHintsPaint)", test: function () { return window.__styleHintsPaint; } },
    { file: "src/community-cap.js", hint: "community upload cap (window.CommunityCap)", test: function () { return window.CommunityCap; } },
    { file: "src/appfs.js", hint: "fullscreen hub button (window.__appFs)", test: function () { return window.__appFs; } },
    { file: "src/allmenu.js", hint: "menu hub button (#i2p-menu-btn)", test: function () { return document.getElementById("i2p-menu-btn"); } },
    { file: "src/media-player.js", hint: "music hub button (window.musicPlayer)", test: function () { return window.musicPlayer; } },
    { file: "src/backgrounds-hub.js", hint: "backgrounds hub button (window.siteBackgrounds)", test: function () { return window.siteBackgrounds; } },
    { file: "src/vault.js", hint: "prompt vault (window.Vault)", test: function () { return window.Vault; } },
    { file: "src/owner-tab.js", hint: "owner console (window.ensureOwnerTab)", test: function () { return window.ensureOwnerTab; } },
    { file: "src/owner-notify.js", hint: "owner notify section (window.__t2iOwnerNotifySync)", test: function () { return window.__t2iOwnerNotifySync; } },
    { file: "src/chat-gen.js", hint: "chat generations (window.ChatGen)", test: function () { return window.ChatGen; } },
    { file: "src/private-tab.js", hint: "private tabs (window.PrivateTabs)", test: function () { return window.PrivateTabs; } },
    { file: "src/avatar-media.js", hint: "media thumbnails (window.AvatarMedia)", test: function () { return window.AvatarMedia; } },
    { file: "src/framework-input-shim.js", hint: "framework input shim (window.__fireFrameworkInput)", test: function () { return window.__fireFrameworkInput; } },
    { file: "src/girls-generator.js", hint: "girls trait-engine backend (window.GirlsGenerator)", test: function () { return window.GirlsGenerator; } },
    { file: "src/gg-data.js", hint: "girls trait data (window.GGDATA)", test: function () { return window.GGDATA; } },
    { file: "src/gg-character-data.js", hint: "girls character data (window.GGCHARACTER)", test: function () { return window.GGCHARACTER; } },
    { file: "src/liquidizer/loader.js", hint: "liquidizer studio (window.LiquidizerTab)", test: function () { return window.LiquidizerTab; } },
    { file: "src/moderation.js", hint: "shared child-safety rules (window.__t2iMod)", test: function () { return window.__t2iMod; } },
    { file: "src/mod-review.js", hint: "flagged review queue (window.__modReviewEnsure)", test: function () { return window.__modReviewEnsure || !document.getElementById("t2i-owner-overlay"); } }
  ];

  function staticSrcScripts() {
    // NOTE: the engine rewrites static src="src/..." tags to absolute URLs
    // (https://perchance.org/src/...), while scripts injected at runtime keep
    // their relative "src/..." value — so match both, and normalize to a
    // "src/..." path for the known-file comparison below.
    var out = [];
    try {
      var tags = document.querySelectorAll('script[src*="src/"]');
      for (var i = 0; i < tags.length; i++) {
        var s = tags[i].getAttribute("src") || "";
        var m = s.match(/(src\/.+)$/);
        out.push(m ? m[1] : s);
      }
    } catch (e) {}
    return out;
  }

  var STATIC_SCRIPTS = staticSrcScripts();

  function runChecks(loud) {
    var failures = [];
    for (var i = 0; i < CHECKS.length; i++) {
      var ok = false;
      try { ok = !!CHECKS[i].test(); } catch (e) { ok = false; }
      if (!ok) failures.push(CHECKS[i]);
    }
    var known = { "src/orphan-guard.js": true };
    for (var j = 0; j < CHECKS.length; j++) known[CHECKS[j].file] = true;
    var unprobed = [];
    for (var k = 0; k < STATIC_SCRIPTS.length; k++) {
      if (!known[STATIC_SCRIPTS[k]]) unprobed.push(STATIC_SCRIPTS[k]);
    }
    if (!loud) return { failures: failures.map(function (f) { return f.file; }), unprobed: unprobed };
    for (var m = 0; m < failures.length; m++) {
      console.error('[orphan-guard] FEATURE APPEARS ORPHANED: ' + failures[m].file + ' loaded but ' + failures[m].hint + ' missing. Check its loader (ensure*/script tag) and its wiring.');
    }
    for (var n = 0; n < unprobed.length; n++) {
      console.error('[orphan-guard] NO LIVENESS PROBE: static script ' + unprobed[n] + ' has no CHECKS entry in src/orphan-guard.js and no row in src/FEATURES.md. Add both or remove the script tag.');
    }
    return { failures: failures.map(function (f) { return f.file; }), unprobed: unprobed };
  }

  window.__orphanGuardRecheck = function () { return runChecks(true); };

  var elapsed = 0;
  (function wait() {
    var bad = runChecks(false);
    elapsed += 5000;
    if (bad.failures.length === 0 && bad.unprobed.length === 0) return;
    if (elapsed >= 60000) { runChecks(true); return; }
    setTimeout(wait, 5000);
  })();
})();
