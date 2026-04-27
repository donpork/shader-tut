import p5 from "p5";
import type { MutableRefObject } from "react";
import type { SceneData } from "../lib/sceneData";
import vert from "../shaders/cell.vert?raw";
import frag from "../shaders/cell.frag?raw";

/**
 * Instance-mode sketch for one WEBGL canvas. draw() reads dataRef; React writes it.
 * Host is top-left / Y-down, matching the shader’s gl_FragCoord fix.
 */
export function createGridShaderSketch(
  dataRef: MutableRefObject<SceneData>,
  getHost: () => HTMLDivElement | null
) {
  return (p: p5) => {
    let sh: p5.Shader;

    p.setup = () => {
      const el = getHost();
      const w = Math.max(1, el?.clientWidth ?? 1);
      const h = Math.max(1, el?.clientHeight ?? 1);
      p.createCanvas(w, h, p.WEBGL);
      p.pixelDensity(1);
      p.noStroke();
      sh = p.createShader(vert, frag);
    };

    p.draw = () => {
      const d = dataRef.current;
      p.background(18, 20, 28);
      if (!d.cellRects.length) return;
      p.shader(sh);
      sh.setUniform("uResolution", [p.width, p.height]);
      sh.setUniform("uLightPos", [d.lightPos.x, d.lightPos.y]);
      for (const c of d.cellRects) {
        p.push();
        p.translate(
          c.x + c.w * 0.5 - p.width * 0.5,
          p.height * 0.5 - (c.y + c.h * 0.5),
          0
        );
        p.plane(c.w, c.h);
        p.pop();
      }
      p.resetShader();
    };
  };
}
