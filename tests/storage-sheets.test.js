const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");

test("filas operacionais não são mais escritas no PropertiesService", () => {
  assert.doesNotMatch(code, /setProperty\(["']pdv_vendas_ativas["']/);
  assert.doesNotMatch(code, /setProperty\(["']pedidos_online_pendentes["']/);
  assert.doesNotMatch(code, /getProperty\(["']pdv_vendas_ativas["']/);
  assert.doesNotMatch(code, /getProperty\(["']pedidos_online_pendentes["']/);
  assert.match(code, /const ABA_STORAGE_PDV_ATIVOS_ = "Pedidos_Ativos";/);
  assert.match(code, /const ABA_STORAGE_ONLINE_PENDENTES_ = "Pedidos_Online_Pendentes";/);
  assert.match(code, /deleteProperty\(CHAVE_LEGADA_PDV_ATIVOS_\)/);
  assert.match(code, /deleteProperty\(CHAVE_LEGADA_ONLINE_PENDENTES_\)/);
});

test("contratos públicos continuam iguais e usam storage em Sheets", () => {
  assert.match(code, /function carregarDadosNuvem\(\)[\s\S]*?JSON\.stringify\(carregarFilaPdvAtivos_\(\)\)/);
  assert.match(code, /function salvarNuvemCompleta\(historicoJSON\)[\s\S]*?substituirFilaPdvAtivos_/);
  assert.match(code, /function listarPedidosOnlinePendentes\(\)[\s\S]*?carregarFilaPedidosOnlinePendentes_/);
  assert.match(code, /lock\.waitLock\(10000\);[\s\S]*?JSON\.stringify\(carregarFilaPdvAtivos_\(\)\)/);
});

function criarAmbiente() {
  class Range {
    constructor(sheet, row, col, rows, cols) {
      this.sheet = sheet;
      this.row = row;
      this.col = col;
      this.rows = rows;
      this.cols = cols;
    }
    setValues(values) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.sheet.set(this.row + r, this.col + c, values[r][c]);
        }
      }
      return this;
    }
    getValues() {
      const out = [];
      for (let r = 0; r < this.rows; r++) {
        const linha = [];
        for (let c = 0; c < this.cols; c++) {
          linha.push(this.sheet.get(this.row + r, this.col + c));
        }
        out.push(linha);
      }
      return out;
    }
    clearContent() {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.sheet.set(this.row + r, this.col + c, "");
        }
      }
      return this;
    }
    setFontWeight() { return this; }
    setBackground() { return this; }
  }

  class Sheet {
    constructor(name) {
      this.name = name;
      this.cells = [];
    }
    set(row, col, value) {
      while (this.cells.length < row) this.cells.push([]);
      while (this.cells[row - 1].length < col) this.cells[row - 1].push("");
      this.cells[row - 1][col - 1] = value;
    }
    get(row, col) {
      return (this.cells[row - 1] && this.cells[row - 1][col - 1]) ?? "";
    }
    getLastRow() {
      for (let r = this.cells.length; r >= 1; r--) {
        if ((this.cells[r - 1] || []).some(v => v !== "" && v != null)) return r;
      }
      return 0;
    }
    getRange(row, col, rows, cols) { return new Range(this, row, col, rows, cols); }
    setFrozenRows() { return this; }
  }

  class Spreadsheet {
    constructor() { this.sheets = new Map(); }
    getSheetByName(name) { return this.sheets.get(name) || null; }
    insertSheet(name) {
      const sheet = new Sheet(name);
      this.sheets.set(name, sheet);
      return sheet;
    }
  }

  const spreadsheet = new Spreadsheet();
  const data = new Map();
  const props = {
    getProperty: key => data.has(key) ? data.get(key) : null,
    setProperty: (key, value) => data.set(key, String(value)),
    deleteProperty: key => data.delete(key),
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => props },
    console: { info() {}, error() {} },
  };

  const inicio = code.indexOf("// STORAGE RESILIENTE — FILAS NO GOOGLE SHEETS");
  const fim = code.indexOf("// 2. SISTEMA DE NUVEM (BLINDADO COM LOCKSERVICE)");
  assert.ok(inicio >= 0 && fim > inicio, "bloco de storage deve existir");
  const bloco = code.slice(inicio, fim) + `\nthis.__storage = {
    carregarFilaPdvAtivos_, substituirFilaPdvAtivos_,
    carregarFilaPedidosOnlinePendentes_, substituirFilaPedidosOnlinePendentes_
  };`;
  vm.runInNewContext(bloco, context);
  return { spreadsheet, props, data, api: context.__storage };
}

test("migração automática preserva filas e remove somente as duas chaves legadas", () => {
  const env = criarAmbiente();
  const ativos = [{ numero: 7, timestampCriacao: 111, status: "Produção", itens: [{ nome: "Frango" }] }];
  const pendentes = [{ codigoOnline: "ON003", numeroOnline: 3, timestampCriacao: 222, statusOnline: "Aguardando" }];
  env.props.setProperty("pdv_vendas_ativas", JSON.stringify(ativos));
  env.props.setProperty("pedidos_online_pendentes", JSON.stringify(pendentes));
  env.props.setProperty("pedidos_online_contador", JSON.stringify({ dia: "2026-08-25", valor: 3 }));

  assert.deepEqual(JSON.parse(JSON.stringify(env.api.carregarFilaPdvAtivos_())), ativos);
  assert.deepEqual(JSON.parse(JSON.stringify(env.api.carregarFilaPedidosOnlinePendentes_())), pendentes);
  assert.equal(env.props.getProperty("pdv_vendas_ativas"), null);
  assert.equal(env.props.getProperty("pedidos_online_pendentes"), null);
  assert.notEqual(env.props.getProperty("pedidos_online_contador"), null);
  assert.ok(env.spreadsheet.getSheetByName("Pedidos_Ativos"));
  assert.ok(env.spreadsheet.getSheetByName("Pedidos_Online_Pendentes"));
});

test("Sheets passa a ser a fonte oficial depois da migração", () => {
  const env = criarAmbiente();
  const primeira = [{ numero: 1, timestampCriacao: 100 }];
  env.props.setProperty("pdv_vendas_ativas", JSON.stringify(primeira));
  env.api.carregarFilaPdvAtivos_();

  const nova = [{ numero: 2, timestampCriacao: 200, produzido: true }];
  env.api.substituirFilaPdvAtivos_(nova);
  assert.equal(env.props.getProperty("pdv_vendas_ativas"), null);
  assert.deepEqual(JSON.parse(JSON.stringify(env.api.carregarFilaPdvAtivos_())), nova);
});

test("legado inválido nunca é apagado silenciosamente", () => {
  const env = criarAmbiente();
  env.props.setProperty("pedidos_online_pendentes", "{json quebrado");
  assert.throws(
    () => env.api.carregarFilaPedidosOnlinePendentes_(),
    /O legado foi preservado/
  );
  assert.equal(env.props.getProperty("pedidos_online_pendentes"), "{json quebrado");
});


test("fechamento P0 consulta a fila ativa já migrada e mantém lock de leitura", () => {
  assert.match(
    code,
    /function obterPedidosPendentesFechamentoEliel_\(mes, ano\)[\s\S]*?LockService\.getScriptLock\(\)[\s\S]*?carregarFilaPdvAtivos_\(\)/
  );
});
