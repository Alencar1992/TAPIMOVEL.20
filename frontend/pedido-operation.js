(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.TapimovelOperacaoPedido = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function criarIdOperacao(prefixo) {
    var prefixoSeguro = String(prefixo || "op").replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "op";
    var uuid = "";

    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      uuid = crypto.randomUUID();
    } else {
      uuid = Date.now().toString(36) + "-" +
        Math.random().toString(36).slice(2) + "-" +
        Math.random().toString(36).slice(2);
    }

    return prefixoSeguro + "-" + uuid;
  }

  function numeroPedidoValido(valor) {
    var numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
  }

  function criarContextoOperacao(opcoes) {
    var entrada = opcoes || {};
    var numeroPedido = numeroPedidoValido(entrada.numeroEdicao);
    var idOperacao = String(entrada.idOperacao || criarIdOperacao("op")).trim();
    var idRequisicao = String(entrada.idRequisicao || "").trim();

    if (!idOperacao) {
      throw new Error("A operação do pedido precisa de um identificador.");
    }

    if (!numeroPedido && !idRequisicao) {
      idRequisicao = criarIdOperacao("pdv");
    }

    return Object.freeze({
      tipo: numeroPedido ? "editar" : "criar",
      numeroPedido: numeroPedido,
      idOperacao: idOperacao,
      idRequisicao: idRequisicao
    });
  }

  function respostaPertenceAoContexto(contexto, idOperacao) {
    return Boolean(
      contexto &&
      contexto.idOperacao &&
      String(contexto.idOperacao) === String(idOperacao || "")
    );
  }

  return {
    criarIdOperacao: criarIdOperacao,
    criarContextoOperacao: criarContextoOperacao,
    respostaPertenceAoContexto: respostaPertenceAoContexto
  };
});
