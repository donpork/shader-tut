import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type MutableRefObject,
} from "react";
import type { SceneData } from "../lib/sceneData";
import { splitGridRects } from "../lib/splitGridRects";
// Splits cascade along a row/column: after the two neighbors of a handle, extra space is taken
// from tracks farther out (e.g. to the left when moving a line left and the inner track is at min).
import {
  applyAxisPixelDelta,
  renormalizeToSum,
} from "../lib/applyTrackSplitDeltas";
import { ShaderCanvas } from "./ShaderCanvas";
import "./ResizableGridOverlay.css";

/** Minimum size every cell is allowed; cascades to farther tracks when a neighbor is at min. */
const MIN_COL_PX = 24;
const MIN_ROW_PX = 24;

function makeUniformFracs(n: number): number[] {
  const f = 1 / Math.max(1, n);
  return Array.from({ length: Math.max(1, n) }, () => f);
}

function minTrackPx(ideal: number, totalPx: number, count: number): number {
  if (count < 1) return 0;
  return Math.max(0, Math.min(ideal, totalPx / count - 0.1));
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
export function ResizableGridOverlay({ dataRef, cols, rows }: Props) {
  const c = Math.min(12, Math.max(1, Math.floor(cols)));
  const r = Math.min(12, Math.max(1, Math.floor(rows)));

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [colFracs, setColFracs] = useState<number[]>(() => makeUniformFracs(c));
  const [rowFracs, setRowFracs] = useState<number[]>(() => makeUniformFracs(r));
  const [box, setBox] = useState({ w: 0, h: 0 });

  const drag = useRef<Drag | null>(null);
  const moveListener = useRef<((e: PointerEvent) => void) | null>(null);
  const endPointerListener = useRef<((e: PointerEvent) => void) | null>(null);

  useLayoutEffect(() => {
    setColFracs(makeUniformFracs(c));
    setRowFracs(makeUniformFracs(r));
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

  const pushScene = useCallback(() => {
    if (w <= 0 || h <= 0 || colFracs.length !== c || rowFracs.length !== r) {
      dataRef.current = { ...dataRef.current, cellRects: [] };
      return;
    }
    dataRef.current = {
      ...dataRef.current,
      cellRects: splitGridRects(colFracs, rowFracs, w, h),
    };
  }, [c, r, w, h, colFracs, rowFracs, dataRef]);

  useLayoutEffect(() => {
    pushScene();
  }, [pushScene]);

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
      setColFracs(nextW.map((x) => x / W));
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
      setRowFracs(nextH.map((x) => x / H));
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
        setColFracs(nextW.map((x) => x / W));
        setRowFracs(nextH.map((x) => x / H));
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

  const gridStyle = {
    gridTemplateColumns: colFracs.map((f) => `${f}fr`).join(" "),
    gridTemplateRows: rowFracs.map((f) => `${f}fr`).join(" "),
  } as const;

  return (
    <div ref={rootRef} className="resizable-grid resizable-grid--fill">
      <ShaderCanvas
        dataRef={dataRef}
        className="shader-canvas__host resizable-grid__canvas-host"
      />
      <div
        className="resizable-grid__cells"
        style={gridStyle}
        aria-hidden
      >
        {Array.from({ length: c * r }, (_, i) => (
          <div key={i} className="resizable-grid__cell" />
        ))}
      </div>
      <div className="resizable-grid__splits" aria-hidden>
        {c > 1 &&
          Array.from({ length: c - 1 }, (_, i) => (
            <button
              key={`v-${i}`}
              type="button"
              className="resizable-grid__split resizable-grid__split--v"
              style={{
                left: `${cumToSplitLeft(colFracs, i) * 100}%`,
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
                top: `${cumToSplitLeft(rowFracs, j) * 100}%`,
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
                  left: `${cumToSplitLeft(colFracs, i) * 100}%`,
                  top: `${cumToSplitLeft(rowFracs, j) * 100}%`,
                }}
                aria-label={`Resize at column ${i + 1} and row ${j + 1} junction`}
                onPointerDown={onPointerDownC(i, j)}
              />
            ))
          ).flat()}
      </div>
    </div>
  );
}
