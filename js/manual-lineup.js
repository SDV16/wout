// =====================================================
// Kernlogica voor de HANDMATIGE ("Eigen") opstelling.
//
// Bewust volledig los van de automatische generator: hier bepaalt de coach
// alles zelf. Max minuten is hier dan ook geen harde grens meer (alleen het
// "recht op"-getal past zich aan), en er gelden geen limieten op het aantal
// wissels of het laatste wisselmoment. De enige harde regel die blijft, is
// de 1e/2e-helft-beschikbaarheid: wie maar een helft kan, is in de blokken
// van de andere helft simpelweg niet beschikbaar.
// =====================================================

(function (root) {
  const FIELD_POSITIONS = ["lb", "sp", "rb", "cm1", "cm2", "cm3", "la", "cv1", "cv2", "ra"];
  const DEFAULT_BLOCK_MINUTES = 22.5;
  const TOTAL_MATCH_MINUTES = 90;
  const SHIFT_STEP = 2.5; // wisselmomenten verschuiven per 2,5 min (de gebruiker)

  // Regels voor de COMPUTER bij het kiezen van wisselmomenten (de gebruiker
  // mag er zelf vrij van afwijken):
  const COMPUTER_GRID = 5;              // alleen hele 5 minuten: 10, 15, 20, 25, ...
  const HALFTIME_MINUTE = 45;           // de rust
  const HALFTIME_NO_SWAP_RADIUS = 10;   // niet binnen 10 min voor/na de rust (35-55), de rust zelf mag wel

  function baseOf(pos) {
    return pos.startsWith("cm") || pos.startsWith("cv") ? pos.slice(0, 2) : pos;
  }

  function emptyLineup() {
    const l = {};
    for (const pos of FIELD_POSITIONS) l[pos] = null;
    return l;
  }

  // Start- en eindminuut van elk blok, afgeleid uit de duur-lijst.
  function blockBounds(blocks) {
    const bounds = [];
    let t = 0;
    for (const b of blocks) {
      bounds.push({ start: t, end: t + b.minutes });
      t += b.minutes;
    }
    return bounds;
  }

  function totalMinutes(blocks) {
    return blocks.reduce((s, b) => s + b.minutes, 0);
  }

  // Is een speler beschikbaar in het blok dat op `start` begint?
  // Harde regel: 1e-helft-spelers verdwijnen vanaf minuut 45, 2e-helft-spelers
  // zijn pas vanaf minuut 45 zichtbaar.
  function availableInBlock(playerState, start) {
    if (!playerState) return true;
    if (playerState.firstHalf && start >= 45) return false;
    if (playerState.secondHalf && start < 45) return false;
    return true;
  }

  // ---- Wissels afleiden door twee opeenvolgende blokken te vergelijken ----
  // Geeft per blokovergang: wie eruit gaat, wie erin komt (met positie), en
  // wie op het veld blijft maar van positie wisselt.
  function deriveTransition(prevLineup, nextLineup) {
    const prevPlayers = new Set(Object.values(prevLineup).filter(Boolean));
    const nextPlayers = new Set(Object.values(nextLineup).filter(Boolean));

    const out = [...prevPlayers].filter((p) => !nextPlayers.has(p));
    const inn = [...nextPlayers].filter((p) => !prevPlayers.has(p));

    const posOf = (lineup, speler) => {
      for (const [pos, sp] of Object.entries(lineup)) if (sp === speler) return pos;
      return null;
    };

    // Positiewissels van spelers die blijven staan
    const moved = [];
    for (const sp of nextPlayers) {
      if (!prevPlayers.has(sp)) continue;
      const van = posOf(prevLineup, sp);
      const naar = posOf(nextLineup, sp);
      if (van && naar && baseOf(van) !== baseOf(naar)) {
        moved.push({ naam: sp, van: baseOf(van), naar: baseOf(naar) });
      }
    }

    // Koppel inkomende aan uitgaande spelers. Eerst wie letterlijk dezelfde
    // positie overneemt, daarna de rest op volgorde - zo ontstaat de
    // natuurlijkste lezing voor de coach.
    const pairs = [];
    const gebruikt = new Set();
    for (const i of inn) {
      const posI = posOf(nextLineup, i);
      const direct = out.find((o) => !gebruikt.has(o) && posOf(prevLineup, o) === posI);
      if (direct) {
        pairs.push({ in: i, uit: direct, pos: baseOf(posI), keten: null });
        gebruikt.add(direct);
      }
    }
    for (const i of inn) {
      if (pairs.some((pr) => pr.in === i)) continue;
      const posI = posOf(nextLineup, i);
      const o = out.find((x) => !gebruikt.has(x));
      if (!o) {
        // Meer spelers erin dan eruit (kan alleen bij een onvolledig blok)
        pairs.push({ in: i, uit: null, pos: posI ? baseOf(posI) : null, keten: null });
        continue;
      }
      gebruikt.add(o);
      const posO = posOf(prevLineup, o);
      // Als de inkomende speler op een andere plek staat dan waar de
      // uitgaande speler stond, zoek de speler die dat gat opvulde.
      let keten = null;
      if (posI && posO && baseOf(posI) !== baseOf(posO)) {
        const schuiver = moved.find((m) => m.van === baseOf(posI) && m.naar === baseOf(posO));
        if (schuiver) keten = schuiver;
      }
      pairs.push({ in: i, uit: o, pos: posI ? baseOf(posI) : null, uitPos: posO ? baseOf(posO) : null, keten });
    }

    // Spelers die eruit gaan zonder dat iemand hun plek inneemt
    for (const o of out) {
      if (gebruikt.has(o)) continue;
      pairs.push({ in: null, uit: o, pos: null, keten: null });
    }

    return { pairs, moved };
  }

  // Standaard wisselmoment = precies op de blokgrens.
  function defaultMomentFor(bounds, blockIndex) {
    return bounds[blockIndex].start;
  }

  function pairKey(pr) {
    return `${pr.in || "-"}>${pr.uit || "-"}`;
  }

  // ---- Werkelijke speelminuten, inclusief handmatig verschoven wissels ----
  // momentOverrides: { [blockIndex]: { [pairKey]: minuut } }
  //
  // Model: elke speler levert per blok waarin hij staat PRECIES EEN interval.
  //   start = zijn eigen instroommoment (als hij bij dit blok invalt), anders
  //           de blokgrens;
  //   eind  = zijn eigen uitstroommoment (als hij na dit blok gewisseld wordt),
  //           anders het blokeinde.
  // Zo kan een verschoven wisselmoment nooit dubbel geteld worden.
  function computeMinutes(blocks, momentOverrides) {
    momentOverrides = momentOverrides || {};
    const bounds = blockBounds(blocks);
    const minutes = {};
    const posMinutes = {};

    function add(sp, pos, dur) {
      if (!sp || dur <= 0) return;
      minutes[sp] = (minutes[sp] || 0) + dur;
      if (pos) {
        const b = baseOf(pos);
        if (!posMinutes[sp]) posMinutes[sp] = {};
        posMinutes[sp][b] = (posMinutes[sp][b] || 0) + dur;
      }
    }

    // Momenten van de overgang NAAR blok `idx` (dus tussen idx-1 en idx).
    function transitionMoments(idx) {
      const result = { in: {}, uit: {} };
      if (idx <= 0 || idx >= blocks.length) return result;
      const { pairs } = deriveTransition(blocks[idx - 1].lineup, blocks[idx].lineup);
      const overrides = momentOverrides[idx] || {};
      const grens = bounds[idx].start;
      for (const pr of pairs) {
        const ruw = overrides[pairKey(pr)] !== undefined ? overrides[pairKey(pr)] : grens;
        // Een wissel mag nooit buiten de twee aangrenzende blokken vallen.
        const m = Math.max(bounds[idx - 1].start, Math.min(bounds[idx].end, ruw));
        if (pr.in) result.in[pr.in] = m;
        if (pr.uit) result.uit[pr.uit] = m;
      }
      return result;
    }

    const momentsPerBlock = blocks.map((_, i) => transitionMoments(i));

    blocks.forEach((blok, idx) => {
      const { start, end } = bounds[idx];
      const naarDit = momentsPerBlock[idx];
      const naarVolgend = idx + 1 < blocks.length ? momentsPerBlock[idx + 1] : { in: {}, uit: {} };

      for (const [pos, sp] of Object.entries(blok.lineup)) {
        if (!sp) continue;
        const s = naarDit.in[sp] !== undefined ? naarDit.in[sp] : start;
        const e = naarVolgend.uit[sp] !== undefined ? naarVolgend.uit[sp] : end;
        add(sp, pos, e - s);
      }
    });

    return { minutes, posMinutes };
  }

  // ---- "Recht op"-minuten voor de handmatige modus ----
  // Zelfde eerlijke verdeling als de generator, en Max minuten / een
  // 1e-2e-helft-beperking verlagen het streefgetal - maar dat is hier puur
  // informatief: de coach mag er bewust overheen gaan.
  function computeTargets(spelers, playerStates, bonus0, bonus1) {
    const n = spelers.length;
    if (!n) return {};
    const base = (TOTAL_MATCH_MINUTES * 10) / n;
    const raw = {};
    let removed = 0;
    for (const p of spelers) {
      const st = playerStates[p] || {};
      const tr = st.training !== undefined ? st.training : 2;
      if (tr === 0) { raw[p] = base - bonus0; removed += bonus0; }
      else if (tr === 1) { raw[p] = base - bonus1; removed += bonus1; }
      else { raw[p] = base; }
    }
    const herverdeel = removed / n;
    const targets = {};
    for (const p of spelers) {
      const st = playerStates[p] || {};
      let cap = st.maxMinutes !== undefined ? st.maxMinutes : 90;
      if (st.firstHalf || st.secondHalf) cap = Math.min(cap, 45);
      // 'Recht op' is altijd een heel getal (zo klopt wat je op het scherm ziet
      // met de kleur/het vinkje dat daaruit volgt).
      targets[p] = Math.round(Math.min(raw[p] + herverdeel, Math.min(cap, 90)));
    }
    return targets;
  }

  // Rondt een set 'recht op'-getallen af op hele minuten.
  function roundTargets(targets) {
    const out = {};
    for (const [p, v] of Object.entries(targets || {})) out[p] = Math.round(v);
    return out;
  }


  // Mag de computer op dit moment wisselen? Alleen op hele 5 minuten, en niet
  // vlak voor of na de rust (strikt tussen minuut 35 en 55), zodat niemand voor
  // minder dan 10 minuten in het veld staat. De rust zelf (45) mag wel, evenals
  // precies 35 en 55 (dan blijft er net 10 minuten over).
  function isComputerMoment(m) {
    const EPS = 1e-9;
    if (Math.abs(m / COMPUTER_GRID - Math.round(m / COMPUTER_GRID)) > EPS) return false;
    const afstand = Math.abs(m - HALFTIME_MINUTE);
    return !(afstand > EPS && afstand < HALFTIME_NO_SWAP_RADIUS - EPS);
  }

  // ---- Automatisch eerlijke wisselmomenten bepalen ----
  // Past ALLEEN de tijdstippen van bestaande wissels aan; nooit wie er
  // wisselt. Regels voor de computer (de gebruiker zelf mag die later met de
  // pijltjes wel overtreden):
  //   - alleen op hele 5 minuten (10, 15, 20, 25, ...), nooit op 2,5;
  //   - niet in de 10 minuten voor of na de rust (tussen minuut 35 en 55; de
  //     rust zelf, minuut 45, mag wel);
  //   - maximaal 2 wissels per moment (bij de rust mogen ze allemaal
  //     tegelijk, zoals in het echt);
  //   - niemand mag boven zijn cap (Max minuten / 1e-2e helft) uitkomen;
  //   - optioneel (opts.maxMoment): geen wissels na een bepaalde minuut;
  //   - een wissel blijft binnen maximaal 10 minuten rond de blokgrens en
  //     binnen de helft van beide aangrenzende blokken, zodat wissels van
  //     opeenvolgende overgangen elkaar nooit kunnen kruisen.
  // Methode: lokaal zoeken (steeds de beste verbetering) op de som van de
  // gekwadrateerde afwijkingen t.o.v. "recht op". Volledig deterministisch.
  function optimizeMoments(blocks, targets, caps, opts) {
    caps = caps || {};
    opts = opts || {};
    const EPS = 1e-9;
    const latest = opts.maxMoment !== undefined ? opts.maxMoment : Infinity;
    const bounds = blockBounds(blocks);

    const trans = [];
    for (let i = 1; i < blocks.length; i++) {
      const { pairs } = deriveTransition(blocks[i - 1].lineup, blocks[i].lineup);
      const volledig = pairs.filter((p) => p.in && p.uit);
      if (!volledig.length) continue;
      const B = bounds[i].start;
      const voor = Math.min(10, blocks[i - 1].minutes / 2);
      const na = Math.min(10, blocks[i].minutes / 2, Math.max(0, latest - B));
      const momenten = [];
      for (let m = Math.ceil((B - voor) / COMPUTER_GRID - EPS) * COMPUTER_GRID; m <= B + na + EPS; m += COMPUTER_GRID) {
        if (isComputerMoment(m) && m <= latest + EPS) momenten.push(m);
      }
      // Geen toegestaan moment in het venster (kan alleen bij heel korte
      // blokken): dan blijft de wissel op de blokgrens staan.
      if (!momenten.length) momenten.push(B);
      trans.push({
        idx: i,
        boundary: B,
        momenten,
        pairs: volledig.map((p) => ({ key: pairKey(p), in: p.in, uit: p.uit, mi: -1 })),
      });
    }

    const base = computeMinutes(blocks, {}).minutes;
    const capaciteit = (m) => (Math.abs(m - HALFTIME_MINUTE) < EPS ? Infinity : 2);
    // Hoeveel wissels staan nu op dit moment (over alle overgangen heen)?
    const gebruik = (m, behalve) => {
      let n = 0;
      for (const t of trans) for (const p of t.pairs) if (p !== behalve && t.momenten[p.mi] === m) n++;
      return n;
    };

    function totalsFor() {
      const tot = { ...base };
      for (const t of trans) {
        for (const pr of t.pairs) {
          const d = t.momenten[pr.mi] - t.boundary;
          tot[pr.uit] = (tot[pr.uit] || 0) + d;
          tot[pr.in] = (tot[pr.in] || 0) - d;
        }
      }
      return tot;
    }

    function cost() {
      const tot = totalsFor();
      let c = 0;
      for (const sp of Object.keys(tot)) {
        const t = targets[sp];
        if (t === undefined) continue;
        const d = tot[sp] - t;
        c += d * d;
        const cap = caps[sp];
        if (cap !== undefined && tot[sp] > cap + 1e-9) {
          const over = tot[sp] - cap;
          c += 1000 * over * over; // cap is hard: zwaar bestraffen
        }
      }
      // Gelijkspel: liever dicht bij de blokgrens
      for (const t of trans) for (const pr of t.pairs) c += 0.001 * Math.abs(t.momenten[pr.mi] - t.boundary);
      return c;
    }

    // Stap 1: elke wissel naar het dichtstbijzijnde toegestane moment met ruimte.
    for (const t of trans) {
      for (const pr of t.pairs) {
        let beste = 0, besteAfstand = Infinity, besteVrij = false;
        t.momenten.forEach((m, j) => {
          const vrij = gebruik(m, pr) < capaciteit(m);
          const afstand = Math.abs(m - t.boundary);
          if ((vrij && !besteVrij) || (vrij === besteVrij && afstand < besteAfstand - EPS)) {
            beste = j; besteAfstand = afstand; besteVrij = vrij;
          }
        });
        pr.mi = beste;
      }
    }

    // Stap 2: lokaal verbeteren met verplaatsingen en onderlinge ruil.
    let huidig = cost();
    for (let iter = 0; iter < 1000; iter++) {
      let besteKost = huidig - 1e-9, beste = null;
      for (const t of trans) {
        for (const pr of t.pairs) {
          const oud = pr.mi;
          for (let j = 0; j < t.momenten.length; j++) {
            if (j === oud) continue;
            if (gebruik(t.momenten[j], pr) >= capaciteit(t.momenten[j])) continue;
            pr.mi = j;
            const c = cost();
            pr.mi = oud;
            if (c < besteKost) { besteKost = c; beste = { type: "move", pr, j }; }
          }
        }
        for (let a = 0; a < t.pairs.length; a++) {
          for (let b = a + 1; b < t.pairs.length; b++) {
            const A = t.pairs[a], B = t.pairs[b];
            if (A.mi === B.mi) continue;
            const ma = A.mi, mb = B.mi;
            A.mi = mb; B.mi = ma;
            const c = cost();
            A.mi = ma; B.mi = mb;
            if (c < besteKost) { besteKost = c; beste = { type: "swap", A, B, ma, mb }; }
          }
        }
      }
      if (!beste) break;
      if (beste.type === "move") beste.pr.mi = beste.j;
      else { beste.A.mi = beste.mb; beste.B.mi = beste.ma; }
      huidig = besteKost;
    }

    // Alleen wissels die van de blokgrens afwijken krijgen een eigen tijdstip.
    const overrides = {};
    let veranderd = 0;
    for (const t of trans) {
      for (const pr of t.pairs) {
        const m = t.momenten[pr.mi];
        if (Math.abs(m - t.boundary) < EPS) continue;
        if (!overrides[t.idx]) overrides[t.idx] = {};
        overrides[t.idx][pr.key] = m;
        veranderd++;
      }
    }
    const totals = totalsFor();
    const capOvertreders = Object.keys(totals).filter((sp) => caps[sp] !== undefined && totals[sp] > caps[sp] + 1e-9);
    return { overrides, totals, veranderd, capOvertreders };
  }

  // Harde bovengrens per speler voor de automatische verdeling.
  function computeCaps(spelers, playerStates) {
    const caps = {};
    for (const p of spelers) {
      const st = playerStates[p] || {};
      let cap = st.maxMinutes !== undefined ? st.maxMinutes : 90;
      if (st.firstHalf || st.secondHalf) cap = Math.min(cap, 45);
      caps[p] = Math.min(cap, 90);
    }
    return caps;
  }


  // ---- Blokduur aanpassen ----
  // compensate=true: de tijd schuift mee met het volgende blok (bij het laatste
  // blok met het vorige), zodat het totaal gelijk blijft - je verplaatst als
  // het ware de blokgrens. compensate=false: het blok wordt gewoon korter of
  // langer, zolang het totaal niet boven 90 uitkomt.
  function resizeBlock(blocks, idx, wanted, compensate) {
    const MIN = 2.5;
    const huidig = blocks[idx].minutes;
    let v = Number(wanted);
    if (!Number.isFinite(v)) v = huidig;
    v = Math.max(MIN, Math.round(v / 2.5) * 2.5);
    if (compensate && blocks.length > 1) {
      const buur = idx + 1 < blocks.length ? idx + 1 : idx - 1;
      v = Math.min(v, huidig + (blocks[buur].minutes - MIN));
      const delta = v - huidig;
      blocks[idx].minutes = v;
      blocks[buur].minutes -= delta;
    } else {
      const anderen = totalMinutes(blocks) - huidig;
      blocks[idx].minutes = Math.max(MIN, Math.min(v, TOTAL_MATCH_MINUTES - anderen));
    }
  }

  // Wisselmomenten zijn absolute minuten. Verschuift een blokgrens, dan
  // verschuift de wissel mee (zelfde afstand tot de grens), binnen de twee
  // aangrenzende blokken.
  function rebaseOverrides(oldBlocks, newBlocks, overrides) {
    const oudB = blockBounds(oldBlocks), nieuwB = blockBounds(newBlocks);
    const out = {};
    for (const [idxStr, per] of Object.entries(overrides || {})) {
      const i = Number(idxStr);
      if (!oudB[i] || !nieuwB[i]) continue;
      const lo = i > 0 ? nieuwB[i - 1].start : 0;
      const hi = nieuwB[i].end;
      for (const [key, m] of Object.entries(per)) {
        if (!out[i]) out[i] = {};
        out[i][key] = Math.max(lo, Math.min(hi, nieuwB[i].start + (m - oudB[i].start)));
      }
    }
    return out;
  }

  // Kleurklasse volgens de afgesproken grenzen: 0-4 groen, 5-9 oranje, 10+ rood.
  function diffClass(gekregen, target) {
    const d = Math.abs(gekregen - target);
    if (d < 5) return "mk-green";
    if (d < 10) return "mk-orange";
    return "mk-red";
  }

  const ManualLineup = {
    FIELD_POSITIONS, DEFAULT_BLOCK_MINUTES, TOTAL_MATCH_MINUTES, SHIFT_STEP,
    baseOf, emptyLineup, blockBounds, totalMinutes, availableInBlock,
    deriveTransition, defaultMomentFor, pairKey, computeMinutes, computeTargets, diffClass,
    optimizeMoments, computeCaps, resizeBlock, rebaseOverrides, roundTargets,
    isComputerMoment, COMPUTER_GRID, HALFTIME_MINUTE, HALFTIME_NO_SWAP_RADIUS,
  };

  if (typeof module !== "undefined") module.exports = ManualLineup;
  else root.ManualLineup = ManualLineup;
})(typeof window !== "undefined" ? window : globalThis);
