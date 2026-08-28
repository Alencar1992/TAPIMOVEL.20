const PDV_URL = process.env.TAPIMOVEL_PDV_URL || "https://alencar1992.github.io/TAPIMOVEL.20/frontend/index.html";
const CLIENTE_URL = process.env.TAPIMOVEL_CLIENTE_URL || "https://alencar1992.github.io/TAPIMOVEL.20/frontend/cliente.html";
const API_URL = process.env.TAPIMOVEL_API_URL || "https://script.google.com/macros/s/AKfycbwupkSzv-H0qucPvVdvpQ85ytmNDu8_DOgPnakTY5lwIQ1jDCpuGqCvfvAMSIuMRL6f/exec";
const REPORT_PATH = process.env.HEALTH_REPORT_PATH || ".health-report.md";
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_ATTEMPTS = 3;

function pausa(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textoErro(erro) {
  return String(erro && erro.message ? erro.message : erro || "Erro desconhecido").replace(/\s+/g, " ").trim();
}

function parseApi(texto) {
  let payload;
  try {
    payload = JSON.parse(texto);
  } catch (_) {
    throw new Error("Resposta do Apps Script não é JSON válido");
  }
  if (!payload || payload.ok !== true) {
    throw new Error("Apps Script respondeu com erro: " + String(payload && (payload.error || payload.code) || "sem detalhe"));
  }
  return payload;
}

function parseDataJson(payload) {
  const valor = payload.data;
  if (typeof valor === "string") {
    try {
      return JSON.parse(valor);
    } catch (_) {
      throw new Error("Campo data do Apps Script não contém JSON válido");
    }
  }
  return valor;
}

async function requisitar(check) {
  const timeoutMs = Number(check.timeoutMs || DEFAULT_TIMEOUT_MS);
  const maxAttempts = Number(check.tentativas || DEFAULT_ATTEMPTS);
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= maxAttempts; tentativa++) {
    const inicio = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resposta = await fetch(check.url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "TAPIMOVEL-HealthMonitor/1.1",
          "cache-control": "no-cache",
          accept: "application/json,text/html;q=0.9,*/*;q=0.8"
        }
      });
      const texto = await resposta.text();
      if (!resposta.ok) throw new Error("HTTP " + resposta.status);
      const detalhe = check.validar(texto, resposta);
      clearTimeout(timer);
      return {
        nome: check.nome,
        ok: true,
        latenciaMs: Date.now() - inicio,
        detalhe: detalhe || "OK"
      };
    } catch (erro) {
      clearTimeout(timer);
      ultimoErro = erro;
      if (tentativa < maxAttempts) await pausa(1500 * tentativa);
    }
  }

  return {
    nome: check.nome,
    ok: false,
    latenciaMs: null,
    detalhe: textoErro(ultimoErro)
  };
}

const checks = [
  {
    nome: "GitHub Pages — PDV/ADM",
    url: PDV_URL,
    validar(texto) {
      if (!texto.includes("<title>PDV - Expresso Tapiocaria</title>")) {
        throw new Error("HTML do PDV não contém a assinatura esperada");
      }
      if (!texto.includes("./config.js?v=")) {
        throw new Error("PDV foi entregue sem config.js versionado");
      }
      return "Página publicada e estrutura principal presente";
    }
  },
  {
    nome: "GitHub Pages — Cardápio cliente",
    url: CLIENTE_URL,
    validar(texto) {
      if (!texto.includes("<title>Cardápio - Expresso Tapiocaria</title>")) {
        throw new Error("HTML do cardápio não contém a assinatura esperada");
      }
      if (!texto.includes("./config.js?v=")) {
        throw new Error("Cardápio foi entregue sem config.js versionado");
      }
      return "Página publicada e estrutura principal presente";
    }
  },
  {
    nome: "Apps Script — API",
    url: API_URL,
    timeoutMs: 30000,
    tentativas: 2,
    validar(texto) {
      const payload = parseApi(texto);
      if (!payload.data || payload.data.status !== "online" || payload.data.servico !== "Tapimóvel 2.0 API") {
        throw new Error("API respondeu sem a assinatura de serviço esperada");
      }
      return "Backend online";
    }
  },
  {
    nome: "Apps Script — Configuração operacional",
    url: API_URL + "?action=obterStatusCardapio",
    timeoutMs: 35000,
    tentativas: 2,
    validar(texto) {
      const status = parseDataJson(parseApi(texto));
      if (!status || typeof status.aberto !== "boolean" || typeof status.ativo !== "boolean") {
        throw new Error("Status operacional incompleto");
      }
      if (!/^\d{2}:\d{2}$/.test(String(status.abreAs || "")) || !/^\d{2}:\d{2}$/.test(String(status.fechaAs || ""))) {
        throw new Error("Horário operacional inválido");
      }
      if (!Array.isArray(status.rotas)) {
        throw new Error("Rotas operacionais indisponíveis");
      }
      return "Configuração e horário lidos com sucesso";
    }
  }
];

// Executa em série de propósito: a primeira chamada aquece o Apps Script e evita
// duas inicializações concorrentes durante um cold start do web app.
const resultados = [];
for (const check of checks) {
  resultados.push(await requisitar(check));
}

const falhas = resultados.filter((item) => !item.ok);
const agora = new Date().toISOString();
const runUrl = process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
  ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : "";

const linhas = [
  "# Health check — TAPIMOVEL.20",
  "",
  `**Executado em:** ${agora}`,
  `**Status geral:** ${falhas.length ? "🔴 INDISPONÍVEL" : "🟢 SAUDÁVEL"}`,
  "",
  "| Camada | Status | Latência | Detalhe |",
  "| --- | --- | ---: | --- |",
  ...resultados.map((item) => {
    const detalhe = String(item.detalhe || "").replace(/\|/g, "\\|");
    return `| ${item.nome} | ${item.ok ? "✅ OK" : "❌ FALHA"} | ${item.latenciaMs == null ? "-" : item.latenciaMs + " ms"} | ${detalhe} |`;
  })
];
if (runUrl) linhas.push("", `**Execução:** ${runUrl}`);
if (falhas.length) {
  linhas.push("", "## Ação recomendada", "Verificar primeiro a camada marcada como FALHA. O monitor não executa nenhuma escrita no PDV ou nas planilhas.");
}
const relatorio = linhas.join("\n") + "\n";

const fs = await import("node:fs/promises");
await fs.writeFile(REPORT_PATH, relatorio, "utf8");
process.stdout.write(relatorio);
process.exitCode = falhas.length ? 1 : 0;
