// =========================================================
// P9 — SERVIÇO DE FECHAMENTO MENSAL
// Prévia, idempotência, recuperação e persistência do fechamento.
// Cálculo do Relatório Eliel permanece fora deste módulo.
// =========================================================

const ABA_FECHAMENTOS_MENSAIS_V2_ = "Fechamentos_Mensais_v2";
const ABA_CONTROLE_OPERACOES_ = "Controle_Operacoes";
const TIPO_OPERACAO_FECHAMENTO_MENSAL_ = "FECHAMENTO_MENSAL";
const STATUS_OPERACAO_PROCESSANDO_ = "PROCESSANDO";
const STATUS_OPERACAO_CONCLUIDO_ = "CONCLUIDO";
const STATUS_OPERACAO_ERRO_ = "ERRO";

function obterAbaFechamentosMensaisV2_(criar) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA_FECHAMENTOS_MENSAIS_V2_);
  if (!aba && criar !== false) {
    aba = ss.insertSheet(ABA_FECHAMENTOS_MENSAIS_V2_);
    aba.appendRow([
      "Mês Referência", "Faturamento Bruto", "Tapiocas Vendidas",
      "Compra/Reposição", "Lucro Lucas", "Lucro Eliel",
      "ID Operação", "Registrado em"
    ]);
    aba.getRange("A1:H1").setFontWeight("bold").setBackground("#cfe2f3");
    aba.setFrozenRows(1);
  }
  return aba;
}
function obterAbaControleOperacoes_(criar) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA_CONTROLE_OPERACOES_);
  if (!aba && criar !== false) {
    aba = ss.insertSheet(ABA_CONTROLE_OPERACOES_);
    aba.appendRow([
      "ID Operação", "Tipo", "Referência", "Status",
      "Iniciado em", "Atualizado em", "Detalhes"
    ]);
    aba.getRange("A1:G1").setFontWeight("bold").setBackground("#d9ead3");
    aba.setFrozenRows(1);
  }
  return aba;
}
function localizarLinhaPorChave_(aba, coluna, chave) {
  if (!aba || aba.getLastRow() < 2) return 0;
  const valores = aba.getRange(2, coluna, aba.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < valores.length; i++) {
    if (normalizarReferenciaFechamentoMensal_(valores[i][0]) === chave) return i + 2;
  }
  return 0;
}
function obterEstadoOperacaoFechamento_(chave) {
  const aba = obterAbaControleOperacoes_(false);
  if (!aba || aba.getLastRow() < 2) return null;
  const idOperacao = TIPO_OPERACAO_FECHAMENTO_MENSAL_ + ":" + chave;
  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 7).getDisplayValues();
  for (let i = 0; i < dados.length; i++) {
    if (String(dados[i][0]) === idOperacao) {
      return {
        linha: i + 2,
        id: idOperacao,
        status: String(dados[i][3] || ""),
        detalhes: String(dados[i][6] || "")
      };
    }
  }
  return null;
}
function atualizarEstadoOperacaoFechamento_(chave, status, detalhes) {
  const aba = obterAbaControleOperacoes_(true);
  const idOperacao = TIPO_OPERACAO_FECHAMENTO_MENSAL_ + ":" + chave;
  const existente = obterEstadoOperacaoFechamento_(chave);
  const agora = new Date();
  const detalheSeguro = valorSeguroPlanilha_(String(detalhes || "").substring(0, 500));
  if (!existente) {
    aba.appendRow([
      idOperacao, TIPO_OPERACAO_FECHAMENTO_MENSAL_, chave, status,
      agora, agora, detalheSeguro
    ]);
    return idOperacao;
  }
  aba.getRange(existente.linha, 4).setValue(status);
  aba.getRange(existente.linha, 6, 1, 2).setValues([[agora, detalheSeguro]]);
  return idOperacao;
}
function normalizarReferenciaFechamentoMensal_(valor) {
  const texto = String(valor || "").trim();
  if (/^\d{4}-\d{2}$/.test(texto)) return texto;
  const ano = (texto.match(/\b(20\d{2})\b/) || [])[1];
  if (!ano) return texto;
  const normalizado = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nomes = [
    "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];
  const indice = nomes.findIndex(function(nome) { return normalizado.indexOf(nome) !== -1; });
  return indice === -1 ? texto : chaveMes_(indice + 1, ano);
}
function obterDataReferenciaPedidoFechamento_(pedido) {
  if (!pedido) return null;
  const candidatos = [pedido.timestampCriacao, pedido.dataExibicao, pedido.timestamp];
  for (let i = 0; i < candidatos.length; i++) {
    const valor = candidatos[i];
    if (valor instanceof Date && !isNaN(valor.getTime())) return new Date(valor.getTime());
    if (typeof valor === "number" && isFinite(valor)) {
      const dataNumerica = new Date(valor);
      if (!isNaN(dataNumerica.getTime())) return dataNumerica;
    }
    if (typeof valor === "string" && /^\d{12,}$/.test(valor.trim())) {
      const dataTimestamp = new Date(Number(valor));
      if (!isNaN(dataTimestamp.getTime())) return dataTimestamp;
    }
    const data = extrairData_(valor);
    if (data) return data;
  }
  return null;
}
function chaveMesDaDataFechamento_(data) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "yyyy-MM");
}
function obterPedidosPendentesFechamentoEliel_(mes, ano) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const pedidos = carregarFilaPdvAtivos_();
    const chaveAlvo = chaveMes_(mes, ano);
    const chaveAtual = String(obterDiaSessaoAdmin_()).substring(0, 7);
    return (Array.isArray(pedidos) ? pedidos : []).filter(function(pedido) {
      const pendente = !pedido || !pedido.produzido || !pedido.timestamp;
      if (!pendente) return false;
      const data = obterDataReferenciaPedidoFechamento_(pedido);
      if (!data) return chaveAlvo === chaveAtual;
      return chaveMesDaDataFechamento_(data) === chaveAlvo;
    }).length;
  } finally {
    lock.releaseLock();
  }
}
function obterChavesFechamentosExistentes_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abas = [
    ss.getSheetByName("Relatorio Eliel"),
    ss.getSheetByName("Fechamentos_Mensais"),
    ss.getSheetByName(ABA_FECHAMENTOS_MENSAIS_V2_)
  ];
  const chaves = {};
  abas.forEach(function(aba) {
    if (!aba || aba.getLastRow() < 2) return;
    aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues().forEach(function(linha) {
      const chave = normalizarReferenciaFechamentoMensal_(linha[0]);
      if (chave) chaves[chave] = true;
    });
  });
  return chaves;
}
function obterPersistenciaFechamento_(chave) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    relatorio: Boolean(localizarLinhaPorChave_(ss.getSheetByName("Relatorio Eliel"), 1, chave)),
    legado: Boolean(localizarLinhaPorChave_(ss.getSheetByName("Fechamentos_Mensais"), 1, chave)),
    v2: Boolean(localizarLinhaPorChave_(ss.getSheetByName(ABA_FECHAMENTOS_MENSAIS_V2_), 1, chave))
  };
}
function montarPreviaFechamentoRelatorioEliel_(mes, ano, catalogoJSON) {
  invalidarCachesAnaliticos_();
  const relatorio = JSON.parse(obterRelatorioEliel(mes, ano, catalogoJSON) || "{}");
  if (!relatorio.chave) throw new Error("Mês de referência inválido.");
  obterAbaRelatorioEliel_();
  const operacao = obterEstadoOperacaoFechamento_(relatorio.chave);
  const persistencia = obterPersistenciaFechamento_(relatorio.chave);
  const existente = persistencia.relatorio || persistencia.legado || persistencia.v2;
  const operacaoCompleta = Boolean(
    operacao &&
    operacao.status === STATUS_OPERACAO_CONCLUIDO_ &&
    persistencia.relatorio &&
    persistencia.v2
  );
  const recuperavel = Boolean(
    operacao &&
    (
      operacao.status === STATUS_OPERACAO_ERRO_ ||
      operacao.status === STATUS_OPERACAO_PROCESSANDO_ ||
      (operacao.status === STATUS_OPERACAO_CONCLUIDO_ && !operacaoCompleta)
    )
  );
  const duplicado = operacao ? operacaoCompleta : existente;
  const pedidosPendentes = obterPedidosPendentesFechamentoEliel_(mes, ano);
  return {
    chave: relatorio.chave,
    duplicado: duplicado,
    recuperavel: recuperavel,
    statusOperacao: operacao ? operacao.status : "",
    pedidosPendentes: pedidosPendentes,
    podeFechar: !duplicado && pedidosPendentes === 0,
    relatorio: relatorio
  };
}
function obterPreviaFechamentoRelatorioEliel(mes, ano, catalogoJSON) {
  return JSON.stringify(montarPreviaFechamentoRelatorioEliel_(mes, ano, catalogoJSON));
}
function garantirRegistroRelatorioEliel_(dados, responsavel) {
  const aba = obterAbaRelatorioEliel_();
  if (localizarLinhaPorChave_(aba, 1, dados.chave)) return false;
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
    (dados.top3 || []).map(function(item) {
      return item.produto + " (" + item.quantidade + ")";
    }).join(" | "),
    (dados.menosVendidas || []).map(function(item) {
      return item.produto + " (" + item.quantidade + ")";
    }).join(" | "),
    JSON.stringify(dados),
    responsavel
  ]);
  return true;
}
function garantirRegistroFechamentoMensalV2_(dados, idOperacao) {
  const aba = obterAbaFechamentosMensaisV2_(true);
  if (localizarLinhaPorChave_(aba, 1, dados.chave)) return false;
  aba.appendRow([
    dados.chave,
    dados.faturamento,
    dados.totalTapiocas,
    dados.distribuicao.compra,
    dados.distribuicao.lucas,
    dados.distribuicao.eliel,
    idOperacao,
    new Date()
  ]);
  return true;
}
function garantirLogFechamentoEliel_(chave, responsavel) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let log = ss.getSheetByName("Log Relatorio Eliel");
  if (!log) {
    log = ss.insertSheet("Log Relatorio Eliel");
    log.appendRow(["Data e hora", "Evento", "Mês referência", "Responsável"]);
  } else if (log.getLastColumn() < 4) {
    log.getRange(1, 4).setValue("Responsável");
  }
  if (log.getLastRow() > 1) {
    const dados = log.getRange(2, 1, log.getLastRow() - 1, 4).getDisplayValues();
    const existente = dados.some(function(linha) {
      return String(linha[1]) === "FECHAMENTO DO MÊS" &&
        normalizarReferenciaFechamentoMensal_(linha[2]) === chave;
    });
    if (existente) return false;
  }
  log.appendRow([new Date(), "FECHAMENTO DO MÊS", chave, responsavel]);
  return true;
}
function fecharMesRelatorioEliel(mes, ano, catalogoJSON, responsavel) {
  const lock = LockService.getDocumentLock();
  let chaveOperacao = "";
  try {
    lock.waitLock(15000);
    if (responsavel !== NOME_PERFIL_ELIEL_) {
      throw new Error("O fechamento mensal é exclusivo do perfil CEO Eliel.");
    }
    const previa = montarPreviaFechamentoRelatorioEliel_(mes, ano, catalogoJSON);
    if (previa.duplicado) {
      throw new Error("O mês " + previa.chave + " já foi fechado.");
    }
    if (previa.pedidosPendentes > 0) {
      throw new Error(
        "Existem " + previa.pedidosPendentes +
        " pedido(s) pendente(s) no mês " + previa.chave +
        ". Finalize-os no PDV antes de fechar esse período."
      );
    }
    const dados = previa.relatorio;
    chaveOperacao = dados.chave;
    const idOperacao = atualizarEstadoOperacaoFechamento_(
      dados.chave,
      STATUS_OPERACAO_PROCESSANDO_,
      previa.recuperavel ? "Retomada segura do fechamento." : "Fechamento iniciado."
    );

    garantirRegistroRelatorioEliel_(dados, responsavel);
    garantirRegistroFechamentoMensalV2_(dados, idOperacao);
    garantirLogFechamentoEliel_(dados.chave, responsavel);

    obterScriptProperties_().setProperty(
      "pdv_aviso_pendente",
      "O mês " + dados.chave + " foi fechado no Relatório Eliel. Os pedidos do mês atual permanecem ativos."
    );
    atualizarEstadoOperacaoFechamento_(
      dados.chave,
      STATUS_OPERACAO_CONCLUIDO_,
      previa.recuperavel ? "Fechamento recuperado e concluído." : "Fechamento concluído."
    );
    return JSON.stringify({
      ok: true,
      chave: dados.chave,
      operacao: idOperacao,
      recuperado: previa.recuperavel
    });
  } catch (erro) {
    if (chaveOperacao) {
      try {
        atualizarEstadoOperacaoFechamento_(
          chaveOperacao,
          STATUS_OPERACAO_ERRO_,
          erro && erro.message ? erro.message : String(erro)
        );
      } catch (erroControle) {
        console.error("Falha ao registrar o estado do fechamento:", erroControle);
      }
    }
    throw erro;
  } finally {
    lock.releaseLock();
  }
}
