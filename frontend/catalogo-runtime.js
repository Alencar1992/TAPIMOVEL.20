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

  function ehAdicionalLegado(item) {
    return normalizarBusca(item && item.nome) === "+ adicional";
  }

  function copiar(catalogo) {
    var resultado = {};
    categorias.forEach(function (categoria) {
      resultado[categoria] = Array.isArray(catalogo && catalogo[categoria])
        ? catalogo[categoria].filter(function (item) {
            return !ehAdicionalLegado(item);
          }).map(function (item) {
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

  function normalizarBusca(valor) {
    return String(valor == null ? "" : valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/\s+/g, " ")
      .trim();
  }

  function correspondeBusca(item, termo, rotuloCategoria) {
    var busca = normalizarBusca(termo);
    if (!busca) return true;
    return [item && item.nome, item && item.ing, rotuloCategoria]
      .some(function (valor) { return normalizarBusca(valor).includes(busca); });
  }

  window.TapimovelCatalogo = {
    categorias: categorias.slice(),
    copiar: copiar,
    substituir: substituir,
    carregar: carregar,
    normalizarBusca: normalizarBusca,
    correspondeBusca: correspondeBusca
  };
})();
