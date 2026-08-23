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
  expect(deriveAdaptiveStrength(settings, [0, 2, 4].map((ply) => sample(ply, 10))).strength)
    .toBe("navigator");
  expect(
    deriveAdaptiveStrength(settings, [0, 2, 4, 6].map((ply) => sample(ply, 10))).strength,
  ).toBe("commander");
});

test("large repeated losses lower one level and bounds are respected", () => {
  const settings = {
    ...createAdaptiveStrengthSettings("commander"),
    enabled: true,
    minimum: "navigator" as const,
  };
  const struggling = [0, 2, 4, 6].map((ply) => sample(ply, 140));
  expect(deriveAdaptiveStrength(settings, struggling).strength).toBe("navigator");
  expect(deriveAdaptiveStrength(settings, [...struggling, ...[8, 10, 12, 14].map((ply) => sample(ply, 180))]).strength)
    .toBe("navigator");
});

test("cooldown prevents rapid oscillation after an adjustment", () => {
  const settings = { ...createAdaptiveStrengthSettings("navigator"), enabled: true };
  const strong = [0, 2, 4, 6].map((ply) => sample(ply, 5));
  const immediateLosses = [8, 10, 12, 14].map((ply) => sample(ply, 180));
  expect(deriveAdaptiveStrength(settings, [...strong, ...immediateLosses]).strength).toBe(
    "commander",
  );
});

test("forced moves and incomplete analysis never influence strength", () => {
  const forced = { ...sample(0, 500), legalMoveCount: 1 };
  const incomplete = { ...sample(2, 500), depth: 0, fallback: "static" as const };
  expect(isQualifyingAdaptiveSample(forced)).toBe(false);
  expect(isQualifyingAdaptiveSample(incomplete)).toBe(false);
  const settings = { ...createAdaptiveStrengthSettings("commander"), enabled: true };
  expect(deriveAdaptiveStrength(settings, [forced, incomplete]).strength).toBe("commander");
});

test("samples are unique by ply and undo rebuilds adaptive strength", () => {
  let samples: AdaptiveSample[] = [];
  for (const ply of [0, 2, 4, 6]) {
    samples = appendAdaptiveSample(samples, sample(ply, 8));
  }
  samples = appendAdaptiveSample(samples, sample(6, 4));
  expect(samples).toHaveLength(4);
  const settings = { ...createAdaptiveStrengthSettings("navigator"), enabled: true };
  expect(deriveAdaptiveStrength(settings, samples).strength).toBe("commander");
  expect(deriveAdaptiveStrength(settings, trimAdaptiveSamples(samples, 6)).strength).toBe(
    "navigator",
  );
});
