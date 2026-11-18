const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appsScriptDir = path.join(__dirname, "..", "apps-script");
const code = fs.readdirSync(appsScriptDir)
  .filter(nome => nome.endsWith(".gs"))
  .sort()
  .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))
  .join("\n\n");

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
  assert.match(code, /function salvarNuvemCompleta\(historicoJSON\)[\s\S]*?substituirFilaPdvAtivos_/);
});

function criarAmbiente() {
  let outraExecucaoComTrava = false;
  let falharGravacao = false;
  let naConfirmacao = null;
  const cache = new Map();

  class Range {
    constructor(sheet, row, col, rows, cols) {
      this.sheet = sheet;
      this.row = row;
      this.col = col;
      this.rows = rows;
      this.cols = cols;
    }
    setValues(values) {
      if (falharGravacao) throw new Error("Gravação rejeitada");
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
    getId() { return "planilha-de-teste"; }
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
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      flush() { if (naConfirmacao) naConfirmacao(); },
    },
    Utilities: {
      formatDate(_data, _fuso, formato) { return formato === "HH:mm" ? "15:30" : "2026-11-17"; },
    },
    Session: { getScriptTimeZone: () => "America/Sao_Paulo" },
    PropertiesService: { getScriptProperties: () => props },
    CacheService: {
      getScriptCache: () => ({
        get: key => cache.get(key) ?? null,
        put: (key, value) => cache.set(key, value),
        remove: key => cache.delete(key),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          if (outraExecucaoComTrava) throw new Error("Tempo limite do bloqueio");
        },
        releaseLock() {},
      }),
    },
    console: { info() {}, error() {} },
  };

  const bloco = code + `\nthis.__storage = {
    registrarPedidoPdv, carregarDadosNuvem, listarPedidosOnlinePendentes,
    carregarFilaPdvAtivos_, substituirFilaPdvAtivos_,
    carregarFilaPedidosOnlinePendentes_, substituirFilaPedidosOnlinePendentes_
  };`;
  vm.runInNewContext(bloco, context);
  context.obterConfiguracaoOperacional = () => "{}";
  context.lancarPedidoPlanilha = () => {};
  return {
    spreadsheet, props, data, api: context.__storage,
    simularOutraExecucaoComTrava: valor => { outraExecucaoComTrava = valor; },
    simularFalhaDeGravacao: valor => { falharGravacao = valor; },
    duranteConfirmacao: executar => { naConfirmacao = executar; },
  };
}

test("lançamento confirmado fica imediatamente disponível durante a próxima trava", () => {
  const env = criarAmbiente();
  assert.deepEqual(JSON.parse(env.api.carregarDadosNuvem()), []);
  const novo = JSON.stringify({
    idRequisicao: "pdv-20261117-abcdefghijkl",
    itens: [{ nome: "Tapioca teste", tipo: "tapioca", quantidade: 1, preco: 10 }]
  });
  env.duranteConfirmacao(() => {
    env.simularOutraExecucaoComTrava(true);
    assert.ok(Array.isArray(JSON.parse(env.api.carregarDadosNuvem())));
    env.simularOutraExecucaoComTrava(false);
  });
  const registrado = env.api.registrarPedidoPdv(novo);
  env.simularOutraExecucaoComTrava(true);
  const fila = JSON.parse(env.api.carregarDadosNuvem());
  assert.equal(fila.length, 1);
  assert.equal(fila[0].idRequisicao, registrado.idRequisicao);
  assert.equal(fila[0].itens[0].nome, "Tapioca teste");
  assert.equal(fila[0].total, 10);
});

test("leituras simultâneas exibem a última fila confirmada durante uma trava", () => {
  const env = criarAmbiente();
  env.api.substituirFilaPdvAtivos_([{ numero: 7, timestampCriacao: 111 }]);
  env.api.substituirFilaPedidosOnlinePendentes_([{ codigoOnline: "ON003", timestampCriacao: 222 }]);
  env.api.carregarDadosNuvem();
  env.api.listarPedidosOnlinePendentes();

  env.simularOutraExecucaoComTrava(true);
  assert.deepEqual(JSON.parse(env.api.carregarDadosNuvem()), [{ numero: 7, timestampCriacao: 111 }]);
  assert.deepEqual(Array.from(env.api.listarPedidosOnlinePendentes(), item => item.codigoOnline), ["ON003"]);

  env.simularOutraExecucaoComTrava(false);
  env.api.substituirFilaPdvAtivos_([{ numero: 8, timestampCriacao: 333 }]);
  env.api.substituirFilaPedidosOnlinePendentes_([]);
  assert.deepEqual(JSON.parse(env.api.carregarDadosNuvem()), [{ numero: 8, timestampCriacao: 333 }]);
  assert.equal(env.api.listarPedidosOnlinePendentes().length, 0);
});

test("fila inicializada continua legível sem cache durante uma trava", () => {
  const env = criarAmbiente();
  env.api.substituirFilaPdvAtivos_([{ numero: 7, timestampCriacao: 111 }]);
  env.api.substituirFilaPedidosOnlinePendentes_([{ codigoOnline: "ON003", timestampCriacao: 222 }]);

  env.simularOutraExecucaoComTrava(true);
  assert.equal(JSON.parse(env.api.carregarDadosNuvem())[0].numero, 7);
  assert.equal(env.api.listarPedidosOnlinePendentes()[0].codigoOnline, "ON003");

  env.props.setProperty("pdv_vendas_ativas", "[]");
  assert.throws(() => env.api.carregarDadosNuvem(), /Tempo limite do bloqueio/);
});

test("uma gravação rejeitada preserva a fila anterior", () => {
  const env = criarAmbiente();
  env.api.substituirFilaPdvAtivos_([{ numero: 7, timestampCriacao: 111 }]);
  env.api.carregarDadosNuvem();

  env.simularFalhaDeGravacao(true);
  assert.throws(() => env.api.substituirFilaPdvAtivos_([{ numero: 8, timestampCriacao: 222 }]), /Gravação rejeitada/);
  assert.deepEqual(JSON.parse(env.api.carregarDadosNuvem()), [{ numero: 7, timestampCriacao: 111 }]);
});

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
