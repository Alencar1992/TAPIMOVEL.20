const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('P10.2 centraliza o fechamento diário em serviço próprio', () => {
  const service = read('apps-script/FechamentoDiarioService.gs');
  const vendas = read('apps-script/DailySalesService.gs');
  assert.match(service, /function fecharDiaSeguro\(/);
  assert.match(service, /function obterStatusFechamentoDiario\(/);
  assert.match(service, /function obterPreviaFechamentoDiario\(/);
  assert.match(service, /function executarFechamentoDiarioAutomatico\(/);
  assert.match(service, /fecharDiaPorVendasHojeSeguro_/);
  assert.match(vendas, /LockService\.getDocumentLock\(\)/);
  assert.match(vendas, /Vendas_hoje/);
  assert.match(vendas, /Livro_Transacoes/);
});

test('grava e valida as duas fontes antes de zerar a fila', () => {
  const service = read('apps-script/FechamentoDiarioService.gs');
  const vendas = read('apps-script/DailySalesService.gs');
  assert.match(vendas, /Fechamentos_Diarios/);
  assert.match(vendas, /Historico_Diario/);
  assert.match(vendas, /Tapiocas Diária/);
  assert.match(vendas, /registrarEventoLivroSemLock_\([\s\S]*"FECHAMENTO"/);
  assert.match(vendas, /abaVendas\.deleteRow/);
  assert.match(vendas, /while \(abaHistorico\.getLastRow\(\) > historicoAntes\)/);
  assert.match(service, /fecharDiaPorVendasHojeSeguro_/);
});

test('bloqueia pendências e impede duplicidade silenciosa', () => {
  const service = read('apps-script/FechamentoDiarioService.gs');
  const vendas = read('apps-script/DailySalesService.gs');
  assert.match(vendas, /BLOQUEADO_PENDENCIAS/);
  assert.match(vendas, /DAY_CLOSED/);
  assert.match(vendas, /JA_FECHADO/);
  assert.match(service, /múltiplos fechamentos/);
  assert.match(service, /múltiplas contagens de tapiocas/);
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
  assert.match(api, /"obterPreviaFechamentoDiario"/);
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


test('pré-validação mostra totais e bloqueia divergência sem gravar ou limpar', () => {
  const service = read('apps-script/FechamentoDiarioService.gs');
  const ui = read('frontend/fechamento-diario-seguro.js');
  assert.match(service, /DIVERGENCIA_PAGAMENTOS/);
  assert.match(service, /somaPagamentos/);
  assert.match(service, /linhasVendasHoje/);
  assert.match(ui, /Pré-validando fechamento diário/);
  assert.match(ui, /Total faturado:/);
  assert.match(ui, /Confirmar fechamento/);
  assert.match(ui, /Voltar e revisar/);
  assert.match(ui, /\.obterPreviaFechamentoDiario\(dataHojePtBr\(\)\)/);
});


test('modal de fechamento usa somente a prévia oficial de Vendas_hoje', () => {
  const ui = read('frontend/fechamento-diario-seguro.js');
  const index = read('frontend/index.html');
  assert.match(ui, /function carregarPreviaFechamentoDiarioNoModal\(/);
  assert.match(ui, /Valores oficiais carregados de Vendas_hoje/);
  assert.match(ui, /botao\.disabled = !previa \|\| previa\.status !== "PRONTO"/);
  assert.match(ui, /window\.carregarPreviaFechamentoDiarioNoModal = carregarPreviaFechamentoDiarioNoModal/);
  assert.match(index, /function abrirModalRelatorio\(\)[\s\S]{0,500}carregarPreviaFechamentoDiarioNoModal/);
  assert.doesNotMatch(
    index.match(/function abrirModalRelatorio\(\)[\s\S]*?function registrarFechamentoDia\(\)/)[0],
    /vendasHojeCompletas\(\)/
  );
  assert.match(index, /id="statusPreviaFechamento"/);
});
