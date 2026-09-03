/*
 * popup.js - wires the on/off switch to chrome.storage.local. The content
 * script listens for the change and applies it to the live feed instantly.
 *
 * Fail-safe: when chrome.storage is unavailable (e.g. the file is previewed
 * over plain http for a screenshot), the switch still works visually but
 * nothing is persisted, and one clear warning says so.
 */

import { CONFIG, STORAGE_KEYS } from "../src/config.js";

const L = CONFIG.LABELS;
const toggle = document.getElementById("toggle");
const hint = document.getElementById("hint");

document.getElementById("tagline").textContent = L.popupTagline;
document.getElementById("footer-label").textContent = L.popupFooter;
document.getElementById("version").textContent = `v${
  globalThis.chrome?.runtime?.getManifest?.().version ?? "?"
}`;

const hasStorage =
  typeof chrome !== "undefined" && !!chrome.storage?.local;

function paint(enabled) {
  toggle.setAttribute("aria-checked", String(enabled));
  toggle.setAttribute("aria-label", enabled ? L.popupStatusOn : L.popupStatusOff);
  const text = enabled ? L.popupHintOn : L.popupHintOff;
  if (hint.textContent === text) return;
  // Brief crossfade so the hint change reads as a response to the click,
  // not a flicker. Skipped on first paint (no text yet).
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

let enabled = true;
// Set the moment the operator clicks. The async storage read below can resolve
// AFTER that click; without this guard it would clobber the fresh choice with
// the stale stored value.
let userToggled = false;

if (hasStorage) {
  chrome.storage.local.get(STORAGE_KEYS.enabled).then(
    (items) => {
      if (userToggled) return; // the operator already chose; don't override
      enabled = items[STORAGE_KEYS.enabled] !== false; // default: enabled
      paint(enabled);
    },
    // Rejection handler only (not a chained catch), so an exception inside
    // paint() above can't trigger a second paint call here.
    () => {
      if (userToggled) return;
      console.warn("[Ṣafwa] could not read the saved state; showing enabled.");
      paint(enabled);
    }
  );
} else {
  console.warn(
    "[Ṣafwa] chrome.storage unavailable (preview mode); the switch is not persisted."
  );
  paint(enabled);
}

toggle.addEventListener("click", () => {
  userToggled = true;
  enabled = !enabled;
  paint(enabled);
  if (hasStorage) {
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: enabled });
  }
});
