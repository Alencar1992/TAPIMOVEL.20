const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function abrirConsulta(semApi = false) {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  const source = html.slice(html.indexOf('function abrirModalLiquidez()'), html.indexOf('function recalcularLiquidez()'));
  const nodes = {};
  for (const id of ['mesReferenciaPDF', 'modalLiquidez', 'conteudoLiquidez', 'loadingLiquidez', 'erroLiquidez',
    'inpSalCozinha', 'inpSalCarro', 'inpManutCarro', 'liqQtdTapiocasTxt']) {
    nodes[id] = {style: {}, value: '', textContent: ''};
  }
  const callbacks = {};
  const runner = {
    withSuccessHandler(fn) { callbacks.success = fn; return this; },
    withFailureHandler(fn) { callbacks.failure = fn; return this; },
    obterResumoMesPlanilha() {}
  };
  const context = {
    document: {getElementById: id => nodes[id]},
    google: semApi ? undefined : {script: {run: runner}},
    normalizarRespostaApi(res) { try { return JSON.parse(res); } catch { return null; } },
    recalcularLiquidez() {}
  };
  vm.runInNewContext(source + '\nabrirModalLiquidez();', context);
  return {nodes, callbacks, context, html};
}

test('consulta rejeitada esconde o carregamento e informa o motivo como texto', () => {
  const {nodes, callbacks, html} = abrirConsulta();
  const mensagem = 'Resumo mensal: Fechamentos_Diarios, linha 79, campo status. Dados inconsistentes; resumo bloqueado.';
  assert.equal(typeof callbacks.failure, 'function', 'o modal deve tratar a rejeição da consulta');
  callbacks.failure({message: mensagem});
  assert.equal(nodes.loadingLiquidez.style.display, 'none');
  assert.equal(nodes.conteudoLiquidez.style.display, 'none');
  assert.equal(nodes.erroLiquidez.textContent, mensagem);
  assert.equal(nodes.erroLiquidez.style.display, 'block');
  assert.match(html, /id="erroLiquidez" role="alert"/);
});

test('nova consulta limpa o erro e exibe o resumo quando há sucesso', () => {
  const {nodes, callbacks, context} = abrirConsulta();
  assert.equal(typeof callbacks.failure, 'function');
  callbacks.failure({});
  assert.equal(nodes.erroLiquidez.textContent, 'Não foi possível consultar a Liquidez Mensal.');
  vm.runInNewContext('abrirModalLiquidez();', context);
  assert.equal(nodes.erroLiquidez.textContent, '');
  assert.equal(nodes.erroLiquidez.style.display, 'none');
  callbacks.success(JSON.stringify({total: 32.75, qtdTapiocas: 7}));
  assert.equal(nodes.loadingLiquidez.style.display, 'none');
  assert.equal(nodes.conteudoLiquidez.style.display, 'block');
  assert.equal(nodes.liqQtdTapiocasTxt.textContent, '7 un');
});

test('resposta inválida termina o carregamento e mantém os totais ocultos', () => {
  const {nodes, callbacks} = abrirConsulta();
  callbacks.success('invalido');
  assert.equal(nodes.loadingLiquidez.style.display, 'none');
  assert.equal(nodes.conteudoLiquidez.style.display, 'none');
  assert.equal(nodes.erroLiquidez.style.display, 'block');
});

test('API indisponível termina o carregamento e mostra o alerta', () => {
  const {nodes} = abrirConsulta(true);
  assert.equal(nodes.loadingLiquidez.style.display, 'none');
  assert.equal(nodes.conteudoLiquidez.style.display, 'none');
  assert.equal(nodes.erroLiquidez.style.display, 'block');
});
