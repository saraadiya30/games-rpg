(function () {
  "use strict";
  var VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;
  function kindOf(url, hint) {
    if (hint === "video") return "video";
    if (!url) return "";
    var u = String(url);
    if (/^data:video\//i.test(u)) return "video";
    if (VIDEO_EXT.test(u)) return "video";
    return "image";
  }
  function isVideo(url, hint) {
    return kindOf(url, hint) === "video";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>\"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function thumbHtml(url, cls, hint, poster) {
    cls = cls || "";
    if (!url) return '<div class="' + esc(cls) + ' ' + esc(cls) + '-ph">🧑</div>';
    if (isVideo(url, hint)) {
      return '<video class="' + esc(cls) + '" src="' + esc(url) + '"' +
        (poster ? ' poster="' + esc(poster) + '"' : "") +
        ' muted loop playsinline autoplay preload="metadata"></video>';
    }
    return '<img class="' + esc(cls) + '" loading="lazy" src="' + esc(url) + '" alt="">';
  }
  function videoPoster(src, max) {
    max = max || 256;
    return new Promise(function (resolve) {
      try {
        var v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
        var done = false;
        function cap() {
          if (done) return; done = true;
          try {
            var sc = Math.min(1, max / Math.max(v.videoWidth || 1, v.videoHeight || 1));
            var c = document.createElement("canvas");
            c.width = Math.max(1, Math.round((v.videoWidth || 1) * sc));
            c.height = Math.max(1, Math.round((v.videoHeight || 1) * sc));
            c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
            resolve(c.toDataURL("image/jpeg", 0.78));
          } catch (e) { resolve(""); }
          try { v.src = ""; } catch (e) {}
        }
        v.addEventListener("loadeddata", function () {
          try { v.currentTime = 0.1; } catch (e) { cap(); }
        });
        v.addEventListener("seeked", cap);
        v.addEventListener("error", function () { resolve(""); });
        setTimeout(function () { resolve(""); }, 9000);
        v.src = src;
      } catch (e) { resolve(""); }
    });
  }
  async function fileToAvatar(file) {
    var kind = (file && file.type && /^video\//i.test(file.type)) ? "video" : "image";
    if (kind === "video") {
      var blobUrl = URL.createObjectURL(file);
      var poster = await videoPoster(blobUrl, 256);
      return { url: blobUrl, kind: "video", poster: poster, file: file };
    }
    var dataUrl = await new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error("unreadable file")); };
      fr.readAsDataURL(file);
    });
    return { url: dataUrl, kind: /^data:image\/gif/i.test(dataUrl) ? "image" : "image", poster: "", file: file };
  }
  window.AvatarMedia = {
    kindOf: kindOf,
    isVideo: isVideo,
    thumbHtml: thumbHtml,
    videoPoster: videoPoster,
    fileToAvatar: fileToAvatar
  };
})();
