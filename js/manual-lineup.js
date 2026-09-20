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
  const SHIFT_STEP = 2.5; // wisselmomenten verschuiven per 2,5 min

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
      targets[p] = Math.min(raw[p] + herverdeel, Math.min(cap, 90));
    }
    return targets;
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
  };

  if (typeof module !== "undefined") module.exports = ManualLineup;
  else root.ManualLineup = ManualLineup;
})(typeof window !== "undefined" ? window : globalThis);
