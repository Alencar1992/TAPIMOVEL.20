(function () {
  "use strict";

  const mes = document.getElementById("mesFechamentoDiario");
  const lista = document.getElementById("listaFechamentosDiarios");
  const status = document.getElementById("statusHistoricoFechamentos");
  const comprovante = document.getElementById("comprovanteFechamentoDiario");
  const imagem = document.getElementById("imagemFechamentoDiario");
  const download = document.getElementById("downloadFechamentoDiario");
  const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  let consulta = 0;
  let urlPrint = "";

  function limparComprovante() {
    comprovante.hidden = true;
    imagem.removeAttribute("src");
    download.removeAttribute("href");
    if (urlPrint) URL.revokeObjectURL(urlPrint);
    urlPrint = "";
  }

  function limparHistorico() {
    consulta++;
    limparComprovante();
    lista.replaceChildren();
    status.textContent = "";
  }

  async function converterParaPng(svg) {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const origem = new Image();
      await new Promise(function (resolve, reject) {
        origem.onload = resolve;
        origem.onerror = function () { reject(new Error("Não foi possível abrir o comprovante.")); };
        origem.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = origem.naturalWidth * 2;
      canvas.height = origem.naturalHeight * 2;
      canvas.getContext("2d").drawImage(origem, 0, 0, canvas.width, canvas.height);
      return await new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error("Não foi possível gerar o PNG."));
        }, "image/png");
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function abrirComprovante(data) {
    const atual = ++consulta;
    limparComprovante();
    status.textContent = "Carregando comprovante de " + data + "…";
    try {
      const registro = await google.script.run.obterPrintFechamentoDiario(data);
      if (atual !== consulta) return;
      const png = await converterParaPng(registro.svg);
      if (atual !== consulta) return;
      urlPrint = URL.createObjectURL(png);
      imagem.src = urlPrint;
      imagem.alt = "Comprovante de fechamento de " + data;
      download.href = urlPrint;
      download.download = "Fechamento_Dia_" + data.replace(/\//g, "-") + ".png";
      comprovante.hidden = false;
      status.textContent = "Comprovante de " + data;
      comprovante.scrollIntoView({ block: "nearest" });
    } catch (erro) {
      if (atual === consulta) status.textContent = erro.message || "Falha ao abrir o comprovante.";
    }
  }

  async function carregarHistorico() {
    limparHistorico();
    if (!mes.value) {
      mes.value = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit"
      }).format(new Date());
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes.value)) {
      status.textContent = "Informe o mês no formato AAAA-MM.";
      return;
    }
    const atual = consulta;
    status.textContent = "Carregando fechamentos…";
    try {
      const registros = await google.script.run.listarFechamentosDiarios(mes.value);
      if (atual !== consulta) return;
      status.textContent = registros.length ? "" : "Nenhum fechamento neste mês.";
      registros.forEach(function (registro) {
        const linha = document.createElement("li");
        const resumo = document.createElement("span");
        resumo.textContent = registro.data + " · " + formatoMoeda.format(registro.total) +
          (registro.automatico ? " · Automático" : "");
        const botao = document.createElement("button");
        botao.className = "btn-painel btn-p-editar";
        botao.type = "button";
        botao.textContent = "Ver print";
        botao.setAttribute("aria-label", "Ver print de " + registro.data);
        botao.addEventListener("click", function () { abrirComprovante(registro.data); });
        linha.append(resumo, botao);
        lista.appendChild(linha);
      });
    } catch (erro) {
      if (atual === consulta) status.textContent = erro.message || "Falha ao consultar os fechamentos.";
    }
  }

  document.getElementById("consultarFechamentoDiario").addEventListener("click", carregarHistorico);
  mes.addEventListener("change", carregarHistorico);
  window.carregarHistoricoFechamentos = carregarHistorico;
  window.limparHistoricoFechamentos = limparHistorico;
})();
