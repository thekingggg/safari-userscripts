// ==UserScript==
// @name         Kill "Open in App" Banners (Safari-friendly)
// @namespace    https://example.com/userscripts
// @version      1.3
// @description  Hide or remove annoying "Open in app" / smart app banners at the top of pages (works in Safari with Tampermonkey/Userscripts). Also removes iOS Smart App Banner meta tags.
// @author       you
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // --- 1) Remove iOS Smart App Banner (Safari native) ---
  // Many sites enable the iOS native banner with: <meta name="apple-itunes-app" ...>
  // Removing it before the page renders prevents the banner from ever appearing.
  function killSmartAppMeta(root = document) {
    try {
      const metas = root.querySelectorAll('meta[name="apple-itunes-app"]');
      metas.forEach(m => m.parentNode && m.parentNode.removeChild(m));
    } catch (_) {}
  }

  // Run ASAP (document-start) for initial HTML, and again on future inserts.
  killSmartAppMeta();
  // In case some SPA adds it later:
  const headObserver = new MutationObserver(mutations => {
    for (const mut of mutations) {
      if (mut.addedNodes) {
        mut.addedNodes.forEach(n => {
          if (n.nodeType === 1) { // element
            if (n.matches && n.matches('meta[name="apple-itunes-app"]')) {
              n.remove();
            } else {
              killSmartAppMeta(n);
            }
          }
        });
      }
    }
  });
  headObserver.observe(document.documentElement || document, { childList: true, subtree: true });

  // --- 2) CSS kill-switch for common web banners ---
  // Add a stylesheet that hides popular "open in app" and smart-app banner patterns.
  const style = document.createElement("style");
  style.setAttribute("data-userscript", "kill-open-in-app");
  style.textContent = `
    /* Generic names frequently used by frameworks */
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
    .xpromo, /* reddit */
    .xPromoNSFW, /* reddit legacy */
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

    /* Sticky bars at very top */
    .sticky, .fixed, [style*="position: fixed"], [style*="position:sticky"] {
      /* We'll still need JS heuristics to avoid hiding real navs.
         So CSS stays generic; JS will target only if it contains specific text. */
    }

    /* Some sites push the body down to make space for their banner */
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
    "open in app",
    "open app",
    "open in the app",
    "use the app",
    "download the app",
    "get the app",
    "mở trong ứng dụng",
    "mở bằng ứng dụng",
    "mở app",
    "tải ứng dụng",
    "dùng ứng dụng",
    "打开 App", "在 App 中打开",
    "開啟 App", "在 App 中開啟"
  ];

  function looksLikeTopBanner(el) {
    try {
      const rect = el.getBoundingClientRect();
      const isTop = rect.top >= -5 && rect.top <= 80;  // near top
      const isWide = rect.width >= (document.documentElement.clientWidth * 0.6);
      const isShort = rect.height <= 200;
      const style = window.getComputedStyle(el);
      const isFixedOrSticky = ["fixed", "sticky"].includes(style.position);
      return isTop && isWide && isShort && isFixedOrSticky;
    } catch (_) {
      return false;
    }
  }

  function containsBannerText(el) {
    const text = (el.textContent || "").toLowerCase();
    if (!text) return false;
    return PHRASES.some(p => text.includes(p));
  }

  function nukeBanner(el) {
    // Try to remove the banner node; fallback to hiding if removal fails.
    try {
      el.remove();
    } catch (_) {
      try {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("opacity", "0", "important");
        el.style.setProperty("height", "0", "important");
        el.style.setProperty("max-height", "0", "important");
        el.style.setProperty("pointer-events", "none", "important");
      } catch (_) {}
    }
  }

  function scanOnce(root = document) {
    const all = root.querySelectorAll('div, section, header, aside, nav, [role="banner"], [role="dialog"], [role="alert"]');
    for (const el of all) {
      if (!el.isConnected) continue;
      // Quick skip for common site navs: if it contains a search input or many links, and no banner phrases.
      if ((el.tagName === "NAV" || el.getAttribute("role") === "navigation") && !containsBannerText(el)) {
        continue;
      }
      if (looksLikeTopBanner(el) && containsBannerText(el)) {
        nukeBanner(el);
      }
    }
  }

  // Initial scan ASAP
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scanOnce());
  } else {
    scanOnce();
  }

  // Observe future DOM changes (SPAs, lazy banners)
  const obs = new MutationObserver(mutations => {
    let needsScan = false;
    for (const mut of mutations) {
      if (mut.addedNodes && mut.addedNodes.length) {
        for (const n of mut.addedNodes) {
          if (n.nodeType === 1) { // element
            if (containsBannerText(n) || n.matches?.('[class*="banner"], [id*="banner"], [class*="app"], [id*="app"]')) {
              // quick path: if it already looks like banner and at top, nuke immediately
              if (looksLikeTopBanner(n)) nukeBanner(n);
              needsScan = true;
            }
          }
        }
      }
    }
    if (needsScan) {
      // Debounce a bit to avoid thrashing
      clearTimeout(obs._t);
      obs._t = setTimeout(() => scanOnce(), 60);
    }
  });
  obs.observe(document.documentElement || document, { childList: true, subtree: true });

  // --- 4) Site-specific fallbacks (very minimal, more can be added if needed) ---
  function siteSpecific() {
    const host = location.hostname;
    // Example tweaks:
    // Reddit mobile web sometimes uses <shreddit-...> components that expose xpromo slots.
    if (host.includes("reddit.")) {
      document.documentElement.classList.add("no-xpromo");
      const css = document.createElement("style");
      css.textContent = `shreddit-explore-talks, shreddit-async-loader[xpromo], shreddit-xpromo, shreddit-banner { display: none !important; }`;
      document.documentElement.appendChild(css);
    }
    // Medium tries various top promos
    if (host.includes("medium.")) {
      const css = document.createElement("style");
      css.textContent = `.l.m.p, header[role="banner"] div:has(a[href*="app"]) { display: none !important; }`;
      document.documentElement.appendChild(css);
    }
  }
  siteSpecific();

  // --- 5) Clean up extra top spacing added by removed banners ---
  function normalizeBodyOffset() {
    try {
      const b = document.body;
      if (!b) return;
      const mt = parseInt(getComputedStyle(b).marginTop || "0", 10);
      const pt = parseInt(getComputedStyle(b).paddingTop || "0", 10);
      if (mt > 0) b.style.marginTop = "0px";
      if (pt > 0) b.style.paddingTop = "0px";
    } catch (_) {}
  }
  // Run after load to correct layout if needed
  window.addEventListener("load", () => setTimeout(normalizeBodyOffset, 150));

})();