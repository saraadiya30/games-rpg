window.CommunityCap = (function () {
  var LIMIT = 20;
  var KEY = "t2iCommunityUploadsV1";
  function day() { return new Date().toISOString().slice(0, 10); }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (!s || s.day !== day()) s = { day: day(), count: 0 };
      s.count = Math.max(0, parseInt(s.count, 10) || 0);
      return s;
    } catch (e) { return { day: day(), count: 0 }; }
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function remaining() { return Math.max(0, LIMIT - load().count); }
  function canPost() { return remaining() > 0; }
  function notePosted() { var s = load(); s.count += 1; save(s); return remaining(); }
  function statusText() { return remaining() + " of " + LIMIT + " community uploads left today"; }
  function blockedMsg() { return "Daily community upload limit reached (20/day). Try again tomorrow."; }
  return { LIMIT: LIMIT, remaining: remaining, canPost: canPost, notePosted: notePosted, statusText: statusText, blockedMsg: blockedMsg };
})();
