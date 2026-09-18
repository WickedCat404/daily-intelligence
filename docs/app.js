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
  healthDot: $("healthDot"),
  sidebarHealthDot: $("sidebarHealthDot"),
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


/* =========================================================
   BASIC HELPERS
========================================================= */

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

function shortDate(value) {
  const date = parseDate(value);

  if (!date) return "";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short"
  }).format(date);
}

function longToday() {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());
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

function usefulSummary(story) {
  return truncateWords(
    story.brief ||
    story.description ||
    story.primary?.description ||
    "",
    90
  );
}

function displayCategory(category) {
  const aliases = {
    "Macro Economics": "Economy & Policy",
    "Business & Micro": "Business"
  };

  return aliases[category] || category;
}


/* =========================================================
   IMPORTANCE
========================================================= */

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


/* =========================================================
   SAVED
========================================================= */

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


/* =========================================================
   MARKET IMPACT
========================================================= */

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


/* =========================================================
   STORY CARD
========================================================= */

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


/* =========================================================
   V5.2 MARKET NAVIGATION
========================================================= */

function installMarketsNavigation() {
  const navigation = document.querySelector(".navigation");

  if (!navigation) return;

  /*
    Remove the old V5.1 dynamically-created Markets group
    if it exists.
  */

  [...navigation.querySelectorAll(".nav-group")].forEach(group => {
    const label = group.querySelector(".nav-label")?.textContent
      ?.trim()
      ?.toLowerCase();

    if (label === "markets") {
      group.remove();
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

    <button class="nav-item" data-market-view="market-brief">
      Market Brief
    </button>

    <button class="nav-item" data-category="Indian Markets">
      Indian Markets
    </button>

    <button class="nav-item" data-category="Global → India">
      Global → India
    </button>

    <div class="nav-label" style="margin-top:16px">IPOs</div>

    <button class="nav-item" data-market-view="ipo-open">
      Open Now
    </button>

    <button class="nav-item" data-market-view="ipo-upcoming">
      Upcoming
    </button>

    <button class="nav-item" data-market-view="ipo-listed">
      Recently Listed
    </button>

    <div class="nav-label" style="margin-top:16px">Stocks</div>

    <button class="nav-item" data-market-view="stocks-focus">
      Stocks in Focus
    </button>

    <button class="nav-item" data-market-view="investor-conversation">
      Investor Conversation
    </button>

    <button class="nav-item" data-category="Companies & Earnings">
      Results & Earnings
    </button>

    <div class="nav-label" style="margin-top:16px">Mutual Funds</div>

    <button class="nav-item" data-market-view="mutual-funds">
      MF Watch
    </button>

    <button class="nav-item" data-market-view="fund-flows">
      Fund Flows & Trends
    </button>

    <button
      class="nav-item"
      data-market-view="market-calendar"
      style="margin-top:10px"
    >
      Market Calendar
    </button>
  `;

  if (worldGroup) {
    navigation.insertBefore(group, worldGroup);
  } else {
    navigation.appendChild(group);
  }
}


/* =========================================================
   GENERIC VIEW
========================================================= */

function setPageHeader(title, description) {
  if (els.pageTitle) els.pageTitle.textContent = title;
  if (els.pageDescription) els.pageDescription.textContent = description;
}

function renderViewHeader(kicker, title, description = "") {
  return `
    <div class="view-header">
      <div class="section-kicker">${escapeHtml(kicker)}</div>
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
      ${renderViewHeader("DAILY INTELLIGENCE", title, description)}
      <div id="singleStoryList"></div>
    </section>
  `;

  renderStoryList($("singleStoryList"), stories);
}


/* =========================================================
   MARKET BRIEF
========================================================= */

function renderMarketBrief() {
  state.currentView = "market-brief";
  state.currentCategory = null;

  closeMenu();

  setPageHeader(
    "Market Brief",
    "The developments that matter for Indian investors today."
  );

  const indian = state.clusters
    .filter(x => x.category === "Indian Markets")
    .slice(0, 4);

  const global = state.clusters
    .filter(x => x.category === "Global → India")
    .slice(0, 3);

  const companies = state.clusters
    .filter(x => x.category === "Companies & Earnings")
    .slice(0, 3);

  const ipoCount =
    (state.markets.ipo_open || []).length +
    (state.markets.ipo_upcoming || []).length;

  els.contentView.innerHTML = `
    <section class="content-section">

      ${renderViewHeader(
        "INDIAN INVESTOR INTELLIGENCE",
        "Market Brief",
        "Signal before noise. No buy/sell calls."
      )}

      <div class="market-pulse">

        <div class="market-pulse-item">
          <div class="market-pulse-name">INDIA</div>
          <div class="market-pulse-value">${indian.length}</div>
          <div class="market-pulse-note">developments worth knowing</div>
        </div>

        <div class="market-pulse-item">
          <div class="market-pulse-name">GLOBAL → INDIA</div>
          <div class="market-pulse-value">${global.length}</div>
          <div class="market-pulse-note">external market drivers</div>
        </div>

        <div class="market-pulse-item">
          <div class="market-pulse-name">IPO WATCH</div>
          <div class="market-pulse-value">${ipoCount}</div>
          <div class="market-pulse-note">open or upcoming</div>
        </div>

      </div>

      <div id="marketIndia"></div>
      <div id="marketGlobal"></div>
      <div id="marketCompanies"></div>

    </section>
  `;

  renderMarketSection(
    $("marketIndia"),
    "India Today",
    indian
  );

  renderMarketSection(
    $("marketGlobal"),
    "Global → India",
    global
  );

  renderMarketSection(
    $("marketCompanies"),
    "Companies & Earnings",
    companies
  );
}

function renderMarketSection(container, title, stories) {
  if (!container || !stories.length) return;

  container.innerHTML = `
    <div class="section-heading" style="margin-top:38px">
      <div>
        <div class="section-kicker">MARKETS</div>
        <h2>${escapeHtml(title)}</h2>
      </div>
      <span class="section-count">${stories.length}</span>
    </div>

    <div class="market-story-holder"></div>
  `;

  renderStoryList(
    container.querySelector(".market-story-holder"),
    stories
  );
}


/* =========================================================
   IPOs
========================================================= */

function renderIPOView(type) {
  state.currentView = type;
  state.currentCategory = null;

  closeMenu();

  const configs = {
    "ipo-open": {
      title: "Open IPOs",
      description: "Public issues currently open for subscription.",
      key: "ipo_open"
    },

    "ipo-upcoming": {
      title: "Upcoming IPOs",
      description: "Issues expected or officially scheduled to open next.",
      key: "ipo_upcoming"
    },

    "ipo-listed": {
      title: "Recently Listed",
      description: "Recently completed IPOs and their listing information.",
      key: "ipo_recent"
    }
  };

  const config = configs[type];
  const items = state.markets[config.key] || [];

  setPageHeader(config.title, config.description);

  els.contentView.innerHTML = `
    <section class="content-section">

      ${renderViewHeader("IPO WATCH", config.title, config.description)}

      <div class="story-list">

        ${
          items.length
            ? items.map(ipo => ipoCard(ipo)).join("")
            : `
              <div class="empty-state">
                <h2>No verified IPOs to show.</h2>
                <p>
                  We won't fill this section with unconfirmed IPO rumours.
                </p>
              </div>
            `
        }

      </div>

    </section>
  `;
}

function ipoCard(ipo) {
  const details = [
    ipo.price_band
      ? `Price band ${ipo.price_band}`
      : null,

    ipo.issue_size
      ? `Issue ${ipo.issue_size}`
      : null,

    ipo.lot_size
      ? `Lot ${ipo.lot_size}`
      : null,

    ipo.close_date
      ? `Closes ${ipo.close_date}`
      : null,

    ipo.listing_date
      ? `Listing ${ipo.listing_date}`
      : null
  ].filter(Boolean);

  return `
    <article class="story-card">

      <div class="story-topline">
        <span class="importance-label significant">
          ${escapeHtml(ipo.status || "IPO")}
        </span>

        <span class="category-label">
          ${escapeHtml(ipo.sector || "IPO")}
        </span>
      </div>

      <h3 class="story-title">
        ${escapeHtml(ipo.name || "")}
      </h3>

      ${
        details.length
          ? `
            <p class="story-summary">
              ${escapeHtml(details.join(" · "))}
            </p>
          `
          : ""
      }

      ${
        ipo.what_to_know
          ? `
            <div class="market-impact">
              <strong>What to know:</strong>
              ${escapeHtml(ipo.what_to_know)}
            </div>
          `
          : ""
      }

      ${
        ipo.url
          ? `
            <div class="story-actions">
              <a
                class="story-action"
                href="${escapeHtml(ipo.url)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                View source →
              </a>
            </div>
          `
          : ""
      }

    </article>
  `;
}


/* =========================================================
   STOCKS IN FOCUS
========================================================= */

function renderStocksFocus() {
  state.currentView = "stocks-focus";
  state.currentCategory = null;

  closeMenu();

  setPageHeader(
    "Stocks in Focus",
    "Companies with material developments — not random daily movers."
  );

  const stories = state.clusters
    .filter(story =>
      story.category === "Companies & Earnings" ||
      story.category === "Indian Markets"
    )
    .slice(0, 15);

  renderSingleView(
    "Stocks in Focus",
    stories,
    "Material earnings, corporate actions, regulation and company developments."
  );
}


/* =========================================================
   INVESTOR CONVERSATION
========================================================= */

function renderInvestorConversation() {
  state.currentView = "investor-conversation";
  state.currentCategory = null;

  closeMenu();

  setPageHeader(
    "Investor Conversation",
    "What investors are discussing, kept separate from verified facts."
  );

  const conversations = state.markets.investor_conversation || [];

  els.contentView.innerHTML = `
    <section class="content-section">

      ${renderViewHeader(
        "COMMUNITY SIGNAL",
        "Investor Conversation",
        "Recurring investor arguments and concerns. Community discussion is not treated as fact."
      )}

      ${
        conversations.length
          ? conversations.map(item => `
              <article class="story-card">

                <div class="story-topline">
                  <span class="importance-label">
                    INVESTOR CONVERSATION
                  </span>

                  <span class="category-label">
                    ${escapeHtml(item.symbol || item.topic || "")}
                  </span>
                </div>

                <h3 class="story-title">
                  ${escapeHtml(item.title || "")}
                </h3>

                ${
                  item.positive_case
                    ? `
                      <div class="market-impact">
                        <strong>Positive case being discussed:</strong>
                        ${escapeHtml(item.positive_case)}
                      </div>
                    `
                    : ""
                }

                ${
                  item.concerns
                    ? `
                      <p class="story-summary">
                        <strong>Concerns being discussed:</strong>
                        ${escapeHtml(item.concerns)}
                      </p>
                    `
                    : ""
                }

                <div class="story-meta">
                  Community discussion · not investment advice
                </div>

              </article>
            `).join("")
          : `
            <div class="empty-state">
              <h2>No strong conversation signal yet.</h2>
              <p>
                We won't manufacture sentiment from a handful of comments.
              </p>
            </div>
          `
      }

    </section>
  `;
}


/* =========================================================
   MUTUAL FUNDS
========================================================= */

function renderMutualFunds() {
  state.currentView = "mutual-funds";
  state.currentCategory = null;

  closeMenu();

  setPageHeader(
    "Mutual Fund Watch",
    "The mutual-fund developments worth knowing."
  );

  const stories = state.markets.mutual_fund_news || [];

  if (stories.length) {
    renderSingleView(
      "Mutual Fund Watch",
      stories,
      "SEBI, AMFI, fund-house and category developments."
    );
    return;
  }

  const fallback = state.clusters.filter(story => {
    const text = `${story.title} ${story.description}`.toLowerCase();

    return (
      text.includes("mutual fund") ||
      text.includes("sip ") ||
      text.includes("amfi")
    );
  });

  renderSingleView(
    "Mutual Fund Watch",
    fallback,
    "SEBI, AMFI, fund-house and category developments."
  );
}

function renderFundFlows() {
  state.currentView = "fund-flows";
  state.currentCategory = null;

  closeMenu();

  setPageHeader(
    "Fund Flows & Trends",
    "Where Indian mutual-fund money is moving."
  );

  const flows = state.markets.fund_flows || [];

  els.contentView.innerHTML = `
    <section class="content-section">

      ${renderViewHeader(
        "MUTUAL FUNDS",
        "Fund Flows & Trends",
        "Industry flows and category trends, not fund recommendations."
      )}

      ${
        flows.length
          ? `
            <div class="story-list">
              ${flows.map(item => `
                <article class="story-card">

                  <div class="story-topline">
                    <span class="importance-label significant">
                      ${escapeHtml(item.category || "FLOW")}
                    </span>
                  </div>

                  <h3 class="story-title">
                    ${escapeHtml(item.title || "")}
                  </h3>

                  <p class="story-summary">
                    ${escapeHtml(item.description || "")}
                  </p>

                </article>
              `).join("")}
            </div>
          `
          : `
            <div class="empty-state">
              <h2>No verified flow update yet.</h2>
              <p>
                Monthly flow data will appear only when the source provides it.
              </p>
            </div>
          `
      }

    </section>
  `;
}


/* =========================================================
   MARKET CALENDAR
========================================================= */

function renderMarketCalendar() {
  state.currentView = "market-calendar";
  state.currentCategory = null;

  closeMenu();

  setPageHeader(
    "Market Calendar",
    "The events worth knowing before they happen."
  );

  const events = state.markets.calendar || [];

  els.contentView.innerHTML = `
    <section class="content-section">

      ${renderViewHeader(
        "COMING UP",
        "Market Calendar",
        "IPOs, earnings, policy events and major macro releases."
      )}

      ${
        events.length
          ? `
            <div class="story-list">

              ${events.map(event => `
                <article class="story-card">

                  <div class="story-topline">

                    <span class="importance-label significant">
                      ${escapeHtml(event.type || "EVENT")}
                    </span>

                    <span class="category-label">
                      ${escapeHtml(event.date || "")}
                    </span>

                  </div>

                  <h3 class="story-title">
                    ${escapeHtml(event.title || "")}
                  </h3>

                  ${
                    event.why_it_matters
                      ? `
                        <p class="story-summary">
                          ${escapeHtml(event.why_it_matters)}
                        </p>
                      `
                      : ""
                  }

                </article>
              `).join("")}

            </div>
          `
          : `
            <div class="empty-state">
              <h2>No verified events loaded yet.</h2>
              <p>
                The calendar won't guess dates from headlines.
              </p>
            </div>
          `
      }

    </section>
  `;
}


/* =========================================================
   NORMAL CATEGORY
========================================================= */

function showCategory(category) {
  state.currentView = "category";
  state.currentCategory = category;

  closeMenu();

  setPageHeader(
    displayCategory(category),
    `Latest significant developments in ${displayCategory(category)}.`
  );

  const stories = state.clusters
    .filter(story => story.category === category)
    .sort((a, b) =>
      Number(b.importance || 0) - Number(a.importance || 0)
    );

  renderSingleView(
    displayCategory(category),
    stories,
    `${stories.length} developments`
  );
}


/* =========================================================
   THE BRIEF
========================================================= */

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
          <div class="market-pulse-note">useful articles</div>
        </div>

        <div class="market-pulse-item">
          <div class="market-pulse-name">STORIES</div>
          <div class="market-pulse-value">
            ${state.data?.cluster_count || 0}
          </div>
          <div class="market-pulse-note">clustered events</div>
        </div>

        <div class="market-pulse-item">
          <div class="market-pulse-name">FILTERED</div>
          <div class="market-pulse-value">
            ${state.data?.noise_filtered || 0}
          </div>
          <div class="market-pulse-note">low-signal items</div>
        </div>

      </div>

    </section>
  `;

  renderStoryList($("briefStories"), stories);
}


/* =========================================================
   OTHER EXISTING VIEWS
========================================================= */

function renderSince() {
  state.currentView = "since";

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

function renderDeveloping() {
  state.currentView = "developing";

  const stories = state.clusters.filter(x => x.is_developing === true);

  setPageHeader(
    "Developing",
    "Stories receiving material new information."
  );

  renderSingleView("Developing", stories);
}

function renderSaved() {
  state.currentView = "saved";

  const stories = state.clusters.filter(isSaved);

  setPageHeader(
    "Saved",
    "Stories you've kept for later."
  );

  renderSingleView("Saved", stories);
}


/* =========================================================
   SOURCE SHEET
========================================================= */

function openSources(story) {
  const articles = story.articles || [];

  els.sheetTitle.textContent = story.title || "Coverage";

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


/* =========================================================
   MENU / THEME / SEARCH
========================================================= */

function openMenu() {
  document.body.classList.add("menu-open");
}

function closeMenu() {
  document.body.classList.remove("menu-open");
}

function applyTheme() {
  const stored = localStorage.getItem("di_theme");

  const theme =
    stored ||
    (
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
    );

  document.documentElement.setAttribute("data-theme", theme);
}

function toggleTheme() {
  const current =
    document.documentElement.getAttribute("data-theme");

  const next = current === "dark" ? "light" : "dark";

  document.documentElement.setAttribute("data-theme", next);

  localStorage.setItem("di_theme", next);
}

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

  setPageHeader(
    "Search",
    `${results.length} results for “${query}”.`
  );

  renderSingleView(`Results for “${query}”`, results);
}


/* =========================================================
   NAVIGATION EVENTS
========================================================= */

function wireNavigation() {
  document.querySelectorAll(".nav-item").forEach(button => {

    button.addEventListener("click", () => {

      const category = button.dataset.category;
      const view = button.dataset.view;
      const market = button.dataset.marketView;

      if (category) {
        showCategory(category);
        return;
      }

      if (market === "market-brief") renderMarketBrief();
      if (market === "ipo-open") renderIPOView("ipo-open");
      if (market === "ipo-upcoming") renderIPOView("ipo-upcoming");
      if (market === "ipo-listed") renderIPOView("ipo-listed");
      if (market === "stocks-focus") renderStocksFocus();
      if (market === "investor-conversation") renderInvestorConversation();
      if (market === "mutual-funds") renderMutualFunds();
      if (market === "fund-flows") renderFundFlows();
      if (market === "market-calendar") renderMarketCalendar();

      if (view === "brief") renderBrief();
      if (view === "since") renderSince();
      if (view === "developing") renderDeveloping();
      if (view === "saved") renderSaved();
    });
  });
}


/* =========================================================
   RENDER CURRENT
========================================================= */

function renderCurrentView() {
  if (state.currentView === "brief") return renderBrief();

  if (state.currentView === "category") {
    return showCategory(state.currentCategory);
  }

  if (state.currentView === "market-brief") return renderMarketBrief();
  if (state.currentView === "ipo-open") return renderIPOView("ipo-open");
  if (state.currentView === "ipo-upcoming") return renderIPOView("ipo-upcoming");
  if (state.currentView === "ipo-listed") return renderIPOView("ipo-listed");
  if (state.currentView === "stocks-focus") return renderStocksFocus();

  if (state.currentView === "investor-conversation") {
    return renderInvestorConversation();
  }

  if (state.currentView === "mutual-funds") return renderMutualFunds();
  if (state.currentView === "fund-flows") return renderFundFlows();
  if (state.currentView === "market-calendar") return renderMarketCalendar();

  if (state.currentView === "saved") return renderSaved();

  renderBrief();
}


/* =========================================================
   LOAD
========================================================= */

async function loadData() {
  try {
    const response = await fetch(
      `${DATA_URL}?v=${Date.now()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    state.data = data;
    state.clusters = Array.isArray(data.clusters) ? data.clusters : [];
    state.top = Array.isArray(data.top) ? data.top : [];
    state.markets = data.markets || {};

    if (els.todayDate) {
      els.todayDate.textContent = longToday().toUpperCase();
    }

    if (els.lastUpdated) {
      els.lastUpdated.textContent =
        `Updated ${timeAgo(data.generated_at)}`;
    }

    const sources = data.sources || [];
    const healthy = sources.filter(source => source.ok).length;

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

    localStorage.setItem("di_last_visit", state.currentVisit);

  } catch (error) {
    console.error(error);

    els.contentView.innerHTML = `
      <div class="empty-state">
        <h2>The briefing couldn't load.</h2>
        <p>Refresh again in a moment.</p>
      </div>
    `;
  }
}


/* =========================================================
   EVENTS
========================================================= */

applyTheme();
installMarketsNavigation();
wireNavigation();

els.openMenu?.addEventListener("click", openMenu);
els.closeMenu?.addEventListener("click", closeMenu);
els.menuOverlay?.addEventListener("click", closeMenu);

els.themeButton?.addEventListener("click", toggleTheme);

els.viewSinceButton?.addEventListener("click", renderSince);

els.searchButton?.addEventListener("click", () => {
  els.searchPanel?.classList.toggle("hidden");
  els.searchInput?.focus();
});

els.closeSearch?.addEventListener("click", () => {
  els.searchPanel?.classList.add("hidden");
  if (els.searchInput) els.searchInput.value = "";
  renderBrief();
});

els.searchInput?.addEventListener("input", event => {
  searchStories(event.target.value);
});

els.sheetBackdrop?.addEventListener("click", closeSources);
els.closeSheet?.addEventListener("click", closeSources);

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeMenu();
    closeSources();
  }
});

loadData();
