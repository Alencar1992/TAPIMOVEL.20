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
const api = fs.readFileSync(path.join(appsScriptDir, "Api.gs"), "utf8");
const pedidos = fs.readFileSync(path.join(appsScriptDir, "PedidoService.gs"), "utf8");
const horarioService = fs.readFileSync(path.join(appsScriptDir, "HorarioOperacionalService.gs"), "utf8");
const sheetsRepository = fs.readFileSync(path.join(appsScriptDir, "SheetsRepository.gs"), "utf8");

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

test("planilha operacional é fixada após a primeira resolução válida", () => {
  assert.match(sheetsRepository, /CHAVE_SPREADSHEET_APLICACAO_/);
  assert.match(sheetsRepository, /SpreadsheetApp\.openById\(idPersistido\)/);
  assert.match(sheetsRepository, /SpreadsheetApp\.getActiveSpreadsheet\(\)/);
  assert.match(sheetsRepository, /props\.setProperty\(CHAVE_SPREADSHEET_APLICACAO_, idAtivo\)/);
  assert.match(sheetsRepository, /function lerConfiguracaoOperacionalSheets_\(\) \{\s*const ss = obterSpreadsheetAplicacao_\(\)/);
});

test("pedido online nunca autoriza horário usando fallback antigo", () => {
  const inicio = pedidos.indexOf("function obterConfiguracaoOperacionalPedidoOnlineFresca_");
  const fim = pedidos.indexOf("function registrarPedidoOnline", inicio);
  const trecho = pedidos.slice(inicio, fim);
  assert.ok(inicio >= 0 && fim > inicio);
  assert.match(trecho, /lerConfiguracaoOperacionalSheets_\(\)/);
  assert.match(trecho, /CONFIG_UNAVAILABLE/);
  assert.doesNotMatch(trecho, /obterConfiguracaoOperacional\(\)/);
  assert.doesNotMatch(trecho, /configuracaoOperacionalPadrao_\(\)/);
});

test("API pública de horário ignora função legada e usa serviço confiável", () => {
  assert.match(api, /action === "obterConfiguracaoOperacional"/);
  assert.match(api, /this\.obterConfiguracaoOperacionalConfiavel_/);
  assert.match(api, /action === "obterStatusCardapio"/);
  assert.match(api, /this\.obterStatusCardapioConfiavel_/);
  assert.match(horarioService, /lerConfiguracaoOperacionalSheets_\(\)/);
  assert.match(horarioService, /obterRegraOperacionalHoje_\(config, new Date\(\)\)/);
  assert.match(horarioService, /horaMinuto >= horario\.inicio/);
  assert.match(horarioService, /horaMinuto < horario\.fim/);
  assert.match(horarioService, /regra\.rotas\.length > 0/);
  assert.doesNotMatch(horarioService, /18:00/);
  assert.doesNotMatch(horarioService, /22:00/);
});

test("leitura pública usa o mesmo lock da gravação e não observa configuração parcial", () => {
  assert.match(horarioService, /const lock = LockService\.getScriptLock\(\)/);
  assert.match(horarioService, /lock\.waitLock\(10000\)/);
  assert.match(horarioService, /bloqueado = true/);
  assert.match(horarioService, /if \(bloqueado\) lock\.releaseLock\(\)/);
  assert.match(horarioService, /limparCacheConfiguracaoOperacional_\(\)/);
  assert.match(horarioService, /salvarCacheConfiguracaoOperacional_\(normalizada\)/);
});

test("status público preserva hora numérica e expõe precisão em horaMinuto", () => {
  assert.match(horarioService, /hora: Number\(horaMinuto\.split\(":"\)\[0\]\)/);
  assert.match(horarioService, /horaMinuto: horaMinuto/);
  assert.match(horarioService, /abreAs: horario\.inicio/);
  assert.match(horarioService, /fechaAs: horario\.fim/);
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
