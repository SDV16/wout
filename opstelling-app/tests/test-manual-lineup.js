const M = require("../js/manual-lineup.js");
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log("  ❌ " + m); } else console.log("  ✅ " + m); }

console.log("=== TEST: wisselafleiding tussen blokken ===");
{
  const b1 = { ...M.emptyLineup(), la: "Nord", ra: "Sietse", sp: "Jaimy" };
  const b2 = { ...M.emptyLineup(), la: "Dinand", ra: "Sietse", sp: "Jaimy" };
  const t = M.deriveTransition(b1, b2);
  check(t.pairs.length === 1, "1 wissel gevonden");
  check(t.pairs[0].in === "Dinand" && t.pairs[0].uit === "Nord", "Dinand komt voor Nord");
  check(t.pairs[0].pos === "la", "positie is la");
}

console.log("\n=== TEST: jouw Nord/Dinand/Xander-scenario ===");
{
  // Nord stond LA in blok1, Dinand komt erin in blok2 -> wissel Dinand/Nord
  const b1 = { ...M.emptyLineup(), la: "Nord" };
  const b2 = { ...M.emptyLineup(), la: "Dinand" };
  check(M.deriveTransition(b1, b2).pairs[0].uit === "Nord", "voor: Dinand komt voor Nord");

  // Nu Dinand al in blok1 zetten -> geen wissel meer
  const b1b = { ...M.emptyLineup(), la: "Dinand" };
  check(M.deriveTransition(b1b, b2).pairs.length === 0, "na wijziging blok1: geen wissel meer");

  // Nord wisselt voor Xander -> wissel wordt Dinand voor Xander
  const b1c = { ...M.emptyLineup(), la: "Xander" };
  const t = M.deriveTransition(b1c, b2);
  check(t.pairs[0].in === "Dinand" && t.pairs[0].uit === "Xander", "Dinand komt erin voor Xander");
}

console.log("\n=== TEST: positiewissel van een blijver wordt herkend ===");
{
  const b1 = { ...M.emptyLineup(), la: "Nord", ra: "Chris" };
  const b2 = { ...M.emptyLineup(), la: "Chris", ra: "Dinand" };
  const t = M.deriveTransition(b1, b2);
  check(t.moved.some(m => m.naam === "Chris" && m.van === "ra" && m.naar === "la"), "Chris ra->la herkend als verschuiving");
  const pr = t.pairs.find(p => p.in === "Dinand");
  check(!!pr && pr.keten && pr.keten.naam === "Chris", "keten-info gekoppeld aan Dinand's wissel");
}

console.log("\n=== TEST: minutenberekening, standaard wisselmomenten ===");
{
  const l1 = { ...M.emptyLineup(), sp: "A", lb: "B" };
  const l2 = { ...M.emptyLineup(), sp: "C", lb: "B" };
  const blocks = [{ minutes: 45, lineup: l1 }, { minutes: 45, lineup: l2 }];
  const { minutes, posMinutes } = M.computeMinutes(blocks, {});
  check(minutes["A"] === 45, `A speelt 45 (kreeg ${minutes["A"]})`);
  check(minutes["C"] === 45, `C speelt 45 (kreeg ${minutes["C"]})`);
  check(minutes["B"] === 90, `B speelt 90 (kreeg ${minutes["B"]})`);
  check(posMinutes["B"]["lb"] === 90, "B's positieminuten kloppen");
}

console.log("\n=== TEST: handmatig verschoven wisselmoment ===");
{
  const l1 = { ...M.emptyLineup(), sp: "A" };
  const l2 = { ...M.emptyLineup(), sp: "C" };
  const blocks = [{ minutes: 45, lineup: l1 }, { minutes: 45, lineup: l2 }];
  const pr = M.deriveTransition(l1, l2).pairs[0];
  const key = M.pairKey(pr);
  // Wissel 10 min eerder: op minuut 35 i.p.v. 45
  const r = M.computeMinutes(blocks, { 1: { [key]: 35 } });
  check(r.minutes["A"] === 35, `A speelt 35 na vervroegde wissel (kreeg ${r.minutes["A"]})`);
  check(r.minutes["C"] === 55, `C speelt 55 na vervroegde wissel (kreeg ${r.minutes["C"]})`);
  check(r.minutes["A"] + r.minutes["C"] === 90, "totaal blijft 90");
}

console.log("\n=== TEST: beschikbaarheid per helft ===");
{
  check(M.availableInBlock({ firstHalf: true }, 0) === true, "1e-helft-speler zichtbaar bij minuut 0");
  check(M.availableInBlock({ firstHalf: true }, 45) === false, "1e-helft-speler NIET zichtbaar vanaf minuut 45");
  check(M.availableInBlock({ secondHalf: true }, 0) === false, "2e-helft-speler niet zichtbaar bij minuut 0");
  check(M.availableInBlock({ secondHalf: true }, 45) === true, "2e-helft-speler zichtbaar vanaf minuut 45");
}

console.log("\n=== TEST: targets (recht op) respecteren caps ===");
{
  const spelers = ["A","B","C","D","E","F","G","H","I","J"];
  const st = {};
  for (const p of spelers) st[p] = { training: 2, maxMinutes: 90, firstHalf: false, secondHalf: false };
  st["A"].maxMinutes = 45;
  st["B"].firstHalf = true;
  const t = M.computeTargets(spelers, st, 20, 10);
  check(t["A"] === 45, `A (max 45) heeft recht op 45 (kreeg ${t["A"]})`);
  check(t["B"] === 45, `B (1e helft) heeft recht op 45 (kreeg ${t["B"]})`);
  check(t["C"] === 90, `C heeft recht op 90 (kreeg ${t["C"]})`);
}

console.log("\n=== TEST: kleurcodes ===");
{
  check(M.diffClass(67, 70) === "mk-green", "67/70 groen (3 verschil)");
  check(M.diffClass(74, 70) === "mk-green", "74/70 groen (4 verschil)");
  check(M.diffClass(61, 70) === "mk-orange", "61/70 oranje (9 verschil)");
  check(M.diffClass(76, 70) === "mk-orange", "76/70 oranje (6 verschil)");
  check(M.diffClass(60, 70) === "mk-red", "60/70 rood (10 verschil)");
  check(M.diffClass(81, 70) === "mk-red", "81/70 rood (11 verschil)");
}

console.log("\n===================================");
console.log(fails === 0 ? "✅ Alle handmatige-opstelling-logica werkt." : `❌ ${fails} gefaald.`);
process.exit(fails === 0 ? 0 : 1);
