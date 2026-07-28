(function () {
  "use strict";

  var accessMode = new URLSearchParams(window.location.search).get("acesso") === "eliel"
    ? "eliel"
    : "admin";
  var STORAGE_PREFIX = "tapimovel_" + accessMode + "_";
  var TOKEN_KEY = STORAGE_PREFIX + "token";
  var TOKEN_DAY_KEY = STORAGE_PREFIX + "token_day";
  var TOKEN_LAST_ACTIVITY_KEY = STORAGE_PREFIX + "last_activity";
  var TOKEN_PROFILE_KEY = STORAGE_PREFIX + "profile";
  var TOKEN_NAME_KEY = STORAGE_PREFIX + "name";
  var DEFAULT_INACTIVITY_MS = 4 * 60 * 60 * 1000;
  var inactivityMs = DEFAULT_INACTIVITY_MS;

  function getLocalDay() {
    var now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
  }

  function getToken() {
    var token = localStorage.getItem(TOKEN_KEY) || "";
    var sessionDay = localStorage.getItem(TOKEN_DAY_KEY) || "";
    var lastActivity = Number(localStorage.getItem(TOKEN_LAST_ACTIVITY_KEY) || 0);
    var inactive = !lastActivity || Date.now() - lastActivity >= inactivityMs;
    if (!token || sessionDay !== getLocalDay() || inactive) {
      clearToken();
      return "";
    }
    return token;
  }

  function saveToken(session) {
    if (!session || !session.token) return;
    var sessionMode = session.perfil === "eliel" ? "eliel" : accessMode;
    var sessionPrefix = "tapimovel_" + sessionMode + "_";
    inactivityMs = Math.max(
      60 * 1000,
      Number(session.inatividadeSegundos || 0) * 1000 || DEFAULT_INACTIVITY_MS
    );
    localStorage.setItem(sessionPrefix + "token", String(session.token));
    localStorage.setItem(sessionPrefix + "token_day", String(session.diaSessao || getLocalDay()));
    localStorage.setItem(sessionPrefix + "last_activity", String(Date.now()));
    localStorage.setItem(sessionPrefix + "profile", String(session.perfil || sessionMode));
    localStorage.setItem(sessionPrefix + "name", String(session.nome || ""));
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_DAY_KEY);
    localStorage.removeItem(TOKEN_LAST_ACTIVITY_KEY);
    localStorage.removeItem(TOKEN_PROFILE_KEY);
    localStorage.removeItem(TOKEN_NAME_KEY);
  }

  function registerActivity() {
    if (!getToken()) return;
    localStorage.setItem(TOKEN_LAST_ACTIVITY_KEY, String(Date.now()));
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
              if (prop === "loginAcesso" || prop === "loginAdministrador") saveToken(payload.data);
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
  ["pointerdown", "keydown", "touchstart"].forEach(function (eventName) {
    window.addEventListener(eventName, registerActivity, { passive: true });
  });
  window.TapimovelAuth = {
    clear: clearToken,
    hasToken: function () { return Boolean(getToken()); },
    getAccessMode: function () { return accessMode; },
    getSession: function () {
      if (!getToken()) return null;
      return {
        perfil: localStorage.getItem(TOKEN_PROFILE_KEY) || accessMode,
        nome: localStorage.getItem(TOKEN_NAME_KEY) || ""
      };
    }
  };
})();
