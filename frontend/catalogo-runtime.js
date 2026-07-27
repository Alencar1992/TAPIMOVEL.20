(function () {
  "use strict";

  var categorias = [
    "salgadas",
    "especiais",
    "doces_tradicionais",
    "doces_avela",
    "doces_nutella",
    "bebidas"
  ];

  function copiar(catalogo) {
    var resultado = {};
    categorias.forEach(function (categoria) {
      resultado[categoria] = Array.isArray(catalogo && catalogo[categoria])
        ? catalogo[categoria].map(function (item) {
            return {
              nome: String(item.nome || ""),
              preco: Number(item.preco) || 0,
              tipo: item.tipo === "bebida" ? "bebida" : "tapioca",
              ing: String(item.ing || "")
            };
          })
        : [];
    });
    return resultado;
  }

  function substituir(destino, origem) {
    var normalizado = copiar(origem);
    categorias.forEach(function (categoria) {
      destino[categoria] = normalizado[categoria];
    });
    window.dispatchEvent(new CustomEvent("tapimovel:catalogo-atualizado"));
    return destino;
  }

  function carregar(destino, aoConcluir) {
    google.script.run
      .withSuccessHandler(function (resposta) {
        try {
          substituir(destino, JSON.parse(resposta || "{}"));
        } catch (erro) {
          console.error("Catálogo recebido em formato inválido:", erro);
        }
        if (typeof aoConcluir === "function") aoConcluir();
      })
      .withFailureHandler(function (erro) {
        console.error("Não foi possível carregar o catálogo configurado:", erro);
        if (typeof aoConcluir === "function") aoConcluir();
      })
      .obterCatalogoCardapio(JSON.stringify(copiar(destino)));
  }

  window.TapimovelCatalogo = {
    categorias: categorias.slice(),
    copiar: copiar,
    substituir: substituir,
    carregar: carregar
  };
})();
