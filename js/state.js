// =====================================================
// Applicatiestatus + persistentie. Dit is een losstaande, offline PWA (geen
// Claude.ai-artifact), dus localStorage is hier het juiste, normale
// mechanisme om de teamselectie te bewaren tussen het openen van de app.
//
// Drie soorten status, met bewust verschillend gedrag:
//  - state.players / state.bonus0 / state.bonus1 / state.lastResult:
//    GEWOON gepersisteerd (blijft bewaard, ook na een refresh of het sluiten
//    van de app - handig als je midden in een wedstrijd zit).
//  - state.sessionPlayerOverrides ("wijzig posities" per speler) en
//    state.tempPlayers (tijdelijk toegevoegde spelers): NIET gepersisteerd,
//    zoals gevraagd - dit blijft alleen staan zolang de pagina niet ververst.
// =====================================================

const STORAGE_KEY = "opstelling-app-state-v1";

function defaultPlayerState() {
  return {
    selected: false,
    training: 2,
    priority: false,
    firstHalf: false,
    secondHalf: false,
    maxMinutes: 90,
  };
}

function loadState() {
  let saved = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (e) {
    console.warn("Kon opgeslagen status niet lezen, begin opnieuw.", e);
  }

  const state = {
    bonus0: saved?.bonus0 ?? 20,
    bonus1: saved?.bonus1 ?? 10,
    players: {},
    lastResult: saved?.lastResult ?? null,
    // Sessie-only (bewust NIET geladen uit opslag):
    sessionPlayerOverrides: {},
    tempPlayers: {},
    // Eigen (handmatige) opstelling - blijft bewaard, net als lastResult,
    // zodat een refresh midden in een wedstrijd niets weggooit. Staat
    // volledig los van de automatische opstelling: op "Genereer opstelling"
    // drukken raakt dit niet aan, zodat je beide kunt vergelijken.
    manual: saved?.manual ?? {
      blocks: [{ minutes: 22.5, lineup: null }],
      currentBlock: 0,
      momentOverrides: {},
      pick: null,
      finished: false,
    },
  };

  // Lege opstelling invullen voor blokken die nog geen lineup hebben
  for (const b of state.manual.blocks) {
    if (!b.lineup) {
      b.lineup = {};
      for (const pos of ["lb","sp","rb","cm1","cm2","cm3","la","cv1","cv2","ra"]) b.lineup[pos] = null;
    }
  }
  state.manual.pick = null; // selectie is sessie-only, nooit hersteld

  for (const name of Object.keys(PLAYERS)) {
    state.players[name] = { ...defaultPlayerState(), ...(saved?.players?.[name] || {}) };
  }
  return state;
}

function saveState(state) {
  try {
    // Alleen database-spelers persisteren, geen tijdelijke (die horen weg te
    // vallen zodra de pagina ververst wordt).
    const playersToSave = {};
    for (const name of Object.keys(PLAYERS)) playersToSave[name] = state.players[name];

    const toSave = {
      bonus0: state.bonus0,
      bonus1: state.bonus1,
      players: playersToSave,
      lastResult: state.lastResult,
      manual: {
        blocks: state.manual.blocks,
        currentBlock: state.manual.currentBlock,
        momentOverrides: state.manual.momentOverrides,
        finished: state.manual.finished,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn("Kon status niet opslaan (mogelijk privémodus).", e);
  }
}

// Combineert de vaste database met eventuele sessie-aanpassingen (handmatig
// gewijzigde posities) en tijdelijk toegevoegde spelers tot één object dat
// verder overal in de app gebruikt wordt i.p.v. het kale PLAYERS-object.
function effectivePlayers(state) {
  const merged = {};
  for (const [name, profiel] of Object.entries(PLAYERS)) {
    merged[name] = state.sessionPlayerOverrides[name] || profiel;
  }
  for (const [name, profiel] of Object.entries(state.tempPlayers)) {
    merged[name] = profiel;
  }
  return merged;
}

function getSelectedNames(state) {
  const players = effectivePlayers(state);
  return Object.keys(players).filter((p) => state.players[p] && state.players[p].selected);
}

function ensurePlayerState(state, name) {
  if (!state.players[name]) state.players[name] = { ...defaultPlayerState(), selected: true };
}
