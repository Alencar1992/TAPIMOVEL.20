(function () {
  "use strict";

  function assinaturaAtualCarrinho_() {
    try {
      return typeof obterAssinaturaCarrinho === "function"
        ? obterAssinaturaCarrinho()
        : "";
    } catch (_) {
      return "";
    }
  }

  function marcarSugestaoComoTratada_() {
    try {
      assinaturaSugestaoIgnorada = assinaturaAtualCarrinho_();
    } catch (_) {
      // Compatibilidade com versões antigas em que a variável não exista.
    }
  }

  function fecharModalSugestao_() {
    const modal = document.getElementById("modalSugestao");
    if (modal) modal.style.display = "none";
  }

  function abrirCategoriaDaSugestao(categoria) {
    marcarSugestaoComoTratada_();
    fecharModalSugestao_();

    const tab = document.querySelector('.tab[data-categoria="' + categoria + '"]');
    if (typeof mudarAba === "function") {
      mudarAba(categoria, tab || undefined);
    }

    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (_) {
      window.scrollTo(0, 0);
    }
  }

  function abrirSugestaoPorCategoria_() {
    const assinatura = assinaturaAtualCarrinho_();
    let tipo = null;

    try {
      tipo = typeof classificarTapiocaUnica === "function"
        ? classificarTapiocaUnica()
        : null;
    } catch (_) {
      tipo = null;
    }

    try {
      if (!tipo || assinatura === assinaturaSugestaoIgnorada) return false;
    } catch (_) {
      if (!tipo) return false;
    }

    const texto = document.getElementById("textoSugestao");
    if (texto) {
      texto.textContent = "Quer completar seu pedido? Escolha uma categoria. As tapiocas que você já colocou no carrinho continuam salvas até a finalização do pedido.";
    }

    const lista = document.getElementById("listaSugestoes");
    if (!lista) return false;

    lista.innerHTML = [
      '<div class="sugestao-card">' +
        '<strong>🍫 Tapiocas doces</strong>' +
        '<small>Abrir o cardápio de tapiocas doces</small>' +
        '<button type="button" class="btn-add" onclick="abrirCategoriaDaSugestao(\'doces\')">Ver tapiocas doces</button>' +
      '</div>',
      '<div class="sugestao-card">' +
        '<strong>🥤 Refrigerante ou Suco</strong>' +
        '<small>Abrir o cardápio de refrigerantes e sucos</small>' +
        '<button type="button" class="btn-add" onclick="abrirCategoriaDaSugestao(\'bebidas\')">Ver bebidas</button>' +
      '</div>'
    ].join("");

    const modal = document.getElementById("modalSugestao");
    if (modal) modal.style.display = "flex";
    return true;
  }

  function corrigirValorVr_() {
    const select = document.getElementById("cliPag");
    if (!select) return;

    Array.from(select.options || []).forEach(function (option) {
      if (option.value === "VR" || option.textContent.trim() === "VR (Vale Refeição)") {
        option.value = "VR (Vale Refeição)";
      }
    });

    if (select.value === "VR") {
      select.value = "VR (Vale Refeição)";
    }
  }

  function aplicarAjustesCliente_() {
    corrigirValorVr_();
    window.abrirCategoriaDaSugestao = abrirCategoriaDaSugestao;
    window.abrirSugestaoSeAplicavel = abrirSugestaoPorCategoria_;

    document.addEventListener("change", function (evento) {
      if (evento.target && evento.target.id === "cliPag") corrigirValorVr_();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aplicarAjustesCliente_, { once: true });
  } else {
    aplicarAjustesCliente_();
  }
})();
