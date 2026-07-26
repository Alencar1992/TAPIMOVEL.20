// =========================================================
// 1. PORTA DE ENTRADA DO APLICATIVO (ROTEADOR)
// =========================================================
function doGet(e) {
  if (e.parameter && e.parameter.action) {
    return responderApi_(executarAcaoApi_(e.parameter.action, []));
  }

  if (e.parameter && e.parameter.modo === 'cliente') {
    return HtmlService.createHtmlOutputFromFile('Cliente')
      .setTitle('Cardápio - Expresso Tapiocaria')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('projeto_melhoria_TAPIMOVEL_2.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =========================================================
// 2. SISTEMA DE NUVEM (BLINDADO COM LOCKSERVICE)
// =========================================================
function carregarDadosNuvem() {
  return PropertiesService.getScriptProperties().getProperty("pdv_vendas_ativas") || "[]";
}

function salvarNuvemCompleta(historicoJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    PropertiesService.getScriptProperties().setProperty("pdv_vendas_ativas", historicoJSON);
  } catch(e) {
    console.error("Erro salvarNuvemCompleta: ", e);
  } finally {
    lock.releaseLock();
  }
}

function salvarVendaRealTime(pedidoJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const p = JSON.parse(pedidoJSON);
    const c = PropertiesService.getScriptProperties();
    let a = JSON.parse(c.getProperty("pdv_vendas_ativas") || "[]");
    a.push(p);
    c.setProperty("pdv_vendas_ativas", JSON.stringify(a));
  } catch (e) {
    console.error("Erro salvarVendaRealTime: ", e);
  } finally {
    lock.releaseLock();
  }
}

function atualizarVendaRealTime(pedidoJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const p = JSON.parse(pedidoJSON);
    const c = PropertiesService.getScriptProperties();
    let a = JSON.parse(c.getProperty("pdv_vendas_ativas") || "[]");
    const i = a.findIndex(x => x.numero == p.numero);
    if (i !== -1) {
      a[i] = p;
      c.setProperty("pdv_vendas_ativas", JSON.stringify(a));
    }
  } catch (e) {
    console.error("Erro atualizarVendaRealTime: ", e);
  } finally {
    lock.releaseLock();
  }
}

function excluirVendaRealTime(num) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const c = PropertiesService.getScriptProperties();
    let a = JSON.parse(c.getProperty("pdv_vendas_ativas") || "[]");
    const n = a.filter(x => x.numero != num);
    c.setProperty("pdv_vendas_ativas", JSON.stringify(n));
  } catch (e) {
    console.error("Erro excluirVendaRealTime: ", e);
  } finally {
    lock.releaseLock();
  }
}

// =========================================================
// 3. MOTOR DE CACHE DAS PLANILHAS (BLINDADO COM LOCK)
// =========================================================
function removerDaBaseDeVendasBackend(idPedido) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Base de Vendas");
    if (!aba) return;
    const d = aba.getDataRange().getValues();
    for (let i = d.length - 1; i >= 1; i--) {
      if (d[i][0] == "#" + idPedido || d[i][0] == idPedido) {
        aba.deleteRow(i + 1);
      }
    }
  } catch(e) {
    console.error("Erro removerDaBaseDeVendasBackend: ", e);
  } finally {
    lock.releaseLock();
  }
}

function lancarPedidoPlanilha(pedidoJSON) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const p = JSON.parse(pedidoJSON);
    let aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Base de Vendas");
    if(!aba) {
      aba = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Base de Vendas");
      aba.appendRow(["ID Pedido", "Hora Lançamento", "Produto", "Tipo", "Qtd", "Preço Unit.", "Total Item", "Status", "Observações"]);
      aba.getRange("A1:I1").setFontWeight("bold").setBackground("#fff2cc");
    }
    let matrizItens = [];
    p.itens.forEach(i => {
      matrizItens.push(["#" + p.numero, p.hora, i.nome, i.tipo.toUpperCase(), i.quantidade, i.preco, (i.quantidade * i.preco), "AGUARDANDO FINALIZAÇÃO", i.obs || "-"]);
    });
    if (matrizItens.length > 0) {
      aba.getRange(aba.getLastRow() + 1, 1, matrizItens.length, matrizItens[0].length).setValues(matrizItens);
    }
  } catch(e) {
    console.error("Erro lancarPedidoPlanilha: ", e);
  } finally {
    lock.releaseLock();
  }
}

function moverParaHistorico(pedidoJSON) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const p = JSON.parse(pedidoJSON);
    let aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Historico_Diario");
    if(!aba) {
      aba = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Historico_Diario");
      aba.appendRow(["ID Pedido", "Data e Hora", "Produto", "Tipo", "Qtd", "Preço Unit.", "Total Pago", "Forma Pagamento", "Observações"]);
      aba.getRange("A1:I1").setFontWeight("bold").setBackground("#d9ead3");
    }
    let matrizItens = [];
    p.itens.forEach(i => {
      matrizItens.push(["#" + p.numero, p.dataExibicao, i.nome, i.tipo.toUpperCase(), i.quantidade, i.preco, (i.quantidade * i.preco), p.formaPagamento, i.obs || "-"]);
    });
    if (matrizItens.length > 0) {
      aba.getRange(aba.getLastRow() + 1, 1, matrizItens.length, matrizItens[0].length).setValues(matrizItens);
    }
  } catch(e) {
    console.error("Erro moverParaHistorico: ", e);
  } finally {
    lock.releaseLock();
  }
}

function moverParaCancelados(pedidoJSON) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const p = JSON.parse(pedidoJSON);
    let aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Pedidos Cancelados");
    if(!aba) {
      aba = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Pedidos Cancelados");
      aba.appendRow(["ID Pedido", "Data Cancelamento", "Produto", "Qtd", "Total Perdido"]);
      aba.getRange("A1:E1").setFontWeight("bold").setBackground("#f4cccc");
    }
    let matrizItens = [];
    p.itens.forEach(i => {
      matrizItens.push(["#" + p.numero, p.dataExibicao, i.nome, i.quantidade, (i.quantidade * i.preco)]);
    });
    if (matrizItens.length > 0) {
      aba.getRange(aba.getLastRow() + 1, 1, matrizItens.length, matrizItens[0].length).setValues(matrizItens);
    }
  } catch(e) {
    console.error("Erro moverParaCancelados: ", e);
  } finally {
    lock.releaseLock();
  }
}

function reabrirPedidoBackend(pedidoJSON) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const p = JSON.parse(pedidoJSON);
    const idPedido = "#" + p.numero;
    const plan = SpreadsheetApp.getActiveSpreadsheet();
    const abaHist = plan.getSheetByName("Historico_Diario");
    if (abaHist) {
      const dHist = abaHist.getDataRange().getValues();
      for (let i = dHist.length - 1; i >= 1; i--) {
        if (dHist[i][0] == idPedido || dHist[i][0] == p.numero) {
          abaHist.deleteRow(i + 1);
        }
      }
    }
  } catch(e) {
    console.error("Erro reabrirPedidoBackend: ", e);
  } finally {
    lock.releaseLock();
  }
  lancarPedidoPlanilha(pedidoJSON);
}

// =========================================================
// 1. BUSCAR DADOS DO MÊS (Incluindo Tapiocas e Taxas)
// =========================================================
function obterResumoMesPlanilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaFechamentos = ss.getSheetByName("Fechamentos_Diarios");
  const abaTapiocas = ss.getSheetByName("Tapiocas Diária");
  const abaCombustivel = ss.getSheetByName("Combustivel");

  const hoje = new Date();
  const mesAtualStr = ("0" + (hoje.getMonth() + 1)).slice(-2);
  const anoAtualStr = hoje.getFullYear().toString();

  let totalFaturamento = 0;
  let totalCredito = 0;
  let totalDebito = 0;
  let totalVR = 0;

  let totalTapiocas = 0;
  let totalCombustivel = 0;

  if (abaFechamentos) {
    const dados = abaFechamentos.getDataRange().getDisplayValues();
    for (let i = 1; i < dados.length; i++) {
      let dataPlan = dados[i][0];
      let match = String(dataPlan).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        let m = ("0" + match[2]).slice(-2);
        let a = match[3];
        if (m === mesAtualStr && a === anoAtualStr) {
          totalFaturamento += parseFloat(String(dados[i][1]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
          totalCredito += parseFloat(String(dados[i][4]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
          totalDebito += parseFloat(String(dados[i][5]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
          totalVR += parseFloat(String(dados[i][6]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
        }
      }
    }
  }

  if (abaTapiocas) {
    const dadosTap = abaTapiocas.getDataRange().getDisplayValues();
    for (let i = 1; i < dadosTap.length; i++) {
      let dataPlan = dadosTap[i][0];
      let match = String(dataPlan).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        let m = ("0" + match[2]).slice(-2);
        let a = match[3];
        if (m === mesAtualStr && a === anoAtualStr) {
          let qtd = parseInt(dadosTap[i][1], 10) || 0;
          totalTapiocas += qtd;
        }
      }
    }
  }

  if (abaCombustivel) {
    const dadosComb = abaCombustivel.getDataRange().getDisplayValues();
    for (let j = 1; j < dadosComb.length; j++) {
      let dataPlan = dadosComb[j][0];
      let match = String(dataPlan).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        let m = ("0" + match[2]).slice(-2);
        let a = match[3];
        if (m === mesAtualStr && a === anoAtualStr) {
          let valor = parseFloat(String(dadosComb[j][1]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
          totalCombustivel += valor;
        }
      }
    }
  }

  return JSON.stringify({
    total: totalFaturamento,
    credito: totalCredito,
    debito: totalDebito,
    vr: totalVR,
    combustivel: totalCombustivel,
    qtdTapiocas: totalTapiocas
  });
}

// =========================================================
// 2. FECHAR MÊS E SALVAR
// =========================================================
function fecharMesESalvarDrive(pacoteJson) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const pacote = JSON.parse(pacoteJson);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let abaMensal = ss.getSheetByName("Fechamentos_Mensais");

    if (!abaMensal) {
      abaMensal = ss.insertSheet("Fechamentos_Mensais");
      abaMensal.appendRow(["Mês Referência", "Faturamento Bruto", "Tapiocas Vendidas", "Custo Material", "Lucro Lucas (95%)", "Lucro Eliel (5%)"]);
      abaMensal.getRange("A1:F1").setFontWeight("bold").setBackground("#cfe2f3");
    }

    abaMensal.appendRow([
      pacote.mesReferencia,
      pacote.totalGeral,
      pacote.qtdTapiocas,
      pacote.material,
      pacote.lucroLucas,
      pacote.lucroEliel
    ]);

    return "OK";
  } catch (e) {
    return "Erro no servidor: " + e.toString();
  } finally {
    lock.releaseLock();
  }
}

// =========================================================
// 6. ESTIMATIVA DE SALÁRIO
// =========================================================
function calcularEstimativaSalarioLucas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const mesStr = ("0" + (mesAtual + 1)).slice(-2);

  let diasFolga = [];
  const abaFolga = ss.getSheetByName("Dias_Nao_Trabalhados");
  if(abaFolga) {
    const dadosF = abaFolga.getDataRange().getDisplayValues();
    for(let f = 1; f < dadosF.length; f++) {
      diasFolga.push(dadosF[f][0]);
    }
  }

  const feriadosFixos = ["01/01", "21/04", "01/05", "07/09", "12/10", "02/11", "15/11", "25/12"];

  let totalDiasUteisMes = 0;
  let diasPassados = 0;
  const hojeDia = hoje.getDate();
  const ultimoDia = new Date(anoAtual, mesAtual + 1, 0).getDate();

  for (let d = 1; d <= ultimoDia; d++) {
    const dt = new Date(anoAtual, mesAtual, d);
    const isFimDeSemana = (dt.getDay() === 0 || dt.getDay() === 6);
    const dStr = ("0" + d).slice(-2) + "/" + mesStr + "/" + anoAtual;
    const dFeriadoFixo = ("0" + d).slice(-2) + "/" + mesStr;
    const isFeriado = (feriadosFixos.indexOf(dFeriadoFixo) !== -1) || (diasFolga.indexOf(dStr) !== -1);

    if (!isFimDeSemana && !isFeriado) {
      totalDiasUteisMes++;
      if (d <= hojeDia) {
        diasPassados++;
      }
    }
  }

  const diasRestantes = totalDiasUteisMes - diasPassados;

  let faturamentoBrutoAcumulado = 0;
  let totalCredito = 0;
  let totalDebito = 0;
  let totalVR = 0;

  const abaFech = ss.getSheetByName("Fechamentos_Diarios");
  if (abaFech) {
    const dados = abaFech.getDataRange().getDisplayValues();
    for (let i = 1; i < dados.length; i++) {
      let match = dados[i][0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match && match[2] === mesStr && match[3] === anoAtual.toString()) {
        faturamentoBrutoAcumulado += parseFloat(dados[i][1].replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
        totalCredito += parseFloat(String(dados[i][4]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
        totalDebito += parseFloat(String(dados[i][5]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
        totalVR += parseFloat(String(dados[i][6]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
      }
    }
  }

  let gastoCombustivelAcumulado = 0;
  const abaComb = ss.getSheetByName("Combustivel");
  if (abaComb) {
    const dadosC = abaComb.getDataRange().getDisplayValues();
    for (let j = 1; j < dadosC.length; j++) {
      let matchC = dadosC[j][0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (matchC && matchC[2] === mesStr && matchC[3] === anoAtual.toString()) {
        gastoCombustivelAcumulado += parseFloat(dadosC[j][1].replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
      }
    }
  }

  // Descobre a taxa média do mês para aplicar na projeção futura
  const taxasAcumuladas = (totalCredito * 0.05) + (totalDebito * 0.02) + (totalVR * 0.0559);
  const taxaMedia = faturamentoBrutoAcumulado > 0 ? (taxasAcumuladas / faturamentoBrutoAcumulado) : 0;

  const mediaBrutaDiaria = diasPassados > 0 ? (faturamentoBrutoAcumulado / diasPassados) : 0;
  const faturamentoProjetado = faturamentoBrutoAcumulado + (mediaBrutaDiaria * diasRestantes);

  function calcularLucroLucas(bruto, combustivel, isProjetado) {
    // 1. Tira as Taxas
    const taxas = isProjetado ? (bruto * taxaMedia) : taxasAcumuladas;
    const subtotal = bruto - taxas;

    // 2. Tira os Custos Fixos
    const combustivelDescontado = combustivel * 0.80; // Projeção fixa em 80%
    const salariosEcustos = 750 + 300 + 200; // Cozinha, Auxiliar e Manutenção Carro

    // 3. Aplica o Rateio
    const baseRateio = subtotal - combustivelDescontado - salariosEcustos;
    return Math.max(0, baseRateio * 0.25); // 25% Lucas
  }

  return JSON.stringify({
    mes: ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][mesAtual],
    diasUteisTotal: totalDiasUteisMes,
    diasUteisPassados: diasPassados,
    diasUteisRestantes: diasRestantes,
    mediaDiaria: mediaBrutaDiaria,
    lucasAtual: calcularLucroLucas(faturamentoBrutoAcumulado, gastoCombustivelAcumulado, false),
    lucasProjetado: calcularLucroLucas(faturamentoProjetado, gastoCombustivelAcumulado, true)
  });
}

// =========================================================
// 7. REGISTRO DE DIAS NÃO TRABALHADOS
// =========================================================
function registrarDiaSemTrabalhoPlanilha(dadosJSON) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const d = JSON.parse(dadosJSON);
    const plan = SpreadsheetApp.getActiveSpreadsheet();
    let aba = plan.getSheetByName("Dias_Nao_Trabalhados");
    if (!aba) {
      aba = plan.insertSheet("Dias_Nao_Trabalhados");
      aba.appendRow(["Data", "Motivo"]);
      aba.getRange("A1:B1").setFontWeight("bold").setBackground("#ea9999");
    }
    aba.appendRow([d.data, d.motivo]);
    return "OK";
  } catch (erro) {
    return "ERRO: " + erro.message;
  } finally {
    lock.releaseLock();
  }
}

function buscarFolgasBackend(mes, ano) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Dias_Nao_Trabalhados");
  if (!sheet) return JSON.stringify([]);

  const data = sheet.getDataRange().getValues();
  let resultados = [];

  for (let i = 1; i < data.length; i++) {
    let dataPlanilha = data[i][0];
    let motivo = data[i][1];

    if (dataPlanilha) {
      let dataFormatada = "";
      let mesPlanilha = "";
      let anoPlanilha = "";

      if (dataPlanilha instanceof Date) {
        let dia = ("0" + dataPlanilha.getDate()).slice(-2);
        let m = ("0" + (dataPlanilha.getMonth() + 1)).slice(-2);
        let a = dataPlanilha.getFullYear();
        dataFormatada = dia + "/" + m + "/" + a;
        mesPlanilha = m;
        anoPlanilha = a.toString();
      } else {
        dataFormatada = dataPlanilha.toString();
        let partes = dataFormatada.split("/");
        if(partes.length === 3) {
          mesPlanilha = partes[1];
          anoPlanilha = partes[2];
        }
      }

      if (mesPlanilha === mes && anoPlanilha === ano) {
        resultados.push({
          data: dataFormatada,
          motivo: motivo || "Sem motivo registrado"
        });
      }
    }
  }
  return JSON.stringify(resultados.reverse());
}

// =========================================================
// 8. CONTROLE DE COMBUSTÍVEL
// =========================================================
function salvarCombustivelPlanilha(dadosJSON) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const d = JSON.parse(dadosJSON);
    const plan = SpreadsheetApp.getActiveSpreadsheet();
    let aba = plan.getSheetByName("Combustivel");

    if (!aba) {
      aba = plan.insertSheet("Combustivel");
      aba.appendRow(["Data", "Valor (R$)", "Litros"]);
      aba.getRange("A1:C1").setFontWeight("bold").setBackground("#fce5cd");
    }

    aba.appendRow([d.data, d.valor, d.litros]);
    return "OK";
  } catch (erro) {
    return "ERRO: " + erro.message;
  } finally {
    lock.releaseLock();
  }
}

function buscarHistoricoCombustivel(mes, ano) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Combustivel");
  if (!sheet) return JSON.stringify({ itens: [], totalGasto: 0, totalLitros: 0 });

  const data = sheet.getDataRange().getValues();
  let resultados = [];
  let totalGasto = 0;
  let totalLitros = 0;

  for (let i = 1; i < data.length; i++) {
    let dataPlan = data[i][0];
    let valor = parseFloat(String(data[i][1]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
    let litros = parseFloat(String(data[i][2]).replace(',', '.')) || 0;

    if (dataPlan) {
      let dataFmt = ""; let mesP = ""; let anoP = "";
      if (dataPlan instanceof Date) {
        dataFmt = ("0" + dataPlan.getDate()).slice(-2) + "/" + ("0" + (dataPlan.getMonth() + 1)).slice(-2) + "/" + dataPlan.getFullYear();
        mesP = ("0" + (dataPlan.getMonth() + 1)).slice(-2);
        anoP = dataPlan.getFullYear().toString();
      } else {
        dataFmt = String(dataPlan);
        let p = dataFmt.split("/");
        if(p.length === 3) { mesP = p[1]; anoP = p[2]; }
      }

      if (mesP === mes && anoP === ano) {
        resultados.push({ data: dataFmt, valor: valor, litros: litros });
        totalGasto += valor;
        totalLitros += litros;
      }
    }
  }
  return JSON.stringify({ itens: resultados.reverse(), totalGasto: totalGasto, totalLitros: totalLitros });
}

// =========================================================
// 9. INTELIGÊNCIA: RANKING DE ROTAS
// =========================================================
function buscarRankingRotasBackend(mes, ano) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Fechamentos_Diarios");
  if (!sheet) return JSON.stringify([]);

  const data = sheet.getDataRange().getDisplayValues();
  let rotas = {
    "Segunda-feira": 0, "Terça-feira": 0, "Quarta-feira": 0,
    "Quinta-feira": 0, "Sexta-feira": 0, "Sábado": 0, "Domingo": 0
  };

  for (let i = 1; i < data.length; i++) {
    let dataPlan = data[i][0];
    let valor = parseFloat(String(data[i][1]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;

    if (dataPlan && valor > 0) {
      let m = "", a = "", diaSemana = -1;
      let match = String(dataPlan).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        m = ("0" + match[2]).slice(-2);
        a = match[3];
        let dia = parseInt(match[1], 10);
        let mesNum = parseInt(match[2], 10) - 1;
        let anoNum = parseInt(match[3], 10);

        let tempDate = new Date(anoNum, mesNum, dia);
        diaSemana = tempDate.getDay();
      }

      if (m === mes && a === ano) {
        if(diaSemana === 1) rotas["Segunda-feira"] += valor;
        if(diaSemana === 2) rotas["Terça-feira"] += valor;
        if(diaSemana === 3) rotas["Quarta-feira"] += valor;
        if(diaSemana === 4) rotas["Quinta-feira"] += valor;
        if(diaSemana === 5) rotas["Sexta-feira"] += valor;
        if(diaSemana === 6) rotas["Sábado"] += valor;
        if(diaSemana === 0) rotas["Domingo"] += valor;
      }
    }
  }

  let ranking = [];
  for (let r in rotas) {
    if (rotas[r] > 0) ranking.push({ rota: r, total: rotas[r] });
  }
  ranking.sort((a, b) => b.total - a.total);

  return JSON.stringify(ranking);
}

// =========================================================
// 10. INTELIGÊNCIA: TOP TAPIOCAS
// =========================================================
function buscarTopProdutosBackend(mes, ano) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Historico_Diario");
  if (!sheet) return JSON.stringify([]);

  const data = sheet.getDataRange().getDisplayValues();
  let produtosMap = {};

  for (let i = 1; i < data.length; i++) {
    let dataPlan = data[i][1];
    let nomeProduto = data[i][2];
    let qtd = parseFloat(data[i][4]) || 0;
    let totalLinha = parseFloat(String(data[i][6]).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;

    if (dataPlan && nomeProduto && qtd > 0) {
      let m = "", a = "";
      let match = String(dataPlan).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);

      if (match) {
        m = ("0" + match[2]).slice(-2);
        a = match[3];
      }

      if (m === mes && a === ano) {
        if (!produtosMap[nomeProduto]) {
          produtosMap[nomeProduto] = { produto: nomeProduto, quantidade: 0, totalArrecadado: 0 };
        }
        produtosMap[nomeProduto].quantidade += qtd;
        produtosMap[nomeProduto].totalArrecadado += totalLinha;
      }
    }
  }

  let ranking = [];
  for (let p in produtosMap) {
    ranking.push(produtosMap[p]);
  }

  ranking.sort((a, b) => {
    if (b.quantidade === a.quantidade) {
        return b.totalArrecadado - a.totalArrecadado;
    }
    return b.quantidade - a.quantidade;
  });

  return JSON.stringify(ranking);
}

// =========================================================
// 11. ESPELHO DA PLANILHA
// =========================================================
function buscarDadosEspelhoBackend(nomeAba) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(nomeAba);

    if (!sheet) {
      throw new Error("A aba '" + nomeAba + "' não foi encontrada na planilha.");
    }

    const dados = sheet.getDataRange().getDisplayValues();

    if (dados.length === 0) {
      return JSON.stringify([]);
    }

    return JSON.stringify(dados);
  } catch (e) {
    throw new Error("Erro no Espelho: " + e.message);
  }
}

// =========================================================
// SALVAR FECHAMENTO DO DIA NA PLANILHA
// =========================================================
function salvarFechamentoDiaPlanilha(resumoJSON) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const resumo = JSON.parse(resumoJSON);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    let abaFech = ss.getSheetByName("Fechamentos_Diarios");
    if (abaFech) {
      abaFech.appendRow([
        resumo.data,
        resumo.total,
        resumo.dinheiro,
        resumo.pix,
        resumo.credito,
        resumo.debito,
        resumo.vr
      ]);
    }

    let abaTap = ss.getSheetByName("Tapiocas Diária");
    if (abaTap) {
      abaTap.appendRow([
        resumo.data,
        resumo.qtdTapiocas
      ]);
    }

    return "OK";
  } catch (e) {
    return "Erro ao salvar no servidor: " + e.toString();
  } finally {
    lock.releaseLock();
  }
}

// =========================================================
// EXCLUIR CONTADOR DE HOJE
// =========================================================
function excluirContadorTapiocasHoje(dataHoje) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName("Tapiocas Diária");
    if (!aba) return;

    const dados = aba.getDataRange().getValues();
    for (let i = dados.length - 1; i >= 1; i--) {
      if (Utilities.formatDate(new Date(dados[i][0]), "GMT-3", "dd/MM/yyyy") === dataHoje) {
        aba.deleteRow(i + 1);
      }
    }
  } catch(e) {
    console.error("Erro excluirContadorTapiocasHoje: ", e);
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    return responderApi_(executarAcaoApi_(body.action, body.args || []));
  } catch (erro) {
    return responderApi_({
      ok: false,
      error: erro && erro.message ? erro.message : String(erro)
    });
  }
}

function salvarMultiplosFechamentos(resumosJSON) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
    const resumos = JSON.parse(resumosJSON);
    if (!Array.isArray(resumos) || resumos.length === 0) return "OK";

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName("Fechamentos_Diarios");
    if (!aba) throw new Error("A aba 'Fechamentos_Diarios' não foi encontrada.");

    const existentes = aba.getLastRow() > 1
      ? aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues().flat()
      : [];
    const linhas = resumos
      .filter(function(resumo) { return existentes.indexOf(String(resumo.data)) === -1; })
      .map(function(resumo) {
        return [
          resumo.data,
          Number(resumo.total) || 0,
          Number(resumo.dinheiro) || 0,
          Number(resumo.pix) || 0,
          Number(resumo.credito) || 0,
          Number(resumo.debito) || 0,
          Number(resumo.vr) || 0
        ];
      });

    if (linhas.length) {
      aba.getRange(aba.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
    }
    return "OK";
  } finally {
    lock.releaseLock();
  }
}

function executarAcaoApi_(action, args) {
  const acoesPublicas = [
    "carregarDadosNuvem",
    "registrarPedidoOnline"
  ];

  const acoesAdministrativas = [
    "salvarNuvemCompleta",
    "salvarVendaRealTime",
    "atualizarVendaRealTime",
    "excluirVendaRealTime",
    "removerDaBaseDeVendasBackend",
    "lancarPedidoPlanilha",
    "moverParaHistorico",
    "moverParaCancelados",
    "reabrirPedidoBackend",
    "obterResumoMesPlanilha",
    "fecharMesESalvarDrive",
    "calcularEstimativaSalarioLucas",
    "registrarDiaSemTrabalhoPlanilha",
    "buscarFolgasBackend",
    "salvarCombustivelPlanilha",
    "buscarHistoricoCombustivel",
    "buscarRankingRotasBackend",
    "buscarTopProdutosBackend",
    "buscarDadosEspelhoBackend",
    "salvarFechamentoDiaPlanilha",
    "salvarMultiplosFechamentos",
    "excluirContadorTapiocasHoje"
  ];

  const permitidas = acoesPublicas.concat(acoesAdministrativas);
  if (!action || permitidas.indexOf(action) === -1) {
    throw new Error("Ação não permitida: " + action);
  }

  const fn = this[action];
  if (typeof fn !== "function") {
    throw new Error("Função não encontrada no backend: " + action);
  }

  return { ok: true, data: fn.apply(this, Array.isArray(args) ? args : []) };
}

function responderApi_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function registrarPedidoOnline(pedidoJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const pedido = JSON.parse(pedidoJSON);
    const props = PropertiesService.getScriptProperties();
    const ativos = JSON.parse(props.getProperty("pdv_vendas_ativas") || "[]");
    const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const numerosHoje = ativos
      .filter(function(item) {
        const ts = item.timestampCriacao || item.timestamp;
        if (!ts) return false;
        return Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), "yyyy-MM-dd") === hoje;
      })
      .map(function(item) { return Number(item.numero) || 0; });

    pedido.numero = (numerosHoje.length ? Math.max.apply(null, numerosHoje) : 0) + 1;
    pedido.timestampCriacao = Date.now();
    pedido.hora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm");
    ativos.push(pedido);
    props.setProperty("pdv_vendas_ativas", JSON.stringify(ativos));
    lancarPedidoPlanilha(JSON.stringify(pedido));
    return { numero: pedido.numero, pedido: pedido };
  } finally {
    lock.releaseLock();
  }
}
