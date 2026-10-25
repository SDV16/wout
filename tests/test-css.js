// Bewaakt de stylesheet tegen stille fouten. Browsers herstellen kapotte CSS
// zonder te klagen (een losse '}' laat bijvoorbeeld de eerstvolgende regel
// verdwijnen), dus 'het ziet er ongeveer goed uit' is geen controle.
const fs = require("fs");
const path = require("path");
const css = fs.readFileSync(path.join(__dirname, "..", "css", "style.css"), "utf8");
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log("  ❌ " + m); } else console.log("  ✅ " + m); }

console.log("=== TEST: stylesheet is gezond ===");

// 1) Accolades in balans (commentaar en tekst tussen aanhalingstekens negeren)
const kaal = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"\n]*"|'[^'\n]*'/g, "");
const open = (kaal.match(/{/g) || []).length, dicht = (kaal.match(/}/g) || []).length;
check(open === dicht, `accolades zijn in balans (${open} open, ${dicht} dicht)`);

// 2) Nooit een '}' op het hoogste niveau zonder bijbehorende '{'
let diepte = 0, negatief = false;
for (const ch of kaal) { if (ch === "{") diepte++; else if (ch === "}") { diepte--; if (diepte < 0) negatief = true; } }
check(!negatief && diepte === 0, "geen losse sluit-accolade");

// 3) Elke regel op het hoogste niveau wordt door een CSS-lezer als geheel begrepen
let rrweb;
try { rrweb = require("rrweb-cssom"); } catch (e) { rrweb = null; }
if (rrweb) {
  let ok = true;
  try { rrweb.parse(css); } catch (e) { ok = false; }
  check(ok, "de hele stylesheet is door een CSS-lezer te parsen");
}

// 4) Afdrukregels aanwezig
check(/@page\s*{[^}]*size:\s*A4[^}]*margin:\s*0/.test(css), "@page: A4 met marge 0 (geen browser-kop/voetregel)");
check(/body\s*>\s*\*:not\(#print-sheet\)\s*{\s*display:\s*none\s*!important/.test(css), "in print wordt alles behalve de afdrukpagina verborgen");
check(/#print-sheet\s*{\s*display:\s*none;\s*}/.test(css), "op het scherm is de afdrukpagina onzichtbaar");
const h = css.match(/#print-sheet\s*{[^}]*height:\s*([\d.]+)mm/);
check(h && Number(h[1]) <= 296.5, `afdrukpagina is niet hoger dan een A4 (${h && h[1]}mm)`);

console.log("\n===================================");
console.log(fails === 0 ? "✅ Stylesheet is gezond." : `❌ ${fails} gefaald.`);
process.exit(fails === 0 ? 0 : 1);
