const DATA_URL = "./data/latest.json";
const ARCHIVES_URL = "./data/archives.json";

const state = {
  data: null,
  clusters: [],
  top: [],
  markets: {},
  currentView: "brief",
  currentCategory: null,
  saved: new Set(JSON.parse(localStorage.getItem("di_saved") || "[]")),
  previousVisit: localStorage.getItem("di_last_visit"),
  currentVisit: new Date().toISOString()
};

const $ = id => document.getElementById(id);

const els = {
  menuOverlay: $("menuOverlay"),
  openMenu: $("openMenu"),
  closeMenu: $("closeMenu"),
  searchButton: $("searchButton"),
  searchPanel: $("searchPanel"),
  searchInput: $("searchInput"),
  closeSearch: $("closeSearch"),
  themeButton: $("themeButton"),
  todayDate: $("todayDate"),
  pageTitle: $("pageTitle"),
  pageDescription: $("pageDescription"),
  lastUpdated: $("lastUpdated"),
  sidebarStatus: $("sidebarStatus"),
  sinceSummary: $("sinceSummary"),
  viewSinceButton: $("viewSinceButton"),
  contentView: $("contentView"),
  sourceSheet: $("sourceSheet"),
  sheetBackdrop: $("sheetBackdrop"),
  closeSheet: $("closeSheet"),
  sheetTitle: $("sheetTitle"),
  sheetSources: $("sheetSources")
};


/* ============================================================
   HELPERS
============================================================ */

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value = "") {
  const div = document.createElement("div");
  div.innerHTML = value;

  return (div.textContent || div.innerText || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateWords(text, limit = 90) {
  const words = cleanText(text).split(/\s+/).filter(Boolean);

  if (words.length <= limit) return words.join(" ");

  return words.slice(0, limit).join(" ") + "…";
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function timeAgo(value) {
  const date = parseDate(value);

  if (!date) return "";

  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);

  return days === 1 ? "yesterday" : `${days}d ago`;
}

function storyTimestamp(story) {
  return (
    story.published_at ||
    story.primary?.published_at ||
    story.articles?.[0]?.published_at ||
    ""
  );
}

function storyKey(story) {
  return story.cluster_key || story.url || story.title;
}

function primaryUrl(story) {
  return story.primary?.url || story.articles?.[0]?.url || story.url || "#";
}

function primaryPublisher(story) {
  return story.primary?.source || story.sources?.[0] || "Source";
}

function sourceCount(story) {
  if (story.source_count) return Number(story.source_count);
  if (Array.isArray(story.sources)) return story.sources.length;

  return 1;
}

function usefulSummary(story, limit = 85) {
  return truncateWords(
    story.brief ||
    story.description ||
    story.primary?.description ||
    "",
    limit
  );
}

function displayCategory(category) {
  const aliases = {
    "Macro Economics": "Economy & Policy",
    "Business & Micro": "Business"
  };

  return aliases[category] || category;
}

function dedupeStories(stories = []) {
  const seen = new Set();

  return stories.filter(story => {
    const key = storyKey(story);

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function sortByImportance(stories = []) {
  return [...stories].sort((a, b) => {
    const importance =
      Number(b.importance || 0) - Number(a.importance || 0);

    if (importance !== 0) return importance;

    return (
      (parseDate(storyTimestamp(b))?.getTime() || 0) -
      (parseDate(storyTimestamp(a))?.getTime() || 0)
    );
  });
}


/* ============================================================
   IMPORTANCE
============================================================ */

function importanceLevel(story) {
  const level = String(story.importance_label || "").toLowerCase();

  if (["critical", "significant", "noteworthy"].includes(level)) {
    return level;
  }

  return Number(story.importance || 0) >= 43
    ? "significant"
    : "noteworthy";
}

function isNewSinceVisit(story) {
  if (!state.previousVisit) return false;

  const storyDate = parseDate(storyTimestamp(story));
  const previous = parseDate(state.previousVisit);

  return storyDate && previous && storyDate > previous;
}


/* ============================================================
   SAVED
============================================================ */

function isSaved(story) {
  return state.saved.has(storyKey(story));
}

function toggleSaved(story) {
  const key = storyKey(story);

  if (state.saved.has(key)) {
    state.saved.delete(key);
  } else {
    state.saved.add(key);
  }

  localStorage.setItem("di_saved", JSON.stringify([...state.saved]));

  renderCurrentView();
}


/* ============================================================
   MARKET IMPACT
============================================================ */

function marketImpactHtml(story) {
  if (!story.market_impact) return "";

  const tags = Array.isArray(story.market_channels)
    ? story.market_channels
    : [];

  return `
    <div class="market-impact">
      <strong>India connection:</strong>
      ${escapeHtml(story.market_impact)}

      ${
        tags.length
          ? `
            <div class="market-tags">
              ${tags.map(tag => `
                <span class="market-tag">${escapeHtml(tag)}</span>
              `).join("")}
            </div>
          `
          : ""
      }
    </div>
  `;
}


/* ============================================================
   STANDARD STORY CARD
============================================================ */

function storyCard(story) {
  const level = importanceLevel(story);
  const publisher = primaryPublisher(story);
  const count = sourceCount(story);
  const summary = usefulSummary(story);

  const article = document.createElement("article");

  article.className =
    `story-card ${level === "critical" ? "is-critical" : ""}`;

  article.innerHTML = `
    <div class="story-topline">

      <span class="importance-label ${level}">
        ${escapeHtml(level)}
      </span>

      <span class="category-label">
        ${escapeHtml(displayCategory(story.category || "News"))}
      </span>

      ${
        isNewSinceVisit(story)
          ? `<span class="story-state">NEW</span>`
          : ""
      }

    </div>

    <h3 class="story-title">
      ${escapeHtml(story.title || "")}
    </h3>

    ${
      summary
        ? `<p class="story-summary">${escapeHtml(summary)}</p>`
        : ""
    }

    ${marketImpactHtml(story)}

    <div class="story-meta">
      <span>${escapeHtml(publisher)}</span>
      <span>·</span>
      <span>${count} ${count === 1 ? "source" : "sources"}</span>
      <span>·</span>
      <span>${escapeHtml(timeAgo(storyTimestamp(story)))}</span>
    </div>

    <div class="story-actions">

      <button class="story-action coverage-button">
        ${count > 1 ? `View ${count} sources` : "View source"}
      </button>

      <a
        class="story-action"
        href="${escapeHtml(primaryUrl(story))}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Read ${escapeHtml(publisher)} →
      </a>

      <button
        class="story-action save-button ${isSaved(story) ? "saved" : ""}"
      >
        ${isSaved(story) ? "Saved" : "Save"}
      </button>

    </div>
  `;

  article
    .querySelector(".coverage-button")
    ?.addEventListener("click", () => openSources(story));

  article
    .querySelector(".save-button")
    ?.addEventListener("click", () => toggleSaved(story));

  return article;
}

function renderStoryList(container, stories) {
  container.innerHTML = "";

  if (!stories.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>Nothing important enough right now.</h2>
        <p>That's a feature, not a bug.</p>
      </div>
    `;
    return;
  }

  stories.forEach(story => container.appendChild(storyCard(story)));
}


/* ============================================================
   V5.3 NAVIGATION

   ONE Markets button.
   No IPO / stocks / MF navigation clutter.
============================================================ */

function installMarketsNavigation() {
  const navigation = document.querySelector(".navigation");

  if (!navigation) return;

  /*
    Remove any previous dynamically generated Markets section.
  */

  [...navigation.querySelectorAll(".market-navigation")].forEach(
    node => node.remove()
  );

  /*
    Also remove old market category buttons that may have been
    injected by V5.1 / V5.2.
  */

  navigation.querySelectorAll(".nav-item").forEach(button => {
    const category = button.dataset.category;
    const marketView = button.dataset.marketView;

    if (
      marketView ||
      [
        "Indian Markets",
        "Global → India",
        "Companies & Earnings",
        "IPO",
        "Mutual Funds"
      ].includes(category)
    ) {
      button.remove();
    }
  });

  const groups = [...navigation.querySelectorAll(".nav-group")];

  const worldGroup = groups.find(group =>
    group.querySelector(".nav-label")
      ?.textContent
      ?.trim()
      ?.toLowerCase() === "world"
  );

  const group = document.createElement("div");

  group.className = "nav-group market-navigation";

  group.innerHTML = `
    <div class="nav-label">Markets</div>

    <button
      class="nav-item"
      data-market-home="true"
    >
      Markets
    </button>
  `;

  if (worldGroup) {
    navigation.insertBefore(group, worldGroup);
  } else {
    navigation.appendChild(group);
  }
}


/* ============================================================
   NEWSPAPER MARKET COMPONENTS
============================================================ */

function marketMeta(story) {
  return `
    <div class="market-news-meta">
      ${escapeHtml(primaryPublisher(story))}
      <span>·</span>
      ${escapeHtml(timeAgo(storyTimestamp(story)))}
    </div>
  `;
}

function marketLead(story) {
  if (!story) return "";

  return `
    <article class="market-lead">

      <div class="market-label">
        TOP STORY
      </div>

      <a
        href="${escapeHtml(primaryUrl(story))}"
        target="_blank"
        rel="noopener noreferrer"
        class="market-headline-link"
      >
        <h2>${escapeHtml(story.title || "")}</h2>
      </a>

      ${
        usefulSummary(story, 100)
          ? `
            <p class="market-lead-summary">
              ${escapeHtml(usefulSummary(story, 100))}
            </p>
          `
          : ""
      }

      ${marketImpactHtml(story)}

      ${marketMeta(story)}

    </article>
  `;
}

function marketSecondary(story) {
  if (!story) return "";

  return `
    <article class="market-secondary">

      <a
        href="${escapeHtml(primaryUrl(story))}"
        target="_blank"
        rel="noopener noreferrer"
        class="market-headline-link"
      >
        <h3>${escapeHtml(story.title || "")}</h3>
      </a>

      ${
        usefulSummary(story, 38)
          ? `
            <p>
              ${escapeHtml(usefulSummary(story, 38))}
            </p>
          `
          : ""
      }

      ${marketMeta(story)}

    </article>
  `;
}

function marketHeadlineRow(story) {
  if (!story) return "";

  return `
    <article class="market-headline-row">

      <a
        href="${escapeHtml(primaryUrl(story))}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${escapeHtml(story.title || "")}
      </a>

      <div class="market-news-meta">
        ${escapeHtml(primaryPublisher(story))}
        ·
        ${escapeHtml(timeAgo(storyTimestamp(story)))}
      </div>

    </article>
  `;
}

function marketSectionHeader(title, kicker = "") {
  return `
    <div class="market-section-heading">

      <div>
        ${
          kicker
            ? `<div class="market-label">${escapeHtml(kicker)}</div>`
            : ""
        }

        <h2>${escapeHtml(title)}</h2>
      </div>

    </div>
  `;
}


/* ============================================================
   IPO SECTION
============================================================ */

function ipoNewspaperItem(ipo) {
  const details = [
    ipo.status,
    ipo.price_band,
    ipo.issue_size,
    ipo.lot_size ? `Lot ${ipo.lot_size}` : null,
    ipo.close_date ? `Closes ${ipo.close_date}` : null
  ].filter(Boolean);

  return `
    <article class="ipo-news-item">

      <div class="market-label">
        ${escapeHtml(ipo.status || "IPO")}
      </div>

      <h3>
        ${
          ipo.url
            ? `
              <a
                href="${escapeHtml(ipo.url)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                ${escapeHtml(ipo.name || "")}
              </a>
            `
            : escapeHtml(ipo.name || "")
        }
      </h3>

      ${
        details.length
          ? `
            <div class="ipo-facts">
              ${details.map(detail => `
                <span>${escapeHtml(detail)}</span>
              `).join("")}
            </div>
          `
          : ""
      }

      ${
        ipo.what_to_know
          ? `
            <p>
              ${escapeHtml(truncateWords(ipo.what_to_know, 45))}
            </p>
          `
          : ""
      }

      ${
        ipo.source
          ? `
            <div class="market-news-meta">
              ${escapeHtml(ipo.source)}
            </div>
          `
          : ""
      }

    </article>
  `;
}

function renderIPOSection() {
  const open = state.markets.ipo_open || [];
  const upcoming = state.markets.ipo_upcoming || [];
  const recent = state.markets.ipo_recent || [];

  const all = [
    ...open,
    ...upcoming,
    ...recent
  ].slice(0, 6);

  if (!all.length) {
    const fallback = state.clusters
      .filter(story => story.category === "IPO")
      .slice(0, 5);

    if (!fallback.length) return "";

    return `
      <section class="market-section">

        ${marketSectionHeader("IPOs", "IPO WATCH")}

        <div class="market-compact-list">
          ${fallback.map(marketHeadlineRow).join("")}
        </div>

      </section>
    `;
  }

  return `
    <section class="market-section">

      ${marketSectionHeader("IPOs", "IPO WATCH")}

      <div class="ipo-newspaper-grid">
        ${all.map(ipoNewspaperItem).join("")}
      </div>

    </section>
  `;
}


/* ============================================================
   MUTUAL FUNDS
============================================================ */

function renderMutualFundSection() {
  let stories = state.markets.mutual_fund_news || [];

  if (!stories.length) {
    stories = state.clusters.filter(story => {
      const text =
        `${story.title || ""} ${story.description || ""}`.toLowerCase();

      return (
        story.category === "Mutual Funds" ||
        text.includes("mutual fund") ||
        text.includes("amfi") ||
        text.includes("sip contribution") ||
        text.includes("fund inflow")
      );
    });
  }

  stories = dedupeStories(stories).slice(0, 6);

  if (!stories.length) return "";

  const lead = stories[0];
  const rest = stories.slice(1);

  return `
    <section class="market-section">

      ${marketSectionHeader(
        "Mutual Funds",
        "SAVINGS & FUND FLOWS"
      )}

      <div class="market-two-column">

        <div>
          ${marketSecondary(lead)}
        </div>

        <div class="market-compact-list">
          ${rest.map(marketHeadlineRow).join("")}
        </div>

      </div>

    </section>
  `;
}


/* ============================================================
   INVESTOR CONVERSATION
============================================================ */

function renderInvestorConversationSection() {
  const items = state.markets.investor_conversation || [];

  if (!items.length) return "";

  return `
    <section class="market-section investor-conversation-section">

      ${marketSectionHeader(
        "What Investors Are Talking About",
        "COMMUNITY SIGNAL"
      )}

      <p class="market-section-intro">
        Recurring investor arguments and concerns.
        Community discussion is kept separate from verified reporting.
      </p>

      <div class="investor-conversation-grid">

        ${items.slice(0, 6).map(item => `
          <article class="investor-topic">

            <div class="market-label">
              ${escapeHtml(item.symbol || item.topic || "DISCUSSION")}
            </div>

            <h3>
              ${escapeHtml(item.title || "")}
            </h3>

            ${
              item.positive_case
                ? `
                  <p>
                    <strong>Discussed positively:</strong>
                    ${escapeHtml(item.positive_case)}
                  </p>
                `
                : ""
            }

            ${
              item.concerns
                ? `
                  <p>
                    <strong>Concerns:</strong>
                    ${escapeHtml(item.concerns)}
                  </p>
                `
                : ""
            }

          </article>
        `).join("")}

      </div>

    </section>
  `;
}


/* ============================================================
   V5.3 MARKETS FRONT PAGE
============================================================ */

function renderMarkets() {
  state.currentView = "markets";
  state.currentCategory = null;

  closeMenu();

  setPageHeader(
    "Markets",
    "Indian markets, companies and investing."
  );

  /*
    PRIMARY MARKET NEWS
  */

  const india = sortByImportance(
    state.clusters.filter(story =>
      story.category === "Indian Markets" ||
      story.category === "Macro Economics"
    )
  );

  const companies = sortByImportance(
    state.clusters.filter(story =>
      story.category === "Companies & Earnings" ||
      story.category === "Business & Micro"
    )
  );

  const globalIndia = sortByImportance(
    state.clusters.filter(story =>
      story.category === "Global → India"
    )
  );

  /*
    Top story candidates.

    Prefer Indian market / macro stories, then consequential
    company stories.
  */

  const frontPageCandidates = dedupeStories([
    ...india,
    ...companies,
    ...globalIndia
  ]);

  const lead = frontPageCandidates[0] || null;

  const secondary = frontPageCandidates
    .filter(story => storyKey(story) !== storyKey(lead || {}))
    .slice(0, 4);

  const usedKeys = new Set(
    [lead, ...secondary]
      .filter(Boolean)
      .map(storyKey)
  );

  const latest = dedupeStories([
    ...india,
    ...companies
  ])
    .filter(story => !usedKeys.has(storyKey(story)))
    .slice(0, 7);

  const globalStories = globalIndia
    .filter(story => !usedKeys.has(storyKey(story)))
    .slice(0, 6);

  const companyStories = companies
    .filter(story => storyKey(story) !== storyKey(lead || {}))
    .slice(0, 8);


  els.contentView.innerHTML = `
    <div class="markets-front-page">

      <!-- MASTHEAD -->

      <header class="markets-masthead">

        <div>
          <div class="market-label">
            DAILY INTELLIGENCE
          </div>

          <h1>Markets</h1>

          <p>
            Indian markets, companies and investing.
            The developments worth knowing, without the trading noise.
          </p>
        </div>

        <div class="markets-date">
          ${escapeHtml(
            new Intl.DateTimeFormat("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric"
            }).format(new Date())
          )}
        </div>

      </header>


      <!-- TOP OF THE PAPER -->

      <section class="markets-top-grid">

        <div class="markets-lead-column">
          ${
            lead
              ? marketLead(lead)
              : `
                <div class="market-empty">
                  No major market development yet.
                </div>
              `
          }
        </div>

        <div class="markets-secondary-column">
          ${secondary.map(marketSecondary).join("")}
        </div>

      </section>


      <!-- LATEST + GLOBAL INDIA -->

      <section class="market-section">

        <div class="market-news-columns">

          <div>

            ${marketSectionHeader(
              "Latest",
              "INDIA TODAY"
            )}

            <div class="market-compact-list">
              ${
                latest.length
                  ? latest.map(marketHeadlineRow).join("")
                  : `
                    <div class="market-empty">
                      No additional market headlines.
                    </div>
                  `
              }
            </div>

          </div>


          <div>

            ${marketSectionHeader(
              "Global → India",
              "TRANSMISSION WATCH"
            )}

            <div class="market-compact-list">
              ${
                globalStories.length
                  ? globalStories.map(marketHeadlineRow).join("")
                  : `
                    <div class="market-empty">
                      No major global transmission story right now.
                    </div>
                  `
              }
            </div>

          </div>

        </div>

      </section>


      <!-- IPO -->

      ${renderIPOSection()}


      <!-- STOCKS & COMPANIES -->

      ${
        companyStories.length
          ? `
            <section class="market-section">

              ${marketSectionHeader(
                "Stocks & Companies",
                "CORPORATE INDIA"
              )}

              <div class="company-news-layout">

                <div>
                  ${marketSecondary(companyStories[0])}
                </div>

                <div class="market-compact-list">
                  ${companyStories
                    .slice(1, 8)
                    .map(marketHeadlineRow)
                    .join("")}
                </div>

              </div>

            </section>
          `
          : ""
      }


      <!-- MUTUAL FUNDS -->

      ${renderMutualFundSection()}


      <!-- INVESTOR CONVERSATION -->

      ${renderInvestorConversationSection()}


      <!-- EDITORIAL NOTE -->

      <footer class="markets-editorial-note">

        <strong>About this page</strong>

        <p>
          Markets prioritises material market, corporate,
          IPO and mutual-fund developments. Routine price
          movements and market chatter are deliberately
          downranked. Community discussion, when available,
          is labelled separately from reported facts.
        </p>

      </footer>

    </div>
  `;
}


/* ============================================================
   GENERIC VIEW
============================================================ */

function setPageHeader(title, description) {
  if (els.pageTitle) els.pageTitle.textContent = title;
  if (els.pageDescription) els.pageDescription.textContent = description;
}

function renderViewHeader(kicker, title, description = "") {
  return `
    <div class="view-header">

      <div class="section-kicker">
        ${escapeHtml(kicker)}
      </div>

      <h2>${escapeHtml(title)}</h2>

      ${
        description
          ? `<p>${escapeHtml(description)}</p>`
          : ""
      }

    </div>
  `;
}

function renderSingleView(title, stories, description = "") {
  els.contentView.innerHTML = `
    <section class="content-section">

      ${renderViewHeader(
        "DAILY INTELLIGENCE",
        title,
        description
      )}

      <div id="singleStoryList"></div>

    </section>
  `;

  renderStoryList($("singleStoryList"), stories);
}


/* ============================================================
   THE BRIEF
============================================================ */

function renderBrief() {
  state.currentView = "brief";
  state.currentCategory = null;

  closeMenu();

  setPageHeader(
    "The Brief",
    "What happened that is important enough that you should know about it?"
  );

  const stories = state.top.length
    ? state.top
    : state.clusters
        .filter(x => importanceLevel(x) !== "noteworthy")
        .slice(0, 8);

  els.contentView.innerHTML = `
    <section class="content-section">

      <div class="section-heading">

        <div>
          <div class="section-kicker">MUST KNOW</div>
          <h2>The Brief</h2>
        </div>

        <span class="section-count">
          ${stories.length}
        </span>

      </div>

      <div id="briefStories"></div>

    </section>


    <section class="content-section">

      <div class="section-heading">

        <div>
          <div class="section-kicker">THE FILTER</div>
          <h2>Behind the Brief</h2>
        </div>

      </div>

      <div class="market-pulse">

        <div class="market-pulse-item">
          <div class="market-pulse-name">SCANNED</div>

          <div class="market-pulse-value">
            ${state.data?.article_count || 0}
          </div>

          <div class="market-pulse-note">
            useful articles
          </div>
        </div>

        <div class="market-pulse-item">
          <div class="market-pulse-name">STORIES</div>

          <div class="market-pulse-value">
            ${state.data?.cluster_count || 0}
          </div>

          <div class="market-pulse-note">
            clustered events
          </div>
        </div>

        <div class="market-pulse-item">
          <div class="market-pulse-name">FILTERED</div>

          <div class="market-pulse-value">
            ${state.data?.noise_filtered || 0}
          </div>

          <div class="market-pulse-note">
            low-signal items
          </div>
        </div>

      </div>

    </section>
  `;

  renderStoryList($("briefStories"), stories);
}


/* ============================================================
   NORMAL CATEGORY
============================================================ */

function showCategory(category) {
  state.currentView = "category";
  state.currentCategory = category;

  closeMenu();

  const stories = sortByImportance(
    state.clusters.filter(story =>
      story.category === category
    )
  );

  setPageHeader(
    displayCategory(category),
    `Latest significant developments in ${displayCategory(category)}.`
  );

  renderSingleView(
    displayCategory(category),
    stories,
    `${stories.length} developments`
  );
}


/* ============================================================
   SINCE LAST CHECK
============================================================ */

function renderSince() {
  state.currentView = "since";
  state.currentCategory = null;

  closeMenu();

  const stories = state.previousVisit
    ? state.clusters.filter(isNewSinceVisit)
    : state.top;

  setPageHeader(
    "Since Last Check",
    "Developments published since your previous visit."
  );

  renderSingleView(
    "Since Last Check",
    stories,
    `${stories.length} new developments`
  );
}


/* ============================================================
   DEVELOPING
============================================================ */

function renderDeveloping() {
  state.currentView = "developing";
  state.currentCategory = null;

  closeMenu();

  const stories = state.clusters.filter(
    story => story.is_developing === true
  );

  setPageHeader(
    "Developing",
    "Stories receiving material new information."
  );

  renderSingleView(
    "Developing",
    stories
  );
}


/* ============================================================
   SAVED
============================================================ */

function renderSaved() {
  state.currentView = "saved";
  state.currentCategory = null;

  closeMenu();

  const stories = state.clusters.filter(isSaved);

  setPageHeader(
    "Saved",
    "Stories you've kept for later."
  );

  renderSingleView(
    "Saved",
    stories
  );
}


/* ============================================================
   SOURCE SHEET
============================================================ */

function openSources(story) {
  const articles = story.articles || [];

  if (!els.sheetTitle || !els.sheetSources || !els.sourceSheet) {
    return;
  }

  els.sheetTitle.textContent =
    story.title || "Coverage";

  els.sheetSources.innerHTML = (
    articles.length
      ? articles
      : [{
          source: primaryPublisher(story),
          title: story.title,
          url: primaryUrl(story),
          published_at: storyTimestamp(story)
        }]
  ).map(article => `
    <a
      class="sheet-source"
      href="${escapeHtml(article.url || "#")}"
      target="_blank"
      rel="noopener noreferrer"
    >

      <div class="sheet-source-name">
        ${escapeHtml(article.source || "Source")}
      </div>

      <div class="sheet-source-title">
        ${escapeHtml(article.title || story.title || "")}
      </div>

      <div class="sheet-source-time">
        ${escapeHtml(timeAgo(article.published_at))}
      </div>

    </a>
  `).join("");

  els.sourceSheet.classList.remove("hidden");

  document.body.style.overflow = "hidden";
}

function closeSources() {
  els.sourceSheet?.classList.add("hidden");
  document.body.style.overflow = "";
}


/* ============================================================
   MENU
============================================================ */

function openMenu() {
  document.body.classList.add("menu-open");
}

function closeMenu() {
  document.body.classList.remove("menu-open");
}


/* ============================================================
   THEME
============================================================ */

function applyTheme() {
  const stored = localStorage.getItem("di_theme");

  const theme =
    stored ||
    (
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
    );

  document.documentElement.setAttribute(
    "data-theme",
    theme
  );
}

function toggleTheme() {
  const current =
    document.documentElement.getAttribute("data-theme");

  const next =
    current === "dark"
      ? "light"
      : "dark";

  document.documentElement.setAttribute(
    "data-theme",
    next
  );

  localStorage.setItem(
    "di_theme",
    next
  );
}


/* ============================================================
   SEARCH
============================================================ */

function searchStories(query) {
  const q = query.trim().toLowerCase();

  if (!q) {
    renderBrief();
    return;
  }

  const results = state.clusters.filter(story =>
    [
      story.title,
      story.description,
      story.category,
      story.market_impact,
      ...(story.sources || [])
    ]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );

  state.currentView = "search";
  state.currentCategory = null;

  setPageHeader(
    "Search",
    `${results.length} results for “${query}”.`
  );

  renderSingleView(
    `Results for “${query}”`,
    results
  );
}


/* ============================================================
   NAVIGATION
============================================================ */

function wireNavigation() {
  document
    .querySelectorAll(".nav-item")
    .forEach(button => {

      button.addEventListener("click", () => {

        const category = button.dataset.category;
        const view = button.dataset.view;
        const markets = button.dataset.marketHome;

        if (markets === "true") {
          renderMarkets();
          return;
        }

        if (category) {
          showCategory(category);
          return;
        }

        if (view === "brief") {
          renderBrief();
          return;
        }

        if (view === "since") {
          renderSince();
          return;
        }

        if (view === "developing") {
          renderDeveloping();
          return;
        }

        if (view === "saved") {
          renderSaved();
          return;
        }

      });
    });
}


/* ============================================================
   CURRENT VIEW
============================================================ */

function renderCurrentView() {
  if (state.currentView === "markets") {
    return renderMarkets();
  }

  if (state.currentView === "category") {
    return showCategory(state.currentCategory);
  }

  if (state.currentView === "since") {
    return renderSince();
  }

  if (state.currentView === "developing") {
    return renderDeveloping();
  }

  if (state.currentView === "saved") {
    return renderSaved();
  }

  return renderBrief();
}


/* ============================================================
   LOAD DATA
============================================================ */

async function loadData() {
  try {
    const response = await fetch(
      `${DATA_URL}?v=${Date.now()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    state.data = data;

    state.clusters =
      Array.isArray(data.clusters)
        ? data.clusters
        : [];

    state.top =
      Array.isArray(data.top)
        ? data.top
        : [];

    state.markets =
      data.markets || {};

    if (els.todayDate) {
      els.todayDate.textContent =
        new Intl.DateTimeFormat("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long"
        })
          .format(new Date())
          .toUpperCase();
    }

    if (els.lastUpdated) {
      els.lastUpdated.textContent =
        `Updated ${timeAgo(data.generated_at)}`;
    }

    const sources =
      Array.isArray(data.sources)
        ? data.sources
        : [];

    const healthy =
      sources.filter(source => source.ok).length;

    if (els.sidebarStatus) {
      els.sidebarStatus.textContent =
        `${healthy}/${sources.length} sources healthy`;
    }

    if (els.sinceSummary) {
      const fresh = state.previousVisit
        ? state.clusters.filter(isNewSinceVisit)
        : [];

      els.sinceSummary.textContent =
        fresh.length
          ? `${fresh.length} new developments since your last check.`
          : "No new developments since your last check.";
    }

    renderBrief();

    localStorage.setItem(
      "di_last_visit",
      state.currentVisit
    );

  } catch (error) {

    console.error(error);

    els.contentView.innerHTML = `
      <div class="empty-state">

        <h2>
          The briefing couldn't load.
        </h2>

        <p>
          Refresh again in a moment.
        </p>

      </div>
    `;
  }
}


/* ============================================================
   EVENTS
============================================================ */

applyTheme();

installMarketsNavigation();

wireNavigation();

els.openMenu?.addEventListener(
  "click",
  openMenu
);

els.closeMenu?.addEventListener(
  "click",
  closeMenu
);

els.menuOverlay?.addEventListener(
  "click",
  closeMenu
);

els.themeButton?.addEventListener(
  "click",
  toggleTheme
);

els.viewSinceButton?.addEventListener(
  "click",
  renderSince
);

els.searchButton?.addEventListener(
  "click",
  () => {
    els.searchPanel?.classList.toggle("hidden");
    els.searchInput?.focus();
  }
);

els.closeSearch?.addEventListener(
  "click",
  () => {
    els.searchPanel?.classList.add("hidden");

    if (els.searchInput) {
      els.searchInput.value = "";
    }

    renderBrief();
  }
);

els.searchInput?.addEventListener(
  "input",
  event => {
    searchStories(event.target.value);
  }
);

els.sheetBackdrop?.addEventListener(
  "click",
  closeSources
);

els.closeSheet?.addEventListener(
  "click",
  closeSources
);

document.addEventListener(
  "keydown",
  event => {
    if (event.key === "Escape") {
      closeMenu();
      closeSources();
    }
  }
);

loadData();
