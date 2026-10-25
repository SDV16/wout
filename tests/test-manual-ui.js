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
  const NAMEN = ["Julius","Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens"];

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
    const td = tr.querySelectorAll("td")[3];
    som += td.dataset.min !== undefined ? Number(td.dataset.min) : Number(td.textContent.replace("'", "").replace(",", "."));
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


  console.log("\n=== TEST: blokduur met komma + stapknoppen + leesbaarheid ===");
  {
    const store2 = {};
    const app2 = await bootApp(store2);
    const w2 = app2.window, d2 = app2.document;
    selectPlayers(w2, d2, NAMEN);
    await new Promise((r) => setTimeout(r, 30));
    d2.getElementById("tab-btn-manual").dispatchEvent(new w2.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 40));

    const inp = d2.getElementById("mk-duration");
    check(inp.type === "text", "blokduur is een tekstveld (toont komma i.p.v. punt)");
    check(inp.value === "22,5", `standaardduur wordt als '22,5' getoond (kreeg '${inp.value}')`);

    inp.value = "20,0";
    inp.dispatchEvent(new w2.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 25));
    check(d2.getElementById("mk-duration").value === "20", `invoer '20,0' wordt 20 (kreeg '${d2.getElementById("mk-duration").value}')`);

    d2.querySelector('[data-mk-dur-step="2.5"]').dispatchEvent(new w2.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 25));
    check(d2.getElementById("mk-duration").value === "22,5", "plus-knop geeft 22,5 weer met komma");

    d2.querySelector('[data-mk-dur-step="-2.5"]').dispatchEvent(new w2.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 25));
    check(d2.getElementById("mk-duration").value === "20", "min-knop gaat terug naar 20");
    check(app2.errors.length === 0, "geen JS-fouten bij blokduur");
  }

  console.log("\n=== TEST: vinkje + groene achtergrond bij juiste minuten ===");
  {
    const store3 = {};
    const app3 = await bootApp(store3);
    const w3 = app3.window, d3 = app3.document;
    // Precies 10 spelers: iedereen speelt dan alle 90 min en heeft recht op 90
    selectPlayers(w3, d3, ["Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Stijn","Xander"]);
    await new Promise((r) => setTimeout(r, 30));
    d3.getElementById("tab-btn-manual").dispatchEvent(new w3.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 40));
    await vulBlok(w3, d3);
    const dur = d3.getElementById("mk-duration");
    dur.value = "90";
    dur.dispatchEvent(new w3.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));

    const slots = [...d3.querySelectorAll(".mk-slot")];
    check(slots.length === 10 && slots.every((sl) => sl.classList.contains("is-done")),
      "alle 10 spelers die precies hun recht-op spelen hebben een groene achtergrond (is-done)");
    check(d3.querySelectorAll(".mk-check-svg").length === 10, "elke groene speler toont een vinkje");
    check(!/\d\/\d/.test([...d3.querySelectorAll(".mk-slot")].map((x) => x.textContent).join(" ")),
      "bij een groene speler staan GEEN minuten/recht-op-getallen meer");

    // Eindoverzicht: in de tabel vervangt een vinkje de groene getallen
    d3.getElementById("mk-finish").dispatchEvent(new w3.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const rijen = [...d3.querySelectorAll(".data-table tbody tr")];
    const tekstGekregen = rijen.map((tr) => tr.querySelectorAll("td")[3].textContent.trim());
    const tekstVerschil = rijen.map((tr) => tr.querySelectorAll("td")[4].textContent.trim());
    check(rijen.length === 10 && tekstGekregen.every((t) => t === "\u2713"), "tabel: bij spelers die goed zitten staat een vinkje i.p.v. het gekregen-getal");
    check(tekstVerschil.every((t) => t === "\u2713"), "tabel: en ook een vinkje i.p.v. het verschil-getal");
    check(rijen.every((tr) => Number(tr.querySelectorAll("td")[3].dataset.min) === 90), "het exacte getal (90) blijft beschikbaar als tooltip/data");
    check(rijen.every((tr) => /^\d+'$/.test(tr.querySelectorAll("td")[2].textContent.trim())), "'Recht op' blijft gewoon een getal");
    check(app3.errors.length === 0, "geen JS-fouten bij vinkjes");
  }

  console.log("\n=== TEST: 'recht op' als heel getal bij Eigen ===");
  {
    // 14 spelers -> 900/14 = 64,29: moet als 64 verschijnen, in de tabel én onder de namen
    const cellen = [...document.querySelectorAll("#manual-content .data-table tbody tr")].map((tr) => tr.querySelectorAll("td")[2].textContent.trim());
    check(cellen.length > 0 && cellen.every((t) => /^\d+'$/.test(t)), `'Recht op' in de tabel is een heel getal (${cellen.slice(0, 3).join(" ")} ...)`);
    {
      const rijen = [...document.querySelectorAll("#manual-content .data-table tbody tr")];
      const groen = rijen.filter((tr) => tr.querySelectorAll("td")[3].classList.contains("mk-green"));
      const nietGroen = rijen.filter((tr) => !tr.querySelectorAll("td")[3].classList.contains("mk-green"));
      console.log(`  (rijen: ${groen.length} groen, ${nietGroen.length} niet groen)`);
      check(groen.every((tr) => tr.querySelectorAll("td")[3].textContent.trim() === "\u2713" && tr.querySelectorAll("td")[4].textContent.trim() === "\u2713"), "groene rijen tonen vinkjes bij gekregen én verschil");
      check(nietGroen.every((tr) => /\d/.test(tr.querySelectorAll("td")[3].textContent) && /\d/.test(tr.querySelectorAll("td")[4].textContent)), "oranje/rode rijen houden hun getallen");
    }
    document.getElementById("mk-back-edit").dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 40));
    const tekst = document.getElementById("manual-content").textContent;
    const tags = [...tekst.matchAll(/\(([\d,]+)\/(\d+[,.]?\d*)\)/g)];
    check(tags.length === 0 || tags.every((m) => /^\d+$/.test(m[2])), "ook in de (gespeeld/recht op)-tags onder de namen is het recht-op-getal een heel getal");
  }

  console.log("\n=== TEST: geen JS-fouten ===");
  check(errors.length === 0, `geen JS-fouten (${errors.length} gevonden)`);
  if (errors.length) errors.slice(0, 3).forEach((e) => console.log("   ", String(e).split("\n")[0]));

  console.log("\n===================================");
  console.log(fails === 0 ? "✅ Eigen opstelling werkt volledig." : `❌ ${fails} check(s) gefaald.`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
