(function () {
    "use strict";

    let ultimoEstado = null;
    let observadorConteudo = null;
    let sequenciaConsulta = 0;
    let periodoRelatorioCarregado = null;
    let periodoRelatorioPendente = null;
    let carregamentoRelatorioEmCurso = null;
    let carregarRelatorioOriginal = null;

    function ehAcessoEliel() {
        return new URLSearchParams(window.location.search).get("acesso") === "eliel";
    }

    function escapar(valor) {
        return String(valor == null ? "" : valor)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function chaveSelecionada() {
        const campoMes = document.getElementById("elielMes");
        const campoAno = document.getElementById("elielAno");
        const mes = Number(campoMes && campoMes.value);
        const ano = Number(campoAno && campoAno.value);
        if (!mes || !ano) return "";
        return String(ano) + "-" + String(mes).padStart(2, "0");
    }

    function catalogoCompletoControle() {
        if (typeof bdCatalogo === "undefined" || !bdCatalogo) return [];
        return []
            .concat(
                bdCatalogo.salgadas || [],
                bdCatalogo.especiais || [],
                bdCatalogo.doces_tradicionais || [],
                bdCatalogo.doces_avela || [],
                bdCatalogo.doces_nutella || [],
                bdCatalogo.bebidas || []
            )
            .filter(function (item, indice, lista) {
                const nome = String(item && item.nome || "").trim();
                if (!nome || nome.toLowerCase() === "+ adicional") return false;
                return lista.findIndex(function (outro) {
                    return String(outro && outro.nome || "").trim() === nome;
                }) === indice;
            });
    }

    function criarPainel() {
        const conteudo = document.getElementById("elielConteudo");
        if (!conteudo || document.getElementById("elielFechamentoControle")) return Boolean(conteudo);

        const painel = document.createElement("section");
        painel.id = "elielFechamentoControle";
        painel.className = "eliel-painel eliel-fechamento-controle";
        painel.innerHTML = `
            <div class="eliel-fechamento-cabecalho">
                <div>
                    <p class="eliel-kicker">CONTROLE DO FECHAMENTO MENSAL</p>
                    <h3>Fechamento do mês</h3>
                    <p>O CEO Eliel acompanha o estado do período, confere pendências e conclui o fechamento por aqui.</p>
                </div>
                <strong id="elielFechamentoBadge" class="eliel-fechamento-badge">CONSULTANDO</strong>
            </div>
            <div class="eliel-fechamento-grid">
                <div><span>Período</span><strong id="elielFechamentoPeriodo">-</strong></div>
                <div><span>Status</span><strong id="elielFechamentoStatus">Consultando...</strong></div>
                <div><span>Pedidos pendentes</span><strong id="elielFechamentoPendentes">-</strong></div>
                <div><span>Operação</span><strong id="elielFechamentoOperacao">-</strong></div>
            </div>
            <p id="elielFechamentoMensagem" class="eliel-fechamento-mensagem">A conclusão sempre exige prévia e confirmação final.</p>
            <div id="elielFechamentoAcoesCeo" class="eliel-fechamento-acoes">
                <button type="button" id="btnAtualizarFechamentoEliel" class="secundario">Atualizar status</button>
                <button type="button" id="btnFecharMesElielPrincipal" class="perigo">Revisar e fechar mês</button>
            </div>
            <div id="elielFechamentoAcessoAdmin" class="eliel-fechamento-admin">
                <div>
                    <strong>Fechamento protegido</strong>
                    <span>O administrador pode consultar este relatório, mas somente o perfil CEO Eliel pode concluir o mês.</span>
                </div>
                <button type="button" id="btnEntrarCeoEliel">Entrar como CEO Eliel</button>
            </div>`;

        conteudo.insertBefore(painel, conteudo.firstChild);

        document.getElementById("btnAtualizarFechamentoEliel").addEventListener("click", atualizarControleFechamentoEliel);
        document.getElementById("btnFecharMesElielPrincipal").addEventListener("click", abrirFechamentoMesElielSeguro);
        document.getElementById("btnEntrarCeoEliel").addEventListener("click", function () {
            window.location.assign("./index.html?acesso=eliel");
        });

        aplicarPerfilVisual();
        observarPeriodo();
        return true;
    }

    function aplicarPerfilVisual() {
        const ceo = ehAcessoEliel();
        const acoes = document.getElementById("elielFechamentoAcoesCeo");
        const admin = document.getElementById("elielFechamentoAcessoAdmin");
        if (acoes) acoes.hidden = !ceo;
        if (admin) admin.hidden = ceo;
    }

    function definirBadge(texto, classe) {
        const badge = document.getElementById("elielFechamentoBadge");
        if (!badge) return;
        badge.textContent = texto;
        badge.className = "eliel-fechamento-badge" + (classe ? " " + classe : "");
    }

    function marcarSincronizacao(chave, mensagem) {
        ultimoEstado = null;
        sequenciaConsulta++;
        definirBadge("SINCRONIZANDO", "");
        const periodo = document.getElementById("elielFechamentoPeriodo");
        const status = document.getElementById("elielFechamentoStatus");
        const pendentes = document.getElementById("elielFechamentoPendentes");
        const operacao = document.getElementById("elielFechamentoOperacao");
        const aviso = document.getElementById("elielFechamentoMensagem");
        const botao = document.getElementById("btnFecharMesElielPrincipal");
        if (periodo) periodo.textContent = chave || "-";
        if (status) status.textContent = "Atualizando relatório...";
        if (pendentes) pendentes.textContent = "-";
        if (operacao) operacao.textContent = "-";
        if (aviso) aviso.textContent = mensagem || "Aguarde o relatório do período selecionado terminar de carregar antes de fechar o mês.";
        if (botao) {
            botao.disabled = true;
            botao.textContent = "Aguardando relatório";
        }
    }

    function renderizarEstado(status, chaveEsperada) {
        const recebido = status || {};
        const chaveEstado = String(recebido.chave || chaveEsperada || "");
        if (!chaveEsperada || chaveEstado !== chaveEsperada || chaveSelecionada() !== chaveEsperada || periodoRelatorioCarregado !== chaveEsperada) {
            return false;
        }

        ultimoEstado = Object.assign({}, recebido, { chave: chaveEstado });
        const pendentes = Number(ultimoEstado.pedidosPendentes || 0);
        const duplicado = ultimoEstado.duplicado === true;
        const recuperavel = ultimoEstado.recuperavel === true;
        const botao = document.getElementById("btnFecharMesElielPrincipal");
        const mensagem = document.getElementById("elielFechamentoMensagem");

        document.getElementById("elielFechamentoPeriodo").textContent = ultimoEstado.chave || "-";
        document.getElementById("elielFechamentoPendentes").textContent = String(pendentes);
        document.getElementById("elielFechamentoOperacao").textContent =
            ultimoEstado.statusOperacao || (duplicado ? "CONCLUÍDO" : "NÃO INICIADA");

        if (duplicado) {
            definirBadge("FECHADO", "fechado");
            document.getElementById("elielFechamentoStatus").textContent = "Mês já fechado";
            mensagem.textContent = "Este período já foi concluído e não pode ser fechado novamente.";
        } else if (recuperavel) {
            definirBadge("RECUPERAÇÃO", "recuperavel");
            document.getElementById("elielFechamentoStatus").textContent = "Recuperação segura disponível";
            mensagem.textContent = "Existe uma operação incompleta. Revise a prévia e continue o fechamento com segurança.";
        } else if (pendentes > 0) {
            definirBadge("BLOQUEADO", "bloqueado");
            document.getElementById("elielFechamentoStatus").textContent = "Aguardando pedidos";
            mensagem.textContent = "Finalize os pedidos pendentes deste mês antes de concluir o fechamento.";
        } else {
            definirBadge("PRONTO", "pronto");
            document.getElementById("elielFechamentoStatus").textContent = "Pronto para conferência";
            mensagem.textContent = "Nenhuma pendência bloqueia o período. A próxima etapa é revisar a prévia do fechamento.";
        }

        if (botao) {
            const periodoSincronizado = periodoRelatorioCarregado === chaveEsperada && chaveSelecionada() === chaveEsperada;
            botao.disabled = duplicado || pendentes > 0 || !periodoSincronizado;
            botao.textContent = duplicado
                ? "Mês já fechado"
                : recuperavel ? "Revisar e recuperar fechamento" : "Revisar e fechar mês";
        }
        return true;
    }

    function atualizarControleFechamentoEliel() {
        const campoMes = document.getElementById("elielMes");
        const campoAno = document.getElementById("elielAno");
        const mes = Number(campoMes && campoMes.value);
        const ano = Number(campoAno && campoAno.value);
        const chave = chaveSelecionada();
        if (!mes || !ano || !chave || !window.google || !google.script || !google.script.run) return;

        if (periodoRelatorioCarregado !== chave) {
            marcarSincronizacao(chave);
            return;
        }

        const idConsulta = ++sequenciaConsulta;
        definirBadge("CONSULTANDO", "");
        document.getElementById("elielFechamentoPeriodo").textContent = chave;
        document.getElementById("elielFechamentoStatus").textContent = "Consultando estado...";

        google.script.run
            .withSuccessHandler(function (resposta) {
                if (idConsulta !== sequenciaConsulta || chaveSelecionada() !== chave || periodoRelatorioCarregado !== chave) return;
                try {
                    renderizarEstado(JSON.parse(resposta || "{}"), chave);
                } catch (erro) {
                    if (idConsulta !== sequenciaConsulta) return;
                    definirBadge("ERRO", "bloqueado");
                    document.getElementById("elielFechamentoStatus").textContent = "Resposta inválida";
                    document.getElementById("elielFechamentoMensagem").innerHTML = escapar(erro.message);
                }
            })
            .withFailureHandler(function (erro) {
                if (idConsulta !== sequenciaConsulta || chaveSelecionada() !== chave || periodoRelatorioCarregado !== chave) return;
                definirBadge("ERRO", "bloqueado");
                document.getElementById("elielFechamentoStatus").textContent = "Falha na consulta";
                document.getElementById("elielFechamentoMensagem").textContent =
                    erro && erro.message ? erro.message : "Não foi possível consultar o fechamento mensal.";
            })
            .obterPreviaFechamentoRelatorioEliel(
                mes,
                ano,
                JSON.stringify(catalogoCompletoControle())
            );
    }

    function abrirFechamentoMesElielSeguro() {
        if (!ehAcessoEliel()) {
            window.location.assign("./index.html?acesso=eliel");
            return;
        }

        const chave = chaveSelecionada();
        const estadoSincronizado = ultimoEstado && String(ultimoEstado.chave || "") === chave;
        if (!chave || periodoRelatorioCarregado !== chave || !estadoSincronizado) {
            periodoRelatorioPendente = chave;
            marcarSincronizacao(chave, "O período selecionado ainda não está sincronizado com o relatório. O sistema vai recarregar os dados antes de liberar o fechamento.");
            if (typeof window.carregarRelatorioEliel === "function") window.carregarRelatorioEliel();
            return;
        }

        if (ultimoEstado.duplicado || Number(ultimoEstado.pedidosPendentes || 0) > 0) return;
        if (typeof window.abrirFechamentoMesEliel === "function") {
            window.abrirFechamentoMesEliel();
        }
    }

    function instalarSincronizacaoRelatorio() {
        if (typeof window.carregarRelatorioEliel !== "function") return false;
        if (window.carregarRelatorioEliel.__fechamentoSincronizado) return true;

        carregarRelatorioOriginal = window.carregarRelatorioEliel;
        const carregarRelatorioSincronizado = function () {
            const chave = chaveSelecionada();
            if (!chave) return carregarRelatorioOriginal.apply(this, arguments);

            if (carregamentoRelatorioEmCurso) {
                periodoRelatorioPendente = chave;
                marcarSincronizacao(chave, "Há uma atualização em andamento. O período mais recente será carregado em seguida.");
                return;
            }

            carregamentoRelatorioEmCurso = { chave: chave };
            periodoRelatorioPendente = null;
            periodoRelatorioCarregado = null;
            marcarSincronizacao(chave);
            return carregarRelatorioOriginal.apply(this, arguments);
        };
        carregarRelatorioSincronizado.__fechamentoSincronizado = true;
        window.carregarRelatorioEliel = carregarRelatorioSincronizado;
        return true;
    }

    function concluirCarregamentoRelatorio() {
        const chaveAtual = chaveSelecionada();
        if (carregamentoRelatorioEmCurso) {
            const chaveConcluida = carregamentoRelatorioEmCurso.chave;
            carregamentoRelatorioEmCurso = null;
            const proxima = periodoRelatorioPendente;
            periodoRelatorioPendente = null;

            if ((proxima && proxima !== chaveConcluida) || chaveAtual !== chaveConcluida) {
                const chaveDesejada = proxima || chaveAtual;
                marcarSincronizacao(chaveDesejada, "O período mudou durante a atualização. Carregando agora a seleção mais recente.");
                window.setTimeout(function () {
                    if (typeof window.carregarRelatorioEliel === "function") window.carregarRelatorioEliel();
                }, 0);
                return;
            }

            periodoRelatorioCarregado = chaveConcluida;
            atualizarControleFechamentoEliel();
            return;
        }

        if (!periodoRelatorioCarregado && chaveAtual) periodoRelatorioCarregado = chaveAtual;
        atualizarControleFechamentoEliel();
    }

    function observarPeriodo() {
        ["elielMes", "elielAno"].forEach(function (id) {
            const campo = document.getElementById(id);
            if (!campo || campo.dataset.fechamentoListener === "1") return;
            campo.dataset.fechamentoListener = "1";
            campo.addEventListener("change", function () {
                const chave = chaveSelecionada();
                periodoRelatorioPendente = chave;
                marcarSincronizacao(chave, "Atualizando o Relatório Eliel para o período selecionado antes de liberar o fechamento.");
                window.setTimeout(function () {
                    if (typeof window.carregarRelatorioEliel === "function") window.carregarRelatorioEliel();
                }, 50);
            });
        });
    }

    function iniciar() {
        instalarSincronizacaoRelatorio();
        if (!criarPainel()) return;
        const conteudo = document.getElementById("elielConteudo");
        if (conteudo && !observadorConteudo) {
            observadorConteudo = new MutationObserver(function () {
                aplicarPerfilVisual();
                if (!conteudo.hidden) window.setTimeout(concluirCarregamentoRelatorio, 80);
            });
            observadorConteudo.observe(conteudo, { attributes: true, attributeFilter: ["hidden"] });
        }
        if (conteudo && !conteudo.hidden) concluirCarregamentoRelatorio();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }

    window.atualizarControleFechamentoEliel = atualizarControleFechamentoEliel;
})();
