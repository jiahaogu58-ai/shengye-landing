/* ============================================================================
   Ningbo Shengye 落地页 · 访客追踪
   ----------------------------------------------------------------------------
   作用：广告来的访客在页面打开的那一刻就拿到一个短码（前 2 位是来源标签，
        如 FB7K3M），页面上所有 WhatsApp 按钮的链接会自动带上「(Ref: FB7K3M)」。

   于是你在 WhatsApp 收到那句 "(Ref: FB7K3M)" 就知道：他点的是哪条广告、
   在哪个国家、用手机还是电脑、看了哪几个页面 —— 客户全程不用填任何东西。

   依赖（都在页面里先设好）：
     window.LH_API  = "https://lead-hunter-trade.app.workbuddy.host"
     window.SY      = { wa: "447593945185" }      // 可选，默认就是这个号

   页面约定：
     · 我们的按钮标 data-lh，各自预填文案写在 data-wa-text 里
     · 页面上其它已经写死的 wa.me 链接会被自动补上 Ref，原文案不动

   隐私：不收集表单、不采集明文 IP（服务端只存盐化哈希用于去重）、无广告 cookie。
   ========================================================================== */
(function () {
  if (window.__LH_TRACK_LOADED__) return;      // 防重复注入
  window.__LH_TRACK_LOADED__ = true;

  var API = window.LH_API || location.origin;
  var COOKIE = "lh_vid";
  var AB = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

  function parseParams() {
    var o = {}, s = String(location.search || "").replace(/^\?/, "");
    if (!s) return o;
    s.split("&").forEach(function (kv) {
      var i = kv.indexOf("="); if (i < 0) return;
      var k = decodeURIComponent(kv.slice(0, i));
      var v = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
      if (k && v) o[k] = v.slice(0, 120);
    });
    return o;
  }
  function getCookie(n) {
    try { var m = document.cookie.match(new RegExp("(?:^|;\\s*)" + n + "=([A-Z0-9]+)")); return m ? m[1] : ""; }
    catch (e) { return ""; }
  }
  function setCookie(n, v, d) {
    try {
      document.cookie = n + "=" + v + "; path=/; max-age=" + d * 86400 + "; SameSite=Lax" +
        (location.protocol === "https:" ? "; Secure" : "");
    } catch (e) { }
  }
  function timezone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } }
  function rand(n) { var s = ""; for (var i = 0; i < n; i++) s += AB[Math.floor(Math.random() * AB.length)]; return s; }
  function waNum() { return (window.SY && window.SY.wa) || "447593945185"; }

  /* ---------- 来源标签：让短码自己会说话 ---------- */
  var TAG_MAP = {
    facebook: "FB", fb: "FB", meta: "FB", instagram: "IG", ig: "IG",
    messenger: "MS", audience_network: "AN", google: "GG", adwords: "GG",
    youtube: "YT", tiktok: "TT", linkedin: "LI", twitter: "TW", x: "TW", pinterest: "PT",
    qr: "QR", email: "EM", direct: "DI"
  };
  function tag2() {
    var s = String(parseParams().utm_source || "").toLowerCase();
    if (TAG_MAP[s]) return TAG_MAP[s];
    var t = s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2);
    return t || "DI";
  }

  /* ---------- 短码：同一条广告里沿用，换来源就发新码 ---------- */
  var vid = getCookie(COOKIE), tag = tag2();
  if (!vid || vid.slice(0, 2) !== tag) vid = tag + rand(4);
  window.LH_VID = vid;
  setCookie(COOKIE, vid, 30);

  /* ---------- 上报一次访问 ---------- */
  try {
    fetch(API + "/api/track/visit", {
      method: "POST", headers: { "Content-Type": "application/json" }, mode: "cors", keepalive: true,
      body: JSON.stringify({
        vid: vid, params: parseParams(), referrer: document.referrer || "",
        url: location.href, page: location.pathname, lang: navigator.language || "",
        tz: timezone(), screen: (screen.width || 0) + "x" + (screen.height || 0)
      })
    }).then(function (r) { return r.json(); }).then(function (j) {
      // 服务端正常情况下会原样采用我们的短码；万一被占用，以服务端返回的为准
      if (j && j.vid && j.vid !== window.LH_VID) { window.LH_VID = j.vid; setCookie(COOKIE, j.vid, 30); }
      try { document.dispatchEvent(new CustomEvent("lh:vid", { detail: window.LH_VID })); } catch (e) { }
    }).catch(function () { });
  } catch (e) { }

  /* ---------- 上报点击 ---------- */
  // 同时喂给 Meta Pixel（如果页面上装了）：这样 Meta 能按「点进 WhatsApp」来优化人群。
  // 没装 Pixel 时这两行什么都不做，不影响。
  function reportWa() {
    try {
      if (window.fbq) { window.fbq("track", "Contact"); }
    } catch (e) { }
    var v = window.LH_VID || getCookie(COOKIE); if (!v) return;
    try {
      fetch(API + "/api/track/wa", {
        method: "POST", headers: { "Content-Type": "application/json" }, mode: "cors", keepalive: true,
        body: JSON.stringify({ vid: v })
      }).catch(function () { });
    } catch (e) { }
  }

  /* ---------- 链接生成 ---------- */
  function waHref(num, text) {
    var v = window.LH_VID || "";
    var t = text || "Hola, me interesan sus exhibidores de cartón y empaques personalizados.";
    return "https://wa.me/" + String(num || waNum()).replace(/[^0-9]/g, "") +
      "?text=" + encodeURIComponent(t + (v ? " (Ref: " + v + ")" : ""));
  }
  function withRef(href) {
    var v = window.LH_VID || "";
    if (!v || !href || href === "#" || href.indexOf("wa.me/") < 0) return href;
    if (/[?&]text=[^&]*Ref:/i.test(href)) return href;
    try {
      var u = new URL(href, location.href);
      var t = u.searchParams.get("text") || "";
      u.searchParams.set("text", t + (t ? " " : "") + "(Ref: " + v + ")");
      return u.toString();
    } catch (e) {
      var sep = href.indexOf("?") >= 0 ? "&" : "?";
      return href + sep + "text=" + encodeURIComponent("(Ref: " + v + ")");
    }
  }

  /* 供页面脚本主动调用（例如表单提交） */
  window.lhWa = function (number, text, lang) {
    reportWa();
    var t = text || ((lang === "es")
      ? "Hola, me interesan sus exhibidores de cartón y empaques personalizados."
      : "Hi, I'm interested in your custom displays and packaging.");
    return waHref(number, t);
  };
  window.lhWaHref = waHref;

  /* ---------- 给页面上的按钮贴上链接 ---------- */
  function relabel() {
    // 1) 标了 data-lh 的按钮：按 data-wa-text 生成各自文案
    Array.prototype.forEach.call(document.querySelectorAll("[data-lh]"), function (el) {
      if (el.getAttribute("data-lh") === "done") return;
      el.setAttribute("href", waHref(waNum(), el.getAttribute("data-wa-text") || ""));
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
      el.setAttribute("data-lh", "done");
    });
    // 2) 页面里其它写死的 wa.me 链接：只补 Ref，原文案不动
    Array.prototype.forEach.call(document.querySelectorAll('a[href*="wa.me/"]'), function (a) {
      if (a.getAttribute("data-lh") === "done") return;
      a.setAttribute("href", withRef(a.getAttribute("href")));
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });
  }

  // 捕获阶段兜底：脚本动态生成的按钮也能被接管
  document.addEventListener("click", function (ev) {
    var el = ev.target;
    while (el && el.tagName !== "A") el = el.parentNode;
    if (!el || el.tagName !== "A") return;
    var href = el.getAttribute("href") || "";
    if (href.indexOf("wa.me/") < 0) return;
    el.setAttribute("href", withRef(href));
    reportWa();
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", relabel);
  else relabel();
  // 图片/字体加载完再补一次，兜住动态插入的按钮
  window.addEventListener("load", relabel);
})();
