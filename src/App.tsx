import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { ResizableGridOverlay } from "./components/ResizableGridOverlay";
import {
  makeDefaultCellLabels,
  resizeLabelGrid,
  type CellLabelGrid,
} from "./lib/cellLabelGrid";
import type { GlassParams, SceneData } from "./lib/sceneData";
import "./App.css";

const COL_ROW_MIN = 1;
const COL_ROW_MAX = 12;
const GLASS_DEFAULTS: GlassParams = {
  tint: [0.82, 0.94, 1.0],
  specularPower: 64,
  fresnelPower: 4,
  causticStrength: 0.15,
  bodyDarkness: 0.02,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function App() {
  const dataRef = useRef<SceneData>({
    lightPos: { x: 0, y: 0 },
    cellRects: [],
    containerRects: [],
    glassParams: GLASS_DEFAULTS,
  });
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(4);
  const [glassParams, setGlassParams] = useState<GlassParams>(GLASS_DEFAULTS);
  const [cellLabels, setCellLabels] = useState<CellLabelGrid>(() =>
    makeDefaultCellLabels(4, 4)
  );

  useLayoutEffect(() => {
    setCellLabels((prev) =>
      resizeLabelGrid(prev, cols, rows, (row, col) => `R${row + 1}C${col + 1}`)
    );
  }, [cols, rows]);

  useLayoutEffect(() => {
    dataRef.current = { ...dataRef.current, glassParams };
  }, [glassParams]);

  const onColRow = (key: "cols" | "rows", value: number) => {
    const v = Math.min(
      COL_ROW_MAX,
      Math.max(COL_ROW_MIN, Math.floor(value))
    );
    if (key === "cols") setCols(v);
    else setRows(v);
  };

  const onGlassParam =
    (key: keyof GlassParams) => (e: ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      if (!Number.isFinite(n)) return;
      setGlassParams((prev) => {
        if (key === "specularPower") {
          return { ...prev, specularPower: clamp(n, 1.0, 256.0) };
        }
        if (key === "fresnelPower") {
          return { ...prev, fresnelPower: clamp(n, 0.1, 8.0) };
        }
        if (key === "causticStrength") {
          return { ...prev, causticStrength: clamp(n, 0.0, 1.0) };
        }
        return { ...prev, bodyDarkness: clamp(n, 0.0, 0.2) };
      });
    };

  const onGlassTint =
    (channel: 0 | 1 | 2) => (e: ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      if (!Number.isFinite(n)) return;
      setGlassParams((prev) => {
        const tint: [number, number, number] = [...prev.tint] as [
          number,
          number,
          number
        ];
        tint[channel] = clamp(n, 0.0, 1.0);
        return { ...prev, tint };
      });
    };

  return (
    <div className="app">
      <header className="app__header">
        <h1>shader-tut</h1>
        <p className="app__hint">
          The grid fills the area below and follows the window size. Each cell keeps a minimum
          width and height. Drag a split: when a cell hits its min, the next track along the row
          or column picks up the resize so room is redistributed. Corners move a column and a row
          split at once. Change columns and rows to re-layout.
        </p>
        <div className="app__grid-settings" role="group" aria-label="Grid dimensions">
          <label className="app__label">
            Columns
            <input
              type="number"
              min={COL_ROW_MIN}
              max={COL_ROW_MAX}
              value={cols}
              onChange={(e) => onColRow("cols", Number(e.target.value))}
            />
          </label>
          <label className="app__label">
            Rows
            <input
              type="number"
              min={COL_ROW_MIN}
              max={COL_ROW_MAX}
              value={rows}
              onChange={(e) => onColRow("rows", Number(e.target.value))}
            />
          </label>
          <label className="app__label">
            Tint R
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={glassParams.tint[0]}
              onChange={onGlassTint(0)}
            />
          </label>
          <label className="app__label">
            Tint G
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={glassParams.tint[1]}
              onChange={onGlassTint(1)}
            />
          </label>
          <label className="app__label">
            Tint B
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={glassParams.tint[2]}
              onChange={onGlassTint(2)}
            />
          </label>
          <label className="app__label">
            specular pow()
            <input
              type="number"
              step="1"
              min="1"
              max="256"
              value={glassParams.specularPower}
              onChange={onGlassParam("specularPower")}
            />
          </label>
          <label className="app__label">
            Fresnel power
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="8"
              value={glassParams.fresnelPower}
              onChange={onGlassParam("fresnelPower")}
            />
          </label>
          <label className="app__label">
            caustic
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={glassParams.causticStrength}
              onChange={onGlassParam("causticStrength")}
            />
          </label>
          <label className="app__label">
            body dark
            <input
              type="number"
              step="0.01"
              min="0"
              max="0.2"
              value={glassParams.bodyDarkness}
              onChange={onGlassParam("bodyDarkness")}
            />
          </label>
        </div>
      </header>
      <div className="scene">
        <ResizableGridOverlay
          dataRef={dataRef}
          cols={cols}
          rows={rows}
          cellLabels={cellLabels}
        />
      </div>
    </div>
  );
}

export default App;
