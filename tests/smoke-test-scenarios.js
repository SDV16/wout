const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

async function runScenario(sc) {
  const dom = await JSDOM.fromFile(path.join(__dirname, "..", "index.html"), {
    url: "file://" + path.join(__dirname, "..", "index.html"),
    runScripts: "dangerously",
    resources: "usable",
    beforeParse(window) {
      const store = {};
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: (k) => (k in store ? store[k] : null),
          setItem: (k, v) => { store[k] = String(v); },
          removeItem: (k) => { delete store[k]; },
        }, writable: true, configurable: true,
      });
      delete window.navigator.serviceWorker;
    },
  });
  const { window } = dom;
  const { document } = window;
  const errors = [];
  window.addEventListener("error", (e) => {
    const err = e.error || e.message;
    const msg = String(err && err.message || err);
    if (msg.includes("reading 'register'")) return;
    errors.push(err);
  });

  await new Promise((resolve) => {
    const check = () => (typeof window.OpstellingLogic !== "undefined" && document.getElementById("btn-generate")) ? resolve() : setTimeout(check, 30);
    check();
  });
  await new Promise((r) => setTimeout(r, 100));

  const selSet = new Set(sc.selectie);
  const chips = [...document.querySelectorAll(".player-chip")];
  for (const chip of chips) {
    const naam = chip.querySelector(".player-chip__name").textContent;
    if (selSet.has(naam)) {
      const input = chip.querySelector("input");
      input.checked = true;
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
    }
  }

  // Instellingen toepassen via de echte UI-elementen
  const rows = [...document.querySelectorAll(".player-settings")];
  for (const row of rows) {
    const naam = row.querySelector(".player-settings__name").textContent;
    const training = (sc.training_overrides && sc.training_overrides[naam] !== undefined) ? sc.training_overrides[naam] : sc.training_default;
    const btn = row.querySelector(`.segmented--training button[data-val="${training}"]`);
    btn.dispatchEvent(new window.Event("click", { bubbles: true }));

    if (sc.priority_overrides && sc.priority_overrides[naam]) {
      const cb = row.querySelector(".opt-priority");
      cb.checked = true;
      cb.dispatchEvent(new window.Event("change", { bubbles: true }));
    }
    if (sc.availability_overrides && sc.availability_overrides[naam]) {
      const av = sc.availability_overrides[naam];
      if (av.first) {
        const cb = row.querySelector(".opt-fh");
        cb.checked = true;
        cb.dispatchEvent(new window.Event("change", { bubbles: true }));
      }
      if (av.second) {
        const cb = row.querySelector(".opt-sh");
        cb.checked = true;
        cb.dispatchEvent(new window.Event("change", { bubbles: true }));
      }
    }
    if (sc.max_minutes_overrides && sc.max_minutes_overrides[naam] !== undefined) {
      const inp = row.querySelector(".opt-maxmin");
      inp.value = sc.max_minutes_overrides[naam];
      inp.dispatchEvent(new window.Event("change", { bubbles: true }));
    }
  }

  document.getElementById("input-bonus0").value = sc.bonus_0;
  document.getElementById("input-bonus0").dispatchEvent(new window.Event("change", { bubbles: true }));
  document.getElementById("input-bonus1").value = sc.bonus_1;
  document.getElementById("input-bonus1").dispatchEvent(new window.Event("change", { bubbles: true }));

  document.getElementById("btn-generate").click();

  const resultsHTML = document.getElementById("results-content").innerHTML;
  return { errors, resultsHTML, naam: sc.name };
}

async function main() {
  const scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, "scenarios.json")));
  let totalErrors = 0;
  for (const sc of scenarios) {
    const { errors, resultsHTML, naam } = await runScenario(sc);
    const heeftError = resultsHTML.includes("banner--error");
    const heeftShortage = resultsHTML.includes("kan onmogelijk een volledige opstelling vullen");
    const heeftGeenOpstelling = resultsHTML.includes("Geen opstelling gevonden");
    const heeftBlok = resultsHTML.includes("block-card");
    console.log(`${naam}: JS-fouten=${errors.length} | tekort-banner=${heeftShortage} | geen-opstelling=${heeftGeenOpstelling} | blokken-getoond=${heeftBlok}`);
    if (errors.length) {
      totalErrors += errors.length;
      errors.forEach(e => console.log("  ", e && e.stack ? e.stack.split("\n")[0] : e));
    }
  }
  console.log(totalErrors === 0 ? "\n✅ Alle scenario's door de echte UI, geen enkele JS-fout." : `\n❌ ${totalErrors} fouten gevonden.`);
  process.exit(totalErrors === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
