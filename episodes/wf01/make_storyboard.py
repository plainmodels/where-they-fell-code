"""Write wf01/storyboard.json.

Narration comes from the pilot's beats.py (the script's source of truth, which also writes script.md through build.py);
this file only adds, per beat id, the scene, its parameters, the story year for the ruler, and pronunciation respellings.
Numbers on screen come from data.json (built from data.csv) or from factcheck.csv rows copied into data.json's FACTS.

    python make_storyboard.py
"""
import importlib.util, json, pathlib, re
H = pathlib.Path(__file__).resolve().parent
PILOT = H.parents[1] / "youtube/format-pilots/blackberry-collapse"
spec = importlib.util.spec_from_file_location("beats", PILOT / "beats.py"); bm = importlib.util.module_from_spec(spec); spec.loader.exec_module(bm)
D = json.loads((H / "data.json").read_text()); F = D["facts"]; MV = D["market_value"]
REV = {r["fy"]: r["v"] for r in D["revenue"]}
bn = lambda m: f"${m / 1000:.1f}bn"
TX = {b[0]: b[1] for b in bm.BEATS if not isinstance(b, str)}
def fr(bid, phrase, off=0.0):
    """Where a phrase starts in a beat's narration, as a fraction of its length: reveals land roughly when the words are said."""
    i = TX[bid].find(phrase); assert i >= 0, (bid, phrase); return round(max(0.0, i / len(TX[bid]) + off), 3)

# Kokoro (en-us) respellings: the subtitles keep the real spelling, the voice reads the respelling.
SAY = {"QNX": "Q N X", "The NOC": "The N O C", "Lazaridis": "Lazza-reedis", "Balsillie": "Bal-silly", "Fregin": "Free-gin", "the NOC": "the N O C",
       "BBM": "B B M", "TCL": "T C L", "Thorsten Heins": "Torsten Hines", "Heins": "Hines", "Cylance": "Sigh-lance", "Sybase": "Sigh-base",
       "Coretura": "Core-tura", "Alloy Kore": "Alloy Core", "Z10": "Zee ten", "Q10": "Q ten", "2.0": "two point oh",
       "Cingular": "Sing-yuh-ler", "ActiveSync": "Active Sync", "Daimler": "Dime-ler"}

# Kokoro's phonemiser reads "47.5" as "forty-seven. five" and "17,500" as "seventeen, five hundred" (checked 2026-11-20 with
# tokenizer.phonemize), so every decimal and every comma-grouped number is written out in words for the voice.
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
def words(n):
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    if n < 1000: return ONES[n // 100] + " hundred" + (" and " + words(n % 100) if n % 100 else "")
    for div, name in ((10**9, "billion"), (10**6, "million"), (1000, "thousand")):
        if n >= div: r = n % div; return words(n // div) + " " + name + ((" and " if r < 100 else ", ") + words(r) if r else "")
def spoken(s):
    s = re.sub(r"\b(\d+)\.(\d+)\b", lambda m: words(int(m.group(1))) + " point " + " ".join(ONES[int(c)] for c in m.group(2)), s)
    s = re.sub(r"\b\d{1,3}(?:,\d{3})+\b", lambda m: words(int(m.group(0).replace(",", ""))), s)
    s = re.sub(r"\b19(\d\d)\b", lambda m: "nineteen " + (words(int(m.group(1))) if int(m.group(1)) >= 10 else "oh " + ONES[int(m.group(1))]), s)
    return s

def mvbar(k, label, sub): return {"k": k, "label": label, "sub": sub}
LEDGER = [
    {"label": "Revenue", "unit": "per fiscal year", "bars": [{"v": REV["FY2011"], "txt": bn(REV["FY2011"]), "when": "year to Feb 2011"},
                                                            {"v": REV["FY2026"], "txt": f"${REV['FY2026']:.0f}m", "when": "year to Feb 2026"}]},
    {"label": "People", "unit": "employees", "bars": [{"v": F["staff"]["FY2011"], "txt": f"~{F['staff']['FY2011']:,}", "when": "full-time, early 2011"},
                                                       {"v": F["staff"]["FY2026"], "txt": f"{F['staff']['FY2026']:,}", "when": "incl. contract and student workers, Feb 2026"}]},
    {"label": "Market value", "unit": "our estimate: close x shares", "bars": [{"v": MV["peak"]["v"], "txt": f"${MV['peak']['v']:.1f}bn", "when": "19 Jun 2008"},
                                                       {"v": MV["all-time low"]["v"], "txt": f"${MV['all-time low']['v']:.1f}bn", "when": "low, 7 Aug 2024"}]},
]
now = MV["latest"]; import datetime; nd = datetime.date.fromisoformat(now["date"])
LEDGER_NOW = json.loads(json.dumps(LEDGER)); LEDGER_NOW[2]["bars"].append({"v": now["v"], "txt": f"${now['v']:.1f}bn", "when": f"close, {nd.day} {nd.strftime('%b %Y')}", "late": True})

V = {   # beat id: (scene, params, story year, sfx)
 "b01": ("coldopen", {}, 2026, [[0.3, "hit"]]),
 "b02": ("valuebars", {"bars": [mvbar("peak", "June 2008", "peak close"), mvbar("all-time low", "August 2024", "lowest close")], "ats": [fr("b02", "In June 2008"), fr("b02", "In August 2024")]}, 2008, []),
 "b03": ("title", {"kicker": "CASE 01", "title": ["BlackBerry: how an $83 billion", "phone giant lost 98%"], "sub": "and what the company is now",
                   "counter": {"to": F["vehicles_m"] * 1_000_000, "label": "vehicles with its QNX software"}}, 2026, []),
 "b04": ("bullets", {"head": "A chain of decisions", "items": ["Why BlackBerry won", "How it answered the iPhone", "The tablet, the outage and the late new phone",
                                                          "The exit from phones", "The business that is left"]}, 2026, []),
 "b05": ("timeline", {"events": [{"d": "1984", "t": "Research In Motion founded", "s": "Mike Lazaridis, Douglas Fregin"},
                                  {"d": "INVESTOR", "t": "Jim Balsillie joins", "s": "as co-chief executive"},
                                  {"d": "JAN 1999", "t": "BlackBerry email service", "s": "North America"},
                                  {"d": "1999", "t": "first device: an email pager", "s": "sends and receives email", "icon": "kb"}], "hl": [2], "ats": [fr("b05", "Mike"), fr("b05", "Jim Balsillie"), fr("b05", "In January 1999"), fr("b05", "The first device")],
                      "src": "The Canadian Encyclopedia; RIM annual reports (40-F)"}, 1984, []),
 "b06": ("pushpull", {}, 1999, []),
 "b07": ("network", {"mode": "normal"}, 1999, []),
 "b08": ("network", {"mode": "compress"}, 2009, []),
 "b09": ("flow", {"mode": "three"}, 2005, []),
 "b10": ("keyboard", {}, 2005, []),
 "b11": ("vbars", {"head": "Subscriber accounts at the end of each fiscal year", "max": 45,
                   "rows": [{"label": f"to {m}", "v": s["v"], "txt": ("over " if s["over"] else "~") + f"{s['v']:.0f}m", "hl": s["fy"] == "FY2010"}
                            for s, m in zip([x for x in D["subscribers"] if x["fy"] in ("FY2007", "FY2008", "FY2009", "FY2010")], ["Mar 2007", "Mar 2008", "Feb 2009", "Feb 2010"])],
                   "ats": [fr("b11", "about 8 million"), (fr("b11", "about 8 million") + fr("b11", "about 25 million")) / 2, fr("b11", "about 25 million"), fr("b11", "over 41 million")],
                   "foot": "Source: RIM annual reports (40-F), fiscal 2009 and 2011"}, 2010, []),
 "b12": ("timeline", {"events": [{"d": "9 JAN 2007", "t": "Apple announces the iPhone", "s": "touchscreen · no keyboard · full web browser", "icon": "slab"},
                                  {"d": "JUNE 2007", "t": "On sale in the US", "s": f"from ${F['iphone_price']} · one carrier: Cingular"}], "hl": [0], "ats": [0.02, fr("b12", "It went on sale")],
                      "src": "Apple press releases, January 2007"}, 2007, [[0.05, "hit"]]),
 "b13": ("timeline", {"events": [{"d": "JUNE 2007", "t": "No Microsoft Exchange support", "s": "the first iPhone"},
                                  {"d": "MARCH 2008", "t": "Exchange ActiveSync coming", "s": "push email, contacts, calendars"},
                                  {"d": "JULY 2008", "t": "The App Store opens", "s": f"more than {F['appstore_launch_apps']} apps"}], "hl": [1], "ats": [fr("b13", "The first iPhone"), fr("b13", "In March 2008"), fr("b13", "And in July 2008")],
                      "src": "Apple press releases, March and July 2008"}, 2008, []),
 "b14": ("moat", {}, 2008, []),
 "b15": ("revenue", {"from": 0, "to": 5, "devices": True, "iphone": True, "iphoneAt": fr("b15", "Here is the iPhone"), "gat": fr("b15", "3 billion", -0.05), "gspan": fr("b15", "19.9 billion") - fr("b15", "3 billion", -0.05),
                     "labels": ["FY2007", "FY2008", "FY2009", "FY2010", "FY2011"], "devlab": ["FY2011"], "peak": "BEST YEAR: FY2011", "peakAt": fr("b15", "RIM's best year")}, 2011, [[0.86, "hit"]]),
 "b16": ("share", {"upto": 3, "android": True, "androidAt": fr("b16", "Android went"), "hl": ["CY2009"], "ats": [fr("b16", "Here is BlackBerry"), fr("b16", "19.9 percent"), fr("b16", "and its share still fell")], "note": f"2010: {F['units_cy2010_m']}m sold, share down", "noteAt": fr("b16", "In 2010")}, 2010, []),
 "b17": ("storm", {"quote": {"lines": ["This is the fastest-selling", "device we've had to date."], "who": "Verizon spokeswoman", "where": "quoted by NBC News, December 2008", "px": 44}}, 2008, []),
 "b18": ("timeline", {"y": 450, "events": [{"d": "JULY 2008", "t": "Apple's App Store"}, {"d": "1 APRIL 2009", "t": "RIM's App World", "s": "about nine months later"}], "hl": [1],
                      "after": ["NEW OPERATING SYSTEM", "start again, on new foundations"], "ats": [0.03, 0.15], "spread": 0.45}, 2009, []),
 "b19": ("qnx", {}, 2010, []),
 "b20": ("bridge", {}, 2011, []),
 "b21": ("figures", {"head": "December 2011 · the tablet", "items": [{"big": f"${F['playbook']['provision_m']} million", "small": "provision on tablet inventory", "hot": True},
                                                                    {"big": f"~{F['playbook']['sold_q']:,}", "small": "tablets sold into stores that quarter"}], "ats": [0.05, fr("b21", "In that quarter")],
                     "src": "RIM press release, 2 December 2011"}, 2011, []),
 "b22": ("network", {"mode": "outage"}, 2011, [[0.15, "hit"]]),
 "b23": ("quote", {"head": "17 October 2011", "quote": {"lines": ["Our global network supports the", "communications needs of more", f"than {F['outage']['customers_m']} million customers."],
                                                       "who": "Mike Lazaridis, co-chief executive", "where": "RIM press release, 17 October 2011"},
                   "foot": ["free apps offered as an apology", f"later: a charge of about ${F['outage']['charge_m']} million against revenue"], "footAt": 0.6}, 2011, []),
 "b24": ("quote", {"head": "22 January 2012 · Thorsten Heins named chief executive", "quote": {"lines": ["There comes a time in the growth of", "every successful company when the", "founders recognize the need to pass", "the baton to new leadership."],
                                                       "who": "Mike Lazaridis", "where": "RIM press release, 22 January 2012", "px": 46}}, 2012, []),
 "b25": ("timeline", {"events": [{"d": "JANUARY 2012", "t": "BlackBerry 10 expected", "s": "“to ship later this year”"},
                                  {"d": "30 JANUARY 2013", "t": "BlackBerry 10 launches", "s": "Z10 (touch) · Q10 (keyboard)", "icon": "slab"},
                                  {"d": "30 JANUARY 2013", "t": "RIM becomes BlackBerry", "s": "the company's new name"}], "hl": [1], "ats": [0.02, fr("b25", "BlackBerry 10 launched"), fr("b25", "The same day")],
                      "span": [0, 1, "it slipped into 2013"], "spanY": 330, "src": "RIM / BlackBerry press releases, January 2012 and January 2013"}, 2013, []),
 "b26": ("apps", {"head": "Apps on offer, by each company's own count", "loop": True,
                  "rows": [{"label": "BlackBerry 10 · March 2013", "v": F["apps"]["BlackBerry 10 (Mar 2013)"], "txt": "100,000+"},
                           {"label": "Apple App Store · January 2013", "v": F["apps"]["Apple App Store (Jan 2013)"], "txt": "775,000+", "hl": True}],
                  "foot": "BlackBerry annual information form, 28 March 2013; Apple press release, 7 January 2013"}, 2013, []),
 "b27": ("flow", {"mode": "thin"}, 2013, []),
 "b28": ("byod", {}, 2013, []),
 "b29": ("figures", {"head": "September 2013 warning, and the year to March 2014", "lh": 140, "items": [
                        {"big": f"up to ${F['sep2013']['loss_m'][1]}m", "small": "quarterly operating loss (warning)", "px": 76},
                        {"big": f"${F['sep2013']['inventory_m'][0]}–{F['sep2013']['inventory_m'][1]}m", "small": "inventory charge in that quarter", "px": 76},
                        {"big": f"~{F['sep2013']['jobs']:,}", "small": "job cuts", "px": 76},
                        {"big": f"~${F['fy2014']['charges_bn']}bn", "small": "BlackBerry 10 inventory and supply charges, year to Mar 2014", "px": 76},
                        {"big": f"${F['fy2014']['net_loss_bn']}bn", "small": "net loss, year to March 2014", "px": 76, "hot": True}],
                     "ats": [fr("b29", "warned"), fr("b29", "including an inventory"), fr("b29", "4,500"), fr("b29", "For the year to March 2014"), fr("b29", "came to about")],
                     "src": "BlackBerry press release (6-K), 20 September 2013; annual report (40-F), fiscal 2014"}, 2013, []),
 "b30": ("combo", {"rev": {"from": 0, "to": 8, "devices": True, "grow": 6, "gat": fr("b30", "Then 18.4"), "gspan": fr("b30", "Devices:") - fr("b30", "Then 18.4"), "labels": ["FY2011", "FY2012", "FY2013", "FY2014"], "devlab": ["FY2014"]},
                   "share": {"upto": 6, "from": 3}, "shareAt": fr("b30", "Market share")}, 2014, []),
 "b31": ("valuebars", {"bars": [mvbar("peak", "June 2008", "our estimate"), mvbar("co-CEOs step down", "January 2012", "our estimate"),
                                mvbar("Fairfax offer", "September 2013", f"offer: ${F['fairfax']['per_share']} a share")],
                       "ats": [0.02, 0.1, fr("b31", "The offer")],
                       "foot": "June 2008 and January 2012: our estimates (close x shares). September 2013: offer value stated by BlackBerry."}, 2013, []),
 "b32": ("timeline", {"events": [{"d": "23 SEP 2013", "t": "Letter of intent: Fairfax-led group", "s": f"${F['fairfax']['per_share']} a share"},
                                  {"d": "4 NOV 2013", "t": f"No takeover: ${F['fairfax']['debentures_bn']}bn investment instead", "s": "convertible debt"},
                                  {"d": "4 NOV 2013", "t": "Heins steps down", "s": "John Chen: executive chair, interim CEO"}], "hl": [1], "ats": [0.02, fr("b32", "On the 4th"), fr("b32", "Heins stepped down")],
                      "src": "BlackBerry press releases, 23 September and 4 November 2013"}, 2013, []),
 "b33": ("quote", {"head": "28 September 2016", "quote": {"lines": ["The company plans to end all internal", "hardware development and will", "outsource that function to partners."],
                                                         "who": "John Chen", "where": "BlackBerry press release, 28 September 2016", "px": 46},
                   "foot": ["before that: BBM released for Android and iPhone"], "footAt": 0.05}, 2016, []),
 "b34": ("timeline", {"events": [{"d": "DECEMBER 2016", "t": "TCL licence: Android phones", "s": "BlackBerry-branded, built by TCL"},
                                  {"d": "AUGUST 2020", "t": "The TCL licence ends"},
                                  {"d": "4 JANUARY 2022", "t": "Old services switched off", "s": "BlackBerry 7 and 10 devices", "icon": "grey"}], "hl": [2], "ats": [0.02, fr("b34", "That arrangement ended"), fr("b34", "And on the 4th")],
                      "src": "BlackBerry and TCL announcements; BlackBerry support notice"}, 2022, []),
 "b35": ("sliver", {}, 2016, []),
 "b36": ("car", {}, 2026, []),
 "b37": ("bullets", {"head": "Secure communications", "numbered": False, "items": ["SecuSUITE: encrypted calls and messages", "UEM: managing employees' devices",
                                                                                  "AtHoc: emergency alert systems"]}, 2026, []),
 "b38": ("figures", {"head": "The Cylance detour", "items": [{"big": f"${F['cylance']['bought_bn']}bn", "small": "cash deal for Cylance, completed February 2019"},
                                                             {"big": f"${F['cylance']['sold_cash_m']}m", "small": "cash before adjustments, plus shares: sold February 2025", "hot": True},
                                                             {"big": "2023", "small": "non-core patent portfolio sold"}],
                     "ats": [fr("b38", "In February 2019"), fr("b38", "In February 2025"), fr("b38", "And in 2023")],
                     "src": "BlackBerry press release (6-K), 16 November 2018; annual report (10-K), fiscal 2026"}, 2025, []),
 "b39": ("splitbar", {"head": "Revenue, year to February 2026", "total": f"${REV['FY2026']:.1f} million", "total2": f"income from continuing operations: ${F['fy2026_income_cont_m']}m",
                      "parts": [{"label": "QNX", "v": F["fy2026_split"]["QNX"], "txt": f"${F['fy2026_split']['QNX']:.1f}m · up {F['fy2026_qnx_growth_pct']}%", "col": "red"},
                                {"label": "Secure Communications", "v": F["fy2026_split"]["Secure Communications"], "txt": f"${F['fy2026_split']['Secure Communications']:.1f}m", "col": "bone"},
                                {"label": "Licensing", "v": F["fy2026_split"]["Licensing"], "txt": f"${F['fy2026_split']['Licensing']:.1f}m", "col": "steel"}],
                      "card": ["quarter to August 2026", f"${F['q2fy27']['rev_m']}m, +{F['q2fy27']['growth_pct']}%", "record revenue from QNX"],
                      "src": "BlackBerry annual report (10-K), fiscal 2026; results for the quarter to 31 August 2026"}, 2026, []),
 "b40": ("statement", {"px": 58, "lines": ["QNX and Vector: Alloy Kore, a vehicle operating system", "first customer: Coretura (Daimler Truck and Volvo Group)",
                                          "the largest design win in QNX history", f"over ${F['alloy_kore_backlog_m']} million added to the royalty backlog"], "accent": [3],
                       "sub": "backlog = the company's estimate of future royalties, not money already earned", "src": "BlackBerry filing (8-K), 22 September 2026"}, 2026, []),
 "b41": ("ledger", {"rows": LEDGER, "ats": [fr("b41", "Revenue"), fr("b41", "People"), fr("b41", "Market value")], "kgap": 1.4, "src": "Annual reports (40-F, 10-K); market values are our estimates from closing prices (Yahoo Finance) and filed share counts"}, 2026, []),
 "mv_now": ("ledger", {"rows": LEDGER_NOW, "instant": True, "lateAt": 0.3, "src": f"Latest: close of ${now['note'].split('close $')[1].split(' ')[0]} on {nd.day} {nd.strftime('%B %Y')} x shares from the latest 10-Q. Our estimate."}, 2026, []),
 "b42": ("bullets", {"head": "Limits", "px": 40, "items": ["Fiscal years end late February or early March", "FY2014 devices were counted differently (recognised)",
                                                          "Revenue from 2025 on excludes Cylance", "Market share: Gartner, via press reports; Q4 2011 is one quarter",
                                                          "Market values: our estimates, price x shares", "Decisions and results, not motives"]}, 2026, []),
 "b43": ("bullets", {"head": "Three things", "items": ["Best year: four years after the iPhone", "Its network: an edge, a single point of failure, and a fee",
                                                      f"QNX, bought for a tablet: about half of revenue"]}, 2026, []),
 "b44": ("endcard", {}, 2026, []),
}

OUT, chapter = [], ""
for b in bm.BEATS:
    if isinstance(b, str): chapter = b[3:]; continue
    bid, text, visual = b
    scene, p, yr, sfx = V[bid]
    say = text
    for k, v in SAY.items(): say = say.replace(k, v)
    say = spoken(say)
    beat = {"id": bid, "chapter": "" if bid in ("b01", "b02", "b03") else chapter, "scene": scene, "p": p, "yr": yr, "text": text, "visual": visual.split("`: ", 1)[-1]}
    if say != text: beat["say"] = say
    if sfx: beat["sfx"] = sfx
    if bid == "b03": beat["gap"] = 0.8
    OUT.append(beat)
missing = set(V) - {b["id"] for b in OUT}; assert not missing, missing
sb = {"episode": "wf01", "title": "BlackBerry: How an $83 Billion Phone Giant Lost 98%", "case": "CASE 01 · BLACKBERRY",
      "voice": "am_puck", "lang": "en-us", "speed": 1.1, "gap": 0.5, "tail": 11, "beats": OUT}
(H / "storyboard.json").write_text(json.dumps(sb, indent=1, ensure_ascii=False))
print(len(OUT), "beats", sum(len(b["text"].split()) for b in OUT), "words")
