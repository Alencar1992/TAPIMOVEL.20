// =========================================================
// ACESSO FINANCEIRO PROTEGIDO
// PIN derivado no servidor, tentativas por sessão e tickets por área.
// =========================================================

const CHAVE_PIN_AREAS_FINANCEIRAS_ = "pdv_finance_access_pin_v1";
const CHAVE_TENTATIVAS_PIN_FINANCEIRO_ = "pdv_finance_attempts_v1";
const PREFIXO_TICKET_FINANCEIRO_ = "pdv_finance_ticket_";
const ITERACOES_PIN_FINANCEIRO_ = 2000;
const DURACAO_BLOQUEIO_PIN_FINANCEIRO_SEGUNDOS_ = 600;
const DURACAO_TICKET_FINANCEIRO_SEGUNDOS_ = 600;

const AREAS_FINANCEIRAS_ = {
  liquidez: true,
  gestao: true,
  rankings: true
};

const AREA_POR_ACAO_FINANCEIRA_ = {
  obterResumoMesPlanilha: "liquidez",
  calcularEstimativaSalarioLucas: "gestao",
  registrarDiaSemTrabalhoPlanilha: "gestao",
  buscarFolgasBackend: "gestao",
  salvarCombustivelPlanilha: "gestao",
  buscarHistoricoCombustivel: "gestao",
  buscarRankingRotasBackend: "rankings",
  buscarTopProdutosBackend: "rankings",
  buscarDadosEspelhoBackend: "liquidez"
};

const ARGUMENTOS_POR_ACAO_FINANCEIRA_ = {
  obterResumoMesPlanilha: 0,
  calcularEstimativaSalarioLucas: 0,
  registrarDiaSemTrabalhoPlanilha: 1,
  buscarFolgasBackend: 2,
  salvarCombustivelPlanilha: 1,
  buscarHistoricoCombustivel: 2,
  buscarRankingRotasBackend: 2,
  buscarTopProdutosBackend: 2,
  buscarDadosEspelhoBackend: 1
};

const AREA_POR_ABA_ESPELHO_ = {
  "Fechamentos_Diarios": "liquidez",
  "Fechamentos_Mensais": "liquidez",
  "Liquidez Mensal": "liquidez",
  "Combustivel": "gestao",
  "Dias_Nao_Trabalhados": "gestao",
  "Tapiocas Diária": "rankings",
  "Base de Vendas": "rankings",
  "Historico_Diario": "rankings",
  "Vendas_hoje": "rankings",
  "Resumo Semanal": "rankings",
  "Pedidos Cancelados": "rankings"
};

function normalizarAreaFinanceira_(area) {
  const normalizada = String(area || "").trim().toLowerCase();
  if (!AREAS_FINANCEIRAS_[normalizada]) {
    throw erroApi_("INVALID_FINANCE_AREA", "Área financeira inválida.");
  }
  return normalizada;
}

function derivarHashPinFinanceiro_(pin, salt, iterations) {
  let resultado = String(salt || "") + ":" + String(pin || "");
  const total = Math.max(1000, Number(iterations) || ITERACOES_PIN_FINANCEIRO_);
  for (let indice = 0; indice < total; indice += 1) {
    resultado = hashSeguro_(String(salt || "") + ":" + resultado);
  }
  return resultado;
}

function exigirAdministradorFinanceiro_(token) {
  const sessao = obterSessaoAcesso_(token, true);
  if (!sessao || sessao.perfil !== "admin") {
    throw erroApi_("PERMISSION_DENIED", "Somente o administrador pode gerenciar este acesso.");
  }
  return sessao;
}

function configurarPinAreasFinanceiras(pin, token) {
  exigirAdministradorFinanceiro_(token);
  const valor = String(pin || "").trim();
  if (!/^\d{4}$/.test(valor)) {
    throw erroApi_("INVALID_FINANCE_PIN_FORMAT", "O PIN deve conter exatamente 4 números.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const salt = Utilities.getUuid().replace(/-/g, "").toLowerCase();
    const registro = {
      version: 1,
      revision: Utilities.getUuid(),
      salt: salt,
      iterations: ITERACOES_PIN_FINANCEIRO_,
      hash: derivarHashPinFinanceiro_(valor, salt, ITERACOES_PIN_FINANCEIRO_)
    };
    const properties = obterScriptProperties_();
    properties.setProperty(
      CHAVE_PIN_AREAS_FINANCEIRAS_,
      JSON.stringify(registro)
    );
    properties.deleteProperty(CHAVE_TENTATIVAS_PIN_FINANCEIRO_);
    return { configurado: true };
  } finally {
    lock.releaseLock();
  }
}

function obterStatusPinAreasFinanceiras(token) {
  exigirAdministradorFinanceiro_(token);
  return {
    configurado: Boolean(
      obterScriptProperties_().getProperty(CHAVE_PIN_AREAS_FINANCEIRAS_)
    )
  };
}

function chaveTicketFinanceiro_(ticket) {
  return PREFIXO_TICKET_FINANCEIRO_ + hashSeguro_(ticket);
}

function autorizarAreaFinanceira(pin, area, token) {
  exigirAdministradorFinanceiro_(token);
  const areaNormalizada = normalizarAreaFinanceira_(area);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = obterScriptProperties_();
    const agora = Date.now();
    let tentativas = { quantidade: 0, expiraEm: 0 };
    try {
      tentativas = JSON.parse(
        properties.getProperty(CHAVE_TENTATIVAS_PIN_FINANCEIRO_) || "{}"
      );
    } catch (_) {}
    if (Number(tentativas.expiraEm || 0) <= agora) {
      tentativas = { quantidade: 0, expiraEm: 0 };
      properties.deleteProperty(CHAVE_TENTATIVAS_PIN_FINANCEIRO_);
    }
    if (Number(tentativas.quantidade || 0) >= 5) {
      throw erroApi_(
        "FINANCE_PIN_BLOCKED",
        "Muitas tentativas. Aguarde 10 minutos e tente novamente."
      );
    }

    const salvo = properties.getProperty(CHAVE_PIN_AREAS_FINANCEIRAS_);
    if (!salvo) {
      throw erroApi_(
        "FINANCE_PIN_NOT_CONFIGURED",
        "O PIN das áreas financeiras ainda não foi configurado."
      );
    }

    let registro;
    try {
      registro = JSON.parse(salvo);
    } catch (_) {
      throw erroApi_("FINANCE_PIN_CONFIG_INVALID", "A configuração do PIN está inválida.");
    }
    const hashInformado = derivarHashPinFinanceiro_(
      String(pin || ""),
      registro.salt,
      registro.iterations
    );
    if (hashInformado !== registro.hash) {
      properties.setProperty(
        CHAVE_TENTATIVAS_PIN_FINANCEIRO_,
        JSON.stringify({
          quantidade: Number(tentativas.quantidade || 0) + 1,
          expiraEm: Number(tentativas.expiraEm || 0) > agora
            ? Number(tentativas.expiraEm)
            : agora + DURACAO_BLOQUEIO_PIN_FINANCEIRO_SEGUNDOS_ * 1000
        })
      );
      throw erroApi_("INVALID_FINANCE_PIN", "PIN inválido.");
    }

    properties.deleteProperty(CHAVE_TENTATIVAS_PIN_FINANCEIRO_);
    const cache = CacheService.getScriptCache();
    const ticket = Utilities.getUuid() + Utilities.getUuid();
    cache.put(
      chaveTicketFinanceiro_(ticket),
      JSON.stringify({
        area: areaNormalizada,
        sessao: hashSeguro_(token),
        pinRevision: registro.revision || registro.salt
      }),
      DURACAO_TICKET_FINANCEIRO_SEGUNDOS_
    );
    return {
      area: areaNormalizada,
      ticket: ticket,
      expiraEm: agora + DURACAO_TICKET_FINANCEIRO_SEGUNDOS_ * 1000
    };
  } finally {
    lock.releaseLock();
  }
}

function obterAreaProtegidaDaAcao_(action, argumentos) {
  const nomeAcao = String(action || "");
  if (nomeAcao === "buscarDadosEspelhoBackend") {
    const nomeAba = String(
      Array.isArray(argumentos) && argumentos.length ? argumentos[0] : ""
    );
    return AREA_POR_ABA_ESPELHO_[nomeAba] || "liquidez";
  }
  return AREA_POR_ACAO_FINANCEIRA_[nomeAcao] || "";
}

function obterQuantidadeArgumentosAcaoFinanceira_(action) {
  return Number(ARGUMENTOS_POR_ACAO_FINANCEIRA_[String(action || "")] || 0);
}

function exigirTicketAreaFinanceira_(token, area, ticket) {
  if (!ticket) {
    throw erroApi_("FINANCE_PIN_REQUIRED", "Informe o PIN para acessar esta área.");
  }
  const salvo = CacheService.getScriptCache().get(chaveTicketFinanceiro_(ticket));
  if (!salvo) {
    throw erroApi_("FINANCE_TICKET_INVALID", "A autorização expirou. Informe o PIN novamente.");
  }

  let autorizacao;
  try {
    autorizacao = JSON.parse(salvo);
  } catch (_) {
    autorizacao = null;
  }
  let pinAtual = null;
  try {
    pinAtual = JSON.parse(
      obterScriptProperties_().getProperty(CHAVE_PIN_AREAS_FINANCEIRAS_) || "null"
    );
  } catch (_) {}
  if (
    !autorizacao ||
    !pinAtual ||
    autorizacao.area !== normalizarAreaFinanceira_(area) ||
    autorizacao.sessao !== hashSeguro_(token) ||
    autorizacao.pinRevision !== (pinAtual.revision || pinAtual.salt)
  ) {
    throw erroApi_("FINANCE_TICKET_INVALID", "A autorização não pertence a esta área.");
  }
  return true;
}
