/*
 * panel.js - the Ṣafwa sidebar renderer (spec Section 6). Pure view: it never
 * touches StreamYard's DOM. It renders pushed snapshots/patches from the
 * content session and sends teacher actions through the validated
 * feature-proxy path.
 */

import { CONFIG, STORAGE_KEYS } from "../src/config.js";
import { isStreamYardUrl, readPinnedTabId } from "../src/inject.js";
import { platformIcon, statusLine } from "../src/panel-model.js";
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
const feedback = document.getElementById("feedback");
const versionEl = document.getElementById("version");

const bound = { token: null, epoch: null, revision: 0 };
const model = new Map();
const rowEls = new Map();
let folded = [];
let port = null;
let tabId = null;
let windowId = null;
let boundTab = false;
let historyStartId = null;
let pageNavigation = false;
let lastRowIds = [];
let enabled = true;
let lastHealth = { observer: "ok", wsState: "off" };
let lastHealthAt = Date.now();
let savedScrollTop = 0;
const pendingFeature = new Map();
let bindingGeneration = 0;
let snapshotModel = null;
let pendingReset = null;
let connected = false;

document.querySelector(".head__title").textContent = L.panelTitle;
document.querySelector(".filter__label").textContent = L.filterLabel;
document.getElementById("reset").textContent = L.resetSession;
document.getElementById("new-items").textContent = L.panelNewItems;
document.getElementById("gear").setAttribute("aria-label", L.settingsHeading);
document.getElementById("list").removeAttribute("aria-live");
document.getElementById("status").setAttribute("aria-live", "polite");
masterEl.setAttribute("aria-label", L.filterLabel);
reset.disabled = true;

function showFeedback(text, error = false) {
  feedback.textContent = text;
  feedback.hidden = !text;
  feedback.classList.toggle("feedback--error", error);
  feedback.setAttribute("role", error ? "alert" : "status");
}

function finishReset(ok) {
  if (pendingReset) clearTimeout(pendingReset.timer);
  pendingReset = null;
  reset.disabled = !connected;
  reset.textContent = L.resetSession;
  reset.removeAttribute("aria-busy");
  showFeedback(ok ? L.resetDone : L.resetFailed, !ok);
}

function requestReset() {
  if (pendingReset) return;
  if (!port || !boundTab || !connected) { finishReset(false); return; }
  const requestId = crypto.randomUUID();
  pendingReset = { requestId, timer: setTimeout(() => finishReset(false), 5000) };
  reset.disabled = true;
  reset.textContent = L.resetting;
  reset.setAttribute("aria-busy", "true");
  showFeedback(L.resetting);
  try {
    port.postMessage(makeEnvelope(MESSAGE_TYPES.RESET_SESSION, { ...envelopeFields(), requestId }));
  } catch {
    finishReset(false);
  }
}

function wireUi() {
  gear.addEventListener("click", () => {
    // One button, both ways: the gear opens and closes the settings view.
    const opening = settings.hidden;
    if (opening) savedScrollTop = list.scrollTop;
    settings.hidden = !opening;
    list.hidden = opening || !enabled;
    gear.setAttribute("aria-expanded", String(opening));
    newItems.hidden = opening || !enabled || (historyStartId === null && nearEnd());
    if (!opening) list.scrollTop = savedScrollTop;
  });
  gear.setAttribute("aria-expanded", "false");
  reset.addEventListener("click", requestReset);
  newItems.addEventListener("click", () => {
    historyStartId = null;
    pageNavigation = true;
    render();
    list.scrollTo({ top: list.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    newItems.hidden = true;
  });
  list.addEventListener("scroll", () => {
    if (historyStartId === null && nearEnd()) newItems.hidden = true;
    list.classList.add("is-scrolling");
    clearTimeout(list.__scrollIdle);
    list.__scrollIdle = setTimeout(() => list.classList.remove("is-scrolling"), 700);
  });
}

async function init() {
  versionEl.textContent = `${L.versionLabel} ${chrome.runtime.getManifest().version}`;
  app.hidden = false;
  document.getElementById("static-failure").hidden = true;
  setStatus(L.panelLoading);
  renderSettings();
  wireUi(); // UI reacts before any chrome API await
  try { await loadPrefs(); }
  catch (err) { showFeedback(L.settingsFailed, true); console.error("[Ṣafwa] preferences unavailable", err); }
  await bindTab();
  chrome.tabs?.onActivated?.addListener(() => bindTab());
  chrome.tabs?.onUpdated?.addListener((id, info) => {
    if (id === tabId && (info.status === "loading" || info.url)) {
      bindingGeneration += 1;
      detach();
    }
    if (info.status === "complete") bindTab().catch(() => scheduleRebind());
  });
  chrome.windows?.onFocusChanged?.addListener(() => bindTab());
  setInterval(() => {
    if (!port || Date.now() - lastHealthAt < 4000) return;
    connected = false;
    reset.disabled = true;
    render();
    setStatus(L.panelDisconnected);
    try {
      port.postMessage(makeEnvelope(MESSAGE_TYPES.RESYNC, envelopeFields()));
    } catch {
      detach({ connectionLost: true });
      scheduleRebind();
    }
    lastHealthAt = Date.now();
  }, CONFIG.PANEL.healthIntervalMs);
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if (STORAGE_KEYS.enabled in changes) {
      enabled = changes[STORAGE_KEYS.enabled].newValue !== false;
      masterEl.checked = enabled;
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
let rebindTimer = 0;
function scheduleRebind() {
  if (rebindTimer) return;
  rebindAttempts += 1;
  const delay = rebindAttempts <= 1 ? 100 : rebindAttempts === 2 ? 500 : rebindAttempts === 3 ? 1500 : 5000;
  rebindTimer = setTimeout(() => {
    rebindTimer = 0;
    bindTab().catch(() => scheduleRebind());
  }, delay);
}

function detach({ connectionLost = false } = {}) {
  const oldPort = port;
  port = null;
  connected = false;
  boundTab = false;
  bound.token = null;
  bound.epoch = null;
  bound.revision = 0;
  snapshotModel = null;
  pendingFeature.clear();
  if (pendingReset) {
    clearTimeout(pendingReset.timer);
    pendingReset = null;
    reset.textContent = L.resetSession;
    reset.removeAttribute("aria-busy");
    showFeedback(connectionLost ? L.resetUnconfirmed : "", connectionLost);
  }
  reset.disabled = true;
  model.clear();
  rowEls.clear();
  folded = [];
  lastRowIds = [];
  historyStartId = null;
  pageNavigation = false;
  list.replaceChildren();
  newItems.hidden = true;
  oldPort?.disconnect();
}

async function bindTab() {
  const generation = ++bindingGeneration;
  const pinned = readPinnedTabId(globalThis.location?.search ?? "");
  let tab = null;
  try {
    if (typeof pinned === "number") tab = await chrome.tabs.get(pinned);
    else {
      const win = await chrome.windows.getCurrent();
      [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    }
  } catch { tab = null; }
  if (generation !== bindingGeneration) return;
  if (!tab || !isStreamYardUrl(tab.url ?? "")) {
    detach();
    setStatus(L.panelOpenStudio);
    return;
  }
  if (port && tabId === tab.id) return;
  detach();
  const ready = await tabHasSession(tab.id);
  if (generation !== bindingGeneration) return;
  if (!ready) {
    chrome.runtime.sendMessage({ type: "safwa-ensure", tabId: tab.id }, () => {
      void chrome.runtime.lastError;
    });
    setStatus(L.panelLoading);
    scheduleRebind();
    return;
  }
  tabId = tab.id;
  windowId = tab.windowId;
  const nextPort = chrome.tabs.connect(tab.id, { name: PORT_NAME, frameId: 0 });
  port = nextPort;
  nextPort.onMessage.addListener((message) => {
    if (port === nextPort) onPortMessage(message);
  });
  nextPort.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    if (port !== nextPort) return;
    detach({ connectionLost: true });
    setStatus(L.panelDisconnected);
    scheduleRebind();
  });
  nextPort.postMessage(makeEnvelope(MESSAGE_TYPES.SUBSCRIBE, { documentToken: null, sessionEpoch: null }));
  setStatus(L.panelLoading);
  rebindAttempts = 0;
}

function tabHasSession(id) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(id, { type: "safwa-ping" }, (res) => {
        resolve(!chrome.runtime.lastError && res?.ok === true);
      });
    } catch {
      resolve(false);
    }
  });
}

function isForThisSession(message) {
  if (!boundTab) return true;
  return message.documentToken === bound.token && message.sessionEpoch === bound.epoch;
}

function onPortMessage(message) {
  if (!message || message.v !== 2) return;
  if (message.type === MESSAGE_TYPES.RESET_RESULT) {
    if (pendingReset?.requestId === message.requestId && message.documentToken === bound.token) {
      finishReset(message.ok === true);
    }
    return;
  }
  if (message.type !== MESSAGE_TYPES.SNAPSHOT_BEGIN && !isForThisSession(message)) return;
  switch (message.type) {
    case MESSAGE_TYPES.SNAPSHOT_BEGIN:
      if (bound.token && message.documentToken !== bound.token) return;
      bound.token = message.documentToken;
      bound.epoch = message.sessionEpoch;
      boundTab = true;
      connected = false;
      snapshotModel = { rows: new Map(), revision: message.revision, expected: message.expectedRows };
      reset.disabled = true;
      break;
    case MESSAGE_TYPES.SNAPSHOT_CHUNK:
      if (!snapshotModel || message.revision !== snapshotModel.revision) return;
      for (const row of message.rows ?? []) snapshotModel.rows.set(row.rowId, row);
      break;
    case MESSAGE_TYPES.SNAPSHOT_END:
      if (!snapshotModel || message.revision !== snapshotModel.revision ||
          message.rowCount !== snapshotModel.rows.size || message.rowCount !== snapshotModel.expected) {
        port?.postMessage(makeEnvelope(MESSAGE_TYPES.RESYNC, envelopeFields()));
        return;
      }
      model.clear();
      for (const [id, row] of snapshotModel.rows) model.set(id, row);
      snapshotModel = null;
      bound.revision = message.revision;
      folded = message.folded ?? [];
      connected = true;
      lastHealthAt = Date.now();
      reset.disabled = !!pendingReset;
      render();
      paintEnabledState();
      break;
    case MESSAGE_TYPES.PATCH: {
      if (snapshotModel || message.baseRevision !== bound.revision || message.revision <= bound.revision) {
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
      connected = boundTab && !snapshotModel;
      reset.disabled = !connected || !!pendingReset;
      lastHealth = { observer: message.observer ?? "ok", wsState: message.wsState ?? "off" };
      if (message.settingsError) showFeedback(L.settingsFailed, true);
      else if (message.llmUnavailable) showFeedback(L.llmUnavailable, true);
      enabled = message.enabled !== false;
      masterEl.checked = enabled;
      paintStatus();
      paintEnabledState();
      render();
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
  const next = text ?? "";
  statusEl.textContent = next;
  statusEl.hidden = !next;
}

function paintStatus() {
  const key = statusLine({
    observer: lastHealth.observer,
    wsState: lastHealth.wsState,
    enabled,
  });
  setStatus(key ? L[key] : "");
}

function paintEnabledState() {
  list.hidden = !enabled || !settings.hidden;
  if (list.hidden) newItems.hidden = true;
  if (connected) paintStatus();
}

/* ------------------------------------------------------------------ render */

function render() {
  const rows = [...model.values()].sort((a, b) => a.index - b.index);
  const wasNearEnd = nearEnd();
  // Freeze a bounded page while reading. New arrivals remain reachable through
  // the latest button without growing the mounted history indefinitely.
  if (!pageNavigation && historyStartId === null && !wasNearEnd && lastRowIds.length) {
    historyStartId = lastRowIds[0];
  }
  const pageSize = CONFIG.PANEL.maxMountedRows;
  const savedStart = rows.findIndex((row) => row.rowId === historyStartId);
  const start = savedStart >= 0 ? savedStart : Math.max(0, rows.length - pageSize);
  if (savedStart < 0) historyStartId = null;
  const visible = rows.slice(start, start + pageSize);
  const end = start + visible.length;
  const newIds = visible.map((r) => r.rowId);
  const prevScroll = list.scrollTop;
  const readingAnchor = [...list.children].find((el) => el.dataset.rowId &&
    el.getBoundingClientRect().bottom > list.getBoundingClientRect().top);
  const anchorTop = readingAnchor?.getBoundingClientRect().top;

  if (rows.length === 0 && folded.length === 0) {
    list.replaceChildren(emptyNode(L.panelWaiting));
    lastRowIds = [];
    historyStartId = null;
    pageNavigation = false;
    newItems.hidden = true;
    return;
  }

  const desired = [];
  const frag = { append: (el) => desired.push(el) };
  if (start > 0) {
    frag.append(historyButton(`${L.panelOlder} (${start})`, () => {
      historyStartId = rows[Math.max(0, start - pageSize)].rowId;
      pageNavigation = true;
      render();
    }, "older"));
  }

  for (const row of visible) {
    const key = rowKey(row);
    const existing = rowEls.get(row.rowId);
    if (existing && existing.__key === key) {
      frag.append(existing);
      continue;
    }
    const countOpen = !!(existing && existing.querySelector?.("details.count")?.open);
    const el = renderRow(row, { countOpen, memberOffset: Number(existing?.querySelector(".count__list")?.dataset.offset || 0) });
    el.querySelector(".air").disabled ||= !connected || !enabled;
    el.__key = key;
    rowEls.set(row.rowId, el);
    frag.append(el);
  }
  const visibleIds = new Set(visible.map((r) => r.rowId));
  for (const id of [...rowEls.keys()]) {
    if (!model.has(id) || !visibleIds.has(id)) rowEls.delete(id);
  }

  if (end < rows.length) {
    frag.append(historyButton(`${L.panelNewer} (${rows.length - end})`, () => {
      const nextStart = Math.min(start + pageSize, Math.max(0, rows.length - pageSize));
      historyStartId = nextStart + pageSize >= rows.length ? null : rows[nextStart].rowId;
      pageNavigation = true;
      render();
    }, "newer"));
  }

  if (folded.length > 0) {
    const details = document.createElement("details");
    details.className = "folded";
    details.open = list.querySelector("details.folded")?.open === true;
    const summary = document.createElement("summary");
    summary.textContent = `${L.panelFolded} (${folded.length})`;
    details.append(summary);
    const items = document.createElement("div");
    items.className = "folded__list";
    fillPagedItems(items, folded, Number(list.querySelector(".folded__list")?.dataset.offset || 0), "folded__item");
    details.append(items);
    frag.append(details);
  }

  // Reconcile in place so unchanged cards keep keyboard focus and disclosures.
  desired.forEach((el, index) => {
    if (list.children[index] !== el) list.insertBefore(el, list.children[index] ?? null);
  });
  while (list.children.length > desired.length) list.lastElementChild.remove();
  lastRowIds = newIds;

  if (pageNavigation) {
    list.scrollTop = historyStartId === null ? list.scrollHeight : 0;
  } else if (historyStartId === null && wasNearEnd) {
    list.scrollTop = list.scrollHeight;
  } else if (readingAnchor?.isConnected) {
    list.scrollTop = prevScroll + readingAnchor.getBoundingClientRect().top - anchorTop;
  } else {
    list.scrollTop = prevScroll;
  }
  pageNavigation = false;
  newItems.hidden = !settings.hidden || !enabled || (end >= rows.length && nearEnd());
}

function historyButton(label, onClick, direction) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "new-items history-page";
  button.dataset.direction = direction;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function fillPagedItems(container, items, offset, className) {
  const size = CONFIG.PANEL.maxMountedRows;
  const start = Math.max(0, Math.min(offset, Math.max(0, items.length - 1)));
  container.dataset.offset = start;
  container.replaceChildren();
  if (start > 0) container.append(historyButton(L.panelOlder,
    () => fillPagedItems(container, items, Math.max(0, start - size), className), "older"));
  for (const item of items.slice(start, start + size)) {
    const div = document.createElement("div");
    div.className = className;
    div.dir = "auto";
    div.textContent = `${item.handle} - ${item.displayText}`;
    container.append(div);
  }
  if (start + size < items.length) container.append(historyButton(L.panelNewer,
    () => fillPagedItems(container, items, start + size, className), "newer"));
}

function emptyNode(text) {
  const el = document.createElement("div");
  el.className = "empty";
  el.textContent = text;
  return el;
}

function rowKey(row) {
  return JSON.stringify([
    row.primary,
    connected,
    enabled,
    row.badges,
    row.feature,
    row.shown,
    row.starred,
    row.joinedFragments ?? null,
    row.members ?? null,
    row.index ?? null,
  ]);
}

const AIR_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M10 9.5v5l5-2.5-5-2.5z" fill="currentColor" stroke="none"></path></svg>';
const COUNT_TRI =
  '<svg class="tri" viewBox="0 0 10 10" aria-hidden="true"><path d="M7.8 1.1v7.8L1.6 5z" fill="currentColor"/></svg>';

export function renderRow(row, options = {}) {
  const wrap = document.createElement("article");
  wrap.className = "row";
  wrap.dataset.rowId = row.rowId;
  if (row.badges?.joined) wrap.classList.add("row--joined");
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

  const body = document.createElement("div");
  body.className = "row__body";

  const meta = document.createElement("div");
  meta.className = "row__meta";
  const handle = document.createElement("span");
  handle.className = "row__handle";
  handle.setAttribute("dir", "auto");
  handle.textContent = row.primary.handle;
  meta.append(handle);
  if (row.badges?.joined) meta.append(chipOf("chip--part", L.joinedParts ?? L.joined));
  if (row.badges?.nthQuestionLabel || row.badges?.secondQuestion) {
    meta.append(chipOf("chip--second", row.badges.nthQuestionLabel || L.secondQuestion));
  }
  if (row.starred === "on") meta.append(chipOf("chip--star", L.featureStarred));
  body.append(meta);

  const parts = document.createElement("div");
  parts.className = row.badges?.joined ? "row__parts" : "";
  const text = document.createElement("div");
  text.className = "row__text";
  text.dir = "auto";
  text.textContent = row.primary.displayText;
  parts.append(text);
  if (Array.isArray(row.joinedFragments)) {
    for (const frag of row.joinedFragments) {
      if (frag.sourceId === row.primary.sourceId) continue;
      const el = document.createElement("div");
      el.className = "row__text row__text--part";
      el.dir = "auto";
      el.textContent = frag.displayText;
      parts.append(el);
    }
  }
  body.append(parts);

  if (Array.isArray(row.members) && row.members.length > 1) {
    const details = document.createElement("details");
    details.className = "count";
    if (options.countOpen) details.open = true;
    const summary = document.createElement("summary");
    const chip = document.createElement("span");
    chip.className = "chip chip--count";
    const tri = document.createElement("span");
    tri.className = "tri-wrap";
    tri.innerHTML = COUNT_TRI;
    const label = document.createElement("span");
    label.textContent = row.badges?.countLabel ?? "";
    chip.append(tri, label);
    summary.append(chip);
    details.append(summary);
    const listEl = document.createElement("div");
    listEl.className = "count__list";
    fillPagedItems(listEl, row.members.filter((member) => member.sourceId !== row.primary.sourceId),
      options.memberOffset || 0, "count__item");
    details.append(listEl);
    body.append(details);
  }

  const rail = document.createElement("div");
  rail.className = "row__rail";
  const feature = document.createElement("button");
  feature.type = "button";
  feature.className = row.shown === "on" ? "air is-on" : "air";
  feature.innerHTML = AIR_ICON;
  const onAir = row.shown === "on";
  feature.setAttribute(
    "aria-label",
    onAir ? L.featureOnAir : (L[row.feature?.labelKey] ?? L.featureShow)
  );
  feature.disabled = !row.feature?.available || row.shown === "pending";
  if (!row.feature?.available) feature.title = L.featureFindNative;
  feature.addEventListener("click", () => requestFeature(row, feature));
  const num = document.createElement("span");
  num.className = "num";
  num.textContent = row.indexLabel ?? "";
  rail.append(feature, num);

  wrap.append(avatarWrap, body, rail);
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
  if (!row.feature.available || !connected || !boundTab || !enabled || !port) {
    showFeedback(L.featureFindNative, true);
    return;
  }
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
        button.disabled = !row.feature.available || !connected || !enabled;
        showFeedback(L.featureFindNative, true);
        button.title = L.featureFindNative;
        button.setAttribute("aria-label", L[row.feature.labelKey] ?? L.featureShow);
      } else {
        // Stay disabled until the next projection flips availability.
        button.setAttribute("aria-label", L.featureCheckBroadcast);
        showFeedback(result.outcome === "unknown" ? L.featureCheckBroadcast : L.featureClicked,
          result.outcome === "unknown");
      }
    },
  });
  chrome.runtime.sendMessage(request, (result) => {
    const error = chrome.runtime.lastError;
    const entry = pendingFeature.get(requestId);
    if (error && entry) entry.resolve({ outcome: "unknown" });
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
      detach({ connectionLost: true });
      scheduleRebind();
    }
    // Keep the entry briefly so a refused ACTION_STATUS can still re-enable.
    setTimeout(() => pendingFeature.delete(requestId), 5000);
  }, CONFIG.FEATURE_PROXY.ackTimeoutMs);
}

/* --------------------------------------------------------------- settings */

const SETTING_ROWS = [
  { key: STORAGE_KEYS.collapseDuplicates, label: L.settingCollapse, help: "settingCollapse" },
  { key: STORAGE_KEYS.hideExtras, label: L.settingHideExtra, help: "settingHideExtra" },
  { key: STORAGE_KEYS.joinContinuations, label: L.settingJoin, help: "settingJoin" },
  { key: STORAGE_KEYS.hideGreetings, label: L.settingHideGreetings, help: "settingHideGreetings" },
  { key: STORAGE_KEYS.llmEnabled, label: L.settingLlm, help: "settingLlm" },
];

async function loadPrefs() {
  const items = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  enabled = items[STORAGE_KEYS.enabled] !== false;
  masterEl.checked = enabled;
  for (const row of SETTING_ROWS) {
    const input = togglesEl.querySelector(`input[data-key="${row.key}"]`);
    if (input) input.checked = items[row.key] !== false;
  }
  paintEnabledState();
}

async function savePreference(input, key) {
  const value = input.checked;
  input.disabled = true;
  try {
    await chrome.storage.local.set({ [key]: value });
    showFeedback("");
  } catch (err) {
    input.checked = !value;
    showFeedback(L.settingsFailed, true);
    console.error("[Ṣafwa] preference save failed", err);
  } finally {
    input.disabled = false;
  }
}

function renderSettings() {
  masterEl.addEventListener("change", () => {
    savePreference(masterEl, STORAGE_KEYS.enabled);
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
    input.setAttribute("aria-label", row.label);
    input.checked = true;
    input.addEventListener("change", () => {
      savePreference(input, row.key);
    });
    const slider = document.createElement("span");
    toggle.append(input, slider);
    const help = document.createElement("button");
    help.type = "button";
    help.className = "setting-help";
    help.textContent = "؟";
    help.setAttribute("aria-label", `${L.settingHelp}: ${row.label}`);
    help.setAttribute("aria-expanded", "false");
    const explanation = document.createElement("div");
    explanation.id = `help-${row.key}`;
    explanation.className = "setting-explanation";
    explanation.hidden = true;
    help.setAttribute("aria-controls", explanation.id);
    for (const [suffix, title] of [["On", L.settingOn], ["Off", L.settingOff]]) {
      const paragraph = document.createElement("p");
      const heading = document.createElement("strong");
      heading.textContent = `${title}: `;
      const value = L[`${row.help}${suffix}`];
      paragraph.append(heading, document.createTextNode(Array.isArray(value) ? value.join(" ") : value));
      explanation.append(paragraph);
    }
    help.addEventListener("click", () => {
      explanation.hidden = !explanation.hidden;
      help.setAttribute("aria-expanded", String(!explanation.hidden));
    });
    wrap.append(label, help, toggle);
    togglesEl.append(wrap, explanation);
  }
}

init().catch((err) => {
  document.getElementById("static-failure").hidden = false;
  showFeedback(L.panelDisconnected, true);
  console.error("Ṣafwa panel init failed", err);
});
