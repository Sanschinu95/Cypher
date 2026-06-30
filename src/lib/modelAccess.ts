import type { BehavioralFeatures } from '@/lib/behavioralAuth';

const STORAGE_KEY = 'behavioralAuth';

export const FEATURE_KEYS: (keyof BehavioralFeatures)[] = [
  'meanKeystrokeDwell',
  'meanFlightTime',
  'meanMouseTrajectory',
  'keystrokeRhythm',
  'typingSpeed',
  'backspaceRate',
  'mousePauseCount',
  'touchPressureMean',
];

export const FEATURE_LABELS: Record<keyof BehavioralFeatures, string> = {
  meanKeystrokeDwell: 'Dwell time',
  meanFlightTime: 'Flight time',
  meanMouseTrajectory: 'Mouse trajectory',
  keystrokeRhythm: 'Keystroke rhythm',
  typingSpeed: 'Typing speed',
  backspaceRate: 'Backspace rate',
  mousePauseCount: 'Mouse pauses',
  touchPressureMean: 'Touch pressure',
};

export const FEATURE_UNITS: Partial<Record<keyof BehavioralFeatures, string>> = {
  meanKeystrokeDwell: 'ms',
  meanFlightTime: 'ms',
  typingSpeed: 'cpm',
};

export interface StoredModel {
  trainingData: BehavioralFeatures[];
  meanFeatures: BehavioralFeatures | null;
  varianceFeatures: BehavioralFeatures | null;
  isTrained: boolean;
}

export const readStoredModel = (): StoredModel | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredModel;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      trainingData: Array.isArray(parsed.trainingData) ? parsed.trainingData : [],
      meanFeatures: parsed.meanFeatures ?? null,
      varianceFeatures: parsed.varianceFeatures ?? null,
      isTrained: Boolean(parsed.isTrained),
    };
  } catch {
    return null;
  }
};

export const zScore = (
  value: number | undefined,
  mean: number | undefined,
  variance: number | undefined
): number | null => {
  if (
    value === undefined ||
    mean === undefined ||
    variance === undefined ||
    !Number.isFinite(value) ||
    !Number.isFinite(mean) ||
    !Number.isFinite(variance) ||
    variance <= 0
  ) {
    return null;
  }
  return Math.abs(value - mean) / Math.sqrt(variance);
};

export const gaussianPDF = (x: number, mean: number, variance: number): number => {
  if (variance <= 0) return 0;
  const coeff = 1 / Math.sqrt(2 * Math.PI * variance);
  const exponent = -Math.pow(x - mean, 2) / (2 * variance);
  return coeff * Math.exp(exponent);
};

export const buildGaussianCurve = (
  mean: number,
  variance: number,
  points = 60
): Array<{ x: number; y: number }> => {
  if (variance <= 0) return [];
  const sigma = Math.sqrt(variance);
  const start = mean - 4 * sigma;
  const end = mean + 4 * sigma;
  const step = (end - start) / (points - 1);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points; i++) {
    const x = start + step * i;
    out.push({ x, y: gaussianPDF(x, mean, variance) });
  }
  return out;
};
