// =========================================================
// P10 — SERVIÇO DO RELATÓRIO ELIEL
// Configuração financeira, indicadores, rankings, histórico e log de acesso.
// O fechamento mensal permanece isolado em FechamentoService.gs.
// =========================================================

function obterConfiguracoesRelatorioEliel() {
  const padrao = {
    combustivelTotal: 0,
    salarioCozinha: 750,
    salarioAuxCarro: 300,
    manutencaoCarro: 200,
    percentualCompra: 70,
    percentualLucas: 25,
    percentualEliel: 5,
    taxaDebito: 2,
    taxaCredito: 5,
    taxaVr: 5.59
  };
  const salvo = obterScriptProperties_().getProperty("relatorio_eliel_config");
  if (!salvo) return JSON.stringify(padrao);
  try {
    const configSalva = JSON.parse(salvo);
    if (configSalva.combustivelTotal == null && configSalva.combustivelCarro != null) {
      configSalva.combustivelTotal = configSalva.combustivelCarro;
    }
    return JSON.stringify(Object.assign(padrao, configSalva));
  } catch (_) {
    return JSON.stringify(padrao);
  }
}
function dividirCombustivelRelatorioEliel_(valorTotal) {
  const total = Math.max(0, normalizarNumero_(valorTotal));
  return {
    total: total,
    carro: total * 0.80,
    trailer: total * 0.20
  };
}
function salvarConfiguracoesRelatorioEliel(configJSON) {
  const config = JSON.parse(configJSON || "{}");
  const soma = normalizarNumero_(config.percentualCompra) +
    normalizarNumero_(config.percentualLucas) +
    normalizarNumero_(config.percentualEliel);
  if (Math.abs(soma - 100) > 0.01) {
    throw new Error("Os percentuais de Compra, Lucas e Eliel precisam somar 100%.");
  }
  obterScriptProperties_()
    .setProperty("relatorio_eliel_config", JSON.stringify(config));
  return obterConfiguracoesRelatorioEliel();
}
function obterRelatorioEliel(mes, ano, catalogoJSON) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const historico = ss.getSheetByName("Historico_Diario");
  const fechamentos = ss.getSheetByName("Fechamentos_Diarios");
  const combustivel = ss.getSheetByName("Combustivel");
  const config = JSON.parse(obterConfiguracoesRelatorioEliel());
  const catalogo = JSON.parse(catalogoJSON || "[]");
  const dias = {};
  const semanas = {};
  const produtos = {};
  const produtosPorDia = {};
  const produtosPorMes = {};
  const rotas = {};
  let faturamento = 0;
  let credito = 0;
  let debito = 0;
  let vr = 0;
  let totalTapiocas = 0;
  let combustivelMes = 0;
  const nomesMesesCurtos = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const periodosComparacao = [2, 1, 0].map(function(recuo) {
    const data = new Date(Number(ano), Number(mes) - 1 - recuo, 1);
    return {
      chave: chaveMes_(data.getMonth() + 1, data.getFullYear()),
      rotulo: nomesMesesCurtos[data.getMonth()],
      mes: data.getMonth() + 1,
      ano: data.getFullYear()
    };
  });
  periodosComparacao.forEach(function(periodo) {
    produtosPorMes[periodo.chave] = {};
  });

  if (historico) {
    const dados = historico.getDataRange().getDisplayValues();
    for (let i = 1; i < dados.length; i++) {
      const data = extrairData_(dados[i][1]);
      const tipo = String(dados[i][3] || "").toUpperCase();
      const produto = String(dados[i][2] || "").trim();
      const qtd = normalizarNumero_(dados[i][4]);
      if (!data || tipo !== "TAPIOCA" || !produto || qtd <= 0) continue;
      const chaveHistorico = chaveMes_(data.getMonth() + 1, data.getFullYear());
      if (produtosPorMes[chaveHistorico]) {
        produtosPorMes[chaveHistorico][produto] =
          (produtosPorMes[chaveHistorico][produto] || 0) + qtd;
      }
      if (!pertenceAoMes_(data, mes, ano)) continue;

      const diaChave = Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
      const semanaChave = "Semana " + Math.ceil(data.getDate() / 7);
      const rota = nomeDia_(data.getDay());
      dias[diaChave] = dias[diaChave] || { quantidade: 0, faturamento: 0 };
      semanas[semanaChave] = semanas[semanaChave] || { quantidade: 0, faturamento: 0 };
      dias[diaChave].quantidade += qtd;
      semanas[semanaChave].quantidade += qtd;
      produtos[produto] = (produtos[produto] || 0) + qtd;
      produtosPorDia[produto] = produtosPorDia[produto] || {};
      produtosPorDia[produto][rota] = (produtosPorDia[produto][rota] || 0) + qtd;
      rotas[rota] = rotas[rota] || { rota: rota, total: 0, tapiocas: 0, produtos: {} };
      rotas[rota].tapiocas += qtd;
      rotas[rota].produtos[produto] = (rotas[rota].produtos[produto] || 0) + qtd;
      totalTapiocas += qtd;
    }
  }

  if (fechamentos) {
    const dados = fechamentos.getDataRange().getDisplayValues();
    for (let i = 1; i < dados.length; i++) {
      const data = extrairData_(dados[i][0]);
      if (!pertenceAoMes_(data, mes, ano)) continue;
      const totalDia = normalizarNumero_(dados[i][1]);
      const rota = nomeDia_(data.getDay());
      const diaChave = Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
      const semanaChave = "Semana " + Math.ceil(data.getDate() / 7);
      faturamento += totalDia;
      credito += normalizarNumero_(dados[i][4]);
      debito += normalizarNumero_(dados[i][5]);
      vr += normalizarNumero_(dados[i][6]);
      dias[diaChave] = dias[diaChave] || { quantidade: 0, faturamento: 0 };
      semanas[semanaChave] = semanas[semanaChave] || { quantidade: 0, faturamento: 0 };
      dias[diaChave].faturamento += totalDia;
      semanas[semanaChave].faturamento += totalDia;
      rotas[rota] = rotas[rota] || { rota: rota, total: 0, tapiocas: 0, produtos: {} };
      rotas[rota].total += totalDia;
    }
  }

  if (combustivel) {
    const dados = combustivel.getDataRange().getDisplayValues();
    for (let i = 1; i < dados.length; i++) {
      const data = extrairData_(dados[i][0]);
      if (pertenceAoMes_(data, mes, ano)) combustivelMes += normalizarNumero_(dados[i][1]);
    }
  }

  const rankingProdutos = Object.keys(produtos).map(function(nome) {
    const porDia = produtosPorDia[nome] || {};
    const melhorDia = Object.keys(porDia).sort(function(a, b) { return porDia[b] - porDia[a]; })[0] || "-";
    return { produto: nome, quantidade: produtos[nome], melhorDia: melhorDia };
  }).sort(function(a, b) { return b.quantidade - a.quantidade; });

  const catalogoTapiocas = catalogo
    .filter(function(item) { return item && item.tipo === "tapioca" && String(item.nome || "").indexOf("Avulso:") !== 0; })
    .map(function(item) { return String(item.nome || "").trim(); })
    .filter(function(nome, indice, lista) { return nome && lista.indexOf(nome) === indice; });
  const menosVendidas = catalogoTapiocas.map(function(nome) {
    const quantidade = produtos[nome] || 0;
    const comparativo = periodosComparacao.map(function(periodo) {
      return produtosPorMes[periodo.chave][nome] || 0;
    });
    const anterior = comparativo[1];
    const atual = comparativo[2];
    let tendencia = "estavel";
    if (atual === 0) tendencia = "sem-vendas";
    else if (atual > anterior) tendencia = "cresceu";
    else if (atual < anterior) tendencia = "caiu";
    let insight = "Revisar posição no cardápio e oferecer em combinação.";
    if (quantidade === 0) insight = "Sem vendas: testar foto, destaque e oferta por tempo limitado.";
    else if (quantidade <= 2) insight = "Baixa saída: oferecer como sugestão do dia e revisar a descrição.";
    return {
      produto: nome,
      quantidade: quantidade,
      comparativo: comparativo,
      tendencia: tendencia,
      insight: insight
    };
  }).sort(function(a, b) { return a.quantidade - b.quantidade; }).slice(0, 5);

  const rankingRotas = Object.keys(rotas).map(function(nome) {
    const rota = rotas[nome];
    const top = Object.keys(rota.produtos).sort(function(a, b) {
      return rota.produtos[b] - rota.produtos[a];
    })[0] || "-";
    return {
      rota: rota.rota,
      total: rota.total,
      tapiocas: rota.tapiocas,
      tapiocaMaisVendida: top,
      participacao: faturamento > 0 ? rota.total / faturamento * 100 : 0
    };
  }).sort(function(a, b) { return b.total - a.total; });

  const detalhesTaxas = [
    {
      forma: "Crédito",
      vendas: credito,
      percentual: normalizarNumero_(config.taxaCredito),
      valor: credito * normalizarNumero_(config.taxaCredito) / 100
    },
    {
      forma: "Débito",
      vendas: debito,
      percentual: normalizarNumero_(config.taxaDebito),
      valor: debito * normalizarNumero_(config.taxaDebito) / 100
    },
    {
      forma: "VR",
      vendas: vr,
      percentual: normalizarNumero_(config.taxaVr),
      valor: vr * normalizarNumero_(config.taxaVr) / 100
    }
  ];
  const taxas = detalhesTaxas.reduce(function(total, item) { return total + item.valor; }, 0);
  const subtotal = faturamento - taxas;
  const combustivelRateado = dividirCombustivelRelatorioEliel_(
    combustivelMes || config.combustivelTotal
  );
  const custos = {
    combustivelTotal: combustivelRateado.total,
    combustivelCarro: combustivelRateado.carro,
    combustivelTrailer: combustivelRateado.trailer,
    salarioCozinha: normalizarNumero_(config.salarioCozinha),
    salarioAuxCarro: normalizarNumero_(config.salarioAuxCarro),
    manutencaoCarro: normalizarNumero_(config.manutencaoCarro)
  };
  const totalCustos = custos.combustivelCarro + custos.salarioCozinha +
    custos.salarioAuxCarro + custos.manutencaoCarro;
  const liquido = subtotal - totalCustos;
  const distribuicao = {
    compra: Math.max(0, liquido) * normalizarNumero_(config.percentualCompra) / 100,
    lucas: Math.max(0, liquido) * normalizarNumero_(config.percentualLucas) / 100,
    eliel: Math.max(0, liquido) * normalizarNumero_(config.percentualEliel) / 100
  };

  const chave = chaveMes_(mes, ano);
  const relatorio = {
    mes: Number(mes),
    ano: Number(ano),
    chave: chave,
    totalTapiocas: totalTapiocas,
    porDia: Object.keys(dias).sort(function(a, b) {
      return extrairData_(a) - extrairData_(b);
    }).map(function(dia) {
      return { dia: dia, quantidade: dias[dia].quantidade, faturamento: dias[dia].faturamento };
    }),
    porSemana: Object.keys(semanas).sort().map(function(semana) {
      return { semana: semana, quantidade: semanas[semana].quantidade, faturamento: semanas[semana].faturamento };
    }),
    rankingProdutos: rankingProdutos,
    top3: rankingProdutos.slice(0, 3),
    menosVendidas: menosVendidas,
    rotas: rankingRotas,
    melhorRota: rankingRotas[0] || null,
    faturamento: faturamento,
    taxas: taxas,
    detalhesTaxas: detalhesTaxas,
    mesesComparacao: periodosComparacao,
    subtotal: subtotal,
    custos: custos,
    totalCustos: totalCustos,
    liquido: liquido,
    distribuicao: distribuicao,
    configuracoes: config
  };
  return JSON.stringify(relatorio);
}
function obterAbaRelatorioEliel_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName("Relatorio Eliel");
  if (!aba) {
    aba = ss.insertSheet("Relatorio Eliel");
    aba.appendRow([
      "Mês", "Fechado em", "Faturamento", "Taxas", "Subtotal", "Combustível",
      "Salário Cozinha", "Salário Aux. Carro", "Manutenção Carro", "Líquido",
      "Compra", "Lucas", "Eliel", "Tapiocas", "Melhor Rota", "Top 3",
      "Cinco Menos Vendidas", "Dados Completos"
    ]);
    aba.getRange(1, 1, 1, 18).setFontWeight("bold").setBackground("#ff6b5f").setFontColor("#ffffff");
    aba.setFrozenRows(1);
  }
  if (aba.getLastColumn() < 19) {
    aba.getRange(1, 19).setValue("Responsável");
  }
  return aba;
}
function registrarAcessoRelatorioEliel(mes, ano) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName("Log Relatorio Eliel");
  if (!aba) {
    aba = ss.insertSheet("Log Relatorio Eliel");
    aba.appendRow(["Data e hora", "Evento", "Mês referência"]);
    aba.getRange("A1:C1").setFontWeight("bold").setBackground("#333333").setFontColor("#ffffff");
  }
  aba.appendRow([new Date(), "ACESSO AO RELATÓRIO", chaveMes_(mes, ano)]);

  const anterior = new Date(Number(ano), Number(mes) - 2, 1);
  const chaveAnterior = chaveMes_(anterior.getMonth() + 1, anterior.getFullYear());
  obterAbaRelatorioEliel_();
  const chavesFechadas = obterChavesFechamentosExistentes_();
  let temDadosAnterior = false;
  const fechamentos = ss.getSheetByName("Fechamentos_Diarios");
  if (fechamentos) {
    const dados = fechamentos.getDataRange().getDisplayValues();
    temDadosAnterior = dados.slice(1).some(function(linha) {
      return pertenceAoMes_(extrairData_(linha[0]), anterior.getMonth() + 1, anterior.getFullYear()) &&
        normalizarNumero_(linha[1]) > 0;
    });
  }
  return JSON.stringify({
    mesAnteriorPendente: temDadosAnterior && !chavesFechadas[chaveAnterior],
    chaveAnterior: chaveAnterior
  });
}
function obterHistoricoVendasEliel(dataInicial, dataFinal) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Historico_Diario");
  const cabecalhoPadrao = [
    "ID Pedido", "Data e Hora", "Produto", "Tipo", "Qtd", "Preço Unit.",
    "Total Pago", "Forma Pagamento", "Observações"
  ];
  if (!aba || aba.getLastRow() < 2) {
    return JSON.stringify({ cabecalho: cabecalhoPadrao, linhas: [] });
  }
  const inicio = extrairData_(dataInicial);
  const fim = extrairData_(dataFinal);
  if (!inicio || !fim) throw new Error("Informe um período válido para consultar o histórico.");
  inicio.setHours(0, 0, 0, 0);
  fim.setHours(23, 59, 59, 999);
  if (inicio > fim) throw new Error("A data inicial não pode ser posterior à data final.");
  const intervalo = aba.getDataRange();
  const valores = intervalo.getValues();
  const exibidos = intervalo.getDisplayValues();
  const cabecalho = exibidos[0].slice(0, 9);
  const linhas = [];
  for (let i = 1; i < valores.length; i++) {
    const data = extrairData_(valores[i][1] || exibidos[i][1]);
    if (!data || data < inicio || data > fim) continue;
    linhas.push([
      exibidos[i][0],
      Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss"),
      exibidos[i][2], exibidos[i][3], normalizarNumero_(valores[i][4]),
      normalizarNumero_(valores[i][5]), normalizarNumero_(valores[i][6]),
      exibidos[i][7], exibidos[i][8]
    ]);
  }
  linhas.sort(function(a, b) { return extrairData_(a[1]) - extrairData_(b[1]); });
  return JSON.stringify({ cabecalho: cabecalho.length === 9 ? cabecalho : cabecalhoPadrao, linhas: linhas });
}
