const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const pedidoService = fs.readFileSync(
  path.join(root, "apps-script", "PedidoService.gs"),
  "utf8"
);
const frontendPath = path.join(root, "frontend", "pedido-operation.js");

function criarAmbiente(options = {}) {
  let ativos = [];
  let gravacoesPlanilha = 0;
  let lockAtivo = false;
  let agora = 1000;

  const lock = {
    waitLock() {
      if (lockAtivo) throw new Error("LOCK_REENTRANTE");
      lockAtivo = true;
    },
    releaseLock() {
      lockAtivo = false;
    }
  };

  const context = {
    LockService: { getScriptLock: () => lock },
    Utilities: {
      formatDate(_data, _fuso, formato) {
        return formato === "yyyy-MM-dd" ? "2026-09-29" : "16:00";
      }
    },
    Session: { getScriptTimeZone: () => "America/Sao_Paulo" },
    Date: class extends Date {
      static now() { return agora++; }
    },
    console: { error() {}, info() {}, log() {} },
    obterScriptProperties_: () => ({}),
    carregarFilaPdvAtivos_: () => ativos.slice(),
    substituirFilaPdvAtivos_: lista => { ativos = lista.slice(); },
    lancarPedidoPlanilha: () => { gravacoesPlanilha += 1; },
    removerDaBaseDeVendasBackend() {},
    erroApi_: (code, message) => Object.assign(new Error(message), { code }),
    obterConfiguracaoOperacional: () => "{}",
    textoPedidoSeguro_: valor => String(valor || ""),
    hashSeguro_: valor => String(valor || ""),
    CacheService: {
      getScriptCache: () => ({ get: () => null, put() {}, remove() {} })
    }
  };

  vm.runInNewContext(
    pedidoService + "\nthis.__pedidoApi = { registrarPedidoPdv, atualizarPedidoPdv };",
    context
  );

  context.normalizarPedidoPdv_ = recebido => {
    if (options.exigirNormalizacaoForaDoLock) {
      assert.equal(lockAtivo, false, "a normalização não pode adquirir novamente o lock de escrita");
    }
    return {
      origem: "PDV",
      itens: recebido.itens,
      total: 10,
      produzido: false,
      idRequisicao: recebido.idRequisicao
    };
  };

  return {
    api: context.__pedidoApi,
    ativos: () => ativos,
    gravacoesPlanilha: () => gravacoesPlanilha
  };
}

function pedido(idRequisicao) {
  return JSON.stringify({
    idRequisicao,
    itens: [{ nome: "Tapioca", tipo: "tapioca", quantidade: 1, preco: 10 }]
  });
}

test("registro do PDV normaliza o pedido antes de adquirir o lock de escrita", () => {
  const env = criarAmbiente({ exigirNormalizacaoForaDoLock: true });
  assert.doesNotThrow(() => env.api.registrarPedidoPdv(pedido("pdv-20260929-abcdefghijkl")));
});

test("repetir a mesma requisição do PDV devolve o pedido existente sem duplicar", () => {
  const env = criarAmbiente();
  const primeira = env.api.registrarPedidoPdv(pedido("pdv-20260929-abcdefghijkl"));
  const repetida = env.api.registrarPedidoPdv(pedido("pdv-20260929-abcdefghijkl"));

  assert.equal(primeira.numero, repetida.numero);
  assert.equal(env.ativos().length, 1);
  assert.equal(env.gravacoesPlanilha(), 1);
});

test("edição normaliza fora do lock e mantém o mesmo número do pedido", () => {
  const env = criarAmbiente({ exigirNormalizacaoForaDoLock: true });
  const criado = env.api.registrarPedidoPdv(pedido("pdv-20260929-abcdefghijkl"));
  const atualizado = env.api.atualizarPedidoPdv(JSON.stringify({
    numero: criado.numero,
    idRequisicao: criado.idRequisicao,
    itens: [{ nome: "Tapioca editada", tipo: "tapioca", quantidade: 1, preco: 10 }]
  }));

  assert.equal(atualizado.numero, criado.numero);
  assert.equal(env.ativos().length, 1);
});

test("contexto de edição preserva o número e rejeita resposta atrasada", () => {
  assert.ok(
    fs.existsSync(frontendPath),
    "o controlador de operação do pedido ainda não existe"
  );
  const operacao = require(frontendPath);
  const contexto = operacao.criarContextoOperacao({
    numeroEdicao: "42",
    idOperacao: "op-edicao-42",
    idRequisicao: "pdv-20260929-abcdefghijkl"
  });

  assert.equal(contexto.tipo, "editar");
  assert.equal(contexto.numeroPedido, 42);
  assert.equal(
    operacao.respostaPertenceAoContexto(contexto, "op-edicao-42"),
    true
  );
  assert.equal(
    operacao.respostaPertenceAoContexto(contexto, "op-antiga"),
    false
  );
});

test("PDV integra idempotência e nunca converte edição perdida em criação", () => {
  const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");

  assert.match(html, /pedido-operation\.js\?v=/);
  assert.match(html, /idRequisicao:/);
  assert.match(html, /criarContextoOperacao/);
  assert.match(html, /respostaPertenceAoContexto/);
  assert.match(html, /Edição desatualizada[\s\S]*?return;/);
});
