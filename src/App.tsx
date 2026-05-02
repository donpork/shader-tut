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
  lightDirXY: [1.0, -1.0],
  keyLightIntensity: 1.0,
  keyLightZ: 0.85,
  specularLightXY: [-1.0, -1.0],
  specularFollowPointer: true,
  specularPower: 60,
  specularIntensity: 2.0,
  rimPower: 0.3,
  rimIntensity: 0.3,
  flatPow: 4.0,
  plateau: 0.1,
  refractionStrength: 4.0,
  edgeSoftness: 4.0,
  dispersionHueShift: 0.2,
  dispersionSaturation: 1.0,
  dispersionSpread: 0.25,
  dispersionSharpness: 3.0,
  dispersionFocus: 0.3,
  envReflection: 0.5,
  boxLightEnabled: false,
  boxLightIntensity: 0.5,
  boxLightSoftness: 0.8,
  boxLightSize: [0.5, 0.5],
  boxLightPosXY: [0.0, 0.0],
  bevelEnabled: true,
  bevelStrength: 1.0,
  bevelWidthPx: 12,
  bevelExponent: 4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function App() {
  const initialLabels = makeDefaultCellLabels(4, 4);
  const dataRef = useRef<SceneData>({
    lightPos: { x: 0, y: 0 },
    pointerOverSurface: false,
    cellRects: [],
    containerRects: [],
    cellLabels: initialLabels,
    glassParams: GLASS_DEFAULTS,
    specularSpin: null,
  });
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(4);
  const [glassParams, setGlassParams] = useState<GlassParams>(GLASS_DEFAULTS);
  const [cellLabels, setCellLabels] = useState<CellLabelGrid>(initialLabels);
  const [showDebugShader, setShowDebugShader] = useState(false);
  const [showDebugGrid, setShowDebugGrid] = useState(true);
  const [panelGlass, setPanelGlass] = useState(false);
  const [panelLight, setPanelLight] = useState(false);
  const [panelGrid, setPanelGrid] = useState(false);
  const [panelDebug, setPanelDebug] = useState(false);
  const [singleMode, setSingleMode] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );

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
        if (
          key === "lightDirXY" ||
          key === "specularLightXY" ||
          key === "specularFollowPointer"
        )
          return prev;
        if (key === "keyLightIntensity") {
          return { ...prev, keyLightIntensity: clamp(n, 0.0, 2.0) };
        }
        if (key === "keyLightZ") {
          return { ...prev, keyLightZ: clamp(n, 0.05, 2.0) };
        }
        if (key === "boxLightSize" || key === "boxLightPosXY")
          return prev;
        if (key === "boxLightEnabled" || key === "bevelEnabled") return prev;
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
        if (key === "flatPow") {
          return { ...prev, flatPow: clamp(n, 1.0, 8.0) };
        }
        if (key === "plateau") {
          return { ...prev, plateau: clamp(n, 0.0, 0.8) };
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
        if (key === "bevelStrength") {
          return { ...prev, bevelStrength: clamp(n, 0.0, 1.0) };
        }
        if (key === "bevelWidthPx") {
          return { ...prev, bevelWidthPx: clamp(n, 1.0, 32.0) };
        }
        if (key === "bevelExponent") {
          return { ...prev, bevelExponent: clamp(n, 1.0, 16.0) };
        }
        if (key === "dispersionHueShift") {
          return { ...prev, dispersionHueShift: clamp(n, -3.14159, 3.14159) };
        }
        if (key === "dispersionSaturation") {
          return { ...prev, dispersionSaturation: clamp(n, 0.0, 1.0) };
        }
        if (key === "dispersionSpread") {
          return { ...prev, dispersionSpread: clamp(n, 0.25, 3.0) };
        }
        if (key === "dispersionSharpness") {
          return { ...prev, dispersionSharpness: clamp(n, 0.0, 3.0) };
        }
        if (key === "dispersionFocus") {
          return { ...prev, dispersionFocus: clamp(n, 0.0, 1.0) };
        }
        if (key === "envReflection") {
          return { ...prev, envReflection: clamp(n, 0.0, 3.0) };
        }
        if (key === "edgeSoftness") {
          return { ...prev, edgeSoftness: clamp(n, 0.2, 4.0) };
        }
        return prev;
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

  const onSpecularLight =
    (axis: 0 | 1) => (e: ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      if (!Number.isFinite(n)) return;
      setGlassParams((prev) => {
        const specularLightXY: [number, number] = [...prev.specularLightXY];
        specularLightXY[axis] = clamp(n, -1.0, 1.0);
        return { ...prev, specularLightXY };
      });
    };

  const onSpecularFollowPointer = (e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setGlassParams((prev) => ({ ...prev, specularFollowPointer: checked }));
  };

  const onBoxLightEnabled = (e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setGlassParams((prev) => ({ ...prev, boxLightEnabled: checked }));
  };

  const onBevelEnabled = (e: ChangeEvent<HTMLInputElement>) => {
    setGlassParams((prev) => ({ ...prev, bevelEnabled: e.target.checked }));
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
        <div className="app__title-row">
          <h1>shader-tut</h1>
        </div>
        <div
          className="app__filter-chips"
          role="toolbar"
          aria-label="Control panels"
        >
          <button
            type="button"
            className={
              panelGlass ? "app__chip app__chip--on" : "app__chip"
            }
            aria-pressed={panelGlass}
            onClick={() => setPanelGlass((v) => !v)}
          >
            Glass
          </button>
          <button
            type="button"
            className={
              panelLight ? "app__chip app__chip--on" : "app__chip"
            }
            aria-pressed={panelLight}
            onClick={() => setPanelLight((v) => !v)}
          >
            Light
          </button>
          <button
            type="button"
            className={
              panelGrid ? "app__chip app__chip--on" : "app__chip"
            }
            aria-pressed={panelGrid}
            onClick={() => setPanelGrid((v) => !v)}
          >
            Grid
          </button>
          <button
            type="button"
            className={
              panelDebug ? "app__chip app__chip--on" : "app__chip"
            }
            aria-pressed={panelDebug}
            onClick={() => setPanelDebug((v) => !v)}
          >
            Debug
          </button>
          <button
            type="button"
            className={
              singleMode ? "app__chip app__chip--on" : "app__chip"
            }
            aria-pressed={singleMode}
            onClick={() => setSingleMode((v) => !v)}
          >
            Single
          </button>
        </div>
        <div className="app__param-groups">
          {panelGrid ? (
          <fieldset className="app__param-group">
            <legend>Grid</legend>
            <div className="app__param-group__body">
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
            </div>
          </fieldset>
          ) : null}
          {panelLight ? (
          <>
          <fieldset className="app__param-group">
            <legend>Key light</legend>
            <div className="app__param-group__body">
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
              Intensity
              <input
                type="number"
                step="0.05"
                min="0"
                max="2"
                value={glassParams.keyLightIntensity}
                onChange={onGlassParam("keyLightIntensity")}
              />
            </label>
            <label className="app__label">
              Z (depth)
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="2"
                value={glassParams.keyLightZ}
                onChange={onGlassParam("keyLightZ")}
              />
            </label>
            </div>
          </fieldset>
          <fieldset className="app__param-group">
            <legend>Specular</legend>
            <div className="app__param-group__body">
            <label className="app__label">
              Spec X
              <input
                type="number"
                step="0.01"
                min="-1"
                max="1"
                value={glassParams.specularLightXY[0]}
                onChange={onSpecularLight(0)}
              />
            </label>
            <label className="app__label">
              Spec Y
              <input
                type="number"
                step="0.01"
                min="-1"
                max="1"
                value={glassParams.specularLightXY[1]}
                onChange={onSpecularLight(1)}
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
              Follow pointer
              <input
                type="checkbox"
                checked={glassParams.specularFollowPointer}
                onChange={onSpecularFollowPointer}
              />
            </label>
            </div>
          </fieldset>
          <fieldset className="app__param-group">
            <legend>Soft box</legend>
            <div className="app__param-group__body">
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
            </div>
          </fieldset>
          </>
          ) : null}
          {panelGlass ? (
          <>
          <fieldset className="app__param-group">
            <legend>Glass</legend>
            <div className="app__param-group__body">
            <label
              className="app__label"
              title="Fresnel curve exponent: higher = brighter only at grazing edges."
            >
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
            <label
              className="app__label"
              title="White edge glow where Fresnel is high (silhouette)."
            >
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
              Flat pow
              <input
                type="number"
                step="0.1"
                min="1"
                max="8"
                value={glassParams.flatPow}
                onChange={onGlassParam("flatPow")}
              />
            </label>
            <label className="app__label">
              Plateau
              <input
                type="number"
                step="0.01"
                min="0"
                max="0.8"
                value={glassParams.plateau}
                onChange={onGlassParam("plateau")}
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
            <label
              className="app__label"
              title="Rotates rainbow fringe hues around gray (radians)."
            >
              Fringe hue
              <input
                type="number"
                step="0.05"
                min="-3.15"
                max="3.15"
                value={glassParams.dispersionHueShift}
                onChange={onGlassParam("dispersionHueShift")}
              />
            </label>
            <label
              className="app__label"
              title="0 = faint gray fringes, 1 = full saturated rainbow."
            >
              Fringe vivid
              <input
                type="number"
                step="0.02"
                min="0"
                max="1"
                value={glassParams.dispersionSaturation}
                onChange={onGlassParam("dispersionSaturation")}
              />
            </label>
            <label
              className="app__label"
              title="How far apart the RGB background samples are spread (wider chromatic blur)."
            >
              Split width
              <input
                type="number"
                step="0.05"
                min="0.25"
                max="3"
                value={glassParams.dispersionSpread}
                onChange={onGlassParam("dispersionSpread")}
              />
            </label>
            <label
              className="app__label"
              title="Higher = punchier spectral bands; lower = softer, more blended fringes."
            >
              Band purity
              <input
                type="number"
                step="0.05"
                min="0"
                max="3"
                value={glassParams.dispersionSharpness}
                onChange={onGlassParam("dispersionSharpness")}
              />
            </label>
            <label
              className="app__label"
              title="Low = chroma visible toward face center. High = chroma mostly at glancing silhouette."
            >
              Edge chroma
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={glassParams.dispersionFocus}
                onChange={onGlassParam("dispersionFocus")}
              />
            </label>
            <label
              className="app__label"
              title="Cubemap reflection strength (still ramps with Fresnel)."
            >
              Env refl
              <input
                type="number"
                step="0.05"
                min="0"
                max="3"
                value={glassParams.envReflection}
                onChange={onGlassParam("envReflection")}
              />
            </label>
            </div>
          </fieldset>
          <fieldset className="app__param-group">
            <legend>Bevel</legend>
            <div className="app__param-group__body">
            <label className="app__label">
              Bevel
              <input
                type="checkbox"
                checked={glassParams.bevelEnabled}
                onChange={onBevelEnabled}
              />
            </label>
            <label className="app__label">
              Bevel str
              <input
                type="number"
                step="0.02"
                min="0"
                max="1"
                value={glassParams.bevelStrength}
                onChange={onGlassParam("bevelStrength")}
              />
            </label>
            <label className="app__label">
              Bevel px
              <input
                type="number"
                step="0.5"
                min="1"
                max="32"
                value={glassParams.bevelWidthPx}
                onChange={onGlassParam("bevelWidthPx")}
              />
            </label>
            <label className="app__label">
              Bevel exp
              <input
                type="number"
                step="0.5"
                min="1"
                max="16"
                value={glassParams.bevelExponent}
                onChange={onGlassParam("bevelExponent")}
              />
            </label>
            </div>
          </fieldset>
          </>
          ) : null}
          {panelDebug ? (
          <fieldset className="app__param-group">
            <legend>Debug</legend>
            <div className="app__param-group__body">
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
          </fieldset>
          ) : null}
        </div>
      </header>
      <div className="scene">
        <ResizableGridOverlay
          dataRef={dataRef}
          cols={singleMode ? 1 : cols}
          rows={singleMode ? 1 : rows}
          cellLabels={cellLabels}
          showDebugShader={showDebugShader}
          showDebugGrid={showDebugGrid}
          singleMode={singleMode}
        />
      </div>
    </div>
  );
}

export default App;
