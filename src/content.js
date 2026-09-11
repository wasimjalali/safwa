/*
 * content.js - the v2 bootstrap (spec Section 2). Registered first in the
 * ISOLATED content-script entry. It is a classic script that dynamically
 * imports the ES-module core and hands control to the v2 session owner.
 *
 * PANEL_MODE === "v1-inline" loads the frozen legacy bootstrap instead, which
 * is how the v1 regression harnesses and the legacy unpacked build keep
 * working.
 *
 * Everything fails safe: if we are not on a studio, or a module fails to load,
 * the extension does nothing visible and logs one clear [Ṣafwa] line. The
 * native StreamYard panel is never touched.
 */
(function () {
  "use strict";

  if (globalThis.__safwaContentBooted) return;
  globalThis.__safwaContentBooted = true;

  const TAG = "[Ṣafwa]";
  const VERSION = chrome.runtime?.getManifest?.().version ?? "?";


  if (!/(^|\.)streamyard\.com$/.test(location.host)) {
    console.warn(`${TAG} not a streamyard.com host (${location.host}); doing nothing.`);
    return;
  }

  console.log(`${TAG} content script loaded (v${VERSION}) on ${location.host}${location.pathname}`);

  const url = (p) => chrome.runtime.getURL(p);

  Promise.all([
    import(url("src/config.js")),
    import(url("src/dom.js")),
    import(url("src/state.js")),
    import(url("src/grouping.js")),
    import(url("src/llm-classifier.js")),
    import(url("src/panel-model.js")),
    import(url("src/protocol.js")),
    import(url("src/admission.js")),
    import(url("src/health.js")),
    import(url("src/ws-parser.js")),
    import(url("src/session.js")),
  ])
    .then(([configMod, dom, stateMod, grouping, llm, panelModel, protocol, admissionMod, healthMod, wsParser, sessionMod]) => {
      if (configMod.CONFIG.PANEL_MODE === "v1-inline") {
        return import(url("src/content-legacy.js"));
      }
      sessionMod.startSession({
        CONFIG: configMod.CONFIG,
        dom,
        stateMod,
        grouping,
        llm,
        panelModel,
        protocol,
        admissionMod,
        healthMod,
        wsParser,
        STORAGE_KEYS: configMod.STORAGE_KEYS,
        readStoredSettings: configMod.readStoredSettings,
        applyStoredSettings: configMod.applyStoredSettings,
      });
    })
    .catch((err) => {
      console.warn(`${TAG} failed to load v2 modules; doing nothing (fail-safe).`, err);
    });
})();
