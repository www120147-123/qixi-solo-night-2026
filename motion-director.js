import { gsap } from 'gsap';

const DEFAULT_SELECTORS = Object.freeze({
  scene: '.scene',
  sceneCopy: '[data-motion-enter], .scene-content > *',
  arc: '.story-arc',
  player: '[data-fullscreen-player], .fullscreen-player, .media-modal',
  playerPanel: '[data-player-panel], .player-panel, video',
  playerVideo: 'video',
  playerTitle: '[data-player-title], .player-title, .media-modal p',
  mediaCards: '[data-media-card], .media-card, .media-tile',
  mediaCenter: '[data-media-center], .center-media',
  mediaTrigger: '[data-media-trigger], .stage-trigger, .media-core',
  finaleScene: '.outro-scene',
  finaleLabel: '[data-finale-label]',
  finaleMessage: '[data-finale-message]',
});

const DEFAULT_TIMING = Object.freeze({
  sceneExit: 0.56,
  sceneEnter: 0.88,
  sceneOverlap: 0.14,
  copyStagger: 0.055,
  arc: 1.05,
  media: 1.05,
  mediaStagger: 0.035,
  player: 0.62,
  finale: 1.05,
});

const TRANSFORM_KEYS = new Set([
  'x', 'y', 'xPercent', 'yPercent', 'scale', 'scaleX', 'scaleY',
  'rotation', 'rotationX', 'rotationY', 'skewX', 'skewY',
  'transformOrigin', 'force3D', 'opacity', 'autoAlpha',
]);

const isQueryable = (value) => Boolean(value?.querySelector);
const isElementLike = (value) => Boolean(value && typeof value === 'object' && value.nodeType === 1);
const compact = (items) => items.filter(Boolean);

function resolveOne(root, value) {
  if (!value) return null;
  if (isElementLike(value) || value?.nodeType === 9) return value;
  if (typeof value !== 'string' || !isQueryable(root)) return null;
  try { return root.querySelector(value); } catch (_) { return null; }
}

function resolveMany(root, value) {
  if (!value) return [];
  if (typeof value === 'string' && isQueryable(root)) {
    try { return [...root.querySelectorAll(value)]; } catch (_) { return []; }
  }
  if (isElementLike(value)) return [value];
  if (typeof value[Symbol.iterator] === 'function') return compact([...value]);
  return [];
}

function dataValue(element, names) {
  for (const name of names) {
    const value = element?.dataset?.[name];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function eventPoint(event) {
  if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
    return { x: event.clientX, y: event.clientY };
  }
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const height = typeof window === 'undefined' ? 720 : window.innerHeight;
  return { x: width / 2, y: height * 0.78 };
}

export class MotionDirector {
  constructor({
    root = typeof document === 'undefined' ? null : document,
    engine = gsap,
    selectors = {},
    timing = {},
    activeClass = 'is-active',
    reducedMotion,
    arcStates = {},
  } = {}) {
    if (!root || !isQueryable(root)) throw new Error('MotionDirector requires a queryable DOM root.');

    this.root = root;
    this.engine = engine;
    this.selectors = { ...DEFAULT_SELECTORS, ...selectors };
    this.timing = { ...DEFAULT_TIMING, ...timing };
    this.activeClass = activeClass;
    this.timelines = new Map();
    this.arcStates = new Map(Object.entries(arcStates));
    this.mediaStates = new WeakMap();
    this.finaleStates = new WeakMap();
    this.disposers = [];
    this.createdWipes = new Set();

    this.motionQuery = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    this.reducedMotion = reducedMotion ?? Boolean(this.motionQuery?.matches);
    this._onMotionPreference = (event) => this.setReducedMotion(event.matches);
    this.motionQuery?.addEventListener?.('change', this._onMotionPreference);
  }

  resolve(value, scope = this.root) {
    return resolveOne(scope, value);
  }

  resolveAll(value, scope = this.root) {
    return resolveMany(scope, value);
  }

  duration(value) {
    return this.reducedMotion ? 0 : Math.max(0, finiteNumber(value, 0));
  }

  stagger(value) {
    return this.reducedMotion ? 0 : Math.max(0, finiteNumber(value, 0));
  }

  createTimeline(key, vars = {}) {
    this.kill(key);
    const timeline = this.engine.timeline({
      defaults: { ease: 'power3.out' },
      ...vars,
    });
    this.timelines.set(key, timeline);
    return timeline;
  }

  getTimeline(key) {
    return this.timelines.get(key) ?? null;
  }

  pause(key) {
    if (key) this.timelines.get(key)?.pause();
    else this.timelines.forEach((timeline) => timeline.pause());
    return this;
  }

  resume(key) {
    if (key) this.timelines.get(key)?.resume();
    else this.timelines.forEach((timeline) => timeline.resume());
    return this;
  }

  pauseAll() {
    return this.pause();
  }

  resumeAll() {
    return this.resume();
  }

  kill(key) {
    const timeline = this.timelines.get(key);
    timeline?.kill();
    this.timelines.delete(key);
    return this;
  }

  killAll() {
    this.timelines.forEach((timeline) => timeline.kill());
    this.timelines.clear();
    return this;
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
    if (this.reducedMotion) {
      this.timelines.forEach((timeline) => {
        if (timeline.isActive()) timeline.progress(1);
      });
    }
    return this;
  }

  transitionScenes(from, to, {
    key = 'scene',
    direction = 1,
    axis = 'x',
    manageClass = true,
    copy = this.selectors.sceneCopy,
    paused = false,
    onStart,
    onComplete,
  } = {}) {
    const fromScene = this.resolve(from);
    const toScene = this.resolve(to);
    if (!fromScene && !toScene) return null;
    if (fromScene && fromScene === toScene) return this.enterScene(toScene, { key, paused, onComplete });

    const timeline = this.createTimeline(key, { paused });
    const directionSign = direction < 0 ? -1 : 1;
    const useVerticalAxis = axis === 'y';
    const enterOffset = useVerticalAxis ? { yPercent: directionSign * 1.5 } : { xPercent: directionSign * 1.5 };
    const exitOffset = useVerticalAxis ? { yPercent: directionSign * -1.1 } : { xPercent: directionSign * -1.1 };
    const exitDuration = this.duration(this.timing.sceneExit);
    const enterDuration = this.duration(this.timing.sceneEnter);
    const overlap = this.duration(this.timing.sceneOverlap);
    const enteringCopy = toScene ? this.resolveAll(copy, toScene) : [];
    const scenes = compact([fromScene, toScene]);

    onStart?.({ from: fromScene, to: toScene, timeline });
    if (toScene) {
      if (manageClass) toScene.classList.add(this.activeClass);
      toScene.setAttribute('aria-hidden', 'false');
    }

    timeline.set(scenes, { transition: 'none', willChange: 'transform, opacity' }, 0);
    if (toScene) {
      timeline.set(toScene, { visibility: 'visible', pointerEvents: 'auto' }, 0);
      timeline.fromTo(toScene, {
        autoAlpha: 0,
        scale: 1.025,
        ...enterOffset,
      }, {
        autoAlpha: 1,
        scale: 1,
        ...(useVerticalAxis ? { yPercent: 0 } : { xPercent: 0 }),
        duration: enterDuration,
        ease: 'power4.out',
        force3D: true,
      }, overlap);
    }

    if (fromScene) {
      timeline.to(fromScene, {
        autoAlpha: 0,
        scale: 0.985,
        ...exitOffset,
        pointerEvents: 'none',
        duration: exitDuration,
        ease: 'power2.inOut',
        force3D: true,
      }, 0);
    }

    if (enteringCopy.length) {
      timeline.fromTo(enteringCopy, {
        autoAlpha: 0,
        y: 22,
      }, {
        autoAlpha: 1,
        y: 0,
        duration: this.duration(0.62),
        stagger: this.stagger(this.timing.copyStagger),
        ease: 'power3.out',
      }, overlap + this.duration(0.12));
    }

    timeline.call(() => {
      if (fromScene) {
        if (manageClass) fromScene.classList.remove(this.activeClass);
        fromScene.setAttribute('aria-hidden', 'true');
      }
      this.engine.set(scenes, { clearProps: 'transition,willChange,visibility,opacity,transform,pointerEvents' });
      onComplete?.({ from: fromScene, to: toScene, timeline });
    });

    return timeline;
  }

  enterScene(scene, options = {}) {
    return this.transitionScenes(null, scene, { ...options, direction: options.direction ?? 1 });
  }

  exitScene(scene, options = {}) {
    return this.transitionScenes(scene, null, { ...options, direction: options.direction ?? 1 });
  }

  registerArcState(name, vars) {
    if (!name || !vars) return this;
    this.arcStates.set(name, { ...vars });
    return this;
  }

  unregisterArcState(name) {
    this.arcStates.delete(name);
    return this;
  }

  arcTo(state, {
    arc = this.selectors.arc,
    key = 'story-arc',
    duration = this.timing.arc,
    ease = 'power4.inOut',
    paused = false,
    onComplete,
  } = {}) {
    const arcElement = this.resolve(arc);
    const source = typeof state === 'string' ? this.arcStates.get(state) : state;
    if (!arcElement || !source) return null;

    const vars = {};
    for (const [property, value] of Object.entries(source)) {
      if (TRANSFORM_KEYS.has(property)) vars[property] = value;
    }
    if ('opacity' in vars && !('autoAlpha' in vars)) {
      vars.autoAlpha = vars.opacity;
      delete vars.opacity;
    }

    const timeline = this.createTimeline(key, { paused });
    timeline.set(arcElement, { willChange: 'transform, opacity' }, 0);
    timeline.to(arcElement, {
      ...vars,
      duration: this.duration(duration),
      ease,
      force3D: true,
      overwrite: 'auto',
    }, 0);
    timeline.call(() => {
      this.engine.set(arcElement, { clearProps: 'willChange' });
      onComplete?.({ arc: arcElement, timeline });
    });
    return timeline;
  }

  moveArcTo(target, {
    arc = this.selectors.arc,
    key = 'story-arc',
    duration = this.timing.arc,
    ease = 'power4.inOut',
    scaleX = 1,
    scaleY = 1,
    rotation,
    skewX,
    opacity = 1,
    paused = false,
    onComplete,
  } = {}) {
    const arcElement = this.resolve(arc);
    const targetElement = this.resolve(target);
    const targetRect = targetElement?.getBoundingClientRect?.() ?? target;
    if (!arcElement || !targetRect || !Number.isFinite(targetRect.width)) return null;

    const arcRect = arcElement.getBoundingClientRect();
    const arcCenterX = arcRect.left + arcRect.width / 2;
    const arcCenterY = arcRect.top + arcRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const currentX = finiteNumber(this.engine.getProperty(arcElement, 'x'), 0);
    const currentY = finiteNumber(this.engine.getProperty(arcElement, 'y'), 0);
    const currentScaleX = finiteNumber(this.engine.getProperty(arcElement, 'scaleX'), 1);
    const currentScaleY = finiteNumber(this.engine.getProperty(arcElement, 'scaleY'), 1);
    const fitX = arcRect.width > 0 ? targetRect.width / arcRect.width : 1;
    const fitY = arcRect.height > 0 ? targetRect.height / arcRect.height : 1;

    return this.arcTo({
      x: currentX + targetCenterX - arcCenterX,
      y: currentY + targetCenterY - arcCenterY,
      scaleX: currentScaleX * fitX * scaleX,
      scaleY: currentScaleY * fitY * scaleY,
      rotation: rotation ?? finiteNumber(this.engine.getProperty(arcElement, 'rotation'), 0),
      skewX: skewX ?? finiteNumber(this.engine.getProperty(arcElement, 'skewX'), 0),
      autoAlpha: opacity,
      transformOrigin: '50% 50%',
    }, { arc: arcElement, key, duration, ease, paused, onComplete });
  }

  _mediaParts(stage, options = {}) {
    const stageElement = this.resolve(stage);
    if (!stageElement) return null;

    let cards = this.resolveAll(options.cards ?? this.selectors.mediaCards, stageElement);
    if (!cards.length) {
      const stack = this.resolve('.media-stack', stageElement) ?? stageElement;
      cards = [...stack.children].filter((child) => !child.matches?.(this.selectors.mediaCenter));
    }
    const center = this.resolve(options.center ?? this.selectors.mediaCenter, stageElement);
    const trigger = this.resolve(options.trigger ?? this.selectors.mediaTrigger, stageElement);
    if (center) cards = cards.filter((card) => card !== center && !center.contains(card));
    return { stage: stageElement, cards, center, trigger };
  }

  _mediaLayout(parts, options = {}) {
    const { stage, cards } = parts;
    const rect = stage.getBoundingClientRect();
    const count = Math.max(cards.length, 1);
    const radiusX = finiteNumber(options.radiusX, Math.min(rect.width * 0.34, 260));
    const radiusY = finiteNumber(options.radiusY, Math.min(rect.height * 0.29, 180));
    const supplied = typeof options.positions === 'function'
      ? cards.map((card, index) => options.positions(card, index, cards))
      : options.positions;

    return cards.map((card, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
      const item = supplied?.[index] ?? {};
      return {
        x: item.x ?? dataValue(card, ['motionX', 'scatterX', 'x']) ?? Math.cos(angle) * radiusX,
        y: item.y ?? dataValue(card, ['motionY', 'scatterY', 'y']) ?? Math.sin(angle) * radiusY,
        rotation: item.rotation ?? finiteNumber(dataValue(card, ['motionRotation', 'rotation']), (index % 2 ? 1 : -1) * (5 + index * 0.8)),
        scale: item.scale ?? finiteNumber(dataValue(card, ['motionScale', 'scale']), 0.82),
      };
    });
  }

  prepareMedia(stage, options = {}) {
    const parts = this._mediaParts(stage, options);
    if (!parts) return null;
    const { stage: stageElement, cards, center, trigger } = parts;
    const middle = (cards.length - 1) / 2;

    this.engine.set(cards, {
      x: 0,
      y: 0,
      rotation: (index) => (index - middle) * 1.8,
      scale: 0.72,
      autoAlpha: 0.78,
      transformOrigin: '50% 50%',
      force3D: true,
    });
    if (center) this.engine.set(center, { autoAlpha: 0, scale: 0.08, rotationY: 35, transformPerspective: 1200, force3D: true });
    if (trigger) this.engine.set(trigger, { autoAlpha: 1, scale: 1 });
    stageElement.dataset.motionState = 'closed';
    this.mediaStates.set(stageElement, { ...parts, options });
    return parts;
  }

  explodeMedia(stage, {
    key,
    duration = this.timing.media,
    stagger = this.timing.mediaStagger,
    paused = false,
    onStart,
    onComplete,
    ...options
  } = {}) {
    const parts = this.prepareMedia(stage, options);
    if (!parts) return null;
    const { stage: stageElement, cards, center, trigger } = parts;
    const layout = this._mediaLayout(parts, options);
    const timelineKey = key ?? `media:${stageElement.id || stageElement.dataset.scene || 'stage'}`;
    const timeline = this.createTimeline(timelineKey, { paused });

    onStart?.({ stage: stageElement, timeline });
    timeline.set(compact([...cards, center]), { willChange: 'transform, opacity' }, 0);
    if (trigger) {
      timeline.to(trigger, {
        autoAlpha: 0,
        scale: 0.58,
        pointerEvents: 'none',
        duration: this.duration(0.42),
        ease: 'power2.in',
      }, 0);
    }
    if (cards.length) {
      timeline.to(cards, {
        x: (index) => layout[index].x,
        y: (index) => layout[index].y,
        rotation: (index) => layout[index].rotation,
        scale: (index) => layout[index].scale,
        autoAlpha: 1,
        duration: this.duration(duration),
        stagger: this.stagger(stagger),
        ease: 'power4.out',
        force3D: true,
      }, 0);
    }
    if (center) {
      timeline.to(center, {
        autoAlpha: 1,
        scale: 1,
        rotationY: 0,
        duration: this.duration(duration),
        ease: 'power4.out',
        force3D: true,
      }, this.duration(0.28));
    }
    timeline.call(() => {
      stageElement.dataset.motionState = 'open';
      this.engine.set(compact([...cards, center]), { clearProps: 'willChange' });
      onComplete?.({ stage: stageElement, timeline });
    });
    this.mediaStates.set(stageElement, { ...parts, options, key: timelineKey, layout });
    return timeline;
  }

  implodeMedia(stage, {
    key,
    duration = 0.72,
    paused = false,
    onComplete,
    ...options
  } = {}) {
    const parts = this._mediaParts(stage, options);
    if (!parts) return null;
    const { stage: stageElement, cards, center, trigger } = parts;
    const timelineKey = key ?? `media:${stageElement.id || stageElement.dataset.scene || 'stage'}`;
    const timeline = this.createTimeline(timelineKey, { paused });

    timeline.set(compact([...cards, center]), { willChange: 'transform, opacity' }, 0);
    if (cards.length) {
      timeline.to(cards, {
        x: 0,
        y: 0,
        rotation: (index) => (index - (cards.length - 1) / 2) * 1.8,
        scale: 0.72,
        autoAlpha: 0.78,
        duration: this.duration(duration),
        stagger: this.stagger(0.025),
        ease: 'power3.inOut',
        force3D: true,
      }, 0);
    }
    if (center) {
      timeline.to(center, {
        autoAlpha: 0,
        scale: 0.08,
        rotationY: 35,
        duration: this.duration(duration * 0.8),
        ease: 'power3.in',
        force3D: true,
      }, 0);
    }
    if (trigger) {
      timeline.to(trigger, {
        autoAlpha: 1,
        scale: 1,
        pointerEvents: 'auto',
        duration: this.duration(0.46),
        ease: 'power3.out',
      }, this.duration(duration * 0.45));
    }
    timeline.call(() => {
      stageElement.dataset.motionState = 'closed';
      this.engine.set(compact([...cards, center]), { clearProps: 'willChange' });
      onComplete?.({ stage: stageElement, timeline });
    });
    return timeline;
  }

  toggleMedia(stage, open, options = {}) {
    const stageElement = this.resolve(stage);
    if (!stageElement) return null;
    const shouldOpen = open ?? stageElement.dataset.motionState !== 'open';
    return shouldOpen ? this.explodeMedia(stageElement, options) : this.implodeMedia(stageElement, options);
  }

  openPlayer({
    player = this.selectors.player,
    panel = this.selectors.playerPanel,
    video = this.selectors.playerVideo,
    titleTarget = this.selectors.playerTitle,
    source,
    poster,
    title,
    currentTime = 0,
    autoplay = true,
    key = 'player',
    paused = false,
    onOpen,
  } = {}) {
    const playerElement = this.resolve(player);
    if (!playerElement) return null;
    const panelElement = this.resolve(panel, playerElement) ?? playerElement.firstElementChild;
    const videoElement = this.resolve(video, playerElement);
    const titleElement = this.resolve(titleTarget, playerElement);

    if (videoElement && source) {
      videoElement.src = source;
      if (poster !== undefined) videoElement.poster = poster;
      videoElement.load?.();
    }
    if (titleElement && title !== undefined) titleElement.textContent = title;
    playerElement.classList.add('is-open');
    playerElement.setAttribute('aria-hidden', 'false');
    playerElement.inert = false;

    const timeline = this.createTimeline(key, { paused });
    timeline.set(playerElement, { visibility: 'visible', pointerEvents: 'auto', willChange: 'opacity' }, 0);
    timeline.fromTo(playerElement, { autoAlpha: 0 }, {
      autoAlpha: 1,
      duration: this.duration(this.timing.player),
      ease: 'power2.out',
    }, 0);
    if (panelElement) {
      timeline.fromTo(panelElement, { autoAlpha: 0, y: 28, scale: 0.965 }, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: this.duration(this.timing.player),
        ease: 'power4.out',
        force3D: true,
      }, this.duration(0.08));
    }
    timeline.call(() => {
      this.engine.set(playerElement, { clearProps: 'willChange' });
      if (videoElement) {
        try { videoElement.currentTime = Math.max(0, finiteNumber(currentTime, 0)); } catch (_) {}
        if (autoplay) videoElement.play?.().catch?.(() => {});
      }
      onOpen?.({ player: playerElement, video: videoElement, timeline });
    });
    return timeline;
  }

  closePlayer({
    player = this.selectors.player,
    panel = this.selectors.playerPanel,
    video = this.selectors.playerVideo,
    clearSource = false,
    key = 'player',
    paused = false,
    onClose,
  } = {}) {
    const playerElement = this.resolve(player);
    if (!playerElement) return null;
    const panelElement = this.resolve(panel, playerElement) ?? playerElement.firstElementChild;
    const videoElement = this.resolve(video, playerElement);
    videoElement?.pause?.();

    const timeline = this.createTimeline(key, { paused });
    if (panelElement) {
      timeline.to(panelElement, {
        autoAlpha: 0,
        y: 20,
        scale: 0.975,
        duration: this.duration(0.42),
        ease: 'power2.in',
        force3D: true,
      }, 0);
    }
    timeline.to(playerElement, {
      autoAlpha: 0,
      duration: this.duration(0.48),
      ease: 'power2.inOut',
    }, 0);
    timeline.call(() => {
      playerElement.classList.remove('is-open');
      playerElement.setAttribute('aria-hidden', 'true');
      playerElement.inert = true;
      this.engine.set(compact([playerElement, panelElement]), { clearProps: 'visibility,opacity,transform,pointerEvents' });
      if (videoElement && clearSource) {
        videoElement.removeAttribute('src');
        videoElement.load?.();
      }
      onClose?.({ player: playerElement, video: videoElement, timeline });
    });
    return timeline;
  }

  togglePlayer(open, options = {}) {
    const player = this.resolve(options.player ?? this.selectors.player);
    if (!player) return null;
    const shouldOpen = open ?? !player.classList.contains('is-open');
    return shouldOpen ? this.openPlayer({ ...options, player }) : this.closePlayer({ ...options, player });
  }

  bindPlayer({
    openers = '[data-player-open]',
    closers = '[data-player-close]',
    player = this.selectors.player,
    payload,
  } = {}) {
    const openerElements = this.resolveAll(openers);
    const closerElements = this.resolveAll(closers);
    openerElements.forEach((opener) => {
      this.listen(opener, 'click', (event) => {
        const values = payload?.(opener, event) ?? {
          source: opener.dataset.playerSource,
          title: opener.dataset.playerTitle,
          currentTime: finiteNumber(opener.dataset.playerTime, 0),
        };
        this.openPlayer({ player, ...values });
      });
    });
    closerElements.forEach((closer) => this.listen(closer, 'click', () => this.closePlayer({ player })));
    return this;
  }

  handleFinaleClick(event, {
    scene = this.selectors.finaleScene,
    trigger = event?.currentTarget,
    labelTarget = this.selectors.finaleLabel,
    armedLabel,
    ...options
  } = {}) {
    const sceneElement = this.resolve(scene);
    const triggerElement = this.resolve(trigger);
    if (!sceneElement || !triggerElement) return { stage: 'missing', timeline: null };

    const existing = this.finaleStates.get(sceneElement);
    if (!existing?.armed) {
      const labelElement = this.resolve(labelTarget, triggerElement);
      const state = {
        armed: true,
        trigger: triggerElement,
        label: labelElement,
        originalLabel: labelElement?.textContent,
        wipe: null,
        collapseTargets: [],
      };
      this.finaleStates.set(sceneElement, state);
      triggerElement.dataset.finaleArmed = 'true';
      if (armedLabel && labelElement) labelElement.textContent = armedLabel;
      else if (armedLabel) triggerElement.setAttribute('aria-label', armedLabel);

      const timeline = this.createTimeline('finale:arm');
      timeline.to(triggerElement, {
        x: 5,
        y: -2,
        scale: 1.035,
        duration: this.duration(0.22),
        ease: 'power2.out',
      }).to(triggerElement, {
        x: 0,
        y: 0,
        scale: 1,
        duration: this.duration(0.34),
        ease: 'elastic.out(1, 0.55)',
      });
      options.onArmed?.({ scene: sceneElement, trigger: triggerElement, timeline });
      return { stage: 'armed', timeline };
    }

    return {
      stage: 'collapsing',
      timeline: this.collapseFinale({
        ...options,
        scene: sceneElement,
        trigger: triggerElement,
        point: eventPoint(event),
      }),
    };
  }

  _createFinaleWipe({ point, color = '#fff', className = 'finale-wipe', zIndex = 3000 } = {}) {
    if (typeof document === 'undefined') return null;
    const { x, y } = point ?? eventPoint();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const radius = Math.max(
      Math.hypot(x, y),
      Math.hypot(width - x, y),
      Math.hypot(x, height - y),
      Math.hypot(width - x, height - y),
    );
    const wipe = document.createElement('div');
    wipe.className = className;
    wipe.setAttribute('aria-hidden', 'true');
    Object.assign(wipe.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: `${radius * 2}px`,
      height: `${radius * 2}px`,
      borderRadius: '50%',
      background: color,
      pointerEvents: 'none',
      zIndex: String(zIndex),
      transformOrigin: '50% 50%',
    });
    document.body.appendChild(wipe);
    this.createdWipes.add(wipe);
    return wipe;
  }

  collapseFinale({
    scene = this.selectors.finaleScene,
    trigger,
    collapseTargets = ':scope > *',
    globalTargets,
    wipe,
    point,
    wipeColor = '#fff',
    message = this.selectors.finaleMessage,
    key = 'finale:collapse',
    paused = false,
    onComplete,
  } = {}) {
    const sceneElement = this.resolve(scene);
    if (!sceneElement) return null;
    const state = this.finaleStates.get(sceneElement) ?? {};
    const messageElement = this.resolve(message);
    const wipeElement = this.resolve(wipe) ?? this._createFinaleWipe({ point, color: wipeColor });
    const localTargets = this.resolveAll(collapseTargets, sceneElement);
    const extraTargets = this.resolveAll(globalTargets);
    const targets = [...new Set([...localTargets, ...extraTargets])]
      .filter((target) => target !== wipeElement && target !== messageElement && !target.contains?.(wipeElement));
    state.wipe = wipeElement;
    state.collapseTargets = targets;
    state.trigger = this.resolve(trigger) ?? state.trigger;
    this.finaleStates.set(sceneElement, state);

    const timeline = this.createTimeline(key, { paused });
    if (wipeElement) {
      timeline.set(wipeElement, {
        xPercent: -50,
        yPercent: -50,
        scale: 0,
        autoAlpha: 1,
        willChange: 'transform, opacity',
        force3D: true,
      }, 0);
    }
    if (targets.length) {
      timeline.to(targets, {
        y: -18,
        rotation: 0.4,
        duration: this.duration(0.18),
        ease: 'power2.out',
      }, 0).to(targets, {
        y: () => (typeof window === 'undefined' ? 900 : window.innerHeight * 1.15),
        rotation: 8,
        autoAlpha: 0,
        duration: this.duration(0.86),
        stagger: this.stagger(0.018),
        ease: 'power4.in',
        force3D: true,
      }, this.duration(0.12));
    }
    if (wipeElement) {
      timeline.to(wipeElement, {
        scale: 1,
        duration: this.duration(this.timing.finale),
        ease: 'power4.inOut',
        force3D: true,
      }, this.duration(0.12));
    }
    if (messageElement) {
      timeline.set(messageElement, { visibility: 'visible' }, this.duration(0.82));
      timeline.fromTo(messageElement, { autoAlpha: 0, y: 18 }, {
        autoAlpha: 1,
        y: 0,
        duration: this.duration(0.72),
        ease: 'power3.out',
      }, this.duration(0.86));
    }
    timeline.call(() => {
      if (wipeElement) this.engine.set(wipeElement, { clearProps: 'willChange' });
      onComplete?.({ scene: sceneElement, wipe: wipeElement, timeline });
    });
    return timeline;
  }

  resetFinale(scene = this.selectors.finaleScene) {
    const sceneElement = this.resolve(scene);
    if (!sceneElement) return this;
    const state = this.finaleStates.get(sceneElement);
    this.kill('finale:arm').kill('finale:collapse');
    if (state?.collapseTargets?.length) {
      this.engine.set(state.collapseTargets, { clearProps: 'opacity,visibility,transform' });
    }
    if (state?.label && state.originalLabel !== undefined) state.label.textContent = state.originalLabel;
    if (state?.trigger) {
      delete state.trigger.dataset.finaleArmed;
      this.engine.set(state.trigger, { clearProps: 'transform' });
    }
    if (state?.wipe && this.createdWipes.has(state.wipe)) {
      state.wipe.remove();
      this.createdWipes.delete(state.wipe);
    }
    this.finaleStates.delete(sceneElement);
    return this;
  }

  listen(target, type, listener, options) {
    const element = this.resolve(target) ?? target;
    if (!element?.addEventListener) return this;
    element.addEventListener(type, listener, options);
    this.disposers.push(() => element.removeEventListener(type, listener, options));
    return this;
  }

  destroy() {
    this.killAll();
    this.disposers.splice(0).forEach((dispose) => dispose());
    this.motionQuery?.removeEventListener?.('change', this._onMotionPreference);
    this.createdWipes.forEach((wipe) => wipe.remove());
    this.createdWipes.clear();
    return this;
  }
}

export default MotionDirector;
