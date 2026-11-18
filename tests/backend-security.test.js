const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function createContext() {
  const properties = new Map();
  const cache = new Map();
  let currentDay = "2026-07-28";
  let computeDigestHook = null;
  const lock = { waitLock() {}, tryLock() { return true; }, hasLock() { return true; }, releaseLock() {} };
  class MemoryRange {
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
      const values = [];
      for (let r = 0; r < this.rows; r++) {
        const row = [];
        for (let c = 0; c < this.cols; c++) {
          row.push(this.sheet.get(this.row + r, this.col + c));
        }
        values.push(row);
      }
      return values;
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
  class MemorySheet {
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
      for (let row = this.cells.length; row >= 1; row--) {
        if ((this.cells[row - 1] || []).some(value => value !== "" && value != null)) return row;
      }
      return 0;
    }
    getLastColumn() {
      return this.cells.reduce((maior, row) => Math.max(maior, row.length), 0);
    }
    getRange(row, col, rows, cols) { return new MemoryRange(this, row, col, rows, cols); }
    getDataRange() {
      return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
    }
    appendRow(values) {
      const row = this.getLastRow() + 1;
      values.forEach((value, index) => this.set(row, index + 1, value));
      return this;
    }
    deleteRow(row) {
      this.cells.splice(row - 1, 1);
      return this;
    }
    setFrozenRows() { return this; }
  }
  const spreadsheet = {
    sheets: new Map(),
    getId() { return "planilha-de-teste"; },
    getSheetByName(name) { return this.sheets.get(name) || null; },
    insertSheet(name) {
      const sheet = new MemorySheet(name);
      this.sheets.set(name, sheet);
      return sheet;
    }
  };
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
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest(_algorithm, value) {
        if (computeDigestHook) {
          const hook = computeDigestHook;
          computeDigestHook = null;
          hook();
        }
        return Array.from(crypto.createHash("sha256").update(String(value)).digest());
      },
      getUuid() {
        return crypto.randomUUID();
      },
      formatDate(_date, _timezone, format) {
        if (format === "yyyy-MM-dd") return currentDay;
        if (format === "yyyy-MM") {
          return `${_date.getFullYear()}-${String(_date.getMonth() + 1).padStart(2, "0")}`;
        }
        if (format === "u") return "2";
        if (format === "H") return "19";
        if (format === "HH:mm") return "19:30";
        return "28/07/2026";
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return properties.has(key) ? properties.get(key) : null; },
          setProperty(key, value) { properties.set(key, String(value)); return this; },
          deleteProperty(key) { properties.delete(key); return this; }
        };
      }
    },
    CacheService: {
      getScriptCache() {
        return {
          get(key) { return cache.has(key) ? cache.get(key) : null; },
          put(key, value) { cache.set(key, String(value)); },
          remove(key) { cache.delete(key); }
        };
      }
    },
    LockService: {
      getScriptLock() { return lock; },
      getDocumentLock() { return lock; }
    },
    Session: {
      getScriptTimeZone() { return "America/Sao_Paulo"; }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() { return spreadsheet; },
      flush() {}
    },
    ContentService: {
      MimeType: { JSON: "JSON" },
      createTextOutput() {
        return { setMimeType() { return this; } };
      }
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
  return {
    context,
    properties,
    spreadsheet,
    onNextComputeDigest(handler) { computeDigestHook = handler; },
    setCurrentDay(day) { currentDay = day; }
  };
}

function catalog() {
  return {
    salgadas: [
      { nome: "Bauru", preco: 14, tipo: "tapioca", ing: "Presunto e muçarela" }
    ],
    especiais: [],
    doces_tradicionais: [],
    doces_avela: [],
    doces_nutella: [],
    bebidas: [
      { nome: "Refrigerante", preco: 6, tipo: "bebida", ing: "" }
    ]
  };
}

function onlineOrder(overrides = {}) {
  return Object.assign({
    nomeCliente: "Cliente Teste",
    telefoneCliente: "11999999999",
    enderecoCliente: "JD SÃO FRANCISCO, Nº 10",
    pagamentoDesejado: "PIX",
    itens: [
      {
        nome: "Bauru",
        preco: 0.01,
        tipo: "bebida",
        quantidade: 2,
        obs: "sem cebola"
      }
    ]
  }, overrides);
}

test("ação administrativa exige sessão válida", () => {
  const { context } = createContext();
  assert.throws(
    () => context.executarAcaoApi_("carregarDadosNuvem", [], ""),
    error => error.code === "AUTH_REQUIRED"
  );
});

test("login cria sessão temporária e PIN incorreto é recusado", () => {
  const { context } = createContext();
  context.configurarPinAdministrador("123456");
  assert.throws(
    () => context.loginAdministrador("000000"),
    error => error.code === "INVALID_CREDENTIALS"
  );
  const session = context.loginAdministrador("123456");
  assert.equal(context.validarSessaoAdministrador(session.token), true);
  context.encerrarSessaoAdministrador(session.token);
  assert.equal(context.validarSessaoAdministrador(session.token), false);
});

test("sessão administrativa é invalidada na mudança do dia", () => {
  const { context, setCurrentDay } = createContext();
  context.configurarPinAdministrador("123456");
  const session = context.loginAdministrador("123456");
  assert.equal(session.diaSessao, "2026-07-28");
  assert.equal(session.inatividadeSegundos, 14400);
  assert.equal(context.validarSessaoAdministrador(session.token), true);

  setCurrentDay("2026-07-29");
  assert.equal(context.validarSessaoAdministrador(session.token), false);
});

test("CEO Eliel recebe sessão própria e identidade fixa", () => {
  const { context } = createContext();
  context.configurarPinEliel("654321");
  const session = context.loginAcesso("654321", "eliel");

  assert.equal(session.perfil, "eliel");
  assert.equal(session.nome, "CEO Eliel");
  assert.equal(context.validarSessaoAdministrador(session.token), false);
  assert.equal(context.validarSessaoAcesso(session.token).perfil, "eliel");
});

test("PIN do CEO Eliel informado no PDV cria somente sessão restrita", () => {
  const { context } = createContext();
  context.configurarPinAdministrador("123456");
  context.configurarPinEliel("654321");

  const session = context.loginAcesso("654321", "admin");

  assert.equal(session.perfil, "eliel");
  assert.equal(session.nome, "CEO Eliel");
  assert.equal(context.validarSessaoAdministrador(session.token), false);
  assert.equal(context.validarSessaoAcesso(session.token).perfil, "eliel");
});

test("PIN de Produção exige quatro dígitos e fica armazenado em credencial derivada única", () => {
  const { context, properties } = createContext();

  assert.throws(
    () => context.configurarPinProducao("482"),
    /4 números/
  );
  assert.throws(
    () => context.configurarPinProducao("48261"),
    /4 números/
  );

  context.configurarPinProducao("4826");
  const primeiraCredencial = properties.get("pdv_producao_pin_credential_v1");
  const primeiraEstrutura = JSON.parse(primeiraCredencial);

  assert.ok(primeiraEstrutura.salt);
  assert.ok(primeiraEstrutura.hash);
  assert.notEqual(primeiraEstrutura.hash, "4826");
  assert.equal([...properties.values()].includes("4826"), false);

  context.configurarPinProducao("4826");
  assert.notEqual(properties.get("pdv_producao_pin_credential_v1"), primeiraCredencial);
});

test("configurações concorrentes nunca publicam salt e hash de PINs diferentes", () => {
  const { context, onNextComputeDigest } = createContext();
  onNextComputeDigest(() => context.configurarPinProducao("8642"));

  context.configurarPinProducao("5931");

  const session = context.loginAcesso("5931", "producao");
  assert.equal(session.perfil, "producao");
});

test("PIN de Produção informado no PDV cria sessão operacional própria", () => {
  const { context } = createContext();
  context.configurarPinAdministrador("731905");
  context.configurarPinEliel("864207");
  context.configurarPinProducao("4826");

  const session = context.loginAcesso("4826", "admin");

  assert.equal(session.perfil, "producao");
  assert.equal(session.nome, "Produção");
  assert.equal(context.validarSessaoAdministrador(session.token), false);
  assert.equal(context.validarSessaoAcesso(session.token).perfil, "producao");
});

test("tentativas de Admin permanecem bloqueadas mesmo após login válido de Produção", () => {
  const { context } = createContext();
  context.configurarPinAdministrador("731905");
  context.configurarPinProducao("5931");

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    assert.throws(
      () => context.loginAcesso("000000", "admin"),
      error => error.code === "INVALID_CREDENTIALS"
    );
  }

  const producao = context.loginAcesso("5931", "admin");
  assert.equal(producao.perfil, "producao");

  assert.throws(
    () => context.loginAcesso("731905", "admin"),
    error => error.code === "LOGIN_BLOCKED"
  );
});

test("administrador configura o PIN e Produção executa somente ações operacionais", () => {
  const { context } = createContext();
  context.configurarPinAdministrador("731905");
  const admin = context.loginAcesso("731905", "admin");

  assert.equal(
    context.executarAcaoApi_("configurarPinProducao", ["5931"], admin.token).data,
    "PIN de Produção configurado com sucesso."
  );

  const producao = context.loginAcesso("5931", "admin");
  const permitidas = [
    "listarPedidosOnlinePendentes",
    "aceitarPedidoOnline",
    "recusarPedidoOnline",
    "carregarDadosNuvem",
    "carregarVendasHojePersistidas",
    "registrarPedidoPdv",
    "atualizarEstadoProducao",
    "finalizarPagamentoProducao",
    "cancelarPedidoProducao",
    "excluirPedidoTravadoProducao"
  ];
  permitidas.forEach(action => {
    context[action] = () => action;
    assert.equal(
      context.executarAcaoApi_(action, [], producao.token).data,
      action
    );
  });

  context.salvarDisponibilidadeCardapio = (_itens, responsavel) => responsavel;
  assert.equal(
    context.executarAcaoApi_(
      "salvarDisponibilidadeCardapio",
      ["[]", "Nome adulterado"],
      producao.token
    ).data,
    "Produção"
  );
});

test("Produção não acessa áreas administrativas", () => {
  const { context } = createContext();
  context.configurarPinAdministrador("731905");
  context.configurarPinProducao("5931");
  const producao = context.loginAcesso("5931", "admin");

  [
    "obterResumoMesPlanilha",
    "inicializarCatalogoConfiguracao",
    "salvarItemCatalogo",
    "salvarConfiguracaoOperacional",
    "obterRelatorioEliel",
    "configurarPinProducao",
    "atualizarVendaRealTime",
    "excluirVendaRealTime",
    "removerDaBaseDeVendasBackend",
    "moverParaHistorico",
    "moverParaCancelados"
  ].forEach(action => {
    assert.throws(
      () => context.executarAcaoApi_(action, [], producao.token),
      error => error.code === "PERMISSION_DENIED"
    );
  });
});

test("Produção edita pedido não pago preservando identidade e preparo dos itens intactos", () => {
  const { context } = createContext();
  context.configurarPinProducao("5931");
  const { token } = context.loginAcesso("5931", "producao");
  const item = { nome: "Bauru", tipo: "tapioca", quantidade: 1, preco: 14, pronto: true };
  const anterior = {
    numero: 7, timestampCriacao: 123456, idRequisicao: "pdv-test-abcdefghijkl", origem: "Online",
    codigoOnline: "ON001", itens: [item], total: 14, produzido: true
  };
  context.substituirFilaPdvAtivos_([anterior]);
  context.removerDaBaseDeVendasBackend = () => {};
  context.lancarPedidoPlanilha = () => {};
  assert.throws(() => context.executarAcaoApi_("atualizarPedidoPdv", [JSON.stringify(anterior)], token),
    e => e.code === "ORDER_CHANGED");
  const editado = { ...anterior, itensOriginaisEdicao: JSON.stringify(anterior.itens),
    itens: [{ ...item, pronto: false }, { ...item, nome: "Pizza", pronto: true }] };
  const r = context.executarAcaoApi_("atualizarPedidoPdv", [JSON.stringify(editado)], token).data;
  assert.equal(r.total, 28);
  assert.equal(r.numero, anterior.numero);
  assert.equal(r.origem, "Online");
  assert.equal(r.codigoOnline, "ON001");
  assert.equal(r.itens[0].pronto, true);
  assert.equal(r.itens[1].pronto, false);
  assert.throws(() => context.executarAcaoApi_("atualizarPedidoPdv", [JSON.stringify(editado)], token),
    e => e.code === "ORDER_CHANGED");
  context.substituirFilaPdvAtivos_([{ ...r, timestamp: Date.now() }]);
  assert.throws(() => context.executarAcaoApi_("atualizarPedidoPdv", [JSON.stringify(editado)], token),
    e => e.code === "ORDER_PAID");
});

test("fechamento consolida data nativa e data em texto sem repetir ou limpar outro dia", () => {
  const { context, spreadsheet } = createContext();
  context.Utilities.formatDate = (data, _fuso, formato) => {
    const [ano, mes, dia] = data.toISOString().slice(0, 10).split("-");
    const curto = dia + "/" + mes + "/" + ano;
    return formato === "dd/MM/yyyy, HH:mm:ss" ? curto + ", 20:00:00" :
      formato === "yyyyMMdd" ? ano + mes + dia : curto;
  };
  const vendas = context.garantirEstruturaVendasHojeCompleta_(spreadsheet);
  vendas.appendRow([new Date("2026-07-28T20:00:00Z"), "#31@hml-a", 2, "Bauru", "PIX", 28, "TAPIOCA", 14]);
  vendas.appendRow(["29/07/2026, 20:00:00", "#32@hml-b", 1, "Pizza", "Dinheiro", 13, "TAPIOCA", 13]);
  const primeiro = JSON.parse(context.fecharDiaSeguro("28/07/2026", "MANUAL"));
  assert.equal(primeiro.status, "CONCLUIDO");
  assert.equal(primeiro.resumo.total, 28);
  assert.equal(primeiro.resumo.qtdTapiocas, 2);
  assert.equal(vendas.getLastRow(), 2);
  assert.equal(vendas.get(2, 2), "#32@hml-b");
  const segundo = JSON.parse(context.fecharDiaSeguro("29/07/2026", "MANUAL"));
  assert.equal(segundo.status, "CONCLUIDO");
  assert.equal(segundo.resumo.total, 13);
  assert.equal(JSON.parse(context.fecharDiaSeguro("28/07/2026", "MANUAL")).status, "JA_FECHADO");
  assert.equal(JSON.parse(context.fecharDiaSeguro("29/07/2026", "MANUAL")).status, "JA_FECHADO");
  assert.equal(spreadsheet.getSheetByName("Historico_Diario").getLastRow(), 3);
  assert.equal(spreadsheet.getSheetByName("Fechamentos_Diarios").getLastRow(), 3);
  assert.equal(spreadsheet.getSheetByName("Tapiocas Diária").getLastRow(), 3);
  assert.equal(vendas.getLastRow(), 1);
});

test("fechamento bloqueia divergência entre os pagamentos e o total e preserva as vendas", () => {
  const { context, spreadsheet } = createContext();
  const vendas = context.garantirEstruturaVendasHojeCompleta_(spreadsheet);
  vendas.appendRow(["28/07/2026, 20:00:00", "#31@hml", 1, "Bauru", "Misto", 14, "TAPIOCA", 14, "", '[{"forma":"PIX","valor":10}]']);
  assert.equal(JSON.parse(context.obterPreviaFechamentoDiario("28/07/2026")).status, "DIVERGENCIA_PAGAMENTOS");
  assert.equal(JSON.parse(context.fecharDiaSeguro("28/07/2026", "MANUAL")).status, "DIVERGENCIA_PAGAMENTOS");
  assert.equal(vendas.getLastRow(), 2);
  assert.equal(spreadsheet.getSheetByName("Fechamentos_Diarios"), null);
});

test("a virada fecha a véspera, mantém pendências e preserva o comprovante", () => {
  const { context, spreadsheet } = createContext();
  context.Utilities.formatDate = (data, _fuso, formato) => {
    const partes = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(data);
    return formato === "dd/MM/yyyy, HH:mm:ss" ? partes + ", 20:00:00" : partes;
  };
  const vendas = context.garantirEstruturaVendasHojeCompleta_(spreadsheet);
  vendas.appendRow(["31/07/2026, 20:00:00", "#31@ontem", 2, "Bauru", "PIX", 28, "TAPIOCA", 14]);
  vendas.appendRow(["01/08/2026, 00:01:00", "#32@hoje", 1, "Pizza", "Dinheiro", 13, "TAPIOCA", 13]);
  const pendente = { numero: 33, timestampCriacao: Date.parse("2026-07-31T22:30:00-03:00") };
  context.carregarFilaPdvAtivos_ = () => [pendente];
  const verificarVirada = () => context.processarFechamentoDiarioAutomatico_(new Date("2026-08-01T00:02:00-03:00"));
  assert.equal(verificarVirada().resultados[0].status, "BLOQUEADO_PENDENCIAS");
  assert.equal(vendas.getLastRow(), 3);
  context.carregarFilaPdvAtivos_ = () => [];
  assert.equal(verificarVirada().resultados[0].status, "CONCLUIDO");
  assert.equal(vendas.getLastRow(), 2);
  assert.equal(vendas.get(2, 2), "#32@hoje");
  assert.equal(verificarVirada().status, "NADA_PENDENTE");
  const fechamentos = spreadsheet.getSheetByName("Fechamentos_Diarios");
  assert.equal(fechamentos.getLastRow(), 2);
  assert.equal(fechamentos.get(2, 2), 28);
  const salvo = fechamentos.get(2, 11);
  assert.match(salvo, /R\$\s28,00/);
  assert.match(salvo, />2 un</);
  assert.equal(context.obterPrintFechamentoDiario("31/07/2026").svg, salvo);
  assert.equal(context.listarFechamentosDiarios("2026-07")[0].automatico, true);
  assert.equal(context.listarFechamentosDiarios("2026-08").length, 0);

  const semVendas = context.processarFechamentoDiarioAutomatico_(new Date("2026-08-03T00:02:00-03:00"));
  assert.equal(semVendas.resultados[1].data, "02/08/2026");
  assert.equal(semVendas.resultados[1].resumo.total, 0);
  assert.equal(fechamentos.get(4, 2), 0);
});

test("histórico diário aceita Admin e Eliel e recusa Produção e visitantes", () => {
  const { context } = createContext();
  const tokens = ["admin", "eliel", "producao"].map(perfil => context.criarSessaoAcesso_(perfil, perfil).token);
  for (const [acao, argumentos] of [["listarFechamentosDiarios", ["2026-07"]], ["obterPrintFechamentoDiario", ["28/07/2026"]]]) {
    assert.throws(() => context.executarAcaoApi_(acao, argumentos, ""), erro => erro.code === "AUTH_REQUIRED");
    assert.throws(() => context.executarAcaoApi_(acao, argumentos, tokens[2]), erro => erro.code === "PERMISSION_DENIED");
    for (const token of tokens.slice(0, 2)) {
      if (acao === "listarFechamentosDiarios") assert.equal(context.executarAcaoApi_(acao, argumentos, token).ok, true);
      else assert.throws(() => context.executarAcaoApi_(acao, argumentos, token), erro => erro.code === "INVALID_CLOSURE");
    }
  }
});

test("falha na conferência do fechamento preserva os dados para nova tentativa", () => {
  const { context, spreadsheet } = createContext();
  const vendas = context.garantirEstruturaVendasHojeCompleta_(spreadsheet);
  vendas.appendRow(["28/07/2026, 20:00:00", "#31@hml", 1, "Bauru", "PIX", 14, "TAPIOCA", 14]);
  const conferir = context.validarPersistenciaFechamentoDiario_;
  context.validarPersistenciaFechamentoDiario_ = () => { throw new Error("Confirmação rejeitada"); };
  assert.throws(() => context.fecharDiaSeguro("28/07/2026", "MANUAL"), /Confirmação rejeitada/);
  assert.equal(vendas.getLastRow(), 2);
  assert.equal(spreadsheet.getSheetByName("Fechamentos_Diarios").getLastRow(), 1);
  context.validarPersistenciaFechamentoDiario_ = conferir;
  assert.equal(JSON.parse(context.fecharDiaSeguro("28/07/2026", "MANUAL")).status, "CONCLUIDO");
  assert.equal(vendas.getLastRow(), 1);
  assert.equal(spreadsheet.getSheetByName("Fechamentos_Diarios").getLastRow(), 2);
});

test("Produção atualiza somente o estado operacional do pedido existente", () => {
  const { context } = createContext();
  context.configurarPinAdministrador("731905");
  context.configurarPinProducao("5931");
  const producao = context.loginAcesso("5931", "admin");
  context.substituirFilaPdvAtivos_([{
    numero: 7,
    itens: [{ nome: "Bauru", tipo: "tapioca", quantidade: 2, preco: 14, pronto: false }],
    total: 28,
    produzido: false,
    timestampCriacao: Date.now()
  }]);

  context.executarAcaoApi_("atualizarEstadoProducao", [JSON.stringify({
    numero: 7,
    itens: [{ nome: "Fraude", quantidade: 99, preco: 0.01, pronto: true }],
    total: 0.99,
    produzido: true
  })], producao.token);

  const salvo = JSON.parse(context.carregarDadosNuvem())[0];
  assert.equal(salvo.itens[0].nome, "Bauru");
  assert.equal(salvo.itens[0].quantidade, 2);
  assert.equal(salvo.itens[0].preco, 14);
  assert.equal(salvo.total, 28);
  assert.equal(salvo.itens[0].pronto, true);
  assert.equal(salvo.produzido, true);
});

test("Produção registra pagamento somente em Vendas_hoje e Livro_Transacoes", () => {
  const { context, spreadsheet } = createContext();
  context.configurarPinAdministrador("731905");
  context.configurarPinProducao("5931");
  const producao = context.loginAcesso("5931", "admin");
  context.substituirFilaPdvAtivos_([{
    numero: 7,
    itens: [{ nome: "Bauru", tipo: "tapioca", quantidade: 2, preco: 14, pronto: false, obs: "" }],
    total: 28,
    produzido: false,
    timestampCriacao: 7001
  }]);

  const adulterado = JSON.stringify({
    numero: 7,
    itens: [{ nome: "Fraude", quantidade: 99, preco: 0.01 }],
    total: 0.99,
    formaPagamento: "PIX"
  });

  context.executarAcaoApi_("finalizarPagamentoProducao", [adulterado], producao.token);
  context.executarAcaoApi_("finalizarPagamentoProducao", [adulterado], producao.token);

  const vendas = spreadsheet.getSheetByName("Vendas_hoje").getDataRange().getValues();
  assert.equal(vendas.length, 2);
  assert.equal(vendas[1][3], "Bauru");
  assert.equal(vendas[1][2], 2);
  assert.equal(vendas[1][5], 28);
  assert.equal(spreadsheet.getSheetByName("Historico_Diario"), null);

  const livro = spreadsheet.getSheetByName("Livro_Transacoes").getDataRange().getValues();
  const pagamentos = livro.slice(1).filter(linha => linha[3] === "PAGAMENTO");
  assert.equal(pagamentos.length, 1);

  assert.throws(
    () => context.executarAcaoApi_(
      "finalizarPagamentoProducao",
      [JSON.stringify({ numero: 999, formaPagamento: "PIX" })],
      producao.token
    ),
    error => error.code === "ORDER_NOT_FOUND"
  );
});

test("Produção recupera vendas finalizadas do Livro_Transacoes mesmo após saída da fila ativa", () => {
  const { context, spreadsheet } = createContext();
  context.configurarPinAdministrador("731905");
  context.configurarPinProducao("5931");
  const producao = context.loginAcesso("5931", "admin");

  context.substituirFilaPdvAtivos_([{
    numero: 12,
    itens: [
      { nome: "Bauru", tipo: "tapioca", quantidade: 2, preco: 14, pronto: true, obs: "" },
      { nome: "Refrigerante", tipo: "bebida", quantidade: 1, preco: 6, pronto: true, obs: "" }
    ],
    total: 34,
    produzido: true,
    timestampCriacao: 445566
  }]);

  context.executarAcaoApi_("finalizarPagamentoProducao", [
    JSON.stringify({ numero: 12, formaPagamento: "PIX" })
  ], producao.token);

  assert.equal(JSON.parse(context.carregarDadosNuvem()).length, 0);
  const vendasAba = spreadsheet.getSheetByName("Vendas_hoje");
  while (vendasAba.getLastRow() > 1) vendasAba.deleteRow(vendasAba.getLastRow());

  const vendas = JSON.parse(
    context.executarAcaoApi_("carregarVendasHojePersistidas", [], producao.token).data
  );
  assert.equal(vendas.length, 1);
  assert.equal(vendas[0].numero, 12);
  assert.equal(vendas[0].total, 34);
  assert.equal(vendas[0].itens.length, 2);
  assert.equal(spreadsheet.getSheetByName("Historico_Diario"), null);
});

test("Vendas_hoje é alimentada e reconciliada sem duplicar registros", () => {
  const { context, spreadsheet } = createContext();
  context.configurarPinAdministrador("731905");
  context.configurarPinProducao("5931");
  const producao = context.loginAcesso("5931", "admin");

  context.substituirFilaPdvAtivos_([{
    numero: 21,
    itens: [
      { nome: "Bauru", tipo: "tapioca", quantidade: 2, preco: 14, pronto: true, obs: "" },
      { nome: "Refrigerante", tipo: "bebida", quantidade: 1, preco: 6, pronto: true, obs: "" }
    ],
    total: 34,
    produzido: true,
    timestampCriacao: 778899
  }]);

  context.executarAcaoApi_("finalizarPagamentoProducao", [
    JSON.stringify({ numero: 21, formaPagamento: "PIX" })
  ], producao.token);

  const vendasHoje = spreadsheet.getSheetByName("Vendas_hoje").getDataRange().getValues();
  assert.equal(vendasHoje.length, 3);
  assert.equal(vendasHoje[0][6], "tipo");
  assert.equal(vendasHoje[1][1].startsWith("#21@"), true);
  assert.equal(vendasHoje[1][2], 2);
  assert.equal(vendasHoje[1][3], "Bauru");
  assert.equal(vendasHoje[1][5], 28);
  assert.equal(vendasHoje[1][6], "TAPIOCA");
  assert.equal(vendasHoje[2][6], "BEBIDA");

  context.sincronizarVendasHojeComHistorico();
  context.sincronizarVendasHojeComHistorico();
  const aposReconciliar = spreadsheet.getSheetByName("Vendas_hoje").getDataRange().getValues();
  assert.equal(aposReconciliar.length, 3);

  const oficiais = JSON.parse(
    context.executarAcaoApi_("carregarVendasHojePersistidas", [], producao.token).data
  );
  assert.equal(oficiais.length, 1);
  assert.equal(oficiais[0].total, 34);
  assert.equal(oficiais[0].fonteVendasHoje, true);
  assert.equal(oficiais[0].itens[0].tipo, "tapioca");
  assert.equal(oficiais[0].itens[1].tipo, "bebida");
});

test("reconciliação repõe venda ausente em Vendas_hoje a partir do Livro_Transacoes", () => {
  const { context, spreadsheet } = createContext();
  const livro = spreadsheet.insertSheet("Livro_Transacoes");
  livro.appendRow(["ID Evento","Data/Hora","Data Operação","Tipo","Chave Pedido","Payload JSON","Fechamento ID"]);
  livro.appendRow([
    "evt-1",
    "28/07/2026, 19:30:00",
    "28/07/2026",
    "PAGAMENTO",
    "#5@abc",
    JSON.stringify({
      numero: 5,
      chavePedido: "#5@abc",
      timestamp: Date.now(),
      dataExibicao: "28/07/2026, 19:30:00",
      formaPagamento: "Dinheiro",
      pagamentosMistos: [],
      total: 30,
      itens: [{ nome: "Beijinho", tipo: "tapioca", quantidade: 3, preco: 10, obs: "-" }]
    }),
    ""
  ]);

  const resumo = context.reconciliarVendasHojeComLivro();
  assert.equal(resumo.inseridas, 1);
  const dados = spreadsheet.getSheetByName("Vendas_hoje").getDataRange().getValues();
  assert.equal(dados.length, 2);
  assert.equal(dados[1][1], "#5@abc");
  assert.equal(dados[1][2], 3);
  assert.equal(dados[1][3], "Beijinho");
  assert.equal(dados[1][5], 30);
});

test("Livro_Transacoes diferencia pedidos reutilizando o mesmo número por identificador estável", () => {
  const { context, spreadsheet } = createContext();
  context.configurarPinAdministrador("731905");
  context.configurarPinProducao("5931");
  const producao = context.loginAcesso("5931", "admin");

  const criarPedido = timestampCriacao => ({
    numero: 7,
    itens: [{ nome: "Bauru", tipo: "tapioca", quantidade: 1, preco: 14, pronto: false, obs: "" }],
    total: 14,
    produzido: false,
    timestampCriacao
  });

  context.substituirFilaPdvAtivos_([criarPedido(1001)]);
  context.executarAcaoApi_("finalizarPagamentoProducao", [
    JSON.stringify({ numero: 7, formaPagamento: "PIX" })
  ], producao.token);

  context.substituirFilaPdvAtivos_([criarPedido(2002)]);
  context.executarAcaoApi_("finalizarPagamentoProducao", [
    JSON.stringify({ numero: 7, formaPagamento: "PIX" })
  ], producao.token);

  const livro = spreadsheet.getSheetByName("Livro_Transacoes").getDataRange().getValues();
  const chaves = livro.slice(1).filter(l => l[3] === "PAGAMENTO").map(l => l[4]);
  assert.equal(chaves.length, 2);
  assert.notEqual(chaves[0], chaves[1]);
  assert.match(chaves[0], /^#7@/);
  assert.match(chaves[1], /^#7@/);
  assert.equal(spreadsheet.getSheetByName("Historico_Diario"), null);
});

test("pagamento produzido registra Vendas_hoje antes de remover o pedido ativo", () => {
  const { context, spreadsheet } = createContext();
  context.configurarPinAdministrador("731905");
  context.configurarPinProducao("5931");
  const producao = context.loginAcesso("5931", "admin");

  context.substituirFilaPdvAtivos_([{
    numero: 9,
    itens: [{ nome: "Bauru", tipo: "tapioca", quantidade: 1, preco: 14, pronto: true, obs: "" }],
    total: 14,
    produzido: true,
    timestampCriacao: 3003
  }]);

  context.executarAcaoApi_("finalizarPagamentoProducao", [
    JSON.stringify({ numero: 9, formaPagamento: "PIX" })
  ], producao.token);

  const vendas = spreadsheet.getSheetByName("Vendas_hoje").getDataRange().getValues();
  assert.equal(vendas.length, 2);
  assert.equal(vendas[1][3], "Bauru");
  assert.equal(JSON.parse(context.carregarDadosNuvem()).length, 0);
  assert.equal(spreadsheet.getSheetByName("Historico_Diario"), null);
});

test("Produção cancela somente pedido existente com dados autoritativos", () => {
  const { context, spreadsheet } = createContext();
  context.configurarPinAdministrador("731905");
  context.configurarPinProducao("5931");
  const producao = context.loginAcesso("5931", "admin");
  context.substituirFilaPdvAtivos_([{
    numero: 8,
    itens: [{ nome: "Refrigerante", tipo: "bebida", quantidade: 1, preco: 6 }],
    total: 6,
    produzido: true,
    timestampCriacao: Date.now()
  }]);

  assert.throws(
    () => context.executarAcaoApi_("cancelarPedidoProducao", [999], producao.token),
    error => error.code === "ORDER_NOT_FOUND"
  );
  context.executarAcaoApi_("cancelarPedidoProducao", [8], producao.token);
  context.executarAcaoApi_("cancelarPedidoProducao", [8], producao.token);

  const cancelados = spreadsheet.getSheetByName("Pedidos Cancelados").getDataRange().getValues();
  assert.equal(cancelados.length, 2);
  assert.equal(cancelados[1][2], "Refrigerante");
  assert.equal(cancelados[1][3], 1);
  assert.equal(cancelados[1][4], 6);
  assert.equal(JSON.parse(context.carregarDadosNuvem()).length, 0);
});


test("fechamento move Vendas_hoje para histórico, consolida e limpa somente no sucesso", () => {
  const { context, spreadsheet } = createContext();

  context.registrarVendaHojeAdmin(JSON.stringify({
    numero: 31,
    timestampCriacao: 31001,
    dataExibicao: "28/07/2026, 20:00:00",
    formaPagamento: "PIX",
    total: 28,
    itens: [
      { nome: "Bauru", tipo: "tapioca", quantidade: 2, preco: 14, obs: "-" }
    ]
  }));
  context.registrarVendaHojeAdmin(JSON.stringify({
    numero: 32,
    timestampCriacao: 32001,
    dataExibicao: "28/07/2026, 20:10:00",
    formaPagamento: "Dinheiro",
    total: 6,
    itens: [
      { nome: "Refrigerante", tipo: "bebida", quantidade: 1, preco: 6, obs: "-" }
    ]
  }));

  const resultado = JSON.parse(context.fecharDiaSeguro("28/07/2026", "MANUAL"));
  assert.equal(resultado.ok, true);
  assert.equal(resultado.resumo.total, 34);
  assert.equal(resultado.resumo.pix, 28);
  assert.equal(resultado.resumo.dinheiro, 6);
  assert.equal(resultado.resumo.qtdTapiocas, 2);

  const vendas = spreadsheet.getSheetByName("Vendas_hoje").getDataRange().getValues();
  assert.equal(vendas.length, 1);

  const historico = spreadsheet.getSheetByName("Historico_Diario").getDataRange().getValues();
  assert.equal(historico.length, 3);
  assert.equal(historico[1][2], "Bauru");
  assert.equal(historico[2][2], "Refrigerante");

  const fech = spreadsheet.getSheetByName("Fechamentos_Diarios").getDataRange().getValues();
  assert.equal(fech.length, 2);
  assert.equal(fech[1][0], "28/07/2026");
  assert.equal(fech[1][1], 34);
  assert.equal(fech[1][8], "CONCLUIDO");

  const repetido = JSON.parse(context.fecharDiaSeguro("28/07/2026", "MANUAL"));
  assert.equal(repetido.ok, true);
  assert.equal(repetido.status, "JA_FECHADO");
});

test("CEO Eliel acessa somente relatório, itens e configuração", () => {
  const { context } = createContext();
  context.configurarPinEliel("654321");
  const session = context.loginAcesso("654321", "eliel");

  context.obterRelatorioEliel = () => "RELATORIO";
  context.salvarDisponibilidadeCardapio = (_itens, responsavel) => responsavel;
  context.inicializarCatalogoConfiguracao = (_catalogo, responsavel) => responsavel;
  context.salvarItemCatalogo = (_item, _original, responsavel) => responsavel;
  context.removerItemCatalogo = (_item, responsavel) => responsavel;

  assert.equal(
    context.executarAcaoApi_("obterRelatorioEliel", [], session.token).data,
    "RELATORIO"
  );
  assert.equal(
    context.executarAcaoApi_("salvarDisponibilidadeCardapio", ["[]"], session.token).data,
    "CEO Eliel"
  );
  assert.equal(
    context.executarAcaoApi_("inicializarCatalogoConfiguracao", ["{}"], session.token).data,
    "CEO Eliel"
  );
  assert.equal(
    context.executarAcaoApi_("salvarItemCatalogo", ["{}", ""], session.token).data,
    "CEO Eliel"
  );
  assert.equal(
    context.executarAcaoApi_("removerItemCatalogo", ["Bauru"], session.token).data,
    "CEO Eliel"
  );
});

test("CEO Eliel não acessa o PDV, mas controla o fechamento mensal", () => {
  const { context } = createContext();
  context.configurarPinEliel("654321");
  const session = context.loginAcesso("654321", "eliel");

  [
    "carregarDadosNuvem",
    "registrarPedidoPdv",
    "salvarConfiguracoesRelatorioEliel"
  ].forEach(action => {
    assert.throws(
      () => context.executarAcaoApi_(action, [], session.token),
      error => error.code === "PERMISSION_DENIED"
    );
  });

  context.obterPreviaFechamentoRelatorioEliel = () => "PREVIA";
  context.fecharMesRelatorioEliel = (_mes, _ano, _catalogo, responsavel) => responsavel;
  assert.equal(
    context.executarAcaoApi_(
      "obterPreviaFechamentoRelatorioEliel",
      [7, 2026, "{}"],
      session.token
    ).data,
    "PREVIA"
  );
  assert.equal(
    context.executarAcaoApi_(
      "fecharMesRelatorioEliel",
      [7, 2026, "{}"],
      session.token
    ).data,
    "CEO Eliel"
  );
});

test("administrador não fecha o mês e a rota antiga do PDV foi removida", () => {
  const { context } = createContext();
  context.configurarPinAdministrador("123456");
  const session = context.loginAcesso("123456", "admin");
  context.fecharMesRelatorioEliel = () => "NAO_DEVE_EXECUTAR";

  assert.throws(
    () => context.executarAcaoApi_(
      "fecharMesRelatorioEliel",
      [7, 2026, "{}"],
      session.token
    ),
    error => error.code === "PERMISSION_DENIED"
  );
  assert.throws(
    () => context.executarAcaoApi_("fecharMesESalvarDrive", [], session.token),
    error => error.code === "ACTION_NOT_ALLOWED"
  );
});

test("preço e tipo do cliente são ignorados em favor do catálogo", () => {
  const { context } = createContext();
  const normalized = context.normalizarPedidoOnline_(onlineOrder(), catalog());
  assert.equal(normalized.itens[0].preco, 14);
  assert.equal(normalized.itens[0].tipo, "tapioca");
  assert.equal(normalized.total, 28);
});

test("quantidade inválida e item desconhecido são rejeitados", () => {
  const { context } = createContext();
  assert.throws(
    () => context.normalizarPedidoOnline_(
      onlineOrder({ itens: [{ nome: "Bauru", quantidade: -1 }] }),
      catalog()
    ),
    error => error.code === "INVALID_ORDER"
  );
  assert.throws(
    () => context.normalizarPedidoOnline_(
      onlineOrder({ itens: [{ nome: "Item falso", quantidade: 1 }] }),
      catalog()
    ),
    error => error.code === "INVALID_ORDER"
  );
});

test("Monte a Sua usa preço definido pelo servidor", () => {
  const { context } = createContext();
  const normalized = context.normalizarPedidoOnline_(
    onlineOrder({
      itens: [{
        nome: "Monte Sua: Bacon c/ Muçarela",
        preco: 1,
        tipo: "bebida",
        quantidade: 1
      }]
    }),
    catalog()
  );
  assert.equal(normalized.itens[0].preco, 15);
  assert.equal(normalized.itens[0].tipo, "tapioca");
});

test("fórmulas são neutralizadas antes da planilha", () => {
  const { context } = createContext();
  assert.equal(context.valorSeguroPlanilha_("=IMPORTXML(\"x\")"), "'=IMPORTXML(\"x\")");
  assert.equal(context.valorSeguroPlanilha_("observação normal"), "observação normal");
});

test("LOG_DEBUG registra falhas sanitizadas sem interromper a API", () => {
  const { context } = createContext();
  const payload = JSON.stringify({
    clienteId: "aparelho-teste",
    origem: "PDV",
    tipo: "API",
    tela: "/frontend/index.html",
    acao: "atualizarVendaRealTime",
    codigo: "SERVER_ERROR",
    mensagem: "token=segredo telefone 5511999999999",
    detalhe: "Error: timeout no LockService",
    linha: "2272:46",
    arquivo: "https://exemplo/index.html?v=segredo",
    dispositivo: "Android Teste",
    versao: "2026-09-08.1"
  });

  const resultado = context.registrarFalhaSistema(payload);
  assert.equal(resultado.registrado, true);

  const aba = context.SpreadsheetApp.getActiveSpreadsheet().getSheetByName("LOG_DEBUG");
  assert.ok(aba);
  assert.equal(aba.get(2, 3), "PDV");
  assert.equal(aba.get(2, 6), "atualizarVendaRealTime");
  assert.doesNotMatch(aba.get(2, 8), /segredo|5511999999999/);
  assert.equal(aba.get(2, 9), "Error: timeout no LockService");
  assert.equal(aba.get(2, 11), "https://exemplo/index.html");

  const duplicado = context.registrarFalhaSistema(payload);
  assert.equal(duplicado.registrado, false);
  assert.equal(duplicado.motivo, "duplicado");

  const viaApi = context.executarAcaoApi_("registrarFalhaSistema", [
    JSON.stringify({
      clienteId: "aparelho-teste",
      origem: "CARDAPIO",
      tipo: "NAVEGADOR",
      mensagem: "falha pública controlada"
    })
  ], "");
  assert.equal(viaApi.data.registrado, true);
});

test("pausas são zeradas no dia seguinte e mantidas no mesmo dia", () => {
  const { context, properties } = createContext();
  properties.set("cardapio_itens_indisponiveis", JSON.stringify(["Bauru"]));
  properties.set("cardapio_pausa_data", "2026-07-27");
  assert.equal(context.obterDisponibilidadeCardapio(), "[]");
  assert.equal(properties.get("cardapio_pausa_data"), "2026-07-28");

  properties.set("cardapio_itens_indisponiveis", JSON.stringify(["Bauru"]));
  assert.deepEqual(
    JSON.parse(context.obterDisponibilidadeCardapio()),
    ["Bauru"]
  );
});

test("combustível do Relatório Eliel é dividido em 80% carro e 20% trailer", () => {
  const { context } = createContext();
  const rateio = context.dividirCombustivelRelatorioEliel_(1000);

  assert.equal(rateio.total, 1000);
  assert.equal(rateio.carro, 800);
  assert.equal(rateio.trailer, 200);
  assert.equal(rateio.carro + rateio.trailer, rateio.total);
});

test("prévia identifica pedidos ainda pendentes antes do fechamento", () => {
  const { context, properties } = createContext();
  properties.set("pdv_vendas_ativas", JSON.stringify([
    { numero: 1, produzido: true, timestamp: "2026-07-29T19:30:00" },
    { numero: 2, produzido: false, timestamp: "2026-07-29T19:35:00" },
    { numero: 3, produzido: true, timestamp: "" }
  ]));

  assert.equal(context.obterPedidosPendentesFechamentoEliel_(7, 2026), 2);
});

test("pedidos do mês atual não bloqueiam o fechamento atrasado", () => {
  const { context, properties, setCurrentDay } = createContext();
  setCurrentDay("2026-08-21");
  properties.set("pdv_vendas_ativas", JSON.stringify([
    { numero: 1, produzido: false, timestampCriacao: "2026-08-21T19:30:00" },
    { numero: 2, produzido: true, timestampCriacao: "2026-08-21T19:35:00", timestamp: "" },
    { numero: 3, produzido: false, timestampCriacao: "2026-07-29T19:40:00" }
  ]));

  assert.equal(context.obterPedidosPendentesFechamentoEliel_(7, 2026), 1);
  assert.equal(context.obterPedidosPendentesFechamentoEliel_(8, 2026), 2);
});

test("histórico mensal reconhece referências antigas sem duplicar o mês", () => {
  const { context } = createContext();

  assert.equal(
    context.normalizarReferenciaFechamentoMensal_("Julho de 2026"),
    "2026-07"
  );
  assert.equal(
    context.normalizarReferenciaFechamentoMensal_("2026-07"),
    "2026-07"
  );
});

test("PDV preserva adicionais vinculados e recalcula o total validado", () => {
  const { context } = createContext();
  const pedido = context.normalizarPedidoPdv_({
    itens: [{
      nome: "Bauru",
      preco: 22,
      precoBase: 14,
      tipo: "tapioca",
      quantidade: 2,
      ing: "Presunto e muçarela",
      categoriaAdicional: "salgado",
      adicionais: ["Bacon", "Catupiry"]
    }]
  });

  assert.equal(pedido.itens[0].precoBase, 14);
  assert.deepEqual(Array.from(pedido.itens[0].adicionais), ["Bacon", "Catupiry"]);
  assert.equal(pedido.total, 44);
});

test("PDV rejeita adicional incompatível e preço adulterado", () => {
  const { context } = createContext();
  const base = {
    nome: "Bauru",
    preco: 18,
    precoBase: 14,
    tipo: "tapioca",
    quantidade: 1,
    categoriaAdicional: "salgado",
    adicionais: ["Bacon"]
  };

  assert.throws(
    () => context.normalizarPedidoPdv_({ itens: [Object.assign({}, base, { adicionais: ["Nutella"] })] }),
    error => error.code === "INVALID_ORDER"
  );
  assert.throws(
    () => context.normalizarPedidoPdv_({ itens: [Object.assign({}, base, { preco: 15 })] }),
    error => error.code === "INVALID_ORDER"
  );
});

test("pedido online aguarda aceite e entra uma única vez na Produção e no Caixa", () => {
  const { context } = createContext();
  context.catalogoConfigurado_ = () => catalog();
  context.lancarPedidoPlanilha = () => "OK";

  // O teste usa explicitamente um horário dinâmico diferente do padrão legado.
  // Terça-feira, 19:30 deve estar dentro da janela configurada 19:00–20:00.
  const configuracao = context.configuracaoOperacionalPadrao_();
  configuracao.horarios["2"] = { ativo: true, inicio: "19:00", fim: "20:00" };
  configuracao.rotas["2"] = ["JD SÃO FRANCISCO"];
  context.lerConfiguracaoOperacionalSheets_ = () => configuracao;

  const resposta = context.registrarPedidoOnline(JSON.stringify(onlineOrder()));

  assert.match(resposta.numero, /^ON\d{3}$/);
  assert.equal(context.carregarFilaPdvAtivos_().length, 0);
  assert.equal(context.listarPedidosOnlinePendentes().length, 1);

  const aceito = context.aceitarPedidoOnline(resposta.numero);
  assert.equal(aceito.numero, 1);
  assert.equal(aceito.statusOnline, "Aceito");
  assert.equal(context.listarPedidosOnlinePendentes().length, 0);
  assert.equal(context.carregarFilaPdvAtivos_().length, 1);
  assert.throws(() => context.aceitarPedidoOnline(resposta.numero), /já foi aceito ou recusado/);

  const segundo = context.registrarPedidoOnline(JSON.stringify(onlineOrder({
    nomeCliente: "Outro Cliente", telefoneCliente: "11888888888"
  })));
  assert.equal(segundo.numero, "ON002");
});

test("recusa online exige motivo e preserva WhatsApp para a mensagem ao cliente", () => {
  const { context, properties } = createContext();
  properties.set("pedidos_online_pendentes", JSON.stringify([{
    codigoOnline: "ON001", nomeCliente: "Cliente", telefoneCliente: "11999999999",
    timestampCriacao: 1, itens: [], total: 0
  }]));
  assert.throws(() => context.recusarPedidoOnline("ON001", ""), /campo obrigatório vazio/);
  const recusado = context.recusarPedidoOnline("ON001", "Fora da rota");
  assert.equal(recusado.telefoneCliente, "11999999999");
  assert.equal(recusado.motivoRecusa, "Fora da rota");
  assert.equal(context.listarPedidosOnlinePendentes().length, 0);
});


test("configuração operacional migra legado e persiste no Google Sheets", () => {
  const { context, properties } = createContext();
  const legado = context.configuracaoOperacionalPadrao_();
  legado.adicionais.valor = 5;
  legado.horarios["2"].inicio = "17:30";
  properties.set("tapimovel_config_operacional_v1", JSON.stringify(legado));

  const migrada = JSON.parse(context.obterConfiguracaoOperacional());
  assert.equal(migrada.adicionais.valor, 5);
  assert.equal(migrada.horarios["2"].inicio, "17:30");
  assert.equal(properties.has("tapimovel_config_operacional_v1"), false);

  const ss = context.SpreadsheetApp.getActiveSpreadsheet();
  ["Config_Horarios", "Config_Rotas", "Config_MonteSua", "Config_Adicionais"].forEach(nome => {
    assert.ok(ss.getSheetByName(nome), `aba ${nome} deve existir`);
  });

  const nova = JSON.parse(JSON.stringify(migrada));
  nova.adicionais.valor = 6;
  nova.rotas["2"].push("ROTA TESTE");
  context.registrarLogConfiguracao_ = () => {};
  context.salvarConfiguracaoOperacional(JSON.stringify(nova), "Administrador");

  const recarregada = JSON.parse(context.obterConfiguracaoOperacional());
  assert.equal(recarregada.adicionais.valor, 6);
  assert.ok(recarregada.rotas["2"].includes("ROTA TESTE"));
  assert.equal(properties.has("tapimovel_config_operacional_v1"), false);
});

test("reenvio após baixa usa a identidade original e não paga outro pedido com o mesmo número", () => {
  const { context, spreadsheet } = createContext();
  const pedido = {
    numero: 4, timestampCriacao: 1111, produzido: true, total: 14,
    itens: [{ nome: "Bauru", tipo: "tapioca", quantidade: 1, preco: 14, pronto: true }]
  };
  const pagamento = JSON.stringify({ ...pedido, formaPagamento: "PIX" });
  context.substituirFilaPdvAtivos_([pedido]);
  const confirmado = context.finalizarPagamentoProducao(pagamento);
  assert.equal(context.consultarPagamentoProducao(pagamento).estado, "confirmado");

  context.substituirFilaPdvAtivos_([{ ...pedido, timestampCriacao: 2222 }]);
  const repetido = context.finalizarPagamentoProducao(pagamento);
  assert.equal(repetido.timestamp, confirmado.timestamp);
  const ativos = JSON.parse(context.carregarDadosNuvem());
  assert.equal(ativos.length, 1);
  assert.equal(ativos[0].timestampCriacao, 2222);
  assert.equal(ativos[0].timestamp, undefined);
  assert.equal(spreadsheet.getSheetByName("Livro_Transacoes").getLastRow(), 2);
  assert.equal(spreadsheet.getSheetByName("Vendas_hoje").getLastRow(), 2);
});

test("pagamento parcial é retomado pela informação já gravada no livro", () => {
  const { context, spreadsheet } = createContext();
  const pedido = {
    numero: 5, timestampCriacao: 3333, produzido: true, total: 14,
    itens: [{ nome: "Bauru", tipo: "tapioca", quantidade: 1, preco: 14, pronto: true }]
  };
  const pagamento = JSON.stringify({ ...pedido, formaPagamento: "Dinheiro", troco: 6 });
  context.substituirFilaPdvAtivos_([pedido]);
  const substituirFila = context.substituirFilaPdvAtivos_;
  context.substituirFilaPdvAtivos_ = () => { throw new Error("Falha na fila"); };
  assert.throws(() => context.finalizarPagamentoProducao(pagamento), /Falha na fila/);
  assert.equal(context.consultarPagamentoProducao(pagamento).estado, "retomar");

  context.substituirFilaPdvAtivos_ = substituirFila;
  const recuperado = context.finalizarPagamentoProducao(JSON.stringify({ ...pedido, formaPagamento: "PIX" }));
  assert.equal(recuperado.formaPagamento, "Dinheiro");
  assert.equal(recuperado.troco, 6);
  assert.equal(context.consultarPagamentoProducao(pagamento).estado, "confirmado");
  assert.equal(JSON.parse(context.carregarDadosNuvem()).length, 0);
  assert.equal(spreadsheet.getSheetByName("Livro_Transacoes").getLastRow(), 2);
  assert.equal(spreadsheet.getSheetByName("Vendas_hoje").getLastRow(), 2);
});

test("cancelamento aceita um segundo pedido válido e rejeita número inválido sem remover a fila", () => {
  const { context, spreadsheet } = createContext();
  const criar = numero => ({
    numero, timestampCriacao: 1000 + numero, produzido: true, total: 14,
    itens: [{ nome: "Bauru", tipo: "tapioca", quantidade: 1, preco: 14, pronto: true }]
  });
  context.substituirFilaPdvAtivos_([criar(1), criar(2)]);
  context.cancelarPedidoProducao(1, JSON.stringify(criar(1)));
  assert.throws(() => context.cancelarPedidoProducao(""), erro => erro.code === "INVALID_ORDER");
  assert.equal(JSON.parse(context.carregarDadosNuvem()).length, 1);
  context.cancelarPedidoProducao(2, JSON.stringify(criar(2)));
  assert.equal(JSON.parse(context.carregarDadosNuvem()).length, 0);
  assert.equal(spreadsheet.getSheetByName("Pedidos Cancelados").getLastRow(), 3);
});
