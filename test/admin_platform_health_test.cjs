"use strict";

// The Platform panel: the platform's own five services, reported by
// platform-api's bounded in-cluster poller through GetAdminPlatformHealth and
// kept live by StreamAdminPlatformHealth. Everything here guards the ways this
// surface could lie while looking healthy:
//
//   - a status painted in colour alone, which vanishes in grayscale
//   - an unobserved service rendering as blank health instead of saying
//     "we could not observe this" — unknown is not healthy
//   - a check's detail sentence reaching the DOM as markup instead of data
//   - the health stream being given a cursor it does not have, which would
//     read as resumption on a surface that only ever replays current state

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const app = readFileSync("assets/js/admin.js", "utf8");
const client = readFileSync("src/admin-api-client.ts", "utf8");
const shell = readFileSync("_includes/admin-console.html", "utf8");
const ladder = require("../assets/js/notice-levels.js");

// Slice one function out of the app source by brace matching, the same way
// admin_console_structure_test.cjs reasons about a single builder in isolation.
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

// The real functions, extracted and run — the same technique the security
// test uses on safeOAuthDescription. What executes here is the shipped code.
function extractedHelpers() {
  const parts = [
    'const UNAVAILABLE = "unavailable";',
    functionBody("function integerValue"),
    functionBody("function timestampMilliseconds"),
    app.match(/const PLATFORM_STATUS_LEVELS = [^\n]+/)[0],
    functionBody("function platformStatusLevel"),
    functionBody("function formatRelativeTime")
  ];
  // eslint-disable-next-line no-new-func
  return new Function(`${parts.join("\n")}\nreturn { platformStatusLevel, formatRelativeTime };`)();
}

test("both platform health procedures are registered the way the other admin procedures are", () => {
  // The unary read sits in the frozen procedure list and routes to the
  // generated method; the stream sits in the stream list and routes to its.
  assert.match(client, /"admin_platform_health"/);
  assert.match(client, /case "admin_platform_health":\s*\n\s*return await admin\.getAdminPlatformHealth\(\{\}, callOptions\);/);
  assert.match(client, /"admin_platform_health_stream"/);
  assert.match(client, /case "admin_platform_health_stream":\s*\n\s*iterable = admin\.streamAdminPlatformHealth\(\{\}, callOptions\);/);

  // No cursor, by contract: health is a state, not a log. The stream request
  // is empty — an afterSequence here would claim a resumption the server
  // cannot honour.
  assert.doesNotMatch(client, /streamAdminPlatformHealth\(\{ afterSequence/);

  // The console loads it with the other operations projections, streams it
  // beside the other admin streams (with the empty cursor key that makes
  // runStream send an empty request), and a manual refresh reseeds it.
  assert.match(app, /adminRequest\("admin_platform_health", \{\}, signal\)/);
  assert.match(app, /runStream\("admin_platform_health_stream", "", controller, applyPlatformHealthUpsert\)/);
  assert.match(app, /cursorKey \? \{ afterSequence: state\[cursorKey\]\.toString\(\) \} : \{\}/);
  const refresh = app.slice(app.indexOf("async function refreshDashboard"), app.indexOf("function signOut"));
  assert.match(refresh, /state\.platformHealth = new Map\(\);/, "a manual refresh must reseed the health map");
});

test("a status renders as the ladder's word, glyph and tone — never colour alone", () => {
  // The wire's grades resolve onto NOTICE_LEVELS: FAILED is the ladder's
  // error, DEGRADED its warning, OK its success, and an ungraded status falls
  // to the ladder's lowest rung rather than borrowing an alarming one.
  const { platformStatusLevel } = extractedHelpers();
  assert.equal(platformStatusLevel(3), "error");
  assert.equal(platformStatusLevel(2), "warning");
  assert.equal(platformStatusLevel(1), "success");
  assert.equal(platformStatusLevel(0), "info");
  assert.equal(platformStatusLevel(undefined), "info");

  // The ladder itself says what those levels look like; this panel adds no
  // vocabulary of its own. Pin the words the operator will actually read.
  assert.equal(ladder.level("error").word, "Error");
  assert.equal(ladder.level("error").tone, "danger");
  assert.equal(ladder.level("warning").word, "Warning");
  assert.equal(ladder.level("warning").tone, "attention");
  assert.equal(ladder.level("success").word, "Done");
  assert.equal(ladder.level("success").tone, "success");

  // The badge carries all three cues together: the word as a text node, the
  // glyph as a sprite reference, the tone as the badge modifier. Take any one
  // away and the grayscale test fails.
  const badge = functionBody("function ladderBadge");
  assert.match(badge, /document\.createTextNode\(level\.word\)/);
  assert.match(badge, /SPRITE_FOR_LADDER_GLYPH\[level\.glyph\]/);
  assert.match(badge, /BADGE_FOR_LADDER_TONE\[level\.tone\]/);

  // Every glyph the three levels name resolves to a symbol the sprite draws.
  const spriteIds = [...shell.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map((match) => match[1]);
  const glyphMap = app.match(/const SPRITE_FOR_LADDER_GLYPH = \{([^}]+)\}/)[1];
  for (const levelName of ["error", "warning", "success", "info"]) {
    const glyph = ladder.level(levelName).glyph;
    const mapped = glyphMap.match(new RegExp(`"?${glyph}"?: "([a-z0-9-]+)"`));
    assert.ok(mapped, `the ladder's ${glyph} glyph has no sprite translation`);
    assert.ok(spriteIds.includes(mapped[1]), `#i-${mapped[1]} is not in the sprite`);
  }
});

test("an unobserved service says so in words, never as blank health", () => {
  // The contract sends observed=false with a FAILED reachability check when a
  // service's health surface could not be reached. The card must render the
  // honest unavailable empty — a blank card beside healthy cards reads as
  // healthy, which is the exact lie this panel exists to prevent.
  const card = functionBody("function platformServiceCard");
  assert.match(card, /service\?\.observed !== true/);
  assert.match(card, /We could not observe this service/);
  assert.match(card, /unknown is not healthy/);
  // The strict !== true comparison means an ABSENT observed field is also the
  // unavailable empty: only the server's explicit true claims observation.
  assert.doesNotMatch(card, /observed !== false/);
});

test("the panel's three empties are three different sentences", () => {
  // Loading/never-loaded, source-unavailable, and answered-with-nothing are
  // different facts, and each must wear its own words — the four-empties
  // doctrine. "No data available" stays banned vocabulary.
  assert.match(shell, /data-platform-empty[^>]*>Waiting for the first platform health observation\./);
  assert.match(app, /clearPlatformHealth\("Platform health is unavailable\. No service status was inferred; unknown is not healthy\."\)/);
  assert.match(app, /The health surface answered with no service reports\./);
  assert.doesNotMatch(app, /No data available/);
});

test("the check rows are name, status word, latency, and detail-as-data", () => {
  const checks = functionBody("function platformCheckTable");

  // The header declares four columns and every row emits exactly four cells —
  // the same arity discipline the structure test applies to the static tables,
  // applied here because this table's header lives in the builder.
  const headers = checks.match(/\["Check", "Status", "Latency", "Detail"\]/);
  assert.ok(headers, "the check table lost its four-column header");
  const direct = (checks.match(/(?<!numeric)\bcell\(row\b/g) || []).length;
  const numeric = (checks.match(/\bnumericCell\(row\b/g) || []).length;
  const manual = (checks.match(/\brow\.append\(detail\)/g) || []).length;
  assert.equal(direct + numeric + manual, 4, "check row arity does not match its own header");

  // The status is the ladder badge — word beside glyph beside tone.
  assert.match(checks, /ladderBadge\(platformStatusLevel\(check\?\.status\)\)/);

  // Latency is a measured number with its unit, or the unavailable word —
  // never a bare zero standing in for "not measured".
  assert.match(checks, /countOrUnavailable\(check\?\.latencyMs\)/);
  assert.match(checks, /latency === UNAVAILABLE \? latency : `\$\{latency\} ms`/);

  // The detail sentence is data. textContent is the only way it may land, and
  // an empty detail (the contract's "nothing to report" on an OK check) stays
  // empty rather than being restated as unavailability.
  assert.match(checks, /detail\.textContent = stringValue\(check\?\.detail\)/);
  assert.doesNotMatch(checks, /innerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(functionBody("function platformServiceCard"), /innerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(functionBody("function renderPlatformServices"), /innerHTML|insertAdjacentHTML/);
});

test("observed_at renders as an age, with the absolute stamp on the title", () => {
  const { formatRelativeTime } = extractedHelpers();
  const nowSeconds = Math.floor(Date.now() / 1000);
  assert.match(formatRelativeTime({ seconds: BigInt(nowSeconds - 41) }), /41|second/i);
  assert.match(formatRelativeTime({ seconds: BigInt(nowSeconds - 2 * 3600) }), /hour/i);
  // A missing or malformed timestamp is the unavailable word, never "just now".
  assert.equal(formatRelativeTime(null), "unavailable");
  assert.equal(formatRelativeTime({ seconds: "not-a-number" }), "unavailable");

  const card = functionBody("function platformServiceCard");
  assert.match(card, /formatRelativeTime\(service\?\.observedAt\)/);
  assert.match(card, /\.title = formatTimestamp\(service\?\.observedAt\)/);
});

test("the panel sorts by the ladder's own loudness and re-applies icon motion", () => {
  const render = functionBody("function renderPlatformServices");
  // Lower rank is louder, so a failed service tops the grid; names break ties
  // so the grid stays put between stream re-renders.
  assert.match(render, /noticeLevels\.level\(platformStatusLevel\(left\?\.status\)\)\.rank - noticeLevels\.level\(platformStatusLevel\(right\?\.status\)\)\.rank/);
  assert.match(render, /localeCompare/);
  // The cards are built after the startup icon pass, so the pass runs again
  // over just this subtree — the resolver classifies from the glyph name, and
  // no motion family is ever hardcoded.
  assert.match(render, /deepNavyIconMotion\?\.applyIconMotion\(host\)/);
});

test("the public shell names no service and the sprite additions animate", () => {
  // The section is empty markup plus honest sentences; every service name
  // arrives as authenticated data. The five real names must not be pre-printed
  // into the world-readable page.
  const operations = shell.slice(shell.indexOf('data-view="operations"'), shell.indexOf('data-view="billing"'));
  assert.match(operations, /data-platform-services/);
  assert.match(operations, /data-platform-empty/);
  for (const name of ["platform-api", "agent-stream-service", "economics-service", "github-service", "team-provisioner"]) {
    assert.ok(!shell.includes(name), `service name pre-printed into the public shell: ${name}`);
  }

  // The two glyphs added for the ladder carry pathLength on every shape and
  // resolve to a motion family, like every other symbol in the sprite.
  const iconMotion = require("../assets/js/icon-motion.js");
  for (const id of ["circle-x", "circle-check-big"]) {
    const symbol = shell.match(new RegExp(`<symbol id="i-${id}"[\\s\\S]*?</symbol>`));
    assert.ok(symbol, `the sprite lost #i-${id}`);
    const shapes = [...symbol[0].matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*>/g)];
    assert.ok(shapes.length > 0);
    assert.ok(shapes.every((match) => /\bpathLength="1"/.test(match[0])), `#i-${id} has a shape without pathLength`);
    assert.ok(iconMotion.FAMILIES.includes(iconMotion.motionFor(id)), `#i-${id} has no motion family`);
  }
});
