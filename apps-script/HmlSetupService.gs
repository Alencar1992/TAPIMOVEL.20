// =========================================================
// HML PR105 — configuração segura de PIN via menu da planilha
// Sem efeito em produção: protegido por validação explícita do Script ID HML.
// Este arquivo é inerte fora do Script ID HML.
// =========================================================

const HML_PR105_SCRIPT_ID_ = "1k6FnACYqdaW2M8o_UxIjezDF9-KohZWRhtc61swI7sjkRNgTQl3BeOzj";

function ambienteHmlPr105_() {
  return ScriptApp.getScriptId() === HML_PR105_SCRIPT_ID_;
}

function onOpen() {
  if (!ambienteHmlPr105_()) return;

  SpreadsheetApp.getUi()
    .createMenu("🧪 HML PR105")
    .addItem("Configurar PIN Admin", "configurarPinAdminViaMenuHml")
    .addToUi();
}

function configurarPinAdminViaMenuHml() {
  if (!ambienteHmlPr105_()) {
    throw new Error("Esta rotina só pode ser executada no ambiente HML PR105.");
  }

  const ui = SpreadsheetApp.getUi();
  const resposta = ui.prompt(
    "Configurar PIN Admin — HML",
    "Digite um PIN de teste com 6 a 12 números. O valor não será salvo em texto puro.",
    ui.ButtonSet.OK_CANCEL
  );

  if (resposta.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const pin = String(resposta.getResponseText() || "").trim();
  if (!/^\d{6,12}$/.test(pin)) {
    ui.alert("PIN inválido", "Use apenas números, entre 6 e 12 dígitos.", ui.ButtonSet.OK);
    return;
  }

  configurarPinAdministrador(pin);
  ui.alert(
    "PIN HML configurado",
    "O PIN administrativo de homologação foi configurado com segurança.",
    ui.ButtonSet.OK
  );
}
