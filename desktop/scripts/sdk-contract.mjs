import ts from "typescript";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const source = arg("--source") || process.env.HERMES_SOURCE_ROOT;
if (!source) throw new Error("Set HERMES_SOURCE_ROOT or pass --source=/path/to/hermes-agent. This check reads source; it does not run Hermes Desktop.");
const update = process.argv.includes("--update");
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const parsed = new Map();
const anchors = {};

async function file(path) {
  if (!parsed.has(path)) {
    const content = await readFile(resolve(source, path), "utf8");
    parsed.set(path, ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  }
  return parsed.get(path);
}

function printed(node, sourceFile) { return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim(); }

async function declaration(path, name, members) {
  const sourceFile = await file(path);
  let node = sourceFile.statements.find((item) => item.name?.text === name);
  if (!node) throw new Error(`SDK declaration missing: ${path} ${name}`);
  if (members) {
    if (!ts.isInterfaceDeclaration(node)) throw new Error(`${name} is no longer an interface`);
    const selected = members.map((member) => {
      const field = node.members.find((item) => item.name?.getText(sourceFile) === member);
      if (!field) throw new Error(`SDK member missing: ${name}.${member}`);
      return field;
    });
    node = ts.factory.updateInterfaceDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, selected);
  }
  const text = printed(node, sourceFile);
  anchors[`${path}#${name}${members ? `.${members.join(",")}` : ""}`] = text;
  return text;
}

async function functionType(path, name) {
  const sourceFile = await file(path);
  const node = sourceFile.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  if (!node || node.parameters.length !== 1 || !node.parameters[0].type) throw new Error(`Unsupported dialog signature: ${name}`);
  const parameter = printed(node.parameters[0].type, sourceFile);
  anchors[`${path}#${name}.props`] = parameter;
  return `export function ${name}(props: ${parameter}): React.ReactElement;`;
}

async function constant(path, name) {
  const sourceFile = await file(path);
  const node = sourceFile.statements.filter(ts.isVariableStatement).flatMap((item) => item.declarationList.declarations).find((item) => item.name.getText(sourceFile) === name);
  if (!node?.initializer || !ts.isStringLiteral(node.initializer)) throw new Error(`Unsupported SDK constant: ${name}`);
  const value = node.initializer.getText(sourceFile);
  anchors[`${path}#${name}`] = value;
  return `export const ${name}: ${value};`;
}

const sdk = await file("apps/desktop/src/sdk/index.ts");
const exports = sdk.statements.filter(ts.isExportDeclaration);
function publicExport(name, module) {
  const item = exports.find((entry) => entry.moduleSpecifier?.text === module && entry.exportClause && ts.isNamedExports(entry.exportClause) && entry.exportClause.elements.some((value) => value.name.text === name));
  if (!item) throw new Error(`Public SDK export missing or moved: ${name} from ${module}`);
  const element = item.exportClause.elements.find((value) => value.name.text === name);
  anchors[`public:${name}`] = `${printed(element, sdk)} from ${module}`;
}

for (const name of ["Dialog", "DialogContent", "DialogTitle", "DialogDescription"]) publicExport(name, "@/components/ui/dialog");
for (const name of ["ROUTES_AREA", "SIDEBAR_NAV_AREA", "RouteContribution", "SidebarNavContribution"]) publicExport(name, "@/app/routes");
for (const name of ["gatewayActivationEpoch", "useGatewayActivationEpoch"]) publicExport(name, "@/store/gateway");
publicExport("useValue", "@nanostores/react");
if (anchors["public:useValue"] !== "useStore as useValue from @nanostores/react") throw new Error("useValue no longer aliases the nanostores React hook");
if (!exports.some((entry) => entry.moduleSpecifier?.text === "./plugin-contract" && entry.isTypeOnly && !entry.exportClause)) throw new Error("SDK no longer re-exports plugin-contract types");
const typeBarrel = await file("apps/desktop/src/sdk/plugin-contract.ts");
for (const name of ["HermesPlugin", "PluginContext", "PluginFiles", "PluginFilesResult", "PluginFolder", "PluginRestOptions"]) {
  if (!typeBarrel.statements.filter(ts.isExportDeclaration).some((entry) => entry.exportClause && ts.isNamedExports(entry.exportClause) && entry.exportClause.elements.some((element) => element.name.text === name))) throw new Error(`Public SDK type missing: ${name}`);
}
const host = sdk.statements.filter(ts.isVariableStatement).flatMap((item) => item.declarationList.declarations).find((item) => item.name.getText(sdk) === "host");
if (!host?.initializer || !ts.isObjectLiteralExpression(host.initializer)) throw new Error("SDK host is no longer an object declaration");
const hostState = host.initializer.properties.find((item) => item.name?.getText(sdk) === "state")?.initializer;
const profile = hostState?.properties.find((item) => item.name?.getText(sdk) === "profile");
if (!profile || printed(profile, sdk) !== "profile: readonlyAtom<string>($activeGatewayProfile)") throw new Error("The active-profile atom contract changed");
anchors["host.state.profile"] = printed(profile, sdk);

const packageJson = JSON.parse(await readFile(resolve(source, "apps/desktop/package.json"), "utf8"));
const localPackage = JSON.parse(await readFile(resolve(desktop, "package.json"), "utf8"));
for (const name of ["nanostores", "@nanostores/react"]) {
  if (localPackage.devDependencies[name] !== packageJson.dependencies[name]) throw new Error(`${name} type dependency differs from this Hermes source`);
}
// Hermes v0.22.7 uses radix-ui 1.7.0, whose Dialog export is @radix-ui/react-dialog 1.2.0.
// Pin only that type package, not the whole UI kit. Updating this mapping requires review.
if (packageJson.dependencies["radix-ui"] !== "1.7.0" || localPackage.devDependencies["@radix-ui/react-dialog"] !== "1.2.0") throw new Error("Review the Hermes Radix Dialog dependency mapping before updating this contract");
anchors["dependencies"] = { nanostores: packageJson.dependencies.nanostores, "@nanostores/react": packageJson.dependencies["@nanostores/react"], "radix-ui": "1.7.0", "@radix-ui/react-dialog": "1.2.0" };

const contrib = "apps/desktop/src/contrib/plugin.ts";
const files = "apps/desktop/src/contrib/plugin-files.ts";
const dialog = "apps/desktop/src/components/ui/dialog.tsx";
const declarations = [];
for (const name of ["ContributionSource", "Contribution"]) declarations.push(await declaration("apps/desktop/src/contrib/types.ts", name));
declarations.push(await declaration(contrib, "PluginContribution"));
for (const name of ["PluginFolder", "PluginFileEntry", "PluginFilesResult", "PluginFiles"]) declarations.push(await declaration(files, name));
declarations.push(await declaration("apps/desktop/src/api/plugins.ts", "PluginRestOptions"));
declarations.push(await declaration(contrib, "PluginContext", ["source", "registerMany", "onDispose", "onEvent", "setInterval", "rest", "files"]));
declarations.push(await declaration(contrib, "HermesPlugin"));
declarations.push(await declaration("apps/desktop/src/app/routes.ts", "RouteContribution"));
declarations.push(await declaration("apps/desktop/src/app/routes.ts", "SidebarNavContribution", ["codicon", "label", "path"]));
declarations.push(await declaration(dialog, "DialogBannerTone"));
for (const name of ["Dialog", "DialogContent", "DialogTitle", "DialogDescription"]) declarations.push(await functionType(dialog, name));
for (const name of ["ROUTES_AREA", "SIDEBAR_NAV_AREA"]) declarations.push(await constant("apps/desktop/src/app/routes.ts", name));
for (const [path, name] of [["apps/desktop/src/store/gateway.ts", "gatewayActivationEpoch"], ["apps/desktop/src/store/gateway-activation-epoch.ts", "useGatewayActivationEpoch"]]) {
  const sourceFile = await file(path);
  const node = sourceFile.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  if (!node || node.parameters.length || node.type?.kind !== ts.SyntaxKind.NumberKeyword) throw new Error(`${name} signature changed`);
  anchors[`${path}#${name}`] = printed(node, sourceFile);
  declarations.push(`export function ${name}(): number;`);
}
anchors["GatewayEventListener"] = await declaration("apps/desktop/src/contrib/events.ts", "GatewayEventListener");
const generated = `// Generated by scripts/sdk-contract.mjs from the public Hermes v0.22.7 source.\n// This is a checked projection, not a runtime SDK. Do not edit by hand.\n// Only consumed context/nav fields are included; event payloads remain opaque.\ndeclare module "@hermes/plugin-sdk" {\n  import type * as React from "react";\n  import type { ReactNode } from "react";\n  import type * as DialogPrimitive from "@radix-ui/react-dialog";\n  import type { ReadableAtom } from "nanostores";\n  type GatewayEventListener = (event: unknown) => void;\n  export const host: { state: { profile: ReadableAtom<string> } };\n  export const useValue: typeof import("@nanostores/react").useStore;\n\n${declarations.map((item) => item.split("\n").map((line) => `  ${line}`).join("\n")).join("\n\n")}\n}\n`;

const manifestPath = resolve(desktop, "sdk-contract.json");
const declarationPath = resolve(desktop, "src/sdk.d.ts");
if (update) {
  let commit = "unknown";
  try { commit = execFileSync("git", ["-C", resolve(source), "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* Source archive, rather than checkout. */ }
  await writeFile(manifestPath, JSON.stringify({ upstream: "NousResearch/hermes-agent", reference: "v0.22.7", inspected_commit: commit, anchors }, null, 2) + "\n");
  await writeFile(declarationPath, generated);
  console.log(`Generated the native type projection from ${Object.keys(anchors).length} upstream contract anchors. Review changes before committing.`);
} else {
  const saved = JSON.parse(await readFile(manifestPath, "utf8"));
  const current = await readFile(declarationPath, "utf8");
  if (JSON.stringify(saved.anchors) !== JSON.stringify(anchors)) throw new Error("Hermes SDK contract drift detected. Inspect the public signatures before running --update.");
  if (current !== generated) throw new Error("src/sdk.d.ts differs from the upstream-derived projection. Run --update and review the diff.");
  console.log(`Verified ${Object.keys(anchors).length} public SDK contract anchors and the exact generated declaration projection against ${resolve(source)}.`);
}
