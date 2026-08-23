"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const app = readFileSync("assets/js/admin.js", "utf8");
const client = readFileSync("src/admin-api-client.ts", "utf8");
const shell = readFileSync("_includes/admin-console.html", "utf8");

test("customer detail uses the frozen current-customer and reliability-history RPCs", () => {
  assert.match(client, /"admin_customer"/);
  assert.match(client, /admin\.getAdminCustomer/);
  assert.match(client, /"admin_customer_reliability"/);
  assert.match(client, /admin\.listAdminCustomerReliabilityRecords/);
  assert.match(app, /adminRequest\("admin_customer", \{ organizationId \}/);
  assert.match(app, /adminRequest\("admin_customer_reliability", \{ organizationId, page: \{ pageSize: 100/);
  assert.match(shell, /data-customer-detail/);
  assert.match(shell, /data-customer-reliability-rows/);
});

test("customer reliability pagination stays scoped, opaque, ordered, and fail closed", () => {
  assert.match(app, /function opaquePageToken/);
  assert.match(app, /return value;\n  \}/);
  assert.match(app, /recordOrganizationId !== organizationId/);
  assert.match(app, /periodStart > previousPeriodStart/);
  assert.match(app, /duplicate_customer_reliability_record/);
  assert.match(app, /repeated_customer_reliability_cursor/);
  assert.match(app, /page: \{ pageSize: 100, pageToken \}/);
  assert.match(app, /Missing availability ratios are explicit source unavailability, never zero/);
  assert.match(app, /Unavailable · insufficient coverage/);
});

test("customer detail keeps launch intervention signals visible", () => {
  for (const field of ["support", "churn", "initiatives", "approvals"]) assert.match(shell, new RegExp(`data-customer-detail-field="${field}"`));
  assert.match(app, /projectionValue\(customer, "support_state"/);
  assert.match(app, /projectionValue\(customer, "churn_risk_level"/);
  assert.match(app, /customerDetailActivityValue\(activity, "active_initiatives"/);
  assert.match(app, /customerDetailActivityValue\(activity, "pending_approvals"/);
  assert.match(app, /aria-expanded/);
  assert.match(app, /aria-controls/);
});

test("billing exposes upgrades, downgrades, and per-account overages without fake zeros", () => {
  assert.match(shell, /data-billing-metric="upgrades"/);
  assert.match(shell, /data-billing-metric="downgrades"/);
  assert.match(app, /projectionValue\(billing, "upgrades", formatCount, billing\.upgrades\)/);
  assert.match(app, /projectionValue\(billing, "downgrades", formatCount, billing\.downgrades\)/);
  assert.match(app, /projectionValue\(account, "usage_overage_credit_micros", formatNonNegativeCredits/);
  assert.match(app, /projectionValue\(account, "usage_overage_amount", \(value\) => value \? formatNonNegativeMoney\(value\) : "No overage"/);
  assert.match(shell, /Overage credits/);
  assert.match(shell, /Overage premium/);
});

// The metrics section renders environments side by side from the closed
// proxy, and it never invents a number: unknown environments say "Not
// provisioned", empty results say "No data yet".
test("metrics panels are proxied, side-by-side, and honest about absence", () => {
  const js = readFileSync("assets/js/admin.js", "utf8");
  const html = readFileSync("_includes/admin-console.html", "utf8");
  assert.match(js, /METRICS_ENVIRONMENTS = \["development", "production"\]/);
  assert.match(js, /\/admin\/v1\/metrics\/query_range/);
  assert.match(js, /Authorization: `Bearer \$\{state\.accessToken\}`/);
  assert.match(js, /"unprovisioned"/);
  assert.match(js, /Not provisioned/);
  assert.match(js, /No data yet/);
  assert.match(html, /data-metrics-grid/);
  assert.match(html, /href="#metrics"/);
});

// The metrics explorer speaks the proxy's actual vocabulary: ten panel names,
// the service filter on the first five only, a 24h window at a 30s step, and
// the exact request echoed back from the same URL builder the fetch uses.
test("the metrics explorer speaks the proxy's real vocabulary", () => {
  const js = readFileSync("assets/js/admin.js", "utf8");
  const html = readFileSync("_includes/admin-console.html", "utf8");
  const panelOrder = [...js.matchAll(/\{ key: "([a-z0-9_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(panelOrder, [
    "request_rate", "error_rate", "latency_p95", "goroutines", "memory_bytes",
    "target_health", "llm_tokens", "llm_cost_usd", "run_duration", "queue_depth"
  ]);
  assert.equal([...js.matchAll(/filterable: true/g)].length, 5);
  assert.ok(panelOrder.slice(5).every((key) => new RegExp(`key: "${key}"[^\\n]*filterable: false`).test(js)));
  assert.match(js, /METRICS_SERVICES = \["platform-api", "builder", "gateway"\]/);
  assert.match(js, /METRICS_WINDOWS = \["1h", "6h", "24h"\]/);
  assert.match(js, /windowKey: "24h"/);
  assert.match(js, /METRICS_STEP_SECONDS = "30"/);
  assert.match(js, /searchParams\.set\("window", windowKey\)/);
  assert.match(js, /searchParams\.set\("step", METRICS_STEP_SECONDS\)/);
  assert.match(js, /if \(panel\.filterable && service\) target\.searchParams\.set\("service", service\)/);
  // one URL builder serves the fetch, the focused refetch, and the echo strip
  assert.match(js, /function metricsRequestUrl/);
  assert.ok([...js.matchAll(/metricsRequestUrl\(/g)].length >= 3);
  assert.match(html, /data-metrics-query-echo/);
  assert.match(html, /data-metrics-series-chips/);
  assert.match(html, /data-metrics-service-chips/);
  assert.match(html, /the service filter exists on the first five series only/);
});

// Empty is four different facts. Every honest state names its kind and its
// cause; "No data available" is banned vocabulary.
test("the four kinds of empty are mapped onto what the proxy really answered", () => {
  const js = readFileSync("assets/js/admin.js", "utf8");
  assert.match(js, /provisioned before the metrics wiring shipped/);
  assert.match(js, /Empty by design/);
  assert.match(js, /there is no scrape up to report/);
  assert.match(js, /Environment absent/);
  assert.match(js, /No sample was invented/);
  assert.match(js, /Nothing was substituted/);
  assert.doesNotMatch(js, /No data available/);
  assert.match(js, /metricsGhostPlot/);
});

// The reference sections carry the data-planes audit verbatim: they document
// the live platform beside the panels that query it.
test("the reference sections document the live platform verbatim", () => {
  const html = readFileSync("_includes/admin-console.html", "utf8");
  for (const marker of [
    'id="reference"',
    "ws-251f4ede",
    "20 protos · 84 RPCs",
    "ApprovalWorkerService.RequestApproval",
    "carried · not projected",
    "objective_acceptance_checks",
    "objective_id · team_id+repository_id fence · head_sha",
    "new_permissions_accepted reprojected",
    "deep-navy/review-gate",
    "no app pin — deliberate",
    "/internal/v1/prd-signoff-locks",
    "discussions_permission_missing",
    "token_scope_unavailable",
    "discussion_not_found",
    "ids filterable but NOT groupable",
    "no http_route",
    "go_config_gogc_percent",
    "target_health is empty",
    "prod columns 404 by design"
  ]) {
    assert.ok(html.includes(marker), `reference marker missing: ${marker}`);
  }
  // the em dash in the join matrix is load-bearing: an absent key is shown,
  // never left blank
  assert.ok([...html.matchAll(/joins__cell--none/g)].length >= 8);
});
