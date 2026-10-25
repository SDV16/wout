// Haalt de échte afdrukpagina uit de app voor meerdere scenario's (Opstelling en Eigen,
// 2 tot 9 blokken), als losse HTML-bestanden. Gebruikt door check-print-pdf.py.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const os = require("os");
const path = require("path");
const UIT = process.env.PRINTCHECK_DIR || path.join(os.tmpdir(), "printcheck");
fs.mkdirSync(UIT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE = path.join(__dirname, "..", "index.html");
const POS = ["lb","sp","rb","cm1","cm2","cm3","la","cv1","cv2","ra"];
const L = (n) => { const l = {}; POS.forEach((p, i) => (l[p] = n[i])); return l; };

async function boot(store) {
  const dom = await JSDOM.fromFile(FILE, { url: "file://" + FILE, runScripts: "dangerously", resources: "usable",
    beforeParse(w) {
      Object.defineProperty(w, "localStorage", { value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, writable: true, configurable: true });
      delete w.navigator.serviceWorker; w.confirm = () => true; w.print = () => { w.__printed = true; };
    } });
  const w = dom.window, d = w.document;
  await new Promise((r) => { const c = () => (typeof w.PrintSheet !== "undefined" && d.getElementById("btn-generate")) ? r() : setTimeout(c, 20); c(); });
  await wait(150);
  return { w, d };
}
const klik = async (w, el) => { el.dispatchEvent(new w.Event("click", { bubbles: true })); await wait(30); };
function kies(w, d, namen) { const s = new Set(namen); d.querySelectorAll(".player-chip").forEach((c) => { if (s.has(c.querySelector(".player-chip__name").textContent)) { const i = c.querySelector("input"); i.checked = true; i.dispatchEvent(new w.Event("change", { bubbles: true })); } }); }

const ALLE = ["Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens","Roef","Chris","Jamie","Luciano","Julius","Tobias","Nicky"];

async function opstelling(naam, spelers) {
  const store = {};
  const { w, d } = await boot(store);
  kies(w, d, spelers); await wait(40);
  await klik(w, d.getElementById("btn-generate")); await wait(600);
  await klik(w, d.getElementById("au-finish"));
  await klik(w, d.getElementById("au-print"));
  const sheet = d.getElementById("print-sheet");
  fs.writeFileSync(path.join(UIT, `${naam}.html`), sheet.outerHTML);
  const blokken = sheet.querySelectorAll(".ps-card").length;
  console.log(`${naam}: ${blokken} blokken, print-aanroep: ${!!w.__printed}`);
}

async function eigen(naam, aantalBlokken, spelers) {
  // Eigen-opstelling met veel korte blokken en elk blok 2-3 wissels
  const bank = spelers.slice(10);
  const veld = spelers.slice(0, 10);
  const blocks = [];
  let huidig = veld.slice();
  let b = 0;
  for (let i = 0; i < aantalBlokken; i++) {
    if (i > 0) {
      // wissel 3 spelers met de bank, roterend
      for (let k = 0; k < 3; k++) {
        const spot = (i * 3 + k) % 10;
        const inn = bank[(i * 3 + k) % bank.length];
        const uit = huidig[spot];
        if (!huidig.includes(inn)) { huidig[spot] = inn; const bi = bank.indexOf(inn); bank[bi] = uit; }
      }
    }
    blocks.push({ minutes: 90 / aantalBlokken, lineup: L(huidig.slice()) });
  }
  const players = {};
  spelers.forEach((n) => (players[n] = { selected: true, training: 2, priority: false, firstHalf: false, secondHalf: false, maxMinutes: 90 }));
  const store = {};
  // opslagsleutel van de app opzoeken
  const st = {}; const p2 = await boot(st); p2.d.getElementById("tab-btn-manual").dispatchEvent(new p2.w.Event("click", { bubbles: true })); await wait(30);
  const key = Object.keys(st)[0];
  store[key] = JSON.stringify({ bonus0: 20, bonus1: 10, players, lastResult: null, manual: { blocks, currentBlock: 0, momentOverrides: {}, finished: true } });
  const { w, d } = await boot(store);
  await klik(w, d.getElementById("tab-btn-manual"));
  await klik(w, d.getElementById("mk-optimize"));
  await klik(w, d.getElementById("mk-print"));
  const sheet = d.getElementById("print-sheet");
  fs.writeFileSync(path.join(UIT, `${naam}.html`), sheet.outerHTML);
  console.log(`${naam}: ${sheet.querySelectorAll(".ps-card").length} blokken`);
}

(async () => {
  await opstelling("opst_14", ALLE.slice(0, 14));
  await opstelling("opst_20", ALLE);
  await opstelling("opst_11", ALLE.slice(0, 11));
  for (const n of [2, 3, 4, 6, 8, 9]) await eigen(`eigen_${n}`, n, ALLE.slice(0, 15));
})().catch((e) => { console.error(e); process.exit(1); });
