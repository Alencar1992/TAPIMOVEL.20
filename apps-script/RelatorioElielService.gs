// =========================================================
// P10 — SERVIÇO DO RELATÓRIO ELIEL
// Configuração financeira, indicadores, rankings, histórico e log de acesso.
// O fechamento mensal permanece isolado em FechamentoService.gs.
// =========================================================

const PLANOS_ASSINATURA_TAPIMOVEL_ = { BASIC: 50, Plus: 80, PRO: 100 };
const CAMPOS_AJUSTES_LIQUIDEZ_PDV_ = [
  "total", "qtdTapiocas", "debito", "credito", "vr",
  "taxaDebito", "taxaCredito", "taxaVr", "percentualCombustivelCarro"
];

function configLegadaRelatorioEliel_() {
  const padrao = {
    combustivelTotal: 0,
    salarioCozinha: 750,
    salarioAuxCarro: 300,
    manutencaoCarro: 200,
    percentualCompra: 70, percentualLucas: 25, percentualEliel: 5,
    taxaDebito: 2,
    taxaCredito: 5,
    taxaVr: 5.59
  };
  const salvo = obterScriptProperties_().getProperty("relatorio_eliel_config");
  try {
    const config = JSON.parse(salvo || "{}");
    if (config.combustivelTotal == null && config.combustivelCarro != null) {
      config.combustivelTotal = config.combustivelCarro;
    }
    return Object.assign(padrao, config);
  } catch (_) {
    return padrao;
  }
}

function chaveConfigLiquidez_(mes, ano) {
  if (!chaveMes_(mes, ano)) {
    throw erroApi_("INVALID_PERIOD", "Informe um mês e um ano válidos.");
  }
  return "relatorio_eliel_config_" + chaveMes_(mes, ano);
}

function custosMensaisSalvosEliel_(mes, ano) {
  const salvo = obterScriptProperties_().getProperty(chaveConfigLiquidez_(mes, ano));
  return salvo ? JSON.parse(salvo) : {};
}

function obterConfiguracoesRelatorioEliel(mes, ano) {
  const padrao = Object.assign(configLegadaRelatorioEliel_(), {
    combustivelEditado: null, salarioMotorista: null, planoAssinatura: "",
    assinaturaTapimovel: null, custosVariaveis: null
  });
  if (mes == null && ano == null) return JSON.stringify(padrao);
  return JSON.stringify(Object.assign(padrao, custosMensaisSalvosEliel_(mes, ano)));
}

function arredondarLiquidez_(valor) {
  return Math.round((valor + Math.sign(valor) * Number.EPSILON) * 100) / 100;
}

function dividirCombustivelRelatorioEliel_(valor, percentualCarro = 80) {
  const total = Math.max(0, normalizarNumero_(valor));
  const carro = arredondarLiquidez_(total * percentualCarro / 100);
  return { total: total, carro: carro, trailer: arredondarLiquidez_(total - carro) };
}

function calcularCustosLiquidez_(combustivel, config, percentualCarro = 80) {
  const total = config.combustivelEditado ?? (combustivel || config.combustivelTotal);
  const combustivelDividido = dividirCombustivelRelatorioEliel_(total, percentualCarro);
  const custos = {
    combustivelTotal: combustivelDividido.total,
    combustivelCarro: combustivelDividido.carro,
    combustivelTrailer: combustivelDividido.trailer,
    salarioCozinha: normalizarNumero_(config.salarioCozinha),
    salarioAuxCarro: normalizarNumero_(config.salarioAuxCarro),
    manutencaoCarro: normalizarNumero_(config.manutencaoCarro),
    salarioMotorista: normalizarNumero_(config.salarioMotorista),
    assinaturaTapimovel: normalizarNumero_(config.assinaturaTapimovel),
    custosVariaveis: normalizarNumero_(config.custosVariaveis)
  };
  const totalCustos = arredondarLiquidez_(custos.combustivelCarro + custos.salarioCozinha +
    custos.salarioAuxCarro + custos.manutencaoCarro + custos.salarioMotorista +
    custos.assinaturaTapimovel + custos.custosVariaveis);
  return { custos: custos, totalCustos: totalCustos };
}

function salvarConfiguracoesRelatorioEliel(configJSON, mes, ano) {
  const config = JSON.parse(configJSON || "{}");
  const props = obterScriptProperties_();
  // A assinatura anterior continua disponível para versões antigas do PDV.
  if (mes == null && ano == null) {
    const soma = normalizarNumero_(config.percentualCompra) +
      normalizarNumero_(config.percentualLucas) + normalizarNumero_(config.percentualEliel);
    if (Math.abs(soma - 100) > 0.01) {
      throw new Error("Os percentuais de Compra, Lucas e Eliel precisam somar 100%.");
    }
    props.setProperty("relatorio_eliel_config", JSON.stringify(config));
    return obterConfiguracoesRelatorioEliel();
  }

  const chave = chaveConfigLiquidez_(mes, ano);
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  try {
    const registro = custosMensaisSalvosEliel_(mes, ano);
    ["combustivelEditado", "salarioCozinha", "salarioAuxCarro", "manutencaoCarro",
      "salarioMotorista", "assinaturaTapimovel", "custosVariaveis"].forEach(function(campo) {
      if (!Object.prototype.hasOwnProperty.call(config, campo)) return;
      const valor = config[campo];
      if (valor !== null && (typeof valor !== "number" || !Number.isSafeInteger(Math.round(valor * 100)) || valor < 0)) {
        throw erroApi_("INVALID_COST", "Informe um custo válido em reais.");
      }
      registro[campo] = valor === null ? null : arredondarLiquidez_(valor);
    });
    if (Object.prototype.hasOwnProperty.call(config, "planoAssinatura")) {
      const plano = config.planoAssinatura;
      if (plano !== "" && !Object.prototype.hasOwnProperty.call(PLANOS_ASSINATURA_TAPIMOVEL_, plano)) {
        throw erroApi_("INVALID_PLAN", "Selecione um plano de assinatura válido.");
      }
      registro.planoAssinatura = plano;
      if (!Object.prototype.hasOwnProperty.call(config, "assinaturaTapimovel") && plano !== "") {
        registro.assinaturaTapimovel = PLANOS_ASSINATURA_TAPIMOVEL_[plano];
      }
    }
    if (registro.planoAssinatura && registro.assinaturaTapimovel == null) {
      registro.assinaturaTapimovel = PLANOS_ASSINATURA_TAPIMOVEL_[registro.planoAssinatura];
    }
    if (Object.prototype.hasOwnProperty.call(config, "ajustesPdv")) {
      registro.ajustesPdv = validarAjustesLiquidezPdv_(config.ajustesPdv);
    }
    props.setProperty(chave, JSON.stringify(registro));
    return obterConfiguracoesRelatorioEliel(mes, ano);
  } finally {
    lock.releaseLock();
  }
}

function validarAjustesLiquidezPdv_(valores) {
  if (!valores || typeof valores !== "object" || Array.isArray(valores)) {
    throw erroApi_("INVALID_LIQUIDEZ_INPUT", "Informe os ajustes da Liquidez Mensal.");
  }
  const ajustes = {};
  CAMPOS_AJUSTES_LIQUIDEZ_PDV_.forEach(function(campo) {
    const valor = valores[campo];
    if (valor == null) return;

    const percentual = campo.indexOf("taxa") === 0 || campo === "percentualCombustivelCarro";
    const unidades = campo === "qtdTapiocas";
    if (typeof valor !== "number" || !Number.isSafeInteger(Math.round(valor * 100)) || valor < 0 ||
        (percentual && valor > 100) || (unidades && !Number.isInteger(valor))) {
      throw erroApi_("INVALID_LIQUIDEZ_INPUT", "Use valores em reais, quantidades inteiras e percentuais de 0 a 100.");
    }
    ajustes[campo] = arredondarLiquidez_(valor);
  });
  return ajustes;
}

function obterLiquidezMensalPdv() {
  const hoje = new Date();
  const competencia = chaveMesDaDataAplicacao_(hoje).split("-");
  const ano = Number(competencia[0]), mes = Number(competencia[1]);
  const dados = JSON.parse(obterResumoMesPlanilha());
  const configuracoes = JSON.parse(obterConfiguracoesRelatorioEliel(mes, ano));
  const originais = Object.assign({}, dados, {
    taxaDebito: normalizarNumero_(configuracoes.taxaDebito),
    taxaCredito: normalizarNumero_(configuracoes.taxaCredito),
    taxaVr: normalizarNumero_(configuracoes.taxaVr),
    percentualCombustivelCarro: 80,
    combustivel: Math.max(0, normalizarNumero_(dados.combustivel || configuracoes.combustivelTotal))
  });
  const entradas = Object.assign({}, originais, configuracoes.ajustesPdv);
  const centavos = valor => Math.round(valor * 100);
  const taxas = Math.round((centavos(entradas.debito) * entradas.taxaDebito +
    centavos(entradas.credito) * entradas.taxaCredito + centavos(entradas.vr) * entradas.taxaVr) / 100) / 100;
  const subtotal = arredondarLiquidez_(entradas.total - taxas);
  const despesas = calcularCustosLiquidez_(dados.combustivel, configuracoes, entradas.percentualCombustivelCarro);
  return JSON.stringify(Object.assign(entradas, despesas, {
    mes: mes, ano: ano, taxas: taxas, subtotal: subtotal, originais: originais,
    liquido: arredondarLiquidez_(subtotal - despesas.totalCustos), configuracoes: configuracoes
  }));
}

function obterRelatorioEliel(mes, ano, catalogoJSON) {
  const ss = obterSpreadsheetAplicacao_();
  const historico = ss.getSheetByName("Historico_Diario");
  const fechamentos = ss.getSheetByName("Fechamentos_Diarios");
  const combustivel = ss.getSheetByName("Combustivel");
  const config = JSON.parse(obterConfiguracoesRelatorioEliel(mes, ano));
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
    const dados = lerAbaAnalitica_("Historico_Diario", false, ss);
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
    const dados = lerAbaAnalitica_("Fechamentos_Diarios", false, ss);
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
    const dados = lerAbaAnalitica_("Combustivel", false, ss);
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
  const taxas = arredondarLiquidez_(detalhesTaxas.reduce(function(total, item) { return total + item.valor; }, 0));
  const subtotal = arredondarLiquidez_(faturamento - taxas);
  const despesas = calcularCustosLiquidez_(combustivelMes, config);
  const liquido = arredondarLiquidez_(subtotal - despesas.totalCustos);

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
    custos: despesas.custos,
    totalCustos: despesas.totalCustos,
    liquido: liquido,
    configuracoes: config
  };
  return JSON.stringify(relatorio);
}
function obterAbaRelatorioEliel_() {
  const ss = obterSpreadsheetAplicacao_();
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
  const ss = obterSpreadsheetAplicacao_();
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
    const dados = lerAbaAnalitica_("Fechamentos_Diarios", false, ss);
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
  const ss = obterSpreadsheetAplicacao_();
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
