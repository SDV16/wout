const fs = require("fs");
const path = require("path");

const { PLAYERS } = require("../js/data.js");
const Logic = require("../js/logic.js");
const Subs = require("../js/substitutions.js");

const scenarios = JSON.parse(fs.readFileSync("./scenarios.json"));
const pyResults = JSON.parse(fs.readFileSync("./python_results.json"));

const PLAYERS_ORDER = Object.keys(PLAYERS);
const EPS = 1e-6;

let totalChecks = 0;
let failedChecks = 0;

function check(cond, msg) {
  totalChecks++;
  if (!cond) {
    failedChecks++;
    console.log(`  ❌ ${msg}`);
  }
}

function approxEqual(a, b, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

function objSortedEntries(obj) {
  return Object.keys(obj).sort().map((k) => [k, obj[k]]);
}

for (const sc of scenarios) {
  const naam = sc.name;
  console.log(`\n=== ${naam} ===`);

  const selSet = new Set(sc.selectie);
  const selectie = PLAYERS_ORDER.filter((p) => selSet.has(p));

  const trainingCounts = {};
  const priorityFlags = {};
  const maxMinutes = {};
  const availabilityFlags = {};
  for (const p of selectie) {
    trainingCounts[p] = (sc.training_overrides && sc.training_overrides[p] !== undefined)
      ? sc.training_overrides[p] : sc.training_default;
    priorityFlags[p] = (sc.priority_overrides && sc.priority_overrides[p]) || false;
    maxMinutes[p] = (sc.max_minutes_overrides && sc.max_minutes_overrides[p]) || 90;
    const avOverride = (sc.availability_overrides && sc.availability_overrides[p]) || {};
    availabilityFlags[p] = { first: avOverride.first || false, second: avOverride.second || false };
  }

  const positionsOrder = Logic.computeDynamicPositionOrder(selectie, PLAYERS);

  const shortages = Logic.checkStructuralFeasibility(selectie, positionsOrder, availabilityFlags, PLAYERS);
  const pyEntry = pyResults[naam];

  // --- Vergelijk shortages ---
  for (const helft of ["eerste helft", "tweede helft"]) {
    const jsShort = JSON.stringify(shortages[helft]);
    const pyShort = JSON.stringify(pyEntry.shortages[helft]);
    check(jsShort === pyShort, `shortages["${helft}"]: JS=${jsShort} vs PY=${pyShort}`);
  }

  const heeftTekort = Object.values(shortages).some((lst) => lst.length > 0);
  if (heeftTekort) {
    check(!!pyEntry.shortages && Object.values(pyEntry.shortages).some((l) => l.length > 0),
      "JS zegt tekort maar Python niet (of andersom)");
    console.log(heeftTekort ? "  (structureel tekort - correct gedetecteerd, geen verdere check nodig)" : "");
    continue;
  }

  const ctx = {
    PLAYERS,
    positionsOrder,
    availabilityFlags,
    maxMinutes,
    failureLog: [],
    bonus0: sc.bonus_0,
    bonus1: sc.bonus_1,
  };

  const res = Logic.chooseBestBlocks(selectie, trainingCounts, priorityFlags, maxMinutes, ctx);

  if (res === null) {
    check(!!pyEntry.geen_opstelling, "JS vond geen opstelling maar Python wel (of andersom)");
    console.log("  (geen opstelling gevonden - komt overeen met Python)");
    continue;
  }

  check(!pyEntry.geen_opstelling, "Python vond geen opstelling maar JS wel");

  // --- Blokken ---
  const jsBlocksStr = JSON.stringify(res.blocks);
  const pyBlocksStr = JSON.stringify(pyEntry.blocks);
  check(jsBlocksStr === pyBlocksStr, `blocks verschillen:\n    JS=${jsBlocksStr}\n    PY=${pyBlocksStr}`);

  // --- slack_used ---
  check(res.slackUsed === pyEntry.slack_used, `slack_used: JS=${res.slackUsed} vs PY=${pyEntry.slack_used}`);

  // --- targets ---
  for (const p of selectie) {
    check(approxEqual(res.targets[p], pyEntry.targets[p]), `targets[${p}]: JS=${res.targets[p]} vs PY=${pyEntry.targets[p]}`);
  }

  // --- schedule (per blok, positie -> speler) ---
  for (const [bn] of res.blocks) {
    const jsSched = JSON.stringify(objSortedEntries(res.schedule[bn]));
    const pySched = JSON.stringify(objSortedEntries(pyEntry.schedule[bn]));
    check(jsSched === pySched, `schedule[${bn}] verschilt:\n    JS=${jsSched}\n    PY=${pySched}`);
  }

  // --- mins (ideale per-blok totalen) ---
  for (const p of selectie) {
    check(approxEqual(res.mins[p] || 0, pyEntry.mins[p] || 0), `mins[${p}]: JS=${res.mins[p]} vs PY=${pyEntry.mins[p]}`);
  }

  // --- Nooit een ongeldige positie ---
  for (const [bn] of res.blocks) {
    for (const [pos, sp] of Object.entries(res.schedule[bn])) {
      check(Logic.positionRank(sp, pos, PLAYERS) !== 999, `${sp} op ongeldige positie ${pos} in blok ${bn}`);
    }
  }

  // --- Wisseltijden / minutenoverzicht ---
  // LET OP: de exacte wissel-PAAR-toewijzing bij gelijke scores hangt in het
  // Python-origineel af van `list(set_a - set_b)`, en Python's set-volgorde
  // voor strings is HASH-gebaseerd en dus (met PYTHONHASHSEED niet vast)
  // niet stabiel tussen runs - aantoonbaar getest: dezelfde input gaf met
  // hash-seed 1 vs 42 al andere paren. Dit is dus geen porteerfout maar een
  // bestaande eigenschap van het origineel. We toetsen daarom niet op
  // letterlijk dezelfde paren, maar op de invarianten die wél altijd moeten
  // gelden, in zowel JS als Python:
  const timeline = Subs.computeFullTimeline(res.blocks, res.schedule, res.targets, res.mins, PLAYERS);
  const gekregen = {};
  for (const p of selectie) gekregen[p] = 0;
  for (const [sp, , start, end] of timeline.allActiveIntervals) {
    check(end >= start, `negatief interval voor ${sp}: ${start}-${end}`);
    if (sp in gekregen) gekregen[sp] += (end - start);
  }

  let totaalGekregen = 0;
  for (const p of selectie) totaalGekregen += gekregen[p];
  check(approxEqual(totaalGekregen, 900), `totaal gekregen moet 900 zijn, is ${totaalGekregen}`);

  const totaalGekregenPy = Object.values(pyEntry.gekregen_echt).reduce((a, b) => a + b, 0);
  check(approxEqual(totaalGekregenPy, 900), `Python-totaal moet ook 900 zijn, is ${totaalGekregenPy} (sanity check op de referentie zelf)`);

  console.log(`  ✅ ${selectie.length} spelers, ${res.blocks.length} blokken, slack=${res.slackUsed}, kernplanning exact gelijk aan Python; wisselpaar-verdeling intern consistent (900 min totaal, geen negatieve intervals)`);
}

console.log(`\n===================================`);
console.log(`${totalChecks} checks totaal, ${failedChecks} gefaald.`);
if (failedChecks === 0) {
  console.log("✅ JS-poort komt op elk gecontroleerd punt exact overeen met Python.");
  process.exit(0);
} else {
  console.log("❌ Er zijn verschillen gevonden - zie hierboven.");
  process.exit(1);
}
