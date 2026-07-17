import { build } from "esbuild";

await build({
  entryPoints: ["src/admin-api-client.ts"],
  outfile: "assets/js/admin-api-client.js",
  bundle: true,
  charset: "utf8",
  format: "iife",
  globalName: "deepNavyAdminGeneratedClient",
  legalComments: "none",
  minify: true,
  platform: "browser",
  sourcemap: false,
  target: ["es2022"]
});
