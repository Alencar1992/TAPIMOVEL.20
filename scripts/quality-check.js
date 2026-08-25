const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function walk(dirRel, extensions) {
  const dir = path.join(root, dirRel);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(dirRel, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel, extensions));
    else if (extensions.has(path.extname(entry.name))) out.push(rel);
  }
  return out;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(rel) {
  JSON.parse(read(rel));
  console.log(`JSON OK: ${rel}`);
}

function checkSyntax(rel) {
  new vm.Script(read(rel), { filename: rel });
  console.log(`Sintaxe OK: ${rel}`);
}

function checkConflictMarkers(rel) {
  const text = read(rel);
  const markers = ["<".repeat(7), "=".repeat(7), ">".repeat(7)];
  assert(!markers.some(marker => text.includes(marker)), `Marcador de conflito encontrado em ${rel}`);
}

parseJson("package.json");
parseJson("apps-script/appsscript.json");

const manifest = JSON.parse(read("apps-script/appsscript.json"));
assert(manifest.timeZone === "America/Sao_Paulo", "appsscript.json deve usar America/Sao_Paulo");
assert(manifest.runtimeVersion === "V8", "appsscript.json deve usar runtime V8");

checkSyntax("apps-script/Code.gs");
for (const rel of walk("frontend", new Set([".js"]))) checkSyntax(rel);

const conflictFiles = [
  "apps-script/Code.gs",
  ...walk("frontend", new Set([".js", ".html", ".css"])),
  ...walk("tests", new Set([".js"])),
  ...walk("docs", new Set([".md"])),
  ...walk(".github", new Set([".yml", ".yaml", ".md"]))
];
for (const rel of conflictFiles) checkConflictMarkers(rel);

const code = read("apps-script/Code.gs");
const forbiddenWrites = [
  /setProperty\s*\(\s*["']pdv_vendas_ativas["']/,
  /setProperty\s*\(\s*["']pedidos_online_pendentes["']/,
  /setProperty\s*\(\s*CHAVE_CONFIG_OPERACIONAL_/
];
assert(
  !forbiddenWrites.some(pattern => pattern.test(code)),
  "Storage legado voltou a ser gravado no PropertiesService"
);

console.log("Qualidade estrutural OK.");
