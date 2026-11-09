// ── DATA (loaded from JSON files) ──
let DATA = [];
let currentLevel = 'N5';
const dataCache = {};

function loadLevelData(level) {
  if (dataCache[level]) return Promise.resolve(dataCache[level]);
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = `data/${level}.js`;
    el.onload = () => {
      const d = window.KANJI_DATA && window.KANJI_DATA[level];
      d ? resolve(dataCache[level] = d) : reject(new Error(`Data ${level} kosong`));
    };
    el.onerror = () => reject(new Error(`Gagal memuat data/${level}.js`));
    document.head.appendChild(el);
  });
}

// ── STATE ──
let mode = 'romaji'; // 'romaji' | 'arti'
let selected = {}; // key "g-c" -> true/false, default unchecked
let quizQueue = [];
let quizIndex = 0;
let correctCount = 0;
let wrongCount = 0;
let answered = false;
let missedChars = [];

// ── LEVEL SWITCH ──
const KANA = ['HIRAGANA', 'KATAKANA'];
function isKana() { return KANA.includes(currentLevel); }
document.querySelectorAll('.level-btn').forEach(b => b.addEventListener('click', () => setLevel(b.dataset.level)));

async function setLevel(level) {
  if (level === currentLevel && DATA.length) return;
  currentLevel = level;
  document.querySelectorAll('.level-btn').forEach(b => b.classList.toggle('active', b.dataset.level === level));
  if (isKana() && mode === 'arti') setMode('romaji');   // kana tidak punya "arti"
  document.getElementById('mode-arti').disabled = isKana();
  await initData();
}

// ── MODE SWITCH ──
document.getElementById('mode-romaji').addEventListener('click', () => setMode('romaji'));
document.getElementById('mode-arti').addEventListener('click', () => setMode('arti'));
function setMode(m) {
  if (isKana() && m === 'arti') return;
  mode = m;
  document.getElementById('mode-romaji').classList.toggle('active', m === 'romaji');
  document.getElementById('mode-arti').classList.toggle('active', m === 'arti');
}

// ── INIT / SELECTOR ──
async function initData() {
  const wrap = document.getElementById('groups-wrap');
  wrap.innerHTML = '<div class="loading-msg">Memuat data kanji...</div>';
  try {
    DATA = await loadLevelData(currentLevel);
  } catch (e) {
    wrap.innerHTML = `<div class="loading-msg">Gagal memuat data: ${e.message}</div>`;
    return;
  }
  selected = {};
  DATA.forEach((g, gi) => g.chars.forEach((_, ci) => { selected[`${gi}-${ci}`] = false; }));
  renderGroups();
  updateStartBtn();
}

function init() {
  initData();
}

function renderGroups() {
  const wrap = document.getElementById('groups-wrap');
  wrap.innerHTML = '';
  DATA.forEach((g, gi) => {
    const block = document.createElement('div');
    block.className = 'group-block';

    const head = document.createElement('div');
    head.className = 'group-head';
    head.innerHTML = `<span class="group-name">${g.group} <span style="color:var(--muted);font-weight:400;font-size:0.75rem">— ${g.label}</span></span>`;
    const gToggle = document.createElement('button');
    gToggle.className = 'group-toggle';
    gToggle.textContent = 'Pilih Semua';
    gToggle.addEventListener('click', () => {
      const allSel = g.chars.every((_, ci) => selected[`${gi}-${ci}`]);
      g.chars.forEach((_, ci) => { selected[`${gi}-${ci}`] = !allSel; });
      renderGroups();
      updateStartBtn();
    });
    head.appendChild(gToggle);
    block.appendChild(head);

    const scroll = document.createElement('div');
    scroll.className = 'char-scroll';
    g.chars.forEach((ch, ci) => {
      const key = `${gi}-${ci}`;
      const cell = document.createElement('div');
      cell.className = 'char-cell' + (selected[key] ? ' selected' : '');
      cell.innerHTML = `<span class="jp">${ch.jp}</span><span class="rom">${ch.rom.split('/')[0].trim()}</span><span class="check">✓</span>`;
      cell.addEventListener('click', () => {
        selected[key] = !selected[key];
        cell.classList.toggle('selected', selected[key]);
        updateStartBtn();
        updateGroupToggleLabel(gi);
      });
      scroll.appendChild(cell);
    });
    block.appendChild(scroll);
    wrap.appendChild(block);

    updateGroupToggleLabel(gi);
  });
  updateGlobalToggleLabel();
}

function updateGroupToggleLabel(gi) {
  const g = DATA[gi];
  const allSel = g.chars.every((_, ci) => selected[`${gi}-${ci}`]);
  const blocks = document.querySelectorAll('.group-block');
  if (blocks[gi]) {
    const btn = blocks[gi].querySelector('.group-toggle');
    if (btn) btn.textContent = allSel ? 'Hapus Semua' : 'Pilih Semua';
  }
}

function updateGlobalToggleLabel() {
  const allSel = Object.values(selected).length > 0 && Object.values(selected).every(Boolean);
  document.getElementById('global-toggle-btn').textContent = allSel ? 'Hapus Semua' : 'Pilih Semua';
}

document.getElementById('global-toggle-btn').addEventListener('click', () => {
  const allSel = Object.values(selected).length > 0 && Object.values(selected).every(Boolean);
  Object.keys(selected).forEach(k => { selected[k] = !allSel; });
  renderGroups();
  updateStartBtn();
});

function updateStartBtn() {
  const count = countSelected();
  document.getElementById('sel-count').textContent = count;
  document.getElementById('start-btn').disabled = count === 0;
  updateGlobalToggleLabel();
}

function countSelected() {
  return Object.values(selected).filter(Boolean).length;
}

document.getElementById('start-btn').addEventListener('click', startQuiz);

// ── QUIZ ──
function startQuiz() {
  const q = [];
  DATA.forEach((g, gi) => g.chars.forEach((ch, ci) => { if (selected[`${gi}-${ci}`]) q.push(ch); }));
  beginQuiz(q);
}

function beginQuiz(queue) {
  quizQueue = queue;
  shuffle(quizQueue);
  quizIndex = 0;
  correctCount = 0;
  wrongCount = 0;
  missedChars = [];
  answered = false;

  document.querySelector('.level-panel').style.display = 'none';
  document.querySelector('.mode-panel').style.display = 'none';
  document.getElementById('selector-panel').style.display = 'none';
  document.getElementById('results-area').style.display = 'none';
  document.getElementById('quiz-area').style.display = 'flex';

  showCard();
}

function showCard() {
  if (quizIndex >= quizQueue.length) { showResults(); return; }
  const ch = quizQueue[quizIndex];
  answered = false;

  document.getElementById('char-display').textContent = ch.jp;
  document.getElementById('char-hint').textContent = mode === 'romaji' ? 'Ketik romaji' : 'Ketik arti (Bahasa Indonesia)';
  const inp = document.getElementById('answer-input');
  inp.value = '';
  inp.className = '';
  inp.readOnly = false;
  inp.placeholder = mode === 'romaji' ? 'romaji' : 'arti';
  inp.focus();
  document.getElementById('feedback').textContent = '';
  document.getElementById('feedback').className = 'feedback';
  document.getElementById('feedback-extra').textContent = '';
  document.getElementById('next-btn').textContent = 'Cek';

  updateProgress();
}

function updateProgress() {
  const total = quizQueue.length;
  const done = quizIndex;
  const pct = total ? (done / total * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = `${done} / ${total}`;
  document.getElementById('sc-correct').textContent = correctCount;
  document.getElementById('sc-wrong').textContent = wrongCount;
  document.getElementById('sc-rem').textContent = total - done;
}

// Enter: cek / lanjut (global, karena input readOnly setelah dijawab)
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || document.getElementById('quiz-area').style.display !== 'flex') return;
  e.preventDefault();
  answered ? advance() : checkAnswer();
});
document.getElementById('quit-btn').addEventListener('click', () => {
  if (confirm('Keluar dari kuis? Progres sesi ini akan hilang.')) backToMenu();
});

// Normalisasi jawaban: huruf kecil, makron -> vokal ganda, buang tanda baca
function norm(s) {
  return s.toLowerCase().replace(/ā/g,'aa').replace(/ī/g,'ii').replace(/ū/g,'uu')
    .replace(/ē/g,'ei').replace(/ō/g,'ou').replace(/[.,!?'’]/g,'').replace(/\s+/g,' ').trim();
}
// Versi longgar: vokal panjang (ou/oo/uu) disamakan dengan vokal pendek
function loose(s) { return norm(s).replace(/ou|oo/g,'o').replace(/uu/g,'u'); }
function fieldVariants(str) { return str.split('/').map(norm).filter(Boolean); }

// ── RIWAYAT KESALAHAN (disimpan di browser) ──
const MISS_KEY = 'kanjiquiz.miss';
function loadMiss() { try { return JSON.parse(localStorage.getItem(MISS_KEY)) || {}; } catch (e) { return {}; } }
function recordResult(ch, ok) {
  const m = loadMiss();
  if (ok) { if (m[ch.jp] && --m[ch.jp] <= 0) delete m[ch.jp]; }
  else m[ch.jp] = (m[ch.jp] || 0) + 1;
  try { localStorage.setItem(MISS_KEY, JSON.stringify(m)); } catch (e) {}
}
document.getElementById('hard-btn').addEventListener('click', () => {
  const m = loadMiss();
  let n = 0;
  DATA.forEach((g, gi) => g.chars.forEach((c, ci) => { const on = !!m[c.jp]; selected[`${gi}-${ci}`] = on; if (on) n++; }));
  renderGroups(); updateStartBtn();
  if (!n) alert('Belum ada kanji yang sering salah. Selesaikan satu kuis dulu!');
});

function checkAnswer() {
  if (answered) return;
  const ch = quizQueue[quizIndex];
  const inp = document.getElementById('answer-input');
  const val = norm(inp.value);
  const fb = document.getElementById('feedback');
  const fbExtra = document.getElementById('feedback-extra');

  const targetField = mode === 'romaji' ? ch.rom : ch.arti;
  const accepted = fieldVariants(targetField);
  // jawaban 'arti' boleh tanpa keterangan dalam kurung
  if (mode === 'arti') accepted.push(...fieldVariants(targetField.replace(/\s*\([^)]*\)/g, '')));
  const ok = accepted.includes(val) || (mode === 'romaji' && accepted.some(a => loose(a) === loose(val)));
  recordResult(ch, ok);

  answered = true;
  inp.readOnly = true;
  inp.className = ok ? 'correct' : 'wrong';
  document.getElementById('next-btn').textContent = 'Berikutnya →';

  if (ok) {
    correctCount++;
    fb.textContent = '✓ Benar!';
    fb.className = 'feedback ok';
    fbExtra.textContent = extraText(ch);
  } else {
    wrongCount++;
    missedChars.push(ch);
    fb.textContent = mode === 'romaji' ? `✗ Jawaban: ${ch.rom}` : `✗ Jawaban: ${ch.arti}`;
    fb.className = 'feedback err';
    fbExtra.textContent = extraText(ch);
  }
  updateProgress();
}

function extraText(ch) {
  if (isKana()) return ch.alt ? `Padanan: ${ch.alt}` : '';
  return mode === 'romaji' ? `Arti: ${ch.arti}` : `Romaji: ${ch.rom}`;
}

function advance() {
  if (!answered) { checkAnswer(); return; }
  quizIndex++;
  showCard();
}

document.getElementById('next-btn').addEventListener('click', advance);

// ── RESULTS ──
function showResults() {
  document.getElementById('quiz-area').style.display = 'none';
  document.getElementById('results-area').style.display = 'block';
  const total = quizQueue.length;
  const pct = total ? Math.round(correctCount / total * 100) : 0;
  document.getElementById('final-score').textContent = pct + '%';
  document.getElementById('final-sub').textContent = `${correctCount} benar dari ${total}`;

  const mw = document.getElementById('missed-wrap');
  const mi = document.getElementById('missed-items');
  if (missedChars.length) {
    mw.style.display = 'block';
    document.getElementById('retry-missed-btn').style.display = 'inline-block';
    mi.innerHTML = missedChars.map(c =>
      `<div class="missed-item">${c.jp}<span>${c.rom}</span><span>${c.arti}</span></div>`
    ).join('');
  } else {
    mw.style.display = 'none';
    document.getElementById('retry-missed-btn').style.display = 'none';
  }
}

function backToMenu() {
  document.getElementById('results-area').style.display = 'none';
  document.getElementById('quiz-area').style.display = 'none';
  document.querySelector('.level-panel').style.display = 'block';
  document.querySelector('.mode-panel').style.display = 'block';
  document.getElementById('selector-panel').style.display = 'block';
}
document.getElementById('retry-btn').addEventListener('click', backToMenu);
document.getElementById('retry-missed-btn').addEventListener('click', () => beginQuiz(missedChars.slice()));

// ── UTILS ──
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

init();
