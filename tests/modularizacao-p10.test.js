const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const code = read('apps-script/Code.gs');
const relatorio = read('apps-script/RelatorioElielService.gs');
const fechamento = read('apps-script/FechamentoService.gs');
const api = read('apps-script/Api.gs');

const funcoes = [
  'obterConfiguracoesRelatorioEliel',
  'dividirCombustivelRelatorioEliel_',
  'salvarConfiguracoesRelatorioEliel',
  'obterRelatorioEliel',
  'obterAbaRelatorioEliel_',
  'registrarAcessoRelatorioEliel',
  'obterHistoricoVendasEliel'
];
const helpersCompartilhados = [
  'normalizarNumero_',
  'extrairData_',
  'pertenceAoMes_',
  'chaveMes_',
  'nomeDia_'
];

function regexFuncao(nome) {
  return new RegExp('function\\s+' + nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(');
}

test('P10 concentra o domínio analítico no RelatorioElielService sem duplicação', () => {
  for (const nome of funcoes) {
    assert.match(relatorio, regexFuncao(nome));
    assert.doesNotMatch(code, regexFuncao(nome));
  }
});

test('helpers compartilhados continuam no Code.gs e atendem relatório e fechamento', () => {
  for (const nome of helpersCompartilhados) {
    assert.match(code, regexFuncao(nome));
    assert.doesNotMatch(relatorio, regexFuncao(nome));
  }
  assert.match(relatorio, /chaveMes_\(/);
  assert.match(relatorio, /extrairData_\(/);
  assert.match(fechamento, /chaveMes_\(/);
  assert.match(fechamento, /extrairData_\(/);
});

test('P10 preserva contratos públicos e permissões do Relatório Eliel na API', () => {
  for (const acao of [
    'obterRelatorioEliel',
    'registrarAcessoRelatorioEliel',
    'obterConfiguracoesRelatorioEliel',
    'salvarConfiguracoesRelatorioEliel',
    'obterHistoricoVendasEliel'
  ]) {
    assert.match(api, new RegExp('"' + acao + '"'));
  }
  assert.match(api, /const acoesEliel = \[/);
  assert.match(api, /sessao\.perfil !== "admin" && acoesEliel\.indexOf\(action\) === -1/);
});

test('RelatorioElielService mantém indicadores, rankings, histórico e não absorve fechamento', () => {
  assert.match(relatorio, /rankingProdutos/);
  assert.match(relatorio, /rankingRotas/);
  assert.match(relatorio, /menosVendidas/);
  assert.match(relatorio, /detalhesTaxas/);
  assert.match(relatorio, /mesesComparacao/);
  assert.match(relatorio, /combustivelTrailer/);
  assert.match(relatorio, /Historico_Diario/);
  assert.match(relatorio, /Log Relatorio Eliel/);
  assert.doesNotMatch(relatorio, /function fecharMesRelatorioEliel\s*\(/);
  assert.doesNotMatch(relatorio, /Controle_Operacoes/);
  assert.doesNotMatch(relatorio, /Fechamentos_Mensais_v2/);
  assert.doesNotMatch(relatorio, /STATUS_OPERACAO_(?:PROCESSANDO|CONCLUIDO|ERRO)_/);
});

test('bundle completo continua sintaticamente válido após o P10', () => {
  const dir = path.join(root, 'apps-script');
  const bundle = fs.readdirSync(dir)
    .filter(nome => nome.endsWith('.gs'))
    .sort()
    .map(nome => fs.readFileSync(path.join(dir, nome), 'utf8'))
    .join('\n\n');
  assert.doesNotThrow(() => new vm.Script(bundle));
});
