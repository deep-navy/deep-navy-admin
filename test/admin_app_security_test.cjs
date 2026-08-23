"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

// The design system is now VENDORED under assets/css/ds/ rather than re-authored in
// this repo, so the assertions that used to read a hand-written approximation of it
// read the system's own bytes instead. Their intent is unchanged: every hex literal
// lives in the palette, both themes ship from one build, the faces are self-hosted,
// motion never transitions a colour, and the app layer stays achromatic.
//
// The split matters for two of the tests below. `styles` is the APP layer — the only
// stylesheet this repo authors — and it is what the achromatic and breakpoint rules
// police. The ds/ files are the system's and are policed instead by
// scripts/check_vendored_design_system.mjs, which proves they are unmodified.
const source = readFileSync("assets/js/admin.js", "utf8");
const styles = readFileSync("assets/css/admin.css", "utf8");
const theme = readFileSync("assets/css/theme.css", "utf8");
const themeScript = readFileSync("assets/js/theme.js", "utf8");
const palette = readFileSync("assets/css/ds/tokens/palette.css", "utf8");
const semantic = readFileSync("assets/css/ds/tokens/semantic.css", "utf8");
const typography = readFileSync("assets/css/ds/tokens/typography.css", "utf8");
const faces = readFileSync("assets/css/type.css", "utf8");
const motionTokens = readFileSync("assets/css/ds/tokens/motion.css", "utf8");
const dsCore = readFileSync("assets/css/ds/components/core/core.css", "utf8");
const dsData = readFileSync("assets/css/ds/components/data/data.css", "utf8");
const entry = readFileSync("assets/css/ds.css", "utf8");
const layout = readFileSync("_layouts/default.html", "utf8");

// Returns the stylesheet with every @media (hover: hover) block removed, so a
// test can assert that no :hover rule lives anywhere else.
function withoutHoverMedia(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@media", i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    const open = css.indexOf("{", at);
    const header = css.slice(at, open);
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") depth -= 1;
      j += 1;
    }
    out += css.slice(i, at);
    if (!/hover:\s*hover/.test(header)) out += css.slice(at, j);
    i = j;
  }
  return out;
}

test("the portal uses fresh PKCE and never persists bearer tokens", () => {
  assert.match(source, /code_challenge_method:\s*"S256"/);
  assert.match(source, /prompt:\s*"login"/);
  assert.doesNotMatch(source, /localStorage/);
  const storageWrites = [...source.matchAll(/sessionStorage\.setItem\(([^\n]+)\)/g)].map((match) => match[1]);
  assert.equal(storageWrites.length, 1);
  assert.match(storageWrites[0], /oauthStorageKey/);
  assert.doesNotMatch(storageWrites[0], /accessToken|idToken|refreshToken/);
});

test("the role allowlist is code-owned and overview loading follows role verification", () => {
  assert.match(source, /new Set\(\["admin", "founder"\]\)/);
  assert.doesNotMatch(source, /config\.allowedRoles|config\.adminRoles/);
  assert.ok(source.indexOf("allowedRoles.has(role)") < source.indexOf("await refreshDashboard()"));
  assert.match(source, /No admin data request was sent/);
});

test("all sensitive browser requests opt out of caches, cookies, redirects, and referrers", () => {
  assert.match(source, /cache:\s*"no-store"/);
  assert.match(source, /credentials:\s*"omit"/);
  assert.match(source, /redirect:\s*"error"/);
  assert.match(source, /referrerPolicy:\s*"no-referrer"/);
  assert.doesNotMatch(source, /innerHTML/);
});

test("independent admin projections survive unavailable aggregate summaries", () => {
  assert.equal([...source.matchAll(/Promise\.allSettled\(/g)].length, 4, "three dashboard projection groups plus the customer-detail pair stay independently settled");
  assert.match(source, /renderEconomicsSlices\(slicesResult\.value\)/);
  assert.match(source, /renderBillingAccounts/);
  assert.match(source, /renderReconciliationIssues/);
  assert.match(source, /Partially verified/);
  assert.match(source, /Partially reconciled/);
  assert.match(source, /async function loadOverview[\s\S]*?catch \(error\) \{\s*resetOverviewMetrics\(\);/);
  assert.doesNotMatch(source, /async function loadOverview[\s\S]*?catch \(error\) \{\s*resetMetrics\(\);/);
});

test("admin tables exhaust stable server pagination instead of truncating teams", () => {
  assert.match(source, /async function adminListRequest/);
  assert.match(source, /pageSize: 100, pageToken/);
  assert.match(source, /repeated_admin_page_cursor/);
  assert.match(source, /admin_page_limit_exceeded/);
  for (const collection of ["customers", "economicsSlices", "runtimeInstances", "alerts", "billingAccounts", "reconciliationIssues"]) {
    assert.match(source, new RegExp(`adminListRequest\\([^\\n]+"${collection}"`));
  }
});

test("customer operations rows expose authoritative adoption and reliability fields", () => {
  assert.match(source, /customer\?\.activity/);
  assert.match(source, /activity\.pendingApprovals/);
  assert.match(source, /customer\?\.reliability/);
  assert.match(source, /reliability\.gatewayAvailabilityRatio/);
  assert.match(source, /customer\?\.repositoryCount/);
  assert.match(source, /customer\?\.supportState/);
});

test("partial admin projections hide exact unavailable scalar fields", () => {
  assert.match(source, /function projectionFieldAvailable/);
  assert.match(source, /status\.unavailableFields/);
  assert.match(source, /unavailable\.has\(snakeCaseField\)/);
  assert.match(source, /projectionValue\(billing, "failed_payments"/);
  assert.match(source, /projectionValue\(fleet, "ready_instances"/);
  assert.match(source, /projectionValue\(runtime, "runtime_health_reason"/);
  assert.match(source, /projectionSummary\(customer\)/);
  assert.match(source, /resolvedAlertHistoryAvailable === true/);
  assert.match(source, /unavailableKinds/);
});

test("founders can inspect authoritative per-team execution capacity without provider IDs", () => {
  assert.match(source, /account\?\.teamCreditControls/);
  assert.match(source, /control\?\.ledgerAvailableMicros/);
  assert.match(source, /control\?\.openReservedMicros/);
  assert.match(source, /control\?\.periodConsumedMicros/);
  assert.match(source, /control\?\.effectiveAvailableMicros/);
  assert.match(source, /control\?\.pauseReason/);
  assert.match(source, /Boolean\(control\?\.customerPaused\) !== \(reason === "customer paused"\)/);
  assert.match(source, /periodEnd <= periodStart/);
  assert.doesNotMatch(source, /stripeCustomerId|stripeSubscriptionId|stripePriceId/);
});

// The console is built on the deep.navy design system: achromatic chrome in
// both themes, colour only where it carries meaning, evidence in mono, three
// breakpoints, and motion that never transitions a colour property.
test("every hex literal lives in the token palette and the app layer is achromatic", () => {
  assert.match(palette, /--ink-950:#0A0A0A/);
  assert.match(palette, /--brand-navy:#000F1A/);
  for (const hue of ["lumen", "kelp", "brass", "coral", "rose", "iris", "anemone", "current"]) {
    assert.match(palette, new RegExp(`--${hue}-500:#[0-9A-F]{6}`));
  }
  // The site-local layers introduce no colour of their own: theme.css only re-derives
  // tokens the palette already defines, through oklch(from ...), and type.css only
  // declares faces.
  assert.doesNotMatch(theme, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(faces, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(styles, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(styles, /--(?:ink|lumen|kelp|brass|coral|rose|iris|anemone|current)-\d/);
  assert.doesNotMatch(styles, /gradient\(/);
  assert.doesNotMatch(styles, /\bInter\b/);
  const radii = [...styles.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1].trim());
  assert.ok(radii.length > 0);
  assert.ok(radii.every((value) => /^var\(--radius-(?:xs|sm|md|lg|xl|2xl)\)$/.test(value) || value === "50%" || value === "0"));
  // A hue in the chrome is always a state. This is now checked as a RULE rather than
  // by pinning two literal selectors: every declaration in the app layer that paints
  // with a role, status or viz token must sit in a selector that names a state or a
  // data series. That is strictly stronger than the two string matches it replaces,
  // and it cannot be satisfied by accident.
  const HUE_REFERENCE = /var\(--(?:role-|status-|viz-)/;
  const STATE_SCOPED = /(?:--success|--attention|--danger|--live|__part--|ad-guard|ad-rail__session|ad-mix|spark)/;
  for (const [selector, body] of styles.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    for (const declaration of body.split(";")) {
      const [property, value] = declaration.split(":");
      if (!value || property.trim().startsWith("--")) continue;
      if (!HUE_REFERENCE.test(value)) continue;
      assert.match(selector.trim(), STATE_SCOPED,
        `"${selector.trim()}" paints chrome with a hue (${declaration.trim()}); colour must mean a state or a data series`);
    }
  }
  // The design system still owns what those states look like, and still pairs every
  // one of them with a word rather than shipping colour alone.
  assert.match(dsCore, /\.dn-dot--live\{background:var\(--status-live-dot\)\}/);
  assert.match(dsCore, /\.dn-badge--danger\{[^}]*var\(--status-danger-bg\)/);
});

test("both themes ship from one build with data-theme plus the OS preference", () => {
  // The system defines light on bare :root and dark on the explicit attribute...
  assert.match(semantic, /:root\{\ncolor-scheme:light;/);
  assert.match(semantic, /\[data-theme="dark"\]\{\ncolor-scheme:dark;/);
  assert.match(semantic, /\[data-theme\]\{color:var\(--text-primary\)\}/);
  // ...and the site-local layer adds the third state the system leaves to the site:
  // no attribute at all, following the OS live. All three must exist or the toggle
  // becomes a one-way door out of "match system".
  assert.match(theme, /@media \(prefers-color-scheme: dark\)\{\n:root:not\(\[data-theme="light"\]\)\{/);
  assert.match(theme, /--surface-page:var\(--ink-1000\)/);
});

// The mockup's dark-mode chroma boost: the four role hues at 1.22 and the four status
// hues at 1.25, re-derived through relative colour rather than restated as new
// literals, so lightness and hue are held exactly and only chroma moves.
test("the dark chroma boost re-derives hues and lives outside the vendored tree", () => {
  for (const role of ["--role-pm", "--role-em", "--role-design", "--role-eng"]) {
    assert.match(theme, new RegExp(`${role}:oklch\\(from var\\(--[a-z]+-400\\) l calc\\(c \\* 1\\.22\\) h\\)`));
  }
  for (const status of ["live", "success", "attention", "danger"]) {
    assert.match(theme, new RegExp(`--status-${status}-dot:oklch\\(from var\\(--[a-z]+-400\\) l calc\\(c \\* 1\\.25\\) h\\)`));
    assert.match(theme, new RegExp(`--status-${status}-fg:oklch\\(from var\\(--[a-z]+-300\\) l calc\\(c \\* 1\\.25\\) h\\)`));
  }
  // It is applied in BOTH dark scopes, or the toggle and the OS preference disagree.
  assert.equal([...theme.matchAll(/--status-danger-fg:oklch/g)].length, 2);
  // And it is a site-local layer: nothing under ds/ carries it.
  const dsFiles = ["assets/css/ds/tokens/roles.css", "assets/css/ds/tokens/semantic.css"];
  for (const file of dsFiles) assert.doesNotMatch(readFileSync(file, "utf8"), /oklch\(from/);
});

// The one thing this console stores is a theme preference, and it stores nothing else.
test("the theme control persists a preference and never a credential", () => {
  assert.match(themeScript, /"dn-admin-theme"/);
  const writes = [...themeScript.matchAll(/localStorage\.setItem\(([^)]+)\)/g)].map((match) => match[1]);
  assert.equal(writes.length, 1);
  assert.match(writes[0], /KEY, preference/);
  assert.doesNotMatch(themeScript, /accessToken|idToken|refreshToken|Bearer/);
  // It must not be deferred, or a stored choice arrives after the first paint.
  assert.match(layout, /<script src="\{\{ '\/assets\/js\/theme\.js' \| relative_url \}\}"><\/script>/);
});

test("the three faces are self-hosted under the CSP and evidence is mono", () => {
  // The design system names the families; this site serves the files, because its CSP
  // is font-src 'self' and the system's own entry point pulls them from a CDN.
  for (const family of ["Bricolage Grotesque", "Instrument Sans", "JetBrains Mono"]) {
    assert.match(faces, new RegExp(`font-family:"${family}";\\n  src:url\\("\\.\\./fonts/[a-z-]+\\.woff2"\\) format\\("woff2"\\)`));
    assert.match(typography, new RegExp(`"${family}"`));
  }
  assert.equal([...faces.matchAll(/font-display:swap/g)].length, 3);
  assert.match(layout, /font-src 'self'/);
  assert.doesNotMatch(layout, /fonts\.googleapis|fonts\.gstatic|unpkg|cdn/i);
  // No CDN reaches this page at all, so the vendored entry point must not import one.
  assert.doesNotMatch(entry, /https?:/);
  assert.match(typography, /--type-h1:var\(--fw-semibold\) var\(--fs-4xl\)\/var\(--lh-tight\) var\(--font-display\)/);
  assert.match(styles, /h1 \{ font: var\(--type-h1\)/);
  // Evidence — every id, count, timestamp and series name — is mono, in both layers.
  assert.match(dsData, /\.dn-mpanel__series\{[^}]*var\(--font-mono\)/);
  assert.match(styles, /\.ad-cell-mono \{[^}]*var\(--font-mono\)/);
  assert.match(styles, /font-variant-numeric: tabular-nums/);
});

test("motion never transitions a colour and hover stays behind the pointer capability", () => {
  const transitions = [...styles.matchAll(/transition:\s*([^;]+);/g)].map((match) => match[1]);
  assert.ok(transitions.length > 0);
  for (const value of transitions) {
    assert.doesNotMatch(value, /color|background|border(?!-)|width|height|top|left/);
  }
  assert.match(motionTokens, /@media \(prefers-reduced-motion:reduce\)\{\*[\s\S]*1ms!important/);
  assert.doesNotMatch(withoutHoverMedia(styles), /:hover/);
});

test("the layout breaks at exactly the system's three widths", () => {
  // The app layer breaks at the system's three widths and no others. The vendored
  // tree carries a handful of component-local widths of its own; those are the
  // system's business, and check_vendored_design_system.mjs proves they are its
  // unmodified bytes rather than something this repo added.
  const widths = [styles, theme]
    .flatMap((sheet) => [...sheet.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)])
    .map((match) => match[1]);
  assert.ok(widths.length > 0);
  assert.deepEqual([...new Set(widths)].sort((a, b) => b - a), ["1200", "900", "600"]);
});
