// =====================================================
// Rendering van het "Team"-scherm: categorie-kaarten met spelervinkjes en
// live tellers, instellingen per geselecteerde speler (incl. "wijzig
// posities"), en het toevoegen van een tijdelijke speler.
//
// Alles werkt op basis van effectivePlayers(state) - de database plus
// eventuele sessie-aanpassingen en tijdelijke spelers - i.p.v. het kale
// PLAYERS-object, zodat handmatige wijzigingen overal meteen doorwerken.
// =====================================================

function playerCanPlay(players, name, pos) {
  const p = players[name];
  return p.favourite.includes(pos) || p.alternative.includes(pos) || p.emergency.includes(pos);
}

function playerCategories(players, name) {
  const favs = players[name].favourite;
  const cats = POSITION_CATEGORIES.filter(([, posities]) => posities.some((p) => favs.includes(p))).map(([n]) => n);
  return cats.length ? cats : ["Overig"];
}

function groupPlayersByCategory(players) {
  const grouped = {};
  for (const [naam] of POSITION_CATEGORIES) grouped[naam] = [];
  grouped["Overig"] = [];
  for (const name of Object.keys(players)) {
    for (const cat of playerCategories(players, name)) grouped[cat].push(name);
  }
  return grouped;
}

function renderCategoryGroups(state, onChange) {
  const players = effectivePlayers(state);
  const container = document.getElementById("category-groups");
  container.innerHTML = "";
  const grouped = groupPlayersByCategory(players);
  const chipTpl = document.getElementById("tpl-player-chip");

  function makeChip(grid, name) {
    const node = chipTpl.content.cloneNode(true);
    const input = node.querySelector("input");
    const label = node.querySelector(".player-chip__name");
    label.textContent = name;
    ensurePlayerState(state, name);
    input.checked = state.players[name].selected;
    input.addEventListener("change", () => {
      state.players[name].selected = input.checked;
      onChange();
    });
    grid.appendChild(node);
  }

  for (const [catNaam, catPosities] of POSITION_CATEGORIES) {
    const card = document.createElement("div");
    card.className = "cat-card";

    const head = document.createElement("div");
    head.className = "cat-card__head";
    head.innerHTML = `<span class="cat-card__title">${catNaam}</span><span class="cat-card__positions">${catPosities.map((p) => p.toUpperCase()).join(" / ")}</span>`;
    card.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "chip-grid";
    for (const name of grouped[catNaam]) makeChip(grid, name);
    card.appendChild(grid);

    const counters = document.createElement("div");
    counters.className = "pos-counters";
    counters.dataset.catCounters = catNaam;
    card.appendChild(counters);

    container.appendChild(card);
  }

  if (grouped["Overig"].length) {
    const det = document.createElement("details");
    det.className = "overig-details";
    const sum = document.createElement("summary");
    sum.textContent = `Overig (${grouped["Overig"].length}, geen favourite-positie ingesteld)`;
    det.appendChild(sum);
    const grid = document.createElement("div");
    grid.className = "chip-grid";
    for (const name of grouped["Overig"]) makeChip(grid, name);
    det.appendChild(grid);
    container.appendChild(det);
  }

  updateCounters(state, players);
}

function updateCounters(state, players) {
  for (const [catNaam, catPosities] of POSITION_CATEGORIES) {
    const el = document.querySelector(`[data-cat-counters="${catNaam}"]`);
    if (!el) continue;
    el.innerHTML = "";
    for (const pos of catPosities) {
      const nodig = SLOTS_PER_POS[pos];
      const kunnen = Object.keys(players).filter((p) => state.players[p]?.selected && playerCanPlay(players, p, pos)).length;
      const span = document.createElement("span");
      span.className = "pos-counter " + (kunnen >= nodig ? "is-ok" : "is-short");
      span.textContent = `${kunnen >= nodig ? "\u2713" : "\u26A0"} ${pos.toUpperCase()} ${kunnen}/${nodig}`;
      el.appendChild(span);
    }
  }
}

// ---- "Wijzig posities": opent de modal met het gedeelde grid ----
function openPositionEditorFor(state, name, players, onChange) {
  const isTemp = !!state.tempPlayers[name];
  const base = isTemp ? state.tempPlayers[name] : (state.sessionPlayerOverrides[name] || PLAYERS[name]);
  const working = clonePositionProfile(base);

  openModal(`Wijzig posities \u2014 ${name}`, (body) => {
    const hint = document.createElement("p");
    hint.className = "modal-sheet__hint";
    hint.textContent = "Vink aan wat volgens jou als coach klopt. Dit geldt alleen op dit apparaat en verdwijnt bij het verversen van de pagina.";
    body.appendChild(hint);

    const gridEl = document.createElement("div");
    body.appendChild(gridEl);

    renderPositionGrid(gridEl, working, () => {
      if (isTemp) {
        state.tempPlayers[name] = working;
      } else {
        state.sessionPlayerOverrides[name] = working;
      }
      onChange();
    });
  });
}

function renderPlayerSettingsList(state, onChange) {
  const players = effectivePlayers(state);
  const list = document.getElementById("player-settings-list");
  const heading = document.getElementById("settings-heading");
  const emptyHint = document.getElementById("no-selection-hint");
  const selected = getSelectedNames(state);

  document.getElementById("selected-count").textContent = String(selected.length);

  list.innerHTML = "";
  heading.hidden = selected.length === 0;
  emptyHint.hidden = selected.length !== 0;

  const tpl = document.getElementById("tpl-player-settings");
  for (const name of selected) {
    const p = state.players[name];
    const node = tpl.content.cloneNode(true);
    const nameEl = node.querySelector(".player-settings__name");
    nameEl.textContent = name;
    if (state.tempPlayers[name]) {
      const tag = document.createElement("span");
      tag.className = "temp-tag";
      tag.textContent = "tijdelijk";
      nameEl.appendChild(tag);
    }

    node.querySelector(".btn-change-positions").addEventListener("click", () => {
      openPositionEditorFor(state, name, players, onChange);
    });

    const segBtns = node.querySelectorAll(".segmented--training button");
    segBtns.forEach((btn) => {
      btn.classList.toggle("is-active", Number(btn.dataset.val) === p.training);
      btn.addEventListener("click", () => {
        p.training = Number(btn.dataset.val);
        onChange();
      });
    });

    const prio = node.querySelector(".opt-priority");
    prio.checked = p.priority;
    prio.addEventListener("change", () => { p.priority = prio.checked; onChange(); });

    const fh = node.querySelector(".opt-fh");
    fh.checked = p.firstHalf;
    const sh = node.querySelector(".opt-sh");
    fh.addEventListener("change", () => { p.firstHalf = fh.checked; if (fh.checked) { p.secondHalf = false; sh.checked = false; } onChange(); });
    sh.checked = p.secondHalf;
    sh.addEventListener("change", () => { p.secondHalf = sh.checked; if (sh.checked) { p.firstHalf = false; fh.checked = false; } onChange(); });

    const maxmin = node.querySelector(".opt-maxmin");
    maxmin.value = p.maxMinutes;
    maxmin.addEventListener("change", () => {
      const v = Math.max(0, Math.min(90, Number(maxmin.value) || 0));
      p.maxMinutes = v;
      maxmin.value = v;
      onChange();
    });

    list.appendChild(node);
  }
}

// ---- "+ Tijdelijke speler toevoegen" ----
function openAddTempPlayerModal(state, onChange) {
  const working = { favourite: [], alternative: [], emergency: [] };
  openModal("Tijdelijke speler toevoegen", (body) => {
    const nameField = document.createElement("label");
    nameField.className = "field-full";
    nameField.innerHTML = `<span>Naam</span><input type="text" id="temp-name-input" placeholder="Bijv. Milan (invaller)" maxlength="30" />`;
    body.appendChild(nameField);

    const hint = document.createElement("p");
    hint.className = "modal-sheet__hint";
    hint.textContent = "Kies minstens één positie. Deze speler telt alleen mee voor deze sessie en verdwijnt bij het verversen van de pagina.";
    body.appendChild(hint);

    const gridEl = document.createElement("div");
    body.appendChild(gridEl);
    renderPositionGrid(gridEl, working, () => updateAddBtnState());

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "modal-primary";
    addBtn.textContent = "Toevoegen";
    body.appendChild(addBtn);

    const nameInput = nameField.querySelector("input");
    function hasAnyPosition() {
      return working.favourite.length || working.alternative.length || working.emergency.length;
    }
    function updateAddBtnState() {
      const naam = nameInput.value.trim();
      addBtn.disabled = !naam || !hasAnyPosition() || (naam in PLAYERS) || (naam in state.tempPlayers);
    }
    nameInput.addEventListener("input", updateAddBtnState);
    updateAddBtnState();

    addBtn.addEventListener("click", () => {
      const naam = nameInput.value.trim();
      if (!naam || !hasAnyPosition()) return;
      state.tempPlayers[naam] = working;
      ensurePlayerState(state, naam);
      state.players[naam].selected = true;
      closeModal();
      onChange();
    });
  });
}

function renderTeamScreen(state, onChange) {
  document.getElementById("input-bonus0").value = state.bonus0;
  document.getElementById("input-bonus1").value = state.bonus1;
  renderCategoryGroups(state, onChange);
  renderPlayerSettingsList(state, onChange);
}
