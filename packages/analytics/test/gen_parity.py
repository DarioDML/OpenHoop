"""Generate python-parity.json from the wearable5.0 reference (stdlib only).

Usage: python -I packages/analytics/test/gen_parity.py <reference folder>
"""
import json
import math
import os
import random
import sys

REF = sys.argv[1]
sys.path.insert(0, os.path.join(REF, "python"))
sys.path.insert(0, os.path.join(REF, "re"))

from whoop5.experimental import (respiratory_rate, rmssd_ms, skin_temp_baseline,  # noqa: E402
                                 sleep_periods, spo2_windows)
import score_formulas as sf  # noqa: E402

rng = random.Random(20261125)
T0 = 1_764_000_000
STATE_CODE = {"WAKE": "W", "STILL": "T", "SLEEP": "S", "UP": "U", None: "-"}


def runs(ts):
    out = []
    for t in ts:
        if out and out[-1][0] + out[-1][1] == t:
            out[-1][1] += 1
        else:
            out.append([t, 1])
    return out


def sleep_case(plan, drop_ranges, p_missing, p_flip):
    ts, states, hrs = [], [], []
    t = T0 + rng.randrange(0, 3600)
    for state, seconds in plan:
        for _ in range(seconds):
            t += 1
            if any(a <= t - T0 <= b for a, b in drop_ranges) or rng.random() < p_missing:
                continue
            s = state
            if s == "SLEEP" and rng.random() < p_flip:
                s = rng.choice(["WAKE", "STILL"])
            elif s != "SLEEP" and rng.random() < p_flip / 3:
                s = "SLEEP"
            if rng.random() < 0.002:
                s = None
            r = rng.random()
            if r < 0.01:
                hr = None
            elif r < 0.015:
                hr = rng.choice([0, 12, 240, 255])
            else:
                hr = int(round((52 if state == "SLEEP" else 70) + rng.gauss(0, 6)))
            ts.append(t)
            states.append(s)
            hrs.append(hr)
    records = [{"layout": 18, "unix_s": a, "band_state": s, "heart_rate": h} for a, s, h in zip(ts, states, hrs)]
    return {"t": runs(ts), "state": "".join(STATE_CODE[s] for s in states), "hr": hrs,
            "expected": sleep_periods(records)}


def awakenings(total, every, length):
    out, left = [], total
    while left > 0:
        chunk = min(left, every + rng.randrange(-120, 120))
        out.append(("SLEEP", chunk))
        left -= chunk
        if left > 0:
            a = rng.randrange(length // 2, length)
            out.append(("WAKE", a))
    return out


def sleep_cases():
    a = sleep_case([("WAKE", 1200), ("STILL", 600)] + awakenings(10800, 1500, 240)
                   + [("WAKE", 480)] + awakenings(7200, 1800, 200)
                   + [("UP", 900), ("SLEEP", 600), ("WAKE", 1500)],
                   drop_ranges=[(6000, 6400)], p_missing=0.01, p_flip=0.04)
    b = sleep_case([("WAKE", 900)] + awakenings(5400, 1200, 900) + [("WAKE", 4000)]
                   + awakenings(3000, 1000, 100) + [("STILL", 700), ("SLEEP", 1100), ("WAKE", 300)],
                   drop_ranges=[(9000, 9700)], p_missing=0.05, p_flip=0.12)
    return [a, b]


def rr_series(breaths_per_min, beats, base=1000.0, amp=45.0, noise=8.0, p_art=0.01):
    out, t = [], 0.0
    f = breaths_per_min / 60.0
    for _ in range(beats):
        v = base + amp * math.sin(2 * math.pi * f * t) + rng.gauss(0, noise)
        if rng.random() < p_art:
            v = rng.choice([v * 2, v * 0.55, 250.0, 2300.0])
        v = int(round(v))
        out.append(v)
        t += v / 1000.0
    return out


def rmssd_cases():
    out = []
    for n in (3, 9, 11, 12, 40, 120, 300, 600):
        rr = rr_series(rng.uniform(8, 20), n, base=rng.uniform(700, 1200), amp=rng.uniform(10, 160), p_art=0.05)
        for step in (200, 150):
            out.append({"rr": rr, "maxStepMs": step, "expected": rmssd_ms(rr, step)})
    jumpy = [800, 1200, 800, 1200, 800, 1200, 800, 1200, 800, 1200, 800, 1200, 800, 1200]
    out.append({"rr": jumpy, "maxStepMs": 200, "expected": rmssd_ms(jumpy, 200)})
    return out


def resp_cases():
    out = []
    for bpm in (9, 14, 18, 11.5):
        rr = rr_series(bpm, 650, base=rng.uniform(900, 1150))
        out.append({"rr": rr, "expected": respiratory_rate(rr)})
    sparse = rr_series(15, 400, base=1000, p_art=0.4)
    out.append({"rr": sparse, "expected": respiratory_rate(sparse)})
    out.append({"rr": [1000] * 70, "expected": respiratory_rate([1000] * 70)})
    return out


def resp_night_case():
    bpm, base = 13.0, 1050.0
    start = T0 + 50_000
    seconds = 2400
    beats = []
    t = 0.0
    while t < seconds - 2:
        v = int(round(base + 40 * math.sin(2 * math.pi * bpm / 60 * t) + rng.gauss(0, 6)))
        t += v / 1000.0
        beats.append((start + int(t), v))
    per = {s: [] for s in range(start, start + seconds)}
    for s, v in beats:
        per[s].append(v)
    ts = list(range(start, start + seconds))
    rr = [per[s] for s in ts]
    rates = [w["breaths_per_min"] for w in respiratory_rate([x for r in rr for x in r]) if w["breaths_per_min"] is not None]
    rates.sort()
    k = len(rates)
    med = rates[k // 2] if k % 2 else (rates[k // 2 - 1] + rates[k // 2]) / 2
    return {"t": runs(ts), "rr": rr, "onset": ts[0], "offset": ts[-1], "expectedMedian": med, "windows": k}


def spo2_case():
    pairs = []
    start = T0 + 100_000
    for w in range(9):
        ws = start + 37 + w * 1200
        for k in range(-5, 0):
            pairs.append([ws + k, 0])
        mode = w % 4
        level = rng.randint(90, 98)
        for k in range(30):
            if w == 5 and k in (10, 11):
                continue
            if w == 6 and k in (12, 13, 14):
                continue
            if mode == 3 or rng.random() < (0.85 if w == 7 else 0.2):
                raw = rng.choice([160, 128, 32, 16, 1, 69])
            else:
                level = max(87, min(100, level + rng.choice([-1, 0, 0, 1])))
                raw = level
            pairs.append([ws + k, raw])
        pairs.append([ws + 30, 0])
        pairs.append([ws + 31, None])
    pairs.sort(key=lambda p: p[0])
    records = [{"layout": 18, "unix_s": t, "spo2_byte_82": raw,
                "spo2_percent": raw if raw is not None and 70 <= raw <= 100 else None} for t, raw in pairs]
    return {"samples": pairs, "expected": spo2_windows(records)}


def skin_case():
    ts, temps = [], []
    periods = [(T0 + 200_000, T0 + 200_000 + 2700), (T0 + 200_000 + 6000, T0 + 200_000 + 9000)]
    for a, b in periods:
        c = rng.uniform(32.0, 34.0)
        for t in range(a - 300, b + 300):
            c += rng.gauss(0, 0.01)
            ts.append(t)
            temps.append(None if rng.random() < 0.05 else round(c, 2))
    records = [{"layout": 18, "unix_s": t, "skin_temp_c": c} for t, c in zip(ts, temps)]
    rows_none = skin_temp_baseline(records, [{"onset_unix": a, "offset_unix": b} for a, b in periods[:1]], None)
    rows_base = skin_temp_baseline(records, [{"onset_unix": a, "offset_unix": b} for a, b in periods], 33.5)
    return {"t": runs(ts), "temp": temps, "periods": [list(p) for p in periods],
            "expectedNoBaseline": [{"meanC": r["mean_c"], "deviationC": r["deviation_c"]} for r in rows_none],
            "baselineC": 33.5,
            "expectedWithBaseline": [{"meanC": r["mean_c"], "deviationC": r["deviation_c"]} for r in rows_base]}


def score_cases():
    debt = []
    for _ in range(40):
        need = rng.randint(20_000_000, 45_000_000)
        asleep = rng.randint(10_000_000, 40_000_000)
        rem = rng.choice([rng.randint(1_000_000, 6_800_000), rng.randint(6_800_001, 9_000_000), 6_800_000])
        debt.append({"need": need, "asleep": asleep, "rem": rem, "expected": sf.debt_ms(need, asleep, rem)})
    strain_need = [{"load": x, "expected": sf.strain_need_ms(x)}
                   for x in [0.0, 0.5, 1.0, 4.2, 7.77, 10.0, 13.3, 16.0, 18.5, 21.0] + [rng.uniform(0, 21) for _ in range(10)]]
    perf = []
    for _ in range(30):
        need = rng.randint(25_000_000, 40_000_000)
        asleep = rng.randint(int(need * 0.55), int(need * 1.15))
        cons = rng.uniform(40, 100)
        perf.append({"asleep": asleep, "need": need, "consistency": cons,
                     "expected": sf.sleep_performance(asleep, need, cons)})
    strain = []
    for peak in (0, 40, 80, 120):
        minutes = []
        workout_at = rng.randrange(300, 1200)
        for m in range(1440):
            if rng.random() < 0.2:
                minutes.append(None)
                continue
            h = rng.gauss(68, 9)
            if workout_at <= m < workout_at + peak:
                h = rng.gauss(150, 15)
            minutes.append(round(min(205.0, max(40.0, h)), 2))
        minutes[700] = 94.0
        strain.append({"minuteHr": minutes, "expected": sf.day_strain([h for h in minutes if h is not None])})
    zones = []
    for _ in range(5):
        rest, hr_max = rng.randint(48, 66), rng.randint(178, 202)
        sec = [None if rng.random() < 0.05 else int(round(rng.uniform(40, 205))) for _ in range(1500)]
        zones.append({"hr": sec, "rest": rest, "max": hr_max,
                      "expected": sf.zone_seconds([h for h in sec if h is not None], rest, hr_max)})
    rec = []
    for n in (0, 0, 1, 1, 2, 2, 3, 3, 3):
        history = [{"hrv": rng.uniform(30, 150), "sleepScore": rng.uniform(50, 100), "rhr": rng.uniform(45, 70)}
                   for _ in range(n)]
        hrv, sleep, rhr = rng.uniform(25, 110), rng.uniform(40, 100), rng.uniform(44, 68)
        expected = sf.recovery_lead([(h["hrv"], h["sleepScore"]) for h in history], hrv, sleep, rhr + 4.6)
        rec.append({"history": history, "hrv": hrv, "sleepScore": sleep, "rhr": rhr, "expected": expected})
    return {"debtMs": debt, "strainNeedMs": strain_need, "sleepPerformance": perf, "dayStrain": strain,
            "zoneSeconds": zones, "recoveryLead": rec}


def main():
    data = {"seed": 20261125, "reference": "wearable5.0@8ab57dc",
            "rmssd": rmssd_cases(), "sleepPeriods": sleep_cases(), "respiratory": resp_cases(),
            "respiratoryNight": resp_night_case(), "spo2": spo2_case(), "skinTemp": skin_case(),
            "scores": score_cases()}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "python-parity.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"wrote {path} ({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
