"""Write wf01/data.json from the pilot's data.csv (the single data source) plus the few factcheck.csv figures the scenes show.

    python build_data.py

data.csv: youtube/format-pilots/blackberry-collapse/data.csv (one sourced row per number). Nothing here is typed twice:
chart values come from data.csv; FACTS below are copied from named factcheck.csv rows and are the only other numbers on screen.
"""
import csv, json, pathlib
H = pathlib.Path(__file__).resolve().parent
PILOT = H.parents[1] / "youtube/format-pilots/blackberry-collapse"
rows = list(csv.DictReader(open(PILOT / "data.csv")))
ser = lambda s: [r for r in rows if r["series"] == s]

revenue = [{"fy": r["period"], "end": r["period_end"], "v": float(r["value"]),           # USD million
            "cont": r["basis_note"].startswith("continuing")} for r in ser("revenue")]
devices = [{"fy": r["period"], "v": float(r["value"]), "recognised": "RECOGNIZED" in r["basis_note"]} for r in ser("devices")]
subs = [{"fy": r["period"], "v": float(r["value"]), "over": r["basis_note"].startswith("over")} for r in ser("subscribers")]
XPOS = {"CY2008": 2008.5, "CY2009": 2009.5, "CY2010": 2010.5, "Q4 2011": 2011.875, "CY2012": 2012.5, "CY2013": 2013.5, "Q4 2016": 2016.875}
share = [{"period": r["period"], "x": XPOS[r["period"]], "v": float(r["value"]), "quarter": r["period"].startswith("Q4")} for r in ser("smartphone_share")]
mv = {r["period"]: {"date": r["period_end"], "v": float(r["value"]), "note": r["basis_note"]} for r in ser("market_value")}
fy26 = next(r for r in revenue if r["fy"] == "FY2026")

FACTS = {   # factcheck.csv (pilot) row in brackets
    "android_share": {"CY2009": 3.9, "CY2010": 22.7},                        # [Android share 3.9% (2009) to 22.7% (2010)]
    "units_cy2010_m": 47.5,                                                  # [Gartner share 2010 ... 47.5M units]
    "q4_2016": {"total_m": 432, "bb_units": 207900},                          # [Q4 2016: 432M smartphones; 207,900 BlackBerry OS]
    "fy2026_split": {"QNX": 268.0, "Secure Communications": 258.9, "Licensing": 22.2},   # [FY2026 revenue ...] and data.csv FY2026 note
    "fy2026_qnx_growth_pct": 14, "fy2026_income_cont_m": 53.2,
    "q2fy27": {"rev_m": 163.3, "growth_pct": 26},                             # [Q2 FY2027 ...]
    "staff": {"FY2011": 17500, "FY2026": 1749},                               # [~17,500 full-time employees ...; 1,749 ...]
    "vehicles_m": 275, "carmakers": 45,                                       # [QNX technology in more than 275 million vehicles ...]
    "apps": {"BlackBerry 10 (Mar 2013)": 100000, "Apple App Store (Jan 2013)": 775000},   # [100,000+ ...] [775,000+ ...]
    "playbook": {"provision_m": 485, "sold_q": 150000},                       # [Dec 2011 ...]
    "outage": {"customers_m": 70, "charge_m": 50},                            # [Lazaridis ... 70M] [~$50M charge]
    "sep2013": {"loss_m": [950, 995], "inventory_m": [930, 960], "jobs": 4500},  # [20 Sep 2013 ...]
    "fy2014": {"charges_bn": 2.4, "net_loss_bn": 5.9},                         # [FY2014 charges ... $2.4bn; net loss $5.873bn]
    "fy2011": {"net_income_bn": 3.4},                                         # [FY2011 net income $3.4bn]
    "fairfax": {"per_share": 9, "stake_pct": 10, "debentures_bn": 1},          # [Aug 2013 ... $9/share] [4 Nov 2013 $1bn]
    "cylance": {"bought_bn": 1.4, "sold_cash_m": 160},                         # [Cylance ...]
    "alloy_kore_backlog_m": 100,                                              # [Sep 2026 Alloy Kore ... >$100M]
    "iphone_price": 499, "appstore_launch_apps": 500,                         # [iPhone announced ...] [App Store opened July 2008 ...]
}
peak, low = mv["peak"]["v"], mv["all-time low"]["v"]
data = {"revenue": revenue, "devices": devices, "subscribers": subs, "share": share, "market_value": mv, "facts": FACTS,
        "derived": {"drop_pct": round((1 - low / peak) * 100, 1),                                  # 98.5 -> "98 percent"
                    "fy26_vs_peak_pct": round(fy26["v"] / max(r["v"] for r in revenue) * 100, 1),  # 2.8 -> "under 3 percent"
                    "q4_2016_share_pct": round(FACTS["q4_2016"]["bb_units"] / (FACTS["q4_2016"]["total_m"] * 1e6) * 100, 3),
                    "qnx_share_fy26_pct": round(FACTS["fy2026_split"]["QNX"] / fy26["v"] * 100, 1)}}
assert abs(sum(FACTS["fy2026_split"].values()) - fy26["v"]) < 0.05
(H / "data.json").write_text(json.dumps(data, indent=1))
print("data.json:", len(revenue), "revenue years,", len(share), "share points; derived", data["derived"])
