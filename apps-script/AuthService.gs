// =========================================================
// P6 — SERVIÇO DE AUTENTICAÇÃO
// PINs, login e contratos públicos de sessão. Helpers internos ficam em SecurityUtils.gs.
// =========================================================

function configurarPinAdministrador(pin) {
  const valor = String(pin || "");
  if (!/^\d{6,12}$/.test(valor)) {
    throw new Error("O PIN administrativo deve conter de 6 a 12 números.");
  }
  salvarCredencialAdmin_(valor);
  return "PIN do PDV ADM configurado com sucesso.";
}

function salvarCredencialAdmin_(pin) {
  const salt = Utilities.getUuid() + Utilities.getUuid();
  const credencial = JSON.stringify({
    salt: salt,
    hash: derivarPin_(pin, salt),
    revisao: Utilities.getUuid()
  });
  obterScriptProperties_().setProperty(CHAVE_PIN_ADMIN_, credencial);
  const cache = CacheService.getScriptCache();
  cache.remove(chaveTentativasLoginPerfil_("admin"));
  cache.remove(chaveTentativasLoginPerfil_("alterar-admin"));
}

function alterarPinAdministrador_(token, pinAtual, novoPin) {
  const atual = String(pinAtual || "");
  const novo = String(novoPin || "");
  if (!/^\d{6,12}$/.test(novo) || atual === novo) {
    throw erroApi_("INVALID_PIN", "Escolha um PIN diferente com 6 a 12 números.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    exigirSessaoAdministrador_(token);
    const cache = CacheService.getScriptCache();
    bloquearSeExcedeuTentativasLogin_(cache, "alterar-admin");
    const credencial = obterCredencialAdmin_();
    if (!pinAdminConfere_(atual, credencial)) {
      registrarTentativaLoginInvalida_(cache, "alterar-admin");
      throw erroApi_("INVALID_CREDENTIALS", "O PIN atual está incorreto.");
    }
    salvarCredencialAdmin_(novo);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function configurarPinProducao(pin) {
  const valor = String(pin || "");
  if (!/^\d{4}$/.test(valor)) {
    throw new Error("O PIN de Produção deve conter exatamente 4 números.");
  }
  const propriedades = obterScriptProperties_();
  const salt = Utilities.getUuid() + Utilities.getUuid();
  const credencial = JSON.stringify({
    versao: 1,
    salt: salt,
    hash: derivarPin_(valor, salt)
  });
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    propriedades.setProperty(CHAVE_CREDENCIAL_PIN_PRODUCAO_, credencial);
    CacheService.getScriptCache().remove(chaveTentativasLoginPerfil_("producao"));
  } finally {
    lock.releaseLock();
  }
  return "PIN de Produção configurado com sucesso.";
}

function chaveTentativasLoginPerfil_(perfil) {
  return CHAVE_TENTATIVAS_LOGIN_ + ":" + String(perfil || "admin").toLowerCase();
}

function obterTentativasLoginPerfil_(cache, perfil) {
  return Number(cache.get(chaveTentativasLoginPerfil_(perfil)) || 0);
}

function bloquearSeExcedeuTentativasLogin_(cache, perfil) {
  if (obterTentativasLoginPerfil_(cache, perfil) >= 5) {
    throw erroApi_(
      "LOGIN_BLOCKED",
      "Muitas tentativas de acesso. Aguarde 10 minutos e tente novamente."
    );
  }
}

function registrarTentativaLoginInvalida_(cache, perfil) {
  const chave = chaveTentativasLoginPerfil_(perfil);
  const tentativas = obterTentativasLoginPerfil_(cache, perfil);
  cache.put(chave, String(tentativas + 1), 600);
}

function loginAcesso(pin, perfilSolicitado) {
  const cache = CacheService.getScriptCache();
  const perfilPedido = String(perfilSolicitado || "admin").toLowerCase();
  if (perfilPedido !== "admin" && perfilPedido !== "producao") {
    throw erroApi_("PERMISSION_DENIED", "Use o acesso do PDV ADM ou de Produção.");
  }
  const propriedades = obterScriptProperties_();
  const credencialAdmin = perfilPedido === "admin" ? obterCredencialAdmin_(propriedades) : null;
  const credencialProducao = propriedades.getProperty(CHAVE_CREDENCIAL_PIN_PRODUCAO_);

  if (perfilPedido === "admin" && !credencialAdmin) {
    throw erroApi_("ADMIN_NOT_CONFIGURED", "O PIN do PDV ADM ainda não foi configurado no Apps Script.");
  }
  if (perfilPedido === "producao" && !credencialProducao) {
    throw erroApi_("PRODUCAO_NOT_CONFIGURED", "O PIN de Produção ainda não foi configurado.");
  }

  let perfilAutenticado = null;
  if (pinAdminConfere_(pin, credencialAdmin)) {
    perfilAutenticado = "admin";
  } else if (credencialProducao && /^\d{4}$/.test(String(pin)) && pinProducaoConfere_(pin, propriedades)) {
    perfilAutenticado = "producao";
  }

  if (!perfilAutenticado) {
    bloquearSeExcedeuTentativasLogin_(cache, perfilPedido);
    registrarTentativaLoginInvalida_(cache, perfilPedido);
    throw erroApi_("INVALID_CREDENTIALS", "PIN inválido.");
  }

  bloquearSeExcedeuTentativasLogin_(cache, perfilAutenticado);
  cache.remove(chaveTentativasLoginPerfil_(perfilAutenticado));

  if (perfilAutenticado === "admin" && typeof garantirTriggerFechamentoDiarioAutomatico_ === "function") {
    try {
      garantirTriggerFechamentoDiarioAutomatico_();
    } catch (erroTrigger) {
      registrarErroAplicacao_("auth.trigger_fechamento_diario", erroTrigger);
    }
  }

  return criarSessaoAcesso_(
    perfilAutenticado,
    perfilAutenticado === "producao" ? NOME_PERFIL_PRODUCAO_ : NOME_PERFIL_ADMIN_,
    perfilAutenticado === "admin" ? credencialAdmin.revisao : undefined
  );
}

function loginAdministrador(pin) {
  return loginAcesso(pin, "admin");
}

function validarSessaoAcesso(token) {
  return obterSessaoAcesso_(token, true);
}

function validarSessaoAdministrador(token) {
  const sessao = obterSessaoAcesso_(token, true);
  return Boolean(sessao && sessao.perfil === "admin");
}

function encerrarSessaoAdministrador(token) {
  if (token) {
    CacheService.getScriptCache().remove(CHAVE_SESSAO_ADMIN_ + hashSeguro_(token));
  }
  return true;
}
