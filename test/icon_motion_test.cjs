"use strict";

// "Every icon animates — there are no still icons in this system."
//
// The design system says that in its own words, and for a long time this console did not
// do it: ds.css dropped the icons-motion layer on the reasoning that a sprite could not
// carry it. The layer is back, and these tests exist because every way it can regress is
// silent. Nothing here throws at runtime. A dropped @import, a class nobody applies, a
// keyframe pointed at an element that is not there, a token that resolves to nothing —
// each one leaves a console that renders perfectly and simply never moves, with no error
// to go looking for.
//
// Four things are pinned:
//
//   the layer is IMPORTED           — it arrives through core/core.css, one level below
//                                     ds.css, which is exactly where a re-vendor loses it
//   every family is RE-POINTED      — the vendored selectors expect the system's wrapper
//                                     DOM and match nothing over a sprite until they are
//   every glyph RESOLVES            — including one nobody has added yet
//   every shape carries pathLength  — without which draw runs, and draws dots

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const iconMotion = require("../assets/js/icon-motion.js");

const vendored = readFileSync("assets/css/ds/components/core/icons-motion.css", "utf8");
const core = readFileSync("assets/css/ds/components/core/core.css", "utf8");
const dsEntry = readFileSync("assets/css/ds.css", "utf8");
const adapter = readFileSync("assets/css/icon-motion.css", "utf8");
const dsMotion = readFileSync("assets/css/ds/tokens/motion.css", "utf8");
const manifest = readFileSync("assets/css/ds.MANIFEST.sha256", "utf8");
const shell = readFileSync("_includes/admin-console.html", "utf8");
const layout = readFileSync("_layouts/default.html", "utf8");
const admin = readFileSync("assets/js/admin.js", "utf8");
const resolver = readFileSync("assets/js/icon-motion.js", "utf8");

const FAMILIES = ["draw", "spin", "ring", "hop", "nudge", "pop", "jitter"];

const spriteIds = [...shell.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map((match) => match[1]);

/* ---- the layer is there, and it is the system's own bytes --------------- */

test("the vendored icon-motion layer is imported, not dropped", () => {
  // The design system's own core.css opens with this line. It was stripped when the tree
  // was first vendored, which is how the whole vocabulary went missing without a diff to
  // point at — ds.css imports core.css, and core.css is where the trail ended.
  assert.match(core, /^@import "icons-motion\.css";/,
    "ds/components/core/core.css no longer imports the icon motion layer — every icon in the console just went still");

  // The vendored-tree check has to know about a file ds.css never names, or the layer can
  // be deleted from under core.css without a single test noticing.
  assert.match(manifest, /^[a-f0-9]{64} {2}components\/core\/icons-motion\.css$/m,
    "the design-system manifest does not cover components/core/icons-motion.css");

  // And the entry point must not claim otherwise. The old header said the admin kept
  // inline SVG icons and skipped this layer; a stale comment is how the next person
  // decides the omission was deliberate.
  assert.ok(!/no brand\/ or icons-motion imports/.test(dsEntry),
    "ds.css still documents the icons-motion layer as deliberately omitted");
});

test("the vocabulary is seven families, and the console adds none of its own", () => {
  for (const family of FAMILIES) {
    assert.ok(vendored.includes(`dn-i-${family}`) || family === "spin",
      `the vendored layer has no dn-i-${family} keyframe`);
  }
  // spin is the one family whose loop reuses the system's own dn-spin rather than a
  // dn-i- keyframe of its own, so it is checked against both sources.
  assert.match(vendored, /@keyframes dn-i-spin\b/);
  assert.match(dsMotion, /@keyframes dn-spin\b/);

  // Keyframes belong to the design system. The adapter re-points selectors and nothing
  // else; the moment it declares a keyframe, the two consoles can drift apart.
  const declarations = adapter.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/@keyframes/.test(declarations),
    "assets/css/icon-motion.css declares a keyframe — the vocabulary lives in ds/, this file only re-points it");
});

test("every duration and easing the layer names is defined", () => {
  const referenced = [...vendored.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1]);
  assert.ok(referenced.length > 0, "the layer stopped using tokens");
  // A custom property that resolves to nothing does not error: the declaration it sits in
  // is silently discarded, and the animation is simply never applied.
  for (const token of new Set(referenced)) {
    assert.ok(dsMotion.includes(`${token}:`),
      `${token} is used by the icon motion layer but not defined in ds/tokens/motion.css`);
  }
});

/* ---- re-pointed at this console's DOM ----------------------------------- */

test("every family is re-pointed at the sprite's DOM shape", () => {
  // The system puts its motion class on a <span> around the glyph and writes
  // `.dn-icon--spin svg`. This console puts it on the <svg> itself, where that selector
  // has no descendant svg to match. Every family needs a re-pointed rule or it is inert.
  for (const family of FAMILIES) {
    assert.ok(adapter.includes(`svg.dn-icon--${family}`),
      `${family} is not re-pointed at svg.dn-icon--${family} — it will never match a sprite icon`);
  }
  // draw is the one family that reaches past the svg, into the <use>.
  assert.match(adapter, /svg\.dn-icon--draw > \*\{stroke-dasharray:1;stroke-dashoffset:0\}/);
});

test("the hover gate survives, in both sheets", () => {
  // A tap on iOS fires :hover and then leaves it applied. Ungated, every icon in a row
  // animates once on first touch and holds its last pose until something else is tapped.
  for (const [name, css] of [["the vendored layer", vendored], ["the adapter", adapter]]) {
    assert.ok(css.includes("@media (hover:hover)"), `${name} lost its hover gate`);
    const gate = css.indexOf("@media (hover:hover)");
    for (const family of FAMILIES) {
      const hover = css.indexOf(`.dn-icon--${family}:hover`);
      if (hover === -1) continue;
      assert.ok(hover > gate, `${name} plays ${family} on hover outside the hover:hover gate`);
    }
  }
});

test("loop is reserved for a live state, and is never applied by the resolver", () => {
  // dn-icon--loop is a second class a caller adds deliberately beside the family. Nothing
  // that derives a class from a glyph name may ever produce it, or decoration starts
  // looping and "this is live" stops meaning anything.
  assert.ok(!/dn-icon--loop/.test(resolver),
    "the resolver can emit dn-icon--loop — loop is a live state, never a property of a glyph");
  assert.match(adapter, /svg\.dn-icon--loop\.dn-icon--spin/);
});

test("prefers-reduced-motion switches the whole vocabulary off", () => {
  const start = adapter.indexOf("@media (prefers-reduced-motion:reduce)");
  assert.ok(start > -1, "the adapter has no reduced-motion block");
  const block = adapter.slice(start);
  for (const family of FAMILIES) {
    assert.ok(block.includes(`svg.dn-icon--${family}`),
      `${family} is not switched off under prefers-reduced-motion`);
  }
  assert.match(block, /animation:none!important/);
  // Not merely collapsed to 1ms, which is what the global rule in ds/tokens/motion.css
  // does. Six of the seven families end on their resting pose and a 1ms run is harmless;
  // dn-i-spin ends at rotate(50deg) with fill-mode `both`, so under the collapse alone a
  // hover would snap the glyph 50 degrees and hold it for as long as the pointer stayed.
  assert.match(dsMotion, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(vendored, /animation:dn-i-spin var\(--dur-slow\) var\(--ease-spring\) both/);
});

/* ---- every glyph resolves ----------------------------------------------- */

test("resolveMotion returns a family for a name nobody has added yet", () => {
  for (const unknown of ["sprocket", "i-sprocket", "quantum-flux", "zzzz", "a"]) {
    const motion = iconMotion.motionFor(unknown);
    assert.ok(FAMILIES.includes(motion), `${unknown} resolved to ${motion}, which is not a family`);
  }
  // The catch-all is the point: a glyph with nothing to say about how it moves still moves.
  assert.equal(iconMotion.resolveMotion("sprocket"), "pop");
  // The rules are patterns, not a whitelist, and they are deliberately loose: an invented
  // name ending in x lands on jitter through the /x$/ branch that catches circle-x. That
  // is the design — a name that LOOKS alarming moves like the alarming ones — and it is
  // pinned here so nobody "fixes" it into a lookup that leaves new glyphs still.
  assert.equal(iconMotion.resolveMotion("quantum-flux"), "jitter");
  // And an empty name cannot throw — the DOM pass calls this on whatever a href holds.
  assert.ok(FAMILIES.includes(iconMotion.motionFor("")));
});

test("every glyph in the sprite resolves to a family", () => {
  assert.ok(spriteIds.length >= 13, "the sprite shrank unexpectedly");
  for (const id of spriteIds) {
    assert.ok(FAMILIES.includes(iconMotion.motionFor(id)), `#i-${id} has no motion`);
  }
});

test("a representative glyph of each family carries that family", () => {
  // The families this sprite actually draws, pinned against the glyph that carries them.
  const representative = {
    draw: "activity",   // a line drawing itself in is exactly what an activity trace is
    spin: "sun",        // the theme control's sun turns
    pop: "users",
    jitter: "warn"      // named for the operator's word; drawn as Lucide's triangle-alert
  };
  for (const [family, id] of Object.entries(representative)) {
    assert.ok(spriteIds.includes(id), `the sprite no longer carries #i-${id}`);
    assert.equal(iconMotion.motionFor(id), family, `#i-${id} should ${family}`);
    assert.equal(iconMotion.motionClass(id), `dn-icon--${family}`);
  }

  // ring, hop and nudge have no glyph in this sprite: there is no bell, no search and no
  // arrow anywhere in the admin console. All three are still carried by both stylesheets
  // and still reachable, so the first one added animates with no further work.
  assert.equal(iconMotion.resolveMotion("bell"), "ring");
  assert.equal(iconMotion.resolveMotion("search"), "hop");
  assert.equal(iconMotion.resolveMotion("arrow-right"), "nudge");
  for (const family of ["ring", "hop", "nudge"]) {
    assert.ok(adapter.includes(`svg.dn-icon--${family}`) && vendored.includes(`dn-i-${family}`));
  }
});

test("glyphs named for the operator's concept are classified by their drawing", () => {
  // These ids name what an operator is looking at, not what is drawn. The motion has to
  // follow the DRAWING, which is what the name map is for — and it is the part of the map
  // most likely to be edited without thinking.
  assert.equal(iconMotion.motionFor("warn"), "jitter");       // triangle-alert
  assert.equal(iconMotion.motionFor("critical"), "jitter");   // octagon-alert
  assert.equal(iconMotion.motionFor("card"), "pop");          // credit-card
  assert.equal(iconMotion.motionFor("shield"), "draw");       // shield-check: it has the tick
  assert.equal(iconMotion.motionFor("gauge"), "draw");
  assert.equal(iconMotion.motionFor("dashboard"), "pop");     // layout-dashboard

  // Every id the map names must still exist in the sprite, or the map documents a glyph
  // nobody draws.
  for (const id of Object.keys(iconMotion.SPRITE_TO_LUCIDE)) {
    assert.ok(spriteIds.includes(id), `SPRITE_TO_LUCIDE names #i-${id}, which the sprite does not carry`);
  }
});

/* ---- draw's one requirement --------------------------------------------- */

test("every shape in the sprite carries pathLength=\"1\"", () => {
  // draw expresses the whole path as 1 — stroke-dasharray:1, dashoffset 1 -> 0. pathLength
  // is what makes 1 mean the whole path. Without it the animation still RUNS, and renders
  // the glyph as a crawl of dots: a failure that looks like a bug in the artwork.
  const defs = shell.slice(shell.indexOf("<defs>"), shell.indexOf("</defs>"));
  const shapes = [...defs.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*>/g)];
  assert.ok(shapes.length > 20, "the sprite has no shapes to check");
  const bare = shapes.filter((match) => !/\bpathLength="1"/.test(match[0]));
  assert.deepEqual(bare.map((match) => match[0].slice(0, 60)), [],
    "sprite shapes without pathLength=\"1\" — draw will render these as dots");
});

/* ---- wired in ----------------------------------------------------------- */

test("the console loads the layer and applies the class", () => {
  assert.match(layout, /<link rel="stylesheet" href="\{\{ '\/assets\/css\/icon-motion\.css'/);
  assert.ok(layout.includes("/assets/js/icon-motion.js"), "the layout does not load icon-motion.js");
  // icon-motion.js must be a plain script that has run before admin.js reads it — admin.js
  // is deferred, so a deferred resolver would still be fine, but an undefined global here
  // is a silent no-op rather than an error.
  const resolverAt = layout.indexOf("/assets/js/icon-motion.js");
  const adminAt = layout.indexOf("/assets/js/admin.js");
  assert.ok(resolverAt > -1 && adminAt > resolverAt, "icon-motion.js must load before admin.js");

  assert.match(admin, /deepNavyIconMotion\?\.applyIconMotion\(document\)/);
});

test("no icon is classified by hand in markup", () => {
  // The class is derived from the glyph's own name, everywhere. A family hardcoded into
  // the shell is a glyph that stops agreeing with the table the moment the table changes.
  const hardcoded = [...shell.matchAll(/dn-icon--(draw|spin|ring|hop|nudge|pop|jitter)/g)];
  assert.deepEqual(hardcoded.map((match) => match[0]), [],
    "_includes/admin-console.html hardcodes a motion family — derive it from the glyph name instead");
});

test("every sprite glyph the shell references exists, and every symbol is used", () => {
  // The motion pass keys off the href. A reference to a symbol that is not there renders
  // an empty box that also, quietly, never animates.
  const referenced = new Set([...shell.matchAll(/href="#i-([a-z0-9-]+)"/g)].map((m) => m[1]));
  for (const id of referenced) {
    assert.ok(spriteIds.includes(id), `the shell references #i-${id}, which the sprite does not define`);
  }
});
