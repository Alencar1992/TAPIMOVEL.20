// =========================================================
// P11 — NÚCLEO DE UTILITÁRIOS COMPARTILHADOS
// Datas, números, comparação e logging técnico padronizados.
// =========================================================

const FUSO_PADRAO_APLICACAO_ = "America/Sao_Paulo";

function obterFusoAplicacao_() {
  try {
    const fuso = Session.getScriptTimeZone();
    return fuso || FUSO_PADRAO_APLICACAO_;
  } catch (_) {
    return FUSO_PADRAO_APLICACAO_;
  }
}

function numeroAplicacao_(valor) {
  if (typeof valor === "number") return isFinite(valor) ? valor : 0;

  let texto = String(valor == null ? "" : valor)
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/[^\d,.-]/g, "");

  if (!texto) return 0;

  const temVirgula = texto.indexOf(",") !== -1;
  const temPonto = texto.indexOf(".") !== -1;

  if (temVirgula && temPonto) {
    // Padrão brasileiro: 1.234,56.
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    texto = texto.replace(",", ".");
  } else if (temPonto && /^-?\d{1,3}(?:\.\d{3})+$/.test(texto)) {
    // Ponto usado somente como separador de milhar: 1.234 / 12.345.
    texto = texto.replace(/\./g, "");
  }

  const numero = Number(texto);
  return isFinite(numero) ? numero : 0;
}

function arredondarMoedaAplicacao_(valor) {
  return Math.round((numeroAplicacao_(valor) + Number.EPSILON) * 100) / 100;
}

function dataAplicacao_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return new Date(valor.getTime());
  }

  if (typeof valor === "number" && isFinite(valor) && valor > 0) {
    const dataNumero = new Date(valor);
    return isNaN(dataNumero.getTime()) ? null : dataNumero;
  }

  const texto = String(valor == null ? "" : valor).trim();
  if (!texto) return null;

  if (/^\d{12,}$/.test(texto)) {
    const dataTimestamp = new Date(Number(texto));
    if (!isNaN(dataTimestamp.getTime())) return dataTimestamp;
  }

  let match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (match) {
    return criarDataCalendarioAplicacao_(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
  if (match) {
    return criarDataCalendarioAplicacao_(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  const generica = new Date(texto);
  return isNaN(generica.getTime()) ? null : generica;
}

function criarDataCalendarioAplicacao_(ano, mes, dia) {
  if (!ano || !mes || !dia) return null;
  // Meio-dia evita mudanças de dia causadas por offsets/DST em datas sem horário.
  const data = new Date(ano, mes - 1, dia, 12, 0, 0, 0);
  if (
    data.getFullYear() !== ano ||
    data.getMonth() !== mes - 1 ||
    data.getDate() !== dia
  ) return null;
  return data;
}

function formatarDataAplicacao_(valor, formato) {
  const data = valor instanceof Date ? valor : dataAplicacao_(valor);
  if (!data || isNaN(data.getTime())) return "";
  return Utilities.formatDate(
    data,
    obterFusoAplicacao_(),
    formato || "dd/MM/yyyy"
  );
}

function normalizarDataDiaAplicacao_(valor) {
  return formatarDataAplicacao_(valor, "dd/MM/yyyy");
}

function chaveDiaAplicacao_(valor) {
  return formatarDataAplicacao_(valor, "yyyy-MM-dd");
}

function chaveMesAplicacao_(mes, ano) {
  const numeroMes = Number(mes);
  const numeroAno = Number(ano);
  if (!Number.isInteger(numeroMes) || numeroMes < 1 || numeroMes > 12) return "";
  if (!Number.isInteger(numeroAno) || numeroAno < 1900 || numeroAno > 9999) return "";
  return String(numeroAno) + "-" + String(numeroMes).padStart(2, "0");
}

function chaveMesDaDataAplicacao_(valor) {
  const data = dataAplicacao_(valor);
  return data ? formatarDataAplicacao_(data, "yyyy-MM") : "";
}

function dataPertenceAoMesAplicacao_(valor, mes, ano) {
  const data = valor instanceof Date ? valor : dataAplicacao_(valor);
  return Boolean(
    data &&
    data.getMonth() + 1 === Number(mes) &&
    data.getFullYear() === Number(ano)
  );
}

function nomeDiaSemanaAplicacao_(dia) {
  const nomes = [
    "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
    "Quinta-feira", "Sexta-feira", "Sábado"
  ];
  const indice = Number(dia);
  return Number.isInteger(indice) && indice >= 0 && indice <= 6 ? nomes[indice] : "";
}

function quaseIgualAplicacao_(a, b, tolerancia) {
  const limite = tolerancia == null ? 0.005 : Math.abs(Number(tolerancia));
  return Math.abs(numeroAplicacao_(a) - numeroAplicacao_(b)) < limite;
}

function mensagemErroAplicacao_(erro, fallback) {
  const mensagem = erro && erro.message ? String(erro.message) : String(erro || "");
  return mensagem || String(fallback || "Ocorreu um erro inesperado.");
}

function registrarErroAplicacao_(contexto, erro, dados) {
  const payload = {
    evento: "ERRO_APLICACAO",
    contexto: String(contexto || "desconhecido").substring(0, 120),
    codigo: erro && erro.code ? String(erro.code).substring(0, 80) : "",
    mensagem: mensagemErroAplicacao_(erro, "Erro sem mensagem."),
    dados: dados && typeof dados === "object" ? dados : null,
    registradoEm: new Date().toISOString()
  };
  console.error(JSON.stringify(payload));
  return payload;
}
