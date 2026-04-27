import p5 from "p5";
import { useEffect, useRef, type MutableRefObject } from "react";
import type { SceneData } from "../lib/sceneData";
import { createGridShaderSketch } from "../sketches/gridShader";

import "./ShaderCanvas.css";

type Props = {
  dataRef: MutableRefObject<SceneData>;
  className?: string;
};

/**
 * One p5 WEBGL instance; instance mode; cleanup calls p.remove().
 * dataRef is stable: React writes, sketch reads in draw() — not setState in draw.
 */
export function ShaderCanvas({ dataRef, className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const sketch = createGridShaderSketch(dataRef, () => host);
    const instance = new p5(sketch, host);

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w > 0 && h > 0) {
        instance.resizeCanvas(w, h, true);
      }
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      instance.remove();
    };
  }, [dataRef]);

  return <div className={className ?? "shader-canvas__host"} ref={hostRef} aria-hidden />;
}
