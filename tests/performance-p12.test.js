const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function carregarCacheService() {
  const memoria = new Map();
  let leiturasSheets = 0;
  const sandbox = {
    console,
    JSON,
    String,
    Array,
    Error,
    CacheService: {
      getScriptCache() {
        return {
          get(chave) { return memoria.get(chave) || null; },
          put(chave, valor) { memoria.set(chave, valor); },
          remove(chave) { memoria.delete(chave); }
        };
      }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return {
          getSheetByName(nome) {
            if (nome !== 'Historico_Diario') return null;
            return {
              getDataRange() {
                return {
                  getDisplayValues() {
                    leiturasSheets++;
                    return [['ID'], ['1']];
                  }
                };
              }
            };
          }
        };
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(read('apps-script/ReadCacheService.gs'), sandbox, { filename: 'ReadCacheService.gs' });
  return { sandbox, getLeituras: () => leiturasSheets };
}

test('P12 cacheia leitura analítica e invalidação força nova leitura', () => {
  const { sandbox, getLeituras } = carregarCacheService();
  assert.deepEqual(Array.from(sandbox.lerAbaAnalitica_('Historico_Diario')), [['ID'], ['1']]);
  assert.equal(getLeituras(), 1);
  sandbox.lerAbaAnalitica_('Historico_Diario');
  assert.equal(getLeituras(), 1);
  sandbox.invalidarCacheLeituraAnalitica_('Historico_Diario');
  sandbox.lerAbaAnalitica_('Historico_Diario');
  assert.equal(getLeituras(), 2);
});

test('P12 nunca permite cache de filas ou controle de operações', () => {
  const { sandbox } = carregarCacheService();
  assert.throws(() => sandbox.lerAbaAnalitica_('Pedidos_Ativos'), /não pode usar o cache analítico/);
  assert.throws(() => sandbox.lerAbaAnalitica_('Pedidos_Online_Pendentes'), /não pode usar o cache analítico/);
  assert.throws(() => sandbox.lerAbaAnalitica_('Controle_Operacoes'), /não pode usar o cache analítico/);
  const source = read('apps-script/ReadCacheService.gs');
  assert.match(source, /CACHE_LEITURA_ANALITICA_TTL_ = 30/);
  assert.doesNotMatch(source, /Pedidos_Ativos/);
  assert.doesNotMatch(source, /Pedidos_Online_Pendentes/);
  assert.doesNotMatch(source, /Controle_Operacoes/);
});

test('P12 Relatório Eliel usa snapshots analíticos reutilizáveis', () => {
  const source = read('apps-script/RelatorioElielService.gs');
  assert.match(source, /lerAbaAnalitica_\("Historico_Diario"\)/);
  assert.match(source, /lerAbaAnalitica_\("Fechamentos_Diarios"\)/);
  assert.match(source, /lerAbaAnalitica_\("Combustivel"\)/);
  assert.doesNotMatch(source, /historico\.getDataRange\(\)\.getDisplayValues\(\)/);
  assert.doesNotMatch(source, /fechamentos\.getDataRange\(\)\.getDisplayValues\(\)/);
});

test('P12 fechamento mensal invalida cache antes do cálculo oficial', () => {
  const source = read('apps-script/FechamentoService.gs');
  const inicio = source.indexOf('function montarPreviaFechamentoRelatorioEliel_');
  const invalidar = source.indexOf('invalidarCachesAnaliticos_();', inicio);
  const calcular = source.indexOf('obterRelatorioEliel(mes, ano, catalogoJSON)', inicio);
  assert.ok(inicio >= 0 && invalidar > inicio && calcular > invalidar);
});

test('P12 invalida snapshots depois de escritas que alteram dados analíticos', () => {
  const code = read('apps-script/Code.gs');
  const diario = read('apps-script/FechamentoDiarioService.gs');
  assert.match(code, /function moverParaHistorico[\s\S]*invalidarCacheLeituraAnalitica_\("Historico_Diario"\)/);
  assert.match(code, /function salvarCombustivelPlanilha[\s\S]*invalidarCacheLeituraAnalitica_\("Combustivel"\)/);
  assert.match(code, /function salvarFechamentoDiaPlanilha[\s\S]*invalidarCacheLeituraAnalitica_\("Fechamentos_Diarios"\)/);
  assert.match(diario, /function gravarResumoFechamentoDiario_[\s\S]*invalidarCacheLeituraAnalitica_\("Fechamentos_Diarios"\)/);
  assert.match(diario, /invalidarCacheLeituraAnalitica_\("Tapiocas Diária"\)/);
});

test('P12 otimiza consultas legadas mais frequentes sem alterar os contratos', () => {
  const code = read('apps-script/Code.gs');
  for (const fn of [
    'obterResumoMesPlanilha',
    'calcularEstimativaSalarioLucas',
    'buscarHistoricoCombustivel',
    'buscarRankingRotasBackend',
    'buscarTopProdutosBackend'
  ]) {
    assert.match(code, new RegExp(`function ${fn}`));
  }
  assert.match(code, /function obterResumoMesPlanilha[\s\S]*lerAbaAnalitica_\("Fechamentos_Diarios"\)/);
  assert.match(code, /function buscarTopProdutosBackend[\s\S]*lerAbaAnalitica_\("Historico_Diario"\)/);
});

test('P12 entra no preflight obrigatório de produção', () => {
  assert.match(read('scripts/validate-apps-script-deploy.js'), /'ReadCacheService\.gs'/);
  assert.match(read('tests/deploy-p8.test.js'), /'ReadCacheService\.gs'/);
});
