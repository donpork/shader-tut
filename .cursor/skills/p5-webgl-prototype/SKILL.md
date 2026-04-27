---
name: p5-webgl-prototype
description: >-
  Work on shader-tut’s React + p5 WEBGL stack: instance mode, ref bridge (no
  per-frame setState), one canvas and cleanup, grid overlay, shaders, and dev
  workflow. Use when editing p5, shaders, the grid, pointer data to WebGL, or
  HMR/cleanup in this repo.
---

# p5 WebGL prototype (shader-tut)

## Stack

- Vite + React + TypeScript in the repo root.
- **p5** in **WEBGL** for a **single** full-screen (or main) canvas.
- **Grid** is React/DOM, stacked above the canvas (semi-transparent or outlined cells) and drives **lighting** via shared refs, not a second WebGL pass.

## React + p5.js: one canvas, instance mode, and refs

### Why this matters

- **React** owns the React tree; **p5** must own **one** host element you give it. Do not call `new p5()` in the **render** path or in effects that re-run on every parent state change.
- Re-renders **do not** by themselves create new sketches. New canvases appear when `new p5()` runs again **without** cleaning up the previous instance (wrong `useEffect` dependencies, no `remove()`, or render-body construction).

### Use instance mode

- Use **instance mode**: a function `(p) => { /* setup + draw */ }` passed to `new p5(sketch, hostElement)`.
- `p` is the only **p5 instance**; all calls use `p.createCanvas`, `p.draw = () => { ... }`, `p.createShader`, etc. — never global `setup` / `draw` in this project.

### Where and how to create the instance

- Create the instance in **`useEffect`** (or a single mount effect) with a **container ref** to a `div` that stays mounted.
- **Stable dependencies**: empty `[]` if the sketch only needs a fixed container, or depend only on things that should **rebuild the entire sketch** (e.g. switching renderer), not on pointer or animation data.
- **Cleanup**: in the effect return, call **`p.remove()`** on that instance. This removes the canvas and stops the draw loop, which prevents stacked canvases on unmount, React Strict Mode double-invocation in dev, and Vite HMR.

### Ref bridge: mirror into the sketch, not `setState` every frame

- **Mirror what you need into a ref; the sketch reads the ref in `draw()`, not React state, every frame.**
- Hold a **mutable object** in `useRef` (e.g. `{ lightPos, cellRects, time }` or a typed struct). React/pointer code **writes** to `dataRef.current` (pointer move, `react-grid-layout` `onLayout`, `requestAnimationFrame` time, etc.). Inside **`p.draw`**, read **`dataRef.current`** once at the start of the frame and pass values into your shader uniforms.
- **Pointer and drag** (normalized `u`/`v`, cell indices, light position in container space) should **update the ref** from event handlers or layout callbacks, **not** `setState` on every `pointermove` if that would drive unnecessary React work at high frequency. Use **`useState` only** for UI that must re-render (labels, toggles) — and optionally **sync** those into the same ref in a `useEffect` if the shader needs them.

### WebGL in `draw()`

- After reading from the ref, set uniforms, then draw each cell (or full-screen pass) as your architecture requires. The WebGL p5 instance is **one**; all frames read the **same** `dataRef`.

### When you might rebuild the sketch

- Recreating `new p5()` should be **rare**: e.g. container remounted, intentional renderer change, or a controlled key on the parent. For resolution changes, prefer **`p.resizeCanvas`** inside the sketch (e.g. from a `ResizeObserver` callback) rather than a new p5, when possible.

## Data flow: grid and pointer → light

- Map pointer and layout to **cell rects** and/or **normalized `u, v` in [0, 1]`** using `getBoundingClientRect()` and the overlay’s dimensions.
- **No** p5 hit-testing in the hot path: React (or the grid library) updates **`dataRef.current`**; p5 only renders.

## Where things live

- **React / grid**: components such as `GridOverlay` or `DraggableGrid` for pointer and layout; **writes** to the shared `dataRef`.
- **p5**: a component (e.g. `ShaderCanvas` / `P5LightCanvas`) that **only** mounts the sketch, **reads** `dataRef` in `draw`, and runs **`remove()`** on unmount.
- **Shaders**: e.g. `src/shaders/*.vert` and `*.frag` imported with `?raw` in Vite, or GLSL in a TS module — keep paths consistent with imports.

## Run the app

```bash
npm install   # first time
npm run dev
```

## When editing shaders

- Keep uniform names and the ref → uniform wiring in one place so React and the sketch stay in sync. Prefer a small, documented set of uniforms (e.g. `uLightPos`, `uCellRect`, `uTime`, `uResolution`).
