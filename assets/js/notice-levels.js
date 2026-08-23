// The severity ladder, ported verbatim from the design system's
// components/notify/Notice.jsx. It is the ONLY place in this product that says
// what a severity is, and it is a straight copy on purpose: a second table
// with its own opinion about what "error" looks like is how two surfaces in
// the same product end up disagreeing about how loud a thing is.
//
// The site is plain scripts rather than React, so the JSX component itself is
// not portable — but the component was never where severity lived. The table
// is, and the table ports exactly. The DOM the site builds around it
// (assets/js/app.js, buildNotice) mirrors Notice.jsx element for element and
// class for class, against the same vendored notify.css.
((root, factory) => {
  "use strict";

  const ladder = factory();
  if (typeof module === "object" && module.exports) module.exports = ladder;
  if (root) root.deepNavyNoticeLevels = ladder;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  // Every surface that can carry a severity — a system bar, an inline notice, a
  // toast, an inbox row — reads its glyph, its word and its tone from this
  // table, so a thing that is an "error" looks like an error in all four places
  // and sorts the same way in all four places.
  //
  //   rank      sort order. Lower is louder. Never sort by time alone: a blocker
  //             from an hour ago outranks a success from ten seconds ago.
  //   needsYou  the human is the only one who can clear it. Drives the "Needs
  //             you" filter and the urgent state on the bell.
  //   sticky    never auto-dismisses. A toast that disappears before it is read
  //             is worse than no toast, and anything at danger level is the only
  //             record until it is opened.
  //
  // 'tip' is deliberately achromatic: a tip is advice, not status, and giving it
  // a hue would put a sixth colour in the chrome for something that is never
  // urgent.
  const NOTICE_LEVELS = Object.freeze({
    blocked: Object.freeze({
      word: "Blocked",
      glyph: "octagon-alert",
      tone: "danger",
      rank: 0,
      needsYou: true,
      sticky: true
    }),
    error: Object.freeze({
      word: "Error",
      glyph: "circle-x",
      tone: "danger",
      rank: 1,
      sticky: true
    }),
    warning: Object.freeze({
      word: "Warning",
      glyph: "triangle-alert",
      tone: "attention",
      rank: 2
    }),
    tip: Object.freeze({
      word: "Tip",
      glyph: "lightbulb",
      tone: "tip",
      rank: 3
    }),
    running: Object.freeze({
      word: "Running",
      glyph: "radio",
      tone: "live",
      rank: 4
    }),
    success: Object.freeze({
      word: "Done",
      glyph: "circle-check-big",
      tone: "success",
      rank: 5
    }),
    info: Object.freeze({
      word: "Update",
      glyph: "info",
      tone: "idle",
      rank: 6
    })
  });

  function level(name) {
    return NOTICE_LEVELS[name] || NOTICE_LEVELS.info;
  }

  // Tone reaches a surface as that surface's own modifier class
  // (dn-notice--danger, dn-nitem--danger …) rather than through shared custom
  // properties: anything declared outside :root is registered as a design token
  // by the compiler, and these are not tokens.
  function levelClass(prefix, name) {
    return prefix + "--" + level(name).tone;
  }

  // Rank then time, never time alone. Ties break on the newer event, because at
  // equal loudness the fresher fact is the one someone has not seen.
  function compareNotices(a, b) {
    const rank = level(a?.level).rank - level(b?.level).rank;
    if (rank !== 0) return rank;
    return Number(b?.time || 0) - Number(a?.time || 0);
  }

  return { NOTICE_LEVELS, level, levelClass, compareNotices };
});
