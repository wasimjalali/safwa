/*
 * inject.js - when the already-open studio needs a content-script attach.
 * Pure: no chrome.*, no DOM. The service worker is the only caller.
 *
 * Chrome injects manifest content_scripts on navigation, not when the teacher
 * opens the sidebar or reloads the extension. Opening Ṣafwa on a live studio
 * must therefore attach the session to that tab without a mid-broadcast refresh.
 */

export const STREAMYARD_TAB = /^https:\/\/([a-z0-9-]+\.)?streamyard\.com\//i;
export const CONTENT_SCRIPT_FILE = "src/content.js";
export const PANEL_TAB_QUERY = "tab";

export function isStreamYardUrl(url) {
  return typeof url === "string" && STREAMYARD_TAB.test(url);
}

/** True when this tab is a studio and the content session has not answered ping. */
export function needsContentAttach({ url, pingOk }) {
  return isStreamYardUrl(url) && pingOk !== true;
}

export function panelPathForTab(tabId, base = "panel/panel.html") {
  if (typeof tabId !== "number") return base;
  return `${base}?${PANEL_TAB_QUERY}=${tabId}`;
}

export function readPinnedTabId(search) {
  const raw = new URLSearchParams(typeof search === "string" ? search.replace(/^\?/, "") : "").get(
    PANEL_TAB_QUERY
  );
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id >= 0 ? id : null;
}
