/**
 * SoundManager — Synthesizes game sound effects using the Web Audio API.
 * Cozy, low-poly chimes, water splashes, reels, ambient wind, and UI clicks.
 * Requires zero external audio assets.
 */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambientNodes = null;
    this.muted = false;
    this.initialized = false;
    this.noiseBuffer = null;
    this.currentWeather = 'sunny';
  }

  /** Initialize the AudioContext on first user interaction. */
  init() {
    if (this.initialized) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('Web Audio API not supported in this browser.');
        return;
      }
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.35; // cozy, moderate volume
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;

      // Build shared noise buffer
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      // Start ambient sound
      this.startAmbient();

      // Play rain sounds on initialization if the weather is rainy
      if (this.currentWeather === 'rainy') {
        this.startRainSound();
      }
    } catch (e) {
      console.error('Failed to initialize AudioContext:', e);
    }
  }

  _resumeContext() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.35, this.ctx.currentTime);
    }
    return this.muted;
  }

  // ─── Procedural Sound Generation ──────────────────────────────────────

  /** Play UI click chime */
  playClick() {
    this._resumeContext();
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Play line cast whoosh */
  playCast() {
    this._resumeContext();
    if (!this.initialized || this.muted || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.4);
    filter.Q.setValueAtTime(4, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.5);
  }

  /** Play water splash (line hitting water or bite splash) */
  playSplash() {
    this._resumeContext();
    if (!this.initialized || this.muted || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // 1. Water impact noise burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(350, now);
    lowpass.frequency.exponentialRampToValueAtTime(80, now + 0.35);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    noise.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    // 2. Liquid plop bubble tone
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.15); // quick rising plop

    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.4);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Play fish bite alert ding-ding */
  playAlert() {
    this._resumeContext();
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const dings = [0, 0.12];
    dings.forEach((delay) => {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(987.77, now + delay); // B5 note

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1318.51, now + delay); // E6 note

      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.25, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain);

      osc1.start(now + delay);
      osc1.stop(now + delay + 0.4);
      osc2.start(now + delay);
      osc2.stop(now + delay + 0.4);
    });
  }

  /** Play single reel click. Call rapidly in update loop. */
  playReelClick() {
    this._resumeContext();
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.setValueAtTime(100, now + 0.01);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.02);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  /** Play magical catching arpeggio */
  playCatch() {
    this._resumeContext();
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const notes = [
      523.25, // C5
      659.25, // E5
      783.99, // G5
      1046.50, // C6
      1318.51, // E6
    ];

    notes.forEach((freq, i) => {
      const time = now + i * 0.09;
      const osc = this.ctx.createOscillator();
      const subOsc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(freq / 2, time); // warm octave below

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.2, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.65);

      osc.connect(gain);
      subOsc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + 0.7);
      subOsc.start(time);
      subOsc.stop(time + 0.7);
    });
  }

  /** Play sad slide tone when fish escapes */
  playLost() {
    this._resumeContext();
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.65); // sad downward slide

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(400, now);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

    osc.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.75);
  }

  /** Play sparkly chime when buying upgrades */
  playUpgrade() {
    this._resumeContext();
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51]; // A major sparkles
    notes.forEach((freq, i) => {
      const delay = i * 0.05;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.18, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + delay);
      osc.stop(now + delay + 0.5);
    });
  }

  // ─── Ambient Environment Noise ────────────────────────────────────────

  /** Start ambient breeze and low hum */
  startAmbient() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    this.stopAmbient();

    // 1. Low frequency water drone
    const drone1 = this.ctx.createOscillator();
    const drone2 = this.ctx.createOscillator();
    const droneGain = this.ctx.createGain();

    drone1.type = 'sine';
    drone1.frequency.value = 75; // low hum

    drone2.type = 'sine';
    drone2.frequency.value = 75.8; // subtle beating effect

    droneGain.gain.setValueAtTime(0.15, now);

    drone1.connect(droneGain);
    drone2.connect(droneGain);
    droneGain.connect(this.masterGain);

    // 2. Slow modulated lowpass breeze noise
    const breeze = this.ctx.createBufferSource();
    breeze.buffer = this.noiseBuffer;
    breeze.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, now);

    const breezeGain = this.ctx.createGain();
    breezeGain.gain.setValueAtTime(0.08, now);

    // Modulate filter frequency slowly (breeze swell)
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08; // very slow, 12 seconds per wave

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 70; // swept between 110Hz and 250Hz

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    breeze.connect(filter);
    filter.connect(breezeGain);
    breezeGain.connect(this.masterGain);

    // Modulate breeze volume slightly to create wave/wind swell
    const volLfo = this.ctx.createOscillator();
    volLfo.type = 'sine';
    volLfo.frequency.value = 0.12; // 8 seconds per wave
    const volLfoGain = this.ctx.createGain();
    volLfoGain.gain.value = 0.035; // sweep breezeGain between 0.045 and 0.115
    volLfo.connect(volLfoGain);
    volLfoGain.connect(breezeGain.gain);

    lfo.start(now);
    volLfo.start(now);
    breeze.start(now);

    this.ambientNodes = {
      drone1,
      drone2,
      droneGain,
      breeze,
      filter,
      breezeGain,
      lfo,
      volLfo,
    };
  }

  stopAmbient() {
    if (this.ambientNodes) {
      try {
        this.ambientNodes.drone1.stop();
        this.ambientNodes.drone2.stop();
        this.ambientNodes.breeze.stop();
        this.ambientNodes.lfo.stop();
        this.ambientNodes.volLfo.stop();
      } catch (e) {}
      this.ambientNodes = null;
    }
  }

  playBirdChirp() {
    this._resumeContext();
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Procedural bird chirp (pitch sweeps up and down quickly)
    osc.frequency.setValueAtTime(1800 + Math.random() * 400, now);
    osc.frequency.exponentialRampToValueAtTime(2800 + Math.random() * 400, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(2000, now + 0.15);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.03, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  startRainSound() {
    this.currentWeather = 'rainy';
    this._resumeContext();
    if (!this.initialized || this.muted || !this.noiseBuffer || this.rainSource) return;
    const now = this.ctx.currentTime;
 
    this.rainSource = this.ctx.createBufferSource();
    this.rainSource.buffer = this.noiseBuffer;
    this.rainSource.loop = true;
 
    this.rainFilter = this.ctx.createBiquadFilter();
    this.rainFilter.type = 'highpass';
    this.rainFilter.frequency.value = 1600;
 
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.setValueAtTime(0.05, now);
 
    this.rainSource.connect(this.rainFilter);
    this.rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
 
    this.rainSource.start(now);
  }
 
  stopRainSound() {
    this.currentWeather = 'sunny';
    if (this.rainSource) {
      try {
        this.rainSource.stop();
      } catch (e) {}
      this.rainSource = null;
      this.rainFilter = null;
      this.rainGain = null;
    }
  }
}

export const soundManager = new SoundManager();
