const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeRange {
  constructor(sheet, row, column, numRows = 1, numColumns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }

  getValues() {
    return this.sheet.read(this.row, this.column, this.numRows, this.numColumns);
  }

  getDisplayValues() {
    return this.getValues().map(row => row.map(value => {
      if (value instanceof Date) return value.toISOString();
      return value == null ? "" : String(value);
    }));
  }

  setValues(values) {
    this.sheet.write(this.row, this.column, values);
    return this;
  }

  setValue(value) {
    return this.setValues([[value]]);
  }

  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
}

class FakeSheet {
  constructor(name, rows = [], failOnAppendNumber = 0) {
    this.name = name;
    this.rows = rows.map(row => row.slice());
    this.appendCount = 0;
    this.failOnAppendNumber = failOnAppendNumber;
  }

  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 0); }
  setFrozenRows() { return this; }

  appendRow(row) {
    this.appendCount += 1;
    if (this.appendCount === this.failOnAppendNumber) {
      this.failOnAppendNumber = 0;
      throw new Error("Falha simulada na gravação mensal v2.");
    }
    this.rows.push(row.slice());
    return this;
  }

  getRange(rowOrA1, column, numRows, numColumns) {
    if (typeof rowOrA1 === "string") return new FakeRange(this, 1, 1, 1, 1);
    return new FakeRange(this, rowOrA1, column, numRows || 1, numColumns || 1);
  }

  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(1, this.rows.length), Math.max(1, this.getLastColumn()));
  }

  read(row, column, numRows, numColumns) {
    const result = [];
    for (let r = 0; r < numRows; r++) {
      const source = this.rows[row - 1 + r] || [];
      const current = [];
      for (let c = 0; c < numColumns; c++) current.push(source[column - 1 + c] ?? "");
      result.push(current);
    }
    return result;
  }

  write(row, column, values) {
    values.forEach((source, rowOffset) => {
      const targetRow = row - 1 + rowOffset;
      while (this.rows.length <= targetRow) this.rows.push([]);
      source.forEach((value, columnOffset) => {
        this.rows[targetRow][column - 1 + columnOffset] = value;
      });
    });
  }
}

class FakeSpreadsheet {
  constructor(options = {}) {
    this.options = options;
    this.sheets = new Map();
  }

  add(name, rows) {
    const sheet = new FakeSheet(name, rows);
    this.sheets.set(name, sheet);
    return sheet;
  }

  getSheetByName(name) { return this.sheets.get(name) || null; }

  insertSheet(name) {
    const failOnAppend = name === "Fechamentos_Mensais_v2" && this.options.failV2Once ? 2 : 0;
    if (name === "Fechamentos_Mensais_v2") this.options.failV2Once = false;
    const sheet = new FakeSheet(name, [], failOnAppend);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

function report(month, year) {
  return {
    mes: Number(month),
    ano: Number(year),
    chave: `${year}-${String(month).padStart(2, "0")}`,
    faturamento: 1000,
    taxas: 50,
    subtotal: 950,
    custos: {
      combustivelCarro: 80,
      salarioCozinha: 100,
      salarioAuxCarro: 50,
      manutencaoCarro: 20
    },
    totalCustos: 250,
    liquido: 700,
    distribuicao: { compra: 490, lucas: 175, eliel: 35 },
    totalTapiocas: 70,
    melhorRota: { rota: "Segunda-feira" },
    top3: [{ produto: "Bauru", quantidade: 20 }],
    menosVendidas: [{ produto: "Beijinho", quantidade: 1 }]
  };
}

function createContext(options = {}) {
  const spreadsheet = new FakeSpreadsheet(options);
  const properties = new Map([["pdv_vendas_ativas", "[]"]]);
  const lock = { waitLock() {}, releaseLock() {} };
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Error,
    RegExp,
    isFinite,
    parseFloat,
    parseInt,
    Utilities: {
      formatDate(_date, _timezone, format) {
        if (format === "yyyy-MM-dd") return "2026-08-21";
        if (format === "yyyy-MM") {
          return `${_date.getFullYear()}-${String(_date.getMonth() + 1).padStart(2, "0")}`;
        }
        return "21/08/2026";
      }
    },
    Session: { getScriptTimeZone() { return "America/Sao_Paulo"; } },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return properties.has(key) ? properties.get(key) : null; },
          setProperty(key, value) { properties.set(key, String(value)); return this; },
          deleteProperty(key) { properties.delete(key); return this; }
        };
      }
    },
    CacheService: { getScriptCache() { return { get() { return null; }, put() {}, remove() {} }; } },
    LockService: { getDocumentLock() { return lock; }, getScriptLock() { return lock; } },
    SpreadsheetApp: { getActiveSpreadsheet() { return spreadsheet; } },
    ContentService: {
      MimeType: { JSON: "JSON" },
      createTextOutput() { return { setMimeType() { return this; } }; }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  const appsScriptDir = path.join(__dirname, "../apps-script");
  const arquivosGs = fs.readdirSync(appsScriptDir)
    .filter(nome => nome.endsWith(".gs"))
    .sort();
  const code = arquivosGs
    .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))
    .join("\n\n");
  vm.runInContext(code, context, { filename: "AppsScript.bundle.gs" });
  context.obterRelatorioEliel = (month, year) => JSON.stringify(report(month, year));
  return { context, spreadsheet, properties };
}

function seedLegacy(spreadsheet) {
  spreadsheet.add("Fechamentos_Mensais", [
    ["Mês Referência", "Qtd Tapiocas", "Faturamento Total", "Caixa Reposição (60%)", "Lucro Lucas (30%)", "Lucro Eliel (10%)"],
    ["Março de 2026", "284 un", 4100, 2460, 1230, 410]
  ]);
  spreadsheet.add("Relatorio Eliel", [[
    "Mês", "Fechado em", "Faturamento", "Taxas", "Subtotal", "Combustível",
    "Salário Cozinha", "Salário Aux. Carro", "Manutenção Carro", "Líquido",
    "Compra", "Lucas", "Eliel", "Tapiocas", "Melhor Rota", "Top 3",
    "Cinco Menos Vendidas", "Dados Completos", "Responsável"
  ]]);
  spreadsheet.add("Log Relatorio Eliel", [["Data e hora", "Evento", "Mês referência", "Responsável"]]);
}

test("fechamento usa v2 e preserva integralmente a aba mensal legada", () => {
  const { context, spreadsheet } = createContext();
  seedLegacy(spreadsheet);
  const legacyBefore = JSON.stringify(spreadsheet.getSheetByName("Fechamentos_Mensais").rows);

  const result = JSON.parse(context.fecharMesRelatorioEliel(7, 2026, "{}", "CEO Eliel"));

  assert.equal(result.ok, true);
  assert.equal(result.recuperado, false);
  assert.equal(JSON.stringify(spreadsheet.getSheetByName("Fechamentos_Mensais").rows), legacyBefore);
  assert.equal(spreadsheet.getSheetByName("Fechamentos_Mensais_v2").rows.length, 2);
  assert.equal(spreadsheet.getSheetByName("Fechamentos_Mensais_v2").rows[1][0], "2026-07");
  assert.equal(spreadsheet.getSheetByName("Relatorio Eliel").rows.length, 2);
  assert.equal(spreadsheet.getSheetByName("Controle_Operacoes").rows[1][3], "CONCLUIDO");
  assert.throws(
    () => context.fecharMesRelatorioEliel(7, 2026, "{}", "CEO Eliel"),
    /já foi fechado/
  );
});

test("falha parcial pode ser retomada sem duplicar o relatório", () => {
  const { context, spreadsheet } = createContext({ failV2Once: true });
  seedLegacy(spreadsheet);

  assert.throws(
    () => context.fecharMesRelatorioEliel(7, 2026, "{}", "CEO Eliel"),
    /Falha simulada/
  );
  assert.equal(spreadsheet.getSheetByName("Relatorio Eliel").rows.length, 2);
  assert.equal(spreadsheet.getSheetByName("Controle_Operacoes").rows[1][3], "ERRO");

  const preview = context.montarPreviaFechamentoRelatorioEliel_(7, 2026, "{}");
  assert.equal(preview.recuperavel, true);
  assert.equal(preview.duplicado, false);
  assert.equal(preview.podeFechar, true);

  const result = JSON.parse(context.fecharMesRelatorioEliel(7, 2026, "{}", "CEO Eliel"));
  assert.equal(result.recuperado, true);
  assert.equal(spreadsheet.getSheetByName("Relatorio Eliel").rows.length, 2);
  assert.equal(spreadsheet.getSheetByName("Fechamentos_Mensais_v2").rows.length, 2);
  assert.equal(spreadsheet.getSheetByName("Log Relatorio Eliel").rows.length, 2);
  assert.equal(spreadsheet.getSheetByName("Controle_Operacoes").rows[1][3], "CONCLUIDO");
});

test("referência mensal legada continua impedindo fechamento duplicado", () => {
  const { context, spreadsheet } = createContext();
  seedLegacy(spreadsheet);

  const preview = context.montarPreviaFechamentoRelatorioEliel_(3, 2026, "{}");
  assert.equal(preview.duplicado, true);
  assert.equal(preview.podeFechar, false);
  assert.equal(spreadsheet.getSheetByName("Fechamentos_Mensais_v2"), null);
  assert.equal(spreadsheet.getSheetByName("Controle_Operacoes"), null);
});
