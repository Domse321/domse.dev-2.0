'use strict';

(() => {
  const exerciseIds = ['goblet', 'rdl', 'row', 'press', 'lunge', 'ohp', 'latraise', 'curl', 'triceps', 'revfly'];
  const legacyKey = 'domse-sport-done-v1';
  const localDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const storageKey = `domse-sport-session-v2:${localDate()}`;
  let storageAvailable = true;

  const emptyState = () => ({
    version: 2,
    date: localDate(),
    done: {},
    warmup: false,
    form: false,
    timer: { elapsedMs: 0, runningSince: null }
  });

  function safeRead(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      const value = JSON.parse(raw);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (error) {
      if (error?.name === 'SecurityError') storageAvailable = false;
      return null;
    }
  }

  function safeWrite(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_error) {
      storageAvailable = false;
      return false;
    }
  }

  function normaliseState(candidate) {
    const clean = emptyState();
    if (!candidate || candidate.version !== 2 || candidate.date !== localDate()) return clean;
    if (candidate.done && typeof candidate.done === 'object') {
      for (const id of exerciseIds) clean.done[id] = candidate.done[id] === true;
    }
    clean.warmup = candidate.warmup === true;
    clean.form = candidate.form === true;
    const timer = candidate.timer;
    if (timer && Number.isFinite(timer.elapsedMs) && timer.elapsedMs >= 0) {
      clean.timer.elapsedMs = Math.min(timer.elapsedMs, 24 * 60 * 60 * 1000);
    }
    if (timer && Number.isFinite(timer.runningSince) && timer.runningSince > 0 && timer.runningSince <= Date.now()) {
      clean.timer.runningSince = timer.runningSince;
    }
    return clean;
  }

  const saved = safeRead(storageKey);
  let state = normaliseState(saved);
  if (!saved) {
    const legacy = safeRead(legacyKey);
    if (legacy) {
      for (const id of exerciseIds) state.done[id] = legacy[id] === true;
    }
    safeWrite(storageKey, state);
  }

  const timerOutput = document.querySelector('#timer');
  const timerStatus = document.querySelector('#timerStatus');
  const progress = document.querySelector('#progress');
  const doneCount = document.querySelector('#doneCount');
  const warmupCheck = document.querySelector('#warmupCheck');
  const formCheck = document.querySelector('#formCheck');
  const storageStatus = document.querySelector('#storageStatus');
  const startButton = document.querySelector('[data-timer="start"]');
  const pauseButton = document.querySelector('[data-timer="pause"]');
  let timerHandle = null;

  function currentElapsed() {
    if (state.timer.runningSince === null) return state.timer.elapsedMs;
    return state.timer.elapsedMs + (Date.now() - state.timer.runningSince);
  }

  function formatElapsed(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function drawTimer() {
    timerOutput.textContent = formatElapsed(currentElapsed());
  }

  function beginTicking() {
    if (timerHandle !== null) return;
    timerHandle = window.setInterval(drawTimer, 250);
  }

  function stopTicking() {
    if (timerHandle !== null) window.clearInterval(timerHandle);
    timerHandle = null;
  }

  function persist() {
    const stored = safeWrite(storageKey, state);
    if (storageStatus) {
      storageStatus.textContent = stored
        ? 'Dein Trainingsstand wird nur in diesem Browser gespeichert.'
        : 'Der Browser blockiert die Speicherung. Die aktuelle Session funktioniert, geht nach dem Schließen aber verloren.';
      storageStatus.classList.toggle('is-error', !stored);
    }
    return stored;
  }

  function setTimerStatus(message) {
    timerStatus.textContent = message;
  }

  function updateTimerControls() {
    const running = state.timer.runningSince !== null;
    startButton.disabled = running;
    pauseButton.disabled = !running;
  }

  function startTimer() {
    if (state.timer.runningSince !== null) return;
    state.timer.runningSince = Date.now();
    persist();
    beginTicking();
    updateTimerControls();
    setTimerStatus('Timer läuft.');
  }

  function pauseTimer() {
    if (state.timer.runningSince === null) return;
    state.timer.elapsedMs += Date.now() - state.timer.runningSince;
    state.timer.runningSince = null;
    persist();
    stopTicking();
    drawTimer();
    updateTimerControls();
    setTimerStatus('Timer pausiert.');
  }

  function resetTimer() {
    stopTicking();
    state.timer = { elapsedMs: 0, runningSince: null };
    persist();
    drawTimer();
    updateTimerControls();
    setTimerStatus('Timer zurückgesetzt.');
  }

  function updateProgress() {
    const count = exerciseIds.filter((id) => state.done[id] === true).length;
    doneCount.textContent = `${count}/10`;
    progress.value = count;
    progress.textContent = `${count} von 10`;
  }

  function applyState() {
    document.querySelectorAll('[data-done]').forEach((input) => {
      input.checked = state.done[input.dataset.done] === true;
    });
    warmupCheck.checked = state.warmup;
    formCheck.checked = state.form;
    updateProgress();
    drawTimer();
    updateTimerControls();
    if (!storageAvailable && storageStatus) {
      storageStatus.textContent = 'Der Browser blockiert die Speicherung. Die aktuelle Session funktioniert, geht nach dem Schließen aber verloren.';
      storageStatus.classList.add('is-error');
    }
    if (state.timer.runningSince !== null) {
      beginTicking();
      setTimerStatus('Timer läuft.');
    }
  }

  document.querySelectorAll('[data-timer]').forEach((button) => {
    button.addEventListener('click', () => {
      const actions = { start: startTimer, pause: pauseTimer, reset: resetTimer };
      const action = actions[button.dataset.timer];
      if (action) action();
    });
  });

  document.querySelectorAll('[data-done]').forEach((input) => {
    input.addEventListener('change', () => {
      state.done[input.dataset.done] = input.checked;
      persist();
      updateProgress();
    });
  });

  warmupCheck.addEventListener('change', () => {
    state.warmup = warmupCheck.checked;
    persist();
  });

  formCheck.addEventListener('change', () => {
    state.form = formCheck.checked;
    persist();
  });

  document.querySelector('#resetSession').addEventListener('click', () => {
    const confirmed = window.confirm('Heutige Häkchen und Timer wirklich zurücksetzen?');
    if (!confirmed) return;
    stopTicking();
    state = emptyState();
    persist();
    applyState();
    setTimerStatus('Heutige Session zurückgesetzt.');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) drawTimer();
  });
  window.addEventListener('pagehide', persist);

  applyState();
})();
