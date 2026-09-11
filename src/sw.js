/*
 * sw.js - the v2 service worker (spec ADR-4). Scope, exactly:
 *   1. toolbar action -> open the sidebar and turn filtering on
 *   2. validate + forward feature requests (sidebar -> content script)
 * It holds no matching state, no capture, no LLM work, no keepalive hacks.
 * Every handler reconstructs what it needs from the message + sender.
 */

import { MESSAGE_TYPES, PORT_NAME, validateFeatureRequest } from "./protocol.js";

const STREAMYARD = /^https:\/\/([a-z0-9-]+\.)?streamyard\.com\//i;

try {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => {});
} catch {
  // Older Chromium without sidePanel: the action will just do nothing.
}

chrome.action.onClicked.addListener((tab) => {
  // Must run synchronously in the user gesture; open() is called before awaits.
  try {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  } catch {
    // Ignore; the panel may already be open or unsupported.
  }
  if (tab?.url && STREAMYARD.test(tab.url)) {
    chrome.storage.local.set({ safwaEnabled: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      !STREAMYARD.test(tab.url ?? "")
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
