(function () {
  "use strict";

  function getApiUrl() {
    var config = window.TAPIMOVEL_CONFIG || {};
    var url = String(config.apiUrl || "").trim();
    if (!url || url.indexOf("COLE_AQUI") !== -1) {
      throw new Error("A URL da API do Apps Script ainda não foi configurada.");
    }
    return url;
  }

  function createRunner(successHandler, failureHandler) {
    var target = {
      withSuccessHandler: function (handler) {
        return createRunner(handler, failureHandler);
      },
      withFailureHandler: function (handler) {
        return createRunner(successHandler, handler);
      }
    };

    return new Proxy(target, {
      get: function (obj, prop) {
        if (prop in obj) return obj[prop];
        if (typeof prop !== "string") return undefined;

        return function () {
          var args = Array.prototype.slice.call(arguments);
          return fetch(getApiUrl(), {
            method: "POST",
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: prop, args: args })
          })
            .then(function (response) {
              if (!response.ok) {
                throw new Error("Falha HTTP " + response.status);
              }
              return response.json();
            })
            .then(function (payload) {
              if (!payload || payload.ok !== true) {
                throw new Error((payload && payload.error) || "Resposta inválida da API.");
              }
              if (typeof successHandler === "function") successHandler(payload.data);
              return payload.data;
            })
            .catch(function (error) {
              if (typeof failureHandler === "function") {
                failureHandler(error);
                return;
              }
              window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {
                promise: Promise.reject(error),
                reason: error
              }));
              throw error;
            });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner();
})();
