(function () {
  "use strict";

  const IMAGEM_TAPI_TUDO = "./assets/loading/tapi_tudo_loader_animado.webp?v=20260828.2";

  function ativarLoaderTapiTudo_() {
    const media = document.querySelector("#loadingScreen .tapioca-loading-media");
    if (!media || media.querySelector(".tapi-tudo-loader-webp")) return;

    // Respeita a preferência de acessibilidade já tratada pelo loader CSS legado.
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const fallback = media.querySelector(".taco-prep-animation");
    const imagem = new Image();
    imagem.className = "tapi-tudo-loader-webp";
    imagem.alt = "";
    imagem.setAttribute("aria-hidden", "true");
    imagem.decoding = "async";
    imagem.draggable = false;

    Object.assign(imagem.style, {
      display: "none",
      width: "132px",
      height: "132px",
      maxWidth: "44vw",
      objectFit: "contain",
      margin: "0 auto",
      filter: "drop-shadow(0 8px 10px rgba(0,0,0,.38))"
    });

    imagem.addEventListener("load", function () {
      if (fallback) fallback.style.display = "none";
      imagem.style.display = "block";
    }, { once: true });

    imagem.addEventListener("error", function () {
      imagem.remove();
      if (fallback) fallback.style.removeProperty("display");
    }, { once: true });

    // Mantém o taco antigo no DOM como fallback até o WebP confirmar que carregou.
    media.prepend(imagem);
    imagem.src = IMAGEM_TAPI_TUDO;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ativarLoaderTapiTudo_, { once: true });
  } else {
    ativarLoaderTapiTudo_();
  }
})();
