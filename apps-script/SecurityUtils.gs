// =========================================================
// P5 — UTILITÁRIOS DE SEGURANÇA
// Funções internas compartilhadas. Contratos públicos permanecem em Code.gs.
// =========================================================

function obterDiaSessaoAdmin_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
}

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

function criarSessaoAcesso_(perfil, nome) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  const sessao = {
    criadoEm: Date.now(),
    dia: obterDiaSessaoAdmin_(),
    perfil: perfil,
    nome: nome
  };
  CacheService.getScriptCache().put(
    CHAVE_SESSAO_ADMIN_ + hashSeguro_(token),
    JSON.stringify(sessao),
    DURACAO_INATIVIDADE_ADMIN_SEGUNDOS_
  );
  return {
    token: token,
    diaSessao: sessao.dia,
    inatividadeSegundos: DURACAO_INATIVIDADE_ADMIN_SEGUNDOS_,
    expiraEm: Date.now() + DURACAO_INATIVIDADE_ADMIN_SEGUNDOS_ * 1000,
    perfil: perfil,
    nome: nome
  };
}

function obterSessaoAcesso_(token, renovar) {
  if (!token) return false;
  const cache = CacheService.getScriptCache();
  const chave = CHAVE_SESSAO_ADMIN_ + hashSeguro_(token);
  const sessaoSalva = cache.get(chave);
  if (!sessaoSalva) return false;

  let sessao;
  try {
    sessao = JSON.parse(sessaoSalva);
  } catch (erro) {
    cache.remove(chave);
    return false;
  }

  if (!sessao || sessao.dia !== obterDiaSessaoAdmin_()) {
    cache.remove(chave);
    return false;
  }

  if (renovar !== false) {
    cache.put(chave, sessaoSalva, DURACAO_INATIVIDADE_ADMIN_SEGUNDOS_);
  }
  return {
    perfil: sessao.perfil || "admin",
    nome: sessao.nome || "Administrador",
    diaSessao: sessao.dia,
    inatividadeSegundos: DURACAO_INATIVIDADE_ADMIN_SEGUNDOS_
  };
}

function exigirSessaoAdministrador_(token) {
  const sessao = obterSessaoAcesso_(token, true);
  if (!sessao || sessao.perfil !== "admin") {
    throw erroApi_("AUTH_REQUIRED", "Acesso administrativo não autorizado.");
  }
  return sessao;
}
