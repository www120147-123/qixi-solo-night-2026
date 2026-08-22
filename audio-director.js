const TRACKS = Object.freeze({
  bridge: { pad: [146.83, 220, 293.66], pulse: [440, 554.37, 659.25], tempo: 4.8, pulseLevel: 0.026, padLevel: 0.042, color: 'gold' },
  reversal: { pad: [110, 164.81], pulse: [329.63], tempo: 7.5, pulseLevel: 0.014, padLevel: 0.025, color: 'violet' },
  hub: { pad: [130.81, 196, 261.63], pulse: [392, 523.25], tempo: 5.4, pulseLevel: 0.018, padLevel: 0.032, color: 'warm' },
  ai: { pad: [123.47, 185, 246.94], pulse: [493.88, 587.33, 739.99], tempo: 3.8, pulseLevel: 0.024, padLevel: 0.035, color: 'cyan' },
  game: { pad: [98, 146.83, 220], pulse: [196, 246.94, 293.66], tempo: 2.4, pulseLevel: 0.03, padLevel: 0.03, color: 'red' },
  anime: { pad: [146.83, 220, 277.18], pulse: [440, 523.25, 659.25, 783.99], tempo: 4.2, pulseLevel: 0.026, padLevel: 0.036, color: 'violet' },
  city: { pad: [110, 164.81, 220], pulse: [329.63, 392, 493.88], tempo: 3.2, pulseLevel: 0.022, padLevel: 0.034, color: 'mint' },
  constellation: { pad: [130.81, 196, 261.63, 329.63], pulse: [523.25, 659.25, 783.99], tempo: 5.8, pulseLevel: 0.03, padLevel: 0.04, color: 'gold' },
  outro: { pad: [146.83, 220, 293.66, 369.99], pulse: [440, 554.37, 659.25], tempo: 5.2, pulseLevel: 0.028, padLevel: 0.042, color: 'gold' },
  final: { pad: [196, 246.94, 293.66, 392], pulse: [523.25, 659.25, 783.99], tempo: 6.6, pulseLevel: 0.024, padLevel: 0.045, color: 'gold' },
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function contextCtor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

/**
 * Small, license-free ambient score generated in the browser. Each scene has
 * its own harmonic palette, while crossfades preserve one continuous night.
 */
export class AudioDirector {
  constructor({ masterVolume = 0.28, crossfade = 760 } = {}) {
    this.masterVolume = clamp(masterVolume, 0, 1);
    this.crossfade = Math.max(0, Number(crossfade) || 760);
    this.context = null;
    this.master = null;
    this.current = null;
    this.scene = null;
    this.muted = false;
    this.started = false;
  }

  async start(scene = 'bridge') {
    const context = this._ensureContext();
    if (!context) return false;
    try {
      await context.resume();
    } catch (_) {
      return false;
    }
    this.started = true;
    this.transition(scene, 0);
    return true;
  }

  transition(scene, duration = this.crossfade) {
    if (!this.started || !this.context || !this.master) return this;
    if (scene === this.scene && this.current) return this;
    const spec = TRACKS[scene] || TRACKS.hub;
    const next = this._createTrack(spec);
    const now = this.context.currentTime;
    const fade = Math.max(0, Number(duration) || 0) / 1000;
    const target = this.muted ? 0 : 1;
    next.output.gain.setValueAtTime(0, now);
    next.output.gain.linearRampToValueAtTime(target, now + Math.max(0.01, fade));
    const previous = this.current;
    this.current = next;
    this.scene = scene;
    if (previous) previous.fadeOut(fade);
    return this;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (!this.master || !this.context) return this;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : this.masterVolume, now + 0.12);
    if (!this.muted && this.context.state === 'suspended') this.context.resume().catch(() => {});
    return this;
  }

  stop() {
    this.current?.fadeOut(0.28);
    this.current = null;
    this.scene = null;
    return this;
  }

  destroy() {
    this.current?.dispose();
    this.current = null;
    this.scene = null;
    this.master?.disconnect?.();
    this.context?.close?.().catch?.(() => {});
    this.context = null;
    this.master = null;
    this.started = false;
  }

  _ensureContext() {
    if (this.context) return this.context;
    const Ctor = contextCtor();
    if (!Ctor) return null;
    try {
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterVolume;
      this.master.connect(this.context.destination);
    } catch (_) {
      this.context = null;
      this.master = null;
    }
    return this.context;
  }

  _createTrack(spec) {
    const context = this.context;
    const output = context.createGain();
    output.gain.value = 0;
    output.connect(this.master);
    const nodes = [];
    const timers = [];
    const padFilter = context.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = spec.color === 'cyan' ? 2100 : 1500;
    padFilter.Q.value = 0.35;
    padFilter.connect(output);
    nodes.push(padFilter);

    spec.pad.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index % 2 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.value = spec.padLevel / Math.max(1, spec.pad.length - 1);
      oscillator.connect(gain).connect(padFilter);
      oscillator.start();
      nodes.push(oscillator, gain);
    });

    let noteIndex = 0;
    const interval = Math.max(180, Math.round((60 / spec.tempo) * 1000));
    const playNote = () => {
      const frequency = spec.pulse[noteIndex % spec.pulse.length];
      noteIndex += 1;
      this._pluck(output, frequency, spec.pulseLevel, spec.color);
    };
    playNote();
    timers.push(globalThis.setInterval(playNote, interval));

    return {
      output,
      fadeOut: (seconds) => {
        const now = context.currentTime;
        const duration = Math.max(0.04, Number(seconds) || 0.04);
        output.gain.cancelScheduledValues(now);
        output.gain.setValueAtTime(Math.max(0.001, output.gain.value), now);
        output.gain.linearRampToValueAtTime(0, now + duration);
        globalThis.setTimeout(() => {
          timers.forEach((timer) => globalThis.clearInterval(timer));
          nodes.forEach((node) => { try { node.stop?.(); } catch (_) {} node.disconnect?.(); });
          output.disconnect?.();
        }, duration * 1000 + 80);
      },
      dispose: () => {
        timers.forEach((timer) => globalThis.clearInterval(timer));
        nodes.forEach((node) => { try { node.stop?.(); } catch (_) {} node.disconnect?.(); });
        output.disconnect?.();
      },
    };
  }

  _pluck(destination, frequency, level, color) {
    const context = this.context;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    oscillator.type = color === 'red' ? 'square' : color === 'violet' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    filter.type = 'lowpass';
    filter.frequency.value = color === 'cyan' ? 2600 : 1800;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
    oscillator.connect(filter).connect(gain).connect(destination);
    oscillator.start(now);
    oscillator.stop(now + 0.66);
  }
}

export default AudioDirector;
