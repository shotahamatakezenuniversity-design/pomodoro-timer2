// 初期設定値
const DEFAULT_CONFIG = {
  workSec: 25 * 60,
  shortBreakSec: 5 * 60,
  longBreakSec: 30 * 60,
  cyclesPerCool: 4,
  targetCools: 2,
  toneType: 'triangle',
  fanfareType: 'grand',
  volume: 0.25
};

let config = { ...DEFAULT_CONFIG };
const CIRCUMFERENCE = 2 * Math.PI * 100; // 628.318

// タイマー状態
let currentMode = 'WORK'; // 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK' | 'GOAL_REACHED'
let isRunning = false;
let startTime = 0;
let elapsedTime = 0;
let targetTime = config.workSec * 1000;

let currentCycle = 1;
let totalCycles = 0;
let totalCoolsAll = 0; // 総クール数
let completedTargetCools = 0; // 今回のセッションでの達成クール数

// DOM要素
const modeTextEl = document.getElementById('mode-text');
const progressCircle = document.getElementById('progress-circle');
const timeDisplayEl = document.getElementById('time-display');
const cycleTitleEl = document.getElementById('cycle-title');
const cycleDotsEl = document.getElementById('cycle-dots');
const totalCyclesEl = document.getElementById('total-cycles');
const totalCoolsAllEl = document.getElementById('total-cools-all');
const targetCoolsDisplayEl = document.getElementById('target-cools-display');

const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');

// 設定入力要素
const inputWorkMin = document.getElementById('input-work-min');
const inputWorkSec = document.getElementById('input-work-sec');
const inputShortMin = document.getElementById('input-short-min');
const inputShortSec = document.getElementById('input-short-sec');
const inputLongMin = document.getElementById('input-long-min');
const inputLongSec = document.getElementById('input-long-sec');
const inputCycles = document.getElementById('input-cycles');
const inputTargetCools = document.getElementById('input-target-cools');
const selectTone = document.getElementById('select-tone');
const selectFanfare = document.getElementById('select-fanfare');
const inputVolume = document.getElementById('input-volume');
const volumeVal = document.getElementById('volume-val');

const testSoundBtn = document.getElementById('test-sound-btn');
const testFanfareBtn = document.getElementById('test-fanfare-btn');
const resetStatsBtn = document.getElementById('reset-stats-btn');
const resetSettingsBtn = document.getElementById('reset-settings-btn');

// --- Web Audio API ---
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// 多彩な音色の発音処理
function playToneAt(freq, startTime, duration, toneType) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const peakVolume = Math.min(1.0, config.volume);

  let targetNode = gain;

  if (toneType === 'glocken') {
    // オルゴール・グロッケン（サイン波をオクターブ上でシャープに減衰）
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 2, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakVolume * 0.9, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(duration, 0.7));
  } else if (toneType === 'harp') {
    // ハープ（三角波 + ややゆったりした立ち上がりと長い余韻）
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakVolume * 0.8, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 1.2);
  } else if (toneType === 'xylophone') {
    // シロフォン（三角波を短くポンと叩く）
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 1.5, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakVolume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25);
  } else if (toneType === 'flute') {
    // フルート（のこぎり波 + 暖かみのあるローパスフィルター）
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, startTime);
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, startTime);
    osc.connect(filter);
    targetNode = filter;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakVolume * 0.7, startTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  } else {
    // 標準波形（triangle, sine, square, sawtooth）
    osc.type = toneType;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakVolume, startTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  }

  // 確実にAudioDestinationへ接続
  if (targetNode !== gain) {
    targetNode.connect(gain);
  } else {
    osc.connect(gain);
  }
  gain.connect(audioCtx.destination);

  osc.start(startTime);
  osc.stop(startTime + (toneType === 'harp' ? duration * 1.3 : duration));
}

// 通常メロディー再生
function playMelody(notes, step = 0.3, duration = 0.6, overrideTone = null) {
  initAudio();
  if (!audioCtx || config.volume <= 0) return;
  const now = audioCtx.currentTime;
  const tone = overrideTone || config.toneType;

  notes.forEach((freq, index) => {
    playToneAt(freq, now + index * step, duration, tone);
  });
}

// 達成メロディー（4種類）
function playGoalFanfare() {
  initAudio();
  if (!audioCtx || config.volume <= 0) return;
  const now = audioCtx.currentTime;

  switch (config.fanfareType) {
    case 'cheerful':
      // 爽やかクリアチャイム（ソ4 - ド5 - ミ5 - ソ5 - ド6）
      [
        { f: 392.00, t: 0, d: 0.3 },
        { f: 523.25, t: 0.18, d: 0.3 },
        { f: 659.25, t: 0.36, d: 0.3 },
        { f: 783.99, t: 0.54, d: 0.4 },
        { f: 1046.50, t: 0.76, d: 1.2 }
      ].forEach(n => playToneAt(n.f, now + n.t, n.d, 'triangle'));
      break;

    case 'levelup':
      // レトロ8bit風レベルアップ音
      [
        { f: 440.00, t: 0, d: 0.12 },
        { f: 554.37, t: 0.1, d: 0.12 },
        { f: 659.25, t: 0.2, d: 0.12 },
        { f: 880.00, t: 0.3, d: 0.15 },
        { f: 783.99, t: 0.45, d: 0.12 },
        { f: 880.00, t: 0.58, d: 0.8 }
      ].forEach(n => playToneAt(n.f, now + n.t, n.d, 'square'));
      break;

    case 'calm':
      // 穏やかなカデンツ（ハープ風の落ち着いた和音アルペジオ）
      [
        { f: 261.63, t: 0, d: 0.7 },
        { f: 329.63, t: 0.25, d: 0.7 },
        { f: 392.00, t: 0.5, d: 0.7 },
        { f: 523.25, t: 0.75, d: 1.4 }
      ].forEach(n => playToneAt(n.f, now + n.t, n.d, 'harp'));
      break;

    case 'grand':
    default:
      // 王道ロングファンファーレ
      [
        { f: 523.25, t: 0, d: 0.35 },
        { f: 659.25, t: 0.18, d: 0.35 },
        { f: 783.99, t: 0.36, d: 0.35 },
        { f: 1046.50, t: 0.54, d: 0.4 },
        { f: 1318.51, t: 0.74, d: 0.4 },
        { f: 1567.98, t: 0.94, d: 0.5 },
        { f: 2093.00, t: 1.18, d: 1.5 }
      ].forEach(n => playToneAt(n.f, now + n.t, n.d, config.toneType === 'glocken' ? 'glocken' : 'triangle'));
      break;
  }
}

// --- Web Worker（バックグラウンド動作の保証） ---
const workerCode = `
  let intervalId = null;
  self.onmessage = function(e) {
    if (e.data === 'start') {
      if (!intervalId) {
        intervalId = setInterval(() => self.postMessage('tick'), 200);
      }
    } else if (e.data === 'stop') {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  };
`;
const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
const timerWorker = new Worker(URL.createObjectURL(workerBlob));

timerWorker.onmessage = function() {
  tick();
};

// フェーズ切り替え
function handlePhaseTransition() {
  elapsedTime = 0;
  startTime = performance.now();

  if (currentMode === 'WORK') {
    totalCycles++;
    if (currentCycle >= config.cyclesPerCool) {
      currentMode = 'LONG_BREAK';
      targetTime = config.longBreakSec * 1000;
      playMelody([523.25, 659.25, 783.99, 1046.50], 0.32, 0.75);
    } else {
      currentMode = 'SHORT_BREAK';
      targetTime = config.shortBreakSec * 1000;
      playMelody([698.46, 880.00, 1046.50], 0.28, 0.65);
    }
  } else if (currentMode === 'SHORT_BREAK') {
    currentCycle++;
    currentMode = 'WORK';
    targetTime = config.workSec * 1000;
    playMelody([1046.50, 783.99, 523.25], 0.28, 0.65);
  } else if (currentMode === 'LONG_BREAK') {
    // 1クール完了
    totalCoolsAll++;
    completedTargetCools++;
    currentCycle = 1;

    if (completedTargetCools >= config.targetCools) {
      // 目標クール達成
      currentMode = 'GOAL_REACHED';
      isRunning = false;
      timerWorker.postMessage('stop');
      targetTime = 0;
      playGoalFanfare();
      updateStats();
      renderDots();
      renderUI();
      return;
    } else {
      currentMode = 'WORK';
      targetTime = config.workSec * 1000;
      playMelody([523.25, 587.33, 659.25, 783.99], 0.32, 0.75);
    }
  }

  updateStats();
  renderDots();
}

function tick() {
  if (isRunning) {
    const now = performance.now();
    elapsedTime = now - startTime;

    if (elapsedTime >= targetTime) {
      handlePhaseTransition();
    }
  }

  // 残り時間計算
  const remainingMillis = Math.max(0, targetTime - elapsedTime);
  const totalSeconds = Math.ceil(remainingMillis / 1000);
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  const timeText = `${mins}:${secs}`;

  timeDisplayEl.textContent = currentMode === 'GOAL_REACHED' ? 'GOAL!' : timeText;

  // タイトルバー更新
  let modeLabel = '作業中';
  if (currentMode === 'SHORT_BREAK') modeLabel = '小休憩';
  if (currentMode === 'LONG_BREAK') modeLabel = '大休憩';
  if (currentMode === 'GOAL_REACHED') {
    document.title = '🎉 目標クール達成！ | ポモドーロ';
  } else {
    document.title = `(${timeText}) ${modeLabel} | ポモドーロ`;
  }

  const progress = targetTime > 0 ? Math.min(1, Math.max(0, elapsedTime / targetTime)) : 1;
  progressCircle.style.strokeDashoffset = CIRCUMFERENCE * progress;

  renderUI();
}

function renderDots() {
  cycleDotsEl.innerHTML = '';
  for (let i = 1; i <= config.cyclesPerCool; i++) {
    const dot = document.createElement('div');
    dot.id = `dot-${i}`;
    dot.className = 'dot';
    dot.textContent = i;

    if (currentMode === 'GOAL_REACHED' || i < currentCycle || (i === currentCycle && currentMode !== 'WORK')) {
      dot.classList.add('completed');
    } else if (i === currentCycle) {
      if (isRunning) dot.classList.add('active-work');
      else dot.style.backgroundColor = '#e74c3c';
    }
    cycleDotsEl.appendChild(dot);
  }
}

function renderUI() {
  modeTextEl.className = 'mode-text';
  progressCircle.className.baseVal = 'progress-ring-circle';

  if (currentMode === 'WORK') {
    modeTextEl.textContent = '作業中 (集中)';
    modeTextEl.classList.add('mode-work');
    progressCircle.classList.add('mode-work-stroke');
  } else if (currentMode === 'SHORT_BREAK') {
    modeTextEl.textContent = '小休憩';
    modeTextEl.classList.add('mode-short-break');
    progressCircle.classList.add('mode-short-break-stroke');
  } else if (currentMode === 'LONG_BREAK') {
    modeTextEl.textContent = '大休憩';
    modeTextEl.classList.add('mode-long-break');
    progressCircle.classList.add('mode-long-break-stroke');
  } else if (currentMode === 'GOAL_REACHED') {
    modeTextEl.textContent = '🎉 目標クール達成！お疲れ様でした！';
    modeTextEl.classList.add('mode-short-break');
    progressCircle.classList.add('mode-short-break-stroke');
  }

  const currentCoolDisplay = Math.min(completedTargetCools + 1, config.targetCools);
  cycleTitleEl.textContent = `現在のクール進捗 (第 ${currentCoolDisplay} / ${config.targetCools} クール)`;

  for (let i = 1; i <= config.cyclesPerCool; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (!dot) continue;
    dot.className = 'dot';

    if (currentMode === 'GOAL_REACHED' || i < currentCycle || (i === currentCycle && currentMode !== 'WORK')) {
      dot.classList.add('completed');
    } else if (i === currentCycle) {
      if (isRunning) dot.classList.add('active-work');
      else dot.style.backgroundColor = '#e74c3c';
    }
  }
}

function updateStats() {
  totalCyclesEl.textContent = `${totalCycles} 回`;
  totalCoolsAllEl.textContent = `${totalCoolsAll} クール`;
  targetCoolsDisplayEl.textContent = `${completedTargetCools} / ${config.targetCools}`;
}

// 設定変更反映
function applySettings() {
  const wMin = parseInt(inputWorkMin.value, 10) || 0;
  const wSec = parseInt(inputWorkSec.value, 10) || 0;
  config.workSec = Math.max(1, wMin * 60 + wSec);

  const sMin = parseInt(inputShortMin.value, 10) || 0;
  const sSec = parseInt(inputShortSec.value, 10) || 0;
  config.shortBreakSec = Math.max(1, sMin * 60 + sSec);

  const lMin = parseInt(inputLongMin.value, 10) || 0;
  const lSec = parseInt(inputLongSec.value, 10) || 0;
  config.longBreakSec = Math.max(1, lMin * 60 + lSec);

  config.cyclesPerCool = Math.max(1, parseInt(inputCycles.value, 10) || 4);
  config.targetCools = Math.max(1, parseInt(inputTargetCools.value, 10) || 2);
  config.toneType = selectTone.value;
  config.fanfareType = selectFanfare.value;
  config.volume = parseInt(inputVolume.value, 10) / 100;

  if (!isRunning && elapsedTime === 0) {
    if (currentMode === 'WORK') targetTime = config.workSec * 1000;
    else if (currentMode === 'SHORT_BREAK') targetTime = config.shortBreakSec * 1000;
    else if (currentMode === 'LONG_BREAK') targetTime = config.longBreakSec * 1000;
  }

  renderDots();
  updateStats();
  tick();
}

// 入力フォームに現在のconfigを流し込む
function syncFormWithConfig() {
  inputWorkMin.value = Math.floor(config.workSec / 60);
  inputWorkSec.value = config.workSec % 60;
  inputShortMin.value = Math.floor(config.shortBreakSec / 60);
  inputShortSec.value = config.shortBreakSec % 60;
  inputLongMin.value = Math.floor(config.longBreakSec / 60);
  inputLongSec.value = config.longBreakSec % 60;

  inputCycles.value = config.cyclesPerCool;
  inputTargetCools.value = config.targetCools;
  selectTone.value = config.toneType;
  selectFanfare.value = config.fanfareType;
  inputVolume.value = Math.round(config.volume * 100);
  volumeVal.textContent = `${inputVolume.value}%`;
}

// --- イベントリスナー ---

// スタート
startBtn.addEventListener('click', () => {
  initAudio();
  if (currentMode === 'GOAL_REACHED') {
    completedTargetCools = 0;
    currentMode = 'WORK';
    targetTime = config.workSec * 1000;
    elapsedTime = 0;
  }
  if (!isRunning) {
    startTime = performance.now() - elapsedTime;
    isRunning = true;
    timerWorker.postMessage('start');
  }
});

// 一時停止
pauseBtn.addEventListener('click', () => {
  if (isRunning) {
    elapsedTime = performance.now() - startTime;
    isRunning = false;
    timerWorker.postMessage('stop');
    tick();
  }
});

// ① タイマーリセット（進行中のタイマー・現クール進捗のみリセット）
resetBtn.addEventListener('click', () => {
  isRunning = false;
  timerWorker.postMessage('stop');
  currentMode = 'WORK';
  targetTime = config.workSec * 1000;
  elapsedTime = 0;
  currentCycle = 1;
  document.title = 'ポモドーロタイマー';
  renderDots();
  renderUI();
  tick();
});

// ② 累計統計リセット（総サイクル、総クール、達成クール）
resetStatsBtn.addEventListener('click', () => {
  if (confirm('総サイクル数、総クール数、達成クール数を 0 にリセットしますか？')) {
    totalCycles = 0;
    totalCoolsAll = 0;
    completedTargetCools = 0;
    updateStats();
  }
});

// ③ 詳細設定のリセット（時間や音色を初期値へ）
resetSettingsBtn.addEventListener('click', () => {
  if (confirm('時間や音色の設定を初期値に戻しますか？')) {
    config = { ...DEFAULT_CONFIG };
    syncFormWithConfig();
    applySettings();
  }
});

// 入力イベント
[
  inputWorkMin, inputWorkSec,
  inputShortMin, inputShortSec,
  inputLongMin, inputLongSec,
  inputCycles, inputTargetCools,
  selectTone, selectFanfare
].forEach(el => {
  el.addEventListener('change', applySettings);
});

inputVolume.addEventListener('input', (e) => {
  volumeVal.textContent = `${e.target.value}%`;
  config.volume = parseInt(e.target.value, 10) / 100;
});

// 通常チャイム試聴
testSoundBtn.addEventListener('click', () => {
  playMelody([523.25, 659.25, 783.99], 0.22, 0.6);
});

// 達成メロディー試聴
testFanfareBtn.addEventListener('click', () => {
  playGoalFanfare();
});

// 描画ループ
function animLoop() {
  if (isRunning) tick();
  requestAnimationFrame(animLoop);
}

// 初期化実行
syncFormWithConfig();
renderDots();
updateStats();
tick();
requestAnimationFrame(animLoop);