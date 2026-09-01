# Gloomhaven Scenario Viewer — web edition

A browser rebuild of the *Gloomhaven Scenario Viewer* Mac app, driven by data and art
extracted from that app's own Unity scenes.

## Running it

    ./serve.sh          # then open http://localhost:8777

A server is required — the viewer loads its data with `fetch()`, which browsers block
on `file://` URLs.

## What's here

| path                | what it is |
|---------------------|------------|
| `index.html`        | shell — sidebar, canvas, play-aid panel |
| `app.js`            | renderer, camera, hit testing, play aid |
| `styles.css`        | all styling |
| `data/index.json`   | scenario index (group, number, title, monsters, bounds) |
| `data/scenarios/level<N>.json` | one file per scenario: every placed object |
| `data/sprites.json` | sprite dimensions, pivots, pixels-per-unit |
| `assets/sprites/`   | 568 PNGs — map tiles, monster standees, overlays, tokens, page scans |

162 scenarios: Gloomhaven 1–95, Forgotten Circles 96–117, Crimson Scales, the 17 solo
scenarios, and the 10 Kickstarter scenarios.

## How the data was produced

The app is Unity 2019.2.12f1 built through IL2CPP, so there is no source to read — but
each scenario is a Unity *scene* (`level11` … `level172`) full of positioned GameObjects.
Those were read with UnityPy and flattened to world transforms.

Every object carries a `k` (kind):

- `page` — the scanned scenario-book page the app displays
- `cover` — grey spoiler boxes over conclusion text and the token legend (click to reveal)
- `tile` — map tiles, by their real Gloomhaven IDs (`L1a`, `D1a`, `H1b`…)
- `monster` — standees, `Horz-`/`Vert-` prefix giving facing
- `door`, `overlay`, `token`, `start`

Coordinates are Unity world units. The hex grid is **pointy-top, 1.28 units centre to
centre** — confirmed against `StartPosition` markers, which sit on hex centres to within
0.03 units. Each map tile is its own parent object placed by hand, so tiles interlock
only approximately; fit the grid per tile rather than globally if you need exact
hex coordinates.

## Known gaps

- Scenario titles for Crimson Scales and Kickstarter scenarios are ambiguous. The app
  stores 137 titles as `#N Title`, and numbers 1–10 appear three times (Gloomhaven,
  Crimson Scales, Kickstarter) with no expansion marker. Gloomhaven's are resolved;
  the other two sets show their candidates in `alts`.
- Monster stat cards (HP, attack, move by level) are not in this app's data. The play
  aid takes HP as free text for that reason.
- Scenario body text lives in the page scans as pixels, not as strings.

## Licensing

Gloomhaven's art and text are Cephalofair Games' IP, and these assets came out of a paid
App Store app. Fine as a personal tool on your own machine. Anything public needs the
art replaced with something you can license — the layout data is game facts and is a
different question from the art.
