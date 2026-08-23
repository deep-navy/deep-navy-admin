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
  assert.match(shell, /data-customer-detail-field="gross-profit"/);
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
  // One grid of ten panels for the selected environment, rather than two columns:
  // the environment is a control now, matching the approved mockup.
  assert.match(js, /const environment = metricsState\.environment;/);
});

// The metrics explorer speaks the proxy's actual vocabulary: ten panel names,
// the service filter on the first five only, a 24h window at a 30s step, and
// the exact request echoed back from the same URL builder the fetch uses.
test("the metrics explorer speaks the proxy's real vocabulary", () => {
  const js = readFileSync("assets/js/admin.js", "utf8");
  const html = readFileSync("_includes/admin-console.html", "utf8");
  // Same ten names the proxy accepts, now in the approved mockup's display order:
  // the six that report first, then the four that are empty by construction, so the
  // callout that explains them sits directly under them.
  const panelOrder = [...js.matchAll(/\{ key: "([a-z0-9_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(panelOrder, [
    "request_rate", "error_rate", "latency_p95", "goroutines", "memory_bytes", "queue_depth",
    "target_health", "llm_tokens", "llm_cost_usd", "run_duration"
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
  // one URL builder serves the grid fetch and the echo strip
  assert.match(js, /function metricsRequestUrl/);
  assert.ok([...js.matchAll(/metricsRequestUrl\(/g)].length >= 3);
  assert.match(html, /data-metrics-query-echo/);
  assert.match(html, /data-metrics-series-chips/);
  assert.match(html, /data-metrics-service-chips/);
  assert.match(html, /data-metrics-env-chips/);
  assert.match(html, /data-metrics-window-chips/);
  assert.match(html, /the service filter exists on the first five series only/);
  // The controls are the design system's segmented control, not a text field.
  assert.match(js, /className = "dn-seg__item"/);
});

// Empty is four different facts. Every honest state names its kind and its
// cause; "No data available" is banned vocabulary.
test("the four kinds of empty are mapped onto what the proxy really answered", () => {
  const js = readFileSync("assets/js/admin.js", "utf8");
  assert.match(js, /Activation happens at the next crew provisioning/);
  assert.match(js, /Empty by design/);
  assert.match(js, /there is no scrape up to report/);
  assert.match(js, /Environment absent/);
  assert.match(js, /No sample was invented/);
  assert.match(js, /Nothing was substituted/);
  assert.doesNotMatch(js, /No data available/);
  assert.match(js, /metricsGhostPlot/);
});

// The public static shell is served unauthenticated by Pages, so it must carry
// NO internal architecture documentation: no internal endpoint contracts, no
// App-grant inventory, no infrastructure identifiers, no database table names.
// The console documents the platform to signed-in admins through the DATA it
// fetches, never through world-readable markup. This test is the guard that
// keeps the reference audit from ever coming back to the public page.
test("the public shell carries no internal architecture documentation", () => {
  const html = readFileSync("_includes/admin-console.html", "utf8");
  for (const banned of [
    'id="reference"',
    "ws-251f4ede",
    "/internal/v1/",
    "objective_acceptance_checks",
    "new_permissions_accepted",
    "AppVerifierKey",
    "cluster-internal",
    "master key",
    "pk-lf",
    "openclaw_"
  ]) {
    assert.ok(!html.includes(banned), `internal detail leaked to the public shell: ${banned}`);
  }
  const js = readFileSync("assets/js/admin.js", "utf8");
  for (const banned of ["metrics: false", "openclaw_tokens_total", "ws-251f4ede", "/internal/v1/"]) {
    assert.ok(!js.includes(banned), `internal detail leaked to public JS: ${banned}`);
  }

  // The rebuild added three new places a leak could hide: the site-local CSS layers
  // and the theme script, all of which Pages serves to anyone. They carry presentation
  // and a preference key, and nothing else.
  for (const file of ["assets/css/admin.css", "assets/css/theme.css", "assets/js/theme.js"]) {
    const contents = readFileSync(file, "utf8");
    for (const banned of ["ws-251f4ede", "/internal/v1/", "cluster-internal", "openclaw_", "amazonaws", "us-west-2"]) {
      assert.ok(!contents.includes(banned), `internal detail leaked to ${file}: ${banned}`);
    }
  }

  // The console explains the platform through authenticated DATA. Every heading and
  // every empty state in the shell is either a label or an honest statement about
  // absence; none of them name an infrastructure component.
  for (const banned of ["Kubernetes", "kubernetes", "Prometheus", "prometheus", "Cognito user pool", "namespace", "PVC", "StatefulSet", "Stripe"]) {
    assert.ok(!html.includes(banned), `the public shell names an internal component: ${banned}`);
  }

  // And the shell still ships no executable or styling surface of its own, which is
  // what keeps its CSP meaningful.
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /\sstyle="/);
});

// On 2026-08-23 the sign-in button read as completely dead: it fired, Cognito
// answered error=redirect_mismatch, and the operator saw a page that did
// nothing. The cause was cross-repo — infrastructure registered the site root
// as the app client's only callback while this console asks Cognito for
// /auth/callback/, the page that scrubs the authorization code out of the
// address bar. Cognito matches redirect_uri byte-for-byte, trailing slash
// included. Terraform now asserts the same path from its side; this pins ours,
// so the two can only drift if someone changes both.
test("sign-in asks Cognito for the callback page terraform registers, and names Google", () => {
  const writer = readFileSync("scripts/write_runtime_config.rb", "utf8");
  assert.match(writer, /auth\/callback\//, "the runtime callback must be the scrubber page, not the site root");

  // Straight to Google. The pool supports exactly one provider, so a chooser
  // interstitial would make the button's own promise false.
  assert.match(app, /identity_provider: "Google"/);

  // The button says whose identity it uses, and carries the mark, because
  // "Continue securely" told an operator nothing about what tapping it does.
  assert.match(shell, /data-sign-in[^>]*>[\s\S]{0,220}?Sign in with Google/);
  assert.match(shell, /<symbol id="i-google"/);
  assert.match(shell, /href="#i-google"/);

  // The mark is filled, not stroked: svg.dn-icon forces fill:none for outline
  // glyphs, which would render Google's four paths as nothing at all.
  const css = readFileSync("assets/css/admin.css", "utf8");
  assert.match(css, /svg\.ad-gmark\s*\{[^}]*fill:\s*revert/);
});
