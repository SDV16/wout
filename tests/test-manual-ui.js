const { JSDOM } = require("jsdom");
const path = require("path");

let fails = 0;
function check(c, m) { if (!c) { fails++; console.log("  ❌ " + m); } else console.log("  ✅ " + m); }

async function bootApp(store) {
  const dom = await JSDOM.fromFile(path.join(__dirname, "..", "index.html"), {
    url: "file://" + path.join(__dirname, "..", "index.html"),
    runScripts: "dangerously", resources: "usable",
    beforeParse(window) {
      Object.defineProperty(window, "localStorage", { value: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      }, writable: true, configurable: true });
      delete window.navigator.serviceWorker;
      window.confirm = () => true;
      window.print = () => { window.__printed = true; };
    },
  });
  const { window } = dom;
  const errors = [];
  window.addEventListener("error", (e) => {
    const msg = String((e.error && e.error.message) || e.message || "");
    if (msg.includes("reading 'register'")) return;
    errors.push(e.error ? (e.error.stack || e.error.message) : e.message);
  });
  await new Promise((res) => {
    const c = () => (typeof window.ManualLineup !== "undefined" && window.document.getElementById("tab-btn-manual")) ? res() : setTimeout(c, 20);
    c();
  });
  await new Promise((r) => setTimeout(r, 120));
  return { window, document: window.document, errors };
}

function selectPlayers(window, document, namen) {
  const set = new Set(namen);
  document.querySelectorAll(".player-chip").forEach((chip) => {
    const naam = chip.querySelector(".player-chip__name").textContent;
    if (set.has(naam)) {
      const input = chip.querySelector("input");
      input.checked = true;
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
    }
  });
}

// Vult alle 10 veldposities met de eerste beschikbare bankspelers
async function vulBlok(window, document) {
  for (let i = 0; i < 12; i++) {
    const leegSlot = document.querySelector(".mk-slot.is-empty");
    if (!leegSlot) break;
    const bench = document.querySelector("[data-mk-bench]");
    if (!bench) break;
    bench.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    const slot = document.querySelector(".mk-slot.is-empty");
    if (slot) slot.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function main() {
  const NAMEN = ["Jannick","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens"];

  console.log("=== TEST: derde tabblad en zichtbaarheid genereer-knop ===");
  const store = {};
  const { window, document, errors } = await bootApp(store);
  check(!!document.getElementById("tab-btn-manual"), "tabblad 'Eigen' bestaat");

  document.getElementById("tab-btn-manual").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 40));
  check(document.getElementById("screen-manual").classList.contains("is-active"), "Eigen-scherm wordt actief");
  check(document.querySelector(".action-bar").style.display === "none", "genereer-knop is verborgen op Eigen");

  document.getElementById("tab-btn-results").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check(document.querySelector(".action-bar").style.display !== "none", "genereer-knop weer zichtbaar op Opstelling");

  console.log("\n=== TEST: blok 1 bouwen ===");
  document.getElementById("tab-btn-team").dispatchEvent(new window.Event("click", { bubbles: true }));
  selectPlayers(window, document, NAMEN);
  await new Promise((r) => setTimeout(r, 40));
  document.getElementById("tab-btn-manual").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 40));

  check(document.querySelectorAll(".mk-slot").length === 10, "10 veldposities getoond");
  check(document.querySelectorAll("[data-mk-bench]").length === 14, "alle 14 spelers staan op de bank");
  check(document.getElementById("mk-add") && document.getElementById("mk-add").disabled, "'Nieuw blok' staat uit bij onvolledig blok");

  await vulBlok(window, document);
  check(document.querySelectorAll(".mk-slot.is-empty").length === 0, "alle 10 posities gevuld");
  check(document.querySelectorAll("[data-mk-bench]").length === 4, "4 spelers over op de bank");
  check(!document.getElementById("mk-add").disabled, "'Nieuw blok' nu actief");
  check(/\(\s*<|mk-tag|mk-chip-min/.test(document.getElementById("manual-content").innerHTML), "minuten-annotaties aanwezig");

  console.log("\n=== TEST: blokduur aanpassen ===");
  const dur = document.getElementById("mk-duration");
  dur.value = "30";
  dur.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check(document.getElementById("manual-content").innerHTML.includes("totaal 30/90"), "totaal loopt mee met de blokduur");

  console.log("\n=== TEST: blok 2 als kopie + wissel maken ===");
  document.getElementById("mk-add").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 40));
  check(document.querySelectorAll(".mk-slot.is-empty").length === 0, "blok 2 begint als kopie (alle posities gevuld)");
  check(document.getElementById("manual-content").innerHTML.includes("Blok 2"), "we zitten in blok 2");

  // Wissel: bankspeler plaatsen op een bezette positie
  const benchNaam = document.querySelector("[data-mk-bench]").dataset.mkBench;
  document.querySelector("[data-mk-bench]").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 15));
  document.querySelector("[data-mk-slot]").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  const html2 = document.getElementById("manual-content").innerHTML;
  check(html2.includes(benchNaam), `${benchNaam} staat nu in het veld`);
  check(document.querySelectorAll(".wissel-row").length >= 1, "wissel wordt automatisch afgeleid en getoond");
  check(html2.includes("Minuut 30"), "wissel staat standaard op de blokgrens (minuut 30)");

  console.log("\n=== TEST: wisselmoment verschuiven per 2,5 min ===");
  const shiftBack = document.querySelector('[data-mk-dir="-1"]');
  shiftBack.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check(document.getElementById("manual-content").innerHTML.includes("Minuut 27,5"), "wissel verschoven naar minuut 27,5");

  console.log("\n=== TEST: terug naar vorig blok ===");
  document.getElementById("mk-prev").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check(document.getElementById("manual-content").innerHTML.includes("Blok 1"), "terug in blok 1");
  document.getElementById("mk-next").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check(document.getElementById("manual-content").innerHTML.includes("Blok 2"), "weer vooruit naar blok 2");

  console.log("\n=== TEST: doorbouwen tot 90 min en afronden ===");
  let veiligheid = 0;
  while (!document.getElementById("mk-finish") && veiligheid++ < 10) {
    const add = document.getElementById("mk-add");
    if (!add) break;
    add.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 40));
  }
  check(!!document.getElementById("mk-finish"), "bij 90 minuten verschijnt 'Rond af' i.p.v. 'Nieuw blok'");
  check(document.getElementById("manual-content").innerHTML.includes("totaal 90/90"), "totaal is exact 90 minuten");

  document.getElementById("mk-finish").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  const eind = document.getElementById("manual-content").innerHTML;
  check(eind.includes("Minutenoverzicht"), "eindoverzicht toont minutenoverzicht");
  check(document.querySelectorAll(".mk-summary-block").length >= 2, "alle blokken staan onder elkaar");
  check(!!document.getElementById("mk-print"), "opslaan/printen-knop aanwezig");

  console.log("\n=== TEST: minutenoverzicht telt op tot 900 ===");
  const rows = [...document.querySelectorAll(".data-table tbody tr")];
  let som = 0;
  for (const tr of rows) {
    const t = tr.querySelectorAll("td")[3].textContent.replace("'", "").replace(",", ".");
    som += Number(t);
  }
  check(Math.abs(som - 900) < 1, `alle speelminuten samen zijn 900 (kreeg ${som})`);

  console.log("\n=== TEST: automatische opstelling blijft onaangetast ===");
  document.getElementById("tab-btn-team").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  document.getElementById("btn-generate").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  document.getElementById("tab-btn-manual").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  const naGenereren = document.getElementById("manual-content").innerHTML;
  check(naGenereren.includes("Minutenoverzicht") && document.querySelectorAll(".mk-summary-block").length >= 2,
    "eigen opstelling staat er nog onveranderd na 'Genereer opstelling'");

  console.log("\n=== TEST: geen JS-fouten ===");
  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`);
  if (errors.length) errors.slice(0, 3).forEach((e) => console.log("   ", String(e).split("\n")[0]));

  console.log("\n===================================");
  console.log(fails === 0 ? "✅ Eigen opstelling werkt volledig." : `❌ ${fails} check(s) gefaald.`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
