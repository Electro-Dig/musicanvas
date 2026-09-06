export interface QuadMidiOutput {
  send(data: number[] | Uint8Array, timestamp?: number): void;
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
      if (Number.isFinite(timestamp)) {
        this.output.send([0x90 | channel, safeNote, safeVelocity], timestamp);
      } else {
        this.output.send([0x90 | channel, safeNote, safeVelocity]);
      }
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
    if (!this.output) return false;
    try {
      if (Number.isFinite(timestamp)) {
        this.output.send([0x80 | voice.channel, voice.note, 0], timestamp);
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
      for (let ch = 0; ch < 16; ch += 1) {
        for (const controller of [120, 123]) {
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
