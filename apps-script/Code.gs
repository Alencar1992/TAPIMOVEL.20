// =========================================================
// 1. SEGURANÇA E PORTA DE ENTRADA DO APLICATIVO
// =========================================================
const CHAVE_PIN_ADMIN_ = "pdv_admin_pin_hash";
const CHAVE_SESSAO_ADMIN_ = "pdv_admin_session_";
const CHAVE_TENTATIVAS_LOGIN_ = "pdv_admin_login_attempts";
const DURACAO_SESSAO_ADMIN_SEGUNDOS_ = 21600;

function hashSeguro_(valor) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(valor || ""),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    const normalizado = byte < 0 ? byte + 256 : byte;
    return ("0" + normalizado.toString(16)).slice(-2);
  }).join("");
}

function erroApi_(codigo, mensagem) {
  const erro = new Error(mensagem);
  erro.code = codigo;
  return erro;
}

function configurarPinAdministrador(pin) {
  const valor = String(pin || "");
  if (!/^\d{6,12}$/.test(valor)) {
    throw new Error("O PIN administrativo deve conter de 6 a 12 números.");
  }
  PropertiesService.getScriptProperties().setProperty(CHAVE_PIN_ADMIN_, hashSeguro_(valor));
  CacheService.getScriptCache().remove(CHAVE_TENTATIVAS_LOGIN_);
  return "PIN administrativo configurado com sucesso.";
}

function loginAdministrador(pin) {
  const cache = CacheService.getScriptCache();
  const tentativas = Number(cache.get(CHAVE_TENTATIVAS_LOGIN_) || 0);
  if (tentativas >= 5) {
    throw erroApi_(
      "LOGIN_BLOCKED",
      "Muitas tentativas de acesso. Aguarde 10 minutos e tente novamente."
    );
  }

  const hashConfigurado = PropertiesService.getScriptProperties().getProperty(CHAVE_PIN_ADMIN_);
  if (!hashConfigurado) {
    throw erroApi_(
      "ADMIN_NOT_CONFIGURED",
      "O PIN administrativo ainda não foi configurado no Apps Script."
    );
  }

  if (hashSeguro_(pin) !== hashConfigurado) {
    cache.put(CHAVE_TENTATIVAS_LOGIN_, String(tentativas + 1), 600);
    throw erroApi_("INVALID_CREDENTIALS", "PIN inválido.");
  }

  cache.remove(CHAVE_TENTATIVAS_LOGIN_);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put(
    CHAVE_SESSAO_ADMIN_ + hashSeguro_(token),
    JSON.stringify({ criadoEm: Date.now() }),
    DURACAO_SESSAO_ADMIN_SEGUNDOS_
  );
  return {
    token: token,
    expiraEm: Date.now() + DURACAO_SESSAO_ADMIN_SEGUNDOS_ * 1000
  };
}

function validarSessaoAdministrador(token) {
  if (!token) return false;
  return Boolean(
    CacheService.getScriptCache().get(CHAVE_SESSAO_ADMIN_ + hashSeguro_(token))
  );
}

function encerrarSessaoAdministrador(token) {
  if (token) {
    CacheService.getScriptCache().remove(CHAVE_SESSAO_ADMIN_ + hashSeguro_(token));
  }
  return true;
}

function exigirSessaoAdministrador_(token) {
  if (!validarSessaoAdministrador(token)) {
    throw erroApi_("AUTH_REQUIRED", "Acesso administrativo não autorizado.");
  }
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action) {
      const permitidasViaGet = [
        "obterDisponibilidadeCardapio",
        "obterCatalogoCardapio",
        "obterStatusCardapio"
      ];
      if (permitidasViaGet.indexOf(e.parameter.action) === -1) {
        return responderApi_({
          ok: false,
          code: "METHOD_NOT_ALLOWED",
          error: "Esta ação exige uma requisição POST."
        });
      }
      return responderApi_(executarAcaoApi_(e.parameter.action, [], ""));
    }

    return responderApi_({
      ok: true,
      data: {
        servico: "Tapimóvel 2.0 API",
        status: "online"
      }
    });
  } catch (erro) {
    return responderApi_({
      ok: false,
      code: erro && erro.code ? erro.code : "SERVER_ERROR",
      error: erro && erro.message ? erro.message : String(erro)
    });
  }
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
    throw e;
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
    throw e;
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
    throw e;
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
    throw e;
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
    throw e;
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
      matrizItens.push([
        "#" + p.numero,
        valorSeguroPlanilha_(String(p.hora || "")),
        valorSeguroPlanilha_(String(i.nome || "")),
        valorSeguroPlanilha_(String(i.tipo || "").toUpperCase()),
        Number(i.quantidade) || 0,
        Number(i.preco) || 0,
        (Number(i.quantidade) || 0) * (Number(i.preco) || 0),
        "AGUARDANDO FINALIZAÇÃO",
        valorSeguroPlanilha_(String(i.obs || "-"))
      ]);
    });
    if (matrizItens.length > 0) {
      aba.getRange(aba.getLastRow() + 1, 1, matrizItens.length, matrizItens[0].length).setValues(matrizItens);
    }
  } catch(e) {
    console.error("Erro lancarPedidoPlanilha: ", e);
    throw e;
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
      matrizItens.push([
        "#" + p.numero,
        valorSeguroPlanilha_(String(p.dataExibicao || "")),
        valorSeguroPlanilha_(String(i.nome || "")),
        valorSeguroPlanilha_(String(i.tipo || "").toUpperCase()),
        Number(i.quantidade) || 0,
        Number(i.preco) || 0,
        (Number(i.quantidade) || 0) * (Number(i.preco) || 0),
        valorSeguroPlanilha_(String(p.formaPagamento || "")),
        valorSeguroPlanilha_(String(i.obs || "-"))
      ]);
    });
    if (matrizItens.length > 0) {
      aba.getRange(aba.getLastRow() + 1, 1, matrizItens.length, matrizItens[0].length).setValues(matrizItens);
    }
  } catch(e) {
    console.error("Erro moverParaHistorico: ", e);
    throw e;
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
      matrizItens.push([
        "#" + p.numero,
        valorSeguroPlanilha_(String(p.dataExibicao || "")),
        valorSeguroPlanilha_(String(i.nome || "")),
        Number(i.quantidade) || 0,
        (Number(i.quantidade) || 0) * (Number(i.preco) || 0)
      ]);
    });
    if (matrizItens.length > 0) {
      aba.getRange(aba.getLastRow() + 1, 1, matrizItens.length, matrizItens[0].length).setValues(matrizItens);
    }
  } catch(e) {
    console.error("Erro moverParaCancelados: ", e);
    throw e;
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
    throw e;
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
    const abasPermitidas = [
      "Fechamentos_Diarios",
      "Tapiocas Diária",
      "Base de Vendas",
      "Historico_Diario",
      "Combustivel",
      "Dias_Nao_Trabalhados",
      "Fechamentos_Mensais",
      "Vendas_hoje",
      "Resumo Semanal",
      "Liquidez Mensal",
      "Pedidos Cancelados"
    ];
    if (abasPermitidas.indexOf(String(nomeAba || "")) === -1) {
      throw new Error("A aba solicitada não está disponível no espelho.");
    }
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
    return responderApi_(
      executarAcaoApi_(body.action, body.args || [], String(body.token || ""))
    );
  } catch (erro) {
    return responderApi_({
      ok: false,
      code: erro && erro.code ? erro.code : "SERVER_ERROR",
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

function executarAcaoApi_(action, args, token) {
  const acoesPublicas = [
    "obterDisponibilidadeCardapio",
    "obterCatalogoCardapio",
    "obterStatusCardapio",
    "registrarPedidoOnline",
    "loginAdministrador",
    "validarSessaoAdministrador",
    "encerrarSessaoAdministrador"
  ];

  const acoesAdministrativas = [
    "salvarNuvemCompleta",
    "salvarVendaRealTime",
    "atualizarVendaRealTime",
    "registrarPedidoPdv",
    "atualizarPedidoPdv",
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
    "salvarDisponibilidadeCardapio",
    "inicializarCatalogoConfiguracao",
    "salvarItemCatalogo",
    "removerItemCatalogo",
    "excluirContadorTapiocasHoje",
    "obterRelatorioEliel",
    "registrarAcessoRelatorioEliel",
    "obterConfiguracoesRelatorioEliel",
    "salvarConfiguracoesRelatorioEliel",
    "fecharMesRelatorioEliel",
    "obterAvisosPdv"
  ];

  const permitidas = acoesPublicas.concat(acoesAdministrativas);
  if (!action || permitidas.indexOf(action) === -1) {
    throw erroApi_("ACTION_NOT_ALLOWED", "Ação não permitida: " + action);
  }

  if (acoesAdministrativas.indexOf(action) !== -1) {
    exigirSessaoAdministrador_(token);
  }

  const fn = this[action];
  if (typeof fn !== "function") {
    throw erroApi_("ACTION_NOT_FOUND", "Função não encontrada no backend: " + action);
  }

  const argumentos = Array.isArray(args) ? args : [];
  if (action === "validarSessaoAdministrador" || action === "encerrarSessaoAdministrador") {
    return { ok: true, data: fn.call(this, token) };
  }
  return { ok: true, data: fn.apply(this, argumentos) };
}

function responderApi_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function textoPedidoSeguro_(valor, limite, obrigatorio) {
  const texto = String(valor == null ? "" : valor)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, limite);
  if (obrigatorio && !texto) {
    throw erroApi_("INVALID_ORDER", "O pedido contém um campo obrigatório vazio.");
  }
  return texto;
}

function valorSeguroPlanilha_(valor) {
  if (typeof valor !== "string") return valor;
  const texto = valor.replace(/[\u0000-\u001F\u007F]/g, " ").substring(0, 1000);
  return /^[=+\-@]/.test(texto.trim()) ? "'" + texto : texto;
}

function precoMonteSua_(nome) {
  const combinacoes = {
    "Calabresa": { "Catupiry (Orig.)": 14, "Cheddar": 14, "Cream Cheese": 14, "Muçarela": 14, "Queijo Branco": 14 },
    "Frango": { "Catupiry (Orig.)": 14, "Cheddar": 14, "Cream Cheese": 14, "Muçarela": 14, "Queijo Branco": 14 },
    "Carne Seca": { "Catupiry (Orig.)": 15, "Cheddar": 15, "Cream Cheese": 15, "Muçarela": 15, "Queijo Branco": 15 },
    "Salame": { "Catupiry (Orig.)": 15, "Cheddar": 15, "Cream Cheese": 15, "Muçarela": 15, "Queijo Branco": 15 },
    "Bacon": { "Catupiry (Orig.)": 16, "Cheddar": 15, "Cream Cheese": 15, "Muçarela": 15, "Queijo Branco": 16 },
    "Peito de Peru": { "Catupiry (Orig.)": 16, "Cheddar": 15, "Cream Cheese": 15, "Muçarela": 15, "Queijo Branco": 16 }
  };
  const match = String(nome || "").match(/^Monte Sua: (.+) c\/ (.+)$/);
  if (!match || !combinacoes[match[1]] || combinacoes[match[1]][match[2]] == null) {
    throw erroApi_("INVALID_ORDER", "A combinação do Monte a Sua não é válida.");
  }
  return combinacoes[match[1]][match[2]];
}

function normalizarPedidoOnline_(pedidoRecebido, catalogo) {
  if (!pedidoRecebido || typeof pedidoRecebido !== "object" || Array.isArray(pedidoRecebido)) {
    throw erroApi_("INVALID_ORDER", "Pedido inválido.");
  }
  if (!Array.isArray(pedidoRecebido.itens) ||
      pedidoRecebido.itens.length < 1 ||
      pedidoRecebido.itens.length > 30) {
    throw erroApi_("INVALID_ORDER", "O pedido deve conter entre 1 e 30 itens.");
  }

  const itensCatalogo = {};
  CATEGORIAS_CATALOGO_.forEach(function(categoria) {
    (catalogo[categoria] || []).forEach(function(item) {
      itensCatalogo[item.nome] = item;
    });
  });

  const itens = pedidoRecebido.itens.map(function(item) {
    const nome = textoPedidoSeguro_(item && item.nome, 140, true);
    const quantidade = Number(item && item.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20) {
      throw erroApi_("INVALID_ORDER", "A quantidade de cada item deve ser de 1 a 20.");
    }

    const cadastrado = itensCatalogo[nome];
    let preco = 0;
    let tipo = "tapioca";
    let ingredientes = "";
    if (cadastrado) {
      preco = Number(cadastrado.preco);
      tipo = cadastrado.tipo === "bebida" ? "bebida" : "tapioca";
      ingredientes = textoPedidoSeguro_(cadastrado.ing, 500, false);
    } else if (nome.indexOf("Monte Sua:") === 0) {
      preco = precoMonteSua_(nome);
      ingredientes = textoPedidoSeguro_(item.ing, 500, false);
    } else {
      throw erroApi_(
        "INVALID_ORDER",
        "O item '" + nome + "' não está disponível no cardápio."
      );
    }

    return {
      nome: nome,
      preco: Math.round(preco * 100) / 100,
      tipo: tipo,
      ing: ingredientes,
      quantidade: quantidade,
      obs: textoPedidoSeguro_(item.obs, 300, false),
      pronto: false
    };
  });

  const pagamentos = [
    "PIX",
    "Cartão de Crédito",
    "Cartão de Débito",
    "VR (Vale Refeição)"
  ];
  let pagamento = textoPedidoSeguro_(pedidoRecebido.pagamentoDesejado, 100, true);
  if (pagamento.indexOf("Dinheiro (") !== 0 && pagamentos.indexOf(pagamento) === -1) {
    throw erroApi_("INVALID_ORDER", "A forma de pagamento é inválida.");
  }

  return {
    origem: "Online",
    nomeCliente: textoPedidoSeguro_(pedidoRecebido.nomeCliente, 100, true),
    enderecoCliente: textoPedidoSeguro_(pedidoRecebido.enderecoCliente, 180, true),
    pagamentoDesejado: pagamento,
    itens: itens,
    total: itens.reduce(function(total, item) {
      return total + item.quantidade * item.preco;
    }, 0),
    produzido: false
  };
}

function normalizarPedidoPdv_(pedidoRecebido) {
  if (!pedidoRecebido || typeof pedidoRecebido !== "object" || Array.isArray(pedidoRecebido)) {
    throw erroApi_("INVALID_ORDER", "Pedido do PDV inválido.");
  }
  if (!Array.isArray(pedidoRecebido.itens) ||
      pedidoRecebido.itens.length < 1 ||
      pedidoRecebido.itens.length > 50) {
    throw erroApi_("INVALID_ORDER", "O pedido deve conter entre 1 e 50 itens.");
  }
  const tipos = ["tapioca", "bebida", "extra"];
  const itens = pedidoRecebido.itens.map(function(item) {
    const quantidade = Number(item && item.quantidade);
    const preco = Number(item && item.preco);
    const tipo = String(item && item.tipo || "");
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20) {
      throw erroApi_("INVALID_ORDER", "A quantidade de cada item deve ser de 1 a 20.");
    }
    if (!isFinite(preco) || preco <= 0 || preco > 1000) {
      throw erroApi_("INVALID_ORDER", "O preço do item é inválido.");
    }
    if (tipos.indexOf(tipo) === -1) {
      throw erroApi_("INVALID_ORDER", "O tipo do item é inválido.");
    }
    return {
      nome: textoPedidoSeguro_(item.nome, 140, true),
      preco: Math.round(preco * 100) / 100,
      tipo: tipo,
      ing: textoPedidoSeguro_(item.ing, 500, false),
      quantidade: quantidade,
      obs: textoPedidoSeguro_(item.obs, 300, false),
      pronto: item.pronto === true,
      personalizacoes: Array.isArray(item.personalizacoes)
        ? item.personalizacoes.slice(0, 20).map(function(valor) {
            return textoPedidoSeguro_(valor, 100, false);
          })
        : []
    };
  });
  return {
    origem: "PDV",
    itens: itens,
    total: itens.reduce(function(total, item) {
      return total + item.quantidade * item.preco;
    }, 0),
    produzido: itens.filter(function(item) {
      return item.tipo !== "bebida";
    }).every(function(item) {
      return item.pronto;
    })
  };
}

function registrarPedidoPdv(pedidoJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const pedido = normalizarPedidoPdv_(JSON.parse(pedidoJSON || "{}"));
    const props = PropertiesService.getScriptProperties();
    const ativos = JSON.parse(props.getProperty("pdv_vendas_ativas") || "[]");
    const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const numerosHoje = ativos.filter(function(item) {
      const ts = item.timestampCriacao || item.timestamp;
      return ts && Utilities.formatDate(
        new Date(ts),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      ) === hoje;
    }).map(function(item) {
      return Number(item.numero) || 0;
    });
    pedido.numero = (numerosHoje.length ? Math.max.apply(null, numerosHoje) : 0) + 1;
    pedido.timestampCriacao = Date.now();
    pedido.hora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm");
    ativos.push(pedido);
    lancarPedidoPlanilha(JSON.stringify(pedido));
    props.setProperty("pdv_vendas_ativas", JSON.stringify(ativos));
    return pedido;
  } finally {
    lock.releaseLock();
  }
}

function atualizarPedidoPdv(pedidoJSON) {
  const recebido = JSON.parse(pedidoJSON || "{}");
  const numero = Number(recebido.numero);
  if (!Number.isInteger(numero) || numero < 1) {
    throw erroApi_("INVALID_ORDER", "Número do pedido inválido.");
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const props = PropertiesService.getScriptProperties();
    const ativos = JSON.parse(props.getProperty("pdv_vendas_ativas") || "[]");
    const indice = ativos.findIndex(function(item) {
      return Number(item.numero) === numero;
    });
    if (indice === -1) {
      throw erroApi_("ORDER_NOT_FOUND", "O pedido não foi encontrado.");
    }
    const pedidoAnterior = ativos[indice];
    const pedido = normalizarPedidoPdv_(recebido);
    pedido.numero = numero;
    pedido.timestampCriacao = ativos[indice].timestampCriacao;
    pedido.hora = ativos[indice].hora;
    try {
      removerDaBaseDeVendasBackend(numero);
      lancarPedidoPlanilha(JSON.stringify(pedido));
    } catch (erro) {
      try {
        removerDaBaseDeVendasBackend(numero);
        lancarPedidoPlanilha(JSON.stringify(pedidoAnterior));
      } catch (erroRestauracao) {
        console.error("Falha ao restaurar pedido após erro de atualização:", erroRestauracao);
      }
      throw erro;
    }
    ativos[indice] = pedido;
    props.setProperty("pdv_vendas_ativas", JSON.stringify(ativos));
    return pedido;
  } finally {
    lock.releaseLock();
  }
}

function registrarPedidoOnline(pedidoJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const props = PropertiesService.getScriptProperties();
    const catalogo = catalogoConfigurado_("{}");
    const pedido = normalizarPedidoOnline_(JSON.parse(pedidoJSON || "{}"), catalogo);
    const diaSemana = Number(
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "u")
    );
    const horaAtual = Number(
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "H")
    );
    const rotasPorDia = {
      1: ["RUA NOVA TUPAROQUERA", "RUA ARIBUGU", "RUA ROMÃO MANZINI CERQUEIRA", "RUA BAUCIS", "RUA PAULO LEMORE", "RUA PEDRO FLAMENCO"],
      2: ["JD SÃO FRANCISCO", "COND. PQ EUROPA"],
      3: ["JD LETICIA", "PQ STO ANTONIO", "JD VAZ DE LIMA", "CHACARA SANTANA"],
      4: ["JD ALFREDO", "JD DAS FLORES", "BANDEIRANTE"],
      5: ["JD SOUZA"]
    };
    const rotasPermitidas = rotasPorDia[diaSemana] || [];
    const endereco = String(pedido.enderecoCliente || "").trim().toUpperCase();
    const itensIndisponiveis = JSON.parse(
      props.getProperty("cardapio_itens_indisponiveis") || "[]"
    );
    const itemEsgotado = (pedido.itens || []).find(function(item) {
      return itensIndisponiveis.indexOf(item.nome) !== -1;
    });
    if (diaSemana < 1 || diaSemana > 5) {
      throw new Error("O cardápio on-line funciona somente de segunda a sexta-feira.");
    }
    if (horaAtual < 18 || horaAtual >= 22) {
      throw new Error("O cardápio digital funciona das 18h às 22h.");
    }
    if (!rotasPermitidas.some(function(rota) { return endereco.indexOf(rota) === 0; })) {
      throw new Error("O endereço informado não pertence à rota disponível hoje.");
    }
    if (itemEsgotado) {
      throw new Error("O item '" + itemEsgotado.nome + "' está esgotado no momento.");
    }

    const cache = CacheService.getScriptCache();
    const assinatura = hashSeguro_(JSON.stringify({
      nome: pedido.nomeCliente.toLocaleLowerCase(),
      endereco: pedido.enderecoCliente.toLocaleLowerCase(),
      pagamento: pedido.pagamentoDesejado,
      itens: pedido.itens.map(function(item) {
        return [item.nome, item.quantidade, item.obs];
      })
    }));
    const chaveDuplicidade = "pdv_pedido_duplicado_" + assinatura;
    const pedidoExistente = cache.get(chaveDuplicidade);
    if (pedidoExistente) {
      return JSON.parse(pedidoExistente);
    }

    const chaveLimite = "pdv_pedido_limite_" + hashSeguro_(
      pedido.nomeCliente.toLocaleLowerCase() + "|" +
      pedido.enderecoCliente.toLocaleLowerCase()
    );
    const quantidadeRecente = Number(cache.get(chaveLimite) || 0);
    if (quantidadeRecente >= 3) {
      throw erroApi_(
        "RATE_LIMITED",
        "Limite de pedidos atingido. Aguarde 10 minutos antes de tentar novamente."
      );
    }

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
    lancarPedidoPlanilha(JSON.stringify(pedido));
    props.setProperty("pdv_vendas_ativas", JSON.stringify(ativos));
    const resultado = { numero: pedido.numero, pedido: pedido };
    cache.put(chaveDuplicidade, JSON.stringify(resultado), 120);
    cache.put(chaveLimite, String(quantidadeRecente + 1), 600);
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

function obterDisponibilidadeCardapio() {
  const props = PropertiesService.getScriptProperties();
  const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const dataPausa = props.getProperty("cardapio_pausa_data") || "";
  if (dataPausa !== hoje) {
    props.setProperty("cardapio_itens_indisponiveis", "[]");
    props.setProperty("cardapio_pausa_data", hoje);
    return "[]";
  }
  return props.getProperty("cardapio_itens_indisponiveis") || "[]";
}

function salvarDisponibilidadeCardapio(itensJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const itens = JSON.parse(itensJSON || "[]");
    if (!Array.isArray(itens)) {
      throw new Error("A lista de itens indisponíveis é inválida.");
    }

    const itensNormalizados = itens
      .filter(function(nome) { return typeof nome === "string" && nome.trim(); })
      .map(function(nome) { return nome.trim(); })
      .filter(function(nome, indice, lista) { return lista.indexOf(nome) === indice; });

    PropertiesService
      .getScriptProperties()
      .setProperty("cardapio_itens_indisponiveis", JSON.stringify(itensNormalizados));
    PropertiesService
      .getScriptProperties()
      .setProperty(
        "cardapio_pausa_data",
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")
      );

    return JSON.stringify(itensNormalizados);
  } finally {
    lock.releaseLock();
  }
}

// =========================================================
// CONFIGURAÇÃO GERAL DO CARDÁPIO E AUDITORIA
// =========================================================
const CHAVE_CATALOGO_CARDAPIO_ = "cardapio_catalogo_configurado";
const ABA_LOG_CONFIGURACAO_ = "log_configuração";
const CATEGORIAS_CATALOGO_ = [
  "salgadas",
  "especiais",
  "doces_tradicionais",
  "doces_avela",
  "doces_nutella",
  "bebidas"
];

function normalizarResponsavelConfiguracao_(responsavel) {
  const nome = textoPedidoSeguro_(responsavel, 100, true);
  if (nome.length < 2) {
    throw new Error("Informe o nome de quem está realizando a configuração.");
  }
  return nome.substring(0, 100);
}

function normalizarCatalogo_(catalogo) {
  const resultado = {};
  CATEGORIAS_CATALOGO_.forEach(function(categoria) {
    const lista = catalogo && Array.isArray(catalogo[categoria])
      ? catalogo[categoria]
      : [];
    resultado[categoria] = lista.map(function(item) {
      return {
        nome: textoPedidoSeguro_(item && item.nome, 140, false),
        preco: Math.max(0, Number(item && item.preco) || 0),
        tipo: item && item.tipo === "bebida" ? "bebida" : "tapioca",
        ing: textoPedidoSeguro_(item && item.ing, 500, false)
      };
    }).filter(function(item) {
      return item.nome && item.preco > 0;
    });
  });
  return resultado;
}

function catalogoConfigurado_(catalogoPadraoJSON) {
  const props = PropertiesService.getScriptProperties();
  const salvo = props.getProperty(CHAVE_CATALOGO_CARDAPIO_);
  if (salvo) return normalizarCatalogo_(JSON.parse(salvo));
  return normalizarCatalogo_(JSON.parse(catalogoPadraoJSON || "{}"));
}

function salvarCatalogoConfigurado_(catalogo) {
  const normalizado = normalizarCatalogo_(catalogo);
  PropertiesService.getScriptProperties()
    .setProperty(CHAVE_CATALOGO_CARDAPIO_, JSON.stringify(normalizado));
  return normalizado;
}

function obterCatalogoCardapio(catalogoPadraoJSON) {
  return JSON.stringify(catalogoConfigurado_(catalogoPadraoJSON));
}

function obterAbaLogConfiguracao_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA_LOG_CONFIGURACAO_);
  if (!aba) {
    aba = ss.insertSheet(ABA_LOG_CONFIGURACAO_);
    aba.appendRow([
      "Data e hora",
      "Responsável",
      "Ação",
      "Item",
      "Categoria",
      "Antes",
      "Depois"
    ]);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, 7).setFontWeight("bold");
  }
  return aba;
}

function registrarLogConfiguracao_(responsavel, acao, item, categoria, antes, depois) {
  obterAbaLogConfiguracao_().appendRow([
    new Date(),
    valorSeguroPlanilha_(String(responsavel || "-")),
    valorSeguroPlanilha_(String(acao || "-")),
    valorSeguroPlanilha_(String(item || "-")),
    valorSeguroPlanilha_(String(categoria || "-")),
    antes ? valorSeguroPlanilha_(JSON.stringify(antes)) : "-",
    depois ? valorSeguroPlanilha_(JSON.stringify(depois)) : "-"
  ]);
}

function inicializarCatalogoConfiguracao(catalogoPadraoJSON, responsavel) {
  const nome = normalizarResponsavelConfiguracao_(responsavel);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    let catalogo = catalogoConfigurado_(catalogoPadraoJSON);
    if (!PropertiesService.getScriptProperties().getProperty(CHAVE_CATALOGO_CARDAPIO_)) {
      catalogo = salvarCatalogoConfigurado_(catalogo);
    }
    registrarLogConfiguracao_(nome, "ACESSO À CONFIGURAÇÃO", "-", "-", null, null);
    return JSON.stringify(catalogo);
  } finally {
    lock.releaseLock();
  }
}

function validarItemCatalogo_(item) {
  const nome = textoPedidoSeguro_(item && item.nome, 140, false);
  const categoria = String(item && item.categoria || "").trim();
  const preco = Number(item && item.preco);
  if (nome.length < 2) throw new Error("Informe um nome válido para o item.");
  if (CATEGORIAS_CATALOGO_.indexOf(categoria) === -1) {
    throw new Error("Selecione uma categoria válida.");
  }
  if (!isFinite(preco) || preco <= 0) {
    throw new Error("Informe um preço maior que zero.");
  }
  return {
    nome: nome.substring(0, 140),
    preco: Math.round(preco * 100) / 100,
    tipo: categoria === "bebidas" || item.tipo === "bebida" ? "bebida" : "tapioca",
    ing: textoPedidoSeguro_(item.ing, 500, false),
    categoria: categoria
  };
}

function localizarItemCatalogo_(catalogo, nome) {
  const alvo = String(nome || "").trim().toLocaleLowerCase();
  for (let i = 0; i < CATEGORIAS_CATALOGO_.length; i++) {
    const categoria = CATEGORIAS_CATALOGO_[i];
    const indice = catalogo[categoria].findIndex(function(item) {
      return item.nome.toLocaleLowerCase() === alvo;
    });
    if (indice !== -1) {
      return { categoria: categoria, indice: indice, item: catalogo[categoria][indice] };
    }
  }
  return null;
}

function salvarItemCatalogo(itemJSON, nomeOriginal, responsavel) {
  const nomeResponsavel = normalizarResponsavelConfiguracao_(responsavel);
  const itemRecebido = validarItemCatalogo_(JSON.parse(itemJSON || "{}"));
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const catalogo = catalogoConfigurado_("{}");
    const original = nomeOriginal ? localizarItemCatalogo_(catalogo, nomeOriginal) : null;
    const duplicado = localizarItemCatalogo_(catalogo, itemRecebido.nome);
    if (duplicado && (!original ||
        duplicado.categoria !== original.categoria ||
        duplicado.indice !== original.indice)) {
      throw new Error("Já existe um item com esse nome no cardápio.");
    }

    let antes = null;
    if (original) {
      antes = Object.assign({ categoria: original.categoria }, original.item);
      catalogo[original.categoria].splice(original.indice, 1);
    }

    const itemSalvo = {
      nome: itemRecebido.nome,
      preco: itemRecebido.preco,
      tipo: itemRecebido.tipo,
      ing: itemRecebido.ing
    };
    catalogo[itemRecebido.categoria].push(itemSalvo);
    catalogo[itemRecebido.categoria].sort(function(a, b) {
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
    salvarCatalogoConfigurado_(catalogo);

    if (original && String(nomeOriginal) !== itemRecebido.nome) {
      const props = PropertiesService.getScriptProperties();
      const pausados = JSON.parse(props.getProperty("cardapio_itens_indisponiveis") || "[]");
      props.setProperty(
        "cardapio_itens_indisponiveis",
        JSON.stringify(pausados.map(function(nome) {
          return nome === nomeOriginal ? itemRecebido.nome : nome;
        }))
      );
    }

    registrarLogConfiguracao_(
      nomeResponsavel,
      original ? "ITEM EDITADO" : "ITEM CRIADO",
      itemRecebido.nome,
      itemRecebido.categoria,
      antes,
      Object.assign({ categoria: itemRecebido.categoria }, itemSalvo)
    );
    return JSON.stringify(catalogo);
  } finally {
    lock.releaseLock();
  }
}

function removerItemCatalogo(nomeItem, responsavel) {
  const nomeResponsavel = normalizarResponsavelConfiguracao_(responsavel);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const catalogo = catalogoConfigurado_("{}");
    const encontrado = localizarItemCatalogo_(catalogo, nomeItem);
    if (!encontrado) throw new Error("O item não foi encontrado no cardápio.");

    const antes = Object.assign({ categoria: encontrado.categoria }, encontrado.item);
    catalogo[encontrado.categoria].splice(encontrado.indice, 1);
    salvarCatalogoConfigurado_(catalogo);

    const props = PropertiesService.getScriptProperties();
    const pausados = JSON.parse(props.getProperty("cardapio_itens_indisponiveis") || "[]");
    props.setProperty(
      "cardapio_itens_indisponiveis",
      JSON.stringify(pausados.filter(function(nome) { return nome !== nomeItem; }))
    );
    registrarLogConfiguracao_(
      nomeResponsavel,
      "ITEM REMOVIDO",
      encontrado.item.nome,
      encontrado.categoria,
      antes,
      null
    );
    return JSON.stringify(catalogo);
  } finally {
    lock.releaseLock();
  }
}

// =========================================================
// RELATÓRIO ELIEL, FECHAMENTO MENSAL E AVISOS
// =========================================================
function normalizarNumero_(valor) {
  if (typeof valor === "number") return valor;
  const texto = String(valor == null ? "" : valor)
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(texto) || 0;
}

function extrairData_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
  const texto = String(valor || "");
  let match = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = texto.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const data = new Date(texto);
  return isNaN(data.getTime()) ? null : data;
}

function pertenceAoMes_(data, mes, ano) {
  return data && data.getMonth() + 1 === Number(mes) && data.getFullYear() === Number(ano);
}

function chaveMes_(mes, ano) {
  return String(ano) + "-" + ("0" + Number(mes)).slice(-2);
}

function nomeDia_(dia) {
  return ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][dia];
}

function obterStatusCardapio() {
  const agora = new Date();
  const fuso = Session.getScriptTimeZone();
  const dia = Number(Utilities.formatDate(agora, fuso, "u"));
  const hora = Number(Utilities.formatDate(agora, fuso, "H"));
  const aberto = dia >= 1 && dia <= 5 && hora >= 18 && hora < 22;
  return JSON.stringify({
    aberto: aberto,
    diaSemana: dia,
    hora: hora,
    abreAs: "18:00",
    fechaAs: "22:00"
  });
}

function obterConfiguracoesRelatorioEliel() {
  const padrao = {
    combustivelCarro: 0,
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
  const salvo = PropertiesService.getScriptProperties().getProperty("relatorio_eliel_config");
  if (!salvo) return JSON.stringify(padrao);
  try {
    return JSON.stringify(Object.assign(padrao, JSON.parse(salvo)));
  } catch (_) {
    return JSON.stringify(padrao);
  }
}

function salvarConfiguracoesRelatorioEliel(configJSON) {
  const config = JSON.parse(configJSON || "{}");
  const soma = normalizarNumero_(config.percentualCompra) +
    normalizarNumero_(config.percentualLucas) +
    normalizarNumero_(config.percentualEliel);
  if (Math.abs(soma - 100) > 0.01) {
    throw new Error("Os percentuais de Compra, Lucas e Eliel precisam somar 100%.");
  }
  PropertiesService.getScriptProperties()
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
  const rotas = {};
  let faturamento = 0;
  let credito = 0;
  let debito = 0;
  let vr = 0;
  let totalTapiocas = 0;
  let combustivelMes = 0;

  if (historico) {
    const dados = historico.getDataRange().getDisplayValues();
    for (let i = 1; i < dados.length; i++) {
      const data = extrairData_(dados[i][1]);
      const tipo = String(dados[i][3] || "").toUpperCase();
      const produto = String(dados[i][2] || "").trim();
      const qtd = normalizarNumero_(dados[i][4]);
      if (!pertenceAoMes_(data, mes, ano) || tipo !== "TAPIOCA" || !produto || qtd <= 0) continue;

      const diaChave = Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
      const semanaChave = "Semana " + Math.ceil(data.getDate() / 7);
      const rota = nomeDia_(data.getDay());
      dias[diaChave] = (dias[diaChave] || 0) + qtd;
      semanas[semanaChave] = (semanas[semanaChave] || 0) + qtd;
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
      faturamento += totalDia;
      credito += normalizarNumero_(dados[i][4]);
      debito += normalizarNumero_(dados[i][5]);
      vr += normalizarNumero_(dados[i][6]);
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
    let insight = "Revisar posição no cardápio e oferecer em combinação.";
    if (quantidade === 0) insight = "Sem vendas: testar foto, destaque e oferta por tempo limitado.";
    else if (quantidade <= 2) insight = "Baixa saída: oferecer como sugestão do dia e revisar a descrição.";
    return { produto: nome, quantidade: quantidade, insight: insight };
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
      tapiocaMaisVendida: top
    };
  }).sort(function(a, b) { return b.total - a.total; });

  const taxas = debito * normalizarNumero_(config.taxaDebito) / 100 +
    credito * normalizarNumero_(config.taxaCredito) / 100 +
    vr * normalizarNumero_(config.taxaVr) / 100;
  const subtotal = faturamento - taxas;
  const custos = {
    combustivelCarro: combustivelMes || normalizarNumero_(config.combustivelCarro),
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
    porDia: Object.keys(dias).map(function(dia) { return { dia: dia, quantidade: dias[dia] }; }),
    porSemana: Object.keys(semanas).map(function(semana) { return { semana: semana, quantidade: semanas[semana] }; }),
    rankingProdutos: rankingProdutos,
    top3: rankingProdutos.slice(0, 3),
    menosVendidas: menosVendidas,
    rotas: rankingRotas,
    melhorRota: rankingRotas[0] || null,
    faturamento: faturamento,
    taxas: taxas,
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
  const relatorio = obterAbaRelatorioEliel_();
  const valores = relatorio.getLastRow() > 1
    ? relatorio.getRange(2, 1, relatorio.getLastRow() - 1, 1).getDisplayValues().flat()
    : [];
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
    mesAnteriorPendente: temDadosAnterior && valores.indexOf(chaveAnterior) === -1,
    chaveAnterior: chaveAnterior
  });
}

function fecharMesRelatorioEliel(relatorioJSON) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
    const dados = JSON.parse(relatorioJSON || "{}");
    if (!dados.chave) throw new Error("Mês de referência inválido.");
    const aba = obterAbaRelatorioEliel_();
    const chaves = aba.getLastRow() > 1
      ? aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues().flat()
      : [];
    if (chaves.indexOf(dados.chave) !== -1) {
      throw new Error("O mês " + dados.chave + " já foi fechado.");
    }
    aba.appendRow([
      dados.chave,
      new Date(),
      dados.faturamento,
      dados.taxas,
      dados.subtotal,
      dados.custos.combustivelCarro,
      dados.custos.salarioCozinha,
      dados.custos.salarioAuxCarro,
      dados.custos.manutencaoCarro,
      dados.liquido,
      dados.distribuicao.compra,
      dados.distribuicao.lucas,
      dados.distribuicao.eliel,
      dados.totalTapiocas,
      dados.melhorRota ? dados.melhorRota.rota : "-",
      (dados.top3 || []).map(function(item) { return item.produto + " (" + item.quantidade + ")"; }).join(" | "),
      (dados.menosVendidas || []).map(function(item) { return item.produto + " (" + item.quantidade + ")"; }).join(" | "),
      JSON.stringify(dados)
    ]);

    let log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Log Relatorio Eliel");
    if (!log) {
      log = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Log Relatorio Eliel");
      log.appendRow(["Data e hora", "Evento", "Mês referência"]);
    }
    log.appendRow([new Date(), "FECHAMENTO DO MÊS", dados.chave]);

    PropertiesService.getScriptProperties().setProperty("pdv_vendas_ativas", "[]");
    PropertiesService.getScriptProperties().setProperty(
      "pdv_aviso_pendente",
      "O mês " + dados.chave + " foi fechado no Relatório Eliel. Os pedidos ativos foram zerados."
    );
    return JSON.stringify({ ok: true, chave: dados.chave });
  } finally {
    lock.releaseLock();
  }
}

function obterAvisosPdv() {
  const props = PropertiesService.getScriptProperties();
  const aviso = props.getProperty("pdv_aviso_pendente") || "";
  if (aviso) props.deleteProperty("pdv_aviso_pendente");
  return JSON.stringify({ mensagem: aviso });
}
