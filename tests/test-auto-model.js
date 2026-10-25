const M = require("../js/manual-lineup.js");
global.ManualLineup = M;
const { PLAYERS } = require("../js/data.js");
const Logic = require("../js/logic.js");
const A = require("../js/auto-lineup.js");
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log("  ❌ " + m); } else console.log("  ✅ " + m); }

console.log("=== TEST: blokduur aanpassen, met compensatie (blokgrens verschuiven) ===");
{
  const mk = () => [{ minutes: 22.5 }, { minutes: 22.5 }, { minutes: 22.5 }, { minutes: 22.5 }].map((b) => ({ ...b, lineup: {} }));
  let b = mk();
  M.resizeBlock(b, 0, 25, true);
  check(b[0].minutes === 25 && b[1].minutes === 20, "blok 1 -> 25 maakt blok 2 automatisch 20");
  check(M.totalMinutes(b) === 90, "totaal blijft 90");

  b = mk();
  M.resizeBlock(b, 3, 20, true);
  check(b[3].minutes === 20 && b[2].minutes === 25, "laatste blok korter -> het vorige blok krijgt de tijd");

  b = mk();
  M.resizeBlock(b, 0, 80, true);
  check(b[1].minutes === 2.5 && b[0].minutes === 42.5, "buurblok wordt nooit korter dan 2,5 min (gekapt)");
  check(M.totalMinutes(b) === 90, "ook dan blijft het totaal 90");

  b = mk();
  M.resizeBlock(b, 0, "abc", true);
  check(b[0].minutes === 22.5, "ongeldige invoer verandert niets");

  b = mk();
  M.resizeBlock(b, 0, 30, false);
  check(b[0].minutes === 22.5, "zonder compensatie: kan niet boven 90 totaal (blok blijft 22,5)");
  b = [{ minutes: 22.5, lineup: {} }];
  M.resizeBlock(b, 0, 30, false);
  check(b[0].minutes === 30, "zonder compensatie: een los blok mag wel langer");
}

console.log("\n=== TEST: wisselmomenten schuiven mee met de blokgrens ===");
{
  const oud = [{ minutes: 45 }, { minutes: 45 }];
  const nieuw = [{ minutes: 50 }, { minutes: 40 }];
  const r = M.rebaseOverrides(oud, nieuw, { 1: { "a>b": 52.5, "c>d": 40 } });
  check(r[1]["a>b"] === 57.5, "wissel 7,5 min na de grens blijft 7,5 min na de (nieuwe) grens");
  check(r[1]["c>d"] === 45, "wissel 5 min vóór de grens blijft 5 min vóór de (nieuwe) grens");
  const r2 = M.rebaseOverrides(oud, [{ minutes: 10 }, { minutes: 80 }], { 1: { "x>y": 90 } });
  check(r2[1]["x>y"] <= 90 && r2[1]["x>y"] >= 0, "wordt nooit buiten de aangrenzende blokken gezet");
}

console.log("\n=== TEST: 80-minutenregel voor de computer (discriminerend) ===");
{
  // Eén wissel op minuut 80 (blokken 80 + 10). 'a1' wil veel meer minuten
  // (recht op 90), 'z1' juist minder: zonder grens schuift de computer de
  // wissel naar achteren (85), met maxMoment=80 moet hij op 80 blijven.
  const POS = M.FIELD_POSITIONS;
  const L = (n) => { const l = {}; POS.forEach((p, i) => (l[p] = n[i])); return l; };
  const base = ["a1","a2","a3","a4","a5","a6","a7","a8","a9","a10"];
  const blocks = [
    { minutes: 80, lineup: L(base) },
    { minutes: 10, lineup: L(["z1", ...base.slice(1)]) },
  ];
  const tg = { a1: 90, z1: 0 }; base.slice(1).forEach((p) => (tg[p] = 90));
  const key = M.pairKey(M.deriveTransition(blocks[0].lineup, blocks[1].lineup).pairs[0]);

  const vrij = M.optimizeMoments(blocks, tg, {});
  const beperkt = M.optimizeMoments(blocks, tg, {}, { maxMoment: 80 });
  const vrijMoment = vrij.overrides[1] ? vrij.overrides[1][key] : 80;
  const beperktMoment = beperkt.overrides[1] ? beperkt.overrides[1][key] : 80;
  check(vrijMoment > 80, `zonder grens schuift de computer de wissel na minuut 80 (naar ${vrijMoment}) - de test heeft dus bijtkracht`);
  check(beperktMoment <= 80, `met maxMoment=80 blijft de wissel op of voor 80 (staat op ${beperktMoment})`);
}

console.log("\n=== TEST: gegenereerde opstelling -> bewerkbaar model ===");
{
  const selectie = ["Collin","Wout","Jaimy","Sjoerd","Pelle","Jorra","Tycho","Nord","Dinand","Sietse","Stijn","Xander","Jens","Roef"];
  const tc = {}, pf = {}, mx = {}, av = {};
  selectie.forEach((p) => { tc[p] = 2; pf[p] = false; mx[p] = 90; av[p] = { first: false, second: false }; });
  mx["Dinand"] = 45;
  const order = Logic.computeDynamicPositionOrder(selectie, PLAYERS);
  const ctx = { PLAYERS, positionsOrder: order, availabilityFlags: av, maxMinutes: mx, failureLog: [], bonus0: 20, bonus1: 10 };
  const res = Logic.chooseBestBlocks(selectie, tc, pf, mx, ctx);
  const result = { type: "ok", selectie, blocks: res.blocks, schedule: res.schedule, targets: res.targets, mins: res.mins, slackUsed: res.slackUsed, trainingCounts: tc, positionsOrder: order, players: PLAYERS };
  const ps = {}; selectie.forEach((p) => (ps[p] = { training: 2, firstHalf: false, secondHalf: false, maxMinutes: mx[p] }));

  const model = A.buildAutoModel(result, ps);
  check(model.blocks.length === res.blocks.length, "evenveel blokken als de generator");
  check(model.blocks.every((b, i) => b.minutes === res.blocks[i][1]), "blokduren zijn overgenomen");
  check(model.blocks.every((b) => Object.values(b.lineup).filter(Boolean).length === 10), "elk blok heeft 10 spelers");
  check(Math.abs(M.totalMinutes(model.blocks) - 90) < 1e-9, "totaal is 90");

  const { minutes } = M.computeMinutes(model.blocks, model.momentOverrides);
  check(Math.abs(Object.values(minutes).reduce((a, b) => a + b, 0) - 900) < 1e-6, "alle speelminuten samen: 900");
  check(minutes["Dinand"] <= 45 + 1e-9, `Dinand (max 45) komt niet boven zijn cap (kreeg ${minutes["Dinand"]})`);

  const alleMomenten = Object.values(model.momentOverrides).flatMap((per) => Object.values(per));
  check(alleMomenten.every((m) => m <= 80), "geen enkele wissel na minuut 80");
  check(alleMomenten.length > 0 && alleMomenten.every((m) => Math.abs(m / 5 - Math.round(m / 5)) < 1e-9), `de computer wisselt alleen op hele 5 minuten (${[...new Set(alleMomenten)].sort((a, b) => a - b).join(", ")})`);
  check(alleMomenten.every((m) => M.isComputerMoment(m)), "en nooit binnen 10 minuten van de rust (geen 40 of 50)");
  const bnd = M.blockBounds(model.blocks);
  const opKommaVijf = bnd.slice(1).filter((b) => Math.abs(b.start / 5 - Math.round(b.start / 5)) > 1e-9);
  console.log(`  (blokgrenzen op 2,5: ${opKommaVijf.length} - die wissels zijn dus allemaal verplaatst naar een hele 5)`);

  const bounds = M.blockBounds(model.blocks);
  let max2 = true;
  for (const [idx, per] of Object.entries(model.momentOverrides)) {
    const tel = {};
    for (const m of Object.values(per)) tel[m] = (tel[m] || 0) + 1;
    for (const [m, c] of Object.entries(tel)) if (c > 2 && Number(m) !== 45) max2 = false;
  }
  check(max2, "nooit meer dan 2 wissels op hetzelfde moment (buiten de rust)");

  const voor = JSON.stringify(res.schedule);
  A.buildAutoModel(result, ps);
  check(JSON.stringify(res.schedule) === voor, "het generatorresultaat zelf wordt niet aangepast");
  const exactVoor = Object.values(result.targets).some((v) => !Number.isInteger(v));
  check(exactVoor, "uitgangspunt: de generator rekent met exacte streefgetallen (kommagetallen)");
  check(selectie.every((p) => Number.isInteger(model.targets[p])), "in het bewerkbare model is 'recht op' een heel getal");
  check(selectie.every((p) => model.targets[p] === Math.round(result.targets[p])), "en wel de nette afronding van het generator-streefgetal");
}

console.log("\n===================================");
console.log(fails === 0 ? "✅ Rekenkant voor de bewerkbare opstelling werkt." : `❌ ${fails} gefaald.`);
process.exit(fails === 0 ? 0 : 1);
