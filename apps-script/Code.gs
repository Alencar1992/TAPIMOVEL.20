// =========================================================
// 1. SEGURANÇA E PORTA DE ENTRADA DO APLICATIVO
// =========================================================
const CHAVE_PIN_ADMIN_ = "pdv_admin_pin_hash";
const CHAVE_PIN_ELIEL_ = "pdv_eliel_pin_hash";
const CHAVE_SESSAO_ADMIN_ = "pdv_admin_session_";
const CHAVE_TENTATIVAS_LOGIN_ = "pdv_admin_login_attempts";
const DURACAO_INATIVIDADE_ADMIN_SEGUNDOS_ = 14400;
const NOME_PERFIL_ELIEL_ = "CEO Eliel";

// =========================================================
// CONFIGURAÇÃO OPERACIONAL DINÂMICA
// =========================================================
const CHAVE_CONFIG_OPERACIONAL_ = "tapimovel_config_operacional_v1"; // legado: somente migração
const CACHE_CONFIG_OPERACIONAL_ = "tapimovel_config_operacional_cache_v2";
const CACHE_CONFIG_OPERACIONAL_TTL_ = 300;
const ABA_CONFIG_HORARIOS_ = "Config_Horarios";
const ABA_CONFIG_ROTAS_ = "Config_Rotas";
const ABA_CONFIG_MONTE_SUA_ = "Config_MonteSua";
const ABA_CONFIG_ADICIONAIS_ = "Config_Adicionais";

function configuracaoOperacionalPadrao_() {
  return {
    versao: 1,
    horarios: {
      "1": { ativo: true, inicio: "18:00", fim: "22:00" },
      "2": { ativo: true, inicio: "18:00", fim: "22:00" },
      "3": { ativo: true, inicio: "18:00", fim: "22:00" },
      "4": { ativo: true, inicio: "18:00", fim: "22:00" },
      "5": { ativo: true, inicio: "18:00", fim: "22:00" },
      "6": { ativo: false, inicio: "18:00", fim: "22:00" },
      "7": { ativo: false, inicio: "18:00", fim: "22:00" }
    },
    rotas: {
      "1": ["RUA NOVA TUPAROQUERA", "RUA ARIBUGU", "RUA ROMÃO MANZINI CERQUEIRA", "RUA BAUCIS", "RUA PAULO LEMORE", "RUA PEDRO FLAMENCO"],
      "2": ["JD SÃO FRANCISCO", "COND. PQ EUROPA"],
      "3": ["JD LETICIA", "PQ STO ANTONIO", "CHACARA SANTANA"],
      "4": ["JD ALFREDO", "JD DAS FLORES", "BANDEIRANTE"],
      "5": ["JD SOUZA", "COPACABANA", "TUPI"],
      "6": [],
      "7": []
    },
    monteSua: {
      combinacoes: {
        "Calabresa": { "Catupiry (Orig.)": 14, "Cheddar": 14, "Cream Cheese": 14, "Muçarela": 14, "Queijo Branco": 14 },
        "Frango": { "Catupiry (Orig.)": 14, "Cheddar": 14, "Cream Cheese": 14, "Muçarela": 14, "Queijo Branco": 14 },
        "Carne Seca": { "Catupiry (Orig.)": 15, "Cheddar": 15, "Cream Cheese": 15, "Muçarela": 15, "Queijo Branco": 15 },
        "Salame": { "Catupiry (Orig.)": 15, "Cheddar": 15, "Cream Cheese": 15, "Muçarela": 15, "Queijo Branco": 15 },
        "Bacon": { "Catupiry (Orig.)": 16, "Cheddar": 15, "Cream Cheese": 15, "Muçarela": 15, "Queijo Branco": 16 },
        "Peito de Peru": { "Catupiry (Orig.)": 16, "Cheddar": 15, "Cream Cheese": 15, "Muçarela": 15, "Queijo Branco": 16 }
      }
    },
    adicionais: {
      valor: 4,
      salgado: ["Frango", "Calabresa", "Carne seca", "Salame", "Presunto", "Queijo branco", "Muçarela", "Catupiry", "Cheddar", "Cream cheese", "Bacon", "Peito de peru"],
      doce: ["Chocolate ao leite", "Chocolate avelã", "Nutella", "Castanha de amendoim", "Granulado", "Leite condensado", "Ninho", "Sonho de Valsa", "Morango", "Coco", "Banana", "Goiabada", "Paçoca"]
    }
  };
}

function horarioOperacionalValido_(valor) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(valor || ""));
}

function textoOperacionalSeguro_(valor, limite) {
  return String(valor == null ? "" : valor)
    .replace(/[\u0000-\u001F\u007F<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, limite || 120);
}

function normalizarConfiguracaoOperacional_(recebida) {
  const padrao = configuracaoOperacionalPadrao_();
  const config = recebida && typeof recebida === "object" && !Array.isArray(recebida) ? recebida : {};
  const saida = configuracaoOperacionalPadrao_();

  for (let dia = 1; dia <= 7; dia++) {
    const chave = String(dia);
    const regra = config.horarios && config.horarios[chave] || padrao.horarios[chave];
    const inicio = horarioOperacionalValido_(regra.inicio) ? String(regra.inicio) : padrao.horarios[chave].inicio;
    const fim = horarioOperacionalValido_(regra.fim) ? String(regra.fim) : padrao.horarios[chave].fim;
    if (inicio >= fim) throw new Error("O horário inicial precisa ser anterior ao horário final no dia " + chave + ".");
    saida.horarios[chave] = { ativo: regra.ativo === true, inicio: inicio, fim: fim };

    const rotas = config.rotas && Array.isArray(config.rotas[chave]) ? config.rotas[chave] : padrao.rotas[chave];
    saida.rotas[chave] = rotas
      .map(function(rota) { return textoOperacionalSeguro_(rota, 120).toUpperCase(); })
      .filter(function(rota) { return Boolean(rota); })
      .filter(function(rota, indice, lista) { return lista.indexOf(rota) === indice; })
      .slice(0, 60);
  }

  const combinacoesRecebidas = config.monteSua && config.monteSua.combinacoes;
  if (combinacoesRecebidas && typeof combinacoesRecebidas === "object" && !Array.isArray(combinacoesRecebidas)) {
    const combinacoes = {};
    Object.keys(combinacoesRecebidas).slice(0, 30).forEach(function(carneBruta) {
      const carne = textoOperacionalSeguro_(carneBruta, 80);
      const queijosRecebidos = combinacoesRecebidas[carneBruta];
      if (!carne || !queijosRecebidos || typeof queijosRecebidos !== "object" || Array.isArray(queijosRecebidos)) return;
      const queijos = {};
      Object.keys(queijosRecebidos).slice(0, 30).forEach(function(queijoBruto) {
        const queijo = textoOperacionalSeguro_(queijoBruto, 80);
        const preco = Number(queijosRecebidos[queijoBruto]);
        if (queijo && isFinite(preco) && preco > 0 && preco <= 500) queijos[queijo] = Math.round(preco * 100) / 100;
      });
      if (Object.keys(queijos).length) combinacoes[carne] = queijos;
    });
    if (!Object.keys(combinacoes).length) throw new Error("O Monte Sua precisa ter ao menos uma combinação válida.");
    saida.monteSua.combinacoes = combinacoes;
  }

  const adicionaisRecebidos = config.adicionais || {};
  const valorAdicional = Number(adicionaisRecebidos.valor);
  saida.adicionais.valor = isFinite(valorAdicional) && valorAdicional >= 0 && valorAdicional <= 100
    ? Math.round(valorAdicional * 100) / 100 : padrao.adicionais.valor;
  ["salgado", "doce"].forEach(function(tipo) {
    const lista = Array.isArray(adicionaisRecebidos[tipo]) ? adicionaisRecebidos[tipo] : padrao.adicionais[tipo];
    saida.adicionais[tipo] = lista
      .map(function(item) { return textoOperacionalSeguro_(item, 80); })
      .filter(function(item) { return Boolean(item); })
      .filter(function(item, indice, todos) { return todos.indexOf(item) === indice; })
      .slice(0, 60);
  });
  saida.versao = 1;
  return saida;
}

function obterCacheConfiguracaoOperacional_() {
  const bruto = CacheService.getScriptCache().get(CACHE_CONFIG_OPERACIONAL_);
  if (!bruto) return null;
  try {
    return normalizarConfiguracaoOperacional_(JSON.parse(bruto));
  } catch (erro) {
    CacheService.getScriptCache().remove(CACHE_CONFIG_OPERACIONAL_);
    return null;
  }
}

function salvarCacheConfiguracaoOperacional_(config) {
  const bruto = JSON.stringify(config);
  // Evita exceder o limite por item do CacheService se a configuração crescer muito.
  if (bruto.length <= 90000) {
    CacheService.getScriptCache().put(
      CACHE_CONFIG_OPERACIONAL_,
      bruto,
      CACHE_CONFIG_OPERACIONAL_TTL_
    );
  }
}

function limparCacheConfiguracaoOperacional_() {
  CacheService.getScriptCache().remove(CACHE_CONFIG_OPERACIONAL_);
}

function carregarConfiguracaoOperacionalPersistida_() {
  const props = obterScriptProperties_();
  const legadoBruto = props.getProperty(CHAVE_CONFIG_OPERACIONAL_);

  if (legadoBruto != null) {
    let legado;
    try {
      legado = normalizarConfiguracaoOperacional_(JSON.parse(legadoBruto || "{}"));
    } catch (erro) {
      console.error(
        "Configuração operacional legada inválida; legado preservado e padrão usado:",
        erro
      );
      return { config: configuracaoOperacionalPadrao_(), persistida: false };
    }

    try {
      gravarConfiguracaoOperacionalSheets_(legado);
      props.deleteProperty(CHAVE_CONFIG_OPERACIONAL_);
      console.info(
        "Migração da configuração operacional concluída: PropertiesService -> Google Sheets"
      );
      return { config: legado, persistida: true };
    } catch (erro) {
      console.error(
        "Falha ao migrar configuração operacional para Sheets; legado preservado:",
        erro
      );
      return { config: legado, persistida: false };
    }
  }

  try {
    const sheets = lerConfiguracaoOperacionalSheets_();
    if (sheets) return { config: sheets, persistida: true };
  } catch (erro) {
    console.error("Falha ao ler configuração operacional do Sheets:", erro);
    return { config: configuracaoOperacionalPadrao_(), persistida: false };
  }

  const padrao = configuracaoOperacionalPadrao_();
  try {
    gravarConfiguracaoOperacionalSheets_(padrao);
    return { config: padrao, persistida: true };
  } catch (erro) {
    console.error("Falha ao inicializar configuração operacional no Sheets:", erro);
    return { config: padrao, persistida: false };
  }
}

function obterConfiguracaoOperacional() {
  const emCache = obterCacheConfiguracaoOperacional_();
  if (emCache) return JSON.stringify(emCache);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const cacheAposLock = obterCacheConfiguracaoOperacional_();
    if (cacheAposLock) return JSON.stringify(cacheAposLock);

    const resultado = carregarConfiguracaoOperacionalPersistida_();
    if (resultado.persistida) salvarCacheConfiguracaoOperacional_(resultado.config);
    return JSON.stringify(resultado.config);
  } finally {
    lock.releaseLock();
  }
}

function salvarConfiguracaoOperacional(configJSON, responsavel) {
  const config = normalizarConfiguracaoOperacional_(JSON.parse(configJSON || "{}"));
  const lock = LockService.getScriptLock();
  let anterior = null;
  let tinhaLegado = false;

  try {
    lock.waitLock(10000);
    const props = obterScriptProperties_();
    const legadoBruto = props.getProperty(CHAVE_CONFIG_OPERACIONAL_);
    tinhaLegado = legadoBruto != null;

    if (tinhaLegado) {
      try {
        anterior = normalizarConfiguracaoOperacional_(JSON.parse(legadoBruto || "{}"));
      } catch (erro) {
        anterior = configuracaoOperacionalPadrao_();
      }
    } else {
      try {
        anterior = lerConfiguracaoOperacionalSheets_() || configuracaoOperacionalPadrao_();
      } catch (erro) {
        anterior = configuracaoOperacionalPadrao_();
      }
    }

    try {
      gravarConfiguracaoOperacionalSheets_(config);
      props.deleteProperty(CHAVE_CONFIG_OPERACIONAL_);
      limparCacheConfiguracaoOperacional_();
      salvarCacheConfiguracaoOperacional_(config);
    } catch (erroGravacao) {
      limparCacheConfiguracaoOperacional_();
      if (!tinhaLegado && anterior) {
        try {
          gravarConfiguracaoOperacionalSheets_(anterior);
        } catch (erroRollback) {
          console.error("Falha no rollback da configuração operacional:", erroRollback);
        }
      }
      throw erroGravacao;
    }

    if (typeof registrarLogConfiguracao_ === "function") {
      try {
        registrarLogConfiguracao_(
          normalizarResponsavelConfiguracao_(responsavel || "Administrador"),
          "CONFIGURAÇÃO OPERACIONAL ATUALIZADA",
          "Operação",
          "rotas/horários/Monte Sua/adicionais",
          null,
          { versao: config.versao, storage: "Google Sheets" }
        );
      } catch (erroLog) {
        console.error("Configuração salva, mas o log falhou:", erroLog);
      }
    }
    return JSON.stringify(config);
  } finally {
    lock.releaseLock();
  }
}

function obterRegraOperacionalHoje_(config, data) {
  const momento = data || new Date();
  const fuso = Session.getScriptTimeZone();
  const diaIso = Number(Utilities.formatDate(momento, fuso, "u"));
  const chaveDia = String(diaIso);
  return {
    diaIso: diaIso,
    chaveDia: chaveDia,
    horario: config.horarios[chaveDia] || { ativo: false, inicio: "00:00", fim: "00:00" },
    rotas: config.rotas[chaveDia] || [],
    agora: Utilities.formatDate(momento, fuso, "HH:mm")
  };
}

// =========================================================
// STORAGE RESILIENTE — FILAS NO GOOGLE SHEETS
// =========================================================
const ABA_STORAGE_PDV_ATIVOS_ = "Pedidos_Ativos";
const ABA_STORAGE_ONLINE_PENDENTES_ = "Pedidos_Online_Pendentes";
const CHAVE_LEGADA_PDV_ATIVOS_ = "pdv_vendas_ativas";
const CHAVE_LEGADA_ONLINE_PENDENTES_ = "pedidos_online_pendentes";
const CABECALHO_STORAGE_PEDIDOS_ = [
  "Chave",
  "Número",
  "Código Online",
  "Status",
  "Criado em",
  "Atualizado em",
  "Payload JSON"
];

// =========================================================
// 2. SISTEMA DE NUVEM (BLINDADO COM LOCKSERVICE)
// =========================================================
function carregarDadosNuvem() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    return JSON.stringify(carregarFilaPdvAtivos_());
  } finally {
    lock.releaseLock();
  }
}

function salvarNuvemCompleta(historicoJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    substituirFilaPdvAtivos_(JSON.parse(historicoJSON || "[]"));
  } catch(e) {
    console.error("Erro salvarNuvemCompleta: ", e);
    throw e;
  } finally {
    lock.releaseLock();
  }
}


function excluirVendaRealTime(num) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const c = obterScriptProperties_();
    let a = carregarFilaPdvAtivos_();
    const n = a.filter(x => x.numero != num);
    substituirFilaPdvAtivos_(n);
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
      invalidarCacheLeituraAnalitica_("Historico_Diario");
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
    invalidarCacheLeituraAnalitica_("Historico_Diario");
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
    const dados = lerAbaAnalitica_("Fechamentos_Diarios");
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
    const dadosTap = lerAbaAnalitica_("Tapiocas Diária");
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
    const dadosComb = lerAbaAnalitica_("Combustivel");
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
    const dados = lerAbaAnalitica_("Fechamentos_Diarios");
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
    const dadosC = lerAbaAnalitica_("Combustivel");
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
    invalidarCacheLeituraAnalitica_("Combustivel");
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

  const data = lerAbaAnalitica_("Combustivel");
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

  const data = lerAbaAnalitica_("Fechamentos_Diarios");
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

  const data = lerAbaAnalitica_("Historico_Diario");
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

    invalidarCacheLeituraAnalitica_("Fechamentos_Diarios");
    invalidarCacheLeituraAnalitica_("Tapiocas Diária");
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
    invalidarCacheLeituraAnalitica_("Tapiocas Diária");
  } catch(e) {
    console.error("Erro excluirContadorTapiocasHoje: ", e);
  } finally {
    lock.releaseLock();
  }
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


function obterDisponibilidadeCardapio() {
  const props = obterScriptProperties_();
  const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const dataPausa = props.getProperty("cardapio_pausa_data") || "";
  if (dataPausa !== hoje) {
    props.setProperty("cardapio_itens_indisponiveis", "[]");
    props.setProperty("cardapio_pausa_data", hoje);
    return "[]";
  }
  return props.getProperty("cardapio_itens_indisponiveis") || "[]";
}

function salvarDisponibilidadeCardapio(itensJSON, responsavel) {
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

    const props = obterScriptProperties_();
    const anteriores = JSON.parse(props.getProperty("cardapio_itens_indisponiveis") || "[]");
    PropertiesService
      .getScriptProperties()
      .setProperty("cardapio_itens_indisponiveis", JSON.stringify(itensNormalizados));
    PropertiesService
      .getScriptProperties()
      .setProperty(
        "cardapio_pausa_data",
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")
      );

    if (responsavel) {
      const nomeResponsavel = normalizarResponsavelConfiguracao_(responsavel);
      anteriores
        .filter(function(nome) { return itensNormalizados.indexOf(nome) === -1; })
        .forEach(function(nome) {
          registrarLogConfiguracao_(nomeResponsavel, "ITEM REATIVADO", nome, "-", null, { disponivel: true });
        });
      itensNormalizados
        .filter(function(nome) { return anteriores.indexOf(nome) === -1; })
        .forEach(function(nome) {
          registrarLogConfiguracao_(nomeResponsavel, "ITEM PAUSADO", nome, "-", null, { disponivel: false });
        });
    }

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
    if (!obterScriptProperties_().getProperty(CHAVE_CATALOGO_CARDAPIO_)) {
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
      const props = obterScriptProperties_();
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

    const props = obterScriptProperties_();
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
  return numeroAplicacao_(valor);
}

function extrairData_(valor) {
  return dataAplicacao_(valor);
}

function pertenceAoMes_(data, mes, ano) {
  return dataPertenceAoMesAplicacao_(data, mes, ano);
}

function chaveMes_(mes, ano) {
  return chaveMesAplicacao_(mes, ano);
}

function nomeDia_(dia) {
  return nomeDiaSemanaAplicacao_(dia);
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






function obterAbaFechamentosMensais_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName("Fechamentos_Mensais");
  if (!aba) {
    aba = ss.insertSheet("Fechamentos_Mensais");
    aba.appendRow([
      "Mês Referência", "Qtd Tapiocas", "Faturamento Total",
      "Caixa Reposição", "Lucro Lucas", "Lucro Eliel"
    ]);
    aba.getRange("A1:F1").setFontWeight("bold").setBackground("#cfe2f3");
    aba.setFrozenRows(1);
  }
  return aba;
}














function obterAvisosPdv() {
  const props = obterScriptProperties_();
  const aviso = props.getProperty("pdv_aviso_pendente") || "";
  if (aviso) props.deleteProperty("pdv_aviso_pendente");
  return JSON.stringify({ mensagem: aviso });
}
