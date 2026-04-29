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

  return (p: p5) => {
    let sh: p5.Shader;
    let bgLayer: p5.Graphics;

    const drawBackgroundLayer = () => {
      const d = dataRef.current;
      bgLayer.clear();
      bgLayer.noStroke();
      bgLayer.fill(10, 12, 18, 160);
      bgLayer.rect(0, 0, bgLayer.width, bgLayer.height);
      bgLayer.textAlign(p.CENTER, p.CENTER);
      bgLayer.textSize(16);
      const cols = Math.max(1, dataRef.current.cellLabels[0]?.length ?? 1);
      for (let i = 0; i < d.containerRects.length; i += 1) {
        const c = d.containerRects[i]!;
        const idMatch = /^(\d+)-(\d+)$/.exec(c.id);
        const row = idMatch ? Number(idMatch[1]) : Math.floor(i / cols);
        const col = idMatch ? Number(idMatch[2]) : i % cols;
        const label =
          d.cellLabels[row]?.[col] ??
          `R${Math.max(0, row) + 1}C${Math.max(0, col) + 1}`;
        bgLayer.fill(234, 244, 255, 225);
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
      p.background(10, 12, 18);
      if (!d.containerRects.length) return;
      p.ortho(-p.width * 0.5, p.width * 0.5, -p.height * 0.5, p.height * 0.5, -1000, 1000);
      const gp = d.glassParams;
      const [lightX, lightY] = normalize2(gp.lightDirXY[0], gp.lightDirXY[1]);
      const [specX, specY] = normalize2(
        gp.specularLightXY[0],
        gp.specularLightXY[1]
      );
      const pointerUvX = d.lightPos.x / Math.max(p.width, 1);
      const pointerUvY = d.lightPos.y / Math.max(p.height, 1);
      p.shader(sh);
      sh.setUniform("uResolution", [p.width, p.height]);
      sh.setUniform("uBackground", bgLayer);
      sh.setUniform("uLightDir", [lightX, lightY, 0.85]);
      sh.setUniform("uSpecularLightDir", [specX, specY, 0.85]);
      sh.setUniform("uPointerBoxEnabled", gp.lightFollowPointer ? 1 : 0);
      sh.setUniform("uPointerBoxIntensity", gp.pointerBoxIntensity);
      sh.setUniform("uPointerBoxSoftness", gp.pointerBoxSoftness);
      sh.setUniform("uPointerBoxSize", gp.pointerBoxSize);
      sh.setUniform("uPointerBoxPos", [pointerUvX, pointerUvY]);
      sh.setUniform("uSpecularPower", gp.specularPower);
      sh.setUniform("uSpecularIntensity", gp.specularIntensity);
      sh.setUniform("uRimPower", gp.rimPower);
      sh.setUniform("uRimIntensity", gp.rimIntensity);
      sh.setUniform("uFlatPow", gp.flatPow);
      sh.setUniform("uPlateau", gp.plateau);
      sh.setUniform("uRefractionStrength", gp.refractionStrength);
      sh.setUniform("uEdgeSoftness", gp.edgeSoftness);
      sh.setUniform("uBevelEnabled", gp.bevelEnabled ? 1 : 0);
      sh.setUniform("uBevelStrength", gp.bevelStrength);
      sh.setUniform("uBevelWidthPx", Math.max(0.5, gp.bevelWidthPx));
      sh.setUniform("uBevelExponent", gp.bevelExponent);
      sh.setUniform("uBoxLightEnabled", gp.boxLightEnabled ? 1 : 0);
      sh.setUniform("uBoxLightIntensity", gp.boxLightIntensity);
      sh.setUniform("uBoxLightSoftness", gp.boxLightSoftness);
      sh.setUniform("uBoxLightSize", gp.boxLightSize);
      sh.setUniform("uBoxLightPos", gp.boxLightPosXY);
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
