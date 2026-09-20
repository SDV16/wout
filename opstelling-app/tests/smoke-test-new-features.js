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

  selectPlayers(window, document, ["Jannick", "Collin", "Wout", "Jaimy", "Sjoerd", "Pelle", "Jorra", "Tycho", "Nord", "Dinand"]);
  await new Promise((r) => setTimeout(r, 30));

  // Jannick zit standaard in "Verdedigers" (favourite=ra). We wijzigen zijn
  // favourite naar "sp" en checken dat hij daarna in "Aanvallers" verschijnt.
  const row = [...document.querySelectorAll(".player-settings")].find((r) => r.querySelector(".player-settings__name").textContent.startsWith("Jannick"));
  check(!!row, "instellingen-rij voor Jannick gevonden", fails);

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
  const jannickInAanvallers = [...aanvallersCard.querySelectorAll(".player-chip__name")].some((el) => el.textContent === "Jannick");
  check(jannickInAanvallers, "Jannick staat na de wijziging onder 'Aanvallers'", fails);

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

async function testManualSwap() {
  console.log("\n=== TEST: handmatig wisselen + live minutenoverzicht ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());

  const namen = ["Jannick","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens"];
  selectPlayers(window, document, namen);
  await new Promise((r) => setTimeout(r, 30));
  document.getElementById("btn-generate").click();
  await new Promise((r) => setTimeout(r, 60));

  const benchChip = document.querySelector(".bench-chip");
  check(!!benchChip, "er is een bankspeler zichtbaar in blok 1 (14 spelers, 10 op het veld)", fails);

  const benchName = benchChip.dataset.player;
  const block = benchChip.dataset.block;
  const before = document.getElementById("results-content").innerHTML;
  const gekregenVoor = extractGekregen(before, benchName);

  benchChip.click();
  await new Promise((r) => setTimeout(r, 20));
  check(document.querySelector(".bench-chip.is-picked") !== null, "bankspeler wordt gemarkeerd als 'opgepakt' na klik", fails);

  const pitchGroup = document.querySelector(`.pitch-chip-group[data-block="${block}"]`);
  const verdrevenSpeler = pitchGroup.dataset.player;
  pitchGroup.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));

  const after = document.getElementById("results-content").innerHTML;
  check(document.querySelector(".bench-chip.is-picked") === null, "geen 'opgepakt'-markering meer na voltooide wissel", fails);

  const gekregenNa = extractGekregen(after, benchName);
  check(gekregenNa !== null && gekregenVoor !== null && gekregenNa > gekregenVoor,
    `${benchName} kreeg meer minuten na de handmatige wissel (${gekregenVoor} -> ${gekregenNa})`, fails);

  const verdrevenNa = extractGekregen(after, verdrevenSpeler);
  const verdrevenVoor = extractGekregen(before, verdrevenSpeler);
  check(verdrevenNa !== null && verdrevenVoor !== null && verdrevenNa < verdrevenVoor,
    `${verdrevenSpeler} kreeg minder minuten na de handmatige wissel (${verdrevenVoor} -> ${verdrevenNa})`, fails);

  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`, fails);
  return fails;
}

function extractGekregen(html, naam) {
  // Zoekt de rij van `naam` in de Minutenoverzicht-tabel en pakt de "Gekregen"-kolom (3e td na naam)
  const re = new RegExp(`<td>${naam.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}</td>\\s*<td[^>]*>[^<]*</td>\\s*<td[^>]*>[^<]*</td>\\s*<td[^>]*>(\\d+)'`);
  const m = html.match(re);
  return m ? Number(m[1]) : null;
}

async function testPersistence() {
  console.log("\n=== TEST: persistentie van lastResult over een 'refresh' ===");
  const fails = [];
  const store = makeStorageBacking();
  const { window, document, errors } = await bootApp(store);

  selectPlayers(window, document, ["Jannick","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Nord","Dinand","Stijn"]);
  await new Promise((r) => setTimeout(r, 30));
  document.getElementById("btn-generate").click();
  await new Promise((r) => setTimeout(r, 30));

  check(!!store["opstelling-app-state-v1"], "state is weggeschreven naar localStorage", fails);
  const saved = JSON.parse(store["opstelling-app-state-v1"]);
  check(saved.lastResult && saved.lastResult.type === "ok", "lastResult zit in de opgeslagen state", fails);

  // Simuleer een refresh: nieuwe DOM/window, ZELFDE storage-store
  const { document: document2, errors: errors2 } = await bootApp(store);
  const resultsHTML2 = document2.getElementById("results-content").innerHTML;
  check(resultsHTML2.includes("block-card"), "opstelling wordt automatisch getoond na 'herladen' van de pagina", fails);
  check(resultsHTML2.includes("Minutenoverzicht"), "minutenoverzicht is ook meteen weer zichtbaar", fails);
  check(errors2.length === 0, `geen JS-fouten bij herladen (${errors2.length} gevonden)`, fails);

  // sessionPlayerOverrides/tempPlayers mogen NIET overleven een refresh
  const catGroups2 = document2.getElementById("category-groups").innerHTML;
  check(!catGroups2.includes("Milan"), "tijdelijke spelers/overrides zijn NIET bewaard (zoals bedoeld)", fails);

  check(errors.length === 0, `geen JS-fouten in eerste sessie (${errors.length} gevonden)`, fails);
  return fails;
}

async function testFieldToFieldSwap() {
  console.log("\n=== TEST: veld<->veld wisselen ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());

  const namen = ["Jannick","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens"];
  selectPlayers(window, document, namen);
  await new Promise((r) => setTimeout(r, 30));
  document.getElementById("btn-generate").click();
  await new Promise((r) => setTimeout(r, 60));

  const before = document.getElementById("results-content").innerHTML;
  const pitchGroups = [...document.querySelectorAll(".pitch-chip-group")];
  const block = pitchGroups[0].dataset.block;
  const inBlock = pitchGroups.filter((g) => g.dataset.block === block);
  const speler1 = inBlock[0];
  const speler2 = inBlock.find((g) => g.dataset.pos !== speler1.dataset.pos && g.dataset.player !== speler1.dataset.player);

  const naam1 = speler1.dataset.player, pos1 = speler1.dataset.pos;
  const naam2 = speler2.dataset.player, pos2 = speler2.dataset.pos;
  const gekregen1Voor = extractGekregen(before, naam1);
  const gekregen2Voor = extractGekregen(before, naam2);

  speler1.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  check(document.querySelector(".pitch-chip-group.is-picked-field") !== null, "geklikte veldspeler krijgt 'opgepakt'-markering", fails);

  // Zelfde speler nogmaals aantikken moet annuleren
  document.querySelector(`.pitch-chip-group[data-block="${block}"][data-pos="${pos1}"]`).dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  check(document.querySelector(".pitch-chip-group.is-picked-field") === null, "nogmaals klikken op dezelfde speler annuleert de keuze", fails);

  // Opnieuw oppakken en nu daadwerkelijk wisselen met speler2
  document.querySelector(`.pitch-chip-group[data-block="${block}"][data-pos="${pos1}"]`).dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  document.querySelector(`.pitch-chip-group[data-block="${block}"][data-pos="${pos2}"]`).dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));

  const after = document.getElementById("results-content").innerHTML;
  const posAttrsAfter = [...document.querySelectorAll(`.pitch-chip-group[data-block="${block}"]`)];
  const nu1 = posAttrsAfter.find((g) => g.dataset.pos === pos1);
  const nu2 = posAttrsAfter.find((g) => g.dataset.pos === pos2);
  check(nu1.dataset.player === naam2, `${naam2} staat nu op ${pos1} (was ${naam1})`, fails);
  check(nu2.dataset.player === naam1, `${naam1} staat nu op ${pos2} (was ${naam2})`, fails);

  const gekregen1Na = extractGekregen(after, naam1);
  const gekregen2Na = extractGekregen(after, naam2);
  check(gekregen1Na !== null && gekregen1Voor !== null, `minuten van ${naam1} correct herberekend na de wissel`, fails);
  check(gekregen2Na !== null && gekregen2Voor !== null, `minuten van ${naam2} correct herberekend na de wissel`, fails);

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

async function testMaxSubstitutionMinute() {
  console.log("\n=== TEST: geen wissels na minuut 80 ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());

  // Grote, drukke selectie zodat het laatste blok waarschijnlijk veel
  // gelijktijdige wissels nodig heeft (goede stresstest voor de grens).
  const namen = ["Jannick","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand",
                 "Sietse","Stijn","Xander","Jens","Roef","Chris","Julius","Tobias","Nicky","Cas"];
  selectPlayers(window, document, namen);
  await new Promise((r) => setTimeout(r, 30));
  document.getElementById("btn-generate").click();
  await new Promise((r) => setTimeout(r, 80));

  const minuten = [...document.querySelectorAll(".wissel-moment__min")].map((el) => Number(el.textContent.replace("Minuut ", "")));
  const maxMinuut = minuten.length ? Math.max(...minuten) : 0;
  check(maxMinuut <= 80, `hoogste wisselmoment is ${maxMinuut} (moet <= 80 zijn)`, fails);
  check(!document.getElementById("results-content").innerHTML.includes("Minuut 85"), "geen 'Minuut 85' meer in de weergave", fails);
  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`, fails);
  return fails;
}

async function testManualMomentShift() {
  console.log("\n=== TEST: handmatig een wisselmoment verschuiven ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());

  const namen = ["Jannick","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens"];
  selectPlayers(window, document, namen);
  await new Promise((r) => setTimeout(r, 30));
  document.getElementById("btn-generate").click();
  await new Promise((r) => setTimeout(r, 60));

  const row = document.querySelector(".wissel-row");
  check(!!row, "er is minstens 1 wisselrij met verschuifknoppen", fails);
  check(row.querySelector(".wissel-pos") !== null, "de positie van de inkomende speler wordt getoond, bv. '(cv)'", fails);

  const block = row.dataset.block;
  const key = row.dataset.pairkey;
  const minuutVoor = Number(row.closest(".wissel-moment").querySelector(".wissel-moment__min").textContent.replace("Minuut ", ""));

  row.querySelector('.wissel-shift[data-dir="5"]').click();
  await new Promise((r) => setTimeout(r, 30));

  const rowNa = [...document.querySelectorAll(".wissel-row")].find((r) => r.dataset.pairkey === key && r.dataset.block === block);
  check(!!rowNa, "de wisselrij bestaat nog na het verschuiven", fails);
  const minuutNa = Number(rowNa.closest(".wissel-moment").querySelector(".wissel-moment__min").textContent.replace("Minuut ", ""));
  check(minuutNa === minuutVoor + 5, `moment is verschoven van ${minuutVoor} naar ${minuutNa} (verwacht ${minuutVoor + 5})`, fails);

  const saved = JSON.parse(window.localStorage.getItem("opstelling-app-state-v1"));
  check(saved.lastResult.manualMomentOverrides[block] && saved.lastResult.manualMomentOverrides[block][key] === minuutVoor + 5,
    "verschuiving wordt opgeslagen (overleeft dus ook een refresh)", fails);

  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`, fails);
  return fails;
}

async function testPositionColumnMatchesTotal() {
  console.log("\n=== TEST: Posities-kolom telt op tot Gekregen ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());

  const namen = ["Jannick","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens","Roef","Chris"];
  selectPlayers(window, document, namen);
  await new Promise((r) => setTimeout(r, 30));
  document.getElementById("btn-generate").click();
  await new Promise((r) => setTimeout(r, 60));

  const rows = [...document.querySelectorAll(".data-table tbody tr")];
  check(rows.length > 0, "minutenoverzicht-tabel heeft rijen", fails);
  let alleKloppen = true;
  for (const tr of rows) {
    const cells = tr.querySelectorAll("td");
    const gekregen = Number(cells[3].textContent.replace("'", ""));
    const positiesTekst = cells[5].textContent; // bv "sp:68" of "cv:23, cm:45"
    const som = positiesTekst.split(",").reduce((acc, part) => {
      const m = part.trim().match(/:(\d+)/);
      return acc + (m ? Number(m[1]) : 0);
    }, 0);
    if (Math.abs(som - gekregen) > 0.6) {
      alleKloppen = false;
      console.log(`  !! ${cells[0].textContent}: Gekregen=${gekregen} maar Posities telt op tot ${som}`);
    }
  }
  check(alleKloppen, "voor elke speler telt de Posities-kolom exact op tot de Gekregen-minuten", fails);
  check(document.getElementById("results-content").innerHTML.includes("Positie-overzicht") === false, "Positie-overzicht-tabel is verwijderd", fails);
  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`, fails);
  return fails;
}

async function testHalfRestrictionCapsTarget() {
  console.log("\n=== TEST: 1e/2e-helft-beperking capt 'Recht op' op 45 ===");
  const fails = [];
  const { window, document, errors } = await bootApp(makeStorageBacking());

  const namen = ["Jannick","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn"];
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
  selectPlayers(window, document, ["Jannick","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand"]);
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
  allFails = allFails.concat(await testManualSwap());
  allFails = allFails.concat(await testFieldToFieldSwap());
  allFails = allFails.concat(await testPersistence());
  allFails = allFails.concat(await testMaxSubstitutionMinute());
  allFails = allFails.concat(await testManualMomentShift());
  allFails = allFails.concat(await testPositionColumnMatchesTotal());
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
