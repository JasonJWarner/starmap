/**
 * 星图 Starmap - SPA Application
 */
(function() {
  'use strict';

  // ===== Supabase Config =====
  const SUPABASE_URL = 'https://vmgukrkydfxctgqpsspd.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_zmMt4QD-u4jDsW76PZv1Hw_MmOjGJFo';

  // ===== State =====
  let catalogData = null;
  let tagsData = {};
  let currentView = 'home';
  let currentCategory = null;
  let currentSubCat = 'all';
  let currentSort = 'stars';
  let currentDifficulty = 'all';
  let unlockedRepos = new Set();

  // ===== DOM =====
  const app = document.getElementById('app');
  const searchInput = document.getElementById('searchInput');

  // ===== Fingerprint =====
  function getFingerprint() {
    let fp = localStorage.getItem('starmap_fp');
    if (!fp) {
      fp = 'fp_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      localStorage.setItem('starmap_fp', fp);
    }
    return fp;
  }

  // ===== Track Unlock =====
  async function trackUnlock(repoName, repoCategory) {
    const fp = getFingerprint();
    unlockedRepos.add(repoName);
    saveUnlocked();
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/unlock_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          repo_name: repoName,
          repo_category: repoCategory,
          user_fingerprint: fp
        })
      });
    } catch(e) {
      console.log('Track unlock failed:', e);
    }
  }

  // ===== Load/Save Unlocked =====
  function loadUnlocked() {
    const saved = localStorage.getItem('starmap_unlocked');
    if (saved) {
      try { unlockedRepos = new Set(JSON.parse(saved)); } catch(e) {}
    }
  }
  function saveUnlocked() {
    localStorage.setItem('starmap_unlocked', JSON.stringify([...unlockedRepos]));
  }

  // ===== Data Loading =====
  async function loadData() {
    try {
      const [catalogRes, tagsRes] = await Promise.all([
        fetch('data/catalog.json'),
        fetch('data/tags.json')
      ]);
      catalogData = await catalogRes.json();
      if (tagsRes.ok) {
        tagsData = await tagsRes.json();
      }
      loadUnlocked();
      init();
    } catch(e) {
      app.innerHTML = '<div class="empty-state"><div class="icon">😞</div><p>Failed to load data. Please refresh.</p></div>';
    }
  }

  function init() {
    window.addEventListener('hashchange', router);
    searchInput.addEventListener('input', debounce(onSearch, 300));
    document.addEventListener('keydown', onKeyDown);
    router();
  }

  // ===== Router =====
  function router() {
    const hash = window.location.hash || '#/';
    if (hash === '#/' || hash === '#') {
      renderHome();
    } else if (hash.startsWith('#/category/')) {
      const id = hash.replace('#/category/', '');
      renderCategory(id);
    } else if (hash.startsWith('#/search')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const q = params.get('q') || '';
      searchInput.value = q;
      renderSearch(q);
    } else {
      renderHome();
    }
  }

  // ===== Get Repo Tags =====
  function getRepoTags(repoName) {
    return tagsData[repoName] || { difficulty: null, special: null };
  }

  // ===== Render: Home =====
  function renderHome() {
    currentView = 'home';
    const cats = catalogData.categories;
    const total = catalogData.totalRepos;

    app.innerHTML = `
      <div class="hero">
        <h1>🗺️ Starmap</h1>
        <p>Find GitHub answers for your needs</p>
      </div>
      <div class="stats-bar">
        <div class="stat-item"><div class="stat-num">${total.toLocaleString()}</div><div class="stat-label">Open Source Projects</div></div>
        <div class="stat-item"><div class="stat-num">${cats.length}</div><div class="stat-label">Categories</div></div>
        <div class="stat-item"><div class="stat-num">GitHub</div><div class="stat-label">Data Source</div></div>
      </div>
      <div class="category-grid">
        ${cats.map(c => `
          <a href="#/category/${c.id}" class="category-card">
            <div class="category-icon">${c.icon}</div>
            <div class="category-info">
              <h3>${c.display}</h3>
              <span>${c.count} projects</span>
            </div>
          </a>
        `).join('')}
      </div>
    `;
  }

  // ===== Render: Category =====
  function renderCategory(catId) {
    currentView = 'category';
    const cat = catalogData.categories.find(c => c.id === catId);
    if (!cat) { renderHome(); return; }
    currentCategory = cat;

    if (currentSubCat === 'all' || !cat.subCategories.includes(currentSubCat)) {
      currentSubCat = 'all';
    }

    const repos = getFilteredRepos(cat);
    const sorted = sortRepos(repos);

    app.innerHTML = `
      <div class="category-header">
        <a href="#/" class="back-link">← Home</a>
        <div class="category-title">
          <span class="icon">${cat.icon}</span>
          <h1>${cat.display}</h1>
        </div>
      </div>
      <div class="subcat-tabs">
        <button class="subcat-tab ${currentSubCat==='all'?'active':''}" data-sub="all">All (${cat.count})</button>
        ${cat.subCategories.map(sc => {
          const cnt = cat.repos.filter(r => r.sc === sc).length;
          return `<button class="subcat-tab ${currentSubCat===sc?'active':''}" data-sub="${sc}">${sc} (${cnt})</button>`;
        }).join('')}
      </div>
      <div class="filter-bar">
        <span>Difficulty:</span>
        <button class="diff-filter ${currentDifficulty==='all'?'active':''}" data-diff="all">All</button>
        <button class="diff-filter ${currentDifficulty==='Beginner'?'active':''}" data-diff="Beginner">🟢 Beginner</button>
        <button class="diff-filter ${currentDifficulty==='Intermediate'?'active':''}" data-diff="Intermediate">🟡 Intermediate</button>
        <button class="diff-filter ${currentDifficulty==='Advanced'?'active':''}" data-diff="Advanced">🔴 Advanced</button>
      </div>
      <div class="sort-bar">
        <span>Sort:</span>
        <select id="sortSelect">
          <option value="stars" ${currentSort==='stars'?'selected':''}>⭐ Stars</option>
          <option value="name" ${currentSort==='name'?'selected':''}>🔤 Name</option>
          <option value="recent" ${currentSort==='recent'?'selected':''}>🕐 Recently Updated</option>
        </select>
        <span style="margin-left:auto">${sorted.length} projects</span>
      </div>
      <div class="project-list">
        ${sorted.map(r => projectCard(r)).join('')}
      </div>
    `;

    // Bind sub-category tabs
    app.querySelectorAll('.subcat-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        currentSubCat = btn.dataset.sub;
        renderCategory(catId);
      });
    });

    // Bind difficulty filters
    app.querySelectorAll('.diff-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        currentDifficulty = btn.dataset.diff;
        renderCategory(catId);
      });
    });

    // Bind sort
    document.getElementById('sortSelect').addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderCategory(catId);
    });

    // Bind unlock buttons
    bindUnlockButtons();
  }

  // ===== Bind Unlock Buttons =====
  function bindUnlockButtons() {
    app.querySelectorAll('.unlock-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.project-card');
        const repoName = card.dataset.repo;
        const repoCat = card.dataset.cat;
        await trackUnlock(repoName, repoCat);
        // Re-render the card
        const repo = findRepo(repoName);
        if (repo) {
          card.outerHTML = projectCard(repo);
          bindUnlockButtons();
        }
      });
    });
  }

  // ===== Find Repo by Name =====
  function findRepo(repoName) {
    for (const cat of catalogData.categories) {
      const found = cat.repos.find(r => r.n === repoName);
      if (found) return found;
    }
    return null;
  }

  // ===== Render: Search =====
  function renderSearch(query) {
    currentView = 'search';
    if (!query.trim()) {
      app.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>Enter keywords to search projects</p></div>';
      return;
    }

    const q = query.toLowerCase();
    const results = [];
    for (const cat of catalogData.categories) {
      for (const r of cat.repos) {
        if (matchRepo(r, q)) {
          results.push({...r, _cat: cat.display, _catId: cat.id});
        }
      }
    }

    const sorted = sortRepos(results);

    app.innerHTML = `
      <div class="category-header">
        <a href="#/" class="back-link">← Home</a>
      </div>
      <div class="search-info">
        Search "<strong>${escHtml(query)}</strong>" found <strong>${sorted.length}</strong> projects
      </div>
      ${sorted.length === 0
        ? '<div class="empty-state"><div class="icon">🤷</div><p>No matches found. Try different keywords.</p></div>'
        : `<div class="project-list">${sorted.map(r => projectCard(r, true)).join('')}</div>`
      }
    `;
    bindUnlockButtons();
  }

  // ===== Helpers =====
  function getFilteredRepos(cat) {
    let repos = cat.repos;
    if (currentSubCat !== 'all') {
      repos = repos.filter(r => r.sc === currentSubCat);
    }
    if (currentDifficulty !== 'all') {
      repos = repos.filter(r => {
        const tags = getRepoTags(r.n);
        return tags.difficulty === currentDifficulty;
      });
    }
    return repos;
  }

  function sortRepos(repos) {
    const arr = [...repos];
    switch(currentSort) {
      case 'stars': return arr.sort((a,b) => (b.s||0) - (a.s||0));
      case 'name': return arr.sort((a,b) => a.n.localeCompare(b.n));
      case 'recent': return arr.sort((a,b) => (b.p||'').localeCompare(a.p||''));
      default: return arr;
    }
  }

  function matchRepo(r, q) {
    const fields = [r.n, r.d, r.l, r.t, r.sc].join(' ').toLowerCase();
    return fields.includes(q);
  }

  function projectCard(r, showCat) {
    const langClass = getLangClass(r.l);
    const shortName = r.n.split('/')[1] || r.n;
    const tags = getRepoTags(r.n);
    const isLocked = (tags.special === 'Niche' || tags.special === 'Commercial') && !unlockedRepos.has(r.n);
    const cardClass = isLocked ? 'project-card locked' : 'project-card';
    const catId = r._catId || (currentCategory ? currentCategory.id : '');

    // Difficulty tags
    let diffTag = '';
    if (tags.difficulty) {
      const diffMap = {
        'Beginner': {icon:'🟢', cls:'tag-easy'},
        'Intermediate': {icon:'🟡', cls:'tag-medium'},
        'Advanced': {icon:'🔴', cls:'tag-hard'}
      };
      const d = diffMap[tags.difficulty];
      if (d) diffTag = `<span class="diff-tag ${d.cls}">${d.icon} ${tags.difficulty}</span>`;
    }

    // Special tags
    let specialTag = '';
    if (tags.special) {
      const spMap = {
        'Niche': {icon:'⚠️', cls:'tag-edge'},
        'Commercial': {icon:'💰', cls:'tag-commercial'}
      };
      const s = spMap[tags.special];
      if (s) specialTag = `<span class="special-tag ${s.cls}">${s.icon} ${tags.special}</span>`;
    }

    return `
      <div class="${cardClass}" data-repo="${escHtml(r.n)}" data-cat="${escHtml(catId)}">
        ${isLocked ? '<div class="lock-overlay"><button class="unlock-btn">🔓 Click to Unlock</button><p class="lock-hint">Unlock to view details</p></div>' : ''}
        <div class="project-card-top">
          <span class="project-name">
            ${isLocked 
              ? `<span class="blurred-name">${escHtml(shortName)}</span>`
              : `<a href="${r.u}" target="_blank" rel="noopener">${escHtml(shortName)}</a>`
            }
            <span style="color:var(--gray-400);font-weight:400;font-size:.75rem"> / ${escHtml(r.n.split('/')[0]||'')}</span>
            ${diffTag}${specialTag}
          </span>
          <span class="project-stars">⭐ ${r.sf}</span>
        </div>
        <div class="project-desc ${isLocked ? 'blurred' : ''}">${escHtml(r.d)}</div>
        <div class="project-meta ${isLocked ? 'blurred' : ''}">
          ${r.l ? `<span><span class="lang-dot ${langClass}"></span>${escHtml(r.l)}</span>` : ''}
          <span class="subcat-tag">${escHtml(r.sc)}</span>
          ${showCat ? `<span>${escHtml(r._cat||'')}</span>` : ''}
          ${r.p ? `<span>Updated ${r.p}</span>` : ''}
          ${!isLocked ? `<a href="${r.u}" target="_blank" rel="noopener" class="project-link">GitHub ↗</a>` : ''}
        </div>
      </div>
    `;
  }

  function getLangClass(lang) {
    if (!lang) return 'lang-default';
    const map = {
      'JavaScript':'lang-js','TypeScript':'lang-ts','Python':'lang-py',
      'Go':'lang-go','Rust':'lang-rust','Java':'lang-java',
      'C':'lang-c','C++':'lang-cpp','C#':'lang-cpp',
      'Ruby':'lang-ruby','PHP':'lang-php','Swift':'lang-swift',
      'Kotlin':'lang-kotlin','Dart':'lang-dart','Shell':'lang-shell',
      'Vue':'lang-vue','HTML':'lang-html','CSS':'lang-css',
      'Scala':'lang-scala','Lua':'lang-lua','R':'lang-r',
      'Jupyter Notebook':'lang-jupyter',
    };
    return map[lang] || 'lang-default';
  }

  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function debounce(fn, ms) {
    let t;
    return function() {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), ms);
    };
  }

  function onSearch() {
    const q = searchInput.value.trim();
    if (q) {
      window.location.hash = '#/search?q=' + encodeURIComponent(q);
    } else {
      window.location.hash = '#/';
    }
  }

  function onKeyDown(e) {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      searchInput.blur();
    }
  }

  // ===== Start =====
  loadData();
})();
