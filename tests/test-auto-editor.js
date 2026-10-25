const { JSDOM } = require("jsdom");
const path = require("path");
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log("  ❌ " + m); } else console.log("  ✅ " + m); }

const NAMEN = ["Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens","Roef"];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(store) {
  const file = path.join(__dirname, "..", "index.html");
  const dom = await JSDOM.fromFile(file, {
    url: "file://" + file, runScripts: "dangerously", resources: "usable",
    beforeParse(w) {
      Object.defineProperty(w, "localStorage", { value: {
        getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
      }, writable: true, configurable: true });
      delete w.navigator.serviceWorker; w.confirm = () => true; w.print = () => {};
      w.__errors = []; w.addEventListener("error", (e) => w.__errors.push((e.error && e.error.stack) || e.message));
    },
  });
  const w = dom.window, d = w.document;
  await new Promise((r) => { const c = () => (typeof w.AutoLineup !== "undefined" && d.getElementById("btn-generate")) ? r() : setTimeout(c, 20); c(); });
  await wait(150);
  return { w, d };
}
const klik = async (w, el) => { el.dispatchEvent(new w.Event("click", { bubbles: true })); await wait(25); };
function kies(w, d, namen) {
  const set = new Set(namen);
  d.querySelectorAll(".player-chip").forEach((chip) => {
    if (set.has(chip.querySelector(".player-chip__name").textContent)) {
      const i = chip.querySelector("input"); i.checked = true; i.dispatchEvent(new w.Event("change", { bubbles: true }));
    }
  });
}
async function genereer(w, d) { await klik(w, d.getElementById("tab-btn-team")); await klik(w, d.getElementById("btn-generate")); await wait(450); }

const txt = (d, sel) => (d.querySelector(sel) ? d.querySelector(sel).textContent.replace(/\s+/g, " ").trim() : "");
const getal = (t) => Number(String(t).replace("'", "").replace(",", ".").replace("+", ""));
const som = (d) => [...d.querySelectorAll(".data-table tbody tr")].reduce((s, tr) => { const td = tr.querySelectorAll("td")[3]; return s + (td.dataset.min !== undefined ? Number(td.dataset.min) : getal(td.textContent)); }, 0);
const aantalBlokken = (d) => Number((txt(d, ".mk-blockbar strong").match(/van (\d+)/) || [])[1]);

async function main() {
  const store = {};
  const { w, d } = await boot(store);
  kies(w, d, NAMEN); await wait(40);
  await genereer(w, d);

  console.log("=== TEST: na genereren zie je de blokken één voor één ===");
  check(d.getElementById("screen-results").classList.contains("is-active"), "we zitten op het tabblad Opstelling");
  check(/^Blok 1 van \d+/.test(txt(d, ".mk-blockbar strong")), `bovenaan staat 'Blok 1 van N' (${txt(d, ".mk-blockbar strong")})`);
  const N = aantalBlokken(d);
  check(N >= 3, `er zijn ${N} blokken`);
  check(d.querySelectorAll(".block-card").length === 1, "er is maar één blok tegelijk zichtbaar");
  check(d.getElementById("au-prev").disabled, "'Vorig blok' staat uit bij blok 1");
  check(!!d.getElementById("au-next"), "'Volgend blok' bestaat");
  check(!d.getElementById("au-add"), "geen 'Nieuw blok'-knop (de opstelling is al compleet)");
  check(d.querySelectorAll(".mk-slot").length === 10, "10 veldposities");
  check(d.querySelectorAll("[data-mk-bench]").length === NAMEN.length - 10, "de rest staat op de bank");
  check(d.querySelectorAll(".data-table tbody tr").length === NAMEN.length, "minutenoverzicht staat onder het blok");
  check(d.querySelectorAll(".mk-check-svg").length === 0 && !d.querySelector(".mk-tag"), "oude stijl: geen minuten-tags/vinkjes onder de namen (Opstelling blijft zoals het was)");
  check(d.querySelector(".data-table td.diff-ok, .data-table td.diff-orange, .data-table td.diff-red"), "oude Verschil-kolom (vinkje/oranje/rood) is behouden");
  check(Math.abs(som(d) - 900) < 0.01, "minutenoverzicht telt op tot 900");
  const rechtOpCellen = [...d.querySelectorAll(".data-table tbody tr")].map((tr) => tr.querySelectorAll("td")[2].textContent.trim());
  check(rechtOpCellen.every((t) => /^\d+'$/.test(t)), `'Recht op' staat overal als heel getal in de Opstelling-tabel (${rechtOpCellen.slice(0, 3).join(" ")} ...)`);

  const veldNamenNu = () => [...d.querySelectorAll(".mk-slot")].map((g) => g.querySelector(".mk-chip-name").textContent);
  const origineel = veldNamenNu().join(",");

  console.log("\n=== TEST: navigeren en wissels per blok ===");
  await klik(w, d.getElementById("au-next"));
  check(/^Blok 2 van/.test(txt(d, ".mk-blockbar strong")), "volgend blok = blok 2");
  check(d.querySelectorAll(".wissel-row").length >= 1, "bij blok 2 staan de wissels");
  check(!d.getElementById("au-prev").disabled, "'Vorig blok' werkt nu");
  await klik(w, d.getElementById("au-prev"));
  check(/^Blok 1 van/.test(txt(d, ".mk-blockbar strong")), "terug naar blok 1");

  console.log("\n=== TEST: de computer houdt zich bij het maken aan zijn regels ===");
  await klik(w, d.getElementById("au-finish"));
  const kaarten = [...d.querySelectorAll(".mk-summary-block")];
  check(kaarten.length === N, `overzicht toont alle ${N} blokken onder elkaar`);
  let maxMoment = 0, max2 = true;
  kaarten.forEach((k) => {
    k.querySelectorAll(".wissel-moment").forEach((mm) => {
      const m = getal(mm.querySelector(".wissel-moment__min").textContent.replace("Minuut", "").trim());
      maxMoment = Math.max(maxMoment, m);
      if (m !== 45 && mm.querySelectorAll(".wissel-row").length > 2) max2 = false;
    });
  });
  check(maxMoment <= 80, `geen enkele automatische wissel na minuut 80 (laatste: ${maxMoment})`);
  const geplandeMomenten = [];
  kaarten.forEach((k) => k.querySelectorAll(".wissel-moment__min").forEach((e) => geplandeMomenten.push(getal(e.textContent.replace("Minuut", "").trim()))));
  check(geplandeMomenten.length > 0 && geplandeMomenten.every((m) => m % 5 === 0), `de computer wisselt alleen op hele 5 minuten, nooit op 2,5 (${[...new Set(geplandeMomenten)].sort((a, b) => a - b).join(", ")})`);
  check(geplandeMomenten.every((m) => m === 45 || Math.abs(m - 45) >= 10), "en nooit vlak voor of na de rust (geen 40 of 50)");
  check(max2, "nooit meer dan 2 wissels op hetzelfde moment (buiten de rust)");
  check(!!d.getElementById("au-optimize") && !!d.getElementById("au-print"), "overzicht heeft 'Verdeel eerlijk' en 'Opslaan / printen'");
  await klik(w, d.getElementById("au-back-edit"));
  check(!!d.getElementById("au-prev"), "'Terug naar bewerken' brengt je terug");

  console.log("\n=== TEST: wisselmomenten per 2,5 min, ook na minuut 80 ===");
  for (let i = 0; i < N - 1; i++) await klik(w, d.getElementById("au-next"));
  check(/^Blok \d+ van/.test(txt(d, ".mk-blockbar strong")) && !d.getElementById("au-next"), "we staan in het laatste blok");
  const eerstePijl = () => d.querySelector('.wissel-row [data-mk-dir="1"]');
  const momentNu = () => getal(txt(d, ".wissel-moment__min").replace("Minuut", ""));
  const start = momentNu();
  await klik(w, eerstePijl());
  const na1 = momentNu();
  check(na1 - start === 2.5, `één klik op ▶ schuift precies 2,5 min later (${start} -> ${na1})`);
  for (let i = 0; i < 14; i++) await klik(w, eerstePijl());
  check(momentNu() > 80, `de gebruiker mag wél na minuut 80 wisselen (komt op ${momentNu()})`);
  await klik(w, d.querySelector('.wissel-row [data-mk-dir="-1"]'));
  check(Math.abs(som(d) - 900) < 0.01, "minutenoverzicht telt na het verschuiven nog steeds op tot 900");

  console.log("\n=== TEST: de gebruiker mag wél op 2,5, 40 en 50 wisselen (alleen de computer niet) ===");
  {
    // Ga naar het blok dat op minuut 45 begint (daar wordt in elk gegenereerd plan gewisseld)
    for (let i = 0; i < N + 2 && !d.getElementById("au-prev").disabled; i++) await klik(w, d.getElementById("au-prev")); // eerst naar blok 1
    for (let i = 0; i < N + 2 && !/^45'/.test(txt(d, ".mk-blockbar__range")) && d.getElementById("au-next"); i++) await klik(w, d.getElementById("au-next"));
    const rangeNu = txt(d, ".mk-blockbar__range");
    check(/^45'/.test(rangeNu) && d.querySelectorAll(".wissel-row").length > 0, `we staan in het blok dat op 45 begint (${rangeNu}) en daar wordt gewisseld`);
    const eersteMoment = () => getal(txt(d, ".wissel-moment__min").replace("Minuut", ""));
    const naar = async (doel) => {
      for (let i = 0; i < 14 && eersteMoment() !== doel; i++) {
        const richting = eersteMoment() < doel ? "1" : "-1";
        await klik(w, d.querySelector(`.wissel-row [data-mk-dir="${richting}"]`));
      }
      return eersteMoment();
    };
    check(await naar(40) === 40, "de gebruiker kan een wissel op 40 zetten (voor de computer verboden)");
    check(await naar(50) === 50, "en op 50 (ook verboden voor de computer)");
    check(await naar(47.5) === 47.5, "en op een halve minuut zoals 47,5");
    check(Math.abs(som(d) - 900) < 0.01, "het minutenoverzicht blijft kloppen (900)");
    // Terug naar blok 1 voor de volgende tests
    for (let i = 0; i < N + 2 && d.getElementById("au-prev") && !d.getElementById("au-prev").disabled; i++) await klik(w, d.getElementById("au-prev"));
    check(/^Blok 1 van/.test(txt(d, ".mk-blockbar strong")), "terug in blok 1");
  }

  console.log("\n=== TEST: alle soorten wissels maken ===");
  await klik(w, d.getElementById("au-prev")); // blok N-1
  for (let i = 0; i < N - 2; i++) await klik(w, d.getElementById("au-prev"));
  check(/^Blok 1 van/.test(txt(d, ".mk-blockbar strong")), "terug in blok 1");
  const veldNamen = () => [...d.querySelectorAll(".mk-slot")].map((g) => g.querySelector(".mk-chip-name").textContent);
  const bankNamen = () => [...d.querySelectorAll("[data-mk-bench]")].map((b) => b.dataset.mkBench);

  // (a) bank eerst, dan veld
  const bank1 = bankNamen()[0], veld1 = veldNamen()[0];
  await klik(w, d.querySelector(`[data-mk-bench="${bank1}"]`));
  await klik(w, d.querySelector('[data-mk-slot="lb"]'));
  check(veldNamen().includes(bank1) && !veldNamen().includes(veld1), `bank->veld: ${bank1} staat erin, ${veld1} is eruit`);
  check(bankNamen().includes(veld1), `${veld1} staat nu op de bank`);
  check(Math.abs(som(d) - 900) < 0.01, "totaal blijft 900");

  // (b) veld eerst, dan bank
  const veldVoor = veldNamen()[3], bankVoor = bankNamen()[1];
  await klik(w, d.querySelector('[data-mk-slot="cm1"]'));
  check(!!d.querySelector(".mk-slot.is-picked"), "veldspeler wordt gemarkeerd als opgepakt");
  await klik(w, d.querySelector(`[data-mk-bench="${bankVoor}"]`));
  check(veldNamen().includes(bankVoor) && bankNamen().includes(veldVoor), `veld->bank: ${bankVoor} erin, ${veldVoor} eruit`);

  // (c) veld <-> veld
  const a = veldNamen()[1], b = veldNamen()[6];
  await klik(w, d.querySelector('[data-mk-slot="sp"]'));
  await klik(w, d.querySelector('[data-mk-slot="la"]'));
  check(veldNamen()[1] === b && veldNamen()[6] === a, `veld<->veld: ${a} en ${b} wisselen van plek`);

  // (d) '!' bij een positie waar iemand niets mee kan
  const PL = w.eval("PLAYERS");
  const heeftNiets = (naam, pos) => { const p = PL[naam]; const bsp = pos.replace(/\d/, ""); return !(p.favourite.includes(bsp) || p.alternative.includes(bsp) || p.emergency.includes(bsp)); };
  let gedaan = false;
  for (const naam of bankNamen()) {
    const slot = ["cv1","la","ra","lb","rb","sp","cm1"].find((pos) => heeftNiets(naam, pos));
    if (!slot) continue;
    const warnVoor = d.querySelectorAll(".pitch-warn").length;
    await klik(w, d.querySelector(`[data-mk-bench="${naam}"]`));
    await klik(w, d.querySelector(`[data-mk-slot="${slot}"]`));
    check(d.querySelectorAll(".pitch-warn").length === warnVoor + 1, `'!' verschijnt bij ${naam} op ${slot.replace(/\d/,"")} (daar kan hij niets mee)`);
    gedaan = true; break;
  }
  check(gedaan, "een '!'-situatie kon worden getest");

  console.log("\n=== TEST: blokduur aanpassen (de blokgrens verschuift mee) ===");
  const dur0 = getal(d.getElementById("au-duration").value);
  await klik(w, d.querySelector('[data-mk-dur-step="2.5"]'));
  check(getal(d.getElementById("au-duration").value) === dur0 + 2.5, `+ maakt blok 1 langer (${dur0} -> ${getal(d.getElementById("au-duration").value)})`);
  check(txt(d, ".mk-total").includes("90/90"), "totaal blijft 90/90 (het volgende blok geeft tijd af)");
  check(Math.abs(som(d) - 900) < 0.01, "minutenoverzicht blijft 900");
  const inp = d.getElementById("au-duration");
  inp.value = "20,0"; inp.dispatchEvent(new w.Event("change", { bubbles: true })); await wait(30);
  check(getal(d.getElementById("au-duration").value) === 20, "typen van '20,0' (met komma) werkt");
  check(txt(d, ".mk-total").includes("90/90"), "totaal blijft nog steeds 90/90");

  console.log("\n=== TEST: bewerkingen blijven bewaard na verversen ===");
  const lineupVoor = veldNamen().join(",");
  const durVoor = d.getElementById("au-duration").value;
  const { w: w2, d: d2 } = await boot({ ...store });
  await klik(w2, d2.getElementById("tab-btn-results"));
  const veld2 = [...d2.querySelectorAll(".mk-slot")].map((g) => g.querySelector(".mk-chip-name").textContent).join(",");
  check(/^Blok 1 van/.test(txt(d2, ".mk-blockbar strong")), "na verversen staat de bewerkte opstelling er nog");
  check(veld2 === lineupVoor, "de handmatige wissels zijn bewaard");
  check(d2.getElementById("au-duration").value === durVoor, "de aangepaste blokduur is bewaard");

  console.log("\n=== TEST: opstelling van een eerdere versie (zonder bewerkbaar model) wordt omgezet ===");
  const oud = JSON.parse(store["opstelling-app-state-v1"]);
  delete oud.auto;
  const { w: w3, d: d3 } = await boot({ "opstelling-app-state-v1": JSON.stringify(oud) });
  await klik(w3, d3.getElementById("tab-btn-results"));
  check(/^Blok 1 van/.test(txt(d3, ".mk-blockbar strong")), "oude opgeslagen opstelling opent gewoon als bewerkbare opstelling");
  check(w3.__errors.length === 0, "zonder JS-fouten");

  console.log("\n=== TEST: 'Verdeel eerlijk' op de Opstelling respecteert de 80-minutenregel ===");
  await klik(w, d.getElementById("au-finish"));
  await klik(w, d.getElementById("au-optimize"));
  check(!!d.querySelector(".banner--info"), "melding over wat er gebeurd is");
  let mm2 = 0;
  d.querySelectorAll(".wissel-moment__min").forEach((e) => { mm2 = Math.max(mm2, getal(e.textContent.replace("Minuut", ""))); });
  check(mm2 <= 80, `de computer wisselt na 'Verdeel eerlijk' nog steeds niet na minuut 80 (${mm2})`);
  const naKnop = [...d.querySelectorAll(".wissel-moment__min")].map((e) => getal(e.textContent.replace("Minuut", "")));
  check(naKnop.every((m) => m % 5 === 0 && (m === 45 || Math.abs(m - 45) >= 10)), "ook na 'Verdeel eerlijk': alleen hele 5 minuten en niet vlak bij de rust");
  check(Math.abs(som(d) - 900) < 0.01, "totaal blijft 900");

  console.log("\n=== TEST: opnieuw genereren geeft weer een verse opstelling ===");
  await genereer(w, d);
  check(/^Blok 1 van/.test(txt(d, ".mk-blockbar strong")), "na 'Genereer opstelling' begin je weer bij blok 1 van een nieuw plan");
  check(veldNamen().join(",") === origineel, "de handmatige bewerkingen zijn weg: je ziet weer exact het oorspronkelijke, door de computer gemaakte blok 1");
  check(veldNamen().join(",") !== lineupVoor, "en dus niet meer het bewerkte blok 1");

  console.log("\n=== TEST: geen JS-fouten ===");
  check(w.__errors.length === 0, `geen JS-fouten (${w.__errors.length})`);
  w.__errors.slice(0, 3).forEach((e) => console.log("   ", String(e).split("\n")[0]));

  console.log("\n===================================");
  console.log(fails === 0 ? "✅ De Opstelling is net zo bewerkbaar als Eigen." : `❌ ${fails} check(s) gefaald.`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
