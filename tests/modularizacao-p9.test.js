const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const code = read('apps-script/Code.gs');
const fechamento = read('apps-script/FechamentoService.gs');
const api = read('apps-script/Api.gs');

const funcoes = [
  'obterAbaFechamentosMensaisV2_',
  'obterAbaControleOperacoes_',
  'localizarLinhaPorChave_',
  'obterEstadoOperacaoFechamento_',
  'atualizarEstadoOperacaoFechamento_',
  'normalizarReferenciaFechamentoMensal_',
  'obterDataReferenciaPedidoFechamento_',
  'chaveMesDaDataFechamento_',
  'obterPedidosPendentesFechamentoEliel_',
  'obterChavesFechamentosExistentes_',
  'obterPersistenciaFechamento_',
  'montarPreviaFechamentoRelatorioEliel_',
  'obterPreviaFechamentoRelatorioEliel',
  'garantirRegistroRelatorioEliel_',
  'garantirRegistroFechamentoMensalV2_',
  'garantirLogFechamentoEliel_',
  'fecharMesRelatorioEliel'
];
const constantes = [
  'ABA_FECHAMENTOS_MENSAIS_V2_',
  'ABA_CONTROLE_OPERACOES_',
  'TIPO_OPERACAO_FECHAMENTO_MENSAL_',
  'STATUS_OPERACAO_PROCESSANDO_',
  'STATUS_OPERACAO_CONCLUIDO_',
  'STATUS_OPERACAO_ERRO_'
];

const temFuncao = (source, nome) => source.includes(`function ${nome}(`);
const temConstante = (source, nome) => source.includes(`const ${nome} =`);

test('P9 concentra o fechamento mensal no FechamentoService sem duplicação', () => {
  for (const nome of funcoes) {
    assert.equal(temFuncao(fechamento, nome), true, `função ausente no FechamentoService: ${nome}`);
    assert.equal(temFuncao(code, nome), false, `função duplicada no Code.gs: ${nome}`);
  }
  for (const nome of constantes) {
    assert.equal(temConstante(fechamento, nome), true, `constante ausente no FechamentoService: ${nome}`);
    assert.equal(temConstante(code, nome), false, `constante duplicada no Code.gs: ${nome}`);
  }
});

test('P9 preserva os contratos públicos e a autorização do CEO Eliel na API', () => {
  assert.equal(api.includes('"obterPreviaFechamentoRelatorioEliel"'), true);
  assert.equal(api.includes('"fecharMesRelatorioEliel"'), true);
  assert.equal(api.includes('action === "fecharMesRelatorioEliel"'), true);
  assert.equal(api.includes('sessao.perfil !== "eliel"'), true);
});

test('FechamentoService mantém idempotência, recuperação e bloqueio de pendências', () => {
  for (const trecho of [
    'STATUS_OPERACAO_PROCESSANDO_',
    'STATUS_OPERACAO_CONCLUIDO_',
    'STATUS_OPERACAO_ERRO_',
    'recuperavel',
    'pedidosPendentes',
    'carregarFilaPdvAtivos_',
    'Fechamentos_Mensais_v2'
  ]) assert.equal(fechamento.includes(trecho), true, `regra crítica ausente: ${trecho}`);
  assert.equal(fechamento.includes('function obterRelatorioEliel('), false);
  assert.equal(fechamento.includes('function obterHistoricoVendasEliel('), false);
});

test('bundle completo continua sintaticamente válido após o P9', () => {
  const dir = path.join(root, 'apps-script');
  const bundle = fs.readdirSync(dir)
    .filter(nome => nome.endsWith('.gs'))
    .sort()
    .map(nome => fs.readFileSync(path.join(dir, nome), 'utf8'))
    .join('\n\n');
  assert.doesNotThrow(() => new vm.Script(bundle));
});
