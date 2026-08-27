const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function carregarCoreUtils() {
  const sandbox = {
    console,
    Date,
    Number,
    String,
    Math,
    isFinite,
    isNaN,
    Session: {
      getScriptTimeZone() { return 'America/Sao_Paulo'; }
    },
    Utilities: {
      formatDate(data, _timezone, formato) {
        const pad = n => String(n).padStart(2, '0');
        if (formato === 'dd/MM/yyyy') return `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()}`;
        if (formato === 'yyyy-MM-dd') return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
        if (formato === 'yyyy-MM') return `${data.getFullYear()}-${pad(data.getMonth() + 1)}`;
        return '';
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(read('apps-script/CoreUtils.gs'), sandbox, { filename: 'CoreUtils.gs' });
  return sandbox;
}

test('P11 centraliza números brasileiros e decimais com ponto', () => {
  const core = carregarCoreUtils();
  assert.equal(core.numeroAplicacao_('R$ 1.234,56'), 1234.56);
  assert.equal(core.numeroAplicacao_('5,59'), 5.59);
  assert.equal(core.numeroAplicacao_('5.59'), 5.59);
  assert.equal(core.numeroAplicacao_('12.345'), 12345);
  assert.equal(core.numeroAplicacao_(25.5), 25.5);
});

test('P11 valida datas de calendário e gera chaves consistentes', () => {
  const core = carregarCoreUtils();
  const dataBr = core.dataAplicacao_('27/08/2026');
  const dataIso = core.dataAplicacao_('2026-08-27');
  assert.equal(dataBr.getFullYear(), 2026);
  assert.equal(dataBr.getMonth(), 7);
  assert.equal(dataBr.getDate(), 27);
  assert.equal(dataIso.getFullYear(), 2026);
  assert.equal(core.dataAplicacao_('31/02/2026'), null);
  assert.equal(core.chaveMesAplicacao_(8, 2026), '2026-08');
  assert.equal(core.chaveMesAplicacao_(13, 2026), '');
  assert.equal(core.normalizarDataDiaAplicacao_(dataBr), '27/08/2026');
});

test('P11 preserva contratos antigos como wrappers para o núcleo único', () => {
  const code = read('apps-script/Code.gs');
  assert.match(code, /function normalizarNumero_\(valor\) \{\s*return numeroAplicacao_\(valor\);\s*\}/);
  assert.match(code, /function extrairData_\(valor\) \{\s*return dataAplicacao_\(valor\);\s*\}/);
  assert.match(code, /function pertenceAoMes_\(data, mes, ano\) \{\s*return dataPertenceAoMesAplicacao_\(data, mes, ano\);\s*\}/);
  assert.match(code, /function chaveMes_\(mes, ano\) \{\s*return chaveMesAplicacao_\(mes, ano\);\s*\}/);
  assert.match(code, /function nomeDia_\(dia\) \{\s*return nomeDiaSemanaAplicacao_\(dia\);\s*\}/);
});

test('P11 remove lógica duplicada do fechamento diário sem quebrar contratos', () => {
  const diario = read('apps-script/FechamentoDiarioService.gs');
  assert.match(diario, /function formatarDataFechamentoDiario_\(data\) \{\s*return formatarDataAplicacao_\(data, "dd\/MM\/yyyy"\);\s*\}/);
  assert.match(diario, /function normalizarDataFechamentoDiario_\(valor\) \{\s*return normalizarDataDiaAplicacao_\(valor\);\s*\}/);
  assert.match(diario, /function numeroFechamentoDiario_\(valor\) \{\s*return numeroAplicacao_\(valor\);\s*\}/);
  assert.match(diario, /function quaseIgualFechamentoDiario_\(a, b\) \{\s*return quaseIgualAplicacao_\(a, b, 0\.005\);\s*\}/);
  assert.match(diario, /registrarErroAplicacao_\("fechamento_diario_automatico"/);
});

test('P11 padroniza logging técnico do trigger de autenticação', () => {
  const auth = read('apps-script/AuthService.gs');
  assert.match(auth, /registrarErroAplicacao_\("auth\.trigger_fechamento_diario", erroTrigger\)/);
  assert.doesNotMatch(auth, /console\.error\("Não foi possível garantir o trigger/);
});

test('P11 entra no preflight obrigatório do Apps Script', () => {
  const preflight = read('scripts/validate-apps-script-deploy.js');
  const deploy = read('tests/deploy-p8.test.js');
  assert.match(preflight, /'CoreUtils\.gs'/);
  assert.match(deploy, /'CoreUtils\.gs'/);
});
