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

function loginAcesso(pin, perfilSolicitado) {
  const cache = CacheService.getScriptCache();
  const tentativas = Number(cache.get(CHAVE_TENTATIVAS_LOGIN_) || 0);
  if (tentativas >= 5) {
    throw erroApi_(
      "LOGIN_BLOCKED",
      "Muitas tentativas de acesso. Aguarde 10 minutos e tente novamente."
    );
  }

  let perfil = String(perfilSolicitado || "admin").toLowerCase() === "eliel"
    ? "eliel"
    : "admin";
  const propriedades = obterScriptProperties_();
  const hashInformado = hashSeguro_(pin);
  let chavePin = perfil === "eliel" ? CHAVE_PIN_ELIEL_ : CHAVE_PIN_ADMIN_;
  let hashConfigurado = propriedades.getProperty(chavePin);
  if (!hashConfigurado) {
    throw erroApi_(
      perfil === "eliel" ? "ELIEL_NOT_CONFIGURED" : "ADMIN_NOT_CONFIGURED",
      perfil === "eliel"
        ? "O PIN do CEO Eliel ainda não foi configurado no Apps Script."
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

  if (hashInformado !== hashConfigurado) {
    cache.put(CHAVE_TENTATIVAS_LOGIN_, String(tentativas + 1), 600);
    throw erroApi_("INVALID_CREDENTIALS", "PIN inválido.");
  }

  cache.remove(CHAVE_TENTATIVAS_LOGIN_);
  return criarSessaoAcesso_(
    perfil,
    perfil === "eliel" ? NOME_PERFIL_ELIEL_ : "Administrador"
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
