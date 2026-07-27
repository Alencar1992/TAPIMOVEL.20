(function () {
  "use strict";

  function mostrarErro(titulo, detalhe) {
    var texto = document.getElementById("textoErroSistema");
    var modal = document.getElementById("modalErroSistema");
    if (!texto || !modal) return;

    texto.textContent = titulo + "\n\n" + detalhe;
    modal.style.display = "flex";
  }

  window.addEventListener("error", function (event) {
    if (!event.message || event.message === "Script error." || !event.filename) return;
    mostrarErro(
      "Erro no navegador",
      event.message + "\nLinha: " + event.lineno + ", coluna: " + event.colno
    );
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    mostrarErro(
      "Erro de comunicação",
      reason && reason.message ? reason.message : String(reason)
    );
  });
})();
