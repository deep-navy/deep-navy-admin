/* deep.navy admin — the theme control.

   Three states, not two. A plain light/dark switch makes "follow my OS" a one-way door:
   once you touch it you can never get back, and on a console people leave open across a
   working day that is the state most of them actually want. So the control cycles
   system -> dark -> light -> system, matching the mockup's order.

   "system" is the ABSENCE of data-theme, which keeps the prefers-color-scheme query in
   theme.css live: change the OS theme with the tab open and the console follows without
   a reload. An explicit choice stamps data-theme on <html> and wins over the OS in both
   directions.

   This file is loaded from <head> WITHOUT defer so the attribute is on <html> before the
   first paint. The site's CSP is script-src 'self', so the usual inline pre-paint snippet
   is impossible here; a same-origin file is the only shape available. It is deliberately
   tiny and dependency-free, because a pre-paint script that stalls paints an empty page
   that no reload fixes.

   The preference is the ONE thing this console stores. It is not a credential, it is not
   operator data, and it is read back on the next visit; the security tests assert that
   nothing else is ever written, and that tokens in particular never are. */
(function () {
  "use strict";

  var KEY = "dn-admin-theme";
  var ORDER = ["system", "dark", "light"];
  var LABELS = { system: "Theme: match system", dark: "Theme: dark", light: "Theme: light" };

  function read() {
    try {
      var stored = window.localStorage.getItem(KEY);
      return stored === "light" || stored === "dark" ? stored : "system";
    } catch (error) {
      return "system";
    }
  }

  function write(preference) {
    try {
      if (preference === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, preference);
    } catch (error) {
      /* Storage blocked: the choice still applies for this page view. */
    }
  }

  function apply(preference) {
    var root = document.documentElement;
    if (preference === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", preference);
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].setAttribute("data-pref", preference);
      buttons[i].setAttribute("title", LABELS[preference] + " (click to change)");
      buttons[i].setAttribute("aria-label", LABELS[preference]);
    }
  }

  var current = read();
  apply(current);

  /* The design system suppresses transitions for the single frame in which the theme
     swaps, so a toggle is an instant repaint rather than a dozen properties easing at
     different rates. Nothing here transitions a colour; this only stops the ones that
     already exist from animating across the swap. */
  function cycle() {
    current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    write(current);
    var root = document.documentElement;
    root.classList.add("dn-theming");
    apply(current);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { root.classList.remove("dn-theming"); });
    });
  }

  function bind() {
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i += 1) buttons[i].addEventListener("click", cycle);
    apply(current);
  }

  window.dnAdminTheme = { get: function () { return current; }, cycle: cycle };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
