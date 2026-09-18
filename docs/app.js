(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const esc = (v = '') =>
    String(v).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const A = v => Array.isArray(v) ? v : [];

  const F = (...v) =>
    v.find(x => x !== undefined && x !== null && x !== '');

  const S = {
    data: {},
    clusters: [],
    brief: [],
    view: 'brief',
    category: null,
    saved: new Set(
      JSON.parse(localStorage.getItem('di:saved') || '[]')
    ),
    lastVisit: localStorage.getItem('di:lastVisit')
  };

  const catMap = {
    'Macro Economics': 'Economy & Policy',
    'Business & Micro': 'Business'
  };

  const key = c =>
    String(
      F(
        c.cluster_key,
        c.id,
        c.primary?.url,
        c.url,
        c.title,
        ''
      )
    );

  const score = c =>
    Number(
      F(
        c.importance,
        c.signal_score,
        c.primary?.signal_score,
        0
      )
    ) || 0;

  const category = c =>
    F(
      c.category,
      c.primary?.category,
      c.primary?.base_category,
      'General'
    );

  const displayCat = c =>
    catMap[category(c)] || category(c);

  const desc = c =>
    F(
      c.brief,
      c.description,
      c.primary?.description,
      A(c.articles)[0]?.description,
      ''
    );

  const url = c =>
    F(
      c.primary?.url,
      c.url,
      A(c.articles)[0]?.url,
      '#'
    );

  const source = c =>
    F(
      c.primary?.source,
      c.primary_source,
      A(c.sources)[0]?.source,
      A(c.sources)[0]?.name,
      typeof A(c.sources)[0] === 'string'
        ? A(c.sources)[0]
        : null,
      A(c.articles)[0]?.source,
      'Source'
    );

  const date = c =>
    F(
      c.published_at,
      c.primary?.published_at,
      A(c.articles)[0]?.published_at
    );

  const label = c => {
    const x = String(
      F(c.importance_label, '')
    ).toLowerCase();

    if (x.includes('critical')) return 'Critical';
    if (x.includes('significant')) return 'Significant';
    if (x.includes('noteworthy')) return 'Noteworthy';

    return score(c) >= 70
      ? 'Critical'
      : score(c) >= 43
        ? 'Significant'
        : 'Noteworthy';
  };

  const ago = v => {
    if (!v) return '';

    const d = new Date(v);

    if (Number.isNaN(d.getTime())) return '';

    const m = Math.max(
      1,
      Math.floor((Date.now() - d.getTime()) / 60000)
    );

    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;

    return `${Math.floor(m / 1440)}d ago`;
  };

  const count = c =>
    Number(c.source_count) ||
    A(c.sources).length ||
    A(c.articles).length ||
    1;

  function clustersOf(d) {
    for (const k of [
      'clusters',
      'events',
      'items',
      'stories',
      'developments',
      'news'
    ]) {
      if (A(d[k]).length) return d[k];
    }

    for (const v of Object.values(d || {})) {
      if (
        A(v).length &&
        typeof v[0] === 'object' &&
        (
          'title' in v[0] ||
          'cluster_key' in v[0]
        )
      ) {
        return v;
      }
    }

    return [];
  }

  function briefOf(d, cs) {
    for (const k of [
      'brief',
      'daily_brief',
      'top_stories',
      'must_know'
    ]) {
      const b = d[k];

      if (!A(b).length) continue;

      if (typeof b[0] === 'object') {
        return b;
      }

      const ids = new Set(b.map(String));

      const matched = cs.filter(c =>
        ids.has(key(c))
      );

      if (matched.length) {
        return matched;
      }
    }

    return [...cs]
      .sort((a, b) => score(b) - score(a))
      .slice(0, 8);
  }

  function visualClass(c) {
    const t =
      `${displayCat(c)} ${c.title || ''}`.toLowerCase();

    if (
      /market|econom|business|rbi|bank|stock|ipo/.test(t)
    ) {
      return 'market';
    }

    if (
      /ai|tech|compute|chip|digital/.test(t)
    ) {
      return 'tech';
    }

    if (
      /world|geo|war|china|russia|united states|us /.test(t)
    ) {
      return 'world';
    }

    if (
      /science|climate|space|research/.test(t)
    ) {
      return 'science';
    }

    return 'india';
  }

  function meta(c) {
    const n = count(c);

    return `${esc(source(c))} · ${esc(ago(date(c)))} · ${n} source${n === 1 ? '' : 's'}`;
  }

  function saveBtn(c) {
    const k = key(c);
    const on = S.saved.has(k);

    return `
      <button
        class="bookmark ${on ? 'saved' : ''}"
        data-save="${esc(k)}"
        aria-label="Save story"
      >
        ${on ? '★' : '☆'}
      </button>
    `;
  }

  function visual(c, small = false) {
    return `
      <div
        class="editorial-visual ${visualClass(c)} ${small ? 'small' : ''}"
        aria-hidden="true"
      >
        <span>${esc(displayCat(c))}</span>
        <i></i>
        <b>DI</b>
      </div>
    `;
  }

  function storyLink(c) {
    return `
      <a
        href="${esc(url(c))}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${esc(c.title || 'Untitled')}
      </a>
    `;
  }

  function storyLabel(c) {
    return `
      <div class="story-label">
        <span class="dot ${label(c).toLowerCase()}"></span>
        ${esc(label(c))}
        <em>${esc(displayCat(c))}</em>
      </div>
    `;
  }

  function lead(c) {
    return `
      <article class="lead-card">
        ${visual(c)}

        <div class="lead-copy">
          ${storyLabel(c)}

          <h2>${storyLink(c)}</h2>

          ${
            desc(c)
              ? `<p>${esc(desc(c))}</p>`
              : ''
          }

          <div class="meta">
            ${meta(c)}
            ${saveBtn(c)}
          </div>
        </div>
      </article>
    `;
  }

  function secondary(c) {
    return `
      <article class="secondary-card">
        <div class="secondary-copy">
          ${storyLabel(c)}

          <h3>${storyLink(c)}</h3>

          <div class="meta">
            ${meta(c)}
            ${saveBtn(c)}
          </div>
        </div>

        ${visual(c, true)}
      </article>
    `;
  }

  function signal(c) {
    return `
      <article class="signal-row">
        <div>
          ${storyLabel(c)}

          <h3>${storyLink(c)}</h3>

          ${
            desc(c)
              ? `<p>${esc(desc(c))}</p>`
              : ''
          }

          <div class="meta">${meta(c)}</div>
        </div>

        ${saveBtn(c)}
      </article>
    `;
  }

  function setHeader(eyebrow, title, sub) {
    $('#eyebrow').textContent = eyebrow;
    $('#pageTitle').textContent = title;
    $('#pageDescription').textContent = sub;
  }

  function active(view, cat) {
    $$('[data-view], [data-category]').forEach(x => {
      x.classList.toggle(
        'active',
        cat
          ? x.dataset.category === cat
          : x.dataset.view === view
      );
    });
  }

  function sincePanel() {
    const cut = S.lastVisit
      ? new Date(S.lastVisit).getTime()
      : Date.now() - 86400000;

    const n = S.clusters.filter(c =>
      new Date(date(c)).getTime() > cut
    ).length;

    $('#sinceSummary').textContent =
      `${n} new developments since your last check`;
  }

  function rail() {
    const dev = S.clusters.filter(c =>
      c.is_developing === true ||
      String(c.is_developing) === 'true'
    ).length;

    const articles =
      Number(S.data.article_count) ||
      S.clusters.reduce(
        (n, c) =>
          n + Math.max(1, A(c.articles).length),
        0
      );

    const events =
      Number(S.data.cluster_count) ||
      S.clusters.length;

    $('#contextRail').innerHTML = `
      <section class="rail-card">
        <h3>Today at a glance</h3>

        <div class="rail-stat">
          <b>${S.brief.length}</b>
          <span>in today's brief</span>
        </div>

        <div class="rail-stat">
          <b>${dev}</b>
          <span>developing stories</span>
        </div>

        <div class="rail-stat">
          <b>${articles}</b>
          <span>articles scanned</span>
        </div>

        <div class="rail-stat">
          <b>${events}</b>
          <span>events clustered</span>
        </div>
      </section>

      <section class="rail-card explore">
        <h3>Explore by topic →</h3>

        <button data-category="India">India</button>
        <button data-view="markets">Markets</button>
        <button data-category="AI">AI</button>
        <button data-category="Macro Economics">Economy</button>
        <button data-category="Geopolitics">Geopolitics</button>
        <button data-category="Technology">Technology</button>
        <button data-category="Science & Climate">Climate</button>
      </section>

      <div class="rail-note">
        ❧
        <span>
          Less noise.<br>
          A more informed you.
        </span>
      </div>
    `;
  }

  function renderBrief() {
    S.view = 'brief';
    S.category = null;

    active('brief');

    setHeader(
      "TODAY'S BRIEF",
      `${Math.min(S.brief.length, 8)} developments worth your attention`,
      "A focused view on what's important in India, the world and beyond."
    );

    $('#sincePanel').hidden = false;
    $('#contextRail').hidden = false;

    const b = S.brief.slice(0, 8);

    if (!b.length) {
      $('#contentView').innerHTML = `
        <div class="empty">
          <h2>No brief yet</h2>
          <p>
            No stories met the current signal threshold.
          </p>
        </div>
      `;

      rail();
      return;
    }

    $('#contentView').innerHTML = `
      <div class="brief-editorial">

        ${lead(b[0])}

        ${
          b.length > 1
            ? `
              <h2 class="subsection-title">
                Other important developments
              </h2>

              <div class="secondary-grid">
                ${b.slice(1, 5).map(secondary).join('')}
              </div>
            `
            : ''
        }

        ${
          b.length > 5
            ? `
              <div class="signals-head">
                <span>●</span>
                TODAY'S SIGNALS
              </div>

              <div class="signal-list">
                ${b.slice(5).map(signal).join('')}
              </div>
            `
            : ''
        }

      </div>
    `;

    rail();
  }

  function categoryItems(cat) {
    const display = catMap[cat] || cat;

    return S.clusters
      .filter(c =>
        category(c) === cat ||
        displayCat(c) === display
      )
      .sort((a, b) => score(b) - score(a));
  }

  function renderCategory(cat) {
    S.view = 'category';
    S.category = cat;

    active(null, cat);

    const display = catMap[cat] || cat;
    const items = categoryItems(cat);

    setHeader(
      `${display.toUpperCase()} / TODAY / ${items.length} DEVELOPMENTS`,
      display,
      `Key ${display.toLowerCase()} developments that matter.`
    );

    $('#sincePanel').hidden = true;
    $('#contextRail').hidden = false;

    if (!items.length) {
      $('#contentView').innerHTML = `
        <div class="empty category-empty">
          <div class="empty-icon">⌂</div>

          <h2>
            No significant developments<br>
            since your last briefing.
          </h2>

          <p>
            We're continuously scanning trusted sources.<br>
            If something important happens, it will appear here.
          </p>

          <button data-view="brief">
            Back to The Brief
          </button>
        </div>
      `;

      rail();
      return;
    }

    $('#contentView').innerHTML = `
      <div class="category-editorial">

        ${lead(items[0])}

        ${
          items.length > 1
            ? `
              <div class="secondary-grid category-secondary">
                ${items.slice(1, 3).map(secondary).join('')}
              </div>
            `
            : ''
        }

        ${
          items.length > 3
            ? `
              <div class="signals-head">
                SIGNAL STREAM
              </div>

              <div class="signal-list">
                ${items.slice(3, 30).map(signal).join('')}
              </div>
            `
            : ''
        }

      </div>
    `;

    rail();
  }

  function isMarket(c) {
    const text =
      `${category(c)} ${c.title || ''} ${desc(c)} ${A(c.market_channels).join(' ')}`
        .toLowerCase();

    return (
      /market|nifty|sensex|sebi|rbi|ipo|stock|equity|mutual fund|fii|dii|rupee|bond|yield|crude|opec|fed|dollar|bank/.test(text) ||
      Boolean(c.market_impact)
    );
  }

  function renderMarkets() {
    S.view = 'markets';
    S.category = null;

    active('markets');

    setHeader(
      'MARKETS',
      'Markets',
      'Key developments moving Indian markets.'
    );

    $('#sincePanel').hidden = true;
    $('#contextRail').hidden = true;

    const items = S.clusters
      .filter(isMarket)
      .sort((a, b) => score(b) - score(a));

    const india = items.filter(c =>
      !/fed|china|opec|dollar|treasury|global|united states|us /.test(
        `${c.title || ''} ${desc(c)}`.toLowerCase()
      )
    );

    const global = items.filter(c =>
      !india.includes(c)
    );

    const ipo = items.filter(c =>
      /\bipo\b|initial public offering/.test(
        `${c.title || ''} ${desc(c)}`.toLowerCase()
      )
    );

    const companies = items.filter(c =>
      /company|companies|earnings|acquisition|merger|buyback|order|stock|shares/.test(
        `${c.title || ''} ${desc(c)}`.toLowerCase()
      )
    );

    const funds = items.filter(c =>
      /mutual fund|amfi|\bsip\b/.test(
        `${c.title || ''} ${desc(c)}`.toLowerCase()
      )
    );

    $('#contentView').innerHTML = `
      <div class="markets-page">

        <nav class="market-tabs">
          <b>Overview</b>
          <span>India Today</span>
          <span>Global → India</span>
          <span>IPOs</span>
          <span>Stocks & Companies</span>
          <span>Mutual Funds</span>
        </nav>

        ${
          items[0]
            ? lead(items[0])
            : `
              <div class="empty">
                <h2>No major market developments.</h2>
              </div>
            `
        }

        <div class="market-columns">

          <section>
            <h2>India Today</h2>

            ${india.slice(1, 5).map(c => `
              <div class="market-line">
                <h3>${storyLink(c)}</h3>
                <div class="meta">${meta(c)}</div>
              </div>
            `).join('')}
          </section>

          <section>
            <h2>Global → India</h2>

            ${global.slice(0, 4).map(c => `
              <div class="market-line">
                <h3>${storyLink(c)}</h3>
                <div class="meta">${meta(c)}</div>
              </div>
            `).join('')}
          </section>

        </div>

        <div class="market-bottom">

          <section>
            <h2>IPOs</h2>

            ${
              ipo.length
                ? ipo.slice(0, 3).map(c => `
                    <div class="mini-line">
                      ${storyLink(c)}
                    </div>
                  `).join('')
                : '<p>No high-signal IPO developments.</p>'
            }
          </section>

          <section>
            <h2>Stocks & Companies</h2>

            ${
              companies.length
                ? companies.slice(0, 3).map(c => `
                    <div class="mini-line">
                      ${storyLink(c)}
                    </div>
                  `).join('')
                : '<p>No high-signal company developments.</p>'
            }
          </section>

          <section>
            <h2>Mutual Funds</h2>

            ${
              funds.length
                ? funds.slice(0, 3).map(c => `
                    <div class="mini-line">
                      ${storyLink(c)}
                    </div>
                  `).join('')
                : '<p>No high-signal mutual fund developments.</p>'
            }
          </section>

        </div>

      </div>
    `;
  }

  function renderDeveloping() {
    S.view = 'developing';

    active('developing');

    setHeader(
      'LIVE',
      'Developing',
      'Events that are still moving.'
    );

    $('#sincePanel').hidden = true;
    $('#contextRail').hidden = true;

    const items = S.clusters
      .filter(c =>
        c.is_developing === true ||
        String(c.is_developing) === 'true'
      )
      .sort(
        (a, b) =>
          new Date(date(b)) -
          new Date(date(a))
      );

    $('#contentView').innerHTML = `
      <div class="developing-stream">

        ${
          items.length
            ? items.slice(0, 30).map(c => `
                <article>
                  <time>${ago(date(c))}</time>
                  <i></i>

                  <div>
                    <h3>${storyLink(c)}</h3>
                    <span>Developing</span>
                  </div>
                </article>
              `).join('')
            : `
              <div class="empty">
                <h2>No developing stories right now.</h2>
              </div>
            `
        }

      </div>
    `;
  }

  function renderSince() {
    S.view = 'since';

    active('since');

    setHeader(
      'TODAY',
      'Since Last Check',
      'What changed since your previous visit.'
    );

    $('#sincePanel').hidden = true;
    $('#contextRail').hidden = false;

    const cut = S.lastVisit
      ? new Date(S.lastVisit).getTime()
      : Date.now() - 86400000;

    const items = S.clusters
      .filter(c =>
        new Date(date(c)).getTime() > cut
      )
      .sort(
        (a, b) =>
          new Date(date(b)) -
          new Date(date(a))
      );

    $('#contentView').innerHTML = `
      <div class="signal-list">
        ${items.slice(0, 40).map(signal).join('')}
      </div>
    `;

    rail();
  }

  function renderSaved() {
    S.view = 'saved';

    active('saved');

    setHeader(
      'LIBRARY',
      'Saved',
      'Stories you bookmarked.'
    );

    $('#sincePanel').hidden = true;
    $('#contextRail').hidden = true;

    const items = S.clusters.filter(c =>
      S.saved.has(key(c))
    );

    $('#contentView').innerHTML = items.length
      ? `
        <div class="signal-list">
          ${items.map(signal).join('')}
        </div>
      `
      : `
        <div class="empty">
          <h2>Nothing saved yet.</h2>
          <p>
            Bookmark a story to keep it here.
          </p>
        </div>
      `;
  }

  function renderExplore() {
    S.view = 'explore';

    active('explore');

    setHeader(
      'EXPLORE',
      'Explore',
      'Browse intelligence by topic.'
    );

    $('#sincePanel').hidden = true;
    $('#contextRail').hidden = true;

    const cats = [
      'India',
      'Indian Politics',
      'Macro Economics',
      'Business & Micro',
      'Markets',
      'World',
      'Geopolitics',
      'World Politics',
      'AI',
      'Technology',
      'Science & Climate'
    ];

    $('#contentView').innerHTML = `
      <div class="explore-page">

        ${cats.map(x => `
          <button
            ${
              x === 'Markets'
                ? 'data-view="markets"'
                : `data-category="${esc(x)}"`
            }
          >
            ${esc(catMap[x] || x)}
            <span>›</span>
          </button>
        `).join('')}

      </div>
    `;
  }

  function renderSources() {
    S.view = 'sources';

    active('sources');

    setHeader(
      'COVERAGE',
      'Sources',
      'Publishers represented in the current intelligence set.'
    );

    $('#sincePanel').hidden = true;
    $('#contextRail').hidden = true;

    const map = new Map();

    S.clusters.forEach(c => {
      const name = source(c);
      map.set(name, (map.get(name) || 0) + 1);
    });

    $('#contentView').innerHTML = `
      <div class="source-page">

        ${
          [...map]
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => `
              <div>
                <b>${esc(name)}</b>
                <span>${n} items</span>
              </div>
            `)
            .join('')
        }

      </div>
    `;
  }

  function renderArchives() {
    S.view = 'archives';

    active('archives');

    setHeader(
      'LIBRARY',
      'Archives',
      'Previous Daily Intelligence briefings.'
    );

    $('#sincePanel').hidden = true;
    $('#contextRail').hidden = true;

    $('#contentView').innerHTML = `
      <div class="empty">
        <h2>Archives</h2>
        <p>
          Previous generated briefings will appear here.
        </p>
      </div>
    `;
  }

  function navigate(view, cat) {
    closeMenu();

    if (cat) {
      renderCategory(cat);
      window.scrollTo(0, 0);
      return;
    }

    const routes = {
      brief: renderBrief,
      since: renderSince,
      developing: renderDeveloping,
      markets: renderMarkets,
      saved: renderSaved,
      archives: renderArchives,
      sources: renderSources,
      explore: renderExplore
    };

    (routes[view] || renderBrief)();

    window.scrollTo(0, 0);
  }

  function closeMenu() {
    document.body.classList.remove('menu-open');
  }

  function toggleTheme() {
    const dark =
      document.documentElement.dataset.theme === 'dark';

    document.documentElement.dataset.theme =
      dark ? 'light' : 'dark';

    localStorage.setItem(
      'di:theme',
      dark ? 'light' : 'dark'
    );
  }

  function bind() {
    document.addEventListener('click', e => {
      const save = e.target.closest('[data-save]');

      if (save) {
        e.preventDefault();

        const k = save.dataset.save;

        if (S.saved.has(k)) {
          S.saved.delete(k);
        } else {
          S.saved.add(k);
        }

        localStorage.setItem(
          'di:saved',
          JSON.stringify([...S.saved])
        );

        save.textContent =
          S.saved.has(k) ? '★' : '☆';

        save.classList.toggle(
          'saved',
          S.saved.has(k)
        );

        return;
      }

      const cat = e.target.closest('[data-category]');

      if (cat) {
        e.preventDefault();
        navigate(null, cat.dataset.category);
        return;
      }

      const view = e.target.closest('[data-view]');

      if (view) {
        e.preventDefault();
        navigate(view.dataset.view);
      }
    });

    $('#openMenu')?.addEventListener(
      'click',
      () => document.body.classList.add('menu-open')
    );

    $('#menuOverlay')?.addEventListener(
      'click',
      closeMenu
    );

    $('#closeMenu')?.addEventListener(
      'click',
      closeMenu
    );

    $('#themeButton')?.addEventListener(
      'click',
      toggleTheme
    );

    $('#sidebarThemeButton')?.addEventListener(
      'click',
      toggleTheme
    );

    const toggleSearch = () => {
      $('#searchPanel')?.classList.toggle('hidden');

      setTimeout(() => {
        $('#searchInput')?.focus();
      }, 0);
    };

    $('#searchButton')?.addEventListener(
      'click',
      toggleSearch
    );

    $('#desktopSearchTrigger')?.addEventListener(
      'click',
      toggleSearch
    );

    $('#closeSearch')?.addEventListener(
      'click',
      () => $('#searchPanel')?.classList.add('hidden')
    );

    $('#searchInput')?.addEventListener(
      'keydown',
      e => {
        if (e.key !== 'Enter') return;

        const raw = e.target.value.trim();
        const q = raw.toLowerCase();

        if (!q) return;

        setHeader(
          'SEARCH',
          `Results for “${raw}”`,
          'Across the current intelligence set.'
        );

        $('#sincePanel').hidden = true;
        $('#contextRail').hidden = true;

        const items = S.clusters.filter(c =>
          `${c.title || ''} ${desc(c)} ${source(c)} ${displayCat(c)}`
            .toLowerCase()
            .includes(q)
        );

        $('#contentView').innerHTML = items.length
          ? `
            <div class="signal-list">
              ${items.slice(0, 50).map(signal).join('')}
            </div>
          `
          : `
            <div class="empty">
              <h2>No matching developments.</h2>
            </div>
          `;

        $('#searchPanel').classList.add('hidden');
      }
    );
  }

  async function boot() {
    if (
      localStorage.getItem('di:theme') === 'dark'
    ) {
      document.documentElement.dataset.theme = 'dark';
    }

    bind();

    try {
      const response = await fetch(
        './data/latest.json?ts=' + Date.now(),
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error(
          `latest.json returned HTTP ${response.status}`
        );
      }

      S.data = await response.json();
      S.clusters = clustersOf(S.data);

      if (!S.clusters.length) {
        throw new Error(
          'No story array found in latest.json'
        );
      }

      S.brief = briefOf(
        S.data,
        S.clusters
      );

      const generated = F(
        S.data.generated_at,
        S.data.metadata?.generated_at
      );

      $('#topbarDate').textContent =
        new Intl.DateTimeFormat(
          'en-IN',
          {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          }
        ).format(new Date());

      $('#topbarUpdated').textContent =
        generated
          ? `Last updated ${ago(generated)}`
          : 'Data loaded';

      $('#sidebarStatus').textContent =
        `${S.clusters.length} events loaded`;

      $('#healthDot')?.classList.add('healthy');
      $('#sidebarHealthDot')?.classList.add('healthy');

      sincePanel();
      renderBrief();

      localStorage.setItem(
        'di:lastVisit',
        new Date().toISOString()
      );

    } catch (e) {
      console.error(
        'Daily Intelligence failed:',
        e
      );

      $('#contentView').innerHTML = `
        <div class="empty">
          <h2>
            Could not load Daily Intelligence
          </h2>
          <p>${esc(e.message)}</p>
        </div>
      `;

      $('#sidebarStatus').textContent =
        'Data unavailable';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      boot,
      { once: true }
    );
  } else {
    boot();
  }
})();
