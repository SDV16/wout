import streamlit as st
from collections import defaultdict
import math
active_time = defaultdict(list)
failure_log = defaultdict(list)

st.set_page_config(layout="wide")

# =====================================================
# SPELERSDATABASE
# =====================================================
PLAYERS = {
    "Jannick": {"favourite":["ra"], "alternative":["rb", "lb"], "emergency":["la"]},
    "Collin": {"favourite":["lb"], "alternative":["rb"], "emergency":["sp"]},
    "Wout": {"favourite":["rb"], "alternative":["lb"], "emergency":["sp"]},
    "Jaimy": {"favourite":["sp"], "alternative":["lb","rb"], "emergency":[]},
    "Sjoerd": {"favourite":["cm"], "alternative":["sp"], "emergency":[]},
    "Pelle": {"favourite":["sp", "rb"], "alternative":["cm", "lb"], "emergency":[]},
    "Jorra": {"favourite":["cm"], "alternative":[], "emergency":[]},
    "Tycho": {"favourite":["cm"], "alternative":[], "emergency":[]},
    "Nord": {"favourite":["la"], "alternative":["ra"], "emergency":["cv"]},
    "Dinand": {"favourite":["ra", "la"], "alternative":[], "emergency":[]},
    "Sietse": {"favourite":["ra"], "alternative":["la"], "emergency":["cv"]},
    "Stijn": {"favourite":["cv"], "alternative":[], "emergency":["ra", "la"]},
    "Xander": {"favourite":["cv"], "alternative":[], "emergency":["ra","la"]},
    "Jens": {"favourite":["cv"], "alternative":[], "emergency":["ra","la"]},
    "Roef": {"favourite":["cv"], "alternative":[], "emergency":["cm"]},
    "Chris": {"favourite":["ra"], "alternative":["sp", "cv"], "emergency":["la", "rb", "lb"]},
    "Julius": {"favourite":["cv"], "alternative":["ra", "la"], "emergency":[]},
    "Tobias": {"favourite":["sp"], "alternative":["rb", "lb"], "emergency":[]},
    "Nicky": {"favourite":["ra", "la"], "alternative":[], "emergency":["cv"]},
    "Leon": {"favourite":["cm"], "alternative":[""], "emergency":["lb", "rb"]},
    "Cas": {"favourite":["sp", "lb", "rb"], "alternative":["cm"], "emergency":[]},
    "Teun": {"favourite":["sp"], "alternative":["lb", "rb"], "emergency":["cm"]},
    "Lukas": {"favourite":["cv"], "alternative":[], "emergency":["la", "ra"]},
    "Abel": {"favourite":["lb", "rb"], "alternative":[], "emergency":[]},
    "Niels": {"favourite":["ra", "la"], "alternative":["cm"], "emergency":[]},
    "Tim": {"favourite":["cm"], "alternative":["sp"], "emergency":[]},
    "Steijn": {"favourite":["cm"], "alternative":[], "emergency":["sp"]},
}

def compute_dynamic_position_order(players):
    base_positions = ["sp", "cv", "cm", "lb", "rb", "la", "ra"]

    def count_pool(bp):
        fav   = sum(bp in PLAYERS[p]["favourite"]    for p in players)
        alt   = sum(bp in PLAYERS[p]["alternative"]  for p in players)
        emg   = sum(bp in PLAYERS[p]["emergency"]    for p in players)
        total = fav + alt + emg
        return total, fav, alt, emg

    sorted_bases = sorted(base_positions, key=lambda bp: count_pool(bp))

    expanded = []
    for bp in sorted_bases:
        if bp == "cm":
            expanded += ["cm1", "cm2", "cm3"]
        elif bp == "cv":
            expanded += ["cv1", "cv2"]
        else:
            expanded.append(bp)

    return expanded

TOTAL_FIELD_MINUTES = 90 * 10
BLOCK_OPTIONS = [30, 22.5, 20, 15, 10]

SLACK_LEVELS = [5, 10, 20, 35, 60, 999]

st.title("Opstelling Generator – Eerlijke Minuten & Dynamische Blokken")

st.sidebar.header("Training aftrek")
bonus_1 = st.sidebar.number_input("Aftrek bij 1 training", 0, 30, 10)
bonus_0 = st.sidebar.number_input("Aftrek bij 0 trainingen", 0, 30, 20)

st.header("Selecteer spelers")

POSITION_CATEGORIES = [
    ("Aanvallers",    ["sp", "lb", "rb"]),
    ("Middenvelders", ["cm"]),
    ("Verdedigers",   ["la", "cv", "ra"]),
]
SLOTS_PER_POS = {"sp": 1, "lb": 1, "rb": 1, "cm": 3, "la": 1, "cv": 2, "ra": 1}

def player_categories(player):
    favs = PLAYERS[player]["favourite"]
    cats = [naam for naam, posities in POSITION_CATEGORIES if any(f in posities for f in favs)]
    return cats if cats else ["Overig"]

grouped = {naam: [] for naam, _ in POSITION_CATEGORIES}
grouped["Overig"] = []
for player in PLAYERS:
    for cat in player_categories(player):
        grouped[cat].append(player)

is_checked = {}

cat_cols = st.columns(len(POSITION_CATEGORIES))

for (cat_naam, cat_posities), col in zip(POSITION_CATEGORIES, cat_cols):
    with col:
        st.markdown(f"**{cat_naam}**")
        st.caption(" / ".join(p.upper() for p in cat_posities))

        spelers_hier = grouped[cat_naam]
        helft = (len(spelers_hier) + 1) // 2

        sub_a, sub_b = st.columns(2)

        for idx, player in enumerate(spelers_hier):
            doelkolom = sub_a if idx < helft else sub_b

            with doelkolom:
                is_checked[player] = st.checkbox(
                    player,
                    key=f"sel_{player}"
                )

for (cat_naam, cat_posities), col in zip(POSITION_CATEGORIES, cat_cols):
    with col:
        tellers = []

        for pos in cat_posities:
            nodig = SLOTS_PER_POS[pos]

            spelers_die_pos_kunnen = sum(
                1
                for p in PLAYERS
                if is_checked.get(p, False)
                and (
                    pos in PLAYERS[p]["favourite"]
                    or pos in PLAYERS[p]["alternative"]
                    or pos in PLAYERS[p]["emergency"]
                )
            )

            teken = "✅" if spelers_die_pos_kunnen >= nodig else "⚠️"

            tellers.append(
                f"{teken} {pos.upper()}: {spelers_die_pos_kunnen}/{nodig}"
            )

        st.caption("  \n".join(tellers))

if grouped["Overig"]:
    with st.expander("Overig (geen favourite positie ingesteld)"):
        for player in grouped["Overig"]:
            is_checked[player] = st.checkbox(player, key=f"sel_{player}")

st.divider()

selected_players = {}
training_counts  = {}
priority_flags   = {}
max_minutes      = {}

availability_flags = defaultdict(lambda: {"first": False, "second": False})

geselecteerd = [player for player in PLAYERS if is_checked.get(player)]

if geselecteerd:
    st.subheader(f"Instellingen per speler ({len(geselecteerd)} geselecteerd)")
    for player in geselecteerd:
        col1, col2, col3 = st.columns([1, 2, 2])

        with col1:
            st.markdown(f"**{player}**")

        with col2:
            trainingen = st.radio(
                f"Trainingen {player}",
                options=[0, 1, 2],
                format_func=lambda x: f"{x} trainingen",
                horizontal=True,
                key=f"train_{player}"
            )

        with col3:
            c1, c2, c3, c4 = st.columns(4)

            with c1:
                priority = st.checkbox("Voorang", key=f"prio_{player}")
            with c2:
                first_half_only  = st.checkbox("1ste Helft", key=f"fh_{player}")
            with c3:
                second_half_only = st.checkbox("2de Helft",  key=f"sh_{player}")
            with c4:
                max_min = st.number_input(
                    "Max minuten",
                    min_value=0, max_value=90, value=90, step=5,
                    key=f"max_{player}"
                )

        selected_players[player]       = PLAYERS[player]
        training_counts[player]        = trainingen
        priority_flags[player]         = priority
        max_minutes[player]            = max_min
        availability_flags[player]     = {"first": first_half_only, "second": second_half_only}
else:
    st.info("Selecteer hierboven spelers om per speler trainingen, voorrang en beschikbaarheid in te stellen.")


def allowed_in_block(player, block_name, availability_flags):
    start = int(block_name.split("-")[0])
    fh    = availability_flags[player]["first"]
    sh    = availability_flags[player]["second"]
    if not fh and not sh:
        return True
    if fh and start >= 45:
        return False
    if sh and start < 45:
        return False
    return True

def calculate_target_minutes(players, training_counts, max_minutes, availability_flags=None):
    """
    Geeft (targets, uncapped) terug:
    - targets: het GECAPTE streefgetal (= "Recht op" in de tabel), begrensd
      door Max minuten EN door een 1e/2e-helft-beperking (max 45, want
      fysiek kan iemand dan nooit meer spelen).
    - uncapped: het streefgetal ZONDER die caps, puur op trainingen/
      herverdeling. Wordt alleen gebruikt als referentie bij het
      prioriteren in generate_schedule, nooit voor de weergave.
    """
    n    = len(players)
    base = TOTAL_FIELD_MINUTES / n
    raw  = {}
    total_removed = 0
    for p in players:
        if training_counts[p] == 0:
            raw[p] = base - bonus_0
            total_removed += bonus_0
        elif training_counts[p] == 1:
            raw[p] = base - bonus_1
            total_removed += bonus_1
        else:
            raw[p] = base
    redistribute = total_removed / n if n > 0 else 0
    uncapped = {}
    final    = {}
    for p in players:
        candidate    = raw[p] + redistribute
        uncapped[p]  = candidate
        cap          = max_minutes.get(p, 90)
        if availability_flags is not None:
            flags = availability_flags[p]
            if flags.get("first") or flags.get("second"):
                cap = min(cap, 45)
        cap       = min(cap, 90)
        final[p]  = min(candidate, cap)
    return final, uncapped

def position_rank(player, pos):
    base_pos = pos[:2] if pos.startswith(("cm", "cv")) else pos
    if base_pos in PLAYERS[player]["favourite"]:   return 1
    if base_pos in PLAYERS[player]["alternative"]: return 2
    if base_pos in PLAYERS[player]["emergency"]:   return 3
    return 999

def scarcity_bonus(player, pos, players):
    base_pos    = pos[:2] if pos.startswith(("cm", "cv")) else pos
    fav_players = [p for p in players if base_pos in PLAYERS[p]["favourite"]]
    if len(fav_players) <= 2 and base_pos in PLAYERS[player]["favourite"]:
        return 10
    return 0

def _bipartite_max_matching(slot_candidates):
    match_slot_to_player = {}
    match_player_to_slot = {}

    def try_assign(slot, visited):
        for p in slot_candidates[slot]:
            if p in visited:
                continue
            visited.add(p)
            if p not in match_player_to_slot or try_assign(match_player_to_slot[p], visited):
                match_slot_to_player[slot] = p
                match_player_to_slot[p]    = slot
                return True
        return False

    for slot in slot_candidates:
        try_assign(slot, set())

    unmatched = [slot for slot in slot_candidates if slot not in match_slot_to_player]
    return match_slot_to_player, unmatched


def check_structural_feasibility(players, positions_order, availability_flags):
    shortages = {}
    for helft_naam, block_ref in (("eerste helft", "0-45"), ("tweede helft", "45-90")):
        slot_candidates = {
            pos: [
                p for p in players
                if allowed_in_block(p, block_ref, availability_flags)
                and position_rank(p, pos) != 999
            ]
            for pos in positions_order
        }
        _, unmatched = _bipartite_max_matching(slot_candidates)

        tekort_per_basis = defaultdict(int)
        for slot in unmatched:
            base = slot[:2] if slot.startswith(("cm", "cv")) else slot
            tekort_per_basis[base] += 1

        shortages[helft_naam] = sorted(tekort_per_basis.items())
    return shortages

def optimize_position_swaps(block_assignment):
    positions = list(block_assignment.keys())
    players   = [block_assignment[pos] for pos in positions]
    n         = len(positions)
    INF       = 10 ** 6

    cost = [[0] * n for _ in range(n)]
    for i, pos in enumerate(positions):
        for j, pl in enumerate(players):
            r = position_rank(pl, pos)
            cost[i][j] = r if r != 999 else INF

    FULL   = 1 << n
    dp     = [[INF] * FULL for _ in range(n + 1)]
    choice = [[-1] * FULL for _ in range(n + 1)]
    dp[0][0] = 0

    for i in range(n):
        row = dp[i]
        for mask in range(FULL):
            cur = row[mask]
            if cur >= INF:
                continue
            for j in range(n):
                if mask & (1 << j):
                    continue
                c = cost[i][j]
                if c >= INF:
                    continue
                new_mask = mask | (1 << j)
                new_cost = cur + c
                if new_cost < dp[i + 1][new_mask]:
                    dp[i + 1][new_mask]    = new_cost
                    choice[i + 1][new_mask] = j

    full_mask = FULL - 1
    if dp[n][full_mask] >= INF:
        return block_assignment

    mask = full_mask
    player_for_index = [None] * n
    for i in range(n, 0, -1):
        j = choice[i][mask]
        player_for_index[i - 1] = j
        mask ^= (1 << j)

    return {positions[i]: players[player_for_index[i]] for i in range(n)}

def generate_block_patterns(strict=True):
    results  = []
    max_10   = 2 if strict else 3
    max_15   = 2 if strict else 3

    def backtrack(remaining, start_idx, used_10, used_15, current):
        if abs(remaining) < 1e-6:
            if current[0] < 15 or current[-1] < 15:
                return
            results.append(list(current))
            return
        if remaining < 0 or len(current) > 8:
            return
        for i in range(start_idx, len(BLOCK_OPTIONS)):
            size = BLOCK_OPTIONS[i]
            if size == 10 and used_10 >= max_10: continue
            if size == 15 and used_15 >= max_15: continue
            current.append(size)
            backtrack(remaining - size, i, used_10 + (size == 10), used_15 + (size == 15), current)
            current.pop()

    backtrack(90, 0, 0, 0, [])
    results.sort(key=lambda p: (len(p), [-x for x in p]))
    return results

def build_blocks_from_pattern(pattern):
    blocks = []
    start  = 0
    for size in pattern:
        end = start + size
        if start < 45 < end:
            return None
        blocks.append((f"{int(start)}-{int(end)}", size))
        start = end
    return blocks

def generate_schedule(players, targets, uncapped_targets, priority_flags, blocks, slack=5, cap_priority_enabled=False):
    remaining        = targets.copy()
    schedule         = {}
    played           = defaultdict(list)
    assigned_minutes = defaultdict(int)
    # Referentiewaarde om de relatieve vervulling weer terug te schalen naar
    # 'gewone' minuten, zodat de bestaande gewichten (15/10/40/10/8) hun
    # bedoelde onderlinge balans houden voor een 'normale' speler.
    reference_target = TOTAL_FIELD_MINUTES / len(players) if players else 1

    for b_name, b_min in blocks:
        schedule[b_name] = {}
        used = set()

        def assign(idx):
            if idx == len(POSITIONS_ORDER):
                return True

            pos      = POSITIONS_ORDER[idx]
            base_pos = pos[:2] if pos.startswith(("cm", "cv")) else pos

            cands = []
            for p in players:
                if p in used:                                       continue
                if not allowed_in_block(p, b_name, availability_flags): continue
                if position_rank(p, pos) == 999:                   continue
                if remaining[p] - b_min < -slack:                  continue
                if assigned_minutes[p] + b_min > max_minutes.get(p, 90): continue  # max minuten: hard, proactief
                cands.append(p)

            if not cands:
                failure_log["short"].append(f"{b_name} - {pos}: geen kandidaten")
                return False

            def score(p):
                rank = position_rank(p, pos)
                # Relatieve vervulling t.o.v. het ONGECAPTE streefgetal: iemand
                # met bv. Max minuten=45 maar die normaliter recht had op 65,
                # wordt na 30 gespeelde minuten gezien als "0.46 vervuld"
                # (30/65) i.p.v. "0.67 vervuld" (30/45) - en blijft dus even
                # hard meetellen bij het prioriteren totdat zijn HARDE cap
                # (hierboven al proactief uitgesloten) dat verhindert.
                t = uncapped_targets[p] if uncapped_targets[p] > 1e-9 else 1e-9
                fulfilled     = assigned_minutes[p] / t
                over_target   = (fulfilled - 1) * reference_target
                under_target  = max(0, (1 - fulfilled) * reference_target)
                # Voorrang voor spelers met een CAP die hun cap nog niet vol
                # hebben - zonder dit stranden zij structureel onder hun cap
                # (zie de uitgebreide toelichting in js/logic.js).
                cap = max_minutes.get(p, 90)
                cap_priority = 0
                if cap_priority_enabled and cap < uncapped_targets[p] - 1e-9 and cap > 1e-9:
                    onbenut = max(0, cap - assigned_minutes[p]) / cap
                    cap_priority = -onbenut * reference_target * 10

                return (
                    over_target  * 15
                    - under_target * 10
                    + (rank - 1)   * 40
                    - scarcity_bonus(p, pos, players)
                    + cap_priority
                    + (-8 if priority_flags.get(p, False) else 0)
                )

            cands.sort(key=score)

            for ch in cands:
                schedule[b_name][pos] = ch
                used.add(ch)
                if assign(idx + 1):
                    return True
                used.remove(ch)
                del schedule[b_name][pos]

            return False

        if not assign(0):
            return None, None

        schedule[b_name] = optimize_position_swaps(schedule[b_name])

        for pos in POSITIONS_ORDER:
            ch = schedule[b_name][pos]
            assigned_minutes[ch] += b_min
            if assigned_minutes[ch] > max_minutes.get(ch, 90):
                failure_log["short"].append(f"{ch} overschrijdt max minuten in blok {b_name}")
                return None, None
            remaining[ch] -= b_min
            played[ch].append((pos, b_min))

    return schedule, played

def evaluate_blocks(players, training_counts, priority_flags, pattern, max_minutes, slack=5, cap_priority_enabled=False):
    blocks = build_blocks_from_pattern(pattern)
    if blocks is None:
        return float('inf'), None, None, None, None, None
    targets, uncapped_targets = calculate_target_minutes(players, training_counts, max_minutes, availability_flags)
    schedule, _ = generate_schedule(players, targets, uncapped_targets, priority_flags, blocks, slack, cap_priority_enabled)
    if schedule is None:
        return float('inf'), None, None, None, None, None
    mins = defaultdict(float)
    for b_name, b_min in blocks:
        for pos, sp in schedule[b_name].items():
            if sp in players:
                if mins[sp] + b_min > max_minutes.get(sp, 90):
                    return float('inf'), None, None, None, None, None
                mins[sp] += b_min
    total_dev = sum(abs(mins[p] - targets[p]) for p in players)
    return total_dev, blocks, schedule, targets, mins, uncapped_targets

def fairness_devs(players, mn, uncapped):
    """
    Afwijking per speler, gemeten t.o.v. het ONGECAPTE recht, met tekorten
    dubbel gewogen. Zie de uitgebreide toelichting in js/logic.js.
    """
    out = []
    for p in players:
        reference = uncapped[p] if uncapped is not None else mn[p]
        diff = mn[p] - reference
        out.append(diff * 2 if diff < 0 else diff)
    return out


def choose_best_blocks(players, training_counts, priority_flags, max_minutes):
    CAP_VARIANTS = (True, False)

    best_score = float('inf')
    best       = None, None, None, None
    best_md    = 0
    best_td    = 0
    best_slack = SLACK_LEVELS[0]

    for slack in SLACK_LEVELS:
        for pat in generate_block_patterns(True):
            for cap_prio in CAP_VARIANTS:
                td, bl, sc, tg, mn, unc = evaluate_blocks(players, training_counts, priority_flags, pat, max_minutes, slack, cap_prio)
                if sc is None: continue
                devs = [abs(d) for d in fairness_devs(players, mn, unc)]
                if max(devs) <= 9:
                    display_devs = [abs(mn[p] - tg[p]) for p in players]
                    return bl, sc, tg, mn, True, max(display_devs), td, slack

        for pat in generate_block_patterns(False):
            for cap_prio in CAP_VARIANTS:
                td, bl, sc, tg, mn, unc = evaluate_blocks(players, training_counts, priority_flags, pat, max_minutes, slack, cap_prio)
                if sc is None: continue
                devs           = fairness_devs(players, mn, unc)
                md             = max(abs(d) for d in devs)
                deviation_cost = sum((max(0, abs(d) - 5)) ** 2 for d in devs)
                big_outliers   = sum(1 for d in devs if abs(d) >= 10) * 20000
                score          = deviation_cost * 200 + big_outliers + md * 10000
                if score < best_score:
                    best_score = score
                    best       = bl, sc, tg, mn
                    best_md    = max(abs(mn[p] - tg[p]) for p in players)
                    best_td    = td
                    best_slack = slack

    if best[0] is not None:
        return *best, False, best_md, best_td, best_slack

    return None, None, None, None, None, 0, 0, SLACK_LEVELS[-1]

if st.button("Genereer opstellingen"):
    failure_log.clear()
    if len(selected_players) < 10:
        st.error("Minimaal 10 spelers nodig")
    else:
        POSITIONS_ORDER = compute_dynamic_position_order(selected_players.keys())

        shortages = check_structural_feasibility(
            list(selected_players.keys()), POSITIONS_ORDER, availability_flags
        )
        if any(shortages.values()):
            st.error("Deze selectie kan onmogelijk een volledige opstelling vullen — dat lost geen enkele wissel of extra/minder speeltijd op.")
            for helft_naam, tekorten in shortages.items():
                for basis, aantal in tekorten:
                    st.write(
                        f"- Je hebt nog **{aantal}x {basis.upper()}** nodig voor de **{helft_naam}** "
                        f"(niemand van de geselecteerde spelers die favourite, alternative of emergency "
                        f"op deze positie heeft, is in die helft beschikbaar)."
                    )
            st.info("Los dit op door een speler toe te voegen die deze positie kan spelen, of door bij een speler de 1e/2e helft-beperking uit te zetten.")
            st.stop()

        res = choose_best_blocks(list(selected_players.keys()), training_counts, priority_flags, max_minutes)

        if res[0] is None:
            st.error("Geen opstelling gevonden, ook niet met extra/minder speeltijd toestaan.")
            st.caption("Dit ligt vermoedelijk aan de ingestelde 'Max minuten' per speler — controleer of die niet te streng zijn voor spelers die veel nodig zijn.")
            if failure_log["short"]:
                st.subheader("Details:")
                from collections import Counter
                counts = Counter(failure_log["short"])
                for msg, count in counts.items():
                    st.write(f"- {msg}" + (f" (x{count})" if count > 1 else ""))
        else:
            blocks, schedule, targets, mins, is_strict, max_dev, total_dev, slack_used = res

            if slack_used > SLACK_LEVELS[0]:
                afwijkingen = sorted(
                    ((p, mins[p] - targets[p]) for p in selected_players),
                    key=lambda x: -abs(x[1])
                )
                grote_afwijkingen = [(p, d) for p, d in afwijkingen if abs(d) >= 5]
                if grote_afwijkingen:
                    st.warning(
                        "Een exact eerlijke verdeling paste niet bij deze selectie/instellingen. "
                        "Om toch een volledige opstelling te maken, spelen deze spelers meer of minder dan hun streefminuten: "
                        + "; ".join(
                            f"{p} ({'+' if d > 0 else ''}{int(round(d))} min)"
                            for p, d in grote_afwijkingen
                        )
                    )

            st.subheader("Gebruikte blokken")
            st.write(", ".join(f"{n} ({int(m)} min)" for n, m in blocks))

            prev_players       = set()
            all_moment_plans   = {}
            actual_mins_so_far = defaultdict(int)

            for block_idx, (block_name, block_min) in enumerate(blocks):

                current_players = set(
                    sp for pos, sp in schedule[block_name].items()
                    if sp not in ("FOUT", None)
                )

                col_opstelling, col_wissels = st.columns([1, 2])

                with col_opstelling:
                    st.subheader(f"Blok {block_name} ({int(block_min)} min)")

                    pos_map     = schedule[block_name]
                    display_map = dict(pos_map)

                    def base(pos):
                        return pos[:2] if pos.startswith(("cm", "cv")) else pos

                    for left, right in [("lb", "rb"), ("la", "ra")]:
                        p_left  = pos_map.get(left)
                        p_right = pos_map.get(right)
                        if not p_left  or not p_right:          continue
                        if p_left  in (None, "FOUT"):          continue
                        if p_right in (None, "FOUT"):          continue
                        fav_left  = PLAYERS.get(p_left,  {}).get("favourite", [])
                        fav_right = PLAYERS.get(p_right, {}).get("favourite", [])
                        if base(right) in fav_left and base(left) in fav_right:
                            display_map[left], display_map[right] = p_right, p_left

                    def row(d):
                        cols = st.columns(7)
                        for i, pos in d.items():
                            cols[i].write(display_map.get(pos, "—"))

                    row({0: "lb", 3: "sp", 6: "rb"})
                    row({0: "cm1", 3: "cm2", 6: "cm3"})
                    row({0: "la", 2: "cv1", 4: "cv2", 6: "ra"})

                with col_wissels:
                    st.subheader("Wissels")

                    if block_idx == 0:
                        st.markdown("_Eerste blok – iedereen erin_")
                        prev_players = current_players.copy()
                        all_moment_plans[block_name] = {}
                        for sp in current_players:
                            actual_mins_so_far[sp] += block_min
                        continue

                    pos_map    = schedule[block_name]
                    player_pos = {sp: pos[:2] for pos, sp in pos_map.items()}

                    eruit = list(prev_players - current_players)
                    erin  = list(current_players - prev_players)

                    def pos_score(i, o):
                        if player_pos.get(i) == player_pos.get(o):          return 0
                        if player_pos.get(i) in PLAYERS[o]["favourite"]:     return 1
                        if player_pos.get(i) in PLAYERS[o]["alternative"]:   return 2
                        return 3

                    pairs  = []
                    used_o = set()

                    for i in erin:
                        best = None
                        for o in eruit:
                            if o in used_o: continue
                            sc = pos_score(i, o) + abs(mins[i] - mins[o]) * 0.01
                            if best is None or sc < best[0]:
                                best = (sc, i, o)
                        if best:
                            _, i_best, o_best = best
                            pairs.append((i_best, o_best))
                            used_o.add(o_best)

                    remaining_i = [p for p in erin  if p not in [x for x, _ in pairs]]
                    remaining_o = [p for p in eruit if p not in [y for _, y in pairs]]
                    for i, o in zip(remaining_i, remaining_o):
                        pairs.append((i, o))

                    if not pairs:
                        st.markdown("_Geen logische wissels mogelijk_")
                        all_moment_plans[block_name] = {}
                        for sp in current_players:
                            actual_mins_so_far[sp] += block_min
                    else:
                        MAX_PER_MOMENT = 2
                        blok_start_int = int(block_name.split("-")[0])
                        blok_eind_int  = int(block_name.split("-")[1])

                        ruwe_base   = 5 * math.ceil(blok_start_int / 5)
                        base_minute = ruwe_base if ruwe_base < blok_eind_int else blok_start_int

                        if base_minute == 45:
                            time_slots = [45]
                        else:
                            beschikbare_tijd     = blok_eind_int - base_minute
                            max_momenten_in_blok = max(1, int(beschikbare_tijd // 5))
                            benodigde_momenten   = max(1, math.ceil(len(pairs) / MAX_PER_MOMENT))
                            n_momenten           = min(max_momenten_in_blok, benodigde_momenten)
                            time_slots = [base_minute + 5 * k for k in range(n_momenten)]

                        cap_per_moment = max(1, math.ceil(len(pairs) / len(time_slots)))

                        pairs_sorted = sorted(
                            pairs,
                            key=lambda pair: (
                                (targets[pair[0]] - actual_mins_so_far[pair[0]])
                                + (actual_mins_so_far[pair[1]] - targets[pair[1]])
                            ),
                            reverse=True
                        )

                        moment_plan = {m: [] for m in time_slots}
                        for pair in pairs_sorted:
                            for m in time_slots:
                                if len(moment_plan[m]) < cap_per_moment:
                                    moment_plan[m].append(pair)
                                    break

                        for m in time_slots:
                            if moment_plan[m]:
                                st.markdown(f"**Minuut {m}**")
                                for i, o in moment_plan[m]:
                                    st.markdown(f"{i} → {o}")

                        all_moment_plans[block_name] = moment_plan

                        block_start  = blok_start_int
                        block_end    = blok_eind_int
                        current_set  = prev_players.copy()
                        t            = block_start

                        for m in sorted(moment_plan.keys()):
                            elapsed = m - t
                            for sp in current_set:
                                actual_mins_so_far[sp] += elapsed
                            for i, o in moment_plan[m]:
                                current_set.discard(o)
                                current_set.add(i)
                            t = m

                        for sp in current_set:
                            actual_mins_so_far[sp] += block_end - t

                    prev_players = current_players.copy()

            st.header("Minutenoverzicht")

            all_active_intervals = []
            prev_block_lineup = None

            for bn, bm in blocks:
                block_start  = int(bn.split("-")[0])
                block_end    = int(bn.split("-")[1])
                pos_map      = schedule[bn]
                final_lineup = set(pos_map.values())

                if prev_block_lineup is None:
                    for sp in final_lineup:
                        all_active_intervals.append((sp, block_start, block_end))
                else:
                    current_players_set = prev_block_lineup.copy()

                    events = []
                    for m, pairs in all_moment_plans.get(bn, {}).items():
                        for i, o in pairs:
                            events.append((m, i, o))
                    events.sort()

                    t = block_start
                    for m, i, o in events:
                        if m > t:
                            for sp in current_players_set:
                                all_active_intervals.append((sp, t, m))
                        current_players_set.discard(o)
                        current_players_set.add(i)
                        t = m
                    if block_end > t:
                        for sp in current_players_set:
                            all_active_intervals.append((sp, t, block_end))

                prev_block_lineup = final_lineup

            table = []

            for p in selected_players:
                pd = defaultdict(float)

                for bn, bm in blocks:
                    pos_map = schedule[bn]
                    for pos, sp in pos_map.items():
                        if sp == p:
                            base_p = pos[:2] if pos.startswith(("cm", "cv")) else pos
                            pd[base_p] += bm

                total = sum(end - start for sp, start, end in all_active_intervals if sp == p)
                r     = targets[p]
                diff  = total - r

                table.append({
                    "Speler":     p,
                    "Trainingen": f"{training_counts[p]}x",
                    "Recht op":   f"{int(round(r))} min",
                    "Gekregen":   f"{int(round(total))} min",
                    "Verschil":   f"{int(round(diff))} min",
                    "Posities":   ", ".join(f"{k}:{int(v)}" for k, v in pd.items()),
                })

            table.sort(key=lambda x: (-int(x["Trainingen"][0]), -float(x["Gekregen"].split()[0])))
            st.table(table)

            base_positions = ["sp", "cv", "cm", "lb", "rb", "la", "ra"]
            slots_per_base = {
                bp: sum(1 for p in POSITIONS_ORDER if (p[:2] if p.startswith(("cm", "cv")) else p) == bp)
                for bp in base_positions
            }
            selected_list = list(selected_players.keys())
            players_order = list(PLAYERS.keys())

            def ordered_names_from_list(name_list):
                return ", ".join([p for p in players_order if p in name_list]) if name_list else "—"

            pos_table = []
            for bp in base_positions:
                slots       = slots_per_base[bp]
                total_pool  = [p for p in selected_list if (
                    bp in PLAYERS.get(p, {}).get("favourite",   []) or
                    bp in PLAYERS.get(p, {}).get("alternative", []) or
                    bp in PLAYERS.get(p, {}).get("emergency",   [])
                )]
                slots_total = f"{slots}/{len(total_pool)}"
                pos_table.append({
                    "Positie":             bp,
                    "Slots/Totaal":        slots_total,
                    "Favourite (namen)":   ordered_names_from_list([p for p in selected_list if bp in PLAYERS.get(p, {}).get("favourite",   [])]),
                    "Alternative (namen)": ordered_names_from_list([p for p in selected_list if bp in PLAYERS.get(p, {}).get("alternative", [])]),
                    "Emergency (namen)":   ordered_names_from_list([p for p in selected_list if bp in PLAYERS.get(p, {}).get("emergency",   [])]),
                })
            pos_table.sort(key=lambda x: (
                -int(x["Slots/Totaal"].split("/")[0]),
                -int(x["Slots/Totaal"].split("/")[1]) if x["Slots/Totaal"].split("/")[1].isdigit() else 0
            ))
            st.subheader("Positie overzicht — slots/totaal en voorkeuren (namen in PLAYERS volgorde)")
            st.table(pos_table)
