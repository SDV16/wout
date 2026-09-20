"""
Draait elk scenario uit scenarios.json door het originele Python-bestand
(reference.py) en dumpt de resultaten naar python_results.json. Dit is de
'grondwaarheid' waartegen de JS-poort (test_js_vs_python.js) wordt getoetst.

Gebruik:
    python3 dump_python_results.py
    node test_js_vs_python.js
"""
import sys, os, json, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import fake_streamlit
sys.modules["streamlit"] = fake_streamlit

with open(os.path.join(HERE, "scenarios.json")) as f:
    scenarios = json.load(f)

REFERENCE_PY = os.path.join(HERE, "reference.py")

fake_streamlit.button = lambda *a, **k: False
spec0 = importlib.util.spec_from_file_location("reference_bootstrap", REFERENCE_PY)
_bootstrap = importlib.util.module_from_spec(spec0)
spec0.loader.exec_module(_bootstrap)
PLAYERS_ORDER = list(_bootstrap.PLAYERS.keys())

results = {}

for sc in scenarios:
    naam = sc["name"]
    sel_set = set(sc["selectie"])
    selectie_ordered = [p for p in PLAYERS_ORDER if p in sel_set]

    training_counts = {p: sc.get("training_overrides", {}).get(p, sc["training_default"]) for p in selectie_ordered}
    priority_flags  = {p: sc.get("priority_overrides", {}).get(p, False) for p in selectie_ordered}
    max_minutes     = {p: sc.get("max_minutes_overrides", {}).get(p, 90) for p in selectie_ordered}
    avail_overrides = sc.get("availability_overrides", {})

    sel_names = set(selectie_ordered)

    def fake_radio(label, options=None, _tc=training_counts, **k):
        if label.startswith("Trainingen "):
            naam_speler = label[len("Trainingen "):]
            return _tc.get(naam_speler, options[0] if options else 0)
        return options[0] if options else 0

    def fake_number_input(label, *a, _mm=max_minutes, **k):
        if label == "Max minuten":
            key = k.get("key", "")
            if key.startswith("max_"):
                return _mm.get(key[4:], 90)
            return 90
        return k.get("value", 0)

    def fake_checkbox(label, key="", _sel=sel_names, _pf=priority_flags, _av=avail_overrides, **k):
        if key.startswith("sel_"):
            return key[4:] in _sel
        if key.startswith("prio_"):
            return _pf.get(key[5:], False)
        if key.startswith("fh_"):
            return _av.get(key[3:], {}).get("first", False)
        if key.startswith("sh_"):
            return _av.get(key[3:], {}).get("second", False)
        return False

    fake_streamlit.checkbox = fake_checkbox
    fake_streamlit.radio = fake_radio
    fake_streamlit.number_input = fake_number_input
    fake_streamlit.sidebar.number_input = lambda label, *a, _sc=sc, **k: (_sc["bonus_0"] if "0 tr" in label else _sc["bonus_1"])
    fake_streamlit.button = lambda *a, **k: True

    spec = importlib.util.spec_from_file_location(f"ogdump_{naam}", REFERENCE_PY)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except fake_streamlit._StopExec:
        pass

    entry = {"selectie": selectie_ordered}

    if hasattr(mod, "shortages"):
        entry["shortages"] = mod.shortages
    if hasattr(mod, "blocks") and mod.blocks is not None:
        entry["blocks"] = mod.blocks
        entry["targets"] = {p: mod.targets[p] for p in selectie_ordered}
        entry["schedule"] = {bn: dict(mod.schedule[bn]) for bn, _ in mod.blocks}
        entry["mins"] = {p: mod.mins.get(p, 0) for p in selectie_ordered}
        entry["slack_used"] = mod.slack_used
        entry["max_dev"] = mod.max_dev
        gekregen = {p: 0.0 for p in selectie_ordered}
        for sp, start, end in mod.all_active_intervals:
            if sp in gekregen:
                gekregen[sp] += (end - start)
        entry["gekregen_echt"] = gekregen
        entry["positions_order"] = mod.POSITIONS_ORDER
    else:
        entry["geen_opstelling"] = True

    results[naam] = entry
    status = 'shortage' if entry.get('shortages') and any(entry['shortages'].values()) else ('OK' if 'blocks' in entry else 'GEEN OPSTELLING')
    print(f"{naam}: {status}")

with open(os.path.join(HERE, "python_results.json"), "w") as f:
    json.dump(results, f, indent=2)

print("\nWeggeschreven naar python_results.json")
