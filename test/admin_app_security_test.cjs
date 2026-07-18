"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const source = readFileSync("assets/js/admin.js", "utf8");
const styles = readFileSync("assets/css/admin.css", "utf8");

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

test("the admin portal shares the deep-black, mint, square editorial system", () => {
  assert.match(styles, /--ocean-975: #02060b/);
  assert.match(styles, /--cyan: #79f2d2/);
  assert.match(styles, /--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text"/);
  assert.match(styles, /--font-mono: ui-monospace, "SFMono-Regular"/);
  assert.match(styles, /h1,\s*h2,\s*h3 \{[\s\S]*?font-family: var\(--font-mono\)/);
  assert.doesNotMatch(styles, /gradient\(/);
  assert.doesNotMatch(styles, /\bInter\b/);
  assert.doesNotMatch(styles, /border-radius:\s*(?:999px|[1-9][0-9.]*rem)/);
  assert.ok([...styles.matchAll(/border-radius:\s*([^;]+);/g)].every((match) => match[1].trim() === "0"));
  assert.doesNotMatch(styles, /background:\s*rgba\(255,\s*255,\s*255/);
});
