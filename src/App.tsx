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
  lightDirXY: [-0.75, -0.6],
  lightFollowPointer: false,
  pointerLightMix: 0.35,
  specularPower: 72,
  specularIntensity: 1.0,
  rimPower: 3.2,
  rimIntensity: 0.6,
  refractionStrength: 0.02,
  edgeSoftness: 1.4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function App() {
  const initialLabels = makeDefaultCellLabels(4, 4);
  const dataRef = useRef<SceneData>({
    lightPos: { x: 0, y: 0 },
    cellRects: [],
    containerRects: [],
    cellLabels: initialLabels,
    glassParams: GLASS_DEFAULTS,
  });
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(4);
  const [glassParams, setGlassParams] = useState<GlassParams>(GLASS_DEFAULTS);
  const [cellLabels, setCellLabels] = useState<CellLabelGrid>(initialLabels);
  const [showDebugShader, setShowDebugShader] = useState(false);
  const [showDebugGrid, setShowDebugGrid] = useState(false);

  useLayoutEffect(() => {
    setCellLabels((prev) =>
      resizeLabelGrid(prev, cols, rows, (row, col) => `R${row + 1}C${col + 1}`)
    );
  }, [cols, rows]);

  useLayoutEffect(() => {
    dataRef.current = { ...dataRef.current, glassParams };
  }, [glassParams]);

  useLayoutEffect(() => {
    dataRef.current = { ...dataRef.current, cellLabels };
  }, [cellLabels]);

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
        if (key === "lightDirXY" || key === "lightFollowPointer") return prev;
        if (key === "pointerLightMix") {
          return { ...prev, pointerLightMix: clamp(n, 0.0, 1.0) };
        }
        if (key === "specularPower") {
          return { ...prev, specularPower: clamp(n, 1.0, 256.0) };
        }
        if (key === "specularIntensity") {
          return { ...prev, specularIntensity: clamp(n, 0.0, 3.0) };
        }
        if (key === "rimPower") {
          return { ...prev, rimPower: clamp(n, 0.1, 8.0) };
        }
        if (key === "rimIntensity") {
          return { ...prev, rimIntensity: clamp(n, 0.0, 2.0) };
        }
        if (key === "refractionStrength") {
          return { ...prev, refractionStrength: clamp(n, 0.0, 0.08) };
        }
        return { ...prev, edgeSoftness: clamp(n, 0.2, 4.0) };
      });
    };

  const onLightDir = (axis: 0 | 1) => (e: ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      if (!Number.isFinite(n)) return;
      setGlassParams((prev) => {
        const lightDirXY: [number, number] = [...prev.lightDirXY];
        lightDirXY[axis] = clamp(n, -1.0, 1.0);
        return { ...prev, lightDirXY };
      });
    };

  const onLightFollowPointer = (e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setGlassParams((prev) => ({ ...prev, lightFollowPointer: checked }));
  };

  const onDebugShader = (e: ChangeEvent<HTMLInputElement>) => {
    setShowDebugShader(e.target.checked);
  };

  const onDebugGrid = (e: ChangeEvent<HTMLInputElement>) => {
    setShowDebugGrid(e.target.checked);
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1>shader-tut</h1>
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
            Light X
            <input
              type="number"
              step="0.01"
              min="-1"
              max="1"
              value={glassParams.lightDirXY[0]}
              onChange={onLightDir(0)}
            />
          </label>
          <label className="app__label">
            Light Y
            <input
              type="number"
              step="0.01"
              min="-1"
              max="1"
              value={glassParams.lightDirXY[1]}
              onChange={onLightDir(1)}
            />
          </label>
          <label className="app__label">
            Pointer light
            <input
              type="checkbox"
              checked={glassParams.lightFollowPointer}
              onChange={onLightFollowPointer}
            />
          </label>
          <label className="app__label">
            Pointer mix
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={glassParams.pointerLightMix}
              onChange={onGlassParam("pointerLightMix")}
            />
          </label>
          <label className="app__label">
            Spec pow
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
            Spec intensity
            <input
              type="number"
              step="0.1"
              min="0"
              max="3"
              value={glassParams.specularIntensity}
              onChange={onGlassParam("specularIntensity")}
            />
          </label>
          <label className="app__label">
            Rim power
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="8"
              value={glassParams.rimPower}
              onChange={onGlassParam("rimPower")}
            />
          </label>
          <label className="app__label">
            Rim intensity
            <input
              type="number"
              step="0.01"
              min="0"
              max="2"
              value={glassParams.rimIntensity}
              onChange={onGlassParam("rimIntensity")}
            />
          </label>
          <label className="app__label">
            Refraction
            <input
              type="number"
              step="0.001"
              min="0"
              max="0.08"
              value={glassParams.refractionStrength}
              onChange={onGlassParam("refractionStrength")}
            />
          </label>
          <label className="app__label">
            Edge soft
            <input
              type="number"
              step="0.1"
              min="0.2"
              max="4"
              value={glassParams.edgeSoftness}
              onChange={onGlassParam("edgeSoftness")}
            />
          </label>
          <label className="app__label">
            Debug shader
            <input
              type="checkbox"
              checked={showDebugShader}
              onChange={onDebugShader}
            />
          </label>
          <label className="app__label">
            Debug grid
            <input
              type="checkbox"
              checked={showDebugGrid}
              onChange={onDebugGrid}
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
          showDebugShader={showDebugShader}
          showDebugGrid={showDebugGrid}
        />
      </div>
    </div>
  );
}

export default App;
