/*
 * popup.js - master on/off, teacher settings, Dari help on each row.
 * State lives in chrome.storage.local; the content script listens and rebuilds.
 */

import { CONFIG, STORAGE_KEYS, readStoredSettings } from "../src/config.js";

const L = CONFIG.LABELS;
const HELP_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.6c0-1.15.95-2.05 2.1-2.05S12.2 6.45 12.2 7.6c0 .85-.5 1.4-1.25 1.8-.7.35-1.05.7-1.05 1.45" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="14.15" r="0.85" fill="currentColor"/></svg>`;

const toggle = document.getElementById("toggle");
const hint = document.getElementById("hint");
const list = document.getElementById("settings-list");
const resetBtn = document.getElementById("reset");
const resetHelp = document.querySelector('[data-help="reset"]');
const resetExplain = document.getElementById("explain-reset");
const resetStatus = document.getElementById("reset-status");

document.getElementById("tagline").textContent = L.popupTagline;
document.getElementById("settings-heading").textContent = L.settingsHeading;
document.getElementById("footer-label").textContent = L.popupFooter;
document.getElementById("version").textContent = `v${
  globalThis.chrome?.runtime?.getManifest?.().version ?? "?"
}`;
resetBtn.textContent = L.resetSession;
resetHelp.innerHTML = HELP_ICON;
resetHelp.setAttribute("aria-label", L.settingHelp);
fillExplain(resetExplain, L.settingWhat, L.resetWhat, L.settingNot, L.resetNot);

const SETTING_ROWS = [
  {
    storageKey: STORAGE_KEYS.collapseDuplicates,
    field: "collapseDuplicates",
    label: L.settingCollapse,
    on: L.settingCollapseOn,
    off: L.settingCollapseOff,
  },
  {
    storageKey: STORAGE_KEYS.hideExtras,
    field: "hideExtras",
    label: L.settingHideExtra,
    on: L.settingHideExtraOn,
    off: L.settingHideExtraOff,
  },
  {
    storageKey: STORAGE_KEYS.joinContinuations,
    field: "joinContinuations",
    label: L.settingJoin,
    on: L.settingJoinOn,
    off: L.settingJoinOff,
  },
  {
    storageKey: STORAGE_KEYS.llmEnabled,
    field: "llmEnabled",
    label: L.settingLlm,
    on: L.settingLlmOn,
    off: L.settingLlmOff,
  },
];

function fillExplain(el, k1, t1, k2, t2) {
  el.replaceChildren();
  for (const [k, t] of [
    [k1, t1],
    [k2, t2],
  ]) {
    const texts = Array.isArray(t) ? t : [t];
    for (let i = 0; i < texts.length; i++) {
      const p = document.createElement("p");
      if (i === 0) {
        const key = document.createElement("span");
        key.className = "explain__k";
        key.textContent = k;
        p.append(key);
      }
      p.append(document.createTextNode(texts[i]));
      el.append(p);
    }
  }
}

function paintMaster(enabled) {
  toggle.setAttribute("aria-checked", String(enabled));
  toggle.setAttribute("aria-label", enabled ? L.popupStatusOn : L.popupStatusOff);
  const text = enabled ? L.popupHintOn : L.popupHintOff;
  if (hint.textContent === text) return;
  if (hint.textContent) {
    hint.classList.add("is-swapping");
    setTimeout(() => {
      hint.textContent = text;
      hint.classList.remove("is-swapping");
    }, 150);
  } else {
    hint.textContent = text;
  }
}

function paintSwitch(button, on) {
  button.setAttribute("aria-checked", String(on));
}

function closeExplains(exceptId) {
  for (const panel of document.querySelectorAll(".explain")) {
    if (panel.id === exceptId) continue;
    panel.hidden = true;
  }
  for (const btn of document.querySelectorAll(".help")) {
    if (btn.getAttribute("aria-controls") === exceptId) continue;
    btn.setAttribute("aria-expanded", "false");
  }
}

function toggleExplain(button) {
  const id = button.getAttribute("aria-controls");
  const panel = document.getElementById(id);
  if (!panel) return;
  const open = button.getAttribute("aria-expanded") === "true";
  closeExplains(open ? null : id);
  button.setAttribute("aria-expanded", String(!open));
  panel.hidden = open;
}

function buildRow(spec) {
  const wrap = document.createElement("div");
  wrap.className = "setting";

  const row = document.createElement("div");
  row.className = "setting__row";

  const label = document.createElement("span");
  label.className = "setting__label";
  label.id = `${spec.field}-label`;
  label.textContent = spec.label;

  const help = document.createElement("button");
  help.type = "button";
  help.className = "help";
  help.innerHTML = HELP_ICON;
  help.setAttribute("aria-label", L.settingHelp);
  help.setAttribute("aria-expanded", "false");
  help.setAttribute("aria-controls", `explain-${spec.field}`);

  const sw = document.createElement("button");
  sw.type = "button";
  sw.className = "switch switch--row";
  sw.id = spec.field;
  sw.setAttribute("role", "switch");
  sw.setAttribute("aria-labelledby", `${spec.field}-label`);
  sw.innerHTML = '<span class="switch__knob"></span>';
  paintSwitch(sw, true);

  const explain = document.createElement("div");
  explain.className = "explain";
  explain.id = `explain-${spec.field}`;
  explain.hidden = true;
  fillExplain(explain, L.settingOn, spec.on, L.settingOff, spec.off);

  help.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleExplain(help);
  });
  sw.addEventListener("click", () => {
    const next = sw.getAttribute("aria-checked") !== "true";
    paintSwitch(sw, next);
    if (hasStorage) chrome.storage.local.set({ [spec.storageKey]: next });
  });

  row.append(label, help, sw);
  wrap.append(row, explain);
  return { wrap, switchEl: sw, spec };
}

const rows = SETTING_ROWS.map(buildRow);
for (const row of rows) list.appendChild(row.wrap);

resetHelp.addEventListener("click", () => toggleExplain(resetHelp));

const hasStorage = typeof chrome !== "undefined" && !!chrome.storage?.local;
let userToggled = false;
let enabled = true;
paintMaster(true);

if (hasStorage) {
  chrome.storage.local.get(null).then(
    (items) => {
      if (!userToggled) {
        enabled = readStoredSettings(items).enabled;
        paintMaster(enabled);
      }
      const settings = readStoredSettings(items);
      for (const row of rows) paintSwitch(row.switchEl, settings[row.spec.field]);
    },
    () => {
      if (!userToggled) paintMaster(enabled);
    }
  );
} else {
  console.warn("[Ṣafwa] chrome.storage unavailable (preview mode); switches are not persisted.");
  paintMaster(enabled);
}

toggle.addEventListener("click", () => {
  userToggled = true;
  enabled = !enabled;
  paintMaster(enabled);
  if (hasStorage) chrome.storage.local.set({ [STORAGE_KEYS.enabled]: enabled });
});

resetBtn.addEventListener("click", () => {
  if (hasStorage) chrome.storage.local.set({ [STORAGE_KEYS.resetAt]: Date.now() });
  resetStatus.hidden = false;
  resetStatus.textContent = L.resetDone;
  setTimeout(() => {
    resetStatus.hidden = true;
  }, 2500);
});
