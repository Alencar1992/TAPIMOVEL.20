// =========================================================
// P10.2 — FECHAMENTO DIÁRIO SEGURO E AUTOMÁTICO
// O servidor consolida, grava, valida e somente depois limpa o dia.
// =========================================================

const ABA_FECHAMENTOS_DIARIOS_SEGURA_ = "Fechamentos_Diarios";
const ABA_TAPIOCAS_DIARIA_SEGURA_ = "Tapiocas Diária";
const HANDLER_FECHAMENTO_DIARIO_AUTOMATICO_ = "executarFechamentoDiarioAutomatico";
const HORA_MINIMA_FECHAMENTO_DIARIO_AUTOMATICO_ = 2;

function formatarDataFechamentoDiario_(data) {
  return formatarDataAplicacao_(data, "dd/MM/yyyy");
}

function normalizarDataFechamentoDiario_(valor) {
  return normalizarDataDiaAplicacao_(valor);
}

function dataPorMomentoFechamentoDiario_(valor) {
  return normalizarDataDiaAplicacao_(valor);
}

function dataReferenciaPedidoFechamentoDiario_(pedido) {
  const p = pedido && typeof pedido === "object" ? pedido : {};
  return dataPorMomentoFechamentoDiario_(p.timestamp) ||
    dataPorMomentoFechamentoDiario_(p.timestampCriacao) ||
    normalizarDataFechamentoDiario_(p.dataExibicao) ||
    normalizarDataFechamentoDiario_(p.data);
}

function pedidoPendenteFechamentoDiario_(pedido, dataReferencia) {
  const p = pedido && typeof pedido === "object" ? pedido : {};
  if (dataReferenciaPedidoFechamentoDiario_(p) !== dataReferencia) return false;
  return !p.timestamp || p.produzido !== true;
}

function pedidoFinalizadoFechamentoDiario_(pedido, dataReferencia) {
  const p = pedido && typeof pedido === "object" ? pedido : {};
  if (dataReferenciaPedidoFechamentoDiario_(p) !== dataReferencia) return false;
  return Boolean(p.timestamp) && p.produzido === true;
}

function numeroFechamentoDiario_(valor) {
  return numeroAplicacao_(valor);
}

function valorTotalPedidoFechamentoDiario_(pedido) {
  const p = pedido && typeof pedido === "object" ? pedido : {};
  const total = Number(p.total);
  if (isFinite(total)) return Math.round(total * 100) / 100;
  return (Array.isArray(p.itens) ? p.itens : []).reduce(function(soma, item) {
    return soma + (Number(item && item.quantidade) || 0) * (Number(item && item.preco) || 0);
  }, 0);
}

function adicionarPagamentoFechamentoDiario_(resumo, forma, valor) {
  const texto = String(forma || "").toLowerCase();
  const numero = Math.round((Number(valor) || 0) * 100) / 100;
  if (texto.indexOf("dinheiro") !== -1) resumo.dinheiro += numero;
  else if (texto.indexOf("pix") !== -1) resumo.pix += numero;
  else if (texto.indexOf("crédito") !== -1 || texto.indexOf("credito") !== -1) resumo.credito += numero;
  else if (texto.indexOf("débito") !== -1 || texto.indexOf("debito") !== -1) resumo.debito += numero;
  else if (texto.indexOf("vr") !== -1) resumo.vr += numero;
}

function consolidarFechamentoDiario_(pedidos, dataReferencia) {
  const finalizados = (Array.isArray(pedidos) ? pedidos : []).filter(function(pedido) {
    return pedidoFinalizadoFechamentoDiario_(pedido, dataReferencia);
  });
  const pendentes = (Array.isArray(pedidos) ? pedidos : []).filter(function(pedido) {
    return pedidoPendenteFechamentoDiario_(pedido, dataReferencia);
  });

  const resumo = {
    data: dataReferencia,
    total: 0,
    dinheiro: 0,
    pix: 0,
    credito: 0,
    debito: 0,
    vr: 0,
    qtdTapiocas: 0,
    pedidosFinalizados: finalizados.length,
    pedidosPendentes: pendentes.length
  };

  finalizados.forEach(function(pedido) {
    const totalPedido = valorTotalPedidoFechamentoDiario_(pedido);
    resumo.total += totalPedido;

    const pagamentos = Array.isArray(pedido.pagamentosMistos) && pedido.pagamentosMistos.length
      ? pedido.pagamentosMistos
      : [{ forma: pedido.formaPagamento, valor: totalPedido }];
    pagamentos.forEach(function(pagamento) {
      adicionarPagamentoFechamentoDiario_(resumo, pagamento && pagamento.forma, pagamento && pagamento.valor);
    });

    (Array.isArray(pedido.itens) ? pedido.itens : []).forEach(function(item) {
      const tipo = String(item && item.tipo || "").toLowerCase();
      if (tipo === "tapioca" || tipo === "extra") {
        resumo.qtdTapiocas += Number(item && item.quantidade) || 0;
      }
    });
  });

  ["total", "dinheiro", "pix", "credito", "debito", "vr"].forEach(function(campo) {
    resumo[campo] = Math.round(resumo[campo] * 100) / 100;
  });
  return resumo;
}

function obterOuCriarAbaFechamentosDiariosSegura_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA_FECHAMENTOS_DIARIOS_SEGURA_);
  if (!aba) aba = ss.insertSheet(ABA_FECHAMENTOS_DIARIOS_SEGURA_);

  const cabecalho = [
    "Data", "Total Faturado", "Dinheiro", "PIX", "Crédito", "Débito", "VR",
    "Origem", "Status", "Atualizado Em"
  ];
  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    aba.setFrozenRows(1);
  } else {
    aba.getRange(1, 1, 1, 7).setValues([cabecalho.slice(0, 7)]);
    aba.getRange(1, 8, 1, 3).setValues([cabecalho.slice(7)]);
  }
  return aba;
}

function obterOuCriarAbaTapiocasDiariaSegura_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA_TAPIOCAS_DIARIA_SEGURA_);
  if (!aba) aba = ss.insertSheet(ABA_TAPIOCAS_DIARIA_SEGURA_);
  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, 2).setValues([["data", "qtd"]]);
  }
  return aba;
}

function linhasDaDataFechamentoDiario_(aba, dataReferencia) {
  if (aba.getLastRow() <= 1) return [];
  const valores = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues();
  const linhas = [];
  valores.forEach(function(linha, indice) {
    if (normalizarDataFechamentoDiario_(linha[0]) === dataReferencia) linhas.push(indice + 2);
  });
  return linhas;
}

function obterRegistroFechamentoDiario_(dataReferencia) {
  const aba = obterOuCriarAbaFechamentosDiariosSegura_();
  const linhas = linhasDaDataFechamentoDiario_(aba, dataReferencia);
  if (linhas.length > 1) {
    throw new Error(
      "Existem múltiplos fechamentos para " + dataReferencia +
      ". A duplicidade histórica precisa ser revisada antes de fechar esse dia."
    );
  }
  if (!linhas.length) return null;
  const valores = aba.getRange(linhas[0], 1, 1, 10).getValues()[0];
  return {
    linha: linhas[0],
    data: normalizarDataFechamentoDiario_(valores[0]),
    total: numeroFechamentoDiario_(valores[1]),
    dinheiro: numeroFechamentoDiario_(valores[2]),
    pix: numeroFechamentoDiario_(valores[3]),
    credito: numeroFechamentoDiario_(valores[4]),
    debito: numeroFechamentoDiario_(valores[5]),
    vr: numeroFechamentoDiario_(valores[6]),
    origem: String(valores[7] || ""),
    status: String(valores[8] || ""),
    atualizadoEm: valores[9]
  };
}

function obterRegistroTapiocasDiaria_(dataReferencia) {
  const aba = obterOuCriarAbaTapiocasDiariaSegura_();
  const linhas = linhasDaDataFechamentoDiario_(aba, dataReferencia);
  if (linhas.length > 1) {
    throw new Error(
      "Existem múltiplas contagens de tapiocas para " + dataReferencia +
      ". A duplicidade histórica precisa ser revisada antes de fechar esse dia."
    );
  }
  if (!linhas.length) return null;
  const valores = aba.getRange(linhas[0], 1, 1, 2).getValues()[0];
  return { linha: linhas[0], data: normalizarDataFechamentoDiario_(valores[0]), qtd: Number(valores[1]) || 0 };
}

function gravarResumoFechamentoDiario_(resumo, origem, status) {
  const abaFech = obterOuCriarAbaFechamentosDiariosSegura_();
  const existente = obterRegistroFechamentoDiario_(resumo.data);
  const linha = existente ? existente.linha : abaFech.getLastRow() + 1;
  abaFech.getRange(linha, 1, 1, 10).setValues([[
    resumo.data,
    resumo.total,
    resumo.dinheiro,
    resumo.pix,
    resumo.credito,
    resumo.debito,
    resumo.vr,
    origem,
    status,
    new Date()
  ]]);
  abaFech.getRange(linha, 2, 1, 6).setNumberFormat('R$ #,##0.00');

  const abaTap = obterOuCriarAbaTapiocasDiariaSegura_();
  const existenteTap = obterRegistroTapiocasDiaria_(resumo.data);
  const linhaTap = existenteTap ? existenteTap.linha : abaTap.getLastRow() + 1;
  abaTap.getRange(linhaTap, 1, 1, 2).setValues([[resumo.data, resumo.qtdTapiocas]]);

  SpreadsheetApp.flush();
  invalidarCacheLeituraAnalitica_("Fechamentos_Diarios");
  invalidarCacheLeituraAnalitica_("Tapiocas Diária");
}

function quaseIgualFechamentoDiario_(a, b) {
  return quaseIgualAplicacao_(a, b, 0.005);
}

function validarPersistenciaFechamentoDiario_(resumo) {
  const salvo = obterRegistroFechamentoDiario_(resumo.data);
  const tapiocas = obterRegistroTapiocasDiaria_(resumo.data);
  if (!salvo || !tapiocas) {
    throw new Error("A confirmação do fechamento diário falhou: uma das gravações não foi encontrada.");
  }
  const campos = ["total", "dinheiro", "pix", "credito", "debito", "vr"];
  campos.forEach(function(campo) {
    if (!quaseIgualFechamentoDiario_(salvo[campo], resumo[campo])) {
      throw new Error("A confirmação do fechamento diário falhou no campo " + campo + ".");
    }
  });
  if (Number(tapiocas.qtd || 0) !== Number(resumo.qtdTapiocas || 0)) {
    throw new Error("A confirmação do fechamento diário falhou na quantidade de tapiocas.");
  }
  return true;
}

function atualizarStatusFechamentoDiario_(dataReferencia, origem, status) {
  const registro = obterRegistroFechamentoDiario_(dataReferencia);
  if (!registro) throw new Error("Fechamento diário não encontrado para atualizar o status.");
  const aba = obterOuCriarAbaFechamentosDiariosSegura_();
  aba.getRange(registro.linha, 8, 1, 3).setValues([[origem || registro.origem, status, new Date()]]);
  SpreadsheetApp.flush();
}

function removerSomentePedidosDoDiaFechado_(fila, dataReferencia) {
  const restantes = (Array.isArray(fila) ? fila : []).filter(function(pedido) {
    return dataReferenciaPedidoFechamentoDiario_(pedido) !== dataReferencia;
  });
  substituirFilaPdvAtivos_(restantes);
  const conferida = carregarFilaPdvAtivos_();
  const aindaExistem = conferida.some(function(pedido) {
    return dataReferenciaPedidoFechamentoDiario_(pedido) === dataReferencia;
  });
  if (aindaExistem) {
    throw new Error("Os dados foram salvos, mas a fila do dia não pôde ser zerada com segurança.");
  }
  return conferida.length;
}

function obterPreviaFechamentoDiario(dataReferencia) {
  const data = normalizarDataFechamentoDiario_(dataReferencia) || formatarDataFechamentoDiario_(new Date());
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jaFechado = fechamentoJaExiste_(ss, data) || dataJaFechadaNoLivro_(data);

  const abaVendas = ss.getSheetByName("Vendas_hoje");
  const linhasDia = abaVendas && abaVendas.getLastRow() > 1
    ? abaVendas.getDataRange().getValues().slice(1).filter(function(linha) {
        return normalizarDataFechamentoDiario_(linha[0]) === data;
      })
    : [];

  const chavesPedidos = {};
  linhasDia.forEach(function(linha) {
    const chave = String(linha[1] || "").trim();
    if (chave) chavesPedidos[chave] = true;
  });

  const fila = typeof carregarFilaPdvAtivos_ === "function" ? carregarFilaPdvAtivos_() : [];
  const pendentes = fila.filter(function(pedido) {
    return pedidoPendenteFechamentoDiario_(pedido, data);
  });

  const resumo = obterResumoFechamentoDasVendas_(linhasDia);
  resumo.pedidosFinalizados = Object.keys(chavesPedidos).length;
  resumo.pedidosPendentes = pendentes.length;
  resumo.linhasVendasHoje = linhasDia.length;

  const somaPagamentos = Math.round((
    Number(resumo.dinheiro || 0) +
    Number(resumo.pix || 0) +
    Number(resumo.credito || 0) +
    Number(resumo.debito || 0) +
    Number(resumo.vr || 0)
  ) * 100) / 100;
  const divergenciaPagamentos = Math.abs(somaPagamentos - Number(resumo.total || 0)) > 0.005;

  let status = "PRONTO";
  if (jaFechado) status = "JA_FECHADO";
  else if (pendentes.length) status = "BLOQUEADO_PENDENCIAS";
  else if (!linhasDia.length) status = "SEM_MOVIMENTO";
  else if (divergenciaPagamentos) status = "DIVERGENCIA_PAGAMENTOS";

  return JSON.stringify({
    ok: status === "PRONTO" || status === "SEM_MOVIMENTO" || status === "JA_FECHADO",
    status: status,
    data: data,
    fechado: jaFechado,
    pedidosPendentes: pendentes.length,
    divergenciaPagamentos: divergenciaPagamentos,
    somaPagamentos: somaPagamentos,
    resumo: resumo
  });
}

function obterStatusFechamentoDiario(dataReferencia) {
  return JSON.stringify(obterStatusFluxoVendasHoje_(dataReferencia));
}
function fecharDiaSeguro_(dataReferencia, origem) {
  return fecharDiaPorVendasHojeSeguro_(dataReferencia, origem || "MANUAL");
}
function fecharDiaSeguro(dataReferencia, origem) {
  return JSON.stringify(fecharDiaSeguro_(dataReferencia, origem || "MANUAL"));
}

function verificarTriggerFechamentoDiarioAutomatico_() {
  return ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === HANDLER_FECHAMENTO_DIARIO_AUTOMATICO_;
  });
}

function garantirTriggerFechamentoDiarioAutomatico_() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === HANDLER_FECHAMENTO_DIARIO_AUTOMATICO_;
  });
  if (!triggers.length) {
    ScriptApp.newTrigger(HANDLER_FECHAMENTO_DIARIO_AUTOMATICO_)
      .timeBased()
      .everyHours(1)
      .create();
    return true;
  }
  if (triggers.length > 1) {
    triggers.slice(1).forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  }
  return true;
}

function executarFechamentoDiarioAutomatico() {
  const agora = new Date();
  const fuso = Session.getScriptTimeZone();
  const hora = Number(Utilities.formatDate(agora, fuso, "H"));
  if (hora < HORA_MINIMA_FECHAMENTO_DIARIO_AUTOMATICO_) {
    return JSON.stringify({ ok: true, status: "AGUARDANDO_JANELA", hora: hora });
  }

  const hoje = formatarDataFechamentoDiario_(agora);
  const datas = {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaVendas = ss.getSheetByName("Vendas_hoje");
  if (abaVendas && abaVendas.getLastRow() > 1) {
    const valores = abaVendas.getDataRange().getValues();
    valores.slice(1).forEach(function(linha) {
      const data = normalizarDataFechamentoDiario_(linha[0]);
      if (data && data !== hoje) datas[data] = true;
    });
  }

  const referencias = Object.keys(datas).sort(function(a, b) {
    const pa = a.split("/");
    const pb = b.split("/");
    const da = new Date(Number(pa[2]), Number(pa[1]) - 1, Number(pa[0])).getTime();
    const db = new Date(Number(pb[2]), Number(pb[1]) - 1, Number(pb[0])).getTime();
    return da - db;
  });

  if (!referencias.length) {
    return JSON.stringify({ ok: true, status: "NADA_PENDENTE" });
  }

  const resultados = referencias.map(function(data) {
    try {
      return fecharDiaSeguro_(data, "AUTOMATICO");
    } catch (erro) {
      registrarErroAplicacao_("fechamento_diario_automatico", erro, { data: data });
      return { ok: false, status: "ERRO", data: data, erro: mensagemErroAplicacao_(erro, "Falha no fechamento diário automático.") };
    }
  });
  return JSON.stringify({ ok: true, status: "PROCESSADO", resultados: resultados });
}
