// =====================================================
// App-bootstrap: state laden, schermen wisselen, de "Genereer opstelling"
// knop, en de handmatige wissel-interactie (bank <-> veld) met live
// herberekening van de eerlijkheid.
// =====================================================

(function () {
  const state = loadState();
  let swapPick = null; // { block, name, pos } - pos is null voor een bankspeler, anders de positie-sleutel

  function persistAndRerenderTeam() {
    saveState(state);
  
  renderTeamScreen(state, persistAndRerenderTeam);
  }

  function switchTab(tab) {
    const schermen = { team: "screen-team", results: "screen-results", manual: "screen-manual" };
    const knoppen = { team: "tab-btn-team", results: "tab-btn-results", manual: "tab-btn-manual" };
    for (const [naam, id] of Object.entries(schermen)) {
      document.getElementById(id).classList.toggle("is-active", naam === tab);
    }
    for (const [naam, id] of Object.entries(knoppen)) {
      const btn = document.getElementById(id);
      btn.classList.toggle("is-active", naam === tab);
      btn.setAttribute("aria-selected", String(naam === tab));
    }
    // De "Genereer opstelling"-knop hoort niet bij de eigen opstelling.
    document.querySelector(".action-bar").style.display = tab === "manual" ? "none" : "";
    if (tab === "manual") rerenderManual();
  }

  function rerenderManual() {
    renderManualScreen(state, {});
    saveState(state);
  }

  document.getElementById("tab-btn-team").addEventListener("click", () => switchTab("team"));
  document.getElementById("tab-btn-results").addEventListener("click", () => switchTab("results"));
  document.getElementById("tab-btn-manual").addEventListener("click", () => switchTab("manual"));
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });

  document.getElementById("input-bonus0").addEventListener("change", (e) => {
    state.bonus0 = Math.max(0, Math.min(30, Number(e.target.value) || 0));
    e.target.value = state.bonus0;
    saveState(state);
  });
  document.getElementById("input-bonus1").addEventListener("change", (e) => {
    state.bonus1 = Math.max(0, Math.min(30, Number(e.target.value) || 0));
    e.target.value = state.bonus1;
    saveState(state);
  });

  document.getElementById("btn-add-temp").addEventListener("click", () => {
    openAddTempPlayerModal(state, persistAndRerenderTeam);
  });

  function rerenderResultsFromLastResult() {
    const r = state.lastResult;
    if (!r || r.type !== "ok") return;
    const timeline = OpstellingSubs.computeFullTimeline(r.blocks, r.schedule, r.targets, r.mins, r.players, r.manualMomentOverrides);
    renderResults({ ...r, timeline }, swapPick);
    saveState(state);
  }

  function runGenerate() {
    const players = effectivePlayers(state);
    const selectie = getSelectedNames(state);
    swapPick = null;

    if (selectie.length < 10) {
      state.lastResult = null;
      document.getElementById("results-content").innerHTML =
        `<div class="banner banner--error"><strong>Minimaal 10 spelers nodig.</strong> Je hebt er nu ${selectie.length} geselecteerd.</div>`;
      switchTab("results");
      return;
    }

    const trainingCounts = {}, priorityFlags = {}, maxMinutes = {}, availabilityFlags = {};
    for (const p of selectie) {
      const ps = state.players[p];
      trainingCounts[p] = ps.training;
      priorityFlags[p] = ps.priority;
      maxMinutes[p] = ps.maxMinutes;
      availabilityFlags[p] = { first: ps.firstHalf, second: ps.secondHalf };
    }

    const positionsOrder = OpstellingLogic.computeDynamicPositionOrder(selectie, players);

    const shortages = OpstellingLogic.checkStructuralFeasibility(selectie, positionsOrder, availabilityFlags, players);
    const heeftTekort = Object.values(shortages).some((lst) => lst.length > 0);
    if (heeftTekort) {
      state.lastResult = { type: "shortage", shortages };
      renderResults(state.lastResult, null);
      saveState(state);
      switchTab("results");
      return;
    }

    const ctx = {
      PLAYERS: players, positionsOrder, availabilityFlags, maxMinutes,
      failureLog: [], bonus0: state.bonus0, bonus1: state.bonus1,
    };

    const res = OpstellingLogic.chooseBestBlocks(selectie, trainingCounts, priorityFlags, maxMinutes, ctx);

    if (res === null) {
      state.lastResult = { type: "no-schedule" };
      renderResults(state.lastResult, null);
      saveState(state);
      switchTab("results");
      return;
    }

    state.lastResult = {
      type: "ok",
      selectie,
      blocks: res.blocks,
      schedule: res.schedule,
      targets: res.targets,
      mins: res.mins,
      slackUsed: res.slackUsed,
      trainingCounts,
      positionsOrder,
      players, // momentopname van de effectieve profielen t.t.v. genereren
      manualMomentOverrides: {}, // { blokNaam: { "In→Uit": minuut } }
    };
    rerenderResultsFromLastResult();
    switchTab("results");
  }

  document.getElementById("btn-generate").addEventListener("click", runGenerate);

  // ---- Handmatig wisselen: bank<->veld EN veld<->veld, via event-delegation ----
  // swapPick = { block, name, pos } waarbij pos "null" is voor een bankspeler
  // en de exacte positie-sleutel (bv. "cv1") voor een veldspeler. Een geldige
  // wissel heeft minstens één kant met pos !== null (bank<->bank kan niet -
  // dat zijn twee spelers die allebei al niet op het veld staan).
  function handleSwapClick(newPick) {
    const isSamePick = swapPick && swapPick.block === newPick.block && swapPick.name === newPick.name && swapPick.pos === newPick.pos;

    if (isSamePick) {
      swapPick = null;
    } else if (swapPick && swapPick.block === newPick.block && (swapPick.pos !== null || newPick.pos !== null)) {
      const schedule = state.lastResult.schedule[newPick.block];
      if (swapPick.pos !== null) schedule[swapPick.pos] = newPick.name;
      if (newPick.pos !== null) schedule[newPick.pos] = swapPick.name;
      swapPick = null;
    } else {
      swapPick = newPick;
    }
    rerenderResultsFromLastResult();
  }

  document.getElementById("results-content").addEventListener("click", (e) => {
    const shiftBtn = e.target.closest(".wissel-shift");
    if (shiftBtn) {
      const row = shiftBtn.closest(".wissel-row");
      const block = row.dataset.block;
      const key = row.dataset.pairkey;
      const richting = Number(shiftBtn.dataset.dir); // -5 of +5

      const r = state.lastResult;
      const huidigeOverrides = r.manualMomentOverrides[block] || {};
      // Startpunt: een eventuele eerdere override, anders het huidige
      // (automatisch berekende) moment van dit paar.
      let huidigeMinuut = huidigeOverrides[key];
      if (huidigeMinuut === undefined) {
        const timeline = OpstellingSubs.computeFullTimeline(r.blocks, r.schedule, r.targets, r.mins, r.players, r.manualMomentOverrides);
        const momentPlan = timeline.allMomentPlans[block] || {};
        for (const m of Object.keys(momentPlan)) {
          if (momentPlan[m].some((pr) => OpstellingSubs.pairKey(pr[0], pr[1]) === key)) { huidigeMinuut = Number(m); break; }
        }
      }
      if (huidigeMinuut === undefined) return; // paar niet gevonden, niets te verschuiven

      if (!r.manualMomentOverrides[block]) r.manualMomentOverrides[block] = {};
      r.manualMomentOverrides[block][key] = huidigeMinuut + richting;
      rerenderResultsFromLastResult();
      return;
    }

    const benchBtn = e.target.closest('[data-swap-target="bench"]');
    const pitchGroup = e.target.closest('[data-swap-target="pitch"]');

    if (benchBtn) {
      handleSwapClick({ block: benchBtn.dataset.block, name: benchBtn.dataset.player, pos: null });
    } else if (pitchGroup) {
      handleSwapClick({ block: pitchGroup.dataset.block, name: pitchGroup.dataset.player, pos: pitchGroup.dataset.pos });
    }
  });


  // ---- Interacties op het "Eigen"-scherm ----
  const manualEl = document.getElementById("manual-content");

  manualEl.addEventListener("click", (e) => {
    const m = state.manual;

    // Speler van de bank oppakken / weer loslaten
    const bench = e.target.closest("[data-mk-bench]");
    if (bench) {
      const naam = bench.dataset.mkBench;
      m.pick = (m.pick && m.pick.bench === naam) ? null : { bench: naam };
      rerenderManual();
      return;
    }

    // Veldpositie aantikken
    const slot = e.target.closest("[data-mk-slot]");
    if (slot) {
      const pos = slot.dataset.mkSlot;
      const lineup = m.blocks[m.currentBlock].lineup;

      if (m.pick && m.pick.bench) {
        // Bankspeler plaatsen; stond er al iemand, dan gaat die naar de bank
        for (const [p2, sp] of Object.entries(lineup)) {
          if (sp === m.pick.bench) lineup[p2] = null; // was al ergens opgesteld
        }
        lineup[pos] = m.pick.bench;
        m.pick = null;
      } else if (m.pick && m.pick.pos) {
        // Twee veldposities: spelers ruilen van plek
        const a = m.pick.pos;
        const tmp = lineup[a];
        lineup[a] = lineup[pos];
        lineup[pos] = tmp;
        m.pick = null;
      } else if (lineup[pos]) {
        // Bezette positie aantikken: oppakken (nogmaals = naar de bank)
        m.pick = { pos };
      }
      rerenderManual();
      return;
    }

    // Wisselmoment verschuiven (per 2,5 min)
    const shift = e.target.closest("[data-mk-dir]");
    if (shift) {
      const row = shift.closest(".wissel-row");
      const blockIdx = Number(row.dataset.mkBlock);
      const key = row.dataset.mkPairkey;
      const richting = Number(shift.dataset.mkDir) * ManualLineup.SHIFT_STEP;
      const bounds = ManualLineup.blockBounds(m.blocks);
      const grens = bounds[blockIdx].start;
      if (!m.momentOverrides[blockIdx]) m.momentOverrides[blockIdx] = {};
      const huidig = m.momentOverrides[blockIdx][key] !== undefined ? m.momentOverrides[blockIdx][key] : grens;
      const nieuw = huidig + richting;
      // Binnen de twee aangrenzende blokken houden
      const min_ = bounds[blockIdx - 1] ? bounds[blockIdx - 1].start : 0;
      const max_ = bounds[blockIdx].end;
      m.momentOverrides[blockIdx][key] = Math.max(min_, Math.min(max_, nieuw));
      rerenderManual();
      return;
    }

    // Navigatie
    if (e.target.closest("#mk-prev")) { m.currentBlock = Math.max(0, m.currentBlock - 1); m.pick = null; rerenderManual(); return; }
    if (e.target.closest("#mk-next")) { m.currentBlock = Math.min(m.blocks.length - 1, m.currentBlock + 1); m.pick = null; rerenderManual(); return; }

    if (e.target.closest("#mk-add")) {
      // Nieuw blok start als kopie van het huidige (zodat je alleen de
      // wissels hoeft aan te brengen), met een duur die niet over 90 gaat.
      const gebruikt = ManualLineup.totalMinutes(m.blocks);
      const rest = ManualLineup.TOTAL_MATCH_MINUTES - gebruikt;
      const duur = Math.min(ManualLineup.DEFAULT_BLOCK_MINUTES, rest);
      m.blocks.push({ minutes: duur, lineup: { ...m.blocks[m.currentBlock].lineup } });
      m.currentBlock = m.blocks.length - 1;
      m.pick = null;
      rerenderManual();
      return;
    }

    if (e.target.closest("#mk-finish")) { m.finished = true; m.pick = null; rerenderManual(); return; }
    if (e.target.closest("#mk-back-edit")) { m.finished = false; rerenderManual(); return; }
    if (e.target.closest("#mk-print")) { window.print(); return; }

    if (e.target.closest("#mk-reset")) {
      if (!window.confirm("Weet je zeker dat je opnieuw wilt beginnen? Je eigen opstelling wordt gewist.")) return;
      const leeg = {};
      for (const pos of ManualLineup.FIELD_POSITIONS) leeg[pos] = null;
      state.manual = { blocks: [{ minutes: ManualLineup.DEFAULT_BLOCK_MINUTES, lineup: leeg }], currentBlock: 0, momentOverrides: {}, pick: null, finished: false };
      rerenderManual();
      return;
    }
  });

  manualEl.addEventListener("change", (e) => {
    if (e.target.id === "mk-duration") {
      const m = state.manual;
      let v = Number(e.target.value);
      if (!Number.isFinite(v) || v < 2.5) v = 2.5;
      v = Math.round(v / 2.5) * 2.5;
      const anderen = ManualLineup.totalMinutes(m.blocks) - m.blocks[m.currentBlock].minutes;
      v = Math.min(v, ManualLineup.TOTAL_MATCH_MINUTES - anderen);
      m.blocks[m.currentBlock].minutes = Math.max(2.5, v);
      rerenderManual();
    }
  });


  renderTeamScreen(state, persistAndRerenderTeam);

  // Als er van een vorige sessie nog een opstelling klaarstond, meteen tonen
  // (handig als de pagina midden in een wedstrijd ververst wordt).
  if (state.lastResult) {
    if (state.lastResult.type === "ok") {
      rerenderResultsFromLastResult();
    } else {
      renderResults(state.lastResult, null);
    }
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch((e) => console.warn("Service worker registratie mislukt:", e));
    });
  }
})();
