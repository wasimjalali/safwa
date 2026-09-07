/*
 * dom-discovery-console.js - the recovery tool for the day StreamYard changes
 * their markup and SELECTORS in src/config.js go stale (fail-safe kicks in, the
 * feed renders native, one clear [Safwa] console warning).
 *
 * HOW TO USE
 *   1. Open the StreamYard studio in Chrome with the Comments panel showing
 *      at least a few real comments.
 *   2. Open DevTools console (Cmd+Option+I), paste this whole file, Enter.
 *   3. It READS ONLY (touches nothing) and prints JSON with candidate
 *      selectors: container, row (commentNode), text, author, platform icon.
 *   4. Translate the JSON into the five SELECTORS strings in src/config.js
 *      (keep the multi-candidate comma style: data-testid first, classes
 *      second), reload the extension, confirm the [Safwa] "container found"
 *      line, then ship an update: bump manifest version, rebuild ZIP,
 *      upload in the Developer Dashboard.
 *
 * The matching core is DOM-independent (npm test stays 44/44); only the
 * SELECTORS block and possibly dom.js ever need to change.
 */
(() => {
  "use strict";

  const describe = (el) => {
    if (!el) return null;
    const tag = el.tagName.toLowerCase();
    if (el.dataset && el.dataset.testid) return `[data-testid="${el.dataset.testid}"]`;
    const classes =
      typeof el.className === "string"
        ? el.className.trim().split(/\s+/).filter(Boolean)
        : [];
    if (classes.length) return tag + "." + classes.map((c) => CSS.escape(c)).join(".");
    return el.id ? tag + "#" + el.id : tag;
  };

  // 1. The row parent: the element with the most text-bearing children.
  //    Comment lists are exactly that: one container, many similar rows.
  let best = null;
  for (const parent of document.querySelectorAll("body *")) {
    const kids = [...parent.children].filter((k) => k.textContent.trim().length > 10);
    if (kids.length >= 3 && (!best || kids.length > best.kids.length)) {
      best = { parent, kids };
    }
  }
  if (!best) {
    console.log(
      "[safwa-discovery] no repeated rows found. Open the Comments panel and make sure comments are visible, then run again."
    );
    return;
  }

  const row = best.kids[0];
  const out = {
    rowCount: best.kids.length,
    container: describe(best.parent),
    commentNode: describe(row),
  };

  // 2. Inside a row: the text element carries the LONGEST text; the author
  //    handle is (almost always) the shortest standalone text; the platform
  //    icon is an img with alt/title/aria-label.
  const parts = [...row.querySelectorAll("*")].filter(
    (el) => el.children.length === 0 && el.textContent.trim()
  );
  const byLength = [...parts].sort(
    (a, b) => b.textContent.trim().length - a.textContent.trim().length
  );
  out.text = byLength[0] ? describe(byLength[0]) : null;
  out.author = byLength.length > 1 ? describe(byLength[byLength.length - 1]) : null;
  const icon = row.querySelector("img[alt], img[title], img[aria-label]");
  out.platformIndicator = icon ? describe(icon) : null;

  // 3. Cross-check: the same shape should hold on a second row.
  if (best.kids[1]) {
    const second = describe(best.kids[1]);
    out.secondRowMatches = second === out.commentNode;
  }

  // 4. Ground truth: the first row's actual HTML, trimmed. Selector guesses
  //    can be ambiguous; the raw markup is not. 1200 chars is enough to see
  //    the row's own tag, its classes, and its inner field structure.
  out.firstRowHTML = row.outerHTML.replace(/\s+/g, " ").slice(0, 1200);

  console.log("[safwa-discovery] paste this into SELECTORS (src/config.js):");
  console.log(JSON.stringify(out, null, 2));
})();
