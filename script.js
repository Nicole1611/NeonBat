const $ = (id) => document.getElementById(id);

let score = 0;
let shots = 0;
let hits = 0;
let health = 100;
let timeLeft = 60;
let level = 1;
let gameActive = false;
let soundEnabled = true;
let timerInterval = null;
let moveFrame = null;
let moveStart = 0;
let lastSoundTime = 0;
let audioContext = null;
let enemyX = 0;
let enemyY = 0;
let lastFrame = 0;

const maxHealth = 100;
const viewerBox = $('viewerBox');
const modelViewer = $('eyeModel');
const targetOverlay = $('targetOverlay');
const difficultyInputs = [...document.querySelectorAll('input[name="difficulty"]')];

const settings = {
  easy: { speed: 0.42, amplitudeX: 0.18, amplitudeY: 0.13 },
  medium: { speed: 0.72, amplitudeX: 0.26, amplitudeY: 0.20 },
  hard: { speed: 1.02, amplitudeX: 0.33, amplitudeY: 0.25 }
};

function difficulty() {
  return document.querySelector('input[name="difficulty"]:checked')?.value || 'medium';
}

function updateStats() {
  $('score').textContent = score;
  $('shots').textContent = shots;
  $('hits').textContent = hits;
  const accuracy = shots ? Math.round((hits / shots) * 100) : 0;
  $('precision').textContent = `${accuracy}%`;
  $('precisionBig').innerHTML = `${accuracy}<span>%</span>`;
  $('precisionBar').style.width = `${accuracy}%`;
}

function updateHealth() {
  $('healthText').textContent = `${health} / ${maxHealth}`;
  $('healthBar').style.width = `${health}%`;
}

function playTone(frequency = 650, duration = 0.09, type = 'sawtooth') {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.45), audioContext.currentTime + duration);
    gain.gain.setValueAtTime(0.12, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (_) {}
}

function updateTimer() {
  $('timer').innerHTML = `${timeLeft}<span>s</span>`;
  $('timerBar').style.width = `${(timeLeft / 60) * 100}%`;
  $('timerBar').style.background = timeLeft <= 10
    ? 'linear-gradient(90deg,#ff3f77,#ffb13b)'
    : 'linear-gradient(90deg,#21d9ff,#4269ff,#9b35ff)';
}

function showImpact(x, y, critical) {
  const spark = document.createElement('div');
  spark.className = 'impact-mark';
  spark.style.left = `${x}px`;
  spark.style.top = `${y}px`;
  viewerBox.appendChild(spark);
  setTimeout(() => spark.remove(), 500);

  const text = document.createElement('div');
  text.className = 'damage-text';
  text.textContent = critical ? '¡CRÍTICO! +200' : '+100';
  text.style.left = `${x}px`;
  text.style.top = `${y - 12}px`;
  viewerBox.appendChild(text);
  setTimeout(() => text.remove(), 700);
}

function endGame(message = 'Se acabó el tiempo.') {
  if (!gameActive) return;
  gameActive = false;
  clearInterval(timerInterval);
  timerInterval = null;
  $('arenaState').textContent = 'MISIÓN FINALIZADA';
  $('arenaHint').textContent = 'MISIÓN FINALIZADA';
  $('resultTitle').textContent = health <= 0 ? 'OBJETIVO NEUTRALIZADO' : 'TIEMPO AGOTADO';
  $('resultMessage').textContent = message;
  $('finalScore').textContent = score;
  $('finalHits').textContent = hits;
  $('finalPrecision').textContent = `${shots ? Math.round(hits / shots * 100) : 0}%`;
  $('resultsModal').classList.remove('hidden');
  playTone(health <= 0 ? 900 : 260, 0.25, 'triangle');
}

function startGame() {
  clearInterval(timerInterval);
  score = 0; shots = 0; hits = 0; health = maxHealth; timeLeft = 60; level = 1;
  gameActive = true;
  $('resultsModal').classList.add('hidden');
  $('arenaState').textContent = 'TRACKING ACTIVO';
  $('arenaHint').textContent = 'HAZ CLIC SOBRE EL OBJETIVO PARA DISPARAR';
  $('level').textContent = level;
  $('levelBar').style.width = '0%';
  $('levelText').textContent = 'Derrota al objetivo para avanzar.';
  updateStats(); updateHealth(); updateTimer();
  moveStart = performance.now();
  lastFrame = 0;
  cancelAnimationFrame(moveFrame);
  moveFrame = requestAnimationFrame(moveEnemy);
  timerInterval = setInterval(() => {
    if (!gameActive) return;
    timeLeft = Math.max(0, timeLeft - 1);
    updateTimer();
    if (timeLeft <= 0) endGame('¡Buen intento! Revisa tu puntuación y vuelve a jugar.');
  }, 1000);
}

function moveEnemy(timestamp) {
  if (!gameActive) return;
  if (!moveStart) moveStart = timestamp;
  const elapsed = (timestamp - moveStart) / 1000;
  const config = settings[difficulty()];
  // La velocidad sube gradualmente con cada nivel.
  const speed = config.speed * (1 + (level - 1) * 0.12);
  const x = Math.sin(elapsed * speed) * config.amplitudeX
    + Math.sin(elapsed * speed * 0.53) * config.amplitudeX * 0.28;
  const y = Math.sin(elapsed * speed * 0.77 + 1.2) * config.amplitudeY;
  enemyX = x; enemyY = y;
  modelViewer.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
  moveFrame = requestAnimationFrame(moveEnemy);
}

function shootAt(clientX, clientY) {
  if (!gameActive) return;
  shots++;
  playTone(700, 0.1);
  const boxRect = viewerBox.getBoundingClientRect();
  const modelRect = modelViewer.getBoundingClientRect();
  const x = clientX - boxRect.left;
  const y = clientY - boxRect.top;
  const cx = modelRect.left - boxRect.left + modelRect.width / 2;
  const cy = modelRect.top - boxRect.top + modelRect.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  // Radio aproximado de acierto; se puede ajustar según el tamaño del modelo.
  const radius = Math.min(modelRect.width, modelRect.height) * 0.29;
  if (Math.hypot(dx, dy) < radius) {
    hits++;
    const critical = Math.hypot(dx, dy) < radius * 0.25;
    score += critical ? 200 : 100;
    health = Math.max(0, health - (critical ? 25 : 10));
    showImpact(x, y, critical);
    viewerBox.classList.remove('shake');
    void viewerBox.offsetWidth;
    viewerBox.classList.add('shake');
    playTone(critical ? 1000 : 500, 0.12, 'triangle');
    updateHealth();
    $('levelBar').style.width = `${maxHealth - health}%`;
    if (health <= 0) {
      score += 500;
      level++;
      $('level').textContent = level;
      $('levelText').textContent = `¡Objetivo neutralizado! Nivel ${level} desbloqueado.`;
      // Nueva ronda: más vida y mayor velocidad por nivel.
      health = maxHealth;
      updateHealth();
      $('levelBar').style.width = '0%';
      playTone(1100, 0.3, 'triangle');
    }
  }
  updateStats();
}

targetOverlay.addEventListener('click', (event) => shootAt(event.clientX, event.clientY));
$('shootButton').addEventListener('click', () => {
  const rect = modelViewer.getBoundingClientRect();
  // El botón dispara hacia el centro visible del modelo.
  shootAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
});
$('resetButton').addEventListener('click', startGame);
$('playAgainButton').addEventListener('click', startGame);

$('soundButton').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  $('soundButton').setAttribute('aria-pressed', String(soundEnabled));
  $('soundLabel').textContent = soundEnabled ? 'SONIDO ON' : 'SONIDO OFF';
  $('soundButton').style.color = soundEnabled ? 'var(--cyan)' : 'var(--muted)';
  if (soundEnabled) playTone(600, 0.08, 'triangle');
});

difficultyInputs.forEach(input => {
  input.addEventListener('change', () => {
    document.querySelectorAll('.difficulty-option').forEach(option => option.classList.remove('selected'));
    input.closest('.difficulty-option').classList.add('selected');
    if (gameActive) {
      moveStart = performance.now();
    }
  });
});

targetOverlay.addEventListener('mousemove', (event) => {
  const rect = viewerBox.getBoundingClientRect();
  $('crosshair').style.display = 'block';
  $('crosshair').style.left = `${event.clientX - rect.left}px`;
  $('crosshair').style.top = `${event.clientY - rect.top}px`;
});
targetOverlay.addEventListener('mouseleave', () => $('crosshair').style.display = 'none');

modelViewer.addEventListener('error', () => {
  $('arenaHint').textContent = 'NO SE PUDO CARGAR EL MODELO: REVISA LA CARPETA OBJETO';
});

// Inicializar la interfaz y comenzar la primera partida.
updateStats();
updateHealth();
updateTimer();
startGame();
