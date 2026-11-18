const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../frontend/index.html"), "utf8");
const trecho = (inicio, fim) => html.slice(html.indexOf(inicio), html.indexOf(fim, html.indexOf(inicio)));
const pedido = { numero: 4, idRequisicao: "pdv-teste-141", timestampCriacao: 123, produzido: true, total: 14 };

function criarTela() {
  const campos = new Map();
  const chamadas = [];
  const avisos = [];
  const tela = {
    historicoNuvem: [{ ...pedido }],
    pedidoAguardandoPagamento: "4@pdv-teste-141",
    vendasHojePersistidas: [],
    vendasHojeOcultas: new Set(),
    ultimaSincronizacaoVendasHoje: 0,
    pausarSync: false,
    syncEmAndamento: false,
    syncAtivo: null,
    setTimeout() {},
    normalizarRespostaApi: JSON.parse,
    atualizarTudo() {},
    fecharModais() {},
    atualizarPedidosOnline() {},
    carregarDisponibilidadeCardapio() {},
    acessoEhProducao: () => false,
    sincronizarContadorGlobal() {},
    mostrarConfirmacaoPagamento: numero => avisos.push(numero),
    mostrarAlerta: mensagem => avisos.push(mensagem),
    console,
    document: {
      getElementById(id) {
        if (!campos.has(id)) campos.set(id, { style: {}, querySelector: () => ({ focus() {} }) });
        return id === "somCaixa" ? null : campos.get(id);
      }
    }
  };
  function runner(sucesso, falha) {
    return new Proxy({}, {
      get(_alvo, prop) {
        if (prop === "withSuccessHandler") return fn => runner(fn, falha);
        if (prop === "withFailureHandler") return fn => runner(sucesso, fn);
        return (...args) => chamadas.push({ acao: prop, sucesso, falha, args });
      }
    });
  }
  tela.google = { script: { run: runner() } };
  vm.createContext(tela);
  vm.runInContext([
    trecho("let versaoPagamento", "function mostrarLoginAdmin"),
    trecho("function iniciarAplicacaoAdmin", "function iniciarAplicacaoEliel"),
    trecho("function pedidoSelecionadoParaPagamento", "function maskCurrency"),
    trecho("function chaveVendaHoje", "function vendasHojeCompletas"),
    trecho("function atualizarVendasHojePersistidas", "function quantidadeTapiocasFeitasHoje")
  ].join("\n"), tela);
  return { tela, campos, chamadas, avisos };
}

test("timeout fecha o carregamento e a nova tentativa reabre a fila", () => {
  const { tela, campos, chamadas } = criarTela();
  tela.iniciarAplicacaoAdmin();
  chamadas.shift().falha(new Error("Tempo limite do bloqueio"));
  assert.equal(campos.get("loadingScreen").style.display, "none");
  assert.equal(campos.get("falhaAberturaPdv").style.display, "flex");
  tela.iniciarAplicacaoAdmin();
  chamadas.shift().sucesso("[]");
  assert.equal(campos.get("loadingScreen").style.display, "none");
  assert.equal(campos.get("falhaAberturaPdv").style.display, "none");
});

test("Caixa mantém o pedido durante a baixa e descarta leitura iniciada antes da confirmação", () => {
  const { tela, chamadas, avisos } = criarTela();
  tela.iniciarSyncEmTempoReal();
  const leituraAntiga = chamadas.shift();
  tela.finalizarVenda("PIX");
  assert.equal(tela.historicoNuvem[0].timestamp, undefined);
  const baixa = chamadas.shift();
  assert.equal(baixa.acao, "finalizarPagamentoProducao");
  baixa.sucesso({ ...pedido, timestamp: 1000 });
  leituraAntiga.sucesso(JSON.stringify([pedido]));
  assert.equal(tela.historicoNuvem.length, 0);
  assert.deepEqual(avisos, [4]);
});

test("Caixa consulta a baixa após resposta perdida e só então confirma o pedido", () => {
  const { tela, chamadas, avisos } = criarTela();
  tela.finalizarVenda("PIX");
  chamadas.shift().falha(new Error("Tempo limite"));
  const consulta = chamadas.shift();
  assert.equal(consulta.acao, "consultarPagamentoProducao");
  assert.equal(tela.historicoNuvem.length, 1);
  consulta.sucesso({ estado: "confirmado", pedido: { ...pedido, timestamp: 1000 } });
  assert.equal(tela.historicoNuvem.length, 0);
  assert.deepEqual(avisos, [4]);
});
