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
    const LIGHT_NORM = { x: 0.06, y: 0.06 };
    let sh: p5.Shader;

    p.setup = () => {
      const el = getHost();
      const w = Math.max(1, el?.clientWidth ?? 1);
      const h = Math.max(1, el?.clientHeight ?? 1);
      p.createCanvas(w, h, p.WEBGL);
      p.pixelDensity(1);
      p.noStroke();
      p.ortho(-w * 0.5, w * 0.5, -h * 0.5, h * 0.5, -1000, 1000);
      sh = p.createShader(vert, frag);
    };

    p.draw = () => {
      const d = dataRef.current;
      p.background(6, 7, 10);
      if (!d.containerRects.length) return;
      p.ortho(-p.width * 0.5, p.width * 0.5, -p.height * 0.5, p.height * 0.5, -1000, 1000);
      p.shader(sh);
      sh.setUniform("uResolution", [p.width, p.height]);
      sh.setUniform("uLightPos", [p.width * LIGHT_NORM.x, p.height * LIGHT_NORM.y]);
      sh.setUniform("uGlassTint", d.glassParams.tint);
      sh.setUniform("uSpecularPower", d.glassParams.specularPower);
      sh.setUniform("uFresnelPower", d.glassParams.fresnelPower);
      sh.setUniform("uCausticStrength", d.glassParams.causticStrength);
      sh.setUniform("uBodyDarkness", d.glassParams.bodyDarkness);
      sh.setUniform("uTime", p.millis() / 1000);
      for (let i = 0; i < d.containerRects.length; i += 1) {
        const c = d.containerRects[i]!;
        sh.setUniform("uCellIndex", i);
        sh.setUniform("uCellRect", [c.x, c.y, c.w, c.h]);
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
