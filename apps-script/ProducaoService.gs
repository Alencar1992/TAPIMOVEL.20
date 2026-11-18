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

function idPedidoPlanilhaProducao_(pedido) {
  const numero = numeroPedidoProducao_(pedido && pedido.numero);
  const identificadorEstavel = pedido && (
    pedido.idOperacional ||
    pedido.codigoOnline ||
    pedido.timestampCriacao
  );
  return "#" + numero + "@" + String(identificadorEstavel || "legacy");
}

function abaContemPedidoProducao_(aba, pedido) {
  if (!aba || aba.getLastRow() < 2) return false;
  const id = idPedidoPlanilhaProducao_(pedido);
  return aba.getDataRange().getValues().slice(1).some(function(linha) {
    return String(linha[0]) === id;
  });
}

function abaContemNumeroPedidoProducao_(aba, numero) {
  if (!aba || aba.getLastRow() < 2) return false;
  const prefixo = "#" + numero;
  return aba.getDataRange().getValues().slice(1).some(function(linha) {
    const valor = String(linha[0] || "");
    return valor === prefixo || valor.indexOf(prefixo + "@") === 0 || Number(linha[0]) === numero;
  });
}

function pedidoTemIdentidadePagamento_(pedido) {
  return chavePedidoVendaHoje_(pedido) !== "#" + Number(pedido.numero) + "@legacy";
}

function buscarPedidoPagamento_(ativos, recebido) {
  if (!pedidoTemIdentidadePagamento_(recebido)) {
    return buscarIndicePedidoProducao_(ativos, Number(recebido.numero));
  }
  const chave = chavePedidoVendaHoje_(recebido);
  return ativos.findIndex(item => chavePedidoVendaHoje_(item) === chave);
}

function pagamentoRegistradoProducao_(pedido) {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const chave = chavePedidoVendaHoje_(pedido);
  const aba = planilha.getSheetByName(ABA_LIVRO_TRANSACOES_);
  if (!aba || aba.getLastRow() < 2) return null;
  const eventos = aba.getRange(2, 4, aba.getLastRow() - 1, 3).getValues();
  for (let i = eventos.length - 1; i >= 0; i--) {
    const [tipo, chaveEvento, payload] = eventos[i];
    if (chaveEvento !== chave) continue;
    if (tipo === "ESTORNO") return null;
    if (tipo === "PAGAMENTO") return JSON.parse(payload);
  }
  return null;
}

function vendaPagamentoConfirmada_(chave) {
  return vendaHojeContemChave_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Vendas_hoje"), chave);
}

function consultarPagamentoProducao(pedidoJSON) {
  const recebido = JSON.parse(pedidoJSON || "{}");
  numeroPedidoProducao_(recebido.numero);
  if (!pedidoTemIdentidadePagamento_(recebido)) return { estado: "indeterminado" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ativos = carregarFilaPdvAtivos_();
    const pedido = ativos[buscarPedidoPagamento_(ativos, recebido)];
    const registro = pagamentoRegistradoProducao_(recebido);
    if (registro && (!pedido || pedido.timestamp) && vendaPagamentoConfirmada_(registro.chavePedido)) {
      return { estado: "confirmado", pedido: pedido || Object.assign({ produzido: true }, registro) };
    }
    if (pedido && !pedido.timestamp) return { estado: registro ? "retomar" : "pendente" };
    return { estado: "indeterminado" };
  } finally {
    lock.releaseLock();
  }
}

function persistirPagamentoProducao_(recebido, pedido) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    if (!pedido.timestamp) {
      const anterior = pagamentoRegistradoProducao_(pedido);
      if (anterior) {
        pedido.formaPagamento = anterior.formaPagamento;
        pedido.pagamentosMistos = anterior.pagamentosMistos;
        pedido.troco = anterior.troco || 0;
        pedido.timestamp = anterior.timestamp;
        pedido.dataExibicao = anterior.dataExibicao;
      } else {
        Object.assign(pedido, pagamentoProducaoSeguro_(recebido, pedido));
        pedido.timestamp = Date.now();
        pedido.dataExibicao = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
      }
    }
    registrarVendaHojePedidoSemLock_(pedido);
    SpreadsheetApp.flush();
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
    if (abaContemPedidoProducao_(aba, pedido)) return false;
    const linhas = pedido.itens.map(function(item) {
      return [
        idPedidoPlanilhaProducao_(pedido),
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
  lock.waitLock(10000);
  try {
    const ativos = carregarFilaPdvAtivos_();
    const indice = buscarPedidoPagamento_(ativos, recebido);
    if (indice === -1) {
      const registro = pedidoTemIdentidadePagamento_(recebido) && pagamentoRegistradoProducao_(recebido);
      if (registro && vendaPagamentoConfirmada_(registro.chavePedido)) {
        return Object.assign({ produzido: true }, registro);
      }
      throw erroApi_("ORDER_NOT_FOUND", "O pedido não foi encontrado. Atualize o Caixa antes de tentar novamente.");
    }

    const pedido = clonarPedidoProducao_(ativos[indice]);
    persistirPagamentoProducao_(recebido, pedido);
    if (pedido.produzido) {
      // A numeração pode ser reutilizada após a baixa. Limpa a base antes de liberar o número.
      removerDaBaseDeVendasBackend(numero);
      ativos.splice(indice, 1);
    } else {
      ativos[indice] = pedido;
    }
    substituirFilaPdvAtivos_(ativos, true);
    return pedido;
  } finally {
    lock.releaseLock();
  }
}

function cancelarPedidoProducao(numeroPedido, pedidoJSON) {
  const numero = numeroPedidoProducao_(numeroPedido);
  const recebido = pedidoJSON ? JSON.parse(pedidoJSON) : { numero: numero };
  if (Number(recebido.numero) !== numero) throw erroApi_("INVALID_ORDER", "Número do pedido inválido.");
  const temIdentidade = pedidoTemIdentidadePagamento_(recebido);
  const lock = LockService.getScriptLock();
  let pedido;
  try {
    lock.waitLock(10000);
    const ativos = carregarFilaPdvAtivos_();
    const indice = buscarPedidoPagamento_(ativos, recebido);
    if (indice === -1) {
      const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Pedidos Cancelados");
      const jaCancelado = temIdentidade
        ? abaContemPedidoProducao_(aba, recebido)
        : abaContemNumeroPedidoProducao_(aba, numero);
      if (jaCancelado) {
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

    // Validação, registro e remoção acontecem sob o mesmo lock.
    // Isso impede que um pagamento concorrente seja sobrescrito por um cancelamento tardio.
    registrarCancelamentoProducao_(pedido);
    removerDaBaseDeVendasBackend(numero);
    ativos.splice(indice, 1);
    substituirFilaPdvAtivos_(ativos, true);
  } finally {
    lock.releaseLock();
  }

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
