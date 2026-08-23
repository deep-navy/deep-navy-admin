/* The design system under assets/css/ds/ is VENDORED, not authored here.
 *
 * It is copied verbatim from the design-system project and re-copied wholesale when it
 * changes. That only works if nobody edits it in place: a one-line local "fix" survives
 * until the next re-vendor, then vanishes, and the screens quietly stop matching the
 * approved mockups with no diff to point at. This check is what makes that failure loud
 * at build time instead of silent at re-vendor time.
 *
 * It mirrors check_vendored_platform_protos.mjs deliberately — same manifest shape, same
 * sibling-checkout cross-check — because a second vendored tree should not invent a
 * second discipline.
 *
 * To re-vendor: copy the tree in, then run this script with REWRITE_DS_MANIFEST=1 to
 * regenerate the manifest, and commit both together.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dsRoot = resolve(root, "assets/css/ds");
// The manifest sits BESIDE the tree, not inside it: ds/ holds the design system's
// own bytes and nothing else, so "is this file ours?" has a one-word answer.
const manifestPath = resolve(root, "assets/css/ds.MANIFEST.sha256");

// The eleven files ds.css imports, plus the component index they fan out to, plus the
// one file that index does not name: core/core.css opens with the design system's own
// `@import "icons-motion.css"`, so the icon motion vocabulary arrives one level deeper
// than ds.css can see. Listing them explicitly means a file silently added to or dropped
// from the tree is an error rather than a manifest that quietly grows.
const expectedFiles = [
  "components/agents/agents.css",
  "components/components.css",
  "components/core/core.css",
  "components/core/icons-motion.css",
  "components/data/data.css",
  "components/feedback/feedback.css",
  "components/forms/forms.css",
  "components/motion/motion.css",
  "components/navigation/navigation.css",
  "components/notify/notify.css",
  "tokens/base.css",
  "tokens/breakpoints.css",
  "tokens/motion.css",
  "tokens/palette.css",
  "tokens/roles.css",
  "tokens/semantic.css",
  "tokens/shape.css",
  "tokens/space.css",
  "tokens/typography.css"
];

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (entry.endsWith(".css")) found.push(relative(dsRoot, full).split("\\").join("/"));
  }
  return found.sort();
}

const present = walk(dsRoot);
const missing = expectedFiles.filter((file) => !present.includes(file));
const unexpected = present.filter((file) => !expectedFiles.includes(file));
if (missing.length) throw new Error(`Vendored design system is missing: ${missing.join(", ")}`);
if (unexpected.length) throw new Error(`Unexpected file in the vendored design system: ${unexpected.join(", ")}. The tree is copied verbatim; site-local CSS belongs in assets/css/, not under ds/.`);

const digests = new Map(expectedFiles.map((file) => [file, createHash("sha256").update(readFileSync(resolve(dsRoot, file))).digest("hex")]));

if (process.env.REWRITE_DS_MANIFEST === "1") {
  writeFileSync(manifestPath, `${expectedFiles.map((file) => `${digests.get(file)}  ${file}`).join("\n")}\n`, "utf8");
  console.log(`Wrote ${expectedFiles.length} design-system digests to assets/css/ds.MANIFEST.sha256`);
  process.exit(0);
}

if (!existsSync(manifestPath)) throw new Error("assets/css/ds.MANIFEST.sha256 is missing. Regenerate it with REWRITE_DS_MANIFEST=1.");

const recorded = new Map();
for (const line of readFileSync(manifestPath, "utf8").trim().split("\n")) {
  // Hyphens are part of a design-system filename (icons-motion.css); a character class
  // that forgot them rejected the manifest as invalid rather than reporting drift.
  const match = line.match(/^([a-f0-9]{64})  ([a-z/-]+\.css)$/);
  if (!match) throw new Error(`Invalid design-system manifest entry: ${line}`);
  const [, hash, file] = match;
  if (recorded.has(file)) throw new Error(`Duplicate design-system manifest entry: ${file}`);
  recorded.set(file, hash);
}

for (const file of expectedFiles) {
  const expected = recorded.get(file);
  if (!expected) throw new Error(`Design-system manifest does not cover ${file}.`);
  if (expected !== digests.get(file)) {
    throw new Error(`Vendored design-system drift detected in assets/css/ds/${file}. Files under ds/ are the design system's own bytes and must not be hand-edited — re-vendor the tree, or put the change in a site-local layer (assets/css/theme.css or admin.css).`);
  }
}
for (const file of recorded.keys()) {
  if (!expectedFiles.includes(file)) throw new Error(`Design-system manifest names a file that is not vendored: ${file}`);
}

// If the design system is checked out beside this repo, prove the vendored bytes are
// the ones it currently publishes rather than an older copy nobody noticed had drifted.
const siblingRoot = resolve(root, "../deep-navy-design-system/assets/css/ds");
if (existsSync(siblingRoot)) {
  for (const file of expectedFiles) {
    const siblingFile = resolve(siblingRoot, file);
    if (!existsSync(siblingFile)) throw new Error(`Sibling design system does not carry ${file}.`);
    if (!readFileSync(siblingFile).equals(readFileSync(resolve(dsRoot, file)))) {
      throw new Error(`Vendored ds/${file} differs from the sibling design-system checkout.`);
    }
  }
}

console.log(`Verified ${expectedFiles.length} vendored design-system files against assets/css/ds.MANIFEST.sha256`);
