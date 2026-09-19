from pathlib import Path
from collections import Counter
from datetime import date
import hashlib, json, re
import numpy as np
import scipy
from scipy.signal import find_peaks
from scipy.optimize import minimize_scalar

def epoch(text):
    match = re.fullmatch(r"(\d{4})/(\d{2})/(\d{2})\.(\d{5})", text)
    if not match:
        raise ValueError("Unexpected catalogue date: " + text)
    year, month, day, fraction = map(int, match.groups())
    return date(year, month, day).toordinal() * 100000 + fraction

def peaks(curve, grid, span, refine=None, limit=5):
    indices = list(find_peaks(curve)[0])
    if curve[0] >= curve[1]:
        indices.append(0)
    if curve[-1] >= curve[-2]:
        indices.append(len(grid)-1)
    chosen = []
    for i in sorted(indices, key=lambda k: curve[k], reverse=True):
        frequency, height = float(grid[i]), float(curve[i])
        edge = i in (0, len(grid)-1)
        if refine is not None and not edge:
            result = minimize_scalar(
                lambda f: -refine(f), bounds=(grid[i-1], grid[i+1]),
                method="bounded", options={"xatol": 1e-10})
            if result.success and -result.fun > height:
                frequency, height = float(result.x), float(-result.fun)
        if any(abs(frequency-p["frequency"]) < 1/span for p in chosen):
            continue
        chosen.append(dict(frequency=frequency, period_days=1/frequency,
                           score=height, search_boundary=edge))
        if len(chosen) == limit:
            break
    return sorted(chosen, key=lambda p: p["score"], reverse=True)

def scan(rows, weights, grid):
    origin = min(r["tick"] for r in rows)
    t = np.array([(r["tick"]-origin)/100000 for r in rows])
    w = np.array([weights[r["line"]] for r in rows])
    y = np.array([r["xy"] for r in rows])
    span = float(np.ptp(t))
    t -= np.average(t, weights=w)
    root = np.sqrt(w)
    yw = (y-np.average(y, axis=0, weights=w))*root[:, None]
    null = float(np.sum(yw*yw))
    if span <= 0 or null <= 0:
        raise ValueError("Insufficient time span or coordinate variation.")

    def evaluate(frequency):
        phase = 2*np.pi*frequency*t
        c, s = np.cos(phase), np.sin(phase)
        design = np.column_stack((np.ones(len(t)), c, s))*root[:, None]
        coefficients = np.linalg.lstsq(design, yw, rcond=None)[0]
        residual = yw-design@coefficients
        score = float(1-np.sum(residual*residual)/null)
        window = float((np.dot(w,c)**2+np.dot(w,s)**2)/w.sum()**2)
        return score, window

    curves = np.array([evaluate(f) for f in grid])
    summary = dict(
        records=len(rows), calendar_dates=len({r["date"][:10] for r in rows}),
        span_days=span, first=min(r["date"] for r in rows),
        last=max(r["date"] for r in rows),
        candidates=peaks(curves[:,0], grid, span,
                         refine=lambda f: evaluate(f)[0]),
        sampling_peaks=peaks(curves[:,1], grid, span, limit=3))
    return summary, curves

def show(label, summary):
    print(f"\n{label}: {summary['records']} records; "
          f"{summary['calendar_dates']} calendar dates", flush=True)
    for p in summary["candidates"]:
        edge = " SEARCH BOUNDARY" if p["search_boundary"] else ""
        print(f"  period={p['period_days']:.4f} days  "
              f"frequency={p['frequency']:.6f}/day  score={p['score']:.4f}{edge}")
    print("  Sampling peaks (/day): " + ", ".join(
        f"{p['frequency']:.6f}" for p in summary["sampling_peaks"]), flush=True)

def main():
    root = Path(__file__).resolve().parents[1]
    output = root/"analysis"/"recurrence-scan-v1"
    if output.exists():
        raise SystemExit("STOP: recurrence-scan-v1 already exists; preserved.")
    expected = "b29f6b7dd61a20ee426cf83f0f4947da90cb3b0e9095e34e7ae0c4f232ef6223"
    data = (root/"satsatd.dat").read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit("STOP: companion source hash mismatch.")

    rows = []
    for number, raw in enumerate(data.decode("ascii").splitlines(), 1):
        stamp = raw[3:19].strip()
        rows.append(dict(line=number, pair=raw[:2], date=stamp,
                         tick=epoch(stamp),
                         xy=[float(raw[20:28]), float(raw[29:37])]))
    if len(rows) != 671 or not np.isfinite([r["xy"] for r in rows]).all():
        raise SystemExit("STOP: invalid record count or coordinates.")

    flag = rows[639]
    if (flag["pair"], flag["date"]) != ("24", "2018/05/05.90303"):
        raise SystemExit("STOP: flagged-record identity mismatch.")

    counts = Counter((r["pair"], r["date"][:10]) for r in rows)
    weights = {r["line"]: 1/counts[(r["pair"], r["date"][:10])] for r in rows}
    span = (max(r["tick"] for r in rows)-min(r["tick"] for r in rows))/100000
    grid = np.linspace(0.025, 2.0, int(np.ceil(1.975*12*span))+1)
    full, arrays = {}, {"frequency_per_catalogue_day": grid}

    print("EXPLORATORY SCAN: 0.5-40 catalogue days", flush=True)
    print("Score is weighted squared-error reduction, not confidence.", flush=True)
    for pair in sorted({r["pair"] for r in rows}):
        subset = [r for r in rows if r["pair"] == pair]
        summary, curves = scan(subset, weights, grid)
        full[pair] = summary
        arrays[f"full_{pair}_score"] = curves[:,0]
        arrays[f"full_{pair}_window"] = curves[:,1]
        show("FULL / PAIR "+pair, summary)

    subset = [r for r in rows if r["pair"] == "24" and r["line"] != 640]
    sensitivity, curves = scan(subset, weights, grid)
    arrays["omit640_24_score"] = curves[:,0]
    arrays["omit640_24_window"] = curves[:,1]
    show("OMIT LINE 640 / PAIR 24", sensitivity)
    comparison = dict(full)
    comparison["24"] = sensitivity

    report = dict(
        status="Exploratory candidate peaks; individual moon periods not established by this scan.",
        source=dict(file="satsatd.dat", sha256=expected),
        script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        requirements_sha256=hashlib.sha256((root/"analysis-requirements.txt").read_bytes()).hexdigest(),
        versions=dict(numpy=np.__version__, scipy=scipy.__version__),
        method=dict(
            coordinates="Published dRAs and dDEs in arcseconds; O-C columns unused.",
            time="Recorded calendar-date differences in days; no time-scale or A8 conversion.",
            model="One trial frequency; separate offset, cosine and sine coefficients for each coordinate.",
            weights="Each pair/calendar date has total weight 1 in full data; retained weights unchanged in sensitivity run.",
            score="1 minus weighted two-coordinate residual sum of squares / constant-model sum of squares.",
            sampling_window="Squared modulus of weighted mean exp(2*pi*i*f*t).",
            candidate_spacing="At least 1/(pair time span) cycles/day.",
            search_period_days=[0.5,40.0], frequency_grid_points=len(grid),
            frequency_step=float(grid[1]-grid[0]), supplied_orbital_periods=[],
            reference="https://arxiv.org/abs/1703.09824"),
        scope="Independent archive analysis; no Core20 authority input.",
        flagged_record=flag,
        full=dict(records=671, pairs=full),
        omit_line640=dict(records=670, pairs=comparison,
                          note="Only pair 24 changes; five identical scans reused."))

    output.mkdir()
    np.savez_compressed(output/"scan-curves.npz", **arrays)
    report["curves_sha256"] = hashlib.sha256(
        (output/"scan-curves.npz").read_bytes()).hexdigest()
    (output/"report.json").write_text(
        json.dumps(report, indent=2, allow_nan=False)+"\n")
    print("\nSAVED:", output, flush=True)
    print("REPORT SHA-256:", hashlib.sha256(
        (output/"report.json").read_bytes()).hexdigest())

if __name__ == "__main__":
    main()
