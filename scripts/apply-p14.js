const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content, 'utf8');

function functionRange(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`P14 não encontrou função: ${name}`);
  const braceStart = source.indexOf('{', start);
  if (braceStart === -1) throw new Error(`P14 não encontrou abertura de: ${name}`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        let end = i + 1;
        while (end < source.length && (source[end] === '\n' || source[end] === '\r')) end++;
        return { start, end };
      }
    }
  }
  throw new Error(`P14 não encontrou fechamento de: ${name}`);
}

function removeFunction(source, name) {
  const range = functionRange(source, name);
  return source.slice(0, range.start) + source.slice(range.end);
}

let code = read('apps-script/Code.gs');
code = removeFunction(code, 'include');
code = removeFunction(code, 'salvarMultiplosFechamentos');
write('apps-script/Code.gs', code);

let api = read('apps-script/Api.gs');
const line = '    "salvarMultiplosFechamentos",\n';
if (!api.includes(line)) throw new Error('P14 não encontrou salvarMultiplosFechamentos na allowlist da API.');
api = api.replace(line, '');
write('apps-script/Api.gs', api);

console.log('P14 aplicado: include() e salvarMultiplosFechamentos removidos; fallback diário único preservado.');
