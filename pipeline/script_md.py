"""Write the readable script for an episode from its storyboard: python script_md.py <episode_dir> <out.md>"""
import csv, json, pathlib, sys
ep = pathlib.Path(sys.argv[1]); sb = json.loads((ep / "storyboard.json").read_text())
tl_path = ep / "build" / "timeline.json"
tl = {b["id"]: b for b in json.loads(tl_path.read_text())["beats"]} if tl_path.exists() else {}
out = [f"# {sb['title']}", "", f"Episode `{sb['episode']}` · {sum(len(b['text'].split()) for b in sb['beats'])} words"
       + (f" · {json.loads(tl_path.read_text())['total']/60:.1f} minutes as narrated" if tl else ""), ""]
meta = ep / "meta.md"
if meta.exists(): out += [meta.read_text().strip(), ""]
out += ["## Script", "", "| Time | Narration | On screen |", "|---|---|---|"]
chapter = None
for b in sb["beats"]:
    if b["chapter"] != chapter and b["chapter"]:
        chapter = b["chapter"]; out.append(f"| | **{chapter}** | |")
    t = tl.get(b["id"]); stamp = f"{int(t['start']//60)}:{int(t['start']%60):02d}" if t else ""
    out.append(f"| {stamp} | {b['text']} | `{b['scene']}`: {b.get('visual', '')} |")
fc = ep / "factcheck.csv"
if fc.exists():
    out += ["", "## Fact-check record", "", "| # | Beat | Claim | Evidence | Source | Status |", "|---|---|---|---|---|---|"]
    for r in csv.DictReader(fc.open()):
        out.append(f"| {r['id']} | {r['beat']} | {r['claim']} | {r['evidence']} | {r['source']} | {r['status']} |")
pathlib.Path(sys.argv[2]).write_text("\n".join(out) + "\n")
print("wrote", sys.argv[2])
