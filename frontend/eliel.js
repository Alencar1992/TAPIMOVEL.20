(function () {
    "use strict";

    let relatorioElielAtual = null;
    let relatorioElielAnterior = null;
    let previaFechamentoElielAtual = null;
    let timerGestaoItem = null;
    let intervaloGestaoItem = null;
    let botaoGestaoPressionado = null;
    let nomeItemPressionado = "";
    let resultadosGestaoItens = [];
    let indiceAdicionalCarrinho = -1;
    let adicionaisSelecionadosModal = [];
    let agrupamentoGraficoEliel = "dia";
    const DURACAO_PRESSAO_GESTAO_ITEM = 2000;
    const PRECO_ADICIONAL = 4;
    const adicionaisSalgados = [
        "Frango", "Calabresa", "Carne seca", "Salame", "Presunto", "Queijo branco",
        "Muçarela", "Catupiry", "Cheddar", "Cream cheese", "Bacon", "Peito de peru"
    ];
    const adicionaisDoces = [
        "Chocolate ao leite", "Chocolate avelã", "Nutella", "Castanha de amendoim",
        "Granulado", "Leite condensado", "Ninho", "Sonho de Valsa", "Morango", "Coco",
        "Banana", "Goiabada", "Paçoca"
    ];

    const meses = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    function escapar(valor) {
        return String(valor == null ? "" : valor)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function moeda(valor) {
        return Number(valor || 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    }

    function numeroCampo(id) {
        const valor = document.getElementById(id).value || "0";
        return Number(String(valor).replace(/\./g, "").replace(",", ".")) || 0;
    }

    function preencherCampo(id, valor) {
        document.getElementById(id).value = Number(valor || 0).toFixed(2).replace(".", ",");
    }

    function catalogoCompleto() {
        return []
            .concat(
                bdCatalogo.salgadas,
                bdCatalogo.especiais,
                bdCatalogo.doces_tradicionais,
                bdCatalogo.doces_avela,
                bdCatalogo.doces_nutella,
                bdCatalogo.bebidas
            )
            .filter(item => TapimovelCatalogo.normalizarBusca(item && item.nome) !== "+ adicional")
            .filter((item, indice, lista) =>
                lista.findIndex(outro => outro.nome === item.nome) === indice
            );
    }

    function configurarFiltrosEliel() {
        const hoje = new Date();
        const selectMes = document.getElementById("elielMes");
        const selectAno = document.getElementById("elielAno");
        if (!selectMes.options.length) {
            selectMes.innerHTML = meses
                .map((nome, indice) => `<option value="${indice + 1}">${nome}</option>`)
                .join("");
        }
        if (!selectAno.options.length) {
            let opcoes = "";
            for (let ano = hoje.getFullYear() - 4; ano <= hoje.getFullYear() + 1; ano++) {
                opcoes += `<option value="${ano}">${ano}</option>`;
            }
            selectAno.innerHTML = opcoes;
        }
        selectMes.value = String(hoje.getMonth() + 1);
        selectAno.value = String(hoje.getFullYear());
    }

    window.abrirRelatorioEliel = function () {
        configurarFiltrosEliel();
        mudarTela("view-relatorio-eliel");
        const mes = Number(document.getElementById("elielMes").value);
        const ano = Number(document.getElementById("elielAno").value);
        google.script.run
            .withSuccessHandler(function (resposta) {
                const status = JSON.parse(resposta || "{}");
                const aviso = document.getElementById("elielAvisoMesPendente");
                if (status.mesAnteriorPendente) {
                    aviso.hidden = false;
                    aviso.dataset.chave = status.chaveAnterior;
                    document.getElementById("elielAvisoMesTexto").textContent =
                        `O fechamento ${status.chaveAnterior} ainda não foi registrado.`;
                } else {
                    aviso.hidden = true;
                }
            })
            .registrarAcessoRelatorioEliel(mes, ano);
        carregarRelatorioEliel();
    };

    window.abrirMesPendenteEliel = function () {
        const chave = document.getElementById("elielAvisoMesPendente").dataset.chave || "";
        const partes = chave.split("-");
        if (partes.length !== 2) return;
        document.getElementById("elielAno").value = partes[0];
        document.getElementById("elielMes").value = String(Number(partes[1]));
        carregarRelatorioEliel();
        document.getElementById("elielAvisoMesPendente").hidden = true;
    };

    window.carregarRelatorioEliel = function () {
        const mes = Number(document.getElementById("elielMes").value);
        const ano = Number(document.getElementById("elielAno").value);
        document.getElementById("elielLoading").hidden = false;
        document.getElementById("elielConteudo").hidden = true;

        google.script.run
            .withSuccessHandler(function (resposta) {
                relatorioElielAtual = JSON.parse(resposta || "{}");
                document.getElementById("elielLoading").hidden = true;
                document.getElementById("elielConteudo").hidden = false;
                desenharRelatorioEliel();
            })
            .withFailureHandler(function (erro) {
                document.getElementById("elielLoading").hidden = true;
                mostrarAlerta("Não foi possível preparar o Relatório Eliel.<br><small>" + escapar(erro.message) + "</small>");
            })
            .obterRelatorioEliel(mes, ano, JSON.stringify(catalogoCompleto()));
    };

    function imagemTapioca(nome) {
        const valor = String(nome || "").toLowerCase();
        if (/(coco|beijinho|queijadinha)/.test(valor)) return "./assets/menu/tapioca-coco.webp";
        if (/(frango)/.test(valor)) return "./assets/menu/tapioca-frango.webp";
        if (/(carne seca)/.test(valor)) return "./assets/menu/tapioca-carne-seca.webp";
        if (/(calabresa)/.test(valor)) return "./assets/menu/tapioca-calabresa.webp";
        if (/(morango)/.test(valor)) return "./assets/menu/tapioca-morango-chocolate.webp";
        if (/(chocolate|nutella|avelã|avela|paçoca|pacoca|prestígio|prestigio)/.test(valor)) return "./assets/menu/tapioca-chocolate-avela.webp";
        if (/(banana|canela)/.test(valor)) return "./assets/menu/tapioca-banana.webp";
        if (/(presunto|peito de peru|pizza|bauru)/.test(valor)) return "./assets/menu/tapioca-presunto.webp";
        return "./assets/menu/tapioca-queijos.webp";
    }

    function desenharPodio(itens) {
        const podio = document.getElementById("elielTop3");
        podio.innerHTML = itens.length
            ? itens.map((item, indice) => `
                <article class="eliel-podio-item posicao-${indice + 1}">
                    <span class="eliel-medalha">${indice + 1}º</span>
                    <img src="${imagemTapioca(item.produto)}" alt="Tapioca ${escapar(item.produto)}">
                    <div>
                        <strong>${escapar(item.produto)}</strong>
                        <span>${item.quantidade} unidades</span>
                        <small>Melhor dia: ${escapar(item.melhorDia)}</small>
                    </div>
                </article>`).join("")
            : '<p class="eliel-vazio">Sem vendas registradas.</p>';
    }

    function desenharMenosVendidas(dados) {
        const mesesComparacao = relatorioElielAtual.mesesComparacao || [];
        const cabecalhos = mesesComparacao.map(item => `<th>${escapar(item.rotulo)}</th>`).join("");
        const rotulos = {
            "cresceu": ["Cresceu", "↑"],
            "caiu": ["Caiu", "↓"],
            "sem-vendas": ["Sem vendas", "—"],
            "estavel": ["Estável", "→"]
        };
        document.getElementById("elielMenos5").innerHTML = `
            <table class="eliel-tabela eliel-tabela-comparativo">
                <thead><tr><th>Produto</th>${cabecalhos}<th>Tendência</th></tr></thead>
                <tbody>${dados.map(item => {
                    const status = rotulos[item.tendencia] || rotulos.estavel;
                    return `<tr>
                        <td><span class="eliel-produto-mini"><img src="${imagemTapioca(item.produto)}" alt=""><strong>${escapar(item.produto)}</strong></span></td>
                        ${(item.comparativo || []).map(valor => `<td>${valor}</td>`).join("")}
                        <td><span class="eliel-tendencia ${escapar(item.tendencia)}">${status[0]} ${status[1]}</span></td>
                    </tr>`;
                }).join("") || '<tr><td colspan="5">Sem produtos para comparar.</td></tr>'}</tbody>
            </table>`;
    }

    function desenharRotas(rotas) {
        const maior = Math.max(1, ...rotas.map(item => Number(item.total || 0)));
        document.getElementById("elielRotas").innerHTML = rotas.length
            ? rotas.map((item, indice) => `
                <article class="eliel-rota">
                    <span class="eliel-rota-posicao">${indice + 1}</span>
                    <div class="eliel-rota-nome"><strong>${escapar(item.rota)}</strong><small>${item.tapiocas} tapiocas</small></div>
                    <div class="eliel-rota-barra"><i style="width:${Math.max(3, Number(item.total || 0) / maior * 100)}%"></i></div>
                    <strong>${moeda(item.total)}</strong>
                    <span class="eliel-rota-participacao">${Number(item.participacao || 0).toFixed(1).replace(".", ",")}%</span>
                    <span class="eliel-rota-campea"><img src="${imagemTapioca(item.tapiocaMaisVendida)}" alt=""><span>Campeã<strong>${escapar(item.tapiocaMaisVendida)}</strong></span></span>
                </article>`).join("")
            : '<p class="eliel-vazio">Sem dados de rota.</p>';
    }

    function desenharGraficoVolume() {
        const elemento = document.getElementById("elielGraficoVolume");
        const dados = agrupamentoGraficoEliel === "semana"
            ? relatorioElielAtual.porSemana || []
            : relatorioElielAtual.porDia || [];
        if (!dados.length) {
            elemento.innerHTML = '<p class="eliel-vazio">Sem vendas registradas.</p>';
            return;
        }
        const largura = 760;
        const altura = 280;
        const margem = { topo: 24, direita: 20, baixo: 42, esquerda: 38 };
        const areaLargura = largura - margem.esquerda - margem.direita;
        const areaAltura = altura - margem.topo - margem.baixo;
        const maxQuantidade = Math.max(1, ...dados.map(item => Number(item.quantidade || 0)));
        const maxFaturamento = Math.max(1, ...dados.map(item => Number(item.faturamento || 0)));
        const passo = areaLargura / dados.length;
        const larguraBarra = Math.max(5, Math.min(30, passo * .55));
        const pontos = dados.map((item, indice) => {
            const x = margem.esquerda + passo * indice + passo / 2;
            const y = margem.topo + areaAltura - Number(item.faturamento || 0) / maxFaturamento * areaAltura;
            return `${x},${y}`;
        }).join(" ");
        const linhasGrade = [0, .25, .5, .75, 1].map(fracao => {
            const y = margem.topo + areaAltura * fracao;
            return `<line x1="${margem.esquerda}" y1="${y}" x2="${largura - margem.direita}" y2="${y}" class="grade"/>
                <text x="${margem.esquerda - 8}" y="${y + 4}" text-anchor="end">${Math.round(maxQuantidade * (1 - fracao))}</text>`;
        }).join("");
        const barras = dados.map((item, indice) => {
            const xCentro = margem.esquerda + passo * indice + passo / 2;
            const alturaBarra = Number(item.quantidade || 0) / maxQuantidade * areaAltura;
            const y = margem.topo + areaAltura - alturaBarra;
            const rotulo = agrupamentoGraficoEliel === "semana"
                ? String(item.semana || "").replace("Semana ", "S")
                : String(item.dia || "").slice(0, 5);
            return `<g tabindex="0">
                <title>${escapar(item[agrupamentoGraficoEliel === "semana" ? "semana" : "dia"])}: ${item.quantidade || 0} tapiocas · ${moeda(item.faturamento)}</title>
                <rect x="${xCentro - larguraBarra / 2}" y="${y}" width="${larguraBarra}" height="${alturaBarra}" rx="5" class="barra"/>
                <text x="${xCentro}" y="${altura - 14}" text-anchor="middle">${escapar(rotulo)}</text>
            </g>`;
        }).join("");
        const pontosLinha = dados.map((item, indice) => {
            const x = margem.esquerda + passo * indice + passo / 2;
            const y = margem.topo + areaAltura - Number(item.faturamento || 0) / maxFaturamento * areaAltura;
            return `<circle cx="${x}" cy="${y}" r="4"><title>${moeda(item.faturamento)}</title></circle>`;
        }).join("");
        elemento.innerHTML = `<div class="eliel-grafico-legenda"><span><i class="unidades"></i>Unidades</span><span><i class="faturamento"></i>Faturamento</span></div>
            <svg viewBox="0 0 ${largura} ${altura}" aria-hidden="true">
                ${linhasGrade}${barras}
                <polyline points="${pontos}" class="linha-faturamento"/>
                ${pontosLinha}
            </svg>`;
    }

    function desenharRelatorioEliel() {
        const d = relatorioElielAtual;
        document.getElementById("elielFaturamento").textContent = moeda(d.faturamento);
        document.getElementById("elielTaxas").textContent = "- " + moeda(d.taxas);
        document.getElementById("elielSubtotal").textContent = moeda(d.subtotal);
        document.getElementById("elielLiquido").textContent = moeda(d.liquido);
        document.getElementById("elielTotalTapiocas").textContent = `${d.totalTapiocas || 0} un`;
        document.getElementById("elielResumoFaturamento").textContent = moeda(d.faturamento);
        document.getElementById("elielResumoTaxas").textContent = moeda(d.taxas);
        document.getElementById("elielResumoCustos").textContent = moeda(d.totalCustos);
        document.getElementById("elielResumoLiquido").textContent = moeda(d.liquido);
        document.getElementById("elielResumoStatus").textContent = d.liquido >= 0 ? "Resultado positivo" : "Resultado negativo";
        document.getElementById("elielResumoStatus").classList.toggle("negativo", d.liquido < 0);
        document.getElementById("elielCombustivelTotal").textContent = moeda(d.custos.combustivelTotal);
        document.getElementById("elielCombustivelCarro").textContent = moeda(d.custos.combustivelCarro);
        document.getElementById("elielCombustivelTrailer").textContent = moeda(d.custos.combustivelTrailer);

        desenharPodio(d.top3 || []);
        desenharMenosVendidas(d.menosVendidas || []);
        desenharGraficoVolume();

        document.getElementById("elielMelhorRota").textContent = d.melhorRota
            ? `${d.melhorRota.rota} · ${moeda(d.melhorRota.total)}`
            : "Sem dados";

        desenharRotas(d.rotas || []);

        preencherCampo("elielCustoCombustivel", d.custos.combustivelTotal);
        preencherCampo("elielCustoCozinha", d.custos.salarioCozinha);
        preencherCampo("elielCustoAux", d.custos.salarioAuxCarro);
        preencherCampo("elielCustoManutencao", d.custos.manutencaoCarro);
        document.getElementById("elielPercCompra").value = d.configuracoes.percentualCompra;
        document.getElementById("elielPercLucas").value = d.configuracoes.percentualLucas;
        document.getElementById("elielPercEliel").value = d.configuracoes.percentualEliel;
        recalcularRelatorioElielLocal();
    }

    window.mudarGraficoEliel = function (agrupamento, botao) {
        agrupamentoGraficoEliel = agrupamento === "semana" ? "semana" : "dia";
        document.querySelectorAll(".eliel-segmentado button").forEach(item => item.classList.remove("ativo"));
        if (botao) botao.classList.add("ativo");
        desenharGraficoVolume();
    };

    window.alternarDetalheMetricaEliel = function (tipo, botao) {
        if (!relatorioElielAtual) return;
        const painel = document.getElementById("elielDetalheMetrica");
        const estavaAberto = !painel.hidden && painel.dataset.tipo === tipo;
        document.querySelectorAll(".eliel-metricas button").forEach(item => {
            item.classList.remove("ativo");
            item.setAttribute("aria-expanded", "false");
        });
        if (estavaAberto) {
            painel.hidden = true;
            painel.dataset.tipo = "";
            return;
        }
        const d = relatorioElielAtual;
        const demais = Math.max(0, d.faturamento - (d.detalhesTaxas || []).reduce((total, item) => total + Number(item.vendas || 0), 0));
        const conteudos = {
            faturamento: `<div class="eliel-detalhe-cabecalho"><div><h3>Composição do faturamento</h3><p>Total bruto antes de taxas e custos.</p></div><strong>${moeda(d.faturamento)}</strong></div>
                <div class="eliel-detalhe-grid">${(d.detalhesTaxas || []).map(item => `<div><span>${escapar(item.forma)}</span><strong>${moeda(item.vendas)}</strong></div>`).join("")}<div><span>PIX e dinheiro</span><strong>${moeda(demais)}</strong></div></div>`,
            taxas: `<div class="eliel-detalhe-cabecalho"><div><h3>Detalhamento de taxas</h3><p>Base vendida, percentual aplicado e valor descontado.</p></div><strong>${moeda(d.taxas)}</strong></div>
                <div class="eliel-tabela-wrap"><table class="eliel-tabela"><thead><tr><th>Forma</th><th>Vendas</th><th>Taxa</th><th>Desconto</th></tr></thead><tbody>${(d.detalhesTaxas || []).map(item => `<tr><td><strong>${escapar(item.forma)}</strong></td><td>${moeda(item.vendas)}</td><td>${Number(item.percentual || 0).toFixed(2).replace(".", ",")}%</td><td>${moeda(item.valor)}</td></tr>`).join("")}</tbody></table></div>`,
            subtotal: `<div class="eliel-detalhe-cabecalho"><div><h3>Cálculo após taxas</h3><p>Faturamento bruto menos os descontos financeiros.</p></div><strong>${moeda(d.subtotal)}</strong></div>
                <div class="eliel-calculo-detalhe"><span>${moeda(d.faturamento)} <small>faturamento</small></span><b>−</b><span>${moeda(d.taxas)} <small>taxas</small></span><b>=</b><span>${moeda(d.subtotal)} <small>após taxas</small></span></div>`,
            liquido: `<div class="eliel-detalhe-cabecalho"><div><h3>Custos descontados</h3><p>O combustível considera somente os 80% atribuídos ao carro.</p></div><strong>${moeda(d.totalCustos)}</strong></div>
                <div class="eliel-detalhe-grid"><div><span>Combustível carro · 80%</span><strong>${moeda(d.custos.combustivelCarro)}</strong></div><div><span>Salário cozinha</span><strong>${moeda(d.custos.salarioCozinha)}</strong></div><div><span>Salário aux. carro</span><strong>${moeda(d.custos.salarioAuxCarro)}</strong></div><div><span>Manutenção carro</span><strong>${moeda(d.custos.manutencaoCarro)}</strong></div></div>`
        };
        painel.innerHTML = conteudos[tipo] || "";
        painel.hidden = false;
        painel.dataset.tipo = tipo;
        botao.classList.add("ativo");
        botao.setAttribute("aria-expanded", "true");
    };

    function configuracaoDaTela() {
        return {
            combustivelTotal: numeroCampo("elielCustoCombustivel"),
            salarioCozinha: numeroCampo("elielCustoCozinha"),
            salarioAuxCarro: numeroCampo("elielCustoAux"),
            manutencaoCarro: numeroCampo("elielCustoManutencao"),
            percentualCompra: numeroCampo("elielPercCompra"),
            percentualLucas: numeroCampo("elielPercLucas"),
            percentualEliel: numeroCampo("elielPercEliel"),
            taxaDebito: relatorioElielAtual.configuracoes.taxaDebito,
            taxaCredito: relatorioElielAtual.configuracoes.taxaCredito,
            taxaVr: relatorioElielAtual.configuracoes.taxaVr
        };
    }

    window.recalcularRelatorioElielLocal = function () {
        if (!relatorioElielAtual) return;
        const config = configuracaoDaTela();
        const combustivelCarro = config.combustivelTotal * 0.80;
        const combustivelTrailer = config.combustivelTotal * 0.20;
        const totalCustos = combustivelCarro + config.salarioCozinha +
            config.salarioAuxCarro + config.manutencaoCarro;
        const liquido = relatorioElielAtual.subtotal - totalCustos;
        const base = Math.max(0, liquido);
        relatorioElielAtual.configuracoes = config;
        relatorioElielAtual.custos = {
            combustivelTotal: config.combustivelTotal,
            combustivelCarro: combustivelCarro,
            combustivelTrailer: combustivelTrailer,
            salarioCozinha: config.salarioCozinha,
            salarioAuxCarro: config.salarioAuxCarro,
            manutencaoCarro: config.manutencaoCarro
        };
        relatorioElielAtual.totalCustos = totalCustos;
        relatorioElielAtual.liquido = liquido;
        relatorioElielAtual.distribuicao = {
            compra: base * config.percentualCompra / 100,
            lucas: base * config.percentualLucas / 100,
            eliel: base * config.percentualEliel / 100
        };

        document.getElementById("elielTotalCustos").textContent = moeda(totalCustos);
        document.getElementById("elielLiquido").textContent = moeda(liquido);
        document.getElementById("elielResumoCustos").textContent = moeda(totalCustos);
        document.getElementById("elielResumoLiquido").textContent = moeda(liquido);
        document.getElementById("elielCombustivelTotal").textContent = moeda(config.combustivelTotal);
        document.getElementById("elielCombustivelCarro").textContent = moeda(combustivelCarro);
        document.getElementById("elielCombustivelTrailer").textContent = moeda(combustivelTrailer);
        document.getElementById("elielResumoStatus").textContent = liquido >= 0 ? "Resultado positivo" : "Resultado negativo";
        document.getElementById("elielResumoStatus").classList.toggle("negativo", liquido < 0);
        document.getElementById("elielDistribuicao").innerHTML = [
            ["Compra", config.percentualCompra, relatorioElielAtual.distribuicao.compra],
            ["Lucas", config.percentualLucas, relatorioElielAtual.distribuicao.lucas],
            ["Eliel", config.percentualEliel, relatorioElielAtual.distribuicao.eliel]
        ].map(item => `
            <div>
                <span>${item[0]}</span>
                <span class="eliel-barra"><i style="width:${Math.min(100, item[1])}%"></i></span>
                <strong>${moeda(item[2])}</strong>
            </div>`).join("");

        const sinal = liquido >= 0 ? "lucro líquido" : "resultado negativo";
        document.getElementById("elielResumoLucro").textContent =
            `O mês registrou ${relatorioElielAtual.totalTapiocas || 0} tapiocas e ${moeda(relatorioElielAtual.faturamento)} de faturamento. ` +
            `Após ${moeda(relatorioElielAtual.taxas)} em taxas e ${moeda(totalCustos)} em custos, o ${sinal} foi de ${moeda(liquido)}.`;
    };

    window.salvarConfiguracoesEliel = function () {
        const config = configuracaoDaTela();
        const soma = config.percentualCompra + config.percentualLucas + config.percentualEliel;
        if (Math.abs(soma - 100) > 0.01) {
            mostrarAlerta(`Os percentuais precisam somar 100%. Hoje somam ${soma.toFixed(2)}%.`);
            return;
        }
        google.script.run
            .withSuccessHandler(function () {
                recalcularRelatorioElielLocal();
                mostrarToast("Configurações do Relatório Eliel salvas.");
            })
            .withFailureHandler(function (erro) {
                mostrarAlerta("Não foi possível salvar as configurações.<br><small>" + escapar(erro.message) + "</small>");
            })
            .salvarConfiguracoesRelatorioEliel(JSON.stringify(config));
    };

    function linhasExportacao(d) {
        const linhas = [
            ["Relatório Eliel", `${meses[d.mes - 1]} de ${d.ano}`],
            ["Faturamento", d.faturamento],
            ["Taxas", d.taxas],
            ["Subtotal após taxas", d.subtotal],
            ["Custos", d.totalCustos],
            ["Líquido", d.liquido],
            ["Compra", d.distribuicao.compra],
            ["Lucas", d.distribuicao.lucas],
            ["Eliel", d.distribuicao.eliel],
            ["Tapiocas", d.totalTapiocas],
            [],
            ["Três mais vendidas", "Quantidade", "Melhor dia"]
        ];
        (d.top3 || []).forEach(item => linhas.push([item.produto, item.quantidade, item.melhorDia]));
        linhas.push([], ["Cinco menos vendidas", "Quantidade", "Insight"]);
        (d.menosVendidas || []).forEach(item => linhas.push([item.produto, item.quantidade, item.insight]));
        linhas.push([], ["Rota", "Faturamento", "Tapiocas", "Mais vendida"]);
        (d.rotas || []).forEach(item => linhas.push([item.rota, item.total, item.tapiocas, item.tapiocaMaisVendida]));
        return linhas;
    }

    function baixarBlob(blob, nome) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = nome;
        link.click();
        URL.revokeObjectURL(url);
    }

    window.exportarRelatorioElielCsv = function () {
        if (!relatorioElielAtual) return;
        const csv = linhasExportacao(relatorioElielAtual)
            .map(linha => linha.map(celula => `"${String(celula == null ? "" : celula).replace(/"/g, '""')}"`).join(";"))
            .join("\r\n");
        baixarBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `Relatorio_Eliel_${relatorioElielAtual.chave}.csv`);
    };

    window.exportarRelatorioElielXlsx = async function () {
        if (!relatorioElielAtual) return;
        try {
            await window.TapimovelVendors.load("xlsx");
        } catch (erro) {
            mostrarAlerta("Não foi possível preparar o arquivo XLSX.<br><small>" + escapar(erro.message) + "</small>");
            return;
        }
        const planilha = window.XLSX.utils.aoa_to_sheet(linhasExportacao(relatorioElielAtual));
        planilha["!cols"] = [{ wch: 36 }, { wch: 18 }, { wch: 44 }, { wch: 28 }];
        const arquivo = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(arquivo, planilha, "Relatorio Eliel");
        window.XLSX.writeFile(arquivo, `Relatorio_Eliel_${relatorioElielAtual.chave}.xlsx`);
    };

    function desenharColunaPdf(doc, titulo, dados, x, largura) {
        doc.setFillColor(28, 35, 39);
        doc.roundedRect(x, 29, largura, 152, 3, 3, "F");
        doc.setTextColor(255, 107, 95);
        doc.setFontSize(13);
        doc.text(titulo, x + 6, 40);
        doc.setTextColor(235, 238, 240);
        doc.setFontSize(9);
        const linhas = [
            ["Faturamento", moeda(dados.faturamento)],
            ["Taxas", moeda(dados.taxas)],
            ["Após taxas", moeda(dados.subtotal)],
            ["Custos", moeda(dados.totalCustos)],
            ["Líquido", moeda(dados.liquido)],
            ["Tapiocas", String(dados.totalTapiocas || 0)],
            ["Melhor rota", dados.melhorRota ? dados.melhorRota.rota : "-"],
            ["Mais vendida", dados.top3 && dados.top3[0] ? dados.top3[0].produto : "-"],
            ["Compra", moeda(dados.distribuicao.compra)],
            ["Lucas", moeda(dados.distribuicao.lucas)],
            ["Eliel", moeda(dados.distribuicao.eliel)]
        ];
        let y = 51;
        linhas.forEach(linha => {
            doc.setTextColor(160, 170, 176);
            doc.text(linha[0], x + 6, y);
            doc.setTextColor(245, 247, 248);
            const texto = doc.splitTextToSize(linha[1], largura - 42);
            doc.text(texto, x + largura - 6, y, { align: "right" });
            y += Math.max(10, texto.length * 5);
        });
    }

    window.gerarComparativoElielPdf = async function () {
        if (!relatorioElielAtual) return;
        try {
            await window.TapimovelVendors.load("jspdf");
        } catch (erro) {
            mostrarAlerta("Não foi possível preparar o PDF.<br><small>" + escapar(erro.message) + "</small>");
            return;
        }
        const dataAnterior = new Date(relatorioElielAtual.ano, relatorioElielAtual.mes - 2, 1);
        google.script.run
            .withSuccessHandler(function (resposta) {
                relatorioElielAnterior = JSON.parse(resposta || "{}");
                const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
                doc.setFillColor(15, 21, 24);
                doc.rect(0, 0, 297, 210, "F");
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(20);
                doc.text("Comparativo mensal · Relatório Eliel", 14, 18);
                desenharColunaPdf(doc, `${meses[relatorioElielAnterior.mes - 1]} ${relatorioElielAnterior.ano}`, relatorioElielAnterior, 14, 130);
                desenharColunaPdf(doc, `${meses[relatorioElielAtual.mes - 1]} ${relatorioElielAtual.ano}`, relatorioElielAtual, 153, 130);
                doc.setTextColor(130, 140, 145);
                doc.setFontSize(8);
                doc.text("Expresso Tapiocaria · gerado pelo Tapimóvel", 14, 198);
                doc.save(`Comparativo_Eliel_${relatorioElielAnterior.chave}_x_${relatorioElielAtual.chave}.pdf`);
            })
            .withFailureHandler(function (erro) {
                mostrarAlerta("Não foi possível gerar o comparativo.<br><small>" + escapar(erro.message) + "</small>");
            })
            .obterRelatorioEliel(
                dataAnterior.getMonth() + 1,
                dataAnterior.getFullYear(),
                JSON.stringify(catalogoCompleto())
            );
    };

    window.abrirFechamentoMesEliel = function () {
        if (!relatorioElielAtual) return;
        previaFechamentoElielAtual = null;
        const modal = document.getElementById("modalPreviaFechamentoEliel");
        const carregando = document.getElementById("elielPreviaLoading");
        const conteudo = document.getElementById("elielPreviaConteudo");
        modal.style.display = "flex";
        carregando.hidden = false;
        conteudo.hidden = true;

        google.script.run
            .withSuccessHandler(function (resposta) {
                previaFechamentoElielAtual = JSON.parse(resposta || "{}");
                carregando.hidden = true;
                conteudo.hidden = false;
                desenharPreviaFechamentoEliel(previaFechamentoElielAtual);
            })
            .withFailureHandler(function (erro) {
                carregando.hidden = true;
                modal.style.display = "none";
                mostrarAlerta("Não foi possível preparar a prévia.<br><small>" + escapar(erro.message) + "</small>");
            })
            .obterPreviaFechamentoRelatorioEliel(
                relatorioElielAtual.mes,
                relatorioElielAtual.ano,
                JSON.stringify(catalogoCompleto())
            );
    };

    function desenharPreviaFechamentoEliel(previa) {
        const d = previa.relatorio || {};
        const custos = d.custos || {};
        const distribuicao = d.distribuicao || {};
        document.getElementById("elielPreviaPeriodo").textContent =
            `${meses[Number(d.mes || 1) - 1]} de ${d.ano || ""} · referência ${escapar(previa.chave || "")}`;
        document.getElementById("previaElielFaturamento").textContent = moeda(d.faturamento);
        document.getElementById("previaElielTaxas").textContent = "- " + moeda(d.taxas);
        document.getElementById("previaElielSubtotal").textContent = moeda(d.subtotal);
        document.getElementById("previaElielLiquido").textContent = moeda(d.liquido);
        document.getElementById("previaElielTotalCustos").textContent = moeda(d.totalCustos);
        document.getElementById("previaElielCombustivelTotal").textContent = moeda(custos.combustivelTotal);
        document.getElementById("previaElielCombustivelCarro").textContent = moeda(custos.combustivelCarro);
        document.getElementById("previaElielCombustivelTrailer").textContent = moeda(custos.combustivelTrailer);
        document.getElementById("previaElielCozinha").textContent = moeda(custos.salarioCozinha);
        document.getElementById("previaElielAux").textContent = moeda(custos.salarioAuxCarro);
        document.getElementById("previaElielManutencao").textContent = moeda(custos.manutencaoCarro);
        document.getElementById("previaElielCompra").textContent = moeda(distribuicao.compra);
        document.getElementById("previaElielLucas").textContent = moeda(distribuicao.lucas);
        document.getElementById("previaElielEliel").textContent = moeda(distribuicao.eliel);
        document.getElementById("previaElielTapiocas").textContent =
            `${Number(d.totalTapiocas || 0)} tapiocas`;

        const status = document.getElementById("elielPreviaStatus");
        const botao = document.getElementById("btnConfirmarFechamentoEliel");
        status.className = "eliel-previa-status";
        if (previa.duplicado) {
            status.classList.add("bloqueado");
            status.innerHTML = "<strong>Mês já fechado</strong><span>Esse período já existe no histórico e não pode ser fechado novamente.</span>";
        } else if (Number(previa.pedidosPendentes || 0) > 0) {
            status.classList.add("bloqueado");
            status.innerHTML = `<strong>Fechamento bloqueado</strong><span>Existem ${Number(previa.pedidosPendentes)} pedido(s) pendente(s). Finalize-os no PDV e gere uma nova prévia.</span>`;
        } else {
            status.classList.add("liberado");
            status.innerHTML = "<strong>Valores validados pelo servidor</strong><span>Nenhum fechamento duplicado ou pedido pendente foi encontrado.</span>";
        }
        botao.disabled = !previa.podeFechar;
    }

    window.fecharPreviaFechamentoEliel = function () {
        previaFechamentoElielAtual = null;
        document.getElementById("modalPreviaFechamentoEliel").style.display = "none";
    };

    window.confirmarFechamentoMesEliel = function () {
        if (!previaFechamentoElielAtual || !previaFechamentoElielAtual.podeFechar) return;
        mostrarConfirmacao(
            `Confirmar o fechamento de ${previaFechamentoElielAtual.chave}? Os valores serão validados novamente e os pedidos ativos serão zerados.`,
            fecharMesElielConfirmado,
            {
                titulo: "Confirmação final do CEO Eliel",
                icone: "!",
                textoCancelar: "Revisar novamente",
                textoConfirmar: "Confirmar e zerar",
                destrutiva: true
            }
        );
    };

    function fecharMesElielConfirmado() {
        if (!previaFechamentoElielAtual) return;
        const mes = previaFechamentoElielAtual.relatorio.mes;
        const ano = previaFechamentoElielAtual.relatorio.ano;
        const chave = previaFechamentoElielAtual.chave;
        document.getElementById("loadingText").textContent = "Fechando o mês no Relatório Eliel...";
        document.getElementById("loadingScreen").style.display = "flex";
        google.script.run
            .withSuccessHandler(function () {
                document.getElementById("loadingScreen").style.display = "none";
                historicoNuvem = [];
                fecharPreviaFechamentoEliel();
                mostrarAlerta(`Mês ${chave} fechado com sucesso pelo CEO Eliel. O histórico mensal foi preservado.`);
                carregarRelatorioEliel();
            })
            .withFailureHandler(function (erro) {
                document.getElementById("loadingScreen").style.display = "none";
                mostrarAlerta("O fechamento não foi realizado.<br><small>" + escapar(erro.message) + "</small>");
            })
            .fecharMesRelatorioEliel(
                mes,
                ano,
                JSON.stringify(catalogoCompleto())
            );
    }

    window.abrirTelaItens = function () {
        mudarTela("view-itens");
        carregarDisponibilidadeCardapio();
        setTimeout(renderizarTelaItens, 180);
    };

    window.renderizarTelaItens = function () {
        const lista = document.getElementById("listaGestaoItens");
        if (!lista) return;
        const buscaOriginal = (document.getElementById("itensBusca").value || "").trim();
        const busca = TapimovelCatalogo.normalizarBusca(buscaOriginal);
        const itens = catalogoCompleto().filter(item =>
            TapimovelCatalogo.correspondeBusca(item, busca)
        );
        resultadosGestaoItens = itens.map(item => item.nome);
        const disponiveis = catalogoCompleto().filter(item => !itensIndisponiveis.includes(item.nome)).length;
        document.getElementById("itensResumo").textContent =
            `${disponiveis} disponíveis · ${itensIndisponiveis.length} pausados`;

        const acoesMassa = document.getElementById("itensAcoesMassa");
        acoesMassa.hidden = !buscaOriginal || !itens.length;
        document.getElementById("itensResultadoBusca").textContent =
            `${itens.length} ${itens.length === 1 ? "resultado" : "resultados"} para “${buscaOriginal}”`;

        lista.innerHTML = itens.map(item => {
            const pausado = itensIndisponiveis.includes(item.nome);
            const nome = encodeURIComponent(item.nome).replace(/'/g, "%27");
            const imagem = typeof obterImagemProdutoAdmin === "function" ? obterImagemProdutoAdmin(item) : "";
            return `
                <article class="gestao-item ${pausado ? "pausado" : ""}" data-item="${escapar(item.nome)}">
                    <button type="button" class="gestao-item-main"
                        onclick="cliqueGestaoItem(decodeURIComponent('${nome}'))"
                        onpointerdown="iniciarPressaoGestaoItem(event, decodeURIComponent('${nome}'))"
                        onpointerup="cancelarPressaoGestaoItem()"
                        onpointercancel="cancelarPressaoGestaoItem()"
                        onpointerleave="cancelarPressaoGestaoItem()">
                        ${imagem ? `<img class="gestao-item-imagem" src="${imagem}" alt="" loading="lazy" decoding="async">` : ""}
                        <span>${escapar(item.nome)}<small>${escapar(item.ing || (item.tipo === "bebida" ? "Bebida" : "Sem ingredientes"))}</small><small>${item.tipo === "bebida" ? "Bebida" : "Tapioca"} · ${moeda(item.preco)}</small></span>
                        <span class="press-progress" aria-hidden="true"><b class="press-progress-value">2</b>s</span>
                        <span class="press-progress-fill" aria-hidden="true"></span>
                    </button>
                    <button type="button" class="item-switch" role="switch" aria-checked="${!pausado}"
                        aria-label="${pausado ? "Ativar" : "Desativar"} ${escapar(item.nome)}"
                        onclick="alternarChaveGestaoItem(decodeURIComponent('${nome}'))">
                        <i aria-hidden="true"></i><span>${pausado ? "Desativado" : "Ativo"}</span>
                    </button>
                </article>`;
        }).join("");
    };

    window.cliqueGestaoItem = function (nome) {
        if (nomeItemPressionado === nome) {
            nomeItemPressionado = "";
            return;
        }
        mostrarToast("Use a chave ou pressione e segure por 2 segundos para alterar este item.");
    };

    window.iniciarPressaoGestaoItem = function (evento, nome) {
        if (typeof evento.button === "number" && evento.button !== 0) return;
        cancelarPressaoGestaoItem();
        const botao = evento.currentTarget;
        const inicio = Date.now();
        botaoGestaoPressionado = botao;
        botao.classList.add("em-pressao");
        botao.style.setProperty("--press-progress", "0%");

        function atualizarProgresso() {
            const decorrido = Math.min(Date.now() - inicio, DURACAO_PRESSAO_GESTAO_ITEM);
            const restante = Math.max(0, DURACAO_PRESSAO_GESTAO_ITEM - decorrido);
            const contador = botao.querySelector(".press-progress-value");
            botao.style.setProperty("--press-progress", `${(decorrido / DURACAO_PRESSAO_GESTAO_ITEM) * 100}%`);
            if (contador) contador.textContent = Math.max(1, Math.ceil(restante / 1000));
        }

        atualizarProgresso();
        intervaloGestaoItem = setInterval(atualizarProgresso, 50);
        timerGestaoItem = setTimeout(function () {
            clearInterval(intervaloGestaoItem);
            nomeItemPressionado = nome;
            if (navigator.vibrate) navigator.vibrate(60);
            salvarEstadoItem(nome, itensIndisponiveis.includes(nome));
            cancelarPressaoGestaoItem();
        }, DURACAO_PRESSAO_GESTAO_ITEM);
    };

    window.cancelarPressaoGestaoItem = function () {
        clearTimeout(timerGestaoItem);
        clearInterval(intervaloGestaoItem);
        if (botaoGestaoPressionado) {
            botaoGestaoPressionado.classList.remove("em-pressao");
            botaoGestaoPressionado.style.removeProperty("--press-progress");
            const contador = botaoGestaoPressionado.querySelector(".press-progress-value");
            if (contador) contador.textContent = "2";
        }
        botaoGestaoPressionado = null;
    };

    window.alternarChaveGestaoItem = function (nome) {
        salvarEstadoItem(nome, itensIndisponiveis.includes(nome));
    };

    window.definirEstadoResultadosItens = function (disponibilizar) {
        if (!resultadosGestaoItens.length) return;
        const quantidade = resultadosGestaoItens.length;
        const executar = function () {
            const conjunto = new Set(itensIndisponiveis);
            resultadosGestaoItens.forEach(function (nome) {
                if (disponibilizar) conjunto.delete(nome);
                else conjunto.add(nome);
            });
            persistirDisponibilidade(
                Array.from(conjunto),
                disponibilizar
                    ? `${quantidade} ${quantidade === 1 ? "item ativado" : "itens ativados"}.`
                    : `${quantidade} ${quantidade === 1 ? "item desativado" : "itens desativados"} até a virada do dia.`
            );
        };
        if (disponibilizar) {
            executar();
            return;
        }
        mostrarConfirmacao(
            `Desativar os ${quantidade} itens exibidos nesta busca até a virada do dia?`,
            executar,
            { titulo: "Desativar resultados", icone: "⏸", textoConfirmar: "Desativar todos", destrutiva: true }
        );
    };

    function salvarEstadoItem(nome, disponibilizar) {
        const novaLista = disponibilizar
            ? itensIndisponiveis.filter(item => item !== nome)
            : itensIndisponiveis.concat(nome).filter((item, indice, lista) => lista.indexOf(item) === indice);
        persistirDisponibilidade(
            novaLista,
            disponibilizar ? `${nome} disponível novamente.` : `${nome} pausado até a virada do dia.`
        );
    }

    function persistirDisponibilidade(novaLista, mensagem) {
        const anterior = itensIndisponiveis.slice();
        itensIndisponiveis = novaLista;
        renderizarTelaItens();
        google.script.run
            .withSuccessHandler(function (resposta) {
                itensIndisponiveis = JSON.parse(resposta || "[]");
                renderizarTelaItens();
                if (termoPesquisa.length > 0) renderizarPesquisa();
                else if (abaAtivaCatalogo) renderizarCatalogo(abaAtivaCatalogo);
                mostrarToast(mensagem);
            })
            .withFailureHandler(function (erro) {
                itensIndisponiveis = anterior;
                renderizarTelaItens();
                mostrarAlerta("Não foi possível alterar o item.<br><small>" + escapar(erro.message) + "</small>");
            })
            .salvarDisponibilidadeCardapio(JSON.stringify(itensIndisponiveis));
    }

    const opcoesTapioca = [
        { chave: "milho", nome: "Milho", emoji: "🌽" },
        { chave: "azeitona", nome: "Azeitona", emoji: "🫒" },
        { chave: "tomate", nome: "Tomate", emoji: "🍅" },
        { chave: "cebola", nome: "Cebola", emoji: "🧅" }
    ];
    const temperosTapioca = [
        { chave: "oregano", nome: "Orégano", emoji: "🌿" },
        { chave: "tempero baiano", nome: "Tempero baiano", emoji: "🧂" }
    ];

    window.identificarCategoriaAdicional = function (item) {
        if (item && (item.categoriaAdicional === "doce" || item.categoriaAdicional === "salgado")) {
            return item.categoriaAdicional;
        }
        const doces = [].concat(bdCatalogo.doces_tradicionais, bdCatalogo.doces_avela, bdCatalogo.doces_nutella);
        return doces.some(produto => produto.nome === (item && item.nome)) ? "doce" : "salgado";
    };

    window.renderizarOpcoesTapioca = function (item, index) {
        const ingredientes = String(item.ing || "").toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const selecionadas = item.personalizacoes || [];
        function grupo(titulo, opcoes) {
            return `<div class="opcoes-tapioca-grupo"><span>${titulo}</span>${opcoes.map(opcao => {
                const bloqueada = ingredientes.includes(opcao.chave);
                const ativa = selecionadas.includes(opcao.nome);
                return `<button type="button" class="opcao-emoji ${ativa ? "ativa" : ""}"
                    title="${bloqueada ? opcao.nome + " já incluso" : opcao.nome}"
                    aria-label="${opcao.nome}${bloqueada ? " já incluso" : ""}"
                    ${bloqueada ? "disabled" : ""}
                    onclick="togglePersonalizacaoTapioca(event, ${index}, '${opcao.nome}')">${opcao.emoji}</button>`;
            }).join("")}</div>`;
        }
        const adicionais = Array.isArray(item.adicionais) ? item.adicionais : [];
        const chips = adicionais.length
            ? `<div class="adicionais-selecionados">${adicionais.map(nome => `<span>+ ${escapar(nome)}</span>`).join("")}</div>`
            : "";
        return `<div class="opcoes-tapioca">${grupo("Acompanh.", opcoesTapioca)}${grupo("Temperos", temperosTapioca)}
            <div class="adicional-item-controle">
                <button type="button" onclick="abrirAdicionaisTapioca(event, ${index})">➕ Adicional · ${moeda(PRECO_ADICIONAL)}</button>
                ${adicionais.length ? `<strong>${adicionais.length} selecionado${adicionais.length > 1 ? "s" : ""}</strong>` : ""}
            </div>${chips}</div>`;
    };

    window.togglePersonalizacaoTapioca = function (evento, index, nome) {
        evento.preventDefault();
        evento.stopPropagation();
        const item = carrinho[index];
        item.personalizacoes = item.personalizacoes || [];
        item.personalizacoes = item.personalizacoes.includes(nome)
            ? item.personalizacoes.filter(valor => valor !== nome)
            : item.personalizacoes.concat(nome);
        atualizarCarrinho();
    };

    window.abrirAdicionaisTapioca = function (evento, index) {
        evento.preventDefault();
        evento.stopPropagation();
        const item = carrinho[index];
        if (!item || item.tipo !== "tapioca") return;
        indiceAdicionalCarrinho = index;
        item.categoriaAdicional = window.identificarCategoriaAdicional(item);
        adicionaisSelecionadosModal = Array.isArray(item.adicionais) ? item.adicionais.slice() : [];
        document.getElementById("adicionalItemAlvo").textContent = item.nome;
        renderizarModalAdicionais();
        document.getElementById("modalAdicional").style.display = "flex";
    };

    function renderizarModalAdicionais() {
        const item = carrinho[indiceAdicionalCarrinho];
        if (!item) return;
        const opcoes = item.categoriaAdicional === "doce" ? adicionaisDoces : adicionaisSalgados;
        document.getElementById("listaAdicionais").innerHTML = opcoes.map(function (nome) {
            const ativo = adicionaisSelecionadosModal.includes(nome);
            const codificado = encodeURIComponent(nome).replace(/'/g, "%27");
            return `<button type="button" class="adicional-opcao ${ativo ? "selecionado" : ""}"
                aria-pressed="${ativo}" onclick="alternarAdicionalModal(decodeURIComponent('${codificado}'))">
                <span>${ativo ? "✓" : "+"}</span>${escapar(nome)}<small>+ ${moeda(PRECO_ADICIONAL)}</small>
            </button>`;
        }).join("");
        const quantidade = adicionaisSelecionadosModal.length;
        document.getElementById("adicionalQuantidade").textContent = quantidade
            ? `${quantidade} ${quantidade === 1 ? "adicional selecionado" : "adicionais selecionados"}`
            : "Nenhum adicional selecionado";
        document.getElementById("adicionalTotal").textContent = "+ " + moeda(quantidade * PRECO_ADICIONAL);
    }

    window.alternarAdicionalModal = function (nome) {
        adicionaisSelecionadosModal = adicionaisSelecionadosModal.includes(nome)
            ? adicionaisSelecionadosModal.filter(item => item !== nome)
            : adicionaisSelecionadosModal.concat(nome);
        renderizarModalAdicionais();
    };

    window.confirmarAdicionaisTapioca = function () {
        const item = carrinho[indiceAdicionalCarrinho];
        if (!item) return;
        const quantidadeAnterior = Array.isArray(item.adicionais) ? item.adicionais.length : 0;
        const baseCalculada = Number(item.preco) - (quantidadeAnterior * PRECO_ADICIONAL);
        item.precoBase = Number.isFinite(Number(item.precoBase)) && Number(item.precoBase) > 0
            ? Number(item.precoBase)
            : Math.max(0.01, baseCalculada);
        item.adicionais = adicionaisSelecionadosModal.slice();
        item.preco = Math.round((item.precoBase + item.adicionais.length * PRECO_ADICIONAL) * 100) / 100;
        fecharModalAdicionais();
        atualizarCarrinho();
        mostrarToast(item.adicionais.length
            ? `${item.adicionais.length} adicional(is) salvo(s) em ${item.nome}.`
            : `Adicionais removidos de ${item.nome}.`);
    };

    window.fecharModalAdicionais = function () {
        document.getElementById("modalAdicional").style.display = "none";
        indiceAdicionalCarrinho = -1;
        adicionaisSelecionadosModal = [];
    };

    function conectarRecalculo() {
        [
            "elielCustoCombustivel", "elielCustoCozinha", "elielCustoAux",
            "elielCustoManutencao", "elielPercCompra", "elielPercLucas", "elielPercEliel"
        ].forEach(id => {
            document.getElementById(id).addEventListener("input", recalcularRelatorioElielLocal);
        });
    }

    function verificarAvisoPdv() {
        google.script.run
            .withSuccessHandler(function (resposta) {
                const aviso = JSON.parse(resposta || "{}");
                if (aviso.mensagem) mostrarAlerta(escapar(aviso.mensagem));
            })
            .withFailureHandler(function () {
                // Avisos são informativos e não devem bloquear o acesso ao PDV.
            })
            .obterAvisosPdv();
    }

    window.verificarAvisoPdv = verificarAvisoPdv;

    window.addEventListener("DOMContentLoaded", function () {
        configurarFiltrosEliel();
        conectarRecalculo();
    });
})();
