const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content, 'utf8');

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`P12 não encontrou: ${label}`);
  return source.replace(search, replacement);
}

function replaceAllRequired(source, search, replacement, label) {
  const partes = source.split(search);
  if (partes.length < 2) throw new Error(`P12 não encontrou: ${label}`);
  return partes.join(replacement);
}

function functionRange(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Função não encontrada: ${name}`);
  const braceStart = source.indexOf('{', start);
  if (braceStart === -1) throw new Error(`Abertura não encontrada: ${name}`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`Fechamento não encontrado: ${name}`);
}

function editFunction(source, name, transform) {
  const range = functionRange(source, name);
  const original = source.slice(range.start, range.end);
  const updated = transform(original);
  if (updated === original) throw new Error(`P12 não alterou a função esperada: ${name}`);
  return source.slice(0, range.start) + updated + source.slice(range.end);
}

let relatorio = read('apps-script/RelatorioElielService.gs');
relatorio = replaceAllRequired(
  relatorio,
  'historico.getDataRange().getDisplayValues()',
  'lerAbaAnalitica_("Historico_Diario")',
  'leituras de Historico_Diario no Relatório Eliel'
);
relatorio = replaceAllRequired(
  relatorio,
  'fechamentos.getDataRange().getDisplayValues()',
  'lerAbaAnalitica_("Fechamentos_Diarios")',
  'leituras de Fechamentos_Diarios no Relatório Eliel'
);
relatorio = replaceAllRequired(
  relatorio,
  'combustivel.getDataRange().getDisplayValues()',
  'lerAbaAnalitica_("Combustivel")',
  'leituras de Combustivel no Relatório Eliel'
);
write('apps-script/RelatorioElielService.gs', relatorio);

let fechamento = read('apps-script/FechamentoService.gs');
fechamento = editFunction(fechamento, 'montarPreviaFechamentoRelatorioEliel_', fn =>
  replaceRequired(
    fn,
    '  const relatorio = JSON.parse(obterRelatorioEliel(mes, ano, catalogoJSON) || "{}");',
    '  invalidarCachesAnaliticos_();\n  const relatorio = JSON.parse(obterRelatorioEliel(mes, ano, catalogoJSON) || "{}");',
    'leitura fresca do fechamento mensal'
  )
);
write('apps-script/FechamentoService.gs', fechamento);

let diario = read('apps-script/FechamentoDiarioService.gs');
diario = editFunction(diario, 'gravarResumoFechamentoDiario_', fn =>
  replaceRequired(
    fn,
    '  SpreadsheetApp.flush();',
    '  SpreadsheetApp.flush();\n  invalidarCacheLeituraAnalitica_("Fechamentos_Diarios");\n  invalidarCacheLeituraAnalitica_("Tapiocas Diária");',
    'invalidação após fechamento diário'
  )
);
write('apps-script/FechamentoDiarioService.gs', diario);

let code = read('apps-script/Code.gs');
code = editFunction(code, 'obterResumoMesPlanilha', fn => {
  fn = replaceRequired(fn, 'abaFechamentos.getDataRange().getDisplayValues()', 'lerAbaAnalitica_("Fechamentos_Diarios")', 'resumo mensal / fechamentos');
  fn = replaceRequired(fn, 'abaTapiocas.getDataRange().getDisplayValues()', 'lerAbaAnalitica_("Tapiocas Diária")', 'resumo mensal / tapiocas');
  return replaceRequired(fn, 'abaCombustivel.getDataRange().getDisplayValues()', 'lerAbaAnalitica_("Combustivel")', 'resumo mensal / combustível');
});
code = editFunction(code, 'calcularEstimativaSalarioLucas', fn => {
  fn = replaceRequired(fn, 'abaFech.getDataRange().getDisplayValues()', 'lerAbaAnalitica_("Fechamentos_Diarios")', 'estimativa / fechamentos');
  return replaceRequired(fn, 'abaComb.getDataRange().getDisplayValues()', 'lerAbaAnalitica_("Combustivel")', 'estimativa / combustível');
});
code = editFunction(code, 'buscarHistoricoCombustivel', fn =>
  replaceRequired(fn, 'sheet.getDataRange().getValues()', 'lerAbaAnalitica_("Combustivel")', 'histórico combustível')
);
code = editFunction(code, 'buscarRankingRotasBackend', fn =>
  replaceRequired(fn, 'sheet.getDataRange().getDisplayValues()', 'lerAbaAnalitica_("Fechamentos_Diarios")', 'ranking rotas')
);
code = editFunction(code, 'buscarTopProdutosBackend', fn =>
  replaceRequired(fn, 'sheet.getDataRange().getDisplayValues()', 'lerAbaAnalitica_("Historico_Diario")', 'top produtos')
);
code = editFunction(code, 'moverParaHistorico', fn =>
  replaceRequired(
    fn,
    '      aba.getRange(aba.getLastRow() + 1, 1, matrizItens.length, matrizItens[0].length).setValues(matrizItens);',
    '      aba.getRange(aba.getLastRow() + 1, 1, matrizItens.length, matrizItens[0].length).setValues(matrizItens);\n      invalidarCacheLeituraAnalitica_("Historico_Diario");',
    'invalidação ao mover para histórico'
  )
);
code = editFunction(code, 'reabrirPedidoBackend', fn =>
  replaceRequired(
    fn,
    '    }\n  } catch(e) {',
    '    }\n    invalidarCacheLeituraAnalitica_("Historico_Diario");\n  } catch(e) {',
    'invalidação ao reabrir pedido'
  )
);
code = editFunction(code, 'salvarCombustivelPlanilha', fn =>
  replaceRequired(
    fn,
    '    aba.appendRow([d.data, d.valor, d.litros]);',
    '    aba.appendRow([d.data, d.valor, d.litros]);\n    invalidarCacheLeituraAnalitica_("Combustivel");',
    'invalidação de combustível'
  )
);
code = editFunction(code, 'salvarFechamentoDiaPlanilha', fn =>
  replaceRequired(
    fn,
    '    return "OK";',
    '    invalidarCacheLeituraAnalitica_("Fechamentos_Diarios");\n    invalidarCacheLeituraAnalitica_("Tapiocas Diária");\n    return "OK";',
    'invalidação do fechamento legado'
  )
);
code = editFunction(code, 'excluirContadorTapiocasHoje', fn =>
  replaceRequired(
    fn,
    '    }\n  } catch(e) {',
    '    }\n    invalidarCacheLeituraAnalitica_("Tapiocas Diária");\n  } catch(e) {',
    'invalidação do contador diário'
  )
);
code = editFunction(code, 'salvarMultiplosFechamentos', fn =>
  replaceRequired(
    fn,
    '    return "OK";',
    '    invalidarCacheLeituraAnalitica_("Fechamentos_Diarios");\n    return "OK";',
    'invalidação de múltiplos fechamentos'
  )
);
write('apps-script/Code.gs', code);

let preflight = read('scripts/validate-apps-script-deploy.js');
if (!preflight.includes("'ReadCacheService.gs'")) {
  preflight = preflight.replace("  'PropertiesRepository.gs',\n", "  'PropertiesRepository.gs',\n  'ReadCacheService.gs',\n");
}
write('scripts/validate-apps-script-deploy.js', preflight);

let deployTest = read('tests/deploy-p8.test.js');
if (!deployTest.includes("'ReadCacheService.gs'")) {
  deployTest = deployTest.replace("    'PropertiesRepository.gs',\n", "    'PropertiesRepository.gs',\n    'ReadCacheService.gs',\n");
}
write('tests/deploy-p8.test.js', deployTest);

console.log('P12 aplicado com sucesso.');
