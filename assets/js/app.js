/* =========================================================================
   Логика квеста
   -------------------------------------------------------------------------
   Маршрут задаётся хэшем:  сайт/#/<token>
   Этап открывается, только если предыдущий решён — перескочить нельзя.
   Прогресс хранится в localStorage, чтобы закрытая вкладка ничего не стёрла.
   ========================================================================= */
(() => {
'use strict';

const STORAGE_KEY = 'quest-progress-v1';
const $  = (sel) => document.querySelector(sel);
const steps = QUEST.steps;
const SYS = QUEST.system;

/* ---------------------------------------------------------------- состояние */
const blank = { reached: 0, solved: 0, done: false };
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...blank };
    const parsed = JSON.parse(raw);
    return {
      reached: Number(parsed.reached) || 0,
      solved:  Number(parsed.solved)  || 0,
      done:    Boolean(parsed.done)
    };
  } catch (e) {
    return { ...blank };
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* приватный режим */ }
}

function reset() {
  state = { ...blank };
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  location.hash = '';
  route();
}

/* ------------------------------------------------------------------ утилиты */

/** Приводит ответ к виду, в котором мелочи не мешают: регистр, ё, пунктуация. */
function normalize(str) {
  return String(str)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '')
    .trim();
}

function buzz(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
}

function setText(sel, value) {
  const el = $(sel);
  if (el) el.textContent = value || '';
}

/* ------------------------------------------------------------------- экраны */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  const el = $(id);
  if (el) {
    el.classList.add('is-active');
    // перезапуск stagger-анимации при повторном показе
    el.querySelectorAll('.stagger').forEach(n => {
      n.style.animation = 'none';
      void n.offsetHeight;
      n.style.animation = '';
    });
  }
  scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
}

function renderProgress(activeStep) {
  const bar = $('#progress');
  if (!activeStep) { bar.classList.add('is-hidden'); return; }

  bar.classList.remove('is-hidden');
  const step = steps.find(s => s.id === activeStep);
  setText('#progress-label', (step && step.badge) || 'Квест');

  // Секретные этапы не входят в счёт: до самого конца квест выглядит как «12 / 12».
  const visible = steps.filter(s => !s.secret);

  if (step && step.secret) {
    setText('#progress-count', '');
    $('#progress-fill').style.width = '100%';
    return;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const place = visible.findIndex(s => s.id === activeStep) + 1;
  const done  = visible.filter(s => s.id <= state.solved).length;
  setText('#progress-count', pad(place) + ' / ' + pad(visible.length));
  const share = (done + (place > done ? .5 : 0)) / visible.length;
  $('#progress-fill').style.width = Math.min(100, share * 100) + '%';
}

/* ---------------------------------------------------------------- приветствие */
function renderIntro() {
  const c = QUEST.intro;
  setText('#intro-kicker', c.kicker);
  setText('#intro-title',  c.title);
  setText('#intro-text',   c.text);
  setText('#intro-note',   c.note);
  setText('#intro-start',  c.button);
  $('#intro-text').style.whiteSpace = 'pre-line';

  renderProgress(0);
  show('#screen-intro');
}

/* -------------------------------------------------------------------- задание */
let currentStep = 0;      // индекс в steps

function renderTask(idx) {
  currentStep = idx;
  const step = steps[idx];
  const t = step.task || {};

  setText('#task-title', step.title);
  setText('#task-text',  t.text);
  setText('#task-submit', t.button || 'Выполнено');

  // произвольная разметка задания: ребусы, схемы
  const extra = $('#task-extra');
  extra.innerHTML = t.html || '';
  extra.classList.toggle('is-hidden', !t.html);

  setupPlayer(t);

  // подсказка к заданию
  const reveal = $('#task-reveal');
  if (t.hint) {
    reveal.classList.remove('is-hidden', 'is-open');
    $('#task-reveal-btn').textContent = 'Нужна подсказка';
    setText('#task-reveal-body', t.hint);
  } else {
    reveal.classList.add('is-hidden');
  }

  renderProgress(step.id);
  show('#screen-task');
}

function showMsg(sel, text) {
  const box = $(sel);
  box.querySelector('span:last-child').textContent = text;
  box.classList.add('is-visible');
}
function hideMsg(sel) { $(sel).classList.remove('is-visible'); }

/* ---------------------------------------------------------------- плеер */

const audio = $('#task-audio');

function fmtTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function stopAudio() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  setPlayIcon(false);
}

function setPlayIcon(playing) {
  $('#player-icon-play').classList.toggle('is-hidden', playing);
  $('#player-icon-pause').classList.toggle('is-hidden', !playing);
  $('#player-play').setAttribute('aria-label', playing ? 'Пауза' : 'Включить');
}

/** Показывает проигрыватель, если у задания есть task.audio. */
function setupPlayer(task) {
  const box = $('#task-player');
  stopAudio();

  if (!task.audio) { box.classList.add('is-hidden'); return; }

  box.classList.remove('is-hidden');
  setText('#player-title', task.audioTitle || 'Трек');
  setText('#player-time', '0:00');
  $('#player-fill').style.width = '0%';
  audio.src = task.audio;
}

$('#player-play').addEventListener('click', () => {
  if (audio.paused) {
    // если файла нет или он не читается, промис отвалится — покажем это в подписи
    audio.play().then(() => setPlayIcon(true))
                .catch(() => setText('#player-title', 'Файл не найден'));
  } else {
    audio.pause();
    setPlayIcon(false);
  }
});

audio.addEventListener('timeupdate', () => {
  const d = audio.duration;
  if (isFinite(d) && d > 0) $('#player-fill').style.width = (audio.currentTime / d * 100) + '%';
  setText('#player-time', fmtTime(audio.currentTime));
});
audio.addEventListener('ended', () => { setPlayIcon(false); $('#player-fill').style.width = '100%'; });
audio.addEventListener('error', () => { if (audio.getAttribute('src')) setText('#player-title', 'Файл не найден'); });

// перемотка по клику на дорожку
$('#player-track').addEventListener('click', (e) => {
  const d = audio.duration;
  if (!isFinite(d) || d <= 0) return;
  const box = e.currentTarget.getBoundingClientRect();
  audio.currentTime = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * d;
});

/** Этап засчитан: сохраняем прогресс и показываем, где искать следующий QR. */
function solve(quiet) {
  stopAudio();
  const n = steps[currentStep].id;
  state.solved  = Math.max(state.solved, n);
  state.reached = Math.max(state.reached, n);
  save();
  if (!quiet) Confetti.burst(.5, .45, 34);
  renderReward(currentStep);
}

/** Есть ли у этапа задание. Стартовый этап (торт) его не имеет. */
function hasTask(step) {
  return !!(step.task && step.task.text);
}

/**
 * Открывает этап: с заданием — показывает задание,
 * без задания — сразу засчитывает и ведёт к подсказке.
 */
function openStep(idx) {
  currentStep = idx;
  if (hasTask(steps[idx])) renderTask(idx);
  else solve(true);
}

/* --------------------------------------------------- подсказка, где искать QR */
function renderReward(idx) {
  const r = steps[idx].reward || {};
  setText('#reward-label', r.label || SYS.whereLabel);
  setText('#reward-title', r.title || 'Готово');
  setText('#reward-text',  r.text  || '');
  setText('#reward-where', r.where || '');

  const note = $('#reward-note');
  note.textContent = r.note || '';
  note.classList.toggle('is-hidden', !r.note);

  const img = $('#reward-img');
  if (r.image) {
    img.src = r.image;
    img.classList.remove('is-hidden');
  } else {
    img.classList.add('is-hidden');
    img.removeAttribute('src');
  }

  $('#reward-text').classList.toggle('is-hidden', !r.text);

  renderProgress(steps[idx].id);
  show('#screen-reward');
}

/* --------------------------------------------------------------------- финал */
function renderFinale(celebrate) {
  const f = QUEST.finale;
  setText('#finale-kicker', f.kicker);
  setText('#finale-title',  f.title);
  setText('#finale-text',   f.text);
  setText('#finale-btn',    f.button || 'Спасибо');

  const sig = $('#finale-signature');
  sig.textContent = f.signature || '';
  sig.classList.toggle('is-hidden', !f.signature);

  renderProgress(0);
  show('#screen-finale');
  if (celebrate) { Confetti.celebrate(); buzz([40, 80, 40, 80, 120]); }
}

/* ------------------------------------------------------ служебные сообщения */
function notice(title, text, buttonLabel) {
  setText('#notice-title', title);
  setText('#notice-text',  text);
  setText('#notice-back',  buttonLabel || SYS.resume);
  renderProgress(0);
  show('#screen-notice');
}

/* ------------------------------------------------------------- ручной ввод */
function renderManual() {
  setText('#manual-title', SYS.manualTitle);
  setText('#manual-text',  SYS.manualText);
  $('#manual-input').value = '';
  hideMsg('#manual-msg');
  show('#screen-manual');
  setTimeout(() => $('#manual-input').focus(), 350);
}

/* ---------------------------------------------------------------- маршрут */

/** Разбирает код из QR и решает, что показать. */
function openToken(rawToken) {
  const token = normalize(rawToken);
  if (!token) return route();

  // финальный код
  if (normalize(QUEST.finale.token) === token) {
    if (state.solved >= steps.length) {
      const first = !state.done;
      state.done = true;
      save();
      renderFinale(first);
    } else {
      notice(SYS.lockedTitle, SYS.lockedText, SYS.back);
    }
    return;
  }

  const idx = steps.findIndex(s => normalize(s.token) === token);
  if (idx === -1) {
    notice(SYS.unknownTitle, SYS.unknownText, SYS.back);
    return;
  }

  const n = steps[idx].id;

  if (n <= state.solved) {                 // этап уже пройден
    notice(SYS.usedTitle, SYS.usedText, SYS.resume);
    return;
  }
  if (n > state.solved + 1) {              // код из будущего
    notice(SYS.lockedTitle, SYS.lockedText, SYS.back);
    return;
  }

  state.reached = Math.max(state.reached, n);
  save();
  openStep(idx);
}

/** Показывает экран, соответствующий текущему прогрессу. */
function route() {
  if (state.done)                 return renderFinale(false);
  if (state.reached === 0)        return renderIntro();
  if (state.solved >= state.reached) return renderReward(state.solved - 1);
  return openStep(state.reached - 1);
}

/** Точка входа: хэш из QR-кода либо восстановление прогресса. */
function boot() {
  const hash = location.hash.replace(/^#\/?/, '');

  if (hash === 'reset') { reset(); return; }

  if (hash) {
    // убираем код из адресной строки, чтобы перезагрузка не ломала состояние
    history.replaceState(null, '', location.pathname + location.search);
    openToken(hash);
  } else {
    route();
  }
}

/* ------------------------------------------------------------- обработчики */
$('#intro-start').addEventListener('click', () => {
  state.reached = Math.max(state.reached, 1);
  save();
  openStep(0);
});

$('#task-submit').addEventListener('click', () => { buzz(30); solve(); });

$('#task-reveal-btn').addEventListener('click', () => {
  const r = $('#task-reveal');
  r.classList.toggle('is-open');
  $('#task-reveal-btn').textContent = r.classList.contains('is-open') ? 'Скрыть подсказку' : 'Нужна подсказка';
});

$('#notice-back').addEventListener('click', route);
$('#task-manual').addEventListener('click', renderManual);
$('#reward-manual').addEventListener('click', renderManual);
$('#manual-cancel').addEventListener('click', route);

$('#manual-submit').addEventListener('click', () => {
  const value = $('#manual-input').value.trim();
  if (!value) { showMsg('#manual-msg', SYS.manualEmpty); return; }
  $('#manual-input').blur();
  openToken(value);
});
$('#manual-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('#manual-submit').click(); }
});
$('#manual-input').addEventListener('input', () => hideMsg('#manual-msg'));

$('#finale-btn').addEventListener('click', () => Confetti.celebrate());

// переход по QR, когда вкладка уже открыта
addEventListener('hashchange', boot);

/* ----------------------------------------------------------------- старт */
document.title = QUEST.meta.title || 'Квест';
Confetti.init('#confetti');
boot();

// сброс прогресса из консоли или со страницы admin.html
window.questReset = reset;

})();
