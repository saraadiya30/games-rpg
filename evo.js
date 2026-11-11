(function() {
  "use strict";
  var $ = function(id) { return document.getElementById(id); };
  var R = window.root || {};

  // ---------- config ----------
  var CFG = {
    PARALLEL: 3,
    GEN_PROMPTS_BATCH: 6,
    UNT_MIN_STOCK: 8,
    EVOLUTION_THRESHOLD: 5,
    LINEAGE_DECAY_RATE: 0.85,
    GENERATION_MULTIPLIER: 0.1,
    PARENT_BATCH_SIZE: 5,
    PARENT_PROB: 0.7,
    LONG_PROMPT_RATE: 0.5,
    IMAGE_GEN_TIMEOUT_MS: 120000,
    IMAGE_GEN_MAX_TRIES: 2,
    MAX_FEED_CARDS: 24
  };
  var ORIENT_RES = { square: "512x512", portrait: "512x768", landscape: "768x512", random: "random" };
  var ORIENT_LABEL = { square: "□ Square", portrait: "▯ Portrait", landscape: "▭ Landscape", random: "🎲 Random" };
  var ORIENT_CYCLE = ["square", "portrait", "landscape", "random"];

  // ---------- state ----------
  var st = {
    instruction: "", antiDescription: "", styleOverride: "", orientation: "square",
    phase: "initial", totalVotes: 0, prompts: {}, order: [], recentDownvotedTexts: [],
    lastParentBatch: [], started: false, manualPause: false, hidden: false,
    instVersion: 1, inflight: 0, textGenInflight: 0, waiting: [], tasksById: {}, taskSeq: 0, savedMeta: [],
    evoLog: [], filter: 'all', championId: null, maxGenSeen: 0, forceNext: false
  };

  function running() { return st.started && !st.manualPause && !st.hidden; }
  function uid(p) { return p + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7); }
  function escapeHtml(s) { return ('' + (s == null ? '' : s)).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]); }); }
  function copyText(text, btn) {
    function ok(){ if (btn) flash(btn, '✓ copied'); }
    function fail(){ fallbackCopy(text); ok(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fail);
    else { fallbackCopy(text); ok(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch(e){}
    document.body.removeChild(ta);
  }
  var flashTimers = {};
  function flash(el, msg) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.style.outline = '2px solid #d44';
      setTimeout(function(){ el.style.outline = ''; }, 1200);
      return;
    }
    if (flashTimers[el.id]) { clearTimeout(flashTimers[el.id]); }
    var orig = el.textContent;
    var dis = el.disabled;
    el.textContent = msg; el.disabled = true;
    flashTimers[el.id] = setTimeout(function(){ el.textContent = orig; el.disabled = dis; delete flashTimers[el.id]; }, 1300);
  }

  // ---------- prompt pool helpers ----------
  function getAllPrompts() { return st.order.map(function(id){ return st.prompts[id]; }); }
  function getUntestedPrompts() { return getAllPrompts().filter(function(p){ return (p.used + (p._claimed||0)) === 0 && !p.stale && p.ver === st.instVersion; }); }
  function getScoredPrompts() { return getAllPrompts().filter(function(p){ return p.used > 0 && !p.stale && p.ver === st.instVersion; }); }
  function recomputeWeightedVotes(p) { p.weightedVotes = p.votes * p.lineageDecay; }
  function recomputeScore(p) {
    recomputeWeightedVotes(p);
    var base = (p.used > 0) ? (p.weightedVotes / p.used) : 0;
    p.score = base * (1 + Math.min(p.generation || 0, 10) * CFG.GENERATION_MULTIPLIER);
  }
  function topByScore(limit) {
    var a = getScoredPrompts().slice().sort(function(a,b){ return b.score - a.score; });
    return limit ? a.slice(0, limit) : a;
  }
  function weightedPickByScore(arr) {
    if (!arr.length) return null;
    var weights = arr.map(function(p){ return Math.max(0, p.score); });
    var sum = weights.reduce(function(a,b){ return a + b; }, 0);
    if (sum <= 0) return arr[Math.floor(Math.random()*arr.length)];
    var r = Math.random() * sum, c = 0;
    for (var i = 0; i < arr.length; i++) { c += weights[i]; if (r <= c) return arr[i]; }
    return arr[arr.length - 1];
  }

  // ---------- evolution visibility helpers ----------
  function shortId(id) { try { var parts = String(id).split('_'); return parts[parts.length - 1].slice(0, 4); } catch (e) { return '?'; } }
  function trunc(s, n) { s = '' + (s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function getMaxGen() { var m = 0; getAllPrompts().forEach(function(p){ if ((p.generation || 0) > m) m = p.generation; }); return m; }
  function getChampion() { var scored = getScoredPrompts().filter(function(p){ return p.votes > 0 && p.score > 0; }); if (!scored.length) return null; scored.sort(function(a,b){ return b.score - a.score; }); return scored[0]; }
  function getEvoCount() { return getAllPrompts().filter(function(p){ return (p.generation || 0) > 0 && p.ver === st.instVersion; }).length; }
  function toastEvo(msg, ms) {
    var el = $('evo-toast');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.hidden = true; }, ms || 5000);
  }
  function logEvo(html, cls) {
    var line = $('evo-evoline');
    if (!line) return;
    st.evoLog.unshift({ html: html, cls: cls || '', ts: Date.now() });
    if (st.evoLog.length > 8) st.evoLog.length = 8;
    renderEvoLine();
  }
  function renderEvoLine() {
    var line = $('evo-evoline');
    if (!line) return;
    line.innerHTML = '';
    st.evoLog.slice(0, 5).forEach(function(e){
      var d = document.createElement('div');
      d.className = 'evo-evo-row' + (e.cls ? ' ' + e.cls : '');
      d.innerHTML = e.html;
      line.appendChild(d);
    });
  }
  function renderStatus() {
    var phase = $('evo-phase-pill'), gen = $('evo-gen-pill'), pool = $('evo-pool-pill'), champ = $('evo-champ-line');
    if (!phase || !gen || !pool || !champ) return;
    var maxGen = getMaxGen();
    st.maxGenSeen = Math.max(st.maxGenSeen, maxGen);
    var evoCount = getEvoCount();
    var total = getAllPrompts().filter(function(p){ return p.ver === st.instVersion; }).length;
    var untested = getUntestedPrompts().length;
    if (st.phase === 'evolving') {
      phase.textContent = '🧬 evolving · Gen ' + maxGen;
      phase.classList.add('evo-is-evolving');
    } else {
      var need = Math.max(0, CFG.EVOLUTION_THRESHOLD - st.totalVotes);
      phase.textContent = need > 0 ? '🌱 gathering likes · ' + need + ' more to evolve' : '🌱 ready to evolve';
      phase.classList.remove('evo-is-evolving');
    }
    gen.textContent = maxGen > 0 ? ('Gen 0 → ' + maxGen + ' · ' + evoCount + ' evolved') : 'Gen 0';
    if (maxGen > 0) gen.classList.add('evo-has-evo'); else gen.classList.remove('evo-has-evo');
    pool.textContent = total + ' prompts · ' + untested + ' untested';
    var c = getChampion();
    if (c) {
      var isNew = st.championId !== c.id;
      st.championId = c.id;
      champ.innerHTML = '🏆 <b>Champion (Gen ' + (c.generation || 0) + ' · 👍' + c.votes + ' · ' + c.score.toFixed(2) + ')</b> — “' + escapeHtml(trunc(c.text, 140)) + '” <small>· new children breed from this</small>';
      if (isNew && st.totalVotes > 1) refreshChampionBadges();
    } else {
      st.championId = null;
      champ.textContent = st.phase === 'evolving' ? '🏆 No scored champion yet — keep voting.' : '🏆 No champion yet — tap 👍 on what you love.';
    }
  }
  function taskPassesFilter(t) {
    if (st.filter === 'all') return true;
    var p = t.promptId ? st.prompts[t.promptId] : null;
    if (!p) return false;
    if (st.filter === 'evolved') return (p.generation || 0) > 0;
    if (st.filter === 'liked') return !!t.ui.upvoted;
    if (st.filter === 'fresh') return (p.generation || 0) > 0 && (Date.now() - (p.createdAt || 0)) < 5 * 60 * 1000;
    return true;
  }
  function applyFilter() {
    Object.keys(st.tasksById).forEach(function(id){
      var t = st.tasksById[id];
      if (!t.ui || !t.ui.card) return;
      t.ui.card.style.display = taskPassesFilter(t) ? '' : 'none';
    });
  }
  function refreshChampionBadges() {
    Object.keys(st.tasksById).forEach(function(id){
      var t = st.tasksById[id];
      if (!t.ui || !t.ui.champBadge) return;
      var p = t.promptId ? st.prompts[t.promptId] : null;
      var isChamp = !!(p && st.championId && p.id === st.championId);
      t.ui.champBadge.style.display = isChamp ? '' : 'none';
      if (t.ui.genBadge && p) {
        var g = p.generation || 0;
        t.ui.genBadge.textContent = g > 0 ? ('🧬 Gen ' + g) : 'Gen 0';
        if (g > 0) t.ui.genBadge.classList.add('evo-is-bred'); else t.ui.genBadge.classList.remove('evo-is-bred');
      }
    });
  }

  // ---------- prompt cleaning ----------
  function parseList(s) {
    if (!s) return [];
    var out = [];
    ('' + s).split(/\r?\n/).forEach(function(ln){
      ln = ln.trim();
      if (!ln) return;
      var m = ln.match(/^\s*(\d+[\.\)\-:]|[•\-–])\s*(.+)$/);
      if (m) ln = m[2].trim();
      out.push(ln.replace(/^"(.*)"$/, '$1').trim());
    });
    return out.filter(Boolean);
  }
  function wordCount(s) { return (('' + s).trim().match(/\S+/g) || []).length; }
  function isValidCurlyBlocks(str) {
    if (typeof str !== 'string') return false;
    if (/[\\][{}]/.test(str)) return false;
    var opens = (str.match(/{/g) || []).length;
    var closes = (str.match(/}/g) || []).length;
    if (opens !== closes) return false;
    return !/[{}]/.test(str.replace(/\{[^{}]+\}/g, ''));
  }
  function looksTruncated(line) { return !/[.!?…)"'”’*]$/.test(line) || !isValidCurlyBlocks(line); }
  var CHATTER_RE = new RegExp([
    /\bas an? AI\b/, /\blanguage model\b/,
    /\bI (cannot|can ?not|can't|won't|will not|apologize|aim to|understand you|must (decline|refuse))\b/,
    /\bI('m| am) (sorry|unable|not able)\b/,
    /\bI('d| would) be happy\b/,
    /\bI('ve| have) (generated|created|produced|made)\b/,
    /^(sure|certainly|of course|absolutely|okay|understood|no problem)[,!.:]/,
    /^here('s| (are|is))\b/, /^below (are|is)\b/,
    /^these (\d+ )?(image |new )*prompts\b/,
    /^(note|disclaimer|warning|important|remember)\s*:/
  ].map(function(r){ return r.source; }).join('|'), 'i');
  function looksLikeChatter(line) { return CHATTER_RE.test(line); }
  function evaluateCurly(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\{([^{}]+)\}/g, function(_, inner){
      var opts = inner.split('|').map(function(x){ return x.trim(); }).filter(Boolean);
      return opts.length ? opts[Math.floor(Math.random()*opts.length)] : '';
    });
  }

  // ---------- prompt pool ----------
  function addPrompts(texts, parentIds) {
    var added = [];
    var generation = 0;
    if (parentIds && parentIds.length) {
      var mx = 0;
      parentIds.forEach(function(pid){ var par = st.prompts[pid]; if (par && (par.generation||0) > mx) mx = par.generation; });
      generation = mx + 1;
    }
    texts.forEach(function(t){
      t = ('' + t).trim();
      if (!t) return;
      if (!isValidCurlyBlocks(t)) return;
      var exists = st.order.some(function(id){ return st.prompts[id].text.toLowerCase() === t.toLowerCase(); });
      if (exists) return;
      var id = uid('p');
      st.prompts[id] = {
        id: id, text: t, used: 0, votes: 0, score: 0, createdAt: Date.now(), ver: st.instVersion,
        stale: false, _claimed: 0, parents: parentIds || [], generation: generation,
        weightedVotes: 0, lastVoteTimestamp: 0, lineageDecay: 1.0
      };
      st.order.push(id);
      added.push(st.prompts[id]);
    });
    if (added.length) {
      try {
        if (generation > 0) {
          var pnames = (parentIds || []).map(function(pid){ var par = st.prompts[pid]; return par ? ('Gen ' + (par.generation || 0) + ' #' + shortId(pid) + ' (👍' + (par.votes || 0) + ')') : ('#' + shortId(pid)); });
          logEvo('🧬 <b>Gen ' + generation + ' born:</b> ' + added.length + ' new prompt' + (added.length === 1 ? '' : 's') + ' bred from ' + (pnames.length ? pnames.join(' + ') : 'your favorites') + '. <small>Watch for gold 🧬 badges in the feed.</small>', 'evo-evo-birth');
          toastEvo('🧬 ' + added.length + ' evolved prompts born (Gen ' + generation + ') — look for gold badges');
        } else if (!st.started || st.order.length <= 12) {
          logEvo('🌱 Seed pool: ' + added.length + ' fresh Gen-0 prompts. <small>👍 the ones you love to start evolution.</small>', '');
        }
        renderStatus();
      } catch (_e) {}
    }
    return added;
  }
  function seedManualVote(p) {
    p.votes = Math.max(p.votes || 0, 1);
    if (!(p.used > 0)) p.used = 1;
    p.lastVoteTimestamp = Date.now();
    st.totalVotes++;
    maybeEnterEvolution(p);
    recomputeWeightedVotes(p); recomputeScore(p);
    updateVoteCounter();
  }

  // ---------- evolution ----------
  function maybeEnterEvolution(p) {
    if (st.phase === 'initial' && st.totalVotes >= CFG.EVOLUTION_THRESHOLD) {
      st.phase = 'evolving';
      updateVoteCounter();
      try {
        logEvo('🧬 <b>Evolution mode!</b> New prompts now breed from your top favorites — and away from what you disliked. <small>Keep voting to refine.</small>', 'evo-evo-birth');
        toastEvo('🧬 Evolution mode! New prompts breed from your favorites now');
        renderStatus();
      } catch (_e) {}
      var hint = $('evo-hint');
      hint.hidden = false;
      hint.innerHTML = '🧬 <b>Evolution mode!</b> New prompts now breed from your top favorites — and away from what you disliked. Keep voting to refine. Evolved images carry a gold <b>🧬 Gen N</b> badge and say who their parents are.';
      clearTimeout(hint._t);
      hint._t = setTimeout(function(){ hint.hidden = true; }, 9000);
    }
    if (st.phase === 'evolving' && st.totalVotes > CFG.EVOLUTION_THRESHOLD) {
      applyEvolutionaryDecay(p);
    }
  }
  function applyEvolutionaryDecay(upvoted) {
    var ancestors = new Set();
    var toVisit = (upvoted.parents || []).slice();
    while (toVisit.length) {
      var pid = toVisit.pop();
      if (ancestors.has(pid)) continue;
      ancestors.add(pid);
      var par = st.prompts[pid];
      if (par && par.parents) toVisit.push.apply(toVisit, par.parents);
    }
    getAllPrompts().forEach(function(p){
      if (p.stale || p.ver !== st.instVersion) return;
      if (ancestors.has(p.id) || p.id === upvoted.id) return;
      p.lineageDecay *= CFG.LINEAGE_DECAY_RATE;
      recomputeWeightedVotes(p); recomputeScore(p);
    });
  }

  // ---------- LLM prompt batch generation ----------
  var EXTRA_INSTRUCTIONS = [
    "Look closely at the user instruction. What is their underlying intent? Deeply fulfill that intent.",
    "Boldly explore variations that still obey the user instruction exactly; avoid timid small changes.",
    "Prefer highly descriptive, concrete details over generic adjectives when appropriate.",
    "Lean into the user instruction's constraints aggressively; do not add unrelated styles.",
    "Favor variation in specificity: some prompts terse, others richly detailed — all must match the user instruction exactly.",
    "Try a concise, comma-separated Stable Diffusion style for some prompts.",
    "Try a Midjourney-style phrasing for one prompt; others can be plain descriptive.",
    "Try DALL-E 3 natural language style with detailed scene descriptions in conversational phrasing.",
    "Be specific with camera technical details when appropriate: specific focal lengths (24mm, 85mm, 200mm), aperture (f/1.4, f/8), shot types (macro, wide-angle, telephoto), and angles (low-angle, overhead, Dutch tilt).",
    "For one prompt, focus on mood/lighting/atmosphere; for another, focus on composition/framing; keep both faithful to the user instruction.",
    "Include specific lighting conditions when appropriate: golden hour warmth, blue hour coolness, harsh midday sun, overcast soft light, dramatic rim lighting, volumetric god rays.",
    "Consider color relationships that enhance the image: complementary colors for contrast, analogous for harmony, monochromatic for mood, warm vs cool color temperatures.",
    "Reference compositional techniques when appropriate: rule of thirds, golden ratio, leading lines, symmetry, frame-within-frame, negative space, foreground/middleground/background depth.",
    "Include tactile and material details for richness: weathered vs pristine, matte vs glossy, organic textures (bark, fabric) vs manufactured (chrome, concrete), transparent vs opaque.",
    "When the user's intent allows, reference specific visual styles: art movements (Art Nouveau, Brutalism), cinematic looks (Blade Runner neon, Wes Anderson symmetry), or photographic styles (street photography, editorial fashion).",
    "Vary subject placement and framing: centered for symmetry, off-center using rule of thirds, close-up vs environmental context, tight crop vs expansive scene."
  ];
  var STYLE_KEYWORDS = ['style','lighting','camera','lens','focal','aperture','shot','Midjourney','DALL-E','Stable Diffusion','Technicolor','Panavision','cinematic','photography','color'];

  function maybeCurlyGuidance() {
    if (Math.random() < 0.7) {
      if ((st.styleOverride || '').trim().length) {
        return "\nUse curly brace syntax strategically for diversity: Add curly brace blocks with pipe-separated variants to explore different dimensions of CONTENT and SUBJECT MATTER only (NOT style/aesthetic). Recommended variation points: {mood/emotion words}, {subject variations}, {action/pose variations}, {setting/location details}, {composition approaches}, {weather/atmosphere}, {specific cultural/geographic locations}, {time period/era}. Example: \"a {joyful|contemplative|energetic} person {reading|walking|working} in a {cozy library|bustling cafe|quiet park}, {rainy day|sunny afternoon|twilight}\".";
      }
      return "\nUse curly brace syntax strategically for diversity: Add curly brace blocks with pipe-separated variants to explore different dimensions while staying true to the user instruction. Recommended variation points: {photographic style|art style|render style}, {mood/emotion words}, {lighting types}, {color palettes}, {camera angles}, {composition approaches}, {time of day}, {weather/atmosphere}, {texture/material qualities}, {specific cultural/geographic locations}. Example: \"a {candid street|formal studio|cinematic editorial} photograph of {traditional|modern|futuristic} architecture, {warm golden hour|cool blue hour|dramatic stormy} lighting, {symmetrical|dynamic asymmetric} composition, shot on {35mm film|digital medium format}, {vibrant saturated|muted desaturated|monochrome} tones\".";
    }
    return "";
  }
  function targetUntestedStock() {
    return Math.max(CFG.UNT_MIN_STOCK, st.waiting.length + st.inflight + CFG.GEN_PROMPTS_BATCH);
  }
  async function genFilteredLines(buildSys, wantCount, minWords, askCap) {
    var out = [], discarded = { short: 0, trunc: 0, chatter: 0 };
    for (var attempt = 0; attempt < 2 && out.length < wantCount; attempt++) {
      var need = Math.min(askCap || wantCount, wantCount - out.length);
      var prompt = buildSys(need);
      if (attempt > 0) {
        if (discarded.short > 0) prompt += "\n\nIMPORTANT: Your previous attempt produced prompts that were too short. Every prompt MUST be a detailed, multi-sentence paragraph of at least " + minWords + "+ words.";
        if (out.length > 0) prompt += "\n\nYou already generated the prompts below. Do NOT duplicate or closely paraphrase them — produce NEW, distinctly different prompts:\n<already_generated>\n" + out.map(function(x){ return "- " + x; }).join("\n") + "\n</already_generated>";
      }
      var text = null;
      try { text = await R.generateText(prompt); } catch(e){ break; }
      if (!text) break;
      text = text.replaceAll("[", "(").replaceAll("]", ")").replaceAll("Midjourney prompt: ", "").replaceAll("Midjourney: ", "");
      var parsed = parseList(text);
      for (var i = 0; i < parsed.length; i++) {
        var line = parsed[i];
        if (looksLikeChatter(line)) { discarded.chatter++; continue; }
        if (i === parsed.length - 1 && looksTruncated(line)) { discarded.trunc++; continue; }
        if (wordCount(line) < minWords) { discarded.short++; continue; }
        if (out.length >= wantCount) break;
        if (!out.some(function(x){ return x.toLowerCase() === line.toLowerCase(); })) out.push(line);
      }
    }
    return { lines: out, discarded: discarded };
  }
  async function generateOneBatch(force) {
    if (force) { if (!st.started || st.manualPause || st.hidden) return; if (st.textGenInflight >= 2) return; }
    else if (!running() || st.textGenInflight >= 2) return;
    st.textGenInflight++;
    try {
      var k = CFG.GEN_PROMPTS_BATCH;
      var longMode = Math.random() < CFG.LONG_PROMPT_RATE;
      var inst = (st.instruction || '').trim();
      if (!inst) return;

      var good = getAllPrompts().filter(function(p){ return p.votes > 0 && p.score > 0 && !p.stale && p.ver === st.instVersion; });
      var picks = [], parentIds = [];
      var parentProb = (st.phase === 'evolving' || st.forceNext || force) ? CFG.PARENT_PROB : 0;
      if (force) parentProb = 1;
      if (good.length && Math.random() < parentProb) {
        var pool = good.slice();
        var want = Math.min(CFG.PARENT_BATCH_SIZE, pool.length);
        for (var i2 = 0; i2 < want; i2++) {
          var pick = weightedPickByScore(pool) || pool[Math.floor(Math.random()*pool.length)];
          if (!pick) break;
          picks.push(pick);
          var idx = pool.indexOf(pick); if (idx >= 0) pool.splice(idx, 1);
        }
        picks.sort(function(a,b){ return b.score - a.score; });
        parentIds = picks.map(function(p){ return p.id; });
        st.lastParentBatch = parentIds;
      }

      var hasStyleOverride = (st.styleOverride || '').trim().length > 0;
      var extras = hasStyleOverride ? EXTRA_INSTRUCTIONS.filter(function(instr){ return !STYLE_KEYWORDS.some(function(kw){ return instr.toLowerCase().indexOf(kw) !== -1; }); }) : EXTRA_INSTRUCTIONS;
      var extra = extras.length ? extras[Math.floor(Math.random()*extras.length)] : EXTRA_INSTRUCTIONS[0];
      var curly = maybeCurlyGuidance();
      var negativeExamples = st.recentDownvotedTexts.length
        ? "\n\nThe user DISLIKED these prompts — avoid similar themes, compositions, and approaches:\n<disliked_prompts>\n" + st.recentDownvotedTexts.map(function(t){ return "- " + t; }).join("\n") + "\n</disliked_prompts>"
        : "";

      var baseWords = 40 + Math.round(Math.random()*3)*10;
      var lengthGuide = longMode
        ? "\n\nLength: Make each prompt a rich, detailed paragraph of roughly " + (baseWords*2) + " words — multiple full descriptive sentences. NEVER output a single short sentence."
        : "\n\nLength: Make each prompt a detailed, descriptive paragraph of at least " + baseWords + " words across multiple full sentences. NEVER output a single short sentence.";
      var styleOverrideNotice = hasStyleOverride
        ? "\n\nIMPORTANT: The user has set a style override that will be automatically appended to every prompt: \"" + st.styleOverride.trim() + "\". DO NOT include any style, aesthetic, technical photography details (lighting, camera, lens, etc.), art style references, or visual aesthetic descriptions in your prompts. Focus ONLY on the subject matter, scene, composition, and content. The style will be added automatically."
        : "";
      var rules = [
        "- One prompt per line (no commentary or numbering).",
        "- Keep the user's style/constraints; do not add unrelated styles; do not conflict with the instruction.",
        "- Include *ALL* details specified in the user instruction in each prompt. Make the prompt longer if needed to include *everything* that the user instruction specifies, creatively rephrased and creatively expanded into an image generation prompt.",
        "- Each prompt MUST be a detailed, multi-sentence paragraph rich with concrete visual detail — never a single short sentence or a bare phrase.",
        "- Avoid near-duplicates. Aim for full exploratory diversity within the constraints of the user instruction.",
        "- Strongly and eagerly lean into the *exact* type of image the user is asking for - pay ultra close attention to exactly what the user instructions ask for, and the deep intent behind the instruction. Within each prompt, use strong and repeated emphasis on the *key* aspects that the user wants, so you force the image generation model to generate exactly the type of image that the user is asking for. Sometimes the image generation model is dumb and needs to hear the same thing repeated in multiple different ways, with synonyms and rephrasing, so it gets the right idea about exactly what the prompt is asking for."
      ].join("\n");

      var allGeneratedLines = [];
      if (picks.length >= 3 && st.phase === 'evolving') {
        var top3 = picks.slice(0, 3);
        var rankedList = top3.map(function(p,i){ return "#" + (i+1) + " (score: " + p.score.toFixed(2) + "): " + p.text; }).join("\n");
        var s1r = await genFilteredLines(function(count){
          return "<user_instruction>\n" + inst + "\n</user_instruction>\n\nGenerate " + count + " NEW image prompt" + (count === 1 ? "" : "s") + " that EXACTLY satisfy the user_instruction; do not copy verbatim; do not conflict with user instruction; include ALL details specified in the user instruction." + lengthGuide + styleOverrideNotice + "\n\nBelow are the user's TOP 3 FAVORITE prompts, ranked by preference. Focus heavily on these - they represent what the user loves most:\n\n<top_favorites>\n" + rankedList + "\n</top_favorites>\n\nBreed and combine the best qualities from these top favorites into new prompts that the user will love even more. Pay special attention to #1 as it's the highest rated.\n\nExtra guide: " + extra + curly + negativeExamples + "\n\n" + rules;
        }, 3, baseWords, 3);
        allGeneratedLines = allGeneratedLines.concat(s1r.lines);
        if (allGeneratedLines.length < k) {
          var remaining = picks.slice(3);
          var remainList = remaining.length ? "\n\nAlso consider breeding from these favorites:\n" + remaining.map(function(p){ return "- " + p.text; }).join("\n") : "";
          var s2r = await genFilteredLines(function(count){
            return "<user_instruction>\n" + inst + "\n</user_instruction>\n\nGenerate " + count + " NEW image prompt" + (count === 1 ? "" : "s") + " that EXACTLY satisfy the user_instruction; include ALL details; do not copy verbatim; explore diverse but faithful interpretations." + lengthGuide + styleOverrideNotice + remainList + "\n\nExtra guide: " + extra + curly + negativeExamples + "\n\n" + rules;
          }, k - allGeneratedLines.length, baseWords, k - allGeneratedLines.length);
          allGeneratedLines = allGeneratedLines.concat(s2r.lines);
        }
      } else {
        var s0r = await genFilteredLines(function(count){
          return "<user_instruction>\n" + inst + "\n</user_instruction>\n\nGenerate " + count + " NEW image prompt" + (count === 1 ? "" : "s") + " that EXACTLY satisfy the user_instruction; include ALL details specified; do not copy verbatim; explore diverse but faithful interpretations of the user's idea." + lengthGuide + styleOverrideNotice + "\n\nExtra guide: " + extra + curly + negativeExamples + "\n\n" + rules;
        }, k, baseWords, k);
        allGeneratedLines = s0r.lines;
      }

      var added = addPrompts(allGeneratedLines, parentIds);
      if (added.length) refreshPromptsListIfOpen();
    } catch(e) {
      console.error("prompt batch failed", e);
    } finally {
      st.textGenInflight = Math.max(0, st.textGenInflight - 1);
      st.forceNext = false;
      try { renderStatus(); } catch (_e) {}
      setTimeout(schedule, 0);
    }
  }
  function forceEvolveNow() {
    if (!st.started) return;
    var good = getAllPrompts().filter(function(p){ return p.votes > 0 && !p.stale && p.ver === st.instVersion; });
    if (!good.length) { toastEvo('Tap 👍 on an image first — Evolve breeds from your likes'); return; }
    // nudge score-less liked prompts so the forced batch can breed from them immediately
    good.forEach(function(p){ if (!(p.score > 0)) { try { recomputeScore(p); } catch (_e) {} if (!(p.score > 0)) p.score = 0.5; } });
    st.forceNext = true;
    toastEvo('🧬 Breeding next batch from your favorites…');
    setTimeout(function(){ generateOneBatch(true); }, 0);
  }
  function ensureStock() {
    if (!st.started) return;
    if (!(st.instruction || '').trim()) return;
    if (getUntestedPrompts().length < targetUntestedStock() && st.textGenInflight < 2) {
      generateOneBatch();
    }
  }

  // ---------- prompt selection ----------
  function choosePromptForTask() {
    var fresh = getUntestedPrompts();
    if (st.phase === 'evolving') {
      var scored = getScoredPrompts();
      var pool = fresh.concat(scored);
      if (pool.length && Math.random() < 0.7) pool = fresh.length ? fresh : pool;
      return pool.length ? weightedPickByScore(pool) : null;
    }
    return fresh.length ? fresh[Math.floor(Math.random()*fresh.length)] : null;
  }

  // ---------- tasks / scheduler ----------
  var feedEl = $('evo-feed');
  function mkBtn(text, title) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'evo-btn evo-btn-ghost';
    b.textContent = text;
    b.title = title || '';
    return b;
  }
  function createTask() {
    var t = { id: uid('t'), idx: st.taskSeq++, state: 'queued', promptId: null, resolvedText: null, seed: null, ui: null };
    st.tasksById[t.id] = t;
    buildCard(t);
    st.waiting.push(t);
    trimFeed();
    return t;
  }
  function topUp() {
    if (!running()) return;
    var active = st.waiting.length + st.inflight;
    while (active < CFG.PARALLEL) { createTask(); active++; }
  }
  function schedule() {
    if (!running()) return;
    ensureStock();
    var i;
    for (i = 0; i < st.waiting.length; i++) {
      var task = st.waiting[i];
      if (task.promptId) continue;
      var p = choosePromptForTask();
      if (!p) {
        task.ui.setLoading('⏳ Generating prompt...');
        continue;
      }
      task.promptId = p.id;
      task.resolvedText = evaluateCurly(p.text);
      task.seed = Math.floor(Math.random() * 4294967295);
      p._claimed = (p._claimed || 0) + 1;
      task.ui.setLoading('🎨 waiting for slot…');
    }
    for (var j = 0; j < st.waiting.length; j++) {
      if (st.inflight >= CFG.PARALLEL) break;
      var t2 = st.waiting[j];
      if (!t2.promptId) continue;
      st.waiting.splice(j, 1); j--;
      st.inflight++;
      launchGeneration(t2);
    }
    topUp();
  }
  function trimFeed() {
    // Liked (👍) and saved (💾) cards are keepsakes — they live outside the
    // rotating budget. Capping the TOTAL (as before) meant that once ~21
    // cards were liked, every newly finished unvoted image became the sole
    // cullable card and the next task creation deleted it instantly (the
    // "new image flashes then vanishes" stall). So only unprotected
    // finished/error cards count toward MAX_FEED_CARDS, culled oldest-first
    // so fresh arrivals always survive long enough to be voted on.
    var ids = Object.keys(st.tasksById);
    var cullable = ids.map(function(id){ return st.tasksById[id]; })
      .filter(function(t){ return t && t.ui && (t.state === 'done' || t.state === 'error') && !t.ui.upvoted && !t.ui.saved; })
      .sort(function(a,b){ return a.idx - b.idx; });
    var over = cullable.length - CFG.MAX_FEED_CARDS;
    for (var i = 0; i < cullable.length && over > 0; i++) {
      var t = cullable[i];
      if (t.ui.card.parentNode) t.ui.card.parentNode.removeChild(t.ui.card);
      delete st.tasksById[t.id];
      over--;
    }
  }
  function buildCard(t) {
    var card = document.createElement('div');
    card.className = 'evo-card2';
    card.dataset.idx = t.idx;

    var imgwrap = document.createElement('div');
    imgwrap.className = 'evo-card-imgwrap';
    var loading = document.createElement('div');
    loading.className = 'evo-loading';
    var spin = document.createElement('div'); spin.className = 'evo-spinner';
    var ph = document.createElement('div'); ph.className = 'evo-ph'; ph.textContent = '⏳ Queued';
    loading.appendChild(spin); loading.appendChild(ph);
    imgwrap.appendChild(loading);

    var staleBadge = document.createElement('div');
    staleBadge.className = 'evo-stale-badge';
    staleBadge.textContent = 'stale';

    var badges = document.createElement('div');
    badges.className = 'evo-badges';
    var genBadge = document.createElement('span');
    genBadge.className = 'evo-genbadge';
    genBadge.textContent = 'Gen 0';
    var champBadge = document.createElement('span');
    champBadge.className = 'evo-champbadge';
    champBadge.textContent = '👑 champ';
    champBadge.style.display = 'none';
    badges.appendChild(genBadge); badges.appendChild(champBadge);
    imgwrap.appendChild(badges);

    var promptEl = document.createElement('div');
    promptEl.className = 'evo-card-prompt';

    var lineageEl = document.createElement('div');
    lineageEl.className = 'evo-lineage';
    lineageEl.style.display = 'none';

    var actions = document.createElement('div');
    actions.className = 'evo-card-actions';
    var copyBtn = mkBtn('📋', 'Copy prompt');
    var saveBtn = mkBtn('💾', 'Save image');
    var fsBtn = mkBtn('🔍', 'Fullscreen');
    var vaultBtn = mkBtn('📚', 'Save this prompt to your vault');
    var sendBtn = mkBtn('▸', 'Send this prompt to another tab');
    var pathBtn = mkBtn('🧭', 'Analyze & branch this prompt in Evolution Paths');
    var spacer = document.createElement('span'); spacer.className = 'evo-spacer';
    var voteDown = document.createElement('button'); voteDown.type = 'button'; voteDown.className = 'evo-vote evo-vote-down'; voteDown.title = 'Dislike — the AI steers away from this'; voteDown.textContent = '👎';
    var voteUp = document.createElement('button'); voteUp.type = 'button'; voteUp.className = 'evo-vote evo-vote-up'; voteUp.title = 'Like — breed the next generation from this'; voteUp.textContent = '👍';
    actions.appendChild(copyBtn); actions.appendChild(saveBtn); actions.appendChild(fsBtn);
    actions.appendChild(vaultBtn); actions.appendChild(sendBtn); actions.appendChild(pathBtn);
    actions.appendChild(spacer); actions.appendChild(voteDown); actions.appendChild(voteUp);

    card.appendChild(imgwrap); card.appendChild(staleBadge); card.appendChild(promptEl); card.appendChild(lineageEl); card.appendChild(actions);
    feedEl.appendChild(card);

    var ui = {
      card: card, imgwrap: imgwrap, loading: loading, ph: ph, promptEl: promptEl, lineageEl: lineageEl, genBadge: genBadge, champBadge: champBadge,
      copyBtn: copyBtn, saveBtn: saveBtn, fsBtn: fsBtn, vaultBtn: vaultBtn, sendBtn: sendBtn, pathBtn: pathBtn, voteUp: voteUp, voteDown: voteDown,
      imgEl: null, upvoted: false, downvoted: false, saved: false,
      setLoading: function(msg){ this.ph.textContent = msg; }
    };
    t.ui = ui;
    bindCardHandlers(t);
    return ui;
  }
  function bindCardHandlers(t) {
    var ui = t.ui;
    ui.copyBtn.addEventListener('click', function(e){
      e.stopPropagation();
      var full = ui.promptEl.dataset.full || ui.promptEl.textContent;
      copyText(full + (t.seed != null ? ' (seed:::' + t.seed + ')' : ''), ui.copyBtn);
    });
    ui.saveBtn.addEventListener('click', function(e){ e.stopPropagation(); saveToSaved(t); });
    ui.fsBtn.addEventListener('click', function(e){ e.stopPropagation(); openFullscreen(t); });
    ui.vaultBtn.addEventListener('click', async function(e){
      e.stopPropagation();
      if (!window.Vault) return;
      var full = ui.promptEl.dataset.full || ui.promptEl.textContent;
      if (!full) return;
      ui.vaultBtn.textContent = '✅';
      try {
        var url = ui.imgEl && ui.imgEl.src ? ui.imgEl.src : '';
        if (url && window.Vault.addImage) await window.Vault.addImage(url, full, { tags: ['evolution'], tab: 'evo' });
        else await window.Vault.add(full, { tags: ['evolution'], tab: 'evo' });
      } catch (err) { console.error(err); ui.vaultBtn.textContent = '⚠️'; }
      setTimeout(function(){ ui.vaultBtn.textContent = '📚'; }, 1500);
    });
    ui.pathBtn.addEventListener('click', function(e){
      e.stopPropagation();
      var full = ui.promptEl.dataset.full || ui.promptEl.textContent;
      openPaths(full, t.promptId);
    });
    ui.sendBtn.addEventListener('click', function(e){
      e.stopPropagation();
      var full = ui.promptEl.dataset.full || ui.promptEl.textContent;
      if (!window.PromptBridge || !full) return;
      window.PromptBridge.sendTo(full, { anchor: ui.sendBtn, preview: full, tags: ['evolution'] });
    });
    ui.voteUp.addEventListener('click', function(e){ e.stopPropagation(); vote(t, 1); });
    ui.voteDown.addEventListener('click', function(e){ e.stopPropagation(); vote(t, -1); });
    ui.promptEl.addEventListener('click', function(){ openFullscreen(t); });
  }
  function toUrl(r) {
    if (!r) return '';
    if (typeof r === 'string') return r;
    return r.dataUrl || r.url || r.src || String(r) || '';
  }
  function launchGeneration(t) {
    var p = st.prompts[t.promptId];
    if (!p) {
      t.promptId = null; t.resolvedText = null;
      t.ui.setLoading('⏳ Generating prompt...');
      t.state = 'waiting';
      if (st.waiting.indexOf(t) === -1) st.waiting.push(t);
      return;
    }
    t.state = 'running';
    t.ui.setLoading('🎨 Generating image…');
    if (t._stopFunny) { try { t._stopFunny(); } catch (_e) {} t._stopFunny = null; }
    if (window.FunnyGen) { try { t._stopFunny = window.FunnyGen.start(function (line) { if (t.state === 'running') t.ui.setLoading('🎨 ' + line); }); } catch (_e) {} }
    var resolved = t.resolvedText || p.text;
    var finalPrompt = resolved;
    if ((st.styleOverride || '').trim()) finalPrompt = resolved + ', ' + st.styleOverride.trim();
    var res = ORIENT_RES[st.orientation] || '512x512';
    if (st.orientation === 'random') res = ['512x512', '512x768', '768x512'][Math.floor(Math.random()*3)];
    var opts = { resolution: res, seed: t.seed, hideGalleryButtons: true };
    if ((st.antiDescription || '').trim()) opts.negativePrompt = st.antiDescription.trim();
    (async function(){
      try {
        var result = await generateImageWithTimeout(finalPrompt, opts, CFG.IMAGE_GEN_TIMEOUT_MS);
        p.used += 1;
        recomputeScore(p);
        attachImage(t, result, p, resolved);
        t.state = 'done';
      } catch(e) {
        console.error('image gen failed', e);
        t.ui.setLoading('⚠ ' + Quip.q("evoFail", "failed — tap to retry"));
        t.state = 'error';
        if (!t.ui._retryBound) {
          t.ui._retryBound = true;
          t.ui.card.addEventListener('click', function(ev){
            if (t.state !== 'error') return;
            if (ev.target.closest('button')) return;
            retryTask(t);
          });
        }
      } finally {
        if (t._stopFunny) { try { t._stopFunny(); } catch (_e) {} t._stopFunny = null; }
        p._claimed = Math.max(0, (p._claimed || 1) - 1);
        st.inflight = Math.max(0, st.inflight - 1);
        setTimeout(schedule, 0);
      }
    })();
  }
  function generateImageWithTimeout(prompt, opts, ms) {
    return new Promise(function(resolve, reject){
      var done = false;
      var timer = setTimeout(function(){
        if (done) return;
        done = true;
        reject(new Error('timed out after ' + ms + 'ms'));
      }, ms);
      R.generateImage(prompt, opts).then(function(r){
        if (done) return;
        done = true; clearTimeout(timer);
        resolve(r);
      }, function(err){
        if (done) return;
        done = true; clearTimeout(timer);
        reject(err);
      });
    });
  }
  function attachImage(t, result, p, resolvedText) {
    var ui = t.ui;
    var src = toUrl(result);
    var img = document.createElement('img');
    img.alt = ''; img.src = src; img.loading = 'lazy';
    ui.imgwrap.innerHTML = '';
    ui.imgwrap.appendChild(img);
    // rebuild badges (imgwrap was cleared) — reuse the existing badge nodes
    var bad = document.createElement('div'); bad.className = 'evo-badges';
    ui.genBadge = ui.genBadge || document.createElement('span');
    ui.champBadge = ui.champBadge || document.createElement('span');
    bad.appendChild(ui.genBadge); bad.appendChild(ui.champBadge);
    ui.imgwrap.appendChild(bad);
    ui.imgEl = img;
    var show = resolvedText || p.text;
    ui.promptEl.textContent = show;
    ui.promptEl.title = p.text;
    ui.promptEl.dataset.full = p.text;
    var g = p.generation || 0;
    ui.genBadge.textContent = g > 0 ? ('🧬 Gen ' + g) : 'Gen 0';
    if (g > 0) ui.genBadge.classList.add('evo-is-bred'); else ui.genBadge.classList.remove('evo-is-bred');
    ui.genBadge.title = g > 0 ? 'Evolved prompt — bred from your liked images' : 'Seed prompt — first generation';
    var isChamp = !!(st.championId && p.id === st.championId);
    ui.champBadge.style.display = isChamp ? '' : 'none';
    if ((p.parents || []).length) {
      var names = p.parents.map(function(pid){ var par = st.prompts[pid]; return par ? ('Gen ' + (par.generation || 0) + ' #' + shortId(pid)) : ('#' + shortId(pid)); }).join(' + ');
      var ptips = p.parents.map(function(pid){ var par = st.prompts[pid]; return par ? trunc(par.text, 120) : '(removed)'; }).join('  |  ');
      ui.lineageEl.innerHTML = '🧬 <b>Gen ' + g + ' evolved</b> from ' + escapeHtml(names);
      ui.lineageEl.title = ptips;
      ui.lineageEl.style.display = '';
    } else {
      ui.lineageEl.textContent = g > 0 ? ('🧬 Gen ' + g + ' evolved') : '🌱 seed (Gen 0)';
      ui.lineageEl.title = g > 0 ? 'Bred from your likes' : 'First-generation prompt — like it to breed from it';
      ui.lineageEl.style.display = '';
    }
    if (g > 0 && (Date.now() - (p.createdAt || 0)) < 90 * 1000) ui.card.classList.add('evo-fresh');
    if (p.stale) ui.card.classList.add('evo-stale');
    img.addEventListener('click', function(){ openFullscreen(t); });
    try { renderStatus(); refreshChampionBadges(); applyFilter(); } catch (_e) {}
  }
  function retryTask(t) {
    if (t.state !== 'error') return;
    var p = t.promptId ? st.prompts[t.promptId] : null;
    if (t.promptId && !p) { t.promptId = null; t.resolvedText = null; }
    if (p) p._claimed = (p._claimed || 0) + 1;
    t.ui.setLoading(t.promptId ? '🎨 waiting for slot…' : '⏳ Generating prompt...');
    t.state = 'waiting';
    if (st.waiting.indexOf(t) === -1) st.waiting.push(t);
    schedule();
  }

  // ---------- voting ----------
  function undoUpvote(t) {
    var ui = t.ui;
    ui.upvoted = false;
    ui.voteUp.classList.remove('evo-active');
    ui.card.classList.remove('evo-upvoted');
    var p = st.prompts[t.promptId];
    if (p) p.votes = Math.max(0, p.votes - 1);
    st.totalVotes = Math.max(0, st.totalVotes - 1);
  }
  function undoDownvote(t) {
    var ui = t.ui;
    ui.downvoted = false;
    ui.voteDown.classList.remove('evo-active');
    ui.card.classList.remove('evo-downvoted');
    var p = st.prompts[t.promptId];
    if (p) {
      p.votes += 1;
      if (p.stale && p.votes > -1) { p.stale = false; ui.card.classList.remove('evo-stale'); }
      removeRecentDownvote(p.text);
    }
  }
  function addRecentDownvote(text) {
    st.recentDownvotedTexts = [text].concat(st.recentDownvotedTexts.filter(function(t){ return t !== text; })).slice(0, 3);
  }
  function removeRecentDownvote(text) {
    st.recentDownvotedTexts = st.recentDownvotedTexts.filter(function(t){ return t !== text; });
  }
  function vote(t, dir) {
    var ui = t.ui;
    if (t.state !== 'done' || !t.promptId) return;
    var p = st.prompts[t.promptId];
    if (!p) return;
    if (dir > 0) {
      if (ui.upvoted) {
        undoUpvote(t);
      } else {
        if (ui.downvoted) undoDownvote(t);
        ui.upvoted = true;
        ui.voteUp.classList.add('evo-active');
        ui.card.classList.add('evo-upvoted');
        p.votes += 1;
        st.totalVotes++;
        p.lastVoteTimestamp = Date.now();
        if (/\{[^{}]+\}/.test(p.text) && t.resolvedText && t.resolvedText.indexOf('{') === -1) {
          var added = addPrompts([t.resolvedText]);
          if (added.length) refreshPromptsListIfOpen();
        }
        maybeEnterEvolution(p);
      }
    } else {
      if (ui.downvoted) {
        undoDownvote(t);
      } else {
        if (ui.upvoted) undoUpvote(t);
        ui.downvoted = true;
        ui.voteDown.classList.add('evo-active');
        ui.card.classList.add('evo-downvoted');
        p.votes -= 1;
        addRecentDownvote(p.text);
        if (p.votes <= -2) { p.stale = true; ui.card.classList.add('evo-stale'); }
      }
    }
    recomputeWeightedVotes(p); recomputeScore(p);
    updateVoteCounter();
    try {
      renderStatus(); refreshChampionBadges(); applyFilter(); refreshPromptsListIfOpen();
      var c = getChampion();
      if (c && dir > 0 && c.id === p.id && !ui.upvoted === false) {
        // champion confirmation is rendered in the statusbar; log only on takeovers
      }
    } catch (_e) {}
    if (fsTask === t) refreshFsVote(t);
  }
  function updateVoteCounter() {
    try { renderStatus(); } catch (_e) {}
    var el = $('evo-votecounter');
    if (st.phase === 'evolving') {
      el.textContent = '🧬 evolving · 👍 ' + st.totalVotes;
      el.classList.add('evo-evolving');
    } else if (st.totalVotes >= CFG.EVOLUTION_THRESHOLD) {
      el.textContent = '👍 ' + st.totalVotes;
      el.classList.add('evo-evolving');
    } else {
      el.textContent = '👍 ' + st.totalVotes + ' · ' + st.totalVotes + '/' + CFG.EVOLUTION_THRESHOLD + ' to evolve';
      el.classList.remove('evo-evolving');
    }
  }

  // ---------- fullscreen ----------
  var fsTask = null;
  function openFullscreen(t) {
    if (t.state !== 'done' || !t.ui.imgEl) return;
    fsTask = t;
    $('evo-fs-img').src = t.ui.imgEl.src;
    $('evo-fs-prompt').textContent = (t.resolvedText || (t.promptId && st.prompts[t.promptId] ? st.prompts[t.promptId].text : '')) + (t.seed != null ? '\n(seed:::' + t.seed + ')' : '');
    $('evo-fs-up').style.display = '';
    $('evo-fs-down').style.display = '';
    refreshFsVote(t);
    $('evo-fs').hidden = false;
  }
  function refreshFsVote(t) {
    $('evo-fs-up').classList.toggle('evo-active', !!t.ui.upvoted);
    $('evo-fs-down').classList.toggle('evo-active', !!t.ui.downvoted);
  }
  function openSavedFs(src, prompt) {
    fsTask = null;
    $('evo-fs-img').src = src;
    $('evo-fs-prompt').textContent = prompt || '';
    $('evo-fs-up').style.display = 'none';
    $('evo-fs-down').style.display = 'none';
    $('evo-fs').hidden = false;
  }
  function closeFullscreen() { $('evo-fs').hidden = true; fsTask = null; }
  $('evo-fs-close').addEventListener('click', closeFullscreen);
  $('evo-fs-up').addEventListener('click', function(){ if (fsTask) vote(fsTask, 1); });
  $('evo-fs-down').addEventListener('click', function(){ if (fsTask) vote(fsTask, -1); });
  $('evo-fs').addEventListener('click', function(e){ if (e.target === $('evo-fs')) closeFullscreen(); });
  document.addEventListener('keydown', function(e){ if (!$('evo-fs').hidden && e.key === 'Escape') closeFullscreen(); });

  // ---------- saved images (IndexedDB) ----------
  var idbPromise = null;
  function idbOpen() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function(res, rej){
      try {
        var req = indexedDB.open('evo-saved-v1', 1);
        req.onupgradeneeded = function(){ req.result.createObjectStore('imgs', { keyPath: 'id' }); };
        req.onsuccess = function(){ res(req.result); };
        req.onerror = function(){ rej(req.error); };
      } catch(e) { rej(e); }
    });
    return idbPromise;
  }
  function idbPut(rec) {
    return idbOpen().then(function(db){
      return new Promise(function(res, rej){
        var tx = db.transaction('imgs', 'readwrite');
        tx.objectStore('imgs').put(rec);
        tx.oncomplete = res; tx.onerror = function(){ rej(tx.error); };
      });
    });
  }
  function idbAll() {
    return idbOpen().then(function(db){
      return new Promise(function(res, rej){
        var tx = db.transaction('imgs', 'readonly');
        var rq = tx.objectStore('imgs').getAll();
        rq.onsuccess = function(){ res(rq.result || []); };
        rq.onerror = function(){ rej(rq.error); };
      });
    });
  }
  function idbDelete(id) {
    return idbOpen().then(function(db){
      return new Promise(function(res, rej){
        var tx = db.transaction('imgs', 'readwrite');
        tx.objectStore('imgs').delete(id);
        tx.oncomplete = res; tx.onerror = function(){ rej(tx.error); };
      });
    });
  }
  function saveToSaved(t) {
    if (t.state !== 'done' || !t.ui.imgEl || t.ui.saved) return;
    var src = t.ui.imgEl.src;
    var prompt = t.resolvedText || (t.promptId && st.prompts[t.promptId] ? st.prompts[t.promptId].text : '');
    var rec = { id: uid('s'), src: src, prompt: prompt, seed: t.seed, ts: Date.now() };
    idbPut(rec).then(function(){
      t.ui.saved = true;
      t.ui.saveBtn.textContent = '✓';
      st.savedMeta.unshift({ id: rec.id, prompt: prompt, ts: rec.ts });
      if (st.savedMeta.length > 500) st.savedMeta.length = 500;
      saveSavedMeta();
      updateSavedCount();
    }).catch(function(e){ console.error('save failed', e); });
  }
  function loadSavedMeta() {
    try { st.savedMeta = JSON.parse(localStorage['evoSavedMeta'] || '[]'); } catch(e) { st.savedMeta = []; }
    updateSavedCount();
  }
  function saveSavedMeta() {
    try { localStorage['evoSavedMeta'] = JSON.stringify(st.savedMeta.slice(0, 500)); } catch(e){}
  }
  function updateSavedCount() { $('evo-saved-count').textContent = st.savedMeta.length; }

  // ---------- modals ----------
  function openPromptsModal() { renderPromptsList(); $('evo-prompts-modal').hidden = false; }
  function renderPromptsList() {
    var list = $('evo-prompts-list');
    list.innerHTML = '';
    var all = getAllPrompts().slice();
    if (!all.length) {
      list.innerHTML = '<div style="opacity:0.6;font-size:0.85rem;padding:1rem;text-align:center;">No prompts yet — they appear as soon as the feed starts generating. ' + Quip.q("evoPoolEmpty", "The pool is empty.") + '</div>';
      return;
    }
    var champ = getChampion();
    var intro = document.createElement('div');
    intro.style.cssText = 'font-size:0.78rem;opacity:0.7;line-height:1.5;margin-bottom:0.4rem;';
    var maxGen = getMaxGen();
    intro.textContent = maxGen > 0 ? ('Family tree: Gen 0 seeds at the bottom, Gen ' + maxGen + ' children at the top. 👑 = current champion your next children breed from. Click any prompt to copy it.') : 'Seed generation (Gen 0). 👍 images you love and their children will appear here as Gen 1, Gen 2… — this list becomes the family tree.';
    list.appendChild(intro);
    var gens = {};
    all.forEach(function(p){ var g = p.generation || 0; (gens[g] = gens[g] || []).push(p); });
    var genKeys = Object.keys(gens).map(Number).sort(function(a,b){ return b - a; });
    var _first = true;
    var _genLoop = genKeys;
    _genLoop.forEach(function(g){
      var head = document.createElement('div');
      head.className = 'evo-probe-genhead';
      var members = gens[g];
      var evoCt = members.filter(function(p){ return (p.generation || 0) > 0; }).length;
      head.textContent = g === 0 ? ('🌱 Generation 0 — seeds (' + members.length + ')') : ('🧬 Generation ' + g + ' — bred from your likes (' + members.length + ')');
      list.appendChild(head);
      members.sort(function(a,b){ return b.score - a.score; }).forEach(function(p){
      _first = false;
      var row = document.createElement('div');
      row.className = 'evo-probe' + (p.stale ? ' evo-probe-stale' : '');
      var txt = document.createElement('div');
      txt.className = 'evo-probe-text'; txt.textContent = p.text; txt.title = 'Click to copy';
      txt.addEventListener('click', function(){ copyText(p.text); });
      var meta = document.createElement('div');
      meta.className = 'evo-probe-meta';
      meta.appendChild(probeTag('gen ' + (p.generation || 0)));
      if (p.votes > 0) meta.appendChild(probeTag('👍' + p.votes + ' · ' + (p.score || 0).toFixed(2), 'evo-tag-votes'));
      else if (p.votes < 0) meta.appendChild(probeTag('👎' + Math.abs(p.votes)));
      if (p.used) meta.appendChild(probeTag('used ' + p.used));
      if (p.stale) meta.appendChild(probeTag('stale'));
      else if ((p.used + (p._claimed||0)) === 0) meta.appendChild(probeTag('untested'));
      if (p.lineageDecay < 1) meta.appendChild(probeTag((p.lineageDecay * 100).toFixed(0) + '%'));
      var isChamp = !!(champ && p.id === champ.id);
      if (isChamp) { var crown = document.createElement('div'); crown.className = 'evo-probe-crown'; crown.textContent = '👑 current champion — next children breed from this'; row.appendChild(crown); }
      if ((p.parents || []).length) {
        var par = document.createElement('div');
        par.className = 'evo-probe-parents';
        par.textContent = '🧬 bred from ' + p.parents.map(function(pid){ var pp = st.prompts[pid]; return pp ? ('Gen ' + (pp.generation || 0) + ' #' + shortId(pid) + ' (👍' + (pp.votes || 0) + ')') : ('#' + shortId(pid)); }).join(' + ');
        par.title = p.parents.map(function(pid){ var pp = st.prompts[pid]; return pp ? trunc(pp.text, 160) : '(removed prompt)'; }).join('\n---\n');
        row.appendChild(par);
      } else if ((p.generation || 0) > 0) {
        var par2 = document.createElement('div'); par2.className = 'evo-probe-parents'; par2.textContent = '🧬 evolved (parents left the pool)'; row.appendChild(par2);
      }
      var del = document.createElement('button');
      del.className = 'evo-probe-del'; del.textContent = '✕'; del.title = 'Remove this prompt';
      del.addEventListener('click', function(){
        delete st.prompts[p.id];
        var i = st.order.indexOf(p.id); if (i >= 0) st.order.splice(i, 1);
        try { renderStatus(); } catch (_e) {}
        renderPromptsList();
      });
      row.appendChild(txt); row.appendChild(meta); row.appendChild(del);
      list.appendChild(row);
      });
    });
  }
  function probeTag(text, cls) {
    var s = document.createElement('span');
    s.className = 'evo-probe-tag' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }
  function refreshPromptsListIfOpen() { if (!$('evo-prompts-modal').hidden) renderPromptsList(); }

  function openSavedModal() { renderSavedGrid(); $('evo-saved-modal').hidden = false; }
  function renderSavedGrid() {
    var grid = $('evo-saved-grid');
    grid.innerHTML = '<div style="opacity:0.6;font-size:0.85rem;padding:1rem;text-align:center;">Loading…</div>';
    idbAll().then(function(recs){
      recs.sort(function(a,b){ return b.ts - a.ts; });
      grid.innerHTML = '';
      if (!recs.length) {
        grid.innerHTML = '<div style="opacity:0.6;font-size:0.85rem;padding:1rem;text-align:center;">Nothing saved yet — ' + Quip.q("evoSavedBare", "the fridge door is bare.") + ' Tap 💾 on any image to keep it here — saved images persist across reloads.</div>';
        return;
      }
      recs.forEach(function(rec){
        var item = document.createElement('div');
        item.className = 'evo-saved-item';
        var img = document.createElement('img');
        img.src = rec.src; img.alt = '';
        img.addEventListener('click', function(){ openSavedFs(rec.src, rec.prompt); });
        var del = document.createElement('button');
        del.className = 'evo-saved-del'; del.textContent = '✕'; del.title = 'Delete';
        del.addEventListener('click', function(e){
          e.stopPropagation();
          idbDelete(rec.id).then(function(){
            st.savedMeta = st.savedMeta.filter(function(m){ return m.id !== rec.id; });
            saveSavedMeta(); updateSavedCount();
            renderSavedGrid();
          });
        });
        item.appendChild(img); item.appendChild(del);
        grid.appendChild(item);
      });
    }).catch(function(e){
      console.error(e);
      grid.innerHTML = '<div style="opacity:0.6;font-size:0.85rem;padding:1rem;text-align:center;">Could not open saved images.</div>';
    });
  }

  // ---------- brain: expand an idea ----------
  var brainActive = false;
  $('evo-brain').addEventListener('click', function(){
    if (brainActive) return;
    var idea = $('evo-idea').value.trim();
    if (!idea) { flash($('evo-idea'), '⚠️ type an idea first'); return; }
    brainActive = true;
    $('evo-brain').disabled = true;
    $('evo-brain').textContent = '🧠 Expanding…';
    $('evo-brain-out').hidden = false;
    var textEl = $('evo-brain-text');
    textEl.textContent = '';
    var result = R.generateText({
      instruction: "You are an expert prompt engineer for AI image generators. Below is a rough idea from a user. Expand it into one polished, highly detailed image-generation prompt (a single rich paragraph, 60-120 words) that vividly captures the user's intent: their exact subject, scene, mood, lighting, style and composition. Keep every core detail the user mentioned, then enrich it with concrete visual detail. Output ONLY the prompt, no quotes, labels or explanation.\n\nUser's idea: " + idea,
      onChunk: function(d){ textEl.textContent += d.textChunk; }
    });
    result.then(function(){
      brainActive = false;
      $('evo-brain').disabled = false;
      $('evo-brain').textContent = '🧠 Expand this idea';
    }).catch(function(e){
      console.error(e);
      brainActive = false;
      $('evo-brain').disabled = false;
      $('evo-brain').textContent = '🧠 Expand this idea';
      textEl.textContent = '⚠️ Expansion failed — try again.';
    });
  });
  $('evo-brain-use').addEventListener('click', function(){
    var t = $('evo-brain-text').textContent.trim();
    if (t && t.indexOf('⚠️') !== 0) { $('evo-idea').value = t; $('evo-brain-out').hidden = true; }
  });
  $('evo-brain-copy').addEventListener('click', function(){
    copyText($('evo-brain-text').textContent.trim(), $('evo-brain-copy'));
  });
  var EVO_IDEAS = [
    'weird meme, low quality',
    'a lighthouse at the end of the universe',
    'cozy goblin workshop full of glowing gadgets',
    'an astronaut botanist in a glass greenhouse orbiting Saturn',
    'underwater city with whale submarines',
    'a dragon made of autumn leaves',
    'retro-futuristic diner on Mars',
    'a tiny knight facing a giant snail',
    'bioluminescent forest spirit',
    'steampunk airship battle above the clouds'
  ];
  $('evo-surprise').addEventListener('click', function(){
    var el = $('evo-idea');
    if (el.value.trim()) { flash(el, 'clear the box first'); el.focus(); return; }
    el.value = EVO_IDEAS[Math.floor(Math.random() * EVO_IDEAS.length)];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  });
  $('evo-vault-load').addEventListener('click', function(){
    if (!window.Vault) { flash($('evo-idea'), '⚠️ vault still loading…'); return; }
    window.Vault.pick(function(text){ $('evo-idea').value = text; $('evo-idea').focus(); });
  });
  $('evo-from-gallery').addEventListener('click', function(){
    if (window.ensureGallery) window.ensureGallery();
    var t0 = Date.now();
    (function tick(){
      if (window.t2iGetGallery) return openGalleryPick();
      if (Date.now() - t0 > 8000) { flash($('evo-idea'), '⚠️ gallery still loading…'); return; }
      setTimeout(tick, 200);
    })();
  });
  function openGalleryPick() {
    var items = (window.t2iGetGallery() || []).filter(function(i){ return i && i.prompt && i.url; });
    var old = document.getElementById('evoGalPick'); if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'evoGalPick';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:1rem;';
    var box = document.createElement('div');
    box.style.cssText = 'width:min(860px,100%);max-height:100%;overflow-y:auto;background:var(--th-modal,#1c1e22);border:1px solid var(--th-border);border-radius:14px;padding:.9rem;font-family:var(--th-font);';
    var html = '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem;"><b style="font-size:1.05rem;">🖼️ Pick a prompt from your gallery</b><span style="flex:1"></span><button id="evoGalPickClose" style="cursor:pointer;border:1px solid var(--th-border);background:transparent;color:inherit;border-radius:8px;padding:.25rem .6rem;">✖️</button></div>';
    if (!items.length) {
      html += '<div style="opacity:.6;text-align:center;padding:1.5rem;">No gallery images with prompts yet. Generate an image on the 🎨 or 🚀 tab and it will show up here. ' + Quip.q("evoNoGallery", "Go on, make something cursed.") + '</div>';
    } else {
      html += '<div style="display:flex;flex-wrap:wrap;gap:.6rem;">';
      items.slice(0, 120).forEach(function(it, i){
        html += '<button data-gp="' + i + '" style="width:150px;cursor:pointer;border:1px solid var(--th-border);border-radius:9px;background:transparent;color:inherit;padding:.3rem;text-align:left;overflow:hidden;">'
          + '<img src="' + escapeHtml(it.url) + '" loading="lazy" style="width:100%;height:110px;object-fit:cover;border-radius:6px;background:#000;display:block;">'
          + '<div style="font-size:72%;opacity:.85;max-height:3.6rem;overflow:hidden;margin-top:.25rem;">' + escapeHtml(String(it.prompt).slice(0, 120)) + '</div>'
          + '</button>';
      });
      html += '</div>';
    }
    box.innerHTML = html;
    ov.appendChild(box);
    document.body.appendChild(ov);
    ov.addEventListener('mousedown', function(e){ if (e.target === ov) ov.remove(); });
    var cl = document.getElementById('evoGalPickClose'); if (cl) cl.addEventListener('click', function(){ ov.remove(); });
    box.querySelectorAll('[data-gp]').forEach(function(b){
      b.addEventListener('click', function(){
        var it = items[Number(b.getAttribute('data-gp'))];
        if (it) { $('evo-idea').value = it.prompt; $('evo-idea').focus(); }
        ov.remove();
      });
    });
  }

  // ---------- session controls ----------
  $('evo-start').addEventListener('click', startSession);
  function startSession() {
    var idea = $('evo-idea').value.trim();
    if (!idea) { flash($('evo-idea'), '⚠️ describe an idea first'); $('evo-idea').focus(); return; }
    st.instruction = idea;
    st.antiDescription = $('evo-anti').value.trim();
    st.styleOverride = $('evo-style').value.trim();
    st.orientation = $('evo-orient-landing').value;
    st.instVersion++;
    st.phase = 'initial';
    st.totalVotes = 0;
    st.prompts = {}; st.order = []; st.recentDownvotedTexts = []; st.lastParentBatch = [];
    st.evoLog = []; st.championId = null; st.maxGenSeen = 0; st.filter = 'all'; st.forceNext = false;
    var _ff = $('evo-filter'); if (_ff) _ff.value = 'all';
    var _el = $('evo-evoline'); if (_el) _el.innerHTML = '';
    var _tt = $('evo-toast'); if (_tt) _tt.hidden = true;
    st.started = true; st.manualPause = false; st.hidden = false;
    $('evo-landing').hidden = true;
    $('evo-session').hidden = false;
    $('evo-idea-line').innerHTML = '<b>Idea:</b> ' + escapeHtml(idea) + (st.antiDescription ? ' &nbsp;·&nbsp; <b>Avoid:</b> ' + escapeHtml(st.antiDescription) : '');
    $('evo-hint').hidden = false;
    $('evo-hint').innerHTML = 'Tap <b>👍</b> on the images you love — <b>🧬 evolved children</b> wear gold badges and list their parents. After 5 likes the AI starts breeding automatically, or hit <b>🧬 Evolve now</b> any time.';
    try { logEvo('🌱 Session started — generating seed prompts. <small>👍 your favorites to breed Gen 1.</small>', ''); renderStatus(); } catch (_e) {}
    updateVoteCounter();
    updatePauseButton();
    $('evo-orient').textContent = ORIENT_LABEL[st.orientation];
    feedEl.innerHTML = '';
    Object.keys(st.tasksById).forEach(function(id){ var t = st.tasksById[id]; if (t.ui.card.parentNode) t.ui.card.parentNode.removeChild(t.ui.card); });
    st.tasksById = {}; st.waiting = []; st.inflight = 0; st.textGenInflight = 0;
    ensureStock();
    schedule();
  }
  function updatePauseButton() { $('evo-pause').textContent = st.manualPause ? '▶ Resume' : '⏸ Pause'; }
  $('evo-pause').addEventListener('click', function(){
    st.manualPause = !st.manualPause;
    updatePauseButton();
    schedule();
  });
  $('evo-reset').addEventListener('click', async function(){
    if (!st.started) return;
    // Themed async dialog: native confirm() is stripped in some sandboxes.
    var _ok = await window.uiConfirm('End this session? Unsaved feed images will be cleared (sent to a farm upstate). Saved images are kept.', { okText: 'End session', danger: true });
    if (!_ok) return;
    st.started = false; st.manualPause = false;
    feedEl.innerHTML = '';
    Object.keys(st.tasksById).forEach(function(id){ var t = st.tasksById[id]; if (t.ui.card.parentNode) t.ui.card.parentNode.removeChild(t.ui.card); });
    st.tasksById = {}; st.waiting = []; st.inflight = 0; st.textGenInflight = 0;
    st.prompts = {}; st.order = []; st.recentDownvotedTexts = []; st.lastParentBatch = [];
    st.evoLog = []; st.championId = null; st.maxGenSeen = 0; st.filter = 'all'; st.forceNext = false;
    var _ff2 = $('evo-filter'); if (_ff2) _ff2.value = 'all';
    var _el2 = $('evo-evoline'); if (_el2) _el2.innerHTML = '';
    st.totalVotes = 0; st.phase = 'initial';
    $('evo-session').hidden = true; $('evo-landing').hidden = false;
    updateVoteCounter();
    try { renderStatus(); } catch (_e) {}
  });
  function setOrientation(o) {
    st.orientation = o;
    $('evo-orient').textContent = ORIENT_LABEL[o];
    $('evo-orient-landing').value = o;
  }
  $('evo-orient').addEventListener('click', function(){
    var i = ORIENT_CYCLE.indexOf(st.orientation);
    setOrientation(ORIENT_CYCLE[(i + 1) % ORIENT_CYCLE.length]);
  });
  $('evo-orient-landing').addEventListener('change', function(){ setOrientation(this.value); });

  // ---------- evolution visibility wiring (filter + force-evolve) ----------
  try {
    var _flt = $('evo-filter');
    if (_flt) _flt.addEventListener('change', function(){ st.filter = _flt.value; applyFilter(); });
    var _force = $('evo-force');
    if (_force) _force.addEventListener('click', function(){ forceEvolveNow(); });
  } catch (_e) {}

  // ---------- evolution paths: adapt + result + wiring ----------
  async function adaptCustom() {
    var source = $('evo-path-src').value.trim();
    var dir = $('evo-path-custom').value.trim();
    if (!source) { flash($('evo-path-src'), 'paste a prompt first'); return; }
    if (!dir) { flash($('evo-path-custom'), 'describe a path first'); $('evo-path-custom').focus(); return; }
    if (pathState.busy) return;
    var btn = $('evo-path-adapt');
    var orig = btn.textContent;
    setPathsBusy(true, btn, 'Adapting...');
    try {
      var raw = await R.generateText(
        'You are an expert image-prompt engineer. Rewrite the SOURCE prompt along the requested DIRECTION. Keep everything from the source that the direction does not change.\n\nSOURCE:\n' + source + '\n\nDIRECTION:\n' + dir + '\n\nReturn STRICT JSON only: {"prompt": "full self-contained detailed image prompt, 2-4 sentences"}.'
      );
      var obj = parseJsonObj(raw);
      if (!obj || !obj.prompt) throw new Error('bad-shape');
      setPathResult(obj.prompt, true);
    } catch (e) {
      console.error('paths adapt failed', e);
      toastEvo('Adapt failed - try again');
    } finally {
      setPathsBusy(false, btn, orig);
    }
  }
  async function polishPrompt() {
    var source = $('evo-path-src').value.trim();
    if (!source) { flash($('evo-path-src'), 'paste a prompt first'); return; }
    if (pathState.busy) return;
    var btn = $('evo-path-polish');
    var orig = btn.textContent;
    setPathsBusy(true, btn, 'Polishing...');
    try {
      var raw = await R.generateText(
        'You are an expert image-prompt engineer. Improve this image-generation prompt: sharpen concrete visual detail, fill obvious gaps (setting, lighting, composition), remove redundancy. Keep its core subject and intent.\n\nSOURCE:\n' + source + '\n\nReturn STRICT JSON only: {"prompt": "full self-contained detailed image prompt, 2-4 sentences"}.'
      );
      var obj = parseJsonObj(raw);
      if (!obj || !obj.prompt) throw new Error('bad-shape');
      setPathResult(obj.prompt, true);
    } catch (e) {
      console.error('paths polish failed', e);
      toastEvo('Polish failed - try again');
    } finally {
      setPathsBusy(false, btn, orig);
    }
  }
  function setPathResult(text, autoMaybe) {
    $('evo-path-result').hidden = false;
    $('evo-path-result-text').textContent = text;
    try { $('evo-path-result').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
    if (autoMaybe && pathAutoImg()) renderPathPreview();
  }
  function sendPathToPool(text, btn) {
    text = (text || '').trim();
    if (!text) return;
    if (!st.started) {
      var idea = $('evo-idea');
      if (idea) { idea.value = text; idea.dispatchEvent(new Event('input', { bubbles: true })); }
      if (btn) flash(btn, 'set as idea');
      toastEvo('Saved as your idea - hit Start evolving to breed from it');
      return;
    }
    var parents = pathState.parentId && st.prompts[pathState.parentId] ? [pathState.parentId] : [];
    var added = addPrompts([text], parents);
    if (added.length) {
      refreshPromptsListIfOpen();
      try { renderStatus(); applyFilter(); } catch (e) {}
      if (btn) flash(btn, 'in pool');
      toastEvo(parents.length ? 'Added to the pool as a child - watch the feed' : 'Added to the pool - watch the feed');
    } else if (btn) {
      flash(btn, 'already in pool');
    }
  }
  async function renderPathPreview() {
    var text = $('evo-path-result-text').textContent.trim();
    if (!text) return;
    var box = $('evo-path-preview');
    var seq = ++pathState.renderSeq;
    box.innerHTML = '<div class="evo-paths-status">Rendering preview...</div>';
    try {
      var result = await generateImageWithTimeout(pathFinalPrompt(text), pathImageOpts(), CFG.IMAGE_GEN_TIMEOUT_MS);
      if (seq !== pathState.renderSeq) return;
      var url = toUrl(result);
      box.innerHTML = '';
      var img = document.createElement('img');
      img.alt = '';
      img.src = url;
      img.loading = 'lazy';
      box.appendChild(img);
    } catch (e) {
      console.error('paths preview failed', e);
      if (seq !== pathState.renderSeq) return;
      box.innerHTML = '<div class="evo-paths-status">Render failed - try Render now.</div>';
    }
  }
  (function initPaths(){
    var box = $('evo-path-autoimg');
    try {
      if (box && localStorage['evoPathAutoImg'] === '0') box.checked = false;
      if (box) box.addEventListener('change', function(){
        try { localStorage['evoPathAutoImg'] = box.checked ? '1' : '0'; } catch (e) {}
      });
    } catch (e) {}
    var b = $('evo-paths-btn'); if (b) b.addEventListener('click', function(){
      var c = getChampion();
      openPaths((c && c.text) || (st.instruction || '').trim() || ($('evo-idea').value || '').trim(), c ? c.id : null);
    });
    var lb = $('evo-paths-landing'); if (lb) lb.addEventListener('click', function(){
      openPaths(($('evo-idea').value || '').trim(), null);
    });
    $('evo-paths-close').addEventListener('click', function(){ $('evo-paths-modal').hidden = true; pathState.renderSeq++; });
    $('evo-paths-modal').addEventListener('click', function(e){ if (e.target === $('evo-paths-modal')) { $('evo-paths-modal').hidden = true; pathState.renderSeq++; } });
    $('evo-path-use-idea').addEventListener('click', function(){
      var v = ($('evo-idea') && $('evo-idea').value.trim()) || (st.instruction || '').trim();
      if (v) { $('evo-path-src').value = v; pathState.parentId = null; }
      else flash($('evo-path-src'), 'no idea yet');
    });
    $('evo-path-use-champ').addEventListener('click', function(){
      var c = getChampion();
      if (c) { $('evo-path-src').value = c.text; pathState.parentId = c.id; }
      else flash($('evo-path-src'), 'no champion yet - vote first');
    });
    $('evo-path-analyze').addEventListener('click', analyzePaths);
    $('evo-path-adapt').addEventListener('click', adaptCustom);
    $('evo-path-polish').addEventListener('click', polishPrompt);
    $('evo-path-custom').addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); adaptCustom(); } });
    $('evo-path-copy').addEventListener('click', function(){ copyText($('evo-path-result-text').textContent.trim(), $('evo-path-copy')); });
    $('evo-path-pool').addEventListener('click', function(){ sendPathToPool($('evo-path-result-text').textContent.trim(), $('evo-path-pool')); });
    $('evo-path-render').addEventListener('click', renderPathPreview);
  })();

  // ---------- modal wiring ----------
  $('evo-prompts-btn').addEventListener('click', openPromptsModal);
  $('evo-saved-btn').addEventListener('click', openSavedModal);
  $('evo-prompts-close').addEventListener('click', function(){ $('evo-prompts-modal').hidden = true; });
  $('evo-saved-close').addEventListener('click', function(){ $('evo-saved-modal').hidden = true; });
  $('evo-prompts-modal').addEventListener('click', function(e){ if (e.target === $('evo-prompts-modal')) $('evo-prompts-modal').hidden = true; });
  $('evo-saved-modal').addEventListener('click', function(e){ if (e.target === $('evo-saved-modal')) $('evo-saved-modal').hidden = true; });
  $('evo-manual-add').addEventListener('click', function(){
    var val = $('evo-manual-input').value.trim();
    if (!val) return;
    var added = addPrompts([val]);
    if (added.length) {
      seedManualVote(added[0]);
      $('evo-manual-input').value = '';
      renderPromptsList();
      flash($('evo-manual-add'), '✓ added');
    } else {
      flash($('evo-manual-input'), 'already in pool');
    }
  });
  $('evo-manual-input').addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); $('evo-manual-add').click(); } });

  // ---------- evolution paths (analyze -> branch -> adapt) ----------
  var pathState = { parentId: null, busy: false, renderSeq: 0 };
  function pathAutoImg() {
    var box = $('evo-path-autoimg');
    if (box) return !!box.checked;
    try { return localStorage['evoPathAutoImg'] !== '0'; } catch (e) { return true; }
  }
  function pathImageOpts() {
    var res = ORIENT_RES[st.orientation] || '512x512';
    if (st.orientation === 'random') res = ['512x512', '512x768', '768x512'][Math.floor(Math.random() * 3)];
    var opts = { resolution: res, seed: Math.floor(Math.random() * 4294967295), hideGalleryButtons: true };
    var anti = ((st.started ? st.antiDescription : $('evo-anti').value) || '').trim();
    if (anti) opts.negativePrompt = anti;
    return opts;
  }
  function pathFinalPrompt(text) {
    var style = ((st.started ? st.styleOverride : $('evo-style').value) || '').trim();
    return style ? (text + ', ' + style) : text;
  }
  function parseJsonObj(text) {
    if (!text) return null;
    var m = String(text).match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch (e) { return null; }
  }
  function openPaths(text, pid) {
    var modal = $('evo-paths-modal');
    if (!modal) return;
    pathState.parentId = pid || null;
    if (!pathState.parentId && text) {
      var low = String(text).trim().toLowerCase();
      var hit = st.order.map(function(id){ return st.prompts[id]; }).filter(function(p){ return p && p.text.toLowerCase() === low; })[0];
      if (hit) pathState.parentId = hit.id;
    }
    $('evo-path-src').value = text || '';
    $('evo-path-analysis').hidden = true;
    $('evo-path-list').innerHTML = '';
    $('evo-path-result').hidden = true;
    $('evo-path-preview').innerHTML = '';
    modal.hidden = false;
    setTimeout(function(){ try { $('evo-path-src').focus(); } catch (e) {} }, 50);
  }
  function setPathsBusy(b, btn, label) {
    pathState.busy = b;
    ['evo-path-analyze', 'evo-path-adapt', 'evo-path-polish'].forEach(function(id){
      var el = $(id);
      if (el) el.disabled = b;
    });
    if (btn && label) { try { btn.textContent = label; } catch (e) {} }
  }
  async function analyzePaths() {
    var source = $('evo-path-src').value.trim();
    if (!source) { flash($('evo-path-src'), 'paste a prompt first'); return; }
    if (pathState.busy) return;
    var btn = $('evo-path-analyze');
    var orig = btn.textContent;
    setPathsBusy(true, btn, 'Analyzing...');
    $('evo-path-analysis').hidden = true;
    $('evo-path-list').innerHTML = '<div class="evo-paths-status">Reading the prompt for strengths, gaps and branch points...</div>';
    try {
      var styleNote = ((st.started ? st.styleOverride : $('evo-style').value) || '').trim()
        ? ' A style suffix is applied automatically at render time, so do NOT include style, aesthetic, camera or lighting details. Focus on subject, scene and content.'
        : '';
      var raw = await R.generateText(
        'You are an expert image-prompt engineer. Analyze this image-generation prompt and suggest evolution paths.\n\nSOURCE:\n' + source + '\n\n' +
        'Return STRICT JSON only, no commentary, no code fences: {"strengths": ["...", "..."], "gaps": ["...", "..."], "paths": [{"title": "...", "why": "one sentence on what this changes and why it could be better", "prompt": "full self-contained detailed image prompt, 2-4 sentences"}]}.' +
        ' Exactly 3 paths, each a DIFFERENT direction (for example setting or time, mood and lighting story, subject or composition twist). Each path prompt must stand alone and keep the source core subject unless the path concept demands otherwise.' + styleNote
      );
      var obj = parseJsonObj(raw);
      if (!obj || !Array.isArray(obj.paths) || !obj.paths.length) throw new Error('bad-shape');
      renderPathAnalysis(obj);
      renderPathCards(obj.paths.slice(0, 3));
    } catch (e) {
      console.error('paths analyze failed', e);
      $('evo-path-list').innerHTML = '<div class="evo-paths-status">Analysis failed - try again. Tip: shorter source prompts analyze best.</div>';
    } finally {
      setPathsBusy(false, btn, orig);
    }
  }
  function renderPathAnalysis(obj) {
    var box = $('evo-path-analysis');
    var s = (obj.strengths || []).slice(0, 3).map(escapeHtml).join(' / ');
    var g = (obj.gaps || []).slice(0, 4).map(function(x){ return '<li>' + escapeHtml(x) + '</li>'; }).join('');
    box.innerHTML = (s ? '<div><b>Working:</b> ' + s + '</div>' : '') + (g ? '<div style="margin-top:0.3rem;"><b>Suggestions to fill:</b><ul style="margin:0.25rem 0 0 1.1rem; padding:0;">' + g + '</ul></div>' : '');
    box.hidden = !(s || g);
  }
  function renderPathCards(paths) {
    var list = $('evo-path-list');
    list.innerHTML = '';
    paths.forEach(function(p, i){
      if (!p || !p.prompt) return;
      var card = document.createElement('div');
      card.className = 'evo-path-card';
      var h = document.createElement('h4');
      h.textContent = 'Path ' + (i + 1) + ' - ' + (p.title || 'Variation');
      var why = document.createElement('div');
      why.className = 'evo-path-why';
      why.textContent = p.why || '';
      var pr = document.createElement('div');
      pr.className = 'evo-path-prompt';
      pr.textContent = p.prompt;
      var row = document.createElement('div');
      row.className = 'evo-path-actions';
      var use = mkBtn('Use', 'Load into the working prompt');
      var cp = mkBtn('Copy', 'Copy this path prompt');
      var pool = mkBtn('Pool', 'Add to the breeding pool');
      use.addEventListener('click', function(){ setPathResult(p.prompt, true); });
      cp.addEventListener('click', function(){ copyText(p.prompt, cp); });
      pool.addEventListener('click', function(){ sendPathToPool(p.prompt, pool); });
      row.appendChild(use); row.appendChild(cp); row.appendChild(pool);
      card.appendChild(h);
      if (p.why) card.appendChild(why);
      card.appendChild(pr); card.appendChild(row);
      list.appendChild(card);
    });
  }

  // ---------- tab visibility ----------
  window.evoSetVisible = function(v) {
    st.hidden = !v;
    if (v && st.started) schedule();
  };

  // integration hook for the shared PromptBridge ("send to ▸ Prompt Evolution")
  window.__evoSetIdea = function (text) {
    var el = $('evo-idea');
    if (!el) return;
    el.value = String(text == null ? '' : text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    try { el.focus(); } catch (e) {}
  };
  // let other tabs push a prompt into the breeding pool (e.g. from the vault or gallery)
  window.__evoAddPrompt = function (text) {
    text = String(text == null ? '' : text).trim();
    if (!text) return false;
    var added = addPrompts([text]);
    if (added.length) {
      try { seedManualVote(added[0]); } catch (e) {}
      try { renderPromptsList(); } catch (e) {}
      return true;
    }
    return false;
  };

  // ---------- sticky button bar (stays pinned under the sticky site header) ----------
  (function initEvoStickyBar(){
    var hdr = document.getElementById('i2p-header');
    var sess = document.getElementById('evo-session');
    if (!hdr || !sess) return;
    function update(){
      try {
        var h = hdr.getBoundingClientRect().height || hdr.offsetHeight || 0;
        sess.style.setProperty('--evo-bar-top', Math.round(h) + 'px');
      } catch (_e) {}
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    try { if (window.ResizeObserver) new ResizeObserver(update).observe(hdr); } catch (_e) {}
    setTimeout(update, 500); setTimeout(update, 2000);
  })();

  // ---------- init ----------
  loadSavedMeta();
  updateVoteCounter();
  try { renderEvoLine(); renderStatus(); } catch (_e) {}
  try { window.__evoDebug = function(){ return { phase: st.phase, votes: st.totalVotes, prompts: st.order.length, maxGen: getMaxGen(), evoCount: getEvoCount(), champ: st.championId }; }; } catch (_e) {}
  try { window.__evoTasks = function(){ return Object.keys(st.tasksById).map(function(id){ var t = st.tasksById[id]; var p = t.promptId ? st.prompts[t.promptId] : null; return { idx: t.idx, state: t.state, promptId: t.promptId, gen: p ? p.generation : null, votes: p ? p.votes : null, score: p ? p.score : null, up: !!(t.ui && t.ui.upvoted), crownVisible: !!(t.ui && t.ui.champBadge && t.ui.champBadge.style.display !== 'none') }; }); }; } catch (_e) {}
})();
