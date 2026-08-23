// Which motion a glyph gets, and who gets to decide.
//
// The design system's rule is one sentence: "Every icon animates — there are no still
// icons in this system." It backs that with a resolver, not a table of decisions — any
// of Lucide's 1,600 names falls through ordered patterns to one of seven families, so a
// glyph that arrives tomorrow animates without anyone remembering to classify it.
//
// ICON_MOTION, ICON_MOTION_RULES, ICON_ALIASES and resolveMotion below are lifted
// verbatim from components/core/Icon.jsx. The React component itself is not portable —
// it fetches each glyph from a CDN this console's CSP forbids — but this half is pure data
// and pure logic, and it ports exactly. It is the same file the customer console carries,
// down to the table: the two consoles are one product and must agree about what a bell
// does. Only SPRITE_TO_LUCIDE below differs, because only the sprites differ.
//
// What this console adds is one translation. The system names glyphs the way Lucide does
// and inlines them; this console draws them from an inline sprite whose ids are #i-<name>,
// and those names are shortened — #i-warn, #i-critical, #i-card — because they name the
// operator's concept rather than the drawing. SPRITE_TO_LUCIDE is that translation, and it
// is the only place it exists.
((root, factory) => {
  "use strict";

  const iconMotion = factory();
  if (typeof module === "object" && module.exports) module.exports = iconMotion;
  if (root) root.deepNavyIconMotion = iconMotion;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  /* ── The design system's own table, verbatim ─────────────────────────── */

  // Default motion per glyph, following pqoqubbw/icons (lucide-animated.com) where that pack
  // makes a specific choice. Anything not listed falls through to ICON_MOTION_RULES below, so
  // EVERY glyph in the system animates — there is no such thing as a still icon here.
  const ICON_MOTION = {
    activity: "draw", radio: "draw", check: "draw", "circle-check-big": "draw", "circle-check": "draw",
    "shield-check": "draw", "file-text": "draw", "clipboard-list": "draw", target: "draw", signature: "draw",
    "git-pull-request": "draw", "git-merge": "draw", "git-branch": "draw", "git-pull-request-arrow": "draw",
    "git-pull-request-closed": "draw", "circle-dot": "draw", "pen-tool": "draw", terminal: "draw", network: "draw",
    "refresh-cw": "spin", "rotate-cw": "spin", loader: "spin", settings: "spin", "loader-circle": "spin",
    bell: "ring",
    search: "hop",
    "arrow-right": "nudge", "arrow-up-right": "nudge", "chevron-right": "nudge", "corner-down-left": "nudge",
    "corner-down-right": "nudge", "external-link": "nudge", "arrow-left": "nudge", "log-out": "nudge",
    users: "pop", user: "pop", plus: "pop", "message-square": "pop", github: "pop", compass: "pop",
    play: "pop", pause: "pop", "layout-dashboard": "pop",
    "triangle-alert": "jitter", "octagon-alert": "jitter", "circle-alert": "jitter", x: "jitter", trash: "jitter",
    // A bell that is off must not ring: the /bell/ rule below would give it the ring motion.
    "bell-off": "pop", lightbulb: "pop"
  };

  // Ordered fallbacks. First match wins; the last rule is a catch-all, so resolveMotion()
  // always returns a motion. Extend the list rather than special-casing at call sites.
  const ICON_MOTION_RULES = [
    [/(^|-)(check|circle-check|badge-check)/, "draw"],
    [/(^|-)(arrow|chevron|corner|move|redo|undo|share|send|log-in|log-out|external-link|skip)/, "nudge"],
    [/(alert|octagon|ban|bug|trash|shield-off|wifi-off|unlink|x$|^x-|-x$)/, "jitter"],
    [/(loader|refresh|rotate|settings|cog|recycle|orbit|sun|repeat|shuffle)/, "spin"],
    [/(bell|alarm|megaphone|volume|siren|music|radio)/, "ring"],
    [/(search|zoom|filter|scan|telescope|binoculars)/, "hop"],
    [/(^git-|^circle-dot|^file|^clipboard|^pen|^edit|^square-pen|terminal|activity|target|network|route|waypoints|signature|highlighter|pencil|link|chart|gauge|trending)/, "draw"],
    [/./, "pop"]
  ];

  // Lucide renames glyphs between versions and serves a 404 for the old name. Without this
  // map a rename blanks every icon using it, silently — which is exactly what `filter`,
  // `more-horizontal` and `more-vertical` did after 0.487.0. Add a line here on each bump
  // rather than hunting call sites.
  const ICON_ALIASES = {
    filter: "funnel",
    // Lucide 0.4xx moved the shape suffix to the front. Both spellings are in the wild in
    // consuming code, so accept the old ones rather than rendering a missing-glyph box.
    "x-circle": "circle-x",
    "x-octagon": "octagon-x",
    "alert-triangle": "triangle-alert",
    "alert-circle": "circle-alert",
    "alert-octagon": "octagon-alert",
    "check-circle": "circle-check",
    "more-horizontal": "ellipsis",
    "more-vertical": "ellipsis-vertical"
  };

  /** Resolve any Lucide name to a motion. Always returns one — no glyph is ever still. */
  function resolveMotion(name) {
    if (name in ICON_MOTION) return ICON_MOTION[name];
    for (const [re, m] of ICON_MOTION_RULES) if (re.test(name)) return m;
    return "pop";
  }

  /* ── This site's sprite, translated ──────────────────────────────────── */

  // Sprite id (without the #i- prefix) -> the Lucide name that names the same drawing.
  // Only the ones that differ are listed; anything absent is already a Lucide name and goes
  // to resolveMotion() unchanged, which is what keeps a new glyph zero-configuration.
  //
  // This sprite's ids are short because they name what an operator is looking at — warn,
  // critical, card — rather than what is drawn. The motion has to follow the DRAWING, so
  // each is named here for the Lucide glyph it actually depicts. Rename a concept and this
  // map is the one line that moves.
  const SPRITE_TO_LUCIDE = {
    activity: "activity",
    card: "credit-card",
    // An octagon with an exclamation mark: the same drawing NOTICE_LEVELS calls `blocked`,
    // and it jitters for the same reason.
    critical: "octagon-alert",
    dashboard: "layout-dashboard",
    gauge: "gauge",
    // The shield in this sprite has the tick inside it, so it is shield-check and it draws
    // itself in — a plain `shield` would only pop.
    shield: "shield-check",
    warn: "triangle-alert"
    // users, server, info, monitor, moon and sun are Lucide's own names for Lucide's own
    // drawings and need no line here. `sun` resolving to spin is the rules doing their job:
    // the theme control's sun turns, which is exactly what a sun should do.
  };

  // Glyphs with no Lucide equivalent at all would go here with a note. There are none
  // today: every symbol in the sprite is Lucide line art, drawn at Lucide's own names or
  // mapped above. A sprite id that is neither still animates — resolveMotion's last rule
  // is a catch-all and returns `pop`, which is the system's answer for "a glyph, with
  // nothing special to say about how it moves".

  const FAMILIES = ["draw", "spin", "ring", "hop", "nudge", "pop", "jitter"];

  // draw is a stroke animation: it runs stroke-dashoffset from the full path length to
  // zero. On a glyph the sprite draws as a filled shape with no stroke there is nothing
  // for it to run along, and it would render as a 60ms opacity flicker and then nothing —
  // a family that silently does not work, which is worse than a family that is not there.
  // Those glyphs take the catch-all transform family instead, which works on any artwork.
  const DRAW_FALLBACK = "pop";

  /** Sprite id (with or without the #i- prefix) -> motion family. Always returns one. */
  function motionFor(spriteName) {
    const bare = String(spriteName || "").replace(/^#?i-/, "");
    if (!bare) return DRAW_FALLBACK;
    const lucide = SPRITE_TO_LUCIDE[bare] || ICON_ALIASES[bare] || bare;
    return resolveMotion(lucide);
  }

  /** The class the stylesheet reads. */
  function motionClass(spriteName) {
    return "dn-icon--" + motionFor(spriteName);
  }

  /* ── Applying it to markup nobody wrote in JavaScript ────────────────── */

  // This console's icons are all static markup in _includes/admin-console.html — there is
  // no render call to hang a class on. This walks them once at startup and classifies each
  // from its own href, so an icon added to the shell tomorrow animates on its own.
  //
  // Nothing here writes markup: classList and setAttribute only. innerHTML is banned.
  function applyIconMotion(root, options) {
    const scope = root || (typeof document === "object" ? document : null);
    if (!scope || typeof scope.querySelectorAll !== "function") return 0;
    const computed = (options && options.computedStroke) || defaultComputedStroke;
    let touched = 0;
    for (const svg of scope.querySelectorAll("svg")) {
      const use = svg.querySelector("use");
      if (!use) continue;
      const href = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
      if (!href.startsWith("#i-")) continue;
      // Already classified — by hand, or by an earlier pass over the same subtree.
      if (svg.hasAttribute("data-motion")) continue;
      let motion = motionFor(href);
      if (motion === "draw" && computed(svg) === "none") motion = DRAW_FALLBACK;
      svg.classList.add("dn-icon--" + motion);
      svg.setAttribute("data-motion", motion);
      touched += 1;
    }
    return touched;
  }

  // A glyph is stroked or it is filled, and only the browser knows which: the sprite holds
  // both kinds and the wrapper decides. Reading it here rather than keeping a list of
  // filled ids means the answer stays right when the artwork changes.
  function defaultComputedStroke(svg) {
    if (typeof getComputedStyle !== "function") return "";
    try {
      return getComputedStyle(svg).stroke;
    } catch {
      return "";
    }
  }

  return {
    ICON_MOTION,
    ICON_MOTION_RULES,
    ICON_ALIASES,
    SPRITE_TO_LUCIDE,
    FAMILIES,
    DRAW_FALLBACK,
    resolveMotion,
    motionFor,
    motionClass,
    applyIconMotion
  };
});
