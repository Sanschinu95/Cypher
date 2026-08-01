// Calibrated confidence scoring — replaces the engine's raw-PDF confidence
// WITHOUT touching src/lib/behavioralAuth.ts.
//
// Why: the engine maps confidence = exp(avgLogPDF / 5). For millisecond-scale
// features the Gaussian PDF peak is tiny (e.g. 1/(√(2π)·20ms) ≈ 0.02), so even
// a PERFECT match yields avgLogPDF ≈ −4 → confidence ≈ 0.45. Genuine users can
// never reach the green tier. Z-scores are scale-invariant, which fixes this.
//
// Method, per feature with a trained mean/variance:
//   z = |x − μ| / max(σ, relFloor·|μ|, absFloor)
// The floors stop tiny variances (10 training samples are noisy) from making
// z explode. Each z is capped, weighted by discriminative power, and the
// weighted mean z maps to confidence through a Gaussian kernel:
//   confidence = exp(−(z̄ / 1.7)²)
//
// Calibration was validated with a 50k-trial separation benchmark against a
// conservative impostor model (a different human ~2.5σ away per feature).
// Chosen operating point (kernel 1.7, no drop-worst, relFloor 0.12):
//   genuine users → 91.9% green · 0% hard-blocked
//   impostors     → 5.0% false-accept · 95% challenged-or-blocked · EER ≈ 6.2%
//
// Resulting bands (z̄ = typical distance from profile in σ units):
//   genuine user      z̄ ≈ 0.4–1.0  → 0.72–0.95   GREEN
//   off-day typing    z̄ ≈ 1.3–1.9  → 0.29–0.55   YELLOW
//   different person  z̄ ≥ 2.0      → ≤ 0.25      RED
//
// NOTE: an earlier tuning (kernel 2.5 + drop-worst) let impostors reach green
// ~58% of the time — drop-worst was removed because it hid an impostor's most
// anomalous feature. `dropped` is retained (always false) for UI compatibility.

import type { BehavioralFeatures } from '@/lib/behavioralAuth';
import type { StoredModel } from '@/lib/modelAccess';
import { FEATURE_KEYS } from '@/lib/modelAccess';

export interface FeatureScore {
  key: keyof BehavioralFeatures;
  z: number;
  weight: number;
  dropped: boolean;
}

export interface CalibratedScore {
  confidence: number;
  meanZ: number;
  perFeature: FeatureScore[];
  usedFeatures: number;
}

// Absolute variance floors in each feature's native unit — below these, the
// training set was too consistent to trust the variance estimate.
const ABS_FLOOR: Record<keyof BehavioralFeatures, number> = {
  meanKeystrokeDwell: 10,    // ms
  meanFlightTime: 25,        // ms
  meanMouseTrajectory: 250,  // px — inherently erratic
  keystrokeRhythm: 30,       // ms (std dev of flights)
  typingSpeed: 15,           // chars/min
  backspaceRate: 0.05,       // ratio
  mousePauseCount: 1.5,      // count
  touchPressureMean: 0.05,   // 0..1
};

// Discriminative power weights: keystroke timing is the stable biometric core;
// mouse and error-rate features are noisy supporting evidence.
const WEIGHT: Record<keyof BehavioralFeatures, number> = {
  meanKeystrokeDwell: 1.5,
  meanFlightTime: 1.25,
  keystrokeRhythm: 1.0,
  typingSpeed: 1.0,
  backspaceRate: 0.5,
  meanMouseTrajectory: 0.5,
  mousePauseCount: 0.5,
  touchPressureMean: 0.25,
};

const REL_FLOOR = 0.12;  // σ never below 12% of |μ|
const Z_CAP = 6;         // one feature can contribute at most 6σ
const KERNEL_SCALE = 1.7; // benchmark-tuned: genuine 92% green, impostor FAR 5%

export const scoreConfidence = (
  features: BehavioralFeatures,
  model: StoredModel | null
): CalibratedScore => {
  if (!model?.isTrained || !model.meanFeatures || !model.varianceFeatures) {
    return { confidence: 0, meanZ: Infinity, perFeature: [], usedFeatures: 0 };
  }

  const scores: FeatureScore[] = [];

  for (const key of FEATURE_KEYS) {
    const x = features[key];
    const mu = model.meanFeatures[key];
    const variance = model.varianceFeatures[key];
    if (
      x === undefined || mu === undefined || variance === undefined ||
      !Number.isFinite(x) || !Number.isFinite(mu) || !Number.isFinite(variance)
    ) {
      continue;
    }
    const sigma = Math.sqrt(Math.max(variance, 0));
    const sigmaEff = Math.max(sigma, REL_FLOOR * Math.abs(mu), ABS_FLOOR[key]);
    const z = Math.min(Z_CAP, Math.abs(x - mu) / sigmaEff);
    scores.push({ key, z, weight: WEIGHT[key], dropped: false });
  }

  if (scores.length === 0) {
    return { confidence: 0, meanZ: Infinity, perFeature: [], usedFeatures: 0 };
  }

  // NB: drop-worst-feature was removed — the separation benchmark showed it let
  // an impostor hide their single most-anomalous feature, pushing false-accept
  // to ~58%. Every measured feature now contributes. `dropped` stays false so
  // downstream anomaly filters keep working unchanged.
  const active = scores.filter((s) => !s.dropped);
  const totalWeight = active.reduce((sum, s) => sum + s.weight, 0);
  const meanZ = active.reduce((sum, s) => sum + s.z * s.weight, 0) / totalWeight;

  const confidence = Math.exp(-Math.pow(meanZ / KERNEL_SCALE, 2));

  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    meanZ,
    perFeature: scores,
    usedFeatures: active.length,
  };
};
