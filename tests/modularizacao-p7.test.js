const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dir = path.join(__dirname, "..", "apps-script");
const read = nome => fs.readFileSync(path.join(dir, nome), "utf8");
const code = read("Code.gs");
const pedido = read("PedidoService.gs");
const api = read("Api.gs");
const all = fs.readdirSync(dir)
  .filter(nome => nome.endsWith(".gs"))
  .sort()
  .map(read)
  .join("\n\n");

const funcoesPedido = [
  "precoMonteSua_",
  "normalizarPedidoOnline_",
  "registrarPedidoOnline",
  "listarPedidosOnlinePendentes",
  "aceitarPedidoOnline",
  "recusarPedidoOnline",
  "normalizarPedidoPdv_",
  "registrarPedidoPdv",
  "atualizarPedidoPdv",
  "salvarVendaRealTime",
  "atualizarVendaRealTime"
];

test("P7 concentra fluxo de pedidos no PedidoService sem duplicação", () => {
  for (const nome of funcoesPedido) {
    assert.match(pedido, new RegExp(`function\\s+${nome}\\s*\\(`));
    assert.doesNotMatch(code, new RegExp(`function\\s+${nome}\\s*\\(`));
  }
});

test("PedidoService usa repositories existentes para as filas", () => {
  assert.match(pedido, /carregarFilaPedidosOnlinePendentes_\(\)/);
  assert.match(pedido, /substituirFilaPedidosOnlinePendentes_\(/);
  assert.match(pedido, /carregarFilaPdvAtivos_\(\)/);
  assert.match(pedido, /substituirFilaPdvAtivos_\(/);
  assert.doesNotMatch(pedido, /setProperty\(["']pdv_vendas_ativas["']/);
  assert.doesNotMatch(pedido, /setProperty\(["']pedidos_online_pendentes["']/);
});

test("P7 preserva contratos da API para pedidos", () => {
  for (const acao of [
    "registrarPedidoOnline",
    "listarPedidosOnlinePendentes",
    "aceitarPedidoOnline",
    "recusarPedidoOnline",
    "salvarVendaRealTime",
    "atualizarVendaRealTime",
    "registrarPedidoPdv",
    "atualizarPedidoPdv"
  ]) {
    assert.match(api, new RegExp(`"${acao}"`));
  }
});

test("P7 não mistura histórico, fechamento ou relatórios no PedidoService", () => {
  for (const foraDoEscopo of [
    "moverParaHistorico",
    "moverParaCancelados",
    "fecharMesRelatorioEliel",
    "obterRelatorioEliel"
  ]) {
    assert.doesNotMatch(pedido, new RegExp(`function\\s+${foraDoEscopo}\\s*\\(`));
  }
});

test("bundle completo continua sintaticamente válido após P7", () => {
  assert.doesNotThrow(() => new vm.Script(all, { filename: "AppsScript.bundle.gs" }));
});
