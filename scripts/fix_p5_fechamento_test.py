from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "tests" / "fechamento-p0.test.js"
text = path.read_text(encoding="utf-8")
old = '''  vm.runInContext(\n    fs.readFileSync(path.join(__dirname, "../apps-script/Code.gs"), "utf8"),\n    context,\n    { filename: "Code.gs" }\n  );'''
new = '''  const appsScriptDir = path.join(__dirname, "../apps-script");\n  const arquivosGs = fs.readdirSync(appsScriptDir)\n    .filter(nome => nome.endsWith(".gs"))\n    .sort();\n  const code = arquivosGs\n    .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))\n    .join("\\n\\n");\n  vm.runInContext(code, context, { filename: "AppsScript.bundle.gs" });'''
if old not in text:
    raise RuntimeError("Trecho esperado não encontrado em fechamento-p0.test.js")
path.write_text(text.replace(old, new), encoding="utf-8")
print("Teste P0 adaptado ao bundle modular.")
