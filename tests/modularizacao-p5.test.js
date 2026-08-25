const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dir = path.join(__dirname, "..", "apps-script");
const read = nome => fs.readFileSync(path.join(dir, nome), "utf8");
const code = read("Code.gs");
const sheets = read("SheetsRepository.gs");
const props = read("PropertiesRepository.gs");
const security = read("SecurityUtils.gs");
const all = fs.readdirSync(dir)
  .filter(nome => nome.endsWith(".gs"))
  .sort()
  .map(read)
  .join("\n\n");

test("P5 cria os três módulos sem duplicar helpers em Code.gs", () => {
  assert.match(sheets, /function obterOuCriarAbaFila_\(/);
  assert.match(sheets, /function lerConfiguracaoOperacionalSheets_\(/);
  assert.match(props, /function obterScriptProperties_\(/);
  assert.match(props, /function catalogoConfigurado_\(/);
  assert.match(security, /function hashSeguro_\(/);
  assert.match(security, /function obterSessaoAcesso_\(/);

  for (const nome of [
    "obterOuCriarAbaFila_",
    "lerConfiguracaoOperacionalSheets_",
    "catalogoConfigurado_",
    "hashSeguro_",
    "obterSessaoAcesso_"
  ]) {
    assert.doesNotMatch(code, new RegExp(`function\\s+${nome}\\s*\\(`));
  }
});

test("PropertiesService direto fica isolado no PropertiesRepository", () => {
  assert.doesNotMatch(code, /PropertiesService\.getScriptProperties\(\)/);
  assert.doesNotMatch(sheets, /PropertiesService\.getScriptProperties\(\)/);
  assert.doesNotMatch(security, /PropertiesService\.getScriptProperties\(\)/);
  assert.equal((props.match(/PropertiesService\.getScriptProperties\(\)/g) || []).length, 1);
});

test("bundle completo de Apps Script continua sintaticamente válido", () => {
  assert.doesNotThrow(() => new vm.Script(all, { filename: "AppsScript.bundle.gs" }));
});

test("contratos públicos críticos continuam no Code.gs", () => {
  for (const assinatura of [
    /function loginAdministrador\(pin\)/,
    /function obterConfiguracaoOperacional\(\)/,
    /function salvarConfiguracaoOperacional\(configJSON, responsavel\)/,
    /function carregarDadosNuvem\(\)/,
    /function salvarNuvemCompleta\(historicoJSON\)/,
    /function listarPedidosOnlinePendentes\(\)/
  ]) assert.match(code, assinatura);
});
