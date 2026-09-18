(() => {
  'use strict';

  /* =========================================================
     HELPERS
     ========================================================= */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const esc = (value = '') =>
    String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  const A = value =>
    Array.isArray(value) ? value : [];

  const F = (...values) =>
    values.find(
      value =>
        value !== undefined &&
        value !== null &&
        value !== ''
    );


  /* =========================================================
     STATE
     ========================================================= */

  const S = {
    data: {},
    clusters: [],
    brief: [],
    view: 'brief',
    category: null,

    saved: new Set(
      JSON.parse(
        localStorage.getItem('di:saved') || '[]'
      )
    ),

    lastVisit:
      localStorage.getItem('di:lastVisit')
  };


  /* =========================================================
     CATEGORY LABELS
     ========================================================= */

  const catMap = {
    'Macro Economics': 'Economy & Policy',
    'Business & Micro': 'Business'
  };


  /* =========================================================
     STORY DATA NORMALISATION
     ========================================================= */

  const key = cluster =>
    String(
      F(
        cluster.cluster_key,
        cluster.id,
        cluster.primary?.url,
        cluster.url,
        cluster.title,
        ''
      )
    );

  const score = cluster =>
    Number(
      F(
        cluster.importance,
        cluster.signal_score,
        cluster.primary?.signal_score,
        0
      )
    ) || 0;

  const category = cluster =>
    F(
      cluster.category,
      cluster.primary?.category,
      cluster.primary?.base_category,
      'General'
    );

  const displayCat = cluster =>
    catMap[category(cluster)] ||
    category(cluster);

  const desc = cluster =>
    F(
      cluster.brief,
      cluster.description,
      cluster.primary?.description,
      A(cluster.articles)[0]?.description,
      ''
    );

  const url = cluster =>
    F(
      cluster.primary?.url,
      cluster.url,
      A(cluster.articles)[0]?.url,
      '#'
    );

  const source = cluster =>
    F(
      cluster.primary?.source,
      cluster.primary_source,
      A(cluster.sources)[0]?.source,
      A(cluster.sources)[0]?.name,

      typeof A(cluster.sources)[0] === 'string'
        ? A(cluster.sources)[0]
        : null,

      A(cluster.articles)[0]?.source,
      'Source'
    );

  const date = cluster =>
    F(
      cluster.published_at,
      cluster.primary?.published_at,
      A(cluster.articles)[0]?.published_at
    );

  const label = cluster => {
    const existing = String(
      F(cluster.importance_label, '')
    ).toLowerCase();

    if (existing.includes('critical')) {
      return 'Critical';
    }

    if (existing.includes('significant')) {
      return 'Significant';
    }

    if (existing.includes('noteworthy')) {
      return 'Noteworthy';
    }

    if (score(cluster) >= 70) {
      return 'Critical';
    }

    if (score(cluster) >= 43) {
      return 'Significant';
    }

    return 'Noteworthy';
  };

  const ago = value => {
    if (!value) return '';

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const minutes = Math.max(
      1,
      Math.floor(
        (Date.now() - parsed.getTime()) / 60000
      )
    );

    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    if (minutes < 1440) {
      return `${Math.floor(minutes / 60)}h ago`;
    }

    return `${Math.floor(minutes / 1440)}d ago`;
  };

  const count = cluster =>
    Number(cluster.source_count) ||
    A(cluster.sources).length ||
    A(cluster.articles).length ||
    1;


  /* =========================================================
     FIND STORY COLLECTION IN latest.json
     ========================================================= */

  function clustersOf(data) {
    for (const key of [
      'clusters',
      'events',
      'items',
      'stories',
      'developments',
      'news'
    ]) {
      if (A(data[key]).length) {
        return data[key];
      }
    }

    for (const value of Object.values(data || {})) {
      if (
        A(value).length &&
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


  /* =========================================================
     BUILD THE DAILY BRIEF
     ========================================================= */

  function briefOf(data, clusters) {
    for (const key of [
      'brief',
      'daily_brief',
      'top_stories',
      'must_know'
    ]) {
      const brief = data[key];

      if (!A(brief).length) {
        continue;
      }

      if (typeof brief[0] === 'object') {
        return brief;
      }

      const ids = new Set(
        brief.map(String)
      );

      const matched =
        clusters.filter(cluster =>
          ids.has(key(cluster))
        );

      if (matched.length) {
        return matched;
      }
    }

    return [...clusters]
      .sort(
        (a, b) =>
          score(b) - score(a)
      )
      .slice(0, 5);
  }


  /* =========================================================
     EDITORIAL VISUAL FALLBACK
     ========================================================= */

  function visualClass(cluster) {
    const text =
      `${displayCat(cluster)} ${cluster.title || ''}`
        .toLowerCase();

    if (
      /market|econom|business|rbi|bank|stock|ipo/.test(text)
    ) {
      return 'market';
    }

    if (
      /ai|tech|compute|chip|digital/.test(text)
    ) {
      return 'tech';
    }

    if (
      /world|geo|war|china|russia|united states|us /.test(text)
    ) {
      return 'world';
    }

    if (
      /science|climate|space|research/.test(text)
    ) {
      return 'science';
    }

    return 'india';
  }

  function visual(cluster, small = false) {
    return `
      <div
        class="editorial-visual ${visualClass(cluster)} ${small ? 'small' : ''}"
        aria-hidden="true"
      >
        <span>
          ${esc(displayCat(cluster))}
        </span>

        <i></i>

        <b>DI</b>
      </div>
    `;
  }


  /* =========================================================
     STORY COMPONENTS
     ========================================================= */

  function meta(cluster) {
    const sourceCount = count(cluster);

    return `
      ${esc(source(cluster))}
      ·
      ${esc(ago(date(cluster)))}
      ·
      ${sourceCount}
      source${sourceCount === 1 ? '' : 's'}
    `;
  }

  function saveBtn(cluster) {
    const storyKey = key(cluster);
    const saved = S.saved.has(storyKey);

    return `
      <button
        class="bookmark ${saved ? 'saved' : ''}"
        data-save="${esc(storyKey)}"
        aria-label="Save story"
        type="button"
      >
        ${saved ? '★' : '☆'}
      </button>
    `;
  }

  function storyLink(cluster) {
    return `
      <a
        href="${esc(url(cluster))}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${esc(cluster.title || 'Untitled')}
      </a>
    `;
  }

  function storyLabel(cluster) {
    return `
      <div class="story-label">

        <span
          class="dot ${label(cluster).toLowerCase()}"
        ></span>

        ${esc(label(cluster))}

        <em>
          ${esc(displayCat(cluster))}
        </em>

      </div>
    `;
  }


  /* =========================================================
     HERO STORY
     ========================================================= */

  function lead(cluster) {
    return `
      <article class="lead-card">

        ${visual(cluster)}

        <div class="lead-copy">

          ${storyLabel(cluster)}

          <h2>
            ${storyLink(cluster)}
          </h2>

          ${
            desc(cluster)
              ? `
                <p>
                  ${esc(desc(cluster))}
                </p>
              `
              : ''
          }

          <div class="meta">
            ${meta(cluster)}
            ${saveBtn(cluster)}
          </div>

        </div>

      </article>
    `;
  }


  /* =========================================================
     SECONDARY STORY
     ========================================================= */

  function secondary(cluster) {
    return `
      <article class="secondary-card">

        <div class="secondary-copy">

          ${storyLabel(cluster)}

          <h3>
            ${storyLink(cluster)}
          </h3>

          <div class="meta">
            ${meta(cluster)}
            ${saveBtn(cluster)}
          </div>

        </div>

        ${visual(cluster, true)}

      </article>
    `;
  }


  /* =========================================================
     SIGNAL STORY
     ========================================================= */

  function signal(cluster) {
    return `
      <article class="signal-row">

        <div>

          ${storyLabel(cluster)}

          <h3>
            ${storyLink(cluster)}
          </h3>

          ${
            desc(cluster)
              ? `
                <p>
                  ${esc(desc(cluster))}
                </p>
              `
              : ''
          }

          <div class="meta">
            ${meta(cluster)}
          </div>

        </div>

        ${saveBtn(cluster)}

      </article>
    `;
  }


  /* =========================================================
     HEADER
     ========================================================= */

  function setHeader(
    eyebrow,
    title,
    description
  ) {
    const eyebrowEl =
      $('#eyebrow') ||
      $('#todayDate') ||
      $('.eyebrow');

    const titleEl =
      $('#pageTitle') ||
      $('.brief-header h1');

    const descriptionEl =
      $('#pageDescription') ||
      $('.page-description');

    if (eyebrowEl) {
      eyebrowEl.textContent =
        eyebrow || '';
    }

    if (titleEl) {
      titleEl.textContent =
        title || '';
    }

    if (descriptionEl) {
      descriptionEl.textContent =
        description || '';
    }
  }


  /* =========================================================
     ACTIVE NAV
     ========================================================= */

  function active(view, cat) {
    $$('[data-view], [data-category]')
      .forEach(element => {
        element.classList.toggle(
          'active',
          cat
            ? element.dataset.category === cat
            : element.dataset.view === view
        );
      });
  }


  /* =========================================================
     SINCE LAST CHECK
     ========================================================= */

  function visibleSincePanel() {
    return (
      $('#sinceLastPanel') ||
      $('#sincePanel')
    );
  }

  function setSinceVisible(show) {
    const panel = visibleSincePanel();

    if (panel) {
      panel.hidden = !show;
    }
  }

  function sincePanel() {
    const cut =
      S.lastVisit
        ? new Date(S.lastVisit).getTime()
        : Date.now() - 86400000;

    const number =
      S.clusters.filter(cluster => {
        const published =
          new Date(date(cluster)).getTime();

        return (
          Number.isFinite(published) &&
          published > cut
        );
      }).length;

    const summary =
      $('#sinceSummary');

    if (summary) {
      summary.textContent =
        `${number} new developments since your last check`;
    }

    const railSummary =
      $('#changedSummary');

    if (railSummary) {
      railSummary.textContent =
        number
          ? `${number} developments have appeared since your previous visit.`
          : 'No major new developments since your previous visit.';
    }
  }


  /* =========================================================
     RIGHT RAIL
     ========================================================= */

  function rail() {
    const developing =
      S.clusters.filter(cluster =>
        cluster.is_developing === true ||
        String(cluster.is_developing) === 'true'
      ).length;

    const articles =
      Number(S.data.article_count) ||
      S.clusters.reduce(
        (total, cluster) =>
          total +
          Math.max(
            1,
            A(cluster.articles).length
          ),
        0
      );

    const events =
      Number(S.data.cluster_count) ||
      S.clusters.length;

    const railEl =
      $('#contextRail');

    if (!railEl) {
      return;
    }

    railEl.innerHTML = `
      <section class="rail-card">

        <h3>
          Today at a glance
        </h3>

        <div class="rail-stat">
          <b>5</b>
          <span>
            in today's brief
          </span>
        </div>

        <div class="rail-stat">
          <b>${developing}</b>
          <span>
            developing stories
          </span>
        </div>

        <div class="rail-stat">
          <b>${articles}</b>
          <span>
            articles scanned
          </span>
        </div>

        <div class="rail-stat">
          <b>${events}</b>
          <span>
            events clustered
          </span>
        </div>

      </section>


      <section class="rail-card explore">

        <h3>
          Explore by topic →
        </h3>

        <button
          data-category="India"
          type="button"
        >
          India
        </button>

        <button
          data-view="markets"
          type="button"
        >
          Markets
        </button>

        <button
          data-category="AI"
          type="button"
        >
          AI
        </button>

        <button
          data-category="Macro Economics"
          type="button"
        >
          Economy
        </button>

        <button
          data-category="Geopolitics"
          type="button"
        >
          Geopolitics
        </button>

        <button
          data-category="Technology"
          type="button"
        >
          Technology
        </button>

        <button
          data-category="Science & Climate"
          type="button"
        >
          Climate
        </button>

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


  /* =========================================================
     THE BRIEF
     ========================================================= */

  function renderBrief() {
    S.view = 'brief';
    S.category = null;

    active('brief');

    /*
     * MOCKUP SPEC:
     * exactly five headline developments.
     */
    const brief =
      S.brief.slice(0, 5);

    setHeader(
      "TODAY'S BRIEF",
      `${brief.length} developments worth your attention`,
      "A focused view on what's important in India, the world and beyond."
    );

    setSinceVisible(true);

    const contextRail =
      $('#contextRail');

    if (contextRail) {
      contextRail.hidden = false;
    }

    if (!brief.length) {
      $('#contentView').innerHTML = `
        <div class="empty">

          <h2>
            No brief yet
          </h2>

          <p>
            No stories met the current signal threshold.
          </p>

        </div>
      `;

      rail();
      return;
    }

    /*
     * MOCKUP COMPOSITION
     *
     * 1 hero
     * +
     * four secondary cards in a 2 × 2 grid.
     *
     * No additional signal stream on the Brief homepage.
     */

    $('#contentView').innerHTML = `
      <div class="brief-editorial">

        ${lead(brief[0])}

        ${
          brief.length > 1
            ? `
              <h2 class="subsection-title">
                Other important developments
              </h2>

              <div class="secondary-grid">
                ${
                  brief
                    .slice(1, 5)
                    .map(secondary)
                    .join('')
                }
              </div>
            `
            : ''
        }

      </div>
    `;

    rail();
  }


  /* =========================================================
     CATEGORY
     ========================================================= */

  function categoryItems(cat) {
    const display =
      catMap[cat] || cat;

    return S.clusters
      .filter(cluster =>
        category(cluster) === cat ||
        displayCat(cluster) === display
      )
      .sort(
        (a, b) =>
          score(b) - score(a)
      );
  }

  function renderCategory(cat) {
    S.view = 'category';
    S.category = cat;

    active(null, cat);

    const display =
      catMap[cat] || cat;

    const items =
      categoryItems(cat);

    setHeader(
      `${display.toUpperCase()} / TODAY / ${items.length} DEVELOPMENTS`,
      display,
      `Key ${display.toLowerCase()} developments that matter.`
    );

    setSinceVisible(false);

    const contextRail =
      $('#contextRail');

    if (contextRail) {
      contextRail.hidden = false;
    }

    if (!items.length) {
      $('#contentView').innerHTML = `
        <div class="empty category-empty">

          <div class="empty-icon">
            ⌂
          </div>

          <h2>
            No significant developments<br>
            since your last briefing.
          </h2>

          <p>
            We're continuously scanning trusted sources.<br>
            If something important happens, it will appear here.
          </p>

          <button
            data-view="brief"
            type="button"
          >
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

                ${
                  items
                    .slice(1, 3)
                    .map(secondary)
                    .join('')
                }

              </div>
            `
            : ''
        }

        ${
          items.length > 3
            ? `
              <div class="signals-head">
                Signal Stream
              </div>

              <div class="signal-list">

                ${
                  items
                    .slice(3, 30)
                    .map(signal)
                    .join('')
                }

              </div>
            `
            : ''
        }

      </div>
    `;

    rail();
  }


  /* =========================================================
     MARKET DETECTION
     ========================================================= */

  function isMarket(cluster) {
    const text =
      `
        ${category(cluster)}
        ${cluster.title || ''}
        ${desc(cluster)}
        ${A(cluster.market_channels).join(' ')}
      `.toLowerCase();

    return (
      /market|nifty|sensex|sebi|rbi|ipo|stock|equity|mutual fund|fii|dii|rupee|bond|yield|crude|opec|fed|dollar|bank/.test(text) ||
      Boolean(cluster.market_impact)
    );
  }


  /* =========================================================
     MARKETS
     ========================================================= */

  function renderMarkets() {
    S.view = 'markets';
    S.category = null;

    active('markets');

    setHeader(
      'MARKETS',
      'Markets',
      'Key developments moving Indian markets.'
    );

    setSinceVisible(false);

    const contextRail =
      $('#contextRail');

    if (contextRail) {
      contextRail.hidden = true;
    }

    const items =
      S.clusters
        .filter(isMarket)
        .sort(
          (a, b) =>
            score(b) - score(a)
        );

    const india =
      items.filter(cluster =>
        !/fed|china|opec|dollar|treasury|global|united states|us /.test(
          `${cluster.title || ''} ${desc(cluster)}`
            .toLowerCase()
        )
      );

    const global =
      items.filter(cluster =>
        !india.includes(cluster)
      );

    const ipo =
      items.filter(cluster =>
        /\bipo\b|initial public offering/.test(
          `${cluster.title || ''} ${desc(cluster)}`
            .toLowerCase()
        )
      );

    const companies =
      items.filter(cluster =>
        /company|companies|earnings|acquisition|merger|buyback|order|stock|shares/.test(
          `${cluster.title || ''} ${desc(cluster)}`
            .toLowerCase()
        )
      );

    const funds =
      items.filter(cluster =>
        /mutual fund|amfi|\bsip\b/.test(
          `${cluster.title || ''} ${desc(cluster)}`
            .toLowerCase()
        )
      );

    $('#contentView').innerHTML = `
      <div class="markets-page">

        <nav class="market-tabs">

          <b>Overview</b>

          <span>
            India Today
          </span>

          <span>
            Global → India
          </span>

          <span>
            IPOs
          </span>

          <span>
            Stocks & Companies
          </span>

          <span>
            Mutual Funds
          </span>

        </nav>


        ${
          items[0]
            ? lead(items[0])
            : `
              <div class="empty">
                <h2>
                  No major market developments.
                </h2>
              </div>
            `
        }


        <div class="market-columns">

          <section>

            <h2>
              India Today
            </h2>

            ${
              india
                .slice(1, 5)
                .map(cluster => `
                  <div class="market-line">

                    <h3>
                      ${storyLink(cluster)}
                    </h3>

                    <div class="meta">
                      ${meta(cluster)}
                    </div>

                  </div>
                `)
                .join('')
            }

          </section>


          <section>

            <h2>
              Global → India
            </h2>

            ${
              global
                .slice(0, 4)
                .map(cluster => `
                  <div class="market-line">

                    <h3>
                      ${storyLink(cluster)}
                    </h3>

                    <div class="meta">
                      ${meta(cluster)}
                    </div>

                  </div>
                `)
                .join('')
            }

          </section>

        </div>


        <div class="market-bottom">

          <section>

            <h2>
              IPOs
            </h2>

            ${
              ipo.length
                ? ipo
                    .slice(0, 3)
                    .map(cluster => `
                      <div class="mini-line">
                        ${storyLink(cluster)}
                      </div>
                    `)
                    .join('')
                : `
                  <p>
                    No high-signal IPO developments.
                  </p>
                `
            }

          </section>


          <section>

            <h2>
              Stocks & Companies
            </h2>

            ${
              companies.length
                ? companies
                    .slice(0, 3)
                    .map(cluster => `
                      <div class="mini-line">
                        ${storyLink(cluster)}
                      </div>
                    `)
                    .join('')
                : `
                  <p>
                    No high-signal company developments.
                  </p>
                `
            }

          </section>


          <section>

            <h2>
              Mutual Funds
            </h2>

            ${
              funds.length
                ? funds
                    .slice(0, 3)
                    .map(cluster => `
                      <div class="mini-line">
                        ${storyLink(cluster)}
                      </div>
                    `)
                    .join('')
                : `
                  <p>
                    No high-signal mutual fund developments.
                  </p>
                `
            }

          </section>

        </div>

      </div>
    `;
  }


  /* =========================================================
     DEVELOPING
     ========================================================= */

  function renderDeveloping() {
    S.view = 'developing';

    active('developing');

    setHeader(
      'LIVE',
      'Developing',
      'Events that are still moving.'
    );

    setSinceVisible(false);

    const contextRail =
      $('#contextRail');

    if (contextRail) {
      contextRail.hidden = true;
    }

    const items =
      S.clusters
        .filter(cluster =>
          cluster.is_developing === true ||
          String(cluster.is_developing) === 'true'
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
            ? items
                .slice(0, 30)
                .map(cluster => `
                  <article>

                    <time>
                      ${ago(date(cluster))}
                    </time>

                    <i></i>

                    <div>

                      <h3>
                        ${storyLink(cluster)}
                      </h3>

                      <span>
                        Developing
                      </span>

                    </div>

                  </article>
                `)
                .join('')
            : `
              <div class="empty">

                <h2>
                  No developing stories right now.
                </h2>

              </div>
            `
        }

      </div>
    `;
  }


  /* =========================================================
     SINCE LAST CHECK VIEW
     ========================================================= */

  function renderSince() {
    S.view = 'since';

    active('since');

    setHeader(
      'TODAY',
      'Since Last Check',
      'What changed since your previous visit.'
    );

    setSinceVisible(false);

    const contextRail =
      $('#contextRail');

    if (contextRail) {
      contextRail.hidden = false;
    }

    const cut =
      S.lastVisit
        ? new Date(S.lastVisit).getTime()
        : Date.now() - 86400000;

    const items =
      S.clusters
        .filter(cluster =>
          new Date(date(cluster)).getTime() > cut
        )
        .sort(
          (a, b) =>
            new Date(date(b)) -
            new Date(date(a))
        );

    $('#contentView').innerHTML = `
      <div class="signal-list">

        ${
          items
            .slice(0, 40)
            .map(signal)
            .join('')
        }

      </div>
    `;

    rail();
  }


  /* =========================================================
     SAVED
     ========================================================= */

  function renderSaved() {
    S.view = 'saved';

    active('saved');

    setHeader(
      'LIBRARY',
      'Saved',
      'Stories you bookmarked.'
    );

    setSinceVisible(false);

    const contextRail =
      $('#contextRail');

    if (contextRail) {
      contextRail.hidden = true;
    }

    const items =
      S.clusters.filter(cluster =>
        S.saved.has(key(cluster))
      );

    $('#contentView').innerHTML =
      items.length
        ? `
          <div class="signal-list">

            ${
              items
                .map(signal)
                .join('')
            }

          </div>
        `
        : `
          <div class="empty">

            <h2>
              Nothing saved yet.
            </h2>

            <p>
              Bookmark a story to keep it here.
            </p>

          </div>
        `;
  }


  /* =========================================================
     EXPLORE
     ========================================================= */

  function renderExplore() {
    S.view = 'explore';

    active('explore');

    setHeader(
      'EXPLORE',
      'Explore',
      'Browse intelligence by topic.'
    );

    setSinceVisible(false);

    const contextRail =
      $('#contextRail');

    if (contextRail) {
      contextRail.hidden = true;
    }

    const categories = [
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

        ${
          categories
            .map(item => `
              <button
                ${
                  item === 'Markets'
                    ? 'data-view="markets"'
                    : `data-category="${esc(item)}"`
                }
                type="button"
              >

                ${esc(catMap[item] || item)}

                <span>
                  ›
                </span>

              </button>
            `)
            .join('')
        }

      </div>
    `;
  }


  /* =========================================================
     SOURCES
     ========================================================= */

  function renderSources() {
    S.view = 'sources';

    active('sources');

    setHeader(
      'COVERAGE',
      'Sources',
      'Publishers represented in the current intelligence set.'
    );

    setSinceVisible(false);

    const contextRail =
      $('#contextRail');

    if (contextRail) {
      contextRail.hidden = true;
    }

    const map =
      new Map();

    S.clusters.forEach(cluster => {
      const name =
        source(cluster);

      map.set(
        name,
        (map.get(name) || 0) + 1
      );
    });

    $('#contentView').innerHTML = `
      <div class="source-page">

        ${
          [...map]
            .sort(
              (a, b) =>
                b[1] - a[1]
            )
            .map(([name, number]) => `
              <div>

                <b>
                  ${esc(name)}
                </b>

                <span>
                  ${number} items
                </span>

              </div>
            `)
            .join('')
        }

      </div>
    `;
  }


  /* =========================================================
     ARCHIVES
     ========================================================= */

  function renderArchives() {
    S.view = 'archives';

    active('archives');

    setHeader(
      'LIBRARY',
      'Archives',
      'Previous Daily Intelligence briefings.'
    );

    setSinceVisible(false);

    const contextRail =
      $('#contextRail');

    if (contextRail) {
      contextRail.hidden = true;
    }

    $('#contentView').innerHTML = `
      <div class="empty">

        <h2>
          Archives
        </h2>

        <p>
          Previous generated briefings will appear here.
        </p>

      </div>
    `;
  }


  /* =========================================================
     NAVIGATION
     ========================================================= */

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


  /* =========================================================
     MENU
     ========================================================= */

  function closeMenu() {
    document.body.classList.remove(
      'menu-open'
    );

    const openButton =
      $('#openMenu');

    if (openButton) {
      openButton.setAttribute(
        'aria-expanded',
        'false'
      );
    }
  }


  /* =========================================================
     THEME
     ========================================================= */

  function toggleTheme() {
    const dark =
      document.documentElement.dataset.theme ===
      'dark';

    document.documentElement.dataset.theme =
      dark
        ? 'light'
        : 'dark';

    localStorage.setItem(
      'di:theme',
      dark
        ? 'light'
        : 'dark'
    );
  }


  /* =========================================================
     EVENTS
     ========================================================= */

  function bind() {
    document.addEventListener(
      'click',
      event => {
        const save =
          event.target.closest('[data-save]');

        if (save) {
          event.preventDefault();

          const storyKey =
            save.dataset.save;

          if (S.saved.has(storyKey)) {
            S.saved.delete(storyKey);
          } else {
            S.saved.add(storyKey);
          }

          localStorage.setItem(
            'di:saved',
            JSON.stringify([...S.saved])
          );

          save.textContent =
            S.saved.has(storyKey)
              ? '★'
              : '☆';

          save.classList.toggle(
            'saved',
            S.saved.has(storyKey)
          );

          return;
        }

        const cat =
          event.target.closest(
            '[data-category]'
          );

        if (cat) {
          event.preventDefault();

          navigate(
            null,
            cat.dataset.category
          );

          return;
        }

        const view =
          event.target.closest(
            '[data-view]'
          );

        if (view) {
          event.preventDefault();

          navigate(
            view.dataset.view
          );
        }
      }
    );


    $('#openMenu')?.addEventListener(
      'click',
      () => {
        document.body.classList.add(
          'menu-open'
        );

        $('#openMenu')?.setAttribute(
          'aria-expanded',
          'true'
        );
      }
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
      $('#searchPanel')
        ?.classList
        .toggle('hidden');

      setTimeout(
        () => {
          $('#searchInput')?.focus();
        },
        0
      );
    };


    $('#searchButton')?.addEventListener(
      'click',
      toggleSearch
    );


    $('#desktopSearchTrigger')
      ?.addEventListener(
        'click',
        toggleSearch
      );


    $('#closeSearch')?.addEventListener(
      'click',
      () => {
        $('#searchPanel')
          ?.classList
          .add('hidden');
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


    $('#searchInput')?.addEventListener(
      'keydown',
      event => {
        if (event.key !== 'Enter') {
          return;
        }

        const raw =
          event.target.value.trim();

        const query =
          raw.toLowerCase();

        if (!query) {
          return;
        }

        setHeader(
          'SEARCH',
          `Results for “${raw}”`,
          'Across the current intelligence set.'
        );

        setSinceVisible(false);

        const contextRail =
          $('#contextRail');

        if (contextRail) {
          contextRail.hidden = true;
        }

        const items =
          S.clusters.filter(cluster =>
            `
              ${cluster.title || ''}
              ${desc(cluster)}
              ${source(cluster)}
              ${displayCat(cluster)}
            `
              .toLowerCase()
              .includes(query)
          );

        $('#contentView').innerHTML =
          items.length
            ? `
              <div class="signal-list">

                ${
                  items
                    .slice(0, 50)
                    .map(signal)
                    .join('')
                }

              </div>
            `
            : `
              <div class="empty">

                <h2>
                  No matching developments.
                </h2>

              </div>
            `;

        $('#searchPanel')
          ?.classList
          .add('hidden');
      }
    );


    document.addEventListener(
      'keydown',
      event => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'k'
        ) {
          event.preventDefault();
          toggleSearch();
        }

        if (event.key === 'Escape') {
          closeMenu();

          $('#searchPanel')
            ?.classList
            .add('hidden');
        }
      }
    );
  }


  /* =========================================================
     BOOT
     ========================================================= */

  async function boot() {
    if (
      localStorage.getItem('di:theme') ===
      'dark'
    ) {
      document.documentElement.dataset.theme =
        'dark';
    }

    bind();

    try {
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

      S.data =
        await response.json();

      S.clusters =
        clustersOf(S.data);

      if (!S.clusters.length) {
        throw new Error(
          'No story array found in latest.json'
        );
      }

      S.brief =
        briefOf(
          S.data,
          S.clusters
        );


      /* -----------------------------------------
         DATE
         ----------------------------------------- */

      const now =
        new Date();

      const formattedDate =
        new Intl.DateTimeFormat(
          'en-IN',
          {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          }
        ).format(now);

      const topbarDate =
        $('#topbarDate');

      if (topbarDate) {
        topbarDate.textContent =
          formattedDate;
      }


      /* -----------------------------------------
         GENERATED TIME
         ----------------------------------------- */

      const generated =
        F(
          S.data.generated_at,
          S.data.metadata?.generated_at
        );

      const updatedText =
        generated
          ? `Last updated ${ago(generated)}`
          : 'Data loaded';

      const topbarUpdated =
        $('#topbarUpdated');

      if (topbarUpdated) {
        topbarUpdated.textContent =
          updatedText;
      }

      const lastUpdated =
        $('#lastUpdated');

      if (lastUpdated) {
        lastUpdated.textContent =
          updatedText;
      }


      /* -----------------------------------------
         SIDEBAR STATUS
         ----------------------------------------- */

      const sidebarStatus =
        $('#sidebarStatus');

      if (sidebarStatus) {
        sidebarStatus.textContent =
          `${S.clusters.length} events loaded`;
      }


      $('#healthDot')
        ?.classList
        .add('healthy');

      $('#sidebarHealthDot')
        ?.classList
        .add('healthy');


      /* -----------------------------------------
         RENDER
         ----------------------------------------- */

      sincePanel();
      renderBrief();


      /* -----------------------------------------
         RECORD VISIT
         ----------------------------------------- */

      localStorage.setItem(
        'di:lastVisit',
        new Date().toISOString()
      );

    } catch (error) {
      console.error(
        'Daily Intelligence failed:',
        error
      );

      const content =
        $('#contentView');

      if (content) {
        content.innerHTML = `
          <div class="empty">

            <h2>
              Could not load Daily Intelligence
            </h2>

            <p>
              ${esc(error.message)}
            </p>

          </div>
        `;
      }

      const sidebarStatus =
        $('#sidebarStatus');

      if (sidebarStatus) {
        sidebarStatus.textContent =
          'Data unavailable';
      }

      const topbarUpdated =
        $('#topbarUpdated');

      if (topbarUpdated) {
        topbarUpdated.textContent =
          'Data unavailable';
      }

      const lastUpdated =
        $('#lastUpdated');

      if (lastUpdated) {
        lastUpdated.textContent =
          'Data unavailable';
      }
    }
  }


  /* =========================================================
     START
     ========================================================= */

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      boot,
      {
        once: true
      }
    );
  } else {
    boot();
  }

})();
