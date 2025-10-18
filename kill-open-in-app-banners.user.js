// ==UserScript==
// @name         Kill "Open in App" Banners (Safari-friendly) + Reddit fix
// @namespace    https://example.com/userscripts
// @version      1.4
// @description  Hide or remove annoying "Open in app" banners. Extra fix for Reddit on iOS where Safari shows a native banner via response header that userscripts cannot remove. Optional: auto-redirect to old.reddit.com which doesn't trigger the banner.
// @author       you
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ======== TOGGLE: Reddit auto-redirect to old.reddit.com ========
  // Set to true if you want to avoid Safari's native banner by using old.reddit.com.
  // On iOS, Reddit often sends the 'apple-itunes-app' RESPONSE HEADER (not meta),
  // which triggers a native banner that JS/CSS cannot hide.
  const REDIRECT_OLD_REDDIT = true;

  // ======== Detect iOS/iPadOS Safari ========
  const ua = navigator.userAgent || "";
  const isIOS = /\b(iPad|iPhone|iPod)\b/i.test(ua) || (/\bMac OS X\b/.test(ua) && 'ontouchend' in document);
  const isMobileViewport = Math.max(window.innerWidth, window.innerHeight) <= 1024;

  // ======== Early Reddit redirect (runs at document-start) ========
  try {
    const host = location.hostname;
    if (REDIRECT_OLD_REDDIT && isIOS && isMobileViewport) {
      // If on any reddit host (www, m, new), redirect to old.reddit.com
      const isReddit = /\.?reddit\.com$/.test(host) || host.endsWith(".reddit.com");
      if (isReddit && host !== "old.reddit.com") {
        const newURL = location.href.replace(/^https?:\/\/[^/]+/i, "https://old.reddit.com");
        location.replace(newURL);
        return; // stop further execution for this navigation
      }
    }
  } catch (_) {}

  // --- 1) Remove iOS Smart App Banner (Safari native) via <meta> ---
  function killSmartAppMeta(root = document) {
    try {
      const metas = root.querySelectorAll('meta[name="apple-itunes-app"]');
      metas.forEach(m => m.parentNode && m.parentNode.removeChild(m));
    } catch (_) {}
  }
  killSmartAppMeta();
  const headObserver = new MutationObserver(muts => {
    for (const mut of muts) {
      mut.addedNodes && mut.addedNodes.forEach(n => {
        if (n.nodeType === 1) {
          if (n.matches?.('meta[name="apple-itunes-app"]')) n.remove();
          else killSmartAppMeta(n);
        }
      });
    }
  });
  headObserver.observe(document.documentElement || document, { childList: true, subtree: true });

  // --- 2) CSS kill-switch for common web banners ---
  const style = document.createElement("style");
  style.setAttribute("data-userscript", "kill-open-in-app");
  style.textContent = `
    .smartbanner,
    .smart-app-banner,
    .app-banner,
    .app_banner,
    .appBanner,
    .app-download-banner,
    .app_download_banner,
    .open-in-app,
    .open-in-app-banner,
    .OpenInAppBanner,
    .OpenInAppButton,
    .app-promo,
    .appPromo,
    .xpromo,
    .xPromoNSFW,
    .download-app-banner,
    .DownloadAppBanner,
    .pwa-install-banner,
    .mobile-app-banner,
    .appInstallPrompt,
    [data-testid*="smartbanner"],
    [data-testid*="app-banner"],
    [id*="smartbanner"],
    [id*="app-banner"],
    [class*="SmartBanner"],
    [class*="smartbanner"],
    [class*="openInApp"],
    [class*="open-in-app"],
    [class*="OpenInApp"],
    [class*="appInstall"],
    [class*="AppInstall"],
    [class*="xpromo"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      height: 0 !important;
      max-height: 0 !important;
      min-height: 0 !important;
      pointer-events: none !important;
    }
    html.has-smartbanner body,
    body.has-smartbanner,
    body.app-banner-visible {
      margin-top: 0 !important;
      padding-top: 0 !important;
    }
  `;
  document.documentElement.appendChild(style);

  // --- 3) Heuristic remover for top-fixed elements that *contain* banner phrases ---
  const PHRASES = [
    "open in app","open app","open in the app","use the app","download the app","get the app",
    "mở trong ứng dụng","mở bằng ứng dụng","mở app","tải ứng dụng","dùng ứng dụng",
    "打开 app","在 app 中打开","開啟 app","在 app 中開啟"
  ];
  function looksLikeTopBanner(el) {
    try {
      const rect = el.getBoundingClientRect();
      const isTop = rect.top >= -5 && rect.top <= 80;
      const isWide = rect.width >= (document.documentElement.clientWidth * 0.6);
      const isShort = rect.height <= 200;
      const style = window.getComputedStyle(el);
      const isFixedOrSticky = ["fixed", "sticky"].includes(style.position);
      return isTop && isWide && isShort && isFixedOrSticky;
    } catch (_) { return false; }
  }
  function containsBannerText(el) {
    const text = (el.textContent || "").toLowerCase();
    return text && PHRASES.some(p => text.includes(p));
  }
  function nukeBanner(el) {
    try { el.remove(); }
    catch (_) {
      try {
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("opacity","0","important");
        el.style.setProperty("height","0","important");
        el.style.setProperty("max-height","0","important");
        el.style.setProperty("pointer-events","none","important");
      } catch (_) {}
    }
  }
  function scanOnce(root = document) {
    const all = root.querySelectorAll('div, section, header, aside, nav, [role="banner"], [role="dialog"], [role="alert"]');
    for (const el of all) {
      if (!el.isConnected) continue;
      if ((el.tagName === "NAV" || el.getAttribute("role") === "navigation") && !containsBannerText(el)) continue;
      if (looksLikeTopBanner(el) && containsBannerText(el)) nukeBanner(el);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scanOnce());
  } else {
    scanOnce();
  }
  const obs = new MutationObserver(mutations => {
    let needsScan = false;
    for (const mut of mutations) {
      if (mut.addedNodes && mut.addedNodes.length) {
        for (const n of mut.addedNodes) {
          if (n.nodeType === 1) {
            if (containsBannerText(n) || n.matches?.('[class*="banner"], [id*="banner"], [class*="app"], [id*="app"]')) {
              if (looksLikeTopBanner(n)) nukeBanner(n);
              needsScan = true;
            }
          }
        }
      }
    }
    if (needsScan) {
      clearTimeout(obs._t);
      obs._t = setTimeout(() => scanOnce(), 60);
    }
  });
  obs.observe(document.documentElement || document, { childList: true, subtree: true });

  // --- 4) Site-specific tweaks ---
  (function siteSpecific() {
    const host = location.hostname;
    if (host.includes("reddit.")) {
      document.documentElement.classList.add("no-xpromo");
      const css = document.createElement("style");
      css.textContent = `
        shreddit-explore-talks,
        shreddit-async-loader[xpromo],
        shreddit-xpromo,
        shreddit-banner { display: none !important; }
      `;
      document.documentElement.appendChild(css);
    }
    if (host.includes("medium.")) {
      const css = document.createElement("style");
      css.textContent = `.l.m.p, header[role="banner"] div:has(a[href*="app"]) { display: none !important; }`;
      document.documentElement.appendChild(css);
    }
  })();

  // --- 5) Clean up body offset ---
  function normalizeBodyOffset() {
    try {
      const b = document.body; if (!b) return;
      const mt = parseInt(getComputedStyle(b).marginTop || "0", 10);
      const pt = parseInt(getComputedStyle(b).paddingTop || "0", 10);
      if (mt > 0) b.style.marginTop = "0px";
      if (pt > 0) b.style.paddingTop = "0px";
    } catch (_) {}
  }
  window.addEventListener("load", () => setTimeout(normalizeBodyOffset, 150));
})();