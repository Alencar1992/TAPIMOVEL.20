(function () {
  "use strict";

  const BASE_IMAGENS = "./assets/menu/";

  function normalizar(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function imagemBebidaPorNome(nome) {
    const texto = normalizar(nome);

    if (texto.includes("coca-cola") && texto.includes("zero")) {
      return "bebida-coca-zero.webp";
    }
    if (texto.includes("coca-cola")) {
      return "bebida-coca-original.webp";
    }
    if (texto.includes("fanta") && texto.includes("laranja")) {
      return "bebida-fanta-laranja.webp";
    }
    if (texto.includes("sprite")) {
      return "bebida-sprite.webp";
    }
    if (texto.includes("guarana") && texto.includes("antarctica")) {
      return "bebida-guarana-antartica.webp";
    }
    if (texto.includes("del valle") && texto.includes("goiaba")) {
      return "bebida-del-valle-goiaba.webp";
    }
    if (texto.includes("del valle") && texto.includes("uva")) {
      return "bebida-del-valle-uva.webp";
    }
    if (texto.includes("del valle") && texto.includes("pessego")) {
      return "bebida-del-valle-pessego.webp";
    }

    return "";
  }

  function corrigirFotosExistentes() {
    document.querySelectorAll(".produto-btn[data-nome]").forEach(function (botao) {
      const arquivo = imagemBebidaPorNome(botao.getAttribute("data-nome"));
      if (!arquivo) return;

      const imagem = botao.querySelector("img.produto-imagem");
      if (imagem) imagem.src = BASE_IMAGENS + arquivo;
    });
  }

  function instalarCorrecao() {
    if (typeof window.obterImagemProdutoAdmin === "function" &&
        !window.obterImagemProdutoAdmin.__tapimovelBebidasCorrigidas) {
      const original = window.obterImagemProdutoAdmin;
      const corrigida = function (produto) {
        const arquivo = imagemBebidaPorNome(produto && produto.nome);
        if (arquivo) return BASE_IMAGENS + arquivo;
        return original(produto);
      };
      corrigida.__tapimovelBebidasCorrigidas = true;
      window.obterImagemProdutoAdmin = corrigida;
    }

    corrigirFotosExistentes();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", instalarCorrecao, { once: true });
  } else {
    instalarCorrecao();
  }

  window.addEventListener("tapimovel:catalogo-atualizado", corrigirFotosExistentes);
})();
