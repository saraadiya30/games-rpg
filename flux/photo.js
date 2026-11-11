(function () {
  "use strict";
  if (window.FluxPhoto) return;
  // 📷 Photo lab — native port of fluxinator's camera/photo selects. Each select
  // owns ONE slot in the Description box: picking an option replaces the slot's
  // previous text, Auto removes it. Reads fluxinator's own fluxPhotoLab data.
  var slotText = {};
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").replace(/^[\s,]+/, "").replace(/[\s,.!;:]+$/, "");
  }
  function decodeEntities(s) {
    return String(s).replace(/&#(\d+);/g, function (m, n) {
      try { return String.fromCharCode(Number(n)); } catch (e) { return m; }
    }).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  function splitParts(s) {
    var out = [], buf = "", sep = "";
    s = String(s == null ? "" : s);
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === "," || ch === "\n") { out.push({ sep: sep, part: buf }); buf = ""; sep = ch; }
      else buf += ch;
    }
    out.push({ sep: sep, part: buf });
    return out;
  }
  function dropPart(text, tag) {
    var t = norm(tag), s = String(text == null ? "" : text);
    var L = splitParts(s), off = 0, start = -1, end = -1, i;
    for (i = 0; i < L.length; i++) {
      var it = L[i], pStart = off, pEnd = pStart + it.part.length;
      if (norm(it.part) === t) { start = pStart; end = pEnd; break; }
      off = pEnd + 1;
    }
    if (start < 0) return s;
    if (start > 0) start -= 1; else if (end < s.length) end += 1;
    return (s.slice(0, start) + s.slice(end)).replace(/^[\s,]+/, "").replace(/\s+$/, "");
  }
  function ta() { return document.querySelector("#fluxDescTa"); }
  function dropValue(text, value) {
    var s = String(text == null ? "" : text);
    var parts = String(value == null ? "" : value).split(",").map(function (p) { return p.trim(); }).filter(Boolean);
    for (var i = 0; i < parts.length; i++) s = dropPart(s, parts[i]);
    return s;
  }
  function valuePresent(cur, value) {
    var parts = String(value == null ? "" : value).split(",").map(function (p) { return norm(p); }).filter(Boolean);
    if (!parts.length) return false;
    var have = splitParts(cur).map(function (p) { return norm(p.part); });
    return parts.every(function (p) { return have.indexOf(p) !== -1; });
  }
  function writeTa(text) {
    var t = ta();
    if (!t) return;
    t.value = text;
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function applySlot(key, value) {
    var t = ta();
    if (!t) return;
    var cur = String(t.value || "");
    var old = slotText[key];
    if (old && norm(old) !== norm(value)) cur = dropValue(cur, old);
    if (value) {
      if (!valuePresent(cur, value)) {
        var base = cur.replace(/\s+$/, "");
        cur = base ? (base + ", " + value) : value;
      }
      slotText[key] = value;
    } else {
      delete slotText[key];
    }
    writeTa(cur);
  }
  // Reconcile after manual edits: if the slot text is gone from the box, forget it
  // so the next pick appends fresh instead of trying to replace a ghost.
  function recheck(selects) {
    var t = ta();
    var cur = t ? String(t.value || "") : "";
    Object.keys(selects).forEach(function (key) {
      var old = slotText[key];
      if (old && !valuePresent(cur, old)) delete slotText[key];
    });
  }
  function render(host) {
    var lab = window.root.fluxPhotoLabList();
    if (!lab.length) return;
    var det = document.createElement("details");
    det.className = "flux-photo";
    var sum = document.createElement("summary");
    sum.textContent = "📷 Photo lab (shot, lens, light, weather… — one slot each in Description)";
    det.appendChild(sum);
    var grid = document.createElement("div");
    grid.className = "flux-photo-grid";
    det.appendChild(grid);
    var selects = {};
    lab.forEach(function (inp) {
      var cell = document.createElement("label");
      cell.className = "flux-photo-cell";
      var title = document.createElement("span");
      title.textContent = inp.label || inp.key;
      title.title = inp.tip || "";
      cell.appendChild(title);
      var sel = document.createElement("select");
      sel.className = "flux-sel";
      sel.dataset.photoKey = inp.key;
      inp.options.forEach(function (o) {
        var op = document.createElement("option");
        op.value = (o.value === "auto" || norm(o.name) === "auto") ? "" : decodeEntities(o.value);
        op.textContent = decodeEntities(o.name);
        sel.appendChild(op);
      });
      var saved = null;
      try { saved = localStorage.getItem("fluxtab_photo_" + inp.key); } catch (e) {}
      if (saved != null) {
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === saved) { sel.selectedIndex = i; break; }
        }
      }
      if (sel.value) slotText[inp.key] = sel.value;
      sel.addEventListener("change", function () {
        try { localStorage.setItem("fluxtab_photo_" + inp.key, sel.value); } catch (e) {}
        applySlot(inp.key, sel.value);
      });
      selects[inp.key] = sel;
      cell.appendChild(sel);
      grid.appendChild(cell);
    });
    var t = ta();
    if (t) t.addEventListener("input", function () { recheck(selects); });
    host.appendChild(det);
  }
  window.FluxPhoto = { render: render, applySlot: applySlot };
})();
