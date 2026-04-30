---
name: p5-webgl-prototype
description: >-
  Work on shader-tut’s React + p5 WEBGL stack: instance mode, ref bridge (no
  per-frame setState), one canvas and cleanup, grid overlay, shaders, and dev
  workflow. Use when editing p5, shaders, the grid, pointer data to WebGL, or
  HMR/cleanup in this repo.
---

# p5 WebGL prototype (shader-tut)

## Rule source of truth

- Architectural invariants live in `.cursor/rules/shader-tut.mdc` and should not be duplicated here.
- Use this skill as the implementation playbook for edits within those invariants.

## Typical implementation flow

1. Confirm a single p5 host container ref exists and remains mounted.
2. Instantiate p5 in a mount-scoped `useEffect`, then clean up with `p.remove()` in the effect return.
3. Keep sketch creation dependencies stable; only rebuild for intentional full sketch resets.
4. Mirror rapidly changing inputs to a shared `useRef` object from React handlers.
5. In `p.draw`, read the ref once per frame, set uniforms, then render.
6. Keep render-time UI state minimal; only use `useState` for UI that must re-render.

## Ref-bridge pattern (React -> p5)

- React-side event handlers and layout callbacks write to `dataRef.current`.
- Sketch-side `draw()` reads `dataRef.current` at frame start and treats it as frame input.
- Prefer this bridge for pointer/light/time values that update at high frequency.
- If a UI toggle is needed both in React and shader logic, keep it in `useState` and mirror to the ref in a small syncing effect.

## Sketch lifecycle troubleshooting

- **Duplicate canvas appears**: check that `new p5(...)` only runs in one mount effect and cleanup always calls `p.remove()`.
- **Canvas recreated during pointer move**: remove pointer/layout values from sketch-creation effect dependencies.
- **HMR/StrictMode oddities**: verify cleanup runs on every teardown path and no render-body p5 construction exists.
- **Resize behavior is janky**: prefer `p.resizeCanvas(...)` over re-instantiating p5.

## Shader wiring workflow

- Keep uniform names stable and documented in one place near sketch setup.
- Read frame inputs from the shared ref and set all uniforms together before drawing.
- Keep shader import paths and module usage consistent across files.

## Advanced shader reference (The Book of Shaders)

- Primary reference: [The Book of Shaders](https://thebookofshaders.com/)
- Noise and fbm patterns: [Chapter 11](https://thebookofshaders.com/11/)
- Shaping and smooth transitions: [Chapter 5](https://thebookofshaders.com/05/)
- Lighting fundamentals for specular behavior: [Chapter 8](https://thebookofshaders.com/08/)

When implementing advanced shader code in this repo:

- Start with the smallest shader change that proves the visual goal.
- Keep all animated inputs uniform-driven (`uTime`, refs, and scene data bridge).
- Prefer `smoothstep` edge control and clamped UV sampling to reduce visual artifacts.
- Keep coordinate spaces explicit (cell-local UV vs canvas/world-aligned coordinates).

## Run the app

```bash
npm install   # first time
npm run dev
```
