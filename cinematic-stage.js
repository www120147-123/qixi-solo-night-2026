const TAU = Math.PI * 2;

export const CINEMATIC_DURATION = 24;

const DEFAULT_PALETTE = Object.freeze({
  night: '#050711',
  nightDeep: '#010208',
  paper: '#f4efe7',
  paperMuted: '#b9b2aa',
  gold: '#e8bd68',
  goldSoft: '#f5dfae',
  red: '#c94b55',
  blue: '#8fb9ff',
  mint: '#9bd8c8',
  violet: '#b8a5ff',
  ink: '#15121c',
});

const TIMELINE_CUES = Object.freeze([
  { time: 0, type: 'timeline-start' },
  { time: 1.4, type: 'galaxy-visible' },
  { time: 2.2, type: 'magpies-enter' },
  { time: 4.2, type: 'actors-enter' },
  { time: 7.1, type: 'bridge-formed' },
  { time: 8.6, type: 'bridge-crossing' },
  { time: 15, type: 'actors-reaching' },
  { time: 17.15, type: 'freeze' },
  { time: 18.7, type: 'bridge-fracture' },
  { time: 21.6, type: 'stars-formed' },
]);

const STAR_NAMES = Object.freeze(['AI', 'GAME', 'ANIME', 'CITY']);

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function segment(time, start, end) {
  if (end <= start) return time >= end ? 1 : 0;
  return clamp((time - start) / (end - start));
}

function smoothstep(value) {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

function easeOutCubic(value) {
  const x = clamp(value);
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutSine(value) {
  const x = clamp(value);
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

function quadraticPoint(from, control, to, amount) {
  const inverse = 1 - amount;
  return {
    x: inverse * inverse * from.x + 2 * inverse * amount * control.x + amount * amount * to.x,
    y: inverse * inverse * from.y + 2 * inverse * amount * control.y + amount * amount * to.y,
  };
}

function quadraticTangent(from, control, to, amount) {
  return {
    x: 2 * (1 - amount) * (control.x - from.x) + 2 * amount * (to.x - control.x),
    y: 2 * (1 - amount) * (control.y - from.y) + 2 * amount * (to.y - control.y),
  };
}

function cubicPoint(from, controlA, controlB, to, amount) {
  const inverse = 1 - amount;
  const inverseSquared = inverse * inverse;
  const amountSquared = amount * amount;
  return {
    x:
      inverseSquared * inverse * from.x +
      3 * inverseSquared * amount * controlA.x +
      3 * inverse * amountSquared * controlB.x +
      amountSquared * amount * to.x,
    y:
      inverseSquared * inverse * from.y +
      3 * inverseSquared * amount * controlA.y +
      3 * inverse * amountSquared * controlB.y +
      amountSquared * amount * to.y,
  };
}

function cubicTangent(from, controlA, controlB, to, amount) {
  const inverse = 1 - amount;
  return {
    x:
      3 * inverse * inverse * (controlA.x - from.x) +
      6 * inverse * amount * (controlB.x - controlA.x) +
      3 * amount * amount * (to.x - controlB.x),
    y:
      3 * inverse * inverse * (controlA.y - from.y) +
      6 * inverse * amount * (controlB.y - controlA.y) +
      3 * amount * amount * (to.y - controlB.y),
  };
}

function hashSeed(seed) {
  if (Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed ?? 'qixi-cinematic-stage');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = hashSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function isCanvasLike(value) {
  return Boolean(value && typeof value.getContext === 'function');
}

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/**
 * A deterministic 24-second Canvas timeline for the Qixi magpie-bridge film.
 *
 * Supported construction styles:
 *   new CinematicStage(canvas, { audio, onProgress, onEvent })
 *   new CinematicStage({ canvas, audio, onProgress, onEvent })
 */
export class CinematicStage {
  constructor(canvasOrOptions, maybeOptions = {}) {
    const options = isCanvasLike(canvasOrOptions)
      ? { ...maybeOptions, canvas: canvasOrOptions }
      : { ...(canvasOrOptions || {}) };

    if (!isCanvasLike(options.canvas)) {
      throw new TypeError('CinematicStage requires a canvas with a 2D context.');
    }

    this.canvas = options.canvas;
    try {
      this.context = this.canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
    } catch (_) {
      this.context = this.canvas.getContext('2d');
    }
    if (!this.context) {
      throw new Error('CinematicStage could not acquire a 2D canvas context.');
    }

    this.duration = CINEMATIC_DURATION;
    this.audio = options.audio || null;
    this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
    this.controlAudio = options.controlAudio !== false;
    this.pauseAudioOnComplete = options.pauseAudioOnComplete === true;
    this.audioOffset = Number.isFinite(Number(options.audioOffset))
      ? Number(options.audioOffset)
      : 0;
    this.clockMode = options.clock === 'internal' ? 'internal' : this.audio ? 'audio' : 'internal';
    this.pixelRatioCap = clamp(finitePositive(options.pixelRatioCap, 2), 1, 2);
    this.speed = clamp(finitePositive(options.speed, 1), 0.1, 8);
    this.palette = Object.freeze({ ...DEFAULT_PALETTE, ...(options.palette || {}) });
    this.seed = hashSeed(options.seed);
    this.birdCount = Math.round(clamp(finitePositive(options.birdCount, 20), 16, 32));
    this.autoResize = options.autoResize !== false;
    this.pauseWhenHidden = options.pauseWhenHidden !== false;

    this._document = this.canvas.ownerDocument || globalThis.document || null;
    this._window = this._document?.defaultView || globalThis.window || null;
    this._status = 'idle';
    this._time = 0;
    this._anchorTime = 0;
    this._anchorNow = this._now();
    this._lastTimelineTime = 0;
    this._rafId = null;
    this._audioFallback = false;
    this._destroyed = false;
    this._completionEmitted = false;
    this._visibilityPaused = false;
    this._firedCues = new Set();
    this._resizeObserver = null;
    this._resizeListener = null;
    this._visibilityListener = null;
    this._motionListener = null;
    this._motionQuery = null;
    this._boundTick = (now) => this._tick(now);

    const requestedMotion = options.reducedMotion;
    if (typeof requestedMotion === 'boolean') {
      this._reducedMotion = requestedMotion;
    } else {
      this._motionQuery = this._window?.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
      this._reducedMotion = Boolean(this._motionQuery?.matches);
      this._installMotionPreferenceListener();
    }

    this._birds = this._createBirds();
    this._shards = this._createShards();
    this._field = [];
    this._width = 1;
    this._height = 1;
    this._dpr = 1;

    this._installVisibilityListener();
    this._installResizeHandling();
    this.resize();
    this._renderAt(0, true);
    this._emit('ready', {
      duration: this.duration,
      reducedMotion: this._reducedMotion,
      clock: this.clockMode,
    });
  }

  get currentTime() {
    if (this._status === 'playing') return this._readClock(this._now());
    return this._time;
  }

  get progress() {
    return clamp(this.currentTime / this.duration);
  }

  get isPlaying() {
    return this._status === 'playing';
  }

  get reducedMotion() {
    return this._reducedMotion;
  }

  get state() {
    return this._status;
  }

  play(from = 0) {
    this._assertAlive();
    const startTime = clamp(Number(from) || 0, 0, this.duration);
    this._cancelFrame();
    this._audioFallback = false;
    this._completionEmitted = false;
    this._firedCues.clear();
    this._writeTime(startTime, true);
    this._syncFiredCues(startTime);
    if (startTime <= 0) {
      this._firedCues.delete('timeline-start');
      this._emitCrossedCues(-0.001, 0);
    }
    this._status = 'playing';
    this._anchorTime = startTime;
    this._anchorNow = this._now();
    this._lastTimelineTime = startTime;
    this._emit('play', { time: startTime });
    this._startAudio();
    this._renderAt(startTime);
    this._requestFrame();
    return this;
  }

  pause() {
    this._assertAlive();
    this._visibilityPaused = false;
    return this._pause('user');
  }

  resume() {
    this._assertAlive();
    if (this._status === 'playing') return this;
    if (this._status === 'complete' || this._time >= this.duration) return this.play(0);

    this._status = 'playing';
    this._anchorTime = this._time;
    this._anchorNow = this._now();
    this._lastTimelineTime = this._time;
    this._visibilityPaused = false;
    this._emit('resume', { time: this._time });
    this._startAudio();
    this._requestFrame();
    return this;
  }

  seek(seconds) {
    this._assertAlive();
    const nextTime = clamp(Number(seconds) || 0, 0, this.duration);
    const previousTime = this.currentTime;
    this._writeTime(nextTime, true);
    this._syncFiredCues(nextTime);
    this._completionEmitted = nextTime >= this.duration;
    if (this._status === 'complete' && nextTime < this.duration) this._status = 'paused';
    this._renderAt(nextTime);
    this._emit('seek', {
      from: previousTime,
      to: nextTime,
      direction: nextTime >= previousTime ? 'forward' : 'backward',
    });
    return this;
  }

  setSpeed(multiplier) {
    this._assertAlive();
    const nextSpeed = clamp(finitePositive(multiplier, this.speed), 0.1, 8);
    const now = this._now();
    const currentTime = this._status === 'playing' ? this._readClock(now) : this._time;
    this.speed = nextSpeed;
    this._time = currentTime;
    this._anchorTime = currentTime;
    this._anchorNow = now;
    // The film clock may move faster, but the score must keep its own tempo.
    // Audio is intentionally owned by AudioDirector rather than this canvas.
    this._emit('speed-change', { speed: nextSpeed, time: currentTime });
    return this;
  }

  setReducedMotion(value) {
    this._assertAlive();
    const nextValue = Boolean(value);
    if (nextValue === this._reducedMotion) return this;
    this._reducedMotion = nextValue;
    this._renderAt(this.currentTime);
    this._emit('motion-preference', {
      reducedMotion: nextValue,
      time: this.currentTime,
    });
    return this;
  }

  resize(width, height) {
    this._assertAlive();
    const rect = this.canvas.getBoundingClientRect?.() || {};
    const fallbackWidth = finitePositive(this.canvas.clientWidth, this.canvas.width || 1);
    const fallbackHeight = finitePositive(this.canvas.clientHeight, this.canvas.height || 1);
    const cssWidth = Math.max(1, finitePositive(width, finitePositive(rect.width, fallbackWidth)));
    const cssHeight = Math.max(1, finitePositive(height, finitePositive(rect.height, fallbackHeight)));
    const deviceRatio = finitePositive(this._window?.devicePixelRatio, 1);
    const dpr = Math.min(this.pixelRatioCap, deviceRatio);
    const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
    const backingHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
    if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;

    this._width = cssWidth;
    this._height = cssHeight;
    this._dpr = dpr;
    this.context.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    this.context.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in this.context) this.context.imageSmoothingQuality = 'high';
    this._createStarField();
    this._renderAt(this.currentTime, true);
    this._emit('resize', { width: cssWidth, height: cssHeight, dpr });
    return this;
  }

  destroy() {
    if (this._destroyed) return;
    this._cancelFrame();
    if (this.controlAudio && typeof this.audio?.pause === 'function') {
      try {
        this.audio.pause();
      } catch (_) {}
    }
    this._resizeObserver?.disconnect?.();
    if (this._resizeListener) this._window?.removeEventListener?.('resize', this._resizeListener);
    if (this._visibilityListener) {
      this._document?.removeEventListener?.('visibilitychange', this._visibilityListener);
    }
    if (this._motionQuery && this._motionListener) {
      this._motionQuery.removeEventListener?.('change', this._motionListener);
      this._motionQuery.removeListener?.(this._motionListener);
    }

    const context = this.context;
    context.save?.();
    context.setTransform?.(1, 0, 0, 1, 0, 0);
    context.clearRect?.(0, 0, this.canvas.width, this.canvas.height);
    context.restore?.();

    this._status = 'destroyed';
    this._destroyed = true;
    this._emit('destroy', { time: this._time });
    this.onProgress = null;
    this.onEvent = null;
  }

  _assertAlive() {
    if (this._destroyed) throw new Error('CinematicStage has been destroyed.');
  }

  _now() {
    return this._window?.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now();
  }

  _usesAudioClock() {
    return (
      this.clockMode === 'audio' &&
      !this._audioFallback &&
      this.audio &&
      Number.isFinite(Number(this.audio.currentTime))
    );
  }

  _readClock(now) {
    if (this._usesAudioClock()) {
      return clamp(Number(this.audio.currentTime) - this.audioOffset, 0, this.duration);
    }
    const elapsed = Math.max(0, now - this._anchorNow) / 1000;
    return clamp(this._anchorTime + elapsed * this.speed, 0, this.duration);
  }

  _writeTime(time, writeAudio) {
    const nextTime = clamp(time, 0, this.duration);
    this._time = nextTime;
    this._anchorTime = nextTime;
    this._anchorNow = this._now();
    this._lastTimelineTime = nextTime;
    if (writeAudio && this.clockMode === 'audio' && this.audio) {
      try {
        this.audio.currentTime = nextTime + this.audioOffset;
        this._audioFallback = false;
      } catch (_) {
        this._audioFallback = true;
      }
    }
  }

  _startAudio() {
    if (!this._usesAudioClock() || !this.controlAudio || typeof this.audio?.play !== 'function') {
      return;
    }
    if ('playbackRate' in this.audio) {
      try {
        this.audio.playbackRate = this.speed;
      } catch (_) {}
    }
    try {
      const playResult = this.audio.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch((error) => {
          if (this._destroyed || this._status !== 'playing') return;
          this._switchToInternalClock('audio-blocked', error);
        });
      }
    } catch (error) {
      this._switchToInternalClock('audio-blocked', error);
    }
  }

  _switchToInternalClock(type, error) {
    const now = this._now();
    const audioTime = Number(this.audio?.currentTime) - this.audioOffset;
    const currentTime = Number.isFinite(audioTime) ? clamp(audioTime, 0, this.duration) : this._time;
    this._audioFallback = true;
    this._time = currentTime;
    this._anchorTime = currentTime;
    this._anchorNow = now;
    this._lastTimelineTime = currentTime;
    this._emit(type, {
      time: currentTime,
      message: error instanceof Error ? error.message : String(error || ''),
    });
  }

  _pause(reason) {
    if (this._status !== 'playing') return this;
    const now = this._now();
    this._time = this._readClock(now);
    this._anchorTime = this._time;
    this._anchorNow = now;
    this._status = 'paused';
    this._cancelFrame();
    if (this.controlAudio && typeof this.audio?.pause === 'function') {
      try {
        this.audio.pause();
      } catch (_) {}
    }
    this._renderAt(this._time);
    this._emit('pause', { time: this._time, reason });
    return this;
  }

  _requestFrame() {
    if (this._rafId !== null || this._status !== 'playing') return;
    const request =
      this._window?.requestAnimationFrame?.bind(this._window) ||
      globalThis.requestAnimationFrame?.bind(globalThis);
    if (request) {
      this._rafId = request(this._boundTick);
    } else {
      this._rafId = setTimeout(() => this._boundTick(this._now()), 16);
    }
  }

  _cancelFrame() {
    if (this._rafId === null) return;
    const cancel =
      this._window?.cancelAnimationFrame?.bind(this._window) ||
      globalThis.cancelAnimationFrame?.bind(globalThis);
    if (cancel) cancel(this._rafId);
    else clearTimeout(this._rafId);
    this._rafId = null;
  }

  _tick(now) {
    this._rafId = null;
    if (this._destroyed || this._status !== 'playing') return;

    const previousTime = this._lastTimelineTime;
    let nextTime = this._readClock(now);

    if (
      this._usesAudioClock() &&
      this.controlAudio &&
      this.audio?.ended &&
      nextTime < this.duration - 0.02
    ) {
      this._switchToInternalClock('audio-ended-fallback');
      nextTime = this._readClock(now);
    }

    this._time = nextTime;
    this._lastTimelineTime = nextTime;
    this._emitCrossedCues(previousTime, nextTime);
    this._renderAt(nextTime);

    if (nextTime >= this.duration - 0.001) {
      this._time = this.duration;
      this._status = 'complete';
      if (this.pauseAudioOnComplete && typeof this.audio?.pause === 'function') {
        try {
          this.audio.pause();
        } catch (_) {}
      }
      if (!this._completionEmitted) {
        this._completionEmitted = true;
        this._emit('complete', {
          time: this.duration,
          stars: this._starTargetDetails(),
        });
      }
      return;
    }

    this._requestFrame();
  }

  _emitCrossedCues(previousTime, nextTime) {
    if (nextTime < previousTime) {
      this._syncFiredCues(nextTime);
      return;
    }
    for (const cue of TIMELINE_CUES) {
      if (
        cue.time > previousTime &&
        cue.time <= nextTime + 0.0001 &&
        !this._firedCues.has(cue.type)
      ) {
        this._firedCues.add(cue.type);
        const detail = cue.type === 'stars-formed' ? { stars: this._starTargetDetails() } : {};
        this._emit(cue.type, { time: cue.time, ...detail });
      }
    }
  }

  _syncFiredCues(time) {
    this._firedCues.clear();
    for (const cue of TIMELINE_CUES) {
      if (cue.time <= time) this._firedCues.add(cue.type);
    }
  }

  _emit(type, detail = {}) {
    if (!this.onEvent) return;
    const time = Number.isFinite(detail.time) ? detail.time : this._time;
    const payload = {
      type,
      time,
      duration: this.duration,
      progress: clamp(time / this.duration),
      phase: this._phaseAt(time),
      ...detail,
    };
    try {
      this.onEvent(payload);
    } catch (error) {
      globalThis.console?.error?.('CinematicStage onEvent callback failed.', error);
    }
  }

  _reportProgress(time) {
    if (!this.onProgress) return;
    const progress = clamp(time / this.duration);
    const detail = {
      time,
      duration: this.duration,
      progress,
      phase: this._phaseAt(time),
      playing: this._status === 'playing',
      reducedMotion: this._reducedMotion,
    };
    try {
      this.onProgress(progress, detail);
    } catch (error) {
      globalThis.console?.error?.('CinematicStage onProgress callback failed.', error);
    }
  }

  _phaseAt(time) {
    if (time < 2.2) return 'galaxy';
    if (time < 4.2) return 'bridge-forming';
    if (time < 8.6) return 'approach';
    if (time < 15) return 'bridge-crossing';
    if (time < 17.15) return 'reaching';
    if (time < 18.7) return 'frozen';
    if (time < 21.6) return 'fracture';
    return 'stars';
  }

  _installResizeHandling() {
    if (!this.autoResize) return;
    const ResizeObserverClass = this._window?.ResizeObserver || globalThis.ResizeObserver;
    if (ResizeObserverClass) {
      this._resizeObserver = new ResizeObserverClass((entries) => {
        const entry = entries[0];
        const width = entry?.contentRect?.width;
        const height = entry?.contentRect?.height;
        if (width > 0 && height > 0 && !this._destroyed) this.resize(width, height);
      });
      this._resizeObserver.observe(this.canvas);
      return;
    }
    if (this._window?.addEventListener) {
      this._resizeListener = () => {
        if (!this._destroyed) this.resize();
      };
      this._window.addEventListener('resize', this._resizeListener, { passive: true });
    }
  }

  _installVisibilityListener() {
    if (!this.pauseWhenHidden || !this._document?.addEventListener) return;
    this._visibilityListener = () => {
      if (this._document.hidden && this._status === 'playing') {
        this._visibilityPaused = true;
        this._pause('visibility');
      } else if (!this._document.hidden && this._visibilityPaused) {
        this._visibilityPaused = false;
        this.resume();
      }
    };
    this._document.addEventListener('visibilitychange', this._visibilityListener);
  }

  _installMotionPreferenceListener() {
    if (!this._motionQuery) return;
    this._motionListener = (event) => {
      if (!this._destroyed) this.setReducedMotion(event.matches);
    };
    this._motionQuery.addEventListener?.('change', this._motionListener);
    this._motionQuery.addListener?.(this._motionListener);
  }

  _createBirds() {
    const random = seededRandom(this.seed ^ 0x21c0ffee);
    const middle = (this.birdCount - 1) / 2;
    return Array.from({ length: this.birdCount }, (_, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      const distanceFromCenter = Math.abs(index - middle);
      return {
        targetT: (index + 0.7) / (this.birdCount + 0.4),
        startX: side < 0 ? -0.12 - random() * 0.12 : 1.12 + random() * 0.12,
        startY: 0.03 + random() * 0.38,
        controlAX: side < 0 ? 0.08 + random() * 0.18 : 0.92 - random() * 0.18,
        controlAY: -0.06 + random() * 0.24,
        arc: (random() - 0.5) * 0.18,
        delay: 1.85 + distanceFromCenter * 0.23 + random() * 0.16,
        duration: 1.55 + random() * 0.7,
        phase: random() * TAU,
        scale: 0.82 + random() * 0.35,
      };
    });
  }

  _createShards() {
    const random = seededRandom(this.seed ^ 0x4a7f13d9);
    const count = 48;
    return Array.from({ length: count }, (_, index) => ({
      bridgeT: (index + 0.5) / count,
      group: index % 4,
      delay: random() * 0.75,
      arcX: (random() - 0.5) * 0.3,
      arcY: 0.08 + random() * 0.14,
      rotation: random() * TAU,
      spin: (random() - 0.5) * 8,
      size: 1.5 + random() * 3.2,
    }));
  }

  _createStarField() {
    const random = seededRandom(this.seed ^ 0x7857a11);
    const count = Math.round(clamp((this._width * this._height) / 7600, 88, 190));
    this._field = Array.from({ length: count }, (_, index) => ({
      x: random(),
      y: random() * 0.86,
      radius: 0.45 + random() * 1.2,
      alpha: 0.18 + random() * 0.58,
      phase: random() * TAU + index * 0.17,
      warm: random() > 0.72,
    }));
  }

  _renderAt(time, suppressProgress = false) {
    if (this._destroyed) return;
    const context = this.context;
    context.setTransform?.(1, 0, 0, 1, 0, 0);
    context.fillStyle = this.palette.nightDeep;
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform?.(this._dpr, 0, 0, this._dpr, 0, 0);

    if (this._reducedMotion) this._drawReduced(context, time);
    else this._drawCinematic(context, time);

    if (!suppressProgress) this._reportProgress(time);
  }

  _drawCinematic(context, time) {
    this._drawSky(context, time, false);

    if (time < 18.7) {
      const bridgeProgress = easeOutCubic(segment(time, 2.2, 7.1));
      this._drawShores(context, segment(time, 1.8, 4.3));
      this._drawBridgeArc(context, bridgeProgress, 1);
      this._drawMagpies(context, time, 1, false);
      this._drawActorPair(context, time, 1);
      if (time >= 17.15) this._drawFreeze(context, time);
    } else {
      const fracture = smoothstep(segment(time, 18.7, 22));
      const remaining = 1 - fracture;
      this._drawShores(context, remaining * 0.6);
      this._drawBridgeArc(context, 1, remaining);
      this._drawMagpies(context, 99, remaining, true);
      this._drawActorPair(context, 17.15, 1 - smoothstep(segment(time, 18.7, 20.15)));
      this._drawFracture(context, time);
    }

    this._drawVignette(context, time);
  }

  _drawReduced(context, time) {
    this._drawSky(context, time, true);
    const fracture = smoothstep(segment(time, 18.7, 21.8));
    const bridgeAlpha = easeOutCubic(segment(time, 2.2, 6.8)) * (1 - fracture);
    this._drawShores(context, bridgeAlpha * 0.7);
    this._drawBridgeArc(context, 1, bridgeAlpha);
    this._drawMagpies(context, 99, bridgeAlpha, true, true);

    const actorReveal = easeOutCubic(segment(time, 4.2, 5.5));
    const stateSwap = smoothstep(segment(time, 8.4, 10));
    const actorExit = 1 - smoothstep(segment(time, 18.7, 20.2));
    if (actorReveal > 0 && actorExit > 0) {
      this._drawActorPair(context, 5, actorReveal * (1 - stateSwap) * actorExit, true);
      this._drawActorPair(context, 17.15, actorReveal * stateSwap * actorExit, true);
    }

    if (time >= 17.15 && time < 18.7) this._drawFreeze(context, time, true);
    this._drawFinalStars(context, time, true);
    this._drawVignette(context, time);
  }

  _drawSky(context, time, reduced) {
    const width = this._width;
    const height = this._height;
    const reveal = easeOutCubic(segment(time, 0, 3.4));
    const fractureTint = segment(time, 18.7, 22);

    const background = context.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, this.palette.nightDeep);
    background.addColorStop(0.58, this.palette.night);
    background.addColorStop(1, fractureTint > 0.5 ? '#070b17' : '#0d101c');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(width * 0.51, height * 0.35);
    context.rotate(-0.19);
    context.scale(1, 0.29);
    const galaxy = context.createRadialGradient(0, 0, 0, 0, 0, width * 0.66);
    galaxy.addColorStop(0, 'rgba(244,239,231,' + 0.2 * reveal + ')');
    galaxy.addColorStop(0.26, 'rgba(143,185,255,' + 0.13 * reveal + ')');
    galaxy.addColorStop(0.68, 'rgba(184,165,255,' + 0.045 * reveal + ')');
    galaxy.addColorStop(1, 'rgba(5,7,17,0)');
    context.fillStyle = galaxy;
    context.beginPath();
    context.arc(0, 0, width * 0.66, 0, TAU);
    context.fill();
    context.restore();

    context.save();
    for (const star of this._field) {
      const twinkle = reduced ? 0 : Math.sin(time * 1.45 + star.phase) * 0.14;
      const alpha = clamp((star.alpha + twinkle) * reveal, 0, 0.92);
      context.fillStyle = star.warm
        ? 'rgba(245,223,174,' + alpha + ')'
        : 'rgba(235,241,255,' + alpha + ')';
      context.beginPath();
      context.arc(star.x * width, star.y * height, star.radius, 0, TAU);
      context.fill();
    }
    context.restore();

    const horizon = context.createLinearGradient(0, height * 0.58, 0, height * 0.82);
    horizon.addColorStop(0, 'rgba(232,189,104,0)');
    horizon.addColorStop(0.58, 'rgba(232,189,104,' + 0.045 * reveal + ')');
    horizon.addColorStop(1, 'rgba(232,189,104,0)');
    context.fillStyle = horizon;
    context.fillRect(0, height * 0.55, width, height * 0.3);
  }

  _bridgeMetrics() {
    const portrait = this._height > this._width * 1.25;
    return {
      from: {
        x: this._width * (portrait ? 0.08 : 0.18),
        y: this._height * (portrait ? 0.7 : 0.69),
      },
      control: {
        x: this._width * 0.5,
        y: this._height * (portrait ? 0.42 : 0.37),
      },
      to: {
        x: this._width * (portrait ? 0.92 : 0.82),
        y: this._height * (portrait ? 0.7 : 0.69),
      },
    };
  }

  _bridgePoint(amount) {
    const metrics = this._bridgeMetrics();
    return quadraticPoint(metrics.from, metrics.control, metrics.to, clamp(amount));
  }

  _bridgeTangent(amount) {
    const metrics = this._bridgeMetrics();
    return quadraticTangent(metrics.from, metrics.control, metrics.to, clamp(amount));
  }

  _drawShores(context, alpha) {
    if (alpha <= 0) return;
    const metrics = this._bridgeMetrics();
    const gradientLeft = context.createLinearGradient(0, 0, metrics.from.x, 0);
    gradientLeft.addColorStop(0, 'rgba(232,189,104,0)');
    gradientLeft.addColorStop(1, 'rgba(232,189,104,' + 0.2 * alpha + ')');
    const gradientRight = context.createLinearGradient(metrics.to.x, 0, this._width, 0);
    gradientRight.addColorStop(0, 'rgba(232,189,104,' + 0.2 * alpha + ')');
    gradientRight.addColorStop(1, 'rgba(232,189,104,0)');
    context.save();
    context.lineWidth = 1;
    context.strokeStyle = gradientLeft;
    context.beginPath();
    context.moveTo(0, metrics.from.y);
    context.lineTo(metrics.from.x, metrics.from.y);
    context.stroke();
    context.strokeStyle = gradientRight;
    context.beginPath();
    context.moveTo(metrics.to.x, metrics.to.y);
    context.lineTo(this._width, metrics.to.y);
    context.stroke();
    context.restore();
  }

  _drawBridgeArc(context, progress, alpha) {
    if (progress <= 0 || alpha <= 0) return;
    const amount = clamp(progress);
    const fromT = 0.5 - amount * 0.5;
    const toT = 0.5 + amount * 0.5;
    const drawPath = () => {
      const steps = 64;
      context.beginPath();
      for (let index = 0; index <= steps; index += 1) {
        const t = lerp(fromT, toT, index / steps);
        const point = this._bridgePoint(t);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
    };

    context.save();
    context.globalCompositeOperation = 'lighter';
    context.lineCap = 'round';
    drawPath();
    context.strokeStyle = 'rgba(232,189,104,' + 0.13 * alpha + ')';
    context.lineWidth = 12;
    context.stroke();
    drawPath();
    context.strokeStyle = 'rgba(245,223,174,' + 0.42 * alpha + ')';
    context.lineWidth = 3;
    context.stroke();
    drawPath();
    context.strokeStyle = 'rgba(255,248,223,' + 0.82 * alpha + ')';
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }

  _magpiePosition(bird, progress) {
    const start = { x: bird.startX * this._width, y: bird.startY * this._height };
    const end = this._bridgePoint(bird.targetT);
    const controlA = {
      x: bird.controlAX * this._width,
      y: bird.controlAY * this._height,
    };
    const controlB = {
      x: lerp(start.x, end.x, 0.72) + bird.arc * this._width,
      y: Math.min(start.y, end.y) - this._height * (0.13 + Math.abs(bird.arc) * 0.35),
    };
    const point = cubicPoint(start, controlA, controlB, end, progress);
    const tangent = cubicTangent(start, controlA, controlB, end, progress);
    return { point, tangent };
  }

  _drawMagpies(context, time, alpha, forceSettled = false, reduced = false) {
    if (alpha <= 0) return;
    const baseScale = clamp(Math.min(this._width / 1180, this._height / 780), 0.58, 1.08);
    for (const bird of this._birds) {
      const rawProgress = forceSettled ? 1 : segment(time, bird.delay, bird.delay + bird.duration);
      if (rawProgress <= 0) continue;
      const progress = easeOutCubic(rawProgress);
      const settled = forceSettled || rawProgress >= 1;
      const flight = this._magpiePosition(bird, progress);
      const bridgeTangent = this._bridgeTangent(bird.targetT);
      const tangent = settled ? bridgeTangent : flight.tangent;
      const rotation = Math.atan2(tangent.y, tangent.x);
      const flap = reduced || settled ? 0.12 : Math.sin(time * 11 + bird.phase) * 0.72;
      this._drawMagpie(
        context,
        flight.point.x,
        flight.point.y,
        rotation,
        baseScale * bird.scale,
        flap,
        alpha * Math.min(1, rawProgress * 2),
        settled,
      );
    }
  }

  _drawMagpie(context, x, y, rotation, scale, flap, alpha, settled) {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.scale(scale, scale);
    context.globalAlpha = alpha;
    context.globalCompositeOperation = 'source-over';

    context.fillStyle = this.palette.ink;
    context.beginPath();
    context.ellipse(0, 0, 6.8, 3.1, 0, 0, TAU);
    context.fill();
    context.beginPath();
    context.arc(5.6, -1.4, 2.3, 0, TAU);
    context.fill();

    context.strokeStyle = 'rgba(143,185,255,' + 0.72 * alpha + ')';
    context.lineWidth = 1.2;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(-4.5, 0.3);
    context.lineTo(-11.5, settled ? 2.5 : 5.8);
    context.stroke();

    const wingLift = settled ? 1.2 : 7 + flap * 4;
    context.strokeStyle = this.palette.ink;
    context.lineWidth = 2.1;
    context.beginPath();
    context.moveTo(-1.5, 0);
    context.quadraticCurveTo(-4.8, -wingLift, -10.4, -wingLift * 0.55);
    context.moveTo(0.5, 0.3);
    context.quadraticCurveTo(4.1, wingLift * 0.72, 9.4, wingLift * 0.42);
    context.stroke();

    context.fillStyle = this.palette.paper;
    context.beginPath();
    context.arc(6.25, -1.7, 0.65, 0, TAU);
    context.fill();
    context.restore();
  }

  _actorScale() {
    return clamp(Math.min(this._width / 1120, this._height / 790), 0.56, 1.08);
  }

  _actorFinalParameters() {
    const metrics = this._bridgeMetrics();
    const span = Math.max(1, metrics.to.x - metrics.from.x);
    const centerGap = clamp(98 * this._actorScale(), 52, 112);
    const gapT = clamp(centerGap / span, 0.09, 0.2);
    return { left: 0.5 - gapT / 2, right: 0.5 + gapT / 2 };
  }

  _actorState(side, time) {
    const metrics = this._bridgeMetrics();
    const scale = this._actorScale();
    const finalParameters = this._actorFinalParameters();
    const isLeft = side === 'left';
    const startX = this._width * (isLeft ? -0.03 : 1.03);
    const shoreX = isLeft ? metrics.from.x : metrics.to.x;
    const shoreY = isLeft ? metrics.from.y : metrics.to.y;
    const appearance = easeOutCubic(segment(time, 4.05, 4.75));

    if (time < 8.6) {
      const approach = easeInOutSine(segment(time, 4.2, 8.6));
      return {
        x: lerp(startX, shoreX, approach),
        y: shoreY,
        scale,
        facing: isLeft ? 1 : -1,
        walkAmount: Math.sin(Math.PI * approach) * 0.95,
        walkPhase: time * 8.2 + (isLeft ? 0 : Math.PI),
        reach: 0,
        alpha: appearance,
      };
    }

    if (time < 15) {
      const crossing = easeInOutSine(segment(time, 8.6, 15));
      const destination = isLeft ? finalParameters.left - 0.035 : finalParameters.right + 0.035;
      const bridgeT = isLeft ? lerp(0, destination, crossing) : lerp(1, destination, crossing);
      const point = this._bridgePoint(bridgeT);
      const slowdown = 1 - smoothstep(segment(crossing, 0.7, 1));
      return {
        x: point.x,
        y: point.y,
        scale,
        facing: isLeft ? 1 : -1,
        walkAmount: lerp(0.88, 0.16, 1 - slowdown),
        walkPhase: time * lerp(7.2, 3.6, 1 - slowdown) + (isLeft ? 0 : Math.PI),
        reach: 0,
        alpha: appearance,
      };
    }

    const reaching = smoothstep(segment(Math.min(time, 17.15), 15, 17.15));
    const fromT = isLeft ? finalParameters.left - 0.035 : finalParameters.right + 0.035;
    const toT = isLeft ? finalParameters.left : finalParameters.right;
    const point = this._bridgePoint(lerp(fromT, toT, reaching));
    return {
      x: point.x,
      y: point.y,
      scale,
      facing: isLeft ? 1 : -1,
      walkAmount: (1 - reaching) * 0.16,
      walkPhase: 15 * 3.6 + (isLeft ? 0 : Math.PI),
      reach: reaching,
      alpha: appearance,
    };
  }

  _drawActorPair(context, time, alpha, staticPose = false) {
    if (alpha <= 0 || time < 4.05) return;
    const left = this._actorState('left', time);
    const right = this._actorState('right', time);
    if (staticPose) {
      left.walkAmount = 0;
      right.walkAmount = 0;
    }
    left.alpha *= alpha;
    right.alpha *= alpha;
    this._drawPerson(context, left, false);
    this._drawPerson(context, right, true);
    if (left.reach > 0.72 && right.reach > 0.72) {
      this._drawHandSpark(context, left, right, Math.min(left.reach, right.reach) * alpha);
    }
  }

  _drawPerson(context, state, isWeaver) {
    if (state.alpha <= 0) return;
    const stride = Math.sin(state.walkPhase) * state.walkAmount;
    const counterStride = Math.sin(state.walkPhase + Math.PI) * state.walkAmount;
    const bob = Math.abs(Math.sin(state.walkPhase)) * 2.2 * state.walkAmount;
    const robeColor = isWeaver ? this.palette.red : '#6e5367';
    const accentColor = isWeaver ? this.palette.goldSoft : this.palette.blue;

    context.save();
    context.translate(state.x, state.y - bob * state.scale);
    context.scale(state.facing * state.scale, state.scale);
    context.globalAlpha = state.alpha;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    context.shadowColor = 'rgba(0,0,0,0.28)';
    context.shadowBlur = 18;
    context.shadowOffsetY = 12;

    context.strokeStyle = this.palette.ink;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-4, -2);
    context.lineTo(-14 - stride * 10, 34);
    context.moveTo(4, -2);
    context.lineTo(15 - counterStride * 10, 34);
    context.stroke();

    context.fillStyle = robeColor;
    context.beginPath();
    context.moveTo(-13, -49);
    context.quadraticCurveTo(0, -56, 13, -49);
    context.lineTo(18, 4);
    context.quadraticCurveTo(0, 11, -18, 4);
    context.closePath();
    context.fill();

    context.shadowColor = 'transparent';
    context.strokeStyle = this.palette.ink;
    context.lineWidth = 3.6;
    const frontReach = state.reach;
    const frontElbow = {
      x: lerp(18 + stride * 6, 27, frontReach),
      y: lerp(-28 - stride * 4, -34, frontReach),
    };
    const frontHand = {
      x: lerp(31 + stride * 9, 49, frontReach),
      y: lerp(-17 - stride * 5, -38, frontReach),
    };
    context.beginPath();
    context.moveTo(8, -43);
    context.lineTo(frontElbow.x, frontElbow.y);
    context.lineTo(frontHand.x, frontHand.y);
    context.moveTo(-8, -42);
    context.lineTo(-19 - counterStride * 7, -27 + counterStride * 4);
    context.lineTo(-28 - counterStride * 9, -13 + counterStride * 5);
    context.stroke();

    context.fillStyle = this.palette.ink;
    context.beginPath();
    context.arc(0, -70, 15.5, 0, TAU);
    context.fill();

    if (isWeaver) {
      context.beginPath();
      context.arc(-8, -84, 6.2, 0, TAU);
      context.fill();
      context.strokeStyle = accentColor;
      context.lineWidth = 1.4;
      context.beginPath();
      context.arc(0, -70, 18.5, Math.PI * 1.1, Math.PI * 1.88);
      context.stroke();
    } else {
      context.strokeStyle = accentColor;
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(-12, -81);
      context.quadraticCurveTo(0, -92, 12, -81);
      context.stroke();
    }

    context.fillStyle = this.palette.paper;
    context.beginPath();
    context.arc(5.2, -72, 1.45, 0, TAU);
    context.fill();

    context.fillStyle = accentColor;
    context.globalAlpha = state.alpha * 0.72;
    context.beginPath();
    context.arc(frontHand.x, frontHand.y, 2.1, 0, TAU);
    context.fill();
    context.restore();
  }

  _drawHandSpark(context, left, right, alpha) {
    const leftHandX = left.x + 49 * left.scale;
    const rightHandX = right.x - 49 * right.scale;
    const x = (leftHandX + rightHandX) / 2;
    const y = (left.y - 38 * left.scale + right.y - 38 * right.scale) / 2;
    const intensity = smoothstep(segment(alpha, 0.72, 1));
    context.save();
    context.globalCompositeOperation = 'lighter';
    const glow = context.createRadialGradient(x, y, 0, x, y, 28 + 22 * intensity);
    glow.addColorStop(0, 'rgba(255,248,223,' + 0.95 * intensity + ')');
    glow.addColorStop(0.28, 'rgba(232,189,104,' + 0.55 * intensity + ')');
    glow.addColorStop(1, 'rgba(232,189,104,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, 50, 0, TAU);
    context.fill();
    context.restore();
  }

  _drawFreeze(context, time, reduced = false) {
    const flash = 1 - smoothstep(segment(time, 17.15, 17.52));
    const hold = segment(time, 17.15, 18.7);
    context.save();
    context.fillStyle = 'rgba(244,239,231,' + flash * (reduced ? 0.08 : 0.18) + ')';
    context.fillRect(0, 0, this._width, this._height);
    context.globalAlpha = reduced ? 0.035 : 0.055 + hold * 0.035;
    context.fillStyle = this.palette.paper;
    const spacing = reduced ? 9 : 7;
    for (let y = 0; y < this._height; y += spacing) {
      context.fillRect(0, y, this._width, 0.6);
    }
    context.restore();
  }

  _starTargets() {
    const portrait = this._height > this._width * 1.25;
    if (portrait) {
      return [
        { x: this._width * 0.31, y: this._height * 0.46 },
        { x: this._width * 0.69, y: this._height * 0.46 },
        { x: this._width * 0.36, y: this._height * 0.62 },
        { x: this._width * 0.64, y: this._height * 0.62 },
      ];
    }
    return [
      { x: this._width * 0.38, y: this._height * 0.45 },
      { x: this._width * 0.62, y: this._height * 0.45 },
      { x: this._width * 0.43, y: this._height * 0.62 },
      { x: this._width * 0.57, y: this._height * 0.62 },
    ];
  }

  _starTargetDetails() {
    const targets = this._starTargets();
    const colors = [this.palette.blue, this.palette.red, this.palette.violet, this.palette.mint];
    return targets.map((target, index) => ({
      name: STAR_NAMES[index],
      color: colors[index],
      x: target.x,
      y: target.y,
      normalizedX: target.x / this._width,
      normalizedY: target.y / this._height,
    }));
  }

  _drawFracture(context, time) {
    const targets = this._starTargets();
    const colors = [this.palette.blue, this.palette.red, this.palette.violet, this.palette.mint];
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const shard of this._shards) {
      const progress = smoothstep(segment(time, 18.7 + shard.delay * 0.55, 21.25 + shard.delay * 0.55));
      if (progress <= 0 || progress >= 1) continue;
      const start = this._bridgePoint(shard.bridgeT);
      const target = targets[shard.group];
      const control = {
        x: lerp(start.x, target.x, 0.44) + shard.arcX * this._width,
        y: Math.min(start.y, target.y) - shard.arcY * this._height,
      };
      const point = quadraticPoint(start, control, target, progress);
      const opacity = Math.sin(Math.PI * progress) * 0.86;
      context.save();
      context.translate(point.x, point.y);
      context.rotate(shard.rotation + progress * shard.spin);
      context.fillStyle = this._colorWithAlpha(colors[shard.group], opacity);
      context.beginPath();
      context.moveTo(0, -shard.size * 1.8);
      context.lineTo(shard.size * 0.72, 0);
      context.lineTo(0, shard.size * 1.8);
      context.lineTo(-shard.size * 0.72, 0);
      context.closePath();
      context.fill();
      context.restore();
    }
    context.restore();
    this._drawFinalStars(context, time, false);
  }

  _drawFinalStars(context, time, reduced) {
    const targets = this._starTargets();
    const colors = [this.palette.blue, this.palette.red, this.palette.violet, this.palette.mint];
    const baseProgress = segment(time, reduced ? 19.2 : 20.15, reduced ? 22 : 21.85);
    if (baseProgress <= 0) return;

    const orbit = reduced ? 0 : Math.max(0, time - 21.2) * 0.18;
    const centerX = this._width * 0.5;
    const centerY = this._height * 0.535;
    context.save();
    context.globalCompositeOperation = 'lighter';
    if (baseProgress > 0.72) {
      context.strokeStyle = 'rgba(232,189,104,' + 0.13 * baseProgress + ')';
      context.lineWidth = 1;
      context.beginPath();
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        if (index === 0) context.moveTo(target.x, target.y);
        else context.lineTo(target.x, target.y);
      }
      context.closePath();
      context.stroke();
    }

    targets.forEach((target, index) => {
      const progress = easeOutCubic(segment(baseProgress, index * 0.06, 0.72 + index * 0.06));
      if (progress <= 0) return;
      const orbitRadius = reduced ? 0 : Math.sin(orbit + index * Math.PI * 0.5) * 2.2;
      const x = target.x + orbitRadius;
      const y = target.y + (reduced ? 0 : Math.cos(orbit + index) * 1.8);
      this._drawStarGlyph(context, x, y, 9 + progress * 9, colors[index], progress, orbit + index);

      if (baseProgress > 0.84) {
        context.save();
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = smoothstep(segment(baseProgress, 0.84, 1));
        context.fillStyle = this.palette.paperMuted;
        context.font = '500 ' + clamp(this._width / 115, 9, 12) + 'px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'top';
        context.fillText(STAR_NAMES[index], x, y + 27);
        context.restore();
      }
    });

    if (!reduced && baseProgress > 0.9) {
      context.strokeStyle = 'rgba(143,185,255,' + 0.1 * baseProgress + ')';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(centerX, centerY, Math.min(this._width, this._height) * 0.145, orbit, orbit + Math.PI * 1.42);
      context.stroke();
    }
    context.restore();
  }

  _drawStarGlyph(context, x, y, radius, color, alpha, rotation) {
    context.save();
    const glow = context.createRadialGradient(x, y, 0, x, y, radius * 3.4);
    glow.addColorStop(0, this._colorWithAlpha(color, 0.72 * alpha));
    glow.addColorStop(0.22, this._colorWithAlpha(color, 0.28 * alpha));
    glow.addColorStop(1, this._colorWithAlpha(color, 0));
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius * 3.4, 0, TAU);
    context.fill();

    context.translate(x, y);
    context.rotate(rotation * 0.22);
    context.fillStyle = this._colorWithAlpha(color, alpha);
    context.beginPath();
    const points = 8;
    for (let index = 0; index < points; index += 1) {
      const angle = -Math.PI / 2 + (index / points) * TAU;
      const pointRadius = index % 2 === 0 ? radius : radius * 0.26;
      const pointX = Math.cos(angle) * pointRadius;
      const pointY = Math.sin(angle) * pointRadius;
      if (index === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.closePath();
    context.fill();
    context.restore();
  }

  _drawVignette(context, time) {
    const width = this._width;
    const height = this._height;
    const vignette = context.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.16,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    const darken = 0.28 + segment(time, 17.15, 18.7) * 0.08;
    vignette.addColorStop(0, 'rgba(1,2,8,0)');
    vignette.addColorStop(0.72, 'rgba(1,2,8,0.08)');
    vignette.addColorStop(1, 'rgba(1,2,8,' + darken + ')');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }

  _colorWithAlpha(color, alpha) {
    const normalized = String(color).trim();
    const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(normalized);
    if (!match) return normalized;
    let hex = match[1];
    if (hex.length === 3) hex = hex.split('').map((character) => character + character).join('');
    const number = Number.parseInt(hex, 16);
    const red = (number >> 16) & 255;
    const green = (number >> 8) & 255;
    const blue = number & 255;
    return 'rgba(' + red + ',' + green + ',' + blue + ',' + clamp(alpha) + ')';
  }
}

export default CinematicStage;
