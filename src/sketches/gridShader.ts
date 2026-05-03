import p5 from "p5";
import type { MutableRefObject } from "react";
import type { CellRect, SceneData } from "../lib/sceneData";
import vert from "../shaders/cell.vert?raw";
import frag from "../shaders/cell.frag?raw";
import cubeStripUrl from "../assets/StandardCubeMap.png";
import cursorImgUrl from "../assets/cursor.svg";

const LABEL_BASE_SIZE = 16;
/** Alpha at edge (no hover). Max is 255. */
const LABEL_BASE_ALPHA = 205;
/** How much alpha ramps up at cell center (additive at hoverT=1: base + boost caps at 255). */
const LABEL_HOVER_ALPHA_BOOST = 50;
/** Smallest text scale during rim-hold / click pinch (90%). */
const LABEL_SCALE_MIN = 0.9;
/** Text shrink completes over this duration on mouse-down hold. */
const LABEL_HOLD_RAMP_MS = 500;
/** Matches short-click stage B decay in rim block. */
const LABEL_SHORT_CLICK_DECAY_MS = 1000;

/** GLSL-style smoothstep(edge0, edge1, x). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const u = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return u * u * (3 - 2 * u);
}

/**
 * Positive: px inside cell — distance to nearest edge (px).
 * Negative: outside — minus Euclidean distance to rect clamp(p → cell bounds).
 */
function signedDepthToCell(px: number, py: number, c: CellRect): number {
  const qx = Math.min(Math.max(px, c.x), c.x + c.w);
  const qy = Math.min(Math.max(py, c.y), c.y + c.h);
  const dx = px - qx;
  const dy = py - qy;
  const distOutside = Math.hypot(dx, dy);
  if (distOutside > 1e-6) return -distOutside;
  return Math.min(
    px - c.x,
    c.x + c.w - px,
    py - c.y,
    c.y + c.h - py
  );
}

/** Linear t∈[0,1] → eased phase∈[0,1], exponential ease-in-out (Penner). */
function expoEaseInOut01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.5) {
    return Math.pow(2, 20 * t - 10) / 2;
  }
  return (2 - Math.pow(2, -20 * t + 10)) / 2;
}

/** Exponential ease-out 0..1 (fast start, slow end). */
function easeOutExpo01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(2, -10 * t);
}

/**
 * Text scale while pointer is down (hold) or in rim release animation (click vs hold),
 * inverted relative to rim intensity: text shrinks as rim grows.
 * Mirrors the branch structure in p.draw() for rimHoldMul.
 */
function labelScaleMulForCell(d: SceneData, cellId: string): number {
  if (
    d.rimHoldPointerDown &&
    d.rimHoldCellId === cellId &&
    d.rimHoldStartTimeMs !== null
  ) {
    const elapsedMs = Math.max(0, performance.now() - d.rimHoldStartTimeMs);
    const rampT = smoothstep(0, LABEL_HOLD_RAMP_MS, elapsedMs);
    return 1.0 + (LABEL_SCALE_MIN - 1.0) * rampT;
  }
  if (
    d.rimReleaseCellId === cellId &&
    d.rimReleaseStartTimeMs !== null &&
    d.rimReleaseFromMul !== null &&
    d.rimReleaseMode !== null
  ) {
    const releaseElapsedMs = Math.max(
      0,
      performance.now() - d.rimReleaseStartTimeMs
    );
    if (d.rimReleaseMode === "shortClick") {
      const rampMs = Math.max(1, d.rimShortPulseRampMs ?? 100);
      if (releaseElapsedMs <= rampMs) {
        const trUp = Math.max(0, Math.min(1, releaseElapsedMs / rampMs));
        return 1.0 + (LABEL_SCALE_MIN - 1.0) * easeOutExpo01(trUp);
      }
      const trDown = Math.max(
        0,
        Math.min(1, (releaseElapsedMs - rampMs) / LABEL_SHORT_CLICK_DECAY_MS)
      );
      const e = easeOutExpo01(trDown);
      return LABEL_SCALE_MIN + (1.0 - LABEL_SCALE_MIN) * e;
    }
    const tr = Math.max(0, Math.min(1, releaseElapsedMs / 1000));
    const e = easeOutExpo01(tr);
    const s0 = Math.min(1, Math.max(0, (d.rimReleaseFromMul - 1.0) / 3.0));
    const startMul = 1.0 + (LABEL_SCALE_MIN - 1.0) * s0;
    return startMul + (1.0 - startMul) * e;
  }
  return 1.0;
}

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
    let cubeStrip: p5.Image | null = null;
    let envLoadAttempted = false;
    let cursorImg: p5.Image | null = null;
    let cursorImgLoadAttempted = false;
    /** Last pointer-driven specular direction per cell id; persists when pointer leaves. */
    const lastSpecularXY = new Map<string, [number, number]>();

    const drawBackgroundLayer = () => {
      const d = dataRef.current;
      bgLayer.clear();
      bgLayer.noStroke();
      bgLayer.fill(0, 0, 0, 160);
      bgLayer.rect(0, 0, bgLayer.width, bgLayer.height);
      bgLayer.textAlign(p.CENTER, p.CENTER);
      const px = d.lightPos.x;
      const py = d.lightPos.y;
      for (let i = 0; i < d.containerRects.length; i += 1) {
        const c = d.containerRects[i]!;
        const label = d.cellLabels[c.id] ?? c.id;

        // Hover proximity: edge -> center ramp (same signal as keyLight/envReflection).
        const dMax = Math.min(c.w, c.h) * 0.5;
        const dSigned = signedDepthToCell(px, py, c);
        const hoverT = dMax > 1e-6 ? smoothstep(0, dMax, Math.max(dSigned, 0)) : 1;
        const labelAlpha = Math.min(LABEL_BASE_ALPHA + Math.round(hoverT * LABEL_HOVER_ALPHA_BOOST), 255);

        const sizeMul = labelScaleMulForCell(d, c.id);

        bgLayer.textSize(LABEL_BASE_SIZE * sizeMul);
        bgLayer.fill(234, 244, 255, labelAlpha);
        bgLayer.text(label, c.x + c.w * 0.5, c.y + c.h * 0.5);
      }
      if (d.pointerOverSurface && cursorImg) {
        const px = d.lightPos.x;
        const py = d.lightPos.y;
        const gp = d.glassParams;
        const plateau = Math.max(0, Math.min(0.8, gp.plateau));
        const flatPow = Math.max(1, gp.flatPow);
        // Mirror the shader's dome curvature math (same dNorm/side formula as cell.frag).
        // side ≈ 1 at edge, 0 at center.
        // Center scale: 100–125% (clamped), edge scale: 200–400% (clamped), both driven by cell size.
        const CURSOR_SIZE_REF_PX = 300; // geometric-mean cell size that reads as 1×
        let cursorScale = 1.0;
        for (let i = 0; i < d.containerRects.length; i++) {
          const cr = d.containerRects[i]!;
          const dSigned = signedDepthToCell(px, py, cr);
          if (dSigned >= 0) {
            const maxInPx = Math.max(Math.min(cr.w, cr.h) * 0.5, 1);
            const dNorm = Math.min(1, Math.max(0, dSigned / maxInPx));
            const tCurv = Math.max(0, Math.min(1, (dNorm - plateau) / Math.max(1 - plateau, 1e-4)));
            const side = Math.pow(1 - tCurv, flatPow);
            const sizeMul = Math.sqrt(cr.w * cr.h) / CURSOR_SIZE_REF_PX;
            const centerScale = Math.min(1.25, Math.max(1.0, 1.5 * sizeMul));
            const edgeScale   = Math.min(4.0,  Math.max(2.0, 3.0 * sizeMul));
            cursorScale = centerScale + (edgeScale - centerScale) * side;
            break;
          }
        }
        const imgW = 44 * cursorScale;
        const imgH = Math.round(imgW * (cursorImg.height / Math.max(cursorImg.width, 1)));
        bgLayer.push();
        bgLayer.tint(255, 90);
        bgLayer.image(cursorImg, px - imgW * 0.5, py - imgH * 0.5, imgW, imgH);
        bgLayer.noTint();
        bgLayer.pop();
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
      if (!envLoadAttempted) {
        envLoadAttempted = true;
        p.loadImage(
          cubeStripUrl,
          (img) => { cubeStrip = img; },
          () => { /* Keep fallback lighting path if image load fails. */ }
        );
      }
      if (!cursorImgLoadAttempted) {
        cursorImgLoadAttempted = true;
        p.loadImage(
          cursorImgUrl,
          (img) => { cursorImg = img; },
          () => { /* Cursor reflection unavailable — silently ignore. */ }
        );
      }
    };

    p.draw = () => {
      let scene = dataRef.current;
      if (bgLayer.width !== p.width || bgLayer.height !== p.height) {
        bgLayer.resizeCanvas(p.width, p.height);
      }
      drawBackgroundLayer();
      p.background(0, 0, 0);

      if (!scene.containerRects.length) return;
      scene = dataRef.current;
      const spinDone = scene.specularSpin;
      if (
        spinDone &&
        performance.now() - spinDone.startTimeMs >= spinDone.durationMs
      ) {
        dataRef.current = { ...scene, specularSpin: null };
        scene = dataRef.current;
      }
      p.ortho(-p.width * 0.5, p.width * 0.5, -p.height * 0.5, p.height * 0.5, -1000, 1000);
      const gp = scene.glassParams;
      const [lightX, lightY] = normalize2(gp.lightDirXY[0], gp.lightDirXY[1]);
      p.shader(sh);
      sh.setUniform("uResolution", [p.width, p.height]);
      sh.setUniform("uEnvMix", cubeStrip ? 1.0 : 0.0);
      sh.setUniform("uLightDir", [lightX, lightY, gp.keyLightZ]);
      sh.setUniform("uRimPower", gp.rimPower);
      sh.setUniform("uFlatPow", gp.flatPow);
      sh.setUniform("uPlateau", gp.plateau);
      sh.setUniform("uRefractionStrength", gp.refractionStrength);
      sh.setUniform("uEdgeSoftness", gp.edgeSoftness);
      sh.setUniform("uDispersionSaturation", gp.dispersionSaturation);
      sh.setUniform("uDispersionSharpness", gp.dispersionSharpness);
      sh.setUniform("uDispersionFocus", gp.dispersionFocus);
      sh.setUniform("uBevelEnabled", gp.bevelEnabled ? 1 : 0);
      sh.setUniform("uBevelStrength", gp.bevelStrength);
      sh.setUniform("uBevelWidthPx", Math.max(0.5, gp.bevelWidthPx));
      sh.setUniform("uBevelExponent", gp.bevelExponent);
      sh.setUniform("uBoxLightEnabled", gp.boxLightEnabled ? 1 : 0);
      sh.setUniform("uBoxLightIntensity", gp.boxLightIntensity);
      sh.setUniform("uBoxLightSoftness", gp.boxLightSoftness);
      sh.setUniform("uBoxLightSize", gp.boxLightSize);
      sh.setUniform("uBoxLightPos", gp.boxLightPosXY);
      sh.setUniform("uSpecularOnly", 0);
      sh.setUniform("uGlowScale", 0.0);
      let clearRimReleaseState = false;
      let clearSpecularModulationState = false;
      for (let i = 0; i < scene.containerRects.length; i += 1) {
        const c = scene.containerRects[i]!;
        const px = scene.lightPos.x;
        const py = scene.lightPos.y;
        const pointerInCell =
          px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h;
        const dMax = Math.min(c.w, c.h) * 0.5;
        const dSigned = signedDepthToCell(px, py, c);
        const dEff = Math.max(dSigned, 0);
        const t =
          dMax > 1e-6 ? smoothstep(0, dMax, dEff) : 1;
        const keyLightIntensity = gp.keyLightIntensity * (1.0 + t * 3.0);
        sh.setUniform("uKeyLightIntensity", keyLightIntensity);
        // Match center-hover response with key light: edges keep the base env reflection,
        // center ramps to 2.0x (0.4 -> 0.8 with default settings).
        const envReflection = gp.envReflection * (1.0 + t);
        sh.setUniform("uEnvReflection", envReflection);
        let rimHoldMul = 1.0;
        if (
          scene.rimHoldPointerDown &&
          scene.rimHoldCellId === c.id &&
          scene.rimHoldStartTimeMs !== null
        ) {
          const elapsedMs = Math.max(0, performance.now() - scene.rimHoldStartTimeMs);
          rimHoldMul = 1.0 + 3.0 * smoothstep(0, 1500, elapsedMs);
        } else if (
          scene.rimReleaseCellId === c.id &&
          scene.rimReleaseStartTimeMs !== null &&
          scene.rimReleaseFromMul !== null &&
          scene.rimReleaseMode !== null
        ) {
          const releaseElapsedMs = Math.max(
            0,
            performance.now() - scene.rimReleaseStartTimeMs
          );
          if (scene.rimReleaseMode === "shortClick") {
            const rampMs = Math.max(1, scene.rimShortPulseRampMs ?? 300);
            if (releaseElapsedMs <= rampMs) {
              const trUp = Math.max(0, Math.min(1, releaseElapsedMs / rampMs));
              // Short click stage A: easeOutExpo ramp-up to 4x.
              rimHoldMul = 1.0 + 3.0 * easeOutExpo01(trUp);
            } else {
              // Short click stage B: current 1000ms easeOutExpo decay back to 1x.
              const trDown = Math.max(0, Math.min(1, (releaseElapsedMs - rampMs) / 1000));
              const e = easeOutExpo01(trDown);
              rimHoldMul = 4.0 + (1.0 - 4.0) * e;
              if (trDown >= 1.0) clearRimReleaseState = true;
            }
          } else {
            const tr = Math.max(0, Math.min(1, releaseElapsedMs / 1000));
            const e = easeOutExpo01(tr);
            rimHoldMul =
              scene.rimReleaseFromMul
              + (1.0 - scene.rimReleaseFromMul) * e;
            if (tr >= 1.0) clearRimReleaseState = true;
          }
        }
        const rimIntensity = gp.rimIntensity * rimHoldMul;
        sh.setUniform("uRimIntensity", rimIntensity);
        let specularXY: [number, number] = gp.specularLightXY;
        let specIntensityMul = 1.0;
        let specPowerMul = 1.0;
        let dispersionHueShiftMul = 1.0;
        let dispersionSpreadMul = 1.0;
        let specDispersionAmountMul = 1.0;
        const modulation = scene.specularModulation;
        if (modulation && modulation.cellId === c.id) {
          const nowMs = performance.now();
          if (nowMs <= modulation.peakTimeMs) {
            const upDen = Math.max(1, modulation.peakTimeMs - modulation.startTimeMs);
            const upT = Math.max(0, Math.min(1, (nowMs - modulation.startTimeMs) / upDen));
            specIntensityMul =
              1.0 + (modulation.peakSpecularIntensityMul - 1.0) * upT;
            specPowerMul =
              1.0 + (modulation.peakSpecularPowerMul - 1.0) * upT;
            dispersionHueShiftMul =
              1.0 + (modulation.peakDispersionHueShiftMul - 1.0) * upT;
            dispersionSpreadMul =
              1.0 + (modulation.peakDispersionSpreadMul - 1.0) * upT;
            specDispersionAmountMul =
              1.0 + (modulation.peakSpecDispersionAmountMul - 1.0) * upT;
          } else {
            const downT = Math.max(
              0,
              Math.min(1, (nowMs - modulation.peakTimeMs) / Math.max(1, modulation.decayMs))
            );
            const e = easeOutExpo01(downT);
            specIntensityMul =
              modulation.peakSpecularIntensityMul
              + (1.0 - modulation.peakSpecularIntensityMul) * e;
            specPowerMul =
              modulation.peakSpecularPowerMul
              + (1.0 - modulation.peakSpecularPowerMul) * e;
            dispersionHueShiftMul =
              modulation.peakDispersionHueShiftMul
              + (1.0 - modulation.peakDispersionHueShiftMul) * e;
            dispersionSpreadMul =
              modulation.peakDispersionSpreadMul
              + (1.0 - modulation.peakDispersionSpreadMul) * e;
            specDispersionAmountMul =
              modulation.peakSpecDispersionAmountMul
              + (1.0 - modulation.peakSpecDispersionAmountMul) * e;
            if (downT >= 1.0) clearSpecularModulationState = true;
          }
        }
        const spin = scene.specularSpin;
        if (spin && spin.cellId === c.id) {
          const elapsed = performance.now() - spin.startTimeMs;
          const tLin = Math.min(1.0, elapsed / spin.durationMs);
          const phase = expoEaseInOut01(tLin);
          const theta = phase * Math.PI * 2.0;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const sx = spin.startSpecDirX;
          const sy = spin.startSpecDirY;
          specularXY = [
            sx * cosT - sy * sinT,
            sx * sinT + sy * cosT,
          ];
        } else if (gp.specularFollowPointer) {
          if (pointerInCell) {
            const cx = c.x + c.w * 0.5;
            const cy = c.y + c.h * 0.5;
            const localX = (scene.lightPos.x - cx) / Math.max(c.w * 0.5, 1.0);
            const localY = (scene.lightPos.y - cy) / Math.max(c.h * 0.5, 1.0);
            // Negate local pointer direction so highlight motion matches pointer movement.
            specularXY = [
              -Math.max(-1.0, Math.min(1.0, localX)),
              -Math.max(-1.0, Math.min(1.0, localY)),
            ];
            lastSpecularXY.set(c.id, specularXY);
          } else {
            // Keep last pointer-driven direction; fall back to panel default only if never set.
            specularXY = lastSpecularXY.get(c.id) ?? gp.specularLightXY;
          }
        }
        const [specX, specY] = normalize2(specularXY[0], specularXY[1]);
        sh.setUniform("uSpecularPower", gp.specularPower * specPowerMul);
        sh.setUniform("uSpecularIntensity", gp.specularIntensity * specIntensityMul);
        sh.setUniform("uSpecularLightDir", [specX, specY, 0.85]);
        sh.setUniform("uDispersionHueShift", gp.dispersionHueShift * dispersionHueShiftMul);
        sh.setUniform("uDispersionSpread", gp.dispersionSpread * dispersionSpreadMul);
        sh.setUniform("uSpecDispersionAmount", gp.specDispersionAmount * specDispersionAmountMul);
        sh.setUniform("uCellRect", [c.x, c.y, c.w, c.h]);
        // p5 calls fillShader.unbindShader() after every retained draw, which resets all sampler
        // uniforms to an empty texture (see p5.Shader.unbindTextures). Re-bind per cell so every
        // p.plane() pass actually samples bgLayer / cubeStrip instead of the empty fallback.
        sh.setUniform("uBackground", bgLayer);
        sh.setUniform("uCubeStrip", cubeStrip ?? bgLayer);
        p.push();
        p.translate(
          c.x + c.w * 0.5 - p.width * 0.5,
          c.y + c.h * 0.5 - p.height * 0.5,
          0
        );
        p.plane(c.w, c.h);
        p.pop();
      }
      if (clearRimReleaseState || clearSpecularModulationState) {
        dataRef.current = {
          ...scene,
          ...(clearRimReleaseState
            ? {
              rimReleaseCellId: null,
              rimReleaseStartTimeMs: null,
              rimReleaseFromMul: null,
              rimReleaseMode: null,
              rimShortPulseRampMs: null,
            }
            : {}),
          ...(clearSpecularModulationState
            ? { specularModulation: null }
            : {}),
        };
      }
      p.resetShader();

      // Additive glow pass: redraw each cell with SRC_ALPHA,ONE blend to accumulate specular light.
      // All per-frame uniforms set above survive resetShader on the shader object; only per-cell
      // values (cellRect, specDir, dispersion, specOnly flag) need re-binding.
      const gl = (p as unknown as { drawingContext: WebGLRenderingContext }).drawingContext;
      p.shader(sh);
      sh.setUniform("uSpecularOnly", 1);
      sh.setUniform("uGlowScale", 0.6);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      for (let i = 0; i < scene.containerRects.length; i += 1) {
        const c = scene.containerRects[i]!;
        sh.setUniform("uCellRect", [c.x, c.y, c.w, c.h]);
        sh.setUniform("uBackground", bgLayer);
        sh.setUniform("uCubeStrip", cubeStrip ?? bgLayer);
        // Reuse last-computed specular direction for this cell.
        const lastXY = lastSpecularXY.get(c.id) ?? gp.specularLightXY;
        const [specX, specY] = normalize2(lastXY[0], lastXY[1]);
        sh.setUniform("uSpecularLightDir", [specX, specY, 0.85]);
        p.push();
        p.translate(
          c.x + c.w * 0.5 - p.width * 0.5,
          c.y + c.h * 0.5 - p.height * 0.5,
          0
        );
        p.plane(c.w, c.h);
        p.pop();
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      p.resetShader();
    };
  };
}
