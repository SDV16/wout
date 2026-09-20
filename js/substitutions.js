// =====================================================
// Wissel-planning (welke speler wisselt wanneer met wie, op welke positie)
// en het minutenoverzicht (werkelijke speeltijd + positie-minuten per
// speler). Ondersteunt handmatig verschuiven van een specifiek wisselpaar
// (data-gedreven, geen drag-gestures nodig) en een harde grens: na
// MAX_SUBSTITUTION_MINUTE wordt niet meer gewisseld.
// =====================================================

(function (root) {
  const MAX_SUBSTITUTION_MINUTE = 80; // geen enkele wissel later dan deze minuut
  const MAX_PER_MOMENT = 2; // streefwaarde; wordt alleen overschreden als er écht geen andere optie is

  function baseOf(pos) {
    return pos.startsWith("cm") || pos.startsWith("cv") ? pos.slice(0, 2) : pos;
  }

  function posOf(schedule, speler) {
    for (const [pos, sp] of Object.entries(schedule)) {
      if (sp === speler) return pos;
    }
    return null;
  }

  function pairKey(inkomend, uitgaand) {
    return `${inkomend}\u2192${uitgaand}`;
  }

  // manualMomentOverrides: { [blockName]: { [pairKey]: minuut } } - blijft
  // geldig zolang hetzelfde paar in dat blok bestaat; verandert de selectie
  // in dat blok (bank<->veld-wissel), dan vervalt een override vanzelf
  // stilletjes (het paar bestaat dan niet meer).
  function computeFullTimeline(blocks, schedule, targets, mins, players, manualMomentOverrides) {
    manualMomentOverrides = manualMomentOverrides || {};

    let prevPlayers = new Set();
    let prevSchedule = null;
    const allMomentPlans = {};
    const actualMinsSoFar = {};
    const blockViews = [];

    blocks.forEach(([blockName, blockMin], blockIdx) => {
      const currentPlayers = new Set(Object.values(schedule[blockName]));

      if (blockIdx === 0) {
        prevPlayers = new Set(currentPlayers);
        prevSchedule = schedule[blockName];
        allMomentPlans[blockName] = {};
        for (const sp of currentPlayers) actualMinsSoFar[sp] = (actualMinsSoFar[sp] || 0) + blockMin;
        blockViews.push({ blockName, blockMin, isFirst: true, pairs: [], momentPlan: {} });
        return;
      }

      const posMap = schedule[blockName];
      const playerPos = {}; // basispositie NU, voor elke speler die nu speelt
      for (const [pos, sp] of Object.entries(posMap)) playerPos[sp] = baseOf(pos);
      const prevPlayerPos = {}; // basispositie VORIG blok
      for (const [pos, sp] of Object.entries(prevSchedule)) prevPlayerPos[sp] = baseOf(pos);

      const eruit = [...prevPlayers].filter((p) => !currentPlayers.has(p));
      const erin = [...currentPlayers].filter((p) => !prevPlayers.has(p));

      function posScore(i, o) {
        // Let op: o speelt dit blok niet meer, dus zijn positie moet uit het
        // VORIGE blok komen - niet uit het huidige (daar staat hij niet in).
        if (playerPos[i] === prevPlayerPos[o]) return 0;
        if (players[o].favourite.includes(playerPos[i])) return 1;
        if (players[o].alternative.includes(playerPos[i])) return 2;
        return 3;
      }

      const pairs = []; // [inkomend, uitgaand]
      const usedO = new Set();
      for (const i of erin) {
        let best = null;
        for (const o of eruit) {
          if (usedO.has(o)) continue;
          const sc = posScore(i, o) + Math.abs(mins[i] - mins[o]) * 0.01;
          if (best === null || sc < best[0]) best = [sc, i, o];
        }
        if (best) {
          pairs.push([best[1], best[2]]);
          usedO.add(best[2]);
        }
      }
      const pairedI = new Set(pairs.map((pr) => pr[0]));
      const pairedO = new Set(pairs.map((pr) => pr[1]));
      const remainingI = erin.filter((p) => !pairedI.has(p));
      const remainingO = eruit.filter((p) => !pairedO.has(p));
      for (let k = 0; k < Math.min(remainingI.length, remainingO.length); k++) pairs.push([remainingI[k], remainingO[k]]);

      // Ketendetectie: I komt soms niet letterlijk op O's oude plek te staan,
      // omdat de optimalisatie de posities van de nog-spelende groep opnieuw
      // kan indelen. Als een 'blijver' daardoor van precies I's nieuwe
      // positie naar precies O's oude positie is verschoven, maakte die
      // blijver zo de ruimte voor I - dat tonen we erbij i.p.v. het verborgen
      // te laten (leek anders of I letterlijk O's plek overnam).
      function vindKetenSpeler(baseI, baseO, pairI) {
        for (const sp of currentPlayers) {
          if (sp === pairI || !prevPlayers.has(sp)) continue;
          if (prevPlayerPos[sp] === baseI && playerPos[sp] === baseO) {
            return { naam: sp, van: baseI, naar: baseO };
          }
        }
        return null;
      }

      const pairsMetInfo = pairs.map(([i, o]) => {
        const posI = posOf(posMap, i);
        const baseIVal = baseOf(posI);
        const baseOVal = prevPlayerPos[o];
        const keten = baseIVal !== baseOVal ? vindKetenSpeler(baseIVal, baseOVal, i) : null;
        return [i, o, posI, keten];
      });

      if (pairs.length === 0) {
        allMomentPlans[blockName] = {};
        for (const sp of currentPlayers) actualMinsSoFar[sp] = (actualMinsSoFar[sp] || 0) + blockMin;
        blockViews.push({ blockName, blockMin, isFirst: false, pairs: [], momentPlan: {}, geenWissels: true });
      } else {
        const blokStartInt = parseInt(blockName.split("-")[0], 10);
        const blokEindInt = parseInt(blockName.split("-")[1], 10);

        const ruweBase = 5 * Math.ceil(blokStartInt / 5);
        const baseMinute = Math.min(ruweBase < blokEindInt ? ruweBase : blokStartInt, MAX_SUBSTITUTION_MINUTE);

        let timeSlots;
        if (baseMinute === 45) {
          timeSlots = [45];
        } else {
          // Alle geldige 5-minuten-momenten tussen het blokbegin en de
          // harde grens (nooit later dan MAX_SUBSTITUTION_MINUTE, en nooit
          // op/na het einde van dit blok zelf).
          const upperBound = Math.min(blokEindInt - 1, MAX_SUBSTITUTION_MINUTE);
          const alleGeldigeMomenten = [];
          for (let m = baseMinute; m <= upperBound; m += 5) alleGeldigeMomenten.push(m);
          if (alleGeldigeMomenten.length === 0) alleGeldigeMomenten.push(Math.min(baseMinute, Math.max(blokStartInt, upperBound)));

          const benodigdeMomenten = Math.max(1, Math.ceil(pairs.length / MAX_PER_MOMENT));
          timeSlots = alleGeldigeMomenten.slice(0, benodigdeMomenten);
        }

        // Zoveel wissels per moment dat gegarandeerd iedereen een plek
        // krijgt. Dit blijft normaliter <= 2 (MAX_PER_MOMENT); alleen als de
        // grens van 80 min echt te weinig ruimte overlaat voor heel veel
        // gelijktijdige wissels, schuift het teveel noodgedwongen in het
        // laatste moment (nooit wissels laten verdwijnen).
        const capPerMoment = Math.max(1, Math.ceil(pairs.length / timeSlots.length));

        const pairsSorted = [...pairs].sort((a, b) => {
          const urgA = (targets[a[0]] - (actualMinsSoFar[a[0]] || 0)) + ((actualMinsSoFar[a[1]] || 0) - targets[a[1]]);
          const urgB = (targets[b[0]] - (actualMinsSoFar[b[0]] || 0)) + ((actualMinsSoFar[b[1]] || 0) - targets[b[1]]);
          return urgB - urgA;
        });

        const momentPlan = {};
        for (const m of timeSlots) momentPlan[m] = [];
        for (const pair of pairsSorted) {
          for (const m of timeSlots) {
            if (momentPlan[m].length < capPerMoment) {
              momentPlan[m].push(pair);
              break;
            }
          }
        }

        // Handmatige verschuivingen toepassen (blijven binnen dezelfde
        // grenzen: niet vóór het blokbegin, niet voorbij MAX_SUBSTITUTION_MINUTE,
        // niet op/na het blokeinde).
        const overridesHier = manualMomentOverrides[blockName] || {};
        for (const [key, gewensteMinuut] of Object.entries(overridesHier)) {
          let gevondenBij = null;
          for (const m of Object.keys(momentPlan).map(Number)) {
            const idx = momentPlan[m].findIndex((pr) => pairKey(pr[0], pr[1]) === key);
            if (idx !== -1) { gevondenBij = { m, idx }; break; }
          }
          if (!gevondenBij) continue; // paar bestaat niet (meer) in dit blok - override vervalt stilletjes

          const min_ = Math.max(baseMinute, blokStartInt);
          const max_ = Math.min(blokEindInt - 1, MAX_SUBSTITUTION_MINUTE);
          const doel = Math.max(min_, Math.min(max_, gewensteMinuut));

          const [paar] = momentPlan[gevondenBij.m].splice(gevondenBij.idx, 1);
          if (!momentPlan[doel]) momentPlan[doel] = [];
          momentPlan[doel].push(paar);
        }
        // Lege momenten opruimen en op volgorde zetten
        for (const m of Object.keys(momentPlan)) {
          if (momentPlan[m].length === 0) delete momentPlan[m];
        }
        const finalTimeSlots = Object.keys(momentPlan).map(Number).sort((a, b) => a - b);

        allMomentPlans[blockName] = momentPlan;
        blockViews.push({ blockName, blockMin, isFirst: false, pairs: pairsMetInfo, momentPlan, timeSlots: finalTimeSlots });

        let currentSet = new Set(prevPlayers);
        let t = blokStartInt;
        for (const m of finalTimeSlots) {
          const elapsed = m - t;
          for (const sp of currentSet) actualMinsSoFar[sp] = (actualMinsSoFar[sp] || 0) + elapsed;
          for (const [i, o] of momentPlan[m]) { currentSet.delete(o); currentSet.add(i); }
          t = m;
        }
        for (const sp of currentSet) actualMinsSoFar[sp] = (actualMinsSoFar[sp] || 0) + (blokEindInt - t);
      }

      prevPlayers = new Set(currentPlayers);
      prevSchedule = posMap;
    });

    // ---- Minutenoverzicht: werkelijke speeltijd MET positie per interval ----
    // (speler, positie, start, eind) i.p.v. alleen (speler, start, eind), zodat
    // de "Posities"-kolom exact optelt tot dezelfde "Gekregen"-minuten - een
    // speler die gestaffeld in-/uitstroomt kreeg voorheen zijn positie-
    // minuten nog met de volle bloktijd toegerekend, wat niet meer klopte
    // met de (al wel gecorrigeerde) totaalminuten.
    const allActiveIntervals = []; // [speler, positie, start, eind]
    let prevBlockLineup = null;
    let prevBlockSchedule = null;

    for (const [bn, bm] of blocks) {
      const blockStart = parseInt(bn.split("-")[0], 10);
      const blockEnd = parseInt(bn.split("-")[1], 10);
      const finalSchedule = schedule[bn];
      const finalLineup = new Set(Object.values(finalSchedule));

      if (prevBlockLineup === null) {
        for (const sp of finalLineup) allActiveIntervals.push([sp, posOf(finalSchedule, sp), blockStart, blockEnd]);
      } else {
        const stayers = [...finalLineup].filter((sp) => prevBlockLineup.has(sp));
        for (const sp of stayers) {
          // NB: een 'blijver' kan tussen blokken toch van positie wisselen
          // (de optimalisatie herschikt soms binnen het blok) - dat rekenen
          // we toe aan het hele blok, er is geen los wisselmoment voor.
          allActiveIntervals.push([sp, posOf(finalSchedule, sp), blockStart, blockEnd]);
        }

        const momentPlan = allMomentPlans[bn] || {};
        for (const m of Object.keys(momentPlan).map(Number)) {
          for (const [i, o] of momentPlan[m]) {
            allActiveIntervals.push([o, posOf(prevBlockSchedule, o), blockStart, m]);
            allActiveIntervals.push([i, posOf(finalSchedule, i), m, blockEnd]);
          }
        }
      }
      prevBlockLineup = finalLineup;
      prevBlockSchedule = finalSchedule;
    }

    return { blockViews, allMomentPlans, allActiveIntervals };
  }

  const OpstellingSubs = { computeFullTimeline, MAX_SUBSTITUTION_MINUTE, pairKey };

  if (typeof module !== "undefined") {
    module.exports = OpstellingSubs;
  } else {
    root.OpstellingSubs = OpstellingSubs;
  }
})(typeof window !== "undefined" ? window : globalThis);
