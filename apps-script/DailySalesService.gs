// =========================================================
// FLUXO DIÁRIO DE VENDAS — FONTE OFICIAL + LIVRO DE AUDITORIA
// Regras:
// 1) Pagamento confirmado -> Livro_Transacoes + Vendas_hoje.
// 2) Historico_Diario só recebe dados no fechamento.
// 3) Fechamento é idempotente e só limpa Vendas_hoje após validar as gravações.
// =========================================================

const ABA_LIVRO_TRANSACOES_ = "Livro_Transacoes";
const CABECALHO_LIVRO_TRANSACOES_ = [
  "ID Evento",
  "Data/Hora",
  "Data Operação",
  "Tipo",
  "Chave Pedido",
  "Payload JSON",
  "Fechamento ID"
];

function dataOperacaoHoje_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
}

function dataHoraOperacaoAgora_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy, HH:mm:ss");
}

function obterLivroTransacoes_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA_LIVRO_TRANSACOES_);
  if (!aba) {
    aba = ss.insertSheet(ABA_LIVRO_TRANSACOES_);
    aba.getRange(1, 1, 1, CABECALHO_LIVRO_TRANSACOES_.length)
      .setValues([CABECALHO_LIVRO_TRANSACOES_]);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, CABECALHO_LIVRO_TRANSACOES_.length).setFontWeight("bold");
  }
  return aba;
}

function chavePedidoVendaHoje_(pedido) {
  const numero = Number(pedido && pedido.numero) || 0;
  const identificador = pedido && (
    pedido.idOperacional ||
    pedido.codigoOnline ||
    pedido.idRequisicao ||
    pedido.timestampCriacao
  );
  return "#" + numero + "@" + String(identificador || "legacy");
}

function sanitizarPedidoLivro_(pedido) {
  const itens = Array.isArray(pedido && pedido.itens) ? pedido.itens : [];
  return {
    numero: Number(pedido && pedido.numero) || 0,
    chavePedido: chavePedidoVendaHoje_(pedido),
    timestamp: Number(pedido && pedido.timestamp) || Date.now(),
    dataExibicao: String(pedido && pedido.dataExibicao || dataHoraOperacaoAgora_()),
    formaPagamento: String(pedido && pedido.formaPagamento || ""),
    pagamentosMistos: Array.isArray(pedido && pedido.pagamentosMistos)
      ? pedido.pagamentosMistos.map(function(pagamento) {
          return {
            forma: String(pagamento && pagamento.forma || ""),
            valor: Math.round((Number(pagamento && pagamento.valor) || 0) * 100) / 100
          };
        })
      : [],
    total: Math.round((Number(pedido && pedido.total) || 0) * 100) / 100,
    itens: itens.map(function(item) {
      return {
        nome: String(item && item.nome || ""),
        tipo: String(item && item.tipo || "tapioca").toLowerCase(),
        quantidade: Number(item && item.quantidade) || 0,
        preco: Math.round((Number(item && item.preco) || 0) * 100) / 100,
        obs: String(item && item.obs || "-")
      };
    })
  };
}

function listarEventosLivroDaData_(dataReferencia) {
  const aba = obterLivroTransacoes_();
  if (aba.getLastRow() < 2) return [];
  return aba.getDataRange().getValues().slice(1).filter(function(linha) {
    return String(linha[2] || "") === dataReferencia;
  });
}

function dataJaFechadaNoLivro_(dataReferencia) {
  return listarEventosLivroDaData_(dataReferencia).some(function(linha) {
    return String(linha[3] || "") === "FECHAMENTO";
  });
}

function registrarEventoLivroSemLock_(tipo, chavePedido, payload, fechamentoId, dataReferencia) {
  const aba = obterLivroTransacoes_();
  const dataOperacao = dataReferencia || dataOperacaoHoje_();
  const idEvento = Utilities.getUuid();
  aba.appendRow([
    idEvento,
    dataHoraOperacaoAgora_(),
    dataOperacao,
    tipo,
    String(chavePedido || ""),
    valorSeguroPlanilha_(JSON.stringify(payload || {})),
    String(fechamentoId || "")
  ]);
  return idEvento;
}

function eventoPagamentoJaExiste_(dataReferencia, chavePedido) {
  return listarEventosLivroDaData_(dataReferencia).some(function(linha) {
    return String(linha[3] || "") === "PAGAMENTO" &&
      String(linha[4] || "") === String(chavePedido || "");
  });
}

function fechamentoJaExiste_(ss, dataReferencia) {
  const aba = ss.getSheetByName("Fechamentos_Diarios");
  if (!aba || aba.getLastRow() < 2) return false;
  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0] || "").indexOf(dataReferencia) === 0) return true;
  }
  return false;
}

function garantirEstruturaVendasHojeCompleta_(ss) {
  const aba = garantirAbaVendasHoje_(ss);
  const cabecalhoAtual = aba.getRange(1, 1, 1, 10).getValues()[0] || [];
  const cabecalhoDesejado = [
    "data e hora",
    "pedido",
    "qantidade",
    "item",
    "forma pagamento",
    "valor",
    "tipo",
    "preço unit.",
    "observações",
    "pagamentos JSON"
  ];
  let alterado = false;
  for (let i = 0; i < cabecalhoDesejado.length; i++) {
    if (!String(cabecalhoAtual[i] || "").trim()) {
      cabecalhoAtual[i] = cabecalhoDesejado[i];
      alterado = true;
    }
  }
  if (alterado) {
    aba.getRange(1, 1, 1, 10).setValues([cabecalhoAtual]);
  }
  return aba;
}

function vendaHojeContemChave_(aba, chavePedido) {
  if (!aba || aba.getLastRow() < 2) return false;
  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, Math.max(10, aba.getLastColumn())).getValues();
  return dados.some(function(linha) {
    return String(linha[1] || "") === String(chavePedido || "");
  });
}

function escreverPedidoEmVendasHojeSemLock_(pedidoSeguro) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = garantirEstruturaVendasHojeCompleta_(ss);
  if (vendaHojeContemChave_(aba, pedidoSeguro.chavePedido)) return false;

  const pagamentosJson = pedidoSeguro.pagamentosMistos.length
    ? JSON.stringify(pedidoSeguro.pagamentosMistos)
    : "";
  const linhas = pedidoSeguro.itens.map(function(item) {
    const totalLinha = Math.round(item.quantidade * item.preco * 100) / 100;
    return [
      pedidoSeguro.dataExibicao,
      pedidoSeguro.chavePedido,
      item.quantidade,
      valorSeguroPlanilha_(item.nome),
      valorSeguroPlanilha_(pedidoSeguro.formaPagamento),
      totalLinha,
      String(item.tipo || "tapioca").toUpperCase(),
      item.preco,
      valorSeguroPlanilha_(item.obs || "-"),
      valorSeguroPlanilha_(pagamentosJson)
    ];
  });
  if (linhas.length) {
    aba.getRange(aba.getLastRow() + 1, 1, linhas.length, 10).setValues(linhas);
  }
  return true;
}

function registrarVendaHojePedidoSemLock_(pedido) {
  const seguro = sanitizarPedidoLivro_(pedido);
  if (!seguro.numero || !seguro.itens.length || seguro.total <= 0) {
    throw erroApi_("INVALID_ORDER", "Venda inválida para registro diário.");
  }
  const dataReferencia = String(seguro.dataExibicao || "").substring(0, 10) || dataOperacaoHoje_();
  if (dataJaFechadaNoLivro_(dataReferencia) || fechamentoJaExiste_(SpreadsheetApp.getActiveSpreadsheet(), dataReferencia)) {
    throw erroApi_("DAY_CLOSED", "O expediente desta data já foi fechado.");
  }

  if (!eventoPagamentoJaExiste_(dataReferencia, seguro.chavePedido)) {
    registrarEventoLivroSemLock_("PAGAMENTO", seguro.chavePedido, seguro, "", dataReferencia);
  }
  escreverPedidoEmVendasHojeSemLock_(seguro);
  return seguro;
}

function registrarVendaHojeAdmin(pedidoJSON) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    return registrarVendaHojePedidoSemLock_(JSON.parse(pedidoJSON || "{}"));
  } finally {
    lock.releaseLock();
  }
}

function garantirLivroAPartirVendasHojeSemLock_(dataReferencia) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = garantirEstruturaVendasHojeCompleta_(ss);
  if (aba.getLastRow() < 2) return 0;

  const dados = aba.getDataRange().getValues().slice(1).filter(function(linha) {
    return String(linha[0] || "").indexOf(dataReferencia) === 0;
  });
  const grupos = {};
  dados.forEach(function(linha) {
    const chave = String(linha[1] || "");
    if (!chave) return;
    if (!grupos[chave]) {
      grupos[chave] = {
        numero: Number((chave.match(/^#?(\d+)/) || [0, 0])[1]) || 0,
        chavePedido: chave,
        timestamp: timestampHistoricoHoje_(linha[0]),
        dataExibicao: String(linha[0] || ""),
        formaPagamento: String(linha[4] || ""),
        pagamentosMistos: [],
        total: 0,
        itens: []
      };
      if (linha[9]) {
        try { grupos[chave].pagamentosMistos = JSON.parse(String(linha[9])); } catch (_) {}
      }
    }
    const qtd = normalizarNumeroVendaHoje_(linha[2]);
    const total = normalizarNumeroVendaHoje_(linha[5]);
    const preco = normalizarNumeroVendaHoje_(linha[7]) || (qtd > 0 ? total / qtd : total);
    grupos[chave].total += total;
    grupos[chave].itens.push({
      nome: String(linha[3] || ""),
      tipo: String(linha[6] || "TAPIOCA").toLowerCase(),
      quantidade: qtd,
      preco: Math.round(preco * 100) / 100,
      obs: String(linha[8] || "-")
    });
  });

  let criados = 0;
  Object.keys(grupos).forEach(function(chave) {
    if (eventoPagamentoJaExiste_(dataReferencia, chave)) return;
    grupos[chave].total = Math.round(grupos[chave].total * 100) / 100;
    registrarEventoLivroSemLock_("PAGAMENTO", chave, grupos[chave], "", dataReferencia);
    criados++;
  });
  return criados;
}

function reconciliarVendasHojeComLivroSemLock_(dataReferencia) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaVendas = garantirEstruturaVendasHojeCompleta_(ss);
  if (dataJaFechadaNoLivro_(dataReferencia) || fechamentoJaExiste_(ss, dataReferencia)) {
    return { data: dataReferencia, inseridas: 0, fechado: true };
  }

  const eventos = listarEventosLivroDaData_(dataReferencia);
  const estornados = {};
  eventos.forEach(function(linha) {
    if (String(linha[3] || "") === "ESTORNO") estornados[String(linha[4] || "")] = true;
  });

  let inseridas = 0;
  eventos.forEach(function(linha) {
    if (String(linha[3] || "") !== "PAGAMENTO") return;
    const chave = String(linha[4] || "");
    if (!chave || estornados[chave] || vendaHojeContemChave_(abaVendas, chave)) return;
    try {
      const payload = JSON.parse(String(linha[5] || "{}"));
      if (escreverPedidoEmVendasHojeSemLock_(payload)) inseridas++;
    } catch (erro) {
      console.error("Falha ao reconstruir venda pelo Livro_Transacoes:", erro);
    }
  });
  return { data: dataReferencia, inseridas: inseridas, fechado: false };
}

function reconciliarVendasHojeComLivro() {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    return reconciliarVendasHojeComLivroSemLock_(dataOperacaoHoje_());
  } finally {
    lock.releaseLock();
  }
}

function removerPedidoVendasHojeSemLock_(pedido) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Vendas_hoje");
  if (!aba || aba.getLastRow() < 2) return 0;
  const chave = chavePedidoVendaHoje_(pedido);
  const dados = aba.getDataRange().getValues();
  let removidas = 0;
  for (let i = dados.length - 1; i >= 1; i--) {
    if (String(dados[i][1] || "") === chave) {
      aba.deleteRow(i + 1);
      removidas++;
    }
  }
  return removidas;
}

function estornarVendaHojePedido_(pedido) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const seguro = sanitizarPedidoLivro_(pedido);
    removerPedidoVendasHojeSemLock_(seguro);
    registrarEventoLivroSemLock_(
      "ESTORNO",
      seguro.chavePedido,
      { motivo: "REABERTURA", numero: seguro.numero },
      "",
      dataOperacaoHoje_()
    );
    return { estornado: true, chavePedido: seguro.chavePedido };
  } finally {
    lock.releaseLock();
  }
}

function garantirAbaHistoricoDiario_(ss) {
  let aba = ss.getSheetByName("Historico_Diario");
  if (!aba) {
    aba = ss.insertSheet("Historico_Diario");
    aba.appendRow(["ID Pedido", "Data e Hora", "Produto", "Tipo", "Qtd", "Preço Unit.", "Total Pago", "Forma Pagamento", "Observações"]);
    aba.getRange(1, 1, 1, 9).setFontWeight("bold");
  }
  return aba;
}

function garantirAbaFechamentosDiarios_(ss) {
  let aba = ss.getSheetByName("Fechamentos_Diarios");
  if (!aba) {
    aba = ss.insertSheet("Fechamentos_Diarios");
    aba.appendRow(["Data","Total Faturado","Dinheiro","PIX","Crédito","Débito","VR","Origem","Status","Atualizado Em"]);
    aba.setFrozenRows(1);
  }
  return aba;
}

function garantirAbaTapiocasDiaria_(ss) {
  let aba = ss.getSheetByName("Tapiocas Diária");
  if (!aba) {
    aba = ss.insertSheet("Tapiocas Diária");
    aba.appendRow(["data","qtd"]);
  }
  return aba;
}

function historicoContemLinhaVenda_(dadosHistorico, linhaVenda) {
  return dadosHistorico.some(function(linhaHist) {
    return String(linhaHist[0] || "") === String(linhaVenda[1] || "") &&
      String(linhaHist[1] || "") === String(linhaVenda[0] || "") &&
      String(linhaHist[2] || "") === String(linhaVenda[3] || "") &&
      Number(linhaHist[4] || 0) === Number(linhaVenda[2] || 0) &&
      Math.round(Number(linhaHist[6] || 0) * 100) === Math.round(Number(linhaVenda[5] || 0) * 100);
  });
}

function obterResumoFechamentoDasVendas_(linhas) {
  const resumo = {
    total: 0,
    dinheiro: 0,
    pix: 0,
    credito: 0,
    debito: 0,
    vr: 0,
    qtdTapiocas: 0
  };
  const pedidos = {};

  linhas.forEach(function(linha) {
    const chave = String(linha[1] || "");
    const valor = normalizarNumeroVendaHoje_(linha[5]);
    resumo.total += valor;
    const tipo = String(linha[6] || "").toLowerCase();
    if (tipo === "tapioca" || tipo === "extra") {
      resumo.qtdTapiocas += normalizarNumeroVendaHoje_(linha[2]);
    }
    if (!pedidos[chave]) {
      pedidos[chave] = {
        forma: String(linha[4] || ""),
        total: 0,
        pagamentosJson: String(linha[9] || "")
      };
    }
    pedidos[chave].total += valor;
  });

  Object.keys(pedidos).forEach(function(chave) {
    const pedido = pedidos[chave];
    if (pedido.forma === "Misto" && pedido.pagamentosJson) {
      try {
        const mistos = JSON.parse(pedido.pagamentosJson);
        mistos.forEach(function(pag) {
          const valor = Number(pag && pag.valor) || 0;
          if (pag.forma === "Dinheiro") resumo.dinheiro += valor;
          if (pag.forma === "PIX") resumo.pix += valor;
          if (pag.forma === "Cartão de Crédito") resumo.credito += valor;
          if (pag.forma === "Cartão de Débito") resumo.debito += valor;
          if (pag.forma === "VR") resumo.vr += valor;
        });
        return;
      } catch (_) {}
    }
    if (pedido.forma === "Dinheiro") resumo.dinheiro += pedido.total;
    if (pedido.forma === "PIX") resumo.pix += pedido.total;
    if (pedido.forma === "Cartão de Crédito") resumo.credito += pedido.total;
    if (pedido.forma === "Cartão de Débito") resumo.debito += pedido.total;
    if (pedido.forma === "VR") resumo.vr += pedido.total;
  });

  Object.keys(resumo).forEach(function(chave) {
    if (chave !== "qtdTapiocas") resumo[chave] = Math.round(resumo[chave] * 100) / 100;
  });
  return resumo;
}

function obterStatusFluxoVendasHoje_(dataReferencia) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = (typeof normalizarDataFechamentoDiario_ === "function" && normalizarDataFechamentoDiario_(dataReferencia)) || dataReferencia || dataOperacaoHoje_();
  const fechado = fechamentoJaExiste_(ss, data) || dataJaFechadaNoLivro_(data);
  const abaVendas = ss.getSheetByName("Vendas_hoje");
  let linhas = 0;
  if (abaVendas && abaVendas.getLastRow() >= 2) {
    const dados = abaVendas.getDataRange().getValues();
    linhas = dados.slice(1).filter(function(linha) {
      return String(linha[0] || "").indexOf(data) === 0;
    }).length;
  }
  return { data: data, fechado: fechado, linhasVendasHoje: linhas };
}

function fecharDiaPorVendasHojeSeguro_(dataReferencia, origem) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = (typeof normalizarDataFechamentoDiario_ === "function" && normalizarDataFechamentoDiario_(dataReferencia)) || String(dataReferencia || dataOperacaoHoje_());
    const tipoOrigem = String(origem || "MANUAL").toUpperCase() === "AUTOMATICO" ? "AUTOMATICO" : "MANUAL";

    if (fechamentoJaExiste_(ss, data) || dataJaFechadaNoLivro_(data)) {
      return { ok: true, status: "JA_FECHADO", data: data, origem: tipoOrigem };
    }

    if (typeof carregarFilaPdvAtivos_ === "function" && typeof pedidoPendenteFechamentoDiario_ === "function") {
      const fila = carregarFilaPdvAtivos_();
      const pendentes = fila.filter(function(pedido) {
        return pedidoPendenteFechamentoDiario_(pedido, data);
      });
      if (pendentes.length) {
        return {
          ok: false,
          status: "BLOQUEADO_PENDENCIAS",
          data: data,
          pedidosPendentes: pendentes.length
        };
      }
    }

    garantirLivroAPartirVendasHojeSemLock_(data);
    reconciliarVendasHojeComLivroSemLock_(data);

    const abaVendas = garantirEstruturaVendasHojeCompleta_(ss);
    const dadosVendas = abaVendas.getDataRange().getValues();
    const linhasDia = dadosVendas.slice(1).filter(function(linha) {
      return String(linha[0] || "").indexOf(data) === 0;
    });
    if (!linhasDia.length) {
      return { ok: true, status: "SEM_MOVIMENTO", data: data, origem: tipoOrigem };
    }

    const resumo = obterResumoFechamentoDasVendas_(linhasDia);
    const fechamentoId = "FECH-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd") + "-" + Utilities.getUuid().substring(0, 8);

    const abaHistorico = garantirAbaHistoricoDiario_(ss);
    const abaFech = garantirAbaFechamentosDiarios_(ss);
    const abaTap = garantirAbaTapiocasDiaria_(ss);
    const abaLivro = obterLivroTransacoes_();

    const historicoAntes = abaHistorico.getLastRow();
    const fechAntes = abaFech.getLastRow();
    const tapAntes = abaTap.getLastRow();
    const livroAntes = abaLivro.getLastRow();

    try {
      const existentesHist = abaHistorico.getDataRange().getValues().slice(1);
      const novasHist = linhasDia.filter(function(linha) {
        return !historicoContemLinhaVenda_(existentesHist, linha);
      }).map(function(linha) {
        const qtd = normalizarNumeroVendaHoje_(linha[2]);
        const total = normalizarNumeroVendaHoje_(linha[5]);
        const precoUnit = normalizarNumeroVendaHoje_(linha[7]) || (qtd > 0 ? total / qtd : total);
        return [
          String(linha[1] || ""),
          String(linha[0] || ""),
          valorSeguroPlanilha_(String(linha[3] || "")),
          String(linha[6] || "").toUpperCase(),
          qtd,
          Math.round(precoUnit * 100) / 100,
          Math.round(total * 100) / 100,
          valorSeguroPlanilha_(String(linha[4] || "")),
          valorSeguroPlanilha_(String(linha[8] || "-"))
        ];
      });
      if (novasHist.length) {
        abaHistorico.getRange(abaHistorico.getLastRow() + 1, 1, novasHist.length, 9).setValues(novasHist);
      }

      abaFech.appendRow([
        data,
        resumo.total,
        resumo.dinheiro,
        resumo.pix,
        resumo.credito,
        resumo.debito,
        resumo.vr,
        "PDV/Vendas_hoje/" + tipoOrigem,
        "CONCLUIDO",
        new Date()
      ]);

      abaTap.appendRow([data, resumo.qtdTapiocas]);

      registrarEventoLivroSemLock_(
        "FECHAMENTO",
        "",
        {
          fechamentoId: fechamentoId,
          data: data,
          linhas: linhasDia.length,
          resumo: resumo
        },
        fechamentoId,
        data
      );

      const dadosAtuais = abaVendas.getDataRange().getValues();
      for (let i = dadosAtuais.length - 1; i >= 1; i--) {
        if (String(dadosAtuais[i][0] || "").indexOf(data) === 0) {
          abaVendas.deleteRow(i + 1);
        }
      }

      invalidarCacheLeituraAnalitica_("Historico_Diario");
      invalidarCacheLeituraAnalitica_("Fechamentos_Diarios");
      invalidarCacheLeituraAnalitica_("Tapiocas Diária");

      return {
        ok: true,
        status: "CONCLUIDO",
        origem: tipoOrigem,
        fechamentoId: fechamentoId,
        data: data,
        linhasProcessadas: linhasDia.length,
        resumo: resumo
      };
    } catch (erro) {
      while (abaHistorico.getLastRow() > historicoAntes) abaHistorico.deleteRow(abaHistorico.getLastRow());
      while (abaFech.getLastRow() > fechAntes) abaFech.deleteRow(abaFech.getLastRow());
      while (abaTap.getLastRow() > tapAntes) abaTap.deleteRow(abaTap.getLastRow());
      while (abaLivro.getLastRow() > livroAntes) abaLivro.deleteRow(abaLivro.getLastRow());
      try { reconciliarVendasHojeComLivroSemLock_(data); } catch (_) {}
      throw erro;
    }
  } finally {
    lock.releaseLock();
  }
}
