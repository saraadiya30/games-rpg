var GG_LS_KEY = "ggPanel_v1";
var GG_CHOICE_KEYS = ["persona", "expression", "ethnicity", "position", "handArmPosition", "location", "season", "age", "face", "makeup", "haircolour", "hairstyle", "eyes", "eyeshape", "eyewear", "nose", "headwear", "shoes", "legs", "neck", "lips", "ears", "hands", "bodyshape", "breastsize", "asssize", "pussyshape", "pussycolor", "fuckerType", "dickSize", "sexposition", "fuckMethod", "extras1", "extras2", "extras3", "extras4", "extras5", "extras6", "extras7", "extras8", "extras9", "extras10", "extras11", "extras12", "extras13", "lighting", "bgGender", "bgFantasyRace", "bgHeight", "bgHairLength", "bgHairAccessories", "bgLipShape", "bgFaceDetails", "bgSkinTone", "bgSkinFinish", "bgScars", "bgBodyHair", "bgTattoo", "bgAccessories", "bgPiercings", "bgInnerTop", "bgInnerBottom", "bgFantasyFeatures", "bgBodyDetails", "bgArchetype", "bgHeldProp", "bgScene", "bgDesignTheme", "bgOverallTheme", "bgImageBackground", "bgExtravaganza", "bgCuteness"];
var GG_NEG_TAIL = "bad lighting, deformed, text, bad lighting, deformed, text, worst quality, bad lighting, cropped, blurry, low-quality, deformed, text, poorly drawn, bad art, bad angle, boring, low-resolution, worst quality, bad composition, terrible lighting, bad anatomy, worst quality, bad lighting, cropped, blurry, low-quality, deformed, text, poorly drawn, bad art, bad angle, boring, low-resolution, worst quality, bad composition, terrible lighting, bad anatomy, worst quality, bad lighting, cropped, blurry, low-quality, deformed, text, poorly drawn, bad art, bad angle, boring, low-resolution, worst quality, bad composition, terrible lighting, bad anatomy, wrong number of fingers, fused fingers, malformed hands, distorted body proportions, broken anatomy, extra arms, extra legs, disfigured, child, childlike, children, underage, <young child>, junior";
var GG_PROMPT_TAIL = "sharp focus, crisp clean rendering, high resolution, finely detailed, razor sharp detail, polished professional artwork";
(function () {
"use strict";
if (window.GirlsGenerator) return;
function loadState() { try { return JSON.parse(localStorage.getItem(GG_LS_KEY) || "{}"); } catch (e) { return {}; } }
function saveState(s) { try { localStorage.setItem(GG_LS_KEY, JSON.stringify(s)); } catch (e) {} }
function el(tag, cls, text) { var d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; }
function css() {
  if (document.getElementById("ggCss")) return;
  var s = document.createElement("style");
  s.id = "ggCss";
  s.textContent =
    ".gg-wrap{max-width:800px;margin:0 auto;text-align:left;}" +
    ".gg-top{display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin:0.2rem auto 0.6rem;}" +
    ".gg-btn{cursor:pointer;font:inherit;font-size:0.85rem;padding:0.45rem 1.1rem;border-radius:999px;border:1px solid var(--th-border,#555);background:var(--th-surface,#222);color:inherit;white-space:nowrap;}" +
    ".gg-btn:hover{border-color:var(--th-accent);}" +
    ".gg-gen{display:block;width:100%;cursor:pointer;font:inherit;font-size:1.05rem;font-weight:700;padding:0.7rem;border-radius:12px;border:none;color:#fff;background:linear-gradient(180deg,#d6336c,#7b1346);margin:0.2rem 0 0.6rem;}" +
    ".gg-gen:disabled{opacity:0.55;cursor:default;}" +
    ".gg-desc{width:100%;box-sizing:border-box;min-height:4.5rem;font:inherit;font-size:0.85rem;padding:0.5rem 0.6rem;border-radius:10px;background:var(--th-field,#101014);color:inherit;border:1px solid var(--th-border,#3a3a42);margin-bottom:0.4rem;}" +
    ".gg-descline{display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem;}" +
    ".gg-optrow{display:flex;gap:0.5rem;flex-wrap:wrap;margin:0 0 0.6rem;}" +
    ".gg-optrow select{flex:1;min-width:140px;}" +
    ".gg-sec{border:1px solid var(--th-border,#3a3a42);border-radius:10px;margin-bottom:0.4rem;background:var(--th-surface,#1d1d22);}" +
    ".gg-sec>summary{cursor:pointer;padding:0.5rem 0.7rem;font-weight:700;font-size:0.9rem;list-style:none;}" +
    ".gg-sec>summary::-webkit-details-marker{display:none;}" +
    ".gg-secbody{padding:0 0.5rem 0.5rem;}" +
    ".gg-row{display:flex;align-items:center;gap:0.5rem;border-top:1px solid var(--th-border,#3a3a42);padding:0.3rem 0.2rem;}" +
    ".gg-label{flex:0 0 168px;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.9;}" +
    ".gg-sel{flex:1;min-width:0;font:inherit;font-size:0.85rem;padding:0.35rem;border-radius:8px;background:var(--th-field,#101014);color:inherit;border:1px solid var(--th-border,#3a3a42);}" +
    ".gg-dice{flex:0 0 auto;cursor:pointer;font:inherit;font-size:1rem;background:transparent;border:1px solid var(--th-border,#3a3a42);border-radius:8px;padding:0.25rem 0.5rem;color:inherit;}" +
    ".gg-dice:hover{border-color:var(--th-accent);}" +
    ".gg-preview{width:100%;box-sizing:border-box;min-height:5rem;font:inherit;font-size:0.78rem;padding:0.5rem 0.6rem;border-radius:10px;background:var(--th-field,#101014);color:inherit;border:1px solid var(--th-border,#3a3a42);}" +
    ".gg-status{font-size:0.85rem;min-height:1.3em;margin:0.4rem 0;opacity:0.9;}" +
    ".gg-spin{display:inline-block;animation:ggpulse 1s ease-in-out infinite;font-weight:700;}" +
    "@keyframes ggpulse{50%{opacity:0.2;}}" +
    ".gg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:0.6rem;margin-top:0.4rem;}" +
    ".gg-card{border:1px solid var(--th-border,#3a3a42);border-radius:12px;overflow:hidden;background:var(--th-surface,#1d1d22);}" +
    ".gg-card img{width:100%;display:block;}" +
    ".gg-card .gg-cap{font-size:0.72rem;opacity:0.7;padding:0.35rem 0.5rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".gg-card .gg-actions{display:flex;gap:0.3rem;padding:0.35rem 0.5rem 0.5rem;flex-wrap:wrap;}" +
    ".gg-mini{cursor:pointer;font:inherit;font-size:0.75rem;padding:0.25rem 0.6rem;border-radius:999px;border:1px solid var(--th-border,#3a3a42);background:transparent;color:inherit;text-decoration:none;display:inline-block;}" +
    ".gg-mini:hover{border-color:var(--th-accent);}" +
    "@media (max-width:560px){.gg-label{flex:0 0 118px;font-size:0.76rem;}}";
  document.head.appendChild(s);
}
function GG() { var d = window.GGDATA || null; if (d && window.GGCHARACTER && !d.__bgMerged) { Object.keys(window.GGCHARACTER.inputs).forEach(function (k) { d.inputs[k] = window.GGCHARACTER.inputs[k]; }); Object.keys(window.GGCHARACTER.pools).forEach(function (k) { d.pools[k] = window.GGCHARACTER.pools[k]; }); d.__bgMerged = true; } if (d && !d.__fwMerged) { try { var co = window.___userSettings746291937 && window.___userSettings746291937.userInputs && window.___userSettings746291937.userInputs.artStyle && window.___userSettings746291937.userInputs.artStyle.compiledOptions; if (co) { var have = {}; (d.inputs.artStyle.opts || []).forEach(function (o) { have[o.n] = true; }); Object.keys(co).forEach(function (name) { var v = co[name]; if (v && typeof v === "object" && v.prompt && !have[name] && name.slice(-8) !== " (Girls)") d.inputs.artStyle.opts.push({ n: name, fw: name }); }); d.__fwMerged = true; } } catch (e) {} } return d; }
function fwStyleNode(name) { try { var co = window.___userSettings746291937 && window.___userSettings746291937.userInputs && window.___userSettings746291937.userInputs.artStyle && window.___userSettings746291937.userInputs.artStyle.compiledOptions; var v = co && co[name]; if (v && typeof v === "object" && v.prompt) return v; } catch (e) {} return null; }
function fwEval(node, key, ui) { try { var hadInput = ("input" in window); var prevDesc = hadInput ? window.input.description : undefined; var prevNeg = hadInput ? window.input.negative : undefined; if (!hadInput) window.input = {}; window.input.description = ui.descText || ""; window.input.negative = ui.negText || ""; var out = String(node[key].evaluateItem); if (hadInput) { window.input.description = prevDesc; window.input.negative = prevNeg; } else { try { delete window.input; } catch (e) { window.input = undefined; } } return out; } catch (e) { try { if (window.input) { window.input.description = prevDesc; window.input.negative = prevNeg; } } catch (e2) {} } return ""; }
function evalAlt(text) {
  var t = String(text == null ? "" : text);
  t = t.replace(/\^[\d.]+(?=\s*$)/, "");
  t = t.replace(/\{([^{}]*)\}/g, function (m, inner) {
    var parts = inner.split("|").map(function (p) {
      var mm = p.match(/^(.*)\^([\d.]+)$/);
      return mm ? { t: mm[1], w: parseFloat(mm[2]) || 0 } : { t: p, w: 1 };
    }).filter(function (p) { return p.t !== ""; });
    if (!parts.length) return "";
    var total = 0, i;
    for (i = 0; i < parts.length; i++) total += parts[i].w;
    var r = Math.random() * total;
    for (i = 0; i < parts.length; i++) { r -= parts[i].w; if (r <= 0) return parts[i].t; }
    return parts[parts.length - 1].t;
  });
  t = t.replace(/\[\s*(randomPersona|randomHairColor|randomLocation|randomAge|randomNation)\s*\]/g, function (m, k) {
    var d = GG(), pool = d && d.randomWords && d.randomWords[k];
    if (!pool || !pool.length) return "";
    return pool[Math.floor(Math.random() * pool.length)];
  });
  return t;
}
function resolveOpt(opt) {
  if (!opt) return null;
  if (opt.r) {
    var r = opt.r, pool = (GG().pools || {})[r.pool] || [];
    var list = pool;
    if (r.slice) list = list.slice(r.slice[0], r.slice[1]);
    if (r.flag) {
      list = list.filter(function (it) {
        var fl = String(it.f || "").split(",");
        if (r.op === "eq") return fl.indexOf(r.flag) !== -1;
        if (r.op === "ne") return fl.indexOf(r.flag) === -1;
        return fl.indexOf(r.flag + "0") !== -1;
      });
    }
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }
  if (!opt.p) return null;
  return opt;
}
function cleanChoice(s) {
  var t = String(s == null ? "" : s);
  t = t.replace(/\(([^()]*)\)/g, "($1)");
  t = t.replace(/\(\s*\)/g, "");
  t = t.replace(/\{\|\}/g, "");
  return t.trim();
}
function isGlossy(ui) {
  var n = ui.styleName || "";
  return n === "Mika Art Style" || n === "Future Art" || n === "Yume Gloss";
}
function lightingSanitize(ui, t) {
  var s = String(t == null ? "" : t);
  if (!isGlossy(ui)) return s;
  var reps = [["that washes out details and creates strong contrasts", "that creates strong contrasts while keeping the subject crisp and detailed"], ["Low light levels, creating a moody and mysterious atmosphere", "dim moody light with the subject clearly lit, mysterious atmosphere"], ["Low light levels, creating a moody and intimate atmosphere", "dim moody light with the subject clearly lit, intimate atmosphere"], ["creating a flat and even light", "creating a soft even light with gentle dimensional shading"], ["flat and even light", "soft even light with gentle dimensional shading"]];
  for (var i = 0; i < reps.length; i++) s = s.split(reps[i][0]).join(reps[i][1]);
  return s;
}
function makeupSanitize(ui, t) {
  var s = String(t == null ? "" : t);
  try { if (ui.styleName === "Yume Gloss") return s.split("wearsface").join("wears face"); } catch (e) {}
  if (!isGlossy(ui)) return s;
  var n = ui.makeupName || "";
  if (n === "Natural" || n === "No-Makeup Makeup") return s.split("wearsface").join("wears face");
  return "";
}
function mikaLock(ui) {
  try { return ui.styleName === "Mika Art Style"; } catch (e) { return false; }
}
function pussyColorLock(ui, t) {
  if (!mikaLock(ui)) return t;
  var m = undressedMode(ui);
  if (t !== "") return "Her pussy is a vivid bright pink color with vivid saturated pink inner lips";
  if (m === "nude" || m === "bottomless") return "Her pussy is a vivid bright pink color with vivid saturated pink inner lips";
  return "";
}
function selName(o) { return (o && o.n) ? o.n : ""; }
function selText(o) { return (o && o.p) ? o.p : ""; }
function garmentPick(ui, part) {
  var o = part === "top" ? ui.clothesTop : (part === "bottom" ? ui.clothesBottom : ui.clothes);
  var v = selName(o);
  if (v === "" || v === "Default") return false;
  if (part === "top") return v !== "Topless";
  if (part === "bottom") return v !== "Nude" && v !== "Bottomless";
  return v !== "Nude";
}
function wholeOutfit(ui) { return garmentPick(ui, "clothes"); }
function topBare(ui) {
  if (wholeOutfit(ui) || garmentPick(ui, "top")) return false;
  return selName(ui.clothes) === "Nude" || selName(ui.clothesTop) === "Topless";
}
function bottomBare(ui) {
  if (wholeOutfit(ui) || garmentPick(ui, "bottom")) return false;
  var b = selName(ui.clothesBottom);
  return selName(ui.clothes) === "Nude" || b === "Nude" || b === "Bottomless";
}
function undressedMode(ui) {
  var t = topBare(ui), b = bottomBare(ui);
  if (t && b) return "nude";
  if (t) return "topless";
  if (b) return "bottomless";
  return "";
}
function undressClause(ui) {
  var m = undressedMode(ui);
  if (m === "nude") {
    if (mikaLock(ui)) return "(the adult woman is completely nude and fully naked, her bare breasts with vivid bright pink nipples and vivid pink areolae are entirely uncovered and exposed, her vivid bright pink pussy with saturated pink inner lips is visible, her bare shoulders, bare belly, bare hips and bare thighs are all completely bare, there is no clothing anywhere on her body, full frontal nudity, nothing covering her, entirely bare skin from head to toes:1.4)";
    return "(the adult woman is completely nude and fully naked, her bare breasts with visible nipples are entirely uncovered and exposed, her bare shoulders, bare belly, bare hips and bare thighs are all completely bare, there is no clothing anywhere on her body, full frontal nudity, nothing covering her, entirely bare skin from head to toes:1.4)";
  }
  if (m === "topless") {
    if (mikaLock(ui)) return "(the adult woman is shirtless and topless, her bare breasts with vivid bright pink nipples and vivid pink areolae are entirely uncovered and exposed, no bra and no top, her whole upper body is completely bare:1.4)";
    return "(the adult woman is shirtless and topless, her bare breasts with visible nipples are entirely uncovered and exposed, no bra and no top, her whole upper body is completely bare:1.4)";
  }
  if (m === "bottomless") {
    if (mikaLock(ui)) return "(the adult woman is bottomless and wearing nothing at all on her lower body, her vivid bright pink pussy with saturated pink inner lips is visible, her bare hips, bare ass and bare thighs are entirely uncovered and exposed, no skirt, no shorts and no panties, only bare skin from the waist down:1.4)";
    return "(the adult woman is bottomless and wearing nothing at all on her lower body, her bare hips, bare ass and bare thighs are entirely uncovered and exposed, no skirt, no shorts and no panties, only bare skin from the waist down:1.4)";
  }
  return "";
}
function undressEcho(ui) {
  var m = undressedMode(ui);
  if (m === "nude") return ", completely nude, fully naked, entirely bare skin, no clothing";
  if (m === "topless") return ", topless, bare breasts, no top";
  if (m === "bottomless") return ", bottomless, bare hips and thighs, no skirt, no shorts, no panties";
  return "";
}
function pickedGarmentText(ui) {
  if (wholeOutfit(ui)) return selText(ui.clothes);
  var parts = [];
  if (garmentPick(ui, "top")) { var t = selText(ui.clothesTop); if (t !== "") parts.push(t); }
  if (garmentPick(ui, "bottom")) { var t2 = selText(ui.clothesBottom); if (t2 !== "") parts.push(t2); }
  return parts.join(" ");
}
function clothingPrompt(ui) {
  var g = pickedGarmentText(ui);
  if (g === "") return "";
  return "(" + g + ":1.4)";
}
function garmentEcho(ui) {
  var g = pickedGarmentText(ui);
  if (g === "") return "";
  return ", " + g;
}
function viewFraming(ui) {
  var s = selText(ui.view).trim();
  if (s === "") return "";
  return "(" + cleanChoice(s) + ":1.3)";
}
function collectUserChoices(ui) {
  var parts = [];
  for (var i = 0; i < GG_CHOICE_KEYS.length; i++) {
    var k = GG_CHOICE_KEYS[i], t = selText(ui[k]);
    t = cleanChoice(t).trim().replace(/^[\s,]+|[\s,]+$/g, "");
    if (k === "lighting") t = lightingSanitize(ui, t);
    if (k === "makeup") t = makeupSanitize(ui, t);
    if (k === "pussycolor") t = pussyColorLock(ui, t);
    if (t !== "") parts.push(t);
  }
  return parts;
}
function userChoicesBlock(ui) {
  var parts = collectUserChoices(ui);
  if (!parts.length) return "";
  return "(" + parts.join(", ") + ":1.3)";
}
function userChoicesEcho(ui) {
  var parts = collectUserChoices(ui);
  if (!parts.length) return "";
  return ", " + parts.join(", ");
}
function animeBanA(ui) {
  if (isGlossy(ui)) return "";
  return "anime, manga, disney, cartoon, ";
}
function animeBanB(ui) {
  if (isGlossy(ui)) return "";
  return "anime, cartoon, illustration, boring, 3d render, ";
}
function boosterFilter(ui, text) {
  var s = String(text == null ? "" : text);
  if (s === "" || !isGlossy(ui)) return s;
  var reps = [["(photorealistic:1.8)", "(photorealistic:0.8)"], ["(hyper realistic:1.7)", "(hyper realistic:0.8)"], ["(RAW photograph:1.3)", ""], ["(85mm f/1.4 prime lens:1.2)", "(85mm f/1.4 prime lens:0.7)"], ["(professional DSLR:1.2)", "(professional DSLR:0.7)"], ["(true-to-life color:1.2)", "(true-to-life color:0.8)"], ["(photorealistic skin:1.2)", "(photorealistic skin:0.8)"], ["(hyper detailed face:1.2)", ""], ["(candid natural portrait:1.1)", ""], ["(gradient soft shading:1.3), ", ""], ["(volumetric cinematic lighting:1.35), ", ""], ["very fair luminous porcelain skin, pale ivory-cream luminous complexion, clean natural skin with subsurface scattering, ", ""], ["(ultra-detailed gacha splash key art:1.45), ", ""], ["(hyper-detailed Genshin Impact character:1.5), ", ""], ["(exquisitely detailed facial features:1.45), ", ""], ["(glossy hair with individual shimmering strands:1.4), ", ""], ["(polished premium painterly rendering:1.4), ", ""], ["(deep rich shadows:1.3), ", ""], ["(polished fine micro-detail layered from base to finish:1.25), (crisp clean progressive rendering:1.15), (rich texture in every region:1.2), (incremental detail refinement:1.15), ultra-fine finishing pass, polished final render, high-end finishing quality", "(rich texture in every region:1.2), polished final render"], ["extremely intricate details, breathtaking masterpiece, razor sharp focus, 8k, highres", "extremely intricate details, razor sharp focus, 8k"]];
  for (var i = 0; i < reps.length; i++) s = s.split(reps[i][0]).join(reps[i][1]);
  s = s.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ");
  return s;
}
function garmentFilter(ui, text) {
  var s = String(text == null ? "" : text);
  if (s === "") return s;
  var m = undressedMode(ui);
  if (m === "" && pickedGarmentText(ui) === "") return s;
  var swaps = [["(extremely high detail density everywhere - hair, fabric, metal, skin and background:1.45)", "(extremely high detail density everywhere - hair, clothing, skin and background:1.45)"], ["(fabrics and materials rendered with realistic texture and detailed folds - cloth, silk, lace, leather, metal and sheer fabric each rendered distinctly:1.4)", "(the clothing she is wearing is rendered with realistic fabric texture, detailed folds and accurate material behaviour:1.4)"]];
  if (m === "nude" || m === "topless") swaps = [["(extremely high detail density everywhere - hair, fabric, metal, skin and background:1.45)", "(extremely high detail density everywhere - hair, skin and background:1.45)"], ["(fabrics and materials rendered with realistic texture and detailed folds - cloth, silk, lace, leather, metal and sheer fabric each rendered distinctly:1.4)", "(her bare skin rendered with realistic texture, soft contact shadows and crisp ambient occlusion where surfaces meet:1.4)"]];
  var i;
  for (i = 0; i < swaps.length; i++) if (s.indexOf(swaps[i][0]) !== -1) s = s.split(swaps[i][0]).join(swaps[i][1]);
  var drops = ["(elaborate ornate outfit and accessory detail:1.45)", "(elaborate ornate outfit and accessory detail:1.3)", "(elaborate ornate outfit and accessory detail:1.2)", "(intricate ornate outfit and accessory detail:1.2)", "(detailed ornate outfit and accessories:1.35)", "detailed ornate outfit and accessories", "(intricate micro-detail in hair face and outfit:1.3)", "(elaborate outfit textures and folds:1.25)", "(highly detailed character rendering with intricate costume and hair detail:1.25)", "(ultra-detailed character rendering with extremely intricate hair, outfit and accessory detail:1.35)"];
  if (m === "nude" || m === "topless") drops.push("(realistic fabric folds:1.1)", "(natural materials:1.1)", "(fabric texture visible)", "(natural fabric folds)", "(cloth interaction with light)", "(correct fabric physics)", "intricate lace and fabric detail,");
  for (i = 0; i < drops.length; i++) if (s.indexOf(drops[i]) !== -1) s = s.split(drops[i]).join(" ");
  return s;
}
function mikaNegativeExclusions(ui) {
  if (isGlossy(ui)) return "";
  return "high contrast:1.2, over saturated:1.2, glossy:1.1, ";
}
function mikaSkinToneTerms(ui) {
  if (isGlossy(ui)) return "very dark skin, black skin, ";
  return "tan skin, tanned skin, dark skin, brown skin, olive skin, bronzed skin, deep tan, dark skin tone, ";
}
function realismSlot(ui) {
  var raw = selText(ui.realism);
  if (!isGlossy(ui)) return boosterFilter(ui, garmentFilter(ui, raw));
  if (ui.styleName === "Yume Gloss" && raw.indexOf("(photorealistic:1.8)") !== -1) return "(razor sharp focus with ultra-clean defined edges:1.35), (extremely rich detailed rendering with very high detail density in hair, natural skin, clothing and background:1.35), (bright sunlit dimensional shading with deep soft shadows and airbrushed gradients:1.3), (rich warm natural colour with deep contrast and a polished lifelike finish:1.25)";
  if (ui.styleName === "Yume Gloss" && raw.indexOf("(photorealistic:1.5)") !== -1) return "(sharp razor-crisp focus with clean defined edges:1.25), (rich detailed rendering with dense fine detail and delicate airbrushed micro-detail:1.25), (bright dimensional shading with soft shadow falloff:1.15)";
  if (raw.indexOf("(photorealistic:1.8)") !== -1) return "(razor sharp focus with ultra-clean defined edges:1.35), (extremely rich intricate rendering with very high detail density in hair, skin, clothing and background:1.35), (deep dimensional chiaroscuro shading with crisp ambient occlusion:1.3), (vivid saturated colour with punchy contrast and a polished professional finish:1.25)";
  if (raw.indexOf("(photorealistic:1.5)") !== -1) return "(sharp razor-crisp focus with clean defined edges:1.25), (rich intricate rendering with dense fine detail and crisp high micro-contrast:1.25), (deep dimensional shading with smooth shadow falloff:1.15)";
  var c = cleanChoice(raw).trim().replace(/^[\s,]+|[\s,]+$/g, "");
  if (c !== "") {
    if (ui.styleName === "Yume Gloss") return "(clean sharp focus with crisp well-defined edges:1.15), (rich polished rendering with soft natural texture detail:1.15)";
    return "(clean sharp focus with crisp well-defined edges:1.15), (rich polished rendering with clear texture detail:1.15)";
  }
  return "";
}
function genshinSlot(ui) {
  var raw = selText(ui.genshinRealism);
  if (!isGlossy(ui)) return boosterFilter(ui, garmentFilter(ui, raw));
  if (ui.styleName === "Yume Gloss" && raw.indexOf("(hyper-detailed Genshin Impact character:1.4)") !== -1) return garmentFilter(ui, "(ultra-detailed sunlit character rendering with extremely intricate hair, outfit and accessory detail:1.35), (huge glowing luminous eyes with layered radial iris gradients and sparkling catchlights:1.3), (premium soft airbrushed painterly gacha splash finish with deep dimensional shading:1.3), (rich warm natural colour grading with soft luminous highlights:1.25)");
  if (ui.styleName === "Yume Gloss" && raw.indexOf("(highly detailed Genshin Impact character:1.2)") !== -1) return garmentFilter(ui, "(highly detailed sunlit character rendering with intricate costume and hair detail:1.25), (luminous glowing eyes with layered iris shading and bright catchlights:1.25), (polished soft finish with rich warm colour harmony:1.2)");
  if (raw.indexOf("(hyper-detailed Genshin Impact character:1.4)") !== -1) return garmentFilter(ui, "(ultra-detailed character rendering with extremely intricate hair, outfit and accessory detail:1.35), (expressive luminous eyes with layered radial iris gradients and crisp catchlights:1.3), (premium painterly gacha splash finish with deep dimensional shading:1.3), (radiant saturated colour grading with strong contrast:1.25)");
  if (raw.indexOf("(highly detailed Genshin Impact character:1.2)") !== -1) return garmentFilter(ui, "(highly detailed character rendering with intricate costume and hair detail:1.25), (luminous expressive eyes with layered iris shading:1.25), (polished painterly finish with rich colour harmony:1.2)");
  var c = cleanChoice(raw).trim().replace(/^[\s,]+|[\s,]+$/g, "");
  if (c !== "") {
    if (ui.styleName === "Yume Gloss") return garmentFilter(ui, "(clean detailed sunlit character rendering with refined facial definition:1.15), (smooth polished lifelike key-art finish:1.15)");
    return garmentFilter(ui, "(clean detailed character rendering with refined facial definition:1.15), (smooth polished anime key-art finish:1.15)");
  }
  return "";
}
function detailSlot(ui) {
  var raw = selText(ui.detail);
  if (!isGlossy(ui)) return boosterFilter(ui, garmentFilter(ui, raw));
  var yume = ui.styleName === "Yume Gloss";
  if (yume && raw.indexOf("(hyper-detailed Genshin Impact character:1.5)") !== -1) return "(hyper-detailed lifelike rendering with extreme fine micro-detail in hair strands and lace:1.4), (exquisitely detailed facial features with glowing eyes:1.35), (elaborate material and accessory detail:1.35), (bright rich dimensional shading:1.3)";
  if (yume && raw.indexOf("(ultra-detailed Genshin Impact character:1.35)") !== -1) return "(ultra-detailed lifelike rendering with extremely intricate skin and fabric detail throughout:1.3), (finely detailed facial features and lustrous detailed hair:1.3), (rich material detail with naturalistic folds:1.25)";
  if (yume && raw.indexOf("(highly detailed anime illustration:1.3)") !== -1) return "(highly detailed lifelike rendering with intricate fine detail:1.2), (refined soft airbrushed shading:1.2), (clean precise linework:1.15)";
  if (yume && raw.indexOf("(detailed anime illustration:1.2)") !== -1) return "(clean detailed lifelike rendering with well-defined features:1.1), (sharper natural textures:1.1)";
  if (raw.indexOf("(hyper-detailed Genshin Impact character:1.5)") !== -1) return "(hyper-detailed rendering with extreme fine micro-detail everywhere:1.4), (exquisitely detailed facial features:1.35), (elaborate material and accessory detail:1.35), (deep rich dimensional shadows:1.3)";
  if (raw.indexOf("(ultra-detailed Genshin Impact character:1.35)") !== -1) return "(ultra-detailed rendering with extremely intricate detail throughout:1.3), (finely detailed facial features and lustrous hair:1.3), (rich material detail with naturalistic folds:1.25)";
  if (raw.indexOf("(highly detailed anime illustration:1.3)") !== -1) return "(highly detailed rendering with intricate fine detail:1.2), (refined shading with crisp highlights:1.2), (clean precise linework:1.15)";
  if (raw.indexOf("(detailed anime illustration:1.2)") !== -1) return "(clean detailed rendering with well-defined features:1.1), (sharper textures:1.1)";
  return "";
}
function wantsWideShot(ui) {
  var v = selName(ui.view) + " " + selText(ui.view);
  var d = ui.descText || "";
  return /full[ -]?body|full[ -]?length|head[ -]?to[ -]?toe|entire (body|figure|form)|whole body|complete body|long shot|distant|afar|cowboy shot/i.test(v + " " + d);
}
function hasRealism(ui) {
  return selText(ui.realism) !== "" || selText(ui.genshinRealism) !== "" || selText(ui.perfectAnatomy) !== "";
}
function getResolution(ui) {
  if (isGlossy(ui)) return wantsWideShot(ui) ? "512x768" : "768x768";
  if (hasRealism(ui)) return "768x768";
  if (selText(ui.progressive) !== "") return "768x768";
  if ((ui.descText || "").length > 350) return "768x768";
  var r = selText(ui.shape);
  if (r === "512x512") return "768x768";
  return r || "512x768";
}
function genshinText(ui) {
  var c = ui.genshinChar;
  if (!c || !c.p) return "";
  var hasClothes = selText(ui.clothes) !== "" || selText(ui.clothesTop) !== "" || selText(ui.clothesBottom) !== "";
  if (hasClothes) return c.face || "";
  return c.p;
}
function stylePrompt(ui) {
  var fwOpt = ui.artStyleOpt && ui.artStyleOpt.fw;
  if (fwOpt) { var node = fwStyleNode(fwOpt); if (node) return fwEval(node, "prompt", ui); return ""; }
  var t = selText(ui.artStyle);
  t = t.split("[input.description]").join(ui.descText || "");
  return evalAlt(t);
}
function styleNegative(ui) {
  var fwOpt = ui.artStyleOpt && ui.artStyleOpt.fw;
  if (fwOpt) { var node = fwStyleNode(fwOpt); if (node) return fwEval(node, "negative", ui); return ""; }
  var g = (ui.artStyleOpt && ui.artStyleOpt.g) || "";
  g = g.split('[input.negative || ""]').join(ui.negText || "").split("[input.negative]").join(ui.negText || "");
  return g;
}
function readUI(ui) {
  var d = GG();
  ui.descText = evalAlt((ui.descInput.value || "").trim());
  ui.negText = (ui.negInput.value || "").trim();
  Object.keys(ui.sels).forEach(function (id) {
    var s = ui.sels[id];
    var opt = (d.inputs[id] && d.inputs[id].opts[s.selectedIndex]) || null;
    ui[id] = resolveOpt(opt);
    if (id === "artStyle") { ui.artStyleOpt = opt; ui.styleName = opt ? opt.n : ""; }
    if (id === "makeup") ui.makeupName = opt ? opt.n : "";
    if (id === "view") ui.viewOpt = opt;
  });
  if (!ui.artStyle) ui.artStyle = { n: "", p: "" };
  ["clothes", "clothesTop", "clothesBottom", "view", "realism", "genshinRealism", "progressive", "detail", "perfectAnatomy", "shape", "genshinChar"].forEach(function (k) { if (!ui[k]) ui[k] = { n: "", p: "" }; });
}
function compose(ui) {
  readUI(ui);
  var desc = ui.descText ? "(" + ui.descText + ":1.2)" : "";
  var parts = [desc, undressClause(ui), clothingPrompt(ui), viewFraming(ui), userChoicesBlock(ui), genshinText(ui), garmentFilter(ui, stylePrompt(ui)), realismSlot(ui), genshinSlot(ui), boosterFilter(ui, selText(ui.progressive)), detailSlot(ui), selText(ui.perfectAnatomy), viewFraming(ui), undressEcho(ui), garmentEcho(ui), userChoicesEcho(ui), GG_PROMPT_TAIL];
  var prompt = parts.filter(function (p) { return p && String(p).trim() !== ""; }).join(" ").replace(/\s{2,}/g, " ").trim();
  var negParts = [styleNegative(ui), selText(ui.extraNegative), "floating glowing dots, yellow dots, golden specks, glowing particles, dust motes, glowing orbs, floating light specks", animeBanA(ui) + "low resolution, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name", animeBanB(ui) + "long neck, out of frame, extra fingers mutation, deformed, canvas frame", mikaNegativeExclusions(ui) + mikaSkinToneTerms(ui) + GG_NEG_TAIL];
  var negative = negParts.filter(function (p) { return p && String(p).trim() !== "" && String(p).trim() !== ","; }).join(",").replace(/,+/g, ",").replace(/^,|,$/g, "");
  return { prompt: prompt, negative: negative };
}
function setStatus(ui, t) { ui.status.textContent = t; }
function busyStatus(ui, text) {
  ui.status.textContent = "";
  ui.status.appendChild(document.createTextNode(text + " "));
  ui.status.appendChild(el("span", "gg-spin", "● ● ●"));
}
function sendToGen(prompt) {
  try {
    var ta = document.querySelector("#i2p-imggen [data-name='description']");
    if (ta) {
      ta.value = prompt;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } catch (e) {}
  try { if (window.showTab) window.showTab("gen"); } catch (e) {}
}
function copyText(t, ui, done) {
  function ok() { if (ui) setStatus(ui, done || "Copied."); }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(ok, function () { fallback(); }); return; }
    fallback();
  } catch (e) { fallback(); }
  function fallback() {
    try {
      var ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      ok();
    } catch (e2) { if (ui) setStatus(ui, "Copy failed — select the text manually."); }
  }
}
function galleryAutoSaveOn() {
  try { if (typeof window.t2iGetAutoSave === "function") return !!window.t2iGetAutoSave(); } catch (e) {}
  return true;
}
function galleryNsfwFilterOn() {
  try { if (typeof window.t2iGetNsfwFilter === "function") return !!window.t2iGetNsfwFilter(); } catch (e) {}
  return false;
}
function fileInGirlsFolder(url) {
  try {
    if (typeof window.t2iGetGallery !== "function" || typeof window.t2iSaveGallery !== "function") return;
    var g = window.t2iGetGallery();
    for (var i = 0; i < g.length; i++) {
      if (g[i] && g[i].url === url && !g[i].folder) { g[i].folder = "Girls Generator"; window.t2iSaveGallery(g); break; }
    }
  } catch (e) {}
}
function gallerySaveShared(dataUrl, prompt, title) {
  return window.t2iAddImageToGallery(dataUrl, prompt || "", title || "").then(function (url) {
    if (url) { fileInGirlsFolder(url); try { if (window.__hmRefreshRecent) window.__hmRefreshRecent(); } catch (e) {} }
    return url;
  });
}
function gallerySaveLegacy(dataUrl, prompt, title) {
  return (async function () {
    var blob = await (await fetch(dataUrl)).blob();
    var up = await root.uploadPlugin(blob, {});
    if (!up || !up.url) throw new Error(up && up.error ? up.error : "upload failed");
    var item = { url: up.url, prompt: prompt, title: title, folder: "Girls Generator", timestamp: Date.now() };
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem("t2iGalleryItems") || "[]"); } catch (e) { arr = []; }
    arr.unshift(item);
    try {
      if (window.t2iSaveGallery) window.t2iSaveGallery(arr);
      else localStorage.setItem("t2iGalleryItems", JSON.stringify(arr));
    } catch (e) {}
    try { if (window.__hmRefreshRecent) window.__hmRefreshRecent(); } catch (e) {}
    return up.url;
  })();
}
function gallerySave(dataUrl, prompt, title) {
  if (typeof window.t2iAddImageToGallery === "function") return gallerySaveShared(dataUrl, prompt, title);
  return gallerySaveLegacy(dataUrl, prompt, title);
}
function autoSaveGirlsImage(dataUrl, prompt, title, saveBtn, ui) {
  function direct() {
    gallerySave(dataUrl, prompt, title).then(function (url) {
      if (url && saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "✅ saved"; }
    }).catch(function (e) { setStatus(ui, "Autosave failed: " + (e && e.message ? e.message : e)); });
  }
  if (galleryNsfwFilterOn() && typeof window.t2iUploadThumbnail === "function" && typeof window.t2iCheckNsfw === "function") {
    window.t2iUploadThumbnail(dataUrl).then(function (thumbUrl) {
      if (!thumbUrl) return;
      return window.t2iCheckNsfw(thumbUrl).then(function (isNsfw) {
        if (isNsfw === true) { setStatus(ui, "🔞 NSFW image hidden — not saved (filter ON)."); return; }
        direct();
      });
    }).catch(function (e) { console.warn("girls autosave nsfw check:", e); });
  } else {
    direct();
  }
}
function saveCard(dataUrl, prompt, title, btn, ui) {
  btn.disabled = true;
  var old = btn.textContent;
  btn.textContent = "…";
  function done(t, saved) { btn.disabled = false; btn.textContent = saved ? "✅ saved" : old; setStatus(ui, t); }
  gallerySave(dataUrl, prompt, title).then(function (url) {
    if (!url) done("Already saved (duplicate) or upload failed.", false);
    else done("Saved to Personal Gallery.", true);
  }).catch(function (e) { done("Save failed: " + (e && e.message ? e.message : e), false); });
}
function addCard(ui, dataUrl, prompt, title) {
  var card = el("div", "gg-card");
  var img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "generated girl";
  card.appendChild(img);
  card.appendChild(el("div", "gg-cap", prompt.slice(0, 90)));
  var acts = el("div", "gg-actions");
  var dl = el("a", "gg-mini", "⬇ Save");
  dl.href = dataUrl;
  dl.download = "girl-" + Date.now() + ".png";
  acts.appendChild(dl);
  var cp = el("button", "gg-mini", "📋 Copy");
  cp.type = "button";
  cp.addEventListener("click", function () { copyText(prompt, ui, "Prompt copied."); });
  acts.appendChild(cp);
  var snd = el("button", "gg-mini", "🎨 To Gen");
  snd.type = "button";
  snd.title = "Open this prompt in the Image Generator";
  snd.addEventListener("click", function () { sendToGen(prompt); });
  acts.appendChild(snd);
  var sv = el("button", "gg-mini", "💾 Gallery");
  sv.type = "button";
  sv.title = "Upload and save to Personal Gallery";
  sv.addEventListener("click", function () { saveCard(dataUrl, prompt, title, sv, ui); });
  acts.appendChild(sv);
  card.appendChild(acts);
  ui.grid.insertBefore(card, ui.grid.firstChild);
  return sv;
}
function snapshot(ui) {
  var st = { sels: {}, desc: ui.descInput.value, neg: ui.negInput.value };
  Object.keys(ui.sels).forEach(function (id) { st.sels[id] = ui.sels[id].selectedIndex; });
  saveState(st);
}
function randomTemplate() {
  var d = GG();
  var ts = (d && d.randomTemplates) || [];
  if (!ts.length) return "";
  return evalAlt(ts[Math.floor(Math.random() * ts.length)]);
}
function generate(ui) {
  var n = 1;
  try { var c0 = compose(ui); } catch (e) { setStatus(ui, "Compose failed: " + (e && e.message ? e.message : e)); return; }
  try { n = Math.min(25, Math.max(1, parseInt(selText(ui.numImages) || "1", 10) || 1)); } catch (e) {}
  ui.genBtn.disabled = true;
  var i = 0;
  function next() {
    if (i >= n) { ui.genBtn.disabled = false; setStatus(ui, "Done — " + n + " image" + (n > 1 ? "s" : "") + " below."); return; }
    busyStatus(ui, "Generating " + (i + 1) + "/" + n);
    var c, res, title;
    try {
      c = compose(ui);
      res = getResolution(ui);
      title = "(" + (ui.styleName || "No style") + ") " + (ui.descInput.value || "").trim().slice(0, 80);
    } catch (e) { ui.genBtn.disabled = false; setStatus(ui, "Compose failed: " + (e && e.message ? e.message : e)); return; }
    var g = 7;
    try { g = hasRealism(ui) ? 14 : (parseInt(selText(ui.gScale), 10) || 7); } catch (e2) {}
    root.generateImage(c.prompt, { resolution: res, negativePrompt: c.negative, guidanceScale: g }).then(function (r) {
      var url = r && (r.dataUrl || r.url);
      if (!url) throw new Error("empty result");
      var saveBtn = addCard(ui, url, c.prompt, title);
      if (galleryAutoSaveOn()) autoSaveGirlsImage(url, c.prompt, title, saveBtn, ui);
      i++;
      next();
    }).catch(function (e) {
      ui.genBtn.disabled = false;
      setStatus(ui, "Generation failed: " + (e && e.message ? e.message : e));
    });
  }
  next();
}
function updatePreview(ui) {
  try {
    var c = compose(ui);
    ui.preview.value = c.prompt;
  } catch (e) { ui.preview.value = ""; }
  snapshot(ui);
}
function randomizeSel(s) {
  if (s.options.length < 2) return;
  s.selectedIndex = 1 + Math.floor(Math.random() * (s.options.length - 1));
}
var GG_SECTIONS = [["✨ Boosters", ["realism", "genshinRealism", "progressive", "detail", "perfectAnatomy", "extraNegative"]], ["👤 Character", ["persona", "genshinChar", "ethnicity", "age"]], ["🧬 Bestaigen Character", ["bgGender", "bgFantasyRace", "bgHeight", "bgHairLength", "bgHairAccessories", "bgLipShape", "bgFaceDetails", "bgSkinTone", "bgSkinFinish", "bgFantasyFeatures", "bgBodyDetails"]], ["💫 Body Mods & Extras", ["bgScars", "bgBodyHair", "bgTattoo", "bgAccessories", "bgPiercings", "bgHeldProp", "bgArchetype", "bgCuteness"]], ["🎬 Scene & Theme", ["bgInnerTop", "bgInnerBottom", "bgScene", "bgDesignTheme", "bgOverallTheme", "bgImageBackground", "bgExtravaganza"]], ["💃 Body", ["bodyshape", "breastsize", "asssize", "pussyshape", "pussycolor"]], ["🔞 Scene", ["fuckerType", "dickSize", "sexposition", "fuckMethod"]], ["💇 Hair & Face", ["haircolour", "hairstyle", "eyes", "eyeshape", "nose", "face", "makeup", "ears", "eyewear", "lips", "neck", "hands"]], ["👙 Outfit", ["clothes", "clothesTop", "clothesBottom", "shoes", "legs", "headwear"]], ["🎬 Pose & Scene", ["location", "season", "lighting", "position", "handArmPosition", "expression", "view"]], ["➕ Extras", ["extras1", "extras2", "extras3", "extras4", "extras5", "extras6", "extras7", "extras8", "extras9", "extras10", "extras11", "extras12", "extras13"]]];
function render(host) {
  css();
  try { if (typeof window.ensureGallery === "function") window.ensureGallery(); } catch (e) {}
  while (host.firstChild) host.removeChild(host.firstChild);
  var d = GG();
  if (!d || !d.inputs || !d.inputs.age) {
    host.appendChild(el("div", "gg-status", "Generator data failed to load — try 🔄 Reload."));
    return;
  }
  var st = loadState();
  var ui = { sels: {} };
  var wrap = el("div", "gg-wrap");
  host.appendChild(wrap);
  var top = el("div", "gg-top");
  var rnd = el("button", "gg-btn", "🎲 All Random");
  rnd.type = "button";
  var clr = el("button", "gg-btn", "🧹 Clear All");
  clr.type = "button";
  top.appendChild(rnd);
  top.appendChild(clr);
  wrap.appendChild(top);
  var gen = el("button", "gg-gen", "✨ Generate ✨");
  gen.type = "button";
  ui.genBtn = gen;
  wrap.appendChild(gen);
  var descline = el("div", "gg-descline");
  var desc = document.createElement("textarea");
  desc.className = "gg-desc";
  desc.placeholder = "📝 Description — e.g. a beautiful woman in a garden. Tip: {red|blue} picks one at random per image.";
  desc.value = (st && st.desc) || "";
  ui.descInput = desc;
  wrap.appendChild(desc);
  var diceDesc = el("button", "gg-btn", "🎲 Random prompt");
  diceDesc.type = "button";
  diceDesc.addEventListener("click", function () { desc.value = randomTemplate(); updatePreview(ui); });
  descline.appendChild(diceDesc);
  var neg = document.createElement("input");
  neg.type = "text";
  neg.className = "gg-sel";
  neg.placeholder = "🚫 Anti-Description (optional)";
  neg.value = (st && st.neg) || "";
  neg.style.flex = "1";
  ui.negInput = neg;
  descline.appendChild(neg);
  wrap.appendChild(descline);
  var optrow = el("div", "gg-optrow");
  ["artStyle", "shape", "numImages", "gScale"].forEach(function (id) {
    var s = document.createElement("select");
    s.className = "gg-sel";
    (d.inputs[id].opts || []).forEach(function (o) { s.appendChild(new Option(o.n, o.n)); });
    var sv = st.sels && st.sels[id];
    if (typeof sv === "number" && sv >= 0 && sv < s.options.length) s.selectedIndex = sv;
    s.addEventListener("change", function () { updatePreview(ui); });
    ui.sels[id] = s;
    optrow.appendChild(s);
  });
  wrap.appendChild(optrow);
  GG_SECTIONS.forEach(function (sec, si) {
    var det = document.createElement("details");
    det.className = "gg-sec";
    if (si < 2) det.open = true;
    det.appendChild(el("summary", null, sec[0]));
    var body = el("div", "gg-secbody");
    sec[1].forEach(function (id) {
      var def = d.inputs[id] || d.inputs.extras;
      if (!def) return;
      var row = el("div", "gg-row");
      row.appendChild(el("span", "gg-label", def.label));
      var s = document.createElement("select");
      s.className = "gg-sel";
      def.opts.forEach(function (o) { s.appendChild(new Option(o.n, o.n)); });
      var sv = st.sels && st.sels[id];
      if (typeof sv === "number" && sv >= 0 && sv < s.options.length) s.selectedIndex = sv;
      s.addEventListener("change", function () { updatePreview(ui); });
      ui.sels[id] = s;
      row.appendChild(s);
      var dice = el("button", "gg-dice", "🎲");
      dice.type = "button";
      dice.title = "Randomize " + def.label;
      dice.addEventListener("click", function () { randomizeSel(s); updatePreview(ui); });
      row.appendChild(dice);
      body.appendChild(row);
    });
    det.appendChild(body);
    wrap.appendChild(det);
  });
  desc.addEventListener("input", function () { updatePreview(ui); });
  neg.addEventListener("input", function () { updatePreview(ui); });
  var prev = document.createElement("textarea");
  prev.className = "gg-preview";
  prev.readOnly = true;
  prev.placeholder = "Composed prompt appears here…";
  ui.preview = prev;
  wrap.appendChild(prev);
  var prow = el("div", "gg-top");
  var cp = el("button", "gg-btn", "📋 Copy prompt");
  cp.type = "button";
  cp.addEventListener("click", function () { copyText(ui.preview.value, ui, "Prompt copied."); });
  var snd = el("button", "gg-btn", "🎨 Use in Image Generator");
  snd.type = "button";
  snd.addEventListener("click", function () { if (ui.preview.value) sendToGen(ui.preview.value); });
  prow.appendChild(cp);
  prow.appendChild(snd);
  wrap.appendChild(prow);
  var status = el("div", "gg-status");
  ui.status = status;
  wrap.appendChild(status);
  var grid = el("div", "gg-grid");
  ui.grid = grid;
  wrap.appendChild(grid);
  rnd.addEventListener("click", function () { Object.keys(ui.sels).forEach(function (id) { randomizeSel(ui.sels[id]); }); updatePreview(ui); });
  clr.addEventListener("click", function () { Object.keys(ui.sels).forEach(function (id) { ui.sels[id].selectedIndex = 0; }); updatePreview(ui); });
  gen.addEventListener("click", function () { generate(ui); });
  updatePreview(ui);
}
window.GirlsGenerator = { render: render, compose: compose };
// Exposed for the Flux tab's merged "Girls traits" section (src/flux/girls.js): it reuses
// this panel's prompt logic verbatim, so trait behaviour never drifts between the two tabs.
// The Flux tab only borrows the NON-overlapping parts (traits/boosters/garments); Flux's own
// description/style/shape/count/guidance/resolution/tails always win and are never read here.
window.GirlsGenerator.helpers = { GG: GG, evalAlt: evalAlt, resolveOpt: resolveOpt, selName: selName, selText: selText, cleanChoice: cleanChoice, isGlossy: isGlossy, lightingSanitize: lightingSanitize, makeupSanitize: makeupSanitize, mikaLock: mikaLock, pussyColorLock: pussyColorLock, garmentPick: garmentPick, wholeOutfit: wholeOutfit, topBare: topBare, bottomBare: bottomBare, undressedMode: undressedMode, undressClause: undressClause, undressEcho: undressEcho, pickedGarmentText: pickedGarmentText, clothingPrompt: clothingPrompt, garmentEcho: garmentEcho, viewFraming: viewFraming, collectUserChoices: collectUserChoices, userChoicesBlock: userChoicesBlock, userChoicesEcho: userChoicesEcho, animeBanA: animeBanA, animeBanB: animeBanB, boosterFilter: boosterFilter, garmentFilter: garmentFilter, mikaNegativeExclusions: mikaNegativeExclusions, mikaSkinToneTerms: mikaSkinToneTerms, realismSlot: realismSlot, genshinSlot: genshinSlot, detailSlot: detailSlot, genshinText: genshinText, randomTemplate: randomTemplate, sendToGen: sendToGen, copyText: copyText, gallerySave: gallerySave, galleryAutoSaveOn: galleryAutoSaveOn, galleryNsfwFilterOn: galleryNsfwFilterOn };
window.GirlsGenerator.CHOICE_KEYS = GG_CHOICE_KEYS;
window.GirlsGenerator.SECTIONS = GG_SECTIONS;
window.GirlsGenerator.LS_KEY = GG_LS_KEY;
})();
