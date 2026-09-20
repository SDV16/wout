const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

async function main() {
  const dom = await JSDOM.fromFile(path.join(__dirname, "..", "index.html"), {
    url: "file://" + path.join(__dirname, "..", "index.html"),
    runScripts: "dangerously",
    resources: "usable",
    beforeParse(window) {
      const store = {};
      const stub = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      };
      Object.defineProperty(window, "localStorage", { value: stub, writable: true, configurable: true });
      Object.defineProperty(window.navigator, "serviceWorker", { value: undefined, writable: true, configurable: true });
      delete window.navigator.serviceWorker;
    },
  });

  const { window } = dom;
  const { document } = window;

  const errors = [];
  window.addEventListener("error", (e) => {
    const err = e.error || e.message;
    const msg = String(err && err.message || err);
    if (msg.includes("reading 'register'")) return; // bekende jsdom-beperking (geen serviceworker-support), geen app-fout
    errors.push(err);
  });

  // Wacht tot alle <script src> tags (die async via het bestandssysteem laden) klaar zijn
  await new Promise((resolve) => {
    const check = () => {
      if (typeof window.OpstellingLogic !== "undefined" && document.getElementById("btn-generate")) {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
  // Kleine extra marge zodat app.js's IIFE (die na alle scripts draait) klaar is
  await new Promise((r) => setTimeout(r, 200));

  console.log("Errors na laden:", errors);

  // --- Test 1: 12 spelers selecteren via de echte checkboxen ---
  const namenOmTeSelecteren = ["Jannick","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn"];
  const chips = [...document.querySelectorAll(".player-chip")];
  let aangevinkt = 0;
  for (const chip of chips) {
    const naam = chip.querySelector(".player-chip__name").textContent;
    if (namenOmTeSelecteren.includes(naam)) {
      const input = chip.querySelector("input");
      input.checked = true;
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
      aangevinkt++;
    }
  }
  console.log("Aangevinkt:", aangevinkt, "van", namenOmTeSelecteren.length);

  const badge = document.getElementById("selected-count").textContent;
  console.log("Teller toont:", badge);

  const settingsRows = document.querySelectorAll(".player-settings");
  console.log("Aantal instellingen-rijen gerenderd:", settingsRows.length);

  // Zet 1 speler op 0 trainingen via de segmented control, en 1 op priority
  const firstRow = settingsRows[0];
  const trainBtn0 = firstRow.querySelector('.segmented--training button[data-val="0"]');
  trainBtn0.dispatchEvent(new window.Event("click", { bubbles: true }));
  const prioCheckbox = settingsRows[1].querySelector(".opt-priority");
  prioCheckbox.checked = true;
  prioCheckbox.dispatchEvent(new window.Event("change", { bubbles: true }));

  // --- Test 2: genereren ---
  document.getElementById("btn-generate").click();

  console.log("Errors na genereren:", errors);

  const resultsHTML = document.getElementById("results-content").innerHTML;
  console.log("Resultaat bevat 'Blok':", resultsHTML.includes("Blok "));
  console.log("Resultaat bevat pitch-svg:", resultsHTML.includes("pitch-svg"));
  console.log("Resultaat bevat Minutenoverzicht sectie:", resultsHTML.includes("Minutenoverzicht"));
  console.log("Resultaat bevat Positie-overzicht sectie:", resultsHTML.includes("Positie-overzicht"));
  console.log("Actief tabblad is nu 'results':", document.getElementById("screen-results").classList.contains("is-active"));

  // localStorage persistentie check
  const savedRaw = window.localStorage.getItem("opstelling-app-state-v1");
  const saved = JSON.parse(savedRaw);
  console.log("Aantal opgeslagen geselecteerde spelers:", Object.values(saved.players).filter(p => p.selected).length);
  console.log("Jannick training opgeslagen als:", saved.players["Jannick"].training);

  if (errors.length > 0) {
    console.log("\n❌ ER ZIJN JS-FOUTEN OPGETREDEN:");
    errors.forEach(e => console.log(e && e.stack ? e.stack : e));
    process.exit(1);
  } else {
    console.log("\n✅ Geen JS-fouten, app draait door van selectie tot resultaat.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
