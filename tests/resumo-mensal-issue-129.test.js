const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const NativeDate = Date;
const closureHeader = ['Data', 'Faturamento', 'Pix', 'Dinheiro', 'Credito', 'Debito', 'VR', 'Origem', 'Status', 'Atualizado'];
const result = (total = 0, credito = 0, debito = 0, vr = 0, combustivel = 0, qtdTapiocas = 0) => ({ total, credito, debito, vr, combustivel, qtdTapiocas });
const fechamento = (data, total, credito = 0, debito = 0, vr = 0, status = '') => [data, total, 0, 0, credito, debito, vr, 'FIXTURE_129', status, ''];

function harness({ fechamentos = [], tapiocas = [], combustivel = [], now = '2026-11-05T15:00:00Z', timezone = 'America/Sao_Paulo', realCache = false, missing = [], webApp = false, configured = true } = {}) {
  const instant = new NativeDate(now).getTime();
  class ControlledDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
    static [Symbol.hasInstance](value) { return value instanceof NativeDate; }
  }
  const rows = { 'Fechamentos_Diarios': [closureHeader, ...fechamentos], 'Tapiocas Diária': [['Data', 'Quantidade'], ...tapiocas], 'Combustivel': [['Data', 'Valor'], ...combustivel] };
  const snapshot = structuredClone(rows); const writes = []; const reads = []; const cache = new Map(); const opened = [];
  const forbidden = name => () => { writes.push(name); throw new Error('UNEXPECTED_WRITE_OR_REMOTE_OPERATION'); };
  const sheets = Object.fromEntries(Object.entries(rows).filter(([name]) => !missing.includes(name)).map(([name, values]) => [name, {
    getDataRange() { return {
      getValues() { reads.push(`${name}:values`); return structuredClone(values); },
      getDisplayValues() { reads.push(`${name}:display`); assert.ok(values.every(row => row.every(v => typeof v === 'string')), 'Display fixture must contain only strings'); return structuredClone(values); },
      setValues: forbidden('setValues'), clearContent: forbidden('clearContent')
    }; },
    appendRow: forbidden('appendRow'), deleteRow: forbidden('deleteRow'), clear: forbidden('clear'), getRange: forbidden('getRange')
  }]));
  const spreadsheet = { getSheetByName(name) { return sheets[name] || null; }, insertSheet: forbidden('insertSheet'), getSpreadsheetTimeZone: () => 'America/Sao_Paulo' };
  const sandbox = {
    console: { log() {}, error() {} }, Date: ControlledDate, Number, String, Math, isNaN, isFinite,
    Session: { getScriptTimeZone: () => timezone },
    Utilities: { formatDate(value, zone, format) {
      assert.equal(zone, timezone);
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value).map(p => [p.type, p.value]));
      if (format === 'yyyy-MM') return `${parts.year}-${parts.month}`;
      if (format === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
      if (format === 'dd/MM/yyyy') return `${parts.day}/${parts.month}/${parts.year}`;
      throw new Error('UNEXPECTED_DATE_FORMAT');
    } },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => webApp ? null : spreadsheet,
      openById(id) { opened.push(id); assert.equal(id, 'fixture-planilha'); return spreadsheet; }
    },
    ScriptApp: { newTrigger: forbidden('trigger') }, UrlFetchApp: { fetch: forbidden('network') },
    PropertiesService: { getScriptProperties: () => ({
      getProperty(key) {
        assert.equal(key, 'tapimovel_spreadsheet_aplicacao_v1');
        return webApp && configured ? 'fixture-planilha' : null;
      },
      setProperty: forbidden('setProperty')
    }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) || null, put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) }
  };
  vm.createContext(sandbox);
  for (const name of ['CoreUtils.gs', 'PropertiesRepository.gs', 'SheetsRepository.gs', 'FechamentoDiarioService.gs', 'ReadCacheService.gs', 'Code.gs']) vm.runInContext(read(`apps-script/${name}`), sandbox, { filename: name });
  if (!realCache) sandbox.lerAbaAnalitica_ = name => { reads.push(`${name}:values`); return structuredClone(rows[name]); };
  return { sandbox, reads, writes, opened, summary() { const value = JSON.parse(sandbox.obterResumoMesPlanilha()); assert.deepEqual(rows, snapshot); assert.deepEqual(writes, []); return value; } };
}

test('129 RED monetário: número 12.5 mantém centavos em vez de virar 125', () => {
  assert.deepEqual(harness({ fechamentos: [fechamento('02/11/2026', 12.5)] }).summary(), result(12.5));
});
test('129 RED Date: objeto Date do Sheets participa do acumulado mensal', () => {
  assert.deepEqual(harness({ fechamentos: [fechamento(new NativeDate('2026-11-02T15:00:00Z'), '12,50')] }).summary(), result(12.5));
});
test('129 dois dias somam faturamento, meios, combustível e sete tapiocas', () => {
  const h = harness({ fechamentos: [fechamento('02/11/2026', 12.5, 2.5, 4, 1), fechamento('03/11/2026', 20.25, 3.25, 6.25, 2.5)],
    tapiocas: [['02/11/2026', 3], ['03/11/2026', 4]], combustivel: [['02/11/2026', 2.5], ['03/11/2026', '3,25']] });
  assert.deepEqual(h.summary(), result(32.75, 5.75, 10.25, 3.5, 5.75, 7));
  assert.equal(h.sandbox.obterResumoMesPlanilha.length, 0);
});
for (const [name, values] of Object.entries({ number: [12.5, 20.25], brasileiro: ['12,50', '20,25'], moeda: ['R$ 12,50', 'R$ 20,25'], ponto: ['12.50', '20.25'] })) {
  test(`129 formatos monetários ${name} preservam acumulado`, () => {
    assert.equal(harness({ fechamentos: [fechamento('02/11/2026', values[0]), fechamento('03/11/2026', values[1])] }).summary().total, 32.75);
  });
}
test('129 milhar, zero, negativos e arredondamento em centavos preservam sinal', () => {
  const h = harness({ fechamentos: [fechamento('01/11/2026', 'R$ 1.234,56'), fechamento('02/11/2026', 1234.56), fechamento('03/11/2026', -12.5), fechamento('04/11/2026', '-2,25'), fechamento('05/11/2026', 0)],
    combustivel: [['01/11/2026', 'R$ -1,00'], ['02/11/2026', -0.25]] });
  assert.equal(h.summary().total, 2454.37); assert.equal(h.summary().combustivel, -1.25);
  assert.equal(harness({ fechamentos: [fechamento('02/11/2026', 1.005), fechamento('03/11/2026', -1.005)] }).summary().total, 0);
});
test('129 acumulação monetária não retorna resíduos binários', () => {
  assert.equal(harness({ fechamentos: [fechamento('02/11/2026', 0.1), fechamento('03/11/2026', 0.2)] }).summary().total, 0.3);
});
for (const [name, dates] of Object.entries({ civil: ['02/11/2026', '03/11/2026'], iso: ['2026-11-02', '2026-11-03'],
  horas: ['02/11/2026 23:59:59', '03/11/2026, 00:01'], date: [new NativeDate('2026-11-02T03:00:00Z'), new NativeDate('2026-11-04T02:59:59Z')],
  instante: ['2026-11-02T03:00:00Z', '2026-11-04T02:59:59Z'] })) {
  test(`129 datas ${name} produzem o mesmo contrato para dois dias`, () => {
    assert.deepEqual(harness({ fechamentos: [fechamento(dates[0], '12,50'), fechamento(dates[1], '20,25')], tapiocas: [[dates[0], 3], [dates[1], 4]], combustivel: [[dates[0], '2,50'], [dates[1], '3,25']] }).summary(), result(32.75, 0, 0, 0, 5.75, 7));
  });
}
test('129 filtra outubro e dezembro nas três fontes', () => {
  assert.deepEqual(harness({ fechamentos: [fechamento('31/10/2026', 100), fechamento('02/11/2026', '12,50'), fechamento('01/12/2026', 200)],
    tapiocas: [['31/10/2026', 100], ['02/11/2026', 3], ['01/12/2026', 100]], combustivel: [['31/10/2026', 100], ['02/11/2026', '1,25'], ['01/12/2026', 100]] }).summary(), result(12.5, 0, 0, 0, 1.25, 3));
});
for (const [now, want] of [['2026-12-15T15:00:00Z', 12.5], ['2027-01-15T15:00:00Z', 20.25]]) {
  test(`129 virada do ano usa referência controlada ${now.slice(0, 7)}`, () => {
    assert.equal(harness({ now, fechamentos: [fechamento('31/12/2026', '12,50'), fechamento('01/01/2027', '20,25')] }).summary().total, want);
  });
}
test('129 mês corrente usa America/Sao_Paulo na virada UTC, não o relógio do host', () => {
  assert.equal(harness({ now: '2026-11-01T02:30:00Z', fechamentos: [fechamento('31/10/2026', '12,50'), fechamento('01/11/2026', '20,25')] }).summary().total, 12.5);
});
test('129 Date e ISO com offset respeitam o dia operacional ao redor da meia-noite', () => {
  const datas = ['2026-11-01T02:59:59Z', new NativeDate('2026-11-01T03:00:00Z'), '2026-12-01T00:30:00-03:00'];
  assert.equal(harness({ fechamentos: datas.map((d, i) => fechamento(d, ['100,00', '12,50', '200,00'][i])) }).summary().total, 12.5);
});
test('129 fuso do projeto diferente do fuso da planilha continua explícito', () => {
  assert.equal(harness({ timezone: 'UTC', now: '2026-11-01T02:30:00Z', fechamentos: [fechamento(new NativeDate('2026-11-01T02:30:00Z'), '12,50')] }).summary().total, 12.5);
});
test('129 cache analítico real lê display e mantém contrato em cache hit', () => {
  const h = harness({ realCache: true, fechamentos: [fechamento('2026-11-02', 'R$ 12,50').map(String), fechamento('2026-11-03', '20.25').map(String)],
    tapiocas: [['02/11/2026', '3'], ['03/11/2026', '4']], combustivel: [['02/11/2026', '2,50'], ['03/11/2026', '3.25']] });
  assert.deepEqual(h.summary(), result(32.75, 0, 0, 0, 5.75, 7)); assert.deepEqual(h.summary(), result(32.75, 0, 0, 0, 5.75, 7));
  assert.equal(h.reads.length, 3); assert.ok(h.reads.every(r => r.endsWith(':display')));
});
test('129 ausentes e linhas inteiramente vazias têm regra explícita de zero', () => {
  assert.deepEqual(harness({ fechamentos: [[], ['', '', ''], fechamento('02/11/2026', null, '', undefined, 0)], tapiocas: [['02/11/2026', '']], combustivel: [['02/11/2026', ' ']] }).summary(), result());
  assert.deepEqual(harness({ missing: ['Fechamentos_Diarios', 'Tapiocas Diária', 'Combustivel'] }).summary(), result());
});
for (const value of ['abc', 'abc12', '12,50 extra', 'R$', '1,234.56', '12,,50', true, Infinity, NaN, {}, 1e16]) {
  test(`129 valor monetário inválido não vazio bloqueia: ${String(value)}`, () => {
    assert.throws(() => harness({ fechamentos: [fechamento('02/11/2026', value)] }).summary(), e => e.code === 'MONTHLY_SUMMARY_INVALID_VALUE');
  });
}
for (const value of ['3 pedidos', 3.5, -1, NaN, Infinity, true, 'abc', 1e16]) {
  test(`129 quantidade inválida bloqueia: ${String(value)}`, () => {
    assert.throws(() => harness({ tapiocas: [['02/11/2026', value]] }).summary(), e => e.code === 'MONTHLY_SUMMARY_INVALID_QUANTITY');
  });
}
for (const value of ['', '31/11/2026', 'texto', new NativeDate(NaN), '2026-02-30T12:00:00Z', '02/11/2026 25:00', false]) {
  test(`129 data inválida em linha preenchida bloqueia: ${String(value)}`, () => {
    assert.throws(() => harness({ fechamentos: [fechamento(value, '12,50')] }).summary(), e => e.code === 'MONTHLY_SUMMARY_INVALID_DATE');
  });
}
test('129 duplicidade de fechamento ou contagem do mesmo dia bloqueia sem corrigir histórico', () => {
  assert.throws(() => harness({ fechamentos: [fechamento('02/11/2026', '12,50'), fechamento(new NativeDate('2026-11-02T20:00:00Z'), '12,50')] }).summary(), e => e.code === 'MONTHLY_SUMMARY_DUPLICATE_DATE');
  assert.throws(() => harness({ tapiocas: [['02/11/2026', 3], ['2026-11-02', 4]] }).summary(), e => e.code === 'MONTHLY_SUMMARY_DUPLICATE_DATE');
});
test('129 dois abastecimentos legítimos no mesmo dia são somados', () => {
  assert.equal(harness({ combustivel: [['02/11/2026', '2,50'], ['02/11/2026', '3,25']] }).summary().combustivel, 5.75);
});
for (const status of ['PROCESSANDO', 'CANCELADO', 'DESCONHECIDO', 0, false]) {
  test(`129 fechamento ${status} não é tratado como faturamento mensal válido`, () => {
    assert.throws(() => harness({ fechamentos: [fechamento('02/11/2026', '12,50', 0, 0, 0, status)] }).summary(), e => e.code === 'MONTHLY_SUMMARY_INCOMPLETE_CLOSURE');
  });
}
test('129 legado sem status e fechamento concluído permanecem aceitos', () => {
  assert.equal(harness({ fechamentos: [fechamento('02/11/2026', '12,50'), fechamento('03/11/2026', '20,25', 0, 0, 0, 'CONCLUIDO')] }).summary().total, 32.75);
});
test('129 inválido numérico de outro mês válido não contamina o mês selecionado', () => {
  assert.equal(harness({ fechamentos: [fechamento('31/10/2026', 'erro'), fechamento('02/11/2026', '12,50')] }).summary().total, 12.5);
});
test('129 contrato JSON mantém exatamente seis campos numéricos e frontend compatível', () => {
  const h = harness(); const got = h.summary(); assert.deepEqual(Object.keys(got).sort(), ['combustivel', 'credito', 'debito', 'qtdTapiocas', 'total', 'vr']);
  assert.ok(Object.values(got).every(Number.isFinite));
  const html = read('frontend/index.html'); assert.ok(['dados.total', 'dados.credito', 'dados.debito', 'dados.vr', 'dados.combustivel', 'dados.qtdTapiocas'].every(field => html.includes(field)));
});
test('129 overflow textual monetário não pode virar zero no normalizador legado', () => {
  assert.throws(() => harness({ fechamentos: [fechamento('02/11/2026', '9'.repeat(400))] }).summary(), e => e.code === 'MONTHLY_SUMMARY_INVALID_VALUE');
});
test('129 overflow textual de quantidade não pode virar contagem zero', () => {
  assert.throws(() => harness({ tapiocas: [['02/11/2026', '9'.repeat(400)]] }).summary(), e => e.code === 'MONTHLY_SUMMARY_INVALID_QUANTITY');
});
test('129 overflow da soma é diagnosticado mesmo com parcelas individualmente seguras', () => {
  assert.throws(() => harness({ fechamentos: [fechamento('02/11/2026', '90071992547409,90'), fechamento('03/11/2026', '90071992547409,90')] }).summary(), e => e.code === 'MONTHLY_SUMMARY_UNSAFE_TOTAL');
  assert.throws(() => harness({ tapiocas: [['02/11/2026', Number.MAX_SAFE_INTEGER], ['03/11/2026', 1]] }).summary(), e => e.code === 'MONTHLY_SUMMARY_UNSAFE_TOTAL');
});

test('129 Web App resolve uma vez a planilha configurada para todas as leituras', () => {
  const h = harness({ webApp: true, realCache: true,
    fechamentos: [fechamento('02/11/2026', '12,50').map(String), fechamento('03/11/2026', '20,25').map(String)],
    tapiocas: [['03/11/2026', '7']], combustivel: [['02/11/2026', '5,75']] });
  assert.deepEqual(h.summary(), result(32.75, 0, 0, 0, 5.75, 7));
  assert.deepEqual(h.opened, ['fixture-planilha']);
  assert.equal(h.reads.length, 3);
});

test('129 Web App sem planilha configurada falha sem consultar abas ou gravar', () => {
  const h = harness({ webApp: true, configured: false, realCache: true });
  assert.throws(() => h.summary(), /planilha operacional do Tapimóvel não está disponível/);
  assert.deepEqual(h.opened, []);
  assert.deepEqual(h.reads, []);
  assert.deepEqual(h.writes, []);
});
