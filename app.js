import { createIcons, icons } from 'lucide';
import { CinematicStage, CINEMATIC_DURATION } from './cinematic-stage.js';
import { MotionDirector } from './motion-director.js';
import { AudioDirector } from './audio-director.js';

const TEST_CHAPTER_COUNT = 10;
const STAR_ORDER = Object.freeze(['AI', 'GAME', 'ANIME', 'CITY']);
const WORLD_SCENES = Object.freeze(['ai', 'game', 'anime', 'city']);
const SPEEDS = Object.freeze([1, 2.2, 3.5, 5]);
const GATE_TIME = 17.15;
const CHARGE_DURATION = 2200;
const NAV_SCENES = Object.freeze(['bridge', 'hub', 'ai', 'game', 'anime', 'city', 'constellation', 'outro', 'final']);
const WHEEL_THRESHOLD = 56;
const SWIPE_THRESHOLD = 54;
const ANIME_FRAME_COUNT = 5;
const CITY_ROUTE_POINTS = Object.freeze({
  '天桥': Object.freeze({ cx: 286, cy: 318 }),
  '街角': Object.freeze({ cx: 508, cy: 226 }),
  '回家': Object.freeze({ cx: 842, cy: 132 }),
});

export function normalizeFrameIndex(index, count) {
  const size = Math.max(1, Number(count) || 1);
  const value = Number(index) || 0;
  return ((value % size) + size) % size;
}

export function getCityRoutePoint(route) {
  const point = CITY_ROUTE_POINTS[route] ?? CITY_ROUTE_POINTS['街角'];
  return { ...point };
}

export function nextChapter(current, direction) {
  return Math.max(0, Math.min(TEST_CHAPTER_COUNT - 1, current + direction));
}

export function collectStar(stars, star) {
  return stars.includes(star) ? stars.slice() : [...stars, star];
}

export function deriveConstellation(stars) {
  const key = stars.join('>');
  if (!key) return '低耗电模式';
  if (key === 'AI>GAME') return '想象航线';
  if (stars.length === 4) return '夜行者协议';
  if (stars.includes('CITY') && stars.length >= 2) return '生活观测站';
  if (stars.includes('ANIME')) return '重启者轨道';
  return '自由航线';
}

const browserReady = typeof window !== 'undefined' && typeof document !== 'undefined';

if (browserReady) {
  const app = document.querySelector('#app');
  if (app) boot(app);
}

function boot(app) {
  createIcons({ icons });
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const scenes = new Map($$('.scene').map((scene) => [scene.dataset.scene, scene]));
  const director = new MotionDirector({
    root: document,
    selectors: {
      sceneCopy: '.eyebrow, h1, h2, h3, .loader-intro, .world-heading, .world-result, .text-command, .star-command',
      arc: '#storyArc',
      player: '#playerOverlay',
      playerPanel: '#playerVideo',
      playerVideo: '#playerVideo',
      finaleScene: '#outroScene',
    },
  });
  const dom = {
    hud: $('#hud'), rail: $('#chapterRail'), railPoints: $$('.rail-point'), chapterIndex: $('#chapterIndex'),
    chapterName: $('#chapterName'), chapterProgress: $('#chapterProgress'), loadProgress: $('#loadProgress'),
    loadStatus: $('#loadStatus'), enterButton: $('#enterButton'), bridgeTitle: $('#bridgeTitle'),
    bridgeCaption: $('#bridgeCaption'), bridgeScene: $('#bridgeScene'), bridgeGate: $('#bridgeGate'), bridgeSkip: $('[data-action="skip-bridge"]'),
    canvas: $('#cinematicCanvas'),
    soundButton: $('#soundButton'), speedButton: $('#speedButton'), collectedCount: $('#collectedCount'),
    leaveHubButton: $('#leaveHubButton'), aiVideo: $('#aiVideo'), aiChoice: $('#aiChoice'), gameVideo: $('#gameVideo'),
    gameResult: $('#gameResult'), chargeButton: $('#chargeButton'), chargeFill: $('#chargeFill'), chargeText: $('#chargeText'),
    filmStrip: $('#filmStrip'), filmCounter: $('#filmCounter'), animeMainImage: $('#animeMainImage'), animeMainCaption: $('#animeMainCaption'), animeResult: $('#animeResult'), cityResult: $('#cityResult'),
    routeLight: $('#routeLight'), returnInstruction: $('#returnInstruction'), returnStars: $$('.return-star'),
    returnCore: $('.return-core'), toOutroButton: $('#toOutroButton'), endingButton: $('#endingButton'), whiteIris: $('#whiteIris'),
    playerOverlay: $('#playerOverlay'), playerVideo: $('#playerVideo'), creditsPanel: $('#creditsPanel'), toast: $('#toast'),
    directionControls: $('#directionControls'), chapterUpButton: $('#chapterUpButton'), chapterDownButton: $('#chapterDownButton'),
  };
  const state = {
    scene: 'loader', transition: false, entered: false, bridgeComplete: false, bridgeGateOpen: false,
    sound: true, speedIndex: 0, stars: [], returnedStars: [], aiChoice: '', gameCharged: false,
    animeFrame: 0, animeChosen: false, cityRoute: '', exploded: { ai: false, game: false }, endingArmed: false, endingComplete: false,
    visitedScenes: new Set(['loader']),
  };
  let toastTimer = 0; let reversalTimer = 0; let linearAdvanceTimer = 0; let chargeFrame = 0; let chargeStartedAt = 0; let chargeInput = null; let lastPlayerOpener = null;
  let wheelAmount = 0; let wheelResetTimer = 0; let navigationLockedUntil = 0; let touchGesture = null;
  const audioDirector = new AudioDirector({ masterVolume: 0.24, crossfade: 820 });
  const stage = new CinematicStage(dom.canvas, {
    clock: 'internal',
    controlAudio: false,
    onProgress: (_p, d) => updateBridgeProgress(d),
    onEvent: handleStageEvent,
  });
  director.prepareMedia('[data-explosion="ai"]'); director.prepareMedia('[data-explosion="game"]');
  initializeScenes(); initializeAudio(); updateHub(); updateHud(); preloadExperience();

  function initializeScenes() {
    scenes.forEach((scene, name) => { const active = name === 'loader'; scene.classList.toggle('is-active', active); scene.setAttribute('aria-hidden', String(!active)); });
    dom.hud?.classList.add('is-concealed'); dom.rail?.classList.add('is-concealed'); dom.bridgeGate?.setAttribute('aria-hidden', 'true');
  }
  function initializeAudio() { updateSoundControl(); }
  async function preloadExperience() {
    const assets = [...$$('img'), ...$$('video')]; const total = Math.max(assets.length, 1); let complete = 0;
    const report = () => { const percent = Math.round((complete / total) * 100); if (dom.loadProgress) dom.loadProgress.style.width = `${percent}%`; if (dom.loadStatus) dom.loadStatus.textContent = percent < 100 ? `正在把星光搬进夜里 · ${percent}%` : '星光已就位 · 今晚可以开始'; };
    report(); await Promise.allSettled(assets.map((asset) => waitForAsset(asset).finally(() => { complete += 1; report(); }))); complete = total; report(); if (dom.enterButton) dom.enterButton.disabled = false; app.classList.add('is-loaded');
  }
  function waitForAsset(asset) {
    if (asset instanceof HTMLImageElement && asset.complete) return Promise.resolve();
    if (asset instanceof HTMLMediaElement && asset.readyState >= 1) return Promise.resolve();
    return new Promise((resolve) => { const eventName = asset instanceof HTMLImageElement ? 'load' : 'loadedmetadata'; let settled = false; const done = () => { if (settled) return; settled = true; clearTimeout(timeout); asset.removeEventListener(eventName, done); asset.removeEventListener('error', done); resolve(); }; const timeout = window.setTimeout(done, 8000); asset.addEventListener(eventName, done, { once: true }); asset.addEventListener('error', done, { once: true }); if (asset instanceof HTMLMediaElement) { try { asset.load(); } catch (_) {} } });
  }
  function bindInteractions() {
    document.addEventListener('click', handleClick); document.addEventListener('keydown', handleKeyDown); document.addEventListener('keyup', handleKeyUp);
    dom.chargeButton?.addEventListener('pointerdown', startCharge); dom.chargeButton?.addEventListener('pointerup', stopCharge); dom.chargeButton?.addEventListener('pointercancel', stopCharge); dom.chargeButton?.addEventListener('lostpointercapture', stopCharge);
    dom.playerOverlay?.addEventListener('click', (event) => { if (event.target === dom.playerOverlay) closePlayer(); });
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', clearTouchGesture, { passive: true });
    window.addEventListener('beforeunload', () => { stage.destroy(); director.destroy(); audioDirector.destroy(); }, { once: true });
  }
  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const actionTarget = target.closest('[data-action]'); const worldTarget = target.closest('[data-world]'); const aiTile = target.closest('[data-ai]'); const frame = target.closest('[data-frame]'); const route = target.closest('[data-route]'); const returnStarTarget = target.closest('[data-return-star]'); const playerTarget = target.closest('[data-player-src]'); const railTarget = target.closest('[data-jump]');
    if (playerTarget) { openPlayer(playerTarget); return; } if (worldTarget && worldTarget.classList.contains('world-node')) { announce('今晚的路线已经写好，按“继续向下”一起走。'); return; } if (aiTile) { chooseAi(aiTile); return; } if (frame) { selectFilmFrame(Number(frame.dataset.frame)); return; } if (route) { selectCityRoute(route); return; } if (returnStarTarget) { returnStar(returnStarTarget); return; } if (railTarget) { jumpRail(railTarget.dataset.jump); return; } if (!actionTarget) return;
    switch (actionTarget.dataset.action) { case 'enter': enterExperience(); break; case 'finish-bridge': finishBridge(); break; case 'skip-bridge': skipBridge(); break; case 'speed': cycleSpeed(); break; case 'sound': toggleSound(); break; case 'world-back': navigateDirection(-1, 'button'); break; case 'chapter-up': navigateDirection(-1, 'button'); break; case 'chapter-down': navigateDirection(1, 'button'); break; case 'open-explosion': openExplosion(actionTarget.dataset.target); break; case 'collect-world': collectWorld(actionTarget.dataset.world, actionTarget); break; case 'film-prev': selectFilmFrame(state.animeFrame - 1); break; case 'film-next': selectFilmFrame(state.animeFrame + 1); break; case 'city-step': advanceCity(); break; case 'return-all-stars': returnAllStars(); break; case 'to-constellation': continueLinear(); break; case 'to-outro': openOutro(); break; case 'ending': handleEnding(event); break; case 'close-player': closePlayer(); break; case 'credits': toggleCredits(); break; case 'restart': restartExperience(); break; default: break; }
  }
  function handleKeyDown(event) {
    if (event.key === 'Escape') { if (dom.playerOverlay?.classList.contains('is-open')) closePlayer(); else if (dom.creditsPanel?.classList.contains('is-open')) toggleCredits(false); return; }
    if (state.scene === 'game' && !event.repeat && [' ', 'Enter'].includes(event.key) && document.activeElement === dom.chargeButton) { event.preventDefault(); startCharge(event); return; }
    const direction = ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : ['ArrowDown', 'PageDown'].includes(event.key) ? 1 : 0;
    if (!direction || event.repeat || shouldIgnoreNavigation(event.target, 'keyboard')) return;
    event.preventDefault();
    navigateDirection(direction, 'keyboard');
  }
  function handleKeyUp(event) { if (state.scene !== 'game' || ![' ', 'Enter'].includes(event.key) || chargeInput !== 'keyboard') return; event.preventDefault(); stopCharge(event); }

  function shouldIgnoreNavigation(target, mode = 'pointer') {
    if (!state.entered || state.transition || chargeFrame || chargeInput) return true;
    if (dom.playerOverlay?.classList.contains('is-open') || dom.creditsPanel?.classList.contains('is-open')) return true;
    const element = target instanceof Element ? target : null;
    if (!element) return false;
    const common = 'input, textarea, select, [contenteditable="true"], video, audio, [role="dialog"], #chargeButton';
    if (element.closest(common)) return true;
    if (mode === 'keyboard' && element.closest('button, a, [role="button"], [tabindex]:not([tabindex="-1"])')) return true;
    if (mode === 'touch' && element.closest('button, a, [role="button"], .film-strip, .film-controls, .city-reel')) return true;
    return false;
  }

  function handleWheel(event) {
    if (shouldIgnoreNavigation(event.target, 'wheel') || !NAV_SCENES.includes(state.scene)) return;
    event.preventDefault();
    const now = performance.now();
    if (now < navigationLockedUntil) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    wheelAmount += event.deltaY * unit;
    clearTimeout(wheelResetTimer);
    wheelResetTimer = window.setTimeout(() => { wheelAmount = 0; }, 180);
    if (Math.abs(wheelAmount) < WHEEL_THRESHOLD) return;
    const direction = wheelAmount > 0 ? 1 : -1;
    wheelAmount = 0;
    navigateDirection(direction, 'wheel');
  }

  function handleTouchStart(event) {
    if (event.touches.length !== 1 || shouldIgnoreNavigation(event.target, 'touch')) { touchGesture = null; return; }
    const touch = event.touches[0];
    touchGesture = { x: touch.clientX, y: touch.clientY, time: performance.now() };
  }

  function handleTouchEnd(event) {
    if (!touchGesture || event.changedTouches.length !== 1 || shouldIgnoreNavigation(event.target, 'touch')) { clearTouchGesture(); return; }
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchGesture.x;
    const deltaY = touchGesture.y - touch.clientY;
    const elapsed = performance.now() - touchGesture.time;
    clearTouchGesture();
    if (elapsed > 1100 || Math.abs(deltaY) < SWIPE_THRESHOLD || Math.abs(deltaY) < Math.abs(deltaX) * 1.15) return;
    navigateDirection(deltaY > 0 ? 1 : -1, 'touch');
  }

  function clearTouchGesture() { touchGesture = null; }

  function forwardGate(scene) {
    if (scene === 'bridge') return { open: state.bridgeComplete, message: '先看完鹊桥上的相见。' };
    if (scene === 'hub') return { open: true, message: '' };
    if (scene === 'ai') return { open: state.stars.includes('AI'), message: '先把 AI 星收进今晚。' };
    if (scene === 'game') return { open: state.stars.includes('GAME'), message: '先按住充能，再收下 GAME 星。' };
    if (scene === 'anime') return { open: state.stars.includes('ANIME'), message: '先收下这一帧里的 ANIME 星。' };
    if (scene === 'city') return { open: state.stars.includes('CITY'), message: '先跟着灯走完这一段路。' };
    if (scene === 'constellation') return { open: state.returnedStars.length >= 2, message: '先把至少两颗星光送回中央。' };
    if (scene === 'outro') return { open: state.endingComplete, message: '尾声要由你亲手完成。' };
    return { open: false, message: '已经走到今晚的最后一页。' };
  }

  function previousVisitedScene() {
    const currentIndex = NAV_SCENES.indexOf(state.scene);
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      if (state.visitedScenes.has(NAV_SCENES[index])) return NAV_SCENES[index];
    }
    return null;
  }

  function navigateDirection(direction, source = 'button') {
    if (!NAV_SCENES.includes(state.scene) || state.transition || performance.now() < navigationLockedUntil) return false;
    const currentIndex = NAV_SCENES.indexOf(state.scene);
    let target = null;
    if (direction < 0) {
      target = previousVisitedScene();
      if (!target) { if (source !== 'wheel') announce('这里就是今晚的第一章。'); return false; }
    } else {
      const gate = forwardGate(state.scene);
      if (!gate.open) { announce(gate.message); return false; }
      target = NAV_SCENES[currentIndex + 1] || null;
      if (!target) return false;
    }

    clearTimeout(linearAdvanceTimer);
    linearAdvanceTimer = 0;
    navigationLockedUntil = performance.now() + (director.reducedMotion ? 80 : 820);
    if (state.scene === 'final' && target === 'outro') restoreFinaleForNavigation();
    transitionTo(target, { direction: direction < 0 ? -1 : 1, axis: 'y' });
    return true;
  }

  function restoreFinaleForNavigation() {
    director.resetFinale('#outroScene');
    state.endingArmed = false;
    dom.endingButton?.classList.remove('is-armed', 'is-collapsing');
    const label = $('[data-finale-label]', dom.endingButton);
    if (label) label.textContent = '把今晚留在这里';
    dom.whiteIris?.classList.remove('is-visible');
    if (dom.whiteIris) director.engine.set(dom.whiteIris, { clearProps: 'all' });
  }

  function syncDirectionalControls() {
    if (!dom.directionControls) return;
    const blockedByOverlay = dom.playerOverlay?.classList.contains('is-open') || dom.creditsPanel?.classList.contains('is-open');
    const visible = state.entered && NAV_SCENES.includes(state.scene) && !blockedByOverlay;
    dom.directionControls.classList.toggle('is-concealed', !visible);
    const previous = previousVisitedScene();
    const gate = forwardGate(state.scene);
    const nextExists = NAV_SCENES.indexOf(state.scene) < NAV_SCENES.length - 1;
    if (dom.chapterUpButton) {
      dom.chapterUpButton.disabled = !visible || !previous;
      dom.chapterUpButton.style.opacity = dom.chapterUpButton.disabled ? '0.34' : '1';
    }
    if (dom.chapterDownButton) {
      dom.chapterDownButton.disabled = !visible || !nextExists || !gate.open;
      dom.chapterDownButton.style.opacity = dom.chapterDownButton.disabled ? '0.34' : '1';
      dom.chapterDownButton.title = gate.open ? '下一章节' : gate.message;
      dom.chapterDownButton.setAttribute('aria-label', gate.open ? '进入下一章节' : gate.message);
    }
  }

  async function enterExperience() { if (state.entered || dom.enterButton?.disabled) return; state.entered = true; if (state.sound) await audioDirector.start('bridge'); dom.hud?.classList.remove('is-concealed'); dom.rail?.classList.remove('is-concealed'); await transitionTo('bridge'); if (state.scene !== 'bridge') return; dom.bridgeSkip?.classList.add('is-concealed'); stage.setSpeed(SPEEDS[state.speedIndex]); stage.play(0); announce('鹊桥正在银河上生成。'); }
  function handleStageEvent(event) { if (event.type === 'freeze' && !state.bridgeGateOpen) { stage.pause(); state.bridgeGateOpen = true; dom.bridgeGate?.classList.add('is-visible'); dom.bridgeGate?.setAttribute('aria-hidden', 'false'); dom.bridgeSkip?.classList.remove('is-concealed'); syncDirectionalControls(); } if (event.type === 'complete' && !state.bridgeComplete) { state.bridgeComplete = true; syncDirectionalControls(); beginReversal(); } }
  function updateBridgeProgress(detail) { if (!detail) return; const time = Math.min(detail.time, CINEMATIC_DURATION); if (state.scene === 'bridge' && dom.chapterProgress) dom.chapterProgress.style.width = `${(time / CINEMATIC_DURATION) * 100}%`; const phase = time < 4.2 ? 'forming' : time < 12.8 ? 'walk' : time < GATE_TIME ? 'reach' : 'freeze'; dom.bridgeScene?.setAttribute('data-bridge-phase', phase); const cue = bridgeCaptionAt(time); const number = $('.caption-number', dom.bridgeCaption); const copy = $('p', dom.bridgeCaption); if (number) number.textContent = `00:${String(Math.max(1, Math.floor(time))).padStart(2, '0')}`; if (copy && copy.textContent !== cue.copy) copy.textContent = cue.copy; if (dom.bridgeTitle && dom.bridgeTitle.innerHTML !== cue.title) dom.bridgeTitle.innerHTML = cue.title; }
  function bridgeCaptionAt(time) { if (time < 4.2) return { title: '银河把一年，<br>拉得很长。', copy: '但总有人，愿意从很远的地方走来。' }; if (time < 8.6) return { title: '喜鹊一只一只，<br>把路铺亮。', copy: '他们还没相见，桥先替他们记住了方向。' }; if (time < 12.8) return { title: '两边的人，<br>都没有停下。', copy: '每一步都很慢，但每一步都在靠近。' }; if (time < GATE_TIME) return { title: '只剩最后一步。', copy: '真正的相见，从来不是奇迹，是有人愿意走完。' }; return { title: '这一年的距离，<br>终于归零。', copy: '鹊桥完成了它的使命，然后把星光留给今晚。' }; }
  function skipBridge() { if (state.scene !== 'bridge' || state.bridgeComplete || !state.bridgeGateOpen) return; state.bridgeGateOpen = false; dom.bridgeGate?.classList.remove('is-visible'); dom.bridgeGate?.setAttribute('aria-hidden', 'true'); dom.bridgeSkip?.classList.add('is-concealed'); stage.seek(CINEMATIC_DURATION); stage.pause(); state.bridgeComplete = true; beginReversal(); }
  function finishBridge() { if (state.scene !== 'bridge' || !state.bridgeGateOpen) return; state.bridgeGateOpen = false; dom.bridgeGate?.classList.remove('is-visible'); dom.bridgeGate?.setAttribute('aria-hidden', 'true'); stage.resume(); }
  async function beginReversal() { dom.bridgeGate?.classList.remove('is-visible'); dom.bridgeGate?.setAttribute('aria-hidden', 'true'); dom.bridgeSkip?.classList.add('is-concealed'); await transitionTo('reversal'); if (state.scene !== 'reversal') return; reversalTimer = window.setTimeout(async () => { await transitionTo('hub'); }, director.reducedMotion ? 80 : 3300); }
  async function transitionTo(name, options = {}) { const target = scenes.get(name); const current = scenes.get(state.scene); if (!target || state.transition || (target === current && !options.force)) return false; state.transition = true; clearTimeout(reversalTimer); pauseOffsceneMedia(name); if (state.scene === 'bridge' && name !== 'bridge' && stage.isPlaying) stage.pause(); const linearScenes = new Set(['hub', 'ai', 'game', 'anime', 'city', 'constellation', 'outro', 'final']); const axis = options.axis || (linearScenes.has(state.scene) || linearScenes.has(name) ? 'y' : 'x'); return new Promise((resolve) => { const finish = () => { state.scene = name; state.visitedScenes.add(name); state.transition = false; app.dataset.scene = name; afterSceneEntered(name); updateHud(); resolve(true); }; const timeline = director.transitionScenes(current, target, { key: 'scene-transition', direction: options.direction ?? 1, axis, onComplete: finish }); if (!timeline) finish(); }); }
  function afterSceneEntered(name) {
    if (state.sound && name !== 'loader') audioDirector.transition(name);
    if (name === 'hub') {
      updateHub();
      if (dom.leaveHubButton) dom.leaveHubButton.disabled = false;
      const label = $('span', dom.leaveHubButton);
      if (label) label.textContent = '继续向下';
      dom.leaveHubButton?.classList.remove('is-concealed');
    }
    if (WORLD_SCENES.includes(name)) {
      dom.leaveHubButton?.classList.add('is-concealed');
      $$('.world-back').forEach((button) => button.classList.add('is-concealed'));
    }
    if (name === 'ai') {
      if (!state.exploded.ai) openExplosion('ai');
      else resumeInlineVideo(dom.aiVideo);
    }
    if (name === 'game') {
      // Keep the charging core visible until the player actually completes it.
      // The game reveal is the reward for the hold gesture, not the scene entry.
      if (state.gameCharged && state.exploded.game) resumeInlineVideo(dom.gameVideo);
    }
    if (name === 'anime') selectFilmFrame(state.animeFrame, false);
    if (name === 'constellation') renderConstellation();
    if (name === 'final') { dom.hud?.classList.add('is-concealed'); dom.rail?.classList.add('is-concealed'); }
    syncDirectionalControls();
  }
  function pauseOffsceneMedia(nextScene) { $$('video').forEach((video) => { if (video === dom.playerVideo) return; const owner = video.closest('.scene'); if (owner?.dataset.scene !== nextScene) video.pause(); }); if (nextScene !== 'game') stopCharge(); }
  function enterWorld(world) { if (!WORLD_SCENES.includes(world) || state.transition) return; announce('今晚的路线已经写好，按“继续向下”一起走。'); }

  function continueLinear() {
    if (state.scene === 'hub') {
      transitionTo('ai');
      return;
    }
    if (state.scene === 'constellation') {
      openOutro();
      return;
    }
    announce('先把眼前这一段故事走完。');
  }
  function openExplosion(world) {
    if (state.scene !== world || !['ai', 'game'].includes(world) || state.exploded[world]) return;
    if (world === 'game' && !state.gameCharged) return;
    state.exploded[world] = true;
    if (world === 'ai') {
      const collectButton = $('[data-action="collect-world"][data-world="ai"]');
      if (collectButton) collectButton.disabled = true;
      if (dom.aiChoice) dom.aiChoice.textContent = '选一个今晚的搭子，再让这段陪伴真正上线。';
    }
    const video = world === 'ai' ? dom.aiVideo : dom.gameVideo;
    const sceneElement = scenes.get(world);
    sceneElement?.setAttribute('data-world-state', 'open');
    const collectButton = $(`[data-action="collect-world"][data-world="${world}"]`);
    if (collectButton) collectButton.disabled = world === 'game' || !state.aiChoice;
    director.explodeMedia(`[data-explosion="${world}"]`, {
      key: `explode-${world}`,
      onStart: () => $(`[data-explosion="${world}"]`)?.classList.add('is-open'),
      onComplete: () => {
        resumeInlineVideo(video);
        if (collectButton) collectButton.disabled = world === 'game' ? !state.gameCharged : !state.aiChoice;
      },
    });
  }
  function chooseAi(tile) {
    if (state.scene !== 'ai' || !state.exploded.ai) { announce('先把今晚的 AI 世界叫进来。'); return; }
    const selected = tile.dataset.ai || '倾听者';
    $$('.ai-tile').forEach((item) => {
      const active = item === tile;
      item.classList.toggle('is-selected', active);
      item.setAttribute('aria-pressed', String(active));
    });
    state.aiChoice = selected;
    if (dom.aiChoice) dom.aiChoice.textContent = `${selected}已上线：${tile.dataset.aiCopy || '今晚不催你振作，只陪你把话说完。'}`;
    const collectButton = $('[data-action="collect-world"][data-world="ai"]');
    if (collectButton) collectButton.disabled = false;
    const stageElement = $('[data-explosion="ai"]');
    stageElement?.classList.add('has-choice');
    stageElement?.setAttribute('data-ai-choice', selected);
    scenes.get('ai')?.setAttribute('data-ai-choice', selected);
  }
  function startCharge(event) { if (state.scene !== 'game' || state.gameCharged || chargeFrame) return; if (event.type === 'pointerdown') { if (event.button !== undefined && event.button !== 0) return; event.preventDefault(); chargeInput = `pointer:${event.pointerId}`; dom.chargeButton?.setPointerCapture?.(event.pointerId); } else chargeInput = 'keyboard'; chargeStartedAt = performance.now(); dom.chargeButton?.classList.add('is-armed'); chargeFrame = requestAnimationFrame(tickCharge); }
  function tickCharge(now) { const progress = Math.min(1, (now - chargeStartedAt) / CHARGE_DURATION); setChargeProgress(progress); if (progress >= 1) { chargeFrame = 0; chargeInput = null; completeCharge(); return; } chargeFrame = requestAnimationFrame(tickCharge); }
  function stopCharge(event) { if (!chargeFrame) return; if (event?.type?.startsWith('pointer') && chargeInput?.startsWith('pointer:')) { const pointerId = Number(chargeInput.split(':')[1]); if (Number.isFinite(event.pointerId) && event.pointerId !== pointerId) return; } cancelAnimationFrame(chargeFrame); chargeFrame = 0; chargeInput = null; dom.chargeButton?.classList.remove('is-armed'); setChargeProgress(0); if (dom.gameResult) dom.gameResult.textContent = '差一点。继续按住，直到现实真正暂停。'; }
  function setChargeProgress(progress) { const percent = Math.round(progress * 100); dom.chargeButton?.style.setProperty('--charge', String(progress)); if (dom.chargeFill) { dom.chargeFill.style.setProperty('--charge', String(progress)); dom.chargeFill.style.transform = `scaleY(${progress})`; } if (dom.chargeText) dom.chargeText.textContent = progress >= 1 ? 'REALITY PAUSED' : `CHARGING ${percent}%`; if (dom.gameResult && progress > 0) dom.gameResult.textContent = `正在把现实静音 · ${percent}%`; }
  function completeCharge() { state.gameCharged = true; scenes.get('game')?.setAttribute('data-game-state', 'charged'); dom.chargeButton?.classList.remove('is-armed'); dom.chargeButton?.classList.add('is-complete'); const label = $('strong', dom.chargeButton); if (label) label.textContent = '现实已暂停'; if (dom.gameResult) dom.gameResult.textContent = '00:00:07 · 现在，世界只剩下你和这一局。'; const collectButton = $('[data-action="collect-world"][data-world="game"]'); if (collectButton) collectButton.disabled = true; openExplosion('game'); }
  function selectFilmFrame(index, announceChoice = true) {
    const frames = $$('.film-frame');
    if (!frames.length) return;
    const next = normalizeFrameIndex(index, frames.length || ANIME_FRAME_COUNT);
    const frame = frames[next];
    state.animeFrame = next;
    const animeScene = scenes.get('anime');
    animeScene?.setAttribute('data-anime-frame', String(next));
    animeScene?.setAttribute('data-active-frame', String(next));
    // Scene entry renders the current frame without counting as an interaction.
    // A user-driven frame change is what unlocks the ANIME star.
    if (announceChoice || state.animeChosen) state.animeChosen = true;
    frames.forEach((item, frameIndex) => {
      const active = frameIndex === next;
      item.classList.toggle('is-selected', active);
      item.setAttribute('aria-pressed', String(active));
    });
    if (dom.filmCounter) dom.filmCounter.textContent = `${String(next + 1).padStart(2, '0')} / ${String(frames.length).padStart(2, '0')}`;
    dom.filmStrip?.style.setProperty('--frame-index', String(next));
    if (dom.animeMainImage && frame?.querySelector('img')) {
      const image = frame.querySelector('img');
      dom.animeMainImage.src = image.src;
      dom.animeMainImage.alt = image.alt.replace('分镜', '主镜头');
    }
    if (dom.animeMainCaption) dom.animeMainCaption.textContent = `${frame?.dataset.frameTitle || `第 ${next + 1} 格`}：${frame?.dataset.frameCopy || '这一晚，镜头终于转向了你。'}`;
    frames[next]?.scrollIntoView?.({ behavior: director.reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    if (dom.animeResult) dom.animeResult.textContent = `第 ${next + 1} 格：${frame?.dataset.frameCopy || '这一晚，镜头终于转向了你。'}`;
    const collectButton = $('[data-action="collect-world"][data-world="anime"]');
    if (collectButton) collectButton.disabled = !state.animeChosen;
    if (announceChoice) announce('分镜已重写：今晚的主角是你。');
  }
  function selectCityRoute(route) {
    if (state.scene !== 'city') return;
    $$('.city-shot').forEach((shot) => {
      const active = shot === route;
      shot.classList.toggle('is-selected', active);
      shot.setAttribute('aria-pressed', String(active));
    });
    state.cityRoute = route.dataset.route || '街角';
    if (dom.cityResult) dom.cityResult.textContent = `${state.cityRoute}：没有人在等也没关系，这盏灯属于今晚的你。`;
    const collectButton = $('[data-action="collect-world"][data-world="city"]');
    if (collectButton) collectButton.disabled = false;
    const point = getCityRoutePoint(state.cityRoute);
    if (dom.routeLight) director.engine.to(dom.routeLight, { attr: point, duration: director.duration(1.15), ease: 'power3.inOut' });
    const reel = $('.city-reel');
    reel?.setAttribute('data-route', state.cityRoute);
    scenes.get('city')?.setAttribute('data-city-route', state.cityRoute);
  }
  function advanceCity() {
    if (state.scene !== 'city') return;
    const nextRoute = state.cityRoute === '天桥' ? '街角' : state.cityRoute === '街角' ? '回家' : '天桥';
    const target = $(`.city-shot[data-route="${nextRoute}"]`);
    if (target) selectCityRoute(target);
    const step = $('[data-action="city-step"]');
    if (step) {
      step.classList.toggle('is-complete', state.cityRoute === '回家');
      const label = $('span', step);
      if (label) label.textContent = state.cityRoute === '回家' ? '已走到有灯的地方' : '跟着这盏灯走';
    }
  }
  function collectWorld(world, button) {
    const star = world.toUpperCase();
    const ready = { ai: Boolean(state.aiChoice), game: state.gameCharged, anime: state.animeChosen, city: Boolean(state.cityRoute) }[world];
    if (!ready) { announce('先完成这个世界里的选择。'); return; }
    const before = state.stars.length;
    state.stars = collectStar(state.stars, star);
    button.classList.add('is-collected', 'is-complete'); button.disabled = true;
    const label = $('span', button); if (label) label.textContent = `${star} 星已收下`;
    updateHub();
    if (state.stars.length > before) {
      announce(`${star} 星已落进你的夜空。`);
      director.engine.fromTo(button, { scale: 1 }, { scale: 1.08, duration: director.duration(0.24), yoyo: true, repeat: 1, ease: 'power2.out' });
    }
    const next = { ai: 'game', game: 'anime', anime: 'city', city: 'constellation' }[world];
    linearAdvanceTimer = window.setTimeout(() => { linearAdvanceTimer = 0; transitionTo(next); }, director.reducedMotion ? 0 : 720);
  }
  function updateHub() { if (dom.collectedCount) dom.collectedCount.textContent = `${String(state.stars.length + 1).padStart(2, '0')} / 04`; $$('.world-node').forEach((node) => { const world = node.dataset.world?.toUpperCase(); if (world) node.classList.toggle('is-collected', state.stars.includes(world)); node.disabled = true; node.setAttribute('aria-disabled', 'true'); }); if (dom.leaveHubButton) { dom.leaveHubButton.disabled = state.scene !== 'hub'; const label = $('span', dom.leaveHubButton); if (label && state.scene === 'hub') label.textContent = '继续向下'; } updateHud(); syncDirectionalControls(); }
  function openConstellation() { if (state.stars.length < 2) { announce('至少带回两颗星，才能搭起新的桥。'); return; } transitionTo('constellation'); }
  function renderConstellation() { dom.returnStars.forEach((star) => { const name = star.dataset.returnStar?.toUpperCase(); if (!name) return; const collected = state.stars.includes(name); star.hidden = !collected; star.setAttribute('aria-hidden', String(!collected)); star.classList.toggle('is-collected', collected); }); updateConstellationStatus(); }
  function returnStar(star) { const name = star.dataset.returnStar.toUpperCase(); if (!state.stars.includes(name) || state.returnedStars.includes(name)) return; const coreRect = dom.returnCore?.getBoundingClientRect(); const starRect = star.getBoundingClientRect(); if (!coreRect || !starRect) return; const slot = [{ x: -34, y: -12 }, { x: 34, y: -12 }, { x: -25, y: 30 }, { x: 25, y: 30 }][state.returnedStars.length] || { x: 0, y: 0 }; const targetX = coreRect.left + coreRect.width / 2 + slot.x; const targetY = coreRect.top + coreRect.height / 2 + slot.y; const sourceX = starRect.left + starRect.width / 2; const sourceY = starRect.top + starRect.height / 2; state.returnedStars.push(name); star.disabled = true; star.classList.add('is-returned'); director.engine.to(star, { x: targetX - sourceX, y: targetY - sourceY, scale: 0.72, duration: director.duration(1.05), ease: 'power4.inOut', onComplete: () => star.classList.add('is-complete') }); updateConstellationStatus(); }
  function updateConstellationStatus() { const returned = state.returnedStars.length; if (dom.returnInstruction) dom.returnInstruction.textContent = returned < 2 ? `把星星送回中央 · ${returned} / 2` : `${deriveConstellation(state.returnedStars)} 已形成。`; if (dom.toOutroButton) dom.toOutroButton.disabled = returned < 2; if (returned >= 2) $('#constellationStage')?.classList.add('is-complete'); updateHud(); }
  function returnAllStars() { if (state.scene !== 'constellation' || state.returnedStars.length >= 2) return; const stars = state.stars.filter((name) => !state.returnedStars.includes(name)); state.returnedStars = [...state.returnedStars, ...stars]; $$('.return-star').forEach((star) => star.classList.add('is-returned')); updateConstellationStatus(); announce('星光回到中央了。'); }
  function openOutro() { if (state.returnedStars.length < 2) { announce('至少让两颗星回到中央。'); return; } transitionTo('outro'); }
  function handleEnding(event) { if (state.scene !== 'outro' || state.transition) return; if (!state.endingArmed) { state.endingArmed = true; dom.endingButton?.classList.add('is-armed'); const label = $('span', dom.endingButton); if (label) label.textContent = '再按一次，和今晚告别'; director.handleFinaleClick(event, { scene: '#outroScene', trigger: dom.endingButton, labelTarget: 'span', armedLabel: '再按一次，和今晚告别' }); return; } state.transition = true; dom.endingButton?.classList.add('is-collapsing'); prepareIris(event); director.handleFinaleClick(event, { scene: '#outroScene', trigger: dom.endingButton, wipe: '#whiteIris', collapseTargets: '.outro-copy > *, .outro-orbit, .edge-note', globalTargets: '#hud, #chapterRail, .credits-trigger, .arc-layer', onComplete: revealFinalScene }); }
  function prepareIris(event) { if (!dom.whiteIris) return; const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2; const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight * 0.72; const radius = Math.max(Math.hypot(x, y), Math.hypot(window.innerWidth - x, y), Math.hypot(x, window.innerHeight - y), Math.hypot(window.innerWidth - x, window.innerHeight - y)); Object.assign(dom.whiteIris.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, width: `${radius * 2}px`, height: `${radius * 2}px`, borderRadius: '50%', pointerEvents: 'none' }); dom.whiteIris.classList.add('is-visible'); }
  function revealFinalScene() { const outro = scenes.get('outro'); const final = scenes.get('final'); outro?.classList.remove('is-active'); outro?.setAttribute('aria-hidden', 'true'); final?.classList.add('is-active'); final?.setAttribute('aria-hidden', 'false'); state.scene = 'final'; state.visitedScenes.add('final'); state.endingComplete = true; state.transition = false; app.dataset.scene = 'final'; dom.hud?.classList.add('is-concealed'); dom.rail?.classList.add('is-concealed'); director.engine.to(dom.whiteIris, { autoAlpha: 0, duration: director.duration(0.9), ease: 'power2.inOut', onComplete: () => { dom.whiteIris?.classList.remove('is-visible'); syncDirectionalControls(); } }); }
  function cycleSpeed() { state.speedIndex = (state.speedIndex + 1) % SPEEDS.length; const speed = SPEEDS[state.speedIndex]; stage.setSpeed(speed); if (dom.speedButton) dom.speedButton.textContent = `${speed}×`; announce(`鹊桥速度 ${speed}×`); }
  function toggleSound() { state.sound = !state.sound; audioDirector.setMuted(!state.sound); if (state.sound && state.scene !== 'loader') audioDirector.start(state.scene); updateSoundControl(); }
  function updateSoundControl() { if (!dom.soundButton) return; dom.soundButton.setAttribute('aria-pressed', String(state.sound)); dom.soundButton.setAttribute('aria-label', state.sound ? '关闭声音' : '开启声音'); const icon = $('[data-lucide]', dom.soundButton); if (icon) icon.setAttribute('data-lucide', state.sound ? 'volume-2' : 'volume-x'); const label = $('.control-label', dom.soundButton); if (label) label.textContent = state.sound ? 'SOUND' : 'MUTED'; createIcons({ icons }); }
  function resumeInlineVideo(video) { if (!video) return; video.muted = true; video.play()?.catch?.(() => {}); }
  function openPlayer(opener) { const source = opener.dataset.playerSrc; if (!source || !dom.playerOverlay || !dom.playerVideo) return; lastPlayerOpener = opener; pauseOffsceneMedia('__player__'); director.openPlayer({ player: dom.playerOverlay, panel: dom.playerVideo, video: dom.playerVideo, source, currentTime: Number(opener.dataset.playerStart) || 0, autoplay: true, onOpen: () => { $('.player-close', dom.playerOverlay)?.focus(); syncDirectionalControls(); } }); syncDirectionalControls(); }
  function closePlayer() { if (!dom.playerOverlay?.classList.contains('is-open')) return; director.closePlayer({ player: dom.playerOverlay, panel: dom.playerVideo, video: dom.playerVideo, clearSource: true, onClose: () => { lastPlayerOpener?.focus?.(); lastPlayerOpener = null; if (state.scene === 'ai' && state.exploded.ai) resumeInlineVideo(dom.aiVideo); if (state.scene === 'game' && state.exploded.game) resumeInlineVideo(dom.gameVideo); syncDirectionalControls(); } }); }
  function toggleCredits(force) { const open = force ?? !dom.creditsPanel?.classList.contains('is-open'); dom.creditsPanel?.classList.toggle('is-open', open); dom.creditsPanel?.setAttribute('aria-hidden', String(!open)); syncDirectionalControls(); }
  function jumpRail(target) {
    const targetScene = target === 'bridge' ? 'bridge' : target === 'hub' ? 'hub' : target === 'constellation' ? 'constellation' : target === 'outro' ? 'outro' : null;
    if (!targetScene || !state.visitedScenes.has(targetScene)) { announce('这一章还没有走到。'); return; }
    const currentIndex = NAV_SCENES.indexOf(state.scene); const targetIndex = NAV_SCENES.indexOf(targetScene);
    if (targetIndex > currentIndex && !forwardGate(state.scene).open) { announce(forwardGate(state.scene).message); return; }
    transitionTo(targetScene, { direction: targetIndex < currentIndex ? -1 : 1, axis: 'y' });
  }
  function updateHud() { const scene = state.scene; const section = scene === 'bridge' || scene === 'reversal' ? 0 : scene === 'hub' || WORLD_SCENES.includes(scene) ? 1 : scene === 'constellation' ? 2 : 3; const labels = [['01', '鹊桥'], ['02', '单人宇宙'], ['03', '星辰回收'], ['04', '与自己相见']]; if (dom.chapterIndex) dom.chapterIndex.textContent = labels[section][0]; if (dom.chapterName) dom.chapterName.textContent = labels[section][1]; dom.railPoints.forEach((point, index) => { point.classList.toggle('is-active', index === section); point.classList.toggle('is-complete', index < section); }); let progress = 0; if (section === 0) progress = stage.progress; if (section === 1) progress = state.stars.length / 4; if (section === 2) progress = Math.min(1, state.returnedStars.length / Math.max(2, state.stars.length)); if (section === 3) progress = state.scene === 'final' ? 1 : 0.5; if (dom.chapterProgress) dom.chapterProgress.style.width = `${progress * 100}%`; syncDirectionalControls(); }
  function announce(message) { if (!dom.toast) return; dom.toast.textContent = message; dom.toast.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => dom.toast?.classList.remove('is-visible'), 2200); }
  function restartExperience() { window.location.reload(); }

  // Register input handlers after the complete boot-scoped function set exists.
  bindInteractions();
}
