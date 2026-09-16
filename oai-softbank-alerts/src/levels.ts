import { CONVERGE_PP, LOWER_PP, UPPER_PP } from "./config.ts";

export interface AlertLevel {
  id: "upper" | "mid" | "lower";
  y: number;
  title: string;
  action: string;
}

export const LEVELS: AlertLevel[] = [
  {
    id: "upper",
    y: UPPER_PP,
    title: "+18",
    action: "SHORT OAI / LONG SoftBank",
  },
  {
    id: "mid",
    y: CONVERGE_PP,
    title: "+8",
    action: "FLATTEN — converge",
  },
  {
    id: "lower",
    y: LOWER_PP,
    title: "-2",
    action: "LONG OAI / SHORT SoftBank",
  },
];

export type Armed = Record<AlertLevel["id"], boolean>;

export function freshArmed(): Armed {
  return { upper: true, mid: true, lower: true };
}

/** Fire when the print moves onto or through a level, then re-arm after hysteresis. */
export function crossedLevels(
  prev: number | null,
  curr: number,
  armed: Armed,
  hysteresisPp: number,
): AlertLevel[] {
  const hits: AlertLevel[] = [];
  for (const level of LEVELS) {
    const dist = Math.abs(curr - level.y);
    if (!armed[level.id]) {
      if (dist >= hysteresisPp) armed[level.id] = true;
      continue;
    }
    if (prev == null) continue;
    const prevSide = Math.sign(prev - level.y);
    const currSide = Math.sign(curr - level.y);
    if (prevSide === currSide) continue;
    hits.push(level);
    armed[level.id] = false;
  }
  return hits;
}
