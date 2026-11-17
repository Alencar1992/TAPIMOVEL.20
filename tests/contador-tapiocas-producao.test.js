const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../frontend/index.html"), "utf8");
const inicio = html.indexOf("function chaveVendaHoje(");
const fim = html.indexOf("function renderizarHistorico(", inicio);
assert.ok(inicio >= 0 && fim > inicio);

const hoje = 1794956400000;
const item = (quantidade, pronto, tipo = "tapioca") => ({ quantidade, pronto, tipo });

function criarTela(ativos, vendas) {
  const campos = new Map();
  const tela = {
    historicoNuvem: ativos,
    vendasHojePersistidas: vendas,
    vendasHojeOcultas: new Set(),
    ehHoje: momento => Number(momento) >= hoje && Number(momento) < hoje + 86400000,
    document: {
      getElementById(id) {
        if (!campos.has(id)) campos.set(id, { classList: { contains: () => false } });
        return campos.get(id);
      }
    }
  };
  vm.createContext(tela);
  vm.runInContext(html.slice(inicio, fim), tela);
  return {
    tela,
    total() {
      tela.atualizarTudo();
      return campos.get("btnTopoTapiocas").textContent;
    }
  };
}

test("topo soma a quantidade concluída e mantém o total durante e depois do pagamento", () => {
  const pedido = { numero: 7, idRequisicao: "pdv-contador-123456", timestampCriacao: hoje,
    itens: [item(2, false), item(1, false, "extra"), item(1, true, "bebida")] };
  const { tela, total } = criarTela([pedido], []);
  assert.equal(total(), "🌮 0");
  pedido.itens[0].pronto = true;
  pedido.itens[1].pronto = true;
  assert.equal(total(), "🌮 3");
  pedido.timestamp = hoje + 1000;
  assert.equal(total(), "🌮 3");
  tela.vendasHojePersistidas = [{
    numero: 7, idHistorico: "#7@pdv-contador-123456", timestamp: hoje + 1000, itens: pedido.itens
  }];
  assert.equal(total(), "🌮 3");
  tela.historicoNuvem = [];
  assert.equal(total(), "🌮 3");
  assert.equal(criarTela([], tela.vendasHojePersistidas).total(), "🌮 3");
});

test("pagamento antecipado respeita o preparo e pedidos de outro dia não entram no contador", () => {
  const pago = { numero: 8, idRequisicao: "pdv-outro-123456", timestampCriacao: hoje, timestamp: hoje + 1000,
    itens: [item(2, true), item(1, false)] };
  const venda = { numero: 8, idHistorico: "#8@pdv-outro-123456", timestamp: hoje + 1000,
    itens: [item(2, true), item(1, true)] };
  const ontem = { numero: 9, timestampCriacao: hoje - 86400000, itens: [item(4, true)] };
  assert.equal(criarTela([pago, ontem], [venda]).total(), "🌮 2");
  assert.equal(criarTela([ontem], [venda]).total(), "🌮 3");
});
