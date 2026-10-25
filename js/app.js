// =====================================================
// App-bootstrap: state laden, schermen wisselen, de "Genereer opstelling"
// knop, en de gedeelde bewerker voor de tabbladen "Opstelling" (door de
// computer gemaakt, daarna vrij te bewerken) en "Eigen" (zelf bouwen).
// =====================================================

(function () {
  const state = loadState();
  const resultsEl = document.getElementById("results-content");
  const manualEl = document.getElementById("manual-content");


  // ---- Vangnet: een fout zichtbaar maken i.p.v. stil niets doen ----
  // Meestal betekent een fout dat de browser nog oude bestanden uit de cache
  // gebruikt naast nieuwe. "Verse versie laden" wist de offline-cache en laadt
  // alles opnieuw; je opgeslagen opstellingen en instellingen blijven bewaard.
  function toonFout(bericht) {
    let box = document.getElementById("fout-banner");
    if (!box) {
      box = document.createElement("div");
      box.id = "fout-banner";
      box.className = "banner banner--error";
      document.querySelector("main").prepend(box);
    }
    box.innerHTML = `<strong>Er ging iets mis.</strong> ${esc(bericht)}
      <div><button type="button" id="btn-herstel" class="mk-nav__btn" style="margin-top:8px">Verse versie laden</button></div>`;
    document.getElementById("btn-herstel").onclick = async () => {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (e) { /* niets aan te doen, toch herladen */ }
      location.reload();
    };
  }
  window.addEventListener("error", (e) => toonFout(e.message || "Onbekende fout"));
  window.addEventListener("unhandledrejection", (e) => toonFout(String((e.reason && e.reason.message) || e.reason || "Onbekende fout")));

  function persistAndRerenderTeam() {
    saveState(state);
    renderTeamScreen(state, persistAndRerenderTeam);
  }

  // Heeft een speler deze positie als favourite/alternative/emergency?
  function rankFromProfile(profiel, pos) {
    if (!profiel) return 999;
    const b = baseOf(pos);
    if (profiel.favourite.includes(b)) return 1;
    if (profiel.alternative.includes(b)) return 2;
    if (profiel.emergency.includes(b)) return 3;
    return 999;
  }

  // ---- Context voor de twee bewerkers ----
  function manualCtx() {
    const spelers = getSelectedNames(state);
    return {
      el: manualEl,
      model: state.manual,
      spelers,
      targets: ManualLineup.computeTargets(spelers, state.players, state.bonus0, state.bonus1),
      playerStates: state.players,
      options: { ns: "mk", mode: "builder", showTags: true, tableStyle: "new", showTableInEditor: false, maxMoment: Infinity },
      reset() {
        const leeg = ManualLineup.emptyLineup();
        state.manual = { blocks: [{ minutes: ManualLineup.DEFAULT_BLOCK_MINUTES, lineup: leeg }], currentBlock: 0, momentOverrides: {}, pick: null, finished: false };
      },
    };
  }

  function autoCtx() {
    const m = state.auto;
    if (!m) return null;
    return {
      el: resultsEl,
      model: m,
      spelers: m.selectie,
      targets: m.targets,
      playerStates: m.playerStates,
      options: {
        ns: "au", mode: "viewer", showTags: false, tableStyle: "old", showTableInEditor: true,
        maxMoment: AutoLineup.AUTO_LATEST_MOMENT,
        rankOf: (p, pos) => rankFromProfile(m.positions[p], pos),
        extraTop: (minutes) => renderSlackWarning(m.selectie, m.targets, minutes, m.slackUsed),
      },
    };
  }

  function rerenderManual() {
    renderEditor(manualCtx());
    saveState(state);
  }

  function rerenderResults() {
    const r = state.lastResult;
    if (!r) return; // niets te tonen (of een eigen melding staat er al)
    if (r.type === "shortage") { resultsEl.innerHTML = renderShortageBanner(r.shortages); return; }
    if (r.type === "no-schedule") { resultsEl.innerHTML = renderNoScheduleBanner(); return; }
    if (r.type === "ok" && state.auto) {
      renderEditor(autoCtx());
      saveState(state);
    }
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
    if (tab === "results") rerenderResults();
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

  // ---- Genereren ----
  function runGenerate() {
    const players = effectivePlayers(state);
    const selectie = getSelectedNames(state);

    if (selectie.length < 10) {
      state.lastResult = null;
      state.auto = null;
      resultsEl.innerHTML =
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
      state.auto = null;
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
      state.auto = null;
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
    };
    // Het gegenereerde resultaat wordt het startpunt van de bewerkbare opstelling.
    state.auto = AutoLineup.buildAutoModel(state.lastResult, state.players);
    saveState(state);
    switchTab("results");
  }

  document.getElementById("btn-generate").addEventListener("click", runGenerate);

  // ---- Gedeelde bewerker: bank, veld, wisselmomenten, blokduur, navigatie ----
  function pasBlokduurAan(ctx, nieuweWaarde, rerender) {
    const m = ctx.model;
    const oud = m.blocks.map((b) => ({ minutes: b.minutes }));
    // In het "viewer"-tabblad is het totaal al 90: dan verschuift de blokgrens
    // (het buurblok geeft tijd af of krijgt tijd). Bij het zelf bouwen
    // bepaal je elk blok los, zolang het totaal niet boven 90 komt.
    ManualLineup.resizeBlock(m.blocks, m.currentBlock, nieuweWaarde, ctx.options.mode === "viewer");
    m.momentOverrides = ManualLineup.rebaseOverrides(oud, m.blocks, m.momentOverrides);
    rerender();
  }

  // Afdrukken / opslaan als PDF: een aparte A4-pagina met alleen de opstelling,
  // die na het printen weer verdwijnt (zie print-sheet.js).
  function printOpstelling(ctx) {
    document.querySelectorAll("#print-sheet").forEach((n) => n.remove());
    const { el } = PrintSheet.build(ctx);
    document.body.appendChild(el);
    const opruimen = () => {
      el.remove();
      window.removeEventListener("afterprint", opruimen);
    };
    window.addEventListener("afterprint", opruimen);
    window.print();
  }

  function attachEditor(el, ns, getCtx, rerender) {
    el.addEventListener("click", (e) => {
      const ctx = getCtx();
      if (!ctx) return;
      const m = ctx.model;
      const o = ctx.options;
      const hit = (suffix) => e.target.closest(`#${ns}-${suffix}`);

      // De melding van de automatische verdeling verdwijnt bij de volgende actie
      if (!hit("optimize")) m.notice = null;

      // Speler van de bank: oppakken, loslaten, of (na een veldspeler) erin zetten
      const bench = e.target.closest("[data-mk-bench]");
      if (bench) {
        const naam = bench.dataset.mkBench;
        const lineup = m.blocks[m.currentBlock].lineup;
        if (m.pick && m.pick.pos) {
          lineup[m.pick.pos] = naam;
          m.pick = null;
        } else {
          m.pick = (m.pick && m.pick.bench === naam) ? null : { bench: naam };
        }
        rerender();
        return;
      }

      // Veldpositie aantikken
      const slot = e.target.closest("[data-mk-slot]");
      if (slot) {
        const pos = slot.dataset.mkSlot;
        const lineup = m.blocks[m.currentBlock].lineup;
        if (m.pick && m.pick.bench) {
          // Bankspeler plaatsen; stond er al iemand, dan gaat die naar de bank
          for (const [p2, sp] of Object.entries(lineup)) if (sp === m.pick.bench) lineup[p2] = null;
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
          m.pick = { pos };
        }
        rerender();
        return;
      }

      // Automatisch eerlijke wisselmomenten (alleen na een klik op de knop)
      if (hit("optimize")) {
        const caps = ManualLineup.computeCaps(ctx.spelers, ctx.playerStates);
        const res = ManualLineup.optimizeMoments(m.blocks, ctx.targets, caps, { maxMoment: o.maxMoment });
        m.momentOverrides = res.overrides;
        let tekst = res.veranderd === 0
          ? "De wisselmomenten stonden al zo eerlijk mogelijk - er is niets verschoven."
          : `${res.veranderd} ${res.veranderd === 1 ? "wissel" : "wissels"} verschoven voor eerlijkere minuten. Stel ze zo nodig nog bij met de pijltjes.`;
        if (res.capOvertreders.length) {
          tekst += ` Let op: ${res.capOvertreders.join(", ")} ${res.capOvertreders.length === 1 ? "blijft" : "blijven"} boven de ingestelde max, omdat er in de blokindeling geen wissel te verschuiven valt.`;
        }
        m.notice = tekst;
        rerender();
        return;
      }
      if (hit("resetmoments")) {
        m.momentOverrides = {};
        rerender();
        return;
      }

      // Wisselmoment verschuiven (per 2,5 min, zonder andere grenzen dan de aangrenzende blokken)
      const shift = e.target.closest("[data-mk-dir]");
      if (shift) {
        const row = shift.closest(".wissel-row");
        const blockIdx = Number(row.dataset.mkBlock);
        const key = row.dataset.mkPairkey;
        const richting = Number(shift.dataset.mkDir) * ManualLineup.SHIFT_STEP;
        const bounds = ManualLineup.blockBounds(m.blocks);
        if (!m.momentOverrides[blockIdx]) m.momentOverrides[blockIdx] = {};
        const huidig = m.momentOverrides[blockIdx][key] !== undefined ? m.momentOverrides[blockIdx][key] : bounds[blockIdx].start;
        const min_ = bounds[blockIdx - 1] ? bounds[blockIdx - 1].start : 0;
        const max_ = bounds[blockIdx].end;
        m.momentOverrides[blockIdx][key] = Math.max(min_, Math.min(max_, huidig + richting));
        rerender();
        return;
      }

      // Blokduur met de min/plus-knoppen
      const durStep = e.target.closest("[data-mk-dur-step]");
      if (durStep) {
        pasBlokduurAan(ctx, m.blocks[m.currentBlock].minutes + Number(durStep.dataset.mkDurStep), rerender);
        return;
      }

      // Navigatie
      if (hit("prev")) { m.currentBlock = Math.max(0, m.currentBlock - 1); m.pick = null; rerender(); return; }
      if (hit("next")) { m.currentBlock = Math.min(m.blocks.length - 1, m.currentBlock + 1); m.pick = null; rerender(); return; }

      if (hit("add")) {
        // Nieuw blok start als kopie van het huidige (zodat je alleen de
        // wissels hoeft aan te brengen), met een duur die niet over 90 gaat.
        const rest = ManualLineup.TOTAL_MATCH_MINUTES - ManualLineup.totalMinutes(m.blocks);
        const duur = Math.min(ManualLineup.DEFAULT_BLOCK_MINUTES, rest);
        m.blocks.push({ minutes: duur, lineup: { ...m.blocks[m.currentBlock].lineup } });
        m.currentBlock = m.blocks.length - 1;
        m.pick = null;
        rerender();
        return;
      }

      if (hit("finish")) { m.finished = true; m.pick = null; rerender(); return; }
      if (hit("back-edit")) { m.finished = false; rerender(); return; }
      if (hit("print")) { printOpstelling(ctx); return; }

      if (hit("reset") && ctx.reset) {
        if (!window.confirm("Weet je zeker dat je opnieuw wilt beginnen? Je eigen opstelling wordt gewist.")) return;
        ctx.reset();
        rerender();
        return;
      }
    });

    // Blokduur typen: accepteert zowel "22,5" als "22.5"
    el.addEventListener("change", (e) => {
      if (e.target.id !== `${ns}-duration`) return;
      const ctx = getCtx();
      if (!ctx) return;
      pasBlokduurAan(ctx, String(e.target.value).replace(",", "."), rerender);
    });
  }

  attachEditor(manualEl, "mk", manualCtx, rerenderManual);
  attachEditor(resultsEl, "au", autoCtx, rerenderResults);

  renderTeamScreen(state, persistAndRerenderTeam);

  // Als er van een vorige sessie nog een opstelling klaarstond, meteen tonen
  // (handig als de pagina midden in een wedstrijd ververst wordt).
  rerenderResults();

  if ("serviceWorker" in navigator) {
    // Neemt een nieuwe versie het over terwijl de app openstaat, dan één keer
    // herladen zodat je niet met een mix van oude en nieuwe bestanden zit.
    const hadController = !!navigator.serviceWorker.controller;
    let alHerladen = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !alHerladen) { alHerladen = true; location.reload(); }
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch((e) => console.warn("Service worker registratie mislukt:", e));
    });
  }
})();
