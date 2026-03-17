/* ========================
   LUMÈRA - APP.JS
======================== */

// ── STATE ─────────────────────────────────────────────────────────────────
let library = JSON.parse(localStorage.getItem('lumera_library') || '[]');
let currentType = 'movie';
let currentRating = 0;
let editingId = null;
let libFilter = { type: 'all', status: 'all', sort: 'dateDesc' };
let wlFilter = 'all';
let searchQuery = '';
let activeGenre = null;
let viewMode = 'grid'; // 'grid' | 'list' | 'poster'
let themeMode = localStorage.getItem('lumera_theme_mode') || (localStorage.getItem('lumera_theme') === 'dark' ? 'dark' : 'light');
let isDark = themeMode !== 'light';
let minRatingFilter = 0;
let showFavsOnly = false;
let watchlistOrder = JSON.parse(localStorage.getItem('lumera_wl_order') || '[]');
let dragSrcId = null;
let favRankOrder = JSON.parse(localStorage.getItem('lumera_rank_order') || '[]');
let dragRankSrcId = null;
let customLists = JSON.parse(localStorage.getItem('lumera_lists') || '[]');
let activeListId = null;
const CURRENT_YEAR = new Date().getFullYear();
let yearlyRanks = JSON.parse(localStorage.getItem('lumera_rank_yearly') || '{}');
let alltimeRanks = JSON.parse(localStorage.getItem('lumera_rank_alltime') || '{}');
let activeRankTab = 'yearly';
let rankPickerType = null;
let rankDragSrcId = null;
let rankDragCtx = null;

// ── UTILS ─────────────────────────────────────────────────────────────────
function save() { localStorage.setItem('lumera_library', JSON.stringify(library)); }
function saveWlOrder() { localStorage.setItem('lumera_wl_order', JSON.stringify(watchlistOrder)); }
function saveFavRankOrder() { localStorage.setItem('lumera_rank_order', JSON.stringify(favRankOrder)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function starsHtml(rating, size = '1rem') {
  if (!rating) return '<span style="color:var(--text-muted);font-size:0.8rem">Non noté</span>';
  const full = Math.round(rating / 2);
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span style="color:${i <= full ? 'var(--gold)' : 'var(--text-muted)'};font-size:${size}">★</span>`;
  }
  return html;
}

function typeBadge(type) {
  const map = { movie: ['badge-movie', '🎬 Film'], series: ['badge-series', '📺 Série'], anime: ['badge-anime', '✨ Animé'], game: ['badge-game', '🎮 Jeu vidéo'] };
  const [cls, label] = map[type] || ['badge-movie', type];
  return `<span class="card-type-badge ${cls}">${label}</span>`;
}

function statusBadge(status, type) {
  const isGame = type === 'game';
  const map = {
    watched: ['status-watched', isGame ? '✅ Terminé' : '✅ Vu'],
    watching: ['status-watching', isGame ? '🎮 En cours' : '▶️ En cours'],
    watchlist: ['status-watchlist', isGame ? '📋 À jouer' : '🔖 Watchlist'],
    dropped: ['status-dropped', '❌ Abandonné'],
  };
  const [cls, label] = map[status] || ['status-watched', status];
  return `<span class="card-status-badge ${cls}">${label}</span>`;
}

function typeEmoji(type) { return { movie: '🎬', series: '📺', anime: '✨', game: '🎮' }[type] || '🎬'; }

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type}`;
  t.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}


// ── ACCENT COLOR ───────────────────────────────────────────────────────────
function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}
function applyAccent(color) {
  const [r,g,b] = hexToRgb(color);
  const root = document.documentElement;
  root.style.setProperty('--accent', color);
  root.style.setProperty('--accent-light', `#${[r,g,b].map(c=>Math.min(255,Math.round(c+(255-c)*0.2)).toString(16).padStart(2,'0')).join('')}`);
  root.style.setProperty('--accent-soft', `rgba(${r},${g},${b},0.10)`);
  root.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.18)`);
  localStorage.setItem('lumera_accent', color);
  const picker = document.getElementById('accentPicker');
  if (picker) picker.value = color;
  // Mettre à jour le theme-color PWA
  const metaTheme = document.getElementById('themeColorMeta');
  if (metaTheme) metaTheme.content = color;
}

// ── API SEARCH (TMDB + RAWG) ────────────────────────────────────────────────
let searchCache = [];

function updateSearchBtnLabel() {
  const btn = document.getElementById('tmdbSearchBtn');
  if (btn) btn.textContent = currentType === 'game' ? '🔍 RAWG' : '🔍 TMDB';
}

function showApiKeyPrompt(api) {
  const row = document.getElementById('tmdbKeyRow');
  row.dataset.api = api;
  document.getElementById('tmdbKeyLabel').textContent = api === 'rawg' ? 'Clé API RAWG :' : 'Clé API TMDB :';
  document.getElementById('tmdbKeyInput').placeholder = api === 'rawg' ? 'Clé RAWG (rawg.io/apidocs)...' : 'Clé TMDB (v3 auth)...';
  document.getElementById('tmdbKeyLink').href = api === 'rawg' ? 'https://rawg.io/apidocs' : 'https://www.themoviedb.org/settings/api';
  document.getElementById('tmdbKeyLink').textContent = api === 'rawg' ? 'Obtenir sur rawg.io →' : 'Obtenir sur TMDB →';
  row.classList.remove('hidden');
  document.getElementById('tmdbKeyInput').focus();
}

async function tmdbSearch() {
  if (currentType === 'game') { rawgSearch(); return; }

  const query = document.getElementById('fTitle').value.trim();
  if (!query) { showToast('Saisis un titre d\'abord', 'error'); return; }

  const key = localStorage.getItem('lumera_tmdb_key');
  if (!key) { showApiKeyPrompt('tmdb'); return; }

  const btn = document.getElementById('tmdbSearchBtn');
  btn.textContent = '⏳'; btn.disabled = true;

  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${key}&query=${encodeURIComponent(query)}&language=fr-FR`);
    const data = await res.json();
    btn.textContent = '🔍 TMDB'; btn.disabled = false;

    if (!res.ok) { showToast('Clé TMDB invalide', 'error'); return; }

    searchCache = (data.results || []).filter(r => r.media_type !== 'person').slice(0, 6);
    const container = document.getElementById('tmdbResults');
    if (searchCache.length === 0) { showToast('Aucun résultat TMDB', 'error'); return; }

    container.innerHTML = searchCache.map((r, i) => {
      const title = r.title || r.name || '';
      const year = (r.release_date || r.first_air_date || '').slice(0, 4);
      const thumb = r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : '';
      const typeLabel = r.media_type === 'movie' ? '🎬' : '📺';
      return `<div class="tmdb-result-item" onclick="tmdbSelect(${i})">
        ${thumb ? `<img src="${thumb}" class="tmdb-thumb" />` : `<div class="tmdb-thumb-ph">${typeLabel}</div>`}
        <div class="tmdb-result-info">
          <div class="tmdb-result-title">${title}</div>
          <div class="tmdb-result-meta">${typeLabel} ${year || '?'}</div>
        </div>
      </div>`;
    }).join('');
    container.classList.remove('hidden');
  } catch {
    btn.textContent = '🔍 TMDB'; btn.disabled = false;
    showToast('Erreur réseau TMDB', 'error');
  }
}

window.tmdbSelect = async function(index) {
  const r = searchCache[index];
  if (!r) return;
  const title = r.title || r.name || '';
  const year = (r.release_date || r.first_air_date || '').slice(0, 4);
  const poster = r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '';

  document.getElementById('fTitle').value = title;
  document.getElementById('fYear').value = year;
  document.getElementById('fPoster').value = poster;
  document.getElementById('fSynopsis').value = r.overview || '';
  document.getElementById('fTrailer').value = '';
  document.getElementById('fTmdbRating').value = r.vote_average ? parseFloat(r.vote_average).toFixed(1) : '';

  if (r.media_type === 'movie') currentType = 'movie';
  else if (r.media_type === 'tv') currentType = 'series';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === currentType));
  updateEpisodeFieldsVisibility();
  updateSearchBtnLabel();

  // Fetch trailer depuis TMDB
  const key = localStorage.getItem('lumera_tmdb_key');
  if (key && r.id && (r.media_type === 'movie' || r.media_type === 'tv')) {
    try {
      const endpoint = r.media_type === 'movie' ? 'movie' : 'tv';
      const vRes = await fetch(`https://api.themoviedb.org/3/${endpoint}/${r.id}/videos?api_key=${key}&language=fr-FR`);
      const vData = await vRes.json();
      let trailer = (vData.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.iso_639_1 === 'fr');
      if (!trailer) trailer = (vData.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
      if (trailer) document.getElementById('fTrailer').value = `https://www.youtube.com/watch?v=${trailer.key}`;
    } catch {}
  }

  document.getElementById('tmdbResults').classList.add('hidden');
  showToast('✅ Infos importées depuis TMDB');
};

async function rawgSearch() {
  const query = document.getElementById('fTitle').value.trim();
  if (!query) { showToast('Saisis un titre d\'abord', 'error'); return; }

  const key = localStorage.getItem('lumera_rawg_key');
  if (!key) { showApiKeyPrompt('rawg'); return; }

  const btn = document.getElementById('tmdbSearchBtn');
  btn.textContent = '⏳'; btn.disabled = true;

  try {
    const res = await fetch(`https://api.rawg.io/api/games?key=${key}&search=${encodeURIComponent(query)}&page_size=6`);
    const data = await res.json();
    btn.textContent = '🔍 RAWG'; btn.disabled = false;

    if (!res.ok) { showToast('Clé RAWG invalide', 'error'); return; }

    searchCache = data.results || [];
    const container = document.getElementById('tmdbResults');
    if (searchCache.length === 0) { showToast('Aucun résultat RAWG', 'error'); return; }

    container.innerHTML = searchCache.map((r, i) => {
      const year = (r.released || '').slice(0, 4);
      return `<div class="tmdb-result-item" onclick="rawgSelect(${i})">
        ${r.background_image ? `<img src="${r.background_image}" class="tmdb-thumb" style="object-position:center top" />` : `<div class="tmdb-thumb-ph">🎮</div>`}
        <div class="tmdb-result-info">
          <div class="tmdb-result-title">${r.name}</div>
          <div class="tmdb-result-meta">🎮 ${year || '?'}${r.genres?.length ? ' · ' + r.genres.slice(0,2).map(g=>g.name).join(', ') : ''}</div>
        </div>
      </div>`;
    }).join('');
    container.classList.remove('hidden');
  } catch {
    btn.textContent = '🔍 RAWG'; btn.disabled = false;
    showToast('Erreur réseau RAWG', 'error');
  }
}

window.rawgSelect = async function(index) {
  const r = searchCache[index];
  if (!r) return;
  const key = localStorage.getItem('lumera_rawg_key');

  document.getElementById('fTitle').value = r.name;
  document.getElementById('fYear').value = (r.released || '').slice(0, 4);
  document.getElementById('fPoster').value = r.background_image || '';
  if (r.genres?.length) document.getElementById('fGenres').value = r.genres.map(g => g.name).join(', ');

  document.getElementById('tmdbResults').classList.add('hidden');

  // Fetch synopsis from detail endpoint
  if (key && r.id) {
    try {
      const det = await fetch(`https://api.rawg.io/api/games/${r.id}?key=${key}`);
      const detail = await det.json();
      if (detail.description_raw) {
        document.getElementById('fSynopsis').value = detail.description_raw.slice(0, 800);
      }
    } catch {}
  }
  showToast('✅ Infos importées depuis RAWG');
};

// ── GRADIENT POSTER AUTO ──────────────────────────────────────────────────
function titleGradient(title) {
  let h = 0;
  for (const c of title) h = Math.imul(31, h) + c.charCodeAt(0) | 0;
  const hue = Math.abs(h) % 360;
  return `linear-gradient(135deg,hsl(${hue},55%,20%) 0%,hsl(${(hue+55)%360},65%,33%) 100%)`;
}

// ── HISTORIQUE DES ACTIONS ────────────────────────────────────────────────
let actionHistory = JSON.parse(localStorage.getItem('lumera_history') || '[]');
function saveHistory() { localStorage.setItem('lumera_history', JSON.stringify(actionHistory)); }
function logAction(type, title) {
  const icons = { added:'➕', modified:'✏️', deleted:'🗑️', watched:'✅' };
  actionHistory.unshift({ type, title, icon: icons[type] || '•', date: Date.now() });
  actionHistory = actionHistory.slice(0, 40);
  saveHistory();
}
function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  if (actionHistory.length === 0) { list.innerHTML = '<p class="history-empty">Aucune action enregistrée</p>'; return; }
  list.innerHTML = actionHistory.map(a => {
    const d = new Date(a.date);
    const dateStr = d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    return `<div class="history-item"><span class="history-icon">${a.icon}</span><div class="history-info"><div class="history-title">${a.title}</div><div class="history-date">${dateStr}</div></div></div>`;
  }).join('');
}
function toggleHistoryPanel() {
  const panel = document.getElementById('historyPanel');
  const isOpen = !panel.classList.contains('hidden');
  if (isOpen) { panel.classList.add('hidden'); } else { renderHistory(); panel.classList.remove('hidden'); }
}

// ── JOURNAL DE VISIONNAGE ─────────────────────────────────────────────────
let journalEntries = JSON.parse(localStorage.getItem('lumera_journal') || '[]');
let journalMood = '🎬';
function saveJournal() { localStorage.setItem('lumera_journal', JSON.stringify(journalEntries)); }
function renderJournal() {
  const today = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const label = document.getElementById('journalDate');
  if (label) label.textContent = today.charAt(0).toUpperCase() + today.slice(1);
  const container = document.getElementById('journalEntries');
  if (!container) return;
  if (journalEntries.length === 0) { container.innerHTML = '<div class="journal-empty">Aucune entrée. Commence à écrire ! ✍️</div>'; return; }
  container.innerHTML = journalEntries.map((e, i) => {
    const d = new Date(e.date);
    const dateStr = d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    return `<div class="journal-entry">
      <div class="journal-entry-header">
        <span class="journal-entry-mood">${e.mood}</span>
        <span class="journal-entry-date">${dateStr}</span>
        <button class="journal-delete-btn" onclick="deleteJournalEntry(${i})">✕</button>
      </div>
      <div class="journal-entry-text">${e.text.replace(/\n/g, '<br>')}</div>
    </div>`;
  }).join('');
}
function saveJournalEntry() {
  const text = document.getElementById('journalText')?.value.trim();
  if (!text) { showToast('Écris quelque chose d\'abord 😊', 'error'); return; }
  journalEntries.unshift({ text, mood: journalMood, date: Date.now() });
  saveJournal();
  document.getElementById('journalText').value = '';
  renderJournal();
  showToast('✍️ Entrée ajoutée !');
}
window.deleteJournalEntry = function(index) {
  if (!confirm('Supprimer cette entrée ?')) return;
  journalEntries.splice(index, 1);
  saveJournal(); renderJournal();
};

// ── TENDANCES TMDB ────────────────────────────────────────────────────────
async function renderTrending() {
  const key = localStorage.getItem('lumera_tmdb_key');
  const section = document.getElementById('trendingSection');
  if (!key || !section) return;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${key}&language=fr-FR`);
    const data = await res.json();
    if (!res.ok) return;
    const items = (data.results || []).filter(r => r.media_type !== 'person').slice(0, 10);
    if (items.length === 0) return;
    section.classList.remove('hidden');
    section.innerHTML = `
      <div class="section-header"><h2>🔥 Tendances de la semaine</h2></div>
      <div class="cards-row trending-row">
        ${items.map(r => {
          const title = r.title || r.name || '';
          const year = (r.release_date || r.first_air_date || '').slice(0,4);
          const type = r.media_type === 'movie' ? 'movie' : 'series';
          const poster = r.poster_path ? `https://image.tmdb.org/t/p/w300${r.poster_path}` : '';
          const safeTitle = title.replace(/'/g,"\\'").replace(/"/g,'&quot;');
          return `<div class="trending-card" onclick="addTrendingToWatchlist('${safeTitle}','${type}','${year}','${poster}','${(r.overview||'').slice(0,300).replace(/'/g,"\\'").replace(/"/g,'&quot;')}')">
            ${poster ? `<img class="trending-poster" src="${poster}" />` : `<div class="trending-poster-ph" style="background:${titleGradient(title)}">${typeEmoji(type)}</div>`}
            <div class="trending-info">
              <div class="trending-title">${title}</div>
              <div class="trending-meta">${type === 'movie' ? '🎬' : '📺'} ${year}</div>
              <div class="trending-add">+ Watchlist</div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  } catch {}
}
window.addTrendingToWatchlist = function(title, type, year, poster, synopsis) {
  if (library.some(m => m.title.toLowerCase() === title.toLowerCase())) { showToast('Déjà dans ta bibliothèque', 'error'); return; }
  library.unshift({ id: uid(), title, type, status: 'watchlist', year: parseInt(year)||null, poster, synopsis, genres:'', rating:null, review:'', favorite:false, dateAdded: Date.now() });
  save(); logAction('added', title); updateMiniWidget();
  showToast(`📋 ${title} ajouté en watchlist !`);
};

// ── RÉSUMÉ IA (CLAUDE) ────────────────────────────────────────────────────
async function claudeSummarize() {
  const title = document.getElementById('fTitle')?.value.trim();
  const synopsis = document.getElementById('fSynopsis')?.value.trim();
  if (!title && !synopsis) { showToast('Remplis le titre ou le synopsis d\'abord', 'error'); return; }
  let key = localStorage.getItem('lumera_claude_key');
  if (!key) { document.getElementById('claudeKeyRow')?.classList.remove('hidden'); document.getElementById('claudeKeyInput')?.focus(); return; }
  const btn = document.getElementById('claudeSummarizeBtn');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    const prompt = synopsis ? `Voici le synopsis de "${title}" :\n\n${synopsis}\n\nRécris ce synopsis en 2-3 phrases percutantes et engageantes en français. Sois concis et cinématique.`
      : `Génère un synopsis court et percutant (2-3 phrases) pour l'œuvre intitulée "${title}" en français.`;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 200, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    if (btn) { btn.textContent = '🤖 IA'; btn.disabled = false; }
    if (!res.ok) { showToast('Erreur API Claude — vérifie ta clé', 'error'); return; }
    const text = data.content?.[0]?.text || '';
    if (text) { document.getElementById('fSynopsis').value = text; showToast('✨ Synopsis généré par IA !'); }
  } catch { if (btn) { btn.textContent = '🤖 IA'; btn.disabled = false; } showToast('Erreur réseau', 'error'); }
}

// ── MINI WIDGET ───────────────────────────────────────────────────────────
function updateMiniWidget() {
  const watching = library.filter(m => m.status === 'watching').length;
  const wl = library.filter(m => m.status === 'watchlist').length;
  const rated = library.filter(m => m.rating);
  const avg = rated.length ? (rated.reduce((s,m) => s+m.rating,0)/rated.length).toFixed(1) : '—';
  const w = document.getElementById('mw-watching'); if (w) w.textContent = watching ? `▶ ${watching} en cours` : '';
  const wlEl = document.getElementById('mw-watchlist'); if (wlEl) wlEl.textContent = `🔖 ${wl}`;
  const a = document.getElementById('mw-avg'); if (a) a.textContent = `★ ${avg}`;
  const mw = document.getElementById('miniWidget');
  if (mw) mw.classList.toggle('mw-hidden', library.length === 0);
}

// ── GENRE FILTER ───────────────────────────────────────────────────────────
window.filterByGenre = function(genre) {
  closeDetail();
  activeGenre = genre;
  applyGenreBg(genre);
  showPage('library');
};

// ── FOND DYNAMIQUE PAR GENRE ───────────────────────────────────────────────
const GENRE_THEMES = {
  'Horreur':          '#7f1d1d', 'Horror':           '#7f1d1d',
  'Science-fiction':  '#1e3a8a', 'Science-Fiction':  '#1e3a8a', 'Sci-fi': '#1e3a8a',
  'Thriller':         '#1c1917',
  'Romance':          '#881337',
  'Comédie':          '#14532d', 'Comedie':          '#14532d',
  'Action':           '#78350f',
  'Aventure':         '#164e63',
  'Fantasy':          '#4c1d95',
  'Drame':            '#1f2937',
  'Crime':            '#292524',
  'Mystère':          '#1e1b4b',
  'Animation':        '#065f46',
  'Anime':            '#5b21b6',
};
function applyGenreBg(genre) {
  const color = genre ? (GENRE_THEMES[genre] || null) : null;
  const root = document.documentElement;
  root.style.setProperty('--genre-bg', color ? color + '22' : 'transparent');
  root.style.setProperty('--genre-glow', color ? color + '55' : 'transparent');
  document.body.classList.toggle('genre-themed', !!color);
}

// ── MODE THÉÂTRE ──────────────────────────────────────────────────────────
let isTheatreMode = false;
function toggleTheatre() {
  isTheatreMode = !isTheatreMode;
  document.body.classList.toggle('theatre-mode', isTheatreMode);
  const btn = document.getElementById('theatreBtn');
  if (btn) { btn.textContent = isTheatreMode ? '🌟' : '🎭'; btn.title = isTheatreMode ? 'Quitter (ESC)' : 'Mode théâtre'; }
  if (isTheatreMode) showToast('🎭 Mode théâtre — ESC pour quitter');
}

// ── AMBIANCE SONORE ───────────────────────────────────────────────────────
let _ambiCtx = null, _ambiMaster = null, _ambiOscs = [], _ambiPlaying = false;
function toggleAmbiance() { _ambiPlaying ? stopAmbiance() : startAmbiance(); }
function startAmbiance() {
  _ambiCtx = _ambiCtx || new (window.AudioContext || window.webkitAudioContext)();
  _ambiMaster = _ambiCtx.createGain();
  _ambiMaster.gain.setValueAtTime(0, _ambiCtx.currentTime);
  _ambiMaster.gain.linearRampToValueAtTime(0.1, _ambiCtx.currentTime + 3);
  const filter = _ambiCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 700;
  const comp = _ambiCtx.createDynamicsCompressor();
  _ambiMaster.connect(filter); filter.connect(comp); comp.connect(_ambiCtx.destination);
  [55, 82.5, 110, 137.5, 165, 220].forEach((freq, i) => {
    const osc = _ambiCtx.createOscillator();
    const g = _ambiCtx.createGain();
    const lfo = _ambiCtx.createOscillator();
    const lg = _ambiCtx.createGain();
    osc.type = i % 3 === 0 ? 'sine' : i % 3 === 1 ? 'triangle' : 'sine';
    osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.008);
    g.gain.value = 0.22 / (i + 1);
    lfo.frequency.value = 0.08 + Math.random() * 0.12;
    lg.gain.value = g.gain.value * 0.25;
    lfo.connect(lg); lg.connect(g.gain);
    osc.connect(g); g.connect(_ambiMaster);
    lfo.start(); osc.start(); _ambiOscs.push(osc, lfo);
  });
  _ambiPlaying = true;
  const btn = document.getElementById('ambianceBtn');
  if (btn) { btn.classList.add('active'); btn.textContent = '🔊'; }
  showToast('🎵 Ambiance cinéma activée');
}
function stopAmbiance() {
  if (_ambiMaster) {
    _ambiMaster.gain.setTargetAtTime(0, _ambiCtx.currentTime, 0.6);
    setTimeout(() => { _ambiOscs.forEach(o => { try { o.stop(); } catch {} }); _ambiOscs = []; }, 1800);
  }
  _ambiPlaying = false;
  const btn = document.getElementById('ambianceBtn');
  if (btn) { btn.classList.remove('active'); btn.textContent = '🎵'; }
}

// ── RÉSUMÉ ANNÉE (WRAPPED) ────────────────────────────────────────────────
function openWrapped() {
  const year = new Date().getFullYear();
  const yi = library.filter(m => m.dateAdded && new Date(m.dateAdded).getFullYear() === year);
  const watched = yi.filter(m => m.status === 'watched').length;
  const favs = yi.filter(m => m.favorite).length;
  const rated = yi.filter(m => m.rating);
  const avg = rated.length ? (rated.reduce((s,m) => s + m.rating, 0) / rated.length).toFixed(1) : '-';
  const byGenre = {};
  yi.forEach(m => { if (m.genres) m.genres.split(',').forEach(g => { const t = g.trim(); byGenre[t] = (byGenre[t]||0)+1; }); });
  const topGenre = Object.entries(byGenre).sort((a,b) => b[1]-a[1])[0];
  const topRated = [...yi].filter(m => m.rating).sort((a,b) => b.rating-a.rating).slice(0,3);
  const hours = Math.round(yi.reduce((s,m) => s + (m.type==='movie'?2:m.type==='game'?30:((m.epTotal||12)*0.75)), 0));
  const byType = { movie: yi.filter(m=>m.type==='movie').length, series: yi.filter(m=>m.type==='series').length, anime: yi.filter(m=>m.type==='anime').length, game: yi.filter(m=>m.type==='game').length };

  const overlay = document.getElementById('wrappedOverlay');
  overlay.innerHTML = `
    <div class="wrapped-bg"></div>
    <button class="wrapped-close" onclick="document.getElementById('wrappedOverlay').classList.add('hidden')">✕</button>
    <button class="wrapped-dl" onclick="downloadWrapped()">⬇️ Sauvegarder</button>
    <div class="wrapped-scroll">
      <div class="wrapped-slide ws-0"><div class="wrapped-year-label">${year}</div><div class="wrapped-big-title">Ton année<br>en <em>chiffres</em></div><div class="wrapped-sub-label">par Lumèra</div></div>
      <div class="wrapped-slide ws-1"><div class="wrapped-stat-num">${yi.length}</div><div class="wrapped-stat-label">titres dans ta bibliothèque cette année</div></div>
      <div class="wrapped-slide ws-2"><div class="wrapped-stat-num">${hours}h</div><div class="wrapped-stat-label">passées devant des écrans (estimation)</div></div>
      ${topGenre ? `<div class="wrapped-slide ws-3"><div class="wrapped-genre-pre">Ton genre de l'année</div><div class="wrapped-genre-name">${topGenre[0]}</div><div class="wrapped-genre-count">${topGenre[1]} titre${topGenre[1]>1?'s':''}</div></div>` : ''}
      <div class="wrapped-slide ws-4">
        <div class="wrapped-type-grid">
          ${byType.movie ? `<div class="wrapped-type-item"><span>🎬</span><strong>${byType.movie}</strong><span>film${byType.movie>1?'s':''}</span></div>` : ''}
          ${byType.series ? `<div class="wrapped-type-item"><span>📺</span><strong>${byType.series}</strong><span>série${byType.series>1?'s':''}</span></div>` : ''}
          ${byType.anime ? `<div class="wrapped-type-item"><span>✨</span><strong>${byType.anime}</strong><span>animé${byType.anime>1?'s':''}</span></div>` : ''}
          ${byType.game ? `<div class="wrapped-type-item"><span>🎮</span><strong>${byType.game}</strong><span>jeu${byType.game>1?'x':''}</span></div>` : ''}
        </div>
      </div>
      ${topRated.length ? `<div class="wrapped-slide ws-5"><div class="wrapped-genre-pre">Tes meilleurs titres</div><div class="wrapped-top-list">${topRated.map((m,i)=>`<div class="wrapped-top-row">${m.poster?`<img src="${m.poster}" class="wrapped-top-img" />`:'<div class="wrapped-top-img-ph">'+typeEmoji(m.type)+'</div>'}<div><div class="wrapped-top-name">${['🥇','🥈','🥉'][i]} ${m.title}</div><div class="wrapped-top-note">★ ${m.rating}/10</div></div></div>`).join('')}</div></div>` : ''}
      <div class="wrapped-slide ws-6"><div class="wrapped-stat-num">★ ${avg}</div><div class="wrapped-stat-label">note moyenne cette année</div></div>
      <div class="wrapped-slide ws-7"><div class="wrapped-stat-num">${favs} ❤️</div><div class="wrapped-stat-label">coup${favs>1?'s':''} de cœur</div><div class="wrapped-final">À bientôt sur Lumèra ✨</div></div>
    </div>
  `;
  overlay.classList.remove('hidden');
}
window.openWrapped = openWrapped;

function downloadWrapped() {
  const year = new Date().getFullYear();
  const yi = library.filter(m => m.dateAdded && new Date(m.dateAdded).getFullYear() === year);
  const hours = Math.round(yi.reduce((s,m) => s+(m.type==='movie'?2:m.type==='game'?30:((m.epTotal||12)*0.75)),0));
  const rated = yi.filter(m=>m.rating); const avg = rated.length?(rated.reduce((s,m)=>s+m.rating,0)/rated.length).toFixed(1):'-';
  const favs = yi.filter(m=>m.favorite).length;
  const byGenre={}; yi.forEach(m=>{if(m.genres)m.genres.split(',').forEach(g=>{const t=g.trim();byGenre[t]=(byGenre[t]||0)+1;});});
  const topGenre = Object.entries(byGenre).sort((a,b)=>b[1]-a[1])[0];
  const topRated = [...yi].filter(m=>m.rating).sort((a,b)=>b.rating-a.rating).slice(0,3);

  const W=700, H=900, c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const grd=ctx.createLinearGradient(0,0,W,H); grd.addColorStop(0,'#0d0724'); grd.addColorStop(0.5,'#1a0a40'); grd.addColorStop(1,'#07143a');
  ctx.fillStyle=grd; ctx.fillRect(0,0,W,H);
  // Stars
  for(let i=0;i<60;i++){ctx.beginPath();ctx.arc(Math.random()*W,Math.random()*H,Math.random()*1.5+0.3,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${Math.random()*0.6+0.1})`;ctx.fill();}
  // Glow circle
  const g2=ctx.createRadialGradient(W/2,H*0.3,0,W/2,H*0.3,250);g2.addColorStop(0,'rgba(124,58,237,0.3)');g2.addColorStop(1,'transparent');ctx.fillStyle=g2;ctx.fillRect(0,0,W,H);
  // Content
  ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='600 13px Inter,sans-serif'; ctx.fillText(`LUMÈRA · ${year}`,W/2,55);
  ctx.fillStyle='white'; ctx.font=`bold 68px serif`; ctx.fillText(`${yi.length}`,W/2,150);
  ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.font='500 16px Inter,sans-serif'; ctx.fillText('titres cette année',W/2,182);
  ctx.fillStyle='white'; ctx.font='bold 52px serif'; ctx.fillText(`${hours}h`,W/2,255);
  ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.font='500 16px Inter,sans-serif'; ctx.fillText("d'écran",W/2,282);
  if(topGenre){ctx.fillStyle='rgba(167,139,250,0.8)';ctx.font='500 13px Inter';ctx.fillText('GENRE FAVORI',W/2,335);ctx.fillStyle='white';ctx.font='bold 38px serif';ctx.fillText(topGenre[0],W/2,378);}
  ctx.fillStyle='white'; ctx.font='bold 42px serif'; ctx.fillText(`★ ${avg}`,W/2,450); ctx.fillStyle='rgba(255,255,255,0.6)';ctx.font='500 14px Inter';ctx.fillText('note moyenne',W/2,475);
  ctx.fillStyle='rgba(251,191,36,1)'; ctx.font='bold 36px serif'; ctx.fillText(`${favs} ❤️`,W/2,530); ctx.fillStyle='rgba(255,255,255,0.6)';ctx.font='500 14px Inter';ctx.fillText('coups de cœur',W/2,556);
  if(topRated.length){ctx.fillStyle='rgba(167,139,250,0.8)';ctx.font='500 12px Inter';ctx.fillText('TOP TITRES',W/2,610);topRated.forEach((m,i)=>{ctx.fillStyle='white';ctx.font=`500 ${i===0?18:15}px Inter`;ctx.fillText(`${['🥇','🥈','🥉'][i]} ${m.title.length>28?m.title.slice(0,25)+'…':m.title} — ★${m.rating}`,W/2,640+i*28);});}
  ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font='500 12px Inter'; ctx.fillText('lumera.app · fait avec ❤️',W/2,H-25);

  c.toBlob(blob=>{const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`lumera-wrapped-${year}.png`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);});
  showToast('📸 Image sauvegardée !');
}

// ── OPEN EDIT ──────────────────────────────────────────────────────────────
window.openEdit = function(id) {
  const item = library.find(m => m.id === id);
  if (item) openAddModal(item);
};

// ── FORM DRAFT ─────────────────────────────────────────────────────────────
let draftSaveTimer = null;
function saveDraft() {
  if (editingId) return;
  sessionStorage.setItem('lumera_form_draft', JSON.stringify({
    title: document.getElementById('fTitle').value,
    type: currentType, rating: currentRating,
    status: document.getElementById('fStatus').value,
    year: document.getElementById('fYear').value,
    genres: document.getElementById('fGenres').value,
    poster: document.getElementById('fPoster').value,
    synopsis: document.getElementById('fSynopsis').value,
    review: document.getElementById('fReview').value,
    fav: document.getElementById('fFav').checked,
    watchDate: document.getElementById('fWatchDate').value,
    rewatchCount: document.getElementById('fRewatchCount').value,
    privateNote: document.getElementById('fPrivateNote').value,
    season: document.getElementById('fSeason').value,
    epCurrent: document.getElementById('fEpCurrent').value,
    epTotal: document.getElementById('fEpTotal').value,
  }));
}
function tryRestoreDraft() {
  const raw = sessionStorage.getItem('lumera_form_draft');
  if (!raw) return;
  let d; try { d = JSON.parse(raw); } catch { return; }
  if (!d.title) return;
  if (!confirm('📝 Brouillon trouvé. Le restaurer ?')) { sessionStorage.removeItem('lumera_form_draft'); return; }
  document.getElementById('fTitle').value = d.title || '';
  document.getElementById('fStatus').value = d.status || 'watched';
  document.getElementById('fYear').value = d.year || '';
  document.getElementById('fGenres').value = d.genres || '';
  document.getElementById('fPoster').value = d.poster || '';
  document.getElementById('fSynopsis').value = d.synopsis || '';
  document.getElementById('fReview').value = d.review || '';
  document.getElementById('fFav').checked = !!d.fav;
  document.getElementById('fWatchDate').value = d.watchDate || '';
  document.getElementById('fRewatchCount').value = d.rewatchCount || '';
  document.getElementById('fPrivateNote').value = d.privateNote || '';
  document.getElementById('fSeason').value = d.season || '';
  document.getElementById('fEpCurrent').value = d.epCurrent || '';
  document.getElementById('fEpTotal').value = d.epTotal || '';
  currentType = d.type || 'movie';
  currentRating = d.rating || 0;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === currentType));
  updateEpisodeFieldsVisibility();
  renderStarInput();
}

// ── CONFETTI ───────────────────────────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  canvas.classList.remove('hidden');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#7c3aed','#a78bfa','#fbbf24','#34d399','#60a5fa','#f472b6','#fb923c','#fff'];
  const shapes = ['rect', 'circle'];
  const particles = Array.from({ length: 180 }, () => ({
    x: Math.random() * canvas.width,
    y: -30 - Math.random() * 200,
    w: 8 + Math.random() * 9,
    h: 12 + Math.random() * 7,
    shape: shapes[Math.floor(Math.random() * shapes.length)],
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 3,
    vy: 1.2 + Math.random() * 2,
    rot: Math.random() * 360,
    rotS: (Math.random() - 0.5) * 5,
    op: 1,
    wobble: Math.random() * Math.PI * 2,
    wobbleS: 0.05 + Math.random() * 0.05
  }));
  const maxFrames = 320;
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.wobble += p.wobbleS;
      p.x += p.vx + Math.sin(p.wobble) * 0.8;
      p.y += p.vy;
      p.rot += p.rotS;
      if (p.y > canvas.height * 0.75) p.op -= 0.018;
      if (p.op <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.op);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    });
    if (++frame < maxFrames) requestAnimationFrame(draw);
    else canvas.classList.add('hidden');
  }
  draw();
}

// ── HERO BACKGROUND ────────────────────────────────────────────────────────
function applyHeroBg() {
  const bg = localStorage.getItem('lumera_hero_bg');
  const hero = document.querySelector('.hero');
  if (!hero) return;
  if (bg) hero.style.backgroundImage = `url('${bg}')`;
  else hero.style.backgroundImage = '';
}

function filterAndSort(items) {
  let res = [...items];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    res = res.filter(m => m.title.toLowerCase().includes(q) || (m.genres || '').toLowerCase().includes(q));
  }
  if (libFilter.type !== 'all') res = res.filter(m => m.type === libFilter.type);
  if (libFilter.status !== 'all') res = res.filter(m => m.status === libFilter.status);
  if (activeGenre) res = res.filter(m => m.genres && m.genres.split(',').map(g => g.trim()).includes(activeGenre));
  if (showFavsOnly) res = res.filter(m => m.favorite);
  if (window._activeTag) res = res.filter(m => m.tags && m.tags.includes(window._activeTag));
  if (window._activeMood && window._activeMood !== 'all') {
    const MOOD_GENRES = { action: ['Action','Aventure','Thriller'], chill: ['Animation','Comédie','Fantasy','Documentaire'], cry: ['Drame','Romance','Horreur'], laugh: ['Comédie','Animation'], mindblow: ['Science-fiction','Horreur','Thriller','Mystère'], romance: ['Romance','Comédie romantique'] };
    const mg = MOOD_GENRES[window._activeMood] || [];
    res = res.filter(m => m.genres && mg.some(g => m.genres.toLowerCase().includes(g.toLowerCase())));
  }
  if (minRatingFilter > 0) res = res.filter(m => m.rating && m.rating >= minRatingFilter);
  switch (libFilter.sort) {
    case 'dateAsc': res.sort((a, b) => a.dateAdded - b.dateAdded); break;
    case 'ratingDesc': res.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
    case 'titleAsc': res.sort((a, b) => a.title.localeCompare(b.title)); break;
    case 'yearDesc': res.sort((a, b) => (b.year || 0) - (a.year || 0)); break;
    default: res.sort((a, b) => b.dateAdded - a.dateAdded);
  }
  return res;
}

// ── GENRE UTILS ───────────────────────────────────────────────────────────
function getAllGenres() {
  const genres = new Set();
  library.forEach(m => {
    if (m.genres) m.genres.split(',').forEach(g => { const t = g.trim(); if (t) genres.add(t); });
  });
  return [...genres].sort();
}

function renderGenreFilters() {
  const container = document.getElementById('genreFilters');
  const genres = getAllGenres();
  if (genres.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = `<div class="genre-chips">
    <button class="genre-chip ${!activeGenre ? 'active' : ''}" data-genre="">Tous les genres</button>
    ${genres.map(g => `<button class="genre-chip ${activeGenre === g ? 'active' : ''}" data-genre="${g}">${g}</button>`).join('')}
  </div>`;
  container.querySelectorAll('.genre-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeGenre = btn.dataset.genre || null;
      applyGenreBg(activeGenre);
      renderGenreFilters();
      renderLibrary();
    });
  });
}

// ── TAG UTILS ─────────────────────────────────────────────────────────────
function getAllTags() {
  const tags = new Set();
  library.forEach(m => { if (m.tags) m.tags.forEach(t => { if (t) tags.add(t); }); });
  return [...tags].sort();
}

function renderTagFilter() {
  const row = document.getElementById('tagFilterRow');
  if (!row) return;
  const tags = getAllTags();
  if (tags.length === 0) { row.innerHTML = ''; return; }
  row.innerHTML = `
    <button class="tag-filter-chip ${!window._activeTag ? 'active' : ''}" data-tag="">🏷️ Tous les tags</button>
    ${tags.map(t => `<button class="tag-filter-chip ${window._activeTag === t ? 'active' : ''}" data-tag="${t}">${t}</button>`).join('')}
  `;
  row.querySelectorAll('.tag-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      window._activeTag = btn.dataset.tag || null;
      renderTagFilter();
      renderLibrary();
    });
  });
}

function renderTagsPreview() {
  const input = document.getElementById('fTags');
  const preview = document.getElementById('tagsPreview');
  if (!input || !preview) return;
  const tags = input.value.split(',').map(t => t.trim()).filter(Boolean);
  preview.innerHTML = tags.map(t => `<span class="tag-pill">${t}</span>`).join('');
}

// ── THEME ─────────────────────────────────────────────────────────────────
function applyTheme() {
  document.body.classList.toggle('dark', themeMode !== 'light');
  document.body.classList.toggle('neon', themeMode === 'neon');
  isDark = themeMode !== 'light';
  const icons = { light: '🌙', dark: '☀️', neon: '⚡' };
  const btn = document.getElementById('themeToggle');
  if (btn) { btn.textContent = icons[themeMode] || '🌙'; btn.title = themeMode === 'neon' ? 'Mode neon' : themeMode === 'dark' ? 'Mode clair' : 'Mode sombre'; }
  renderStars();
}

// ── ÉTOILES FOND DARK ──────────────────────────────────────────────────────
function renderStars() {
  let bg = document.getElementById('starsBg');
  if (!bg) {
    bg = document.createElement('div'); bg.id = 'starsBg';
    document.body.insertBefore(bg, document.body.firstChild);
  }
  if (!isDark) { bg.innerHTML = ''; return; }
  bg.innerHTML = Array.from({ length: 90 }, () => {
    const s = Math.random() * 2.2 + 0.4;
    return `<div class="star" style="left:${Math.random()*100}%;top:${Math.random()*100}%;width:${s}px;height:${s}px;animation-delay:${(Math.random()*5).toFixed(2)}s;animation-duration:${(2+Math.random()*3).toFixed(2)}s"></div>`;
  }).join('');
}

// ── IMPORT / EXPORT ───────────────────────────────────────────────────────
function exportLibrary() {
  const data = JSON.stringify(library, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lumera_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✅ Export réussi !');
}

function importLibrary(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Format invalide');
      if (confirm(`Importer ${data.length} titre(s) ? Cela remplacera ta bibliothèque actuelle.`)) {
        library = data;
        save();
        refreshCurrentPage();
        showToast(`✅ ${data.length} titres importés !`);
      }
    } catch {
      showToast('❌ Fichier invalide', 'error');
    }
  };
  reader.readAsText(file);
}

// ── RENDER CARD ───────────────────────────────────────────────────────────
function renderCard(item, index = 0) {
  const div = document.createElement('div');
  div.className = 'media-card' + (item.favorite ? ' fav-card' : '');
  div.dataset.id = item.id;
  div.style.animationDelay = `${Math.min(index * 45, 350)}ms`;

  const safeTitle = item.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const grad = titleGradient(item.title);
  const posterHtml = item.poster
    ? `<img class="card-poster" src="${item.poster}" alt="${item.title}" loading="lazy" onload="extractCardColor(this)" onerror="this.closest('.card-front')?.querySelector('.card-skeleton')?.remove();this.parentNode.innerHTML=getPlaceholderHtml('${typeEmoji(item.type)}','${safeTitle}','${grad}')"/>`
    : `<div class="card-poster-placeholder" style="background:${grad}">${typeEmoji(item.type)}</div>`;
  const skeletonHtml = item.poster ? '<div class="card-skeleton"></div>' : '';

  const ratingHtml = item.rating ? `<div class="card-rating">★ ${item.rating}/10</div>` : '';

  let episodeHtml = '';
  if ((item.type === 'series' || item.type === 'anime') && item.epTotal) {
    episodeHtml = `<div class="card-episode-progress">
      ${window.makeProgressRing ? window.makeProgressRing(item.epCurrent||0, item.epTotal, 32, 3) : ''}
      <span style="font-size:0.7rem;color:rgba(255,255,255,0.75)">${item.epCurrent || 0}/${item.epTotal}${item.season ? ` S${item.season}` : ''}</span>
    </div>`;
  }

  const backContent = item.synopsis ? item.synopsis.slice(0,160)+(item.synopsis.length>160?'…':'')
    : item.review ? '"'+item.review.slice(0,160)+(item.review.length>160?'…':'')+'"'
    : 'Aucune description.';
  const backBg = item.poster ? `url('${item.poster}') center/cover` : grad;

  div.innerHTML = `
    <div class="card-inner">
      <div class="card-front">
        ${skeletonHtml}
        ${posterHtml}
        ${statusBadge(item.status, item.type)}
        ${item.favorite ? '<div class="card-fav">⭐</div>' : ''}
        <button class="card-flip-btn" title="Synopsis">↩</button>
        <div class="card-overlay">
          <div class="card-title">${item.title}</div>
          <div class="card-meta">${typeBadge(item.type)}${ratingHtml}</div>
          ${episodeHtml}
        </div>
      </div>
      <div class="card-back" style="background:${backBg}">
        <div class="card-back-blur"></div>
        <div class="card-back-content">
          <div class="card-back-title">${item.title}</div>
          ${item.rating ? `<div class="card-back-rating">★ ${item.rating}/10</div>` : ''}
          <div class="card-back-synopsis">${backContent}</div>
          ${item.tags && item.tags.length ? `<div class="tags-container">${item.tags.map(t=>`<span class="tag-pill" onclick="event.stopPropagation();window._activeTag='${t}';showPage('library')">${t}</span>`).join('')}</div>` : ''}
          <div class="card-back-actions">
            <button class="card-flip-back">↩ Retour</button>
            <button class="card-back-open">Fiche →</button>
          </div>
        </div>
      </div>
    </div>
  `;

  div.querySelector('.card-flip-btn')?.addEventListener('click', e => { e.stopPropagation(); div.querySelector('.card-inner').classList.add('flipped'); });
  div.querySelector('.card-flip-back')?.addEventListener('click', e => { e.stopPropagation(); div.querySelector('.card-inner').classList.remove('flipped'); });
  div.querySelector('.card-back-open')?.addEventListener('click', e => { e.stopPropagation(); openDetail(item.id); });
  div.querySelector('.card-front')?.addEventListener('click', () => openDetail(item.id));
  return div;
}

window.getPlaceholderHtml = function(emoji, title, grad) {
  return `<div class="card-poster-placeholder" style="background:${grad||titleGradient(title||'')}">${emoji}</div>`;
};

// ── C. EXTRACTION COULEUR DOMINANTE DU POSTER ─────────────────────────────
window.extractCardColor = function(img) {
  img.closest('.card-front')?.querySelector('.card-skeleton')?.remove();
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 12;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 8, 12);
    const data = ctx.getImageData(0, 0, 8, 12).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const br = (data[i] + data[i+1] + data[i+2]) / 3;
      if (br > 28 && br < 228) { r += data[i]; g += data[i+1]; b += data[i+2]; count++; }
    }
    if (count > 0) {
      const card = img.closest('.media-card');
      if (card) {
        const rc = Math.round(r/count), gc = Math.round(g/count), bc = Math.round(b/count);
        card.style.setProperty('--card-accent', `rgb(${rc},${gc},${bc})`);
        card.style.setProperty('--card-accent-glow', `rgba(${rc},${gc},${bc},0.35)`);
      }
    }
  } catch(e) {} // SecurityError si CORS bloqué — ignoré silencieusement
};

// ── B. COMPTEURS ANIMÉS ───────────────────────────────────────────────────
function animateStatValues() {
  document.querySelectorAll('.stat-value[data-counter]').forEach(el => {
    const raw = el.dataset.counter;
    const target = parseFloat(raw);
    if (isNaN(target)) return;
    const isFloat = raw.includes('.');
    const suffix = el.textContent.replace(raw, '').replace(String(Math.round(target)), '');
    const duration = 750;
    const start = performance.now();
    el.classList.add('counting');
    function step(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = isFloat ? (eased * target).toFixed(1) : Math.round(eased * target);
      el.textContent = val + (isFloat ? '' : suffix);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = raw + suffix;
    }
    requestAnimationFrame(step);
  });
}

// ── E. TRAILER FULLSCREEN ─────────────────────────────────────────────────
let _trailerUrl = '';

function openTrailer(url) {
  if (!url) return;
  _trailerUrl = url;

  const m1 = url.match(/[?&]v=([^&\s#]+)/);
  const m2 = url.match(/youtu\.be\/([^?&\s#]+)/);
  const m3 = url.match(/embed\/([^?&\s#]+)/);
  const videoId = (m1 || m2 || m3)?.[1] || null;

  const overlay  = document.getElementById('trailerOverlay');
  const frame    = document.getElementById('trailerFrame');
  const blocked  = document.getElementById('trailerBlocked');
  const blockedLink = document.getElementById('trailerBlockedLink');

  if (!overlay || !frame || !videoId) { window.open(url, '_blank'); return; }

  // Reset état
  if (blocked) blocked.classList.add('hidden');
  frame.style.opacity = '1';

  // enablejsapi=1 permet de recevoir les erreurs via postMessage
  frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  if (blockedLink) blockedLink.href = url;
  overlay.classList.remove('hidden');
}
window.openTrailer = openTrailer;

function closeTrailer() {
  const frame = document.getElementById('trailerFrame');
  if (frame) frame.src = '';
  document.getElementById('trailerOverlay')?.classList.add('hidden');
  document.getElementById('trailerBlocked')?.classList.add('hidden');
  _trailerUrl = '';
}

// Écoute les erreurs YouTube (100/101/150/151/153 = embed désactivé par l'uploader)
window.addEventListener('message', e => {
  if (!e.origin.includes('youtube')) return;
  try {
    const data = JSON.parse(e.data);
    if (data.event === 'onError' && [100, 101, 150, 151, 153].includes(data.info)) {
      const frame = document.getElementById('trailerFrame');
      const blocked = document.getElementById('trailerBlocked');
      if (frame) frame.style.opacity = '0';
      if (blocked) blocked.classList.remove('hidden');
    }
  } catch(err) {}
});

// Délégation de clic pour les boutons trailer (data-trailer attribute)
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-trailer]');
  if (btn) { e.preventDefault(); e.stopPropagation(); openTrailer(btn.dataset.trailer); }
});

// ── F. HEATMAP CALENDRIER ─────────────────────────────────────────────────
function buildHeatmap() {
  const today = new Date();
  const dayMap = {};
  library.filter(m => m.dateAdded).forEach(m => {
    const d = new Date(m.dateAdded);
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = (dayMap[key] || 0) + 1;
  });

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 363);
  startDate.setDate(startDate.getDate() - startDate.getDay()); // Dimanche précédent

  const weeks = [];
  const monthLabels = [];
  let lastMonth = -1;

  for (let w = 0; w < 53; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + w * 7 + d);
      if (date > today) { days.push(null); continue; }
      const key = date.toISOString().slice(0, 10);
      const count = dayMap[key] || 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
      const month = date.getMonth();
      if (d === 0 && month !== lastMonth) {
        monthLabels.push({ week: w, label: date.toLocaleString('fr-FR', { month: 'short' }) });
        lastMonth = month;
      }
      days.push({ key, count, level, label: date.toLocaleDateString('fr-FR') });
    }
    weeks.push(days);
  }

  const gridHtml = weeks.map(days => `
    <div class="heatmap-week">
      ${days.map(day => day === null ? '<div class="heatmap-cell heatmap-empty"></div>'
        : `<div class="heatmap-cell heatmap-l${day.level}" title="${day.label}${day.count ? ': ' + day.count + ' ajout(s)' : ''}"></div>`
      ).join('')}
    </div>`).join('');

  const monthsHtml = monthLabels.map(m =>
    `<span class="heatmap-month-label" style="left:${m.week * 14}px">${m.label}</span>`
  ).join('');

  const totalDays = Object.values(dayMap).filter(Boolean).length;
  const maxStreak = (() => {
    const keys = Object.keys(dayMap).filter(k => dayMap[k]).sort();
    let best = 0, cur = 0, prev = null;
    keys.forEach(k => {
      const d = new Date(k), p = prev ? new Date(prev) : null;
      if (p && (d - p) === 86400000) { cur++; } else { cur = 1; }
      if (cur > best) best = cur;
      prev = k;
    });
    return best;
  })();

  return `
    <div class="chart-card chart-card-full">
      <h3>📅 Calendrier d'activité <span style="font-size:0.78rem;font-weight:400;color:var(--text-muted);margin-left:0.5rem">${totalDays} jours actifs · 🔥 Meilleure série : ${maxStreak} jour${maxStreak > 1 ? 's' : ''}</span></h3>
      <div class="heatmap-container">
        <div class="heatmap-months" style="position:relative;height:18px;min-width:700px;">${monthsHtml}</div>
        <div class="heatmap-grid">${gridHtml}</div>
        <div class="heatmap-legend">
          <span>Moins</span>
          <div class="heatmap-cell heatmap-l0"></div>
          <div class="heatmap-cell heatmap-l1"></div>
          <div class="heatmap-cell heatmap-l2"></div>
          <div class="heatmap-cell heatmap-l3"></div>
          <div class="heatmap-cell heatmap-l4"></div>
          <span>Plus</span>
        </div>
      </div>
    </div>`;
}

// ── I. DONUT CHART GENRES ─────────────────────────────────────────────────
function buildDonutChart(data, total) {
  if (!total || data.length === 0) return '';
  const colors = ['var(--accent)', '#2563eb', '#059669', '#d97706', '#e11d48', '#0891b2', '#ea580c', '#7c3aed'];
  let cumPct = 0;
  const stops = data.slice(0, 8).map(([, count], i) => {
    const pct = (count / total) * 100;
    const from = cumPct.toFixed(1);
    cumPct += pct;
    return `${colors[i % colors.length]} ${from}% ${cumPct.toFixed(1)}%`;
  });
  if (cumPct < 100) stops.push(`var(--border) ${cumPct.toFixed(1)}% 100%`);

  const legendItems = data.slice(0, 8).map(([label, count], i) => {
    const pct = Math.round((count / total) * 100);
    return `<div class="donut-legend-item">
      <span class="donut-dot" style="background:${colors[i % colors.length]}"></span>
      <span>${label}</span>
      <span class="donut-pct">${pct}%</span>
    </div>`;
  }).join('');

  return `<div class="donut-wrap">
    <div class="donut-chart" style="background:conic-gradient(${stops.join(', ')})">
      <div class="donut-hole"><span>${total}</span><small>titres</small></div>
    </div>
    <div class="donut-legend">${legendItems}</div>
  </div>`;
}

// ── CUSTOM LISTS ──────────────────────────────────────────────────────────
const LIST_COLORS = ['#7c3aed','#2563eb','#dc2626','#059669','#d97706','#e11d48','#0891b2','#ea580c'];
let selectedListColor = LIST_COLORS[0];

function saveLists() { localStorage.setItem('lumera_lists', JSON.stringify(customLists)); }

function renderLists() {
  const grid = document.getElementById('listsGrid');
  const detail = document.getElementById('listDetailView');
  grid.classList.toggle('hidden', activeListId !== null);
  detail.classList.toggle('hidden', activeListId === null);

  if (activeListId !== null) {
    const list = customLists.find(l => l.id === activeListId);
    if (!list) { activeListId = null; renderLists(); return; }
    const items = list.items.map(id => library.find(m => m.id === id)).filter(Boolean);
    document.getElementById('listDetailName').textContent = list.name;
    document.getElementById('listDetailCount').textContent = `${items.length} titre${items.length !== 1 ? 's' : ''}`;
    const cardsEl = document.getElementById('listDetailCards');
    const emptyEl = document.getElementById('listDetailEmpty');
    if (items.length === 0) { cardsEl.innerHTML = ''; emptyEl.classList.remove('hidden'); }
    else { emptyEl.classList.add('hidden'); cardsEl.innerHTML = ''; items.forEach((m, i) => cardsEl.appendChild(renderCard(m, i))); }
    return;
  }

  if (customLists.length === 0) {
    grid.innerHTML = `<div class="lists-empty"><div class="empty-icon">📁</div><p>Aucune liste encore.<br>Crée ta première liste !</p></div>`;
    return;
  }
  grid.innerHTML = customLists.map(list => {
    const items = list.items.map(id => library.find(m => m.id === id)).filter(Boolean);
    const thumbs = items.slice(0, 4).map(item =>
      item.poster ? `<img src="${item.poster}" class="list-thumb" onerror="this.outerHTML='<div class=\\'list-thumb list-thumb-ph\\'>${typeEmoji(item.type)}</div>'" />`
      : `<div class="list-thumb list-thumb-ph">${typeEmoji(item.type)}</div>`
    ).join('');
    return `<div class="list-card" onclick="openListDetail('${list.id}')" style="--lc:${list.color || 'var(--accent)'}">
      <div class="list-card-top">
        <div class="list-card-dot" style="background:${list.color}"></div>
        <span class="list-card-name">${list.name}</span>
        <button class="list-card-del" onclick="event.stopPropagation(); deleteList('${list.id}')" title="Supprimer">🗑️</button>
      </div>
      <div class="list-thumbs">${thumbs || '<div class="list-empty-ph">Vide</div>'}</div>
      <div class="list-card-count">${items.length} titre${items.length !== 1 ? 's' : ''}</div>
    </div>`;
  }).join('');
}

window.openListDetail = function(listId) {
  activeListId = listId;
  renderLists();
};

window.deleteList = function(listId) {
  if (!confirm('Supprimer cette liste ?')) return;
  customLists = customLists.filter(l => l.id !== listId);
  saveLists(); renderLists(); showToast('Liste supprimée');
};

window.openListPicker = function(mediaId) {
  const content = document.getElementById('listPickerContent');
  if (customLists.length === 0) {
    content.innerHTML = `<p class="list-picker-empty">Aucune liste créée.<br><a href="#" onclick="closeDetail(); showPage('lists'); document.getElementById('listPickerOverlay').classList.add('hidden')">Créer une liste →</a></p>`;
  } else {
    content.innerHTML = customLists.map(list => {
      const inList = list.items.includes(mediaId);
      return `<div class="list-picker-row ${inList ? 'in-list' : ''}" onclick="toggleItemInList('${mediaId}','${list.id}')">
        <div class="list-picker-dot" style="background:${list.color}"></div>
        <span>${list.name}</span>
        <span class="list-picker-check">${inList ? '✓' : '+'}</span>
      </div>`;
    }).join('');
  }
  document.getElementById('listPickerOverlay').classList.remove('hidden');
};

window.toggleItemInList = function(mediaId, listId) {
  const list = customLists.find(l => l.id === listId);
  if (!list) return;
  const idx = list.items.indexOf(mediaId);
  if (idx === -1) { list.items.push(mediaId); showToast(`Ajouté à "${list.name}"`); }
  else { list.items.splice(idx, 1); showToast(`Retiré de "${list.name}"`); }
  saveLists();
  window.openListPicker(mediaId); // refresh le picker
};

// ── CLASSEMENTS ────────────────────────────────────────────────────────────
function saveYearlyRanks() { localStorage.setItem('lumera_rank_yearly', JSON.stringify(yearlyRanks)); }
function saveAlltimeRanks() { localStorage.setItem('lumera_rank_alltime', JSON.stringify(alltimeRanks)); }

function getYearlyItems(type) {
  const items = library.filter(m =>
    m.type === type && m.dateAdded &&
    new Date(m.dateAdded).getFullYear() === CURRENT_YEAR
  );
  const order = ((yearlyRanks[CURRENT_YEAR] || {})[type]) || [];
  const ordered = order.map(id => items.find(m => m.id === id)).filter(Boolean);
  const unranked = items.filter(m => !order.includes(m.id)).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return [...ordered, ...unranked];
}

function getAlltimeItems(type) {
  return ((alltimeRanks[type]) || []).map(id => library.find(m => m.id === id)).filter(Boolean);
}

function renderCrankList(type, items, isYearly) {
  const labels = { movie: 'Films', series: 'Séries', anime: 'Animés', game: 'Jeux vidéo' };
  const emojis = { movie: '🎬', series: '📺', anime: '✨', game: '🎮' };
  const tab = isYearly ? 'yearly' : 'alltime';

  const addBtn = !isYearly
    ? `<button class="crank-add-btn" onclick="openRankPicker('${type}')">+ Ajouter</button>`
    : '';

  const medals = ['🥇', '🥈', '🥉'];
  const rows = items.length === 0
    ? `<div class="crank-empty">${isYearly ? `Aucun titre ajouté en ${CURRENT_YEAR}` : 'Aucun titre encore'}</div>`
    : items.map((item, i) => `
      <div class="crank-item" draggable="true" data-id="${item.id}" data-type="${type}" data-tab="${tab}">
        <span class="crank-medal">${medals[i] || `<span class="crank-num">#${i + 1}</span>`}</span>
        <span class="crank-drag">⋮⋮</span>
        ${item.poster
          ? `<img src="${item.poster}" class="crank-thumb" onerror="this.outerHTML='<div class=\\'crank-thumb crank-ph\\'>${typeEmoji(item.type)}</div>'" />`
          : `<div class="crank-thumb crank-ph">${typeEmoji(item.type)}</div>`}
        <div class="crank-info">
          <div class="crank-title" onclick="closeDetail();openDetail('${item.id}')">${item.title}</div>
          ${item.year ? `<div class="crank-year">${item.year}</div>` : ''}
        </div>
        ${item.rating ? `<div class="crank-rating">★ ${item.rating}</div>` : ''}
        ${!isYearly ? `<button class="crank-remove" onclick="removeFromAlltime('${item.id}','${type}')" title="Retirer">✕</button>` : ''}
      </div>`).join('');

  return `
    <div class="crank-section">
      <div class="crank-section-header">
        <span>${emojis[type]} ${labels[type]}</span>
        ${addBtn}
      </div>
      <div class="crank-list" id="crankList-${tab}-${type}">${rows}</div>
    </div>`;
}

function renderRankings() {
  const content = document.getElementById('crankContent');
  if (!content) return;

  // Update tab year label
  const yearlyTab = document.querySelector('.crank-tab[data-rank="yearly"]');
  if (yearlyTab) yearlyTab.textContent = `🏆 ${CURRENT_YEAR}`;

  document.querySelectorAll('.crank-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.rank === activeRankTab));

  const isYearly = activeRankTab === 'yearly';
  const types = ['movie', 'series', 'anime', 'game'];

  content.innerHTML = `<div class="crank-grid">
    ${types.map(type => {
      const items = isYearly ? getYearlyItems(type) : getAlltimeItems(type);
      return renderCrankList(type, items, isYearly);
    }).join('')}
  </div>`;

  // Attach drag events
  content.querySelectorAll('.crank-item').forEach(el => {
    el.addEventListener('dragstart', () => {
      rankDragSrcId = el.dataset.id;
      rankDragCtx = { tab: el.dataset.tab, type: el.dataset.type };
      el.classList.add('crank-dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('crank-dragging'));
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('crank-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('crank-over'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('crank-over');
      if (!rankDragSrcId || rankDragSrcId === el.dataset.id) return;
      if (rankDragCtx.type !== el.dataset.type || rankDragCtx.tab !== el.dataset.tab) return;
      const { tab, type } = rankDragCtx;
      if (tab === 'yearly') {
        if (!yearlyRanks[CURRENT_YEAR]) yearlyRanks[CURRENT_YEAR] = {};
        let ids = getYearlyItems(type).map(m => m.id);
        const fi = ids.indexOf(rankDragSrcId), ti = ids.indexOf(el.dataset.id);
        if (fi === -1 || ti === -1) return;
        ids.splice(fi, 1); ids.splice(ti, 0, rankDragSrcId);
        yearlyRanks[CURRENT_YEAR][type] = ids;
        saveYearlyRanks();
      } else {
        let ids = getAlltimeItems(type).map(m => m.id);
        const fi = ids.indexOf(rankDragSrcId), ti = ids.indexOf(el.dataset.id);
        if (fi === -1 || ti === -1) return;
        ids.splice(fi, 1); ids.splice(ti, 0, rankDragSrcId);
        alltimeRanks[type] = ids;
        saveAlltimeRanks();
      }
      renderRankings();
    });
  });
}

window.removeFromAlltime = function(mediaId, type) {
  alltimeRanks[type] = (alltimeRanks[type] || []).filter(id => id !== mediaId);
  saveAlltimeRanks();
  renderRankings();
  showToast('Retiré du classement');
};

window.openRankPicker = function(type) {
  rankPickerType = type;
  const labels = { movie: 'Films', series: 'Séries', anime: 'Animés', game: 'Jeux vidéo' };
  document.getElementById('rankPickerTitle').textContent = `Ajouter — ${labels[type]}`;
  document.getElementById('rankPickerSearch').value = '';
  renderRankPickerList('');
  document.getElementById('rankPickerOverlay').classList.remove('hidden');
};

function renderRankPickerList(query) {
  const existing = alltimeRanks[rankPickerType] || [];
  const q = query.toLowerCase();
  const available = library.filter(m =>
    m.type === rankPickerType &&
    !existing.includes(m.id) &&
    (!q || m.title.toLowerCase().includes(q))
  ).sort((a, b) => (b.rating || 0) - (a.rating || 0));

  const content = document.getElementById('rankPickerContent');
  content.innerHTML = available.length === 0
    ? `<p class="rp-empty">Tous les titres sont déjà ajoutés ou aucun résultat.</p>`
    : available.map(item => `
      <div class="rp-item" onclick="addToAlltime('${item.id}')">
        ${item.poster ? `<img src="${item.poster}" class="rp-thumb" onerror="this.style.display='none'" />` : `<div class="rp-thumb rp-ph">${typeEmoji(item.type)}</div>`}
        <div class="rp-info">
          <div class="rp-title">${item.title}</div>
          ${item.year ? `<div class="rp-year">${item.year}</div>` : ''}
        </div>
        ${item.rating ? `<span class="rp-rating">★ ${item.rating}</span>` : ''}
        <span class="rp-plus">+</span>
      </div>`).join('');
}

window.addToAlltime = function(mediaId) {
  if (!alltimeRanks[rankPickerType]) alltimeRanks[rankPickerType] = [];
  if (!alltimeRanks[rankPickerType].includes(mediaId)) {
    alltimeRanks[rankPickerType].push(mediaId);
    saveAlltimeRanks();
    const q = document.getElementById('rankPickerSearch').value;
    renderRankPickerList(q);
    showToast('Ajouté au classement ✓');
  }
};

function renderHomeRankings() {
  const el = document.getElementById('homeRankings');
  if (!el) return;
  const types = [
    { type: 'movie', label: 'Films', emoji: '🎬' },
    { type: 'series', label: 'Séries', emoji: '📺' },
    { type: 'anime', label: 'Animés', emoji: '✨' },
    { type: 'game', label: 'Jeux vidéo', emoji: '🎮' },
  ];
  const medals = ['🥇', '🥈', '🥉'];
  const sections = types.map(({ type, label, emoji }) => {
    const items = getYearlyItems(type).slice(0, 5);
    if (items.length === 0) return '';
    return `
      <div class="home-rank-section">
        <div class="home-rank-header">${emoji} ${label} ${CURRENT_YEAR}</div>
        ${items.map((item, i) => `
          <div class="home-rank-item" onclick="openDetail('${item.id}')">
            <span class="home-rank-medal">${medals[i] || `#${i + 1}`}</span>
            ${item.poster ? `<img src="${item.poster}" class="home-rank-thumb" onerror="this.style.display='none'" />` : ''}
            <span class="home-rank-title">${item.title}</span>
            ${item.rating ? `<span class="home-rank-rating">★ ${item.rating}</span>` : ''}
          </div>`).join('')}
        <button class="home-rank-more link-btn" onclick="showPage('rankings')">Voir tout →</button>
      </div>`;
  }).filter(Boolean).join('');

  if (!sections) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="section-block">
      <div class="section-header">
        <h2>🏆 Classements ${CURRENT_YEAR}</h2>
        <button class="link-btn" onclick="showPage('rankings')">Voir tout →</button>
      </div>
      <div class="home-rankings-grid">${sections}</div>
    </div>`;
}

// ── PAGES ─────────────────────────────────────────────────────────────────
function showPage(name) {
  // Barre de chargement cinématique
  const bar = document.getElementById('topProgressBar');
  if (bar) {
    bar.style.transition = 'none';
    bar.style.width = '0%';
    bar.style.opacity = '1';
    requestAnimationFrame(() => {
      bar.style.transition = 'width 0.25s ease, opacity 0.4s ease';
      bar.style.width = '65%';
      setTimeout(() => {
        bar.style.width = '100%';
        setTimeout(() => { bar.style.opacity = '0'; }, 300);
      }, 180);
    });
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const activePage = document.getElementById(`page-${name}`);
  activePage.classList.add('active');
  // C. Page transition: temporary class, removed after animation, no scroll replay
  activePage.classList.remove('page-entering');
  void activePage.offsetWidth; // force reflow
  activePage.classList.add('page-entering');
  setTimeout(() => activePage.classList.remove('page-entering'), 300);
  document.querySelectorAll('.nav-btn, .mob-nav-btn[data-page]').forEach(b => {
    b.classList.toggle('active', b.dataset.page === name);
  });
  // L. Page tint navbar
  const PAGE_TINTS = { home:'var(--accent)', library:'#2563eb', watchlist:'#059669', stats:'#d97706', rankings:'#dc2626', lists:'#0891b2', journal:'#e11d48' };
  document.documentElement.style.setProperty('--page-tint', PAGE_TINTS[name] || 'var(--accent)');
  if (name === 'home') renderHome();
  if (name === 'library') renderLibrary();
  if (name === 'watchlist') renderWatchlist();
  if (name === 'lists') { activeListId = null; renderLists(); }
  if (name === 'rankings') renderRankings();
  if (name === 'stats') renderStats();
  if (name === 'journal') renderJournal();
  if (name === 'discover') { if (typeof renderDiscover === 'function') renderDiscover(); }
  if (name === 'profil') { if (typeof renderProfil === 'function') renderProfil(); }
  // H. Animate page title
  requestAnimationFrame(() => {
    const pg = document.getElementById('page-' + name);
    if (pg) { const h2 = pg.querySelector('.page-header h2'); if (h2) animatePageTitle(h2); }
  });
}

// ── HOME ──────────────────────────────────────────────────────────────────
function renderHome() {
  const watched = library.filter(m => m.status !== 'watchlist');
  const recent = [...watched].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 10);
  const favs = library.filter(m => m.favorite).slice(0, 10);

  const movies = library.filter(m => m.type === 'movie' && m.status === 'watched').length;
  const series = library.filter(m => m.type === 'series' && m.status === 'watched').length;
  const animes = library.filter(m => m.type === 'anime' && m.status === 'watched').length;
  const games = library.filter(m => m.type === 'game' && m.status === 'watched').length;
  const rated = library.filter(m => m.rating);
  const avgRating = rated.length ? (rated.reduce((s, m) => s + m.rating, 0) / rated.length).toFixed(1) : '-';

  const totalWl = library.filter(m => m.status === 'watchlist').length;
  const totalAll = library.length;
  const totalWatched = library.filter(m => m.status === 'watched').length;
  const progressEl = document.getElementById('homeProgress');
  if (progressEl) {
    if (totalAll > 0) {
      const pct = Math.round((totalWatched / totalAll) * 100);
      progressEl.innerHTML = `
        <div class="home-progress-bar">
          <div class="home-progress-info">
            <span class="home-progress-label">Progression globale</span>
            <span class="home-progress-value">${totalWatched} vus sur ${totalAll} titres · ${pct}%</span>
          </div>
          <div class="home-progress-track">
            <div class="home-progress-fill" style="width:${pct}%"></div>
          </div>
          ${totalWl > 0 ? `<span class="home-progress-wl">📋 ${totalWl} titre${totalWl > 1 ? 's' : ''} en watchlist</span>` : ''}
        </div>`;
      progressEl.classList.remove('hidden');
    } else {
      progressEl.innerHTML = '';
    }
  }

  // Streak calculation
  const _dayMap = {};
  library.forEach(m => {
    if (!m.dateAdded) return;
    const dk = new Date(m.dateAdded).toISOString().slice(0, 10);
    _dayMap[dk] = (_dayMap[dk] || 0) + 1;
  });
  let _streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (_dayMap[d.toISOString().slice(0, 10)]) _streak++;
    else if (i > 0) break;
  }

  document.getElementById('quickStats').innerHTML = `
    <div class="stat-card"><div class="stat-icon">🎬</div><div class="stat-value" data-counter="${movies}">${movies}</div><div class="stat-label">Films vus</div></div>
    <div class="stat-card"><div class="stat-icon">📺</div><div class="stat-value" data-counter="${series}">${series}</div><div class="stat-label">Séries vues</div></div>
    <div class="stat-card"><div class="stat-icon">✨</div><div class="stat-value" data-counter="${animes}">${animes}</div><div class="stat-label">Animés vus</div></div>
    <div class="stat-card"><div class="stat-icon">🎮</div><div class="stat-value" data-counter="${games}">${games}</div><div class="stat-label">Jeux terminés</div></div>
    <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-value" ${avgRating !== '-' ? `data-counter="${avgRating}"` : ''}>${avgRating}</div><div class="stat-label">Note moyenne</div></div>
    <div class="stat-card stat-card-streak ${_streak > 0 ? 'streak-active' : ''}">
      <div class="stat-icon">${_streak > 2 ? '🔥' : _streak > 0 ? '✨' : '💤'}</div>
      <div class="stat-value">${_streak}</div>
      <div class="stat-label">Jours de suite</div>
      ${_streak === 0 ? '<div class="streak-warn">Démarre ton streak !</div>' : ''}
    </div>
  `;
  animateStatValues();

  const rc = document.getElementById('recentCards');
  const emptyHome = document.getElementById('emptyHome');
  rc.innerHTML = '';
  if (recent.length === 0) {
    emptyHome.classList.remove('hidden');
    rc.classList.add('hidden');
  } else {
    emptyHome.classList.add('hidden');
    rc.classList.remove('hidden');
    recent.forEach((m, i) => rc.appendChild(renderCard(m, i)));
  }

  const fc = document.getElementById('favCards');
  const favSection = document.getElementById('favSection');
  fc.innerHTML = '';
  if (favs.length === 0) {
    favSection.classList.add('hidden');
  } else {
    favSection.classList.remove('hidden');
    favs.forEach((m, i) => fc.appendChild(renderCard(m, i)));
  }

  // Hero: poster collage — real posters ou placeholders décoratifs
  const heroArt = document.querySelector('.hero-art, .hero-spotlight, .hero-collage');
  if (heroArt) {
    const withPosters = library.filter(m => m.poster).sort((a,b) => b.dateAdded - a.dateAdded);
    heroArt.className = 'hero-collage';

    if (withPosters.length >= 2) {
      // Vrais posters
      heroArt.innerHTML = withPosters.slice(0, 3).map(m =>
        `<img class="hero-collage-poster" src="${m.poster}" alt="${m.title}" title="${m.title}"
              onclick="openDetail('${m.id}')"
              onerror="this.style.display='none'" />`
      ).join('');
    } else {
      // Nancy.jpg comme poster central + 2 cartes dégradé
      const fallback = (icon, bg) =>
        `<div class="hero-collage-poster hero-collage-ph" style="background:${bg};display:flex;align-items:center;justify-content:center"><span style="font-size:2.4rem;opacity:0.75">${icon}</span></div>`;
      heroArt.innerHTML =
        fallback('🎞️', 'linear-gradient(145deg,#0a1f3a,#2563eb)') +
        `<img class="hero-collage-poster" src="Nancy.jpg" alt="Lumèra" style="cursor:default"
             onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'hero-collage-poster hero-collage-ph',innerHTML:'<span style=font-size:2.4rem;opacity:0.75>🎬</span>',style:'background:linear-gradient(145deg,#1a0a3a,#7c3aed);display:flex;align-items:center;justify-content:center'}))" />` +
        fallback('🏆', 'linear-gradient(145deg,#1f0a1f,#9333ea)');
    }
  }

  // Citation aléatoire depuis les avis
  const quoteEl = document.getElementById('homeQuote');
  if (quoteEl) {
    const withReview = library.filter(m => m.review && m.review.length > 20);
    if (withReview.length) {
      const pick = withReview[Math.floor(Math.random() * withReview.length)];
      quoteEl.innerHTML = `<div class="home-quote"><span class="home-quote-icon">💬</span><blockquote class="home-quote-text">"${pick.review}"</blockquote><cite class="home-quote-cite">— ${pick.title}${pick.year ? ` (${pick.year})` : ''}</cite></div>`;
    } else { quoteEl.innerHTML = ''; }
  }

  // Tendances TMDB
  renderTrending();

  // Mini widget
  updateMiniWidget();

  // Effet machine à écrire sur le sous-titre hero
  const heroP = document.querySelector('.hero-text p');
  if (heroP) {
    const txt = 'Ton journal personnel de films, séries, animés et jeux vidéo.';
    heroP.textContent = '';
    let i = 0;
    clearInterval(window._twTimer);
    window._twTimer = setInterval(() => { heroP.textContent += txt[i++]; if (i >= txt.length) clearInterval(window._twTimer); }, 32);
  }

  // Carrousel auto-scroll
  startCarousel();

  renderFavRanking();
  renderHomeRankings();
  // Batch 4 weekly report + seasonal
  if (typeof renderWeeklyReport === 'function') renderWeeklyReport();
  if (typeof applySeasonalTheme === 'function') applySeasonalTheme();

  // Carousel 3D
  initCarousel3D();
}

// ── CARROUSEL AUTO-SCROLL ──────────────────────────────────────────────────
let _carouselTimer = null;
function startCarousel() {
  stopCarousel();
  const row = document.getElementById('recentCards');
  if (!row) return;
  _carouselTimer = setInterval(() => {
    const max = row.scrollWidth - row.clientWidth;
    if (max <= 0) return;
    row.scrollTo({ left: row.scrollLeft + row.clientWidth >= max ? 0 : row.scrollLeft + 190, behavior: 'smooth' });
  }, 3200);
  row.addEventListener('mouseenter', stopCarousel);
  row.addEventListener('mouseleave', startCarousel);
}
function stopCarousel() {
  clearInterval(_carouselTimer); _carouselTimer = null;
}

// ── FAV RANKING ───────────────────────────────────────────────────────────
function renderFavRanking() {
  const section = document.getElementById('rankingSection');
  const favs = library.filter(m => m.favorite);
  if (favs.length === 0) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  const favIds = favs.map(m => m.id);
  favRankOrder = favRankOrder.filter(id => favIds.includes(id));
  favIds.forEach(id => { if (!favRankOrder.includes(id)) favRankOrder.push(id); });
  favs.sort((a, b) => favRankOrder.indexOf(a.id) - favRankOrder.indexOf(b.id));

  const list = document.getElementById('rankingList');
  list.innerHTML = '';
  favs.forEach((item, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const rank = medals[i] || `<span class="rank-num-plain">#${i + 1}</span>`;
    const div = document.createElement('div');
    div.className = 'rank-item';
    div.draggable = true;
    div.dataset.id = item.id;
    div.innerHTML = `
      <span class="rank-medal">${rank}</span>
      ${item.poster
        ? `<img class="rank-poster" src="${item.poster}" alt="${item.title}" onerror="this.style.display='none'" />`
        : `<div class="rank-poster-ph">${typeEmoji(item.type)}</div>`}
      <div class="rank-info">
        <div class="rank-title">${item.title}</div>
        <div class="rank-meta">${typeEmoji(item.type)}${item.year ? ` · ${item.year}` : ''}${item.rating ? ` · ★ ${item.rating}/10` : ''}</div>
      </div>
      <span class="rank-handle">⠿</span>
    `;
    div.addEventListener('click', e => { if (!e.target.closest('.rank-handle')) openEdit(item.id); });
    div.addEventListener('dragstart', e => {
      dragRankSrcId = item.id;
      setTimeout(() => div.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    div.addEventListener('dragend', () => div.classList.remove('dragging'));
    div.addEventListener('dragover', e => { e.preventDefault(); div.classList.add('drag-over'); });
    div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
    div.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      div.classList.remove('drag-over');
      if (dragRankSrcId && dragRankSrcId !== item.id) {
        const si = favRankOrder.indexOf(dragRankSrcId);
        const ti = favRankOrder.indexOf(item.id);
        favRankOrder.splice(si, 1); favRankOrder.splice(ti, 0, dragRankSrcId);
        saveFavRankOrder(); renderFavRanking();
      }
    });
    list.appendChild(div);
  });
}

// ── LIBRARY ───────────────────────────────────────────────────────────────
function renderLibrary() {
  renderGenreFilters();
  renderTagFilter();
  const filtered = filterAndSort(library.filter(m => m.status !== 'watchlist'));
  const grid = document.getElementById('libraryGrid');
  const empty = document.getElementById('emptyLibrary');
  const count = document.getElementById('resultsCount');

  grid.innerHTML = '';
  grid.classList.toggle('list-view', viewMode === 'list');
  grid.classList.toggle('poster-view', viewMode === 'poster');
  count.textContent = `${filtered.length} titre${filtered.length !== 1 ? 's' : ''} trouvé${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    filtered.forEach((m, i) => grid.appendChild(renderCard(m, i)));
  }
  // Update achievement badge whenever library renders
  if (typeof updateAchievementsBadge === 'function') updateAchievementsBadge();
}

// ── WATCHLIST ─────────────────────────────────────────────────────────────
function renderWatchlist() {
  let items = library.filter(m => m.status === 'watchlist');
  if (wlFilter !== 'all') items = items.filter(m => m.type === wlFilter);

  // Sync watchlist order
  const itemIds = items.map(m => m.id);
  watchlistOrder = watchlistOrder.filter(id => itemIds.includes(id));
  itemIds.forEach(id => { if (!watchlistOrder.includes(id)) watchlistOrder.push(id); });
  items.sort((a, b) => watchlistOrder.indexOf(a.id) - watchlistOrder.indexOf(b.id));

  const grid = document.getElementById('watchlistGrid');
  const empty = document.getElementById('emptyWatchlist');
  grid.innerHTML = '';
  if (items.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    items.forEach((m, i) => {
      const card = renderCard(m, i);
      card.draggable = true;
      card.classList.add('draggable-card');
      card.addEventListener('dragstart', e => {
        dragSrcId = m.id;
        setTimeout(() => card.classList.add('dragging'), 0);
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); e.dataTransfer.dropEffect = 'move'; });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', e => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (dragSrcId && dragSrcId !== m.id) {
          const srcIdx = watchlistOrder.indexOf(dragSrcId);
          const tgtIdx = watchlistOrder.indexOf(m.id);
          watchlistOrder.splice(srcIdx, 1);
          watchlistOrder.splice(tgtIdx, 0, dragSrcId);
          saveWlOrder();
          renderWatchlist();
        }
      });
      grid.appendChild(card);
    });
  }
}

// ── STATS ─────────────────────────────────────────────────────────────────
function renderStats() {
  const total = library.length;
  const watched = library.filter(m => m.status === 'watched').length;
  const wl = library.filter(m => m.status === 'watchlist').length;
  const watching = library.filter(m => m.status === 'watching').length;
  const movies = library.filter(m => m.type === 'movie').length;
  const series = library.filter(m => m.type === 'series').length;
  const animes = library.filter(m => m.type === 'anime').length;
  const games = library.filter(m => m.type === 'game').length;
  const rated = library.filter(m => m.rating);
  const avg = rated.length ? (rated.reduce((s, m) => s + m.rating, 0) / rated.length).toFixed(1) : 0;
  const favs = library.filter(m => m.favorite).length;

  // H. Temps de visionnage estimé
  let watchMinutes = 0;
  library.filter(m => m.status === 'watched').forEach(m => {
    if (m.type === 'movie') watchMinutes += 115;
    else if (m.type === 'series') watchMinutes += (m.epCurrent || m.epTotal || 10) * 45;
    else if (m.type === 'anime') watchMinutes += (m.epCurrent || m.epTotal || 12) * 24;
    else if (m.type === 'game') watchMinutes += 25 * 60;
  });
  const watchHours = Math.round(watchMinutes / 60);
  const watchDays = (watchMinutes / 60 / 24).toFixed(1);

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-icon">📚</div><div class="stat-value" data-counter="${total}">${total}</div><div class="stat-label">Total titres</div></div>
    <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value" data-counter="${watched}">${watched}</div><div class="stat-label">Vus</div></div>
    <div class="stat-card"><div class="stat-icon">▶️</div><div class="stat-value" data-counter="${watching}">${watching}</div><div class="stat-label">En cours</div></div>
    <div class="stat-card"><div class="stat-icon">🔖</div><div class="stat-value" data-counter="${wl}">${wl}</div><div class="stat-label">Watchlist</div></div>
    <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-value" ${avg ? `data-counter="${avg}"` : ''}>${avg || '-'}</div><div class="stat-label">Note moyenne</div></div>
    <div class="stat-card"><div class="stat-icon">❤️</div><div class="stat-value" data-counter="${favs}">${favs}</div><div class="stat-label">Coups de coeur</div></div>
    <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-value" data-counter="${watchHours}" title="${watchDays} jours">${watchHours}h</div><div class="stat-label">Temps estimé</div></div>
  `;
  animateStatValues();

  // Rating distribution
  const ratingBuckets = [0, 0, 0, 0, 0];
  rated.forEach(m => { const b = Math.min(Math.ceil(m.rating / 2) - 1, 4); ratingBuckets[b]++; });
  const maxBucket = Math.max(...ratingBuckets, 1);

  // Genre stats
  const byGenre = {};
  library.forEach(m => {
    if (m.genres) m.genres.split(',').forEach(g => {
      const genre = g.trim();
      if (genre) byGenre[genre] = (byGenre[genre] || 0) + 1;
    });
  });
  const topGenres = Object.entries(byGenre).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const maxGenre = topGenres.length ? topGenres[0][1] : 1;

  // Year stats (by year added)
  const byYear = {};
  library.filter(m => m.dateAdded).forEach(m => {
    const year = new Date(m.dateAdded).getFullYear();
    byYear[year] = (byYear[year] || 0) + 1;
  });
  const topYears = Object.entries(byYear).sort((a, b) => b[0] - a[0]).slice(0, 6);
  const maxYear = topYears.length ? Math.max(...topYears.map(([, v]) => v)) : 1;

  const maxType = Math.max(movies, series, animes, games, 1);
  const typeColors = ['#6d28d9', '#059669', '#ea580c', '#0ea5e9'];

  // Monthly activity (last 12 months)
  const monthNow = new Date();
  const monthlyActivity = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(monthNow.getFullYear(), monthNow.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleString('fr-FR', { month: 'short' });
    monthlyActivity.push({ key, label, count: 0 });
  }
  library.filter(m => m.dateAdded).forEach(m => {
    const d = new Date(m.dateAdded);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const entry = monthlyActivity.find(e => e.key === key);
    if (entry) entry.count++;
  });
  const maxMonthly = Math.max(...monthlyActivity.map(e => e.count), 1);

  document.getElementById('statsCharts').innerHTML = `
    <div class="chart-card">
      <h3>Répartition par type</h3>
      <div class="bar-chart">
        ${[['🎬 Films', movies, typeColors[0]], ['📺 Séries', series, typeColors[1]], ['✨ Animés', animes, typeColors[2]], ['🎮 Jeux vidéo', games, typeColors[3]]].map(([label, val, color]) => `
          <div class="bar-item">
            <div class="bar-label-row"><span class="bar-label">${label}</span><span class="bar-value">${val}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${(val / maxType) * 100}%;background:${color}"></div></div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="chart-card">
      <h3>Distribution des notes</h3>
      <div class="bar-chart">
        ${['1-2 ★', '3-4 ★', '5-6 ★', '7-8 ★', '9-10 ★'].map((label, i) => `
          <div class="bar-item">
            <div class="bar-label-row"><span class="bar-label">${label}</span><span class="bar-value">${ratingBuckets[i]}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${(ratingBuckets[i] / maxBucket) * 100}%;background:var(--gold)"></div></div>
          </div>
        `).join('')}
      </div>
    </div>
    ${topGenres.length > 0 ? `
    <div class="chart-card">
      <h3>Mes genres préférés</h3>
      <div class="bar-chart">
        ${topGenres.map(([genre, count]) => `
          <div class="bar-item">
            <div class="bar-label-row"><span class="bar-label">${genre}</span><span class="bar-value">${count}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${(count / maxGenre) * 100}%;background:var(--accent)"></div></div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
    ${topYears.length > 0 ? `
    <div class="chart-card">
      <h3>Titres ajoutés par année</h3>
      <div class="bar-chart">
        ${topYears.map(([year, count]) => `
          <div class="bar-item">
            <div class="bar-label-row"><span class="bar-label">${year}</span><span class="bar-value">${count}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${(count / maxYear) * 100}%;background:var(--blue)"></div></div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
    <div class="chart-card chart-card-wide">
      <h3>📅 Activité par mois</h3>
      <div class="activity-chart">
        ${monthlyActivity.map(e => `
          <div class="activity-col">
            <div class="activity-bar-wrap">
              <div class="activity-bar" style="height:${e.count === 0 ? '4px' : `${Math.round((e.count/maxMonthly)*100)}%`}" title="${e.count} titre(s)">
                ${e.count > 0 ? `<span class="activity-bar-count">${e.count}</span>` : ''}
              </div>
            </div>
            <span class="activity-month">${e.label}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ${topGenres.length >= 2 ? `
    <div class="chart-card">
      <h3>🍩 Genres — vue camembert</h3>
      ${buildDonutChart(topGenres, topGenres.reduce((s,[,v]) => s+v, 0))}
    </div>` : ''}
    ${buildHeatmap()}
  `;

  // G. Ma note vs TMDB
  const compared = library.filter(m => m.rating && m.tmdbRating);
  if (compared.length >= 2) {
    const avgMine = (compared.reduce((s, m) => s + m.rating, 0) / compared.length).toFixed(1);
    const avgTmdb = (compared.reduce((s, m) => s + m.tmdbRating, 0) / compared.length).toFixed(1);
    const diff = (parseFloat(avgMine) - parseFloat(avgTmdb)).toFixed(1);
    const diffSign = diff > 0 ? '+' : '';
    const diffClass = diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral';
    const diffMsg = diff > 0 ? 'Au-dessus de la moyenne TMDB' : diff < 0 ? 'En dessous de la moyenne TMDB' : 'Aligné avec TMDB';
    const tmdbScaled = (parseFloat(avgTmdb)).toFixed(1);
    document.getElementById('statsCharts').insertAdjacentHTML('beforeend', `
      <div class="chart-card chart-card-full">
        <h3>🆚 Ma note vs TMDB (${compared.length} titres comparés)</h3>
        <div class="compare-card">
          <div class="compare-side">
            <div class="compare-label">⭐ Ma moyenne</div>
            <div class="compare-value" data-counter="${avgMine}">${avgMine}</div>
            <div class="compare-label" style="margin-top:0.3rem">/ 10</div>
          </div>
          <div class="compare-diff">
            <div class="compare-diff-val ${diffClass}">${diffSign}${diff}</div>
            <div class="compare-diff-label">${diffMsg}</div>
          </div>
          <div class="compare-side">
            <div class="compare-label">🎬 Moyenne TMDB</div>
            <div class="compare-value" style="color:var(--text-muted)" data-counter="${tmdbScaled}">${tmdbScaled}</div>
            <div class="compare-label" style="margin-top:0.3rem">/ 10</div>
          </div>
        </div>
      </div>
    `);
    animateStatValues();
  }

  // Top rated
  const top = [...library].filter(m => m.rating).sort((a, b) => b.rating - a.rating).slice(0, 6);
  if (top.length > 0) {
    document.getElementById('statsTop').innerHTML = `
      <h3>🏆 Mes meilleures notes</h3>
      <div class="top-list">
        ${top.map((m, i) => `
          <div class="top-item" onclick="openEdit('${m.id}')">
            <div class="top-item-rank">#${i + 1}</div>
            <div class="top-item-title">${m.title}</div>
            <div class="top-item-rating">★ ${m.rating}/10 · ${typeEmoji(m.type)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    document.getElementById('statsTop').innerHTML = '';
  }

  // Podium par année
  const byYearBest = {};
  library.filter(m => m.year && m.rating).forEach(m => {
    if (!byYearBest[m.year]) byYearBest[m.year] = {};
    if (!byYearBest[m.year][m.type] || m.rating > byYearBest[m.year][m.type].rating) {
      byYearBest[m.year][m.type] = m;
    }
  });
  const podiumYears = Object.keys(byYearBest).sort((a, b) => b - a).slice(0, 6);
  const typeOrder = ['movie', 'series', 'anime', 'game'];
  const podiumEl = document.getElementById('statsPodium');
  if (podiumYears.length > 0) {
    podiumEl.innerHTML = `
      <h3>🎖️ Meilleur par année</h3>
      <div class="podium-grid">
        ${podiumYears.map(year => {
          const entries = typeOrder.filter(t => byYearBest[year][t]);
          if (entries.length === 0) return '';
          return `<div class="podium-year-card">
            <div class="podium-year-label">${year}</div>
            ${entries.map(t => {
              const m = byYearBest[year][t];
              return `<div class="podium-entry" onclick="openEdit('${m.id}')">
                <span class="podium-type">${typeEmoji(t)}</span>
                <div class="podium-info">
                  <div class="podium-title">${m.title}</div>
                  <div class="podium-rating">★ ${m.rating}/10</div>
                </div>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
    `;
  } else {
    podiumEl.innerHTML = '';
  }
  // Batch 4 extra charts
  if (typeof renderStatsExtra === 'function') renderStatsExtra();
  // Batch 5 heatmap
  if (typeof renderHeatmap === 'function') renderHeatmap();
}

// ── DETAIL MODAL ──────────────────────────────────────────────────────────
function openDetail(id) {
  const item = library.find(m => m.id === id);
  if (!item) return;

  const posterHtml = item.poster
    ? `<img class="detail-poster" src="${item.poster}" alt="${item.title}" onerror="this.outerHTML='<div class=\\'detail-poster-placeholder\\'>${typeEmoji(item.type)}</div>'" />`
    : `<div class="detail-poster-placeholder">${typeEmoji(item.type)}</div>`;

  const genres = item.genres ? item.genres.split(',').map(g => {
    const t = g.trim();
    return `<span class="genre-tag genre-tag-link" onclick="filterByGenre('${t.replace(/'/g, "\\'")}')">${t}</span>`;
  }).join('') : '';
  const synopsisHtml = item.synopsis
    ? `<div class="detail-review-section"><div class="detail-review-label">Synopsis</div><div class="detail-synopsis-text">${item.synopsis}</div></div>`
    : '';
  const reviewHtml = item.review
    ? `<div class="detail-review-section"><div class="detail-review-label">Mon avis</div><div class="detail-review-text">"${item.review}"</div></div>`
    : '';
  const privateNoteHtml = item.privateNote
    ? `<div class="detail-review-section">
        <div class="detail-review-label">Note privée 🔒</div>
        <button class="btn-reveal-private" id="revealPrivateBtn" onclick="togglePrivateNote()">Afficher (spoilers...)</button>
        <div class="private-note-revealed hidden" id="privateNoteRevealed">${item.privateNote}</div>
      </div>`
    : '';
  const metaHtml = (item.watchDate || item.rewatchCount) ? `<div class="detail-meta-row">
    ${item.watchDate ? `<span class="detail-meta-chip">📅 ${item.watchDate}</span>` : ''}
    ${item.rewatchCount > 1 ? `<span class="detail-meta-chip">🔁 Vu ${item.rewatchCount} fois</span>` : ''}
  </div>` : '';

  // Episode info
  let episodeHtml = '';
  if ((item.type === 'series' || item.type === 'anime') && (item.epTotal || item.season)) {
    const pct = (item.epCurrent && item.epTotal) ? Math.round((item.epCurrent / item.epTotal) * 100) : 0;
    episodeHtml = `
      <div class="detail-episode">
        <div class="detail-review-label">Progression</div>
        ${item.season ? `<div class="ep-info-row">📺 Saison ${item.season}</div>` : ''}
        ${item.epTotal ? `
          <div class="ep-info-row" style="display:flex;align-items:center;gap:0.8rem">
            ${makeProgressRing(item.epCurrent || 0, item.epTotal, 52, 4)}
            <span style="font-size:0.85rem;color:var(--text-muted)">${pct}% complété</span>
          </div>
        ` : ''}
      </div>`;
  }

  // Blurred poster background
  const modalDetail = document.getElementById('modalDetail');
  let detailBg = modalDetail.querySelector('.detail-blur-bg');
  if (!detailBg) {
    detailBg = document.createElement('div');
    detailBg.className = 'detail-blur-bg';
    modalDetail.insertBefore(detailBg, modalDetail.firstChild);
  }
  if (item.poster) {
    detailBg.style.backgroundImage = `url('${item.poster}')`;
    modalDetail.classList.add('has-poster-bg');
  } else {
    detailBg.style.backgroundImage = '';
    modalDetail.classList.remove('has-poster-bg');
  }

  const hasExtra = !!(metaHtml || episodeHtml || reviewHtml || privateNoteHtml);

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-inner" style="position:relative">
      <div class="detail-aura" id="detailAura"></div>
      <div class="detail-top">
        ${posterHtml}
        <div class="detail-info">
          <div class="detail-badges">
            ${typeBadge(item.type)}
            ${statusBadge(item.status, item.type)}
            ${item.favorite ? '<span>⭐ Coup de coeur</span>' : ''}
          </div>
          <div class="detail-title">${item.title}</div>
          ${item.year ? `<div class="detail-year">${item.year}</div>` : ''}
          ${genres ? `<div class="detail-genres">${genres}</div>` : ''}
          ${item.tags && item.tags.length ? `<div class="tags-container" style="margin-top:0.4rem">${item.tags.map(t=>`<span class="tag-pill" onclick="window._activeTag='${t}';closeDetail();showPage('library')">${t}</span>`).join('')}</div>` : ''}
          ${item.rating ? `
            <div class="detail-rating-big">${item.rating}<span>/ 10</span></div>
            <div class="detail-stars">${starsHtml(item.rating, '1.4rem')}</div>
          ` : '<div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1rem">Non noté</div>'}
        </div>
      </div>
      ${synopsisHtml}
      ${hasExtra ? `
        <div class="detail-extra hidden" id="detailExtra">
          ${metaHtml}
          ${episodeHtml}
          ${reviewHtml}
          ${privateNoteHtml}
        </div>
      ` : ''}
      <div class="detail-actions">
        <button class="btn-cinema" onclick="openCinema('${id}')">🎬 Mode cinéma</button>
        <button class="btn-cinema" style="background:linear-gradient(135deg,#1a0a3a,#2d0050)" onclick="openProjection('${id}')">🎞️ Projection</button>
        ${item.trailer ? `<button class="btn-trailer-modal" data-trailer="${item.trailer.replace(/"/g,'&quot;')}">▶ Bande-annonce</button>` : ''}
        <button class="btn-secondary detail-list-btn" onclick="openListPicker('${id}')">📁 Listes</button>
        ${hasExtra ? `<button class="btn-secondary detail-more-btn" id="detailMoreBtn" onclick="toggleDetailExtra()">📋 Plus de détails</button>` : ''}
        <button class="btn-secondary" onclick="openShareCard('${id}')">📤 Partager</button>
        <button class="btn-edit" onclick="editItem('${id}')">✏️ Modifier</button>
        <button class="btn-danger" onclick="deleteItem('${id}')">🗑️ Supprimer</button>
      </div>
      <div id="rewatchSection"></div>
    </div>
  `;
  document.getElementById('detailOverlay').classList.remove('hidden');

  // Apply dominant color aura from poster
  if (item.poster) applyColorAura(item.poster);

  // Render re-watch log
  renderRewatchLog(id);
}

function closeDetail() { document.getElementById('detailOverlay').classList.add('hidden'); }

window.toggleDetailExtra = function() {
  const extra = document.getElementById('detailExtra');
  const btn = document.getElementById('detailMoreBtn');
  if (!extra) return;
  const isHidden = extra.classList.toggle('hidden');
  btn.textContent = isHidden ? '📋 Plus de détails' : '🔼 Moins de détails';
};
window.openDetail = openDetail;

function editItem(id) {
  closeDetail();
  const item = library.find(m => m.id === id);
  if (!item) return;
  openAddModal(item);
}
window.editItem = editItem;

function deleteItem(id) {
  if (!confirm('Supprimer ce titre ?')) return;
  library = library.filter(m => m.id !== id);
  save();
  closeDetail();
  refreshCurrentPage();
  showToast('Titre supprimé');
}
window.deleteItem = deleteItem;

// ── ADD / EDIT MODAL ──────────────────────────────────────────────────────
function updateEpisodeFieldsVisibility() {
  const show = currentType === 'series' || currentType === 'anime';
  document.getElementById('episodeFields').classList.toggle('hidden', !show);
  updateStatusOptions();
}

function updateStatusOptions() {
  const sel = document.getElementById('fStatus');
  const current = sel.value;
  const isGame = currentType === 'game';
  sel.innerHTML = isGame
    ? `<option value="watched">✅ Terminé</option><option value="watching">🎮 En cours</option><option value="watchlist">📋 À jouer</option><option value="dropped">❌ Abandonné</option>`
    : `<option value="watched">✅ Vu</option><option value="watching">▶️ En cours</option><option value="watchlist">🔖 Watchlist</option><option value="dropped">❌ Abandonné</option>`;
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

function openAddModal(item = null) {
  editingId = item ? item.id : null;
  currentRating = item ? (item.rating || 0) : 0;
  currentType = item ? item.type : 'movie';

  document.getElementById('modalTitle').textContent = item ? 'Modifier le titre' : 'Ajouter un titre';
  document.getElementById('editId').value = editingId || '';
  document.getElementById('fTitle').value = item ? item.title : '';
  document.getElementById('fStatus').value = item ? item.status : 'watched';
  document.getElementById('fYear').value = item ? (item.year || '') : '';
  document.getElementById('fGenres').value = item ? (item.genres || '') : '';
  document.getElementById('fPoster').value = item ? (item.poster || '') : '';
  document.getElementById('fTrailer').value = item ? (item.trailer || '') : '';
  document.getElementById('fReview').value = item ? (item.review || '') : '';
  document.getElementById('fFav').checked = item ? !!item.favorite : false;
  document.getElementById('fSynopsis').value = item ? (item.synopsis || '') : '';
  document.getElementById('fWatchDate').value = item ? (item.watchDate || '') : '';
  document.getElementById('fRewatchCount').value = item ? (item.rewatchCount || '') : '';
  document.getElementById('fPrivateNote').value = item ? (item.privateNote || '') : '';
  document.getElementById('fPrivateNote').classList.add('hidden');
  document.getElementById('fTmdbRating').value = item ? (item.tmdbRating || '') : '';
  document.getElementById('fSeason').value = item ? (item.season || '') : '';
  document.getElementById('fEpCurrent').value = item ? (item.epCurrent || '') : '';
  document.getElementById('fEpTotal').value = item ? (item.epTotal || '') : '';
  document.getElementById('fTags').value = item ? (item.tags || []).join(', ') : '';
  renderTagsPreview();

  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === currentType));
  updateEpisodeFieldsVisibility();
  renderStarInput();
  updateSearchBtnLabel();

  // Dynamic buttons in footer
  const formActions = document.querySelector('.form-actions');
  formActions.querySelectorAll('.btn-cinema-edit, .btn-danger-edit, .btn-detail-edit').forEach(b => b.remove());
  if (item) {
    const cinemaBtn = document.createElement('button');
    cinemaBtn.type = 'button';
    cinemaBtn.className = 'btn-cinema btn-cinema-edit';
    cinemaBtn.textContent = '🎬 Cinéma';
    cinemaBtn.style.marginRight = 'auto';
    cinemaBtn.addEventListener('click', () => { closeAddModal(); window.openCinema && window.openCinema(item.id); });
    formActions.insertBefore(cinemaBtn, formActions.firstChild);
    const detailBtn = document.createElement('button');
    detailBtn.type = 'button';
    detailBtn.className = 'btn-secondary btn-detail-edit';
    detailBtn.textContent = '👁️ Fiche';
    detailBtn.addEventListener('click', () => { closeAddModal(); openDetail(item.id); });
    formActions.insertBefore(detailBtn, formActions.firstChild);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-danger btn-danger-edit';
    delBtn.textContent = '🗑️ Supprimer';
    delBtn.addEventListener('click', () => {
      if (!confirm('Supprimer ce titre ?')) return;
      library = library.filter(m => m.id !== item.id);
      save(); closeAddModal(); refreshCurrentPage(); showToast('Titre supprimé');
    });
    formActions.insertBefore(delBtn, document.getElementById('cancelModal'));
  } else {
    tryRestoreDraft();
  }

  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('fTitle').focus();
}

function closeAddModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('mediaForm').reset();
  editingId = null;
  currentRating = 0;
  currentType = 'movie';
  updateEpisodeFieldsVisibility();
}

function renderStarInput() {
  const row = document.getElementById('starsRow');
  row.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const star = document.createElement('span');
    star.className = 'star-input-item' + (i <= currentRating ? ' active' : '');
    star.textContent = '★';
    star.addEventListener('mouseenter', () => highlightStars(i));
    star.addEventListener('mouseleave', () => highlightStars(currentRating));
    star.addEventListener('click', () => {
      currentRating = currentRating === i ? 0 : i;
      highlightStars(currentRating);
      updateStarLabel();
    });
    row.appendChild(star);
  }
  updateStarLabel();
}

function highlightStars(n) {
  document.querySelectorAll('.star-input-item').forEach((s, i) => s.classList.toggle('active', i < n));
}

function updateStarLabel() {
  document.querySelector('.star-label').textContent = currentRating ? `${currentRating} / 10` : '0 / 10';
}

// ── FORM SUBMIT ───────────────────────────────────────────────────────────
document.getElementById('mediaForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const title = document.getElementById('fTitle').value.trim();
  if (!title) return;

  const data = {
    id: editingId || uid(),
    title,
    type: currentType,
    status: document.getElementById('fStatus').value,
    year: parseInt(document.getElementById('fYear').value) || null,
    genres: document.getElementById('fGenres').value.trim(),
    poster: document.getElementById('fPoster').value.trim(),
    trailer: document.getElementById('fTrailer').value.trim() || null,
    tmdbRating: parseFloat(document.getElementById('fTmdbRating').value) || null,
    rating: currentRating || null,
    review: document.getElementById('fReview').value.trim(),
    synopsis: document.getElementById('fSynopsis').value.trim(),
    watchDate: document.getElementById('fWatchDate').value || null,
    rewatchCount: parseInt(document.getElementById('fRewatchCount').value) || null,
    favorite: document.getElementById('fFav').checked,
    privateNote: document.getElementById('fPrivateNote').value.trim() || null,
    season: parseInt(document.getElementById('fSeason').value) || null,
    epCurrent: parseInt(document.getElementById('fEpCurrent').value) || null,
    epTotal: parseInt(document.getElementById('fEpTotal').value) || null,
    dateAdded: editingId ? (library.find(m => m.id === editingId)?.dateAdded || Date.now()) : Date.now(),
    tags: document.getElementById('fTags').value.trim().split(',').map(t => t.trim()).filter(Boolean),
  };

  const prevItem    = editingId ? library.find(m => m.id === editingId) : null;
  const prevStatus  = prevItem?.status ?? null;
  const wasFav      = prevItem?.favorite ?? false;
  const isCompletion = data.status === 'watched' && prevStatus !== 'watched';

  if (editingId) {
    library = library.map(m => m.id === editingId ? data : m);
    logAction('modified', data.title);
    showToast('✅ Titre modifié !');
  } else {
    library.unshift(data);
    logAction('added', data.title);
    showToast('✅ Titre ajouté !');
  }
  updateMiniWidget();

  if (isCompletion || (data.rating >= 9)) setTimeout(launchConfetti, 350);
  if (data.favorite && !wasFav) setTimeout(() => burstFavParticles(window.innerWidth / 2, window.innerHeight / 2), 250);

  sessionStorage.removeItem('lumera_form_draft');
  save();
  closeAddModal();
  refreshCurrentPage();
});

function refreshCurrentPage() {
  const active = document.querySelector('.page.active');
  if (!active) return;
  const id = active.id.replace('page-', '');
  if (id === 'home') renderHome();
  if (id === 'library') { renderGenreFilters(); renderLibrary(); }
  if (id === 'watchlist') renderWatchlist();
  if (id === 'lists') renderLists();
  if (id === 'rankings') renderRankings();
  if (id === 'stats') renderStats();
}

// ── EVENTS ────────────────────────────────────────────────────────────────
// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
document.querySelectorAll('.link-btn[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));

// Mobile nav
document.querySelectorAll('.mob-nav-btn[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
document.getElementById('mobAddBtn')?.addEventListener('click', () => openAddModal());

// Add modal
document.getElementById('openAddModal').addEventListener('click', () => openAddModal());
document.getElementById('heroAddBtn').addEventListener('click', () => openAddModal());
document.getElementById('emptyAddBtn')?.addEventListener('click', () => openAddModal());
document.getElementById('closeModal').addEventListener('click', closeAddModal);
document.getElementById('cancelModal').addEventListener('click', closeAddModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeAddModal(); });

// Detail modal
document.getElementById('closeDetail').addEventListener('click', closeDetail);
document.getElementById('detailOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetail(); });

// Type selector
document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentType = btn.dataset.type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
    updateEpisodeFieldsVisibility();
  });
});

// Library filters
document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    libFilter.type = btn.dataset.filter;
    renderLibrary();
  });
});
document.querySelectorAll('[data-status]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    libFilter.status = btn.dataset.status;
    renderLibrary();
  });
});
document.getElementById('sortSelect').addEventListener('change', e => { libFilter.sort = e.target.value; renderLibrary(); });

// Watchlist filters
document.querySelectorAll('[data-wl-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-wl-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    wlFilter = btn.dataset.wlFilter;
    renderWatchlist();
  });
});

// Search — dropdown handles live results; Enter still filters library
document.getElementById('globalSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const q = e.target.value.trim();
    if (!q) return;
    searchQuery = q;
    document.getElementById('searchDropdown')?.classList.add('hidden');
    const active = document.querySelector('.page.active');
    const id = active?.id.replace('page-', '');
    if (id === 'library') renderLibrary();
    else showPage('library');
  }
});
// Clear library filter when search is cleared
document.getElementById('globalSearch').addEventListener('input', e => {
  if (!e.target.value.trim()) {
    searchQuery = '';
    const id = document.querySelector('.page.active')?.id.replace('page-', '');
    if (id === 'library') renderLibrary();
  }
});

// Theme toggle — cycle light → dark → neon
document.getElementById('themeToggle').addEventListener('click', () => {
  const modes = ['light', 'dark', 'neon'];
  themeMode = modes[(modes.indexOf(themeMode) + 1) % 3];
  isDark = themeMode !== 'light';
  localStorage.setItem('lumera_theme', isDark ? 'dark' : 'light');
  localStorage.setItem('lumera_theme_mode', themeMode);
  applyTheme();
});

// View toggle (3 modes: grid → list → poster)
document.getElementById('viewToggle').addEventListener('click', () => {
  const modes = ['grid', 'list', 'poster'];
  const icons = { grid: '☰', list: '🖼️', poster: '⊞' };
  const titles = { grid: 'Vue liste', list: 'Vue affiches', poster: 'Vue grille' };
  viewMode = modes[(modes.indexOf(viewMode) + 1) % 3];
  const btn = document.getElementById('viewToggle');
  btn.textContent = icons[viewMode];
  btn.title = titles[viewMode];
  renderLibrary();
});

// Reset
document.getElementById('resetBtn')?.addEventListener('click', () => {
  if (confirm('⚠️ Supprimer toute la bibliothèque ? Cette action est irréversible.')) {
    localStorage.setItem('lumera_library', '[]'); // garder la clé pour bloquer le re-seed
    localStorage.removeItem('lumera_wl_order');
    localStorage.removeItem('lumera_rank_order');
    library = [];
    watchlistOrder = [];
    favRankOrder = [];
    refreshCurrentPage();
    showToast('Bibliothèque réinitialisée');
  }
});

// Import / Export
document.getElementById('exportBtn').addEventListener('click', exportLibrary);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importInput').click());
document.getElementById('importInput').addEventListener('change', e => {
  if (e.target.files[0]) { importLibrary(e.target.files[0]); e.target.value = ''; }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('modalOverlay').classList.contains('hidden')) closeAddModal();
    if (!document.getElementById('detailOverlay').classList.contains('hidden')) closeDetail();
    if (!document.getElementById('rankPickerOverlay').classList.contains('hidden')) document.getElementById('rankPickerOverlay').classList.add('hidden');
  }
  if (e.key === 'n' && !e.target.closest('input,textarea,select')) openAddModal();
});

// Rating slider
document.getElementById('ratingSlider')?.addEventListener('input', e => {
  minRatingFilter = parseInt(e.target.value);
  const valEl = document.getElementById('ratingValue');
  if (valEl) valEl.textContent = minRatingFilter === 0 ? 'Toutes' : `≥ ${minRatingFilter}/10`;
  renderLibrary();
});

// Favs filter
document.getElementById('favFilterBtn')?.addEventListener('click', () => {
  showFavsOnly = !showFavsOnly;
  document.getElementById('favFilterBtn').classList.toggle('active', showFavsOnly);
  renderLibrary();
});

// Private note toggle
document.getElementById('privateNoteToggle')?.addEventListener('click', () => {
  const area = document.getElementById('fPrivateNote');
  area.classList.toggle('hidden');
});

// Toggle private note reveal in detail
window.togglePrivateNote = function() {
  const text = document.getElementById('privateNoteRevealed');
  const btn = document.getElementById('revealPrivateBtn');
  const hidden = text.classList.toggle('hidden');
  btn.textContent = hidden ? 'Afficher (spoilers...)' : '🙈 Masquer';
};

// Hero background
document.getElementById('heroBgBtn')?.addEventListener('click', () => {
  const current = localStorage.getItem('lumera_hero_bg');
  if (current) {
    if (confirm('Réinitialiser l\'image de fond par défaut ?')) {
      localStorage.removeItem('lumera_hero_bg');
      applyHeroBg();
      showToast('Image réinitialisée');
    } else {
      document.getElementById('heroBgInput').click();
    }
  } else {
    document.getElementById('heroBgInput').click();
  }
});
document.getElementById('heroBgInput')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    localStorage.setItem('lumera_hero_bg', ev.target.result);
    applyHeroBg();
    showToast('✅ Image de fond mise à jour !');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

// Cinema close
document.getElementById('cinemaOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget || e.target.id === 'cinemaClose') closeCinema();
});

// Form draft autosave
document.getElementById('mediaForm').addEventListener('input', () => {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(saveDraft, 600);
});

// Palette de thèmes prédéfinis
const THEME_PRESETS = [
  { name: 'Violet', color: '#7c3aed' },
  { name: 'Bleu', color: '#2563eb' },
  { name: 'Rouge cinéma', color: '#dc2626' },
  { name: 'Vert', color: '#059669' },
  { name: 'Or', color: '#d97706' },
  { name: 'Rose', color: '#e11d48' },
  { name: 'Cyan', color: '#0891b2' },
  { name: 'Orange', color: '#ea580c' },
];
const swatchContainer = document.getElementById('paletteSwatches');
if (swatchContainer) {
  swatchContainer.innerHTML = THEME_PRESETS.map(p =>
    `<button class="palette-swatch" style="background:${p.color}" title="${p.name}" onclick="applyAccent('${p.color}'); document.getElementById('themePalette').classList.add('hidden')"></button>`
  ).join('');
}
document.getElementById('accentBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('themePalette')?.classList.toggle('hidden');
});
document.getElementById('paletteCustomBtn')?.addEventListener('click', () => document.getElementById('accentPicker')?.click());
document.getElementById('accentPicker')?.addEventListener('input', e => applyAccent(e.target.value));
document.addEventListener('click', () => document.getElementById('themePalette')?.classList.add('hidden'));

// Trailer overlay
document.getElementById('trailerClose')?.addEventListener('click', closeTrailer);
document.getElementById('trailerOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeTrailer();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('trailerOverlay')?.classList.contains('hidden')) closeTrailer();
});

// Théâtre / Ambiance / Wrapped / History / Journal / Claude
document.getElementById('theatreBtn')?.addEventListener('click', toggleTheatre);
document.getElementById('ambianceBtn')?.addEventListener('click', toggleAmbiance);
document.getElementById('wrappedBtn')?.addEventListener('click', openWrapped);
document.getElementById('historyBtn')?.addEventListener('click', toggleHistoryPanel);
document.getElementById('historyClose')?.addEventListener('click', () => document.getElementById('historyPanel').classList.add('hidden'));
document.getElementById('historyClearBtn')?.addEventListener('click', () => {
  if (!confirm('Vider tout l\'historique des actions ?')) return;
  actionHistory = [];
  saveHistory();
  renderHistory();
  showToast('🗑️ Historique effacé');
});
document.getElementById('journalSaveBtn')?.addEventListener('click', saveJournalEntry);
document.getElementById('journalMoods')?.addEventListener('click', e => {
  const btn = e.target.closest('.mood-btn');
  if (!btn) return;
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  journalMood = btn.dataset.mood;
});
document.getElementById('claudeSummarizeBtn')?.addEventListener('click', claudeSummarize);
document.getElementById('claudeKeySave')?.addEventListener('click', () => {
  const val = document.getElementById('claudeKeyInput')?.value.trim();
  if (!val) return;
  localStorage.setItem('lumera_claude_key', val);
  document.getElementById('claudeKeyRow')?.classList.add('hidden');
  showToast('Clé Claude enregistrée ✓');
  claudeSummarize();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && isTheatreMode) toggleTheatre(); });

// Lettres Lumèra animées
(function() {
  const bn = document.querySelector('.brand-name');
  if (!bn) return;
  bn.innerHTML = [...bn.textContent].map((c,i) =>
    c === 'è' ? `<span class="brand-letter" style="animation-delay:${i*0.06}s">è</span>` :
    c.trim() ? `<span class="brand-letter" style="animation-delay:${i*0.06}s">${c}</span>` : c
  ).join('');
})();

// TMDB
document.getElementById('tmdbSearchBtn')?.addEventListener('click', tmdbSearch);
document.getElementById('fTitle')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tmdbSearch(); } });
document.getElementById('tmdbKeySave')?.addEventListener('click', () => {
  const val = document.getElementById('tmdbKeyInput').value.trim();
  if (!val) return;
  const api = document.getElementById('tmdbKeyRow').dataset.api || 'tmdb';
  localStorage.setItem(api === 'rawg' ? 'lumera_rawg_key' : 'lumera_tmdb_key', val);
  document.getElementById('tmdbKeyRow').classList.add('hidden');
  document.getElementById('tmdbKeyInput').value = '';
  showToast(`Clé ${api.toUpperCase()} enregistrée ✓`);
  if (api === 'rawg') rawgSearch(); else tmdbSearch();
});
// Met à jour le label du bouton quand on change de type
document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', updateSearchBtnLabel);
});

// ── LISTE EVENTS ──────────────────────────────────────────────────────────
// Couleurs de la palette de création
const listColorSwatches = document.getElementById('listColorSwatches');
if (listColorSwatches) {
  listColorSwatches.innerHTML = LIST_COLORS.map(c =>
    `<button class="list-color-swatch${c === selectedListColor ? ' active' : ''}" style="background:${c}" data-color="${c}"></button>`
  ).join('');
  listColorSwatches.addEventListener('click', e => {
    const btn = e.target.closest('.list-color-swatch');
    if (!btn) return;
    selectedListColor = btn.dataset.color;
    listColorSwatches.querySelectorAll('.list-color-swatch').forEach(b => b.classList.toggle('active', b.dataset.color === selectedListColor));
  });
}
document.getElementById('createListBtn')?.addEventListener('click', () => {
  document.getElementById('createListForm').classList.remove('hidden');
  document.getElementById('listNameInput').focus();
});
document.getElementById('cancelCreateList')?.addEventListener('click', () => {
  document.getElementById('createListForm').classList.add('hidden');
  document.getElementById('listNameInput').value = '';
});
document.getElementById('confirmCreateList')?.addEventListener('click', () => {
  const name = document.getElementById('listNameInput').value.trim();
  if (!name) { showToast('Donne un nom à ta liste', 'error'); return; }
  customLists.push({ id: Date.now().toString(), name, color: selectedListColor, items: [] });
  saveLists();
  document.getElementById('createListForm').classList.add('hidden');
  document.getElementById('listNameInput').value = '';
  renderLists();
  showToast(`Liste "${name}" créée ✓`);
});
document.getElementById('backToLists')?.addEventListener('click', () => {
  activeListId = null; renderLists();
});
document.getElementById('closeListPicker')?.addEventListener('click', () => {
  document.getElementById('listPickerOverlay').classList.add('hidden');
});
document.getElementById('listPickerOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('listPickerOverlay').classList.add('hidden');
});
document.getElementById('modalOverlay')?.addEventListener('click', () => {
  document.getElementById('tmdbResults')?.classList.add('hidden');
});

// Rankings tabs
document.querySelectorAll('.crank-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    activeRankTab = btn.dataset.rank;
    renderRankings();
  });
});
document.getElementById('closeRankPicker')?.addEventListener('click', () => {
  document.getElementById('rankPickerOverlay').classList.add('hidden');
});
document.getElementById('rankPickerOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('rankPickerOverlay').classList.add('hidden');
});
document.getElementById('rankPickerSearch')?.addEventListener('input', e => {
  renderRankPickerList(e.target.value);
});

// ── CINEMA MODE ────────────────────────────────────────────────────────────
function openCinema(id) {
  const item = library.find(m => m.id === id);
  if (!item) return;
  closeDetail();

  const overlay = document.getElementById('cinemaOverlay');
  const bgStyle = item.poster ? `style="background-image:url('${item.poster}')"` : '';
  const ratingDisplay = item.rating
    ? `<div class="cinema-rating">★ ${item.rating}<span>/10</span></div><div class="cinema-stars">${starsHtml(item.rating, '1.6rem')}</div>`
    : '<div class="cinema-unrated">Non noté</div>';
  const genres = item.genres ? item.genres.split(',').map(g => `<span class="cinema-genre-tag">${g.trim()}</span>`).join('') : '';
  const posterDisplay = item.poster
    ? `<img class="cinema-poster" src="${item.poster}" alt="${item.title}" />`
    : `<div class="cinema-poster-placeholder">${typeEmoji(item.type)}</div>`;
  const reviewDisplay = item.review
    ? `<blockquote class="cinema-review">"${item.review}"</blockquote>` : '';
  const synopsisDisplay = item.synopsis
    ? `<p class="cinema-synopsis">${item.synopsis}</p>` : '';

  overlay.innerHTML = `
    <div class="cinema-bg" ${bgStyle}></div>
    <button class="cinema-close" id="cinemaClose">✕</button>
    <div class="cinema-content">
      ${posterDisplay}
      <div class="cinema-info">
        <div class="cinema-badges">${typeBadge(item.type)}${statusBadge(item.status, item.type)}${item.favorite ? '<span class="cinema-fav">⭐</span>' : ''}</div>
        <h2 class="cinema-title">${item.title}</h2>
        ${item.year ? `<div class="cinema-year">${item.year}</div>` : ''}
        ${genres ? `<div class="cinema-genres">${genres}</div>` : ''}
        ${ratingDisplay}
        ${synopsisDisplay}
        ${reviewDisplay}
      </div>
    </div>
  `;
  overlay.classList.remove('hidden');
  document.getElementById('cinemaClose').addEventListener('click', closeCinema);
}

function closeCinema() {
  document.getElementById('cinemaOverlay').classList.add('hidden');
}
window.openCinema = openCinema;

// ESC also closes cinema
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('cinemaOverlay').classList.contains('hidden')) closeCinema();
}, { capture: true });

// ── DEMO DATA ─────────────────────────────────────────────────────────────
function seedDemoData() {
  // Si la clé existe déjà (même vide []), ne jamais re-seeder
  if (localStorage.getItem('lumera_library') !== null) return;
  const demo = [
    { title: 'Inception', type: 'movie', status: 'watched', year: 2010, genres: 'Science-fiction, Thriller', rating: 9, review: "Un chef-d'œuvre de Christopher Nolan. Les niveaux de rêve sont fascinants.", favorite: true, poster: '' },
    { title: 'Attack on Titan', type: 'anime', status: 'watched', year: 2013, genres: 'Action, Fantasy, Drame', rating: 10, review: "L'animé le plus épique que j'ai vu.", favorite: true, poster: '', season: 4, epCurrent: 87, epTotal: 87 },
    { title: 'Breaking Bad', type: 'series', status: 'watched', year: 2008, genres: 'Drame, Crime, Thriller', rating: 10, review: "La meilleure série de tous les temps.", favorite: true, poster: '', season: 5, epCurrent: 62, epTotal: 62 },
    { title: 'Interstellar', type: 'movie', status: 'watched', year: 2014, genres: 'Science-fiction, Drame', rating: 9, review: 'Magnifique voyage dans l\'espace et dans le temps.', favorite: false, poster: '' },
    { title: 'Demon Slayer', type: 'anime', status: 'watching', year: 2019, genres: 'Action, Fantasy', rating: 8, review: '', favorite: false, poster: '', season: 3, epCurrent: 7, epTotal: 11 },
    { title: 'The Last of Us', type: 'series', status: 'watched', year: 2023, genres: 'Drame, Horreur, Aventure', rating: 9, review: 'Adaptation parfaite du jeu vidéo. Pedro Pascal est exceptionnel.', favorite: false, poster: '', season: 1, epCurrent: 9, epTotal: 9 },
    { title: 'Dune: Part Two', type: 'movie', status: 'watchlist', year: 2024, genres: 'Science-fiction, Épopée', rating: null, review: '', favorite: false, poster: '' },
    { title: 'One Piece', type: 'anime', status: 'watchlist', year: 1999, genres: 'Action, Aventure, Comédie', rating: null, review: '', favorite: false, poster: '' },
  ];
  library = demo.map(d => ({ ...d, id: uid(), dateAdded: Date.now() - Math.random() * 1e10 }));
  save();
}

// ── INIT ──────────────────────────────────────────────────────────────────
seedDemoData();
applyTheme();
applyHeroBg();
const savedAccent = localStorage.getItem('lumera_accent');
if (savedAccent) applyAccent(savedAccent);
renderHome();
updateMiniWidget();

// ── SCROLL REVEAL ─────────────────────────────────────────────────────────
const revealObs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); } });
}, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });

new MutationObserver(muts => {
  muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    const sel = '.stat-card, .chart-card, .section-block, .rank-section, .list-card, .home-rank-col';
    const targets = n.matches?.(sel) ? [n] : [...(n.querySelectorAll?.(sel) || [])];
    targets.forEach(t => { if (!t.classList.contains('reveal')) { t.classList.add('reveal'); revealObs.observe(t); } });
  }));
}).observe(document.getElementById('page-home')?.closest('.main-content') || document.body, { childList: true, subtree: true });

// ── 3D TILT CARTES ────────────────────────────────────────────────────────
let _tiltCard = null;
document.addEventListener('mousemove', e => {
  const card = e.target.closest?.('.media-card');
  if (_tiltCard && _tiltCard !== card) { _tiltCard.style.transform = ''; _tiltCard = null; }
  if (!card) return;
  _tiltCard = card;
  const r = card.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  card.style.transform = `translateY(-7px) perspective(700px) rotateX(${(-y * 9).toFixed(1)}deg) rotateY(${(x * 9).toFixed(1)}deg) scale(1.02)`;
});
document.addEventListener('mouseleave', e => {
  if (_tiltCard) { _tiltCard.style.transform = ''; _tiltCard = null; }
}, true);

// ── INDICATEUR DE SCROLL ─────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  const pct = window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const prog = document.getElementById('scrollProgress');
  if (prog) prog.style.height = Math.round(pct * 100) + '%';
}, { passive: true });

// Hero aura animée
(function() {
  const hero = document.querySelector('.hero');
  if (hero) {
    const aura = document.createElement('div');
    aura.className = 'hero-aura';
    hero.insertBefore(aura, hero.firstChild);
  }
})();

// Curseur custom (desktop uniquement)
(function() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  const dot = document.createElement('div'); dot.className = 'cursor-dot';
  const ring = document.createElement('div'); ring.className = 'cursor-ring';
  document.body.appendChild(dot); document.body.appendChild(ring);
  let mx = -200, my = -200, rx = -200, ry = -200;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px'; dot.style.top = my + 'px';
  });
  (function animRing() {
    rx += (mx - rx) * 0.12; ry += (my - ry) * 0.12;
    ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
    requestAnimationFrame(animRing);
  })();
  document.addEventListener('mouseover', e => {
    const interactive = e.target.closest('button,a,.media-card,input,select,textarea,[onclick],label,.rank-item,.tmdb-result-item');
    document.body.classList.toggle('cursor-hover', !!interactive);
  });
})();

// Parallax poster cinéma
document.getElementById('cinemaOverlay')?.addEventListener('mousemove', e => {
  const bg = document.querySelector('#cinemaOverlay .cinema-bg');
  if (!bg) return;
  const r = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - r.width / 2) / r.width) * 14;
  const y = ((e.clientY - r.height / 2) / r.height) * 9;
  bg.style.transform = `scale(1.1) translate(${x}px, ${y}px)`;
});
document.getElementById('cinemaOverlay')?.addEventListener('mouseleave', () => {
  const bg = document.querySelector('#cinemaOverlay .cinema-bg');
  if (bg) bg.style.transform = 'scale(1.1)';
});

// ── PWA SERVICE WORKER ────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ══════════════════════════════════════════════════════════════════════════
// NOUVELLES FEATURES DESIGN
// ══════════════════════════════════════════════════════════════════════════

// BRAND CLICK → HOME
document.querySelector('.nav-brand')?.addEventListener('click', () => showPage('home'));

// D. BURST PARTICULES FAVORI ───────────────────────────────────────────────
function burstFavParticles(cx, cy) {
  const colors = ['#fbbf24','#f472b6','#7c3aed','#34d399','#60a5fa','#fb923c','#fff'];
  const count = 22;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'burst-particle';
    const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.5;
    const dist  = 45 + Math.random() * 65;
    const size  = 5 + Math.random() * 8;
    p.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${colors[i % colors.length]};--bx:${(Math.cos(angle)*dist).toFixed(1)}px;--by:${(Math.sin(angle)*dist).toFixed(1)}px;animation-delay:${(Math.random()*0.08).toFixed(2)}s`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

// B. CURSOR TRAIL ──────────────────────────────────────────────────────────
(function() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  let lastTrail = 0;
  document.addEventListener('mousemove', e => {
    const now = Date.now();
    if (now - lastTrail < 45) return;
    lastTrail = now;
    const p = document.createElement('div');
    p.className = 'cursor-trail';
    const size = 4 + Math.random() * 6;
    p.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--ts:${size}px;width:${size}px;height:${size}px`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 580);
  });
})();

// F. MAGNETIC REPULSION ────────────────────────────────────────────────────
(function() {
  let _magRaf = null;
  function applyMag(e) {
    cancelAnimationFrame(_magRaf);
    _magRaf = requestAnimationFrame(() => {
      const hovered = e.target.closest?.('.media-card');
      document.querySelectorAll('.media-card.mag-push').forEach(c => { c.style.transform = ''; c.classList.remove('mag-push'); });
      if (!hovered) return;
      const hr = hovered.getBoundingClientRect();
      const hx = hr.left + hr.width / 2, hy = hr.top + hr.height / 2;
      document.querySelectorAll('.media-card').forEach(c => {
        if (c === hovered) return;
        const cr = c.getBoundingClientRect();
        const dx = (cr.left + cr.width/2) - hx;
        const dy = (cr.top + cr.height/2) - hy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 0 && dist < 230) {
          const f = (1 - dist/230) * 11;
          c.classList.add('mag-push');
          c.style.transform = `scale(0.97) translate(${((dx/dist)*f).toFixed(1)}px,${((dy/dist)*f).toFixed(1)}px)`;
        }
      });
    });
  }
  document.addEventListener('mousemove', applyMag);
  document.addEventListener('mouseleave', () => { document.querySelectorAll('.media-card.mag-push').forEach(c => { c.style.transform=''; c.classList.remove('mag-push'); }); });
})();

// H. PREVIEW POPUP ─────────────────────────────────────────────────────────
(function() {
  const popup = document.createElement('div');
  popup.id = 'cardPreview';
  document.body.appendChild(popup);
  let _pt = null;

  document.addEventListener('mouseover', e => {
    const card = e.target.closest('.media-card');
    clearTimeout(_pt);
    if (!card) { popup.classList.remove('visible'); return; }
    _pt = setTimeout(() => {
      const item = library.find(m => m.id === card.dataset.id);
      if (!item || (!item.synopsis && !item.review)) return;
      const text = item.synopsis || item.review;
      popup.innerHTML = `
        <div class="preview-title">${item.title}</div>
        <div class="preview-meta">${item.year ? item.year+' · ' : ''}${typeEmoji(item.type)}${item.rating ? ' · ★ '+item.rating : ''}</div>
        <div class="preview-synopsis">${text.slice(0,160)}${text.length>160?'…':''}</div>
      `;
      const r = card.getBoundingClientRect();
      let lx = r.right + 14, ly = r.top;
      if (lx + 250 > window.innerWidth) lx = r.left - 254;
      popup.style.left = Math.max(8, lx) + 'px';
      popup.style.top  = Math.max(8, Math.min(ly, window.innerHeight - 210)) + 'px';
      popup.classList.add('visible');
    }, 760);
  });
  document.addEventListener('mouseout', e => {
    if (!e.relatedTarget?.closest?.('.media-card')) { clearTimeout(_pt); popup.classList.remove('visible'); }
  });
})();

// J. GRAIN CINÉMATIQUE ─────────────────────────────────────────────────────
(function() {
  const grain = document.createElement('div');
  grain.className = 'grain-overlay';
  document.body.appendChild(grain);
})();

// K. SPOTLIGHT SOURIS ──────────────────────────────────────────────────────
(function() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  const spot = document.createElement('div');
  spot.id = 'mouseSpotlight';
  document.body.appendChild(spot);
  let _sRaf = null;
  document.addEventListener('mousemove', e => {
    cancelAnimationFrame(_sRaf);
    _sRaf = requestAnimationFrame(() => {
      if (!isDark) { spot.style.background = ''; return; }
      const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const [r,g,b] = hexToRgb(hex.length === 7 ? hex : '#7c3aed');
      spot.style.background = `radial-gradient(circle 380px at ${e.clientX}px ${e.clientY}px, rgba(${r},${g},${b},0.07) 0%, transparent 70%)`;
    });
  });
})();

/* ═══════════════════════════════════════════════════════════════════════════
   BATCH 3 — FEATURES A → M
═══════════════════════════════════════════════════════════════════════════ */

// ── A. SHORTCUTS PANEL ─────────────────────────────────────────────────────
(function() {
  function openShortcuts() { document.getElementById('shortcutsOverlay')?.classList.remove('hidden'); }
  function closeShortcuts() { document.getElementById('shortcutsOverlay')?.classList.add('hidden'); }
  document.getElementById('shortcutsBtn')?.addEventListener('click', openShortcuts);
  document.getElementById('shortcutsClose')?.addEventListener('click', closeShortcuts);
  document.getElementById('shortcutsOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeShortcuts(); });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    const key = e.key.toLowerCase();
    if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
    if (key === 'escape') { closeShortcuts(); return; }
    if (key === 'a') { e.preventDefault(); openAddModal(); return; }
    if (key === 'h') { showPage('home'); return; }
    if (key === 'l') { showPage('library'); return; }
    if (key === 'w') { showPage('watchlist'); return; }
    if (key === 's') { showPage('stats'); return; }
    if (key === 't') { openTimeline(); return; }
    if (key === 'c') { openCompare(); return; }
    if (key === 'm') { toggleLetterbox(); return; }
  });
})();

// ── B. TIMELINE ────────────────────────────────────────────────────────────
function openTimeline() {
  const overlay = document.getElementById('timelineOverlay');
  const content = document.getElementById('timelineContent');
  if (!overlay || !content) return;

  // Build items with dates — use watchDate string or dateAdded timestamp
  const items = library
    .filter(m => m.status === 'watched' || m.status === 'watching')
    .map(m => {
      let ts = m.dateAdded;
      if (m.watchDate) {
        const parsed = new Date(m.watchDate);
        if (!isNaN(parsed)) ts = parsed.getTime();
      }
      return { ...m, _ts: ts };
    })
    .sort((a, b) => b._ts - a._ts);

  if (items.length === 0) {
    content.innerHTML = '<div class="timeline-empty">📅 Aucun titre visionné pour l\'instant.</div>';
    overlay.classList.remove('hidden');
    return;
  }

  // Group by year → month
  const grouped = {};
  items.forEach(m => {
    const d = new Date(m._ts);
    const yr = d.getFullYear();
    const mo = d.toLocaleDateString('fr-FR', { month: 'long' });
    const moKey = `${yr}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!grouped[yr]) grouped[yr] = {};
    if (!grouped[yr][moKey]) grouped[yr][moKey] = { label: mo.charAt(0).toUpperCase() + mo.slice(1), items: [] };
    grouped[yr][moKey].items.push(m);
  });

  let html = '';
  Object.keys(grouped).sort((a,b) => b-a).forEach(yr => {
    html += `<div class="timeline-year">${yr}</div>`;
    Object.keys(grouped[yr]).sort((a,b) => b.localeCompare(a)).forEach(moKey => {
      const mo = grouped[yr][moKey];
      html += `<div class="timeline-month-label">${mo.label}</div>`;
      mo.items.forEach(m => {
        const posterEl = m.poster
          ? `<img class="timeline-poster" src="${m.poster}" onerror="this.style.display='none'" />`
          : `<div class="timeline-poster-ph" style="background:${titleGradient(m.title)}">${typeEmoji(m.type)}</div>`;
        const stars = m.rating ? `★ ${m.rating}` : '';
        html += `<div class="timeline-item" data-id="${m.id}">
          ${posterEl}
          <div class="timeline-info">
            <div class="timeline-title">${m.title}</div>
            <div class="timeline-meta">${typeEmoji(m.type)} ${m.year || ''} ${m.genres ? '· ' + m.genres.split(',')[0].trim() : ''}</div>
          </div>
          <div class="timeline-stars">${stars}</div>
        </div>`;
      });
    });
  });
  content.innerHTML = html;
  content.querySelectorAll('.timeline-item').forEach(el => {
    el.addEventListener('click', () => { overlay.classList.add('hidden'); openDetail(el.dataset.id); });
  });
  overlay.classList.remove('hidden');
}
window.openTimeline = openTimeline;

document.getElementById('timelineBtn')?.addEventListener('click', openTimeline);
document.getElementById('timelineClose')?.addEventListener('click', () => document.getElementById('timelineOverlay')?.classList.add('hidden'));
document.getElementById('timelineOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

// ── C. MODE COMPARAISON ────────────────────────────────────────────────────
(function() {
  let selA = null, selB = null;

  function openCompare() {
    selA = null; selB = null;
    document.getElementById('compareSearchA').value = '';
    document.getElementById('compareSearchB').value = '';
    document.getElementById('compareCardA').innerHTML = '<div class="compare-empty">Choisir un titre →</div>';
    document.getElementById('compareCardB').innerHTML = '<div class="compare-empty">← Choisir un titre</div>';
    document.getElementById('compareTable').innerHTML = '';
    document.getElementById('compareOverlay')?.classList.remove('hidden');
  }
  window.openCompare = openCompare;

  function buildResults(query, resultsEl, side) {
    const q = query.toLowerCase().trim();
    if (!q) { resultsEl.classList.add('hidden'); return; }
    const matches = library.filter(m => m.title.toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) { resultsEl.classList.add('hidden'); return; }
    resultsEl.innerHTML = matches.map(m =>
      `<div class="compare-result-item" data-id="${m.id}">${typeEmoji(m.type)} ${m.title}${m.year ? ' ('+m.year+')' : ''}</div>`
    ).join('');
    resultsEl.classList.remove('hidden');
    resultsEl.querySelectorAll('.compare-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const item = library.find(m => m.id === el.dataset.id);
        if (!item) return;
        if (side === 'A') { selA = item; renderCompareCard('compareCardA', item); }
        else { selB = item; renderCompareCard('compareCardB', item); }
        resultsEl.classList.add('hidden');
        if (selA && selB) renderCompareTable();
      });
    });
  }

  function renderCompareCard(cardId, item) {
    const el = document.getElementById(cardId);
    if (!el) return;
    const posterEl = item.poster ? `<img class="compare-card-poster" src="${item.poster}" />` : '';
    el.innerHTML = `
      ${posterEl}
      <div class="compare-card-title">${item.title}</div>
      <div class="compare-card-meta">${typeEmoji(item.type)} ${item.year || '—'} · ${item.genres ? item.genres.split(',')[0].trim() : '—'}</div>
      <div class="compare-card-stars">${item.rating ? '★ ' + item.rating + '/10' : 'Non noté'}</div>
      ${item.synopsis ? `<p style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem;line-height:1.4">${item.synopsis.slice(0,120)}…</p>` : ''}
    `;
  }

  function renderCompareTable() {
    const table = document.getElementById('compareTable');
    if (!table || !selA || !selB) return;
    const rows = [
      { label: 'Note', a: selA.rating ? '★ '+selA.rating+'/10' : '—', b: selB.rating ? '★ '+selB.rating+'/10' : '—', win: selA.rating > selB.rating ? 'a' : selB.rating > selA.rating ? 'b' : '' },
      { label: 'Note TMDB', a: selA.tmdbRating ? selA.tmdbRating+'/10' : '—', b: selB.tmdbRating ? selB.tmdbRating+'/10' : '—', win: (selA.tmdbRating||0) > (selB.tmdbRating||0) ? 'a' : (selB.tmdbRating||0) > (selA.tmdbRating||0) ? 'b' : '' },
      { label: 'Année', a: selA.year || '—', b: selB.year || '—', win: '' },
      { label: 'Type', a: typeEmoji(selA.type)+' '+selA.type, b: typeEmoji(selB.type)+' '+selB.type, win: '' },
      { label: 'Statut', a: selA.status, b: selB.status, win: '' },
      { label: 'Coup de cœur', a: selA.favorite ? '⭐ Oui' : 'Non', b: selB.favorite ? '⭐ Oui' : 'Non', win: selA.favorite && !selB.favorite ? 'a' : !selA.favorite && selB.favorite ? 'b' : '' },
      { label: 'Genre(s)', a: selA.genres || '—', b: selB.genres || '—', win: '' },
    ];
    table.innerHTML = rows.map(r => `
      <div class="compare-row">
        <div class="compare-row-val ${r.win==='a'?'winner':''}">${r.a}</div>
        <div class="compare-row-label">${r.label}</div>
        <div class="compare-row-val ${r.win==='b'?'winner':''}" style="text-align:right">${r.b}</div>
      </div>
    `).join('');
  }

  document.getElementById('compareBtn')?.addEventListener('click', openCompare);
  document.getElementById('compareClose')?.addEventListener('click', () => document.getElementById('compareOverlay')?.classList.add('hidden'));
  document.getElementById('compareOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

  let _caTmo, _cbTmo;
  document.getElementById('compareSearchA')?.addEventListener('input', function() {
    clearTimeout(_caTmo);
    _caTmo = setTimeout(() => buildResults(this.value, document.getElementById('compareResultsA'), 'A'), 200);
  });
  document.getElementById('compareSearchB')?.addEventListener('input', function() {
    clearTimeout(_cbTmo);
    _cbTmo = setTimeout(() => buildResults(this.value, document.getElementById('compareResultsB'), 'B'), 200);
  });
})();

// ── D. TAGS — input live preview ───────────────────────────────────────────
document.getElementById('fTags')?.addEventListener('input', renderTagsPreview);

// Mood filter buttons
document.querySelectorAll('.mood-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    window._activeMood = btn.dataset.mood;
    document.querySelectorAll('.mood-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderLibrary();
  });
});

// ── E. ACHIEVEMENTS ────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first',      icon: '🎬', name: 'Premier titre',      desc: 'Ajouter ton premier titre',              check: l => l.length >= 1 },
  { id: 'ten',        icon: '📚', name: 'Cinéphile',          desc: 'Avoir 10 titres dans la bibliothèque',    check: l => l.filter(m=>m.status!=='watchlist').length >= 10 },
  { id: 'fifty',      icon: '🏛️', name: 'Cinémathèque',       desc: '50 titres vus',                           check: l => l.filter(m=>m.status==='watched').length >= 50 },
  { id: 'fav5',       icon: '⭐', name: 'Fan absolu',         desc: '5 coups de cœur',                        check: l => l.filter(m=>m.favorite).length >= 5 },
  { id: 'perfect',    icon: '💯', name: 'Chef-d\'œuvre',      desc: 'Donner une note de 10/10',                check: l => l.some(m=>m.rating===10) },
  { id: 'alltype',    icon: '🌐', name: 'Omnivore',           desc: 'Avoir film, série, animé et jeu',         check: l => ['movie','series','anime','game'].every(t=>l.some(m=>m.type===t)) },
  { id: 'review10',   icon: '✍️', name: 'Critique',           desc: 'Écrire 10 critiques',                    check: l => l.filter(m=>m.review&&m.review.length>20).length >= 10 },
  { id: 'game5',      icon: '🎮', name: 'Gamer',              desc: '5 jeux vidéo ajoutés',                   check: l => l.filter(m=>m.type==='game').length >= 5 },
  { id: 'anime10',    icon: '✨', name: 'Otaku',              desc: '10 animés dans la bibliothèque',          check: l => l.filter(m=>m.type==='anime').length >= 10 },
  { id: 'dropper',    icon: '🚪', name: 'Sans pitié',         desc: 'Abandonner un titre',                    check: l => l.some(m=>m.status==='dropped') },
  { id: 'marathon',   icon: '🏃', name: 'Marathon',           desc: 'Regarder 5 titres le même jour',         check: l => { const d={}; l.forEach(m=>{if(m.dateAdded){const k=new Date(m.dateAdded).toDateString();d[k]=(d[k]||0)+1;}}); return Object.values(d).some(v=>v>=5); } },
  { id: 'highavg',    icon: '📈', name: 'Exigeant',           desc: 'Moyenne de note ≥ 8',                    check: l => { const r=l.filter(m=>m.rating); return r.length>=5&&(r.reduce((s,m)=>s+m.rating,0)/r.length)>=8; } },
  { id: 'journal5',   icon: '📔', name: 'Chroniqueur',        desc: '5 entrées dans le journal',              check: () => JSON.parse(localStorage.getItem('lumera_journal')||'[]').length >= 5 },
  { id: 'list3',      icon: '📁', name: 'Organisé',           desc: 'Créer 3 listes personnalisées',          check: () => JSON.parse(localStorage.getItem('lumera_lists')||'[]').length >= 3 },
  { id: 'century',    icon: '🔱', name: 'Légendaire',         desc: '100 titres dans la bibliothèque',        check: l => l.length >= 100 },
];

function getUnlockedAchievements() {
  return ACHIEVEMENTS.filter(a => { try { return a.check(library); } catch { return false; } });
}

function openAchievements() {
  const overlay = document.getElementById('achievementsOverlay');
  const grid = document.getElementById('achievementsGrid');
  const progressEl = document.getElementById('achievementsProgress');
  if (!overlay || !grid) return;

  const unlocked = getUnlockedAchievements();
  const pct = Math.round((unlocked.length / ACHIEVEMENTS.length) * 100);

  if (progressEl) progressEl.innerHTML = `
    <div class="achievements-progress-label">${unlocked.length} / ${ACHIEVEMENTS.length} trophées débloqués</div>
    <div class="achievements-progress-bar-wrap"><div class="achievements-progress-bar" style="width:${pct}%"></div></div>
  `;

  grid.innerHTML = ACHIEVEMENTS.map(a => {
    const done = unlocked.some(u => u.id === a.id);
    return `<div class="achievement-card ${done ? 'unlocked' : ''}" title="${done ? '✅ Débloqué' : '🔒 Verrouillé'}">
      <div class="achievement-icon">${a.icon}</div>
      <div class="achievement-name">${a.name}</div>
      <div class="achievement-desc">${a.desc}</div>
    </div>`;
  }).join('');

  overlay.classList.remove('hidden');
}
window.openAchievements = openAchievements;

document.getElementById('achievementsBtn')?.addEventListener('click', openAchievements);
document.getElementById('achievementsClose')?.addEventListener('click', () => document.getElementById('achievementsOverlay')?.classList.add('hidden'));
document.getElementById('achievementsOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

// Achievement badge on button
function updateAchievementsBadge() {
  const btn = document.getElementById('achievementsBtn');
  if (!btn) return;
  const n = getUnlockedAchievements().length;
  let badge = btn.querySelector('.achievements-badge');
  if (n > 0) {
    if (!badge) { badge = document.createElement('span'); badge.className = 'achievements-badge'; btn.appendChild(badge); }
    badge.textContent = n;
  } else if (badge) badge.remove();
}

// ── F. BLOB HERO ──────────────────────────────────────────────────────────
(function() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const wrap = document.createElement('div');
  wrap.className = 'hero-blob-wrap';
  wrap.innerHTML = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <path fill="var(--accent)" d="M48,-67.2C60.9,-56.1,69.3,-40.7,73.2,-24.4C77.1,-8.1,76.5,9.1,70.6,24.1C64.7,39.2,53.4,52.1,39.5,61.2C25.6,70.3,9,75.5,-7.5,75.5C-24.1,75.5,-40.5,70.3,-52.7,60.4C-64.9,50.5,-73,35.9,-76.4,20C-79.8,4.2,-78.5,-12.9,-72.4,-28.1C-66.3,-43.3,-55.4,-56.5,-42.3,-67.3C-29.2,-78.1,-14.6,-86.6,1.5,-88.7C17.6,-90.8,35.2,-78.3,48,-67.2Z" transform="translate(100 100)">
      <animate attributeName="d" dur="9s" repeatCount="indefinite"
        values="M48,-67.2C60.9,-56.1,69.3,-40.7,73.2,-24.4C77.1,-8.1,76.5,9.1,70.6,24.1C64.7,39.2,53.4,52.1,39.5,61.2C25.6,70.3,9,75.5,-7.5,75.5C-24.1,75.5,-40.5,70.3,-52.7,60.4C-64.9,50.5,-73,35.9,-76.4,20C-79.8,4.2,-78.5,-12.9,-72.4,-28.1C-66.3,-43.3,-55.4,-56.5,-42.3,-67.3C-29.2,-78.1,-14.6,-86.6,1.5,-88.7C17.6,-90.8,35.2,-78.3,48,-67.2Z;
               M38,-54.5C48.8,-45.1,56.9,-33.4,61.7,-20.1C66.5,-6.7,68,8.3,63.4,21.4C58.8,34.6,48.1,45.8,35.3,53.8C22.5,61.8,7.5,66.5,-8.5,68C-24.5,69.6,-41.5,68,-53.8,59.3C-66.2,50.7,-73.8,34.9,-76.1,18.3C-78.4,1.7,-75.3,-15.7,-67.1,-29.6C-58.9,-43.5,-45.5,-53.9,-31.8,-62.6C-18.2,-71.3,-4.4,-78.4,7.4,-76.3C19.2,-74.2,27.3,-63.9,38,-54.5Z;
               M48,-67.2C60.9,-56.1,69.3,-40.7,73.2,-24.4C77.1,-8.1,76.5,9.1,70.6,24.1C64.7,39.2,53.4,52.1,39.5,61.2C25.6,70.3,9,75.5,-7.5,75.5C-24.1,75.5,-40.5,70.3,-52.7,60.4C-64.9,50.5,-73,35.9,-76.4,20C-79.8,4.2,-78.5,-12.9,-72.4,-28.1C-66.3,-43.3,-55.4,-56.5,-42.3,-67.3C-29.2,-78.1,-14.6,-86.6,1.5,-88.7C17.6,-90.8,35.2,-78.3,48,-67.2Z" />
    </path>
  </svg>`;
  hero.appendChild(wrap);
})();

// ── G. PROGRESS RINGS ─────────────────────────────────────────────────────
function makeProgressRing(current, total, size = 38, stroke = 3) {
  if (!total) return '';
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, current / total);
  const offset = circ * (1 - pct);
  const cx = size / 2;
  return `<span class="progress-ring-wrap">
    <svg class="progress-ring-svg" width="${size}" height="${size}">
      <circle class="progress-ring-bg" cx="${cx}" cy="${cx}" r="${r}" stroke-width="${stroke}" />
      <circle class="progress-ring-circle" cx="${cx}" cy="${cx}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" />
    </svg>
    <span style="font-size:0.72rem;color:var(--text-muted)">${current}/${total}</span>
  </span>`;
}
window.makeProgressRing = makeProgressRing;

// ── H. ANIMATED PAGE TITLE ─────────────────────────────────────────────────
function animatePageTitle(el) {
  if (!el) return;
  // Use textContent to get clean text (even if previously wrapped in spans)
  const text = el.textContent.trim();
  if (!text) return;
  el.innerHTML = text.split('').map((ch, i) => {
    if (ch === ' ') return ' ';
    return `<span class="page-title-letter" style="animation-delay:${(i * 0.04).toFixed(2)}s;animation-fill-mode:both">${ch}</span>`;
  }).join('');
  // After animation fully finishes, restore plain text to prevent scroll repaint issues
  const totalMs = text.length * 40 + 380;
  setTimeout(() => { if (el.isConnected) el.textContent = text; }, totalMs);
}

// ── I. FLOATING ADD BUTTON ─────────────────────────────────────────────────
document.getElementById('fabAdd')?.addEventListener('click', () => openAddModal());

// ── K. SHARE CARD ──────────────────────────────────────────────────────────
function openShareCard(itemId) {
  const item = library.find(m => m.id === itemId);
  if (!item) return;

  const overlay = document.getElementById('shareCardOverlay');
  const canvas = document.getElementById('shareCanvas');
  const img = document.getElementById('shareCardImg');
  const qrSection = document.getElementById('shareQrSection');
  if (!overlay || !canvas || !img) return;

  const ctx = canvas.getContext('2d');
  const W = 560, H = 300;
  canvas.width = W; canvas.height = H;

  // Draw background
  const accentHex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c3aed';
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0f0f1a');
  grad.addColorStop(1, '#1a0a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Accent stripe
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 5, H);

  // Draw text content
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(item.title.slice(0, 36) + (item.title.length > 36 ? '…' : ''), 24, 52);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '14px system-ui, sans-serif';
  const metaStr = `${typeEmoji(item.type)}  ${item.year || ''}  ${item.genres ? '· ' + item.genres.split(',')[0].trim() : ''}`;
  ctx.fillText(metaStr, 24, 78);

  if (item.rating) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(`★ ${item.rating}/10`, 24, 130);
  }

  if (item.synopsis) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '13px system-ui, sans-serif';
    const words = item.synopsis.split(' ');
    let line = '', y = item.rating ? 165 : 130;
    for (const word of words) {
      const test = line + (line ? ' ' : '') + word;
      if (ctx.measureText(test).width > W - 48 - (item.poster ? 120 : 0)) {
        ctx.fillText(line, 24, y); line = word; y += 20;
        if (y > H - 60) { ctx.fillText(line + '…', 24, y); break; }
      } else line = test;
      if (words.indexOf(word) === words.length - 1) ctx.fillText(line, 24, y);
    }
  }

  // Lumèra watermark
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('✨ Lumèra', W - 80, H - 18);

  // Status badge
  const statusMap = { watched: '✅ Vu', watching: '▶ En cours', dropped: '❌ Abandonné', watchlist: '🔖 Watchlist' };
  ctx.fillStyle = accentHex + 'aa';
  ctx.roundRect(24, H - 48, 110, 28, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(statusMap[item.status] || item.status, 32, H - 28);

  // Try to draw poster
  function finalize() {
    const dataUrl = canvas.toDataURL('image/png');
    img.src = dataUrl;
    img.style.display = 'block';

    // QR: encode item title as text
    if (qrSection) {
      const qrData = encodeURIComponent(`${item.title} (${item.year || ''}) — Lumèra · Note: ${item.rating || '?'}/10`);
      qrSection.innerHTML = `
        <img src="https://api.qrserver.com/v1/create-qr-code/?data=${qrData}&size=120x120&bgcolor=ffffff&color=000000" alt="QR Code" width="120" height="120" />
        <div class="qr-label">QR code — scanne pour partager</div>
      `;
    }

    document.getElementById('shareDownloadBtn').onclick = () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `lumera-${item.title.replace(/\s+/g,'-').toLowerCase()}.png`;
      a.click();
    };
    document.getElementById('shareCopyBtn').onclick = async () => {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('📋 Image copiée !');
      } catch { showToast('Navigateur non supporté', 'error'); }
    };
    overlay.classList.remove('hidden');
  }

  if (item.poster) {
    const pImg = new Image();
    pImg.crossOrigin = 'anonymous';
    pImg.onload = () => {
      try {
        ctx.save();
        const px = W - 110, py = 20, pw = 80, ph = H - 60;
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, 8);
        ctx.clip();
        ctx.drawImage(pImg, px, py, pw, ph);
        ctx.restore();
        // Gradient overlay on poster
        const pg = ctx.createLinearGradient(px, 0, px + pw, 0);
        pg.addColorStop(0, 'rgba(15,15,26,0.6)');
        pg.addColorStop(1, 'rgba(15,15,26,0)');
        ctx.fillStyle = pg;
        ctx.fillRect(px, py, pw, ph);
      } catch(e) {}
      finalize();
    };
    pImg.onerror = finalize;
    pImg.src = item.poster;
  } else finalize();
}
window.openShareCard = openShareCard;

document.getElementById('shareCardClose')?.addEventListener('click', () => document.getElementById('shareCardOverlay')?.classList.add('hidden'));
document.getElementById('shareCardOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

// ── M. LETTERBOX MODE ─────────────────────────────────────────────────────
let _letterboxMode = false;
let _letterboxExitBtn = null;

function toggleLetterbox() {
  _letterboxMode = !_letterboxMode;
  document.body.classList.toggle('letterbox-mode', _letterboxMode);
  const lBtn = document.getElementById('letterboxBtn');
  if (lBtn) lBtn.style.opacity = _letterboxMode ? '0.5' : '1';

  if (_letterboxMode) {
    if (!_letterboxExitBtn) {
      _letterboxExitBtn = document.createElement('button');
      _letterboxExitBtn.className = 'letterbox-exit';
      _letterboxExitBtn.textContent = '✕ Quitter letterbox';
      _letterboxExitBtn.addEventListener('click', toggleLetterbox);
      document.body.appendChild(_letterboxExitBtn);
    }
    _letterboxExitBtn.style.display = 'block';
    showToast('🎞️ Mode letterbox — M pour quitter');
  } else {
    if (_letterboxExitBtn) _letterboxExitBtn.style.display = 'none';
  }
}
window.toggleLetterbox = toggleLetterbox;
document.getElementById('letterboxBtn')?.addEventListener('click', toggleLetterbox);

// Polyfill roundRect for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    const rad = Math.min(r, w/2, h/2);
    this.beginPath();
    this.moveTo(x + rad, y);
    this.lineTo(x + w - rad, y); this.arcTo(x+w, y, x+w, y+rad, rad);
    this.lineTo(x + w, y + h - rad); this.arcTo(x+w, y+h, x+w-rad, y+h, rad);
    this.lineTo(x + rad, y + h); this.arcTo(x, y+h, x, y+h-rad, rad);
    this.lineTo(x, y + rad); this.arcTo(x, y, x+rad, y, rad);
    this.closePath();
    return this;
  };
}

// ── TOOLS PANEL ───────────────────────────────────────────────────────────
(function() {
  const panel   = document.getElementById('toolsPanel');
  const overlay = document.getElementById('toolsPanelOverlay');
  const toggle  = document.getElementById('toolsToggle');
  const close   = document.getElementById('toolsPanelClose');
  if (!panel) return;

  function openTools()  { panel.classList.add('open'); overlay?.classList.remove('hidden'); }
  function closeTools() { panel.classList.remove('open'); overlay?.classList.add('hidden'); }

  toggle?.addEventListener('click', () => panel.classList.contains('open') ? closeTools() : openTools());
  close?.addEventListener('click', closeTools);
  overlay?.addEventListener('click', closeTools);

  // Close tools panel when any tool button is activated
  panel.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => { setTimeout(closeTools, 120); });
  });
})();

// Initialize
window._activeTag = null;
window._activeMood = 'all';
updateAchievementsBadge();

/* ═══════════════════════════════════════════════════════════════════════════
   BATCH 4 — FEATURES A → M
═══════════════════════════════════════════════════════════════════════════ */

// ── A. POSTER WALL VIEW ───────────────────────────────────────────────────
let wallViewMode = false;
document.getElementById('wallViewBtn')?.addEventListener('click', () => {
  wallViewMode = !wallViewMode;
  document.getElementById('wallViewBtn').style.opacity = wallViewMode ? '1' : '0.5';
  document.getElementById('wallViewBtn').style.color = wallViewMode ? 'var(--accent)' : '';
  const grid = document.getElementById('libraryGrid');
  if (grid) {
    grid.classList.toggle('wall-view', wallViewMode);
    // In wall mode we need to re-render without flipping cards
    if (wallViewMode) {
      grid.querySelectorAll('.card-inner').forEach(ci => ci.classList.remove('flipped'));
    }
  }
});

// ── B. CARD TILT 3D ───────────────────────────────────────────────────────
(function() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  let _tiltRaf = null;
  document.addEventListener('mousemove', e => {
    cancelAnimationFrame(_tiltRaf);
    _tiltRaf = requestAnimationFrame(() => {
      const card = e.target.closest?.('.media-card');
      if (!card || wallViewMode) return;
      const r = card.getBoundingClientRect();
      const x = ((e.clientY - r.top)  / r.height - 0.5) * 14;
      const y = ((e.clientX - r.left) / r.width  - 0.5) * -14;
      card.style.transform = `perspective(700px) rotateX(${x}deg) rotateY(${y}deg) scale(1.03)`;
      card.classList.add('tilt-card');
    });
  });
  document.addEventListener('mouseleave', () => {
    document.querySelectorAll('.media-card.tilt-card').forEach(c => { c.style.transform = ''; c.classList.remove('tilt-card'); });
  });
  document.addEventListener('mouseout', e => {
    const card = e.target.closest?.('.media-card');
    if (card && !card.contains(e.relatedTarget)) { card.style.transform = ''; card.classList.remove('tilt-card'); }
  });
})();

// ── D. SEASONAL THEME ────────────────────────────────────────────────────
function applySeasonalTheme() {
  const m = new Date().getMonth(); // 0=Jan
  const season = m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
  document.body.classList.remove('season-spring','season-summer','season-autumn','season-winter');
  document.body.classList.add('season-' + season);
  const emojis = { spring:'🌸', summer:'☀️', autumn:'🍂', winter:'❄️' };
  const names  = { spring:'Printemps', summer:'Été', autumn:'Automne', winter:'Hiver' };
  const el = document.getElementById('weeklyReport');
  if (el && !el.dataset.seasonBadge) {
    const badge = document.createElement('div');
    badge.className = 'seasonal-badge';
    badge.textContent = `${emojis[season]} ${names[season]}`;
    el.prepend(badge);
    el.dataset.seasonBadge = '1';
  }
}

// ── E + F. STATS EXTRA: TEMPORAL CURVE + RADAR ───────────────────────────
function renderStatsExtra() {
  const el = document.getElementById('statsExtra');
  if (!el) return;
  el.innerHTML = '';

  // ── E. Temporal curve — avg rating by month ─────────────
  const monthlyRatings = {};
  library.filter(m => m.rating && m.dateAdded).forEach(m => {
    const d = new Date(m.dateAdded);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!monthlyRatings[key]) monthlyRatings[key] = [];
    monthlyRatings[key].push(m.rating);
  });
  const months = Object.keys(monthlyRatings).sort().slice(-12);
  if (months.length >= 2) {
    const avgs = months.map(k => monthlyRatings[k].reduce((s,v) => s+v,0) / monthlyRatings[k].length);
    const W = 560, H = 110, pad = 18;
    const maxV = Math.max(...avgs, 10), minV = Math.max(0, Math.min(...avgs) - 1);
    const pts = avgs.map((v, i) => {
      const x = pad + (i / (avgs.length - 1)) * (W - pad * 2);
      const y = H - pad - ((v - minV) / (maxV - minV)) * (H - pad * 2);
      return [x, y];
    });
    const polyline = pts.map(p => p.join(',')).join(' ');
    const areaPath = `M${pts[0][0]},${H} ` + pts.map(p => `L${p[0]},${p[1]}`).join(' ') + ` L${pts[pts.length-1][0]},${H} Z`;
    const labels = months.map(k => k.slice(5)).join(',');
    el.insertAdjacentHTML('beforeend', `
      <div class="chart-card-curve">
        <h3>📈 Évolution de mes notes</h3>
        <svg class="curve-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.5"/>
              <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path class="curve-area" d="${areaPath}"/>
          <polyline class="curve-line" points="${polyline}"/>
          ${pts.map((p,i) => `<circle class="curve-dot" cx="${p[0]}" cy="${p[1]}" r="3.5"><title>${avgs[i].toFixed(1)}/10 (${months[i]})</title></circle>`).join('')}
        </svg>
        <div class="curve-x-labels">${months.map(k => `<span class="curve-x-label">${k.slice(5)}</span>`).join('')}</div>
      </div>`);
  }

  // ── F. Radar chart genres ────────────────────────────────
  const byGenre = {};
  library.forEach(m => {
    if (m.genres) m.genres.split(',').forEach(g => { const t=g.trim(); if(t) byGenre[t]=(byGenre[t]||0)+1; });
  });
  const topG = Object.entries(byGenre).sort((a,b) => b[1]-a[1]).slice(0, 6);
  if (topG.length >= 3) {
    const cx=140, cy=110, maxR=90;
    const maxVal = topG[0][1];
    const N = topG.length;
    const angleStep = (Math.PI * 2) / N;
    const bgLines = [0.25, 0.5, 0.75, 1].map(ratio => {
      const pts = topG.map((_, i) => {
        const a = i * angleStep - Math.PI / 2;
        return `${(cx + Math.cos(a) * maxR * ratio).toFixed(1)},${(cy + Math.sin(a) * maxR * ratio).toFixed(1)}`;
      }).join(' ');
      return `<polygon class="radar-bg-line" points="${pts}" />`;
    }).join('');
    const radarPts = topG.map(([,v], i) => {
      const a = i * angleStep - Math.PI / 2;
      const r = (v / maxVal) * maxR;
      return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
    }).join(' ');
    const labelEls = topG.map(([name], i) => {
      const a = i * angleStep - Math.PI / 2;
      const lx = (cx + Math.cos(a) * (maxR + 14)).toFixed(1);
      const ly = (cy + Math.sin(a) * (maxR + 14)).toFixed(1);
      return `<text class="radar-label" x="${lx}" y="${ly}" dy="3">${name.slice(0,12)}</text>`;
    }).join('');
    el.insertAdjacentHTML('beforeend', `
      <div class="chart-card-curve">
        <h3>🕸️ Radar de mes genres</h3>
        <svg class="radar-svg" viewBox="0 0 280 220" xmlns="http://www.w3.org/2000/svg">
          ${bgLines}
          <polygon class="radar-area" points="${radarPts}"/>
          ${labelEls}
        </svg>
      </div>`);
  }
}

// ── G. WEEKLY REPORT ─────────────────────────────────────────────────────
function renderWeeklyReport() {
  const el = document.getElementById('weeklyReport');
  if (!el) return;

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = library.filter(m => m.dateAdded >= weekAgo);
  if (thisWeek.length === 0) { el.innerHTML = ''; return; }

  const watched = thisWeek.filter(m => m.status === 'watched').length;
  const rated = thisWeek.filter(m => m.rating);
  const avg = rated.length ? (rated.reduce((s,m) => s+m.rating,0)/rated.length).toFixed(1) : '—';
  const favs = thisWeek.filter(m => m.favorite).length;
  const newTypes = [...new Set(thisWeek.map(m => typeEmoji(m.type)))].join(' ');

  el.innerHTML = `
    <div class="weekly-report">
      <div style="flex:1;min-width:120px">
        <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:0.3rem">📅 Cette semaine</div>
        <div style="font-size:1rem;font-weight:600">${thisWeek.length} titre${thisWeek.length>1?'s':''} ajouté${thisWeek.length>1?'s':''} ${newTypes}</div>
      </div>
      <div class="weekly-report-chip"><div class="weekly-report-title">Vus</div><div class="weekly-report-val">${watched}</div></div>
      <div class="weekly-report-chip"><div class="weekly-report-title">Moy.</div><div class="weekly-report-val">${avg}</div></div>
      <div class="weekly-report-chip"><div class="weekly-report-title">⭐ Favs</div><div class="weekly-report-val">${favs}</div></div>
    </div>`;
}

// ── H. RANDOM PICKER ─────────────────────────────────────────────────────
(function() {
  let _pickerItem = null;
  function openPicker() {
    const wl = library.filter(m => m.status === 'watchlist');
    if (wl.length === 0) { showToast('Ta watchlist est vide 😅', 'error'); return; }
    document.getElementById('randomPickerOverlay')?.classList.remove('hidden');
    spinPicker(wl);
  }

  function spinPicker(wl) {
    const content = document.getElementById('randomPickerContent');
    const openBtn = document.getElementById('randomPickerOpen');
    if (!content) return;
    _pickerItem = null;
    if (openBtn) openBtn.style.display = 'none';

    // Spin animation
    let frame = 0;
    const totalFrames = 22;
    let spinTimer = setInterval(() => {
      const pick = wl[Math.floor(Math.random() * wl.length)];
      content.innerHTML = `<div class="random-picker-stage">
        <div class="random-picker-spinning">
          <div class="picker-spin-item">${typeEmoji(pick.type)} ${pick.title}</div>
        </div>
      </div>`;
      frame++;
      if (frame >= totalFrames) {
        clearInterval(spinTimer);
        _pickerItem = wl[Math.floor(Math.random() * wl.length)];
        const posterEl = _pickerItem.poster
          ? `<img class="random-picker-poster" src="${_pickerItem.poster}" onerror="this.style.display='none'" />`
          : `<div style="font-size:3rem;margin-bottom:0.7rem">${typeEmoji(_pickerItem.type)}</div>`;
        content.innerHTML = `<div class="random-picker-stage">
          ${posterEl}
          <div class="random-picker-title">${_pickerItem.title}</div>
          <div class="random-picker-meta">${typeEmoji(_pickerItem.type)} ${_pickerItem.year || ''}${_pickerItem.genres ? ' · '+_pickerItem.genres.split(',')[0].trim() : ''}</div>
        </div>`;
        if (openBtn) openBtn.style.display = 'inline-flex';
        setTimeout(launchConfetti, 200);
      }
    }, 80);
  }

  document.getElementById('randomPickerBtn')?.addEventListener('click', openPicker);
  document.getElementById('randomPickerSpin')?.addEventListener('click', () => {
    const wl = library.filter(m => m.status === 'watchlist');
    if (wl.length) spinPicker(wl);
  });
  document.getElementById('randomPickerOpen')?.addEventListener('click', () => {
    if (_pickerItem) { document.getElementById('randomPickerOverlay')?.classList.add('hidden'); openDetail(_pickerItem.id); }
  });
  document.getElementById('randomPickerClose')?.addEventListener('click', () => document.getElementById('randomPickerOverlay')?.classList.add('hidden'));
  document.getElementById('randomPickerOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });
})();

// ── I. BLIND TEST ─────────────────────────────────────────────────────────
(function() {
  let _btItem = null, _btScore = 0, _btTotal = 0, _btTimer = null, _btBlur = 20, _btRevealed = false;

  function startBlindTest() {
    const pool = library.filter(m => m.poster);
    if (pool.length < 3) { showToast('Besoin d\'au moins 3 titres avec posters 🎬', 'error'); return; }
    _btItem = pool[Math.floor(Math.random() * pool.length)];
    _btBlur = 20; _btRevealed = false;
    document.getElementById('blindTestInput').value = '';
    document.getElementById('blindTestResult').innerHTML = '';
    const content = document.getElementById('blindTestContent');
    if (content) {
      content.innerHTML = `
        <div class="blind-test-score">Score : ${_btScore} / ${_btTotal}</div>
        <div class="blind-test-poster-wrap">
          <img id="btPoster" class="blind-test-poster" src="${_btItem.poster}" style="filter:blur(${_btBlur}px)" />
        </div>
        <div class="blind-test-timer"><div class="blind-test-timer-fill" id="btTimerFill" style="width:100%"></div></div>`;
    }
    clearInterval(_btTimer);
    let elapsed = 0;
    const total = 20;
    _btTimer = setInterval(() => {
      elapsed++;
      _btBlur = Math.max(0, 20 - elapsed);
      const poster = document.getElementById('btPoster');
      if (poster) poster.style.filter = `blur(${_btBlur}px)`;
      const fill = document.getElementById('btTimerFill');
      if (fill) fill.style.width = `${100 - (elapsed / total) * 100}%`;
      if (elapsed >= total) { clearInterval(_btTimer); autoReveal(); }
    }, 1000);
    document.getElementById('blindTestOverlay')?.classList.remove('hidden');
    document.getElementById('blindTestInput')?.focus();
  }

  function autoReveal() {
    if (_btRevealed) return;
    _btRevealed = true; _btTotal++;
    document.getElementById('blindTestResult').innerHTML = `<div class="blind-test-result-wrong">⏱️ Temps écoulé — C'était : <strong>${_btItem.title}</strong></div>`;
    const poster = document.getElementById('btPoster');
    if (poster) poster.style.filter = 'blur(0px)';
  }

  function checkGuess() {
    if (_btRevealed || !_btItem) return;
    const guess = document.getElementById('blindTestInput')?.value.trim().toLowerCase();
    const correct = _btItem.title.toLowerCase();
    if (!guess) return;
    _btRevealed = true; _btTotal++; clearInterval(_btTimer);
    const poster = document.getElementById('btPoster');
    if (poster) poster.style.filter = 'blur(0px)';
    if (correct.includes(guess) || guess.includes(correct.slice(0, Math.min(correct.length, 5)))) {
      _btScore++;
      document.getElementById('blindTestResult').innerHTML = `<div class="blind-test-result-correct">✅ Bravo ! C'était bien <strong>${_btItem.title}</strong> !</div>`;
      setTimeout(launchConfetti, 100);
    } else {
      document.getElementById('blindTestResult').innerHTML = `<div class="blind-test-result-wrong">❌ Raté ! C'était : <strong>${_btItem.title}</strong></div>`;
    }
  }

  document.getElementById('blindTestBtn')?.addEventListener('click', startBlindTest);
  document.getElementById('blindTestGuess')?.addEventListener('click', checkGuess);
  document.getElementById('blindTestInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') checkGuess(); });
  document.getElementById('blindTestSkip')?.addEventListener('click', () => { clearInterval(_btTimer); autoReveal(); });
  document.getElementById('blindTestReveal')?.addEventListener('click', () => { clearInterval(_btTimer); autoReveal(); });
  document.getElementById('blindTestClose')?.addEventListener('click', () => { clearInterval(_btTimer); document.getElementById('blindTestOverlay')?.classList.add('hidden'); });
  document.getElementById('blindTestOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) { clearInterval(_btTimer); e.currentTarget.classList.add('hidden'); } });
})();

// ── J. CHALLENGES ─────────────────────────────────────────────────────────
const CHALLENGES = [
  { id:'c_movies10',  icon:'🎬', name:'Cinéphile',    desc:'Voir 10 films',         target: l => 10,  progress: l => l.filter(m=>m.type==='movie'&&m.status==='watched').length },
  { id:'c_series5',   icon:'📺', name:'Binge watcher', desc:'Terminer 5 séries',     target: () => 5,  progress: l => l.filter(m=>m.type==='series'&&m.status==='watched').length },
  { id:'c_anime10',   icon:'✨', name:'Otaku',         desc:'Voir 10 animés',        target: () => 10, progress: l => l.filter(m=>m.type==='anime'&&m.status==='watched').length },
  { id:'c_games3',    icon:'🎮', name:'Gamer',         desc:'Finir 3 jeux vidéo',    target: () => 3,  progress: l => l.filter(m=>m.type==='game'&&m.status==='watched').length },
  { id:'c_fav10',     icon:'⭐', name:'Coups de cœur', desc:'10 coups de cœur',      target: () => 10, progress: l => l.filter(m=>m.favorite).length },
  { id:'c_reviewed5', icon:'✍️', name:'Critique',      desc:'5 critiques rédigées',  target: () => 5,  progress: l => l.filter(m=>m.review&&m.review.length>10).length },
  { id:'c_all4types', icon:'🌐', name:'Omnivore',      desc:'Un titre de chaque type',target: () => 4, progress: l => ['movie','series','anime','game'].filter(t=>l.some(m=>m.type===t)).length },
  { id:'c_rating9',   icon:'💯', name:'Exigeant',      desc:'3 titres notés 9+',     target: () => 3,  progress: l => l.filter(m=>m.rating>=9).length },
  { id:'c_wl20',      icon:'📋', name:'En attente',    desc:'20 titres en watchlist', target: () => 20, progress: l => l.filter(m=>m.status==='watchlist').length },
  { id:'c_total50',   icon:'🏛️', name:'Médiathèque',   desc:'50 titres au total',    target: () => 50, progress: l => l.length },
];

function openChallenges() {
  const overlay = document.getElementById('challengesOverlay');
  const grid = document.getElementById('challengesGrid');
  if (!overlay || !grid) return;
  grid.innerHTML = CHALLENGES.map(c => {
    const prog = c.progress(library);
    const tgt = c.target(library);
    const pct = Math.min(100, Math.round((prog / tgt) * 100));
    const done = prog >= tgt;
    return `<div class="challenge-card ${done ? 'done' : ''}">
      <div class="challenge-icon">${c.icon}</div>
      <div class="challenge-info">
        <div class="challenge-name">${c.name}</div>
        <div class="challenge-desc">${c.desc}</div>
        <div class="challenge-bar-wrap"><div class="challenge-bar-fill" style="width:${pct}%"></div></div>
        <div class="challenge-pct">${prog} / ${tgt} · ${pct}%</div>
      </div>
      <div class="challenge-done-badge">${done ? '✅' : ''}</div>
    </div>`;
  }).join('');
  overlay.classList.remove('hidden');
}
window.openChallenges = openChallenges;

document.getElementById('challengesBtn')?.addEventListener('click', openChallenges);
document.getElementById('challengesClose')?.addEventListener('click', () => document.getElementById('challengesOverlay')?.classList.add('hidden'));
document.getElementById('challengesOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

// ── K. IMPORT CSV (LETTERBOXD / IMDB) ────────────────────────────────────
(function() {
  const importInput = document.getElementById('importInput');
  if (!importInput) return;

  // Override the existing change handler to also handle CSV
  const origHandler = importInput.onchange;
  importInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) return; // JSON handled by existing handler

    const reader = new FileReader();
    reader.onload = function(ev) {
      const text = ev.target.result;
      const lines = text.trim().split('\n');
      if (lines.length < 2) { showToast('CSV vide ou invalide', 'error'); return; }
      const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim().toLowerCase());
      const isLetterboxd = headers.includes('letterboxd uri');
      const isImdb = headers.includes('const') || headers.includes('tconst');

      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || lines[i].split(',');
        const clean = cols.map(c => c.replace(/^"|"$/g,'').trim());
        const get = (...keys) => { for (const k of keys) { const idx = headers.findIndex(h=>h.includes(k)); if (idx>=0) return clean[idx]||''; } return ''; };

        const title = get('name','title','primary title');
        if (!title || library.some(m => m.title.toLowerCase() === title.toLowerCase())) continue;

        const year = parseInt(get('year','released')) || null;
        const rating10 = isLetterboxd ? (parseFloat(get('rating'))||0) * 2 : parseFloat(get('your rating', 'rating'))||0;
        const watchDate = get('watched date','date','date added');
        const status = rating10 > 0 || watchDate ? 'watched' : 'watchlist';
        const type = get('type','title type').toLowerCase().includes('series') ? 'series' : get('type').toLowerCase().includes('game') ? 'game' : 'movie';

        library.unshift({
          id: uid(), title, type, status, year,
          rating: rating10 > 0 ? Math.min(10, Math.round(rating10)) : null,
          watchDate: watchDate || null, poster:'', genres:'', synopsis:'', review:'',
          favorite: false, trailer: null, tmdbRating: null, tags: [],
          dateAdded: watchDate ? (new Date(watchDate).getTime() || Date.now()) : Date.now()
        });
        imported++;
      }
      if (imported > 0) {
        save(); renderHome(); showToast(`✅ ${imported} titres importés depuis CSV !`);
      } else {
        showToast('Aucun nouveau titre trouvé dans ce CSV', 'error');
      }
    };
    reader.readAsText(file);
    importInput.value = '';
  });
})();

// ── L. EXPORT HTML ────────────────────────────────────────────────────────
function exportHtml() {
  const watched = library.filter(m => m.status !== 'watchlist');
  if (watched.length === 0) { showToast('Bibliothèque vide 😅', 'error'); return; }
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c3aed';
  const rows = watched.map(m => `
    <tr>
      <td>${m.poster ? `<img src="${m.poster}" style="width:38px;height:57px;object-fit:cover;border-radius:4px" />` : typeEmoji(m.type)}</td>
      <td><strong>${m.title}</strong>${m.year?` <span style="color:#888">(${m.year})</span>`:''}</td>
      <td>${typeEmoji(m.type)} ${m.type}</td>
      <td>${m.rating ? '★ '+m.rating+'/10' : '—'}</td>
      <td>${m.status}</td>
      <td>${m.genres || '—'}</td>
      <td>${m.favorite ? '⭐' : ''}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<title>Ma Bibliothèque Lumèra</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #0f0f17; color: #e2e8f0; padding: 2rem; }
  h1 { font-size: 2rem; color: ${accent}; margin-bottom: 0.3rem; }
  .sub { color: #888; margin-bottom: 2rem; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; }
  th { background: ${accent}22; color: ${accent}; padding: 0.7rem 1rem; text-align: left; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 0.6rem 1rem; border-bottom: 1px solid #ffffff11; vertical-align: middle; font-size: 0.88rem; }
  tr:hover td { background: ${accent}11; }
</style>
</head>
<body>
<h1>✨ Ma Bibliothèque Lumèra</h1>
<p class="sub">Exporté le ${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · ${watched.length} titres</p>
<table>
  <thead><tr><th></th><th>Titre</th><th>Type</th><th>Note</th><th>Statut</th><th>Genre(s)</th><th>Fav</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lumera-bibliotheque.html';
  a.click();
  showToast('📄 Export HTML téléchargé !');
}
window.exportHtml = exportHtml;
document.getElementById('exportHtmlBtn')?.addEventListener('click', exportHtml);

// ── M. DÉCOUVRIR PAGE ─────────────────────────────────────────────────────
let _discoverGenre = null;
const DISCOVER_GENRES = [
  { id:28, name:'Action' }, { id:35, name:'Comédie' }, { id:18, name:'Drame' },
  { id:27, name:'Horreur' }, { id:10749, name:'Romance' }, { id:878, name:'Science-fiction' },
  { id:14, name:'Fantasy' }, { id:53, name:'Thriller' }, { id:16, name:'Animation' },
  { id:99, name:'Documentaire' }
];

async function renderDiscover() {
  const key = localStorage.getItem('lumera_tmdb_key');
  const grid = document.getElementById('discoverGrid');
  const empty = document.getElementById('emptyDiscover');
  const controls = document.getElementById('discoverControls');
  if (!grid) return;

  if (!key) { grid.innerHTML = ''; empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  // Genre buttons
  if (controls && !controls.dataset.built) {
    controls.innerHTML = DISCOVER_GENRES.map(g =>
      `<button class="discover-genre-btn ${!_discoverGenre?'':''}${_discoverGenre===g.id?'active':''}" data-gid="${g.id}">${g.name}</button>`
    ).join('');
    controls.querySelectorAll('.discover-genre-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _discoverGenre = _discoverGenre === parseInt(btn.dataset.gid) ? null : parseInt(btn.dataset.gid);
        controls.dataset.built = '';
        renderDiscover();
      });
    });
    controls.dataset.built = '1';
    // Mark active
    controls.querySelectorAll('.discover-genre-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.gid) === _discoverGenre);
    });
  }

  grid.innerHTML = '<div style="color:var(--text-muted);padding:2rem;text-align:center">⏳ Chargement…</div>';
  try {
    const genreParam = _discoverGenre ? `&with_genres=${_discoverGenre}` : '';
    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${key}&language=fr-FR&sort_by=popularity.desc${genreParam}&vote_count.gte=200&page=1`;
    const res = await fetch(url);
    const data = await res.json();
    const results = (data.results || []).filter(r => !library.some(m => m.title === (r.title||r.name))).slice(0, 20);
    if (!results.length) { grid.innerHTML = '<div style="color:var(--text-muted);padding:2rem;text-align:center">Aucun résultat.</div>'; return; }

    grid.innerHTML = '';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(140px, 1fr))';
    results.forEach(r => {
      const poster = r.poster_path ? `https://image.tmdb.org/t/p/w300${r.poster_path}` : '';
      const year = (r.release_date||'').slice(0,4);
      const div = document.createElement('div');
      div.className = 'discover-card';
      div.innerHTML = `
        ${poster ? `<img class="discover-poster" src="${poster}" loading="lazy" />` : `<div class="discover-poster-ph" style="background:${titleGradient(r.title||'')}">${typeEmoji('movie')}</div>`}
        <div class="discover-info">
          <div class="discover-title">${r.title||r.name}</div>
          <div class="discover-meta">🎬 ${year} · ★ ${r.vote_average?.toFixed(1)||'?'}</div>
          <button class="discover-add-btn" data-id="${r.id}" data-title="${(r.title||r.name).replace(/"/g,'&quot;')}" data-year="${year}" data-poster="${poster}" data-synopsis="${(r.overview||'').slice(0,300).replace(/"/g,'&quot;')}">+ Watchlist</button>
        </div>`;
      div.querySelector('.discover-add-btn').addEventListener('click', e => {
        e.stopPropagation();
        const btn = e.currentTarget;
        if (library.some(m => m.title === btn.dataset.title)) { showToast('Déjà dans ta bibliothèque', 'error'); return; }
        library.unshift({ id:uid(), title:btn.dataset.title, type:'movie', status:'watchlist', year:parseInt(btn.dataset.year)||null, poster:btn.dataset.poster, synopsis:btn.dataset.synopsis, genres:'', rating:null, review:'', favorite:false, trailer:null, tmdbRating:r.vote_average||null, tags:[], dateAdded:Date.now() });
        save(); updateMiniWidget(); logAction('added', btn.dataset.title);
        btn.textContent = '✅ Ajouté'; btn.disabled = true;
        showToast(`📋 ${btn.dataset.title} ajouté en watchlist !`);
      });
      grid.appendChild(div);
    });
  } catch(e) {
    grid.innerHTML = '<div style="color:var(--text-muted);padding:2rem;text-align:center">Erreur de chargement.</div>';
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  BATCH 5 — Design + Fun & Gamification                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

// ── A. HEATMAP D'ACTIVITÉ ─────────────────────────────────────────────────
function renderHeatmap() {
  const el = document.getElementById('statsExtra');
  if (!el) return;

  // Build day→count map from dateAdded timestamps
  const dayCount = {};
  library.forEach(m => {
    if (!m.dateAdded) return;
    const d = new Date(m.dateAdded);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    dayCount[key] = (dayCount[key] || 0) + 1;
  });

  // Build 52 weeks grid (364 days) ending today
  const today = new Date();
  const days = [];
  for (let i = 363; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    days.push({ date: d, key, count: dayCount[key] || 0 });
  }

  // Streak
  let streak = 0, tempStreak = 0;
  const sortedDays = [...days].reverse();
  for (const day of sortedDays) {
    if (day.count > 0) { tempStreak++; streak = Math.max(streak, tempStreak); }
    else tempStreak = 0;
  }
  let currentStreak = 0;
  for (const day of sortedDays) {
    if (day.count > 0) currentStreak++;
    else break;
  }

  // Month labels
  const months = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const monthLabels = [];
  let lastMonth = -1;
  days.forEach((d, i) => {
    const m = d.date.getMonth();
    if (m !== lastMonth) { monthLabels.push({ idx: i, label: months[m] }); lastMonth = m; }
    else monthLabels.push(null);
  });

  const maxCount = Math.max(1, ...Object.values(dayCount));

  const wrap = document.createElement('div');
  wrap.className = 'heatmap-wrap';
  wrap.innerHTML = `
    <div class="heatmap-heading">
      <span>📅 Activité — 12 derniers mois</span>
      ${currentStreak > 0 ? `<span class="heatmap-streak">🔥 ${currentStreak} jour${currentStreak>1?'s':''} de suite</span>` : ''}
    </div>
    <div class="heatmap-months-row">
      ${days.map((d, i) => {
        const ml = monthLabels[i];
        return `<div class="heatmap-month-label">${ml ? ml.label : ''}</div>`;
      }).join('')}
    </div>
    <div class="heatmap-grid" id="heatmapGrid"></div>
    <div class="heatmap-legend-row">
      <span>Moins</span>
      <div class="heatmap-legend-cell" style="background:var(--border)"></div>
      <div class="heatmap-legend-cell heatmap-l1"></div>
      <div class="heatmap-legend-cell heatmap-l2"></div>
      <div class="heatmap-legend-cell heatmap-l3"></div>
      <div class="heatmap-legend-cell heatmap-l4"></div>
      <span>Plus</span>
    </div>
  `;
  el.insertBefore(wrap, el.firstChild);

  const grid = wrap.querySelector('#heatmapGrid');
  days.forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    if (d.count > 0) {
      const lvl = d.count >= maxCount * 0.75 ? 4 : d.count >= maxCount * 0.5 ? 3 : d.count >= maxCount * 0.25 ? 2 : 1;
      cell.classList.add(`heatmap-l${lvl}`);
    }
    cell.title = `${d.date.toLocaleDateString('fr-FR')} — ${d.count} ajout${d.count>1?'s':''}`;
    grid.appendChild(cell);
  });
}

// ── B. CAROUSEL 3D ────────────────────────────────────────────────────────
function initCarousel3D() {
  // Remove existing carousel section if any
  document.getElementById('carousel3dSection')?.remove();

  const items = library.filter(m => m.status !== 'watchlist').sort((a,b) => b.dateAdded - a.dateAdded).slice(0, 12);
  if (items.length < 3) return;

  const section = document.createElement('div');
  section.className = 'carousel3d-section section-block';
  section.id = 'carousel3dSection';

  const N = Math.min(items.length, 10);
  const angleStep = 360 / N;
  const radius = Math.round(140 / (2 * Math.tan(Math.PI / N))) + 20;

  section.innerHTML = `
    <div class="carousel3d-heading">
      <span>🎠 Ma cinémathèque 3D</span>
      <span class="carousel3d-count">${items.length} titres</span>
    </div>
    <div class="carousel3d-stage" id="c3dStage">
      <div class="carousel3d-track" id="c3dTrack">
        ${items.slice(0, N).map((m, i) => `
          <div class="carousel3d-item" data-id="${m.id}"
               style="transform: rotateY(${i * angleStep}deg) translateZ(${radius}px);
                      background:${titleGradient(m.title)}">
            ${m.poster
              ? `<img src="${m.poster}" alt="${m.title}" onerror="this.style.display='none'" loading="lazy" />`
              : `<div class="carousel3d-item-ph">${typeEmoji(m.type)}</div>`}
            <div class="carousel3d-caption">${m.title}${m.year ? `<br><span style="opacity:.6;font-weight:400">${m.year}</span>` : ''}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="carousel3d-nav">
      <button class="carousel3d-btn" id="c3dPrev">‹</button>
      <div class="carousel3d-dots" id="c3dDots">
        ${items.slice(0, N).map((_, i) => `<div class="carousel3d-dot${i===0?' active':''}"></div>`).join('')}
      </div>
      <button class="carousel3d-btn" id="c3dNext">›</button>
    </div>
  `;

  // Insert after recentSection
  const recentSection = document.querySelector('#page-home .section-block');
  if (recentSection?.nextSibling) {
    recentSection.parentNode.insertBefore(section, recentSection.nextSibling);
  } else {
    document.getElementById('page-home')?.appendChild(section);
  }

  let currentAngle = 0;
  const track = section.querySelector('#c3dTrack');
  const dots = section.querySelectorAll('.carousel3d-dot');

  function rotateTo(idx) {
    currentAngle = -(idx * angleStep);
    track.style.transform = `rotateY(${currentAngle}deg)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === ((idx % N) + N) % N));
  }

  let currentIdx = 0;
  section.querySelector('#c3dNext').addEventListener('click', () => rotateTo(++currentIdx));
  section.querySelector('#c3dPrev').addEventListener('click', () => rotateTo(--currentIdx));
  section.querySelectorAll('.carousel3d-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const clickedAngle = i * angleStep;
      const expectedAngle = ((currentIdx % N) + N) % N * angleStep;
      if (Math.abs(clickedAngle - expectedAngle) < 20 || Math.abs(clickedAngle - expectedAngle) > 340) {
        openDetail(el.dataset.id);
      } else {
        rotateTo(i); currentIdx = i;
      }
    });
  });

  // Mouse drag to rotate
  let dragStart = null;
  const stage = section.querySelector('#c3dStage');
  stage.addEventListener('mousedown', e => { dragStart = { x: e.clientX, idx: currentIdx }; });
  window.addEventListener('mouseup', e => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    if (Math.abs(dx) > 30) {
      const steps = Math.round(-dx / 50);
      currentIdx = dragStart.idx + steps;
      rotateTo(currentIdx);
    }
    dragStart = null;
  });

  // Auto-rotate
  let c3dTimer = setInterval(() => { rotateTo(++currentIdx); }, 4000);
  section.addEventListener('mouseenter', () => clearInterval(c3dTimer));
  section.addEventListener('mouseleave', () => { c3dTimer = setInterval(() => rotateTo(++currentIdx), 4000); });
}

// ── C. AURA COULEUR DOMINANTE ─────────────────────────────────────────────
function applyColorAura(posterUrl) {
  const aura = document.getElementById('detailAura');
  if (!aura) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 20; canvas.height = 30;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 20, 30);
      const data = ctx.getImageData(0, 0, 20, 30).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 16) {
        if (data[i+3] < 128) continue;
        r += data[i]; g += data[i+1]; b += data[i+2]; count++;
      }
      if (count > 0) {
        r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
        aura.style.background = `radial-gradient(ellipse at 30% 40%, rgba(${r},${g},${b},0.35) 0%, transparent 65%)`;
      }
    } catch(e) {}
  };
  img.onerror = () => {};
  // Use a CORS proxy trick: draw via canvas only works if same-origin
  // For TMDB images without crossOrigin attr use a small canvas approach
  img.src = posterUrl;
}

// ── G. MODE PROJECTION ────────────────────────────────────────────────────
function openProjection(id) {
  const item = library.find(m => m.id === id);
  if (!item) return;
  closeDetail();

  const overlay = document.getElementById('projectionOverlay');
  const scene = document.getElementById('projectionScene');
  const closeBtn = document.getElementById('projectionCloseBtn');
  if (!overlay || !scene) return;

  scene.innerHTML = `
    ${item.poster ? `<img class="projection-poster" src="${item.poster}" alt="${item.title}" onerror="this.style.display='none'" />` : `<div style="font-size:5rem">${typeEmoji(item.type)}</div>`}
    <div class="projection-title">${item.title}</div>
    ${item.year ? `<div class="projection-year">${item.year} ${item.genres ? '· '+item.genres.split(',')[0].trim() : ''}</div>` : ''}
    ${item.rating ? `<div class="projection-rating">${starsHtml(item.rating, '1.2rem')} <span style="color:rgba(255,255,255,0.5);font-size:0.8rem">${item.rating}/10</span></div>` : ''}
    ${item.synopsis ? `<div class="projection-synopsis">${item.synopsis.slice(0, 320)}${item.synopsis.length > 320 ? '…' : ''}</div>` : ''}
    <div class="projection-actions">
      ${item.trailer ? `<button class="proj-btn-play" onclick="document.getElementById('projectionOverlay').classList.remove('proj-on');document.getElementById('projectionScene').classList.remove('proj-on');document.getElementById('projectionCloseBtn').classList.remove('proj-on');openTrailer('${item.trailer}')">▶ Bande-annonce</button>` : ''}
      <button class="proj-btn-alt" onclick="closeProjection();openDetail('${id}')">📋 Voir la fiche</button>
      <button class="proj-btn-alt" onclick="closeProjection()">✕ Fermer</button>
    </div>
  `;

  requestAnimationFrame(() => {
    overlay.classList.add('proj-on');
    scene.classList.add('proj-on');
    closeBtn.classList.add('proj-on');
  });
}

function closeProjection() {
  document.getElementById('projectionOverlay')?.classList.remove('proj-on');
  document.getElementById('projectionScene')?.classList.remove('proj-on');
  document.getElementById('projectionCloseBtn')?.classList.remove('proj-on');
}
window.openProjection = openProjection;
window.closeProjection = closeProjection;

document.getElementById('projectionCloseBtn')?.addEventListener('click', closeProjection);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('projectionOverlay')?.classList.contains('proj-on')) closeProjection(); });

// ── H. DUEL DE LA SEMAINE ─────────────────────────────────────────────────
function openDuel() {
  const candidates = library.filter(m => m.status === 'watchlist');
  const overlay = document.getElementById('duelOverlay');
  const content = document.getElementById('duelContent');
  if (!overlay || !content) return;

  if (candidates.length < 2) {
    content.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem">Ajoute au moins 2 titres en watchlist pour lancer un duel !</div>';
    overlay.classList.remove('hidden'); return;
  }

  // Pick 2 random distinct items
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const [a, b] = shuffled;

  function buildSide(item) {
    return `
      <div class="duel-side" data-id="${item.id}">
        ${item.poster
          ? `<img class="duel-poster-img" src="${item.poster}" alt="${item.title}" onerror="this.outerHTML='<div class=duel-poster-ph>${typeEmoji(item.type)}</div>'" />`
          : `<div class="duel-poster-ph">${typeEmoji(item.type)}</div>`}
        <div class="duel-title-txt">${item.title}</div>
        <div class="duel-meta-txt">${item.year || ''} ${item.genres ? '· '+item.genres.split(',')[0].trim() : ''}</div>
      </div>`;
  }

  content.innerHTML = `
    <div class="duel-prompt">Lequel vas-tu regarder ce soir ? Clique sur ton choix 🎯</div>
    <div class="duel-arena">
      ${buildSide(a)}
      <div class="duel-vs-badge">VS</div>
      ${buildSide(b)}
    </div>
    <div class="duel-result-msg hidden" id="duelResultMsg"></div>
    <div class="duel-footer">
      <button class="btn-secondary" id="duelRerollBtn">🔀 Nouveau duel</button>
    </div>
  `;
  overlay.classList.remove('hidden');

  content.querySelectorAll('.duel-side').forEach(side => {
    side.addEventListener('click', () => {
      const winnerId = side.dataset.id;
      const winner = library.find(m => m.id === winnerId);
      content.querySelectorAll('.duel-side').forEach(s => {
        s.classList.add(s.dataset.id === winnerId ? 'duel-winner' : 'duel-loser');
      });
      const resultMsg = content.querySelector('#duelResultMsg');
      resultMsg.textContent = `🏆 "${winner.title}" remporte le duel ! Bonne soirée 🍿`;
      resultMsg.classList.remove('hidden');
      showToast(`🥊 Tu regardes "${winner.title}" ce soir !`);
    });
  });

  content.querySelector('#duelRerollBtn')?.addEventListener('click', () => { overlay.classList.add('hidden'); setTimeout(openDuel, 80); });
}

document.getElementById('duelClose')?.addEventListener('click', () => document.getElementById('duelOverlay')?.classList.add('hidden'));
document.getElementById('duelBtn')?.addEventListener('click', () => { setTimeout(openDuel, 150); });

// ── I. RE-WATCH LOG ───────────────────────────────────────────────────────
function renderRewatchLog(itemId) {
  const container = document.getElementById('rewatchSection');
  if (!container) return;
  const item = library.find(m => m.id === itemId);
  if (!item) return;
  if (!item.rewatchLog) item.rewatchLog = [];

  const log = item.rewatchLog;
  const moods = ['🎬','😍','🤩','😴','😭','🔥','😂','🤯'];

  container.innerHTML = `
    <div class="rewatch-section">
      <div class="rewatch-head">
        <span class="rewatch-head-label">📖 Journal de visionnage (${log.length})</span>
        <button class="rewatch-add-btn" id="rewatchAddBtn">+ Nouvelle entrée</button>
      </div>
      <div id="rewatchFormArea"></div>
      <div class="rewatch-log-list" id="rewatchLogList">
        ${log.length === 0
          ? '<div class="rewatch-empty">Aucune entrée. Ajoute ta première session !</div>'
          : log.slice().reverse().map(entry => `
            <div class="rewatch-entry">
              <div class="rewatch-entry-mood">${entry.mood || '🎬'}</div>
              <div class="rewatch-entry-body">
                <div class="rewatch-entry-date">${entry.date || ''}</div>
                ${entry.rating ? `<div class="rewatch-entry-note">★ ${entry.rating}/10</div>` : ''}
                ${entry.comment ? `<div class="rewatch-entry-comment">${entry.comment}</div>` : ''}
              </div>
              <button class="rewatch-entry-del" onclick="deleteRewatchEntry('${itemId}','${entry.id}')">✕</button>
            </div>`).join('')}
      </div>
    </div>
  `;

  let selectedMood = '🎬';
  let selectedRating = 0;

  container.querySelector('#rewatchAddBtn')?.addEventListener('click', () => {
    const formArea = container.querySelector('#rewatchFormArea');
    if (formArea.querySelector('.rewatch-form-panel')) { formArea.innerHTML = ''; return; }
    formArea.innerHTML = `
      <div class="rewatch-form-panel">
        <div class="rewatch-form-row">
          <span class="rewatch-form-label">Humeur</span>
          <div class="rewatch-form-moods" id="rfMoods">
            ${moods.map(m => `<button class="${m===selectedMood?'sel':''}" data-mood="${m}">${m}</button>`).join('')}
          </div>
        </div>
        <div class="rewatch-form-row">
          <span class="rewatch-form-label">Note</span>
          <div class="rewatch-form-stars" id="rfStars">
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `<span data-n="${n}" style="color:${n<=selectedRating?'#f59e0b':'var(--border-strong)'}">★</span>`).join('')}
          </div>
          <span id="rfRatingLabel" style="font-size:0.78rem;color:var(--text-muted);min-width:2rem">${selectedRating>0?selectedRating+'/10':''}</span>
        </div>
        <textarea id="rfComment" placeholder="Notes, impressions, contexte du visionnage…" rows="3"></textarea>
        <div class="rewatch-form-actions">
          <button class="btn-secondary" id="rfCancel" style="font-size:0.8rem;padding:0.4rem 0.9rem">Annuler</button>
          <button class="btn-primary" id="rfSave" style="font-size:0.8rem;padding:0.4rem 0.9rem">✓ Enregistrer</button>
        </div>
      </div>
    `;

    formArea.querySelectorAll('#rfMoods button').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedMood = btn.dataset.mood;
        formArea.querySelectorAll('#rfMoods button').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
      });
    });

    formArea.querySelectorAll('#rfStars span').forEach(star => {
      star.addEventListener('click', () => {
        selectedRating = parseInt(star.dataset.n);
        formArea.querySelectorAll('#rfStars span').forEach((s, i) => {
          s.style.color = i < selectedRating ? '#f59e0b' : 'var(--border-strong)';
        });
        formArea.querySelector('#rfRatingLabel').textContent = selectedRating + '/10';
      });
      star.addEventListener('mouseenter', () => {
        const n = parseInt(star.dataset.n);
        formArea.querySelectorAll('#rfStars span').forEach((s, i) => {
          s.style.color = i < n ? '#f59e0b' : 'var(--border-strong)';
        });
      });
      star.addEventListener('mouseleave', () => {
        formArea.querySelectorAll('#rfStars span').forEach((s, i) => {
          s.style.color = i < selectedRating ? '#f59e0b' : 'var(--border-strong)';
        });
      });
    });

    formArea.querySelector('#rfCancel')?.addEventListener('click', () => { formArea.innerHTML = ''; });
    formArea.querySelector('#rfSave')?.addEventListener('click', () => {
      const comment = formArea.querySelector('#rfComment')?.value.trim() || '';
      saveRewatchEntry(itemId, { mood: selectedMood, rating: selectedRating || null, comment });
    });
  });
}

function saveRewatchEntry(itemId, data) {
  const item = library.find(m => m.id === itemId);
  if (!item) return;
  if (!item.rewatchLog) item.rewatchLog = [];
  const entry = {
    id: uid(),
    date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    mood: data.mood,
    rating: data.rating,
    comment: data.comment
  };
  item.rewatchLog.push(entry);
  save();
  showToast('📖 Entrée ajoutée !');
  renderRewatchLog(itemId);
}
window.saveRewatchEntry = saveRewatchEntry;

function deleteRewatchEntry(itemId, entryId) {
  const item = library.find(m => m.id === itemId);
  if (!item || !item.rewatchLog) return;
  item.rewatchLog = item.rewatchLog.filter(e => e.id !== entryId);
  save();
  renderRewatchLog(itemId);
}
window.deleteRewatchEntry = deleteRewatchEntry;

/* ══════════════════════════════════════════════════════════════════════════ */
/*  J. PAGE PROFIL                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */
function calcStreak() {
  const dayMap = {};
  library.forEach(m => {
    if (!m.dateAdded) return;
    const k = new Date(m.dateAdded).toISOString().slice(0, 10);
    dayMap[k] = (dayMap[k] || 0) + 1;
  });
  let current = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (dayMap[d.toISOString().slice(0, 10)]) current++;
    else if (i > 0) break;
  }
  const allDays = Object.keys(dayMap).sort();
  let best = 0, temp = 0;
  allDays.forEach((day, i) => {
    if (i === 0) { temp = 1; }
    else {
      const diff = (new Date(day) - new Date(allDays[i - 1])) / 86400000;
      temp = diff === 1 ? temp + 1 : 1;
    }
    best = Math.max(best, temp);
  });
  return { current, best };
}

function renderProfil() {
  const container = document.getElementById('profilContainer');
  if (!container) return;

  const watched = library.filter(m => m.status === 'watched');
  const rated = library.filter(m => m.rating);
  const avgRating = rated.length ? (rated.reduce((s, m) => s + m.rating, 0) / rated.length).toFixed(1) : '—';
  const watchlist = library.filter(m => m.status === 'watchlist').length;
  const favorites = library.filter(m => m.favorite).length;

  const genreCount = {};
  library.forEach(m => {
    if (!m.genres) return;
    m.genres.split(',').map(g => g.trim()).filter(Boolean).forEach(g => { genreCount[g] = (genreCount[g] || 0) + 1; });
  });
  const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const typeCount = { movie: 0, series: 0, anime: 0, game: 0 };
  library.forEach(m => { if (typeCount[m.type] !== undefined) typeCount[m.type]++; });
  const total = library.length;

  const { current: currentStreak, best: bestStreak } = calcStreak();

  const username = localStorage.getItem('lumera_username') || 'Cinéphile';
  const initials = username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'L';
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c3aed';
  const typeIcon = { movie: '🎬', series: '📺', anime: '✨', game: '🎮' };
  const typeLabel = { movie: 'Films', series: 'Séries', anime: 'Animés', game: 'Jeux' };

  container.innerHTML = `
    <div class="profil-header">
      <div class="profil-avatar" style="background:${accent}">${initials}</div>
      <div class="profil-header-info">
        <div class="profil-name" onclick="editProfilName()">${username} <span class="profil-edit-hint">✏️</span></div>
        <div class="profil-tagline">Membre de Lumèra · ${total} titre${total > 1 ? 's' : ''}</div>
        ${currentStreak > 0 ? `<div class="profil-streak-badge">🔥 ${currentStreak} jour${currentStreak > 1 ? 's' : ''} de suite</div>` : ''}
      </div>
      <button class="btn-primary profil-share-trigger" id="profilShareBtn">📤 Partager</button>
    </div>

    <div class="profil-stats-grid">
      <div class="profil-stat-card"><div class="profil-stat-icon">✅</div><div class="profil-stat-val">${watched.length}</div><div class="profil-stat-label">Vus</div></div>
      <div class="profil-stat-card"><div class="profil-stat-icon">⭐</div><div class="profil-stat-val">${avgRating}</div><div class="profil-stat-label">Note moy.</div></div>
      <div class="profil-stat-card"><div class="profil-stat-icon">🔖</div><div class="profil-stat-val">${watchlist}</div><div class="profil-stat-label">Watchlist</div></div>
      <div class="profil-stat-card"><div class="profil-stat-icon">❤️</div><div class="profil-stat-val">${favorites}</div><div class="profil-stat-label">Favoris</div></div>
      <div class="profil-stat-card"><div class="profil-stat-icon">🔥</div><div class="profil-stat-val">${bestStreak}</div><div class="profil-stat-label">Meilleur streak</div></div>
    </div>

    ${topGenres.length ? `
    <div class="profil-section">
      <div class="profil-section-title">🎭 Genres favoris</div>
      <div class="profil-genres-row">
        ${topGenres.map(([g, n], i) => `<div class="profil-genre-pill" style="opacity:${(1 - i * 0.15).toFixed(2)}">${g} <span class="profil-genre-count">×${n}</span></div>`).join('')}
      </div>
    </div>` : ''}

    ${total > 0 ? `
    <div class="profil-section">
      <div class="profil-section-title">📊 Répartition</div>
      <div class="profil-type-bars">
        ${Object.entries(typeCount).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([type, n]) => `
          <div class="profil-type-bar-row">
            <span class="profil-type-bar-label">${typeIcon[type]} ${typeLabel[type]}</span>
            <div class="profil-type-bar-track"><div class="profil-type-bar-fill" style="width:${Math.round(n / total * 100)}%"></div></div>
            <span class="profil-type-bar-count">${n}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="profil-section">
      <div class="profil-section-title">🕐 Dernières activités</div>
      <div class="profil-recent">
        ${library.length === 0 ? '<div class="profil-empty">Ajoute des titres pour voir ton activité !</div>' :
          library.slice().sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 5).map(m => `
          <div class="profil-recent-item" onclick="openDetail('${m.id}')">
            ${m.poster ? `<img class="profil-recent-thumb" src="${m.poster}" alt="${m.title}" onerror="this.outerHTML='<div class=profil-recent-thumb-ph>${typeEmoji(m.type)}</div>'" />` : `<div class="profil-recent-thumb-ph">${typeEmoji(m.type)}</div>`}
            <div class="profil-recent-info">
              <div class="profil-recent-title">${m.title}</div>
              <div class="profil-recent-meta">${m.year || ''} ${m.rating ? '· ★ ' + m.rating : ''}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>
  `;

  container.querySelector('#profilShareBtn')?.addEventListener('click', () => shareProfilCard(username, watched.length, avgRating, bestStreak, topGenres));
}
window.renderProfil = renderProfil;

function editProfilName() {
  const name = prompt('Ton nom / pseudo :', localStorage.getItem('lumera_username') || 'Cinéphile');
  if (name && name.trim()) { localStorage.setItem('lumera_username', name.trim()); renderProfil(); }
}
window.editProfilName = editProfilName;

function shareProfilCard(username, watched, avgRating, bestStreak, topGenres) {
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 320;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 600, 320);
  grad.addColorStop(0, '#1a0a3a'); grad.addColorStop(1, '#2d1b69');
  ctx.fillStyle = grad;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(0, 0, 600, 320, 18); ctx.fill(); }
  else { ctx.fillRect(0, 0, 600, 320); }

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c3aed';
  ctx.beginPath(); ctx.arc(530, 55, 110, 0, Math.PI * 2);
  ctx.fillStyle = accent + '22'; ctx.fill();

  const initials = username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'L';
  ctx.beginPath(); ctx.arc(70, 80, 44, 0, Math.PI * 2);
  ctx.fillStyle = accent; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 24px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(initials, 70, 88);

  ctx.textAlign = 'left';
  ctx.font = 'bold 22px system-ui'; ctx.fillStyle = '#fff';
  ctx.fillText(username, 130, 66);
  ctx.font = '13px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Profil Lumèra', 130, 90);

  const stats = [{ icon: '✅', val: watched, label: 'Vus' }, { icon: '⭐', val: avgRating, label: 'Note moy.' }, { icon: '🔥', val: bestStreak, label: 'Meilleur streak' }];
  stats.forEach((s, i) => {
    const x = 50 + i * 178, y = 138;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, 152, 70, 10); ctx.fill(); }
    else ctx.fillRect(x, y, 152, 70);
    ctx.font = '20px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(s.icon, x + 76, y + 26);
    ctx.font = 'bold 18px system-ui'; ctx.fillText(String(s.val), x + 76, y + 48);
    ctx.font = '10px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(s.label, x + 76, y + 62);
  });

  if (topGenres.length) {
    ctx.textAlign = 'left'; ctx.font = '12px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('Genres favoris :', 50, 248);
    let gx = 50;
    topGenres.slice(0, 3).forEach(([g]) => {
      const w = ctx.measureText(g).width + 20;
      ctx.fillStyle = accent + '44';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(gx, 256, w, 22, 7); ctx.fill(); }
      else ctx.fillRect(gx, 256, w, 22);
      ctx.fillStyle = '#fff'; ctx.font = '11px system-ui';
      ctx.fillText(g, gx + 10, 271); gx += w + 7;
    });
  }

  ctx.textAlign = 'right'; ctx.font = '10px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillText('lumèra', 585, 310);

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a'); a.href = url; a.download = 'lumera-profil.png'; a.click();
  showToast('📤 Carte de profil téléchargée !');
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  BATCH 6 — PWA · Search · Deep Links · Dark Auto · Notifs · Stats         */
/* ══════════════════════════════════════════════════════════════════════════ */

// ── OS DARK MODE AUTO ─────────────────────────────────────────────────────
(function initOsTheme() {
  if (localStorage.getItem('lumera_theme_mode')) return;
  if (window.matchMedia('(prefers-color-scheme: dark)').matches && themeMode === 'light') {
    themeMode = 'dark'; isDark = true;
    localStorage.setItem('lumera_theme_mode', 'dark');
    if (typeof applyTheme === 'function') applyTheme();
  }
})();

// ── SEARCH DROPDOWN (local + TMDB) ───────────────────────────────────────
(function initSearchDropdown() {
  const input = document.getElementById('globalSearch');
  const dropdown = document.getElementById('searchDropdown');
  if (!input || !dropdown) return;

  let _tmdbTimer = null;

  function renderDropdown(localResults, tmdbResults, loading) {
    let html = '';

    if (localResults.length) {
      html += '<div class="sdrop-section-label">📚 Ma bibliothèque</div>';
      html += localResults.map(m => {
        const statusText = { watched:'Vu', watching:'En cours', watchlist:'Watchlist', dropped:'Abandonné' }[m.status] || m.status;
        return `<div class="sdrop-item" data-id="${m.id}" data-local="1">
          ${m.poster ? `<img class="sdrop-thumb" src="${m.poster}" onerror="this.style.display='none'" />` : `<div class="sdrop-thumb sdrop-ph">${typeEmoji(m.type)}</div>`}
          <div class="sdrop-info">
            <div class="sdrop-title">${m.title}</div>
            <div class="sdrop-meta">${m.year || ''} · ${statusText}</div>
          </div>
        </div>`;
      }).join('');
    }

    if (loading) {
      html += '<div class="sdrop-section-label">🌐 TMDB <span class="sdrop-loading">…</span></div>';
    } else if (tmdbResults && tmdbResults.length) {
      html += '<div class="sdrop-section-label">🌐 Ajouter depuis TMDB</div>';
      html += tmdbResults.map(r => {
        const inLib = library.some(m => m.title === (r.title || r.name));
        const poster = r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : '';
        const year = (r.release_date || r.first_air_date || '').slice(0, 4);
        const type = r.media_type === 'tv' ? 'series' : r.media_type === 'movie' ? 'movie' : 'movie';
        return `<div class="sdrop-item sdrop-tmdb ${inLib ? 'sdrop-inlib' : ''}"
          data-tmdb-id="${r.id}" data-title="${(r.title||r.name||'').replace(/"/g,'&quot;')}"
          data-year="${year}" data-poster="${poster}" data-type="${type}"
          data-synopsis="${(r.overview||'').slice(0,300).replace(/"/g,'&quot;')}">
          ${poster ? `<img class="sdrop-thumb" src="${poster}" onerror="this.style.display='none'" />` : `<div class="sdrop-thumb sdrop-ph">${typeEmoji(type)}</div>`}
          <div class="sdrop-info">
            <div class="sdrop-title">${r.title || r.name}</div>
            <div class="sdrop-meta">${year} · ${r.media_type === 'tv' ? '📺 Série' : '🎬 Film'}${r.vote_average ? ' · ★ '+r.vote_average.toFixed(1) : ''}</div>
          </div>
          <button class="sdrop-add-btn" title="${inLib ? 'Déjà dans ta bibliothèque' : 'Ajouter en watchlist'}">${inLib ? '✅' : '＋'}</button>
        </div>`;
      }).join('');
    }

    if (!html) { dropdown.classList.add('hidden'); return; }
    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');

    // Local item click → open detail
    dropdown.querySelectorAll('.sdrop-item[data-local]').forEach(el => {
      el.addEventListener('mousedown', ev => {
        ev.preventDefault();
        dropdown.classList.add('hidden'); input.value = ''; searchQuery = '';
        openDetail(el.dataset.id);
      });
    });

    // TMDB add button
    dropdown.querySelectorAll('.sdrop-tmdb .sdrop-add-btn').forEach(btn => {
      btn.addEventListener('mousedown', ev => {
        ev.preventDefault();
        const el = btn.closest('.sdrop-tmdb');
        if (library.some(m => m.title === el.dataset.title)) { showToast('Déjà dans ta bibliothèque', 'error'); return; }
        library.unshift({
          id: uid(), title: el.dataset.title, type: el.dataset.type,
          status: 'watchlist', year: parseInt(el.dataset.year) || null,
          poster: el.dataset.poster, synopsis: el.dataset.synopsis,
          tmdbId: el.dataset.tmdbId,
          genres: '', rating: null, review: '', favorite: false,
          trailer: null, tags: [], dateAdded: Date.now()
        });
        save(); logAction('added', el.dataset.title); updateMiniWidget();
        btn.textContent = '✅'; btn.disabled = true;
        showToast(`📋 ${el.dataset.title} ajouté en watchlist !`);
      });
    });

    // TMDB item click (not on button) → open detail if in lib, else add form
    dropdown.querySelectorAll('.sdrop-tmdb').forEach(el => {
      el.addEventListener('mousedown', ev => {
        if (ev.target.classList.contains('sdrop-add-btn')) return;
        ev.preventDefault();
        const inLib = library.find(m => m.title === el.dataset.title);
        if (inLib) { dropdown.classList.add('hidden'); input.value = ''; openDetail(inLib.id); }
      });
    });
  }

  input.addEventListener('input', e => {
    const q = e.target.value.trim();
    if (!q || q.length < 2) { dropdown.classList.add('hidden'); clearTimeout(_tmdbTimer); return; }

    const localResults = library.filter(m =>
      m.title.toLowerCase().includes(q.toLowerCase()) || (m.genres || '').toLowerCase().includes(q.toLowerCase())
    ).slice(0, 4);

    const key = localStorage.getItem('lumera_tmdb_key');
    if (!key) {
      let html = '';
      if (localResults.length) {
        html += '<div class="sdrop-section-label">📚 Ma bibliothèque</div>';
        html += localResults.map(m => {
          const statusText = { watched:'Vu', watching:'En cours', watchlist:'Watchlist', dropped:'Abandonné' }[m.status] || m.status;
          return `<div class="sdrop-item" data-id="${m.id}" data-local="1">
            ${m.poster ? `<img class="sdrop-thumb" src="${m.poster}" onerror="this.style.display='none'" />` : `<div class="sdrop-thumb sdrop-ph">${typeEmoji(m.type)}</div>`}
            <div class="sdrop-info"><div class="sdrop-title">${m.title}</div><div class="sdrop-meta">${m.year||''} · ${statusText}</div></div>
          </div>`;
        }).join('');
      }
      html += `<div class="sdrop-no-key">🔑 <span onclick="document.getElementById('openAddModal').click();document.getElementById('tmdbSearchBtn').click()" style="cursor:pointer;text-decoration:underline">Configure ta clé TMDB</span> pour la recherche avancée</div>`;
      dropdown.innerHTML = html;
      dropdown.classList.remove('hidden');
      dropdown.querySelectorAll('.sdrop-item[data-local]').forEach(el => {
        el.addEventListener('mousedown', ev => { ev.preventDefault(); dropdown.classList.add('hidden'); input.value=''; searchQuery=''; openDetail(el.dataset.id); });
      });
      return;
    }

    renderDropdown(localResults, [], true);

    clearTimeout(_tmdbTimer);
    _tmdbTimer = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${key}&language=fr-FR&query=${encodeURIComponent(q)}&page=1`);
        const data = await res.json();
        const tmdb = (data.results || [])
          .filter(r => r.media_type !== 'person' && (r.title || r.name))
          .slice(0, 5);
        renderDropdown(localResults, tmdb, false);
      } catch(err) {
        renderDropdown(localResults, [], false);
      }
    }, 350);
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dropdown.classList.add('hidden'); input.blur(); clearTimeout(_tmdbTimer); }
  });
})();

// ── DEEP LINKS ────────────────────────────────────────────────────────────
(function initDeepLinks() {
  const hash = window.location.hash;
  if (hash.startsWith('#item-')) {
    const id = hash.slice(6);
    setTimeout(() => { if (library.find(m => m.id === id)) openDetail(id); }, 500);
  }
})();

function copyItemLink(id) {
  const url = window.location.href.split('#')[0] + '#item-' + id;
  navigator.clipboard.writeText(url).then(() => showToast('🔗 Lien copié !')).catch(() => showToast('Erreur copie', 'error'));
}
window.copyItemLink = copyItemLink;

// ── STREAK NOTIFICATIONS ──────────────────────────────────────────────────
function initStreakNotifications() {
  if (!('Notification' in window)) { showToast('Notifications non supportées', 'error'); return; }
  Notification.requestPermission().then(perm => {
    if (perm !== 'granted') { showToast('Notifications refusées', 'error'); return; }
    localStorage.setItem('lumera_notif', '1');
    showToast('🔔 Rappels activés !');
  });
}
window.initStreakNotifications = initStreakNotifications;

(function checkStreakNotif() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (localStorage.getItem('lumera_notif') !== '1') return;
  const last = library.length ? Math.max(...library.map(m => m.dateAdded || 0)) : 0;
  if (!last) return;
  const daysSince = (Date.now() - last) / 86400000;
  if (daysSince >= 2) {
    new Notification('🎬 Lumèra te manque !', {
      body: `Rien depuis ${Math.floor(daysSince)} jours. Ton streak t'attend ! 🔥`,
      icon: './8_1sasa11.jpg'
    });
  }
})();

(function addNotifBtn() {
  const grid = document.querySelector('.tools-panel-grid');
  if (!grid || grid.querySelector('#notifBtn')) return;
  const btn = document.createElement('button');
  btn.className = 'tool-btn'; btn.id = 'notifBtn';
  btn.innerHTML = '<span class="tool-icon">🔔</span>Rappels';
  btn.addEventListener('click', initStreakNotifications);
  grid.appendChild(btn);
})();

// ── B. TOP ACTEURS / RÉALISATEURS ─────────────────────────────────────────
async function renderTopCast() {
  const key = localStorage.getItem('lumera_tmdb_key');
  const el = document.getElementById('statsTop');
  if (!el) return;
  if (!key) {
    el.innerHTML = '<div class="top-cast-empty">Configure ta clé TMDB pour voir le top acteurs / réalisateurs.</div>';
    return;
  }
  const movies = library.filter(m => m.type === 'movie' && m.status === 'watched' && m.tmdbId);
  if (movies.length === 0) {
    el.innerHTML = '<div class="top-cast-empty">Ajoute des films via la recherche TMDB pour voir tes acteurs préférés.</div>';
    return;
  }
  el.innerHTML = '<div class="top-cast-empty">⏳ Analyse des crédits…</div>';

  const actorMap = {}, dirMap = {};
  await Promise.all(movies.slice(0, 12).map(async m => {
    try {
      const r = await fetch(`https://api.themoviedb.org/3/movie/${m.tmdbId}/credits?api_key=${key}&language=fr-FR`);
      const d = await r.json();
      (d.cast || []).slice(0, 5).forEach(a => {
        if (!actorMap[a.name]) actorMap[a.name] = { count: 0, img: a.profile_path };
        actorMap[a.name].count++;
      });
      (d.crew || []).filter(c => c.job === 'Director').forEach(dir => {
        if (!dirMap[dir.name]) dirMap[dir.name] = { count: 0, img: dir.profile_path };
        dirMap[dir.name].count++;
      });
    } catch(e) {}
  }));

  function card([name, data]) {
    const img = data.img ? `https://image.tmdb.org/t/p/w92${data.img}` : '';
    return `<div class="top-person-card">
      ${img ? `<img class="top-person-img" src="${img}" onerror="this.style.display='none'" />` : '<div class="top-person-img top-person-ph">🎭</div>'}
      <div class="top-person-name">${name}</div>
      <div class="top-person-count">${data.count} film${data.count > 1 ? 's' : ''}</div>
    </div>`;
  }

  const topA = Object.entries(actorMap).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  const topD = Object.entries(dirMap).sort((a, b) => b[1].count - a[1].count).slice(0, 5);

  el.innerHTML = `
    <div class="top-cast-section">
      <div class="top-cast-title">🎭 Acteurs les plus vus</div>
      <div class="top-cast-grid">${topA.length ? topA.map(card).join('') : '<span class="top-cast-empty">Pas assez de données</span>'}</div>
    </div>
    <div class="top-cast-section">
      <div class="top-cast-title">🎬 Réalisateurs favoris</div>
      <div class="top-cast-grid">${topD.length ? topD.map(card).join('') : '<span class="top-cast-empty">Pas assez de données</span>'}</div>
    </div>`;
}
window.renderTopCast = renderTopCast;

// ── D. DISTRIBUTION PAR DÉCENNIE ──────────────────────────────────────────
function renderYearDistribution() {
  const el = document.getElementById('statsPodium');
  if (!el) return;
  if (el.querySelector('.year-dist-wrap')) return; // already rendered

  const withYear = library.filter(m => m.year && m.status === 'watched');
  if (withYear.length < 3) return;

  const decades = {};
  withYear.forEach(m => {
    const key = `${Math.floor(m.year / 10) * 10}s`;
    decades[key] = (decades[key] || 0) + 1;
  });
  const sorted = Object.entries(decades).sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(...sorted.map(([, n]) => n));

  const wrap = document.createElement('div');
  wrap.className = 'year-dist-wrap';
  wrap.innerHTML = `
    <div class="year-dist-title">📅 Films par décennie</div>
    <div class="year-dist-bars">
      ${sorted.map(([label, count]) => `
        <div class="year-dist-col">
          <div class="year-dist-bar-wrap">
            <div class="year-dist-bar" style="height:${Math.round(count / max * 100)}%" title="${count} titres"></div>
          </div>
          <div class="year-dist-count">${count}</div>
          <div class="year-dist-label">${label}</div>
        </div>`).join('')}
    </div>`;
  el.insertBefore(wrap, el.firstChild);
}
window.renderYearDistribution = renderYearDistribution;

// Hook renderYearDistribution + renderTopCast into renderStats
const _origRenderStats2 = renderStats;
if (typeof _origRenderStats2 === 'function') {
  renderStats = function() {
    _origRenderStats2();
    renderYearDistribution();
    renderTopCast();
  };
}
