export interface QuadMidiOutput {
  send(data: number[] | Uint8Array, timestamp?: number): void;
  clear?(): void;
}

interface ActiveVoice {
  slotId: string;
  voiceId: string;
  note: number;
  channel: number;
}

export class QuadMidiBus {
  private readonly output: QuadMidiOutput | null;
  private readonly defaultChannel: number;
  private readonly voices = new Map<string, ActiveVoice>();
  /** note+channel → refcount */
  private readonly noteRefCounts = new Map<string, number>();
  private readonly noteOnTimes = new Map<string, number>();

  constructor(output: QuadMidiOutput | null, channel = 0) {
    this.output = output;
    this.defaultChannel = clampInteger(channel, 0, 15);
  }

  /**
   * @param channelOverride MIDI channel 0–15；缺省用构造时的 defaultChannel
   * @param timestamp DOMHighResTimeStamp（performance.now 域），用于提前排程
   */
  trigger(
    slotId: string,
    voiceId: string,
    note: number,
    velocity: number,
    channelOverride?: number,
    timestamp?: number,
  ): boolean {
    if (!Number.isFinite(note) || !Number.isFinite(velocity)) return false;
    if (!this.output) return false;
    const channel = channelOverride === undefined
      ? this.defaultChannel
      : clampInteger(channelOverride, 0, 15);
    const safeNote = clampInteger(note, 0, 127);
    const safeVelocity = clampInteger(velocity, 1, 127);
    const key = voiceKey(slotId, voiceId);
    const previous = this.voices.get(key);
    if (previous && (previous.note !== safeNote || previous.channel !== channel)) {
      this.releaseVoice(slotId, voiceId);
    }
    try {
      const nk = noteChannelKey(channel, safeNote);
      // MIDI 1.0 has no voice IDs: close the physical key before retriggering
      // while retaining logical ownership for overlapping canvas nodes.
      const onAt = Math.max(Number.isFinite(timestamp) ? timestamp! : 0, this.noteOnTimes.get(nk) ?? 0);
      if (this.noteRefCounts.has(nk)) {
        this.output.send([0x80 | channel, safeNote, 0], onAt || undefined);
      }
      if (Number.isFinite(timestamp)) {
        this.output.send([0x90 | channel, safeNote, safeVelocity], onAt);
      } else {
        this.output.send([0x90 | channel, safeNote, safeVelocity]);
      }
      this.noteOnTimes.set(nk, onAt);
      if (!this.voices.has(key)) {
        const nk = noteChannelKey(channel, safeNote);
        this.noteRefCounts.set(nk, (this.noteRefCounts.get(nk) ?? 0) + 1);
      }
      this.voices.set(key, { slotId, voiceId, note: safeNote, channel });
      return true;
    } catch {
      this.clearLedger();
      return false;
    }
  }

  releaseVoice(slotId: string, voiceId: string, timestamp?: number): boolean {
    const key = voiceKey(slotId, voiceId);
    const voice = this.voices.get(key);
    if (!voice) return false;
    this.voices.delete(key);
    const nk = noteChannelKey(voice.channel, voice.note);
    const remaining = Math.max(0, (this.noteRefCounts.get(nk) ?? 1) - 1);
    if (remaining > 0) {
      this.noteRefCounts.set(nk, remaining);
      return true;
    }
    this.noteRefCounts.delete(nk);
    // A single-pad stop must not clear another pad's port-wide queue.
    // Order its final Note Off no earlier than its last queued Note On.
    const offAt = Math.max(Number.isFinite(timestamp) ? timestamp! : 0, this.noteOnTimes.get(nk) ?? 0);
    this.noteOnTimes.delete(nk);
    if (!this.output) return false;
    try {
      if (offAt > 0) {
        this.output.send([0x80 | voice.channel, voice.note, 0], offAt);
      } else {
        this.output.send([0x80 | voice.channel, voice.note, 0]);
      }
      return true;
    } catch {
      this.clearLedger();
      return false;
    }
  }

  releaseSlot(slotId: string): number {
    const ownedVoices = [...this.voices.values()]
      .filter((voice) => voice.slotId === slotId);
    for (const voice of ownedVoices) {
      this.releaseVoice(slotId, voice.voiceId);
    }
    return ownedVoices.length;
  }

  masterPanic(): void {
    if (this.output) {
      try { this.output.clear?.(); } catch { /* Still attempt note releases. */ }
      for (const key of this.noteRefCounts.keys()) {
        const [channel, note] = key.split(':').map(Number);
        try { this.output.send([0x80 | channel, note, 0]); } catch { /* Best effort. */ }
      }
      for (let ch = 0; ch < 16; ch += 1) {
        for (const controller of [64, 120, 123]) {
          try {
            this.output.send([0xb0 | ch, controller, 0]);
          } catch {
            // Best effort: continue silencing every channel and always clear local state.
          }
        }
      }
    }
    this.clearLedger();
  }

  private clearLedger(): void {
    this.voices.clear();
    this.noteRefCounts.clear();
    this.noteOnTimes.clear();
  }
}

function voiceKey(slotId: string, voiceId: string): string {
  return `${slotId}::${voiceId}`;
}

function noteChannelKey(channel: number, note: number): string {
  return `${channel}:${note}`;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
