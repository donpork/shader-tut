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
  const normalize2 = (x: number, y: number): [number, number] => {
    const len = Math.hypot(x, y);
    if (len <= 1e-5) return [0, -1];
    return [x / len, y / len];
  };

  const labelForRect = (labels: string[][], id: string): string => {
    const [rowRaw, colRaw] = id.split("-");
    const row = Number(rowRaw);
    const col = Number(colRaw);
    if (Number.isFinite(row) && Number.isFinite(col)) {
      return labels[row]?.[col] ?? `R${row + 1}C${col + 1}`;
    }
    return "";
  };

  return (p: p5) => {
    let sh: p5.Shader;
    let bgLayer: p5.Graphics;

    const drawBackgroundLayer = () => {
      const d = dataRef.current;
      bgLayer.clear();
      bgLayer.noStroke();
      bgLayer.fill(10, 12, 18, 160);
      bgLayer.rect(0, 0, bgLayer.width, bgLayer.height);
      bgLayer.textAlign(bgLayer.CENTER, bgLayer.CENTER);
      for (let i = 0; i < d.containerRects.length; i += 1) {
        const c = d.containerRects[i]!;
        const label = labelForRect(d.cellLabels, c.id);
        bgLayer.fill(234, 244, 255, 225);
        bgLayer.textSize(Math.max(12, Math.min(c.w, c.h) * 0.18));
        bgLayer.text(label, c.x + c.w * 0.5, c.y + c.h * 0.5);
      }
    };

    p.setup = () => {
      const el = getHost();
      const w = Math.max(1, el?.clientWidth ?? 1);
      const h = Math.max(1, el?.clientHeight ?? 1);
      p.createCanvas(w, h, p.WEBGL);
      p.pixelDensity(1);
      p.noStroke();
      p.ortho(-w * 0.5, w * 0.5, -h * 0.5, h * 0.5, -1000, 1000);
      sh = p.createShader(vert, frag);
      bgLayer = p.createGraphics(w, h);
    };

    p.draw = () => {
      const d = dataRef.current;
      if (bgLayer.width !== p.width || bgLayer.height !== p.height) {
        bgLayer.resizeCanvas(p.width, p.height);
      }
      drawBackgroundLayer();
      p.clear();
      p.imageMode(p.CORNER);
      p.image(bgLayer, -p.width * 0.5, -p.height * 0.5, p.width, p.height);
      if (!d.containerRects.length) return;
      p.ortho(-p.width * 0.5, p.width * 0.5, -p.height * 0.5, p.height * 0.5, -1000, 1000);
      const gp = d.glassParams;
      const [baseX, baseY] = normalize2(gp.lightDirXY[0], gp.lightDirXY[1]);
      const [pointerX, pointerY] = normalize2(
        d.lightPos.x - p.width * 0.5,
        d.lightPos.y - p.height * 0.5
      );
      const pointerMix = gp.lightFollowPointer ? gp.pointerLightMix : 0;
      const [lightX, lightY] = normalize2(
        baseX * (1 - pointerMix) + pointerX * pointerMix,
        baseY * (1 - pointerMix) + pointerY * pointerMix
      );
      p.shader(sh);
      sh.setUniform("uResolution", [p.width, p.height]);
      sh.setUniform("uBackground", bgLayer);
      sh.setUniform("uLightDir", [lightX, lightY, 0.85]);
      sh.setUniform("uSpecularPower", gp.specularPower);
      sh.setUniform("uSpecularIntensity", gp.specularIntensity);
      sh.setUniform("uRimPower", gp.rimPower);
      sh.setUniform("uRimIntensity", gp.rimIntensity);
      sh.setUniform("uRefractionStrength", gp.refractionStrength);
      sh.setUniform("uEdgeSoftness", gp.edgeSoftness);
      for (let i = 0; i < d.containerRects.length; i += 1) {
        const c = d.containerRects[i]!;
        sh.setUniform("uCellRect", [c.x, c.y, c.w, c.h]);
        p.push();
        p.translate(
          c.x + c.w * 0.5 - p.width * 0.5,
          c.y + c.h * 0.5 - p.height * 0.5,
          0
        );
        p.plane(c.w, c.h);
        p.pop();
      }
      p.resetShader();
    };
  };
}
