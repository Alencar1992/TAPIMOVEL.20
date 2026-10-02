// =========================================================
// P6 — SERVIÇO DE AUTENTICAÇÃO
// PINs, login e contratos públicos de sessão. Helpers internos ficam em SecurityUtils.gs.
// =========================================================

function configurarPinAdministrador(pin) {
  const valor = String(pin || "");
  if (!/^\d{6,12}$/.test(valor)) {
    throw new Error("O PIN administrativo deve conter de 6 a 12 números.");
  }
  obterScriptProperties_().setProperty(CHAVE_PIN_ADMIN_, hashSeguro_(valor));
  CacheService.getScriptCache().remove(chaveTentativasLoginPerfil_("admin"));
  return "PIN administrativo configurado com sucesso.";
}

function configurarPinEliel(pin) {
  const valor = String(pin || "");
  if (!/^\d{6,12}$/.test(valor)) {
    throw new Error("O PIN do CEO Eliel deve conter de 6 a 12 números.");
  }
  obterScriptProperties_().setProperty(CHAVE_PIN_ELIEL_, hashSeguro_(valor));
  CacheService.getScriptCache().remove(chaveTentativasLoginPerfil_("eliel"));
  return "PIN do CEO Eliel configurado com sucesso.";
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
    hash: derivarPinProducao_(valor, salt)
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
  const perfilPedidoRaw = String(perfilSolicitado || "admin").toLowerCase();
  const perfilPedido = perfilPedidoRaw === "eliel" || perfilPedidoRaw === "producao"
    ? perfilPedidoRaw
    : "admin";
  const propriedades = obterScriptProperties_();
  const hashInformado = hashSeguro_(pin);

  const hashAdmin = propriedades.getProperty(CHAVE_PIN_ADMIN_);
  const hashEliel = propriedades.getProperty(CHAVE_PIN_ELIEL_);
  const credencialProducaoConfigurada = propriedades.getProperty(CHAVE_CREDENCIAL_PIN_PRODUCAO_);

  if (
    (perfilPedido === "admin" && !hashAdmin) ||
    (perfilPedido === "eliel" && !hashEliel) ||
    (perfilPedido === "producao" && !credencialProducaoConfigurada)
  ) {
    throw erroApi_(
      perfilPedido === "eliel"
        ? "ELIEL_NOT_CONFIGURED"
        : perfilPedido === "producao"
          ? "PRODUCAO_NOT_CONFIGURED"
          : "ADMIN_NOT_CONFIGURED",
      perfilPedido === "eliel"
        ? "O PIN do CEO Eliel ainda não foi configurado no Apps Script."
        : perfilPedido === "producao"
          ? "O PIN de Produção ainda não foi configurado."
          : "O PIN administrativo ainda não foi configurado no Apps Script."
    );
  }

  let perfilAutenticado = null;
  if (perfilPedido === "eliel") {
    if (hashInformado === hashEliel) perfilAutenticado = "eliel";
  } else if (perfilPedido === "producao") {
    if (pinProducaoConfere_(pin, propriedades)) perfilAutenticado = "producao";
  } else {
    if (hashInformado === hashAdmin) {
      perfilAutenticado = "admin";
    } else if (hashEliel && hashInformado === hashEliel) {
      perfilAutenticado = "eliel";
    } else if (credencialProducaoConfigurada && pinProducaoConfere_(pin, propriedades)) {
      perfilAutenticado = "producao";
    }
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
    perfilAutenticado === "eliel"
      ? NOME_PERFIL_ELIEL_
      : perfilAutenticado === "producao"
        ? NOME_PERFIL_PRODUCAO_
        : "Administrador"
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
