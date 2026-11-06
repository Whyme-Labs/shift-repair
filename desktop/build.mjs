import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

const common = { bundle: true, format: "esm", platform: "browser", target: "es2022", jsx: "automatic", loader: { ".css": "text" }, logLevel: "info" };

if (process.argv.includes("--tests")) {
  await build({ ...common, entryPoints: ["src/model.ts", "src/api.ts"], outdir: ".test-build", outExtension: { ".js": ".mjs" }, platform: "node" });
} else if (process.argv.includes("--components")) {
  await build({ ...common, entryPoints: ["src/App.tsx", "src/api.ts"], outdir: ".test-build", outExtension: { ".js": ".mjs" }, platform: "node", external: ["react", "react/jsx-runtime"] });
} else {
  const native = await build({ ...common, entryPoints: ["src/plugin.tsx"], outfile: "plugin.js", external: ["@hermes/plugin-sdk", "react", "react/jsx-runtime"], metafile: true });
  const imports = native.metafile.outputs["plugin.js"].imports.filter((item) => item.external).map((item) => item.path);
  if (imports.some((name) => !["@hermes/plugin-sdk", "react", "react/jsx-runtime"].includes(name))) throw new Error(`Unsupported native imports: ${imports.join(", ")}`);
  if (process.argv.includes("--native-tests")) {
    await build({ ...common, entryPoints: ["test/native-host.tsx"], outfile: ".test-build/native-host.mjs", platform: "node", packages: "external" });
  }
  if (!process.argv.includes("--native") && !process.argv.includes("--native-tests")) {
  await mkdir("../preview", { recursive: true });
  await build({ ...common, entryPoints: ["src/preview.tsx"], outfile: "../preview/app.js", minify: true, define: { "process.env.NODE_ENV": '"production"' } });
  await writeFile("../preview/index.html", `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="color-scheme" content="light dark"/><meta name="description" content="Repair a weekly staffing schedule while changing as few assignments as possible."/>
<title>ShiftRepair | Weekly staffing</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231b6955'/%3E%3Cpath d='M8 8h6v6H8zm10 0h6v6h-6zM8 18h6v6H8zm10 0h6v6h-6z' fill='%23fff'/%3E%3C/svg%3E"/>
<style>
:root{color-scheme:light;--ui-text-secondary:#20352f;--ui-text-tertiary:#63766e;--ui-text-quaternary:#819187;--ui-stroke-secondary:#dce5df;--ui-accent:#17664e;--sr-surface:#fcfdfa;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fcfdfa}
body{margin:0}button,input,select,textarea{font-family:inherit}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--ui-text-secondary:#e3eae5;--ui-text-tertiary:#a4b4aa;--ui-text-quaternary:#7a9082;--ui-stroke-secondary:#33443a;--ui-accent:#89d6b1;--sr-surface:#142019;background:#142019}}
</style></head><body><div id="shiftrepair-root"></div><noscript>Enable JavaScript to use the ShiftRepair schedule editor.</noscript><script type="module" src="./app.js"></script></body></html>`);
  }
  console.log(`Native bundle uses only public SDK and React imports: ${[...new Set(imports)].join(", ")}`);
}
