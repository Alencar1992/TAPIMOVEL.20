const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content, 'utf8');

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`P11 não encontrou o trecho esperado: ${label}`);
  }
  return source.replace(pattern, replacement);
}

let code = read('apps-script/Code.gs');
code = replaceRequired(
  code,
  /function normalizarNumero_\(valor\) \{[\s\S]*?\n\}\n\nfunction extrairData_\(valor\) \{[\s\S]*?\n\}\n\nfunction pertenceAoMes_\(data, mes, ano\) \{[\s\S]*?\n\}\n\nfunction chaveMes_\(mes, ano\) \{[\s\S]*?\n\}\n\nfunction nomeDia_\(dia\) \{[\s\S]*?\n\}/,
  `function normalizarNumero_(valor) {\n  return numeroAplicacao_(valor);\n}\n\nfunction extrairData_(valor) {\n  return dataAplicacao_(valor);\n}\n\nfunction pertenceAoMes_(data, mes, ano) {\n  return dataPertenceAoMesAplicacao_(data, mes, ano);\n}\n\nfunction chaveMes_(mes, ano) {\n  return chaveMesAplicacao_(mes, ano);\n}\n\nfunction nomeDia_(dia) {\n  return nomeDiaSemanaAplicacao_(dia);\n}`,
  'wrappers compartilhados do Code.gs'
);
write('apps-script/Code.gs', code);

let diario = read('apps-script/FechamentoDiarioService.gs');
diario = replaceRequired(
  diario,
  /function formatarDataFechamentoDiario_\(data\) \{[\s\S]*?\n\}\n\nfunction normalizarDataFechamentoDiario_\(valor\) \{[\s\S]*?\n\}/,
  `function formatarDataFechamentoDiario_(data) {\n  return formatarDataAplicacao_(data, "dd/MM/yyyy");\n}\n\nfunction normalizarDataFechamentoDiario_(valor) {\n  return normalizarDataDiaAplicacao_(valor);\n}`,
  'datas básicas do fechamento diário'
);
diario = replaceRequired(
  diario,
  /function dataPorMomentoFechamentoDiario_\(valor\) \{[\s\S]*?\n\}/,
  `function dataPorMomentoFechamentoDiario_(valor) {\n  return normalizarDataDiaAplicacao_(valor);\n}`,
  'data por momento do fechamento diário'
);
diario = replaceRequired(
  diario,
  /function numeroFechamentoDiario_\(valor\) \{[\s\S]*?\n\}/,
  `function numeroFechamentoDiario_(valor) {\n  return numeroAplicacao_(valor);\n}`,
  'número do fechamento diário'
);
diario = replaceRequired(
  diario,
  /function quaseIgualFechamentoDiario_\(a, b\) \{[\s\S]*?\n\}/,
  `function quaseIgualFechamentoDiario_(a, b) {\n  return quaseIgualAplicacao_(a, b, 0.005);\n}`,
  'comparação monetária do fechamento diário'
);
diario = diario.replace(
  'console.error("Falha no fechamento diário automático de " + data + ":", erro);',
  'registrarErroAplicacao_("fechamento_diario_automatico", erro, { data: data });'
);
diario = diario.replace(
  'erro: erro && erro.message ? erro.message : String(erro)',
  'erro: mensagemErroAplicacao_(erro, "Falha no fechamento diário automático.")'
);
write('apps-script/FechamentoDiarioService.gs', diario);

let security = read('apps-script/SecurityUtils.gs');
security = replaceRequired(
  security,
  /function obterDiaSessaoAdmin_\(\) \{[\s\S]*?\n\}/,
  `function obterDiaSessaoAdmin_() {\n  return formatarDataAplicacao_(new Date(), "yyyy-MM-dd");\n}`,
  'dia da sessão administrativa'
);
write('apps-script/SecurityUtils.gs', security);

let auth = read('apps-script/AuthService.gs');
auth = auth.replace(
  'console.error("Não foi possível garantir o trigger de fechamento diário automático:", erroTrigger);',
  'registrarErroAplicacao_("auth.trigger_fechamento_diario", erroTrigger);'
);
write('apps-script/AuthService.gs', auth);

let preflight = read('scripts/validate-apps-script-deploy.js');
if (!preflight.includes("'CoreUtils.gs'")) {
  preflight = preflight.replace("  'Code.gs',\n", "  'Code.gs',\n  'CoreUtils.gs',\n");
}
write('scripts/validate-apps-script-deploy.js', preflight);

let deployTest = read('tests/deploy-p8.test.js');
if (!deployTest.includes("'CoreUtils.gs'")) {
  deployTest = deployTest.replace("    'Code.gs',\n", "    'Code.gs',\n    'CoreUtils.gs',\n");
}
write('tests/deploy-p8.test.js', deployTest);

console.log('P11 aplicado com sucesso.');
