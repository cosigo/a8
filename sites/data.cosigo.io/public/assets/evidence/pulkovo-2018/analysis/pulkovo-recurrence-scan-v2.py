from pathlib import Path
from collections import Counter
import hashlib, importlib.util, json
import numpy as np
import scipy
from scipy.optimize import least_squares

def two_frequency_scan(rows, weights, grid, anchor, picker):
    origin = min(r["tick"] for r in rows)
    t = np.array([(r["tick"]-origin)/100000 for r in rows])
    w = np.array([weights[r["line"]] for r in rows])
    y = np.array([r["xy"] for r in rows])
    span = float(np.ptp(t))
    t -= np.average(t, weights=w)
    root = np.sqrt(w)
    yw = (y-np.average(y, axis=0, weights=w))*root[:,None]
    null = float(np.sum(yw*yw))
    if span <= 0 or null <= 0:
        raise ValueError("Insufficient span or variation.")

    def residual(frequencies):
        columns = [np.ones(len(t))]
        for f in frequencies:
            columns.extend((np.cos(2*np.pi*f*t), np.sin(2*np.pi*f*t)))
        design = np.column_stack(columns)*root[:,None]
        beta = np.linalg.lstsq(design, yw, rcond=None)[0]
        return ((yw-design@beta)/np.sqrt(null)).ravel()

    baseline = float(np.sum(residual([anchor])**2))
    curve = np.array([1-float(np.sum(residual([anchor,f])**2)) for f in grid])
    candidates = [p for p in picker(curve, grid, span, limit=8)
                  if abs(p["frequency"]-anchor) >= 1/span][:5]
    fits = []
    for p in candidates:
        seed = np.array([anchor, p["frequency"]])
        low = np.maximum(grid[0], seed-0.45/span)
        high = np.minimum(grid[-1], seed+0.45/span)
        fit = least_squares(residual, seed, bounds=(low,high),
                            x_scale="jac", max_nfev=300,
                            ftol=1e-10, xtol=1e-10, gtol=1e-10)
        error = float(np.sum(fit.fun**2))
        fits.append(dict(
            frequencies=fit.x.tolist(), periods_days=(1/fit.x).tolist(),
            score=1-error, remaining_error_reduction=1-error/baseline,
            converged=bool(fit.success), active_bounds=fit.active_mask.tolist(),
            seed_frequencies=seed.tolist(), bounds=[low.tolist(),high.tolist()]))
    return dict(records=len(rows), calendar_dates=len({r["date"][:10] for r in rows}),
                anchor_period_days=1/anchor, baseline_score=1-baseline,
                candidates=sorted(fits, key=lambda p:p["score"], reverse=True)), curve

def show(label, result):
    print(f"\n{label}: {result['records']} records; "
          f"anchor={result['anchor_period_days']:.4f} days", flush=True)
    for p in result["candidates"]:
        flags = ""
        if not p["converged"]:
            flags += " NOT CONVERGED"
        if any(p["active_bounds"]):
            flags += " LOCAL BOUNDARY"
        a,b = p["periods_days"]
        print(f"  primary={a:.4f} d  second={b:.4f} d"
              f"  score={p['score']:.5f}"
              f"  residual reduction={100*p['remaining_error_reduction']:.2f}%"
              f"{flags}", flush=True)

def main():
    root = Path(__file__).resolve().parents[1]
    output = root/"analysis"/"recurrence-scan-v2"
    if output.exists():
        raise SystemExit("STOP: recurrence-scan-v2 already exists; preserved.")
    prior_dir = root/"analysis"/"recurrence-scan-v1"
    prior_bytes = (prior_dir/"report.json").read_bytes()
    expected = "770bec6e8c2e034825804c1505f76d1fb5b2039fc8438c83f03f2690f7473ded"
    if hashlib.sha256(prior_bytes).hexdigest() != expected:
        raise SystemExit("STOP: V1 report fingerprint differs.")
    prior = json.loads(prior_bytes)

    old_script = root/"analysis"/"pulkovo-recurrence-scan-v1.py"
    if hashlib.sha256(old_script.read_bytes()).hexdigest() != prior["script_sha256"]:
        raise SystemExit("STOP: V1 script fingerprint differs.")
    spec = importlib.util.spec_from_file_location("pulkovo_v1", old_script)
    old = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(old)

    data = (root/"satsatd.dat").read_bytes()
    if hashlib.sha256(data).hexdigest() != prior["source"]["sha256"]:
        raise SystemExit("STOP: source fingerprint differs.")
    rows = []
    for n,raw in enumerate(data.decode("ascii").splitlines(),1):
        stamp = raw[3:19].strip()
        rows.append(dict(line=n, pair=raw[:2], date=stamp, tick=old.epoch(stamp),
                         xy=[float(raw[20:28]),float(raw[29:37])]))

    archive_bytes = (prior_dir/"scan-curves.npz").read_bytes()
    if hashlib.sha256(archive_bytes).hexdigest() != prior["curves_sha256"]:
        raise SystemExit("STOP: V1 curves fingerprint differs.")
    with np.load(prior_dir/"scan-curves.npz", allow_pickle=False) as archive:
        grid = archive["frequency_per_catalogue_day"].copy()

    counts = Counter((r["pair"],r["date"][:10]) for r in rows)
    weights = {r["line"]:1/counts[(r["pair"],r["date"][:10])] for r in rows}
    full, arrays = {}, {"frequency_per_catalogue_day":grid}

    print("TWO-FREQUENCY SCAN: selected long-period primary branch", flush=True)
    print("Scores and residual reductions are not confidence levels.", flush=True)
    cases = [("full",p) for p in sorted(prior["full"]["pairs"])]
    cases.append(("omit_line640","24"))
    sensitivity = None
    for case,pair in cases:
        seeds = [p for p in prior[case]["pairs"][pair]["candidates"]
                 if p["period_days"] > 2]
        if not seeds:
            raise SystemExit("STOP: no long-period seed for "+pair)
        anchor = max(seeds,key=lambda p:p["score"])["frequency"]
        subset = [r for r in rows if r["pair"] == pair
                  and (case == "full" or r["line"] != 640)]
        result,curve = two_frequency_scan(subset,weights,grid,anchor,old.peaks)
        arrays[case+"_"+pair+"_conditional_score"] = curve
        if case == "full":
            full[pair] = result
        else:
            sensitivity = result
        show(case.upper()+" / PAIR "+pair,result)

    comparison = dict(full)
    comparison["24"] = sensitivity
    method = dict(prior["method"])
    method.update(
        model="Two frequencies; separate offset and two sine/cosine pairs per coordinate.",
        branch_selection="Highest-scoring V1 candidate with period >2 days for each pair/case.",
        search="Scan second frequency with primary fixed; locally refine both frequencies for five separated candidates.",
        local_bounds="Each frequency within 0.45/(pair span) of its seed, clipped to original search range.",
        scope="Other primary alias branches are not searched in this run.",
        residual_reduction="Relative to the selected single-frequency baseline, not a significance estimate.")
    report = dict(
        status="Exploratory two-frequency fits on a selected primary branch.",
        source=prior["source"], prior_report_sha256=expected,
        prior_script_sha256=prior["script_sha256"],
        script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        versions=dict(numpy=np.__version__,scipy=scipy.__version__),
        requirements_sha256=hashlib.sha256((root/"analysis-requirements.txt").read_bytes()).hexdigest(),
        method=method, scope=prior["scope"], flagged_record=prior["flagged_record"],
        full=dict(records=671,pairs=full),
        omit_line640=dict(records=670,pairs=comparison,
                          note="Only pair 24 changes; other pair results reused."))

    output.mkdir()
    np.savez_compressed(output/"conditional-curves.npz",**arrays)
    report["curves_sha256"] = hashlib.sha256(
        (output/"conditional-curves.npz").read_bytes()).hexdigest()
    (output/"report.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n")
    print("\nSAVED:",output,flush=True)
    print("REPORT SHA-256:",hashlib.sha256((output/"report.json").read_bytes()).hexdigest())

if __name__ == "__main__":
    main()
