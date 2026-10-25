const M = require("../js/manual-lineup.js");
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log("  ❌ " + m); } else console.log("  ✅ " + m); }

const POS = M.FIELD_POSITIONS;
const L = (namen) => { const l = {}; POS.forEach((p, i) => (l[p] = namen[i])); return l; };
const A = ["a1","a2","a3","a4","a5","a6","a7","a8","a9","a10"];
const alleMomenten = (res) => Object.values(res.overrides).flatMap((per) => Object.values(per));
const eps = 1e-9;

// Regels voor de computer, getoetst op een willekeurig resultaat
function controleerRegels(blocks, res, label, maxMoment) {
  const bounds = M.blockBounds(blocks);
  let opGrid = true, buitenZone = true, max2 = true, venster = true, bestaand = true, naMax = true;
  const tel = {};
  for (const [idx, per] of Object.entries(res.overrides)) {
    const i = Number(idx);
    const keys = new Set(M.deriveTransition(blocks[i - 1].lineup, blocks[i].lineup).pairs.map(M.pairKey));
    for (const [key, m] of Object.entries(per)) {
      if (!keys.has(key)) bestaand = false;
      if (Math.abs(m / 5 - Math.round(m / 5)) > eps) opGrid = false;
      if (Math.abs(m - 45) > eps && Math.abs(m - 45) < 10 - eps) buitenZone = false;
      if (Math.abs(m - bounds[i].start) > 10 + eps) venster = false;
      if (maxMoment !== undefined && m > maxMoment + eps) naMax = false;
      tel[m] = (tel[m] || 0) + 1;
    }
  }
  for (const [m, c] of Object.entries(tel)) if (Number(m) !== 45 && c > 2) max2 = false;
  check(opGrid, `${label}: alleen hele 5 minuten (nooit op 2,5)`);
  check(buitenZone, `${label}: geen wissel tussen minuut 35 en 55 (behalve de rust)`);
  check(max2, `${label}: nooit meer dan 2 wissels op hetzelfde moment (buiten de rust)`);
  check(venster, `${label}: binnen 10 min van de blokgrens`);
  check(bestaand, `${label}: alleen bestaande wissels krijgen een tijdstip`);
  if (maxMoment !== undefined) check(naMax, `${label}: geen wissel na minuut ${maxMoment}`);
}

console.log("=== TEST: de computer rekent per 5 minuten, ook als de blokgrens op 2,5 valt ===");
const blocks4 = [
  { minutes: 22.5, lineup: L(["a1","a2","a3","a4","a5","a6","a7","a8","a9","a10"]) },
  { minutes: 22.5, lineup: L(["b1","a2","a3","b2","a5","a6","a7","b3","a9","a10"]) },
  { minutes: 22.5, lineup: L(["b1","c1","a3","b2","c2","a6","a7","b3","c3","a10"]) },
  { minutes: 22.5, lineup: L(["b1","c1","a1","b2","c2","a4","a7","b3","c3","a10"]) },
];
const sp4 = [...new Set(blocks4.flatMap((b) => Object.values(b.lineup)))];
const tg4 = {}; sp4.forEach((p) => (tg4[p] = 900 / sp4.length));
const voor = JSON.stringify(blocks4);
const r4 = M.optimizeMoments(blocks4, tg4, {});
controleerRegels(blocks4, r4, "4x22,5");
const { minutes: min4 } = M.computeMinutes(blocks4, r4.overrides);
check(Math.abs(Object.values(min4).reduce((a, b) => a + b, 0) - 900) < 1e-6, "totaal blijft exact 900 minuten");
check(JSON.stringify(blocks4) === voor, "opstellingen zelf zijn niet gewijzigd");
check(r4.veranderd === alleMomenten(r4).length && r4.veranderd > 0, "elke wissel op een blokgrens van 22,5 / 67,5 is verplaatst naar een 5-minuten-moment");
check(JSON.stringify(r4.overrides) === JSON.stringify(M.optimizeMoments(blocks4, tg4, {}).overrides), "deterministisch: twee keer draaien geeft hetzelfde");

console.log("\n=== TEST: niet vlak voor of na de rust (35-55) ===");
{
  // Blokgrens op 40: 20 + 20 | 5 | 45  -> de computer mag niet op 40 wisselen
  const bl = [
    { minutes: 40, lineup: L(A) },
    { minutes: 5, lineup: L(["z1", ...A.slice(1)]) },
    { minutes: 45, lineup: L(["z1", ...A.slice(1)]) },
  ];
  const sp = [...A, "z1"]; const tg = {}; sp.forEach((p) => (tg[p] = 80));
  const r = M.optimizeMoments(bl, tg, {});
  const m = alleMomenten(r)[0];
  check(m !== undefined && m !== 40, `een wissel op blokgrens 40 wordt verplaatst (staat nu op ${m})`);
  check(m === 35 || m === 45, `en wel naar 35 of 45, de dichtstbijzijnde toegestane momenten (${m})`);
  controleerRegels(bl, r, "grens 40");

  // Blokgrens op 50: de computer mag niet op 50 wisselen
  const bl2 = [
    { minutes: 45, lineup: L(A) },
    { minutes: 5, lineup: L(A) },
    { minutes: 40, lineup: L(["z1", ...A.slice(1)]) },
  ];
  const r2 = M.optimizeMoments(bl2, tg, {});
  const m2 = alleMomenten(r2)[0];
  check(m2 !== undefined && m2 !== 50, `een wissel op blokgrens 50 wordt verplaatst (staat nu op ${m2})`);
  check(m2 === 45 || m2 === 55, `en wel naar 45 of 55 (${m2})`);

  // Precies 35 en 55 zijn wél toegestaan (dan blijft er net 10 minuten over)
  check(M.isComputerMoment(35) && M.isComputerMoment(55) && M.isComputerMoment(45), "35, 45 en 55 zijn toegestaan");
  check(!M.isComputerMoment(40) && !M.isComputerMoment(50) && !M.isComputerMoment(36) && !M.isComputerMoment(54), "40, 50, 36 en 54 niet");
}

console.log("\n=== TEST: een wissel op de rust zelf mag, en mag met meer tegelijk ===");
{
  const Z = ["z1","z2","z3","z4","z5","z6","z7","z8","z9","z10"];
  const bl = [{ minutes: 45, lineup: L(A) }, { minutes: 45, lineup: L(Z) }];
  const tg = {}; [...A, ...Z].forEach((p) => (tg[p] = 45));
  const r = M.optimizeMoments(bl, tg, {});
  const { minutes } = M.computeMinutes(bl, r.overrides);
  check([...A, ...Z].every((p) => Math.abs(minutes[p] - 45) < 1e-9), "iedereen blijft precies 45");
  check(Object.keys(r.overrides).length === 0, "10 wissels tegelijk op 45 blijven staan (rust: geen limiet, geen onnodige verschuiving)");
}

console.log("\n=== TEST: maximaal 2 wissels per moment buiten de rust ===");
{
  // 6 wissels tegelijk op de (toegestane) blokgrens 20 -> verspreiden over meerdere momenten
  const Z = ["z1","z2","z3","z4","z5","z6"];
  const bl = [
    { minutes: 20, lineup: L(A) },
    { minutes: 25, lineup: L([...Z, ...A.slice(6)]) },
    { minutes: 45, lineup: L([...Z, ...A.slice(6)]) },
  ];
  const sp = [...A, ...Z]; const tg = {}; sp.forEach((p) => (tg[p] = 900 / sp.length));
  const r = M.optimizeMoments(bl, tg, {});
  const tel = {};
  alleMomenten(r).forEach((m) => (tel[m] = (tel[m] || 0) + 1));
  check(Object.values(tel).every((c) => c <= 2), `nooit meer dan 2 per moment (${JSON.stringify(tel)})`);
  controleerRegels(bl, r, "6 wissels");
}

console.log("\n=== TEST: eerlijker dan het standaardmoment (kwaliteit) ===");
{
  // Eén wissel op blokgrens 20 (blokken 20 + 70). a1 wil 30 minuten, s wil 65.
  const bl = [
    { minutes: 20, lineup: L(A) },
    { minutes: 70, lineup: L(["s", ...A.slice(1)]) },
  ];
  const tg = { s: 65, a1: 30 }; A.slice(1).forEach((p) => (tg[p] = 90));
  const r = M.optimizeMoments(bl, tg, {});
  const m = alleMomenten(r)[0];
  const { minutes } = M.computeMinutes(bl, r.overrides);
  const dev0 = Math.pow(20 - 30, 2) + Math.pow(70 - 65, 2); // alles op 20
  const dev1 = Math.pow(minutes.a1 - 30, 2) + Math.pow(minutes.s - 65, 2);
  console.log(`  (wissel op ${m}: a1 ${minutes.a1}, s ${minutes.s}; afwijking² ${dev0} -> ${dev1})`);
  check(m === 25 || m === 30, "de wissel schuift naar achteren, richting wat a1 nog tekortkomt");
  check(dev1 < dev0, "en dat is aantoonbaar eerlijker dan op de blokgrens laten staan");
}

console.log("\n=== TEST: cap wordt nooit overschreden (indien haalbaar) ===");
{
  const sp = [...new Set(blocks4.flatMap((b) => Object.values(b.lineup)))];
  const res = M.optimizeMoments(blocks4, { ...tg4, a2: 40 }, { a2: 40 });
  const naA2 = M.computeMinutes(blocks4, res.overrides).minutes["a2"];
  console.log(`  (a2: standaard ${M.computeMinutes(blocks4, {}).minutes["a2"]} -> ${naA2}, cap 40)`);
  check(naA2 <= 40 + 1e-9, "a2 komt niet boven zijn cap van 40");
  check(res.capOvertreders.length === 0, "geen overtreders gemeld");
  controleerRegels(blocks4, res, "met cap");
  const onhaalbaar = M.optimizeMoments(blocks4, { ...tg4, a7: 80 }, { a7: 80 });
  check(onhaalbaar.capOvertreders.includes("a7"), "een onhaalbare cap (a7 wisselt nooit) wordt eerlijk gemeld, zonder crash");
}

console.log("\n=== TEST: maximale wisselminuut voor de computer (bv. 80) ===");
{
  const bl = [
    { minutes: 80, lineup: L(A) },
    { minutes: 10, lineup: L(["z1", ...A.slice(1)]) },
  ];
  const tg = { a1: 90, z1: 0 }; A.slice(1).forEach((p) => (tg[p] = 90));
  const key = M.pairKey(M.deriveTransition(bl[0].lineup, bl[1].lineup).pairs[0]);
  const vrij = M.optimizeMoments(bl, tg, {});
  const beperkt = M.optimizeMoments(bl, tg, {}, { maxMoment: 80 });
  const mv = vrij.overrides[1] ? vrij.overrides[1][key] : 80;
  const mb = beperkt.overrides[1] ? beperkt.overrides[1][key] : 80;
  check(mv > 80, `zonder grens schuift de wissel na minuut 80 (naar ${mv}) - de test heeft bijtkracht`);
  check(mb <= 80, `met maxMoment=80 blijft hij op of voor 80 (${mb})`);
}

console.log("\n===================================");
console.log(fails === 0 ? "✅ Computerregels voor wisselmomenten werken zoals bedoeld." : `❌ ${fails} gefaald.`);
process.exit(fails === 0 ? 0 : 1);
