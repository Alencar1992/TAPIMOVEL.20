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
  const confirmacoes = [];
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
    mostrarConfirmacao: (mensagem, confirmar, opcoes) => confirmacoes.push({ mensagem, confirmar, opcoes }),
    formatarMoeda: valor => 'R$ ' + Number(valor).toFixed(2).replace('.', ','),
    ehHoje: () => true,
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
    trecho("function iniciarAplicacaoAdmin", "function carregarBuildPdv"),
    trecho("function pedidoSelecionadoParaPagamento", "function maskCurrency"),
    trecho("function maskCurrency", "function checarBaixaCache"),
    trecho("function chaveVendaHoje", "function vendasHojeCompletas"),
    trecho("function atualizarVendasHojePersistidas", "function quantidadeTapiocasFeitasHoje")
  ].join("\n"), tela);
  return { tela, campos, chamadas, avisos, confirmacoes };
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

test("escolher PIX pede confirmação e voltar preserva o pedido pendente", () => {
  const { tela, chamadas, confirmacoes } = criarTela();
  tela.processarPagamento("PIX");
  assert.equal(chamadas.length, 0);
  assert.match(confirmacoes[0].mensagem, /R\$ 14,00.*#4.*PIX/);
  assert.equal(confirmacoes[0].opcoes.textoCancelar, "Voltar");
  tela.processarPagamento("Cartão de Débito");
  assert.equal(chamadas.length, 0);
  confirmacoes[1].confirmar();
  assert.equal(chamadas.length, 1);
  assert.equal(JSON.parse(chamadas[0].args[0]).formaPagamento, "Cartão de Débito");
});

test("o valor revisado muda antes da confirmação e a baixa é interrompida", () => {
  const { tela, chamadas, avisos, confirmacoes } = criarTela();
  tela.processarPagamento("PIX");
  tela.historicoNuvem[0].total = 20;
  confirmacoes[0].confirmar();
  assert.equal(chamadas.length, 0);
  assert.match(avisos[0], /pedido mudou/i);
});

test("dinheiro e pagamento dividido enviam os valores revisados só após confirmação", () => {
  const dinheiro = criarTela();
  dinheiro.tela.processarPagamento("Dinheiro");
  dinheiro.campos.get("inputValorRecebido").value = "20,00";
  dinheiro.tela.processarPagamento("Dinheiro", true);
  assert.equal(dinheiro.chamadas.length, 0);
  dinheiro.confirmacoes[0].confirmar();
  assert.equal(JSON.parse(dinheiro.chamadas[0].args[0]).troco, 6);

  const misto = criarTela();
  for (const [campo, valor] of Object.entries({
    mistoPix: "8,00", mistoDinheiro: "6,00", mistoDebito: "", mistoCredito: "", mistoVR: ""
  })) misto.tela.document.getElementById(campo).value = valor;
  misto.tela.finalizarPagamentoMisto();
  assert.equal(misto.chamadas.length, 0);
  assert.match(misto.confirmacoes[0].mensagem, /Pagamento dividido.*PIX R\$ 8,00.*Dinheiro R\$ 6,00/);
  misto.confirmacoes[0].confirmar();
  assert.deepEqual(JSON.parse(misto.chamadas[0].args[0]).pagamentosMistos, [
    { forma: "PIX", valor: 8 }, { forma: "Dinheiro", valor: 6 }
  ]);
});
