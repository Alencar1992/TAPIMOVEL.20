// =========================================================
// P6 — CAMADA DE API
// Entrada HTTP, roteamento seguro de ações e resposta JSON.
// =========================================================

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action) {
      const permitidasViaGet = [
        "obterDisponibilidadeCardapio",
        "obterCatalogoCardapio",
        "obterStatusCardapio",
        "obterConfiguracaoOperacional"
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

function executarAcaoApi_(action, args, token) {
  const acoesPublicas = [
    "obterDisponibilidadeCardapio",
    "obterCatalogoCardapio",
    "obterStatusCardapio",
    "registrarPedidoOnline",
    "registrarFalhaSistema",
    "obterConfiguracaoOperacional",
    "loginAcesso",
    "loginAdministrador",
    "validarSessaoAcesso",
    "validarSessaoAdministrador",
    "encerrarSessaoAdministrador"
  ];

  const acoesProducao = [
    "listarPedidosOnlinePendentes",
    "aceitarPedidoOnline",
    "recusarPedidoOnline",
    "obterBuildPdv",
    "carregarDadosNuvem",
    "carregarVendasHojePersistidas",
    "registrarPedidoPdv",
    "atualizarPedidoPdv",
    "atualizarEstadoProducao",
    "finalizarPagamentoProducao",
    "consultarPagamentoProducao",
    "cancelarPedidoProducao",
    "excluirPedidoTravadoProducao",
    "salvarDisponibilidadeCardapio"
  ];

  const acoesAdministrativas = [
    "listarPedidosOnlinePendentes",
    "aceitarPedidoOnline",
    "recusarPedidoOnline",
    "obterBuildPdv",
    "carregarDadosNuvem",
    "carregarVendasHojePersistidas",
    "registrarVendaHojeAdmin",
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
    "obterLiquidezMensalPdv",
    "calcularEstimativaSalarioLucas",
    "registrarDiaSemTrabalhoPlanilha",
    "buscarFolgasBackend",
    "salvarCombustivelPlanilha",
    "buscarHistoricoCombustivel",
    "buscarRankingRotasBackend",
    "buscarTopProdutosBackend",
    "buscarDadosEspelhoBackend",
    "salvarFechamentoDiaPlanilha",
    "obterStatusFechamentoDiario",
    "obterPreviaFechamentoDiario",
    "listarFechamentosDiarios",
    "obterPrintFechamentoDiario",
    "fecharDiaSeguro",
    "salvarDisponibilidadeCardapio",
    "inicializarCatalogoConfiguracao",
    "salvarItemCatalogo",
    "removerItemCatalogo",
    "salvarConfiguracaoOperacional",
    "excluirContadorTapiocasHoje",
    "obterRelatorioEliel",
    "registrarAcessoRelatorioEliel",
    "obterConfiguracoesRelatorioEliel",
    "obterHistoricoVendasEliel",
    "salvarConfiguracoesRelatorioEliel",
    "obterPreviaFechamentoRelatorioEliel",
    "fecharMesRelatorioEliel",
    "obterAvisosPdv",
    "configurarPinProducao",
    "alterarPinAdministrador",
    "atualizarEstadoProducao",
    "finalizarPagamentoProducao",
    "consultarPagamentoProducao",
    "cancelarPedidoProducao",
    "excluirPedidoTravadoProducao"
  ];

  const permitidas = acoesPublicas.concat(acoesAdministrativas);
  if (!action || permitidas.indexOf(action) === -1) {
    throw erroApi_("ACTION_NOT_ALLOWED", "Ação não permitida: " + action);
  }

  if (acoesAdministrativas.indexOf(action) !== -1) {
    const sessao = obterSessaoAcesso_(token, true);
    if (!sessao) {
      throw erroApi_("AUTH_REQUIRED", "Acesso não autorizado.");
    }
    const permitidoParaProducao = sessao.perfil === "producao" && acoesProducao.indexOf(action) !== -1;
    if (sessao.perfil !== "admin" && !permitidoParaProducao) {
      throw erroApi_("PERMISSION_DENIED", "O perfil " + sessao.nome + " não possui permissão para esta ação.");
    }
    if (action === "fecharMesRelatorioEliel") {
      args[3] = NOME_PERFIL_ADMIN_;
    }
    if (action === "alterarPinAdministrador") {
      return { ok: true, data: alterarPinAdministrador_(token, args[0], args[1]) };
    }
    if (sessao.perfil === "producao" && action === "salvarDisponibilidadeCardapio") {
      args[1] = NOME_PERFIL_PRODUCAO_;
    }
    if (action === "atualizarPedidoPdv") {
      args[1] = sessao.perfil === "producao";
    }
  }

  const fn = action === "obterConfiguracaoOperacional"
    ? this.obterConfiguracaoOperacionalConfiavel_
    : action === "obterStatusCardapio"
      ? this.obterStatusCardapioConfiavel_
      : this[action];
  if (typeof fn !== "function") {
    throw erroApi_("ACTION_NOT_FOUND", "Função não encontrada no backend: " + action);
  }

  const argumentos = Array.isArray(args) ? args : [];
  if (
    action === "validarSessaoAcesso" ||
    action === "validarSessaoAdministrador" ||
    action === "encerrarSessaoAdministrador"
  ) {
    return { ok: true, data: fn.call(this, token) };
  }
  return { ok: true, data: fn.apply(this, argumentos) };
}

function responderApi_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function obterBuildPdv() {
  const data = "__DATA_BUILD_PDV__";
  return {
    versao: "V2.0.0.71",
    data: /^\d{2}\/\d{2}\/\d{4}$/.test(data) ? data : "",
    novidades: [
      "PDV ADM com o PIN atual, alteração de PIN em Configuração e acesso ao fechamento do Relatório Eliel.",
      "Histórico de Fechamento Diário dentro de Fechamento.",
      "Identidade TAPIMOVEL em 3D e botões com relevo no PDV, na Produção e no cardápio do cliente.",
      "Edição por bloco na Liquidez Mensal e nova mensagem na fila de Produção."
    ]
  };
}
