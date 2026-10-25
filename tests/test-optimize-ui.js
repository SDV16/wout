const { JSDOM } = require("jsdom");
const path = require("path");
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log("  ❌ " + m); } else console.log("  ✅ " + m); }
const POS = ["lb","sp","rb","cm1","cm2","cm3","la","cv1","cv2","ra"];
const L = (namen) => { const l = {}; POS.forEach((p, i) => (l[p] = namen[i])); return l; };
const NAMEN = ["Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens","Roef"];

async function boot(preset) {
  const store = {};
  const dom = await JSDOM.fromFile(path.join(__dirname, "..", "index.html"), {
    url: "file://" + path.join(__dirname, "..", "index.html"),
    runScripts: "dangerously", resources: "usable",
    beforeParse(w) {
      Object.defineProperty(w, "localStorage", { value: {
        getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
      }, writable: true, configurable: true });
      delete w.navigator.serviceWorker; w.confirm = () => true; w.print = () => {};
      // Opslagsleutel van de app opzoeken zodat we een voorbereide staat kunnen laden
      w.__preset = preset; w.__store = store;
    },
  });
  const w = dom.window, errors = [];
  w.addEventListener("error", (e) => { const m = String((e.error && e.error.message) || e.message || ""); if (!m.includes("reading 'register'")) errors.push(m); });
  await new Promise((r) => { const c = () => (typeof w.ManualLineup !== "undefined" && w.document.getElementById("tab-btn-manual")) ? r() : setTimeout(c, 20); c(); });
  await new Promise((r) => setTimeout(r, 120));
  return { w, d: w.document, errors, store };
}

async function main() {
  // Eerst een lege boot om de opslagsleutel te vinden
  const probe = await boot(null);
  probe.d.getElementById("tab-btn-manual").dispatchEvent(new probe.w.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  const key = Object.keys(probe.store)[0];
  if (!key) { console.log("❌ geen opslagsleutel gevonden"); process.exit(1); }

  const blocks = [
    { minutes: 22.5, lineup: L(["Collin","Jaimy","Wout","Sjoerd","Pelle","Jorra","Dinand","Stijn","Xander","Nord"]) },
    { minutes: 22.5, lineup: L(["Collin","Jaimy","Wout","Tycho","Pelle","Jorra","Sietse","Jens","Xander","Nord"]) },
    { minutes: 22.5, lineup: L(["Collin","Jaimy","Wout","Tycho","Sjoerd","Jorra","Sietse","Jens","Roef","Nord"]) },
    { minutes: 22.5, lineup: L(["Collin","Jaimy","Wout","Pelle","Sjoerd","Jorra","Dinand","Stijn","Roef","Nord"]) },
  ];
  const players = {};
  for (const n of NAMEN) players[n] = { selected: true, training: 2, priority: false, firstHalf: false, secondHalf: false, maxMinutes: 90 };
  const preset = { bonus0: 20, bonus1: 10, players, lastResult: null,
    manual: { blocks, currentBlock: 3, momentOverrides: {}, finished: true } };

  // Voorbereide staat laden: zelfde dom opnieuw opzetten met gevulde opslag
  const store = { [key]: JSON.stringify(preset) };
  const dom = await JSDOM.fromFile(path.join(__dirname, "..", "index.html"), {
    url: "file://" + path.join(__dirname, "..", "index.html"),
    runScripts: "dangerously", resources: "usable",
    beforeParse(w) {
      Object.defineProperty(w, "localStorage", { value: {
        getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
      }, writable: true, configurable: true });
      delete w.navigator.serviceWorker; w.confirm = () => true; w.print = () => {};
    },
  });
  const w = dom.window, d = w.document, errors = [];
  w.addEventListener("error", (e) => { const m = String((e.error && e.error.message) || e.message || ""); if (!m.includes("reading 'register'")) errors.push(m); });
  await new Promise((r) => { const c = () => (typeof w.ManualLineup !== "undefined" && d.getElementById("tab-btn-manual")) ? r() : setTimeout(c, 20); c(); });
  await new Promise((r) => setTimeout(r, 120));
  d.getElementById("tab-btn-manual").dispatchEvent(new w.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));

  const som = () => [...d.querySelectorAll(".data-table tbody tr")].reduce((s, tr) => { const td = tr.querySelectorAll("td")[3]; return s + (td.dataset.min !== undefined ? Number(td.dataset.min) : Number(td.textContent.replace("'", "").replace(",", "."))); }, 0);
  const momenten = () => [...d.querySelectorAll(".wissel-moment__min")].map((x) => x.textContent.trim());
  const GRENS = ["Minuut 22,5", "Minuut 45", "Minuut 67,5"];

  console.log("=== TEST: standaard staat alles op de blokgrens ===");
  check(!!d.getElementById("mk-optimize"), "knop 'Verdeel wisselmomenten eerlijk' staat op het Rond af-scherm");
  const voor = momenten();
  check(voor.length > 0 && voor.every((m) => GRENS.includes(m)), `zonder knop wisselt iedereen op de blokgrens (${[...new Set(voor)].join(", ")})`);
  check(Math.abs(som() - 900) < 1, "minutenoverzicht telt op tot 900");
  const aantalVoor = d.querySelectorAll(".wissel-row").length;

  console.log("\n=== TEST: knop verdeelt de wisselmomenten ===");
  d.getElementById("mk-optimize").dispatchEvent(new w.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  const na = momenten();
  check(!!d.querySelector(".banner--info"), "er verschijnt een melding over wat er gebeurd is");
  check(na.some((m) => !GRENS.includes(m)), `wissels staan niet meer allemaal op de blokgrens (${[...new Set(na)].join(", ")})`);
  check(na.every((m) => { const v = Number(m.replace("Minuut", "").replace(",", ".")); return v % 5 === 0 && (v === 45 || Math.abs(v - 45) >= 10); }), `de computer wisselt alleen op hele 5 minuten en niet vlak bij de rust (${[...new Set(na)].join(", ")})`);
  check(!na.some((m) => /,5$/.test(m)), "geen enkele wissel op een half moment (2,5)");
  check(Math.abs(som() - 900) < 1, "minutenoverzicht blijft optellen tot 900");
  check(d.querySelectorAll(".wissel-row").length === aantalVoor, "aantal wissels is exact gelijk gebleven (geen nieuwe wissels)");

  const perMoment = {};
  d.querySelectorAll(".wissel-moment").forEach((blok) => {
    const m = blok.querySelector(".wissel-moment__min").textContent.trim();
    perMoment[m] = (perMoment[m] || 0) + blok.querySelectorAll(".wissel-row").length;
  });
  const fout = Object.entries(perMoment).filter(([m, c]) => m !== "Minuut 45" && c > 2);
  check(fout.length === 0, `nooit meer dan 2 wissels per moment buiten de rust ${fout.length ? JSON.stringify(fout) : ""}`);

  console.log("\n=== TEST: daarna handmatig bijstellen ===");
  d.querySelector('[data-mk-dir="1"]').dispatchEvent(new w.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 40));
  check(Math.abs(som() - 900) < 1, "na handmatig verschuiven telt het nog steeds op tot 900");

  console.log("\n=== TEST: terugzetten naar blokgrenzen ===");
  d.getElementById("mk-resetmoments").dispatchEvent(new w.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 40));
  check(momenten().every((m) => GRENS.includes(m)), "alles staat weer op de blokgrenzen");

  check(errors.length === 0, `geen JS-fouten (${errors.length})`);
  console.log("\n===================================");
  console.log(fails === 0 ? "✅ Auto-verdeling in de UI werkt." : `❌ ${fails} gefaald.`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
