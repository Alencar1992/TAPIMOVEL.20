const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function abrirConsulta(semApi = false) {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  const source = html.slice(html.indexOf('function abrirModalLiquidez()'), html.indexOf('function recalcularLiquidez(dados)'));
  const nodes = {};
  for (const id of ['mesReferenciaPDF', 'modalLiquidez', 'conteudoLiquidez', 'loadingLiquidez', 'erroLiquidez',
    'liqStatusSalvamento', 'liqQtdTapiocasTxt']) {
    nodes[id] = {style: {}, value: '', textContent: ''};
  }
  const callbacks = {};
  const runner = {
    withSuccessHandler(fn) { callbacks.success = fn; return this; },
    withFailureHandler(fn) { callbacks.failure = fn; return this; },
    obterLiquidezMensalPdv() {}
  };
  const context = {
    liquidezMensalAtual: null,
    alternarEdicaoLiquidez() {},
    document: {getElementById: id => nodes[id]},
    google: semApi ? undefined : {script: {run: runner}},
    normalizarRespostaApi(res) { try { return JSON.parse(res); } catch { return null; } },
    recalcularLiquidez(dados) { nodes.liqQtdTapiocasTxt.value = String(dados.qtdTapiocas); }
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
  callbacks.success(JSON.stringify({total: 32.75, qtdTapiocas: 7, custos: {}, configuracoes: {}, originais: {}}));
  assert.equal(nodes.loadingLiquidez.style.display, 'none');
  assert.equal(nodes.conteudoLiquidez.style.display, 'block');
  assert.equal(nodes.liqQtdTapiocasTxt.value, '7');
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

test('campos monetários aceitam e exibem milhares e centavos no padrão brasileiro', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  const codigo = html.slice(html.indexOf('function valorCustoLiquidez('), html.indexOf('function abrirModalLiquidez()'));
  const entrada = { value: 'R$ 12.345,50' };
  vm.runInNewContext(codigo + '\npreencherCampoCustoLiquidez(entrada, valorCustoLiquidez(entrada));', { entrada });
  assert.equal(entrada.value, '12.345,50');
});

test('líquido reage a cada campo monetário e percentual antes de salvar', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  const codigo = html.slice(html.indexOf('let liquidezMensalAtual = null;'), html.indexOf('function verificarPedidosAbertos()'));
  assert.match(html, /id="liqFormulario"[\s\S]+?oninput="preverLiquidezMensal\(\)"/);
  const campos = new Map();
  const obterCampo = id => {
    if (!campos.has(id)) campos.set(id, { value: '', validity: { valid: true }, style: {} });
    return campos.get(id);
  };
  const originais = {
    total: 2000, qtdTapiocas: 12, debito: 100, credito: 200, vr: 300,
    taxaDebito: 2, taxaCredito: 5, taxaVr: 5, percentualCombustivelCarro: 80, combustivel: 100
  };
  const dados = {
    ...originais, originais, ano: 2026, mes: 11,
    custos: { combustivelTotal: 100 }, configuracoes: {
      salarioCozinha: 700, salarioAuxCarro: 300, manutencaoCarro: 200, salarioMotorista: 100,
      assinaturaTapimovel: 50, custosVariaveis: 25
    }
  };
  const tela = vm.createContext({ dados, document: { getElementById: obterCampo }, formatarMoeda: valor => valor });
  vm.runInContext(codigo, tela);
  function iniciar() {
    vm.runInContext('liquidezMensalAtual = dados; recalcularLiquidez(dados); preverLiquidezMensal();', tela);
    return obterCampo('liqEliel').textContent;
  }
  const casos = {
    liqFaturamento: ['2.100,00', 100], liqVendaDebito: ['200,00', -2],
    liqVendaCredito: ['300,00', -5], liqVendaVr: ['400,00', -5],
    liqTaxaDebito: ['3,00', -1], liqTaxaCredito: ['6,00', -2], liqTaxaVr: ['6,00', -3],
    liqCombustivelTotal: ['200,00', -80], inpPercCombTrailer: ['90,00', -10],
    liqAssinatura: ['75,00', -25], liqCustosVariaveis: ['35,00', -10],
    liqSalarioMotorista: ['110,00', -10], inpSalCozinha: ['710,00', -10],
    inpSalCarro: ['310,00', -10], inpManutCarro: ['210,00', -10]
  };
  for (const [id, [valor, diferenca]] of Object.entries(casos)) {
    const anterior = iniciar();
    obterCampo(id).value = valor;
    vm.runInContext('preverLiquidezMensal();', tela);
    assert.equal(obterCampo('liqEliel').textContent, anterior + diferenca, id);
  }
  const anterior = iniciar();
  obterCampo('liqFaturamento').value = '-1.000,00';
  vm.runInContext('preverLiquidezMensal();', tela);
  assert.equal(obterCampo('liqEliel').textContent, anterior - 3000);
});
