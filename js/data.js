// Spelersdatabase - 1-op-1 overgenomen uit reference.py (PLAYERS dict).
// Volgorde is bewust hetzelfde als in het Python-bestand: op meerdere plekken
// (bv. "Positie overzicht", "Overig"-categorie) is de weergavevolgorde
// afhankelijk van de insertievolgorde van dit object, precies zoals Python's
// dict-insertievolgorde dat ook was.
const PLAYERS = {
  "Collin":  { favourite: ["lb"], alternative: ["rb"], emergency: ["sp"] },
  "Wout":    { favourite: ["rb"], alternative: ["lb"], emergency: ["sp"] },
  "Jaimy":   { favourite: ["sp"], alternative: ["lb", "rb"], emergency: [] },
  "Sjoerd":  { favourite: ["cm"], alternative: ["sp"], emergency: [] },
  "Pelle":   { favourite: ["cm"], alternative: ["sp", "lb", "rb"], emergency: [] },
  "Jorra":   { favourite: ["cm"], alternative: [], emergency: [] },
  "Tycho":   { favourite: ["cm"], alternative: [], emergency: [] },
  "Nord":    { favourite: ["ra"], alternative: ["la"], emergency: [] },
  "Dinand":  { favourite: ["ra", "la"], alternative: [], emergency: [] },
  "Sietse":  { favourite: ["ra"], alternative: ["la"], emergency: ["cv"] },
  "Stijn":   { favourite: ["cv"], alternative: [], emergency: ["ra", "la"] },
  "Xander":  { favourite: ["cv"], alternative: [], emergency: ["ra", "la"] },
  "Jens":    { favourite: ["cv"], alternative: ["ra", "la"], emergency: [] },
  "Roef":    { favourite: ["cv"], alternative: [], emergency: ["cm"] },
  "Chris":   { favourite: ["ra"], alternative: ["sp", "cv"], emergency: ["la", "rb", "lb"] },
  "Jamie":   { favourite: ["sp"], alternative: [], emergency: [] },
  "Luciano": { favourite: ["cm"], alternative: ["lb", "rb"], emergency: [] },
  "Julius":  { favourite: ["cv"], alternative: ["ra", "la"], emergency: ["cm"] },
  "Tobias":  { favourite: ["sp"], alternative: ["rb", "lb"], emergency: ["ra", "la"] },
  "Nicky":   { favourite: ["ra", "la"], alternative: ["lb", "rb"], emergency: ["cv"] },
};

const POSITION_CATEGORIES = [
  ["Aanvallers", ["sp", "lb", "rb"]],
  ["Middenvelders", ["cm"]],
  ["Verdedigers", ["la", "cv", "ra"]],
];
const SLOTS_PER_POS = { sp: 1, lb: 1, rb: 1, cm: 3, la: 1, cv: 2, ra: 1 };

if (typeof module !== "undefined") {
  module.exports = { PLAYERS, POSITION_CATEGORIES, SLOTS_PER_POS };
}
