// OpenDX7 — FM Synthesizer (MIT License)
// Copyright (c) 2026 Keith Adler
// DX7 AudioWorklet Processor — FM synthesis engine
// Based on the YM21280 (OPS) and YM21290 (EGS) chip architecture.
// References: Ken Shirriff's die analysis, msfa/Dexed, cross-verified measurements.
// Includes MSFA-derived DSP portions under Apache-2.0 (Google Inc. and
// contributors). See NOTICE.md, LICENSE and LICENSE.Apache-2.0 in this directory.
//
// KEY ARCHITECTURE: Everything operates in the log domain until the final
// sin() lookup. Output level, envelope, velocity, and keyboard scaling are
// all combined as log-domain additions, then converted to linear amplitude.
// This is how the real chip works and is critical for correct FM timbres.

const TWO_PI = 2 * Math.PI;
const MAX_POLYPHONY = 16;

// ── Sine table ──
const SINE_TABLE_SIZE = 4096;
const sineTable = new Float64Array(SINE_TABLE_SIZE);
for (let i = 0; i < SINE_TABLE_SIZE; i++) {
  sineTable[i] = Math.sin(TWO_PI * i / SINE_TABLE_SIZE);
}

function sineLookup(phase) {
  const idx = ((phase % 1.0 + 1.0) % 1.0) * SINE_TABLE_SIZE;
  const i0 = idx | 0;
  const frac = idx - i0;
  const i1 = (i0 + 1) & (SINE_TABLE_SIZE - 1);
  return sineTable[i0 & (SINE_TABLE_SIZE - 1)] * (1 - frac) + sineTable[i1] * frac;
}

// ── Log domain constants ──
// The DX7 EGS uses a 14-bit log level internally.
// We model the DX7's internal level system.
// In Dexed/msfa, the output level goes through scaleoutlevel(), gets shifted
// left by 5, velocity is added, then combined with the envelope level.
// The final gain is Exp2::lookup(combinedLevel - 14*(1<<24)).
//
// We simplify this to a floating-point model that produces the same curve:
// - Output level 0-99 → a "total level" value
// - Envelope produces a level 0-1 (1=max)
// - Combined in log domain, converted to linear amplitude
//
// The key insight from Dexed: at output level 99 with envelope at max,
// the operator produces a gain of ~128 (in their fixed-point system).
// At level 50, gain is ~1.8. At level 0, gain is ~0.
// This exponential curve is critical for correct FM modulation depth.

// Dexed's scaleoutlevel lookup for levels 0-19
const SCALE_OUT_LEVEL_LUT = [0,5,9,13,17,20,23,25,27,29,31,33,35,37,39,41,42,43,45,46];

function scaleOutLevel(level) {
  if (level >= 20) return 28 + level;
  return SCALE_OUT_LEVEL_LUT[level];
}

// Convert DX7 output level (0-99) to the internal "outlevel" value
// matching Dexed: scaleoutlevel(level) << 5, range 0-4064
function outputLevelToOutlevel(level) {
  return scaleOutLevel(Math.min(99, Math.max(0, level))) << 5;
}

// The envelope operates on a 0-4095 log scale internally.
// Level 0 = max amplitude, 4095 = silence.
const ENV_MAX_LEVEL = 4095;

// Convert DX7 envelope parameter level (0-99) to internal target level
// Matching Dexed: actuallevel = (scaleoutlevel(egLevel) >> 1) << 6
// This gives a range of 0-4032 for the envelope component
function envParamToTarget(egLevel) {
  return (scaleOutLevel(egLevel) >> 1) << 6;
}

// Combined level to linear amplitude.
// In Dexed, the final gain = Exp2(combinedLevel - 14*(1<<24))
// where combinedLevel = (envTarget + outlevel - 4256) << 16
// We replicate this curve in floating point.
// The combinedLevel ranges from ~16 (quietest) to ~3840 (loudest).
// gain ∝ 2^(combinedLevel / 256)
// At combinedLevel 3840: gain = 2^15 = 32768 → after >>24 and sin, ≈ ±128
// At combinedLevel 0: gain ≈ 1 → after >>24, ≈ 0.00006
function combinedLevelToAmp(combinedLevel) {
  if (combinedLevel <= 16) return 0;
  // Dexed: gain = Exp2((combined<<16) - 14*(1<<24))
  // At max (combined=3840): expArg = 16777216 = 1<<24
  // Exp2(1<<24) = 2^1.0 * (1<<30) = 1<<31
  // output = sin(1<<24) * (1<<31) >> 24 = 1<<31
  // As fraction of 2^32 (full cycle): (1<<31)/(1<<32) = 0.5 cycles = π radians
  // So our float output at max should be ±0.5
  const exp = (combinedLevel - 3840) / 256.0;
  if (exp < -30) return 0;
  return 0.5 * Math.pow(2, exp);
}

// ── Velocity scaling ──
// Dexed's velocity_data lookup and ScaleVelocity function.
// Returns a TL offset (added to outlevel). Negative = louder.
const VELOCITY_DATA = [
  0,70,86,97,106,114,121,126,132,138,142,148,152,156,160,163,
  166,170,173,174,178,181,184,186,189,190,194,196,198,200,202,
  205,206,209,211,214,216,218,220,222,224,225,227,229,230,232,
  233,235,237,238,240,241,242,243,244,246,246,248,249,250,251,
  252,253,254
];

function scaleVelocity(velocity, sensitivity) {
  const clamped = Math.max(0, Math.min(127, velocity));
  const velValue = VELOCITY_DATA[clamped >> 1] - 239;
  return ((sensitivity * velValue + 7) >> 3) << 4;
}

// ── Envelope rate tables ──
// Ported from Dexed's env.cc: qrate = min(63, (rate*41)>>6 + rateScaling)
// inc = (4 + (qr&3)) << (2 + LG_N + (qr>>2))  where LG_N=6
// inc is applied per 64-sample block at 44100 Hz to a level in <<16 format.
// We convert to "log units per sample at any sample rate".
const ENV_RATE_TABLE = new Float64Array(100);
(function() {
  const LG_N = 6;
  const BLOCK_SIZE = 1 << LG_N; // 64
  const NATIVE_SR = 44100;
  for (let r = 0; r < 100; r++) {
    const qrate = Math.min(63, (r * 41) >> 6);
    const inc = (4 + (qrate & 3)) << (2 + LG_N + (qrate >> 2));
    // inc is in <<16 level units per block of 64 samples at 44100 Hz
    // Convert to level units (not <<16) per sample:
    // inc_per_sample = inc / 65536 / 64 (at 44100 Hz)
    // But we need it normalized so we can divide by actual sampleRate later.
    // Store as: level_units_per_second = inc / 65536 * (44100 / 64)
    ENV_RATE_TABLE[r] = (inc / 65536) * (NATIVE_SR / BLOCK_SIZE);
  }
})();

// Returns envelope increment in level units per sample
function envRatePerSample(rate, rateScaling, sampleRate) {
  const adjRate = Math.min(99, Math.max(0, rate));
  const qrate = Math.min(63, ((adjRate * 41) >> 6) + rateScaling);
  const LG_N = 6;
  const inc = (4 + (qrate & 3)) << (2 + LG_N + (qrate >> 2));
  // inc is per-block (64 samples) in <<16 format at 44100 Hz
  // Convert: inc / 65536 / 64 * (44100 / sampleRate)
  return (inc / 65536 / 64) * (44100 / sampleRate);
}

// ── DX7 parameter level (0-99) to envelope target ──
// Dexed: actuallevel = (scaleoutlevel(egLevel) >> 1) << 6
// This is NOT a linear mapping — it uses the scaleoutlevel lookup.
function egLevelToTarget(level) {
  return (scaleOutLevel(Math.min(99, Math.max(0, level))) >> 1) << 6;
}

// ── Envelope ──
// Exact port of Dexed's env.cc. Works in native <<16 integer format.
// Returns the raw Dexed level (int32, <<16 format) for use in gain computation.
class DX7Envelope {
  constructor() {
    this.stage = 0;
    this.level_ = 0;         // Dexed's level_ (int32, <<16 format)
    this.targetlevel_ = 0;
    this.rising_ = false;
    this.inc_ = 0;
    this.rates_ = [0, 0, 0, 0];
    this.levels_ = [0, 0, 0, 0];
    this.outlevel_ = 0;
    this.rate_scaling_ = 0;
    this.down_ = true;
    this.active = false;
    this.sr_mul = 1.0;       // sample rate correction factor
  }

  setParams(r1, r2, r3, r4, l1, l2, l3, l4) {
    this.rates_[0] = r1; this.rates_[1] = r2;
    this.rates_[2] = r3; this.rates_[3] = r4;
    this.levels_[0] = l1; this.levels_[1] = l2;
    this.levels_[2] = l3; this.levels_[3] = l4;
  }

  init(outlevel, rateScaling, sampleRate) {
    this.outlevel_ = outlevel;
    this.rate_scaling_ = rateScaling;
    this.sr_mul = 44100 / sampleRate;
    this.level_ = 0;
    this.down_ = true;
    this.active = true;
    this._advance(0);
  }

  keydown(d) {
    if (this.down_ !== d) {
      this.down_ = d;
      this._advance(d ? 0 : 3);
    }
  }

  _advance(ix) {
    this.stage = ix;
    if (ix >= 4) return;
    const nl = this.levels_[ix];
    let al = scaleOutLevel(nl) >> 1;
    al = (al << 6) + this.outlevel_ - 4256;
    al = Math.max(16, al);
    this.targetlevel_ = al << 16;
    this.rising_ = this.targetlevel_ > this.level_;
    let qr = Math.min(63, ((this.rates_[ix] * 41) >> 6) + this.rate_scaling_);
    this.inc_ = (4 + (qr & 3)) << (2 + 6 + (qr >> 2));
    this.inc_ = Math.round(this.inc_ * this.sr_mul);
  }

  // Returns Dexed's raw level_ (int32, <<16 format)
  // Called once per 64-sample block, matching Dexed's getsample()
  getsample() {
    if (this.stage < 3 || (this.stage < 4 && !this.down_)) {
      if (this.rising_) {
        const jumptarget = 1716 << 16;
        if (this.level_ < jumptarget) this.level_ = jumptarget;
        this.level_ += Math.floor(((17 << 24) - this.level_) / (1 << 24)) * this.inc_;
        if (this.level_ >= this.targetlevel_) {
          this.level_ = this.targetlevel_;
          this._advance(this.stage + 1);
        }
      } else {
        this.level_ -= this.inc_;
        if (this.level_ <= this.targetlevel_) {
          this.level_ = this.targetlevel_;
          this._advance(this.stage + 1);
        }
      }
    }
    return this.level_;
  }

  isActive() {
    return this.active && (this.stage < 4 || this.levels_[3] > 0);
  }
}

// ── Pitch Envelope ──
// Now uses the same qrate formula as the amplitude envelope for accurate rates.
class DX7PitchEnvelope {
  constructor() {
    this.stage = 0; this.level_ = 0; this.targetlevel_ = 0;
    this.rates_ = [0,0,0,0]; this.levels_ = [0,0,0,0];
    this.down_ = false; this.active = false;
    this.inc_ = 0; this.rising_ = false; this.sr_mul = 1.0;
  }
  setParams(r1,r2,r3,r4,l1,l2,l3,l4) {
    this.rates_[0]=r1; this.rates_[1]=r2; this.rates_[2]=r3; this.rates_[3]=r4;
    this.levels_[0]=l1; this.levels_[1]=l2; this.levels_[2]=l3; this.levels_[3]=l4;
  }
  init(sampleRate) {
    this.sr_mul = 44100 / sampleRate;
    this.stage = 0; this.active = true; this.down_ = false;
    // Start from L4 level
    this.level_ = (this.levels_[3] - 50) << 16;
    this._advance(0);
  }
  noteOff() { this.down_ = true; this._advance(3); }
  _advance(ix) {
    this.stage = ix;
    if (ix >= 4) return;
    this.targetlevel_ = (this.levels_[ix] - 50) << 16;
    this.rising_ = this.targetlevel_ > this.level_;
    // Use qrate formula for pitch envelope too
    let qr = Math.min(63, (this.rates_[ix] * 41) >> 6);
    this.inc_ = (4 + (qr & 3)) << (2 + 6 + (qr >> 2));
    this.inc_ = Math.round(this.inc_ * this.sr_mul);
    // Pitch envelope is slower — scale down
    this.inc_ = Math.max(1, this.inc_ >> 4);
  }
  // Returns pitch offset in semitones. Called per block (64 samples).
  getsample() {
    if (!this.active) return 0;
    if (this.rising_) {
      this.level_ += this.inc_;
      if (this.level_ >= this.targetlevel_) {
        this.level_ = this.targetlevel_;
        if (this.stage < 2 || this.stage === 3) {
          if (this.stage + 1 < 4) this._advance(this.stage + 1);
          else this.stage = 4;
        }
      }
    } else {
      this.level_ -= this.inc_;
      if (this.level_ <= this.targetlevel_) {
        this.level_ = this.targetlevel_;
        if (this.stage < 2 || this.stage === 3) {
          if (this.stage + 1 < 4) this._advance(this.stage + 1);
          else this.stage = 4;
        }
      }
    }
    // Convert: level_ is (param - 50) << 16, range ±50<<16
    // Map to semitones: ±50 → ±48 semitones (4 octaves)
    return (this.level_ / (1 << 16)) * (48 / 50);
  }
}

// ── LFO ──
const LFO_SPEED_TABLE = new Float64Array(100);
(function() {
  for (let s = 0; s < 100; s++) {
    if (s < 10) LFO_SPEED_TABLE[s] = 0.062 + s * 0.044;
    else if (s < 50) LFO_SPEED_TABLE[s] = 0.5 * Math.pow(16, (s - 10) / 40.0);
    else LFO_SPEED_TABLE[s] = 8.0 * Math.pow(5.95, (s - 50) / 49.0);
  }
})();

function lfoWaveform(phase, wave) {
  switch (wave) {
    case 0: return phase < 0.5 ? 4*phase-1 : 3-4*phase;
    case 1: return 1 - 2*phase;
    case 2: return 2*phase - 1;
    case 3: return phase < 0.5 ? 1 : -1;
    case 4: return sineLookup(phase);
    case 5: return 0;
    default: return 0;
  }
}

class DX7GlobalLFO {
  constructor() {
    this.phase = 0; this.freq = 0; this.wave = 0;
    this.delayCounter = 0; this.delayTime = 0;
    this.shValue = 0; this.sync = false;
    this.pmd = 0; this.amd = 0;
  }
  setParams(speed, delay, wave, sync, pmd, amd) {
    this.freq = LFO_SPEED_TABLE[Math.min(99, Math.max(0, speed))];
    this.wave = wave; this.sync = sync;
    // Higher delay parameter = LONGER wait before the LFO fades in
    // (0 = instant, 99 ≈ 4 s), matching the DX7 front panel.
    this.delayTime = delay > 0 ? 0.008 * Math.pow(500, delay / 99.0) : 0;
    this.pmd = pmd; this.amd = amd;
  }
  noteOn() { if (this.sync) this.phase = 0; this.delayCounter = 0; }
  process(sampleRate) {
    this.phase += this.freq * 64 / sampleRate; // advance by one block (64 samples)
    if (this.phase >= 1.0) {
      this.phase -= 1.0;
      if (this.wave === 5) this.shValue = Math.random() * 2 - 1;
    }
    let delayMul = 1.0;
    if (this.delayTime > 0 && this.delayCounter < 1.0) {
      this.delayCounter += 1.0 / (this.delayTime * sampleRate);
      if (this.delayCounter > 1.0) this.delayCounter = 1.0;
      delayMul = this.delayCounter;
    }
    return (this.wave === 5 ? this.shValue : lfoWaveform(this.phase, this.wave)) * delayMul;
  }
  // extraDepth (0-1) adds LFO depth from performance controls
  // (mod wheel, aftertouch) on top of the patch's own pitch mod depth.
  getPitchMod(lfoVal, pitchModSens, extraDepth = 0) {
    const depth = Math.min(1, this.pmd / 99.0 + extraDepth);
    if (depth <= 0 || pitchModSens === 0) return 0;
    const PMS_SEMITONES = [0, 0.6, 1.2, 2.4, 6, 12, 24, 48];
    return lfoVal * depth * PMS_SEMITONES[pitchModSens];
  }
  // Returns a combined-level reduction for amplitude modulation
  // Higher value = quieter. Range 0 to ~800.
  getAmpModReduction(lfoVal, ampModSens) {
    if (this.amd === 0 || ampModSens === 0) return 0;
    // AMS depth in combined-level units (roughly matching Dexed's ampmodsenstab)
    const AMS_DEPTH = [0, 200, 400, 800];
    const unipolar = (1.0 - lfoVal) * 0.5;
    return Math.round(unipolar * (this.amd / 99.0) * AMS_DEPTH[ampModSens]);
  }
}

// ── Frequency helpers ──
const COARSE_RATIO = [
  0.50, 1.00, 2.00, 3.00, 4.00, 5.00, 6.00, 7.00,
  8.00, 9.00, 10.00, 11.00, 12.00, 13.00, 14.00, 15.00,
  16.00, 17.00, 18.00, 19.00, 20.00, 21.00, 22.00, 23.00,
  24.00, 25.00, 26.00, 27.00, 28.00, 29.00, 30.00, 31.00
];

function midiToFreq(note) { return 440 * Math.pow(2, (note - 69) / 12.0); }

// Dexed's ScaleRate: x = min(31, max(0, midinote/3 - 7))
// qratedelta = (sensitivity * x) >> 3
function kbdRateScale(note, rateScaling) {
  if (rateScaling === 0) return 0;
  const x = Math.min(31, Math.max(0, Math.floor(note / 3) - 7));
  return (rateScaling * x) >> 3;
}

// ── Keyboard level scaling → outlevel offset ──
// Matches Dexed's ScaleLevel / ScaleCurve functions.
// Returns an offset added to the outlevel (positive = louder for + curves, quieter for - curves)
const EXP_SCALE_DATA = [
  0,1,2,3,4,5,6,7,8,9,11,14,16,19,23,27,33,39,47,56,66,
  80,94,110,126,142,158,174,190,206,222,238,250
];

function scaleCurve(group, depth, curve) {
  let scale;
  if (curve === 0 || curve === 3) {
    scale = (group * depth * 329) >> 12;
  } else {
    const raw = EXP_SCALE_DATA[Math.min(group, EXP_SCALE_DATA.length - 1)];
    scale = (raw * depth * 329) >> 15;
  }
  if (curve < 2) scale = -scale;
  return scale;
}

function kbdLevelScale(note, breakpoint, leftDepth, rightDepth, leftCurve, rightCurve) {
  const bp = breakpoint + 17;
  const offset = note - bp;
  if (offset >= 0) {
    return scaleCurve(Math.floor((offset + 1) / 3), rightDepth, rightCurve);
  } else {
    return scaleCurve(Math.floor((-offset + 1) / 3), leftDepth, leftCurve);
  }
}

// ── DX7 Operator ──
// The real DX7 signal path:
// 1. Compute totalTL = outputLevelTL + envelopeLogLevel + velocityTL + klsTL + lfoAmpTL
// 2. Convert to linear: amp = logLevelToLinear(totalTL)
// 3. Output = sin(phase + modInput) * amp
// The amplitude IS the modulation index for modulators.
// At output level 99 (TL=0) with envelope at max (logLevel=0),
// the operator outputs ±1.0. When used as a modulator, this means
// ±1.0 cycles of phase deviation = ±2π radians. This is the correct
// DX7 modulation depth.
class DX7Operator {
  constructor() {
    this.phase = 0;
    this.envelope = new DX7Envelope();
    this.outputLevel = 0;
    this.oscMode = 0;
    this.freqCoarse = 0;
    this.freqFine = 0;
    this.detune = 7;
    this.velSensitivity = 0;
    this.ampModSens = 0;
    this.kbdRateScaling = 0;
    this.kbdLevelScaleBP = 0;
    this.kbdLevelScaleLD = 0;
    this.kbdLevelScaleRD = 0;
    this.kbdLevelScaleLC = 0;
    this.kbdLevelScaleRC = 0;
    this.freqRatio = 1.0;
    this.fixedFreq = 0;
    this.outlevel = 0;
    this.output = 0;
    // Gain interpolation state (matches Dexed's gain_out / level_in)
    this.gain_out = 0;  // previous block's gain (for interpolation)
    this.level_in = 0;  // current block's level (from envelope)
  }

  computeFreq() {
    if (this.oscMode === 0) {
      let ratio = COARSE_RATIO[this.freqCoarse] || 1.0;
      // Dexed: logfreq += floor(24204406.323123 * log(1 + 0.01*fine) + 0.5)
      // This equals: ratio *= (1 + 0.01 * fine)
      ratio *= (1.0 + this.freqFine * 0.01);
      this.freqRatio = ratio;
    } else {
      // Fixed frequency mode — ported from Dexed dx7note.cc:
      // logfreq = (4458616 * ((coarse & 3) * 100 + fine)) >> 3
      // freq = 2^(logfreq / (1<<24))
      const logfreq = (4458616 * ((this.freqCoarse & 3) * 100 + this.freqFine)) >> 3;
      this.fixedFreq = Math.pow(2, logfreq / (1 << 24));
    }
  }

  getFreq(baseFreq) {
    return this.oscMode === 0 ? baseFreq * this.freqRatio : this.fixedFreq;
  }

  getDetuneHz(freq) {
    if (this.detune === 7) return 0;
    const logfreq = Math.log2(freq) * (1 << 24);
    const detuneRatio = 0.0209 * Math.exp(-0.396 * logfreq / (1 << 24)) / 7;
    const logOffset = detuneRatio * logfreq * (this.detune - 7);
    return freq * (Math.pow(2, logOffset / (1 << 24)) - 1);
  }

  noteOn(note, velocity, sampleRate) {
    let ol = scaleOutLevel(this.outputLevel);
    const kls = kbdLevelScale(
      note, this.kbdLevelScaleBP,
      this.kbdLevelScaleLD, this.kbdLevelScaleRD,
      this.kbdLevelScaleLC, this.kbdLevelScaleRC
    );
    ol += kls;
    ol = Math.min(127, Math.max(0, ol));
    ol = ol << 5;
    ol += scaleVelocity(velocity, this.velSensitivity);
    this.outlevel = Math.max(0, ol);

    const rateOffset = kbdRateScale(note, this.kbdRateScaling);
    this.envelope.init(this.outlevel, rateOffset, sampleRate);
    this.envelope.keydown(true);
  }

  noteOff() { this.envelope.keydown(false); }

  // Called once per 64-sample block to update the envelope and compute new gain.
  // Returns the new gain (float amplitude).
  updateGain(lfoAmpMod) {
    const level = this.envelope.getsample();
    this.level_in = level;
    // Dexed: gain = Exp2(level_in - 14*(1<<24))
    // Exp2 returns Q24 format: at x=0 → 1<<24, at x=1<<24 → 2<<24
    // The >> (6 - intPart) in Exp2::lookup normalizes to Q24
    // At max (level=3840<<16, x=1<<24): gain = 2*(1<<24) = 33554432
    // output = sin(1<<24) * gain >> 24 = gain = 33554432
    // As phase cycles: 33554432 / (1<<24) = 2.0 cycles
    // In our 0-1 cycle system: gain_float = 2^expArg * 2
    // (the *2 accounts for Exp2 returning 2^(x+1) at x=1 due to the shift)
    // Actually: Exp2(x) in Q24 = 2^(x/(1<<24)) * (1<<24)
    // output = sin * Exp2(x) >> 24 = sin * 2^(x/(1<<24))
    // As cycles: 2^(x/(1<<24))
    // At max (x=1<<24): 2^1 = 2 cycles
    // So gain_float = 2^expArg (where expArg = level/(1<<24) - 14)
    const expArg = level / (1 << 24) - 14;
    let gain = (expArg < -30) ? 0 : Math.pow(2, expArg);
    // Apply LFO amp mod
    if (lfoAmpMod > 0) {
      gain *= Math.pow(2, -lfoAmpMod / 256);
    }
    return gain;
  }

  // Process one sample with gain interpolation.
  // gain is the interpolated gain for this sample.
  processSample(freq, modInput, sampleRate, gain) {
    const detuneHz = this.getDetuneHz(freq);
    this.phase += (freq + detuneHz) / sampleRate;
    if (this.phase >= 1.0) this.phase -= Math.floor(this.phase);
    this.output = sineLookup(this.phase + modInput) * gain;
    return this.output;
  }

  isActive() { return this.envelope.isActive(); }
}

// ── Feedback ──
// Ported from Dexed's compute_fb in fm_op_kernel.cc.
// In Dexed, feedback is computed PER-SAMPLE (not per-block):
//   int32_t scaled_fb = (y0 + y) >> (fb_shift + 1);
//   y0 = y;
//   y = Sin::lookup(phase + scaled_fb);
//   y = ((int64_t)y * (int64_t)gain) >> 24;
// where fb_shift = FEEDBACK_BITDEPTH(8) - feedback for feedback > 0.
//
// The per-sample recursion is critical: each sample's output feeds back
// into the next sample's phase, creating a self-modulating loop that
// builds up harmonics. Block-level feedback cannot replicate this.
//
// Scaling derivation:
// Dexed's Sin::lookup uses 2^24 phase units per cycle.
// At level 99: gain = Exp2(1<<24) = 2^25 = 33554432.
// Sin::lookup returns ±(1<<24). y = sin * gain >> 24 = ±2^25.
// fb=7 (shift=1): scaled_fb = (2^25 + 2^25) >> 2 = 2^24 = 1 full cycle.
// Our output at level 99: gain = 2.0, y = sin * 2.0 ≈ ±2.0.
// Our phase is 0-1 (1.0 = full cycle).
// Need: (y0 + y) * scale = Dexed's phase fraction.
// General: Dexed phase fraction = 2^(fb-7) cycles.
// Our: (y0+y) * scale = 4.0 * scale = 2^(fb-7).
// scale = 2^(fb-9).
const FEEDBACK_SCALE = [];
(function() {
  FEEDBACK_SCALE[0] = 0;
  for (let fb = 1; fb <= 7; fb++) {
    // Dexed: scaled_fb = (y0 + y) >> (fb_shift + 1) where fb_shift = 8 - fb
    // Dexed's Sin::lookup uses 2^24 phase units per cycle (not 2^32).
    // At level 99: gain = 2*(1<<24), sin = ±(1<<24), y = ±(1<<25).
    // fb=7 (shift=1): scaled_fb = 2*(1<<25) >> 2 = 1<<25 → 1<<25/1<<24 = 2 cycles
    // Actually: (y0+y) = 2^26, >> (9-fb) = 2^(17+fb), /2^24 = 2^(fb-7) cycles.
    // Our output at level 99: ±2.0, so (y0+y) = 4.0.
    // Need: 4.0 * scale = 2^(fb-7) → scale = 2^(fb-9).
    FEEDBACK_SCALE[fb] = Math.pow(2, fb - 9);
  }
})();

// Feedback SOURCE operator index per algorithm (0-based): the op whose output
// is written to the feedback buffer (Dexed's FB_OUT flag, 0x80). For most
// algorithms this is the same op that reads the feedback (self-feedback), but
// algorithms 4 and 6 loop a whole stack: OP4→OP6 and OP5→OP6 respectively
// (ALGOS entries 0x94 at index 2 / index 1), so the source is not OP6 itself.
const FEEDBACK_OP = [
  0, 4, 0, 2, 0, 1, 0, 2,   // algos 1-8
  4, 3, 0, 4, 0, 0, 4, 0,   // algos 9-16
  4, 3, 0, 3, 3, 0, 0, 0,   // algos 17-24
  0, 0, 3, 1, 0, 1, 0, 0    // algos 25-32
];

// Pre-parsed algorithm data for fast access (avoids re-parsing flags each sample)
const ALGOS = [
  [0xc1,0x11,0x11,0x14,0x01,0x14],[0x01,0x11,0x11,0x14,0xc1,0x14],
  [0xc1,0x11,0x14,0x01,0x11,0x14],[0xc1,0x11,0x94,0x01,0x11,0x14],
  [0xc1,0x14,0x01,0x14,0x01,0x14],[0xc1,0x94,0x01,0x14,0x01,0x14],
  [0xc1,0x11,0x05,0x14,0x01,0x14],[0x01,0x11,0xc5,0x14,0x01,0x14],
  [0x01,0x11,0x05,0x14,0xc1,0x14],[0x01,0x05,0x14,0xc1,0x11,0x14],
  [0xc1,0x05,0x14,0x01,0x11,0x14],[0x01,0x05,0x05,0x14,0xc1,0x14],
  [0xc1,0x05,0x05,0x14,0x01,0x14],[0xc1,0x05,0x11,0x14,0x01,0x14],
  [0x01,0x05,0x11,0x14,0xc1,0x14],[0xc1,0x11,0x02,0x25,0x05,0x14],
  [0x01,0x11,0x02,0x25,0xc5,0x14],[0x01,0x11,0x11,0xc5,0x05,0x14],
  [0xc1,0x14,0x14,0x01,0x11,0x14],[0x01,0x05,0x14,0xc1,0x14,0x14],
  [0x01,0x14,0x14,0xc1,0x14,0x14],[0xc1,0x14,0x14,0x14,0x01,0x14],
  [0xc1,0x14,0x14,0x01,0x14,0x04],[0xc1,0x14,0x14,0x14,0x04,0x04],
  [0xc1,0x14,0x14,0x04,0x04,0x04],[0xc1,0x05,0x14,0x01,0x14,0x04],
  [0x01,0x05,0x14,0xc1,0x14,0x04],[0x04,0xc1,0x11,0x14,0x01,0x14],
  [0xc1,0x14,0x01,0x14,0x04,0x04],[0x04,0xc1,0x11,0x14,0x04,0x04],
  [0xc1,0x14,0x04,0x04,0x04,0x04],[0xc4,0x04,0x04,0x04,0x04,0x04],
];

// Scratch storage is safe here: rendering is synchronous and never recursive.
const algorithmBus = [0, 0];
const algorithmContents = [true, false, false];
function processAlgorithm(algo, ops, freqs, feedback, fbScaleIdx, sampleRate, gains) {
  const fbScale = FEEDBACK_SCALE[fbScaleIdx];
  const alg = ALGOS[algo];
  const bus = algorithmBus; bus[0]=0; bus[1]=0;
  const hasContents = algorithmContents; hasContents[0]=true; hasContents[1]=false; hasContents[2]=false;
  let out = 0;
  const fbOpIdx = FEEDBACK_OP[algo];

  for (let op = 0; op < 6; op++) {
    const flags = alg[op];
    const inBus = (flags >> 4) & 3;
    const outBus = flags & 3;
    // OUT_BUS_ADD (bit 2): accumulate into the destination bus vs. overwrite it.
    // This applies to WHATEVER bus the operator targets — the final output (bus 0)
    // OR an internal modulation bus (bus 1/2). Dexed forces overwrite when the
    // destination bus is still empty (first writer always sets).
    let add = (flags & 0x04) !== 0;
    const hasFbIn = (flags & 0xC0) === 0xC0;
    const opGain = gains[op];

    if (!hasContents[outBus]) add = false;

    let modInput = 0;
    if (hasFbIn) {
      // Per-sample feedback matching Dexed's compute_fb:
      // scaled_fb = (y0 + y) >> (fb_shift + 1)
      // In our float system: (fb[0] + fb[1]) * fbScale
      modInput = fbScale > 0 ? (feedback[0] + feedback[1]) * fbScale : 0;
    } else if (inBus > 0 && inBus <= 2 && hasContents[inBus]) {
      modInput = bus[inBus - 1];
    }

    const opOut = ops[op].processSample(freqs[op], modInput, sampleRate, opGain);

    // Write to the operator's destination bus (0 = final output, 1/2 = modulation),
    // adding or overwriting per the OUT_BUS_ADD flag. Modulators that add to an
    // internal bus (opcodes 0x05/0x25/0xc5) must be SUMMED there — not overwritten,
    // and not leaked into the final output.
    if (outBus === 0) {
      out = add ? out + opOut : opOut;
    } else if (add) {
      bus[outBus - 1] += opOut;
    } else {
      bus[outBus - 1] = opOut;
    }
    hasContents[outBus] = true;

    // Update feedback buffer per-sample (matching Dexed's compute_fb)
    if (op === fbOpIdx) {
      feedback[1] = feedback[0];
      feedback[0] = opOut;
    }
  }

  return out;
}

// Number of carriers (operators writing to the final output bus, flags & 3 === 0)
// per algorithm. Modulators that ADD to an internal bus (opcodes 0x05/0x25/0xc5)
// are NOT carriers — they were previously miscounted as such.
const CARRIER_COUNT = [
  2, 2, 2, 2, 3, 3, 2, 2,   // algos 1-8
  2, 2, 2, 2, 2, 2, 2, 1,   // algos 9-16
  1, 1, 3, 3, 4, 4, 4, 5,   // algos 17-24
  5, 3, 3, 3, 4, 4, 5, 6    // algos 25-32
];

// ── DX7 Voice ──
class DX7Voice {
  constructor() {
    this.blockOutput = new Float32Array(64);
    this.blockFreqs = new Float64Array(6);
    this.blockGain1 = new Float64Array(6);
    this.blockGain2 = new Float64Array(6);
    this.blockGains = new Float64Array(6);
    this.ops = [];
    for (let i = 0; i < 6; i++) this.ops.push(new DX7Operator());
    this.pitchEnv = new DX7PitchEnvelope();
    this.feedback = [0, 0];
    this.note = 0; this.targetNote = 0; this.currentPitch = 0;
    this.velocity = 0; this.active = false;
    this.sustained = false; this.released = false;
    this.algorithm = 0; this.feedbackIdx = 0;
    this.transpose = 24; this.pitchModSens = 0;
    this.oscSync = false; this.carrierCount = 1; this.age = 0;
  }

  noteOn(note, velocity, patch) {
    this.targetNote = note; this.note = note;
    this.velocity = velocity; this.active = true;
    this.sustained = false; this.released = false; this.age = 0;
    this.algorithm = patch.algorithm;
    this.transpose = patch.transpose;
    this.pitchModSens = patch.pitchModSens;
    this.oscSync = patch.oscSync;
    this.feedbackIdx = patch.feedback;
    this.carrierCount = CARRIER_COUNT[patch.algorithm] || 1;

    if (patch.portamentoTime > 0 && this.currentPitch > 0) {
    } else {
      this.currentPitch = note;
    }

    this.feedback[0] = 0; this.feedback[1] = 0;

    this.pitchEnv.setParams(
      patch.pitchEgR1, patch.pitchEgR2, patch.pitchEgR3, patch.pitchEgR4,
      patch.pitchEgL1, patch.pitchEgL2, patch.pitchEgL3, patch.pitchEgL4
    );
    this.pitchEnv.init(sampleRate);

    for (let i = 0; i < 6; i++) {
      const op = this.ops[i];
      const d = patch.ops[i];
      op.envelope.setParams(d.egRate1, d.egRate2, d.egRate3, d.egRate4,
                            d.egLevel1, d.egLevel2, d.egLevel3, d.egLevel4);
      op.outputLevel = d.outputLevel;
      op.oscMode = d.oscMode;
      op.freqCoarse = d.freqCoarse;
      op.freqFine = d.freqFine;
      op.detune = d.detune;
      op.velSensitivity = d.velSensitivity;
      op.ampModSens = d.ampModSens;
      op.kbdRateScaling = d.kbdRateScaling;
      op.kbdLevelScaleBP = d.kbdLevelScaleBP;
      op.kbdLevelScaleLD = d.kbdLevelScaleLD;
      op.kbdLevelScaleRD = d.kbdLevelScaleRD;
      op.kbdLevelScaleLC = d.kbdLevelScaleLC;
      op.kbdLevelScaleRC = d.kbdLevelScaleRC;
      op.computeFreq();
      if (this.oscSync) op.phase = 0;
      // Reset gain_out to 0 so the new note fades in from silence
      // (gain interpolation will smoothly ramp from 0 to the new gain)
      op.gain_out = 0;
      op.noteOn(note, velocity, sampleRate);
    }
  }

  noteOff() {
    for (let i = 0; i < 6; i++) this.ops[i].noteOff();
    this.pitchEnv.noteOff();
  }

  getAmplitude() {
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += Math.abs(this.ops[i].output);
    return sum;
  }

  // Process a block of N samples. Returns an array of N output values.
  processBlock(blockSize, sampleRate, lfoVal, lfo, pitchBend, modWheel, aftertouch, portamentoRate) {
    if (!this.active) return null;
    this.age++;

    // Check if any CARRIER envelope is still active (matching Dexed's isPlaying())
    // Only carriers matter — modulators can be silent without killing the voice
    let anyCarrierActive = false;
    for (let i = 0; i < 6; i++) {
      if (this.ops[i].isActive()) { anyCarrierActive = true; break; }
    }

    if (!anyCarrierActive) {
      // Fade out over this block to avoid click
      const output = this.blockOutput;
      const fadeGains = this.blockGains;
      const freqs = this.blockFreqs;
      const baseFreq = midiToFreq(this.currentPitch + (this.transpose - 24));
      for (let i = 0; i < 6; i++) freqs[i] = this.ops[i].getFreq(baseFreq);

      for (let s = 0; s < blockSize; s++) {
        const fade = 1.0 - s / blockSize;
        for (let i = 0; i < 6; i++) fadeGains[i] = this.ops[i].gain_out * fade;
        output[s] = processAlgorithm(
          this.algorithm, this.ops, freqs,
          this.feedback, this.feedbackIdx,
          sampleRate, fadeGains
        ) ;
      }
      // Zero out gains so next use starts clean
      for (let i = 0; i < 6; i++) this.ops[i].gain_out = 0;
      this.active = false;
      return output;
    }

    // Portamento
    if (portamentoRate > 0 && Math.abs(this.currentPitch - this.note) > 0.01) {
      const gs = portamentoRate / sampleRate * blockSize;
      this.currentPitch += (this.note > this.currentPitch ? 1 : -1) * Math.min(gs, Math.abs(this.note - this.currentPitch));
    } else {
      this.currentPitch = this.note;
    }

    // Pitch (computed once per block).
    // Mod wheel and aftertouch deepen the LFO's pitch modulation (vibrato),
    // gated by pitch mod sensitivity — they must not statically detune the note.
    const pitchSemitones = this.pitchEnv.getsample();
    const lfoPitch = lfo.getPitchMod(lfoVal, this.pitchModSens, modWheel + aftertouch);
    const transNote = this.currentPitch + (this.transpose - 24);
    const totalPitch = transNote + pitchSemitones + lfoPitch + pitchBend;
    const baseFreq = midiToFreq(totalPitch);

    const freqs = this.blockFreqs;
    for (let i = 0; i < 6; i++) freqs[i] = this.ops[i].getFreq(baseFreq);

    // Update envelopes and compute gains (once per block)
    const gain1 = this.blockGain1;
    const gain2 = this.blockGain2;
    for (let i = 0; i < 6; i++) {
      gain1[i] = this.ops[i].gain_out;
      const lfoAmp = lfo.getAmpModReduction(lfoVal, this.ops[i].ampModSens);
      gain2[i] = this.ops[i].updateGain(lfoAmp);
      this.ops[i].gain_out = gain2[i];
    }

    // Render block with per-sample gain interpolation
    const output = this.blockOutput;
    const gains = this.blockGains;
    for (let s = 0; s < blockSize; s++) {
      const t = (s + 1) / blockSize;
      for (let i = 0; i < 6; i++) {
        gains[i] = gain1[i] + (gain2[i] - gain1[i]) * t;
      }
      let out = processAlgorithm(
        this.algorithm, this.ops, freqs,
        this.feedback, this.feedbackIdx,
        sampleRate, gains
      );
      output[s] = out ;
    }

    return output;
  }
}

// ── DX7 Processor ──
class DX7Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    for (let i = 0; i < MAX_POLYPHONY; i++) this.voices.push(new DX7Voice());
    this.patch = null;
    this.scheduled = [];
    this.masterVolume = 0.0625; // Matches Dexed's >>4 output scaling
    this.sustainPedal = false;
    this.lfo = new DX7GlobalLFO();
    this.pitchBend = 0;
    this.pitchBendRange = 2;
    this.modWheel = 0;
    this.aftertouch = 0;
    this.portamentoTime = 0;
    this.portamentoMode = 0;

    this.port.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'scheduled': this.scheduled.push(...msg.events); this.scheduled.sort((a,b)=>a.at-b.at); break;
        case 'noteOn': this._noteOn(msg.note, msg.velocity); break;
        case 'noteOff': this._noteOff(msg.note); break;
        case 'patch': this._setPatch(msg.patch); break;
        case 'sustain': this._sustain(msg.value); break;
        case 'pitchBend': this._pitchBend(msg.value); break;
        case 'modWheel': this.modWheel = msg.value / 127.0; break;
        case 'aftertouch': this.aftertouch = msg.value / 127.0; break;
        case 'panic': this._panic(); break;
      }
    };
  }

  _setPatch(patch) {
    this.patch = patch;
    this.lfo.setParams(
      patch.lfoSpeed, patch.lfoDelay, patch.lfoWave, patch.lfoSync,
      patch.lfoPitchModDepth, patch.lfoAmpModDepth
    );
    this.portamentoTime = patch.portamentoTime || 0;
    this.portamentoMode = patch.portamentoMode || 0;
    this.pitchBendRange = patch.pitchBendRange ?? 2; // 0 (no bend) is valid
  }

  _pitchBend(value) {
    this.pitchBend = ((value - 8192) / 8192) * this.pitchBendRange;
  }

  _noteOn(note, velocity, id) {
    if (!this.patch) return;
    let voice = null, quietest = null, quietestAmp = Infinity;
    for (const v of this.voices) {
      if (!v.active) { voice = v; break; }
      const amp = v.getAmplitude();
      if (amp < quietestAmp) { quietestAmp = amp; quietest = v; }
    }
    if (!voice) voice = quietest;
    this.lfo.noteOn();
    voice.noteOn(note, velocity, this.patch);
    voice.eventId = id;
  }

  _noteOff(note, id) {
    for (const v of this.voices) {
      if (v.active && v.note === note && !v.released && (id === undefined || v.eventId === id)) {
        if (this.sustainPedal) { v.sustained = true; }
        else { v.noteOff(); v.released = true; }
      }
    }
  }

  _sustain(on) {
    this.sustainPedal = on;
    if (!on) {
      for (const v of this.voices) {
        if (v.active && v.sustained) { v.noteOff(); v.released = true; v.sustained = false; }
      }
    }
  }

  _panic() {
    this.scheduled = [];
    this.sustainPedal = false; this.pitchBend = 0;
    this.modWheel = 0; this.aftertouch = 0;
    for (const v of this.voices) {
      v.active = false; v.sustained = false; v.released = false;
      for (const op of v.ops) {
        op.envelope.active = false;
        op.gain_out = 0;
        op.output = 0;
      }
      v.feedback[0] = 0; v.feedback[1] = 0;
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];
    if (!channel) return true;

    const sr = sampleRate;
    const N = 64; // Dexed block size
    const portRate = this.portamentoTime > 0 ? 200.0 / (1 + this.portamentoTime * 2) : 0;

    // Process in blocks of N samples (matching Dexed)
    for (let blockStart = 0; blockStart < channel.length; blockStart += N) {
      const time = currentTime + blockStart / sr;
      while(this.scheduled.length && this.scheduled[0].at <= time) {
        const event=this.scheduled.shift();
        if(event.type==='noteOn')this._noteOn(event.note,event.velocity,event.id);
        else this._noteOff(event.note,event.id);
      }
      const blockEnd = Math.min(blockStart + N, channel.length);
      const blockSize = blockEnd - blockStart;

      // LFO: compute once per block
      const lfoVal = this.lfo.process(sr);

      // Render each active voice for this block
      for (let s = blockStart; s < blockEnd; s++) channel[s] = 0;

      for (const voice of this.voices) {
        if (!voice.active) continue;
        const voiceBlock = voice.processBlock(blockSize, sr, lfoVal, this.lfo,
          this.pitchBend, this.modWheel, this.aftertouch, portRate);
        if (voiceBlock) {
          for (let s = 0; s < blockSize; s++) {
            channel[blockStart + s] += voiceBlock[s] * this.masterVolume;
          }
        }
      }

      // Soft limit to prevent harsh digital clipping
      for (let s = blockStart; s < blockEnd; s++) {
        if (channel[s] > 1.0) channel[s] = 1.0;
        else if (channel[s] < -1.0) channel[s] = -1.0;
      }
    }

    for (let ch = 1; ch < output.length; ch++) output[ch].set(channel);
    return true;
  }
}

registerProcessor('dx7-processor', DX7Processor);
