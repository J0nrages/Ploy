import type { Color, Mode } from "@ploy/rules";

export type BoardCameraPosition = readonly [number, number, number];

const CAMERA_HEIGHT = 12.5;
const CAMERA_DISTANCE = 12.5;
const CORNER_OFFSET = CAMERA_DISTANCE / Math.sqrt(2);

const TWO_PLAYER_POSITIONS: Record<Color, BoardCameraPosition> = {
  green: [0, CAMERA_HEIGHT, CAMERA_DISTANCE],
  coral: [0, CAMERA_HEIGHT, -CAMERA_DISTANCE],
  blue: [CAMERA_DISTANCE, CAMERA_HEIGHT, 0],
  yellow: [-CAMERA_DISTANCE, CAMERA_HEIGHT, 0],
};

const FOUR_PLAYER_FFA_POSITIONS: Record<Color, BoardCameraPosition> = {
  green: [-CORNER_OFFSET, CAMERA_HEIGHT, CORNER_OFFSET],
  coral: [-CORNER_OFFSET, CAMERA_HEIGHT, -CORNER_OFFSET],
  blue: [CORNER_OFFSET, CAMERA_HEIGHT, CORNER_OFFSET],
  yellow: [CORNER_OFFSET, CAMERA_HEIGHT, -CORNER_OFFSET],
};

const PARTNERSHIP_POSITIONS: Record<Color, BoardCameraPosition> = {
  green: [-CORNER_OFFSET, CAMERA_HEIGHT, CORNER_OFFSET],
  coral: [-CORNER_OFFSET, CAMERA_HEIGHT, -CORNER_OFFSET],
  blue: [CORNER_OFFSET, CAMERA_HEIGHT, -CORNER_OFFSET],
  yellow: [CORNER_OFFSET, CAMERA_HEIGHT, CORNER_OFFSET],
};

export function cameraPositionForColor(
  mode: Mode,
  color: Color | null | undefined,
): BoardCameraPosition {
  const perspective = color ?? "green";
  if (mode === "fourPlayerFfa") {
    return FOUR_PLAYER_FFA_POSITIONS[perspective];
  }
  if (mode === "partnership") {
    return PARTNERSHIP_POSITIONS[perspective];
  }
  return TWO_PLAYER_POSITIONS[perspective];
}
