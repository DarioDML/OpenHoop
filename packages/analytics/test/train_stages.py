"""Fit the sleep stage model and write packages/analytics/src/stagesModel.ts and test/fixtures/stages-parity.json.

Data: Walch O. "Motion and heart rate from a wrist-worn wearable and labeled sleep from polysomnography" v1.0.0,
PhysioNet 2019, https://doi.org/10.13026/hmhs-py35 (ODC-BY 1.0). The dataset is not part of this repository.

Usage: python -I packages/analytics/test/train_stages.py <sleep-accel folder> [--report <markdown file>]
Needs numpy and scikit-learn. Not run in CI.
"""
import json
import math
import os
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

EPOCH_S = 30
MIN_VALID_S = 10
HR_SCALE_FLOOR = 1.0
MOTION_FLOOR_G = 1e-4
MOTION_OFFSET = 0.1
ACTIVE_RATIO = 2.0
QUIET_CAP = 60
HOURS_CAP = 10.0
HR_INTERP_GAP_S = 30
L2_C = 1.0
COEF_FORMAT = ".9g"
PARTIAL_FIRST = 19
PARTIAL_STEP = 10
CLASSES = ["wake", "light", "deep", "rem"]
PSG_TO_CLASS = {0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3}
FEATURES = ["hr_2m", "hr_10m", "hr_sd_5m", "motion", "motion_5m", "motion_20m", "quiet", "hours", "hours_sq", "hr_30m",
            "hr_vs_30m", "motion_60m", "hr_step_5m"]
PRIOR_POWERS = [0.25, 0.5, 0.75]


def median(values):
    s = sorted(values)
    n = len(s)
    if n == 0:
        return math.nan
    mid = n // 2
    return s[mid] if n % 2 == 1 else (s[mid - 1] + s[mid]) / 2


def epoch_means(per_second, k_count):
    out = np.full(k_count, np.nan)
    for k in range(k_count):
        chunk = per_second[k * EPOCH_S:(k + 1) * EPOCH_S]
        valid = chunk[~np.isnan(chunk)]
        if len(valid) >= MIN_VALID_S:
            out[k] = float(np.sum(valid)) / len(valid)
    return out


def reference(ehr, emot):
    hr = [float(v) for v in ehr if not math.isnan(v)]
    mo = [float(v) for v in emot if not math.isnan(v)]
    if not hr or not mo:
        return None
    hr_med = median(hr)
    hr_scale = max(1.4826 * median([abs(v - hr_med) for v in hr]), HR_SCALE_FLOOR)
    mot_med = max(median(mo), MOTION_FLOOR_G)
    return hr_med, hr_scale, mot_med


def trailing_mean(values, width):
    valid = ~np.isnan(values)
    sums = np.concatenate([[0.0], np.cumsum(np.where(valid, values, 0.0))])
    counts = np.concatenate([[0], np.cumsum(valid)])
    k = np.arange(len(values))
    lo = np.maximum(0, k - width + 1)
    n = counts[k + 1] - counts[lo]
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(n > 0, (sums[k + 1] - sums[lo]) / np.maximum(n, 1), np.nan)


def epoch_features(ehr, emot, ref):
    hr_med, hr_scale, mot_med = ref
    k_count = len(ehr)
    with np.errstate(invalid="ignore"):
        m = np.log(emot / mot_med + MOTION_OFFSET)
    hz = (ehr - hr_med) / hr_scale
    step = np.concatenate([[0.0], np.abs(np.diff(hz))]) if k_count > 0 else np.zeros(0)
    since = np.zeros(k_count)
    run = 0
    for k in range(k_count):
        run = 0 if (not math.isnan(emot[k]) and emot[k] > ACTIVE_RATIO * mot_med) else run + 1
        since[k] = run
    mean10 = trailing_mean(ehr, 10)
    sq = trailing_mean(ehr * ehr, 10)
    sd10 = np.sqrt(np.maximum(sq - mean10 * mean10, 0.0))
    z60 = trailing_mean(hz, 60)
    hours = np.minimum((np.arange(k_count) + 0.5) * EPOCH_S / 3600, HOURS_CAP)
    feats = np.column_stack([
        (trailing_mean(ehr, 5) - hr_med) / hr_scale,
        (trailing_mean(ehr, 20) - hr_med) / hr_scale,
        sd10 / hr_scale,
        m,
        trailing_mean(m, 10),
        trailing_mean(m, 40),
        np.log(1 + np.minimum(since, QUIET_CAP)),
        hours,
        hours * hours / HOURS_CAP,
        z60,
        hz - z60,
        trailing_mean(m, 120),
        trailing_mean(step, 10),
    ]) if k_count > 0 else np.zeros((0, len(FEATURES)))
    feats[np.isnan(ehr) | np.isnan(emot)] = np.nan
    return feats


def night_features(hr_1hz, mot_1hz):
    k_count = len(hr_1hz) // EPOCH_S
    ehr = epoch_means(hr_1hz, k_count)
    emot = epoch_means(mot_1hz, k_count)
    ref = reference(ehr, emot)
    if ref is None:
        return None, ehr, emot
    return epoch_features(ehr, emot, ref), ehr, emot


def partial_last(m, ehr, emot):
    ref = reference(ehr, emot)
    if ref is None:
        return None
    alpha = forward(m, emissions(m, epoch_features(ehr, emot, ref))[0])
    return alpha[-1]


def load_subject(folder, sid, cache):
    cached = os.path.join(cache, f"{sid}.npz")
    labels = np.loadtxt(os.path.join(folder, "labels", f"{sid}_labeled_sleep.txt"))
    lt = labels[:, 0].astype(int)
    ls = labels[:, 1].astype(int)
    scored = np.isin(ls, list(PSG_TO_CLASS))
    asleep = np.where(np.isin(ls, [1, 2, 3, 4, 5]))[0]
    first, last = int(lt[asleep[0]]), int(lt[asleep[-1]]) + EPOCH_S
    if os.path.exists(cached):
        z = np.load(cached)
        hr, mot = z["hr"], z["mot"]
    else:
        span = last - first
        hrd = np.loadtxt(os.path.join(folder, "heart_rate", f"{sid}_heartrate.txt"), delimiter=",")
        hrd = hrd[(hrd[:, 0] >= first - 600) & (hrd[:, 0] <= last + 600)]
        grid = first + np.arange(span) + 0.5
        hr = np.interp(grid, hrd[:, 0], hrd[:, 1])
        idx = np.searchsorted(hrd[:, 0], grid)
        prev_t = hrd[np.clip(idx - 1, 0, len(hrd) - 1), 0]
        next_t = hrd[np.clip(idx, 0, len(hrd) - 1), 0]
        hr[(next_t - prev_t > HR_INTERP_GAP_S) | (grid < hrd[0, 0]) | (grid > hrd[-1, 0])] = np.nan
        mot = np.full(span, np.nan)
        acc = load_acceleration(os.path.join(folder, "motion", f"{sid}_acceleration.txt"), first, last)
        sec = np.floor(acc[:, 0]).astype(int) - first
        order = np.argsort(sec, kind="stable")
        sec, acc = sec[order], acc[order]
        bounds = np.flatnonzero(np.diff(sec)) + 1
        starts = np.concatenate([[0], bounds])
        ends = np.concatenate([bounds, [len(sec)]])
        for a, b in zip(starts, ends):
            if b - a < 5 or not 0 <= sec[a] < span:
                continue
            xyz = acc[a:b, 1:4]
            mot[sec[a]] = float(np.mean(np.linalg.norm(xyz - xyz.mean(axis=0), axis=1)))
        os.makedirs(cache, exist_ok=True)
        np.savez(cached, hr=hr, mot=mot)
    stage = np.full(len(hr) // EPOCH_S, -1)
    for t, s, ok in zip(lt, ls, scored):
        k = (int(t) - first) // EPOCH_S
        if ok and 0 <= k < len(stage) and (int(t) - first) % EPOCH_S == 0:
            stage[k] = PSG_TO_CLASS[int(s)]
    return hr, mot, stage


def load_acceleration(path, first, last):
    rows = []
    with open(path, "r", encoding="ascii") as f:
        for line in f:
            parts = line.split()
            if len(parts) != 4:
                continue
            t = float(parts[0])
            if first <= t < last:
                rows.append((t, float(parts[1]), float(parts[2]), float(parts[3])))
    return np.array(rows, dtype=float).reshape(-1, 4)


def fit(xs, ys):
    x = np.vstack(xs)
    y = np.concatenate(ys)
    mu = x.mean(axis=0)
    sd = x.std(axis=0)
    sd[sd == 0] = 1
    model = LogisticRegression(C=L2_C, max_iter=5000)
    model.fit((x - mu) / sd, y)
    prior = np.array([np.mean(y == c) for c in range(len(CLASSES))])
    trans = np.ones((len(CLASSES), len(CLASSES)))
    for seq in ys:
        for a, b in zip(seq[:-1], seq[1:]):
            trans[a, b] += 1
    trans /= trans.sum(axis=1, keepdims=True)
    return {"mu": mu, "sd": sd, "w": model.coef_, "b": model.intercept_, "prior": prior, "trans": trans, "power": math.nan}


def probabilities(m, feats):
    probs = np.full((len(feats), len(CLASSES)), np.nan)
    ok = ~np.isnan(feats).any(axis=1)
    z = ((feats[ok] - m["mu"]) / m["sd"]) @ m["w"].T + m["b"]
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    probs[ok] = e / e.sum(axis=1, keepdims=True)
    return probs


def scaled(m, probs, power):
    out = np.ones_like(probs)
    ok = ~np.isnan(probs).any(axis=1)
    e = probs[ok] / m["prior"] ** power
    out[ok] = e / e.sum(axis=1, keepdims=True)
    return out


def emissions(m, feats):
    probs = probabilities(m, feats)
    return scaled(m, probs, m["power"]), probs


def choose_power(subjects, data):
    truth = {p: [] for p in PRIOR_POWERS}
    pred = {p: [] for p in PRIOR_POWERS}
    for sid in subjects:
        train = [s for s in subjects if s != sid]
        m = fit([data[s]["feats"][data[s]["keep"]] for s in train], [data[s]["stage"][data[s]["keep"]] for s in train])
        d = data[sid]
        probs = probabilities(m, d["feats"])
        for p in PRIOR_POWERS:
            post = smooth(m, scaled(m, probs, p))
            truth[p].append(d["stage"][d["keep"]])
            pred[p].append(post[d["keep"]].argmax(axis=1))
    scores = {p: kappa(confusion(np.concatenate(truth[p]), np.concatenate(pred[p]), 4)) for p in PRIOR_POWERS}
    return max(PRIOR_POWERS, key=lambda p: scores[p]), scores


def forward(m, em):
    k_count = len(em)
    alpha = np.zeros_like(em)
    for k in range(k_count):
        pred = m["prior"] if k == 0 else alpha[k - 1] @ m["trans"]
        a = pred * em[k]
        alpha[k] = a / a.sum()
    return alpha


def smooth(m, em):
    alpha = forward(m, em)
    k_count = len(em)
    beta = np.ones_like(em)
    for k in range(k_count - 2, -1, -1):
        b = m["trans"] @ (em[k + 1] * beta[k + 1])
        beta[k] = b / b.sum()
    post = alpha * beta
    return post / post.sum(axis=1, keepdims=True)


def kappa(conf):
    n = conf.sum()
    po = np.trace(conf) / n
    pe = (conf.sum(axis=0) @ conf.sum(axis=1)) / (n * n)
    return (po - pe) / (1 - pe)


def confusion(truth, pred, classes):
    c = np.zeros((classes, classes), dtype=int)
    for a, b in zip(truth, pred):
        c[a, b] += 1
    return c


def collapse(arr, mapping):
    return np.array([mapping[v] for v in arr])


def report_block(title, conf, names, subject_kappas):
    lines = [f"### {title}", "", "| PSG \\ predicted | " + " | ".join(names) + " | recall |", "|" + "---|" * (len(names) + 2)]
    for i, name in enumerate(names):
        row = conf[i]
        recall = row[i] / row.sum() if row.sum() else math.nan
        lines.append(f"| {name} | " + " | ".join(str(v) for v in row) + f" | {recall:.2f} |")
    prec = [conf[i, i] / conf[:, i].sum() if conf[:, i].sum() else math.nan for i in range(len(names))]
    lines.append("| precision | " + " | ".join(f"{p:.2f}" for p in prec) + " | |")
    acc = np.trace(conf) / conf.sum()
    sk = np.array(subject_kappas)
    lines += ["", f"Accuracy {acc:.3f}, Cohen's kappa {kappa(conf):.3f} (pooled), per-subject kappa median "
              f"{np.median(sk):.3f} (range {sk.min():.3f} to {sk.max():.3f}).", ""]
    return "\n".join(lines), acc, kappa(conf)


def model_ts(m, cv):
    def arr(a):
        return "[" + ", ".join(f"{float(v):{COEF_FORMAT}}" for v in a) + "]"

    def mat(a):
        return "[\n" + "".join(f"    {arr(r)},\n" for r in a) + "  ]"

    return f"""// Generated by packages/analytics/test/train_stages.py from the Walch 2019 PhysioNet sleep-accel dataset. Do not edit.
export const STAGE_MODEL = {{
  features: {json.dumps(FEATURES)},
  classes: {json.dumps(CLASSES)},
  mean: {arr(m["mu"])},
  scale: {arr(m["sd"])},
  weights: {mat(m["w"])},
  intercept: {arr(m["b"])},
  prior: {arr(m["prior"])},
  priorPower: {m["power"]},
  transition: {mat(m["trans"])},
  validation: {{
    subjects: {cv["subjects"]},
    epochs: {cv["epochs"]},
    accuracy: {cv["accuracy"]:.3f},
    kappa: {cv["kappa"]:.3f},
    threeClassAccuracy: {cv["acc3"]:.3f},
    threeClassKappa: {cv["kappa3"]:.3f},
  }},
}} as const;
"""


def fixture_night(rng):
    plan = [(0, 6), (1, 30), (2, 50), (1, 40), (3, 20), (1, 60), (2, 30), (0, 4), (1, 70), (3, 40), (1, 50), (3, 50),
            (0, 8), (1, 40), (3, 30)]
    hr_base = {0: 66, 1: 56, 2: 51, 3: 61}
    hr_sd = {0: 4, 1: 2, 2: 1, 3: 5}
    mot_base = {0: 0.06, 1: 0.008, 2: 0.005, 3: 0.006}
    hr, mot = [], []
    for stage, epochs in plan:
        for _ in range(epochs * EPOCH_S):
            hr.append(None if rng.random() < 0.03 else round(hr_base[stage] + rng.gauss(0, hr_sd[stage])))
            moving = rng.random() < (0.3 if stage == 0 else 0.02)
            mot.append(None if rng.random() < 0.01 else round(mot_base[stage] * (8 if moving else 1) * (0.5 + rng.random()), 4))
    for s in range(3000, 3000 + 400):
        hr[s] = None
        mot[s] = None
    return hr, mot


def main():
    folder = sys.argv[1]
    report_path = sys.argv[sys.argv.index("--report") + 1] if "--report" in sys.argv else None
    cache = os.path.join(folder, ".openhoop-cache")
    with open(os.path.join(folder, "SHA256SUMS.txt"), "r", encoding="ascii") as f:
        sids = sorted({line.split()[1].split("/")[1].split("_")[0] for line in f if "labels/" in line}, key=int)
    data = {}
    for sid in sids:
        hr, mot, stage = load_subject(folder, sid, cache)
        feats, ehr, emot = night_features(hr, mot)
        keep = (stage >= 0) & ~np.isnan(feats).any(axis=1)
        data[sid] = {"feats": feats, "stage": stage, "keep": keep, "ehr": ehr, "emot": emot}
        print(f"{sid}: {len(stage)} epochs, {keep.sum()} usable, motion median {np.nanmedian(mot):.4f} g", file=sys.stderr)

    truth, truth_online, pred_lr, pred_hmm, pred_online, truth_nrem, pred_nrem = [], [], [], [], [], [], []
    subj_k = {"lr": [], "hmm": [], "online": [], "hmm3": [], "deep": []}
    powers = []
    to3 = {0: 0, 1: 1, 2: 1, 3: 2}
    for sid in sids:
        train = [s for s in sids if s != sid]
        m = fit([data[s]["feats"][data[s]["keep"]] for s in train], [data[s]["stage"][data[s]["keep"]] for s in train])
        m["power"], _ = choose_power(train, data)
        powers.append(m["power"])
        d = data[sid]
        em, probs = emissions(m, d["feats"])
        post = smooth(m, em)
        keep = d["keep"]
        t = d["stage"][keep]
        p_lr = probs[keep].argmax(axis=1)
        p_hmm = post[keep].argmax(axis=1)
        on_t, on_p = [], []
        for k in range(PARTIAL_FIRST, len(d["stage"]), PARTIAL_STEP):
            if not keep[k]:
                continue
            last = partial_last(m, d["ehr"][:k + 1], d["emot"][:k + 1])
            if last is not None:
                on_t.append(d["stage"][k])
                on_p.append(int(last.argmax()))
        on_t, p_on = np.array(on_t), np.array(on_p)
        truth.append(t)
        truth_online.append(on_t)
        pred_lr.append(p_lr)
        pred_hmm.append(p_hmm)
        pred_online.append(p_on)
        subj_k["lr"].append(kappa(confusion(t, p_lr, 4)))
        subj_k["hmm"].append(kappa(confusion(t, p_hmm, 4)))
        subj_k["online"].append(kappa(confusion(on_t, p_on, 4)))
        subj_k["hmm3"].append(kappa(confusion(collapse(t, to3), collapse(p_hmm, to3), 3)))
        nrem = (t == 1) | (t == 2)
        pick = nrem & ((p_hmm == 1) | (p_hmm == 2))
        truth_nrem.append(t[pick])
        pred_nrem.append(p_hmm[pick])
        print(f"LOSO {sid}: kappa hmm {subj_k['hmm'][-1]:.3f}, prior power {m['power']}", file=sys.stderr)

    t = np.concatenate(truth)
    blocks = []
    text, acc, kap = report_block("Four classes, logistic regression with HMM smoothing (shipped, whole night, nested LOSO)",
                                  confusion(t, np.concatenate(pred_hmm), 4), CLASSES, subj_k["hmm"])
    blocks.append(text)
    text, acc3, kap3 = report_block("Collapsed to wake / NREM / REM (same predictions)",
                                    confusion(collapse(t, to3), collapse(np.concatenate(pred_hmm), to3), 3),
                                    ["wake", "nrem", "rem"], subj_k["hmm3"])
    blocks.append(text)
    blocks.append(report_block("Four classes, logistic regression alone, no smoothing",
                               confusion(t, np.concatenate(pred_lr), 4), CLASSES, subj_k["lr"])[0])
    blocks.append(report_block(f"Four classes, last epoch of a partial night (forward filter, cut every {PARTIAL_STEP // 2} min)",
                               confusion(np.concatenate(truth_online), np.concatenate(pred_online), 4), CLASSES, subj_k["online"])[0])
    nrem_conf = confusion(np.concatenate(truth_nrem) - 1, np.concatenate(pred_nrem) - 1, 2)
    blocks.append(f"Light against deep, only PSG light or deep epochs that the model also called light or deep: "
                  f"{int(nrem_conf.sum())} epochs, accuracy {np.trace(nrem_conf) / nrem_conf.sum():.3f}, "
                  f"kappa {kappa(nrem_conf):.3f}.\n")
    pooled = confusion(t, np.concatenate(pred_hmm), 4)
    blocks.append("Predicted share divided by PSG share: " + ", ".join(
        f"{n} {pooled[:, c].sum() / pooled[c].sum():.2f}" for c, n in enumerate(CLASSES)) + ".\n")
    blocks.append(f"Prior power chosen inside each training fold: {sorted(set(powers))} (counts "
                  f"{ {p: powers.count(p) for p in sorted(set(powers))} }).\n")
    shares = [float(np.mean(t == c)) for c in range(4)]
    always = max(shares)
    blocks.append("PSG share of epochs: " + ", ".join(f"{n} {s:.3f}" for n, s in zip(CLASSES, shares))
                  + f". Always answering the most common class gives accuracy {always:.3f} and kappa 0.")
    report = "\n".join(blocks)
    print(report)
    if report_path:
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report + "\n")

    final = fit([data[s]["feats"][data[s]["keep"]] for s in sids], [data[s]["stage"][data[s]["keep"]] for s in sids])
    final["power"], final_scores = choose_power(sids, data)
    print(f"final prior power {final['power']}, LOSO kappa per power {final_scores}", file=sys.stderr)
    for key in ("mu", "sd", "w", "b", "prior", "trans"):
        final[key] = np.vectorize(lambda v: float(f"{v:{COEF_FORMAT}}"))(final[key])
    cv = {"subjects": len(sids), "epochs": int(len(t)), "accuracy": acc, "kappa": kap, "acc3": acc3, "kappa3": kap3}
    with open(os.path.join(ROOT, "src", "stagesModel.ts"), "w", encoding="utf-8", newline="\n") as f:
        f.write(model_ts(final, cv))

    import random
    rng = random.Random(20261127)
    hr, mot = fixture_night(rng)
    hr_arr = np.array([math.nan if v is None else float(v) for v in hr])
    mot_arr = np.array([math.nan if v is None else float(v) for v in mot])
    feats, ehr, emot = night_features(hr_arr, mot_arr)
    em, _ = emissions(final, feats)
    post = smooth(final, em)
    cut = 400
    on_last = partial_last(final, ehr[:cut], emot[:cut])
    scored = ~np.isnan(feats).any(axis=1)
    fixture = {
        "hr": hr,
        "motion": mot,
        "features": [[round(float(v), 9) for v in row] if ok else None for row, ok in zip(feats, scored)],
        "stages": [CLASSES[int(i)] if ok else None for i, ok in zip(post.argmax(axis=1), scored)],
        "posterior": [[round(float(v), 9) for v in row] for row in post],
        "partialCutEpochs": cut,
        "partialLast": [round(float(v), 9) for v in on_last],
    }
    with open(os.path.join(HERE, "fixtures", "stages-parity.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(fixture, f, separators=(",", ":"))
        f.write("\n")


if __name__ == "__main__":
    main()
