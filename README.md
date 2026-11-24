# Where They Fell: the code behind the videos

How companies fell, told through the decisions they made and the numbers that followed. YouTube: @WhereTheyFell

Every number said in a video comes from data and code in this repository. Each episode has, in `episodes/<episode>/`:

- `build_data.py` turns the source data into `data.json`; `make_storyboard.py` writes the script, with every number pulled from
  `data.json`; `scenes.js` / the pipeline draw every frame in code.
- `factcheck.csv` lists every claim with its source and status (VERIFIED against the cited page, COMPUTED from the stated inputs,
  or noted as an estimate).
- `shorts.json` lists the short clips cut from the episode.

`pipeline/` is how the video is made: narration is synthesised with a text-to-speech model (`tts.py`), every frame is drawn in
code on an HTML canvas and captured with a headless browser (`render.py`), then assembled with ffmpeg and checked against a
speech-to-text transcription (`assemble.py`). No stock footage.

Paths in the scripts are relative to the original project folder. Model weights and large raw data files are not included.

Code: MIT licence. Found a mistake? Open an issue: corrections are welcome and get noted in the video description.

Episodes are added here the day before each video goes public.
