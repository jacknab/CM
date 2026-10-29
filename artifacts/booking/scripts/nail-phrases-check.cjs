// Lists /nail screen text that nailPhrases.ts (the Language setting's phrase list) doesn't cover yet.
// Run: node artifacts/booking/scripts/nail-phrases-check.cjs /tmp/missing.json — then add Vietnamese and Spanish to
// nailPhrases.ts and French to nailPhrasesFr.ts. Code strings and sheets that translate themselves also show up; skip those.
const fs = require("fs"), path = require("path");
const ts = require(path.resolve(__dirname, "../../../node_modules/typescript"));
const SRC = path.resolve(__dirname, "../src");
const roots = [path.join(SRC, "pages/nail"), path.join(SRC, "components/staff-screen")];
// Components /nail imports from elsewhere (@/components/...), one level.
const files = new Set();
for (const r of roots) for (const f of fs.readdirSync(r)) if (/\.tsx?$/.test(f) && !/\.test\./.test(f) && !/nailPhrases|i18n\.ts|nailDomTranslate/.test(f)) files.add(path.join(r, f));
for (const f of [...files]) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/from "@\/components\/([^"]+)"/g)) {
    for (const ext of [".tsx", ".ts", "/index.tsx"]) { const p = path.join(SRC, "components", m[1] + ext); if (fs.existsSync(p) && !/\/ui\//.test(p)) { files.add(p); break; } }
  }
}
const SKIP_ATTR = /^(className|style|key|id|type|href|to|src|role|name|value|htmlFor|data-|testId|inputMode|autoComplete|mode|variant|size|icon|kind|code|tz|lang|align|side|method|accept|pattern|enterKeyHint|target|rel|draggable|tabIndex|dir|as)/;
const looksLikeText = (s) => {
  const t = s.trim();
  if (!/[A-Za-z]{2,}/.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return false;            // identifier
  if (/^[a-z0-9_.:-]+$/.test(t) && !/ /.test(t)) return false;  // key / css token
  if (/^(\/|https?:|#|\.|@|data:|mailto:)/.test(t)) return false; // paths / urls
  if (/\b(flex|grid|px-|py-|text-|bg-|rounded|border|items-|justify-|gap-|w-|h-|mt-|mb-|font-)/.test(t) && !/[A-Z]/.test(t[0])) return false; // tailwind
  if (/^[A-Z_]+$/.test(t) && t.length < 3) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(t)) return false;
  if (/[{}();=]/.test(t) && !/ /.test(t)) return false;
  return true;
};
const out = new Map(); // text -> first file:line
const add = (text, sf, node) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || !looksLikeText(t)) return;
  if (!out.has(t)) out.set(t, `${path.relative(SRC, sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
};
const isInIgnoredCall = (node) => {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const c = p.expression.getText();
      if (/^(console\.|fetch|call|callSettled|new Error|localStorage|sessionStorage|navigate|apiRequest|setItem|getItem|queryKey|includes|startsWith|endsWith|split|replace|test|match|addEventListener|removeEventListener|dispatchEvent|querySelector|closest|setAttribute|getAttribute|format|formatInTimeZone|toLocaleString|toLocaleDateString|toLocaleTimeString|invalidateQueries|transport\.send|Intl|padStart|nailOffline|recordTurnEvent|JSON)/.test(c) || /\.(send|log|warn|error|debug|getItem|setItem|includes|startsWith|endsWith|split|replace|test|match|addEventListener|querySelector|closest|setAttribute|getAttribute|toLocaleString|toLocaleTimeString|toLocaleDateString|invalidateQueries|padStart|join|indexOf)$/.test(c)) return true;
      return false;
    }
    if (ts.isJsxAttribute(p)) return SKIP_ATTR.test(p.name.getText());
    if (ts.isPropertyAssignment(p) && /^(queryKey|className|style|key|id|type|code|kind|testId|icon|color|background|mode|method|headers|credentials|cache|mimeType|role|variant|channel|source|status|scope|path|url|href|to|unit|format|dataKey)$/.test(p.name.getText())) return true;
    if (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText())) return true;
    if (ts.isCaseClause(p) && p.expression === node) return true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
    if (ts.isTypeNode && (ts.isLiteralTypeNode(p) || ts.isTypeReferenceNode(p))) return true;
    if (ts.isStatement(p) || ts.isFunctionLike(p)) return false;
  }
  return false;
};
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isJsxText(node)) add(node.getText(), sf, node);
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isInIgnoredCall(node)) add(node.text, sf, node);
    else if (ts.isTemplateExpression(node) && !isInIgnoredCall(node)) {
      let i = 0; let pat = node.head.text; for (const sp of node.templateSpans) pat += `{${i++}}` + sp.literal.text;
      if (/[A-Za-z]{3,}/.test(pat.replace(/\{\d\}/g, ""))) add(pat, sf, node);
    }
    // JSX children mixing text and {expr}: also the joined sentence as a pattern
    if (ts.isJsxElement(node)) {
      const kids = node.children.filter((k) => !(ts.isJsxText(k) && !k.getText().trim()));
      if (kids.some((k) => ts.isJsxText(k)) && kids.some((k) => ts.isJsxExpression(k)) && kids.every((k) => ts.isJsxText(k) || ts.isJsxExpression(k))) {
        let i = 0; const pat = kids.map((k) => ts.isJsxText(k) ? k.getText() : `{${i++}}`).join("");
        if (/[A-Za-z]{3,}/.test(pat.replace(/\{\d\}/g, ""))) add(pat, sf, node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
// Compare with the dictionary.
const dictSrc = fs.readFileSync(path.join(SRC, "pages/nail/nailPhrases.ts"), "utf8");
const phrases = new Function(dictSrc.replace(/export const (\w+)\s*:[^=]+=/g, "this.$1 =").replace(/^\s*import[^\n]*\n/gm, "") + "; return this;").call({});
const known = new Set(Object.keys(phrases.NAIL_PHRASES).map((k) => k.toLowerCase()));
const pats = phrases.NAIL_PATTERNS.map(([en]) => new RegExp("^" + en.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\d)\}/g, ".+?") + "$", "i"));
const i18n = fs.readFileSync(path.join(SRC, "pages/nail/i18n.ts"), "utf8");
for (const m of i18n.matchAll(/en: "([^"]+)"/g)) known.add(m[1].toLowerCase());
const covered = (t) => {
  const l = t.toLowerCase();
  if (known.has(l) || known.has(l + ":") || (l.endsWith(":") && known.has(l.slice(0, -1).trim()))) return true;
  const plain = t.replace(/\{\d\}/g, "X");
  if (pats.some((r) => r.test(t) || r.test(plain))) return true;
  return false;
};
const missing = [...out].filter(([t]) => !covered(t));
fs.writeFileSync(process.argv[2], JSON.stringify(missing, null, 1));
console.log(`files ${files.size}, texts ${out.size}, dictionary ${Object.keys(phrases.NAIL_PHRASES).length} + ${phrases.NAIL_PATTERNS.length} patterns, missing ${missing.length}`);
