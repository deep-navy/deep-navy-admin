"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const source = readFileSync("assets/js/admin.js", "utf8");
const styles = readFileSync("assets/css/admin.css", "utf8");
const palette = readFileSync("assets/css/tokens/palette.css", "utf8");
const semantic = readFileSync("assets/css/tokens/semantic.css", "utf8");
const foundation = readFileSync("assets/css/tokens/foundation.css", "utf8");
const motionTokens = readFileSync("assets/css/tokens/motion.css", "utf8");
const motionLayer = readFileSync("assets/css/motion.css", "utf8");
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
  assert.doesNotMatch(styles, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(styles, /--(?:ink|lumen|kelp|brass|coral|rose|iris|anemone|current)-\d/);
  assert.doesNotMatch(styles, /gradient\(/);
  assert.doesNotMatch(styles, /\bInter\b/);
  const radii = [...styles.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1].trim());
  assert.ok(radii.length > 0);
  assert.ok(radii.every((value) => /^var\(--radius-(?:xs|sm|md|lg|xl|2xl)\)$/.test(value) || value === "50%" || value === "0"));
  // A hue in the chrome is always a state: status dots and flags are the only
  // selectors that touch the status ramps, and they always sit beside a word.
  assert.match(styles, /\.pip--live \{ background: var\(--status-live-dot\); \}/);
  assert.match(styles, /\.status--negative \{[^}]*var\(--status-danger-bg\)/);
});

test("both themes ship from one build with data-theme plus the OS preference", () => {
  assert.match(semantic, /:root\{\ncolor-scheme:light;/);
  assert.match(semantic, /\[data-theme="dark"\]\{\ncolor-scheme:dark;/);
  assert.match(semantic, /@media \(prefers-color-scheme: dark\)\{\n:root:not\(\[data-theme="light"\]\)\{/);
  assert.match(semantic, /\[data-theme\]\{color:var\(--text-primary\)\}/);
});

test("the three faces are self-hosted under the CSP and evidence is mono", () => {
  for (const family of ["Bricolage Grotesque", "Instrument Sans", "JetBrains Mono"]) {
    assert.match(foundation, new RegExp(`font-family:"${family}";\\n  src:url\\("\\.\\./\\.\\./fonts/[a-z-]+\\.woff2"\\) format\\("woff2"\\)`));
  }
  assert.equal([...foundation.matchAll(/font-display:swap/g)].length, 3);
  assert.match(layout, /font-src 'self'/);
  assert.doesNotMatch(layout, /fonts\.googleapis|fonts\.gstatic|unpkg|cdn/i);
  assert.match(foundation, /--type-h1:var\(--fw-semibold\) var\(--fs-3xl\)\/1\.12 var\(--font-display\)/);
  assert.match(styles, /h1 \{ font: var\(--type-h1\)/);
  assert.match(styles, /\.mpanel__series \{[^}]*var\(--font-mono\)/);
  assert.match(styles, /font-variant-numeric: tabular-nums/);
});

test("motion never transitions a colour and hover stays behind the pointer capability", () => {
  const transitions = [...styles.matchAll(/transition:\s*([^;]+);/g)].map((match) => match[1]);
  assert.ok(transitions.length > 0);
  for (const value of transitions) {
    assert.doesNotMatch(value, /color|background|border(?!-)|width|height|top|left/);
  }
  assert.match(motionTokens, /@media \(prefers-reduced-motion:reduce\)\{\*[\s\S]*1ms!important/);
  for (const sheet of [styles, motionLayer]) {
    assert.doesNotMatch(withoutHoverMedia(sheet), /:hover/);
  }
});

test("the layout breaks at exactly the system's three widths", () => {
  const widths = [styles, foundation, motionLayer, motionTokens]
    .flatMap((sheet) => [...sheet.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)])
    .map((match) => match[1]);
  assert.ok(widths.length > 0);
  assert.deepEqual([...new Set(widths)].sort((a, b) => b - a), ["1200", "900", "600"]);
});
