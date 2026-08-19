const SCENES = ['loader','bridge','reversal','lobby','ai','game','anime','city','deep','outro'];
const LABELS = ['00 / MAGPIE BRIDGE','01 / QIXI STORY','02 / REFRAMED','03 / SOLO MODE','04 / AI STAR','05 / GAME STAR','06 / ANIME STAR','07 / CITY STAR','08 / CONSTELLATION','09 / MEETING YOURSELF'];
const STAR_ORDER = ['AI','GAME','ANIME','CITY'];

export function nextChapter(current, direction) {
  return Math.max(0, Math.min(SCENES.length - 1, current + direction));
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

const app = typeof document === 'undefined' ? null : document.querySelector('#app');
if (app) {
  const scenes = [...document.querySelectorAll('.scene')];
  const rail = [...document.querySelectorAll('.rail-dot')];
  const chapterLabel = document.querySelector('#chapterLabel');
  const starCount = document.querySelector('#starCount');
  const toast = document.querySelector('#toast');
  const audio = document.querySelector('#introAudio');
  const soundToggle = document.querySelector('#soundToggle');
  const soundText = document.querySelector('#soundText');
  const state = { current: 0, entered: false, stars: [], returnedStars: [], sound: false, aiChoice: '', animeChoice: '', cityChoice: '', constellationUnlocked: false };
  let wheelLock = false;
  let toastTimer;
  let outroTimer;

  const announce = (message) => {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
  };

  const updateRail = () => {
    rail.forEach((dot, index) => {
      dot.classList.toggle('is-active', index === state.current);
      dot.classList.toggle('is-complete', index > 3 && index < 8 && state.stars.includes(STAR_ORDER[index - 4]));
    });
    chapterLabel.textContent = LABELS[state.current];
    starCount.textContent = String(state.stars.length);
    document.body.classList.toggle('solo-mode', state.current >= 3);
  };

  const persist = () => localStorage.setItem('qixi-solo-progress-v1', JSON.stringify({ stars: state.stars, returnedStars: state.returnedStars, aiChoice: state.aiChoice, animeChoice: state.animeChoice, cityChoice: state.cityChoice }));
  const restore = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('qixi-solo-progress-v1') || 'null');
      if (!saved) return;
      state.stars = saved.stars || [];
      state.returnedStars = saved.returnedStars || [];
      state.aiChoice = saved.aiChoice || '';
      state.animeChoice = saved.animeChoice || '';
      state.cityChoice = saved.cityChoice || '';
      state.constellationUnlocked = state.returnedStars.length >= 2;
      if (state.aiChoice) {
        const card = [...document.querySelectorAll('.ai-card')].find((item) => item.dataset.ai === state.aiChoice);
        card?.classList.add('is-selected');
        card?.setAttribute('aria-pressed', 'true');
        document.querySelector('#aiResult').textContent = `${state.aiChoice}：今晚不负责振作，只陪你把话说完。 · AI STAR ACQUIRED`;
        document.querySelector('#aiResult').classList.add('is-success');
      }
      if (state.animeChoice) {
        document.querySelector('#animeResult').textContent = `${state.animeChoice}：今晚的主角可以是你。 · ANIME STAR ACQUIRED`;
        document.querySelector('#animeResult').classList.add('is-success');
      }
      if (state.cityChoice) {
        const route = [...document.querySelectorAll('.route-item')].find((item) => item.dataset.route === state.cityChoice);
        route?.classList.add('is-selected');
        document.querySelector('#cityResult').textContent = `${state.cityChoice}：这座城市还没有睡。 · CITY STAR ACQUIRED`;
        document.querySelector('#cityResult').classList.add('is-success');
      }
      if (state.stars.includes('GAME')) {
        const button = document.querySelector('#energyButton');
        button.classList.add('is-complete');
        button.querySelector('strong').textContent = '已暂停';
        document.querySelector('#energyStatus').textContent = 'REALITY PAUSED · 00:00:07';
      }
      const slots = [[44,45],[56,45],[44,58],[56,58]];
      state.returnedStars.forEach((name, index) => {
        const star = document.querySelector(`.constellation-star[data-star="${name}"]`);
        const slot = slots[index];
        if (!star || !slot) return;
        star.classList.add('is-returned');
        star.style.left = `${slot[0]}%`;
        star.style.top = `${slot[1]}%`;
        star.style.transform = 'translate(-50%, -50%) scale(.72)';
      });
      if (state.constellationUnlocked) document.querySelector('#bridgeRebuild')?.classList.add('is-visible');
    } catch (_) {}
  };

  function goTo(index, force = false) {
    const target = Math.max(0, Math.min(scenes.length - 1, index));
    if (!force && target === state.current) return;
    if (target === 8 && state.stars.length < 2) { announce('至少点亮两颗星，才能重新搭桥。'); return false; }
    if (target === 9 && !state.constellationUnlocked) { announce('先把星星带回中央，尾声才会出现。'); return false; }
    if (state.current === 8 && target !== 9) { clearTimeout(outroTimer); outroTimer = null; }
    if (state.current === 5 && target !== 5) stopCharge();
    scenes[state.current]?.classList.remove('is-active');
    state.current = target;
    scenes[state.current]?.classList.add('is-active');
    updateRail();
    if (state.current === 8) refreshConstellation();
    return true;
  }

  const move = (direction) => {
    if (!state.entered || wheelLock) return;
    wheelLock = true;
    goTo(nextChapter(state.current, direction));
    setTimeout(() => { wheelLock = false; }, 600);
  };

  const enableSound = async () => {
    state.sound = !state.sound;
    soundToggle.setAttribute('aria-pressed', String(state.sound));
    soundToggle.setAttribute('aria-label', state.sound ? '关闭声音' : '开启声音');
    soundText.textContent = state.sound ? 'SOUND ON' : 'SOUND OFF';
    if (state.sound) { try { audio.volume = .24; await audio.play(); } catch (_) { announce('浏览器阻止了自动声音，请再次点击声音按钮。'); } }
    else audio.pause();
  };

  function enter() {
    state.entered = true;
    goTo(1, true);
    announce('鹊桥正在搭建。');
  }

  function collect(star, message) {
    const before = state.stars.length;
    state.stars = collectStar(state.stars, star);
    persist();
    updateRail();
    if (state.stars.length > before) announce(message);
  }

  const loaderProgress = document.querySelector('#loaderProgress');
  const loaderStatus = document.querySelector('#loaderStatus');
  const loaderStartedAt = performance.now();
  const updateLoader = (now) => {
    const progress = Math.min(100, Math.round(((now - loaderStartedAt) / 1600) * 100));
    loaderProgress.style.width = `${progress}%`;
    loaderStatus.textContent = progress < 100 ? `正在为今晚寻找一座桥 · ${progress}%` : '鹊桥已找到 · 今晚由你决定';
    if (progress < 100) requestAnimationFrame(updateLoader);
  };
  requestAnimationFrame(updateLoader);

  const aiResult = document.querySelector('#aiResult');
  document.querySelectorAll('.ai-card').forEach((card) => card.addEventListener('click', () => {
    document.querySelectorAll('.ai-card').forEach((item) => { item.classList.remove('is-selected'); item.setAttribute('aria-pressed', 'false'); });
    card.classList.add('is-selected');
    card.setAttribute('aria-pressed', 'true');
    const role = card.dataset.ai;
    state.aiChoice = role;
    aiResult.textContent = `${role}：今晚不负责振作，只陪你把话说完。 · AI STAR ACQUIRED`;
    aiResult.classList.add('is-success');
    collect('AI', 'AI 星已点亮：今晚的身份是 ' + role + '。');
  }));

  const energyButton = document.querySelector('#energyButton');
  const energyStatus = document.querySelector('#energyStatus');
  let chargeTimer;
  let chargeStart;
  const startCharge = (event) => { event.preventDefault(); if (energyButton.classList.contains('is-complete') || energyButton.classList.contains('is-charging')) return; energyButton.classList.add('is-charging'); energyButton.querySelector('strong').textContent = '充能中'; chargeStart = performance.now(); chargeTimer = requestAnimationFrame(tickCharge); };
  const tickCharge = (now) => { const progress = Math.min(1, (now - chargeStart) / 7000); energyStatus.textContent = `REALITY PAUSED · 00:00:${String(Math.floor(progress * 7)).padStart(2, '0')}`; if (progress >= 1) { energyButton.classList.remove('is-charging'); energyButton.classList.add('is-complete'); energyButton.querySelector('strong').textContent = '已暂停'; energyStatus.textContent = 'REALITY PAUSED · 00:00:07'; collect('GAME', 'GAME 星已点亮：现实暂停了七秒。'); return; } chargeTimer = requestAnimationFrame(tickCharge); };
  const stopCharge = () => { cancelAnimationFrame(chargeTimer); if (!energyButton.classList.contains('is-complete')) { energyButton.classList.remove('is-charging'); energyButton.querySelector('strong').textContent = '点击充能'; energyStatus.textContent = 'REALITY PAUSED · 00:00:00'; } };
  energyButton.addEventListener('click', (event) => { if (energyButton.classList.contains('is-charging')) stopCharge(); else startCharge(event); });

  const animeResult = document.querySelector('#animeResult');
  document.querySelectorAll('.comic-frame').forEach((frame) => frame.addEventListener('click', () => { const choice = frame.querySelector('span')?.textContent || '主角'; state.animeChoice = choice; animeResult.textContent = `${choice}：今晚的主角可以是你。 · ANIME STAR ACQUIRED`; animeResult.classList.add('is-success'); collect('ANIME', `ANIME 星已点亮：你选择了${choice}。`); }));
  document.querySelector('#mirrorButton').addEventListener('click', () => { const mirror = document.querySelector('#mirrorButton'); mirror.classList.toggle('is-reflected'); mirror.querySelector('span').textContent = mirror.classList.contains('is-reflected') ? '主角已重写' : '点击镜面'; if (mirror.classList.contains('is-reflected')) collect('ANIME', '镜面已重写：今晚的主角是你。'); });

  const cityResult = document.querySelector('#cityResult');
  document.querySelectorAll('.route-item').forEach((item) => item.addEventListener('click', () => { document.querySelectorAll('.route-item').forEach((route) => route.classList.remove('is-selected')); item.classList.add('is-selected'); state.cityChoice = item.dataset.route; cityResult.textContent = `${item.dataset.route}：这座城市还没有睡。 · CITY STAR ACQUIRED`; cityResult.classList.add('is-success'); collect('CITY', `CITY 星已点亮：今晚的路线是 ${item.dataset.route}。`); }));

  const constellationResult = document.querySelector('#constellationResult');
  const rebuild = document.querySelector('#bridgeRebuild');
  function refreshConstellation() {
    if (state.stars.length < 2) constellationResult.textContent = '至少点亮两颗星，才能重新搭桥。';
    else if (state.returnedStars.length < 2) constellationResult.textContent = `已找回 ${state.returnedStars.length} / ${state.stars.length} · 拖动或点击星星回到中央。`;
    else constellationResult.textContent = `${deriveConstellation(state.returnedStars)} · 新的鹊桥正在生成。`;
    if (state.returnedStars.length >= 2 && !state.constellationUnlocked) {
      state.constellationUnlocked = true;
      rebuild.classList.add('is-visible');
      clearTimeout(outroTimer);
      outroTimer = setTimeout(() => goTo(9), 1800);
    }
  }
  const returnStar = (star) => {
    const name = star.dataset.star;
    if (!state.stars.includes(name)) {
      star.style.opacity = '.35';
      announce(`还没有点亮 ${name} 星。先去那个世界走一趟。`);
      return;
    }
    if (state.returnedStars.includes(name)) return;
    state.returnedStars.push(name);
    const slots = [[44,45],[56,45],[44,58],[56,58]];
    const [left, top] = slots[state.returnedStars.length - 1];
    star.classList.add('is-returned');
    star.style.left = `${left}%`;
    star.style.top = `${top}%`;
    star.style.transform = 'translate(-50%, -50%) scale(.72)';
    persist();
    refreshConstellation();
  };
  document.querySelectorAll('.constellation-star').forEach((star) => {
    let dragStart = null;
    star.addEventListener('pointerdown', (event) => {
      if (!state.stars.includes(star.dataset.star) || state.returnedStars.includes(star.dataset.star)) return;
      dragStart = { x: event.clientX, y: event.clientY };
      star.setPointerCapture?.(event.pointerId);
      star.classList.add('is-dragging');
    });
    star.addEventListener('pointermove', (event) => {
      if (!dragStart) return;
      star.style.transform = `translate(${event.clientX - dragStart.x}px, ${event.clientY - dragStart.y}px) scale(1.05)`;
    });
    star.addEventListener('pointerup', (event) => {
      if (!dragStart) return;
      const distance = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y);
      dragStart = null;
      star.classList.remove('is-dragging');
      star.style.transform = '';
      if (distance > 24) returnStar(star);
    });
    star.addEventListener('pointercancel', () => { dragStart = null; star.classList.remove('is-dragging'); star.style.transform = ''; });
    star.addEventListener('click', () => returnStar(star));
  });

  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'enter') enter();
    if (action === 'next') move(1);
    if (action === 'solo') goTo(3, true);
    if (action === 'sound') enableSound();
    if (action === 'home') {
      clearTimeout(outroTimer);
      stopCharge();
      state.entered = false;
      state.stars = [];
      state.returnedStars = [];
      state.animeChoice = '';
      state.cityChoice = '';
      state.constellationUnlocked = false;
      localStorage.removeItem('qixi-solo-progress-v1');
      rebuild.classList.remove('is-visible');
      document.querySelectorAll('.constellation-star').forEach((star) => { star.classList.remove('is-returned', 'is-dragging'); star.removeAttribute('style'); });
      document.querySelectorAll('.ai-card').forEach((card) => { card.classList.remove('is-selected'); card.setAttribute('aria-pressed', 'false'); });
      document.querySelectorAll('.route-item').forEach((route) => route.classList.remove('is-selected'));
      aiResult.textContent = '选择一个角色，星星会亮起来。';
      aiResult.classList.remove('is-success');
      animeResult.textContent = '拖动或点击一格分镜。';
      animeResult.classList.remove('is-success');
      cityResult.textContent = '选择一条路线，给今晚一个落点。';
      cityResult.classList.remove('is-success');
      energyButton.classList.remove('is-complete', 'is-charging');
      energyButton.querySelector('strong').textContent = '点击充能';
      energyStatus.textContent = 'REALITY PAUSED · 00:00:00';
      const mirror = document.querySelector('#mirrorButton');
      mirror.classList.remove('is-reflected');
      mirror.querySelector('span').textContent = '点击镜面';
      goTo(0, true);
    }
    if (action === 'share') { const constellation = state.returnedStars.length ? state.returnedStars : state.stars; const content = `鹊桥借我一晚\n${deriveConstellation(constellation)}\n${constellation.join(' · ')}\n我今晚，先和自己见面。`; navigator.clipboard?.writeText(content).then(() => announce('今晚的星图已复制到剪贴板。')).catch(() => announce(content)); }
    if (action === 'close-credits') document.querySelector('#creditsPanel').classList.remove('is-open');
  }));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => {
    const target = Number(button.dataset.go);
    if (target > 0) state.entered = true;
    goTo(target, true);
  }));

  window.addEventListener('wheel', (event) => { if (Math.abs(event.deltaY) > 14) move(event.deltaY > 0 ? 1 : -1); }, { passive: true });
  window.addEventListener('keydown', (event) => { if (['ArrowDown','PageDown','Enter',' '].includes(event.key)) { event.preventDefault(); if (!state.entered && state.current === 0) enter(); else move(1); } if (['ArrowUp','PageUp'].includes(event.key)) { event.preventDefault(); move(-1); } if (event.key === 'Escape') document.querySelector('#creditsPanel').classList.remove('is-open'); });
  let touchStart = 0; window.addEventListener('touchstart', (event) => { touchStart = event.touches[0].clientY; }, { passive: true }); window.addEventListener('touchend', (event) => { const delta = touchStart - event.changedTouches[0].clientY; if (Math.abs(delta) > 45) move(delta > 0 ? 1 : -1); touchStart = 0; }, { passive: true });

  const canvas = document.querySelector('#starCanvas'); const ctx = canvas.getContext('2d'); let stars = [];
  const resize = () => { const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); stars = Array.from({ length: Math.min(160, Math.floor(innerWidth / 8)) }, (_, index) => ({ x: (index * 73.7) % innerWidth, y: (index * 41.3) % innerHeight, r: 0.5 + (index % 3) * .35, a: .18 + (index % 5) * .08 })); };
  const drawStars = (time = 0) => { ctx.clearRect(0, 0, innerWidth, innerHeight); for (const star of stars) { const alpha = star.a + Math.sin(time / 900 + star.x) * .08; ctx.fillStyle = `rgba(230,188,104,${Math.max(.05, alpha)})`; ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill(); } requestAnimationFrame(drawStars); };
  resize(); window.addEventListener('resize', resize); requestAnimationFrame(drawStars); restore(); updateRail();
}
