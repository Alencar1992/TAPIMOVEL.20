(function () {
    "use strict";

    let ultimoEstado = null;
    let observadorConteudo = null;

    function ehAcessoEliel() {
        return new URLSearchParams(window.location.search).get("acesso") === "eliel";
    }

    function escapar(valor) {
        return String(valor == null ? "" : valor)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
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

    function renderizarEstado(status) {
        ultimoEstado = status || {};
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
            botao.disabled = duplicado || pendentes > 0;
            botao.textContent = duplicado
                ? "Mês já fechado"
                : recuperavel ? "Revisar e recuperar fechamento" : "Revisar e fechar mês";
        }
    }

    function atualizarControleFechamentoEliel() {
        const mes = Number(document.getElementById("elielMes") && document.getElementById("elielMes").value);
        const ano = Number(document.getElementById("elielAno") && document.getElementById("elielAno").value);
        if (!mes || !ano || !window.google || !google.script || !google.script.run) return;

        definirBadge("CONSULTANDO", "");
        document.getElementById("elielFechamentoPeriodo").textContent = String(ano) + "-" + String(mes).padStart(2, "0");
        document.getElementById("elielFechamentoStatus").textContent = "Consultando estado...";

        google.script.run
            .withSuccessHandler(function (resposta) {
                try {
                    renderizarEstado(JSON.parse(resposta || "{}"));
                } catch (erro) {
                    definirBadge("ERRO", "bloqueado");
                    document.getElementById("elielFechamentoStatus").textContent = "Resposta inválida";
                    document.getElementById("elielFechamentoMensagem").innerHTML = escapar(erro.message);
                }
            })
            .withFailureHandler(function (erro) {
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
        if (ultimoEstado && (ultimoEstado.duplicado || Number(ultimoEstado.pedidosPendentes || 0) > 0)) return;
        if (typeof window.abrirFechamentoMesEliel === "function") {
            window.abrirFechamentoMesEliel();
        }
    }

    function observarPeriodo() {
        ["elielMes", "elielAno"].forEach(function (id) {
            const campo = document.getElementById(id);
            if (!campo || campo.dataset.fechamentoListener === "1") return;
            campo.dataset.fechamentoListener = "1";
            campo.addEventListener("change", function () {
                window.setTimeout(atualizarControleFechamentoEliel, 50);
            });
        });
    }

    function iniciar() {
        if (!criarPainel()) return;
        const conteudo = document.getElementById("elielConteudo");
        if (conteudo && !observadorConteudo) {
            observadorConteudo = new MutationObserver(function () {
                aplicarPerfilVisual();
                if (!conteudo.hidden) window.setTimeout(atualizarControleFechamentoEliel, 80);
            });
            observadorConteudo.observe(conteudo, { attributes: true, attributeFilter: ["hidden"] });
        }
        if (conteudo && !conteudo.hidden) atualizarControleFechamentoEliel();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }

    window.atualizarControleFechamentoEliel = atualizarControleFechamentoEliel;
})();
