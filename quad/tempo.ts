/** BPM ↔ intervalMs（四分音符 = 一周期） */

export const DEFAULT_BPM = 100;
export const MIN_BPM = 40;
export const MAX_BPM = 240;

export function bpmFromIntervalMs(intervalMs: number): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return DEFAULT_BPM;
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(60_000 / intervalMs)));
}

export function intervalMsFromBpm(bpm: number): number {
  const safe = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
  return Math.round(60_000 / safe);
}

/** UI 音量 10–200 ↔ 内部 velocity（可 >1，MIDI 发送时 clamp 到 127） */
export const MIN_VOLUME = 10;
export const MAX_VOLUME = 200;

export function volumeFromVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 100;
  return Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, Math.round(velocity * 127)));
}

export function velocityFromVolume(volume: number): number {
  const safe = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, Math.round(volume)));
  return safe / 127;
}

export function midiVelocityFromPadVelocity(velocity: number): number {
  return Math.max(1, Math.min(127, Math.round(velocity * 127)));
}
