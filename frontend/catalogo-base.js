(function () {
  "use strict";

  const catalogoBase = {
            salgadas: [
                { nome: "Bauru", preco: 14.00, tipo: "tapioca", ing: "Presunto, muçarela, tomate e orégano" },
                { nome: "Caipira I", preco: 15.00, tipo: "tapioca", ing: "Frango, muçarela e milho" },
                { nome: "Caipira II", preco: 15.00, tipo: "tapioca", ing: "Frango, catupiry e milho" },
                { nome: "Pizza", preco: 13.00, tipo: "tapioca", ing: "Muçarela, tomate e oregano" },
                { nome: "Peito de Peru c/ Queijo Branco e Tomate", preco: 15.00, tipo: "tapioca", ing: "Peito de peru, queijo branco e tomate" },
                { nome: "Presunto, Queijo e Catupiry", preco: 16.00, tipo: "tapioca", ing: "Presunto, muçarela e catupiry" },
                { nome: "Presunto e Queijo", preco: 14.00, tipo: "tapioca", ing: "Presunto e muçarela" },
                { nome: "Paulistana", preco: 16.00, tipo: "tapioca", ing: "muçarela, bacon, Tomate e Cebola" },
                { nome: "Três Queijos", preco: 15.00, tipo: "tapioca", ing: "Muçarela, catupiry e cheddar" },
                { nome: "Dois Queijos", preco: 14.00, tipo: "tapioca", ing: "Muçarela, Catupiry OU Cheddar" },
                { nome: "Baiana", preco: 18.00, tipo: "tapioca", ing: "Muçarela, calabresa, catupiry, M. de Pimenta, Tomate, Cebola e orégano" },
                { nome: "Carne Seca, Muçarela e Catupiry", preco: 18.00, tipo: "tapioca", ing: "Carne seca, muçarela e catupiry" },
                { nome: "Carne Seca, Muçarela e Cheddar", preco: 18.00, tipo: "tapioca", ing: "Carne seca, muçarela e cheddar" },
                { nome: "Frango, Muçarela e Catupiry", preco: 17.00, tipo: "tapioca", ing: "Frango, muçarela e catupiry" },
                { nome: "Frango, Muçarela e Cheddar", preco: 17.00, tipo: "tapioca", ing: "Frango, muçarela e cheddar" },
                { nome: "Frango, Muçarela e Bacon", preco: 17.00, tipo: "tapioca", ing: "Frango, muçarela e bacon" },
                { nome: "Frango Catupiry e Bacon", preco: 17.00, tipo: "tapioca", ing: "Frango, catupiry e bacon" },
                { nome: "Calabresa, Muçarela e Catupiry", preco: 17.00, tipo: "tapioca", ing: "Calabresa, muçarela e catupiry" },
                { nome: "Calabresa, Muçarela e Cheddar", preco: 17.00, tipo: "tapioca", ing: "Calabresa, muçarela e cheddar" }

            ],
            especiais: [
                { nome: "Expresso I", preco: 20.00, tipo: "tapioca", ing: "Muçarela, frango, bacon e catupiry" },
                { nome: "Expresso II", preco: 20.00, tipo: "tapioca", ing: "Muçarela, calabresa, bacon e catupiry" },
                { nome: "A Moda I", preco: 21.00, tipo: "tapioca", ing: "Muçarela, calabresa, frango e catupiry" },
                { nome: "A Moda II", preco: 22.00, tipo: "tapioca", ing: "Muçarela, presunto, frango, catupiry e cheddar" },
                { nome: "Especial", preco: 24.00, tipo: "tapioca", ing: "Muçarela, presunto, calabresa, frango, catupiry e cheddar" },
                { nome: "Tapi-Tudo", preco: 26.00, tipo: "tapioca", ing: "Muçarela, presunto, calabresa, cheddar, frango, catupiry e bacon" }
            ],
            doces_tradicionais: [
                { nome: "Canelinha", preco: 10.00, tipo: "tapioca", ing: "Coco, leite cond e canela" },
                { nome: "Beijinho", preco: 10.00, tipo: "tapioca", ing: "Coco e leite condensado" },
                { nome: "SÓ COCO", preco: 10.00, tipo: "tapioca", ing: "SÓ COCO" },
                { nome: "Banana Leite Cond. e Canela", preco: 12.00, tipo: "tapioca", ing: "Banana, Leite cond. e Canela" },
                { nome: "Banana Chocolate ao Leite", preco: 13.00, tipo: "tapioca", ing: "Banana Chocolate ao Leite" },
                { nome: "Brigadeiro", preco: 13.00, tipo: "tapioca", ing: "Chocolate ao Leite e granulado" },
                { nome: "BRIGADEIRO C/ CHOCOLATE BRANCO", preco: 13.00, tipo: "tapioca", ing: "CHOCOLATE BRANCO E GRANULADO" },
                { nome: "Prestígio", preco: 13.00, tipo: "tapioca", ing: "Coco e chocolate ao Leite" },
                { nome: "Romeu e Julieta", preco: 14.00, tipo: "tapioca", ing: "Muçarela c/ Goiabada" },
                { nome: "Coco c/ Doce de Leite", preco: 13.00, tipo: "tapioca", ing: "Coco c/ Doce de Leite" },
                { nome: "Coco c/ Choc. e Leite Cond.", preco: 14.00, tipo: "tapioca", ing: "Coco c/ Choc. e Leite Cond." },
                { nome: "Morango c/ Leite Cond.", preco: 13.00, tipo: "tapioca", ing: "Morango c/ Leite Cond." },
                { nome: "Morango c/ Chocolate", preco: 13.00, tipo: "tapioca", ing: "Morango c/ Chocolate ao Leite" },
                { nome: "Morango c/ Coco e Leite Cond.", preco: 14.00, tipo: "tapioca", ing: "Morango c/ Coco e Leite Cond." },
                { nome: "Paçoca c/ Doce de Leite", preco: 14.00, tipo: "tapioca", ing: "Paçoca c/ Doce de Leite" },
                { nome: "Paçoca c/ Chocolate", preco: 14.00, tipo: "tapioca", ing: "Paçoca c/ Chocolate ao Leite" },
                { nome: "Queijadinha", preco: 14.00, tipo: "tapioca", ing: "Coco, muçarela e leite cond." },
                { nome: "Castanha De Amendoim c/ Chocolate ao Leite", preco: 13.00, tipo: "tapioca", ing: "Castanha De Amendoim c/ Chocolate ao Leite" }
            ],
            doces_avela: [
                { nome: "Banana Chocolate Avelã", preco: 13.00, tipo: "tapioca", ing: "Banana Chocolate Avelã" },
                { nome: "Brigadeiro c/ Avelã e Granulado", preco: 13.00, tipo: "tapioca", ing: "Brigadeiro c/ Avelã e Granulado" },
                { nome: "Prestígio de Avelã", preco: 14.00, tipo: "tapioca", ing: "Coco e chocolate avelã" },
                { nome: "Paçoquinha I", preco: 14.00, tipo: "tapioca", ing: "Paçoca e chocolate avelã" },
                { nome: "Paçoquinha II", preco: 14.00, tipo: "tapioca", ing: "Paçoca e chocolate branco" },
                { nome: "Sensação (Morango/Avelã)", preco: 14.00, tipo: "tapioca", ing: "Morango c/ Avelã" },
                { nome: "Morango c/ Chocolate Branco", preco: 14.00, tipo: "tapioca", ing: "Morango c/ Chocolate Branco" },
                { nome: "Bombom Sonho de Valsa c/ Avelã", preco: 16.00, tipo: "tapioca", ing: "Bombom Sonho de Valsa c/ Avelã" },
                { nome: "Bombom Sonho de Valsa c/ Branco", preco: 16.00, tipo: "tapioca", ing: "Bombom Sonho de Valsa c/ Branco" }
            ],
            doces_nutella: [
                { nome: "NUTELLA", preco: 16.00, tipo: "tapioca", ing: "SÓ NUTELLA" },
                { nome: "Ninho com Nutella", preco: 18.00, tipo: "tapioca", ing: "Ninho com Nutella" },
                { nome: "Nutella com Coco", preco: 18.00, tipo: "tapioca", ing: "Nutella com Coco" },
                { nome: "Nutella com M&M", preco: 19.00, tipo: "tapioca", ing: "Nutella com M&M" },
                { nome: "Nutella com Morango", preco: 18.00, tipo: "tapioca", ing: "Nutella com Morango" },
                { nome: "Nutella com Banana", preco: 18.00, tipo: "tapioca", ing: "Nutella com Banana" },
                { nome: "Bombom S. de Valsa c/ Nutella", preco: 19.00, tipo: "tapioca", ing: "Bombom S. de Valsa c/ Nutella" }
            ],
            bebidas: [
                { nome: "Coca-Cola Zero - LATA", preco: 6.00, tipo: "bebida", ing: "Refrigerante lata 350 ml", imagem: "bebida-coca-zero.webp" },
                { nome: "Coca-Cola Original - LATA", preco: 6.00, tipo: "bebida", ing: "Refrigerante lata 350 ml", imagem: "bebida-coca-original.webp" },
                { nome: "Fanta Laranja - LATA", preco: 6.00, tipo: "bebida", ing: "Refrigerante lata 350 ml", imagem: "bebida-fanta-laranja.webp" },
                { nome: "Sprite - LATA", preco: 6.00, tipo: "bebida", ing: "Refrigerante lata 350 ml", imagem: "bebida-sprite.webp" },
                { nome: "Guaraná Antarctica - LATA", preco: 6.00, tipo: "bebida", ing: "Refrigerante lata 350 ml", imagem: "bebida-guarana-antartica.webp" },
                { nome: "Suco Del Valle Goiaba - LATA", preco: 6.00, tipo: "bebida", ing: "Suco lata 290 ml", imagem: "bebida-del-valle-goiaba.webp" },
                { nome: "Suco Del Valle Uva - LATA", preco: 6.00, tipo: "bebida", ing: "Suco lata 290 ml", imagem: "bebida-del-valle-uva.webp" },
                { nome: "Suco Del Valle Pêssego - LATA", preco: 6.00, tipo: "bebida", ing: "Suco lata 290 ml", imagem: "bebida-del-valle-pessego.webp" }
            ]
        };

  function criar() {
    return JSON.parse(JSON.stringify(catalogoBase));
  }

  window.TapimovelCatalogoBase = {
    criar: criar
  };
})();
