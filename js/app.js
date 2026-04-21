/**
 * 开源地图 - SPA Application
 */
(function() {
  'use strict';

  // ===== State =====
  let catalogData = null;
  let currentView = 'home';
  let currentCategory = null;
  let currentSubCat = 'all';
  let currentSort = 'stars';

  // ===== DOM =====
  const app = document.getElementById('app');
  const searchInput = document.getElementById('searchInput');

  // ===== Data Loading =====
  async function loadData() {
    try {
      const res = await fetch('data/catalog.json');
      catalogData = await res.json();
      init();
    } catch(e) {
      app.innerHTML = '<div class="empty-state"><div class="icon">😞</div><p>数据加载失败，请刷新重试</p></div>';
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

  // ===== Render: Home =====
  function renderHome() {
    currentView = 'home';
    const cats = catalogData.categories;
    const total = catalogData.totalRepos;

    app.innerHTML = `
      <div class="hero">
        <h1>🗺️ 开源地图</h1>
        <p>按你的需求，找到 GitHub 上的答案</p>
      </div>
      <div class="stats-bar">
        <div class="stat-item"><div class="stat-num">${total.toLocaleString()}</div><div class="stat-label">开源项目</div></div>
        <div class="stat-item"><div class="stat-num">${cats.length}</div><div class="stat-label">分类</div></div>
        <div class="stat-item"><div class="stat-num">GitHub</div><div class="stat-label">数据来源</div></div>
      </div>
      <div class="category-grid">
        ${cats.map(c => `
          <a href="#/category/${c.id}" class="category-card">
            <div class="category-icon">${c.icon}</div>
            <div class="category-info">
              <h3>${c.display}</h3>
              <span>${c.count} 个项目</span>
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
        <a href="#/" class="back-link">← 返回首页</a>
        <div class="category-title">
          <span class="icon">${cat.icon}</span>
          <h1>${cat.display}</h1>
        </div>
      </div>
      <div class="subcat-tabs">
        <button class="subcat-tab ${currentSubCat==='all'?'active':''}" data-sub="all">全部 (${cat.count})</button>
        ${cat.subCategories.map(sc => {
          const cnt = cat.repos.filter(r => r.sc === sc).length;
          return `<button class="subcat-tab ${currentSubCat===sc?'active':''}" data-sub="${sc}">${sc} (${cnt})</button>`;
        }).join('')}
      </div>
      <div class="sort-bar">
        <span>排序：</span>
        <select id="sortSelect">
          <option value="stars" ${currentSort==='stars'?'selected':''}>⭐ Star 数</option>
          <option value="name" ${currentSort==='name'?'selected':''}>🔤 名称</option>
          <option value="recent" ${currentSort==='recent'?'selected':''}>🕐 最近更新</option>
        </select>
        <span style="margin-left:auto">${sorted.length} 个项目</span>
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

    // Bind sort
    document.getElementById('sortSelect').addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderCategory(catId);
    });
  }

  // ===== Render: Search =====
  function renderSearch(query) {
    currentView = 'search';
    if (!query.trim()) {
      app.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>输入关键词搜索开源项目</p></div>';
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
        <a href="#/" class="back-link">← 返回首页</a>
      </div>
      <div class="search-info">
        搜索 "<strong>${escHtml(query)}</strong>" 找到 <strong>${sorted.length}</strong> 个项目
      </div>
      ${sorted.length === 0
        ? '<div class="empty-state"><div class="icon">🤷</div><p>没有找到匹配的项目，换个关键词试试</p></div>'
        : `<div class="project-list">${sorted.map(r => projectCard(r, true)).join('')}</div>`
      }
    `;
  }

  // ===== Helpers =====
  function getFilteredRepos(cat) {
    if (currentSubCat === 'all') return cat.repos;
    return cat.repos.filter(r => r.sc === currentSubCat);
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
    return `
      <div class="project-card">
        <div class="project-card-top">
          <span class="project-name">
            <a href="${r.u}" target="_blank" rel="noopener">${escHtml(shortName)}</a>
            <span style="color:var(--gray-400);font-weight:400;font-size:.75rem"> / ${escHtml(r.n.split('/')[0]||'')}</span>
          </span>
          <span class="project-stars">⭐ ${r.sf}</span>
        </div>
        <div class="project-desc">${escHtml(r.d)}</div>
        <div class="project-meta">
          ${r.l ? `<span><span class="lang-dot ${langClass}"></span>${escHtml(r.l)}</span>` : ''}
          <span class="subcat-tag">${escHtml(r.sc)}</span>
          ${showCat ? `<span>${escHtml(r._cat||'')}</span>` : ''}
          ${r.p ? `<span>更新于 ${r.p}</span>` : ''}
          <a href="${r.u}" target="_blank" rel="noopener" class="project-link">GitHub ↗</a>
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
