// =========================================================
// P10.2 — FECHAMENTO DIÁRIO SEGURO E AUTOMÁTICO
// O servidor consolida, grava, valida e somente depois limpa o dia.
// =========================================================

const ABA_FECHAMENTOS_DIARIOS_SEGURA_ = "Fechamentos_Diarios";
const ABA_TAPIOCAS_DIARIA_SEGURA_ = "Tapiocas Diária";
const HANDLER_FECHAMENTO_DIARIO_AUTOMATICO_ = "executarFechamentoDiarioAutomatico";
const COLUNA_PRINT_FECHAMENTO_DIARIO_ = 11;
const CABECALHO_PRINT_FECHAMENTO_DIARIO_ = "Comprovante SVG";

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
  const ss = obterSpreadsheetAplicacao_();
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
  const ss = obterSpreadsheetAplicacao_();
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
  const ss = obterSpreadsheetAplicacao_();
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

  const somaPagamentos = somaPagamentosFechamentoDiario_(resumo);
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
function fecharDiaSeguro(dataReferencia) {
  return JSON.stringify(fecharDiaSeguro_(dataReferencia, "MANUAL"));
}

function linhasHistoricoFechamentosDiarios_() {
  const aba = obterSpreadsheetAplicacao_().getSheetByName(ABA_FECHAMENTOS_DIARIOS_SEGURA_);
  if (!aba || aba.getLastRow() < 2) return [];
  return aba.getDataRange().getValues().slice(1).filter(function(linha) {
    const status = String(linha[8] || "").trim();
    return status === "" || status === "CONCLUIDO";
  });
}

function listarFechamentosDiarios(mes) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || ""))) {
    throw erroApi_("INVALID_MONTH", "Selecione um mês válido.");
  }
  return linhasHistoricoFechamentosDiarios_().map(function(linha) {
    return {
      data: normalizarDataFechamentoDiario_(linha[0]),
      total: numeroFechamentoDiario_(linha[1]),
      automatico: String(linha[7] || "").endsWith("AUTOMATICO")
    };
  }).filter(function(registro) {
    return chaveCronologicaFechamentoDiario_(registro.data).slice(0, 7) === mes;
  }).sort(function(a, b) {
    return chaveCronologicaFechamentoDiario_(b.data).localeCompare(chaveCronologicaFechamentoDiario_(a.data));
  });
}

function obterPrintFechamentoDiario(dataReferencia) {
  const data = normalizarDataFechamentoDiario_(dataReferencia);
  if (!data) throw erroApi_("INVALID_DATE", "Selecione uma data válida.");
  const linhas = linhasHistoricoFechamentosDiarios_().filter(function(linha) {
    return normalizarDataFechamentoDiario_(linha[0]) === data;
  });
  if (linhas.length !== 1) {
    throw erroApi_("INVALID_CLOSURE", linhas.length
      ? "Há mais de um fechamento para essa data. Revise o histórico na planilha."
      : "O fechamento dessa data não foi encontrado.");
  }
  const linha = linhas[0];
  const salvo = linha[COLUNA_PRINT_FECHAMENTO_DIARIO_ - 1];
  if (typeof salvo === "string" && salvo.startsWith("<svg xmlns=")) {
    return { data: data, svg: salvo };
  }

  const abaTap = obterSpreadsheetAplicacao_().getSheetByName(ABA_TAPIOCAS_DIARIA_SEGURA_);
  const contagens = abaTap ? linhasDaDataFechamentoDiario_(abaTap, data) : [];
  if (contagens.length > 1) {
    throw erroApi_("INVALID_CLOSURE", "Há mais de uma contagem de tapiocas para essa data.");
  }
  const campos = ["total", "dinheiro", "pix", "credito", "debito", "vr"];
  const quantidade = contagens.length ? abaTap.getRange(contagens[0], 2, 1, 1).getValues()[0][0] : "";
  const resumo = { qtdTapiocas: quantidade === "" ? null : numeroFechamentoDiario_(quantidade) };
  campos.forEach(function(campo, indice) {
    resumo[campo] = numeroFechamentoDiario_(linha[indice + 1]);
  });
  return { data: data, svg: gerarPrintFechamentoDiario_(data, resumo) };
}

function gerarPrintFechamentoDiario_(data, resumo) {
  const moeda = function(valor) {
    return numeroFechamentoDiario_(valor).toLocaleString("pt-BR", {
      style: "currency", currency: "BRL"
    });
  };
  const pagamentos = [
    ["Dinheiro", resumo.dinheiro], ["PIX", resumo.pix], ["Crédito", resumo.credito],
    ["Débito", resumo.debito], ["VR", resumo.vr]
  ];
  const linhas = pagamentos.map(function(pagamento, indice) {
    const y = 187 + indice * 29;
    return `<text x="42" y="${y}">${pagamento[0]}</text>
<text x="478" y="${y}" text-anchor="end" font-weight="700">${moeda(pagamento[1])}</text>`;
  }).join("\n");
  const quantidade = resumo.qtdTapiocas == null
    ? "Não registrada"
    : numeroFechamentoDiario_(resumo.qtdTapiocas).toLocaleString("pt-BR") + " un";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="388" viewBox="0 0 520 388">
<title>Fechamento do Dia — ${data}</title>
<rect x="1" y="1" width="518" height="386" rx="20" fill="#141c22" stroke="#35424b"/>
<g font-family="Arial, sans-serif" fill="#f2f5f7" font-size="17">
<text x="260" y="53" text-anchor="middle" font-size="24" font-weight="700">Fechamento do Dia</text>
<text x="260" y="86" text-anchor="middle" fill="#b7c5ce">Vendas registradas em ${data}</text>
<text x="260" y="137" text-anchor="middle" fill="#57cb91" font-size="32" font-weight="700">${moeda(resumo.total)}</text>
${linhas}
<path d="M42 324H478" stroke="#35424b" stroke-dasharray="3 4"/>
<text x="42" y="354" font-weight="700">Tapiocas</text>
<text x="478" y="354" text-anchor="end" font-weight="700">${quantidade}</text>
</g></svg>`;
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
  return JSON.stringify(processarFechamentoDiarioAutomatico_(new Date()));
}

function chaveCronologicaFechamentoDiario_(data) {
  return data.slice(6) + "-" + data.slice(3, 5) + "-" + data.slice(0, 2);
}

function processarFechamentoDiarioAutomatico_(agora) {
  const hoje = formatarDataFechamentoDiario_(agora);
  const [dia, mes, ano] = hoje.split("/").map(Number);
  const anterior = new Date(Date.UTC(ano, mes - 1, dia - 1)).toISOString().slice(0, 10);
  const ontem = anterior.slice(8) + "/" + anterior.slice(5, 7) + "/" + anterior.slice(0, 4);
  const chaveHoje = chaveCronologicaFechamentoDiario_(hoje);
  const datas = new Set();
  const ss = obterSpreadsheetAplicacao_();
  if (!fechamentoJaExiste_(ss, ontem)) datas.add(ontem);
  const abaVendas = ss.getSheetByName("Vendas_hoje");
  if (abaVendas && abaVendas.getLastRow() > 1) {
    const valores = abaVendas.getDataRange().getValues();
    valores.slice(1).forEach(function(linha) {
      const data = normalizarDataFechamentoDiario_(linha[0]);
      if (data && chaveCronologicaFechamentoDiario_(data) < chaveHoje) datas.add(data);
    });
  }

  const referencias = Array.from(datas).sort(function(a, b) {
    return chaveCronologicaFechamentoDiario_(a).localeCompare(chaveCronologicaFechamentoDiario_(b));
  });

  if (!referencias.length) {
    return { ok: true, status: "NADA_PENDENTE" };
  }

  const resultados = referencias.map(function(data) {
    try {
      return fecharDiaSeguro_(data, "AUTOMATICO");
    } catch (erro) {
      registrarErroAplicacao_("fechamento_diario_automatico", erro, { data: data });
      return { ok: false, status: "ERRO", data: data, erro: mensagemErroAplicacao_(erro, "Falha no fechamento diário automático.") };
    }
  });
  return { ok: resultados.every(function(resultado) { return resultado.ok; }), status: "PROCESSADO", resultados: resultados };
}
