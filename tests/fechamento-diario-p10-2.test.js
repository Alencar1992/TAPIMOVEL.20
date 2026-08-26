const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('P10.2 centraliza o fechamento diário em serviço próprio', () => {
  const service = read('apps-script/FechamentoDiarioService.gs');
  assert.match(service, /function fecharDiaSeguro\(/);
  assert.match(service, /function obterStatusFechamentoDiario\(/);
  assert.match(service, /function executarFechamentoDiarioAutomatico\(/);
  assert.match(service, /LockService\.getDocumentLock\(\)/);
  assert.match(service, /carregarFilaPdvAtivos_\(\)/);
});

test('grava e valida as duas fontes antes de zerar a fila', () => {
  const service = read('apps-script/FechamentoDiarioService.gs');
  assert.match(service, /Fechamentos_Diarios/);
  assert.match(service, /Tapiocas Diária/);
  assert.match(service, /SpreadsheetApp\.flush\(\)/);
  assert.match(service, /gravarResumoFechamentoDiario_\(resumo, tipoOrigem, "GRAVADO"\);\s*validarPersistenciaFechamentoDiario_\(resumo\);\s*const restantes = removerSomentePedidosDoDiaFechado_\(fila, data\);\s*atualizarStatusFechamentoDiario_\(data, tipoOrigem, "CONCLUIDO"\)/s);
  assert.match(service, /substituirFilaPdvAtivos_\(restantes\)/);
});

test('bloqueia pendências e impede duplicidade silenciosa', () => {
  const service = read('apps-script/FechamentoDiarioService.gs');
  assert.match(service, /BLOQUEADO_PENDENCIAS/);
  assert.match(service, /pedidosPendentes > 0/);
  assert.match(service, /múltiplos fechamentos/);
  assert.match(service, /múltiplas contagens de tapiocas/);
  assert.doesNotMatch(service, /appendRow\(/);
});

test('fechamento automático é idempotente, horário e nunca fecha o dia corrente', () => {
  const service = read('apps-script/FechamentoDiarioService.gs');
  assert.match(service, /everyHours\(1\)/);
  assert.match(service, /HORA_MINIMA_FECHAMENTO_DIARIO_AUTOMATICO_ = 2/);
  assert.match(service, /if \(data && data !== hoje\) datas\[data\] = true/);
  assert.match(service, /garantirTriggerFechamentoDiarioAutomatico_/);
  assert.match(service, /getProjectTriggers\(\)/);
});

test('login administrativo garante o trigger sem derrubar autenticação se houver falha', () => {
  const auth = read('apps-script/AuthService.gs');
  assert.match(auth, /perfil === "admin"/);
  assert.match(auth, /garantirTriggerFechamentoDiarioAutomatico_\(\)/);
  assert.match(auth, /catch \(erroTrigger\)/);
});

test('API autoriza somente sessão administrativa para o novo fechamento diário', () => {
  const api = read('apps-script/Api.gs');
  assert.match(api, /"obterStatusFechamentoDiario"/);
  assert.match(api, /"fecharDiaSeguro"/);
  const blocoEliel = api.match(/const acoesEliel = \[([\s\S]*?)\];/)[1];
  assert.doesNotMatch(blocoEliel, /fecharDiaSeguro/);
});

test('frontend não zera localmente antes da confirmação do servidor', () => {
  const ui = read('frontend/fechamento-diario-seguro.js');
  const config = read('frontend/config.js');
  assert.match(config, /fechamento-diario-seguro\.js\?v=/);
  assert.match(ui, /\.fecharDiaSeguro\(dataHojePtBr\(\), "MANUAL"\)/);
  assert.match(ui, /\.carregarDadosNuvem\(\)/);
  assert.match(ui, /window\.confirmarRegistroFechamentoDiario = confirmarFechamentoDiarioSeguro/);
  assert.doesNotMatch(ui, /historicoNuvem\s*=\s*\[\]/);
  assert.match(ui, /Nada foi zerado na tela/);
});
