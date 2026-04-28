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
import { splitGridRects } from "../lib/splitGridRects";
// Splits cascade along a row/column: after the two neighbors of a handle, extra space is taken
// from tracks farther out (e.g. to the left when moving a line left and the inner track is at min).
import {
  applyAxisPixelDelta,
  renormalizeToSum,
} from "../lib/applyTrackSplitDeltas";
import { ShaderCanvas } from "./ShaderCanvas";
import type { CellLabelGrid } from "../lib/cellLabelGrid";
import "./ResizableGridOverlay.css";

/**
 * Drag floor in px (aligned with CSS: cell gutter + surface min + label line).
 * Must stay ≤ min(ideal, sceneSize / count) from minTrackPx so the cascade stays feasible.
 * Content min is still enforced by grid item min-width/min-height: min-content + surface mins.
 */
const MIN_COL_PX = 88;
const MIN_ROW_PX = 72;
const MAX_TRACK_FRACTION = 0.5;

function makeUniformFracs(n: number): number[] {
  const f = 1 / Math.max(1, n);
  return Array.from({ length: Math.max(1, n) }, () => f);
}

function minTrackPx(ideal: number, totalPx: number, count: number): number {
  if (count < 1) return 0;
  return Math.max(0, Math.min(ideal, totalPx / count - 0.1));
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
    };

type Props = {
  dataRef: MutableRefObject<SceneData>;
  cols: number;
  rows: number;
  /** [row][col] cell copy; outer grid alignment matches p5 `cellRects` (DOM only, not p5). */
  cellLabels: CellLabelGrid;
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
export function ResizableGridOverlay({ dataRef, cols, rows, cellLabels }: Props) {
  const c = Math.min(12, Math.max(1, Math.floor(cols)));
  const r = Math.min(12, Math.max(1, Math.floor(rows)));

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

  const drag = useRef<Drag | null>(null);
  const moveListener = useRef<((e: PointerEvent) => void) | null>(null);
  const endPointerListener = useRef<((e: PointerEvent) => void) | null>(null);

  useLayoutEffect(() => {
    setColFracs(makeUniformFracs(c));
    setRowFracs(makeUniformFracs(r));
    setMeasSplits(null);
  }, [c, r]);

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
   * `cellRects` and split handles from laid-out cell nodes so they track CSS min width/height
   * (2em+text+2em, 1em+text+1em) when grid tracks are content-aware; falls back to fr math.
   */
  const measureAndPushScene = useCallback(() => {
    const el = rootRef.current;
    const grid = cellsRef.current;
    const setSceneRects = (cellRects: CellRect[], containerRects: CellRect[]) => {
      dataRef.current = { ...dataRef.current, cellRects, containerRects };
    };
    const pw = el ? el.clientWidth : 0;
    const ph = el ? el.clientHeight : 0;
    if (!el || colFracs.length !== c || rowFracs.length !== r) {
      setMeasSplits(null);
      if (el && pw > 0 && ph > 0) {
        const fallbackRects = splitGridRects(colFracs, rowFracs, pw, ph);
        setSceneRects(fallbackRects, fallbackRects);
      } else {
        setSceneRects([], []);
      }
      return;
    }
    if (pw <= 0 || ph <= 0) {
      setMeasSplits(null);
      setSceneRects([], []);
      return;
    }
    if (!grid) {
      setMeasSplits(null);
      const fallbackRects = splitGridRects(colFracs, rowFracs, pw, ph);
      setSceneRects(fallbackRects, fallbackRects);
      return;
    }
    const nodes = grid.querySelectorAll<HTMLElement>(".resizable-grid__cell");
    if (nodes.length !== c * r) {
      setMeasSplits(null);
      const fallbackRects = splitGridRects(colFracs, rowFracs, pw, ph);
      setSceneRects(fallbackRects, fallbackRects);
      return;
    }
    const go = grid.offsetLeft;
    const gto = grid.offsetTop;
    const rootRect = el.getBoundingClientRect();
    const rects: CellRect[] = [];
    const containerRects: CellRect[] = [];
    for (let row = 0; row < r; row++) {
      for (let col = 0; col < c; col++) {
        const i = row * c + col;
        const n = nodes[i]!;
        const id = `${row}-${col}`;
        const cellRect = {
          id,
          x: go + n.offsetLeft,
          y: gto + n.offsetTop,
          w: n.offsetWidth,
          h: n.offsetHeight,
        };
        rects.push(cellRect);
        const surface = n.querySelector<HTMLElement>(".resizable-grid__cell-surface");
        if (!surface) {
          containerRects.push(cellRect);
          continue;
        }
        const sr = surface.getBoundingClientRect();
        containerRects.push({
          id,
          x: sr.left - rootRect.left,
          y: sr.top - rootRect.top,
          w: sr.width,
          h: sr.height,
        });
      }
    }
    setSceneRects(rects, containerRects);
    /* V seam: BCR to device pixels. H seam: row line matches layout; offset box often snaps
     * ~0.5px above getBoundingClientRect().bottom, so the + sat slightly below. Prefer
     * offsetTop+offsetHeight from the cells grid (same origin as splits when both inset:0). */
    const splits = splitsRef.current;
    const sr = splits?.getBoundingClientRect() ?? el.getBoundingClientRect();
    const v: number[] = [];
    if (c > 1) {
      for (let i = 0; i < c - 1; i++) {
        const a = nodes[i] as HTMLElement;
        const br = a.getBoundingClientRect();
        v.push(br.right - sr.left);
      }
    }
    const hS: number[] = [];
    if (r > 1) {
      for (let j = 0; j < r - 1; j++) {
        const a = nodes[j * c] as HTMLElement;
        if (a.offsetParent === grid) {
          hS.push(a.offsetTop + a.offsetHeight);
        } else {
          const br = a.getBoundingClientRect();
          hS.push(br.bottom - sr.top);
        }
      }
    }
    setMeasSplits({ v, h: hS });
  }, [c, r, w, h, colFracs, rowFracs, dataRef, cellLabels]);

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
      const m = minTrackPx(MIN_COL_PX, W, c);
      const wPx = d.colStart.map((f) => f * W);
      const dPix = ev.clientX - d.startX;
      const nextW = renormalizeToSum(
        applyAxisPixelDelta(wPx, d.index, dPix, m),
        W
      );
      const bounded = enforceTrackBounds(nextW, W, m, MAX_TRACK_FRACTION);
      setColFracs(bounded.map((x) => x / W));
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
      const m = minTrackPx(MIN_ROW_PX, H, r);
      const hPx = d.rowStart.map((f) => f * H);
      const dPix = ev.clientY - d.startY;
      const nextH = renormalizeToSum(
        applyAxisPixelDelta(hPx, d.index, dPix, m),
        H
      );
      const bounded = enforceTrackBounds(nextH, H, m, MAX_TRACK_FRACTION);
      setRowFracs(bounded.map((x) => x / H));
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
        const mCol = minTrackPx(MIN_COL_PX, W, c);
        const mRow = minTrackPx(MIN_ROW_PX, H, r);
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
        setColFracs(boundedW.map((x) => x / W));
        setRowFracs(boundedH.map((x) => x / H));
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

  /* `1fr` is `minmax(0,1fr)` in browsers — tracks can shrink past item min; min-content enforces 2em+text+2em. */
  const gridStyle = {
    gridTemplateColumns: colFracs
      .map((f) => `minmax(min-content, ${f}fr)`)
      .join(" "),
    gridTemplateRows: rowFracs
      .map((f) => `minmax(min-content, ${f}fr)`)
      .join(" "),
  } as const;

  return (
    <div ref={rootRef} className="resizable-grid resizable-grid--fill">
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
        {Array.from({ length: r }, (_, row) =>
          Array.from({ length: c }, (_, col) => {
            const text = cellLabels[row]?.[col] ?? "";
            return (
              <div
                key={`${row}-${col}`}
                className="resizable-grid__cell"
                role="gridcell"
                aria-label={
                  text
                    ? undefined
                    : `Empty cell row ${row + 1} column ${col + 1}`
                }
              >
                <div className="resizable-grid__cell-chrome">
                  <div className="resizable-grid__cell-surface">
                    {text ? (
                      <span className="resizable-grid__cell-text">{text}</span>
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
          })
        ).flat()}
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
    </div>
  );
}
