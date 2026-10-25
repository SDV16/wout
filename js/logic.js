// =====================================================
// Kernlogica van de opstelling-generator.
// Dit is een bewust letterlijke vertaling van reference.py - elke functie
// hieronder heeft een direct Python-equivalent (zie het commentaar erboven).
// Python's impliciete globals (POSITIONS_ORDER, availability_flags,
// max_minutes, failure_log) worden hier expliciet meegegeven via een
// `ctx`-object, zodat er geen verborgen afhankelijkheden zijn.
// =====================================================

(function (root) {
  const TOTAL_FIELD_MINUTES = 90 * 10;
  const BLOCK_OPTIONS = [30, 22.5, 20, 15, 10];
  // Zelfde toelichting als in reference.py: oplopende toegestane afwijking
  // t.o.v. streefminuten. Positie-eisen worden hierdoor nooit losgelaten.
  const SLACK_LEVELS = [5, 10, 20, 35, 60, 999];

  // ---- compute_dynamic_position_order ----
  function computeDynamicPositionOrder(players, PLAYERS) {
    const basePositions = ["sp", "cv", "cm", "lb", "rb", "la", "ra"];

    // BELANGRIJK: Python's count_pool() geeft een TUPLE (totaal, fav, alt, emg)
    // terug en sorteert daarop; bij een gelijk totaal breekt Python de tie dus
    // eerst op fav, dan alt, dan emg. Die volgorde moet hier exact hetzelfde
    // zijn, anders krijg je - via de backtracking die niet cross-blok
    // terugredeneert - een heel ander eindresultaat bij gelijkspel.
    function countPoolTuple(bp) {
      let fav = 0, alt = 0, emg = 0;
      for (const p of players) {
        if (PLAYERS[p].favourite.includes(bp)) fav++;
        if (PLAYERS[p].alternative.includes(bp)) alt++;
        if (PLAYERS[p].emergency.includes(bp)) emg++;
      }
      return [fav + alt + emg, fav, alt, emg];
    }

    const sortedBases = [...basePositions].sort((a, b) => {
      const ta = countPoolTuple(a);
      const tb = countPoolTuple(b);
      for (let i = 0; i < ta.length; i++) {
        if (ta[i] !== tb[i]) return ta[i] - tb[i];
      }
      return 0;
    });

    const expanded = [];
    for (const bp of sortedBases) {
      if (bp === "cm") expanded.push("cm1", "cm2", "cm3");
      else if (bp === "cv") expanded.push("cv1", "cv2");
      else expanded.push(bp);
    }
    return expanded;
  }

  // ---- allowed_in_block ----
  function allowedInBlock(player, blockName, availabilityFlags) {
    const start = parseInt(blockName.split("-")[0], 10);
    const flags = availabilityFlags[player] || { first: false, second: false };
    const fh = flags.first;
    const sh = flags.second;
    if (!fh && !sh) return true;
    if (fh && start >= 45) return false;
    if (sh && start < 45) return false;
    return true;
  }

  // ---- calculate_target_minutes ----
  // Geeft twee dingen terug:
  //  - targets: het GECAPTE streefgetal (wat ook als "Recht op" getoond wordt) -
  //    begrensd door Max minuten EN, nieuw, door 45 min als iemand een
  //    1e/2e-helft-beperking heeft (die kan fysiek toch nooit meer spelen).
  //  - uncapped: het streefgetal ZONDER die caps - puur op basis van
  //    trainingen/herverdeling. Dit wordt ALLEEN gebruikt als referentie bij
  //    het prioriteren tijdens het invullen (zie generateSchedule), NIET
  //    voor de weergave. Zonder dit zou iemand met een laag cap al snel
  //    "verzadigd" lijken (want dicht bij zijn cap) terwijl hij t.o.v. zijn
  //    eigenlijke, hogere streefgetal nog flink tekortkomt - en dat tekort
  //    moet gewoon blijven meetellen bij het bepalen wie er nog moet spelen.
  function calculateTargetMinutes(players, trainingCounts, maxMinutes, bonus0, bonus1, availabilityFlags) {
    const n = players.length;
    const base = TOTAL_FIELD_MINUTES / n;
    const raw = {};
    let totalRemoved = 0;
    for (const p of players) {
      if (trainingCounts[p] === 0) {
        raw[p] = base - bonus0;
        totalRemoved += bonus0;
      } else if (trainingCounts[p] === 1) {
        raw[p] = base - bonus1;
        totalRemoved += bonus1;
      } else {
        raw[p] = base;
      }
    }
    const redistribute = n > 0 ? totalRemoved / n : 0;
    const uncapped = {};
    const targets = {};
    for (const p of players) {
      const candidate = raw[p] + redistribute;
      uncapped[p] = candidate;

      let cap = maxMinutes[p] !== undefined ? maxMinutes[p] : 90;
      const flags = availabilityFlags ? availabilityFlags[p] : null;
      if (flags && (flags.first || flags.second)) cap = Math.min(cap, 45);
      cap = Math.min(cap, 90);

      targets[p] = Math.min(candidate, cap);
    }
    return { targets, uncapped };
  }

  // ---- position_rank ----
  function positionRank(player, pos, PLAYERS) {
    const basePos = (pos.startsWith("cm") || pos.startsWith("cv")) ? pos.slice(0, 2) : pos;
    const p = PLAYERS[player];
    if (p.favourite.includes(basePos)) return 1;
    if (p.alternative.includes(basePos)) return 2;
    if (p.emergency.includes(basePos)) return 3;
    return 999;
  }

  // ---- scarcity_bonus ----
  function scarcityBonus(player, pos, players, PLAYERS) {
    const basePos = (pos.startsWith("cm") || pos.startsWith("cv")) ? pos.slice(0, 2) : pos;
    const favPlayers = players.filter((p) => PLAYERS[p].favourite.includes(basePos));
    if (favPlayers.length <= 2 && PLAYERS[player].favourite.includes(basePos)) return 10;
    return 0;
  }

  // ---- _bipartite_max_matching ----
  function bipartiteMaxMatching(slotCandidates) {
    const matchSlotToPlayer = {};
    const matchPlayerToSlot = {};

    function tryAssign(slot, visited) {
      for (const p of slotCandidates[slot]) {
        if (visited.has(p)) continue;
        visited.add(p);
        if (!(p in matchPlayerToSlot) || tryAssign(matchPlayerToSlot[p], visited)) {
          matchSlotToPlayer[slot] = p;
          matchPlayerToSlot[p] = slot;
          return true;
        }
      }
      return false;
    }

    for (const slot of Object.keys(slotCandidates)) {
      tryAssign(slot, new Set());
    }

    const unmatched = Object.keys(slotCandidates).filter((slot) => !(slot in matchSlotToPlayer));
    return { matching: matchSlotToPlayer, unmatched };
  }

  // ---- check_structural_feasibility ----
  function checkStructuralFeasibility(players, positionsOrder, availabilityFlags, PLAYERS) {
    const shortages = {};
    const halves = [["eerste helft", "0-45"], ["tweede helft", "45-90"]];
    for (const [helftNaam, blockRef] of halves) {
      const slotCandidates = {};
      for (const pos of positionsOrder) {
        slotCandidates[pos] = players.filter(
          (p) => allowedInBlock(p, blockRef, availabilityFlags) && positionRank(p, pos, PLAYERS) !== 999
        );
      }
      const { unmatched } = bipartiteMaxMatching(slotCandidates);

      const tekortPerBasis = {};
      for (const slot of unmatched) {
        const base = (slot.startsWith("cm") || slot.startsWith("cv")) ? slot.slice(0, 2) : slot;
        tekortPerBasis[base] = (tekortPerBasis[base] || 0) + 1;
      }
      shortages[helftNaam] = Object.keys(tekortPerBasis).sort().map((k) => [k, tekortPerBasis[k]]);
    }
    return shortages;
  }

  // ---- optimize_position_swaps ----
  function optimizePositionSwaps(blockAssignment, PLAYERS) {
    const positions = Object.keys(blockAssignment);
    const players = positions.map((pos) => blockAssignment[pos]);
    const n = positions.length;
    const INF = 1e6;

    const cost = [];
    for (let i = 0; i < n; i++) {
      cost.push([]);
      for (let j = 0; j < n; j++) {
        const r = positionRank(players[j], positions[i], PLAYERS);
        cost[i].push(r !== 999 ? r : INF);
      }
    }

    const FULL = 1 << n;
    const dp = Array.from({ length: n + 1 }, () => new Array(FULL).fill(INF));
    const choice = Array.from({ length: n + 1 }, () => new Array(FULL).fill(-1));
    dp[0][0] = 0;

    for (let i = 0; i < n; i++) {
      for (let mask = 0; mask < FULL; mask++) {
        const cur = dp[i][mask];
        if (cur >= INF) continue;
        for (let j = 0; j < n; j++) {
          if (mask & (1 << j)) continue;
          const c = cost[i][j];
          if (c >= INF) continue;
          const newMask = mask | (1 << j);
          const newCost = cur + c;
          if (newCost < dp[i + 1][newMask]) {
            dp[i + 1][newMask] = newCost;
            choice[i + 1][newMask] = j;
          }
        }
      }
    }

    const fullMask = FULL - 1;
    if (dp[n][fullMask] >= INF) {
      // Zou niet moeten gebeuren (de huidige toewijzing is zelf al geldig).
      return { ...blockAssignment };
    }

    let mask = fullMask;
    const playerForIndex = new Array(n).fill(null);
    for (let i = n; i >= 1; i--) {
      const j = choice[i][mask];
      playerForIndex[i - 1] = j;
      mask ^= 1 << j;
    }

    const result = {};
    for (let i = 0; i < n; i++) {
      result[positions[i]] = players[playerForIndex[i]];
    }
    return result;
  }

  // ---- generate_block_patterns ----
  function generateBlockPatterns(strict) {
    const results = [];
    const max10 = strict ? 2 : 3;
    const max15 = strict ? 2 : 3;

    function backtrack(remaining, startIdx, used10, used15, current) {
      if (Math.abs(remaining) < 1e-6) {
        if (current[0] < 15 || current[current.length - 1] < 15) return;
        results.push([...current]);
        return;
      }
      if (remaining < 0 || current.length > 8) return;
      for (let i = startIdx; i < BLOCK_OPTIONS.length; i++) {
        const size = BLOCK_OPTIONS[i];
        if (size === 10 && used10 >= max10) continue;
        if (size === 15 && used15 >= max15) continue;
        current.push(size);
        backtrack(remaining - size, i, used10 + (size === 10 ? 1 : 0), used15 + (size === 15 ? 1 : 0), current);
        current.pop();
      }
    }

    backtrack(90, 0, 0, 0, []);
    results.sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return b[i] - a[i]; // -x oplopend = x aflopend
      }
      return 0;
    });
    return results;
  }

  // ---- build_blocks_from_pattern ----
  function buildBlocksFromPattern(pattern) {
    const blocks = [];
    let start = 0;
    for (const size of pattern) {
      const end = start + size;
      if (start < 45 && 45 < end) return null;
      blocks.push([`${Math.trunc(start)}-${Math.trunc(end)}`, size]);
      start = end;
    }
    return blocks;
  }

  // ---- generate_schedule ----
  // ctx = { PLAYERS, positionsOrder, availabilityFlags, maxMinutes, failureLog }
  // uncappedTargets: het streefgetal ZONDER Max-minuten/1e-2e-helft-cap,
  // gebruikt als referentie in de score-functie (zie calculateTargetMinutes
  // hierboven voor de volledige toelichting). targets (gecapt) blijft de
  // basis voor `remaining`/slack, want die gaan over de WEERGEGEVEN
  // eerlijke verdeling, niet over prioritering.
  function generateSchedule(players, targets, uncappedTargets, priorityFlags, blocks, slack, ctx, capPriorityEnabled) {
    const { PLAYERS, positionsOrder, availabilityFlags, maxMinutes, failureLog } = ctx;
    const remaining = { ...targets };
    const schedule = {};
    const assignedMinutes = {};
    for (const p of players) assignedMinutes[p] = 0;
    // Referentiewaarde om de relatieve vervulling terug te schalen naar
    // 'gewone' minuten - zie reference.py voor de volledige toelichting.
    const referenceTarget = players.length ? TOTAL_FIELD_MINUTES / players.length : 1;

    for (const [bName, bMin] of blocks) {
      schedule[bName] = {};
      const used = new Set();

      function assign(idx) {
        if (idx === positionsOrder.length) return true;

        const pos = positionsOrder[idx];

        const cands = [];
        for (const p of players) {
          if (used.has(p)) continue;
          if (!allowedInBlock(p, bName, availabilityFlags)) continue;
          if (positionRank(p, pos, PLAYERS) === 999) continue; // positie-eis: altijd hard
          if (remaining[p] - bMin < -slack) continue;
          const cap = maxMinutes[p] !== undefined ? maxMinutes[p] : 90;
          if (assignedMinutes[p] + bMin > cap) continue; // max minuten: hard, proactief
          cands.push(p);
        }

        if (cands.length === 0) {
          failureLog.push(`${bName} - ${pos}: geen kandidaten`);
          return false;
        }

        function score(p) {
          const rank = positionRank(p, pos, PLAYERS);
          // Relatieve vervulling t.o.v. het ONGECAPTE streefgetal: iemand
          // met bv. Max minuten=45 maar die normaliter recht had op 65,
          // wordt hier nog als "0.46 vervuld" gezien na 30 gespeelde
          // minuten (30/65) i.p.v. "0.67 vervuld" (30/45) - waardoor hij
          // net zo hard blijft meetellen voor verdere minuten totdat zijn
          // HARDE cap (proactief hierboven al uitgesloten) dat verhindert.
          const t = uncappedTargets[p] > 1e-9 ? uncappedTargets[p] : 1e-9;
          const fulfilled = assignedMinutes[p] / t;
          const overTarget = (fulfilled - 1) * referenceTarget;
          const underTarget = Math.max(0, (1 - fulfilled) * referenceTarget);

          // Voorrang voor spelers met een CAP (Max minuten of 1e/2e-helft)
          // die hun cap nog niet vol hebben. Zonder dit stranden zij
          // structureel onder hun cap: bij gelijke urgentie wisselen ze
          // netjes af met een ongecapte speler, maar de ongecapte speler
          // kan zijn minuten later alsnog inhalen terwijl de gecapte speler
          // door de resterende blokgroottes zijn cap dan niet meer precies
          // kan volmaken (praktijkgeval: cap 45, bleef op 37.5 steken omdat
          // een volgend blok van 15 hem over zijn cap zou tillen). Sterker
          // naarmate er nog meer van zijn cap onbenut is.
          const cap = maxMinutes[p] !== undefined ? maxMinutes[p] : 90;
          let capPriority = 0;
          if (capPriorityEnabled && cap < uncappedTargets[p] - 1e-9 && cap > 1e-9) {
            const onbenutDeel = Math.max(0, cap - assignedMinutes[p]) / cap;
            capPriority = -onbenutDeel * referenceTarget * 10;
          }

          return (
            overTarget * 15 -
            underTarget * 10 +
            (rank - 1) * 40 -
            scarcityBonus(p, pos, players, PLAYERS) +
            capPriority +
            (priorityFlags[p] ? -8 : 0)
          );
        }

        cands.sort((a, b) => score(a) - score(b));

        for (const ch of cands) {
          schedule[bName][pos] = ch;
          used.add(ch);
          if (assign(idx + 1)) return true;
          used.delete(ch);
          delete schedule[bName][pos];
        }
        return false;
      }

      if (!assign(0)) return { schedule: null, played: null };

      schedule[bName] = optimizePositionSwaps(schedule[bName], PLAYERS);

      for (const pos of positionsOrder) {
        const ch = schedule[bName][pos];
        assignedMinutes[ch] += bMin;
        const cap = maxMinutes[ch] !== undefined ? maxMinutes[ch] : 90;
        if (assignedMinutes[ch] > cap) {
          failureLog.push(`${ch} overschrijdt max minuten in blok ${bName}`);
          return { schedule: null, played: null };
        }
        remaining[ch] -= bMin;
      }
    }

    return { schedule, played: null };
  }

  // ---- evaluate_blocks ----
  function evaluateBlocks(players, trainingCounts, priorityFlags, pattern, maxMinutes, slack, ctx, capPriorityEnabled) {
    const blocks = buildBlocksFromPattern(pattern);
    if (blocks === null) return { totalDev: Infinity };

    const { targets, uncapped } = calculateTargetMinutes(players, trainingCounts, maxMinutes, ctx.bonus0, ctx.bonus1, ctx.availabilityFlags);
    const { schedule } = generateSchedule(players, targets, uncapped, priorityFlags, blocks, slack, ctx, capPriorityEnabled);
    if (schedule === null) return { totalDev: Infinity };

    const mins = {};
    for (const p of players) mins[p] = 0;
    for (const [bName, bMin] of blocks) {
      for (const sp of Object.values(schedule[bName])) {
        if (players.includes(sp)) {
          const cap = maxMinutes[sp] !== undefined ? maxMinutes[sp] : 90;
          if (mins[sp] + bMin > cap) return { totalDev: Infinity };
          mins[sp] += bMin;
        }
      }
    }
    const totalDev = players.reduce((s, p) => s + Math.abs(mins[p] - targets[p]), 0);
    return { totalDev, blocks, schedule, targets, mins, uncapped };
  }

  // ---- choose_best_blocks ----
  // Beoordeelt configuraties op het tekort t.o.v. het ONGECAPTE recht, niet
  // t.o.v. het gecapte streefgetal. Reden: iemand met een cap (Max minuten of
  // 1e/2e-helft) is al beperkt; als hij daarbovenop onder zijn cap blijft,
  // is dat t.o.v. waar hij eigenlijk recht op had een veel groter tekort dan
  // het gecapte getal laat zien. Voorbeeld uit de praktijk: recht op 65,
  // cap 45, gekregen 35 - dat is "maar" -10 t.o.v. de cap, maar -30 t.o.v.
  // zijn echte recht. Zo wordt een configuratie waarin twee spelers die
  // dezelfde positie delen op 52.5/37.5 uitkomen terecht verworpen ten
  // faveure van 45/45: beiden hadden recht op 65, dus 45/45 behandelt ze
  // gelijk, terwijl 52.5/37.5 de gecapte speler extra benadeelt.
  // De WEERGAVE (tabel + waarschuwingsbanner) blijft op het gecapte
  // streefgetal - dit beinvloedt alleen WELKE opstelling gekozen wordt.
  function fairnessDevs(players, r) {
    return players.map((p) => {
      const reference = r.uncapped ? r.uncapped[p] : r.targets[p];
      const diff = r.mins[p] - reference;
      // Een TEKORT weegt dubbel zo zwaar als een overschot. Reden: de 900
      // speelminuten zijn een vast totaal, dus zodra iemand gecapt is
      // MOETEN anderen automatisch meer spelen dan hun recht - dat overschot
      // even zwaar straffen als een tekort werkt dan tegen het doel en
      // blokkeert juist de configuraties waarin de gecapte speler zijn
      // volledige cap haalt.
      return diff < 0 ? diff * 2 : diff;
    });
  }

  function chooseBestBlocks(players, trainingCounts, priorityFlags, maxMinutes, ctx) {
    // Per blokpatroon worden TWEE varianten geprobeerd: met en zonder
    // cap-prioriteit (zie de toelichting bij `score` in generateSchedule).
    // Reden: er is geen backtracking TUSSEN blokken, dus de keuze in een
    // vroeg blok bepaalt wat later nog mogelijk is. Cap-prioriteit helpt een
    // gecapte speler aan zijn volledige cap, maar kan elders een grotere
    // afwijking veroorzaken. In plaats van vooraf te gokken welke beter is,
    // laten we de eerlijkheidsmaat (gemeten t.o.v. het ONGECAPTE recht van
    // iedereen, met tekorten dubbel gewogen) beslissen welke variant wint.
    const CAP_VARIANTS = [true, false];

    // BELANGRIJK: we stoppen NIET bij het eerste slack-niveau dat een
    // oplossing geeft, maar bekijken alle niveaus en kiezen de eerlijkste.
    // Een gecapte speler zijn volledige cap geven vereist soms een hogere
    // slack (de minuten die hij door zijn cap niet speelt, moeten immers
    // naar anderen, en in hele blokken tilt dat iemand over de grens).
    // Met een vroege stop werd zo'n configuratie nooit gevonden en bleef de
    // gecapte speler onnodig onder zijn cap steken.
    let bestScore = Infinity;
    let best = null;
    let bestMd = 0;
    let bestTd = 0;
    let bestSlack = SLACK_LEVELS[0];

    for (const slack of SLACK_LEVELS) {
      // Snelpad: als bij dit (lage) slack-niveau al een opstelling bestaat
      // waarin niemand meer dan 9 min afwijkt, is verder zoeken zinloos.
      for (const pat of generateBlockPatterns(true)) {
        for (const capPrio of CAP_VARIANTS) {
          const r = evaluateBlocks(players, trainingCounts, priorityFlags, pat, maxMinutes, slack, ctx, capPrio);
          if (!r.schedule) continue;
          const devs = fairnessDevs(players, r).map(Math.abs);
          if (Math.max(...devs) <= 9) {
            const displayDevs = players.map((p) => Math.abs(r.mins[p] - r.targets[p]));
            return { blocks: r.blocks, schedule: r.schedule, targets: r.targets, mins: r.mins, isStrict: true, maxDev: Math.max(...displayDevs), totalDev: r.totalDev, slackUsed: slack };
          }
        }
      }

      for (const pat of generateBlockPatterns(false)) {
        for (const capPrio of CAP_VARIANTS) {
          const r = evaluateBlocks(players, trainingCounts, priorityFlags, pat, maxMinutes, slack, ctx, capPrio);
          if (!r.schedule) continue;
          const devs = fairnessDevs(players, r);
          const md = Math.max(...devs.map(Math.abs));
          const deviationCost = devs.reduce((s, d) => s + Math.pow(Math.max(0, Math.abs(d) - 5), 2), 0);
          const bigOutliers = devs.filter((d) => Math.abs(d) >= 10).length * 20000;
          const score = deviationCost * 200 + bigOutliers + md * 10000;
          if (score < bestScore) {
            bestScore = score;
            best = { blocks: r.blocks, schedule: r.schedule, targets: r.targets, mins: r.mins };
            // maxDev voor de WEERGAVE: ongewogen, op het gecapte streefgetal
            bestMd = Math.max(...players.map((p) => Math.abs(r.mins[p] - r.targets[p])));
            bestTd = r.totalDev;
            bestSlack = slack;
          }
        }
      }
    }

    if (best !== null) {
      return { ...best, isStrict: false, maxDev: bestMd, totalDev: bestTd, slackUsed: bestSlack };
    }
    return null;
  }

  const OpstellingLogic = {
    TOTAL_FIELD_MINUTES,
    BLOCK_OPTIONS,
    SLACK_LEVELS,
    computeDynamicPositionOrder,
    allowedInBlock,
    calculateTargetMinutes,
    positionRank,
    scarcityBonus,
    bipartiteMaxMatching,
    checkStructuralFeasibility,
    optimizePositionSwaps,
    generateBlockPatterns,
    buildBlocksFromPattern,
    generateSchedule,
    evaluateBlocks,
    chooseBestBlocks,
  };

  if (typeof module !== "undefined") {
    module.exports = OpstellingLogic;
  } else {
    root.OpstellingLogic = OpstellingLogic;
  }
})(typeof window !== "undefined" ? window : globalThis);
