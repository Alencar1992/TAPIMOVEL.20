const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dir = path.join(__dirname, "..", "apps-script");
const read = nome => fs.readFileSync(path.join(dir, nome), "utf8");
const code = read("Code.gs");
const api = read("Api.gs");
const auth = read("AuthService.gs");
const security = read("SecurityUtils.gs");
const all = fs.readdirSync(dir)
  .filter(nome => nome.endsWith(".gs"))
  .sort()
  .map(read)
  .join("\n\n");

test("P6 separa entrada HTTP e autenticação sem duplicar funções no Code.gs", () => {
  const apiNames = ["doGet", "doPost", "executarAcaoApi_", "responderApi_"];
  const authNames = [
    "configurarPinAdministrador", "configurarPinEliel", "loginAcesso",
    "loginAdministrador", "validarSessaoAcesso", "validarSessaoAdministrador",
    "encerrarSessaoAdministrador"
  ];
  for (const nome of apiNames) {
    assert.match(api, new RegExp(`function\\s+${nome}\\s*\\(`));
    assert.doesNotMatch(code, new RegExp(`function\\s+${nome}\\s*\\(`));
  }
  for (const nome of authNames) {
    assert.match(auth, new RegExp(`function\\s+${nome}\\s*\\(`));
    assert.doesNotMatch(code, new RegExp(`function\\s+${nome}\\s*\\(`));
  }
});

test("API preserva contratos HTTP e allowlists de segurança", () => {
  for (const trecho of [
    "obterDisponibilidadeCardapio",
    "obterCatalogoCardapio",
    "obterStatusCardapio",
    "registrarPedidoOnline",
    "obterConfiguracaoOperacional",
    "listarPedidosOnlinePendentes",
    "fecharMesRelatorioEliel",
    "METHOD_NOT_ALLOWED",
    "ACTION_NOT_ALLOWED",
    "AUTH_REQUIRED"
  ]) assert.ok(api.includes(trecho), `Api.gs deve preservar ${trecho}`);
  assert.match(api, /function doGet\(e\)/);
  assert.match(api, /function doPost\(e\)/);
  assert.match(api, /ContentService\.MimeType\.JSON/);
});

test("AuthService preserva PINs e contratos públicos; helpers permanecem em SecurityUtils", () => {
  assert.match(auth, /\^\\d\{6,12\}\$/);
  assert.match(auth, /LOGIN_BLOCKED/);
  assert.match(auth, /INVALID_CREDENTIALS/);
  assert.match(auth, /NOME_PERFIL_ELIEL_/);
  assert.match(security, /function hashSeguro_\(/);
  assert.match(security, /function criarSessaoAcesso_\(/);
  assert.match(security, /function obterSessaoAcesso_\(/);
  assert.match(security, /function exigirSessaoAdministrador_\(/);
});

test("bundle completo continua sintaticamente válido após o P6", () => {
  assert.doesNotThrow(() => new vm.Script(all, { filename: "AppsScript.bundle.gs" }));
});
