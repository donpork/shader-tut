import { useLayoutEffect, useRef, useState } from "react";
import { ResizableGridOverlay } from "./components/ResizableGridOverlay";
import {
  makeDefaultCellLabels,
  resizeLabelGrid,
  type CellLabelGrid,
} from "./lib/cellLabelGrid";
import type { SceneData } from "./lib/sceneData";
import "./App.css";

const COL_ROW_MIN = 1;
const COL_ROW_MAX = 12;

function App() {
  const dataRef = useRef<SceneData>({
    lightPos: { x: 0, y: 0 },
    cellRects: [],
  });
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(4);
  const [cellLabels, setCellLabels] = useState<CellLabelGrid>(() =>
    makeDefaultCellLabels(4, 4)
  );

  useLayoutEffect(() => {
    setCellLabels((prev) =>
      resizeLabelGrid(prev, cols, rows, (row, col) => `R${row + 1}C${col + 1}`)
    );
  }, [cols, rows]);

  const onColRow = (key: "cols" | "rows", value: number) => {
    const v = Math.min(
      COL_ROW_MAX,
      Math.max(COL_ROW_MIN, Math.floor(value))
    );
    if (key === "cols") setCols(v);
    else setRows(v);
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
