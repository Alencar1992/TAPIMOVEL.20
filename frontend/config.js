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

  (function carregarFotosBebidasPdv() {
    const versao = "20260827.1";
    const script = document.createElement("script");
    script.src = "./pdv-bebidas-imagens.js?v=" + versao;
    script.async = false;
    document.head.appendChild(script);
  })();
}

if (paginaTapimovelEhCliente_()) {
  (function carregarAjustesCliente() {
    const versao = "20260827.4";

    const hotfix = document.createElement("script");
    hotfix.src = "./cliente-hotfix.js?v=" + versao;
    hotfix.async = false;
    document.head.appendChild(hotfix);

    const horario = document.createElement("script");
    horario.src = "./horario-operacional.js?v=" + versao;
    horario.async = false;
    document.head.appendChild(horario);

    const loaderTapiTudo = document.createElement("script");
    loaderTapiTudo.src = "./loader-tapi-tudo.js?v=20260827.1";
    loaderTapiTudo.async = false;
    document.head.appendChild(loaderTapiTudo);
  })();
}
