const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('P10.1 carrega módulo próprio de controle do fechamento', () => {
  const config = read('frontend/config.js');
  assert.match(config, /fechamento-eliel-ui\.css\?v=/);
  assert.match(config, /fechamento-eliel-ui\.js\?v=/);
  assert.match(config, /20261118\.2/);
});

test('painel mostra período, status, pendências e operação do mês', () => {
  const ui = read('frontend/fechamento-eliel-ui.js');
  assert.match(ui, /id = "elielFechamentoControle"/);
  assert.match(ui, /Fechamento do mês/);
  assert.match(ui, /elielFechamentoPeriodo/);
  assert.match(ui, /elielFechamentoStatus/);
  assert.match(ui, /elielFechamentoPendentes/);
  assert.match(ui, /elielFechamentoOperacao/);
});

test('controle reutiliza prévia segura e bloqueia fechamento duplicado, pendente ou dessicronizado', () => {
  const ui = read('frontend/fechamento-eliel-ui.js');
  assert.match(ui, /\.obterPreviaFechamentoRelatorioEliel\(/);
  assert.match(ui, /ultimoEstado\.duplicado/);
  assert.match(ui, /ultimoEstado\.pedidosPendentes/);
  assert.match(ui, /botao\.disabled = duplicado \|\| pendentes > 0 \|\| !periodoSincronizado/);
  assert.match(ui, /window\.abrirFechamentoMesEliel/);
});

test('mudança de período recarrega o relatório antes de liberar o fechamento', () => {
  const ui = read('frontend/fechamento-eliel-ui.js');
  assert.match(ui, /carregamentoRelatorioEmCurso/);
  assert.match(ui, /periodoRelatorioPendente/);
  assert.match(ui, /periodoRelatorioCarregado/);
  assert.match(ui, /window\.carregarRelatorioEliel = carregarRelatorioSincronizado/);
  assert.match(ui, /periodoRelatorioCarregado !== chave/);
  assert.match(ui, /String\(ultimoEstado\.chave \|\| ""\) === chave/);
  assert.match(ui, /Atualizando o Relatório Eliel para o período selecionado antes de liberar o fechamento/);
});

test('respostas assíncronas de prévia antigas são descartadas', () => {
  const ui = read('frontend/fechamento-eliel-ui.js');
  assert.match(ui, /const idConsulta = \+\+sequenciaConsulta/);
  assert.match(ui, /idConsulta !== sequenciaConsulta/);
  assert.match(ui, /chaveSelecionada\(\) !== chave/);
  assert.match(ui, /periodoRelatorioCarregado !== chave/);
});

test('PDV ADM pode fechar o mês pelo relatório com autorização do backend', () => {
  const ui = read('frontend/fechamento-eliel-ui.js');
  const api = read('apps-script/Api.gs');
  const fechamento = read('apps-script/FechamentoService.gs');

  assert.match(ui, /sessao && sessao.perfil === "admin"/);
  assert.doesNotMatch(ui, /acesso=eliel/);
  assert.match(api, /args\[3\] = NOME_PERFIL_ADMIN_/);
  assert.match(api, /PERMISSION_DENIED/);
  assert.match(fechamento, /O fechamento mensal é exclusivo do PDV ADM/);
});

test('painel diferencia pronto, bloqueado, fechado e recuperação segura', () => {
  const ui = read('frontend/fechamento-eliel-ui.js');
  for (const estado of ['PRONTO', 'BLOQUEADO', 'FECHADO', 'RECUPERAÇÃO']) {
    assert.match(ui, new RegExp(estado));
  }
});
