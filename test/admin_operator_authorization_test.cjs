"use strict";

// The founder signed in with Google, successfully, and the console answered "the
// platform could not authorize this operator / authentication failed". The request id
// on the screen led straight to the cause: the console was asking
// AuthService.GetCurrentUser — the CUSTOMER identity service, behind the customer
// authentication interceptor and the customer user pool — while holding a credential
// minted by the dedicated operator pool. Different issuer, so 401, every time,
// permanently. There was no sign-in that could have worked.
//
// These tests pin the repair, and they are deliberately behavioural where they can be:
// the failure copy is what a human acts on, so the copy is executed, not grepped.
//
//   * the console never reaches the customer identity service
//   * authorization is one seam with one call site
//   * the three failures a human must tell apart read differently, and offer
//     different things to do
//   * severity comes from the design system's ladder, not from a table invented here

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const source = readFileSync("assets/js/admin.js", "utf8");
const layout = readFileSync("_layouts/default.html", "utf8");
const shell = readFileSync("_includes/admin-console.html", "utf8");
const ladder = require("../assets/js/notice-levels.js");

const stringValue = (value) => (typeof value === "string" ? value.trim() : "");

// Lift a declaration out of the console verbatim and run it, so these assertions are
// about the shipped behaviour rather than about a copy of it that could drift.
function lift(pattern, name) {
  const match = source.match(pattern);
  assert.ok(match, `${name} is no longer declared in the shape this test lifts it from`);
  return match[0];
}

const failureTable = lift(/const AUTHORIZATION_FAILURES = Object\.freeze\(\{[\s\S]*?\n {2}\}\);/, "AUTHORIZATION_FAILURES");
const failureLookup = lift(/function authorizationFailure\(code\) \{[\s\S]*?\n {2}\}/, "authorizationFailure");
const decodeJwt = lift(/function decodeJwtPayload\(token\) \{[\s\S]*?\n {2}\}/, "decodeJwtPayload");
const operatorClaims = lift(/function operatorFromIdToken\(idToken\) \{[\s\S]*?\n {2}\}/, "operatorFromIdToken");

// eslint-disable-next-line no-new-func
const authorizationFailure = new Function(
  "stringValue",
  `${failureTable}\n${failureLookup}\nreturn authorizationFailure;`
)(stringValue);

// eslint-disable-next-line no-new-func
const operatorFromIdToken = new Function(
  "stringValue",
  "window",
  `${decodeJwt}\n${operatorClaims}\nreturn operatorFromIdToken;`
)(stringValue, { atob });

function idToken(claims) {
  const segment = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${segment({ alg: "RS256" })}.${segment(claims)}.signature-is-not-checked-in-the-browser`;
}

// "Errors and blocks say what happened, what it means, and what happens next — in
// that order, in three clauses or fewer."
function clauses(message) {
  return message.split(/(?<=\.)\s+/).filter(Boolean);
}

/* ---- the customer identity service is unreachable from here ------------- */

test("the console never asks the customer identity service who the operator is", () => {
  // The procedure name is the only thing the console can utter to reach it. (The
  // service is named in a comment above the seam, which is the point: the next person
  // to reach for it should find out first why it cannot work.)
  assert.ok(!source.includes("current_user"), "the admin console still names the customer identity procedure");
  // Not relocated, not renamed: the client itself no longer offers the procedure.
  const client = readFileSync("src/admin-api-client.ts", "utf8");
  assert.doesNotMatch(client, /"current_user"/);
  assert.doesNotMatch(client, /auth\.getCurrentUser/);
  assert.doesNotMatch(client, /from "\.\.\/vendor\/platform-protos\/deepnavy\/v1\/auth_pb\.js"/);
  // And the shipped bundle carries none of it either.
  const bundle = readFileSync("assets/js/admin-api-client.js", "utf8");
  for (const banned of ["current_user", "GetCurrentUser", "AuthService"]) {
    assert.ok(!bundle.includes(banned), `the shipped bundle still references ${banned}`);
  }
});

/* ---- one seam ----------------------------------------------------------- */

test("authorization is established once, by an administrator request", () => {
  assert.match(source, /const AUTHORIZATION_PROBE = "admin_overview"/);
  assert.equal([...source.matchAll(/async function authorizeOperator\(/g)].length, 1);
  assert.equal([...source.matchAll(/authorizeOperator\(idToken\)/g)].length, 2,
    "the seam must have exactly one call site, or replacing the probe is not one edit");
  // Only the platform's answer sits inside the seam's try: a render that throws must
  // not be reported to an operator as an authorization failure.
  assert.match(source, /let overview;\n {4}try \{\n {6}overview = await adminApi\.request\(AUTHORIZATION_PROBE/);
  // The session is only marked authorized after the platform has answered.
  assert.ok(source.indexOf("overview = await adminApi.request(AUTHORIZATION_PROBE") < source.indexOf("state.authorized = true;\n    showAuthenticated(operator)"));
});

test("the probe's answer is the first overview, so signing in costs one request", () => {
  assert.match(source, /await refreshDashboard\(overview\)/);
  assert.match(source, /async function loadOverview\(signal, seeded\)/);
  assert.match(source, /const response = seeded \|\| await adminApi\.request\("admin_overview"/);
  assert.match(source, /loadOverview\(state\.refreshController\.signal, seededOverview\)/);
  // The refresh button must never hand its own click event to the seed parameter.
  assert.match(source, /ui\.refresh\.addEventListener\("click", \(\) => refreshDashboard\(\)\)/);
});

/* ---- the three failures a human has to tell apart ----------------------- */

test("a rejected credential says to sign in again", () => {
  const failure = authorizationFailure("unauthenticated");
  assert.equal(failure.level, "error");
  assert.equal(failure.canStartAgain, true, "signing in again is exactly the fix here");
  assert.match(failure.title, /not accepted/i);
  assert.match(failure.message, /Sign in again\./);
  assert.ok(clauses(failure.message).length <= 3);
});

test("a refused operator is told that signing in again will not help", () => {
  const failure = authorizationFailure("permission_denied");
  assert.equal(failure.level, "blocked");
  assert.equal(failure.canStartAgain, false, "offering 'start again' here sends a human round a loop for nothing");
  assert.match(failure.message, /signing in again will not change it/i);
  assert.doesNotMatch(failure.message, /Sign in again\./);
  // It names who can change it, because the console cannot.
  assert.match(failure.message, /account owner/i);
  assert.ok(clauses(failure.message).length <= 3);
});

test("an unreachable platform decides nothing, and says so", () => {
  for (const code of ["unavailable", "deadline_exceeded", "unknown", "internal", "", undefined]) {
    const failure = authorizationFailure(code);
    assert.equal(failure.level, "warning", `${code} must not be reported as a refusal`);
    assert.equal(failure.canStartAgain, true);
    assert.match(failure.message, /Nothing about this operator was decided/);
    assert.match(failure.message, /Try again/);
    assert.ok(clauses(failure.message).length <= 3);
  }
});

test("an undeployed operator surface is a deployment gap, not a sign-in problem", () => {
  const failure = authorizationFailure("unimplemented");
  assert.equal(failure, authorizationFailure("not_found"), "a service that is not mounted answers 404 or 501 for the same reason");
  assert.equal(failure.canStartAgain, false);
  assert.match(failure.message, /needs a deployment, not another sign-in/);
  assert.ok(clauses(failure.message).length <= 3);
});

test("the three failures are three different messages, and none of them is generic", () => {
  const failures = ["unauthenticated", "permission_denied", "unavailable"].map(authorizationFailure);
  assert.equal(new Set(failures.map((failure) => failure.title)).size, 3);
  assert.equal(new Set(failures.map((failure) => failure.message)).size, 3);
  assert.equal(new Set(failures.map((failure) => failure.level)).size, 3);
  for (const failure of failures) {
    assert.doesNotMatch(failure.message, /try again later|an error occurred|something went wrong/i);
  }
  // The request reference survives every one of them: it is what turned this bug from
  // a mystery into a log line in fifteen seconds.
  assert.match(source, /const reference = stringValue\(error\?\.requestId\) \|\| clientRequestId;/);
  assert.match(source, /showAuthNotice\(failure\.level, failure\.title, failure\.message, reference, failure\.canStartAgain\)/);
  assert.match(source, /Request reference: \$\{requestId\}/);
});

/* ---- severity comes from the ladder ------------------------------------- */

test("severity is the design system's ladder, ported rather than reinvented", () => {
  // The table from the briefing, in full. This file is the site console's copy byte
  // for byte, so a level means the same thing in both consoles.
  const expected = {
    blocked: { word: "Blocked", glyph: "octagon-alert", tone: "danger", rank: 0 },
    error: { word: "Error", glyph: "circle-x", tone: "danger", rank: 1 },
    warning: { word: "Warning", glyph: "triangle-alert", tone: "attention", rank: 2 },
    tip: { word: "Tip", glyph: "lightbulb", tone: "tip", rank: 3 },
    running: { word: "Running", glyph: "radio", tone: "live", rank: 4 },
    success: { word: "Done", glyph: "circle-check-big", tone: "success", rank: 5 },
    info: { word: "Update", glyph: "info", tone: "idle", rank: 6 }
  };
  for (const [name, level] of Object.entries(expected)) {
    assert.equal(ladder.NOTICE_LEVELS[name].word, level.word);
    assert.equal(ladder.NOTICE_LEVELS[name].glyph, level.glyph);
    assert.equal(ladder.NOTICE_LEVELS[name].tone, level.tone);
    assert.equal(ladder.NOTICE_LEVELS[name].rank, level.rank);
  }
  assert.equal(ladder.NOTICE_LEVELS.blocked.needsYou, true);

  // Every level this console reports is a level the ladder defines, and the three
  // authorization failures are ordered the way a human would rank them: a refusal
  // only a person can clear outranks a credential the operator can replace, which
  // outranks a platform that simply did not answer.
  const levels = [...source.matchAll(/level: "([a-z]+)"/g)].map((match) => match[1]);
  assert.ok(levels.length >= 4);
  for (const level of levels) assert.ok(ladder.NOTICE_LEVELS[level], `${level} is not a level the ladder defines`);
  assert.ok(ladder.level("blocked").rank < ladder.level("error").rank);
  assert.ok(ladder.level("error").rank < ladder.level("warning").rank);

  // The console resolves a callout's tone through the ladder, and the only thing it
  // decides for itself is which of dn-callout's four modifiers a tone has.
  assert.match(source, /CALLOUT_FOR_LEVEL_TONE\[noticeLevels\?\.level\(level\)\.tone\]/);
  assert.equal([...source.matchAll(/dn-callout--/g)].length, 4,
    "a second place that maps severity to a callout class is a second opinion about severity");
  for (const tone of ["danger", "attention", "live", "success"]) {
    assert.match(source, new RegExp(`${tone}: " dn-callout--${tone}"`));
  }
  // The ladder ships with the page, and a build that loses it is a loud configuration
  // fault rather than a console that quietly renders every severity the same.
  assert.match(source, /if \(!noticeLevels\) missing\.push\("severity ladder"\)/);
  assert.ok(layout.indexOf("/assets/js/notice-levels.js") > 0);
  assert.ok(layout.indexOf("/assets/js/notice-levels.js") < layout.indexOf("/assets/js/admin.js"));
});

/* ---- the operator's name is cosmetic, and is labelled as such ----------- */

test("the operator's name comes from the ID token the browser already holds", () => {
  const operator = operatorFromIdToken(idToken({ name: "Perris Wilcox", email: "perris@deep.navy" }));
  assert.equal(operator.name, "Perris Wilcox");
  assert.equal(operator.email, "perris@deep.navy");

  // A token with no name still identifies the account, and still never produces a
  // monogram out of an email local-part.
  const anonymous = operatorFromIdToken(idToken({ email: "perris@deep.navy" }));
  assert.equal(anonymous.name, "");
  assert.equal(anonymous.email, "perris@deep.navy");
  assert.deepEqual(operatorFromIdToken("not-a-token"), { name: "", email: "" });

  assert.match(source, /ui\.operatorName\.textContent = operator\.name \|\| operator\.email \|\| "Signed-in operator"/);
  assert.match(source, /element\.textContent = operator\.name\.split/);
});

test("the sidebar states what authorized the session instead of claiming a role", () => {
  // The role line is gone from the markup as well as from the script: a slot named
  // "role" is an invitation to put a role back into it.
  assert.doesNotMatch(shell, /data-operator-role/);
  assert.doesNotMatch(source, /data-operator-role/);
  assert.match(shell, /data-operator-authority/);
  assert.match(source, /ui\.operatorAuthority\.textContent = "Authorized by the platform"/);
  // And it is cleared with the rest of the operator chrome on sign-out, so it can
  // never outlive the session it describes.
  assert.match(source, /function showSignedOut\(\) \{[\s\S]*?ui\.operatorAuthority\.textContent = "";/);
  // The claim the console makes about itself is unchanged, and still true.
  assert.match(shell, /The UI is not the authorization boundary/);
});
