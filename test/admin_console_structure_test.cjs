"use strict";

// The rebuilt console: seven surfaces behind a rail, rendered against the vendored
// design system, and honest about every field the admin API declines to vouch for.
//
// These tests guard the three things that would fail SILENTLY if they regressed:
// a view that exists in the markup but not in the router (or the reverse), a table
// whose row builder drifts out of arity with its own header, and — most importantly —
// an unavailable projection field rendering as a number.

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const app = readFileSync("assets/js/admin.js", "utf8");
const shell = readFileSync("_includes/admin-console.html", "utf8");
const styles = readFileSync("assets/css/admin.css", "utf8");
const layout = readFileSync("_layouts/default.html", "utf8");

const VIEWS = ["overview", "customers", "economics", "operations", "billing", "metrics", "audit"];

test("every view is registered in the router, the markup, and the rail", () => {
  // The router's own registry.
  const registry = app.match(/const VIEWS = \[([^\]]+)\]/);
  assert.ok(registry, "the view registry is gone");
  const registered = [...registry[1].matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(registered, VIEWS);

  // Every registered view has a section, and every section is registered. A section
  // with no route is unreachable; a route with no section shows a blank page.
  const sections = [...shell.matchAll(/data-view="([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sections.sort(), [...VIEWS].sort());

  // Every rail and tab-bar destination resolves to a registered view.
  const links = [...new Set([...shell.matchAll(/data-view-link="([a-z]+)"/g)].map((match) => match[1]))];
  for (const link of links) assert.ok(VIEWS.includes(link), `nav points at unregistered view: ${link}`);

  // The rail carries all seven; the tab bar carries the five that fit a phone. Both
  // are mounted so the breakpoint can choose, and neither may be empty.
  const rail = shell.slice(shell.indexOf("data-view-nav"), shell.indexOf("ad-rail__session"));
  assert.equal([...rail.matchAll(/data-view-link=/g)].length, 7);
  const tabbar = shell.slice(shell.indexOf("dn-tabbar"));
  assert.equal([...tabbar.matchAll(/data-view-link=/g)].length, 5);

  // aria-current is a claim about NAVIGATION. The overview's "All alerts" button and
  // its attention rows route through the same handler and carry the same attribute,
  // so the current-page marker is scoped to the two nav containers — announcing an
  // alert row as the current page would mislead a screen reader.
  assert.match(app, /querySelectorAll\("\[data-view-nav\] \[data-view-link\], \[data-view-tabbar\] \[data-view-link\]"\)[\s\S]{0,200}aria-current/);

  // Exactly one view is visible before the router runs.
  assert.equal([...shell.matchAll(/data-view="[a-z]+" id="[a-z-]+"[^>]*hidden/g)].length, VIEWS.length - 1);
  // And an unrecognised route falls back rather than showing nothing.
  assert.match(app, /const target = VIEWS\.includes\(view\) \? view : "overview"/);
});

// THE HONESTY CONTRACT. This is the behaviour the whole console exists to protect.
test("an unavailable projection field renders the word, never a zero or a dash", () => {
  // The sentinel is a single constant, so there is one spelling of "we cannot say".
  assert.match(app, /const UNAVAILABLE = "unavailable"/);

  // projectionValue is the only gate between the wire and the screen, and BOTH of its
  // exits are the sentinel: the field being named unavailable, and the formatter
  // refusing the value it was given.
  assert.match(app, /function projectionValue\(record, snakeCaseField, formatter, value\) \{\s*if \(!projectionFieldAvailable\(record, snakeCaseField\)\) return UNAVAILABLE;\s*try \{ return formatter\(value\); \} catch \{ return UNAVAILABLE; \}/);

  // It reads the API's own list, by exact snake_case name.
  assert.match(app, /function projectionFieldAvailable/);
  assert.match(app, /status\.unavailableFields/);
  assert.match(app, /unavailable\.has\(snakeCaseField\)/);
  // COMPLETE with a populated list is a contradiction; treat the projection as unusable.
  assert.match(app, /if \(availability === "complete" && unavailable\.size > 0\) return false/);

  // The sentinel renders as tertiary ink through one node builder, so it cannot be
  // styled as an error in one place and a value in another.
  assert.match(app, /function unavailableNode\(\) \{[\s\S]*?className = "ad-unavailable"/);
  assert.match(app, /span\.textContent = UNAVAILABLE/);
  assert.match(styles, /\.ad-unavailable \{[^}]*var\(--text-tertiary\)/);
  // Tertiary ink, not a status hue: an unmeasurable field is not an alarm.
  const rule = styles.match(/\.ad-unavailable \{([^}]*)\}/)[1];
  assert.doesNotMatch(rule, /--status-/);

  // Every writer of a value goes through setValue, which is what applies the node.
  assert.match(app, /function setValue\(element, value\)/);
  assert.match(app, /if \(text === UNAVAILABLE\) \{\s*element\.replaceChildren\(unavailableNode\(\)\);/);
  assert.match(app, /function cell\(row, value, heading = false\) \{[\s\S]*?setValue\(element, stringValue\(value\) \|\| UNAVAILABLE\);/);
  assert.match(app, /function setMetric\(name, value\) \{\s*metricElements\(name\)\.forEach\(\(element\) => setValue\(element, value\)\)/);

  // A tone is a claim about a number, so it is never applied to the sentinel, and
  // never to a zero.
  assert.match(app, /if \(tone && text && text !== "—" && !\/\^0\(\[\.,\]0\+\)\?\\s\*%\?\$\/\.test\(text\)\) element\.classList\.add/);

  // The permanently-unavailable fields are still requested and still rendered — they
  // are not special-cased out of existence, they simply say so.
  for (const field of ["production_incidents", "upgrades", "downgrades", "collected_revenue"]) {
    assert.match(app, new RegExp(`projectionValue\\((?:overview|billing), "${field}"`));
  }
});

test("no renderer substitutes a zero for an absent projection", () => {
  // The banned shape: coercing a possibly-absent field to zero before formatting it.
  // "no model requests" and "model requests were not reported" are different facts.
  assert.doesNotMatch(app, /format(?:Count|Credits|Ratio)\([a-zA-Z?.]+ \|\| 0n?\)/);
  // A projection field is never given a fallback value either — projectionValue's own
  // two exits are the sentinel, and a `|| 0` argument would defeat both.
  assert.doesNotMatch(app, /projectionValue\([^)]*\|\| 0\)/);
  // Slices carry no projection status, so they get an explicit unavailable-aware
  // reader rather than a silent default.
  assert.match(app, /function countOrUnavailable\(value\) \{\s*try \{ return formatCount\(value\); \} catch \{ return UNAVAILABLE; \}/);
  // and the banned vocabulary from the previous shell.
  assert.doesNotMatch(app, /No data available/);
});

// Tables misalign silently: a row builder that emits one cell too few shifts every
// column after it and still renders. Arity is checked, per table, against its header.
test("every table body emits exactly as many cells as its header declares", () => {
  const headerCounts = {};
  for (const table of shell.match(/<table[\s\S]*?<\/table>/g) || []) {
    const hook = (table.match(/data-[a-z-]+-rows/) || [])[0];
    if (hook) headerCounts[hook] = (table.match(/<th scope="col"/g) || []).length;
  }

  function functionBody(signature) {
    const start = app.indexOf(signature);
    assert.notEqual(start, -1, `missing builder: ${signature}`);
    let depth = 0;
    let opened = false;
    for (let index = start; index < app.length; index += 1) {
      if (app[index] === "{") { depth += 1; opened = true; }
      else if (app[index] === "}") { depth -= 1; if (opened && depth === 0) return app.slice(start, index + 1); }
    }
    return "";
  }
  function cellCount(body, rowVariable) {
    const direct = (body.match(new RegExp("(?<!numeric)\\bcell\\(" + rowVariable + "\\b", "g")) || []).length;
    const numeric = (body.match(new RegExp("\\bnumericCell\\(" + rowVariable + "\\b", "g")) || []).length;
    const identity = (body.match(new RegExp("\\b" + rowVariable + "\\.append\\(identity\\)", "g")) || []).length;
    return direct + numeric + identity;
  }

  const builders = [
    ["function renderCustomerTable", "row", "data-customer-rows"],
    ["function renderEconomicsSlices", "row", "data-team-economics-rows"],
    ["function runtimeInstanceRow", "row", "data-runtime-rows"],
    ["function alertRow", "row", "data-alert-rows"],
    ["function renderReconciliationIssues", "row", "data-reconciliation-rows"],
    ["function renderAudit(response)", "row", "data-audit-rows"],
    ["function renderBillingAccounts", "row", "data-billing-account-rows"],
    ["function renderBillingAccounts", "controlRow", "data-team-credit-control-rows"],
    ["function renderReliabilityHistoryResult", "row", "data-customer-reliability-rows"]
  ];
  for (const [signature, rowVariable, hook] of builders) {
    assert.ok(headerCounts[hook], `no header found for ${hook}`);
    assert.equal(cellCount(functionBody(signature), rowVariable), headerCounts[hook], `${hook} row arity does not match its header`);
  }
});

// The metrics proxy takes panel NAMES. Not PromQL, not a time range of any length,
// not any step the client fancies. These are the limits it enforces upstream, so a
// control that could exceed them would only produce a rejected request.
test("the metrics surface honours the proxy's documented limits", () => {
  assert.match(app, /\/admin\/v1\/metrics\/query_range/);
  assert.match(app, /METRICS_WINDOWS = \["1h", "6h", "24h"\]/);
  assert.match(app, /METRICS_STEP_SECONDS = "30"/);
  assert.match(app, /METRICS_ENVIRONMENTS = \["development", "production"\]/);

  // No window above 24h can be selected, because no other window exists.
  const windows = app.match(/METRICS_WINDOWS = \[([^\]]+)\]/)[1];
  for (const value of [...windows.matchAll(/"(\d+)h"/g)].map((match) => Number(match[1]))) {
    assert.ok(value <= 24, `window ${value}h exceeds the proxy's 24h ceiling`);
  }
  assert.ok(Number(app.match(/METRICS_STEP_SECONDS = "(\d+)"/)[1]) >= 30, "step is below the proxy's 30s floor");

  // Panel names only. There is no free-text query control anywhere on the screen,
  // and the request is built from a fixed set of parameters.
  assert.match(app, /target\.searchParams\.set\("panel", panel\.key\)/);
  assert.doesNotMatch(app, /searchParams\.set\("query"/);
  assert.doesNotMatch(shell, /data-metrics-query-input|name="query"|placeholder="[^"]*PromQL/i);

  // The echo strip is built by the SAME url builder the fetch uses, so what it
  // shows is provably the request that was sent.
  assert.match(app, /function metricsRequestUrl/);
  assert.ok([...app.matchAll(/metricsRequestUrl\(/g)].length >= 3);

  // The ten panels are exactly the proxy's vocabulary, in the mockup's display
  // order: the six that report, then the four that are empty by construction.
  const panels = [...app.matchAll(/\{ key: "([a-z0-9_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(panels, [
    "request_rate", "error_rate", "latency_p95", "goroutines", "memory_bytes", "queue_depth",
    "target_health", "llm_tokens", "llm_cost_usd", "run_duration"
  ]);
  assert.equal([...app.matchAll(/filterable: true/g)].length, 5);

  // The grid is the design system's metric panel, and an empty one keeps a
  // populated panel's frame rather than collapsing.
  assert.match(app, /className = "dn-mpanel"/);
  assert.match(app, /classList\.toggle\("dn-mpanel--empty"/);
  assert.match(app, /className = `dn-dstate/);
});

// The controls are the design system's, and the markup carries no styling of its own,
// because this page's style-src refuses it.
test("the shell is built from the design system and carries no inline style", () => {
  assert.doesNotMatch(shell, /\sstyle="/);
  assert.doesNotMatch(shell, /<style[\s>]/);
  assert.doesNotMatch(shell, /<script/);
  for (const component of ["dn-card", "dn-stat", "dn-table", "dn-badge", "dn-seg", "dn-nav", "dn-callout", "dn-meta", "dn-tabbar", "dn-crumbs", "dn-input", "dn-dot", "dn-eyebrow", "dn-btn"]) {
    assert.match(shell, new RegExp(`class="[^"]*\\b${component}\\b`), `the shell stopped using ${component}`);
  }
  // The vendored system is linked before the site's own layers, and every layer is
  // present in the right order — theme.css re-derives what ds.css defines.
  const order = ["/assets/css/ds.css", "/assets/css/type.css", "/assets/css/theme.css", "/assets/css/admin.css"];
  const positions = order.map((href) => layout.indexOf(href));
  for (const position of positions) assert.notEqual(position, -1);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

// The audit trail is the one list that must never be narrowed in the browser.
test("the audit trail filters on the server and says so where it cannot", () => {
  assert.match(app, /adminListRequest\("admin_audit_events", "events", \{ action: auditState\.action \}/);
  const client = readFileSync("src/admin-api-client.ts", "utf8");
  assert.match(client, /action: optionalTextField\(payload, "action"\)/);
  // The filter vocabulary is discovered from returned records, never hardcoded.
  assert.match(app, /auditState\.actions = \[\.\.\.new Set\(events\.map/);
  // There is no request-ID filter in the contract, so the box is inert and explains
  // itself rather than quietly filtering immutable records client-side.
  assert.match(app, /auditRequestId\.disabled = true/);
  assert.match(app, /There is no request-ID filter in the API/);
});
