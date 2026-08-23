import { STRENGTHS, type Strength } from "@ploy/ai";

export type AdaptiveStrengthSettings = {
  enabled: boolean;
  minimum: Strength;
  maximum: Strength;
  baseStrength: Strength;
};

export type AdaptiveSample = {
  ply: number;
  depth: number;
  scoreLoss: number;
  legalMoveCount: number;
  fallback: "none" | "static";
};

export type AdaptiveStrengthState = {
  strength: Strength;
  qualifyingMoves: number;
  adjustments: number;
  lastAdjustment: "up" | "down" | null;
  adjustmentReason: "consistent-play" | "repeated-mistakes" | null;
  evidenceCount: number;
  rollingAverageLoss: number | null;
  cooldownRemaining: number;
  confidence: "disabled" | "insufficient" | "building" | "ready" | "cooldown";
};

export const ADAPTIVE_OPENING_PLIES = 8;
export const ADAPTIVE_MIN_LEGAL_MOVES = 3;
export const ADAPTIVE_EVIDENCE_WINDOW = 4;
export const ADAPTIVE_COOLDOWN_MOVES = 4;

export function createAdaptiveStrengthSettings(
  baseStrength: Strength,
): AdaptiveStrengthSettings {
  return {
    enabled: false,
    minimum: "cadet",
    maximum: "strategist",
    baseStrength,
  };
}

export function strengthIndex(strength: Strength): number {
  return STRENGTHS.indexOf(strength);
}

export function clampStrength(
  strength: Strength,
  minimum: Strength,
  maximum: Strength,
): Strength {
  const low = Math.min(strengthIndex(minimum), strengthIndex(maximum));
  const high = Math.max(strengthIndex(minimum), strengthIndex(maximum));
  return STRENGTHS[Math.min(high, Math.max(low, strengthIndex(strength)))] ?? strength;
}

export function isQualifyingAdaptiveSample(sample: AdaptiveSample): boolean {
  return (
    sample.ply >= ADAPTIVE_OPENING_PLIES &&
    sample.legalMoveCount >= ADAPTIVE_MIN_LEGAL_MOVES &&
    sample.depth >= 1 &&
    sample.fallback === "none" &&
    Number.isFinite(sample.scoreLoss) &&
    sample.scoreLoss >= 0
  );
}

export function appendAdaptiveSample(
  samples: AdaptiveSample[],
  sample: AdaptiveSample,
): AdaptiveSample[] {
  return [...samples.filter((item) => item.ply !== sample.ply), sample].sort(
    (left, right) => left.ply - right.ply,
  );
}

export function trimAdaptiveSamples(
  samples: AdaptiveSample[],
  snapshotPly: number,
): AdaptiveSample[] {
  return samples.filter((sample) => sample.ply < snapshotPly);
}

export function deriveAdaptiveStrength(
  settings: AdaptiveStrengthSettings,
  samples: AdaptiveSample[],
): AdaptiveStrengthState {
  const minimumIndex = Math.min(
    strengthIndex(settings.minimum),
    strengthIndex(settings.maximum),
  );
  const maximumIndex = Math.max(
    strengthIndex(settings.minimum),
    strengthIndex(settings.maximum),
  );
  let current = Math.min(
    maximumIndex,
    Math.max(minimumIndex, strengthIndex(settings.baseStrength)),
  );
  if (!settings.enabled) {
    return {
      strength: STRENGTHS[current] ?? settings.baseStrength,
      qualifyingMoves: 0,
      adjustments: 0,
      lastAdjustment: null,
      adjustmentReason: null,
      evidenceCount: 0,
      rollingAverageLoss: null,
      cooldownRemaining: 0,
      confidence: "disabled",
    };
  }
  let cooldown = 0;
  let adjustments = 0;
  let lastAdjustment: "up" | "down" | null = null;
  let adjustmentReason: "consistent-play" | "repeated-mistakes" | null = null;
  let evidence: AdaptiveSample[] = [];
  const qualifying = samples.filter(isQualifyingAdaptiveSample);

  for (const sample of qualifying) {
    if (cooldown > 0) {
      cooldown -= 1;
      continue;
    }
    evidence = [...evidence.slice(-(ADAPTIVE_EVIDENCE_WINDOW - 1)), sample];
    if (evidence.length < ADAPTIVE_EVIDENCE_WINDOW) {
      continue;
    }

    const averageLoss =
      evidence.reduce((total, item) => total + item.scoreLoss, 0) / evidence.length;
    const strongestLoss = Math.max(...evidence.map((item) => item.scoreLoss));
    const severeMistakes = evidence.filter((item) => item.scoreLoss >= 100).length;
    const shouldIncrease = averageLoss <= 24 && strongestLoss <= 60;
    const shouldDecrease = averageLoss >= 110 && severeMistakes >= 2;

    if (shouldIncrease && current < maximumIndex) {
      current += 1;
      adjustments += 1;
      lastAdjustment = "up";
      adjustmentReason = "consistent-play";
    } else if (shouldDecrease && current > minimumIndex) {
      current -= 1;
      adjustments += 1;
      lastAdjustment = "down";
      adjustmentReason = "repeated-mistakes";
    } else {
      continue;
    }

    evidence = [];
    cooldown = ADAPTIVE_COOLDOWN_MOVES;
  }

  const rollingAverageLoss = evidence.length
    ? evidence.reduce((total, item) => total + item.scoreLoss, 0) / evidence.length
    : null;
  const confidence = cooldown > 0
    ? "cooldown"
    : evidence.length >= ADAPTIVE_EVIDENCE_WINDOW
      ? "ready"
      : evidence.length > 0
        ? "building"
        : "insufficient";

  return {
    strength: STRENGTHS[current] ?? settings.baseStrength,
    qualifyingMoves: qualifying.length,
    adjustments,
    lastAdjustment,
    adjustmentReason,
    evidenceCount: evidence.length,
    rollingAverageLoss,
    cooldownRemaining: cooldown,
    confidence,
  };
}
