import { getSoundPresetById, type SoundPreset } from './soundPresets';
import { OpenDx7Engine } from './openDx7';

interface SynthVoice {
  gain: GainNode;
  sources: OscillatorNode[];
}

export class QuadSynthEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private isMuted: boolean = false;
  private fm: OpenDx7Engine | null = null;
  private voices = new Map<string, Set<SynthVoice>>();

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;

      this.ctx = new AudioContextClass();

      // Master limiter compressor to prevent clipping
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-3, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(4, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
      this.fm = new OpenDx7Engine(this.ctx, this.masterGain);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public ensureRunning(): void {
    if (typeof window === 'undefined') return;
    this.initContext();
    void this.fm?.prepare().catch(error=>console.error('FM engine loading failed',error));
  }

  public stopTrack(track: string): void {
    this.fm?.stop(track);
    const voices = this.voices.get(track);
    if (!voices || !this.ctx) return;
    this.voices.delete(track);
    const now = this.ctx.currentTime;
    for (const voice of voices) {
      // A short fade avoids a discontinuity, including future scheduled notes.
      const gain = voice.gain.gain;
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
      else { gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); }
      gain.linearRampToValueAtTime(0, now + .01);
      for (const source of voice.sources) source.stop(now + .015);
    }
  }

  public getCurrentTime(): number | null {
    const ctx = this.ctx ?? this.initContext();
    return ctx ? ctx.currentTime : null;
  }

  public playNote(
    midiNote: number,
    velocity: number = 90, // 1 - 127
    durationSec: number = 0.35,
    presetId: string = 'grand-piano',
    /** AudioContext 绝对时间；缺省为立即（currentTime） */
    whenSec?: number,
    trackId: string = 'preview',
  ): void {
    if (typeof window === 'undefined' || this.isMuted) return;

    try {
      const ctx = this.initContext();
      if (!ctx || !this.masterGain) return;
      if(presetId.startsWith('dx7-')) {
        void this.fm?.play(trackId,presetId,midiNote,velocity,durationSec,whenSec??ctx.currentTime).catch(error=>console.error('FM playback failed',error));
        return;
      }

      const preset: SoundPreset = getSoundPresetById(presetId);
      const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
      // 迟到时钳到 now，避免排到过去导致静音或异常
      const now = Number.isFinite(whenSec) ? Math.max(ctx.currentTime, whenSec!) : ctx.currentTime;
      const velScale = Math.max(0.1, Math.min(1, velocity / 127));
      const peakGain = preset.gain * velScale;

      // Create Voice Gain Node
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(0.0001, now);

      // ADSR Envelope
      const attackTime = Math.max(0.001, preset.attack);
      const decayTime = Math.max(0.01, preset.decay);
      const sustainLevel = Math.max(0.0001, peakGain * preset.sustain);
      const releaseTime = Math.max(0.03, preset.release);

      // Attack
      voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), now + attackTime);
      // Decay to Sustain
      voiceGain.gain.exponentialRampToValueAtTime(sustainLevel, now + attackTime + decayTime);

      // Hold sustain until note duration, then release
      const noteEnd = Math.max(now + attackTime + decayTime, now + durationSec);
      voiceGain.gain.setValueAtTime(sustainLevel, noteEnd);
      voiceGain.gain.exponentialRampToValueAtTime(0.00001, noteEnd + releaseTime);

      // Filter Node
      const filter = ctx.createBiquadFilter();
      filter.type = preset.filterType;
      filter.frequency.setValueAtTime(preset.filterBase, now);
      filter.Q.value = preset.filterQ;

      // Dynamic filter sweep
      if (preset.filterType === 'lowpass') {
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(160, preset.filterBase * 0.4),
          now + attackTime + decayTime,
        );
      } else if (preset.filterType === 'bandpass') {
        filter.frequency.linearRampToValueAtTime(
          preset.filterBase * 1.2,
          now + attackTime + decayTime,
        );
      }

      // Main Oscillator
      const osc1 = ctx.createOscillator();
      osc1.type = preset.synthWave;
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(filter);

      // Secondary Oscillator (Harmonic overtone or stereo detune)
      let osc2: OscillatorNode | null = null;
      let osc2Gain: GainNode | null = null;

      if (preset.harmonicRatio) {
        // Wood/metal harmonic resonance (e.g. 4.0 for marimba, 3.0 for music box)
        osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * preset.harmonicRatio, now);
        osc2Gain = ctx.createGain();
        osc2Gain.gain.setValueAtTime(peakGain * 0.35, now);
        // Harmonics decay faster than the fundamental
        osc2Gain.gain.exponentialRampToValueAtTime(0.0001, now + attackTime + decayTime * 0.4);
        osc2.connect(osc2Gain);
        osc2Gain.connect(filter);
      } else if (preset.dualOsc) {
        osc2 = ctx.createOscillator();
        osc2.type = preset.synthWave;
        const detuneCents = preset.detune ?? 5;
        osc2.frequency.setValueAtTime(freq, now);
        osc2.detune.setValueAtTime(detuneCents, now);
        osc2.connect(filter);
      }

      // Tremolo LFO for Vibraphone
      let lfo: OscillatorNode | null = null;
      let lfoGain: GainNode | null = null;
      if (preset.tremoloRate) {
        lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(preset.tremoloRate, now);
        lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0.18, now);
        lfo.connect(lfoGain);
        lfoGain.connect(voiceGain.gain);
      }

      filter.connect(voiceGain);
      voiceGain.connect(this.masterGain);

      const stopTime = noteEnd + releaseTime + 0.05;
      const sources = [osc1, osc2, lfo].filter((source): source is OscillatorNode => source !== null);
      const voice: SynthVoice = { gain: voiceGain, sources };
      const trackVoices = this.voices.get(trackId) ?? new Set<SynthVoice>();
      trackVoices.add(voice);
      this.voices.set(trackId, trackVoices);
      let remaining = sources.length;
      const connections = [osc1, osc2, osc2Gain, lfo, lfoGain, filter, voiceGain];
      for (const source of sources) source.onended = () => {
        if (--remaining > 0) return;
        trackVoices.delete(voice);
        if (this.voices.get(trackId) === trackVoices && !trackVoices.size) this.voices.delete(trackId);
        for (const node of connections) node?.disconnect();
      };
      osc1.start(now);
      osc1.stop(stopTime);

      if (osc2) {
        osc2.start(now);
        osc2.stop(stopTime);
      }

      if (lfo) {
        lfo.start(now);
        lfo.stop(stopTime);
      }

      // onended follows the audio clock; no per-note cleanup timer is needed.
    } catch {
      // AudioContext could be suspended or unavailable in headless environments
    }
  }

  public setMasterVolume(vol: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.fm?.stopAll();
      for (const track of this.voices.keys()) this.stopTrack(track);
    }
  }
}

export const quadSynthEngine = new QuadSynthEngine();
