(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  // ---------- AI prompt text (prefix-cache friendly: SCAN_SYS + scan log first, task last) ----------
  var SCAN_SYS = "You are a meticulous comic-book analyst. You are shown pages of a comic, one page at a time, and you take detailed notes so that another writer can later reconstruct the full story and every character. Study each page carefully — read every speech bubble, caption and sound effect, and look at every panel, background and character design. Take COMPACT but information-dense notes.";
  var PAGE_TASK = function (n, total) {
    return "TASK: this is page " + n + " of " + total + ". Look carefully at every panel, every speech bubble, thought bubble, caption box and sound effect. Reply with ONLY ONE JSON object and nothing else, in exactly this shape:\n" +
      '{"notes":"...","lang":"...","transcript":[...]}\n' +
      "notes — compact notes under 140 words covering: what happens on the page beat by beat, in order; every character who appears (name or description, and what they do); the place/time and visual details that matter (art style, colors, mood). Be factual; do not guess or invent.\n" +
      "lang — the name of the language the comic itself is written in (e.g. \"Japanese\", \"French\", \"English\"), detected from the lettering on this page. Give the English name of the language.\n" +
      "transcript — the COMPLETE transcript of the page as an array of objects, in strict reading order (panel by panel, left-to-right then top-to-bottom). Include EVERY speech bubble and thought bubble, word for word and verbatim IN ITS ORIGINAL LANGUAGE — do NOT translate, paraphrase, edit or skip any line, however minor. Also include caption/narration boxes, attributed to the speaker \"Narrator\". Omit sound effects (like BOOM or CRASH) and lettering that is not spoken.\n" +
      "Each transcript item must be {\"speaker\":\"...\",\"text\":\"...\"}:\n" +
      "- speaker: the character's exact name if the comic gives or clearly implies it, otherwise a brief identification that lets the reader tell them apart (e.g. \"bearded man\", \"woman in red\", \"off-panel voice\") — never leave it empty.\n" +
      "- text: the line exactly as written in the bubble, in the comic's original language, preserving the wording and punctuation.\n" +
      "Example shape: {\"notes\":\"...\",\"lang\":\"Japanese\",\"transcript\":[{\"speaker\":\"Narrator\",\"text\":\"Meanwhile, across town.\"},{\"speaker\":\"Bob\",\"text\":\"I knew you would come.\"}]}";
  };
  // ---------- translation (a separate, text-only pass run AFTER the scan) ----------
  // The scan stores the dialogue verbatim in the comic's own language; this prompt
  // drives every translate call (transcript lines, story synopsis, character prose).
  var TRANSLATE_SYS = "You are an expert comic translator. You translate written text faithfully and idiomatically: you preserve the exact meaning, tone, character voice and any honorifics or cultural references, you never summarize, censor, soften or add anything, and you keep proper names unchanged. Reply with ONLY the requested result — no preamble, notes or explanation.";

  var COMPACT_TASK = "TASK: The page notes below are getting long. Summarize them, folding in the [Earlier summary...] block if one is present. Preserve every named character, key plot event, relationship, and any verbatim dialogue that matters. Output ONLY the new summary text as terse bullet points — no preamble.";
  var STORY_TASK = "TASK: Using the notes above, write a LONG, rich story description of this comic — a detailed synopsis like a wiki article. Cover the premise and world/setting, the main plot from beginning to end, major subplots, the tone and themes, the art style if it can be inferred, and how the story ends or where it leaves off. Write flowing multi-paragraph prose with specific names, places and events taken from the notes. Do not invent events, characters or details that are not in the notes. Output only the synopsis.";
  var LIST_TASK = function (max) {
    return "TASK: From the notes above, list the most important characters in order of prominence. Return ONLY a JSON array, with no other text, of the form:\n[{\"name\":\"...\",\"role\":\"one-line role\"}]\nInclude at most " + max + " characters. Use each character's exact name as it appears in the notes.";
  };
  var PROFILE_TASK = function (name) {
    return "TASK: Write a detailed profile for the character \"" + name + "\". Return ONLY a single JSON object with no other text, using exactly these keys:\n{\"name\":\"\",\"role\":\"\",\"appearance\":\"\",\"personality\":\"\",\"background\":\"\",\"arc\":\"\",\"prompt\":\"\"}\n" +
      "appearance = a rich physical description as the comic shows them (build, hair, eyes, outfit, distinguishing marks).\n" +
      "personality = their temperament, traits, quirks, flaws, how they talk.\n" +
      "background = their backstory and motivations as shown in the notes.\n" +
      "arc = how they change or what role they play across the story.\n" +
      "prompt = a ready-to-use text-to-image prompt that recreates this character faithfully: full appearance + outfit, the comic's art style, and a portrait composition, e.g. \"portrait of ... , [art style of this comic], highly detailed\". The `prompt` value must ALWAYS be written in ENGLISH, even when the rest of the profile is in another language — image models understand English best.\n" +
      "Output ONLY the JSON object.";
  };
  // One-shot variant: profiles for every listed character in a single call (much faster than N calls).
  var PROFILE_ALL_TASK = function (count, focus) {
    return "TASK: Write a detailed profile for EACH of the " + count + " characters listed at the very end of this prompt, in the SAME ORDER they are listed. Return ONLY a JSON array with no other text, where every element is an object with exactly these keys:\\n" +
      "{\"name\":\"\",\"role\":\"\",\"appearance\":\"\",\"personality\":\"\",\"background\":\"\",\"arc\":\"\",\"prompt\":\"\"}\\n" +
      "name = the character's name exactly as listed/in the notes.\\n" +
      "appearance = a rich physical description as the comic shows them (build, hair, eyes, outfit, distinguishing marks).\\n" +
      "personality = their temperament, traits, quirks, flaws, how they talk.\\n" +
      "background = their backstory and motivations as shown in the notes.\\n" +
      "arc = how they change or what role they play across the story.\\n" +
      "prompt = a ready-to-use text-to-image prompt that recreates this character faithfully: full appearance + outfit, the comic's art style, and a portrait composition, e.g. \"portrait of ... , [art style of this comic], highly detailed\". The `prompt` value must ALWAYS be written in ENGLISH, even when the rest of the profile is in another language — image models understand English best.\\n" +
      "Output ONLY the JSON array of " + count + " objects." + (focus ? "\nAlso highlight how each character relates to: " + focus : "");
  };

  // ---------- config ----------
  var MAX_AUTO = 12;
  var FAST_CONCURRENCY = 3; // pages read at once in Fast mode (server queues excess)
  var IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
  var MIME_BY_EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp" };

  // ---------- dom refs (filled on first show) ----------
  var dropzone, fileInput, dzIdle, dzLoaded, filenameEl, filesizeEl, removeBtn;
  var scanCountSel, maxCharsSel, focusInput, runBtn, stopBtn, statusEl, fastToggle;
  var translateSel, langCustomInput, toggleOrigBtn, translateCard, translateRunBtn, translateStatusEl;
  var progressWrap, progressFill, progressLabel;
  var pageCountEl, stripEl, autoBtn, pagesHeadEl, stripHintEl, viewPagesBtn;
  var selToolsEl, rangeFromEl, rangeToEl, rangeSelectBtn, rangeSampleBtn, selectAllBtn, selectNoneBtn, selectInvertBtn, selCountEl;
  var readerEl, readerTitle, readerScroll, readerPos, readerPrev, readerNext, readerClose;
  var storyEl, copyStoryBtn, charsEl, copyCharsBtn, downloadBtn, downloadTxtBtn, reportActions, outWrap;
  var storyCard, transcriptCard, charsCard, transcriptEl, copyTranscriptBtn, transcriptCountEl;

  // ---------- state ----------
  var pages = [];          // { blob, name }
  var selection = [];      // array of page indices chosen to scan
  var manual = false;      // true once the user hand-picks pages
  var lastAnchor = -1;     // last clicked page (for shift-click range selects)
  var dragging = false, dragAdd = true, dragAnchor = -1; // drag-across-pages paint select
  var busy = false, stopped = false, booted = false;
  var fflatePromise = null;
  var summary = "", log = [], compacting = false;
  var currentGen = null;
  var activeGens = [];     // all in-flight generateText promises (fast mode overlaps several)
  function beginGen(p) { activeGens.push(p); currentGen = p; return p; }
  function endGen(p) {
    var i = activeGens.indexOf(p);
    if (i >= 0) activeGens.splice(i, 1);
    currentGen = activeGens.length ? activeGens[activeGens.length - 1] : null;
  }
  function stopGens() {
    for (var i = activeGens.length - 1; i >= 0; i--) {
      var g = activeGens[i];
      if (g && g.stop) { try { g.stop(); } catch (e) {} }
    }
  }
  var lastReport = { story: "", transcript: [], characters: [] };
  var totalDialogue = 0;
  var targetLang = "";     // language the current report has been translated into ("" = untranslated, showing originals)
  var srcLang = "";        // the comic's language, as detected from the scanned pages
  var translating = false; // true while the post-scan translation pass is running

  // ---------- small helpers ----------
  function setStatus(msg, spin) {
    statusEl.classList.toggle("i2p-spin", !!spin);
    if (!msg) { statusEl.hidden = true; statusEl.textContent = ""; }
    else { statusEl.textContent = msg; statusEl.hidden = false; }
  }
  function setBusy(b) {
    busy = b;
    runBtn.disabled = b || !pages.length;
    runBtn.textContent = b ? "⏳ Working…" : "🔍 Scan & write";
    stopBtn.hidden = !b;
  }
  function setProgress(pct, label) {
    if (!pct && !label) { progressWrap.hidden = true; return; }
    progressWrap.hidden = false;
    progressFill.style.width = Math.max(0, Math.min(100, pct || 0)) + "%";
    progressLabel.textContent = label || "";
  }
  function flash(btn, msg) {
    var old = btn.textContent;
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = old; }, 1600);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }
  function mimeFor(name) {
    var m = (name.match(/\.([^.]+)$/) || [])[1];
    return (m && MIME_BY_EXT[m.toLowerCase()]) || "image/jpeg";
  }
  function getFFlate() {
    if (!fflatePromise) {
      fflatePromise = import("https://esm.sh/fflate").catch(function (e) {
        fflatePromise = null;
        throw e;
      });
    }
    return fflatePromise;
  }
  function getMeta() {
    try { return window.root.generateText({ getMetaObject: true }); }
    catch (e) { return null; }
  }
  function scanContextText() {
    var parts = [];
    if (summary) parts.push("[Earlier summary of the comic:\n" + summary + "]");
    for (var i = 0; i < log.length; i++) parts.push(log[i]);
    return parts.join("\n\n");
  }
  // Fixed comic-level prefix shared by every page call in Fast mode — identical text so the
  // server's prefix cache is reused across all parallel page reads (only the image differs, and
  // it sits last in the instruction).
  function scanBaseText() {
    var focus = focusInput.value.trim();
    return SCAN_SYS + (focus ? "\n\nPay extra attention to: " + focus : "");
  }
  // Run up to `limit` async workers at once over indices 0..count-1; stops early if `stopped`.
  async function mapLimit(count, limit, worker) {
    var next = 0;
    async function runner() {
      while (!stopped) {
        var i = next++;
        if (i >= count) return;
        await worker(i);
      }
    }
    var runners = [];
    var n = Math.max(1, Math.min(limit, count));
    for (var k = 0; k < n; k++) runners.push(runner());
    await Promise.all(runners);
  }
  function overBudget() {
    var meta = getMeta();
    if (!meta) return false;
    return meta.countTokens(SCAN_SYS + "\n\n" + scanContextText()) + 570 >= meta.idealMaxContextTokens * 0.85;
  }
  async function compactToFit() {
    for (var guard = 0; guard < 6; guard++) {
      if (stopped || log.length <= 1 || !overBudget()) return;
      await compact();
    }
  }
  function resolveTargetLang() {
    if (!translateSel) return "";
    var v = translateSel.value;
    if (v === "__other__") return (langCustomInput && langCustomInput.value.trim()) || "";
    return v || "";
  }
  function extractJSON(text) {
    if (!text) return null;
    var clean = String(text).replace(/```[a-z]*\s*/gi, "").replace(/```/g, "").trim();
    try { return JSON.parse(clean); } catch (e) {}
    var m = clean.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
    m = clean.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
    return null;
  }
  function cleanLine(s) {
    s = String(s == null ? "" : s).trim();
    if (s.length >= 2) {
      var a = s[0], b = s[s.length - 1];
      if ((a === '"' && b === '"') || (a === "\u201c" && b === "\u201d") || (a === "'" && b === "'") || (a === "\u2018" && b === "\u2019")) {
        s = s.slice(1, -1).trim();
      }
    }
    return s;
  }

  // ---------- page thumbnails & selection ----------
  function makeThumb(page) {
    var blob = page.blob;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        try {
          page.w = img.naturalWidth || 0;
          page.h = img.naturalHeight || 0;
          var w = 120, h = Math.max(1, Math.round((img.naturalHeight || 1) * (w / (img.naturalWidth || 1))));
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/jpeg", 0.75));
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
      img.src = url;
    });
  }
  function markManual() {
    manual = true;
    if (autoBtn) autoBtn.hidden = false;
  }
  function setPage(idx, on) {
    var pos = selection.indexOf(idx);
    if (on && pos < 0) selection.push(idx);
    else if (!on && pos >= 0) selection.splice(pos, 1);
  }
  function sortSel() { selection.sort(function (a, b) { return a - b; }); }
  function togglePage(idx) {
    markManual();
    setPage(idx, selection.indexOf(idx) < 0);
    sortSel();
    lastAnchor = idx;
    renderSelection();
  }
  // Select (on=true) or deselect every page between two indices, inclusive.
  function paintSpan(a, b, on) {
    var lo = Math.min(a, b), hi = Math.max(a, b);
    for (var i = lo; i <= hi; i++) setPage(i, on);
    sortSel();
    renderSelection();
  }
  // Collapse a sorted index list into compact 1-based ranges, e.g. "1–3, 7, 9–12".
  function formatRanges(list) {
    if (!list.length) return "";
    var parts = [], start = list[0], prev = list[0];
    for (var i = 1; i <= list.length; i++) {
      var cur = list[i];
      if (i < list.length && cur === prev + 1) { prev = cur; continue; }
      parts.push(start === prev ? String(start + 1) : (start + 1) + "–" + (prev + 1));
      start = prev = cur;
    }
    return parts.join(", ");
  }
  function updateSelCount() {
    if (!selCountEl) return;
    if (!pages.length) { selCountEl.textContent = ""; return; }
    var n = selection.length;
    if (!n) { selCountEl.textContent = "no pages selected"; return; }
    selCountEl.innerHTML = "<b>" + n + "</b> of " + pages.length + " selected · " + escapeHtml(formatRanges(selection));
  }
  function renderSelection() {
    var thumbs = stripEl.querySelectorAll(".cb-thumb");
    for (var i = 0; i < thumbs.length; i++) {
      thumbs[i].classList.toggle("cb-sel", selection.indexOf(parseInt(thumbs[i].dataset.idx, 10)) >= 0);
    }
    updateSelCount();
  }
  // Evenly sample up to n page indices spread across [lo, hi] (inclusive, default = whole comic).
  function autoSample(n, lo, hi) {
    var total = pages.length;
    if (!total) return [];
    if (lo == null || lo < 0) lo = 0;
    if (hi == null || hi > total - 1) hi = total - 1;
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    var span = hi - lo + 1;
    if (n >= span) {
      var all = [];
      for (var a = lo; a <= hi; a++) all.push(a);
      return all;
    }
    var k = Math.max(1, n), idx = [];
    for (var i = 0; i < k; i++) idx.push(lo + Math.round((i * (span - 1)) / (k - 1)));
    return idx;
  }
  function resetSelection() {
    manual = false;
    if (autoBtn) autoBtn.hidden = true;
    var v = scanCountSel.value;
    var n = v === "auto" ? MAX_AUTO : v === "all" ? pages.length : (parseInt(v, 10) || MAX_AUTO);
    selection = autoSample(n);
    renderSelection();
  }

  // ---------- "exact pages" range tools ----------
  function clampPage(v) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return null;
    return Math.max(1, Math.min(pages.length, n));
  }
  function readRange() {
    var a = clampPage(rangeFromEl && rangeFromEl.value);
    var b = clampPage(rangeToEl && rangeToEl.value);
    if (a == null && b == null) return null;
    if (a == null) a = 1;
    if (b == null) b = pages.length;
    return [Math.min(a, b) - 1, Math.max(a, b) - 1];
  }
  function syncRangeInputs() {
    if (!rangeFromEl || !rangeToEl) return;
    rangeFromEl.max = pages.length; rangeToEl.max = pages.length;
    if (!rangeFromEl.value) rangeFromEl.value = 1;
    if (!rangeToEl.value) rangeToEl.value = pages.length;
  }
  function clampRangeInputs() {
    if (rangeFromEl && rangeFromEl.value) rangeFromEl.value = clampPage(rangeFromEl.value) || 1;
    if (rangeToEl && rangeToEl.value) rangeToEl.value = clampPage(rangeToEl.value) || pages.length;
  }
  function selectRange() {
    var r = readRange();
    if (!r) { setStatus("⚠️ Enter a page range (e.g. 10 and 25) first.", false); return; }
    markManual();
    selection = autoSample(pages.length, r[0], r[1]);
    rangeFromEl.value = r[0] + 1; rangeToEl.value = r[1] + 1;
    renderSelection();
  }
  function sampleRange() {
    var r = readRange();
    if (!r) { setStatus("⚠️ Enter a page range (e.g. 10 and 25) first.", false); return; }
    var v = scanCountSel.value;
    var span = r[1] - r[0] + 1;
    var n = v === "auto" ? MAX_AUTO : v === "all" ? span : (parseInt(v, 10) || MAX_AUTO);
    markManual();
    selection = autoSample(n, r[0], r[1]);
    rangeFromEl.value = r[0] + 1; rangeToEl.value = r[1] + 1;
    renderSelection();
  }
  function selectAllPages() {
    var all = [];
    for (var i = 0; i < pages.length; i++) all.push(i);
    markManual(); selection = all; renderSelection();
  }
  function selectNoPages() { markManual(); selection = []; renderSelection(); }
  function invertSelection() {
    markManual();
    var inv = [];
    for (var i = 0; i < pages.length; i++) if (selection.indexOf(i) < 0) inv.push(i);
    selection = inv; renderSelection();
  }

  // ---------- full-page reader (own contained scroll — never scrolls the page behind it) ----------
  var readerUrls = [], readerPageEls = [], readerCurrent = 0, readerOpen = false, readerScrollRaf = 0;
  function openReader() {
    if (!pages.length) return;
    closeReader();
    readerScroll.innerHTML = "";
    readerUrls = []; readerPageEls = []; readerCurrent = 0;
    for (var i = 0; i < pages.length; i++) {
      var wrap = document.createElement("div");
      wrap.className = "cb-reader-page";
      var img = document.createElement("img");
      img.alt = "page " + (i + 1);
      img.loading = "lazy";
      if (pages[i].w) { img.setAttribute("width", pages[i].w); img.setAttribute("height", pages[i].h); }
      var url = URL.createObjectURL(pages[i].blob);
      readerUrls.push(url);
      img.src = url;
      var num = document.createElement("div");
      num.className = "cb-reader-page-num";
      num.textContent = "Page " + (i + 1);
      wrap.appendChild(num);
      wrap.appendChild(img);
      readerScroll.appendChild(wrap);
      readerPageEls.push(wrap);
    }
    readerTitle.textContent = (filenameEl.textContent || "Comic") + " — " + pages.length + " page" + (pages.length === 1 ? "" : "s");
    readerOpen = true;
    readerEl.hidden = false;
    document.body.classList.add("cb-reader-open");
    readerScroll.style.scrollBehavior = "auto";
    readerScroll.scrollTop = 0;
    readerScroll.style.scrollBehavior = "";
    markReaderCurrent(0);
    readerScroll.focus();
    window.addEventListener("keydown", readerKey);
    readerScroll.addEventListener("scroll", onReaderScroll, { passive: true });
  }
  function closeReader() {
    if (!readerOpen && readerEl.hidden) return;
    readerOpen = false;
    readerEl.hidden = true;
    document.body.classList.remove("cb-reader-open");
    window.removeEventListener("keydown", readerKey);
    readerScroll.removeEventListener("scroll", onReaderScroll);
    if (readerScrollRaf) { cancelAnimationFrame(readerScrollRaf); readerScrollRaf = 0; }
    for (var i = 0; i < readerUrls.length; i++) { try { URL.revokeObjectURL(readerUrls[i]); } catch (e) {} }
    readerUrls = []; readerPageEls = [];
    readerScroll.innerHTML = "";
  }
  function readerKey(e) {
    if (e.key === "Escape") { e.preventDefault(); closeReader(); }
    else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); readerStep(1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); readerStep(-1); }
  }
  function readerStep(dir) {
    if (!readerPageEls.length) return;
    readerCurrent = Math.max(0, Math.min(readerPageEls.length - 1, readerCurrent + dir));
    var contTop = readerScroll.getBoundingClientRect().top;
    var target = readerScroll.scrollTop + readerPageEls[readerCurrent].getBoundingClientRect().top - contTop - 10;
    readerScroll.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    markReaderCurrent(readerCurrent);
  }
  function markReaderCurrent(idx) {
    readerCurrent = idx;
    readerPos.textContent = (readerPageEls.length ? (idx + 1) : 0) + " / " + readerPageEls.length;
    for (var i = 0; i < readerPageEls.length; i++) readerPageEls[i].classList.toggle("cb-reader-current", i === idx);
  }
  function onReaderScroll() {
    if (readerScrollRaf) return;
    readerScrollRaf = requestAnimationFrame(function () {
      readerScrollRaf = 0;
      if (!readerPageEls.length) return;
      var contTop = readerScroll.getBoundingClientRect().top;
      var threshold = readerScroll.clientHeight * 0.45;
      var best = 0;
      for (var i = 0; i < readerPageEls.length; i++) {
        if (readerPageEls[i].getBoundingClientRect().top - contTop <= threshold) best = i;
      }
      if (best !== readerCurrent) markReaderCurrent(best);
    });
  }

  // ---------- comic loading ----------
  function loadComic(file) {
    var t = (file.name || "").toLowerCase();
    if (t.indexOf(".cbz") === -1 && t.indexOf(".zip") === -1) {
      setStatus("⚠️ Please use a .cbz (or .zip) comic file.", false);
      return;
    }
    setStatus("📦 " + Quip.q("cbOpen", "Cracking the spine of ") + file.name + "…", true);
    setBusy(true);
    var fr = new FileReader();
    fr.onload = function () { unzipComic(file, fr.result); };
    fr.onerror = function () { setBusy(false); setStatus("⚠️ Couldn't read that file.", false); };
    fr.readAsArrayBuffer(file);
  }

  async function unzipComic(file, buf) {
    try {
      var fflate = await getFFlate();
      var files;
      try { files = fflate.unzipSync(new Uint8Array(buf)); }
      catch (e) { throw new Error("not a zip"); }
      var names = Object.keys(files).filter(function (n) {
        return !n.endsWith("/") && IMAGE_EXT.test(n);
      }).sort(naturalSort);
      if (!names.length) throw new Error("no images");

      pages = [];
      for (var i = 0; i < names.length; i++) {
        pages.push({ blob: new Blob([files[names[i]]], { type: mimeFor(names[i]) }), name: names[i] });
      }

      filenameEl.textContent = file.name || "comic";
      filesizeEl.textContent = (file.size / 1048576).toFixed(1) + " MB";
      dzIdle.hidden = true; dzLoaded.hidden = false;

      stripEl.innerHTML = "";
      pageCountEl.textContent = pages.length;
      pagesHeadEl.hidden = false;
      stripEl.hidden = false;
      stripHintEl.hidden = false;
      if (selToolsEl) {
        selToolsEl.hidden = false;
        rangeFromEl.value = 1;
        rangeToEl.value = pages.length;
        syncRangeInputs();
      }
      lastAnchor = -1; dragging = false;

      for (var p = 0; p < pages.length; p++) {
        (function (pi) {
          var d = document.createElement("div");
          d.className = "cb-thumb";
          d.dataset.idx = pi;
          var img = document.createElement("img");
          img.alt = "page " + (pi + 1);
          img.loading = "lazy";
          var num = document.createElement("span");
          num.className = "cb-page-num";
          num.textContent = pi + 1;
          d.appendChild(img);
          d.appendChild(num);
          stripEl.appendChild(d);
          makeThumb(pages[pi]).then(function (url) { img.src = url; }).catch(function () {});
        })(p);
      }

      resetSelection();
      outWrap.hidden = true;
      storyCard.hidden = true;
      charsCard.hidden = true;
      reportActions.hidden = true;
      storyEl.textContent = "";
      charsEl.innerHTML = "";
      clearTranscript();
      lastReport = { story: "", transcript: [], characters: [] };
      setProgress(0, "");
      setStatus("🖼️ " + pages.length + " pages found " + Quip.q("cbVictims", "— choose your victims, then hit Scan & write."), false);
      setBusy(false);
    } catch (e) {
      console.error("comic unzip:", e);
      setBusy(false);
      setStatus("⚠️ Couldn't open that file — is it a valid .cbz (zip) comic with image pages?", false);
    }
  }

  function clearComic() {
    pages = [];
    selection = [];
    manual = false;
    stripEl.innerHTML = "";
    stripEl.hidden = true;
    stripHintEl.hidden = true;
    closeReader();
    pagesHeadEl.hidden = true;
    autoBtn.hidden = true;
    if (selToolsEl) selToolsEl.hidden = true;
    lastAnchor = -1; dragging = false;
    filenameEl.textContent = "";
    filesizeEl.textContent = "";
    dzIdle.hidden = false; dzLoaded.hidden = true;
    outWrap.hidden = true;
    reportActions.hidden = true;
    storyEl.textContent = "";
    charsEl.innerHTML = "";
    clearTranscript();
    transcriptEl.classList.remove("cb-hide-orig");
    toggleOrigBtn.hidden = true;
    translateCard.hidden = true;
    setTranslateStatus("");
    targetLang = "";
    srcLang = "";
    lastReport = { story: "", transcript: [], characters: [] };
    setProgress(0, "");
    setStatus("");
    setBusy(false);
  }

  // ---------- AI steps ----------
  async function scanPage(page, n, total, useLog) {
    var text = useLog ? SCAN_SYS + "\n\n" + scanContextText() : scanBaseText();
    var task = PAGE_TASK(n, total);
    var p = window.root.generateText({ instruction: [text, "\n\n" + task, page.blob] });
    beginGen(p);
    var res;
    try { res = await p; } finally { endGen(p); }
    var raw = ((res && res.text) || "").trim();
    var obj = extractJSON(raw);
    var notes = "", lines = [], lang = "";
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      if (typeof obj.notes === "string") notes = obj.notes.trim();
      if (typeof obj.lang === "string") lang = obj.lang.trim();
      if (Array.isArray(obj.transcript)) {
        for (var i = 0; i < obj.transcript.length; i++) {
          var t = obj.transcript[i];
          if (!t || typeof t !== "object") continue;
          var speaker = String(t.speaker == null ? "" : t.speaker).trim();
          var text2 = cleanLine(String(t.text == null ? "" : t.text));
          if (text2) lines.push({ speaker: speaker || "Unknown", text: text2 });
        }
      }
    } else {
      notes = raw;
    }
    return { notes: notes, transcript: lines, lang: lang };
  }

  async function maybeCompact() {
    if (compacting || log.length <= 1) return;
    var meta = getMeta();
    if (!meta) return;
    if (meta.countTokens(SCAN_SYS + "\n\n" + scanContextText()) + 570 < meta.idealMaxContextTokens * 0.85) return;
    await compact();
  }

  async function compact() {
    compacting = true;
    try {
      var n = Math.max(1, Math.floor(log.length / 2));
      var boundary = log[n - 1].slice(-40);
      var p = window.root.generateText(SCAN_SYS + "\n\n" + scanContextText() + "\n\nTASK: " + COMPACT_TASK + " Stop after the note ending with \"" + boundary + "\".");
      beginGen(p);
      var res;
      try { res = await p; } finally { endGen(p); }
      summary = ((res && res.text) || "").trim();
      log = log.slice(n);
    } finally { compacting = false; }
  }

  async function writeStory() {
    var focus = focusInput.value.trim();
    var text = SCAN_SYS + "\n\n" + scanContextText() + "\n\n" + STORY_TASK + (focus ? "\nGive extra attention to: " + focus : "");
    var p = window.root.generateText({
      instruction: text,
      onChunk: function (d) {
        var t = (d && d.fullTextSoFar) || "";
        storyEl.textContent = t;
        storyEl.scrollTop = storyEl.scrollHeight;
      }
    });
    beginGen(p);
    var res;
    try {
      res = await p;
      var finalText = ((res && res.text) || "").trim();
      storyEl.textContent = finalText;
      lastReport.story = finalText;
    } finally { endGen(p); }
  }

  async function listCharacters() {
    var maxChars = parseInt(maxCharsSel.value, 10) || 8;
    var focus = focusInput.value.trim();
    var text = SCAN_SYS + "\n\n" + scanContextText() + "\n\n" + LIST_TASK(maxChars) + (focus ? "\nPrioritize characters relevant to: " + focus : "");
    for (var attempt = 0; attempt < 2; attempt++) {
      var p = window.root.generateText({ instruction: text });
      beginGen(p);
      var res;
      try { res = await p; } finally { endGen(p); }
      if (stopped) return { ok: false, names: [] };
      var arr = extractJSON((res && res.text) || "");
      if (Array.isArray(arr)) {
        return {
          ok: true,
          names: arr
            .filter(function (x) { return x && typeof x === "object" && x.name; })
            .slice(0, maxChars)
            .map(function (x) { return { name: String(x.name).trim(), role: String(x.role || "").trim() }; })
        };
      }
    }
    return { ok: false, names: [] };
  }

  async function profileCharacter(entry, focus) {
    var name = entry && entry.name;
    if (!name) return null;
    var task = PROFILE_TASK(name) + (focus ? "\nAlso highlight how they relate to: " + focus : "");
    var text = SCAN_SYS + "\n\n" + scanContextText() + "\n\n" + task;
    for (var attempt = 0; attempt < 2; attempt++) {
      var p = window.root.generateText({ instruction: text });
      beginGen(p);
      var res;
      try { res = await p; } finally { endGen(p); }
      if (stopped) return null;
      var obj = extractJSON((res && res.text) || "");
      if (obj && typeof obj === "object" && !Array.isArray(obj) && obj.name) return obj;
    }
    return null;
  }

  // Fast mode: all character profiles in ONE call (returns an array aligned with `entries`, or null).
  async function profileCharacters(entries, focus) {
    if (!entries.length) return null;
    var list = entries.map(function (e, i) { return (i + 1) + ". " + e.name + (e.role ? " — " + e.role : ""); }).join("\n");
    var text = SCAN_SYS + "\n\n" + scanContextText() + "\n\n" + PROFILE_ALL_TASK(entries.length, focus) +
      "\n\nCharacters to profile (in order):\n" + list;
    for (var attempt = 0; attempt < 2; attempt++) {
      var p = window.root.generateText({ instruction: text });
      beginGen(p);
      var res;
      try { res = await p; } finally { endGen(p); }
      if (stopped) return null;
      var arr = extractJSON((res && res.text) || "");
      if (Array.isArray(arr) && arr.length) {
        var out = new Array(entries.length);
        for (var i = 0; i < entries.length; i++) {
          var want = entries[i].name.toLowerCase();
          var got = null;
          for (var k = 0; k < arr.length; k++) {
            var cand = arr[k];
            if (cand && typeof cand === "object" && cand.name && String(cand.name).trim().toLowerCase() === want) { got = cand; break; }
          }
          if (!got && arr[i] && typeof arr[i] === "object" && arr[i].name) got = arr[i];
          if (got) { got.name = got.name || entries[i].name; if (!got.role) got.role = entries[i].role || ""; out[i] = got; }
        }
        if (out.some(function (x) { return x; })) return out;
      }
    }
    return null;
  }

  // ---------- character card rendering ----------
  function cField(c, key) {
    if (targetLang && c[key + "_t"]) return c[key + "_t"];
    return c[key] || "";
  }
  function renderCharacter(card, pr) {
    card.classList.remove("cb-char-loading");
    var role = cField(pr, "role");
    card.innerHTML =
      '<div class="cb-char-name">' + escapeHtml(pr.name || "") + '</div>' +
      (role ? '<div class="cb-char-role">' + escapeHtml(role) + '</div>' : "") +
      '<div class="cb-char-field"><b>Look</b>' + escapeHtml(cField(pr, "appearance")) + '</div>' +
      '<div class="cb-char-field"><b>Personality</b>' + escapeHtml(cField(pr, "personality")) + '</div>' +
      '<div class="cb-char-field"><b>Background</b>' + escapeHtml(cField(pr, "background")) + '</div>' +
      '<div class="cb-char-field"><b>Arc</b>' + escapeHtml(cField(pr, "arc")) + '</div>' +
      '<div class="cb-char-field"><b>Recreate prompt</b></div>' +
      '<div class="cb-char-prompt">' + escapeHtml(pr.prompt || "") + '</div>' +
      '<div class="cb-char-actions">' +
        '<button class="i2p-btn" data-act="copy" type="button">📋 Copy prompt</button>' +
        '<button class="i2p-btn" data-act="draw" type="button">🖼️ Generate</button>' +
        '<button class="i2p-btn" data-act="gallery" type="button" title="Save the generated character to the community gallery">❤️ Save</button>' +
        '<button class="i2p-btn" data-act="vault" type="button" title="Save this character prompt to your vault">📚 Vault</button>' +
        '<button class="i2p-btn" data-act="send" type="button" title="Send this prompt to another tab">▸ Send</button>' +
        '<button class="i2p-btn i2p-btn-ghost" data-act="gen" type="button" title="Send this prompt to the Image Generator">🎨 Use in Generator</button>' +
      '</div>' +
      '<div class="cb-char-img" hidden></div>';

    card.querySelector('[data-act="copy"]').addEventListener("click", function () {
      var b = this;
      function done() { flash(b, "✅ Copied!"); }
      copyText(pr.prompt || "", done);
    });
    card.querySelector('[data-act="gen"]').addEventListener("click", function () {
      var ta = document.querySelector('#i2p-imggen [data-name="description"]');
      if (!ta) { flash(this, "⚠️ no box"); return; }
      ta.value = pr.prompt || "";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      var nameInput = document.querySelector('#i2p-imggen [data-name="imgName"]');
      if (nameInput && pr.name) {
        nameInput.value = String(pr.name).trim();
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (window.showTab) window.showTab("gen");
    });
    card.querySelector('[data-act="draw"]').addEventListener("click", function () {
      var b = this;
      if (!pr.prompt) { flash(b, "⚠️ no prompt"); return; }
      b.disabled = true; b.textContent = "⏳…";
      var stopFunny = window.FunnyGen ? window.FunnyGen.start(function (line) { b.textContent = "⏳ " + line; }) : null;
      window.root.generateImage(pr.prompt, { resolution: "512x768", hideGalleryButtons: true })
        .then(function (res) {
          if (stopFunny) { try { stopFunny(); } catch (_e) {} stopFunny = null; }
          b.disabled = false; b.textContent = "🖼️ Generate";
          if (res && res.dataUrl) {
            card.__generatedDataUrl = res.dataUrl;
            var box = card.querySelector(".cb-char-img");
            box.hidden = false;
            box.innerHTML = '<img src="' + res.dataUrl + '" alt="' + escapeHtml(pr.name) + '">';
            box.scrollIntoView({ block: "nearest", behavior: "smooth" });
          } else { flash(b, "⚠️ failed"); }
        }, function (e) {
          console.error(e);
          if (stopFunny) { try { stopFunny(); } catch (_e) {} stopFunny = null; }
          b.disabled = false; b.textContent = "🖼️ Generate";
          flash(b, "⚠️ failed");
        });
    });
    card.querySelector('[data-act="gallery"]').addEventListener("click", function () {
      var b = this;
      if (!card.__generatedDataUrl) { flash(b, "🖼️ Generate first"); return; }
      if (!window.t2iAddImageToGallery) { flash(b, "⚠️ Gallery busy"); return; }
      window.t2iAddImageToGallery(card.__generatedDataUrl, pr.prompt || "", "").then(
        function () { flash(b, "❤️ Saved!"); },
        function (e) { console.error(e); flash(b, "⚠️ Failed"); }
      );
    });
    card.querySelector('[data-act="vault"]').addEventListener("click", function () {
      var b = this;
      if (!window.Vault) { flash(b, "⚠️ Vault busy"); return; }
      var tags = ["comic", "character"];
      var p = (card.__generatedDataUrl && window.Vault.addImage)
        ? window.Vault.addImage(card.__generatedDataUrl, pr.prompt || "", { tags: tags, tab: "comic", label: pr.name || "" })
        : window.Vault.add(pr.prompt || "", { tags: tags, tab: "comic", label: pr.name || "" });
      Promise.resolve(p).then(function () { flash(b, "✅ Saved!"); }, function () { flash(b, "⚠️ Failed"); });
    });
    card.querySelector('[data-act="send"]').addEventListener("click", function () {
      if (!window.PromptBridge) return;
      window.PromptBridge.sendTo(pr.prompt || "", { anchor: this, preview: pr.prompt || "", tags: ["comic"] });
    });
    if (card.__generatedDataUrl) {
      var box = card.querySelector(".cb-char-img");
      if (box) {
        box.hidden = false;
        box.innerHTML = '<img src="' + card.__generatedDataUrl + '" alt="' + escapeHtml(pr.name || "") + '">';
      }
    }
  }

  // ---------- transcript rendering ----------
  function clearTranscript() {
    transcriptEl.innerHTML = "";
    transcriptCountEl.textContent = "";
    totalDialogue = 0;
  }
  function trSpeaker(L) { return (L.speakerT && L.speakerT.length) ? L.speakerT : L.speaker; }
  function trText(L) { return L.translation ? L.translation : L.text; }
  function hasTrans(L) { return !!(L.translation && L.text && L.translation !== L.text); }
  function storyShown() { return (targetLang && lastReport.storyT) ? lastReport.storyT : lastReport.story; }
  function anyTranslations() {
    if (lastReport.storyT) return true;
    var any = false;
    eachLine(function (L) { if (L.translation || L.speakerT) any = true; });
    for (var i = 0; i < lastReport.characters.length; i++) {
      for (var k = 0; k < CHAR_T_KEYS.length; k++) if (lastReport.characters[i][CHAR_T_KEYS[k]]) any = true;
    }
    return any;
  }
  function updateTranscriptCount() {
    var pages = lastReport.transcript.length;
    var txt = " · " + pages + " page" + (pages === 1 ? "" : "s") + " · " + totalDialogue + " line" + (totalDialogue === 1 ? "" : "s");
    if (targetLang) txt += " · 🌐 " + (srcLang && srcLang !== targetLang ? srcLang + " → " + targetLang : "in " + targetLang);
    transcriptCountEl.textContent = txt;
  }
  function renderTranscriptPage(pg) {
    var wrap = document.createElement("div");
    wrap.className = "cb-tr-page";
    var head = document.createElement("div");
    head.className = "cb-tr-page-num";
    head.textContent = "Page " + pg.page;
    wrap.appendChild(head);
    for (var i = 0; i < pg.lines.length; i++) {
      var L = pg.lines[i];
      var line = document.createElement("div");
      line.className = "cb-tr-line";
      var sp = document.createElement("span");
      sp.className = "cb-tr-speaker";
      sp.textContent = trSpeaker(L) + ":";
      var tx = document.createElement("span");
      tx.className = "cb-tr-text";
      tx.textContent = " " + trText(L);
      line.appendChild(sp);
      line.appendChild(tx);
      if (hasTrans(L)) {
        var orig = document.createElement("span");
        orig.className = "cb-tr-orig";
        orig.textContent = L.text;
        line.appendChild(orig);
      }
      wrap.appendChild(line);
    }
    transcriptEl.appendChild(wrap);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    updateTranscriptCount();
  }
  function renderTranscriptAll() {
    transcriptEl.innerHTML = "";
    totalDialogue = 0;
    for (var i = 0; i < lastReport.transcript.length; i++) {
      totalDialogue += lastReport.transcript[i].lines.length;
      renderTranscriptPage(lastReport.transcript[i]);
    }
    updateTranscriptCount();
  }
  function rerenderCharacters() {
    var list = lastReport.characters;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].__card) renderCharacter(list[i].__card, list[i]);
    }
  }
  function transcriptToMarkdown() {
    var md = "";
    for (var i = 0; i < lastReport.transcript.length; i++) {
      var pg = lastReport.transcript[i];
      md += "### Page " + pg.page + "\n\n";
      if (!pg.lines.length) { md += "_No dialogue on this page._\n\n"; continue; }
      for (var j = 0; j < pg.lines.length; j++) {
        var L = pg.lines[j];
        md += "**" + trSpeaker(L) + ":** \"" + trText(L) + "\"\n\n";
        if (hasTrans(L)) md += "_original (" + (srcLang || "source") + "): " + L.text + "_\n\n";
      }
    }
    return md || "_None._\n";
  }
  function transcriptToText() {
    var txt = "";
    for (var i = 0; i < lastReport.transcript.length; i++) {
      var pg = lastReport.transcript[i];
      txt += "\n[Page " + pg.page + "]\n";
      if (!pg.lines.length) { txt += "(no dialogue)\n"; continue; }
      for (var j = 0; j < pg.lines.length; j++) {
        var L = pg.lines[j];
        txt += trSpeaker(L) + ": " + trText(L) + "\n";
        if (hasTrans(L)) txt += "   (original: " + L.text + ")\n";
      }
    }
    return txt;
  }

  // ---------- post-scan translation (text-only: the pages are NOT re-read) ----------
  function setTranslateStatus(msg) {
    translateStatusEl.textContent = msg || "";
    translateStatusEl.hidden = !msg;
  }
  function srcName() { return srcLang || "its original language"; }

  function eachLine(fn) {
    for (var i = 0; i < lastReport.transcript.length; i++) {
      var lines = lastReport.transcript[i].lines;
      for (var j = 0; j < lines.length; j++) fn(lines[j]);
    }
  }
  var CHAR_T_KEYS = ["role_t", "appearance_t", "personality_t", "background_t", "arc_t"];
  function snapshotTranslations() {
    var snap = { lines: [], story: lastReport.storyT, chars: [] };
    eachLine(function (L) { snap.lines.push({ translation: L.translation, speakerT: L.speakerT }); });
    for (var i = 0; i < lastReport.characters.length; i++) {
      var c = lastReport.characters[i], o = {}; 
      for (var k = 0; k < CHAR_T_KEYS.length; k++) o[CHAR_T_KEYS[k]] = c[CHAR_T_KEYS[k]];
      snap.chars.push(o);
    }
    return snap;
  }
  function clearTranslations() {
    eachLine(function (L) { delete L.translation; delete L.speakerT; });
    delete lastReport.storyT;
    for (var i = 0; i < lastReport.characters.length; i++) {
      var c = lastReport.characters[i];
      for (var k = 0; k < CHAR_T_KEYS.length; k++) delete c[CHAR_T_KEYS[k]];
    }
  }
  function restoreTranslations(snap) {
    var idx = 0;
    eachLine(function (L) {
      var s = snap.lines[idx++] || {};
      if (s.translation != null) L.translation = s.translation; else delete L.translation;
      if (s.speakerT != null) L.speakerT = s.speakerT; else delete L.speakerT;
    });
    if (snap.story != null) lastReport.storyT = snap.story; else delete lastReport.storyT;
    for (var i = 0; i < lastReport.characters.length; i++) {
      var c = lastReport.characters[i], s = snap.chars[i] || {};
      for (var k = 0; k < CHAR_T_KEYS.length; k++) {
        if (s[CHAR_T_KEYS[k]] != null) c[CHAR_T_KEYS[k]] = s[CHAR_T_KEYS[k]]; else delete c[CHAR_T_KEYS[k]];
      }
    }
  }

  function translateLineTask(target, slice) {
    var payload = [];
    for (var i = 0; i < slice.length; i++) payload.push({ i: i, speaker: slice[i].speaker, text: slice[i].text });
    return "TASK: The comic these lines are from is written in " + srcName() + ". Translate every line of dialogue into " + target + ".\n" +
      "Input lines (JSON):\n" + JSON.stringify(payload) + "\n" +
      "Reply with ONLY a JSON array, with no other text, one entry per input line, in the same order and with the same `i` values:\n" +
      "[{\"i\":0,\"speaker\":\"...\",\"translation\":\"...\"}]\n" +
      "- translation: the line rendered naturally in " + target + ", faithful to the meaning and tone. If a line is already in " + target + ", repeat it unchanged.\n" +
      "- speaker: translate the speaker label ONLY when it is a description (like \"bearded man\" or \"Narrator\"); keep real character names exactly as they are.";
  }

  async function translateTranscript() {
    var items = [];
    for (var i = 0; i < lastReport.transcript.length; i++) {
      var lines = lastReport.transcript[i].lines;
      for (var j = 0; j < lines.length; j++) items.push({ ref: lines[j], speaker: lines[j].speaker, text: lines[j].text });
    }
    var applied = 0, CHUNK = 30;
    for (var s = 0; s < items.length; s += CHUNK) {
      if (stopped) return applied;
      var slice = items.slice(s, s + CHUNK);
      var p = window.root.generateText({ instruction: TRANSLATE_SYS + "\n\n" + translateLineTask(targetLang, slice) });
      beginGen(p);
      var res; try { res = await p; } finally { endGen(p); }
      if (stopped) return applied;
      var arr = extractJSON((res && res.text) || "");
      if (!Array.isArray(arr)) continue;
      for (var k = 0; k < arr.length; k++) {
        var e = arr[k];
        if (!e || typeof e !== "object") continue;
        var idx = (typeof e.i === "number") ? e.i : k;
        var it = slice[idx];
        if (!it) continue;
        var tr = cleanLine(String(e.translation == null ? "" : e.translation));
        var sp = cleanLine(String(e.speaker == null ? "" : e.speaker));
        if (tr) { it.ref.translation = tr; applied++; }
        if (sp) it.ref.speakerT = sp;
      }
    }
    return applied;
  }

  async function translateStory() {
    if (!lastReport.story) return 0;
    var p = window.root.generateText({ instruction: TRANSLATE_SYS + "\n\nTASK: Translate the story synopsis below into " + targetLang + ". It was written from a comic in " + srcName() + ". Keep the paragraph structure, names and terminology exactly. Reply with ONLY the translation, with no preamble.\n\n" + lastReport.story });
    beginGen(p);
    var res; try { res = await p; } finally { endGen(p); }
    var t = ((res && res.text) || "").trim();
    if (!stopped && t) { lastReport.storyT = t; return 1; }
    return 0;
  }

  async function translateCharacters() {
    var list = lastReport.characters;
    if (!list.length) return 0;
    var applied = 0;
    var payload = list.map(function (c) {
      return { name: c.name || "", role: c.role || "", appearance: c.appearance || "", personality: c.personality || "", background: c.background || "", arc: c.arc || "" };
    });
    var text = TRANSLATE_SYS + "\n\nTASK: Below are character profiles from a comic written in " + srcName() + ". Translate the `role`, `appearance`, `personality`, `background` and `arc` of each into " + targetLang + ". Keep every `name` EXACTLY as given — do not translate names, even ones that look like ordinary words.\n" +
      "Input (JSON):\n" + JSON.stringify(payload) + "\n" +
      "Reply with ONLY a JSON array, one object per character in the same order:\n[{\"role\":\"...\",\"appearance\":\"...\",\"personality\":\"...\",\"background\":\"...\",\"arc\":\"...\"}]";
    var p = window.root.generateText({ instruction: text });
    beginGen(p);
    var res; try { res = await p; } finally { endGen(p); }
    if (stopped) return applied;
    var arr = extractJSON((res && res.text) || "");
    if (!Array.isArray(arr)) return applied;
    for (var i = 0; i < arr.length && i < list.length; i++) {
      var e = arr[i];
      if (!e || typeof e !== "object") continue;
      if (typeof e.role === "string" && e.role.trim()) { list[i].role_t = e.role.trim(); applied++; }
      if (typeof e.appearance === "string" && e.appearance.trim()) list[i].appearance_t = e.appearance.trim();
      if (typeof e.personality === "string" && e.personality.trim()) list[i].personality_t = e.personality.trim();
      if (typeof e.background === "string" && e.background.trim()) list[i].background_t = e.background.trim();
      if (typeof e.arc === "string" && e.arc.trim()) list[i].arc_t = e.arc.trim();
    }
    return applied;
  }

  async function translateAll() {
    if (translating || busy) return;
    var target = resolveTargetLang();
    if (!target) { setTranslateStatus("⚠️ Pick a language first."); return; }
    var nLines = 0;
    for (var i = 0; i < lastReport.transcript.length; i++) nLines += lastReport.transcript[i].lines.length;
    if (!nLines && !lastReport.story && !lastReport.characters.length) { setTranslateStatus("⚠️ Scan a comic first."); return; }

    translating = true; stopped = false;
    translateRunBtn.textContent = "⏹ Stop";
    translateRunBtn.classList.add("i2p-btn-danger");
    var prevTarget = targetLang, snap = null;
    if (targetLang !== target) { snap = snapshotTranslations(); clearTranslations(); targetLang = target; }
    try {
      setTranslateStatus("⏳ Translating the transcript, story and characters into " + target + "…");
      setProgress(0, "🌐 Translating into " + target + "…");
      var nApplied = 0;
      nApplied += await translateTranscript();
      if (!stopped && lastReport.story) { setProgress(0, "🌐 Translating the story…"); nApplied += await translateStory(); }
      if (!stopped && lastReport.characters.length) { setProgress(0, "🌐 Translating character profiles…"); nApplied += await translateCharacters(); }

      if (stopped && snap && nApplied === 0) { restoreTranslations(snap); targetLang = prevTarget; }

      renderTranscriptAll();
      storyEl.textContent = storyShown();
      rerenderCharacters();
      toggleOrigBtn.hidden = !anyTranslations();
      transcriptEl.classList.remove("cb-hide-orig");
      toggleOrigBtn.textContent = "🔤 Hide original";
      setProgress(0, "");
      if (stopped) {
        setTranslateStatus((snap && nApplied === 0)
          ? "⏹ Stopped — no changes made; kept the previous translation."
          : "⏹ Stopped — applied a partial translation into " + target + ".");
      } else {
        var bits = [];
        if (nLines) bits.push(nLines + " line" + (nLines === 1 ? "" : "s"));
        if (lastReport.story) bits.push("the story");
        if (lastReport.characters.length) bits.push(lastReport.characters.length + " character" + (lastReport.characters.length === 1 ? "" : "s"));
        setTranslateStatus("✅ Translated " + bits.join(", ") + " into " + target + (srcLang ? " (from " + srcLang + ")." : ".") + " Re-run to switch language — the pages aren't read again.");
      }
    } catch (e) {
      console.error("comic translate:", e);
      if (snap) { restoreTranslations(snap); targetLang = prevTarget; }
      setProgress(0, "");
      setTranslateStatus("⚠️ Translation failed — " + ((e && e.message) || "please try again."));
    } finally {
      translating = false;
      translateRunBtn.textContent = "🌐 Translate";
      translateRunBtn.classList.remove("i2p-btn-danger");
    }
  }

  // ---------- main run ----------
  async function run() {
    if (busy || translating || !pages.length) return;
    if (manual && !selection.length) { setStatus("⚠️ Pick at least one page " + Quip.q("cbCommit", "— or hit ↺ auto-sample."), false); return; }
    if (!manual) resetSelection();

    setBusy(true); stopped = false;
    lastReport = { story: "", transcript: [], characters: [] };
    storyEl.textContent = "";
    charsEl.innerHTML = "";
    clearTranscript();
    storyCard.hidden = true;
    charsCard.hidden = true;
    outWrap.hidden = false;
    reportActions.hidden = true;
    summary = ""; log = []; compacting = false;
    translateCard.hidden = true;
    targetLang = "";
    srcLang = "";
    transcriptEl.classList.remove("cb-hide-orig");
    toggleOrigBtn.hidden = true;
    toggleOrigBtn.textContent = "🔤 Hide original";

    var selPages = selection.map(function (i) { return pages[i]; });
    var total = selPages.length;
    var charData = [];
    var fast = !!(fastToggle && fastToggle.checked);
    function absorbScan(idx, scan) {
      if (!scan) return;
      if (scan.lang && !srcLang) { srcLang = scan.lang; }
      if (scan.notes) log.push("[Page " + (idx + 1) + "] " + scan.notes);
      if (scan.transcript.length) {
        var entry = { page: selection[idx] + 1, lines: scan.transcript };
        lastReport.transcript.push(entry);
        totalDialogue += scan.transcript.length;
        renderTranscriptPage(entry);
      }
    }
    try {
      // 1) scan pages (notes go into the shared log; verbatim dialogue is kept apart)
      if (fast && total > 1) {
        // Fast mode: read several pages at once with a shared fixed prefix, then order the notes.
        var scanned = new Array(total);
        var doneCount = 0;
        await mapLimit(total, FAST_CONCURRENCY, async function (i) {
          scanned[i] = await scanPage(selPages[i], i + 1, total, false);
          doneCount++;
          setProgress(Math.round((doneCount / total) * 100), "🔍 Reading pages · " + doneCount + " of " + total + "…");
        });
        for (var p = 0; p < total; p++) {
          if (stopped) break;
          absorbScan(p, scanned[p]);
        }
      } else {
        for (var p = 0; p < total; p++) {
          if (stopped) break;
          setProgress(Math.round((p / total) * 100), "🔍 Reading page " + (p + 1) + " of " + total + "…");
          var scan = await scanPage(selPages[p], p + 1, total, true);
          if (stopped) break;
          absorbScan(p, scan);
          await maybeCompact();
        }
      }
      if (stopped) { finish(false); return; }

      if (fast) await compactToFit();

      // 2) story + character list (independent tasks — overlap them in fast mode)
      storyCard.hidden = false;
      charsCard.hidden = false;
      setProgress(0, fast ? "✍️ Writing the story & characters…" : "✍️ Writing the story…");
      var listP = fast ? listCharacters().catch(function () { return { ok: false, names: [] }; }) : null;
      await writeStory();
      if (stopped) { finish(false); return; }

      // 3) characters
      setProgress(0, "🎭 Identifying characters…");
      var listRes = listP ? await listP : await listCharacters();
      if (stopped) { finish(false); return; }
      if (!listRes.ok) {
        charsEl.innerHTML = '<div class="cb-hint">Couldn&#39;t identify characters from the scan — try again.</div>';
      } else if (!listRes.names.length) {
        charsEl.innerHTML = '<div class="cb-hint">No characters were identified in the pages you scanned.</div>';
      } else {
        var names = listRes.names;
        var cards = [];
        charsEl.innerHTML = "";
        for (var c = 0; c < names.length; c++) {
          var card = document.createElement("div");
          card.className = "cb-char cb-char-loading";
          card.innerHTML = '<span class="cb-spinner"></span>Writing profile for ' + escapeHtml(names[c].name) + "…";
          charsEl.appendChild(card);
          cards.push(card);
        }
        // Fast mode: one call writes every profile; any gaps fall back to a per-character call.
        var profiles = (fast && names.length > 1) ? await profileCharacters(names, focusInput.value.trim()) : null;
        if (stopped) { finish(false); return; }
        for (var c2 = 0; c2 < names.length; c2++) {
          if (stopped) break;
          var profile = (profiles && profiles[c2]) || null;
          if (!profile) {
            setProgress(Math.round((c2 / names.length) * 100), "🕮 Writing profile · " + names[c2].name + " (" + (c2 + 1) + "/" + names.length + ")…");
            profile = await profileCharacter(names[c2], focusInput.value.trim());
          }
          if (stopped) break;
          if (profile && profile.name) {
            profile.__card = cards[c2];
            charData.push(profile);
            renderCharacter(cards[c2], profile);
          } else {
            cards[c2].className = "cb-char";
            cards[c2].textContent = "⚠️ Couldn't write a profile for " + names[c2].name + ".";
          }
        }
      }
      lastReport.characters = charData;
      if (stopped) { finish(false); return; }
      finish(true, total, charData.length, totalDialogue);
    } catch (e) {
      console.error("comic run:", e);
      setBusy(false); setProgress(0, "");
      setStatus("⚠️ Something went wrong — " + ((e && e.message) || "please try again."), false);
    }
  }

  function finish(ok, total, charCount, lineCount) {
    setBusy(false); setProgress(0, "");
    if (!ok) { setStatus("⏹ Stopped.", false); return; }
    reportActions.hidden = false;
    setStatus("✅ Done — scanned " + total + " page" + (total === 1 ? "" : "s") + ", captured " + (lineCount || 0) + " line" + (lineCount === 1 ? "" : "s") + " of dialogue, profiled " + charCount + " character" + (charCount === 1 ? "" : "s") + Quip.q("cbDone", ". Excelsior-ish."), false);
    translateCard.hidden = false;
    setTranslateStatus(srcLang
      ? "Comic language detected: " + srcLang + ". The scan kept the dialogue in the original language — pick a language below to translate the transcript, story and characters (a fast text-only pass that never re-reads the pages)."
      : "The scan kept the dialogue in the comic's original language — pick a language below to translate the transcript, story and characters (a fast text-only pass that never re-reads the pages).");
  }

  // ---------- report export ----------
  function charsToMarkdown() {
    var md = "";
    for (var i = 0; i < lastReport.characters.length; i++) {
      var c = lastReport.characters[i];
      var role = cField(c, "role");
      md += "### " + (c.name || "?") + (role ? " — " + role : "") + "\n\n";
      if (cField(c, "appearance")) md += "**Look:** " + cField(c, "appearance") + "\n\n";
      if (cField(c, "personality")) md += "**Personality:** " + cField(c, "personality") + "\n\n";
      if (cField(c, "background")) md += "**Background:** " + cField(c, "background") + "\n\n";
      if (cField(c, "arc")) md += "**Arc:** " + cField(c, "arc") + "\n\n";
      if (c.prompt) md += "**Recreate prompt:** `" + c.prompt + "`\n\n";
    }
    return md;
  }
  function buildReport() {
    var md = "# 📚 Comic Report\n\n" + (filenameEl.textContent ? "**Comic:** " + filenameEl.textContent + "\n\n" : "");
    if (lastReport.story) md += "## 📖 Story" + (targetLang ? " (🌐 " + targetLang + ")" : "") + "\n\n" + storyShown() + "\n\n";
    if (lastReport.transcript.length) md += "## 💬 Transcript" + (targetLang ? " (🌐 " + targetLang + ")" : "") + "\n\n" + transcriptToMarkdown();
    md += "## 🎭 Characters\n\n" + (charsToMarkdown() || "_None._\n");
    return md;
  }
  function downloadReport() {
    var blob = new Blob([buildReport()], { type: "text/markdown;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "comic-report.md";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function charsToText() {
    var txt = "", idx = 0;
    for (var i = 0; i < lastReport.characters.length; i++) {
      var c = lastReport.characters[i];
      idx++;
      var role = cField(c, "role");
      txt += "\n" + idx + ". " + (c.name || "?") + (role ? " — " + role : "") + "\n";
      if (cField(c, "appearance")) txt += "   Look: " + cField(c, "appearance") + "\n";
      if (cField(c, "personality")) txt += "   Personality: " + cField(c, "personality") + "\n";
      if (cField(c, "background")) txt += "   Background: " + cField(c, "background") + "\n";
      if (cField(c, "arc")) txt += "   Arc: " + cField(c, "arc") + "\n";
      if (c.prompt) txt += "   Recreate prompt: " + c.prompt + "\n";
    }
    return txt;
  }
  function buildReportText() {
    var txt = "COMIC SCANNER REPORT\n=====================\n\n";
    txt += "Comic: " + (filenameEl.textContent || "untitled") + "\n";
    txt += "Exported: " + new Date().toLocaleString() + "\n";
    if (targetLang) txt += "Translated: " + (srcLang ? srcLang + " → " : "") + targetLang + "\n";
    txt += "\n";
    txt += "STORY\n-----\n\n" + (storyShown() || "(no story)") + "\n\n";
    if (lastReport.transcript.length) {
      txt += "TRANSCRIPT\n----------\n";
      txt += transcriptToText();
      txt += "\n";
    }
    txt += "CHARACTERS & PROMPTS\n--------------------\n";
    txt += (lastReport.characters.length ? charsToText() : "\nNone.\n");
    return txt;
  }
  function downloadReportTxt() {
    var blob = new Blob([buildReportText()], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "comic-info.txt";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- boot ----------
  function boot() {
    dropzone.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("#cb-remove")) return;
      fileInput.click();
    });
    dropzone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) loadComic(fileInput.files[0]);
      fileInput.value = "";
    });
    removeBtn.addEventListener("click", clearComic);
    ["dragenter", "dragover"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add("i2p-dragover"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove("i2p-dragover"); });
    });
    dropzone.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadComic(f);
    });
    scanCountSel.addEventListener("change", function () { if (!manual) resetSelection(); });

    // --- page strip: tap to toggle, drag to paint a run, Shift+click for a range ---
    function stripIdx(e) {
      var t = e.target && e.target.closest ? e.target.closest(".cb-thumb") : null;
      return t ? parseInt(t.dataset.idx, 10) : -1;
    }
    stripEl.addEventListener("pointerdown", function (e) {
      var idx = stripIdx(e);
      if (idx < 0 || !pages.length) return;
      if (e.pointerType !== "mouse") {
        // touch / pen: plain tap-to-toggle (leave touch scrolling to the browser)
        if (e.shiftKey && lastAnchor >= 0) { markManual(); paintSpan(lastAnchor, idx, true); lastAnchor = idx; }
        else togglePage(idx);
        return;
      }
      e.preventDefault();
      if (e.shiftKey && lastAnchor >= 0) { markManual(); paintSpan(lastAnchor, idx, true); lastAnchor = idx; return; }
      dragAnchor = idx;
      dragAdd = selection.indexOf(idx) < 0;
      dragging = true;
      stripEl.classList.add("cb-dragging");
      markManual();
      paintSpan(idx, idx, dragAdd);
      lastAnchor = idx;
    });
    stripEl.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var idx = stripIdx(e);
      if (idx < 0) return;
      e.preventDefault();
      paintSpan(dragAnchor, idx, dragAdd);
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      stripEl.classList.remove("cb-dragging");
      renderSelection();
    }
    window.addEventListener("pointerup", endDrag);
    stripEl.addEventListener("pointercancel", endDrag);

    if (rangeSelectBtn) rangeSelectBtn.addEventListener("click", selectRange);
    if (rangeSampleBtn) rangeSampleBtn.addEventListener("click", sampleRange);
    if (selectAllBtn) selectAllBtn.addEventListener("click", selectAllPages);
    if (selectNoneBtn) selectNoneBtn.addEventListener("click", selectNoPages);
    if (selectInvertBtn) selectInvertBtn.addEventListener("click", invertSelection);
    [rangeFromEl, rangeToEl].forEach(function (el) {
      if (!el) return;
      el.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); selectRange(); } });
      el.addEventListener("change", function () { clampRangeInputs(); });
    });

    translateSel.addEventListener("change", function () {
      var other = translateSel.value === "__other__";
      langCustomInput.hidden = !other;
      if (other) langCustomInput.focus();
      else langCustomInput.value = "";
    });
    toggleOrigBtn.addEventListener("click", function () {
      var hidden = transcriptEl.classList.toggle("cb-hide-orig");
      toggleOrigBtn.textContent = hidden ? "🔤 Show original" : "🔤 Hide original";
    });
    translateRunBtn.addEventListener("click", function () {
      if (translating) {
        stopped = true;
        stopGens();
      } else {
        translateAll();
      }
    });
    autoBtn.addEventListener("click", resetSelection);
    viewPagesBtn.addEventListener("click", openReader);
    readerClose.addEventListener("click", closeReader);
    readerPrev.addEventListener("click", function () { readerStep(-1); });
    readerNext.addEventListener("click", function () { readerStep(1); });
    readerEl.addEventListener("click", function (e) { if (e.target === readerEl) closeReader(); });
    runBtn.addEventListener("click", run);
    stopBtn.addEventListener("click", function () {
      stopped = true;
      stopGens();
    });
    copyStoryBtn.addEventListener("click", function () {
      var b = this;
      function done() { flash(b, "✅ Copied!"); }
      copyText(storyShown() || storyEl.textContent || "", done);
    });
    copyCharsBtn.addEventListener("click", function () {
      var b = this;
      function done() { flash(b, "✅ Copied!"); }
      copyText(charsToMarkdown(), done);
    });
    copyTranscriptBtn.addEventListener("click", function () {
      var b = this;
      function done() { flash(b, "✅ Copied!"); }
      copyText(transcriptToText().trim(), done);
    });
    downloadBtn.addEventListener("click", downloadReport);
    downloadTxtBtn.addEventListener("click", downloadReportTxt);
    setBusy(false);
  }

  window.__comicGetPrompts = function () {
    return lastReport.characters.filter(function (c) { return c && c.prompt; })
      .map(function (c) { return { name: c.name || "", prompt: c.prompt }; });
  };

  if (window.__comicRenderTestArmed) {
    window.__comicRenderTest = function (chars) {
      if (!booted) window.__comicOnShow();
      lastReport.characters = chars;
      charsEl.innerHTML = "";
      var cards = [];
      for (var i = 0; i < chars.length; i++) {
        var card = document.createElement("div");
        card.className = "cb-char";
        charsEl.appendChild(card);
        cards.push(card);
        renderCharacter(card, chars[i]);
      }
      return cards.length;
    };
  }

  window.__comicOnShow = function () {
    if (booted) return;
    booted = true;
    dropzone = $("cb-dropzone"); fileInput = $("cb-file");
    dzIdle = $("cb-dz-idle"); dzLoaded = $("cb-dz-loaded");
    filenameEl = $("cb-filename"); filesizeEl = $("cb-filesize"); removeBtn = $("cb-remove");
    scanCountSel = $("cb-scan-count"); maxCharsSel = $("cb-max-chars"); focusInput = $("cb-focus");
    translateSel = $("cb-translate"); langCustomInput = $("cb-lang-custom"); toggleOrigBtn = $("cb-toggle-orig");
    translateCard = $("cb-card-translate"); translateRunBtn = $("cb-translate-run"); translateStatusEl = $("cb-translate-status");
    runBtn = $("cb-run"); stopBtn = $("cb-stop"); statusEl = $("cb-status"); fastToggle = $("cb-fast");
    progressWrap = $("cb-progress"); progressFill = $("cb-progress-fill"); progressLabel = $("cb-progress-label");
    pageCountEl = $("cb-page-count"); stripEl = $("cb-strip"); autoBtn = $("cb-auto"); pagesHeadEl = $("cb-pages-head");
    stripHintEl = $("cb-strip-hint"); viewPagesBtn = $("cb-view-pages");
    selToolsEl = $("cb-sel-tools"); rangeFromEl = $("cb-range-from"); rangeToEl = $("cb-range-to");
    rangeSelectBtn = $("cb-range-select"); rangeSampleBtn = $("cb-range-sample");
    selectAllBtn = $("cb-select-all"); selectNoneBtn = $("cb-select-none"); selectInvertBtn = $("cb-select-invert");
    selCountEl = $("cb-sel-count");
    readerEl = $("cb-reader"); readerTitle = $("cb-reader-title"); readerScroll = $("cb-reader-scroll");
    readerPos = $("cb-reader-pos"); readerPrev = $("cb-reader-prev"); readerNext = $("cb-reader-next"); readerClose = $("cb-reader-close");
    storyEl = $("cb-story"); copyStoryBtn = $("cb-copy-story");
    charsEl = $("cb-chars"); copyCharsBtn = $("cb-copy-chars");
    storyCard = $("cb-card-story"); transcriptCard = $("cb-card-transcript"); charsCard = $("cb-card-chars");
    transcriptEl = $("cb-transcript"); copyTranscriptBtn = $("cb-copy-transcript"); transcriptCountEl = $("cb-transcript-count");
    downloadBtn = $("cb-download"); downloadTxtBtn = $("cb-download-txt"); reportActions = $("cb-report-actions");
    outWrap = $("cb-out");
    boot();
    var vb = $("cb-focus-vault");
    if (vb && !vb.__wired) {
      vb.__wired = true;
      vb.addEventListener("click", function () {
        if (!window.Vault) { flash(vb, "⚠️ Vault loading…"); return; }
        window.Vault.pick(function (text) {
          if (!focusInput) focusInput = $("cb-focus");
          if (focusInput) { focusInput.value = text; focusInput.dispatchEvent(new Event("input", { bubbles: true })); }
        });
      });
    }
  };

  // integration hook for the shared PromptBridge ("send to ▸ Comic Scanner" focus box)
  window.__comicSetFocus = function (text) {
    if (!booted) window.__comicOnShow();
    if (focusInput) {
      focusInput.value = String(text == null ? "" : text);
      focusInput.dispatchEvent(new Event("input", { bubbles: true }));
      try { focusInput.focus(); } catch (e) {}
    }
  };
})();
