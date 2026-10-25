const { JSDOM } = require("jsdom");
const path = require("path");
const PrintSheet = require("../js/print-sheet.js");
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log("  ❌ " + m); } else console.log("  ✅ " + m); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("=== TEST: indeling past altijd op één A4 ===");
{
  let allesPast = true, leesbaar = true, minFont = 99;
  for (let n = 1; n <= 14; n++) {
    for (const regelsPerKaart of [0, 3, 6, 10]) {
      for (const lengte of [25, 45, 90]) {
        const kaarten = Array.from({ length: n }, (_, i) => (i === 0 ? [] : Array.from({ length: regelsPerKaart }, () => "x".repeat(lengte))));
        const l = PrintSheet.layout(kaarten);
        if (l.estimatedHeight > l.availableHeight + 1e-6) allesPast = false;
        if (n <= 9 && regelsPerKaart <= 6 && lengte <= 45 && l.scale < PrintSheet.MIN_READABLE_SCALE - 1e-9) leesbaar = false;
        if (n <= 9 && regelsPerKaart <= 6 && lengte <= 45) minFont = Math.min(minFont, l.fontPt);
      }
    }
  }
  check(allesPast, "voor 1 tot 14 blokken, 0 tot 10 wisselregels en korte tot lange regels: altijd ≤ beschikbare hoogte");
  check(leesbaar, `tot 9 blokken blijft de tekst leesbaar (kleinste lettergrootte ${minFont.toFixed(1)} pt)`);
  const twee = PrintSheet.layout([[], ["a", "b", "c"]]);
  check(twee.cols === 2, "bij 2 blokken staan ze naast elkaar (niet één kolom met minuscule tekst)");
  check(PrintSheet.layout([[]]).cols === 1, "bij 1 blok één groot veld");
  check([1, 2, 3, 5, 9, 14].every((n) => PrintSheet.layout(Array.from({ length: n }, () => [])).cols <= Math.max(n, 1)), "nooit meer kolommen dan blokken");
}

async function boot(store) {
  const file = path.join(__dirname, "..", "index.html");
  const dom = await JSDOM.fromFile(file, { url: "file://" + file, runScripts: "dangerously", resources: "usable",
    beforeParse(w) {
      Object.defineProperty(w, "localStorage", { value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, writable: true, configurable: true });
      delete w.navigator.serviceWorker; w.confirm = () => true; w.print = () => { w.__printed = (w.__printed || 0) + 1; };
      w.__errors = []; w.addEventListener("error", (e) => w.__errors.push((e.error && e.error.stack) || e.message));
    } });
  const w = dom.window, d = w.document;
  await new Promise((r) => { const c = () => (typeof w.PrintSheet !== "undefined" && d.getElementById("btn-generate")) ? r() : setTimeout(c, 20); c(); });
  await wait(150);
  return { w, d };
}
const klik = async (w, el) => { el.dispatchEvent(new w.Event("click", { bubbles: true })); await wait(30); };
const NAMEN = ["Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens","Roef"];
const VERBODEN = ["Verdeel wisselmomenten eerlijk", "Terugzetten naar blokgrenzen", "Een exact eerlijke verdeling", "Opslaan", "Terug naar bewerken", "Minutenoverzicht", "Opstelling Generator", "file:", "Standaard wisselt iedereen"];

function controleerSheet(d, w, label, ns) {
  const sheet = d.getElementById("print-sheet");
  const kaartenOpScherm = [...d.querySelectorAll(".mk-summary-block")];
  const kaarten = [...sheet.querySelectorAll(".ps-card")];
  check(!!sheet && d.querySelectorAll("#print-sheet").length === 1, `${label}: er is precies één afdrukpagina`);
  check(kaarten.length === kaartenOpScherm.length && kaarten.length >= 2, `${label}: elk blok staat erop (${kaarten.length} van ${kaartenOpScherm.length})`);
  check(kaarten.every((k, i) => k.querySelector(".ps-title strong").textContent === `Blok ${i + 1}` && /\d'\u2013\d+(,\d)?'$/.test(k.querySelector(".ps-title span").textContent)), `${label}: elke kaart toont 'Blok N' met de minuten`);
  check(kaarten.every((k) => k.querySelectorAll(".mk-slot").length === 10 && k.querySelector("svg.pitch-svg") && k.querySelectorAll(".mk-chip-bg").length === 10), `${label}: elk blok toont het voetbalveld met 10 spelersvakjes`);
  const namenPrint = kaarten.map((k) => [...k.querySelectorAll(".mk-chip-name")].map((t) => t.textContent).join(","));
  const namenScherm = kaartenOpScherm.map((k) => [...k.querySelectorAll(".mk-chip-name")].map((t) => t.textContent).join(","));
  check(JSON.stringify(namenPrint) === JSON.stringify(namenScherm), `${label}: de opstellingen zijn identiek aan het scherm`);
  const regelsPrint = kaarten.map((k) => k.querySelectorAll(".ps-line").length);
  const regelsScherm = kaartenOpScherm.map((k) => k.querySelectorAll(".wissel-row").length);
  check(JSON.stringify(regelsPrint) === JSON.stringify(regelsScherm), `${label}: elke wissel staat erop (${regelsPrint.join("/")})`);
  const tekst = sheet.textContent;
  const gevonden = VERBODEN.filter((t) => tekst.includes(t));
  check(gevonden.length === 0, `${label}: geen overbodige tekst op de afdruk${gevonden.length ? " (gevonden: " + gevonden.join(" | ") + ")" : ""}`);
  check(!sheet.querySelector("table, button, input, .banner"), `${label}: geen tabel, knoppen of meldingen`);
  check(w.getComputedStyle(sheet).display === "none", `${label}: op het scherm is de afdrukpagina onzichtbaar`);
  const ids = [...sheet.querySelectorAll("linearGradient")].map((g) => g.id);
  check(ids.length === kaarten.length && ids.every((i) => i === "mkturf-print") && d.querySelectorAll('[id="mkturf-print"]').length === kaarten.length, `${label}: het veld heeft een eigen gradiënt-id (verdwijnt niet door dubbele ids)`);
}

async function main() {
  console.log("\n=== TEST: afdrukken vanuit de Opstelling ===");
  {
    const store = {};
    const { w, d } = await boot(store);
    const set = new Set(NAMEN);
    d.querySelectorAll(".player-chip").forEach((c) => { if (set.has(c.querySelector(".player-chip__name").textContent)) { const i = c.querySelector("input"); i.checked = true; i.dispatchEvent(new w.Event("change", { bubbles: true })); } });
    await wait(40);
    await klik(w, d.getElementById("btn-generate")); await wait(600);
    await klik(w, d.getElementById("au-finish"));
    await klik(w, d.getElementById("au-print"));
    check(w.__printed === 1, "de printfunctie van de browser wordt aangeroepen");
    controleerSheet(d, w, "Opstelling", "au");
    await klik(w, d.getElementById("au-print"));
    check(d.querySelectorAll("#print-sheet").length === 1 && w.__printed === 2, "nogmaals printen geeft geen dubbele pagina");
    w.dispatchEvent(new w.Event("afterprint"));
    check(d.getElementById("print-sheet") === null, "na het printen wordt de afdrukpagina weer opgeruimd");
    check(w.__errors.length === 0, "geen JS-fouten");
  }

  console.log("\n=== TEST: afdrukken vanuit Eigen (met minuten-labels en groene vakjes, zoals op het scherm) ===");
  {
    const POS = ["lb","sp","rb","cm1","cm2","cm3","la","cv1","cv2","ra"];
    const L = (n) => { const l = {}; POS.forEach((p, i) => (l[p] = n[i])); return l; };
    const blocks = [
      { minutes: 22.5, lineup: L(["Collin","Jaimy","Wout","Sjoerd","Pelle","Jorra","Dinand","Stijn","Xander","Nord"]) },
      { minutes: 22.5, lineup: L(["Collin","Jaimy","Wout","Tycho","Pelle","Jorra","Sietse","Jens","Xander","Nord"]) },
      { minutes: 22.5, lineup: L(["Collin","Jaimy","Wout","Tycho","Sjoerd","Jorra","Sietse","Jens","Roef","Nord"]) },
      { minutes: 22.5, lineup: L(["Collin","Jaimy","Wout","Pelle","Sjoerd","Jorra","Dinand","Stijn","Roef","Nord"]) },
    ];
    const players = {}; NAMEN.forEach((n) => (players[n] = { selected: true, training: 2, priority: false, firstHalf: false, secondHalf: false, maxMinutes: 90 }));
    const probe = {}; const p = await boot(probe); await klik(p.w, p.d.getElementById("tab-btn-manual"));
    const key = Object.keys(probe)[0];
    const store = { [key]: JSON.stringify({ bonus0: 20, bonus1: 10, players, lastResult: null, manual: { blocks, currentBlock: 3, momentOverrides: {}, finished: true } }) };
    const { w, d } = await boot(store);
    await klik(w, d.getElementById("tab-btn-manual"));
    await klik(w, d.getElementById("mk-print"));
    controleerSheet(d, w, "Eigen", "mk");
    const sheet = d.getElementById("print-sheet");
    check(sheet.querySelectorAll(".mk-chip-min, .mk-check-svg").length > 0, "de minuten-labels/vinkjes in de vakjes staan er zoals op het scherm");
    check(sheet.querySelector(".ps-line .ps-min").textContent.endsWith("'"), "wisselregels beginnen met de minuut");
    check(w.__errors.length === 0, "geen JS-fouten");
  }

  console.log("\n===================================");
  console.log(fails === 0 ? "✅ De afdrukpagina is compleet, schoon en past op één blad." : `❌ ${fails} gefaald.`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
