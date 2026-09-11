/*
 * sw.js - the v2 service worker (spec ADR-4). Scope, exactly:
 *   1. toolbar action -> open the sidebar, attach the session to that tab, turn filtering on
 *   2. validate + forward feature requests (sidebar -> content script)
 * It holds no matching state, no capture, no LLM work, no keepalive hacks.
 * Every handler reconstructs what it needs from the message + sender.
 */

import { MESSAGE_TYPES, PORT_NAME, validateFeatureRequest } from "./protocol.js";
import { STORAGE_KEYS } from "./config.js";
import {
  CONTENT_SCRIPT_FILE,
  isStreamYardUrl,
  needsContentAttach,
  panelPathForTab,
} from "./inject.js";

const PANEL_PATH = "panel/panel.html";
let panelTabId = null;

try {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => {});
  // Manifest default_path is window-global. Disable it so a click on one tab
  // cannot leave the sidebar open on every other tab in the window.
  chrome.sidePanel.setOptions({ enabled: false }).catch(() => {});
} catch {
  // Older Chromium without sidePanel: the action will just do nothing.
}

function releasePanelTab(tabId) {
  if (typeof tabId !== "number") return;
  chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
  try {
    chrome.sidePanel.close?.({ tabId })?.catch?.(() => {});
  } catch {
    // close() is newer than open(); hiding via enabled:false is enough.
  }
}

chrome.tabs?.onRemoved?.addListener((tabId) => {
  if (tabId === panelTabId) panelTabId = null;
});

function pingContent(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: "safwa-ping" }, (res) => {
        resolve(!chrome.runtime.lastError && res?.ok === true);
      });
    } catch {
      resolve(false);
    }
  });
}

function attachContentScript(tabId) {
  if (typeof tabId !== "number" || !chrome.scripting?.executeScript) return;
  // scripting.InjectionTarget uses tabId only (top frame) or frameIds: [0].
  // `frameId` is a tabs.sendMessage field and Chrome rejects the whole inject.
  try {
    const done = chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
      injectImmediately: true,
      world: "ISOLATED",
    });
    done?.catch?.(() => {});
  } catch {
    // Permission or target shape rejected; the panel will retry ping.
  }
}

function ensureContentScript(tab) {
  if (typeof tab?.id !== "number" || !isStreamYardUrl(tab.url ?? "")) return;
  pingContent(tab.id).then((pingOk) => {
    if (needsContentAttach({ url: tab.url, pingOk })) attachContentScript(tab.id);
  });
}

function attachOpenStudios() {
  chrome.tabs.query({ url: ["https://streamyard.com/*", "https://*.streamyard.com/*"] }, (tabs) => {
    if (chrome.runtime.lastError) return;
    for (const tab of tabs ?? []) ensureContentScript(tab);
  });
}

chrome.runtime.onInstalled.addListener(attachOpenStudios);
chrome.runtime.onStartup?.addListener?.(attachOpenStudios);

chrome.action.onClicked.addListener((tab) => {
  if (typeof tab?.id !== "number") return;
  // Must call open() in this turn — awaiting setOptions drops the user gesture.
  if (typeof panelTabId === "number" && panelTabId !== tab.id) {
    releasePanelTab(panelTabId);
  }
  panelTabId = tab.id;
  try {
    chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: panelPathForTab(tab.id, PANEL_PATH),
      enabled: true,
    });
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  } catch {
    // Ignore; the panel may already be open or unsupported.
  }
  if (isStreamYardUrl(tab.url ?? "")) {
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: true }).catch(() => {});
    ensureContentScript(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "safwa-ensure") {
    if (sender?.id !== chrome.runtime.id || typeof message.tabId !== "number") {
      sendResponse({ ok: false });
      return false;
    }
    chrome.tabs.get(message.tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({ ok: false });
        return;
      }
      ensureContentScript(tab);
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message?.type !== MESSAGE_TYPES.FEATURE_REQUEST) return false;
  // Only this extension's own sidebar document may ask for a native click.
  // A content script has sender.url = the page URL, so the panel-URL check
  // below is what actually excludes it; sender.tab is present for a panel
  // opened in a tab (documented fallback) and must not be rejected.
  if (sender?.id !== chrome.runtime.id) {
    sendResponse({ v: 2, type: MESSAGE_TYPES.FEATURE_RESULT, requestId: message.requestId ?? null, outcome: "refused", reasonCode: "featureFindNative" });
    return false;
  }
  const validation = validateFeatureRequest(message);
  if (!validation.ok || Date.now() > message.expiresAt) {
    sendResponse({ v: 2, type: MESSAGE_TYPES.FEATURE_RESULT, requestId: message.requestId ?? null, outcome: "refused", reasonCode: "featureFindNative" });
    return false;
  }
  const panelUrl = chrome.runtime.getURL("panel/panel.html");
  if (typeof sender?.url !== "string" || !sender.url.startsWith(panelUrl)) {
    sendResponse({ v: 2, type: MESSAGE_TYPES.FEATURE_RESULT, requestId: message.requestId, outcome: "refused", reasonCode: "featureFindNative" });
    return false;
  }
  chrome.tabs.get(message.tabId, (tab) => {
    if (
      chrome.runtime.lastError ||
      !tab ||
      tab.windowId !== message.windowId ||
      !tab.active ||
      !isStreamYardUrl(tab.url ?? "")
    ) {
      sendResponse({ v: 2, type: MESSAGE_TYPES.FEATURE_RESULT, requestId: message.requestId, outcome: "refused", reasonCode: "featureFindNative" });
      return;
    }
    chrome.tabs.sendMessage(
      message.tabId,
      { ...message, type: MESSAGE_TYPES.FEATURE_REQUEST },
      { frameId: 0 },
      (result) => {
        if (chrome.runtime.lastError || !result) {
          sendResponse({ v: 2, type: MESSAGE_TYPES.FEATURE_RESULT, requestId: message.requestId, outcome: "unknown", reasonCode: "featureCheckBroadcast" });
          return;
        }
        sendResponse({ v: 2, type: MESSAGE_TYPES.FEATURE_RESULT, requestId: message.requestId, outcome: result.outcome, reasonCode: result.reasonCode ?? null });
      }
    );
  });
  return true; // async sendResponse
});

// Keep the port name referenced so bundlers/readers see the contract.
void PORT_NAME;
