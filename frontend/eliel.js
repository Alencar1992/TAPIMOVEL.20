(function () {
    "use strict";

    let relatorioElielAtual = null;
    let relatorioElielAnterior = null;
    let timerGestaoItem = null;
    let intervaloGestaoItem = null;
    let botaoGestaoPressionado = null;
    let nomeItemPressionado = "";
    const DURACAO_PRESSAO_GESTAO_ITEM = 3000;

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

    function desenharLista(id, itens, rotulo, valor) {
        const elemento = document.getElementById(id);
        elemento.innerHTML = itens.length
            ? itens.map(item => `<div><span>${escapar(item[rotulo])}</span><strong>${escapar(item[valor])}</strong></div>`).join("")
            : '<p style="color:var(--text-muted)">Sem vendas registradas.</p>';
    }

    function desenharRelatorioEliel() {
        const d = relatorioElielAtual;
        document.getElementById("elielFaturamento").textContent = moeda(d.faturamento);
        document.getElementById("elielTaxas").textContent = "- " + moeda(d.taxas);
        document.getElementById("elielSubtotal").textContent = moeda(d.subtotal);
        document.getElementById("elielLiquido").textContent = moeda(d.liquido);
        document.getElementById("elielTotalTapiocas").textContent = `${d.totalTapiocas || 0} un`;

        desenharLista("elielPorDia", d.porDia || [], "dia", "quantidade");
        desenharLista("elielPorSemana", d.porSemana || [], "semana", "quantidade");

        document.getElementById("elielTop3").innerHTML = (d.top3 || []).length
            ? d.top3.map((item, indice) => `
                <div>
                    <span class="posicao">${indice + 1}º</span>
                    <span class="produto"><strong>${escapar(item.produto)}</strong><small>Melhor dia: ${escapar(item.melhorDia)}</small></span>
                    <strong>${item.quantidade} un</strong>
                </div>`).join("")
            : '<p style="color:var(--text-muted)">Sem vendas registradas.</p>';

        document.getElementById("elielMenos5").innerHTML = (d.menosVendidas || [])
            .map(item => `
                <div>
                    <strong>${escapar(item.produto)} · ${item.quantidade} un</strong>
                    <p>${escapar(item.insight)}</p>
                </div>`).join("");

        document.getElementById("elielMelhorRota").textContent = d.melhorRota
            ? `${d.melhorRota.rota} · ${moeda(d.melhorRota.total)}`
            : "Sem dados";

        document.getElementById("elielRotas").innerHTML = `
            <table class="eliel-tabela">
                <thead><tr><th>Rota</th><th>Faturamento</th><th>Tapiocas</th><th>Mais vendida</th></tr></thead>
                <tbody>${(d.rotas || []).map(item => `
                    <tr>
                        <td><strong>${escapar(item.rota)}</strong></td>
                        <td>${moeda(item.total)}</td>
                        <td>${item.tapiocas} un</td>
                        <td>${escapar(item.tapiocaMaisVendida)}</td>
                    </tr>`).join("") || '<tr><td colspan="4">Sem dados de rota.</td></tr>'}
                </tbody>
            </table>`;

        preencherCampo("elielCustoCombustivel", d.custos.combustivelCarro);
        preencherCampo("elielCustoCozinha", d.custos.salarioCozinha);
        preencherCampo("elielCustoAux", d.custos.salarioAuxCarro);
        preencherCampo("elielCustoManutencao", d.custos.manutencaoCarro);
        document.getElementById("elielPercCompra").value = d.configuracoes.percentualCompra;
        document.getElementById("elielPercLucas").value = d.configuracoes.percentualLucas;
        document.getElementById("elielPercEliel").value = d.configuracoes.percentualEliel;
        recalcularRelatorioElielLocal();
    }

    function configuracaoDaTela() {
        return {
            combustivelCarro: numeroCampo("elielCustoCombustivel"),
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
        const totalCustos = config.combustivelCarro + config.salarioCozinha +
            config.salarioAuxCarro + config.manutencaoCarro;
        const liquido = relatorioElielAtual.subtotal - totalCustos;
        const base = Math.max(0, liquido);
        relatorioElielAtual.configuracoes = config;
        relatorioElielAtual.custos = {
            combustivelCarro: config.combustivelCarro,
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

    window.exportarRelatorioElielXlsx = function () {
        if (!relatorioElielAtual || typeof XLSX === "undefined") {
            mostrarAlerta("O gerador XLSX ainda não carregou. Atualize a página e tente novamente.");
            return;
        }
        const planilha = XLSX.utils.aoa_to_sheet(linhasExportacao(relatorioElielAtual));
        planilha["!cols"] = [{ wch: 36 }, { wch: 18 }, { wch: 44 }, { wch: 28 }];
        const arquivo = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(arquivo, planilha, "Relatorio Eliel");
        XLSX.writeFile(arquivo, `Relatorio_Eliel_${relatorioElielAtual.chave}.xlsx`);
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

    window.gerarComparativoElielPdf = function () {
        if (!relatorioElielAtual || !window.jspdf) return;
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
        const soma = numeroCampo("elielPercCompra") + numeroCampo("elielPercLucas") + numeroCampo("elielPercEliel");
        if (Math.abs(soma - 100) > 0.01) {
            mostrarAlerta("Antes de fechar, ajuste os percentuais para somarem 100%.");
            return;
        }
        recalcularRelatorioElielLocal();
        mostrarConfirmacao(
            `Fechar ${meses[relatorioElielAtual.mes - 1]} de ${relatorioElielAtual.ano}? Uma cópia será salva na aba Relatorio Eliel e os pedidos ativos serão zerados.`,
            function () {
                mostrarConfirmacao(
                    "Esta é a confirmação final. O histórico será preservado, mas os pedidos ativos serão limpos.",
                    fecharMesElielConfirmado,
                    {
                        titulo: "Confirmar fechamento do mês",
                        icone: "!",
                        textoCancelar: "Cancelar",
                        textoConfirmar: "Fechar e zerar",
                        destrutiva: true
                    }
                );
            },
            {
                titulo: "Escolha do mês confirmada?",
                icone: "📅",
                textoCancelar: "Cancelar",
                textoConfirmar: "Continuar",
                destrutiva: true
            }
        );
    };

    function fecharMesElielConfirmado() {
        document.getElementById("loadingText").textContent = "Fechando o mês no Relatório Eliel...";
        document.getElementById("loadingScreen").style.display = "flex";
        google.script.run
            .withSuccessHandler(function () {
                document.getElementById("loadingScreen").style.display = "none";
                historicoNuvem = [];
                atualizarTudo();
                mostrarAlerta(`Mês ${relatorioElielAtual.chave} fechado com sucesso. O histórico mensal foi preservado.`);
                mudarTela("view-catalogo");
            })
            .withFailureHandler(function (erro) {
                document.getElementById("loadingScreen").style.display = "none";
                mostrarAlerta("O fechamento não foi realizado.<br><small>" + escapar(erro.message) + "</small>");
            })
            .fecharMesRelatorioEliel(JSON.stringify(relatorioElielAtual));
    }

    window.abrirTelaItens = function () {
        mudarTela("view-itens");
        carregarDisponibilidadeCardapio();
        setTimeout(renderizarTelaItens, 180);
    };

    window.renderizarTelaItens = function () {
        const lista = document.getElementById("listaGestaoItens");
        if (!lista) return;
        const busca = (document.getElementById("itensBusca").value || "").trim().toLowerCase();
        const itens = catalogoCompleto().filter(item =>
            !busca || item.nome.toLowerCase().includes(busca)
        );
        const disponiveis = catalogoCompleto().filter(item => !itensIndisponiveis.includes(item.nome)).length;
        document.getElementById("itensResumo").textContent =
            `${disponiveis} disponíveis · ${itensIndisponiveis.length} pausados`;

        lista.innerHTML = itens.map(item => {
            const pausado = itensIndisponiveis.includes(item.nome);
            return `
                <button type="button"
                    class="gestao-item ${pausado ? "pausado" : ""}"
                    data-item="${escapar(item.nome)}"
                    onclick="cliqueGestaoItem('${escapar(item.nome).replace(/'/g, "\\'")}')"
                    onpointerdown="iniciarPressaoGestaoItem(event, '${escapar(item.nome).replace(/'/g, "\\'")}')"
                    onpointerup="cancelarPressaoGestaoItem()"
                    onpointercancel="cancelarPressaoGestaoItem()"
                    onpointerleave="cancelarPressaoGestaoItem()">
                    <span>${escapar(item.nome)}<small>${item.tipo === "bebida" ? "Bebida" : "Tapioca"} · ${moeda(item.preco)}</small></span>
                    <span class="flag-item">${pausado ? "Indisponível" : "Disponível"}</span>
                    <span class="press-progress" aria-hidden="true"><b class="press-progress-value">3</b>s</span>
                    <span class="press-progress-fill" aria-hidden="true"></span>
                </button>`;
        }).join("");
    };

    window.cliqueGestaoItem = function (nome) {
        if (nomeItemPressionado === nome) {
            nomeItemPressionado = "";
            return;
        }
        mostrarToast("Pressione e segure por 3 segundos para alterar este item.");
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
            if (contador) contador.textContent = "3";
        }
        botaoGestaoPressionado = null;
    };

    function salvarEstadoItem(nome, disponibilizar) {
        const anterior = itensIndisponiveis.slice();
        itensIndisponiveis = disponibilizar
            ? itensIndisponiveis.filter(item => item !== nome)
            : itensIndisponiveis.concat(nome).filter((item, indice, lista) => lista.indexOf(item) === indice);
        renderizarTelaItens();
        google.script.run
            .withSuccessHandler(function (resposta) {
                itensIndisponiveis = JSON.parse(resposta || "[]");
                renderizarTelaItens();
                mostrarToast(disponibilizar ? `${nome} disponível novamente.` : `${nome} pausado até a virada do dia.`);
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
        return `<div class="opcoes-tapioca">${grupo("Acompanh.", opcoesTapioca)}${grupo("Temperos", temperosTapioca)}</div>`;
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
            .obterAvisosPdv();
    }

    window.addEventListener("DOMContentLoaded", function () {
        configurarFiltrosEliel();
        conectarRecalculo();
        verificarAvisoPdv();
    });
})();
