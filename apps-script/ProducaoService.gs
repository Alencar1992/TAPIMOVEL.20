// =========================================================
// OPERAÇÕES RESTRITAS DO PERFIL PRODUÇÃO
// Toda mutação parte do pedido persistido; o cliente nunca define itens ou totais.
// =========================================================

function numeroPedidoProducao_(valor) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) {
    throw erroApi_("INVALID_ORDER", "Número do pedido inválido.");
  }
  return numero;
}

function clonarPedidoProducao_(pedido) {
  return JSON.parse(JSON.stringify(pedido));
}

function buscarIndicePedidoProducao_(pedidos, numero) {
  return pedidos.findIndex(function(item) {
    return Number(item.numero) === numero;
  });
}

function idPedidoPlanilhaProducao_(numero) {
  return "#" + numero;
}

function abaContemPedidoProducao_(aba, numero) {
  if (!aba || aba.getLastRow() < 2) return false;
  const id = idPedidoPlanilhaProducao_(numero);
  return aba.getDataRange().getValues().slice(1).some(function(linha) {
    return String(linha[0]) === id || Number(linha[0]) === numero;
  });
}

function registrarHistoricoPagamentoProducao_(pedido) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    let aba = planilha.getSheetByName("Historico_Diario");
    if (!aba) {
      aba = planilha.insertSheet("Historico_Diario");
      aba.appendRow(["ID Pedido", "Data e Hora", "Produto", "Tipo", "Qtd", "Preço Unit.", "Total Pago", "Forma Pagamento", "Observações"]);
      aba.getRange("A1:I1").setFontWeight("bold").setBackground("#d9ead3");
    }
    if (abaContemPedidoProducao_(aba, pedido.numero)) return false;
    const linhas = pedido.itens.map(function(item) {
      return [
        idPedidoPlanilhaProducao_(pedido.numero),
        valorSeguroPlanilha_(String(pedido.dataExibicao || "")),
        valorSeguroPlanilha_(String(item.nome || "")),
        valorSeguroPlanilha_(String(item.tipo || "").toUpperCase()),
        Number(item.quantidade) || 0,
        Number(item.preco) || 0,
        (Number(item.quantidade) || 0) * (Number(item.preco) || 0),
        valorSeguroPlanilha_(String(pedido.formaPagamento || "")),
        valorSeguroPlanilha_(String(item.obs || "-"))
      ];
    });
    if (linhas.length) {
      aba.getRange(aba.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
      invalidarCacheLeituraAnalitica_("Historico_Diario");
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

function registrarCancelamentoProducao_(pedido) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    let aba = planilha.getSheetByName("Pedidos Cancelados");
    if (!aba) {
      aba = planilha.insertSheet("Pedidos Cancelados");
      aba.appendRow(["ID Pedido", "Data Cancelamento", "Produto", "Qtd", "Total Perdido"]);
      aba.getRange("A1:E1").setFontWeight("bold").setBackground("#f4cccc");
    }
    if (abaContemPedidoProducao_(aba, pedido.numero)) return false;
    const linhas = pedido.itens.map(function(item) {
      return [
        idPedidoPlanilhaProducao_(pedido.numero),
        valorSeguroPlanilha_(String(pedido.dataExibicao || "")),
        valorSeguroPlanilha_(String(item.nome || "")),
        Number(item.quantidade) || 0,
        (Number(item.quantidade) || 0) * (Number(item.preco) || 0)
      ];
    });
    if (linhas.length) {
      aba.getRange(aba.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

function pagamentoProducaoSeguro_(recebido, pedido) {
  const formas = ["PIX", "Dinheiro", "Cartão de Débito", "Cartão de Crédito", "VR", "Misto"];
  const forma = String(recebido && recebido.formaPagamento || "");
  if (formas.indexOf(forma) === -1) {
    throw erroApi_("INVALID_PAYMENT", "Forma de pagamento inválida.");
  }
  const pagamento = { formaPagamento: forma, troco: 0, pagamentosMistos: [] };
  if (forma === "Dinheiro") {
    pagamento.troco = Math.max(0, Number(recebido.troco) || 0);
  }
  if (forma === "Misto") {
    const mistos = Array.isArray(recebido.pagamentosMistos) ? recebido.pagamentosMistos : [];
    const permitidas = formas.filter(function(item) { return item !== "Misto"; });
    pagamento.pagamentosMistos = mistos.map(function(item) {
      const nome = String(item && item.forma || "");
      const valor = Math.round((Number(item && item.valor) || 0) * 100) / 100;
      if (permitidas.indexOf(nome) === -1 || valor <= 0) {
        throw erroApi_("INVALID_PAYMENT", "Divisão de pagamento inválida.");
      }
      return { forma: nome, valor: valor };
    });
    const soma = pagamento.pagamentosMistos.reduce(function(total, item) {
      return total + item.valor;
    }, 0);
    if (Math.abs(soma - Number(pedido.total || 0)) > 0.009) {
      throw erroApi_("INVALID_PAYMENT", "O pagamento misto não confere com o total do pedido.");
    }
  }
  return pagamento;
}

function atualizarEstadoProducao(pedidoJSON) {
  const recebido = JSON.parse(pedidoJSON || "{}");
  const numero = numeroPedidoProducao_(recebido.numero);
  const lock = LockService.getScriptLock();
  let pedidoAtualizado;
  let removerAtivo = false;
  try {
    lock.waitLock(10000);
    const ativos = carregarFilaPdvAtivos_();
    const indice = buscarIndicePedidoProducao_(ativos, numero);
    if (indice === -1) throw erroApi_("ORDER_NOT_FOUND", "O pedido não foi encontrado.");
    const pedido = clonarPedidoProducao_(ativos[indice]);
    if (!Array.isArray(recebido.itens) || recebido.itens.length !== pedido.itens.length) {
      throw erroApi_("INVALID_ORDER", "Estado de itens incompatível com o pedido atual.");
    }
    pedido.itens = pedido.itens.map(function(item, indiceItem) {
      item.pronto = Boolean(recebido.itens[indiceItem] && recebido.itens[indiceItem].pronto);
      return item;
    });
    pedido.produzido = pedido.itens
      .filter(function(item) { return item.tipo !== "bebida"; })
      .every(function(item) { return item.pronto === true; });
    removerAtivo = Boolean(pedido.produzido && pedido.timestamp);
    if (removerAtivo) ativos.splice(indice, 1);
    else ativos[indice] = pedido;
    substituirFilaPdvAtivos_(ativos);
    pedidoAtualizado = pedido;
  } finally {
    lock.releaseLock();
  }
  if (removerAtivo) removerDaBaseDeVendasBackend(numero);
  return pedidoAtualizado;
}

function finalizarPagamentoProducao(pedidoJSON) {
  const recebido = JSON.parse(pedidoJSON || "{}");
  const numero = numeroPedidoProducao_(recebido.numero);
  const lock = LockService.getScriptLock();
  let pedidoAtualizado;
  let removerAtivo = false;
  try {
    lock.waitLock(10000);
    const ativos = carregarFilaPdvAtivos_();
    const indice = buscarIndicePedidoProducao_(ativos, numero);
    if (indice === -1) throw erroApi_("ORDER_NOT_FOUND", "O pedido não foi encontrado.");
    const pedido = clonarPedidoProducao_(ativos[indice]);
    if (!pedido.timestamp) {
      const pagamento = pagamentoProducaoSeguro_(recebido, pedido);
      pedido.formaPagamento = pagamento.formaPagamento;
      pedido.troco = pagamento.troco;
      pedido.pagamentosMistos = pagamento.pagamentosMistos;
      pedido.timestamp = Date.now();
      pedido.dataExibicao = Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "dd/MM/yyyy HH:mm"
      );
    }
    removerAtivo = Boolean(pedido.produzido);
    if (removerAtivo) ativos.splice(indice, 1);
    else ativos[indice] = pedido;
    substituirFilaPdvAtivos_(ativos);
    pedidoAtualizado = pedido;
  } finally {
    lock.releaseLock();
  }
  registrarHistoricoPagamentoProducao_(pedidoAtualizado);
  if (removerAtivo) removerDaBaseDeVendasBackend(numero);
  return pedidoAtualizado;
}

function cancelarPedidoProducao(numeroPedido) {
  const numero = numeroPedidoProducao_(numeroPedido);
  const lock = LockService.getScriptLock();
  let pedido;
  try {
    lock.waitLock(10000);
    const ativos = carregarFilaPdvAtivos_();
    const indice = buscarIndicePedidoProducao_(ativos, numero);
    if (indice === -1) {
      const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Pedidos Cancelados");
      if (abaContemPedidoProducao_(aba, numero)) {
        return { numero: numero, cancelado: true, repetido: true };
      }
      throw erroApi_("ORDER_NOT_FOUND", "O pedido não foi encontrado.");
    }
    pedido = clonarPedidoProducao_(ativos[indice]);
    if (pedido.timestamp) {
      throw erroApi_("INVALID_TRANSITION", "Um pedido pago não pode ser cancelado.");
    }
    pedido.status = "Cancelado";
    pedido.dataExibicao = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "dd/MM/yyyy HH:mm"
    );
  } finally {
    lock.releaseLock();
  }
  registrarCancelamentoProducao_(pedido);
  const lockRemocao = LockService.getScriptLock();
  try {
    lockRemocao.waitLock(10000);
    const ativosAtuais = carregarFilaPdvAtivos_();
    const indiceAtual = buscarIndicePedidoProducao_(ativosAtuais, numero);
    if (indiceAtual !== -1) {
      ativosAtuais.splice(indiceAtual, 1);
      substituirFilaPdvAtivos_(ativosAtuais);
    }
  } finally {
    lockRemocao.releaseLock();
  }
  removerDaBaseDeVendasBackend(numero);
  return pedido;
}

function excluirPedidoTravadoProducao(numeroPedido) {
  const numero = numeroPedidoProducao_(numeroPedido);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ativos = carregarFilaPdvAtivos_();
    const indice = buscarIndicePedidoProducao_(ativos, numero);
    if (indice === -1) return { numero: numero, removido: true, repetido: true };
    ativos.splice(indice, 1);
    substituirFilaPdvAtivos_(ativos);
  } finally {
    lock.releaseLock();
  }
  removerDaBaseDeVendasBackend(numero);
  return { numero: numero, removido: true, repetido: false };
}
