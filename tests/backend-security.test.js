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
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest(_algorithm, value) {
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
      getActiveSpreadsheet() {
        throw new Error("Spreadsheet não deve ser acessada neste teste.");
      }
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
  const code = fs.readFileSync(
    path.join(__dirname, "../apps-script/Code.gs"),
    "utf8"
  );
  vm.runInContext(code, context, { filename: "Code.gs" });
  return {
    context,
    properties,
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
  const { context, properties } = createContext();
  context.catalogoConfigurado_ = () => catalog();
  context.lancarPedidoPlanilha = () => "OK";
  const resposta = context.registrarPedidoOnline(JSON.stringify(onlineOrder()));

  assert.match(resposta.numero, /^ON\d{3}$/);
  assert.equal(JSON.parse(properties.get("pdv_vendas_ativas") || "[]").length, 0);
  assert.equal(context.listarPedidosOnlinePendentes().length, 1);

  const aceito = context.aceitarPedidoOnline(resposta.numero);
  assert.equal(aceito.numero, 1);
  assert.equal(aceito.statusOnline, "Aceito");
  assert.equal(context.listarPedidosOnlinePendentes().length, 0);
  assert.equal(JSON.parse(properties.get("pdv_vendas_ativas")).length, 1);
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
