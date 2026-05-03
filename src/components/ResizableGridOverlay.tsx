import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type MutableRefObject,
} from "react";
import type { CellRect, SceneData } from "../lib/sceneData";
// Splits cascade along a row/column: after the two neighbors of a handle, extra space is taken
// from tracks farther out (e.g. to the left when moving a line left and the inner track is at min).
import {
  applyAxisPixelDelta,
  renormalizeToSum,
} from "../lib/applyTrackSplitDeltas";
import { ShaderCanvas } from "./ShaderCanvas";
import type { LayoutPreset } from "../lib/layoutPreset";
import "./ResizableGridOverlay.css";

/**
 * Drag floor in px (aligned with CSS: cell gutter + surface min + label line).
 * Must stay ≤ min(ideal, sceneSize / count) from minTrackPx so the cascade stays feasible.
 * Content min is still enforced by grid item min-width/min-height: min-content + surface mins.
 */
const MIN_COL_PX = 88;
const MIN_ROW_PX = 72;
const MAX_TRACK_FRACTION = 0.5;
/** Must match `gap` on `.resizable-grid__micro-container` in ResizableGridOverlay.css. */
const MICRO_GAP_PX = 2;
/** One full specular rotation in the shader after a cell surface click. */
const SPECULAR_SPIN_DURATION_MS = 350;
const RIM_HOLD_RAMP_MS = 1500;
const RIM_SHORT_CLICK_THRESHOLD_MS = 150;
const RIM_SHORT_CLICK_RAMP_MS = 100;

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const u = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return u * u * (3 - 2 * u);
}

function makeUniformFracs(n: number): number[] {
  const f = 1 / Math.max(1, n);
  return Array.from({ length: Math.max(1, n) }, () => f);
}

function minTrackPx(ideal: number, totalPx: number, count: number): number {
  if (count < 1) return 0;
  return Math.max(0, Math.min(ideal, totalPx / count - 0.1));
}

/**
 * Per-track minimum widths for a layout's columns.
 * A horizontal micro cell occupies count sub-cells + gaps, so its track needs
 * count × base + (count−1) × 2px at minimum.
 */
function computeColMinima(layout: LayoutPreset, baseMin: number): number[] {
  const minima = Array.from({ length: layout.cols }, () => baseMin);
  for (const cell of layout.cells) {
    if (cell.type === "micro" && cell.microSplit === "h" && cell.colSpan === 1) {
      const count = cell.microCount ?? 2;
      minima[cell.col] = Math.max(
        minima[cell.col],
        count * baseMin + (count - 1) * MICRO_GAP_PX
      );
    }
  }
  return minima;
}

/**
 * Per-track minimum heights for a layout's rows.
 * A vertical micro cell occupies count sub-cells + gaps.
 */
function computeRowMinima(layout: LayoutPreset, baseMin: number): number[] {
  const minima = Array.from({ length: layout.rows }, () => baseMin);
  for (const cell of layout.cells) {
    if (cell.type === "micro" && cell.microSplit === "v" && cell.rowSpan === 1) {
      const count = cell.microCount ?? 2;
      minima[cell.row] = Math.max(
        minima[cell.row],
        count * baseMin + (count - 1) * MICRO_GAP_PX
      );
    }
  }
  return minima;
}

/**
 * After enforceTrackBounds (which uses a uniform minimum), raise any track that
 * is still below its own per-track lower bound.  The extra space is taken
 * proportionally from tracks that sit above their lower bound.
 * Sum is preserved.
 */
function applyPerTrackFloor(
  tracksPx: number[],
  totalPx: number,
  lowerBounds: number[]
): number[] {
  const out = tracksPx.slice();
  const n = out.length;
  const eps = 1e-6;

  // Cap each lower bound so the constraints are collectively feasible.
  const sumLo = lowerBounds.reduce((a, v) => a + v, 0);
  const scale = sumLo > totalPx + eps ? totalPx / sumLo : 1;
  const lo = lowerBounds.map((v) => v * scale);

  for (let iter = 0; iter < n + 2; iter++) {
    let deficit = 0;
    for (let i = 0; i < n; i++) {
      if (out[i] < lo[i] - eps) {
        deficit += lo[i] - out[i];
        out[i] = lo[i];
      }
    }
    if (deficit < eps) break;
    // Distribute deficit by taking from tracks above their lower bound.
    const donors = out.map((v, i) => ({ i, room: v - lo[i] })).filter((x) => x.room > eps);
    if (donors.length === 0) break;
    const roomSum = donors.reduce((a, x) => a + x.room, 0);
    const take = Math.min(deficit, roomSum);
    for (const d of donors) {
      out[d.i] -= take * (d.room / roomSum);
    }
  }
  return out;
}

function enforceTrackBounds(
  tracksPx: number[],
  totalPx: number,
  minPx: number,
  maxFraction: number
): number[] {
  const n = tracksPx.length;
  if (n === 0 || totalPx <= 0) return tracksPx.slice();

  const eps = 1e-6;
  let lower = Math.max(0, minPx);
  let upper = Math.max(lower, totalPx * maxFraction);

  // Keep constraints feasible for any track count.
  if (lower * n > totalPx) lower = totalPx / n;
  if (upper * n < totalPx) upper = totalPx / n;

  const out = tracksPx.map((v) => Math.min(upper, Math.max(lower, v)));

  for (let iter = 0; iter < 12; iter += 1) {
    const sum = out.reduce((a, v) => a + v, 0);
    const diff = totalPx - sum;
    if (Math.abs(diff) <= eps) break;

    if (diff > 0) {
      const growable = out
        .map((v, i) => ({ i, room: upper - v }))
        .filter((x) => x.room > eps);
      if (growable.length === 0) break;
      const roomSum = growable.reduce((a, x) => a + x.room, 0);
      for (const g of growable) {
        out[g.i] += (diff * g.room) / roomSum;
      }
    } else {
      const shrinkable = out
        .map((v, i) => ({ i, room: v - lower }))
        .filter((x) => x.room > eps);
      if (shrinkable.length === 0) break;
      const roomSum = shrinkable.reduce((a, x) => a + x.room, 0);
      for (const s of shrinkable) {
        out[s.i] += (diff * s.room) / roomSum; // diff is negative
      }
    }

    for (let i = 0; i < n; i += 1) {
      out[i] = Math.min(upper, Math.max(lower, out[i]));
    }
  }

  // Final exact-sum correction without violating lower/upper bounds.
  let rem = totalPx - out.reduce((a, v) => a + v, 0);
  if (Math.abs(rem) > eps) {
    if (rem > 0) {
      for (let i = 0; i < n && rem > eps; i += 1) {
        const room = upper - out[i];
        if (room <= eps) continue;
        const take = Math.min(room, rem);
        out[i] += take;
        rem -= take;
      }
    } else {
      for (let i = 0; i < n && rem < -eps; i += 1) {
        const room = out[i] - lower;
        if (room <= eps) continue;
        const take = Math.min(room, -rem);
        out[i] -= take;
        rem += take;
      }
    }
  }

  return out;
}

const MIN_SINGLE_W = 160;
const MIN_SINGLE_H = 120;

type Drag =
  | {
      kind: "v";
      index: number;
      colStart: number[];
      startX: number;
      pointerId: number;
      handle: HTMLElement;
    }
  | {
      kind: "h";
      index: number;
      rowStart: number[];
      startY: number;
      pointerId: number;
      handle: HTMLElement;
    }
  | {
      kind: "c";
      col: number;
      row: number;
      colStart: number[];
      rowStart: number[];
      startX: number;
      startY: number;
      pointerId: number;
      handle: HTMLElement;
    }
  | {
      kind: "s";
      startX: number;
      startY: number;
      startW: number;
      startH: number;
      pointerId: number;
      handle: HTMLElement;
    };

type Props = {
  dataRef: MutableRefObject<SceneData>;
  layout: LayoutPreset;
  /** Keyed by cell ID or micro sub-cell ID; drives label text in cells and the bgLayer. */
  cellLabels: Record<string, string>;
  showDebugShader: boolean;
  showDebugGrid: boolean;
  singleMode: boolean;
};

function cumToSplitLeft(fr: readonly number[], splitAfterCol: number): number {
  let s = 0;
  for (let k = 0; k <= splitAfterCol; k++) s += fr[k];
  return s;
}

/**
 * Fills the scene; grid tracks are fractional. Drag internal edges (and interior corners) to
 * redistribute space. Outer bounds follow the window/scene.
 */
export function ResizableGridOverlay({
  dataRef,
  layout,
  cellLabels,
  showDebugShader,
  showDebugGrid,
  singleMode,
}: Props) {
  const c = layout.cols;
  const r = layout.rows;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const cellsRef = useRef<HTMLDivElement | null>(null);
  /** Same box as `left`/`top` % on split buttons (abspos children of this layer). */
  const splitsRef = useRef<HTMLDivElement | null>(null);
  const [colFracs, setColFracs] = useState<number[]>(() => makeUniformFracs(c));
  const [rowFracs, setRowFracs] = useState<number[]>(() => makeUniformFracs(r));
  const [box, setBox] = useState({ w: 0, h: 0 });
  /** Measured split positions; null until first layout. Falls back to fr-based estimates. */
  const [measSplits, setMeasSplits] = useState<{
    v: number[];
    h: number[];
  } | null>(null);
  const [debugShaderRects, setDebugShaderRects] = useState<CellRect[]>([]);
  const [debugGridRects, setDebugGridRects] = useState<CellRect[]>([]);
  const [singleW, setSingleW] = useState(0);
  const [singleH, setSingleH] = useState(0);

  const drag = useRef<Drag | null>(null);
  const moveListener = useRef<((e: PointerEvent) => void) | null>(null);
  const endPointerListener = useRef<((e: PointerEvent) => void) | null>(null);
  /** Single-mode only: orbit params deferred from pointerdown to pointerup. */
  const pendingOrbit = useRef<{
    cellId: string;
    nx: number;
    ny: number;
    orbitMs: number;
    decayMs: number;
  } | null>(null);

  useLayoutEffect(() => {
    setColFracs(makeUniformFracs(c));
    setRowFracs(makeUniformFracs(r));
    setMeasSplits(null);
  }, [layout, c, r]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When entering single mode, initialize to the full available (parent) size.
  useLayoutEffect(() => {
    if (!singleMode) return;
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    setSingleW(parent.clientWidth);
    setSingleH(parent.clientHeight);
  }, [singleMode]);

  const { w, h } = box;

  /* px from left/top of splits layer; same units as measured seam positions */
  const frSplitV = useMemo(
    () =>
      c > 1 && w > 0
        ? Array.from({ length: c - 1 }, (_, i) =>
            cumToSplitLeft(colFracs, i) * w
          )
        : [],
    [c, colFracs, w]
  );
  const frSplitH = useMemo(
    () =>
      r > 1 && h > 0
        ? Array.from({ length: r - 1 }, (_, j) =>
            cumToSplitLeft(rowFracs, j) * h
          )
        : [],
    [r, rowFracs, h]
  );
  const splitV =
    measSplits && measSplits.v.length === c - 1 ? measSplits.v : frSplitV;
  const splitH =
    measSplits && measSplits.h.length === r - 1 ? measSplits.h : frSplitH;

  /**
   * Measures each layout cell from the DOM and pushes `cellRects` / `containerRects` into the
   * dataRef. Empty cells are excluded from both arrays. Micro cells produce one cellRect for the
   * container and one containerRect per sub-cell. Split handle positions are derived from the
   * first non-empty, non-spanning cell found at each seam boundary.
   */
  const measureAndPushScene = useCallback(() => {
    const el = rootRef.current;
    const grid = cellsRef.current;
    const setSceneRects = (cellRects: CellRect[], containerRects: CellRect[]) => {
      dataRef.current = { ...dataRef.current, cellRects, containerRects };
      setDebugGridRects(cellRects);
      setDebugShaderRects(containerRects);
    };
    if (!el || !grid) {
      setMeasSplits(null);
      setSceneRects([], []);
      return;
    }
    const pw = el.clientWidth;
    const ph = el.clientHeight;
    if (pw <= 0 || ph <= 0) {
      setMeasSplits(null);
      setSceneRects([], []);
      return;
    }
    const rootRect = el.getBoundingClientRect();
    const rects: CellRect[] = [];
    const containerRects: CellRect[] = [];

    for (const cell of layout.cells) {
      if (cell.type === "empty") continue;
      const cellEl = grid.querySelector<HTMLElement>(`[data-cell-id="${cell.id}"]`);
      if (!cellEl) continue;
      const nr = cellEl.getBoundingClientRect();
      const cellRect: CellRect = {
        id: cell.id,
        x: nr.left - rootRect.left,
        y: nr.top - rootRect.top,
        w: nr.width,
        h: nr.height,
      };
      rects.push(cellRect);

      if (cell.type === "micro") {
        // Sub-cells use `flex: 1 1 0; min-width: 0` so CSS subdivides them equally and they
        // can't overflow the container. Measuring each sub-cell directly gives the JS rect
        // exact pixel parity with the CSS-rendered surface (no subpixel mismatch).
        const microEls = cellEl.querySelectorAll<HTMLElement>(
          ".resizable-grid__micro-cell"
        );
        microEls.forEach((ms, i) => {
          const sr = ms.getBoundingClientRect();
          containerRects.push({
            id: `${cell.id}-m-${i}`,
            x: sr.left - rootRect.left,
            y: sr.top - rootRect.top,
            w: sr.width,
            h: sr.height,
          });
        });
      } else {
        const surface = cellEl.querySelector<HTMLElement>(".resizable-grid__cell-surface");
        const sr = surface ? surface.getBoundingClientRect() : nr;
        containerRects.push({
          id: cell.id,
          x: sr.left - rootRect.left,
          y: sr.top - rootRect.top,
          w: sr.width,
          h: sr.height,
        });
      }
    }
    setSceneRects(rects, containerRects);

    /* Measure seam positions for split handle placement.
     * For each seam at column i: find a non-empty cell at col=i with colSpan=1 and read its right edge.
     * For each seam at row j:  find a non-empty cell at row=j with rowSpan=1 and read its bottom edge. */
    const splits = splitsRef.current;
    const sr = splits?.getBoundingClientRect() ?? el.getBoundingClientRect();
    const v: number[] = [];
    if (c > 1) {
      for (let i = 0; i < c - 1; i++) {
        const seam = layout.cells.find(
          (cell) => cell.col === i && cell.colSpan === 1 && cell.type !== "empty"
        );
        if (seam) {
          const seamEl = grid.querySelector<HTMLElement>(`[data-cell-id="${seam.id}"]`);
          if (seamEl) {
            v.push(seamEl.getBoundingClientRect().right - sr.left);
            continue;
          }
        }
        v.push(cumToSplitLeft(colFracs, i) * pw);
      }
    }
    const hS: number[] = [];
    if (r > 1) {
      for (let j = 0; j < r - 1; j++) {
        const seam = layout.cells.find(
          (cell) => cell.row === j && cell.rowSpan === 1 && cell.type !== "empty"
        );
        if (seam) {
          const rowSeamEl: HTMLElement | null = grid.querySelector(`[data-cell-id="${seam.id}"]`);
          if (rowSeamEl) {
            if (rowSeamEl.offsetParent === grid) {
              hS.push(rowSeamEl.offsetTop + rowSeamEl.offsetHeight);
            } else {
              hS.push(rowSeamEl.getBoundingClientRect().bottom - sr.top);
            }
            continue;
          }
        }
        hS.push(cumToSplitLeft(rowFracs, j) * ph);
      }
    }
    setMeasSplits({ v, h: hS });
  }, [layout, c, r, w, h, colFracs, rowFracs, dataRef, cellLabels]);

  useLayoutEffect(() => {
    measureAndPushScene();
  }, [measureAndPushScene]);

  const endDrag = useCallback((ev?: PointerEvent) => {
    const d = drag.current;
    if (ev && d && ev.pointerId !== d.pointerId) {
      return;
    }
    if (d) {
      try {
        d.handle.releasePointerCapture(d.pointerId);
      } catch {
        // already lost capture
      }
    }
    const mm = moveListener.current;
    if (mm) document.removeEventListener("pointermove", mm);
    moveListener.current = null;
    const fe = endPointerListener.current;
    if (fe) {
      window.removeEventListener("pointerup", fe, true);
      window.removeEventListener("pointercancel", fe, true);
      endPointerListener.current = null;
    }
    drag.current = null;
  }, []);

  useEffect(
    () => () => {
      const mm = moveListener.current;
      if (mm) document.removeEventListener("pointermove", mm);
      const fe = endPointerListener.current;
      if (fe) {
        window.removeEventListener("pointerup", fe, true);
        window.removeEventListener("pointercancel", fe, true);
      }
      if (drag.current) {
        try {
          drag.current.handle.releasePointerCapture(drag.current.pointerId);
        } catch {
          // ignore
        }
        drag.current = null;
      }
    },
    []
  );

  /** Keep in sync with ResizeObserver (clientWidth/Height) — not getBoundingClientRect — so
   * drag math, CSS grid, splitGridRects, and box state share one size model (avoids subpixel drift). */
  const getBoxSize = useCallback((): { w: number; h: number } => {
    const el = rootRef.current;
    if (!el) return { w, h };
    return {
      w: Math.max(1, el.clientWidth),
      h: Math.max(1, el.clientHeight),
    };
  }, [w, h]);

  const updateLightFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
      dataRef.current = { ...dataRef.current, lightPos: { x, y } };
    },
    [dataRef]
  );

  const onRootPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    updateLightFromClient(e.clientX, e.clientY);
    const root = rootRef.current;
    if (!root) return;
    const raw = e.target;
    const hitEl =
      raw instanceof Element ? raw : raw instanceof Node ? raw.parentElement : null;
    const surface = hitEl?.closest(".resizable-grid__cell-surface") ?? null;
    const overSurface =
      surface !== null && surface instanceof HTMLElement && root.contains(surface);
    dataRef.current = { ...dataRef.current, pointerOverSurface: overSurface };
  };

  const onRootPointerLeave = () => {
    const el = rootRef.current;
    if (!el) return;
    dataRef.current = {
      ...dataRef.current,
      pointerOverSurface: false,
      // Use an out-of-bounds position so signedDepthToCell returns negative for all cells
      // (including single mode where the grid center lies inside the one containerRect).
      lightPos: { x: -1, y: -1 },
    };
  };

  const clearRimHold = useCallback(() => {
    const scene = dataRef.current;
    if (!scene.rimHoldPointerDown) return;
    const nowMs = performance.now();
    const elapsedMs =
      scene.rimHoldStartTimeMs !== null
        ? Math.max(0, nowMs - scene.rimHoldStartTimeMs)
        : 0;
    const holdMul = 1.0 + 3.0 * smoothstep(0, RIM_HOLD_RAMP_MS, elapsedMs);
    const isShortClick = elapsedMs < RIM_SHORT_CLICK_THRESHOLD_MS;
    dataRef.current = {
      ...scene,
      rimHoldPointerDown: false,
      rimReleaseCellId: scene.rimHoldCellId,
      rimReleaseStartTimeMs: nowMs,
      rimReleaseFromMul: isShortClick ? 4.0 : holdMul,
      rimReleaseMode: isShortClick ? "shortClick" : "hold",
      rimShortPulseRampMs: isShortClick ? RIM_SHORT_CLICK_RAMP_MS : null,
      rimHoldStartTimeMs: null,
      rimHoldCellId: null,
    };
  }, [dataRef]);

  useEffect(() => {
    const onPointerEnd = () => {
      clearRimHold();
    };
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    return () => {
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
    };
  }, [clearRimHold]);

  const onCellPointerDown =
    (cellId: string) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const el = rootRef.current;
      if (!el) return;
      const cr = dataRef.current.containerRects.find((r) => r.id === cellId);
      if (!cr || cr.w <= 0 || cr.h <= 0) return;
      const rootRect = el.getBoundingClientRect();
      const x = Math.min(
        Math.max(e.clientX - rootRect.left, 0),
        rootRect.width
      );
      const y = Math.min(
        Math.max(e.clientY - rootRect.top, 0),
        rootRect.height
      );
      if (x < cr.x || x > cr.x + cr.w || y < cr.y || y > cr.y + cr.h) {
        return;
      }
      const cx = cr.x + cr.w * 0.5;
      const cy = cr.y + cr.h * 0.5;
      const localX = (x - cx) / Math.max(cr.w * 0.5, 1.0);
      const localY = (y - cy) / Math.max(cr.h * 0.5, 1.0);
      const sx = -Math.max(-1.0, Math.min(1.0, localX));
      const sy = -Math.max(-1.0, Math.min(1.0, localY));
      const len = Math.hypot(sx, sy);
      let nx = sx;
      let ny = sy;
      if (len < 1e-5) {
        nx = 0;
        ny = -1;
      } else {
        nx /= len;
        ny /= len;
      }
      e.preventDefault();
      const scene = dataRef.current;
      const nowMs = performance.now();
      const normalPx = 0.25 * Math.min(rootRect.width, rootRect.height);
      const cellSize = Math.sqrt(cr.w * cr.h);
      const sizeRatio = Math.max(0.5, Math.min(2.0, cellSize / Math.max(normalPx, 1)));
      const decayMs = Math.round(Math.max(1000, Math.min(4000, 2000 * sizeRatio)));
      const orbitMs = Math.round(Math.min(500, SPECULAR_SPIN_DURATION_MS * sizeRatio));
      if (singleMode) {
        // Touch: activate hover immediately, defer orbit to pointerup.
        updateLightFromClient(e.clientX, e.clientY);
        dataRef.current = {
          ...scene,
          pointerOverSurface: true,
          rimHoldPointerDown: true,
          rimHoldCellId: cr.id,
          rimHoldStartTimeMs: nowMs,
          rimReleaseCellId: null,
          rimReleaseStartTimeMs: null,
          rimReleaseFromMul: null,
          rimReleaseMode: null,
          rimShortPulseRampMs: null,
        };
        pendingOrbit.current = { cellId: cr.id, nx, ny, orbitMs, decayMs };
      } else {
        dataRef.current = {
          ...scene,
          rimHoldPointerDown: true,
          rimHoldCellId: cr.id,
          rimHoldStartTimeMs: nowMs,
          rimReleaseCellId: null,
          rimReleaseStartTimeMs: null,
          rimReleaseFromMul: null,
          rimReleaseMode: null,
          rimShortPulseRampMs: null,
          specularSpin: {
            cellId: cr.id,
            startTimeMs: nowMs,
            durationMs: orbitMs,
            startSpecDirX: nx,
            startSpecDirY: ny,
          },
          specularModulation: {
            cellId: cr.id,
            startTimeMs: nowMs,
            peakTimeMs: nowMs + orbitMs * 0.5,
            decayMs,
            peakSpecularIntensityMul: 3.0,
            peakSpecularPowerMul: 0.5,
            peakDispersionHueShiftMul: 3.5,
            peakDispersionSpreadMul: 4.0,
            peakSpecDispersionAmountMul: 5.0,
          },
        };
      }
    };

  const onCellPointerUp = singleMode
    ? (_e: React.PointerEvent<HTMLDivElement>) => {
        const p = pendingOrbit.current;
        if (!p) return;
        pendingOrbit.current = null;
        const nowMs = performance.now();
        dataRef.current = {
          ...dataRef.current,
          specularSpin: {
            cellId: p.cellId,
            startTimeMs: nowMs,
            durationMs: p.orbitMs,
            startSpecDirX: p.nx,
            startSpecDirY: p.ny,
          },
          specularModulation: {
            cellId: p.cellId,
            startTimeMs: nowMs,
            peakTimeMs: nowMs + p.orbitMs * 0.5,
            decayMs: p.decayMs,
            peakSpecularIntensityMul: 3.0,
            peakSpecularPowerMul: 0.5,
            peakDispersionHueShiftMul: 3.5,
            peakDispersionSpreadMul: 4.0,
            peakSpecDispersionAmountMul: 5.0,
          },
        };
      }
    : undefined;

  const onPointerDownV = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (colFracs[index + 1] === undefined) return;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    drag.current = {
      kind: "v",
      index,
      colStart: [...colFracs],
      startX: e.clientX,
      pointerId: e.pointerId,
      handle,
    };
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || d.kind !== "v" || ev.pointerId !== d.pointerId) return;
      const { w: W } = getBoxSize();
      const colMins = computeColMinima(layout, MIN_COL_PX);
      // Use the stricter of the two adjacent tracks as the cascade floor.
      const mAdj = Math.max(colMins[d.index] ?? MIN_COL_PX, colMins[d.index + 1] ?? MIN_COL_PX);
      const m = minTrackPx(mAdj, W, c);
      const wPx = d.colStart.map((f) => f * W);
      const dPix = ev.clientX - d.startX;
      const nextW = renormalizeToSum(
        applyAxisPixelDelta(wPx, d.index, dPix, m),
        W
      );
      const bounded = enforceTrackBounds(nextW, W, m, MAX_TRACK_FRACTION);
      // Pass raw per-track mins (uncapped); applyPerTrackFloor has its own feasibility
      // scaling and only lifts violating tracks, taking from donors above their bound.
      setColFracs(applyPerTrackFloor(bounded, W, colMins).map((x) => x / W));
    };
    const onPointerEnd = (ev: PointerEvent) => {
      endDrag(ev);
    };
    moveListener.current = onMove;
    endPointerListener.current = onPointerEnd;
    document.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
  };

  const onPointerDownH = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (rowFracs[index + 1] === undefined) return;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    drag.current = {
      kind: "h",
      index,
      rowStart: [...rowFracs],
      startY: e.clientY,
      pointerId: e.pointerId,
      handle,
    };
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || d.kind !== "h" || ev.pointerId !== d.pointerId) return;
      const { h: H } = getBoxSize();
      const rowMins = computeRowMinima(layout, MIN_ROW_PX);
      const mAdj = Math.max(rowMins[d.index] ?? MIN_ROW_PX, rowMins[d.index + 1] ?? MIN_ROW_PX);
      const m = minTrackPx(mAdj, H, r);
      const hPx = d.rowStart.map((f) => f * H);
      const dPix = ev.clientY - d.startY;
      const nextH = renormalizeToSum(
        applyAxisPixelDelta(hPx, d.index, dPix, m),
        H
      );
      const bounded = enforceTrackBounds(nextH, H, m, MAX_TRACK_FRACTION);
      setRowFracs(applyPerTrackFloor(bounded, H, rowMins).map((x) => x / H));
    };
    const onPointerEnd = (ev: PointerEvent) => {
      endDrag(ev);
    };
    moveListener.current = onMove;
    endPointerListener.current = onPointerEnd;
    document.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
  };

  const onPointerDownC =
    (col: number, row: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        colFracs[col + 1] === undefined ||
        rowFracs[row + 1] === undefined
      ) {
        return;
      }
      const handle = e.currentTarget as HTMLElement;
      handle.setPointerCapture(e.pointerId);
      drag.current = {
        kind: "c",
        col,
        row,
        colStart: [...colFracs],
        rowStart: [...rowFracs],
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
        handle,
      };
      const onMove = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d || d.kind !== "c" || ev.pointerId !== d.pointerId) return;
        const { w: W, h: H } = getBoxSize();
        const colMins = computeColMinima(layout, MIN_COL_PX);
        const rowMins = computeRowMinima(layout, MIN_ROW_PX);
        const mColAdj = Math.max(colMins[d.col] ?? MIN_COL_PX, colMins[d.col + 1] ?? MIN_COL_PX);
        const mRowAdj = Math.max(rowMins[d.row] ?? MIN_ROW_PX, rowMins[d.row + 1] ?? MIN_ROW_PX);
        const mCol = minTrackPx(mColAdj, W, c);
        const mRow = minTrackPx(mRowAdj, H, r);
        const wPx = d.colStart.map((f) => f * W);
        const hPx = d.rowStart.map((f) => f * H);
        const dCol = ev.clientX - d.startX;
        const dRow = ev.clientY - d.startY;
        const nextW = renormalizeToSum(
          applyAxisPixelDelta(wPx, d.col, dCol, mCol),
          W
        );
        const nextH = renormalizeToSum(
          applyAxisPixelDelta(hPx, d.row, dRow, mRow),
          H
        );
        const boundedW = enforceTrackBounds(nextW, W, mCol, MAX_TRACK_FRACTION);
        const boundedH = enforceTrackBounds(nextH, H, mRow, MAX_TRACK_FRACTION);
        setColFracs(applyPerTrackFloor(boundedW, W, colMins).map((x) => x / W));
        setRowFracs(applyPerTrackFloor(boundedH, H, rowMins).map((x) => x / H));
      };
      const onPointerEnd = (ev: PointerEvent) => {
        endDrag(ev);
      };
      moveListener.current = onMove;
      endPointerListener.current = onPointerEnd;
      document.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onPointerEnd, true);
      window.addEventListener("pointercancel", onPointerEnd, true);
    };

  const onPointerDownSingle = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    drag.current = {
      kind: "s",
      startX: e.clientX,
      startY: e.clientY,
      startW: singleW,
      startH: singleH,
      pointerId: e.pointerId,
      handle,
    };
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || d.kind !== "s" || ev.pointerId !== d.pointerId) return;
      const parent = rootRef.current?.parentElement;
      const maxW = parent ? parent.clientWidth : d.startW;
      const maxH = parent ? parent.clientHeight : d.startH;
      setSingleW(Math.max(MIN_SINGLE_W, Math.min(maxW, d.startW + ev.clientX - d.startX)));
      setSingleH(Math.max(MIN_SINGLE_H, Math.min(maxH, d.startH + ev.clientY - d.startY)));
    };
    const onPointerEnd = (ev: PointerEvent) => { endDrag(ev); };
    moveListener.current = onMove;
    endPointerListener.current = onPointerEnd;
    document.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
  };

  /* `1fr` is `minmax(0,1fr)` in browsers — tracks can shrink past item min; min-content enforces 2em+text+2em. */
  const gridStyle = {
    gridTemplateColumns: colFracs
      .map((f) => `minmax(min-content, ${f}fr)`)
      .join(" "),
    gridTemplateRows: rowFracs
      .map((f) => `minmax(min-content, ${f}fr)`)
      .join(" "),
  } as const;

  const rootClassName = singleMode
    ? "resizable-grid resizable-grid--single"
    : "resizable-grid resizable-grid--fill";
  const rootStyle = singleMode && singleW > 0
    ? ({ width: singleW, height: singleH } as const)
    : undefined;

  return (
    <div
      ref={rootRef}
      className={rootClassName}
      style={rootStyle}
      onPointerMove={onRootPointerMove}
      onPointerLeave={onRootPointerLeave}
    >
      <ShaderCanvas
        dataRef={dataRef}
        className="shader-canvas__host resizable-grid__canvas-host"
      />
      <div
        ref={cellsRef}
        className="resizable-grid__cells"
        style={gridStyle}
        role="grid"
        aria-label="Shader grid cells"
      >
        {layout.cells.map((cell) => {
          const cellStyle = {
            gridColumn: `${cell.col + 1} / span ${cell.colSpan}`,
            gridRow: `${cell.row + 1} / span ${cell.rowSpan}`,
          } as const;

          if (cell.type === "empty") {
            return (
              <div
                key={cell.id}
                data-cell-id={cell.id}
                className="resizable-grid__cell resizable-grid__cell--empty"
                style={cellStyle}
                aria-hidden
              />
            );
          }

          if (cell.type === "micro") {
            const containerClass = `resizable-grid__micro-container resizable-grid__micro--${cell.microSplit ?? "h"}`;
            return (
              <div
                key={cell.id}
                data-cell-id={cell.id}
                className="resizable-grid__cell"
                role="gridcell"
                style={cellStyle}
              >
                <div className="resizable-grid__cell-chrome">
                  <div className={containerClass}>
                    {Array.from({ length: cell.microCount ?? 2 }, (_, i) => {
                      const microId = `${cell.id}-m-${i}`;
                      const microLabel = cellLabels[microId] ?? `${cellLabels[cell.id] ?? cell.id}.${i + 1}`;
                      return (
                        <div
                          key={microId}
                          className="resizable-grid__micro-cell"
                          onPointerDown={onCellPointerDown(microId)}
                          onPointerUp={onCellPointerUp}
                        >
                          <div className="resizable-grid__cell-surface">
                            <span className="resizable-grid__cell-text">{microLabel}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }

          const label = cellLabels[cell.id] ?? "";
          return (
            <div
              key={cell.id}
              data-cell-id={cell.id}
              className="resizable-grid__cell"
              role="gridcell"
              style={cellStyle}
              onPointerDown={onCellPointerDown(cell.id)}
              onPointerUp={onCellPointerUp}
            >
              <div className="resizable-grid__cell-chrome">
                <div className="resizable-grid__cell-surface">
                  {label ? (
                    <span className="resizable-grid__cell-text">{label}</span>
                  ) : (
                    <span
                      className="resizable-grid__cell-text resizable-grid__cell-text--empty"
                      aria-hidden
                    >
                      &nbsp;
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div
        ref={splitsRef}
        className="resizable-grid__splits"
        role="group"
        aria-label="Grid resize handles"
      >
        {c > 1 &&
          Array.from({ length: c - 1 }, (_, i) => (
            <button
              key={`v-${i}`}
              type="button"
              className="resizable-grid__split resizable-grid__split--v"
              style={{
                left: `${splitV[i] ?? 0}px`,
              }}
              aria-label={`Resize between columns ${i + 1} and ${i + 2}`}
              onPointerDown={onPointerDownV(i)}
            />
          ))}
        {r > 1 &&
          Array.from({ length: r - 1 }, (_, j) => (
            <button
              key={`h-${j}`}
              type="button"
              className="resizable-grid__split resizable-grid__split--h"
              style={{
                top: `${splitH[j] ?? 0}px`,
              }}
              aria-label={`Resize between rows ${j + 1} and ${j + 2}`}
              onPointerDown={onPointerDownH(j)}
            />
          ))}
        {c > 1 &&
          r > 1 &&
          Array.from({ length: c - 1 }, (_, i) =>
            Array.from({ length: r - 1 }, (_, j) => (
              <button
                key={`c-${i}-${j}`}
                type="button"
                className="resizable-grid__split resizable-grid__split--corner"
                style={{
                  left: `${splitV[i] ?? 0}px`,
                  top: `${splitH[j] ?? 0}px`,
                }}
                aria-label={`Resize at column ${i + 1} and row ${j + 1} junction`}
                onPointerDown={onPointerDownC(i, j)}
              >
                <span className="resizable-grid__split-plus" aria-hidden>
                  +
                </span>
              </button>
            ))
          ).flat()}
      </div>
      {singleMode && (
        <button
          type="button"
          className="resizable-grid__split resizable-grid__split--single-corner"
          aria-label="Resize single cell"
          onPointerDown={onPointerDownSingle}
        >
          <span className="resizable-grid__split-plus" aria-hidden>+</span>
        </button>
      )}
      {(showDebugGrid || showDebugShader) && (
        <div className="resizable-grid__debug-overlay" aria-hidden>
          {showDebugGrid &&
            debugGridRects.map((rect) => (
              <div
                key={`grid-${rect.id}`}
                className="resizable-grid__debug-rect resizable-grid__debug-rect--grid"
                style={{
                  left: `${rect.x}px`,
                  top: `${rect.y}px`,
                  width: `${rect.w}px`,
                  height: `${rect.h}px`,
                }}
              />
            ))}
          {showDebugShader &&
            debugShaderRects.map((rect) => (
            <div
              key={`shader-${rect.id}`}
              className="resizable-grid__debug-rect resizable-grid__debug-rect--shader"
              style={{
                left: `${rect.x}px`,
                top: `${rect.y}px`,
                width: `${rect.w}px`,
                height: `${rect.h}px`,
              }}
            />
            ))}
        </div>
      )}
    </div>
  );
}
