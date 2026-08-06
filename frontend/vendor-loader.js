(function () {
  "use strict";

  var vendors = {
    html2canvas: {
      url: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
      integrity: "sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H",
      ready: function () { return typeof window.html2canvas === "function"; }
    },
    jspdf: {
      url: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
      integrity: "sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk",
      ready: function () { return Boolean(window.jspdf && window.jspdf.jsPDF); }
    },
    xlsx: {
      url: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
      integrity: "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw",
      ready: function () { return Boolean(window.XLSX); }
    }
  };
  var pending = {};

  function load(name) {
    var vendor = vendors[name];
    if (!vendor) return Promise.reject(new Error("Biblioteca desconhecida: " + name));
    if (vendor.ready()) return Promise.resolve();
    if (pending[name]) return pending[name];

    pending[name] = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = vendor.url;
      script.integrity = vendor.integrity;
      script.crossOrigin = "anonymous";
      script.async = true;
      script.onload = function () {
        if (vendor.ready()) resolve();
        else reject(new Error("A biblioteca " + name + " não iniciou corretamente."));
      };
      script.onerror = function () {
        reject(new Error("Não foi possível carregar o recurso " + name + "."));
      };
      document.head.appendChild(script);
    }).catch(function (error) {
      delete pending[name];
      throw error;
    });

    return pending[name];
  }

  window.TapimovelVendors = { load: load };
})();
