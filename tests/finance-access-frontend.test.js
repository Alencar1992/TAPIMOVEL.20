const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const modulo = path.join(root, "frontend/finance-access.js");

function carregarModulo() {
  assert.ok(fs.existsSync(modulo), "o controlador financeiro ainda não existe");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(modulo, "utf8"), sandbox, {
    filename: "frontend/finance-access.js"
  });
  return sandbox.window.TapimovelAcessoFinanceiro;
}

test("cada abertura solicita PIN novamente e substitui o ticket anterior", async () => {
  const api = carregarModulo();
  const solicitacoes = [];
  const autorizacoes = [];
  const liberacoes = [];
  const controlador = api.criarControlador({
    aoSolicitar(area) { solicitacoes.push(area); },
    autorizar(pin, area) {
      autorizacoes.push({ pin, area });
      return Promise.resolve({ ticket: "ticket-" + autorizacoes.length, area });
    }
  });

  controlador.solicitar("liquidez", ticket => liberacoes.push(ticket));
  await controlador.confirmar("4815");
  controlador.solicitar("liquidez", ticket => liberacoes.push(ticket));
  await controlador.confirmar("4815");

  assert.deepEqual(solicitacoes, ["liquidez", "liquidez"]);
  assert.equal(autorizacoes.length, 2);
  assert.deepEqual(liberacoes, ["ticket-1", "ticket-2"]);
  assert.equal(controlador.obterTicket("liquidez"), "ticket-2");
});

test("controlador rejeita área desconhecida sem abrir solicitação", () => {
  const api = carregarModulo();
  const controlador = api.criarControlador({
    aoSolicitar() {
      throw new Error("não deveria abrir o modal");
    },
    autorizar() {
      return Promise.resolve({ ticket: "indevido" });
    }
  });

  assert.throws(
    () => controlador.solicitar("salario-lucas", () => {}),
    /Área financeira inválida/
  );
});

test("PIN incorreto não libera a área nem apaga a solicitação pendente", async () => {
  const api = carregarModulo();
  let tentativas = 0;
  let liberou = false;
  const controlador = api.criarControlador({
    aoSolicitar() {},
    autorizar() {
      tentativas += 1;
      return tentativas === 1
        ? Promise.reject(new Error("PIN inválido."))
        : Promise.resolve({ ticket: "ticket-valido" });
    }
  });

  controlador.solicitar("rankings", () => { liberou = true; });
  await assert.rejects(controlador.confirmar("0000"), /PIN inválido/);
  assert.equal(liberou, false);
  await controlador.confirmar("4815");
  assert.equal(liberou, true);
  assert.equal(controlador.obterTicket("rankings"), "ticket-valido");
});

test("cancelar durante autorização impede resposta atrasada de abrir a área", async () => {
  const api = carregarModulo();
  let resolver;
  let liberou = false;
  const controlador = api.criarControlador({
    aoSolicitar() {},
    autorizar() {
      return new Promise(resolve => { resolver = resolve; });
    }
  });

  controlador.solicitar("gestao", () => { liberou = true; });
  const confirmacao = controlador.confirmar("4815");
  controlador.cancelar();
  resolver({ ticket: "ticket-atrasado" });
  await confirmacao;

  assert.equal(liberou, false);
  assert.equal(controlador.obterTicket("gestao"), "");
});

test("resposta antiga não interfere em um novo pedido de PIN", async () => {
  const api = carregarModulo();
  const resolucoes = [];
  const liberadas = [];
  const controlador = api.criarControlador({
    aoSolicitar() {},
    autorizar() {
      return new Promise(resolve => { resolucoes.push(resolve); });
    }
  });

  controlador.solicitar("liquidez", () => liberadas.push("liquidez"));
  const primeira = controlador.confirmar("4815");
  controlador.cancelar();
  controlador.solicitar("rankings", () => liberadas.push("rankings"));
  resolucoes[0]({ ticket: "ticket-antigo" });

  assert.equal(await primeira, null);
  assert.equal(controlador.obterAreaPendente(), "rankings");
  assert.deepEqual(liberadas, []);

  const segunda = controlador.confirmar("4815");
  resolucoes[1]({ ticket: "ticket-novo" });
  await segunda;
  assert.deepEqual(liberadas, ["rankings"]);
});

test("PDV solicita o PIN nas três entradas e envia ticket em todas as ações protegidas", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");

  assert.match(html, /src="\.\/finance-access\.js\?v=\d{8}\.\d+"/);
  assert.match(html, /solicitarAcessoFinanceiro\('liquidez'/);
  assert.match(html, /alternarGestaoProtegida\(\)/);
  assert.match(html, /solicitarAcessoFinanceiro\('rankings'/);
  assert.match(html, /id="modalPinFinanceiro"/);
  assert.match(html, /id="formPinFinanceiro"/);

  const chamadas = {
    liquidez: ["obterResumoMesPlanilha"],
    gestao: [
      "calcularEstimativaSalarioLucas",
      "registrarDiaSemTrabalhoPlanilha",
      "buscarFolgasBackend",
      "salvarCombustivelPlanilha",
      "buscarHistoricoCombustivel"
    ],
    rankings: ["buscarTopProdutosBackend", "buscarRankingRotasBackend"]
  };
  Object.entries(chamadas).forEach(([area, acoes]) => {
    acoes.forEach(acao => {
      assert.match(
        html,
        new RegExp("\\." + acao + "\\([\\s\\S]{0,180}obterTicketFinanceiro\\('" + area + "'\\)")
      );
    });
  });
  assert.match(
    html,
    /\.buscarDadosEspelhoBackend\([\s\S]{0,180}obterTicketFinanceiro\(area\)/
  );
});

test("configuração cadastra o PIN no servidor e o olho do Lucas não pede PIN próprio", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const financeiro = fs.readFileSync(modulo, "utf8");

  assert.match(html, /id="configPinFinanceiro"/);
  assert.match(html, /id="statusPinFinanceiro"/);
  assert.match(financeiro, /\.configurarPinAreasFinanceiras\(/);
  assert.match(financeiro, /\.obterStatusPinAreasFinanceiras\(/);
  assert.match(html, /onclick="toggleVis\('liqLucas'\)"/);
  assert.doesNotMatch(html, /salario-lucas/);
});
