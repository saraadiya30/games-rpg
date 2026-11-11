// PAGE_EVAL ONLY — never add a <script> tag for this file: it uses top-level return and runs via page_eval {path:"src/dev-audit.js"}. See src/FEATURES.md.
var __devAuditReport = { boot: [], lazy: [], summary: {} };
(function () {
  function has(path) {
    try {
      var parts = path.split(".");
      var cur = window;
      for (var i = 0; i < parts.length; i++) {
        if (cur == null || !(parts[i] in cur)) return false;
        cur = cur[parts[i]];
      }
      return cur !== undefined && cur !== null;
    } catch (e) { return false; }
  }
  function el(sel) { try { return !!document.querySelector(sel); } catch (e) { return false; } }
  var bootChecks = [
    ["chat-notify", function () { return has("ChatNotify.hookDefaults") && el(".shared-comm .pro-card-head .chat-nbell") && el("#hm-community-wrap .chat-nbell") && el("#comm-fab") && el("#comm-pop-head .chat-nbell"); }],
    ["custom-styles", function () { return el("#t2iCustomStyles"); }],
    ["community-cap", function () { return has("CommunityCap.canPost"); }],
    ["appfs", function () { return has("__appFs.toggle") && el("#i2p-fs-btn"); }],
    ["allmenu", function () { return el("#i2p-menu-btn"); }],
    ["media-player", function () { return has("musicPlayer.open") && el("#mp-hub-btn"); }],
    ["backgrounds-hub", function () { return has("siteBackgrounds.open") && el("#bg-hub-btn"); }],
    ["vault", function () { return has("Vault.open") || has("Vault.add"); }],
    ["owner-tab", function () { return has("ensureOwnerTab"); }],
    ["private-tab", function () { return has("PrivateTabs"); }],
    ["avatar-media", function () { return has("AvatarMedia.thumbHtml"); }],
    ["framework-input-shim", function () { return has("__fireFrameworkInput"); }],
    ["girls-generator", function () { return has("GirlsGenerator.render"); }],
    ["gg-data", function () { return has("GGDATA"); }],
    ["gg-character-data", function () { return has("GGCHARACTER"); }],
    ["liquidizer-loader", function () { return has("LiquidizerTab.render"); }],
    ["orphan-guard", function () { return has("__orphanGuardRecheck"); }]
  ];
  var lazyChecks = [
    ["gallery", "ensureGallery", "__galleryLoaded", function () { return has("t2iOpenGallery"); }],
    ["gen-extras", "ensureGenExtras", "__genExtrasLoaded", function () { return has("t2i_autosavePersonaPrompt"); }],
    ["gen-persona-ui", "ensureGenExtras", "__genPersonaUiLoaded", function () { return !!(window.t2i_openCharacterDescriptionEditor && window.t2i_openCharacterDescriptionEditor.__t2iPcCleanWrapped); }],
    ["evo", "ensureEvo", "__evoLoaded", function () { return has("evoSetVisible"); }],
    ["editor", "ensureEditor", "__editorLoaded", function () { return has("__editorOnShow"); }],
    ["aiedit", "ensureAiedit", "__aieditLoaded", function () { return has("__aieditOnShow"); }],
    ["comic", "ensureComic", "__comicLoaded", function () { return has("__comicOnShow"); }],
    ["persona", "ensurePersona", "__personaTabLoaded", function () { return has("__personaOnShow"); }],
    ["persona-board", "ensureBoard", "__boardLoaded", function () { return has("__boardOnShow"); }],
    ["explore", "ensureExplore", "__exploreLoaded", function () { return has("__exploreOnShow"); }],
    ["pro-imager", "ensureProApp", "__proAppLoaded", function () { return has("__proBoot") || has("__proReady"); }],
    ["flux", "ensureFlux", "__fluxLoaded", function () { return has("FluxTab.render"); }],
    ["social-convert", "ensureSocialConvert", "__socialConvertLoaded", function () { return has("__socialConvertOnShow"); }],
    ["emoji-browser", "ensureEmojiBrowser", "__emojiBrowserLoaded", null],
    ["name-roller", "ensureNameRoller", "__nameRollerLoaded", null],
    ["ai-helper", "ensureHelper", "__helperLoaded", function () { return has("__helperOnShow"); }],
    ["classic", "ensureClassic", "__classicLoaded", function () { return has("__classicOnShow"); }],
    ["world", "ensureWorld", "__worldLoaded", function () { return has("__worldOnShow"); }],
    ["style-forge", null, null, function () { return has("StyleForge.render"); }]
  ];
  for (var i = 0; i < bootChecks.length; i++) {
    var ok = false;
    try { ok = !!bootChecks[i][1](); } catch (e) { ok = false; }
    __devAuditReport.boot.push({ id: bootChecks[i][0], status: ok ? "PASS" : "FAIL" });
  }
  // DOM inventory (mirrors src/APP_LOG.md §1–2): catches deleted nav buttons,
  // panes, and chrome elements that no script loader would ever flag.
  var domChecks = [
    "i2p-tab-home", "i2p-tab-i2p", "i2p-tab-gen", "i2p-tab-evo", "i2p-tab-gallery",
    "i2p-tab-explore", "i2p-tab-comm", "i2p-tab-forge", "i2p-tab-story", "i2p-tab-listings", "i2p-tab-theme", "i2p-tab-helper", "i2p-tab-edit",
    "i2p-tab-aiedit", "i2p-tab-comic", "i2p-tab-persona", "i2p-tab-board", "i2p-tab-chat",
    "i2p-tab-chatlite", "i2p-tab-world", "i2p-tab-links", "i2p-tab-social", "i2p-tab-credits",
    "i2p-tab-private", "i2p-tab-owner",
    "home-app", "i2p-app", "i2p-imggen", "evo-app", "gallery-app", "explore-app",
    "comm-app", "forge-app", "forge-host", "story-app", "listings-app", "theme-app", "helper-app", "edit-app", "i2p-aiedit",
    "comic-app", "persona-app", "board-app", "world-app", "chat-app", "classic-host", "chatlite-app", "links-app",
    "social-app", "credits-app", "private-app", "priv-pane", "owner-app", "owner-tabhost",
    "i2p-header", "i2p-tabs", "i2p-hubbar", "i2p-lang-btn", "i2p-cmd-btn", "i2p-vault-btn",
    "i2p-hub-roster", "i2p-hub-emojis", "i2p-save-all", "i2p-bookmark-btn", "i2p-menu-btn",
    "i2p-fs-btn", "i2p-scrollprog", "comm-backtop"
  ];
  __devAuditReport.dom = [];
  for (var k = 0; k < domChecks.length; k++) {
    var dok = false;
    try { dok = !!document.getElementById(domChecks[k]); } catch (e) {}
    __devAuditReport.dom.push({ id: domChecks[k], status: dok ? "PASS" : "FAIL" });
  }
  for (var j = 0; j < lazyChecks.length; j++) {
    var name = lazyChecks[j][0], loader = lazyChecks[j][1], flag = lazyChecks[j][2], probe = lazyChecks[j][3];
    if (!loader) {
      var direct = false;
      try { direct = probe ? !!probe() : true; } catch (e) {}
      __devAuditReport.lazy.push({ id: name, status: direct ? "PASS" : "SKIPPED", note: direct ? "loaded" : "not loaded yet — open its tab, then re-run" });
      continue;
    }
    var loaderOk = false;
    try { loaderOk = typeof window[loader] === "function"; } catch (e) {}
    if (!loaderOk) { __devAuditReport.lazy.push({ id: name, status: "FAIL", note: "loader " + loader + "() missing" }); continue; }
    var loaded = !!window[flag];
    if (!loaded) { __devAuditReport.lazy.push({ id: name, status: "SKIPPED", note: "not loaded yet — open its tab, then re-run" }); continue; }
    if (!probe) { __devAuditReport.lazy.push({ id: name, status: "PASS", note: "loaded (no functional probe)" }); continue; }
    var pok = false;
    try { pok = !!probe(); } catch (e) { pok = false; }
    __devAuditReport.lazy.push({ id: name, status: pok ? "PASS" : "FAIL" });
  }
  var fails = 0;
  __devAuditReport.boot.forEach(function (r) { if (r.status === "FAIL") fails++; });
  __devAuditReport.lazy.forEach(function (r) { if (r.status === "FAIL") fails++; });
  __devAuditReport.dom.forEach(function (r) { if (r.status === "FAIL") fails++; });
  __devAuditReport.summary = { failures: fails, verdict: fails === 0 ? "ALL GREEN" : fails + " FAILURE(S) — see rows" };
})();
return __devAuditReport;
