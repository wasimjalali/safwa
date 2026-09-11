#!/usr/bin/env node
/*
 * build-manifest.js - emits a packaged manifest.json (spec Section 2).
 *
 * Variants:
 *   legacy        the current v1 manifest.json, embedded verbatim
 *   v2            production v2: sidebar/SW build, ISOLATED content.js only
 *   v2-ws-log     v2 + MAIN ws-main.js and ISOLATED ws-bridge.js (log gate)
 *   v2-ws-enrich  same packaging as v2-ws-log (enrich gate)
 *   v2-ws-primary same packaging as v2-ws-log (primary gate)
 *
 * The WS variants differ only in packaging; WS_MODE is a runtime constant in
 * src/config.js, not a manifest field. "off" packages must not contain
 * src/ws-main.js or src/ws-bridge.js at all - that is what the v2 variant is.
 *
 * Usage:
 *   node tools/build-manifest.js [--variant <v>] [--out <path>] [--dry-run]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

const VARIANTS = ["legacy", "v2", "v2-ws-log", "v2-ws-enrich", "v2-ws-primary"];
const MATCHES = ["https://streamyard.com/*", "https://*.streamyard.com/*"];

/*
 * Current manifest.json, embedded verbatim (read 2026-09-11). This is the
 * `legacy` output and the source of the fields v2 keeps unchanged.
 */
const LEGACY_MANIFEST = {
  manifest_version: 3,
  name: "Ṣafwa - Live Q&A Filter",
  version: "1.0.5",
  description:
    "صفوة - cleans live Dari/Persian Q&A in StreamYard: collapses duplicates, merges splits, flags extra questions.",
  icons: {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
  action: {
    default_title: "Ṣafwa - Live Q&A Filter",
    default_popup: "popup/popup.html",
    default_icon: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    },
  },
  permissions: ["storage", "activeTab"],
  host_permissions: [
    "https://streamyard.com/*",
    "https://*.streamyard.com/*",
    "https://*.workers.dev/*",
  ],
  content_scripts: [
    {
      matches: MATCHES,
      js: ["src/content.js"],
      css: ["styles.css"],
      run_at: "document_idle",
    },
  ],
  web_accessible_resources: [
    {
      resources: ["src/*.js", "fonts/*"],
      matches: MATCHES,
    },
  ],
};

function buildContentScripts(variant) {
  if (variant === "v2") {
    return [
      {
        matches: MATCHES,
        js: ["src/content.js"],
        run_at: "document_start",
        world: "ISOLATED",
      },
    ];
  }
  return [
    {
      matches: MATCHES,
      js: ["src/ws-main.js"],
      run_at: "document_start",
      world: "MAIN",
    },
    {
      matches: MATCHES,
      js: ["src/ws-bridge.js", "src/content.js"],
      run_at: "document_start",
      world: "ISOLATED",
    },
  ];
}

function buildV2(variant) {
  return {
    manifest_version: 3,
    name: LEGACY_MANIFEST.name,
    version: "2.0.0",
    description: LEGACY_MANIFEST.description,
    minimum_chrome_version: "116",
    icons: LEGACY_MANIFEST.icons,
    background: { service_worker: "src/sw.js", type: "module" },
    side_panel: { default_path: "panel/panel.html" },
    permissions: ["storage", "activeTab", "sidePanel"],
    action: {
      default_title: LEGACY_MANIFEST.action.default_title,
      default_icon: LEGACY_MANIFEST.action.default_icon,
    },
    host_permissions: LEGACY_MANIFEST.host_permissions,
    content_scripts: buildContentScripts(variant),
    web_accessible_resources: LEGACY_MANIFEST.web_accessible_resources,
  };
}

function usage() {
  return [
    "Usage: node tools/build-manifest.js [--variant <v>] [--out <path>] [--dry-run]",
    `  --variant  ${VARIANTS.join(" | ")} (default: v2)`,
    "  --out      output path (default: manifest.json)",
    "  --dry-run  print the manifest, write nothing",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { variant: "v2", out: "manifest.json", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    let name = arg;
    let value = null;
    const eq = arg.indexOf("=");
    if (arg.startsWith("--") && eq !== -1) {
      name = arg.slice(0, eq);
      value = arg.slice(eq + 1);
    }
    if (name === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (name === "--variant" || name === "--out") {
      const next = value !== null ? value : argv[i + 1];
      if (typeof next !== "string" || next.length === 0 || next.startsWith("--")) {
        throw new Error(`missing value for ${name}\n${usage()}`);
      }
      if (value === null) i += 1;
      if (name === "--variant") args.variant = next;
      else args.out = next;
      continue;
    }
    throw new Error(`unknown argument: ${arg}\n${usage()}`);
  }
  if (!VARIANTS.includes(args.variant)) {
    throw new Error(`unknown variant: ${args.variant}\n${usage()}`);
  }
  return args;
}

const VARIANT_MODES = {
  legacy: { panel: "v1-inline", ws: null },
  v2: { panel: "sidebar", ws: "off" },
  "v2-ws-log": { panel: "sidebar", ws: "log" },
  "v2-ws-enrich": { panel: "sidebar", ws: "enrich" },
  "v2-ws-primary": { panel: "sidebar", ws: "primary" },
};

function checkConfigPairing(variant) {
  const want = VARIANT_MODES[variant];
  if (!want) return;
  const src = readFileSync(new URL("../src/config.js", import.meta.url), "utf8");
  const panelMatch = src.match(/PANEL_MODE:\s*"([^"]+)"/);
  const wsMatch = src.match(/WS_MODE:\s*"([^"]+)"/);
  const panel = panelMatch ? panelMatch[1] : "?";
  const ws = wsMatch ? wsMatch[1] : "?";
  const ok =
    panel === want.panel && (want.ws === null || ws === want.ws);
  if (!ok) {
    console.error(
      `manifest/config mismatch for --variant ${variant}: src/config.js has ` +
        `PANEL_MODE="${panel}" WS_MODE="${ws}", expected ` +
        `PANEL_MODE="${want.panel}"${want.ws === null ? "" : ` WS_MODE="${want.ws}"`}. ` +
        `Edit src/config.js to match before packaging.`
    );
    process.exit(2);
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  checkConfigPairing(args.variant);
  const manifest = args.variant === "legacy" ? LEGACY_MANIFEST : buildV2(args.variant);
  const json = `${JSON.stringify(manifest, null, 2)}\n`;

  if (!args.dryRun) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, json, "utf8");
  }

  console.log(`variant: ${args.variant}`);
  console.log(`out: ${args.out}${args.dryRun ? " (dry-run, not written)" : ""}`);
  if (args.dryRun) console.log(json.trimEnd());
}

main();
