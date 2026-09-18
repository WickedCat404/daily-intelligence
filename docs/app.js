(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const esc = (v = '') =>
    String(v).replace(/[&<>'"]/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[c]));

  const state = {
    data: null,
    clusters: [],
    brief: [],
    view: 'brief',
    category: null,
    query: '',
    saved: new Set(
      JSON.parse(localStorage.getItem('di:saved') || '[]')
    ),
    lastVisit: localStorage.getItem('di:lastVisit') || null
  };

  const categoryNames = {
    'Macro Economics': 'Economy & Policy',
    'Business & Micro': 'Business'
  };

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function first(...values) {
    return values.find(
      v => v !== undefined && v !== null && v !== ''
    );
  }

  function keyOf(c) {
    return String(
      first(
        c.cluster_key,
        c.id,
        c.primary?.url,
        c.url,
        c.title,
        ''
      )
    );
  }

  function sourceOf(c) {
    return first(
      c.primary?.source,
      c.primary_source,
      arr(c.sources)[0]?.source,
      arr(c.sources)[0]?.name,
      arr(c.sources)[0],
      'Unknown source'
    );
  }

  function urlOf(c) {
    return first(
      c.primary?.url,
      c.url,
      arr(c.articles)[0]?.url,
      '#'
    );
  }

  function textOf(c) {
    return first(
      c.brief,
      c.description,
      c.primary?.description,
      arr(c.articles)[0]?.description,
      ''
    );
  }

  function labelOf(c) {
    const raw = String(
      first(c.importance_label, '')
    ).toLowerCase();

    if (raw.includes('critical')) {
      return 'Critical';
    }

    if (raw.includes('significant')) {
      return 'Significant';
    }

    if (raw.includes('noteworthy')) {
      return 'Noteworthy';
    }

    const score = num(
      c.importance,
      num(c.signal_score, 0)
    );

    if (score >= 70) {
      return 'Critical';
    }

    if (score >= 43) {
      return 'Significant';
    }

    return 'Noteworthy';
  }

  function scoreOf(c) {
    return num(
      c.importance,
      num(
        c.signal_score,
        num(c.primary?.signal_score, 0)
      )
    );
  }

  function dateOf(c) {
    return first(
      c.published_at,
      c.primary?.published_at,
      arr(c.articles)[0]?.published_at
    );
  }

  function categoryOf(c) {
    return first(
      c.category,
      c.primary?.category,
      c.primary?.base_category,
      'General'
    );
  }

  function displayCategory(c) {
    return categoryNames[categoryOf(c)] || categoryOf(c);
  }

  /*
   * latest.json has changed shape during development.
   * This deliberately looks for the known story arrays
   * rather than assuming one exact top-level property.
   */
  function findClusterArray(data) {
    const candidates = [
      data.clusters,
      data.events,
      data.items,
      data.stories,
      data.developments,
      data.news
    ];

    for (const candidate of candidates) {
      if (
        Array.isArray(candidate) &&
        candidate.length
      ) {
        return candidate;
      }
    }

    for (const value of Object.values(data || {})) {
      if (
        Array.isArray(value) &&
        value.length &&
        typeof value[0] === 'object' &&
        (
          'title' in value[0] ||
          'cluster_key' in value[0]
        )
      ) {
        return value;
      }
    }

    return [];
  }

  function resolveBrief(data, clusters) {
    const raw = first(
      data.brief,
      data.daily_brief,
      data.top_stories,
      data.must_know
    );

    if (Array.isArray(raw) && raw.length) {
      if (typeof raw[0] === 'object') {
        return raw;
      }

      const ids = new Set(raw.map(String));

      const matched = clusters.filter(c =>
        ids.has(keyOf(c)) ||
        ids.has(String(c.cluster_key))
      );

      if (matched.length) {
        return matched;
      }
    }

    return [...clusters]
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, Math.min(8, clusters.length));
  }

  function formatDate(value, opts = {}) {
    if (!value) {
      return '';
    }

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat(
      'en-IN',
      opts
    ).format(d);
  }

  function timeAgo(value) {
    if (!value) {
      return '';
    }

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
      return '';
    }

    const mins = Math.max(
      0,
      Math.floor(
        (Date.now() - d.getTime()) / 60000
      )
    );

    if (mins < 60) {
      return `${Math.max(1, mins)}m ago`;
    }

    const hrs = Math.floor(mins / 60);

    if (hrs < 24) {
      return `${hrs}h ago`;
    }

    const days = Math.floor(hrs / 24);

    return days === 1
      ? '1d ago'
      : `${days}d ago`;
  }

  function sourceCount(c) {
    const n = num(
      c.source_count,
      arr(c.sources).length ||
      arr(c.articles).length ||
      1
    );

    return `${n} source${n === 1 ? '' : 's'}`;
  }

  function meta(c) {
    return [
      sourceOf(c),
      timeAgo(dateOf(c)),
      sourceCount(c)
    ]
      .filter(Boolean)
      .map(esc)
      .join(' · ');
  }

  function setText(id, value) {
    const el = document.getElementById(id);

    if (el) {
      el.textContent = value;
    }
  }

  function show(el, yes = true) {
    if (el) {
      el.hidden = !yes;
    }
  }

  function setHeader(
    title,
    description,
    eyebrow = ''
  ) {
    setText('pageTitle', title);
    setText('pageDescription', description);
    setText('todayDate', eyebrow || '');
  }

  function setActive(view, category = null) {
    $$('.nav-item, .brand-button, .mobile-nav-item')
      .forEach(el => {
        const active = category
          ? el.dataset.category === category
          : el.dataset.view === view;

        el.classList.toggle('active', active);
      });
  }

  function saveState() {
    localStorage.setItem(
      'di:saved',
      JSON.stringify([...state.saved])
    );
  }

  function storyCard(
    c,
    variant = 'story-card'
  ) {
    const key = keyOf(c);
    const saved = state.saved.has(key);

    return `
      <article
        class="${variant}"
        data-story-key="${esc(key)}"
      >
        <div class="story-topline">
          <span
            class="importance importance-${labelOf(c).toLowerCase()}"
          >
            ${esc(labelOf(c))}
          </span>

          <span>
            ${esc(displayCategory(c))}
          </span>
        </div>

        <h2 class="story-title">
          <a
            href="${esc(urlOf(c))}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${esc(c.title || 'Untitled')}
          </a>
        </h2>

        ${
          textOf(c)
            ? `
              <p class="story-summary">
                ${esc(textOf(c))}
              </p>
            `
            : ''
        }

        <div class="story-meta">
          <span>${meta(c)}</span>

          <button
            class="save-button"
            data-save="${esc(key)}"
            aria-label="${
              saved
                ? 'Remove from saved'
                : 'Save story'
            }"
          >
            ${saved ? '★' : '☆'}
          </button>
        </div>

        ${
          arr(c.sources).length > 1
            ? `
              <button
                class="sources-button"
                data-sources="${esc(key)}"
              >
                View sources
              </button>
            `
            : ''
        }
      </article>
    `;
  }

  function emptyState(title, body) {
    return `
      <div class="empty-state">
        <h2>${esc(title)}</h2>
        <p>${esc(body)}</p>

        <button
          class="quiet-button"
          data-go-brief
        >
          Back to The Brief
        </button>
      </div>
    `;
  }

  function renderBrief() {
    state.view = 'brief';
    state.category = null;

    setHeader(
      'The Brief',
      'What matters today, without the noise.',
      'TODAY'
    );

    show($('#sinceLastPanel'), true);
    show($('#contextRail'), true);

    setActive('brief');

    const items = state.brief;

    $('#contentView').innerHTML =
      items.length
        ? `
          <div class="brief-list">
            ${
              items.map(
                (c, i) =>
                  storyCard(
                    c,
                    i === 0
                      ? 'lead-story'
                      : 'story-card'
                  )
              ).join('')
            }
          </div>
        `
        : emptyState(
            'No brief available yet',
            'The updater did not return any brief items.'
          );

    renderRail();
  }

  function renderCategory(category) {
    state.view = 'category';
    state.category = category;

    const label =
      categoryNames[category] || category;

    const items = state.clusters
      .filter(c =>
        categoryOf(c) === category ||
        displayCategory(c) === label
      )
      .sort(
        (a, b) =>
          scoreOf(b) - scoreOf(a)
      );

    setHeader(
      label,
      `Significant developments in ${label}.`,
      `${label.toUpperCase()} / TODAY / ${items.length} DEVELOPMENTS`
    );

    show($('#sinceLastPanel'), false);
    show($('#contextRail'), true);

    setActive(null, category);

    $('#contentView').innerHTML =
      items.length
        ? `
          <div class="category-list">
            ${
              items
                .slice(0, 40)
                .map(
                  (c, i) =>
                    storyCard(
                      c,
                      i === 0
                        ? 'lead-story'
                        : 'story-card'
                    )
                )
                .join('')
            }
          </div>
        `
        : emptyState(
            `No significant ${label} developments`,
            'Nothing currently meets the signal threshold for this section.'
          );

    renderRail(items);
  }

  function renderSince() {
    state.view = 'since';
    state.category = null;

    setActive('since');

    setHeader(
      'Since Last Check',
      'Developments published since your previous visit.',
      'TODAY'
    );

    show($('#sinceLastPanel'), false);
    show($('#contextRail'), true);

    const cutoff = state.lastVisit
      ? new Date(state.lastVisit).getTime()
      : Date.now() - 24 * 3600 * 1000;

    const items = state.clusters
      .filter(c => {
        const t = new Date(
          dateOf(c)
        ).getTime();

        return (
          Number.isFinite(t) &&
          t > cutoff
        );
      })
      .sort(
        (a, b) =>
          new Date(dateOf(b)) -
          new Date(dateOf(a))
      );

    $('#contentView').innerHTML =
      items.length
        ? `
          <div class="story-list">
            ${
              items
                .slice(0, 50)
                .map(c => storyCard(c))
                .join('')
            }
          </div>
        `
        : emptyState(
            'You are caught up',
            'No significant developments have appeared since your last check.'
          );

    renderRail(items);
  }

  function renderDeveloping() {
    state.view = 'developing';
    state.category = null;

    setActive('developing');

    setHeader(
      'Developing',
      'Events that are still moving.',
      'LIVE'
    );

    show($('#sinceLastPanel'), false);
    show($('#contextRail'), true);

    const items = state.clusters
      .filter(c =>
        c.is_developing === true ||
        String(
          c.is_developing
        ).toLowerCase() === 'true'
      )
      .sort(
        (a, b) =>
          new Date(dateOf(b)) -
          new Date(dateOf(a))
      );

    $('#contentView').innerHTML =
      items.length
        ? `
          <div class="story-list">
            ${
              items
                .map(c => storyCard(c))
                .join('')
            }
          </div>
        `
        : emptyState(
            'No developing stories right now',
            'We are continuously scanning trusted sources.'
          );

    renderRail(items);
  }

  function isMarket(c) {
    const hay = `
      ${categoryOf(c)}
      ${c.title || ''}
      ${textOf(c)}
      ${arr(c.market_channels).join(' ')}
    `.toLowerCase();

    return (
      /market|nifty|sensex|sebi|rbi|ipo|stock|equity|mutual fund|fii|dii|rupee|bond|yield|crude|opec|fed|dollar|banking/.test(hay) ||
      Boolean(c.market_impact)
    );
  }

  function renderMarkets() {
    state.view = 'markets';
    state.category = null;

    setActive('markets');

    setHeader(
      'Markets',
      'What is moving Indian markets — and why.',
      'MARKETS'
    );

    show($('#sinceLastPanel'), false);
    show($('#contextRail'), true);

    const items = state.clusters
      .filter(isMarket)
      .sort(
        (a, b) =>
          scoreOf(b) - scoreOf(a)
      );

    $('#contentView').innerHTML =
      items.length
        ? `
          <div class="markets-list">
            ${
              items
                .slice(0, 40)
                .map(
                  (c, i) =>
                    storyCard(
                      c,
                      i === 0
                        ? 'lead-story'
                        : 'story-card'
                    )
                )
                .join('')
            }
          </div>
        `
        : emptyState(
            'No major market developments',
            'No market story currently meets the available signal criteria.'
          );

    renderRail(items);
  }

  function renderSaved() {
    state.view = 'saved';
    state.category = null;

    setActive('saved');

    setHeader(
      'Saved',
      'Stories you bookmarked for later.',
      'LIBRARY'
    );

    show($('#sinceLastPanel'), false);
    show($('#contextRail'), false);

    const items = state.clusters.filter(
      c => state.saved.has(keyOf(c))
    );

    $('#contentView').innerHTML =
      items.length
        ? `
          <div class="story-list">
            ${
              items
                .map(c => storyCard(c))
                .join('')
            }
          </div>
        `
        : emptyState(
            'Nothing saved yet',
            'Use the bookmark control on a story to keep it here.'
          );
  }

  async function renderArchives() {
    state.view = 'archives';
    state.category = null;

    setActive('archives');

    setHeader(
      'Archives',
      'Previous Daily Intelligence briefings.',
      'LIBRARY'
    );

    show($('#sinceLastPanel'), false);
    show($('#contextRail'), false);

    const box = $('#contentView');

    box.innerHTML =
      '<p class="loading-copy">Loading archives…</p>';

    try {
      const r = await fetch(
        './data/archives.json',
        { cache: 'no-store' }
      );

      if (!r.ok) {
        throw new Error(
          `HTTP ${r.status}`
        );
      }

      const d = await r.json();

      const entries = Array.isArray(d)
        ? d
        : first(
            d.archives,
            d.items,
            d.files,
            []
          );

      box.innerHTML =
        entries.length
          ? `
            <div class="archive-list">
              ${
                entries.map(x => `
                  <div class="archive-row">
                    ${
                      esc(
                        first(
                          x.date,
                          x.generated_at,
                          x.title,
                          x.file,
                          String(x)
                        )
                      )
                    }
                  </div>
                `).join('')
              }
            </div>
          `
          : emptyState(
              'No archives yet',
              'Archive entries will appear after the updater creates them.'
            );

    } catch (e) {
      box.innerHTML = emptyState(
        'Archives unavailable',
        'The archive index could not be loaded.'
      );
    }
  }

  function allSources() {
    const map = new Map();

    state.clusters.forEach(c => {
      const list =
        arr(c.sources).length
          ? arr(c.sources)
          : arr(c.articles);

      if (list.length) {
        list.forEach(s => {
          const name =
            typeof s === 'string'
              ? s
              : first(
                  s.source,
                  s.name,
                  'Unknown source'
                );

          map.set(
            name,
            (map.get(name) || 0) + 1
          );
        });
      } else {
        const name = sourceOf(c);

        map.set(
          name,
          (map.get(name) || 0) + 1
        );
      }
    });

    return [...map.entries()].sort(
      (a, b) => b[1] - a[1]
    );
  }

  function renderSources() {
    state.view = 'sources';
    state.category = null;

    setActive('sources');

    setHeader(
      'Sources',
      'Publishers represented in the current intelligence set.',
      'COVERAGE'
    );

    show($('#sinceLastPanel'), false);
    show($('#contextRail'), false);

    const items = allSources();

    $('#contentView').innerHTML =
      items.length
        ? `
          <div class="source-list">
            ${
              items.map(
                ([name, n]) => `
                  <div class="source-row">
                    <strong>
                      ${esc(name)}
                    </strong>

                    <span>
                      ${n} item${n === 1 ? '' : 's'}
                    </span>
                  </div>
                `
              ).join('')
            }
          </div>
        `
        : emptyState(
            'No source metadata',
            'The current data does not expose source information.'
          );
  }

  function renderExplore() {
    state.view = 'explore';
    state.category = null;

    setActive('explore');

    setHeader(
      'Explore',
      'Browse intelligence by topic.',
      'TOPICS'
    );

    show($('#sinceLastPanel'), false);
    show($('#contextRail'), false);

    const cats = [
      'India',
      'Indian Politics',
      'Macro Economics',
      'Business & Micro',
      'AI',
      'Technology',
      'Science & Climate',
      'World',
      'Geopolitics',
      'World Politics',
      'The Ken'
    ];

    $('#contentView').innerHTML = `
      <div class="explore-list">
        ${
          cats.map(c => `
            <button
              class="topic-chip"
              data-category="${esc(c)}"
            >
              ${esc(categoryNames[c] || c)}
            </button>
          `).join('')
        }
      </div>
    `;
  }

  function renderSearch() {
    const q =
      state.query.trim().toLowerCase();

    if (!q) {
      return;
    }

    state.view = 'search';
    state.category = null;

    setHeader(
      `Search: “${state.query.trim()}”`,
      'Results across the current intelligence set.',
      'SEARCH'
    );

    show($('#sinceLastPanel'), false);
    show($('#contextRail'), false);

    setActive('');

    const items = state.clusters.filter(c =>
      `
        ${c.title || ''}
        ${textOf(c)}
        ${categoryOf(c)}
        ${sourceOf(c)}
      `
        .toLowerCase()
        .includes(q)
    );

    $('#contentView').innerHTML =
      items.length
        ? `
          <div class="story-list">
            ${
              items
                .slice(0, 60)
                .map(c => storyCard(c))
                .join('')
            }
          </div>
        `
        : emptyState(
            'No matching developments',
            'Try a broader company, person, topic or country.'
          );
  }

  function renderRail(
    scope = state.clusters
  ) {
    const developing =
      state.clusters.filter(c =>
        c.is_developing === true ||
        String(
          c.is_developing
        ).toLowerCase() === 'true'
      ).length;

    const articleCount = num(
      first(
        state.data.article_count,
        state.data.metadata?.article_count
      ),
      state.clusters.reduce(
        (n, c) =>
          n +
          Math.max(
            1,
            arr(c.articles).length
          ),
        0
      )
    );

    const clusterCount = num(
      first(
        state.data.cluster_count,
        state.data.metadata?.cluster_count
      ),
      state.clusters.length
    );

    const mustKnow =
      state.brief.length;

    const grid = $('#glanceGrid');

    if (grid) {
      grid.innerHTML = `
        <div class="glance-item">
          <strong>${mustKnow}</strong>
          <span>Must Know</span>
        </div>

        <div class="glance-item">
          <strong>${developing}</strong>
          <span>Developing</span>
        </div>

        <div class="glance-item">
          <strong>${articleCount}</strong>
          <span>Articles Scanned</span>
        </div>

        <div class="glance-item">
          <strong>${clusterCount}</strong>
          <span>Events Clustered</span>
        </div>
      `;
    }

    const cutoff = state.lastVisit
      ? new Date(
          state.lastVisit
        ).getTime()
      : Date.now() -
        24 * 3600 * 1000;

    const changed =
      state.clusters.filter(
        c =>
          new Date(
            dateOf(c)
          ).getTime() > cutoff
      ).length;

    setText(
      'changedSummary',
      changed
        ? `${changed} significant development${changed === 1 ? '' : 's'} since your previous check.`
        : 'You are caught up on the current intelligence set.'
    );

    const chips = $('#topicChips');

    if (chips) {
      chips.innerHTML = [
        'India',
        'Markets',
        'AI',
        'Geopolitics',
        'Technology'
      ]
        .map(label => {
          const cat =
            label === 'Markets'
              ? null
              : label;

          return `
            <button
              class="topic-chip"
              ${
                cat
                  ? `data-category="${esc(cat)}"`
                  : 'data-view="markets"'
              }
            >
              ${esc(label)}
            </button>
          `;
        })
        .join('');
    }
  }

  function openSources(key) {
    const c = state.clusters.find(
      x => keyOf(x) === key
    );

    if (!c) {
      return;
    }

    const sheet =
      $('#sourceSheet');

    const list =
      $('#sheetSources');

    if (!sheet || !list) {
      return;
    }

    setText(
      'sheetTitle',
      c.title || 'Sources'
    );

    const sources =
      arr(c.articles).length
        ? arr(c.articles)
        : arr(c.sources);

    list.innerHTML =
      sources.length
        ? sources.map(s => {
            if (
              typeof s === 'string'
            ) {
              return `
                <div class="sheet-source">
                  <strong>
                    ${esc(s)}
                  </strong>
                </div>
              `;
            }

            const name = first(
              s.source,
              s.name,
              'Source'
            );

            const url = first(
              s.url,
              '#'
            );

            const title = first(
              s.title,
              c.title,
              ''
            );

            return `
              <a
                class="sheet-source"
                href="${esc(url)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                <strong>
                  ${esc(name)}
                </strong>

                <span>
                  ${esc(title)}
                </span>
              </a>
            `;
          }).join('')
        : `
          <a
            class="sheet-source"
            href="${esc(urlOf(c))}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${esc(sourceOf(c))}
          </a>
        `;

    sheet.classList.remove('hidden');

    sheet.setAttribute(
      'aria-hidden',
      'false'
    );
  }

  function closeSources() {
    const sheet =
      $('#sourceSheet');

    if (sheet) {
      sheet.classList.add('hidden');

      sheet.setAttribute(
        'aria-hidden',
        'true'
      );
    }
  }

  function openMenu() {
    $('#sidebar')?.classList.add('open');

    $('#menuOverlay')
      ?.classList.add('visible');

    $('#openMenu')
      ?.setAttribute(
        'aria-expanded',
        'true'
      );
  }

  function closeMenu() {
    $('#sidebar')
      ?.classList.remove('open');

    $('#menuOverlay')
      ?.classList.remove('visible');

    $('#openMenu')
      ?.setAttribute(
        'aria-expanded',
        'false'
      );
  }

  function openSearch() {
    $('#searchPanel')
      ?.classList.remove('hidden');

    setTimeout(
      () =>
        $('#searchInput')?.focus(),
      0
    );
  }

  function closeSearch() {
    $('#searchPanel')
      ?.classList.add('hidden');
  }

  function toggleTheme() {
    const dark =
      !document.documentElement
        .classList.contains('dark');

    document.documentElement
      .classList.toggle(
        'dark',
        dark
      );

    document.body
      .classList.toggle(
        'dark',
        dark
      );

    localStorage.setItem(
      'di:theme',
      dark ? 'dark' : 'light'
    );
  }

  function navigate(
    view,
    category = null
  ) {
    closeMenu();
    closeSearch();

    if (category) {
      renderCategory(category);
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
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

    const render =
      routes[view] || renderBrief;

    render();

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  function bindEvents() {
    document.addEventListener(
      'click',
      e => {
        const save =
          e.target.closest(
            '[data-save]'
          );

        if (save) {
          e.preventDefault();

          const k =
            save.dataset.save;

          if (state.saved.has(k)) {
            state.saved.delete(k);
          } else {
            state.saved.add(k);
          }

          saveState();

          if (
            state.view === 'saved'
          ) {
            renderSaved();
          } else {
            save.textContent =
              state.saved.has(k)
                ? '★'
                : '☆';
          }

          return;
        }

        const sources =
          e.target.closest(
            '[data-sources]'
          );

        if (sources) {
          e.preventDefault();

          openSources(
            sources.dataset.sources
          );

          return;
        }

        const cat =
          e.target.closest(
            '[data-category]'
          );

        if (cat) {
          e.preventDefault();

          navigate(
            null,
            cat.dataset.category
          );

          return;
        }

        const view =
          e.target.closest(
            '[data-view]'
          );

        if (view) {
          e.preventDefault();

          navigate(
            view.dataset.view
          );

          return;
        }

        if (
          e.target.closest(
            '[data-go-brief]'
          )
        ) {
          e.preventDefault();
          navigate('brief');
        }
      }
    );

    $('#viewSinceButton')
      ?.addEventListener(
        'click',
        () => navigate('since')
      );

    $('#contextSinceButton')
      ?.addEventListener(
        'click',
        () => navigate('since')
      );

    $('#openMenu')
      ?.addEventListener(
        'click',
        openMenu
      );

    $('#closeMenu')
      ?.addEventListener(
        'click',
        closeMenu
      );

    $('#menuOverlay')
      ?.addEventListener(
        'click',
        closeMenu
      );

    $('#themeButton')
      ?.addEventListener(
        'click',
        toggleTheme
      );

    $('#sidebarThemeButton')
      ?.addEventListener(
        'click',
        toggleTheme
      );

    $('#desktopSearchTrigger')
      ?.addEventListener(
        'click',
        openSearch
      );

    $('#searchButton')
      ?.addEventListener(
        'click',
        openSearch
      );

    $('#closeSearch')
      ?.addEventListener(
        'click',
        closeSearch
      );

    $('#closeSheet')
      ?.addEventListener(
        'click',
        closeSources
      );

    $('#sheetBackdrop')
      ?.addEventListener(
        'click',
        closeSources
      );

    $('#searchInput')
      ?.addEventListener(
        'keydown',
        e => {
          if (e.key === 'Enter') {
            state.query =
              e.currentTarget.value;

            renderSearch();
            closeSearch();
          }
        }
      );

    document.addEventListener(
      'keydown',
      e => {
        if (
          (e.metaKey || e.ctrlKey) &&
          e.key.toLowerCase() === 'k'
        ) {
          e.preventDefault();
          openSearch();
        }

        if (e.key === 'Escape') {
          closeSearch();
          closeSources();
          closeMenu();
        }
      }
    );
  }

  function applyTheme() {
    const t =
      localStorage.getItem(
        'di:theme'
      );

    if (t === 'dark') {
      document.documentElement
        .classList.add('dark');

      document.body
        .classList.add('dark');
    }
  }

  async function boot() {
    applyTheme();
    bindEvents();

    setText(
      'topbarDate',
      formatDate(
        new Date(),
        {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }
      )
    );

    setText(
      'lastUpdated',
      'Updating…'
    );

    setText(
      'topbarUpdated',
      'Updating…'
    );

    setText(
      'sidebarStatus',
      'Loading sources…'
    );

    try {
      /*
       * Timestamp prevents GitHub Pages/browser caching
       * an old latest.json.
       */
      const response =
        await fetch(
          './data/latest.json?ts=' +
          Date.now(),
          {
            cache: 'no-store'
          }
        );

      if (!response.ok) {
        throw new Error(
          `latest.json returned HTTP ${response.status}`
        );
      }

      const data =
        await response.json();

      state.data = data;

      state.clusters =
        findClusterArray(data);

      state.brief =
        resolveBrief(
          data,
          state.clusters
        );

      if (
        !state.clusters.length
      ) {
        throw new Error(
          'latest.json loaded, but no story/cluster array was found'
        );
      }

      const generated =
        first(
          data.generated_at,
          data.metadata?.generated_at
        );

      const updated =
        generated
          ? `Updated ${timeAgo(generated)}`
          : 'Data loaded';

      setText(
        'lastUpdated',
        updated
      );

      setText(
        'topbarUpdated',
        updated
      );

      setText(
        'sidebarStatus',
        `${state.clusters.length} events loaded`
      );

      $('#healthDot')
        ?.classList.add('healthy');

      $('#sidebarHealthDot')
        ?.classList.add('healthy');

      const sinceCutoff =
        state.lastVisit
          ? new Date(
              state.lastVisit
            ).getTime()
          : Date.now() -
            24 * 3600 * 1000;

      const changed =
        state.clusters.filter(
          c =>
            new Date(
              dateOf(c)
            ).getTime() >
            sinceCutoff
        ).length;

      setText(
        'sinceSummary',
        changed
          ? `${changed} development${changed === 1 ? '' : 's'} worth catching up on`
          : 'You are caught up'
      );

      renderBrief();

      localStorage.setItem(
        'di:lastVisit',
        new Date().toISOString()
      );

      window.DI_APP_READY = true;

    } catch (err) {
      console.error(
        'Daily Intelligence failed to initialise:',
        err
      );

      const msg =
        `ERROR: ${err.message}`;

      setText(
        'lastUpdated',
        msg
      );

      setText(
        'topbarUpdated',
        msg
      );

      setText(
        'sidebarStatus',
        msg
      );

      const box =
        $('#contentView');

      if (box) {
        box.innerHTML = `
          <div class="empty-state">
            <h2>
              Could not load Daily Intelligence
            </h2>

            <p>
              ${esc(err.message)}
            </p>

            <p>
              Please verify
              <code>docs/data/latest.json</code>
              exists and is valid JSON.
            </p>
          </div>
        `;
      }
    }
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      boot,
      { once: true }
    );
  } else {
    boot();
  }
})();
