"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const source = readFileSync("assets/js/admin.js", "utf8");

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
