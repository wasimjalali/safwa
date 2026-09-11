/*
 * panel.js - the Ṣafwa sidebar renderer (spec Section 6). Pure view: it never
 * touches StreamYard's DOM. It renders pushed snapshots/patches from the
 * content session and sends teacher actions through the validated
 * feature-proxy path.
 */

import { CONFIG, STORAGE_KEYS } from "../src/config.js";
import { platformIcon } from "../src/panel-model.js";
import { MESSAGE_TYPES, PORT_NAME, makeEnvelope } from "../src/protocol.js";

const L = CONFIG.LABELS;
const app = document.getElementById("app");
const list = document.getElementById("list");
const statusEl = document.getElementById("status");
const settings = document.getElementById("settings");
const togglesEl = document.getElementById("toggles");
const masterEl = document.getElementById("master");
const gear = document.getElementById("gear");
const reset = document.getElementById("reset");
const newItems = document.getElementById("new-items");

const bound = { token: null, epoch: null, revision: 0 };
const model = new Map();
const rowEls = new Map();
let folded = [];
let port = null;
let tabId = null;
let windowId = null;
let boundTab = false;
let windowCount = CONFIG.PANEL.maxMountedRows;
let lastRowIds = [];
let enabled = true;
let lastHealth = { observer: "ok", wsState: "off" };
let lastHealthAt = Date.now();
let savedScrollTop = 0;
const pendingFeature = new Map();
const WINDOW_CAP = 1200;
let lastWindowCount = 0;

app.hidden = false;
document.getElementById("static-failure").hidden = true;
document.querySelector(".head__title").textContent = L.panelTitle;
document.querySelector(".filter__label").textContent = L.filterLabel;
document.getElementById("reset").textContent = L.resetSession;
document.getElementById("new-items").textContent = L.panelNewItems;
document.getElementById("gear").setAttribute("aria-label", L.settingsHeading);
document.getElementById("list").removeAttribute("aria-live");
document.getElementById("status").setAttribute("aria-live", "polite");

function wireUi() {
  gear.addEventListener("click", () => {
    // One button, both ways: the gear opens and closes the settings view.
    const opening = settings.hidden;
    if (opening) savedScrollTop = list.scrollTop;
    settings.hidden = !opening;
    list.hidden = opening || !enabled;
    gear.setAttribute("aria-expanded", String(opening));
    if (!opening) list.scrollTop = savedScrollTop;
  });
  gear.setAttribute("aria-expanded", "false");
  reset.addEventListener("click", () => {
    if (!port) return;
    port.postMessage(makeEnvelope(MESSAGE_TYPES.RESET_SESSION, envelopeFields()));
  });
  newItems.addEventListener("click", () => {
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    newItems.hidden = true;
  });
  list.addEventListener("scroll", () => {
    if (nearEnd()) newItems.hidden = true;
    list.classList.add("is-scrolling");
    clearTimeout(list.__scrollIdle);
    list.__scrollIdle = setTimeout(() => list.classList.remove("is-scrolling"), 700);
  });
}

async function init() {
  setStatus(L.panelLoading);
  renderSettings();
  wireUi(); // UI reacts before any chrome API await
  await loadPrefs();
  await bindTab();
  chrome.tabs?.onActivated?.addListener(() => bindTab());
  chrome.tabs?.onUpdated?.addListener((_id, info) => {
    if (info.status === "complete") bindTab();
  });
  chrome.windows?.onFocusChanged?.addListener(() => bindTab());
  setInterval(() => {
    if (!port || Date.now() - lastHealthAt < 4000) return;
    setStatus(L.panelDisconnected);
    try {
      port.postMessage(makeEnvelope(MESSAGE_TYPES.RESYNC, envelopeFields()));
    } catch {
      port = null;
      tabId = null;
      scheduleRebind();
    }
    lastHealthAt = Date.now();
  }, CONFIG.PANEL.healthIntervalMs);
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if (STORAGE_KEYS.enabled in changes) {
      enabled = changes[STORAGE_KEYS.enabled].newValue !== false;
      paintEnabledState();
    }
    for (const row of SETTING_ROWS) {
      if (row.key in changes) {
        const input = togglesEl.querySelector(`input[data-key="${row.key}"]`);
        if (input) input.checked = changes[row.key].newValue !== false;
      }
    }
  });
}

function envelopeFields() {
  return {
    documentToken: bound.token,
    sessionEpoch: bound.epoch,
    revision: bound.revision,
  };
}

function nearEnd() {
  return list.scrollHeight - list.scrollTop - list.clientHeight < CONFIG.PANEL.autoFollowPx;
}

let rebindAttempts = 0;
function scheduleRebind() {
  rebindAttempts += 1;
  const delay = rebindAttempts <= 1 ? 100 : rebindAttempts === 2 ? 500 : rebindAttempts === 3 ? 1500 : 5000;
  setTimeout(() => {
    bindTab().catch(() => scheduleRebind());
  }, delay);
}

async function bindTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  const isStudio = tab && /^https:\/\/([a-z0-9-]+\.)?streamyard\.com\//i.test(tab.url ?? "");
  if (!isStudio) {
    port?.disconnect();
    port = null;
    boundTab = false;
    setStatus(L.panelOpenStudio);
    model.clear();
    rowEls.clear();
    list.replaceChildren();
    return;
  }
  if (port && tabId === tab.id) return;
  port?.disconnect();
  // Never leave another studio's actionable list visible.
  model.clear();
  rowEls.clear();
  list.replaceChildren();
  boundTab = false;
  tabId = tab.id;
  windowId = tab.windowId;
  port = chrome.tabs.connect(tab.id, { name: PORT_NAME, frameId: 0 });
  port.onMessage.addListener(onPortMessage);
  port.onDisconnect.addListener(() => {
    port = null;
    tabId = null;
    boundTab = false;
    bound.token = null;
    bound.epoch = null;
    bound.revision = 0;
    setStatus(L.panelDisconnected);
    scheduleRebind();
  });
  // Cold handshake: the port connection authorizes identity discovery.
  port.postMessage(makeEnvelope(MESSAGE_TYPES.SUBSCRIBE, { documentToken: null, sessionEpoch: null }));
  setStatus(L.panelLoading);
  rebindAttempts = 0;
}

function isForThisSession(message) {
  if (!boundTab) return true;
  return message.documentToken === bound.token && message.sessionEpoch === bound.epoch;
}

function onPortMessage(message) {
  if (!message || message.v !== 2) return;
  if (message.type !== MESSAGE_TYPES.SNAPSHOT_BEGIN && !isForThisSession(message)) return;
  switch (message.type) {
    case MESSAGE_TYPES.SNAPSHOT_BEGIN:
      if (bound.token && message.documentToken !== bound.token) return;
      bound.token = message.documentToken;
      bound.epoch = message.sessionEpoch;
      bound.revision = message.revision;
      boundTab = true;
      model.clear();
      rowEls.clear();
      folded = [];
      break;
    case MESSAGE_TYPES.SNAPSHOT_CHUNK:
      for (const row of message.rows ?? []) model.set(row.rowId, row);
      break;
    case MESSAGE_TYPES.SNAPSHOT_END:
      bound.revision = message.revision;
      folded = message.folded ?? [];
      if (message.rowCount !== model.size) {
        port?.postMessage(makeEnvelope(MESSAGE_TYPES.RESYNC, envelopeFields()));
        return;
      }
      render();
      break;
    case MESSAGE_TYPES.PATCH: {
      if (message.baseRevision !== bound.revision) {
        port?.postMessage(makeEnvelope(MESSAGE_TYPES.RESYNC, envelopeFields()));
        return;
      }
      bound.revision = message.revision;
      for (const id of message.removals ?? []) {
        model.delete(id);
        rowEls.delete(id);
      }
      for (const row of message.upserts ?? []) model.set(row.rowId, row);
      folded = message.folded ?? [];
      render();
      break;
    }
    case MESSAGE_TYPES.HEALTH:
      lastHealthAt = Date.now();
      lastHealth = { observer: message.observer ?? "ok", wsState: message.wsState ?? "off" };
      enabled = message.enabled !== false;
      paintStatus();
      paintEnabledState();
      break;
    case MESSAGE_TYPES.RESYNC:
      port?.postMessage(makeEnvelope(MESSAGE_TYPES.SUBSCRIBE, envelopeFields()));
      break;
    case MESSAGE_TYPES.ACTION_STATUS: {
      const entry = pendingFeature.get(message.requestId);
      if (entry) {
        pendingFeature.delete(message.requestId);
        entry.resolve(message);
      }
      break;
    }
    default:
      break;
  }
}

function setStatus(text) {
  statusEl.textContent = text ?? "";
}

function paintStatus() {
  if (lastHealth.observer === "unavailable") setStatus(L.panelKeepCommentsOpen);
  else if (lastHealth.wsState === "demoted") setStatus(L.panelKeepCommentsOpen);
  else if (!enabled) setStatus(L.popupStatusOff);
  else setStatus("");
}

function paintEnabledState() {
  list.hidden = !enabled || !settings.hidden;
  paintStatus();
}

/* ------------------------------------------------------------------ render */

function render() {
  const rows = [...model.values()];
  const visible = rows.slice(Math.max(0, rows.length - windowCount));
  const newIds = visible.map((r) => r.rowId);
  const arrivedNew = lastRowIds.length > 0 && newIds.some((id) => !lastRowIds.includes(id));
  const wasNearEnd = nearEnd();
  const prevScroll = list.scrollTop;
  const prevHeight = list.scrollHeight;
  const grewWindow = windowCount !== lastWindowCount;

  if (rows.length === 0 && folded.length === 0) {
    list.replaceChildren(emptyNode(L.panelWaiting));
    return;
  }

  const frag = document.createDocumentFragment();
  if (rows.length > windowCount) {
    const older = document.createElement("button");
    older.type = "button";
    older.className = "new-items";
    older.style.position = "static";
    older.style.transform = "none";
    older.style.margin = "8px auto";
    older.textContent = `${L.panelOlder} (${rows.length - windowCount}+)`;
    older.addEventListener("click", () => {
      windowCount = Math.min(WINDOW_CAP, windowCount + CONFIG.PANEL.maxMountedRows);
      render();
    });
    frag.append(older);
  }

  for (const row of visible) {
    const key = rowKey(row);
    const existing = rowEls.get(row.rowId);
    if (existing && existing.__key === key) {
      frag.append(existing);
      continue;
    }
    const el = renderRow(row);
    el.__key = key;
    rowEls.set(row.rowId, el);
    frag.append(el);
  }
  const visibleIds = new Set(visible.map((r) => r.rowId));
  for (const id of [...rowEls.keys()]) {
    if (!model.has(id) || !visibleIds.has(id)) rowEls.delete(id);
  }

  if (folded.length > 0) {
    const details = document.createElement("details");
    details.className = "folded";
    const summary = document.createElement("summary");
    summary.textContent = `${L.panelFolded} (${folded.length})`;
    details.append(summary);
    for (const item of folded) {
      const div = document.createElement("div");
      div.className = "folded__item";
      div.dir = "auto";
      div.textContent = `${item.handle} — ${item.displayText}`;
      details.append(div);
    }
    frag.append(details);
  }

  list.replaceChildren(frag);
  lastRowIds = newIds;

  if (wasNearEnd) {
    list.scrollTop = list.scrollHeight;
  } else if (grewWindow) {
    // "load older" prepends rows: compensate by the added height.
    list.scrollTop = prevScroll + (list.scrollHeight - prevHeight);
  } else {
    // Comments append at the bottom; the viewport must not move.
    list.scrollTop = prevScroll;
    if (arrivedNew) newItems.hidden = false;
  }
  lastWindowCount = windowCount;
}

function emptyNode(text) {
  const el = document.createElement("div");
  el.className = "empty";
  el.textContent = text;
  return el;
}

function rowKey(row) {
  return JSON.stringify([
    row.primary.displayText,
    row.badges,
    row.feature,
    row.shown,
    row.starred,
    row.joinedFragments ?? null,
    row.members ?? null,
  ]);
}

export function renderRow(row) {
  const wrap = document.createElement("article");
  wrap.className = "row";
  wrap.dataset.rowId = row.rowId;
  if (row.badges?.pendingReview) wrap.classList.add("row--pending");
  if (row.badges?.secondQuestion) wrap.classList.add("row--second");
  if (row.shown === "on") wrap.classList.add("row--shown");

  const avatarWrap = document.createElement("div");
  avatarWrap.className = "row__avatar-wrap";
  const avatar = row.primary.avatarUrl ? document.createElement("img") : document.createElement("div");
  avatar.className = row.primary.avatarUrl ? "row__avatar" : "row__avatar row__avatar--fallback";
  if (row.primary.avatarUrl) {
    avatar.src = row.primary.avatarUrl;
    avatar.alt = "";
    avatar.referrerPolicy = "no-referrer";
    avatar.loading = "lazy";
    avatar.addEventListener("error", () => avatar.replaceWith(fallbackAvatar(row.primary.handle)), { once: true });
  } else {
    avatar.textContent = (row.primary.handle || "?").replace("@", "").slice(0, 1);
  }
  const platformIconEl = document.createElement("span");
  platformIconEl.className = "platform-icon";
  platformIconEl.setAttribute("role", "img");
  platformIconEl.setAttribute("aria-label", row.primary.platformLabel || L.platformUnknown);
  platformIconEl.title = row.primary.platformLabel || L.platformUnknown;
  platformIconEl.innerHTML = platformIcon(row.primary.platform);
  avatarWrap.append(avatar, platformIconEl);
  wrap.append(avatarWrap);

  const meta = document.createElement("div");
  meta.className = "row__meta";
  const handle = document.createElement("span");
  handle.className = "row__handle";
  handle.setAttribute("dir", "auto");
  handle.textContent = row.primary.handle;
  meta.append(handle);
  if (row.badges?.count) {
    const count = document.createElement("span");
    count.className = "chip chip--count";
    count.textContent = row.badges.countLabel ?? "";
    meta.append(count);
  }
  if (row.badges?.joined) meta.append(chipOf("chip--joined", L.joined));
  if (row.badges?.secondQuestion) meta.append(chipOf("chip--second", L.secondQuestion));
  if (row.badges?.pendingReview) meta.append(chipOf("chip--pending", L.possibleDuplicate));
  wrap.append(meta);

  const text = document.createElement("div");
  text.className = "row__text";
  text.dir = "auto";
  text.textContent = row.primary.displayText;
  wrap.append(text);

  if (Array.isArray(row.joinedFragments)) {
    for (const frag of row.joinedFragments) {
      if (frag.sourceId === row.primary.sourceId) continue;
      const el = document.createElement("div");
      el.className = "joined-frag";
      el.dir = "auto";
      el.textContent = frag.displayText;
      wrap.append(el);
    }
  }

  const actions = document.createElement("div");
  actions.className = "row__actions";
  const feature = document.createElement("button");
  feature.type = "button";
  feature.className = "feature";
  feature.textContent = L[row.feature.labelKey] ?? L.featureShow;
  feature.disabled = !row.feature.available;
  if (!row.feature.available) feature.title = L.featureFindNative;
  feature.addEventListener("click", () => requestFeature(row, feature));
  actions.append(feature);
  if (row.shown === "on") {
    const state = document.createElement("span");
    state.className = "state";
    state.textContent = L.featureOnAir;
    actions.append(state);
  }
  if (row.starred === "on") {
    const star = document.createElement("span");
    star.className = "state state--star";
    star.textContent = L.featureStarred;
    actions.append(star);
  }
  wrap.append(actions);

  if (Array.isArray(row.members) && row.members.length > 1) {
    const details = document.createElement("details");
    details.className = "folded";
    details.style.gridColumn = "2";
    const summary = document.createElement("summary");
    summary.textContent = `${row.badges?.countLabel ?? ""} — ${L.panelFolded}`;
    details.append(summary);
    for (const member of row.members) {
      const item = document.createElement("div");
      item.className = "folded__item";
      item.dir = "auto";
      item.textContent = `${member.handle} — ${member.displayText}`;
      details.append(item);
    }
    wrap.append(details);
  }
  return wrap;
}

function chipOf(cls, text) {
  const el = document.createElement("span");
  el.className = `chip ${cls}`;
  el.textContent = text;
  return el;
}

function fallbackAvatar(handle) {
  const el = document.createElement("div");
  el.className = "row__avatar row__avatar--fallback";
  el.textContent = (handle || "?").replace("@", "").slice(0, 1);
  return el;
}

/* --------------------------------------------------------------- features */

function requestFeature(row, button) {
  if (!row.feature.available) return;
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const request = {
    v: 2,
    type: MESSAGE_TYPES.FEATURE_REQUEST,
    requestId,
    windowId,
    tabId,
    documentToken: bound.token,
    sessionEpoch: bound.epoch,
    sourceId: row.feature.targetSourceId ?? row.primary.sourceId,
    targetSourceId: row.feature.targetSourceId ?? row.primary.sourceId,
    sourceRevision: row.feature.contentRevision ?? bound.revision,
    expiresAt: Date.now() + CONFIG.FEATURE_PROXY.requestExpiryMs,
  };
  button.disabled = true;
  pendingFeature.set(requestId, {
    resolve: (result) => {
      if (result.outcome === "refused") {
        button.disabled = false;
        button.title = L.featureFindNative;
      } else {
        // clicked or unknown: stay disabled until validated shown state returns.
        button.textContent = L.featureCheckBroadcast;
      }
    },
  });
  chrome.runtime.sendMessage(request, (result) => {
    const entry = pendingFeature.get(requestId);
    if (entry && result) {
      pendingFeature.delete(requestId);
      entry.resolve(result);
    }
  });
  setTimeout(() => {
    const entry = pendingFeature.get(requestId);
    if (!entry) return;
    // Never re-enable on an unknown outcome: a second click could toggle the
    // broadcast off. Ask the content session for the recorded outcome.
    entry.resolve({ outcome: "unknown", reasonCode: "featureCheckBroadcast" });
    try {
      port?.postMessage(
        makeEnvelope(MESSAGE_TYPES.ACTION_STATUS, { ...envelopeFields(), requestId })
      );
    } catch {
      port = null;
      tabId = null;
    }
    // Keep the entry briefly so a refused ACTION_STATUS can still re-enable.
    setTimeout(() => pendingFeature.delete(requestId), 5000);
  }, CONFIG.FEATURE_PROXY.ackTimeoutMs);
}

/* --------------------------------------------------------------- settings */

const SETTING_ROWS = [
  { key: STORAGE_KEYS.collapseDuplicates, label: L.settingCollapse },
  { key: STORAGE_KEYS.hideExtras, label: L.settingHideExtra },
  { key: STORAGE_KEYS.joinContinuations, label: L.settingJoin },
  { key: STORAGE_KEYS.hideGreetings, label: L.settingHideGreetings },
  { key: STORAGE_KEYS.llmEnabled, label: L.settingLlm },
];

async function loadPrefs() {
  const items = await chrome.storage.local.get(null);
  enabled = items[STORAGE_KEYS.enabled] !== false;
  masterEl.checked = enabled;
  for (const row of SETTING_ROWS) {
    const input = togglesEl.querySelector(`input[data-key="${row.key}"]`);
    if (input) input.checked = items[row.key] !== false;
  }
}

function renderSettings() {
  masterEl.addEventListener("change", () => {
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: masterEl.checked });
  });
  for (const row of SETTING_ROWS) {
    const wrap = document.createElement("div");
    wrap.className = "toggle-row";
    const label = document.createElement("span");
    label.className = "toggle-row__label";
    label.textContent = row.label;
    const toggle = document.createElement("label");
    toggle.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.key = row.key;
    input.checked = true;
    input.addEventListener("change", () => {
      chrome.storage.local.set({ [row.key]: input.checked });
    });
    const slider = document.createElement("span");
    toggle.append(input, slider);
    wrap.append(label, toggle);
    togglesEl.append(wrap);
  }
}

init().catch((err) => {
  console.error("Ṣafwa panel init failed", err);
});
