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
  CacheService.getScriptCache().remove(CHAVE_TENTATIVAS_LOGIN_);
  return "PIN administrativo configurado com sucesso.";
}

function configurarPinEliel(pin) {
  const valor = String(pin || "");
  if (!/^\d{6,12}$/.test(valor)) {
    throw new Error("O PIN do CEO Eliel deve conter de 6 a 12 números.");
  }
  obterScriptProperties_().setProperty(CHAVE_PIN_ELIEL_, hashSeguro_(valor));
  CacheService.getScriptCache().remove(CHAVE_TENTATIVAS_LOGIN_);
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
    CacheService.getScriptCache().remove(CHAVE_TENTATIVAS_LOGIN_);
  } finally {
    lock.releaseLock();
  }
  return "PIN de Produção configurado com sucesso.";
}

function loginAcesso(pin, perfilSolicitado) {
  const cache = CacheService.getScriptCache();
  const tentativas = Number(cache.get(CHAVE_TENTATIVAS_LOGIN_) || 0);
  if (tentativas >= 5) {
    throw erroApi_(
      "LOGIN_BLOCKED",
      "Muitas tentativas de acesso. Aguarde 10 minutos e tente novamente."
    );
  }

  const perfilPedido = String(perfilSolicitado || "admin").toLowerCase();
  let perfil = perfilPedido === "eliel" || perfilPedido === "producao"
    ? perfilPedido
    : "admin";
  const propriedades = obterScriptProperties_();
  const hashInformado = hashSeguro_(pin);
  let chavePin = perfil === "eliel"
    ? CHAVE_PIN_ELIEL_
    : perfil === "producao"
      ? CHAVE_CREDENCIAL_PIN_PRODUCAO_
      : CHAVE_PIN_ADMIN_;
  let hashConfigurado = propriedades.getProperty(chavePin);
  if (!hashConfigurado) {
    throw erroApi_(
      perfil === "eliel"
        ? "ELIEL_NOT_CONFIGURED"
        : perfil === "producao"
          ? "PRODUCAO_NOT_CONFIGURED"
          : "ADMIN_NOT_CONFIGURED",
      perfil === "eliel"
        ? "O PIN do CEO Eliel ainda não foi configurado no Apps Script."
        : perfil === "producao"
          ? "O PIN de Produção ainda não foi configurado."
          : "O PIN administrativo ainda não foi configurado no Apps Script."
    );
  }

  if (
    perfil === "admin" &&
    hashInformado !== hashConfigurado &&
    hashInformado === propriedades.getProperty(CHAVE_PIN_ELIEL_)
  ) {
    perfil = "eliel";
    chavePin = CHAVE_PIN_ELIEL_;
    hashConfigurado = propriedades.getProperty(chavePin);
  }

  if (
    perfil === "admin" &&
    hashInformado !== hashConfigurado &&
    pinProducaoConfere_(pin, propriedades)
  ) {
    perfil = "producao";
    chavePin = CHAVE_CREDENCIAL_PIN_PRODUCAO_;
    hashConfigurado = propriedades.getProperty(chavePin);
  }

  const credencialValida = perfil === "producao"
    ? pinProducaoConfere_(pin, propriedades)
    : hashInformado === hashConfigurado;
  if (!credencialValida) {
    cache.put(CHAVE_TENTATIVAS_LOGIN_, String(tentativas + 1), 600);
    throw erroApi_("INVALID_CREDENTIALS", "PIN inválido.");
  }

  cache.remove(CHAVE_TENTATIVAS_LOGIN_);

  if (perfil === "admin" && typeof garantirTriggerFechamentoDiarioAutomatico_ === "function") {
    try {
      garantirTriggerFechamentoDiarioAutomatico_();
    } catch (erroTrigger) {
      registrarErroAplicacao_("auth.trigger_fechamento_diario", erroTrigger);
    }
  }

  return criarSessaoAcesso_(
    perfil,
    perfil === "eliel"
      ? NOME_PERFIL_ELIEL_
      : perfil === "producao"
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
