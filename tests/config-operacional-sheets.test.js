const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appsScriptDir = path.join(__dirname, "../apps-script");
const code = fs.readdirSync(appsScriptDir)
  .filter(nome => nome.endsWith(".gs"))
  .sort()
  .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))
  .join("\n\n");

test("configuração operacional usa tabelas estruturadas no Google Sheets", () => {
  assert.match(code, /ABA_CONFIG_HORARIOS_ = "Config_Horarios"/);
  assert.match(code, /ABA_CONFIG_ROTAS_ = "Config_Rotas"/);
  assert.match(code, /ABA_CONFIG_MONTE_SUA_ = "Config_MonteSua"/);
  assert.match(code, /ABA_CONFIG_ADICIONAIS_ = "Config_Adicionais"/);
  assert.match(code, /function lerConfiguracaoOperacionalSheets_\(/);
  assert.match(code, /function gravarConfiguracaoOperacionalSheets_\(/);
  assert.match(code, /CacheService\.getScriptCache\(\)/);
});

test("horários persistidos usam valor exibido HH:mm e não fallback silencioso", () => {
  assert.match(code, /function linhasAbaConfigOperacionalExibidas_\(/);
  assert.match(code, /getDisplayValues\(\)/);
  assert.match(code, /function horarioConfiguracaoSheets_\(valor\)/);
  assert.match(code, /horarioConfiguracaoSheets_\(linha\[2\]\)/);
  assert.match(code, /horarioConfiguracaoSheets_\(linha\[3\]\)/);
  assert.doesNotMatch(code, /String\(linha\[2\] \|\| config\.horarios\[dia\]\.inicio\)/);
  assert.doesNotMatch(code, /String\(linha\[3\] \|\| config\.horarios\[dia\]\.fim\)/);
});

test("Config_Horarios existente precisa conter os sete dias válidos", () => {
  assert.match(code, /const diasHorarioLidos = \{\}/);
  assert.match(code, /Config_Horarios inválida no dia ISO/);
  assert.match(code, /Config_Horarios incompleta: falta o dia ISO/);
});

test("PropertiesService fica somente como fonte legada de migração", () => {
  assert.doesNotMatch(code, /setProperty\(CHAVE_CONFIG_OPERACIONAL_/);
  assert.match(code, /getProperty\(CHAVE_CONFIG_OPERACIONAL_\)/);
  assert.match(code, /deleteProperty\(CHAVE_CONFIG_OPERACIONAL_\)/);
  assert.match(code, /Migração da configuração operacional concluída/);
});

test("contratos públicos de configuração permanecem compatíveis", () => {
  assert.match(code, /function obterConfiguracaoOperacional\(\)/);
  assert.match(code, /function salvarConfiguracaoOperacional\(configJSON, responsavel\)/);
  assert.match(code, /return JSON\.stringify\(config\)/);
});
