"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = readFileSync("assets/js/callback-scrubber.js", "utf8");

test("the authorization code is captured non-enumerably and removed before other assets load", () => {
  const replacements = [];
  const window = {
    location: { search: "?code=one-time-code&state=opaque-state", pathname: "/auth/callback/", hash: "" },
    history: { replaceState(state, title, url) { replacements.push({ state, title, url }); } }
  };
  vm.runInNewContext(source, { window });
  assert.equal(window.deepNavyAdminInitialQuery, "?code=one-time-code&state=opaque-state");
  assert.equal(Object.prototype.propertyIsEnumerable.call(window, "deepNavyAdminInitialQuery"), false);
  assert.equal(replacements.length, 1);
  assert.deepEqual(Object.keys(replacements[0].state), []);
  assert.equal(replacements[0].title, "");
  assert.equal(replacements[0].url, "/auth/callback/");
});
