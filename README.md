# ERA Manufacturing Explorer

A full-screen, game-style 3D explorer of a manufacturing campus. It shows the 16 sectors (and 59 places inside them) where ERA Group can review operating expenses with manufacturing clients.

Built with Vite, vanilla JS and three.js (WebGL). Everything, models and textures included, is generated in code; there are no image or model assets apart from the ERA logo.

## Commands

```sh
npm install
npm run dev       # local dev server
npm run check     # HTML validation + production build (dist/)
npm run single    # build + inline everything into dist-single/era-manufacturing-explorer.html
```

## Controls

- **Trackpad:** two-finger scroll moves the map; pinch zooms (ctrl+wheel in Chrome/Firefox/Edge, gesture events in Safari).
- **Mouse:** drag to move, wheel to zoom. **Touch:** drag and pinch.
- Panning glides to a stop (momentum), and zoom and fly-to moves are eased.
- Click a building, machine or marker to open its card. Esc closes; arrow keys pan; +/− zoom.
- The HUD has the ERA logo, a sector list, a minimap (click or drag to move), "How ERA works", the review lens, zoom, start view, whole site, and pause motion.

## What moves

- **The connected line** (runs continuously on one 8-second takt): a forklift brings steel sheet from an open container to the laser area and takes the empty pallets back; the laser gantry cuts; CNC doors open for their operators; an operator loads parts onto an indexing conveyor; one robot moves each part into a fixture and back, while a second adds a cap from a bowl feeder; a vision arch inspects; the case packer turns assemblies into cartons; a palletizing robot stacks them; the stretch wrapper turns and wraps each full pallet; a forklift takes it to outbound staging and another loads it into the trailer at dock 4.
- **Machines you can start** (▶): dock truck, reach stacker, vending machine, clarifiers, compressors, compactor, baler, floor scrubber, mower, turnstile shift change, copier.
- **Ambient:** an overhead crane, road traffic, people walking and working (warehouse picker, cleaner, maintenance tech, inspector, guard on patrol), smoke, route packets and beacons.
- **Buildings that open:** the office tower is a floor cutaway (floors above the one in focus rise away). The warehouse and boiler house fade their outer walls. The production and packaging halls are open-roofed.
- **Lighting:** clean daylight (sun, sky fill and a soft environment for metals); no bloom or glow effects.

## Where things live

- `src/data.js`: sector and place content, anchors (plan units), process steps, ERA methods
- `src/three/engine.js`: renderer, daylight, camera rig, trackpad/mouse/touch input, picking
- `src/three/campus.js`: all districts, machines, opening buildings, ambient life
- `src/three/line.js`: the production-to-outbound line on one takt clock (conveyor, robots, packer, palletizer, wrapper, forklift cycles, workers)
- `src/three/rigs.js`: IK robot arm, scripted forklift cycles, posable worker
- `src/three/models.js`: reusable models (people, vehicles, forklifts, racks, shelving, desks, tanks)
- `src/three/sink.js`: geometry builders (merged static geometry, live groups with pivots)
- `src/three/mats.js`: materials and procedural canvas textures
- `src/main.js`: HUD, markers, cards, lens, minimap, overlay, keyboard

Deep links: `#freight` opens a sector, `#freight--docks` a place.
