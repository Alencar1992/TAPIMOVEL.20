// =========================================================
// P5 — UTILITÁRIOS DE SEGURANÇA
// Funções internas compartilhadas. Contratos públicos permanecem em Code.gs.
// =========================================================

function obterDiaSessaoAdmin_() {
  return formatarDataAplicacao_(new Date(), "yyyy-MM-dd");
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

function derivarPin_(pin, salt) {
  let derivado = String(pin || "");
  const saltNormalizado = String(salt || "");
  for (let indice = 0; indice < ITERACOES_PIN_; indice++) {
    derivado = hashSeguro_(saltNormalizado + ":" + derivado + ":" + indice);
  }
  return derivado;
}

function obterCredencialAdmin_(propriedades) {
  const valor = (propriedades || obterScriptProperties_()).getProperty(CHAVE_PIN_ADMIN_);
  if (!valor) return null;
  if (/^[0-9a-f]{64}$/.test(valor)) return { hash: valor, revisao: "" };
  try {
    const credencial = JSON.parse(valor);
    if (credencial && credencial.salt && credencial.hash && credencial.revisao) return credencial;
  } catch (_) {
    return null;
  }
  return null;
}

function pinAdminConfere_(pin, credencial) {
  if (!credencial || !/^\d{6,12}$/.test(String(pin))) return false;
  const hash = credencial.salt ? derivarPin_(pin, credencial.salt) : hashSeguro_(pin);
  return hash === credencial.hash;
}

function pinProducaoConfere_(pin, propriedades) {
  const repositorio = propriedades || obterScriptProperties_();
  const valorSalvo = repositorio.getProperty(CHAVE_CREDENCIAL_PIN_PRODUCAO_);
  if (!valorSalvo) return false;
  let credencial;
  try {
    credencial = JSON.parse(valorSalvo);
  } catch (_) {
    return false;
  }
  if (!credencial || !credencial.salt || !credencial.hash) return false;
  return derivarPin_(pin, credencial.salt) === credencial.hash;
}

function erroApi_(codigo, mensagem) {
  const erro = new Error(mensagem);
  erro.code = codigo;
  return erro;
}

function criarSessaoAcesso_(perfil, nome, revisaoAdmin) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  const sessao = {
    criadoEm: Date.now(),
    dia: obterDiaSessaoAdmin_(),
    perfil: perfil,
    nome: nome,
    revisaoAdmin: revisaoAdmin
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

  if (sessao.perfil !== "admin" && sessao.perfil !== "producao") {
    cache.remove(chave);
    return false;
  }
  if (sessao.perfil === "admin") {
    const credencial = obterCredencialAdmin_();
    if (!credencial || (sessao.revisaoAdmin || "") !== credencial.revisao) {
      cache.remove(chave);
      return false;
    }
  }

  if (renovar !== false) {
    cache.put(chave, sessaoSalva, DURACAO_INATIVIDADE_ADMIN_SEGUNDOS_);
  }
  return {
    perfil: sessao.perfil,
    nome: sessao.perfil === "admin" ? NOME_PERFIL_ADMIN_ : NOME_PERFIL_PRODUCAO_,
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
