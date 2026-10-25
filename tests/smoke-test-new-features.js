const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

function makeStorageBacking() {
  return {};
}

async function bootApp(storageStore) {
  const dom = await JSDOM.fromFile(path.join(__dirname, "..", "index.html"), {
    url: "file://" + path.join(__dirname, "..", "index.html"),
    runScripts: "dangerously",
    resources: "usable",
    beforeParse(window) {
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: (k) => (k in storageStore ? storageStore[k] : null),
          setItem: (k, v) => { storageStore[k] = String(v); },
          removeItem: (k) => { delete storageStore[k]; },
        }, writable: true, configurable: true,
      });
      delete window.navigator.serviceWorker;
    },
  });
  const { window } = dom;
  const errors = [];
  window.addEventListener("error", (e) => {
    const msg = String((e.error && e.error.message) || e.message || "");
    if (msg.includes("reading 'register'")) return;
    errors.push(e.error || e.message);
  });
  await new Promise((resolve) => {
    const check = () => (typeof window.OpstellingLogic !== "undefined" && window.document.getElementById("btn-generate")) ? resolve() : setTimeout(check, 20);
    check();
  });
  await new Promise((r) => setTimeout(r, 80));
  return { dom, window, document: window.document, errors };
}

function check(cond, msg, fails) {
  if (!cond) { fails.push(msg); console.log("  ❌ " + msg); }
  else console.log("  ✅ " + msg);
}

function selectPlayers(window, document, names) {
  const set = new Set(names);
  document.querySelectorAll(".player-chip").forEach((chip) => {
    const naam = chip.querySelector(".player-chip__name").textContent;
    if (set.has(naam)) {
      const input = chip.querySelector("input");
      input.checked = true;
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
    }
  });
}

async function testPositionEditor() {
  console.log("\n=== TEST: wijzig posities ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());

  selectPlayers(window, document, ["Sietse", "Collin", "Wout", "Jaimy", "Sjoerd", "Pelle", "Jorra", "Tycho", "Nord", "Dinand"]);
  await new Promise((r) => setTimeout(r, 30));

  // Sietse zit standaard in "Verdedigers" (favourite=ra). We wijzigen zijn
  // favourite naar "sp" en checken dat hij daarna in "Aanvallers" verschijnt.
  const row = [...document.querySelectorAll(".player-settings")].find((r) => r.querySelector(".player-settings__name").textContent.startsWith("Sietse"));
  check(!!row, "instellingen-rij voor Sietse gevonden", fails);

  row.querySelector(".btn-change-positions").click();
  await new Promise((r) => setTimeout(r, 20));
  const overlay = document.getElementById("modal-overlay");
  check(!overlay.hidden, "modal opent na klik op 'Wijzig posities'", fails);

  // Favourite/RA cel uitzetten, Favourite/SP cel aanzetten
  const raFavCell = document.querySelector('.pos-grid__cell[data-pos="ra"][data-tier="favourite"]');
  const spFavCell = document.querySelector('.pos-grid__cell[data-pos="sp"][data-tier="favourite"]');
  check(raFavCell.classList.contains("is-active"), "RA/Favourite stond aan (uit de database)", fails);
  raFavCell.click();
  spFavCell.click();
  document.getElementById("modal-close").click();

  const catGroups = document.getElementById("category-groups").innerHTML;
  const aanvallersCard = [...document.querySelectorAll(".cat-card")].find((c) => c.querySelector(".cat-card__title").textContent === "Aanvallers");
  const jannickInAanvallers = [...aanvallersCard.querySelectorAll(".player-chip__name")].some((el) => el.textContent === "Sietse");
  check(jannickInAanvallers, "Sietse staat na de wijziging onder 'Aanvallers'", fails);

  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`, fails);
  return fails;
}

async function testAddTempPlayer() {
  console.log("\n=== TEST: tijdelijke speler toevoegen ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());

  document.getElementById("btn-add-temp").click();
  await new Promise((r) => setTimeout(r, 20));
  check(!document.getElementById("modal-overlay").hidden, "modal opent voor tijdelijke speler", fails);

  document.getElementById("temp-name-input").value = "Milan (invaller)";
  document.getElementById("temp-name-input").dispatchEvent(new window.Event("input", { bubbles: true }));

  const addBtn = document.querySelector(".modal-primary");
  check(addBtn.disabled, "toevoegen-knop staat uit zonder gekozen positie", fails);

  document.querySelector('.pos-grid__cell[data-pos="cm"][data-tier="favourite"]').click();
  check(!addBtn.disabled, "toevoegen-knop actief na kiezen van een positie", fails);

  addBtn.click();
  await new Promise((r) => setTimeout(r, 20));
  check(document.getElementById("modal-overlay").hidden, "modal sluit na toevoegen", fails);

  const chipNames = [...document.querySelectorAll(".player-chip__name")].map((el) => el.textContent);
  check(chipNames.includes("Milan (invaller)"), "Milan verschijnt tussen de vinkjes", fails);

  const settingsNames = [...document.querySelectorAll(".player-settings__name")].map((el) => el.textContent);
  check(settingsNames.some((n) => n.includes("Milan")), "Milan staat al aangevinkt in instellingen (auto-selected)", fails);
  check(document.querySelector(".temp-tag") !== null, "'tijdelijk'-label wordt getoond", fails);

  // Nu een volledige selectie + Milan genereren, checken dat hij meedoet.
  // (Stijn + Xander erbij voor voldoende LA/RA/CV-dekking, anders is deze
  // selectie zelf al structureel niet haalbaar en komt er geen resultaat.)
  selectPlayers(window, document, ["Collin", "Wout", "Jaimy", "Sjoerd", "Pelle", "Jorra", "Nord", "Dinand", "Stijn", "Xander"]);
  await new Promise((r) => setTimeout(r, 30));
  document.getElementById("btn-generate").click();
  await new Promise((r) => setTimeout(r, 30));
  const resultsHTML = document.getElementById("results-content").innerHTML;
  check(resultsHTML.includes("Milan"), "Milan komt voor in de gegenereerde opstelling/minutenoverzicht", fails);
  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`, fails);
  return fails;
}

async function testModalHiddenOnLoad() {
  console.log("\n=== TEST: modal is écht verborgen bij het laden (regressie op de gemelde bug) ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());
  const overlay = document.getElementById("modal-overlay");
  check(overlay.hasAttribute("hidden"), "hidden-attribuut staat op de modal bij laden", fails);
  const computed = window.getComputedStyle(overlay);
  check(computed.display === "none", `modal is ook echt onzichtbaar bij laden (computed display='${computed.display}')`, fails);
  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`, fails);
  return fails;
}

async function testHalfRestrictionCapsTarget() {
  console.log("\n=== TEST: 1e/2e-helft-beperking capt 'Recht op' op 45 ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());

  const namen = ["Julius","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn"];
  selectPlayers(window, document, namen);
  await new Promise((r) => setTimeout(r, 30));

  const nordRow = [...document.querySelectorAll(".player-settings")].find((r) => r.querySelector(".player-settings__name").textContent.startsWith("Nord"));
  const fhCheckbox = nordRow.querySelector(".opt-fh");
  fhCheckbox.checked = true;
  fhCheckbox.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));

  document.getElementById("btn-generate").click();
  await new Promise((r) => setTimeout(r, 60));

  const rechtOpNord = extractTableValue(document, "Nord", 2);
  check(rechtOpNord !== null && rechtOpNord <= 45, `Nord (1e helft only) heeft 'Recht op' <= 45, kreeg ${rechtOpNord}`, fails);
  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`, fails);
  return fails;
}

async function testNoLegend() {
  console.log("\n=== TEST: legenda onder minutenoverzicht is verwijderd ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());
  selectPlayers(window, document, ["Sietse","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand"]);
  await new Promise((r) => setTimeout(r, 30));
  document.getElementById("btn-generate").click();
  await new Promise((r) => setTimeout(r, 50));
  check(document.querySelector(".legend") === null, "geen .legend-element meer in de weergave", fails);
  check(!document.getElementById("results-content").innerHTML.includes("binnen 4 min"), "legenda-tekst komt nergens meer voor", fails);
  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`, fails);
  return fails;
}

// Robuuste, DOM-based kolomopzoeking (i.p.v. regex op de ruwe HTML-string,
// die kan struikelen over geneste elementen/attributen in andere cellen).
function extractTableValue(document, naam, kolomIndex) {
  const rows = [...document.querySelectorAll(".data-table tbody tr")];
  const row = rows.find((tr) => tr.querySelector("td")?.textContent === naam);
  if (!row) return null;
  const cells = [...row.querySelectorAll("td")];
  const tekst = cells[kolomIndex]?.textContent || "";
  const num = tekst.match(/-?\d+(\.\d+)?/);
  return num ? Number(num[0]) : null;
}

async function main() {
  let allFails = [];
  allFails = allFails.concat(await testModalHiddenOnLoad());
  allFails = allFails.concat(await testPositionEditor());
  allFails = allFails.concat(await testAddTempPlayer());
  allFails = allFails.concat(await testHalfRestrictionCapsTarget());
  allFails = allFails.concat(await testNoLegend());

  console.log(`\n===================================`);
  if (allFails.length === 0) {
    console.log("✅ Alle nieuwe features werken zoals bedoeld.");
    process.exit(0);
  } else {
    console.log(`❌ ${allFails.length} check(s) gefaald.`);
    process.exit(1);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
