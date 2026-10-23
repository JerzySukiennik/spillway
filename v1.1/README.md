# Spillway

Co-op water puzzle for 1–4 players in the browser (desktop). Every player owns one colour of water and a pump at the top of a side-scrolling map. Draw gutters with a limited marker, place bought gadgets, hold the pump and get your water into the cup of your colour. Mix every colour in the mixer to make rainbow water, which pays double. Money is shared and spent in the shop between levels.

## Play

- **A / D** (or arrows, wheel): move the camera
- **Space** (hold) or click the plunger: pump water
- **Left mouse**: marker · **Right mouse**: eraser (returns half the ink)
- **1–0**: tools · **Q / E**: rotate an item · **M**: mute

Solo works offline and saves progress in the browser. Online rooms use a 4-letter code or a `?r=CODE` link.

## Run locally

Any static server from the repo root, e.g.

```
python3 -m http.server 8643
```

No build step. Plain ES modules, WebGL2 for water, Canvas2D for everything else, Firebase Realtime Database (loaded from gstatic) for rooms.

## How it works

- `src/sim/fluid.js` — deterministic particle fluid (double-density relaxation, capsule colliders, force zones). Only `+ - * / sqrt`, so every browser computes bit-identical results.
- `src/sim/world.js` — level state: tanks, cups, mixer, marker lines, items, power-ups, input events, snapshots.
- `src/game/session.js` — lockstep netcode. The host owns the clock and publishes input batches every 6 ticks; clients run the same world ~10 ticks behind, verify checksums, resync from a snapshot on mismatch and take over as host if the host leaves.
- `src/net/room.js` — room, players, shared money and live cursors over Firebase RTDB; an offline twin for solo.
- `src/render/` — metaball water shader and the "Kontur" canvas painter.
- `src/game/level.js`, `src/game/shop.js` — the level screen and the side-scrolling shop with the Continue button at the end.

`Niepotrzebne/tests` holds node tests for the fluid, all levels (scripted solutions) and the lockstep protocol over a simulated laggy network.

## Sounds

All effects are CC0 recordings from freesound.org, trimmed and normalised:

| file | source |
| --- | --- |
| pump | [Clank1](https://freesound.org/s/94127/) by BMacZero |
| drip | [Single Water Drop](https://freesound.org/s/174718/) by paespedro |
| lost | [Splash](https://freesound.org/s/398032/) by swordofkings128 |
| pour | [Water Pour](https://freesound.org/s/173930/) by JohnsonBrandEditing |
| draw | [writing - sharpie 01](https://freesound.org/s/337088/) by Anthousai |
| erase | [Pencil Eraser](https://freesound.org/s/119143/) by esperri |
| place | [Knocking on Wood Door](https://freesound.org/s/629987/) by Flem0527 |
| buy | [Cha Ching](https://freesound.org/s/351304/) |
| win | [Short Success Sound Glockenspiel](https://freesound.org/s/456965/) by FunWithSound |
| rainbow | [cartoon wink magic sparkle](https://freesound.org/s/511485/) by MLaudio |
| click | [Menu Selection Click](https://freesound.org/s/171697/) by NenadSimic |
| ice | [Ice cracking](https://freesound.org/s/342546/) by timbreknight |
| wrong | [Failure/wrong action](https://freesound.org/s/242503/) by GabrielAraujo |
| splash | [Big Water Splash](https://freesound.org/s/442773/) by qubodup |
