import { expect, test } from "bun:test";
import {
  appendAdaptiveSample,
  createAdaptiveStrengthSettings,
  deriveAdaptiveStrength,
  isQualifyingAdaptiveSample,
  trimAdaptiveSamples,
  type AdaptiveSample,
} from "./adaptiveStrength";

function sample(ply: number, scoreLoss: number): AdaptiveSample {
  return {
    ply,
    scoreLoss,
    depth: 2,
    legalMoveCount: 8,
    fallback: "none",
  };
}

test("adaptive strength requires four consistently strong qualifying moves", () => {
  const settings = { ...createAdaptiveStrengthSettings("navigator"), enabled: true };
  const building = deriveAdaptiveStrength(
    settings,
    [8, 10, 12].map((ply) => sample(ply, 10)),
  );
  expect(building.strength).toBe("navigator");
  expect(building.confidence).toBe("building");
  expect(building.rollingAverageLoss).toBe(10);
  const adjusted = deriveAdaptiveStrength(
    settings,
    [8, 10, 12, 14].map((ply) => sample(ply, 10)),
  );
  expect(adjusted.strength).toBe("commander");
  expect(adjusted.adjustmentReason).toBe("consistent-play");
  expect(adjusted.cooldownRemaining).toBe(4);
});

test("large repeated losses lower one level and bounds are respected", () => {
  const settings = {
    ...createAdaptiveStrengthSettings("commander"),
    enabled: true,
    minimum: "navigator" as const,
  };
  const struggling = [8, 10, 12, 14].map((ply) => sample(ply, 140));
  expect(deriveAdaptiveStrength(settings, struggling).strength).toBe("navigator");
  expect(deriveAdaptiveStrength(settings, [...struggling, ...[16, 18, 20, 22].map((ply) => sample(ply, 180))]).strength)
    .toBe("navigator");
});

test("cooldown prevents rapid oscillation after an adjustment", () => {
  const settings = { ...createAdaptiveStrengthSettings("navigator"), enabled: true };
  const strong = [8, 10, 12, 14].map((ply) => sample(ply, 5));
  const immediateLosses = [16, 18, 20, 22].map((ply) => sample(ply, 180));
  const cooling = deriveAdaptiveStrength(settings, [...strong, ...immediateLosses.slice(0, 2)]);
  expect(cooling.confidence).toBe("cooldown");
  expect(cooling.cooldownRemaining).toBe(2);
  expect(deriveAdaptiveStrength(settings, [...strong, ...immediateLosses]).strength).toBe(
    "commander",
  );
  const postCooldownLosses = [24, 26, 28, 30].map((ply) => sample(ply, 180));
  expect(
    deriveAdaptiveStrength(settings, [
      ...strong,
      ...immediateLosses,
      ...postCooldownLosses,
    ]).strength,
  ).toBe("navigator");
});

test("forced moves and incomplete analysis never influence strength", () => {
  const forced = { ...sample(8, 500), legalMoveCount: 1 };
  const lowChoice = { ...sample(10, 500), legalMoveCount: 2 };
  const incomplete = { ...sample(12, 500), depth: 0, fallback: "static" as const };
  const opening = sample(6, 500);
  expect(isQualifyingAdaptiveSample(forced)).toBe(false);
  expect(isQualifyingAdaptiveSample(lowChoice)).toBe(false);
  expect(isQualifyingAdaptiveSample(incomplete)).toBe(false);
  expect(isQualifyingAdaptiveSample(opening)).toBe(false);
  const settings = { ...createAdaptiveStrengthSettings("commander"), enabled: true };
  expect(deriveAdaptiveStrength(settings, [forced, lowChoice, incomplete, opening]).strength)
    .toBe("commander");
});

test("samples are unique by ply and undo rebuilds adaptive strength", () => {
  let samples: AdaptiveSample[] = [];
  for (const ply of [8, 10, 12, 14]) {
    samples = appendAdaptiveSample(samples, sample(ply, 8));
  }
  samples = appendAdaptiveSample(samples, sample(14, 4));
  expect(samples).toHaveLength(4);
  const settings = { ...createAdaptiveStrengthSettings("navigator"), enabled: true };
  expect(deriveAdaptiveStrength(settings, samples).strength).toBe("commander");
  expect(deriveAdaptiveStrength(settings, trimAdaptiveSamples(samples, 14)).strength).toBe(
    "navigator",
  );
});
