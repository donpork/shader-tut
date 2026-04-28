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
  lightDirXY: [-1.0, -1.0],
  lightFollowPointer: true,
  pointerLightMix: 1.0,
  specularPower: 45,
  specularIntensity: 0.5,
  rimPower: 8.0,
  rimIntensity: 0.01,
  refractionStrength: 0.1,
  edgeSoftness: 4.0,
  boxLightEnabled: true,
  boxLightIntensity: 0.5,
  boxLightSoftness: 0.8,
  boxLightSize: [0.5, 0.5],
  boxLightPosXY: [0.0, 0.0],
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
  const [showDebugGrid, setShowDebugGrid] = useState(true);

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
        if (key === "boxLightSize" || key === "boxLightPosXY") return prev;
        if (key === "boxLightEnabled") return prev;
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
          return { ...prev, refractionStrength: clamp(n, 0.0, 32.0) };
        }
        if (key === "boxLightIntensity") {
          return { ...prev, boxLightIntensity: clamp(n, 0.0, 2.0) };
        }
        if (key === "boxLightSoftness") {
          return { ...prev, boxLightSoftness: clamp(n, 0.01, 0.8) };
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

  const onBoxLightEnabled = (e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setGlassParams((prev) => ({ ...prev, boxLightEnabled: checked }));
  };

  const onBoxLightSize = (axis: 0 | 1) => (e: ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (!Number.isFinite(n)) return;
    setGlassParams((prev) => {
      const boxLightSize: [number, number] = [...prev.boxLightSize];
      boxLightSize[axis] = clamp(n, 0.05, 0.8);
      return { ...prev, boxLightSize };
    });
  };

  const onBoxLightPos = (axis: 0 | 1) => (e: ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (!Number.isFinite(n)) return;
    setGlassParams((prev) => {
      const boxLightPosXY: [number, number] = [...prev.boxLightPosXY];
      boxLightPosXY[axis] = clamp(n, 0.0, 1.0);
      return { ...prev, boxLightPosXY };
    });
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
              step="0.1"
              min="0"
              max="32"
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
            Soft box light
            <input
              type="checkbox"
              checked={glassParams.boxLightEnabled}
              onChange={onBoxLightEnabled}
            />
          </label>
          <label className="app__label">
            Box intensity
            <input
              type="number"
              step="0.01"
              min="0"
              max="2"
              value={glassParams.boxLightIntensity}
              onChange={onGlassParam("boxLightIntensity")}
            />
          </label>
          <label className="app__label">
            Box softness
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="0.8"
              value={glassParams.boxLightSoftness}
              onChange={onGlassParam("boxLightSoftness")}
            />
          </label>
          <label className="app__label">
            Box width
            <input
              type="number"
              step="0.01"
              min="0.05"
              max="0.8"
              value={glassParams.boxLightSize[0]}
              onChange={onBoxLightSize(0)}
            />
          </label>
          <label className="app__label">
            Box height
            <input
              type="number"
              step="0.01"
              min="0.05"
              max="0.8"
              value={glassParams.boxLightSize[1]}
              onChange={onBoxLightSize(1)}
            />
          </label>
          <label className="app__label">
            Box X
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={glassParams.boxLightPosXY[0]}
              onChange={onBoxLightPos(0)}
            />
          </label>
          <label className="app__label">
            Box Y
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={glassParams.boxLightPosXY[1]}
              onChange={onBoxLightPos(1)}
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
