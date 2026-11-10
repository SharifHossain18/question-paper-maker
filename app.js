/* ============================================================
   LUMEN Paper Maker
   Pulls MCQ + CQ data from the LUMEN question bank and builds a
   printable question paper.
   ============================================================ */

const DATA_BASE = 'https://sharifhossain18.github.io/science-mcq-app/data/';

const SUBJECT_BN = {
  'Physics 1st Paper': 'পদার্থবিজ্ঞান ১ম পত্র',
  'Physics 2nd Paper': 'পদার্থবিজ্ঞান ২য় পত্র',
  'Chemistry 1st Paper': 'রসায়ন ১ম পত্র',
  'Chemistry 2nd Paper': 'রসায়ন ২য় পত্র',
  'Math 1st Paper': 'উচ্চতর গণিত ১ম পত্র',
  'Math 2nd Paper': 'উচ্চতর গণিত ২য় পত্র',
  'Biology 1st Paper': 'জীববিজ্ঞান ১ম পত্র',
  'Biology 2nd Paper': 'জীববিজ্ঞান ২য় পত্র',
  'ICT': 'তথ্য ও যোগাযোগ প্রযুক্তি',
  'Bangla 1st Paper': 'বাংলা ১ম পত্র',
  'Bangla 2nd Paper': 'বাংলা ২য় পত্র'
};

const OPTION_LABELS = ['ক', 'খ', 'গ', 'ঘ'];
const CQ_LABELS = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };
// CQ marks per option label
// Default: 1,2,3,4 for 4-question CQs
// Math: 2,4,4 for 3-question CQ (first three options: a=2, b=4, c=4)
// Other subjects use default: a=1, b=2, c=3, d=4

const CQ_MARKS = { a: 1, b: 2, c: 3, d: 4 };

function getCQMarks(subject, key) {
  if (!key) return 0;
  const subjectStr = String(subject || '');
  // Check for Math subject various formats
  const isMathEnglish = subjectStr.includes('Math');
  const isMathBangla = subjectStr.includes('গণিত');
  const isMathShort = subjectStr.toLowerCase().includes('math');
  // Check against known subject keys from SUBJECT_BN
  const knownMathSubjects = ['Math 1st Paper', 'Math 2nd Paper', 'উচ্চতর গণিত ১ম পত্র', 'উচ্চতর গণিত ২য় পত্র'];
  const isKnownMathSubject = knownMathSubjects.includes(subjectStr);
  const isMath = isMathEnglish || isMathBangla || isMathShort || isKnownMathSubject;
  const marks = isMath ? { a: 2, b: 4, c: 4, d: 0 } : { a: 1, b: 2, c: 3, d: 4 };
  return (marks[key] || 0);
}
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const PICK_PAGE_SIZE = 20;
const MATH_DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '$', right: '$', display: false },
  { left: '\\(', right: '\\)', display: false },
  { left: '\\[', right: '\\]', display: true }
];

const state = {
  meta: null,
  cache: new Map(),
  abort: null,
  generating: false,
  lastMcqs: [],
  lastCqs: [],
  lastSubjects: [],
  lastTotalMarks: 0,
  lastSettings: null,
  lastMode: null,
  institutionLogo: localStorage.getItem('lumen_logo') || null,
  picked: new Map(),
  picker: {
    subject: null,
    chapterId: null,
    type: 'mcq',
    page: 1,
    search: '',
    showAnswer: false,
    selectedOnly: false,
    mcqs: [],
    cqs: [],
    loaded: { mcq: false, cq: false },
    loading: false,
    loadToken: 0,
    pageMap: new Map()
  }
};

const $ = (id) => document.getElementById(id);

/* ---------------- Utilities ---------------- */

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function toBn(value) {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

function stripTags(html) {
  const div = document.createElement('div');
  div.innerHTML = String(html == null ? '' : html);
  return div.textContent || '';
}

function cleanHtml(raw) {
  const holder = document.createElement('div');
  holder.innerHTML = String(raw == null ? '' : raw);

  holder.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((n) => n.remove());
  holder.querySelectorAll('img').forEach((img) => {
    let src = (img.getAttribute('src') || '').trim();
    if (!src || src === '//:0' || src === 'about:blank') {
      img.remove();
      return;
    }
    if (/<[^>]*>/.test(src) || /[\r\n\t]/.test(src)) {
      src = src.replace(/<[^>]*>/g, '').replace(/[\r\n\t]+/g, '').trim();
    }
    if (!src) {
      img.remove();
      return;
    }
    img.setAttribute('src', src);
  });
  holder.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    });
  });
  holder.querySelectorAll('span[style]').forEach((sp) => sp.removeAttribute('style'));

  holder.querySelectorAll('p').forEach((p) => {
    while (p.firstChild && p.firstChild.nodeType === 1 && p.firstChild.tagName === 'BR') {
      p.removeChild(p.firstChild);
    }
    if (!p.textContent.trim() && !p.querySelector('img')) p.remove();
  });

  if (!holder.children.length && holder.textContent.trim()) {
    const p = document.createElement('p');
    p.textContent = holder.textContent.trim();
    holder.textContent = '';
    holder.appendChild(p);
  }

  return holder.innerHTML;
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function uniqueById(arr) {
  const seen = new Set();
  return arr.filter((q, i) => {
    const key = q && q.id != null ? String(q.id) : `__${i}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampInt(value, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

function currentScope() {
  const checked = document.querySelector('input[name="scope"]:checked');
  return checked ? checked.value : 'random';
}

function chapterLabel(name) {
  const raw = String(name || '').trim();
  const match = raw.match(/^Chapter\s+(\d+)\s*:\s*(.*)$/i);
  if (match) return `অধ্যায় ${match[1]}: ${match[2]}`;
  return raw || 'অধ্যায়';
}

function toast(message, isError) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), 3200);
}

function renderMath(el) {
  if (!window.renderMathInElement) return;
  try {
    window.renderMathInElement(el, {
      delimiters: MATH_DELIMITERS,
      throwOnError: false
    });
  } catch (err) {
    console.warn('Math render failed:', err);
  }
}

/* ---------------- Manual pick helpers ---------------- */

function pickKey(type, q) {
  if (q && q.id != null && String(q.id).trim() !== '') {
    return `${type}:${q.id}`;
  }
  const raw = `${type}:${q?.subject || ''}:${q?.chapter || ''}:${stripTags(q?.question || q?.context || '')}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return `${type}:h${hash}`;
}

function pickedCounts() {
  let mcq = 0;
  let cq = 0;
  state.picked.forEach((entry) => {
    if (entry.type === 'mcq') mcq++;
    else cq++;
  });
  return { mcq, cq };
}

function updatePickSummary() {
  const { mcq, cq } = pickedCounts();
  const text = `নির্বাচিত: ${toBn(mcq)} MCQ · ${toBn(cq)} CQ`;

  const pickCount = $('pickCount');
  if (pickCount) pickCount.textContent = text;
  const info = $('pickInfoCount');
  if (info) info.textContent = text;

  const hasPicks = mcq + cq > 0;
  const generateBtn = $('pickGenerateBtn');
  if (generateBtn) generateBtn.disabled = !hasPicks;
  ['clearPicksBtn', 'pickClearBtn'].forEach((id) => {
    const btn = $(id);
    if (btn) btn.disabled = !hasPicks;
  });
}

function pickedSubjects() {
  const subjects = [];
  state.picked.forEach(({ q }) => {
    const subject = q.subject || 'সাধারণ';
    if (!subjects.includes(subject)) subjects.push(subject);
  });
  return subjects;
}

function questionChapterLabel(q) {
  const raw = q && q.chapter != null ? String(q.chapter) : '';
  if (!raw) return '';
  const chapters = state.meta?.[q.subject]?.chapters || [];
  const match = chapters.find((ch) => String(ch.id) === raw);
  if (match) return chapterLabel(match.name);
  if (/^[a-f0-9]{24}$/i.test(raw)) return '';
  return chapterLabel(raw);
}

function pickerChapterLabel() {
  const chapters = state.meta?.[state.picker.subject]?.chapters || [];
  const match = chapters.find((ch) => String(ch.id) === String(state.picker.chapterId));
  return match ? chapterLabel(match.name) : '';
}

function chapterHasType(ch, type) {
  if (type === 'cq') return (Number(ch.cq) || 0) > 0;
  if (type === 'mcq') return (Number(ch.mcq) || 0) > 0;
  return (Number(ch.mcq) || 0) > 0 || (Number(ch.cq) || 0) > 0;
}

function pickSearchText(type, q) {
  const parts = [q.subject, questionChapterLabel(q), q.year, q.board];
  if (type === 'mcq') {
    parts.push(q.question, ...(q.options || []));
  } else {
    parts.push(q.context, ...(q.questions || []).flatMap((sub) => [sub?.question, sub?.answer]));
  }
  return parts.map(stripTags).join(' ').replace(/\s+/g, ' ').toLowerCase();
}

/* ---------------- Data loading ---------------- */

const LOCAL_META = {
  'Physics 1st Paper': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: বদলে বদলে অChanged', mcq: 10, cq: 3 },
      { id: 'ch2', name: 'Chapter 2: গতivotরotion', mcq: 8, cq: 2 },
      { id: 'ch3', name: 'Chapter 3: Lists', mcq: 12, cq: 4 }
    ]
  },
  'Physics 2nd Paper': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: Optics', mcq: 10, cq: 3 },
      { id: 'ch2', name: 'Chapter 2: Modern Physics', mcq: 8, cq: 2 }
    ]
  },
  'Chemistry 1st Paper': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: Atoms', mcq: 10, cq: 3 },
      { id: 'ch2', name: 'Chapter 2: Molecules', mcq: 8, cq: 2 }
    ]
  },
  'Chemistry 2nd Paper': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: Chemical Bonding', mcq: 10, cq: 3 },
      { id: 'ch2', name: 'Chapter 2: Solutions', mcq: 8, cq: 2 }
    ]
  },
  'Math 1st Paper': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: Algebra', mcq: 15, cq: 5 },
      { id: 'ch2', name: 'Chapter 2: Geometry', mcq: 12, cq: 4 }
    ]
  },
  'Math 2nd Paper': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: Calculus', mcq: 15, cq: 5 },
      { id: 'ch2', name: 'Chapter 2: Vectors', mcq: 10, cq: 3 }
    ]
  },
  'Biology 1st Paper': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: Cell Biology', mcq: 10, cq: 3 },
      { id: 'ch2', name: 'Chapter 2: Genetics', mcq: 8, cq: 2 }
    ]
  },
  'Biology 2nd Paper': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: Evolution', mcq: 10, cq: 3 },
      { id: 'ch2', name: 'Chapter 2: Ecology', mcq: 8, cq: 2 }
    ]
  },
  'ICT': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: Hardware', mcq: 12, cq: 3 },
      { id: 'ch2', name: 'Chapter 2: Software', mcq: 10, cq: 2 }
    ]
  },
  'Bangla 1st Paper': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: Literature', mcq: 10, cq: 3 },
      { id: 'ch2', name: 'Chapter 2: Grammar', mcq: 8, cq: 2 }
    ]
  },
  'Bangla 2nd Paper': {
    chapters: [
      { id: 'ch1', name: 'Chapter 1: Creative Writing', mcq: 10, cq: 3 },
      { id: 'ch2', name: 'Chapter 2: Classical Literature', mcq: 8, cq: 2 }
    ]
  }
};

async function loadMeta() {
  const list = $('subjectList');
  list.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>';

  try {
    const res = await fetch(`${DATA_BASE}meta.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.meta = await res.json();
  } catch (err) {
    console.warn('Remote meta load failed, using local data:', err);
    state.meta = LOCAL_META;
  }

  renderSubjects();
  applyMode();
  updateSelectionSummary();
}

function renderSubjects() {
  const list = $('subjectList');
  const subjects = Object.keys(state.meta || {});

  if (!subjects.length) {
    list.innerHTML = '<p class="hint">কোনো বিষয় পাওয়া যায়নি।</p>';
    return;
  }

  list.innerHTML = subjects.map((subject) => {
    const meta = state.meta[subject] || {};
    const chapters = (meta.chapters || []).filter((ch) => ch && ch.name);

    let mcqTotal = 0;
    let cqTotal = 0;
    chapters.forEach((ch) => {
      mcqTotal += Number(ch.mcq) || 0;
      cqTotal += Number(ch.cq) || 0;
    });

    const chapterHtml = chapters.map((ch) => {
      const mcq = Number(ch.mcq) || 0;
      const cq = Number(ch.cq) || 0;
      const counts = [
        mcq ? `${mcq} MCQ` : '',
        cq ? `${cq} CQ` : ''
      ].filter(Boolean).join(' · ');

      return `
        <label class="chapter-item">
          <input type="checkbox" class="chapter-check"
                 data-subject="${esc(subject)}" data-chapter="${esc(ch.id)}" checked>
          <span class="ch-name">${esc(chapterLabel(ch.name))}</span>
          <span class="ch-count">${esc(counts)}</span>
        </label>`;
    }).join('');

    return `
      <div class="subject-block" data-subject="${esc(subject)}">
        <div class="subject-head">
          <label>
            <input type="checkbox" class="subj-check" data-subject="${esc(subject)}" checked>
            <span class="subject-name">
              <strong>${esc(subject)}</strong>
              <small>${esc(SUBJECT_BN[subject] || '')}</small>
            </span>
          </label>
          <span class="subject-count">${mcqTotal + cqTotal}</span>
          <button type="button" class="expand-btn" title="অধ্যায় দেখুন">▾</button>
        </div>
        <div class="chapter-panel">${chapterHtml || '<p class="hint">কোনো অধ্যায় নেই।</p>'}</div>
      </div>`;
  }).join('');
}

/* ---------------- UI state ---------------- */

function refreshChapterDisabled() {
  const random = currentScope() === 'random';
  document.querySelectorAll('.subject-block').forEach((block) => {
    const on = block.querySelector('.subj-check').checked;
    block.classList.toggle('is-off', !on);
    block.querySelectorAll('.chapter-check').forEach((cb) => {
      cb.disabled = random || !on;
    });
  });
}

function updateGenerateButtonLabel() {
  const btn = $('generateBtn');
  if (!btn || state.generating) return;
  const span = btn.querySelector('span');
  if (!span) return;
  span.textContent = currentScope() === 'pick' ? 'প্রশ্ন বাছাই করুন' : 'প্রশ্নপত্র তৈরি করুন';
}

function applyMode() {
  const scope = currentScope();
  const list = $('subjectList');
  list.classList.toggle('mode-random', scope === 'random');
  document.body.classList.toggle('pick-mode', scope === 'pick');

  if (scope === 'chapters') {
    document.querySelectorAll('.subject-block').forEach((block) => {
      const subjectOn = block.querySelector('.subj-check').checked;
      const chapters = [...block.querySelectorAll('.chapter-check')];
      if (subjectOn && chapters.length && !chapters.some((cb) => cb.checked)) {
        chapters.forEach((cb) => { cb.checked = true; });
      }
    });
  }

  refreshChapterDisabled();
  updateGenerateButtonLabel();
  updatePickSummary();
  updateSelectionSummary();
}

function updateSelectionSummary() {
  if (currentScope() === 'pick') {
    const { mcq, cq } = pickedCounts();
    $('previewStatus').textContent = mcq + cq
      ? `নির্বাচিত: ${toBn(mcq)} MCQ · ${toBn(cq)} CQ — প্রশ্নপত্র তৈরি করতে পারেন`
      : 'প্রশ্ন বাছাই করে প্রশ্নপত্র তৈরি করুন';
    return;
  }
  if (state.lastMcqs.length || state.lastCqs.length) return;
  const count = document.querySelectorAll('.subj-check:checked').length;
  $('previewStatus').textContent = count
    ? `${toBn(count)}টি বিষয় নির্বাচিত — “প্রশ্নপত্র তৈরি করুন” চাপুন`
    : 'অন্তত একটি বিষয় নির্বাচন করুন';
}

function setAllSubjects(checked) {
  document.querySelectorAll('.subj-check').forEach((cb) => { cb.checked = checked; });
  document.querySelectorAll('.chapter-check').forEach((cb) => { cb.checked = checked; });
  refreshChapterDisabled();
  updateSelectionSummary();
}

function setGeneratingUI(on) {
  $('generateBtn').disabled = on;
  if (on) {
    $('generateBtn').querySelector('span').textContent = 'তৈরি হচ্ছে...';
  } else {
    updateGenerateButtonLabel();
  }
}

function showOverlay() {
  $('loadingOverlay').classList.remove('hidden');
  setProgress(2, 'প্রশ্নব্যাংক লোড হচ্ছে...', 'একটু অপেক্ষা করুন');
}

function hideOverlay() {
  $('loadingOverlay').classList.add('hidden');
}

function setProgress(pct, title, sub) {
  $('progressFill').style.width = `${Math.max(2, Math.min(100, pct))}%`;
  if (title) $('loadingTitle').textContent = title;
  if (sub != null) $('loadingSub').textContent = sub;
}

/* ---------------- Question collection ---------------- */

function getSelectedSubjects() {
  return [...document.querySelectorAll('.subj-check:checked')].map((cb) => cb.dataset.subject);
}

function buildRefs(subjects, scope, type) {
  const checkedChapters = new Set();
  if (scope === 'chapters') {
    document.querySelectorAll('.chapter-check:checked').forEach((cb) => {
      checkedChapters.add(`${cb.dataset.subject}|${cb.dataset.chapter}`);
    });
  }

  const bySubject = new Map();

  subjects.forEach((subject) => {
    const chapters = state.meta[subject]?.chapters || [];
    chapters.forEach((ch) => {
      const count = type === 'mcq' ? (Number(ch.mcq) || 0) : (Number(ch.cq) || 0);
      if (!count) return;
      if (scope === 'chapters' && !checkedChapters.has(`${subject}|${ch.id}`)) return;
      if (!bySubject.has(subject)) bySubject.set(subject, []);
      bySubject.get(subject).push({ subject, chapter: ch });
    });
  });

  if (scope !== 'random') {
    return shuffle([...bySubject.values()].flat());
  }

  // Random mode: interleave subjects so every selected subject gets a chance.
  const groups = [...bySubject.values()].map((group) => shuffle(group));
  const result = [];
  const maxLen = groups.reduce((max, g) => Math.max(max, g.length), 0);

  for (let round = 0; round < maxLen; round++) {
    const order = shuffle(groups.map((g, i) => ({ g, i })).filter(({ g }) => g.length > round));
    order.forEach(({ g }) => result.push(g[round]));
  }

  return result;
}

async function loadChapter(subject, chapterId, type) {
  const clean = subject.replace(/\s+/g, '_');
  const folder = type === 'cq' ? 'cq/chapters' : 'chapters';
  const url = `${DATA_BASE}${folder}/${clean}_${chapterId}.json`;

  if (state.cache.has(url)) return state.cache.get(url);

  const res = await fetch(url, { signal: state.abort ? state.abort.signal : undefined });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  state.cache.set(url, data);
  return data;
}

function isValidMcq(q) {
  return q
    && typeof q.question === 'string'
    && q.question.trim()
    && Array.isArray(q.options)
    && q.options.length >= 2
    && q.answer != null
    && String(q.answer).trim();
}

function isValidCq(q) {
  return q
    && typeof q.context === 'string'
    && q.context.trim()
    && Array.isArray(q.questions)
    && q.questions.some((sub) => sub && String(sub.question || '').trim());
}

async function collect(refs, type, needed, label, minFiles) {
  const pool = [];
  const maxFiles = type === 'cq' ? 6 : 16;
  const target = Math.max(needed * 3, needed + 8);
  let files = 0;

  for (const ref of refs) {
    if (state.abort && state.abort.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (files >= maxFiles) break;
    if (files >= minFiles && pool.length >= target) break;

    const chName = chapterLabel(ref.chapter.name);
    const pct = Math.min(92, 8 + Math.round((pool.length / target) * 78));
    setProgress(pct, `${label} ডাটা লোড হচ্ছে...`, `${ref.subject} · ${chName}`);

    files++;
    try {
      const data = await loadChapter(ref.subject, ref.chapter.id, type);
      if (Array.isArray(data)) {
        data.forEach((q) => {
          if (type === 'mcq' ? isValidMcq(q) : isValidCq(q)) pool.push(q);
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.warn(`Failed to load ${ref.subject} ${ref.chapter.id} (${type}):`, err);
    }
  }

  setProgress(96, `${label} প্রস্তুত`, `${toBn(pool.length)}টি প্রশ্ন পাওয়া গেছে`);
  return pool;
}

/* ---------------- Manual question picker ---------------- */

function populatePickSubjects() {
  const select = $('pickSubject');
  if (!select) return;
  const subjects = Object.keys(state.meta || {});
  select.innerHTML = subjects.map((subject) => `
    <option value="${esc(subject)}">${esc(SUBJECT_BN[subject] || subject)} — ${esc(subject)}</option>
  `).join('');
}

function populatePickChapters(subject) {
  const select = $('pickChapter');
  if (!select) return;
  const chapters = (state.meta?.[subject]?.chapters || []).filter((ch) => ch && ch.name);

  if (!chapters.length) {
    select.innerHTML = '<option value="">কোনো অধ্যায় নেই</option>';
    state.picker.chapterId = null;
    return;
  }

  select.innerHTML = chapters.map((ch) => {
    const mcq = Number(ch.mcq) || 0;
    const cq = Number(ch.cq) || 0;
    const counts = [mcq ? `${mcq} MCQ` : '', cq ? `${cq} CQ` : ''].filter(Boolean).join(' · ') || 'প্রশ্ন নেই';
    return `<option value="${esc(ch.id)}">${esc(chapterLabel(ch.name))} — ${esc(counts)}</option>`;
  }).join('');

  let chapterId = state.picker.chapterId;
  const exists = chapters.some((ch) => String(ch.id) === String(chapterId));
  if (!exists) {
    const withData = chapters.find((ch) => chapterHasType(ch, state.picker.type));
    chapterId = (withData || chapters[0]).id;
  }
  state.picker.chapterId = chapterId != null ? String(chapterId) : null;
  if (state.picker.chapterId != null) select.value = state.picker.chapterId;
}

function resetPickerPool() {
  state.picker.mcqs = [];
  state.picker.cqs = [];
  state.picker.loaded = { mcq: false, cq: false };
  state.picker.page = 1;
  state.picker.pageMap = new Map();
  state.picker.loadToken++;
}

function setPickerLoading() {
  const list = $('pickList');
  if (list) list.innerHTML = '<div class="pick-loading"><div class="spinner"></div>প্রশ্ন লোড হচ্ছে...</div>';
}

async function loadPickerPool() {
  const subject = state.picker.subject;
  const chapterId = state.picker.chapterId;
  const type = state.picker.type;

  if (!subject || chapterId == null) {
    state.picker.mcqs = [];
    state.picker.cqs = [];
    state.picker.loading = false;
    renderPickerList();
    return;
  }

  const metaChapter = (state.meta?.[subject]?.chapters || [])
    .find((ch) => String(ch.id) === String(chapterId));
  const hasMcq = !metaChapter || (Number(metaChapter.mcq) || 0) > 0;
  const hasCq = !metaChapter || (Number(metaChapter.cq) || 0) > 0;

  const needMcq = (type === 'mcq' || type === 'all') && hasMcq;
  const needCq = (type === 'cq' || type === 'all') && hasCq;
  const needLoad = (needMcq && !state.picker.loaded.mcq) || (needCq && !state.picker.loaded.cq);

  if (!needLoad) {
    state.picker.loading = false;
    renderPickerList();
    return;
  }

  const token = ++state.picker.loadToken;
  state.picker.loading = true;
  setPickerLoading();

  const tasks = [];
  if (needMcq && !state.picker.loaded.mcq) {
    tasks.push(
      loadChapter(subject, chapterId, 'mcq')
        .then((data) => ({ type: 'mcq', data }))
        .catch((error) => ({ type: 'mcq', error }))
    );
  }
  if (needCq && !state.picker.loaded.cq) {
    tasks.push(
      loadChapter(subject, chapterId, 'cq')
        .then((data) => ({ type: 'cq', data }))
        .catch((error) => ({ type: 'cq', error }))
    );
  }

  const results = await Promise.all(tasks);
  if (token !== state.picker.loadToken) return;

  results.forEach((result) => {
    if (result.error) {
      console.warn(`Picker ${result.type} load failed:`, result.error);
      if (result.type === 'mcq') {
        state.picker.mcqs = [];
        state.picker.loaded.mcq = true;
      } else {
        state.picker.cqs = [];
        state.picker.loaded.cq = true;
      }
      toast(`${result.type === 'mcq' ? 'MCQ' : 'CQ'} লোড করা যায়নি`, true);
      return;
    }

    const data = Array.isArray(result.data) ? result.data : [];
    if (result.type === 'mcq') {
      state.picker.mcqs = data.filter(isValidMcq);
      state.picker.loaded.mcq = true;
    } else {
      state.picker.cqs = data.filter(isValidCq);
      state.picker.loaded.cq = true;
    }
  });

  state.picker.loading = false;
  state.picker.page = 1;
  renderPickerList();
}

function getPickerItems() {
  const type = state.picker.type;
  const search = state.picker.search.trim().toLowerCase();
  let items = [];

  if (type === 'mcq' || type === 'all') {
    items = items.concat(state.picker.mcqs.map((q) => ({ type: 'mcq', q })));
  }
  if (type === 'cq' || type === 'all') {
    items = items.concat(state.picker.cqs.map((q) => ({ type: 'cq', q })));
  }
  if (search) {
    items = items.filter(({ type: itemType, q }) => pickSearchText(itemType, q).includes(search));
  }
  if (state.picker.selectedOnly) {
    items = items.filter(({ type: itemType, q }) => state.picked.has(pickKey(itemType, q)));
  }
  return items;
}

function renderPickItem(type, q) {
  const key = pickKey(type, q);
  const selected = state.picked.has(key);
  const chapter = questionChapterLabel(q) || pickerChapterLabel();
  const source = sourceLabel(q);
  const metaParts = [
    chapter ? `<span>${esc(chapter)}</span>` : '',
    source ? `<span class="pick-source">${esc(source)}</span>` : ''
  ].filter(Boolean).join('');

  if (type === 'mcq') {
    const options = Array.isArray(q.options) ? q.options : [];
    const answerIdx = getAnswerIndex(q);
    const optionsHtml = options.map((opt, i) => {
      const label = OPTION_LABELS[i] || String.fromCharCode(65 + i);
      const correct = state.picker.showAnswer && i === answerIdx ? ' correct' : '';
      return `<span class="pick-opt${correct}">${label}. ${cleanHtml(opt)}</span>`;
    }).join('');

    return `
      <div class="pick-item${selected ? ' is-selected' : ''}">
        <input type="checkbox" class="pick-checkbox" data-key="${esc(key)}" aria-label="প্রশ্ন নির্বাচন" ${selected ? 'checked' : ''}>
        <div class="pick-content">
          <div class="pick-meta">
            <span class="pick-badge">MCQ</span>
            ${metaParts}
          </div>
          <div class="pick-question">${cleanHtml(q.question)}</div>
          <div class="pick-options">${optionsHtml}</div>
        </div>
      </div>`;
  }

  const subs = (q.questions || []).filter((sub) => sub && String(sub.question || '').trim());
  const subsHtml = subs.map((sub) => {
    const subKey = String(sub.type || '').toLowerCase();
    const label = CQ_LABELS[subKey] || subKey.toUpperCase() || '?';
    const marks = getCQMarks(q.subject, subKey) || '';
    const answer = state.picker.showAnswer && sub.answer && String(sub.answer).trim()
      ? `<details class="pick-sub-answer"><summary>উত্তর দেখাও</summary><div>${cleanHtml(sub.answer)}</div></details>`
      : '';
    return `<div class="pick-sub">
      <span class="pick-sub-label">${label}.</span>
      <div class="pick-sub-body">
        ${cleanHtml(sub.question)}
        ${marks ? `<span class="pick-answer-note">(${toBn(marks)} নম্বর)</span>` : ''}
        ${answer}
      </div>
    </div>`;
  }).join('');

  return `
    <div class="pick-item${selected ? ' is-selected' : ''}">
      <input type="checkbox" class="pick-checkbox" data-key="${esc(key)}" aria-label="প্রশ্ন নির্বাচন" ${selected ? 'checked' : ''}>
      <div class="pick-content">
        <div class="pick-meta">
          <span class="pick-badge cq">CQ</span>
          ${metaParts}
        </div>
        <div class="pick-question">${cleanHtml(q.context)}</div>
        <div class="pick-subs">${subsHtml}</div>
      </div>
    </div>`;
}

function renderPickerList() {
  const list = $('pickList');
  if (!list) return;
  if (state.picker.loading) {
    setPickerLoading();
    return;
  }

  const items = getPickerItems();
  const poolCount = state.picker.type === 'mcq'
    ? state.picker.mcqs.length
    : state.picker.type === 'cq'
      ? state.picker.cqs.length
      : state.picker.mcqs.length + state.picker.cqs.length;

  if (!items.length) {
    state.picker.pageMap = new Map();
    state.picker.page = 1;
    list.innerHTML = `<div class="pick-empty">${
      poolCount
        ? 'এই ফিল্টারে কোনো প্রশ্ন নেই।'
        : `এই অধ্যায়ে কোনো ${state.picker.type === 'cq' ? 'CQ' : state.picker.type === 'mcq' ? 'MCQ' : 'প্রশ্ন'} পাওয়া যায়নি।`
    }</div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PICK_PAGE_SIZE));
  if (state.picker.page > totalPages) state.picker.page = totalPages;
  const page = state.picker.page;
  const start = (page - 1) * PICK_PAGE_SIZE;
  const pageItems = items.slice(start, start + PICK_PAGE_SIZE);

  state.picker.pageMap = new Map(pageItems.map(({ type, q }) => [pickKey(type, q), { type, q }]));

  let html = pageItems.map(({ type, q }) => renderPickItem(type, q)).join('');

  if (totalPages > 1) {
    html += `<div class="pick-pagination">
      <button type="button" class="pick-page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← আগের</button>
      <span class="pick-page-info">পৃষ্ঠা ${toBn(page)} / ${toBn(totalPages)}</span>
      <button type="button" class="pick-page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>পরের →</button>
    </div>`;
  }

  list.innerHTML = html;
  renderMath(list);
}

function openPicker() {
  if (!state.meta) {
    toast('প্রশ্নব্যাংক এখনো লোড হয়নি', true);
    return;
  }

  const overlay = $('pickerOverlay');
  overlay.classList.remove('hidden');
  document.body.classList.add('picker-open');

  populatePickSubjects();

  let subject = state.picker.subject;
  if (!subject || !state.meta[subject]) {
    const selected = getSelectedSubjects();
    subject = selected.length === 1 && state.meta[selected[0]] ? selected[0] : Object.keys(state.meta)[0];
  }
  state.picker.subject = subject;
  $('pickSubject').value = subject;
  populatePickChapters(subject);

  document.querySelectorAll('#pickTypeTabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === state.picker.type);
  });
  $('pickSearch').value = state.picker.search;
  $('pickShowAnswer').checked = state.picker.showAnswer;
  $('pickSelectedOnly').checked = state.picker.selectedOnly;

  resetPickerPool();
  updatePickSummary();
  loadPickerPool();
}

function closePicker() {
  $('pickerOverlay').classList.add('hidden');
  document.body.classList.remove('picker-open');
}

function clearPicks() {
  if (!state.picked.size) return;
  state.picked.clear();
  updatePickSummary();
  if (!$('pickerOverlay').classList.contains('hidden')) {
    state.picker.page = 1;
    renderPickerList();
  }
  toast('নির্বাচন মুছে ফেলা হয়েছে');
}

function generateFromPicked() {
  const mcqs = [];
  const cqs = [];

  state.picked.forEach(({ type, q }) => {
    if (type === 'mcq') mcqs.push(q);
    else cqs.push(q);
  });

  if (!mcqs.length && !cqs.length) {
    toast('অন্তত একটি প্রশ্ন বাছাই করুন', true);
    return;
  }

  const settings = readSettings();
  const subjects = pickedSubjects();

  state.lastMcqs = mcqs;
  state.lastCqs = cqs;
  state.lastSubjects = subjects;
  state.lastSettings = settings;
  state.lastTotalMarks = mcqs.length + cqs.reduce((sum, q) => sum + cqMarks(q, state.lastSubjects?.[0] || ''), 0);
  state.lastMode = 'pick';

  renderPaper(mcqs, cqs, settings, subjects);

  $('previewStatus').textContent = `তৈরি হয়েছে: ${toBn(mcqs.length)} MCQ · ${toBn(cqs.length)} CQ`;
  $('printBtn').disabled = false;
  $('regenerateBtn').disabled = false;

  closePicker();
  updatePickSummary();
  toast('নির্বাচিত প্রশ্ন দিয়ে প্রশ্নপত্র তৈরি হয়েছে');

  if (window.innerWidth < 860) {
    switchMobileTab('preview');
    setTimeout(() => $('paper').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
}

/* ---------------- Generation ---------------- */

function readSettings() {
  return {
    title: $('paperTitle').value.trim() || 'HSC প্রশ্নপত্র',
    institution: $('institution').value.trim(),
    examTime: $('examTime').value.trim(),
    set: $('paperSet').value.trim(),
    instructions: $('instructions').value.trim(),
    mcqCount: clampInt($('mcqCount').value, 0, 200),
    cqCount: clampInt($('cqCount').value, 0, 30),
    showMcqKey: $('showMcqKey').checked,
    showMcqExplanation: $('showMcqExplanation').checked,
    showCqAnswers: $('showCqAnswers').checked,
    showSource: $('showSource').checked,
    compactMode: $('compactMode')?.checked || false,
    showOmrSheet: $('showOmrSheet')?.checked || false
  };
}

async function generate() {
  if (state.generating) return;
  if (currentScope() === 'pick') {
    openPicker();
    return;
  }

  const settings = readSettings();
  const subjects = getSelectedSubjects();
  const scope = currentScope();

  if (!subjects.length) {
    toast('অন্তত একটি বিষয় নির্বাচন করুন', true);
    return;
  }
  if (!settings.mcqCount && !settings.cqCount) {
    toast('MCQ অথবা CQ সংখ্যা দিন', true);
    return;
  }

  const mcqRefs = settings.mcqCount ? buildRefs(subjects, scope, 'mcq') : [];
  const cqRefs = settings.cqCount ? buildRefs(subjects, scope, 'cq') : [];

  if (settings.mcqCount && !mcqRefs.length) {
    toast('নির্বাচিত অংশে কোনো MCQ পাওয়া যায়নি', true);
    return;
  }
  if (settings.cqCount && !cqRefs.length) {
    toast('নির্বাচিত অংশে কোনো CQ পাওয়া যায়নি', true);
    return;
  }

  state.generating = true;
  state.abort = new AbortController();
  setGeneratingUI(true);
  showOverlay();

  try {
    let mcqPool = [];
    let cqPool = [];

    if (settings.mcqCount) {
      const minFiles = scope === 'random' ? Math.min(subjects.length, 8) : 0;
      mcqPool = await collect(mcqRefs, 'mcq', settings.mcqCount, 'MCQ', minFiles);
    }

    if (settings.cqCount) {
      const minFiles = scope === 'random' ? Math.min(subjects.length, 3) : 0;
      cqPool = await collect(cqRefs, 'cq', settings.cqCount, 'CQ', minFiles);
    }

    if (state.abort.signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const mcqs = shuffle(uniqueById(mcqPool)).slice(0, settings.mcqCount);
    const cqs = shuffle(uniqueById(cqPool)).slice(0, settings.cqCount);

    if (!mcqs.length && !cqs.length) throw new Error('কোনো প্রশ্ন পাওয়া যায়নি');

    state.lastMcqs = mcqs;
    state.lastCqs = cqs;
    state.lastSubjects = subjects;
    state.lastSettings = settings;
    state.lastTotalMarks = mcqs.length + cqs.reduce((sum, q) => sum + cqMarks(q, state.lastSubjects?.[0] || ''), 0);
    state.lastMode = 'auto';

    renderPaper(mcqs, cqs, settings, subjects);

    let msg = `তৈরি হয়েছে: ${toBn(mcqs.length)} MCQ · ${toBn(cqs.length)} CQ`;
    if (settings.mcqCount && mcqs.length < settings.mcqCount) {
      msg += ` (MCQ ${toBn(settings.mcqCount)}টি চাওয়া হয়েছিল)`;
    }
    if (settings.cqCount && cqs.length < settings.cqCount) {
      msg += ` (CQ ${toBn(settings.cqCount)}টি চাওয়া হয়েছিল)`;
    }
    $('previewStatus').textContent = msg;
    $('printBtn').disabled = false;
    $('regenerateBtn').disabled = false;
    toast('প্রশ্নপত্র তৈরি হয়েছে');

    if (window.innerWidth < 860) {
      switchMobileTab('preview');
      setTimeout(() => $('paper').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      toast('বাতিল করা হয়েছে');
      $('previewStatus').textContent = 'বাতিল করা হয়েছে';
    } else {
      console.error(err);
      toast(err.message || 'কিছু ভুল হয়েছে', true);
      $('previewStatus').textContent = 'তৈরি করা যায়নি';
    }
  } finally {
    state.generating = false;
    state.abort = null;
    setGeneratingUI(false);
    hideOverlay();
  }
}

function regenerate() {
  if (currentScope() !== 'pick') {
    generate();
    return;
  }

  if (state.lastMode === 'pick' && (state.lastMcqs.length || state.lastCqs.length)) {
    const settings = readSettings();
    state.lastSettings = settings;
    state.lastTotalMarks = state.lastMcqs.length + state.lastCqs.reduce((sum, q) => sum + cqMarks(q, state.lastSubjects?.[0] || ''), 0);
    renderPaper(state.lastMcqs, state.lastCqs, settings, state.lastSubjects);
    $('previewStatus').textContent = `তৈরি হয়েছে: ${toBn(state.lastMcqs.length)} MCQ · ${toBn(state.lastCqs.length)} CQ`;
    toast('আবার তৈরি হয়েছে');
    return;
  }

  openPicker();
}

/* ---------------- Rendering ---------------- */

function getAnswerIndex(q) {
  const options = Array.isArray(q.options) ? q.options : [];
  const answer = String(q.answer == null ? '' : q.answer).trim();
  if (!answer || !options.length) return -1;

  const norm = (s) => stripTags(s).replace(/\s+/g, ' ').trim().toLowerCase();
  const target = norm(answer);

  const direct = options.findIndex((opt) => norm(opt) === target);
  if (direct >= 0) return direct;

  const letterIndex = ['a', 'b', 'c', 'd'].indexOf(answer.toLowerCase());
  if (letterIndex >= 0 && letterIndex < options.length) return letterIndex;

  return -1;
}

function cqMarks(q, subject) {
  return (q.questions || []).reduce((sum, sub) => {
    const key = String(sub && sub.type ? sub.type : '').toLowerCase();
    return sum + getCQMarks(subject, key);
  }, 0);
}

function sourceLabel(q) {
  let board = q.board;
  const year = q.year;
  const boards = state.meta?.[q.subject]?.boards?.[year];

  if (boards && /^\d+$/.test(String(board))) {
    const idx = parseInt(board, 10) - 1;
    if (boards[idx]) board = boards[idx];
  }

  const parts = [board, year].filter((x) => x != null && String(x).trim() !== '');
  return parts.join(' ');
}

function renderMcqItem(q, index, settings) {
  const options = Array.isArray(q.options) ? q.options : [];
  const source = settings.showSource ? sourceLabel(q) : '';

  const optionsHtml = options.map((opt, i) => {
    const label = OPTION_LABELS[i] || String.fromCharCode(65 + i);
    return `<div class="option">
      <span class="option-label">${label}.</span>
      <span class="option-text">${cleanHtml(opt)}</span>
    </div>`;
  }).join('');

  return `
    <div class="mcq-item" data-subject="${esc(q.subject || '')}" data-chapter="${esc(q.chapter || '')}" data-id="${esc(q.id || '')}">
      <div class="q-actions no-print">
        <button type="button" class="q-act-btn swap" title="এই প্রশ্ন পরিবর্তন করুন" onclick="swapQuestion('mcq', ${index})">🔄 বদলান</button>
        <button type="button" class="q-act-btn delete" title="এই প্রশ্ন বাদ দিন" onclick="deleteQuestion('mcq', ${index})">✕ বাদ</button>
      </div>
      <div class="q-line">
        <span class="q-num">${toBn(index + 1)}.</span>
        <div class="q-body">
          ${cleanHtml(q.question)}
          ${source ? `<span class="source-tag">[${esc(source)}]</span>` : ''}
        </div>
      </div>
      <div class="options">${optionsHtml}</div>
    </div>`;
}

function renderCqItem(q, index, settings) {
  const source = settings.showSource ? sourceLabel(q) : '';
  const subs = (q.questions || []).filter((sub) => sub && String(sub.question || '').trim());

  const subsHtml = subs.map((sub) => {
    const key = String(sub.type || '').toLowerCase();
    const label = CQ_LABELS[key] || key.toUpperCase() || '?';
    const marks = getCQMarks(q.subject, key) || '';
    return `<div class="cq-sub">
      <span class="cq-sub-label">${label}.</span>
      <div class="cq-sub-body">${cleanHtml(sub.question)}</div>
      ${marks ? `<span class="cq-marks">${toBn(marks)}</span>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="cq-item" data-subject="${esc(q.subject || '')}" data-chapter="${esc(q.chapter || '')}" data-id="${esc(q.id || '')}">
      <div class="q-actions no-print">
        <button type="button" class="q-act-btn swap" title="এই সৃজনশীল প্রশ্ন পরিবর্তন করুন" onclick="swapQuestion('cq', ${index})">🔄 বদলান</button>
        <button type="button" class="q-act-btn delete" title="এই সৃজনশীল প্রশ্ন বাদ দিন" onclick="deleteQuestion('cq', ${index})">✕ বাদ</button>
      </div>
      <div class="cq-stem">
        <span class="q-num">${toBn(index + 1)}.</span>
        <div class="cq-stem-body">
          ${cleanHtml(q.context)}
          ${source ? `<span class="source-tag">[${esc(source)}]</span>` : ''}
        </div>
      </div>
      <div class="cq-subs">${subsHtml}</div>
    </div>`;
}

function renderMcqKey(mcqs) {
  return mcqs.map((q, i) => {
    const idx = getAnswerIndex(q);
    const answer = idx >= 0 ? OPTION_LABELS[idx] : (q.answer != null ? esc(String(q.answer)) : '—');
    return `<div class="key-item"><span class="key-num">${toBn(i + 1)}.</span><span class="key-ans">${answer}</span></div>`;
  }).join('');
}

function renderCqAnswers(cqs) {
  return cqs.map((q, i) => {
    const subs = (q.questions || []).filter((sub) => sub && String(sub.answer || '').trim());
    if (!subs.length) return '';

    const subsHtml = subs.map((sub) => {
      const key = String(sub.type || '').toLowerCase();
      const label = CQ_LABELS[key] || key.toUpperCase() || '?';
      return `<div class="cq-answer-sub">
        <span class="ans-label">${label}.</span>
        ${cleanHtml(sub.answer)}
      </div>`;
    }).join('');

    return `<div class="cq-answer-block">
      <h4>প্রশ্ন ${toBn(i + 1)}</h4>
      ${subsHtml}
    </div>`;
  }).join('');
}

function buildHeaderHtml(settings, subjects, totalMarks) {
  const subjectLine = subjects.map((s) => SUBJECT_BN[s] || s).join(', ');

  let html = '<div class="paper-header">';
  if (state.institutionLogo) {
    html += `<div class="paper-logo-wrap"><img src="${state.institutionLogo}" class="paper-logo" alt="Logo"></div>`;
  }
  if (settings.institution) {
    html += `<div class="paper-institution">${esc(settings.institution)}</div>`;
  }
  html += `<div class="paper-title">${esc(settings.title)}</div>`;
  html += `<div class="paper-subjects"><strong>বিষয়:</strong> ${esc(subjectLine)}</div>`;
  html += '<div class="paper-meta-row">';
  if (settings.examTime) html += `<span><strong>সময়:</strong> ${esc(settings.examTime)}</span>`;
  html += `<span><strong>পূর্ণমান:</strong> ${toBn(totalMarks)}</span>`;
  if (settings.set) html += `<span><strong>সেট:</strong> ${esc(settings.set)}</span>`;
  html += '</div>';
  if (settings.instructions) {
    html += `<div class="paper-instructions"><strong>নির্দেশনা:</strong> ${esc(settings.instructions)}</div>`;
  }
  html += '</div>';
  return html;
}

function renderOmrSheetHtml(count, settings) {
  const max = Math.min(count || 30, 100);
  let rowsHtml = '';
  for (let i = 0; i < max; i++) {
    rowsHtml += `
      <div class="omr-row">
        <span class="omr-row-num">${toBn(i + 1)}.</span>
        <div class="omr-bubbles">
          <span class="omr-bubble">ক</span>
          <span class="omr-bubble">খ</span>
          <span class="omr-bubble">গ</span>
          <span class="omr-bubble">ঘ</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="omr-sheet">
      <div class="omr-head">
        <div>
          <div class="omr-title">OMR উত্তরপত্র (বহুনির্বাচনি)</div>
          <small style="color:#64748b;">কালো বলপেন দিয়ে বৃত্ত সম্পূর্ণ ভরাট করো</small>
        </div>
        <div class="omr-boxes">
          <div class="omr-box">
            <span>রোল নম্বর</span>
            <div class="box-row">
              <span class="box-cell"></span><span class="box-cell"></span><span class="box-cell"></span>
              <span class="box-cell"></span><span class="box-cell"></span><span class="box-cell"></span>
            </div>
          </div>
          <div class="omr-box">
            <span>রেজিস্ট্রেশন নম্বর</span>
            <div class="box-row">
              <span class="box-cell"></span><span class="box-cell"></span><span class="box-cell"></span>
              <span class="box-cell"></span><span class="box-cell"></span><span class="box-cell"></span>
            </div>
          </div>
          <div class="omr-box">
            <span>সেট</span>
            <div class="box-row"><span class="box-cell" style="width:24px;text-align:center;font-size:8pt;line-height:18px;">${esc(settings.set || 'A')}</span></div>
          </div>
        </div>
      </div>
      <div class="omr-grid">
        ${rowsHtml}
      </div>
    </div>
  `;
}

function renderPaper(mcqs, cqs, settings, subjects) {
  const cqTotalMarks = cqs.reduce((sum, q) => sum + cqMarks(q, state.lastSubjects?.[0] || ''), 0);
  const totalMarks = mcqs.length + cqTotalMarks;

  let html = buildHeaderHtml(settings, subjects, totalMarks);

  if (mcqs.length) {
    html += `<div class="section-title">
      <span>ক-বিভাগ: বহুনির্বাচনি প্রশ্ন (MCQ)</span>
      <small>${toBn(mcqs.length)}টি প্রশ্ন · ${toBn(mcqs.length)} নম্বর</small>
    </div>`;
    html += '<div class="section-note">সঠিক উত্তরটি নির্বাচন করো।</div>';
    html += `<div class="mcq-two-col">${mcqs.map((q, i) => renderMcqItem(q, i, settings)).join('')}</div>`;
  }

  if (cqs.length) {
    html += `<div class="section-title">
      <span>খ-বিভাগ: সৃজনশীল প্রশ্ন (CQ)</span>
      <small>${toBn(cqs.length)}টি প্রশ্ন · ${toBn(cqTotalMarks)} নম্বর</small>
    </div>`;
    html += '<div class="section-note">প্রতিটি প্রশ্নের ক, খ, গ ও ঘ অংশের উত্তর দাও।</div>';
    html += cqs.map((q, i) => renderCqItem(q, i, settings)).join('');
  }

  if (settings.showOmrSheet && mcqs.length) {
    html += renderOmrSheetHtml(mcqs.length, settings);
  }

  if (settings.showMcqKey && mcqs.length) {
    html += '<div class="page-break"></div>';
    html += '<div class="key-section">';
    html += '<div class="key-title">বহুনির্বাচনি প্রশ্নের উত্তরপত্র (MCQ Answer Key)</div>';
    html += `<div class="key-grid">${renderMcqKey(mcqs)}</div>`;

    if (settings.showMcqExplanation) {
      const explained = mcqs
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => q.explanation && String(q.explanation).trim());

      if (explained.length) {
        html += '<div class="explanation-list">';
        html += '<div class="key-title" style="font-size:10.5pt;margin-top:14px;">ব্যাখ্যা</div>';
        html += explained.map(({ q, i }) => `
          <div class="explanation-item">
            <strong>প্রশ্ন ${toBn(i + 1)}:</strong>
            ${cleanHtml(q.explanation)}
          </div>`).join('');
        html += '</div>';
      }
    }
    html += '</div>';
  }

  if (settings.showCqAnswers && cqs.length) {
    html += '<div class="page-break"></div>';
    html += '<div class="key-section">';
    html += '<div class="key-title">সৃজনশীল প্রশ্নের উত্তর (CQ Answers)</div>';
    html += renderCqAnswers(cqs);
    html += '</div>';
  }

  const paper = $('paper');
  if (settings.compactMode) {
    paper.classList.add('compact-mode');
  } else {
    paper.classList.remove('compact-mode');
  }

  paper.innerHTML = html;

  renderMath(paper);

  paper.dataset.gen = String(Date.now());

  if ($('savePaperBtn')) $('savePaperBtn').disabled = false;
  if ($('makeSetsBtn')) $('makeSetsBtn').disabled = false;
}

function updatePaperHeader() {
  if (!state.lastSettings || !state.lastSubjects.length) return;

  const header = document.querySelector('#paper .paper-header');
  if (!header) return;

  const current = readSettings();
  state.lastSettings.institution = current.institution;
  state.lastSettings.title = current.title;
  state.lastSettings.examTime = current.examTime;
  state.lastSettings.set = current.set;
  state.lastSettings.instructions = current.instructions;

  header.outerHTML = buildHeaderHtml(state.lastSettings, state.lastSubjects, state.lastTotalMarks);
}

/* ---------------- Print ---------------- */

function waitForImages(root, timeout = 5000) {
  const imgs = [...root.querySelectorAll('img')];
  if (!imgs.length) return Promise.resolve();

  return Promise.all(imgs.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, timeout);
    });
  }));
}

async function printPaper() {
  if (!state.lastMcqs.length && !state.lastCqs.length) return;

  const previousTitle = document.title;
  if (state.lastSettings?.title) document.title = state.lastSettings.title;

  await waitForImages($('paper'));
  window.print();
  setTimeout(() => { document.title = previousTitle; }, 800);
}

/* ---------------- Wiring ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  $('generateBtn').addEventListener('click', generate);
  $('regenerateBtn').addEventListener('click', regenerate);
  $('printBtn').addEventListener('click', printPaper);
  $('cancelBtn').addEventListener('click', () => {
    if (state.abort) state.abort.abort();
  });

  $('pickerCloseBtn').addEventListener('click', closePicker);
  $('pickerOverlay').addEventListener('click', (event) => {
    if (event.target === $('pickerOverlay')) closePicker();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('pickerOverlay').classList.contains('hidden')) closePicker();
  });

  $('pickSubject').addEventListener('change', (event) => {
    state.picker.subject = event.target.value;
    state.picker.chapterId = null;
    populatePickChapters(state.picker.subject);
    resetPickerPool();
    loadPickerPool();
  });

  $('pickChapter').addEventListener('change', (event) => {
    state.picker.chapterId = event.target.value || null;
    resetPickerPool();
    loadPickerPool();
  });

  $('pickTypeTabs').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-type]');
    if (!btn) return;
    state.picker.type = btn.dataset.type;
    state.picker.page = 1;
    document.querySelectorAll('#pickTypeTabs button').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    loadPickerPool();
  });

  let pickSearchTimer = null;
  $('pickSearch').addEventListener('input', (event) => {
    clearTimeout(pickSearchTimer);
    const value = event.target.value;
    pickSearchTimer = setTimeout(() => {
      state.picker.search = value;
      state.picker.page = 1;
      renderPickerList();
    }, 140);
  });

  $('pickShowAnswer').addEventListener('change', (event) => {
    state.picker.showAnswer = event.target.checked;
    renderPickerList();
  });

  $('pickSelectedOnly').addEventListener('change', (event) => {
    state.picker.selectedOnly = event.target.checked;
    state.picker.page = 1;
    renderPickerList();
  });

  $('pickList').addEventListener('change', (event) => {
    const checkbox = event.target.closest('.pick-checkbox');
    if (!checkbox) return;
    const key = checkbox.dataset.key;
    const entry = state.picker.pageMap.get(key);
    if (!entry) return;

    if (checkbox.checked) state.picked.set(key, entry);
    else state.picked.delete(key);

    updatePickSummary();

    if (state.picker.selectedOnly) {
      state.picker.page = 1;
      renderPickerList();
    } else {
      const item = checkbox.closest('.pick-item');
      if (item) item.classList.toggle('is-selected', checkbox.checked);
    }
  });

  $('pickList').addEventListener('click', (event) => {
    const btn = event.target.closest('.pick-page-btn');
    if (!btn || btn.disabled) return;
    const page = parseInt(btn.dataset.page, 10);
    if (!Number.isFinite(page)) return;
    state.picker.page = page;
    renderPickerList();
    const body = document.querySelector('.picker-body');
    if (body) body.scrollTop = 0;
  });

  $('pickGenerateBtn').addEventListener('click', generateFromPicked);
  $('pickClearBtn').addEventListener('click', clearPicks);
  $('clearPicksBtn').addEventListener('click', clearPicks);

  $('selectAllBtn').addEventListener('click', () => setAllSubjects(true));
  $('clearAllBtn').addEventListener('click', () => setAllSubjects(false));

  document.querySelectorAll('input[name="scope"]').forEach((radio) => {
    radio.addEventListener('change', applyMode);
  });

  $('subjectList').addEventListener('change', (event) => {
    const subjectCheck = event.target.closest('.subj-check');
    if (subjectCheck) {
      const block = subjectCheck.closest('.subject-block');
      const chapters = [...block.querySelectorAll('.chapter-check')];

      if (subjectCheck.checked && !chapters.some((cb) => cb.checked)) {
        chapters.forEach((cb) => { cb.checked = true; });
      }

      refreshChapterDisabled();
      updateSelectionSummary();
    }
  });

  $('subjectList').addEventListener('click', (event) => {
    const expandBtn = event.target.closest('.expand-btn');
    if (!expandBtn) return;
    expandBtn.closest('.subject-block').classList.toggle('open');
  });

  ['mcqCount', 'cqCount'].forEach((id) => {
    $(id).addEventListener('blur', (event) => {
      const max = id === 'mcqCount' ? 200 : 30;
      event.target.value = clampInt(event.target.value, 0, max);
    });
  });

  ['paperTitle', 'institution', 'examTime', 'paperSet', 'instructions'].forEach((id) => {
    $(id).addEventListener('input', updatePaperHeader);
  });

  $('institutionLogo')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        state.institutionLogo = evt.target.result;
        try { localStorage.setItem('lumen_logo', state.institutionLogo); } catch(_) {}
        updatePaperHeader();
        toast('প্রতিষ্ঠানের লোগো যুক্ত করা হয়েছে');
      };
      reader.readAsDataURL(file);
    }
  });

  $('compactMode')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      $('paper').classList.add('compact-mode');
    } else {
      $('paper').classList.remove('compact-mode');
    }
  });

  $('showOmrSheet')?.addEventListener('change', () => {
    if (state.lastMcqs.length || state.lastCqs.length) {
      renderPaper(state.lastMcqs, state.lastCqs, readSettings(), state.lastSubjects);
    }
  });

  $('makeSetsBtn')?.addEventListener('click', generate4Sets);
  $('savePaperBtn')?.addEventListener('click', saveCurrentPaper);
  $('savedPapersBtn')?.addEventListener('click', openSavedModal);
  $('savedModalClose')?.addEventListener('click', closeSavedModal);
  $('savedModal')?.addEventListener('click', (e) => {
    if (e.target === $('savedModal')) closeSavedModal();
  });

  updatePickSummary();
  loadMeta();
  setupPwa();
});

/* ---------------- Swap & Delete Question ---------------- */

window.swapQuestion = async function(type, index) {
  if (type === 'mcq') {
    const currentQ = state.lastMcqs[index];
    if (!currentQ) return;
    const currentIds = new Set(state.lastMcqs.map((q) => String(q.id)));

    let candidate = null;
    for (const [key, val] of state.cache.entries()) {
      const pool = Array.isArray(val) ? val : (val.mcqs || []);
      const available = pool.filter((q) => q && !currentIds.has(String(q.id)));
      if (available.length) {
        candidate = available[Math.floor(Math.random() * available.length)];
        break;
      }
    }

    if (candidate) {
      state.lastMcqs[index] = candidate;
      renderPaper(state.lastMcqs, state.lastCqs, readSettings(), state.lastSubjects);
      toast(`প্রশ্ন #${toBn(index + 1)} নতুন প্রশ্ন দ্বারা পরিবর্তন করা হয়েছে`);
    } else {
      toast('অন্য কোনো প্রশ্ন পাওয়া যায়নি', true);
    }
  } else if (type === 'cq') {
    const currentQ = state.lastCqs[index];
    if (!currentQ) return;
    const currentIds = new Set(state.lastCqs.map((q) => String(q.id)));

    let candidate = null;
    for (const [key, val] of state.cache.entries()) {
      const pool = Array.isArray(val) ? val : (val.cqs || []);
      const available = pool.filter((q) => q && !currentIds.has(String(q.id)));
      if (available.length) {
        candidate = available[Math.floor(Math.random() * available.length)];
        break;
      }
    }

    if (candidate) {
      state.lastCqs[index] = candidate;
      renderPaper(state.lastMcqs, state.lastCqs, readSettings(), state.lastSubjects);
      toast(`সৃজনশীল #${toBn(index + 1)} পরিবর্তন করা হয়েছে`);
    } else {
      toast('অন্য কোনো সৃজনশীল প্রশ্ন পাওয়া যায়নি', true);
    }
  }
};

window.deleteQuestion = function(type, index) {
  if (type === 'mcq') {
    if (state.lastMcqs.length <= 1) {
      toast('অন্তত একটি প্রশ্ন থাকতে হবে', true);
      return;
    }
    state.lastMcqs.splice(index, 1);
    renderPaper(state.lastMcqs, state.lastCqs, readSettings(), state.lastSubjects);
    $('previewStatus').textContent = `তৈরি হয়েছে: ${toBn(state.lastMcqs.length)} MCQ · ${toBn(state.lastCqs.length)} CQ`;
    toast(`প্রশ্ন #${toBn(index + 1)} বাদ দেওয়া হয়েছে`);
  } else if (type === 'cq') {
    state.lastCqs.splice(index, 1);
    renderPaper(state.lastMcqs, state.lastCqs, readSettings(), state.lastSubjects);
    $('previewStatus').textContent = `তৈরি হয়েছে: ${toBn(state.lastMcqs.length)} MCQ · ${toBn(state.lastCqs.length)} CQ`;
    toast(`সৃজনশীল #${toBn(index + 1)} বাদ দেওয়া হয়েছে`);
  }
};

/* ---------------- 4 Sets Generator ---------------- */

function generate4Sets() {
  if (!state.lastMcqs.length && !state.lastCqs.length) {
    toast('আগে প্রশ্নপত্র তৈরি করুন', true);
    return;
  }

  const setNames = ['Set A (ক)', 'Set B (খ)', 'Set C (গ)', 'Set D (ঘ)'];
  const baseMcqs = [...state.lastMcqs];
  const baseCqs = [...state.lastCqs];
  const baseSettings = readSettings();
  const subjects = state.lastSubjects;

  let combinedHtml = '';

  setNames.forEach((setName, setIdx) => {
    const shuffledMcqs = setIdx === 0 ? baseMcqs : shuffle(baseMcqs).map((q) => {
      if (!Array.isArray(q.options) || q.options.length < 2) return q;
      const originalAns = q.options[getAnswerIndex(q)];
      const shuffledOpts = shuffle(q.options);
      const newAnsIndex = shuffledOpts.indexOf(originalAns);
      return {
        ...q,
        options: shuffledOpts,
        answer: newAnsIndex >= 0 ? newAnsIndex : q.answer
      };
    });

    const shuffledCqs = setIdx === 0 ? baseCqs : shuffle(baseCqs);
    const setSettings = { ...baseSettings, set: setName };
    const cqTotalMarks = shuffledCqs.reduce((sum, q) => sum + cqMarks(q, subjects[0] || ''), 0);
    const totalMarks = shuffledMcqs.length + cqTotalMarks;

    if (setIdx > 0) {
      combinedHtml += '<div class="page-break" style="margin: 36px 0; border-top: 3px dashed #94a3b8; padding-top: 24px;"></div>';
    }

    combinedHtml += `<div class="set-block" data-set="${setName}">`;
    combinedHtml += buildHeaderHtml(setSettings, subjects, totalMarks);

    if (shuffledMcqs.length) {
      combinedHtml += `<div class="section-title">
        <span>ক-বিভাগ: বহুনির্বাচনি প্রশ্ন (MCQ) — ${setName}</span>
        <small>${toBn(shuffledMcqs.length)}টি প্রশ্ন · ${toBn(shuffledMcqs.length)} নম্বর</small>
      </div>`;
      combinedHtml += `<div class="mcq-two-col">${shuffledMcqs.map((q, i) => renderMcqItem(q, i, setSettings)).join('')}</div>`;
    }

    if (shuffledCqs.length) {
      combinedHtml += `<div class="section-title">
        <span>খ-বিভাগ: সৃজনশীল প্রশ্ন (CQ) — ${setName}</span>
        <small>${toBn(shuffledCqs.length)}টি প্রশ্ন · ${toBn(cqTotalMarks)} নম্বর</small>
      </div>`;
      combinedHtml += shuffledCqs.map((q, i) => renderCqItem(q, i, setSettings)).join('');
    }

    if (baseSettings.showMcqKey && shuffledMcqs.length) {
      combinedHtml += '<div class="page-break"></div>';
      combinedHtml += '<div class="key-section">';
      combinedHtml += `<div class="key-title">উত্তরপত্র (${setName} Answer Key)</div>`;
      combinedHtml += `<div class="key-grid">${renderMcqKey(shuffledMcqs)}</div>`;
      combinedHtml += '</div>';
    }

    combinedHtml += '</div>';
  });

  const paper = $('paper');
  paper.innerHTML = combinedHtml;
  renderMath(paper);
  toast('Set A, B, C, D চারটি সেট সফলভাবে তৈরি হয়েছে!');
  $('previewStatus').textContent = '৪টি সেট (Set A, B, C, D) প্রস্তুত';
}

/* ---------------- Saved Papers Management ---------------- */

function saveCurrentPaper() {
  if (!state.lastMcqs.length && !state.lastCqs.length) {
    toast('আগে প্রশ্নপত্র তৈরি করুন', true);
    return;
  }

  const saved = JSON.parse(localStorage.getItem('lumen_saved_papers') || '[]');
  const newEntry = {
    id: 'paper_' + Date.now(),
    date: new Date().toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    title: $('paperTitle').value || 'প্রশ্নপত্র',
    institution: $('institution').value || '',
    subjects: state.lastSubjects,
    settings: readSettings(),
    mcqs: state.lastMcqs,
    cqs: state.lastCqs
  };

  saved.unshift(newEntry);
  if (saved.length > 25) saved.pop();
  try {
    localStorage.setItem('lumen_saved_papers', JSON.stringify(saved));
    toast('প্রশ্নপত্র সফলভাবে সেভ করা হয়েছে! 💾');
  } catch (err) {
    toast('মেমোরি পূর্ণ হতে পারে', true);
  }
}

function openSavedModal() {
  const modal = $('savedModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  renderSavedList();
}

function closeSavedModal() {
  const modal = $('savedModal');
  if (modal) modal.classList.add('hidden');
}

function renderSavedList() {
  const list = $('savedList');
  if (!list) return;
  const saved = JSON.parse(localStorage.getItem('lumen_saved_papers') || '[]');
  if (!saved.length) {
    list.innerHTML = '<p class="empty-text">কোনো সংরক্ষিত প্রশ্নপত্র নেই। প্রশ্নপত্র তৈরি করে "💾 সেভ" বাটনে চাপুন।</p>';
    return;
  }

  list.innerHTML = saved.map((item) => `
    <div class="saved-item">
      <div>
        <div class="saved-item-title">${esc(item.title)}</div>
        <div class="saved-item-meta">${esc(item.institution ? item.institution + ' · ' : '')}${toBn(item.mcqs?.length || 0)} MCQ, ${toBn(item.cqs?.length || 0)} CQ · ${esc(item.date)}</div>
      </div>
      <div class="saved-item-actions">
        <button type="button" class="tool-btn primary" onclick="loadSavedPaper('${item.id}')">লোড</button>
        <button type="button" class="tool-btn" onclick="deleteSavedPaper('${item.id}')" style="color:#dc2626;">মুছুন</button>
      </div>
    </div>
  `).join('');
}

window.loadSavedPaper = function(id) {
  const saved = JSON.parse(localStorage.getItem('lumen_saved_papers') || '[]');
  const item = saved.find((p) => p.id === id);
  if (!item) return;

  state.lastMcqs = item.mcqs || [];
  state.lastCqs = item.cqs || [];
  state.lastSubjects = item.subjects || [];
  state.lastSettings = item.settings || readSettings();

  if (item.settings) {
    if ($('paperTitle')) $('paperTitle').value = item.settings.title || '';
    if ($('institution')) $('institution').value = item.settings.institution || '';
    if ($('examTime')) $('examTime').value = item.settings.examTime || '';
    if ($('paperSet')) $('paperSet').value = item.settings.set || '';
    if ($('instructions')) $('instructions').value = item.settings.instructions || '';
  }

  renderPaper(state.lastMcqs, state.lastCqs, state.lastSettings, state.lastSubjects);
  closeSavedModal();
  $('previewStatus').textContent = `লোড হয়েছে: ${toBn(state.lastMcqs.length)} MCQ · ${toBn(state.lastCqs.length)} CQ`;
  $('printBtn').disabled = false;
  $('regenerateBtn').disabled = false;
  toast('সংরক্ষিত প্রশ্নপত্র সফলভাবে লোড হয়েছে');
};

window.deleteSavedPaper = function(id) {
  let saved = JSON.parse(localStorage.getItem('lumen_saved_papers') || '[]');
  saved = saved.filter((p) => p.id !== id);
  localStorage.setItem('lumen_saved_papers', JSON.stringify(saved));
  renderSavedList();
  toast('প্রশ্নপত্র মুছে ফেলা হয়েছে');
};

/* ---------------- Mobile Tabs & PWA ---------------- */

function switchMobileTab(tab) {
  const tabControlsBtn = $('tabControlsBtn');
  const tabPreviewBtn = $('tabPreviewBtn');
  if (!tabControlsBtn || !tabPreviewBtn) return;

  if (tab === 'preview') {
    document.body.classList.remove('mobile-tab-controls');
    document.body.classList.add('mobile-tab-preview');
    tabPreviewBtn.classList.add('active');
    tabControlsBtn.classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    document.body.classList.remove('mobile-tab-preview');
    document.body.classList.add('mobile-tab-controls');
    tabControlsBtn.classList.add('active');
    tabPreviewBtn.classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

let deferredPrompt = null;

function setupPwa() {
  const installBtn = $('installPwaBtn');
  const iosModal = $('iosModal');
  const iosModalClose = $('iosModalClose');
  const iosModalOk = $('iosModalOk');

  // Check if iOS
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  // If already installed in standalone mode, keep install button hidden
  if (isStandalone) {
    if (installBtn) installBtn.classList.add('hidden');
  } else if (isIos && installBtn) {
    // If iOS and not standalone, show install button so user gets iOS instructions
    installBtn.classList.remove('hidden');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
      installBtn.classList.remove('hidden');
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          toast('অ্যাপ সফলভাবে ইনস্টল হচ্ছে!');
          installBtn.classList.add('hidden');
        }
        deferredPrompt = null;
      } else if (isIos && iosModal) {
        iosModal.classList.remove('hidden');
      } else {
        toast('ব্রাউজারের মেনু থেকে "Install" বা "Add to Home Screen" বেছে নিন');
      }
    });
  }

  if (iosModalClose) {
    iosModalClose.addEventListener('click', () => iosModal.classList.add('hidden'));
  }
  if (iosModalOk) {
    iosModalOk.addEventListener('click', () => iosModal.classList.add('hidden'));
  }
  if (iosModal) {
    iosModal.addEventListener('click', (e) => {
      if (e.target === iosModal) iosModal.classList.add('hidden');
    });
  }

  // Mobile Tabs
  const tabControlsBtn = $('tabControlsBtn');
  const tabPreviewBtn = $('tabPreviewBtn');
  if (tabControlsBtn && tabPreviewBtn) {
    document.body.classList.add('mobile-tab-controls');
    tabControlsBtn.addEventListener('click', () => switchMobileTab('controls'));
    tabPreviewBtn.addEventListener('click', () => switchMobileTab('preview'));
  }
}
