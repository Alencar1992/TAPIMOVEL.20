window.TAPIMOVEL_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfycbwupkSzv-H0qucPvVdvpQ85ytmNDu8_DOgPnakTY5lwIQ1jDCpuGqCvfvAMSIuMRL6f/exec"
};

function paginaTapimovelEhCliente_() {
  const caminho = String(window.location && window.location.pathname || "").toLowerCase();
  return /(?:^|\/)cliente\.html$/.test(caminho);
}

if (!paginaTapimovelEhCliente_()) {
  (function carregarControleFechamentoEliel() {
    const versao = "20260826.3";

    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "./fechamento-eliel-ui.css?v=" + versao;
    document.head.appendChild(css);

    const script = document.createElement("script");
    script.src = "./fechamento-eliel-ui.js?v=" + versao;
    script.async = false;
    document.head.appendChild(script);
  })();

  (function carregarFechamentoDiarioSeguro() {
    const versao = "20260826.1";
    const script = document.createElement("script");
    script.src = "./fechamento-diario-seguro.js?v=" + versao;
    script.async = false;
    document.head.appendChild(script);
  })();
}
