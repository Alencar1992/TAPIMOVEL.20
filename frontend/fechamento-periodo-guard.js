(function () {
    "use strict";

    const FUSO_OPERACIONAL = "America/Sao_Paulo";
    let observador = null;
    let aplicacaoAgendada = false;

    function chaveAtualOperacional() {
        const partes = new Intl.DateTimeFormat("en-US", {
            timeZone: FUSO_OPERACIONAL,
            year: "numeric",
            month: "2-digit"
        }).formatToParts(new Date());
        const mapa = {};
        partes.forEach(function (parte) {
            if (parte.type !== "literal") mapa[parte.type] = parte.value;
        });
        return String(mapa.year || "") + "-" + String(mapa.month || "");
    }

    function chaveSelecionada() {
        const campoMes = document.getElementById("elielMes");
        const campoAno = document.getElementById("elielAno");
        const mes = Number(campoMes && campoMes.value);
        const ano = Number(campoAno && campoAno.value);
        if (!mes || !ano) return "";
        return String(ano) + "-" + String(mes).padStart(2, "0");
    }

    function dataLiberacao(chave) {
        const partes = String(chave || "").split("-");
        let ano = Number(partes[0]);
        let mes = Number(partes[1]) + 1;
        if (!ano || !mes) return "o primeiro dia do mês seguinte";
        if (mes > 12) {
            mes = 1;
            ano += 1;
        }
        return "01/" + String(mes).padStart(2, "0") + "/" + String(ano);
    }

    function periodoEncerrado(chave) {
        const atual = chaveAtualOperacional();
        return Boolean(chave && atual && chave < atual);
    }

    function aplicarBloqueioTemporal() {
        aplicacaoAgendada = false;
        const chave = chaveSelecionada();
        const botao = document.getElementById("btnFecharMesElielPrincipal");
        if (!chave || !botao || periodoEncerrado(chave)) return;

        botao.disabled = true;
        botao.dataset.bloqueioTemporal = "1";
        botao.textContent = "Disponível após o fim do mês";

        const status = document.getElementById("elielFechamentoStatus");
        const mensagem = document.getElementById("elielFechamentoMensagem");
        const badge = document.getElementById("elielFechamentoBadge");
        if (status) status.textContent = "Mês ainda em andamento";
        if (mensagem) {
            mensagem.textContent = "O período " + chave + " só poderá ser fechado a partir de " +
                dataLiberacao(chave) + ". Continue usando o PDV normalmente até o fim do mês.";
        }
        if (badge) {
            badge.textContent = "AGUARDANDO FIM DO MÊS";
            badge.className = "eliel-fechamento-badge bloqueado";
        }
    }

    function agendarAplicacao() {
        if (aplicacaoAgendada) return;
        aplicacaoAgendada = true;
        window.setTimeout(aplicarBloqueioTemporal, 0);
    }

    function instalar() {
        document.addEventListener("click", function (evento) {
            const alvo = evento.target && evento.target.closest
                ? evento.target.closest("#btnFecharMesElielPrincipal")
                : null;
            if (!alvo) return;
            const chave = chaveSelecionada();
            if (periodoEncerrado(chave)) return;
            evento.preventDefault();
            evento.stopImmediatePropagation();
            aplicarBloqueioTemporal();
        }, true);

        ["elielMes", "elielAno"].forEach(function (id) {
            const campo = document.getElementById(id);
            if (campo) campo.addEventListener("change", agendarAplicacao);
        });

        if (!observador && document.body) {
            observador = new MutationObserver(agendarAplicacao);
            observador.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["disabled", "hidden"]
            });
        }
        agendarAplicacao();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", instalar, { once: true });
    } else {
        instalar();
    }
})();