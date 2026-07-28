(function () {
  "use strict";

  var TOKEN_KEY = "tapimovel_admin_token";
  var TOKEN_EXPIRY_KEY = "tapimovel_admin_token_expiry";

  function getToken() {
    var expiry = Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY) || 0);
    if (expiry && Date.now() >= expiry) {
      clearToken();
      return "";
    }
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function saveToken(session) {
    if (!session || !session.token) return;
    sessionStorage.setItem(TOKEN_KEY, String(session.token));
    sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(Number(session.expiraEm) || 0));
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
  }

  function emitAuthRequired(message) {
    clearToken();
    window.dispatchEvent(new CustomEvent("tapimovel:auth-required", {
      detail: { message: message || "Sua sessão expirou. Entre novamente." }
    }));
  }

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
            body: JSON.stringify({ action: prop, args: args, token: getToken() })
          })
            .then(function (response) {
              if (!response.ok) {
                throw new Error("Falha HTTP " + response.status);
              }
              return response.json();
            })
            .then(function (payload) {
              if (!payload || payload.ok !== true) {
                var apiError = new Error(
                  (payload && payload.error) || "Resposta inválida da API."
                );
                apiError.code = payload && payload.code;
                throw apiError;
              }
              if (prop === "loginAdministrador") saveToken(payload.data);
              if (prop === "encerrarSessaoAdministrador") clearToken();
              if (typeof successHandler === "function") successHandler(payload.data);
              return payload.data;
            })
            .catch(function (error) {
              if (error && error.code === "AUTH_REQUIRED") {
                emitAuthRequired(error.message);
              }
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
  window.TapimovelAuth = {
    clear: clearToken,
    hasToken: function () { return Boolean(getToken()); }
  };
})();
