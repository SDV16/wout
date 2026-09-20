// Twee gerichte tests die zich niet goed lenen voor de generieke UI-flow:
// - Ketendetectie vereist een heel specifiek, handgeconstrueerd scenario.
// - De ongecapte-score-fix wordt geverifieerd tegen een eerder in deze
//   samenwerking vastgelegd referentiescenario (Xander/Stijn), zodat een
//   regressie op dat exacte, al eens problematische geval meteen opvalt.

const { PLAYERS } = require("../js/data.js");
const Logic = require("../js/logic.js");
const Subs = require("../js/substitutions.js");

let fails = 0;
function check(cond, msg) {
  if (!cond) { fails++; console.log("  ❌ " + msg); }
  else console.log("  ✅ " + msg);
}

console.log("=== TEST: ketendetectie bij een indirecte positieverschuiving ===");
{
  // Nord komt erin en de optimalisatie zet 'm op RA; Chris (blijver) schuift
  // daardoor van RA naar LA, en Dinand (die op LA stond) gaat eruit.
  // Verwacht in de weergave: Nord (ra) -> Dinand (la) [Chris ra -> la]
  const dummyPos = { sp: "S1", cm1: "S2", cm2: "S3", cm3: "S4", lb: "S5", rb: "S6", cv1: "S7", cv2: "S8" };
  const schedulePrev = { ...dummyPos, ra: "Chris", la: "Dinand" };
  const scheduleNow = { ...dummyPos, ra: "Nord", la: "Chris" };
  const blocks = [["0-45", 45], ["45-90", 45]];
  const schedule = { "0-45": schedulePrev, "45-90": scheduleNow };
  const targets = {}, mins = {};
  for (const sp of new Set([...Object.values(schedulePrev), ...Object.values(scheduleNow)])) {
    targets[sp] = 45; mins[sp] = 45;
  }

  const timeline = Subs.computeFullTimeline(blocks, schedule, targets, mins, PLAYERS);
  const view = timeline.blockViews[1];
  const pair = view.pairs.find(([i, o]) => i === "Nord" && o === "Dinand");

  check(!!pair, "paar Nord->Dinand wordt gevonden");
  if (pair) {
    const [, , posI, keten] = pair;
    check(posI === "ra", `Nord staat op 'ra' (kreeg '${posI}')`);
    check(!!keten, "er wordt een keten gedetecteerd");
    if (keten) {
      check(keten.naam === "Chris", `ketenspeler is Chris (kreeg '${keten.naam}')`);
      check(keten.van === "ra" && keten.naar === "la", `Chris verschuift ra -> la (kreeg '${keten.van}' -> '${keten.naar}')`);
    }
  }
}

console.log("\n=== TEST: gecapte speler bereikt nu (bijna) zijn harde cap i.p.v. voortijdig te worden gedeprioriteerd ===");
{
  // Exact het scenario dat eerder in dit gesprek -15/-15 gaf, later -5/0
  // na de eerste fix, en nu met de ongecapte-score-referentie opnieuw
  // gecontroleerd op (in elk geval geen) regressie.
  const selectie = ["Collin","Wout","Jaimy","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens","Roef","Chris"];
  const trainingCounts = {}; for (const p of selectie) trainingCounts[p] = 2;
  trainingCounts["Sietse"] = 1;
  const priorityFlags = {}; for (const p of selectie) priorityFlags[p] = false;
  const maxMinutes = {}; for (const p of selectie) maxMinutes[p] = 90;
  maxMinutes["Xander"] = 45; maxMinutes["Stijn"] = 45; maxMinutes["Jens"] = 60;
  const availabilityFlags = {}; for (const p of selectie) availabilityFlags[p] = { first: false, second: false };

  const positionsOrder = Logic.computeDynamicPositionOrder(selectie, PLAYERS);
  const ctx = { PLAYERS, positionsOrder, availabilityFlags, maxMinutes, failureLog: [], bonus0: 20, bonus1: 10 };
  const res = Logic.chooseBestBlocks(selectie, trainingCounts, priorityFlags, maxMinutes, ctx);

  check(res !== null, "opstelling gevonden voor het referentiescenario");
  if (res) {
    const diffXander = res.mins["Xander"] - res.targets["Xander"];
    const diffStijn = res.mins["Stijn"] - res.targets["Stijn"];
    console.log(`  (Xander: recht-op=${res.targets["Xander"]}, gekregen=${res.mins["Xander"]}, verschil=${diffXander})`);
    console.log(`  (Stijn:  recht-op=${res.targets["Stijn"]}, gekregen=${res.mins["Stijn"]}, verschil=${diffStijn})`);
    check(Math.abs(diffXander) <= 5, `Xander's afwijking blijft <= 5 min (kreeg ${diffXander})`);
    check(Math.abs(diffStijn) <= 5, `Stijn's afwijking blijft <= 5 min (kreeg ${diffStijn})`);
  }
}


console.log("\n=== TEST: gecapte speler haalt zijn volledige cap (praktijkgeval Jaimy 2) ===");
{
  // Exact het gerapporteerde scenario: "Jaimy 2" heeft ongecapt recht op 65
  // maar is gecapt op 45, en deelt de enige SP-plek met Jaimy. Voorheen
  // strandde hij op 35-37.5 (-30 t.o.v. zijn echte recht) omdat de zoektocht
  // dat als "maar -10 t.o.v. de cap" zag en geen alternatief zocht.
  const testPlayers = { ...PLAYERS,
    "Luciano": { favourite: ["cm"], alternative: [], emergency: [] },
    "Jaimy 2": { favourite: ["sp"], alternative: [], emergency: [] },
  };
  const selectie = ["Luciano","Jorra","Tycho","Roef","Collin","Nord","Pelle","Dinand","Xander","Wout","Stijn","Jaimy","Jaimy 2","Chris"];
  const trainingCounts = {}; for (const p of selectie) trainingCounts[p] = 2;
  trainingCounts["Chris"] = 1;
  const priorityFlags = {}; for (const p of selectie) priorityFlags[p] = false;
  priorityFlags["Roef"] = true;
  const maxMinutes = {}; for (const p of selectie) maxMinutes[p] = 90;
  maxMinutes["Jaimy 2"] = 45;
  const availabilityFlags = {}; for (const p of selectie) availabilityFlags[p] = { first: false, second: false };

  const positionsOrder = Logic.computeDynamicPositionOrder(selectie, testPlayers);
  const ctx = { PLAYERS: testPlayers, positionsOrder, availabilityFlags, maxMinutes, failureLog: [], bonus0: 15, bonus1: 10 };
  const res = Logic.chooseBestBlocks(selectie, trainingCounts, priorityFlags, maxMinutes, ctx);

  check(res !== null, "opstelling gevonden");
  if (res) {
    console.log(`  (Jaimy 2: recht-op=${res.targets["Jaimy 2"]} (ongecapt 65), gekregen=${res.mins["Jaimy 2"]})`);
    check(res.targets["Jaimy 2"] === 45, "'Recht op' toont het GECAPTE getal (45)");
    check(res.mins["Jaimy 2"] >= 45 - 0.01, `Jaimy 2 haalt zijn volledige cap van 45 (kreeg ${res.mins["Jaimy 2"]})`);
  }
}

console.log(`\n===================================`);
if (fails === 0) {
  console.log("✅ Ketendetectie en score-referentie werken zoals bedoeld.");
  process.exit(0);
} else {
  console.log(`❌ ${fails} check(s) gefaald.`);
  process.exit(1);
}
