const DATA_URL = "./data/latest.json";
const ARCHIVES_URL = "./data/archives.json";

const state = {
  data: null,
  clusters: [],
  top: [],
  currentView: "brief",
  currentCategory: null,
  searchQuery: "",
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

  sinceLastPanel: $("sinceLastPanel"),
  sinceSummary: $("sinceSummary"),
  viewSinceButton: $("viewSinceButton"),

  contentView: $("contentView"),
  emptyState: $("emptyState"),

  sourceSheet: $("sourceSheet"),
  sheetBackdrop: $("sheetBackdrop"),
  closeSheet: $("closeSheet"),
  sheetTitle: $("sheetTitle"),
  sheetSources: $("sheetSources")
};


/* =========================================================
   HELPERS
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


function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}


function timeAgo(value) {
  const date = parseDate(value);

  if (!date) return "";

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 1000)
  );

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days === 1) return "yesterday";

  return `${days}d ago`;
}


function shortDate(value) {
  const date = parseDate(value);

  if (!date) return "";

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "numeric",
      month: "short"
    }
  ).format(date);
}


function longToday() {
  return new Intl.DateTimeFormat(
    "en-IN",
    {
      weekday: "long",
      day: "numeric",
      month: "long"
    }
  ).format(new Date());
}


function truncateWords(text, maxWords = 90) {
  const clean = cleanText(text);

  if (!clean) return "";

  const words = clean.split(/\s+/);

  if (words.length <= maxWords) {
    return clean;
  }

  return `${words.slice(0, maxWords).join(" ")}…`;
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
  return (
    story.cluster_key ||
    story.url ||
    story.title
  );
}


function primaryUrl(story) {
  return (
    story.primary?.url ||
    story.articles?.[0]?.url ||
    story.url ||
    "#"
  );
}


function primaryPublisher(story) {
  return (
    story.primary?.source ||
    story.sources?.[0] ||
    "Source"
  );
}


function sourceNames(story) {
  if (
    Array.isArray(story.sources) &&
    story.sources.length
  ) {
    return story.sources;
  }

  return [
    ...new Set(
      (story.articles || [])
        .map(article => article.source)
        .filter(Boolean)
    )
  ];
}


function sourceCount(story) {
  const names = sourceNames(story);

  return names.length ||
    Number(story.source_count) ||
    1;
}


function usefulSummary(story) {
  const text =
    story.brief ||
    story.description ||
    story.primary?.description ||
    (story.articles || [])
      .find(article => article.description)
      ?.description ||
    "";

  return truncateWords(text, 90);
}


/* =========================================================
   IMPORTANCE
========================================================= */

function importanceLevel(story) {
  /*
    V5.1 trusts backend labels when available.

    CRITICAL is no longer inferred simply from a high
    numeric score in the browser.
  */

  const backend =
    String(story.importance_label || "")
      .toLowerCase();

  if (
    ["critical", "significant", "noteworthy"]
      .includes(backend)
  ) {
    return backend;
  }

  const score = Number(story.importance) || 0;

  if (score >= 42) {
    return "significant";
  }

  return "noteworthy";
}


function importanceText(story) {
  const level = importanceLevel(story);

  return level.charAt(0).toUpperCase() +
    level.slice(1);
}


/* =========================================================
   VISIT STATE
========================================================= */

function isNewSinceVisit(story) {
  if (!state.previousVisit) {
    return false;
  }

  const storyDate =
    parseDate(storyTimestamp(story));

  const previous =
    parseDate(state.previousVisit);

  if (!storyDate || !previous) {
    return false;
  }

  return storyDate > previous;
}


function storyState(story) {
  /*
    Important:
    We intentionally removed frontend inference
    of UPDATED.

    NEW is reliable because it is based on your
    previous browser visit.
  */

  if (isNewSinceVisit(story)) {
    return "New";
  }

  return "";
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

  localStorage.setItem(
    "di_saved",
    JSON.stringify([...state.saved])
  );

  renderCurrentView();
}


/* =========================================================
   CONTEXT
========================================================= */

function buildContext(story) {
  if (
    Array.isArray(story.related) &&
    story.related.length
  ) {
    return story.related.slice(0, 3);
  }

  const titleWords = new Set(
    String(story.title || "")
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 4)
  );

  return state.clusters
    .filter(other =>
      storyKey(other) !== storyKey(story)
    )
    .filter(other =>
      other.category === story.category
    )
    .filter(other => {
      const otherWords = new Set(
        String(other.title || "")
          .toLowerCase()
          .split(/\W+/)
          .filter(word => word.length > 4)
      );

      const overlap =
        [...titleWords]
          .filter(word => otherWords.has(word))
          .length;

      return overlap >= 2;
    })
    .sort(
      (a, b) =>
        new Date(storyTimestamp(b)) -
        new Date(storyTimestamp(a))
    )
    .slice(0, 3);
}


/* =========================================================
   MARKET HELPERS
========================================================= */

function isMarketStory(story) {
  return [
    "Indian Markets",
    "Global → India",
    "Companies & Earnings"
  ].includes(story.category);
}


function marketImpactHtml(story) {
  if (!story.market_impact) {
    return "";
  }

  const tags =
    Array.isArray(story.market_channels)
      ? story.market_channels
      : [];

  return `
    <div class="market-impact">

      <strong>India market relevance:</strong>
      ${escapeHtml(story.market_impact)}

      ${
        tags.length
          ? `
            <div class="market-tags">
              ${tags.map(tag => `
                <span class="market-tag">
                  ${escapeHtml(tag)}
                </span>
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
  const summary = usefulSummary(story);
  const count = sourceCount(story);
  const publisher = primaryPublisher(story);
  const status = storyState(story);
  const context = buildContext(story);

  const article =
    document.createElement("article");

  article.className =
    `story-card ${
      level === "critical"
        ? "is-critical"
        : ""
    }`;

  const contextHtml =
    context.length
      ? `
        <div class="context-box hidden">

          <div class="context-title">
            Related context
          </div>

          ${context.map(item => `
            <div class="context-item">

              <span class="context-date">
                ${escapeHtml(
                  shortDate(
                    item.published_at ||
                    storyTimestamp(item)
                  )
                )}
              </span>

              <span class="context-headline">
                ${escapeHtml(
                  item.title || ""
                )}
              </span>

            </div>
          `).join("")}

        </div>
      `
      : "";

  article.innerHTML = `
    <div class="story-topline">

      <span
        class="importance-label ${level}"
      >
        ${escapeHtml(
          importanceText(story)
        )}
      </span>

      <span class="category-label">
        ${escapeHtml(
          displayCategory(
            story.category || "News"
          )
        )}
      </span>

      ${
        status
          ? `
            <span class="story-state">
              ${status}
            </span>
          `
          : ""
      }

    </div>


    <h3 class="story-title">
      ${escapeHtml(story.title || "")}
    </h3>


    ${
      summary
        ? `
          <p class="story-summary">
            ${escapeHtml(summary)}
          </p>
        `
        : ""
    }


    ${marketImpactHtml(story)}


    <div class="story-meta">

      <span>
        ${escapeHtml(publisher)}
      </span>

      <span>·</span>

      <span>
        ${
          count === 1
            ? "1 source"
            : `${count} sources`
        }
      </span>

      <span>·</span>

      <span>
        ${escapeHtml(
          timeAgo(storyTimestamp(story))
        )}
      </span>

    </div>


    <div class="story-actions">

      ${
        context.length
          ? `
            <button
              class="story-action context-button"
              type="button"
            >
              Context
            </button>
          `
          : ""
      }

      <button
        class="story-action coverage-button"
        type="button"
      >
        ${
          count > 1
            ? `View ${count} sources`
            : "View source"
        }
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
        class="story-action save-button ${
          isSaved(story) ? "saved" : ""
        }"
        type="button"
      >
        ${isSaved(story) ? "Saved" : "Save"}
      </button>

    </div>

    ${contextHtml}
  `;


  article
    .querySelector(".coverage-button")
    ?.addEventListener(
      "click",
      () => openSources(story)
    );


  article
    .querySelector(".save-button")
    ?.addEventListener(
      "click",
      () => toggleSaved(story)
    );


  const contextButton =
    article.querySelector(".context-button");

  const contextBox =
    article.querySelector(".context-box");

  contextButton?.addEventListener(
    "click",
    () => {
      contextBox.classList.toggle("hidden");

      contextButton.textContent =
        contextBox.classList.contains("hidden")
          ? "Context"
          : "Hide context";
    }
  );

  return article;
}


function renderStoryList(container, stories) {
  container.innerHTML = "";

  if (!stories.length) {
    container.innerHTML = `
      <div class="loading-card">
        No significant developments in this view.
      </div>
    `;

    return;
  }

  stories.forEach(story =>
    container.appendChild(
      storyCard(story)
    )
  );
}


/* =========================================================
   SIDEBAR — INSERT MARKETS
========================================================= */

function installMarketsNavigation() {
  const navigation =
    document.querySelector(".navigation");

  if (!navigation) return;

  if (
    navigation.querySelector(
      '[data-category="Indian Markets"]'
    )
  ) {
    return;
  }

  const groups =
    [...navigation.querySelectorAll(".nav-group")];

  const worldGroup =
    groups.find(group =>
      group.querySelector(".nav-label")
        ?.textContent
        ?.trim()
        ?.toLowerCase() === "world"
    );

  const marketGroup =
    document.createElement("div");

  marketGroup.className = "nav-group";

  marketGroup.innerHTML = `
    <div class="nav-label">
      Markets
    </div>

    <button
      class="nav-item"
      data-category="Indian Markets"
    >
      Indian Markets
    </button>

    <button
      class="nav-item"
      data-category="Global → India"
    >
      Global → India
    </button>

    <button
      class="nav-item"
      data-category="Companies & Earnings"
    >
      Companies & Earnings
    </button>
  `;

  if (worldGroup) {
    navigation.insertBefore(
      marketGroup,
      worldGroup
    );
  } else {
    navigation.appendChild(
      marketGroup
    );
  }
}


/* =========================================================
   THE BRIEF
========================================================= */

function topBriefStories() {
  const candidates =
    state.top.length
      ? state.top
      : state.clusters;

  return candidates
    .filter(story =>
      importanceLevel(story) !== "noteworthy"
    )
    .slice(0, 8);
}


function developingStories() {
  /*
    Backend can explicitly identify a developing story.
    No more guessing based on source timestamps.
  */

  return state.clusters
    .filter(story =>
      story.is_developing === true
    )
    .slice(0, 6);
}


function renderBrief() {
  state.currentView = "brief";
  state.currentCategory = null;

  setPageHeader(
    "The Brief",
    "What matters today, without the noise."
  );

  setActiveNav(null, "brief");

  els.contentView.innerHTML = "";

  const stories =
    topBriefStories();

  const section =
    document.createElement("section");

  section.className =
    "content-section";

  section.innerHTML = `
    <div class="section-heading">

      <div>
        <div class="section-kicker">
          ESSENTIAL
        </div>

        <h2>The Brief</h2>
      </div>

      <span class="section-count">
        ${stories.length}
      </span>

    </div>

    <div
      id="briefStoriesV51"
      class="story-list"
    ></div>
  `;

  els.contentView.appendChild(section);

  renderStoryList(
    section.querySelector(
      "#briefStoriesV51"
    ),
    stories
  );


  const developing =
    developingStories();

  if (developing.length) {
    const developingSection =
      document.createElement("section");

    developingSection.className =
      "content-section";

    developingSection.innerHTML = `
      <div class="section-heading">

        <div>
          <div class="section-kicker">
            ACTIVE STORIES
          </div>

          <h2>Developing</h2>
        </div>

        <span class="section-count">
          ${developing.length}
        </span>

      </div>

      <div class="developing-list">

        ${developing
          .slice(0, 4)
          .map(story => `
            <div
              class="developing-card"
              data-key="${escapeHtml(
                storyKey(story)
              )}"
            >

              <div class="section-kicker">
                ${escapeHtml(
                  displayCategory(
                    story.category
                  )
                )}
              </div>

              <h3>
                ${escapeHtml(story.title)}
              </h3>

              <div class="developing-meta">
                ${sourceCount(story)}
                sources ·
                ${escapeHtml(
                  timeAgo(
                    storyTimestamp(story)
                  )
                )}
              </div>

            </div>
          `)
          .join("")}

      </div>
    `;

    els.contentView.appendChild(
      developingSection
    );

    developingSection
      .querySelectorAll(".developing-card")
      .forEach(card => {
        card.addEventListener(
          "click",
          () => {
            const story =
              state.clusters.find(
                item =>
                  storyKey(item) ===
                  card.dataset.key
              );

            if (story) {
              openSources(story);
            }
          }
        );
      });
  }

  renderExplore();
}


/* =========================================================
   EXPLORE
========================================================= */

function displayCategory(category) {
  const aliases = {
    "Macro Economics":
      "Economy & Policy",

    "Business & Micro":
      "Business"
  };

  return aliases[category] || category;
}


function renderExplore() {
  const counts = {};

  state.clusters.forEach(story => {
    const category =
      story.category || "Other";

    counts[category] =
      (counts[category] || 0) + 1;
  });

  const order = [
    "India",
    "Indian Politics",
    "Macro Economics",
    "Business & Micro",

    "Indian Markets",
    "Global → India",
    "Companies & Earnings",

    "World",
    "Geopolitics",
    "World Politics",

    "AI",
    "Technology",
    "Science & Climate",
    "The Ken"
  ];

  const section =
    document.createElement("section");

  section.className =
    "content-section";

  section.innerHTML = `
    <div class="section-heading">

      <div>
        <div class="section-kicker">
          GO DEEPER
        </div>

        <h2>Explore</h2>
      </div>

    </div>

    <div class="category-grid">

      ${order
        .filter(category =>
          counts[category]
        )
        .map(category => `
          <button
            class="category-card"
            data-category="${escapeHtml(
              category
            )}"
          >

            <div class="category-card-name">
              ${escapeHtml(
                displayCategory(category)
              )}
            </div>

            <div class="category-card-count">
              ${counts[category]}
              ${
                counts[category] === 1
                  ? "story"
                  : "stories"
              }
            </div>

          </button>
        `)
        .join("")}

    </div>
  `;

  els.contentView.appendChild(section);

  section
    .querySelectorAll(".category-card")
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          showCategory(
            button.dataset.category
          )
      );
    });
}


/* =========================================================
   CATEGORY VIEW
========================================================= */

function categoryDescription(category) {
  const descriptions = {
    "Indian Markets":
      "The developments that materially matter for Indian equities and capital markets.",

    "Global → India":
      "Global developments with identifiable transmission channels into Indian markets.",

    "Companies & Earnings":
      "Material earnings, IPO, M&A and company developments — not every stock move.",

    "Macro Economics":
      "Rates, inflation, liquidity, growth, fiscal policy and the Indian economy.",

    "Indian Politics":
      "Consequential political and policy developments without routine political noise.",

    "AI":
      "Important model, product, research, infrastructure and AI-policy developments."
  };

  return (
    descriptions[category] ||
    `Latest significant developments in ${displayCategory(category)}.`
  );
}


function showCategory(category) {
  state.currentView = "category";
  state.currentCategory = category;

  closeMenu();

  setActiveNav(category);

  setPageHeader(
    displayCategory(category),
    categoryDescription(category)
  );

  const stories =
    state.clusters
      .filter(story =>
        story.category === category
      )
      .sort(
        (a, b) =>
          (Number(b.importance) || 0) -
          (Number(a.importance) || 0)
      );

  renderSingleView(
    displayCategory(category),
    stories,
    `${stories.length} ${
      stories.length === 1
        ? "development"
        : "developments"
    }`
  );
}


function renderSingleView(
  title,
  stories,
  description = ""
) {
  els.contentView.innerHTML = "";

  const section =
    document.createElement("section");

  section.className =
    "content-section";

  section.innerHTML = `
    <div class="view-header">

      <div class="section-kicker">
        DAILY INTELLIGENCE
      </div>

      <h2>
        ${escapeHtml(title)}
      </h2>

      ${
        description
          ? `
            <p>
              ${escapeHtml(description)}
            </p>
          `
          : ""
      }

    </div>

    <div
      id="singleViewStories"
      class="story-list"
    ></div>
  `;

  els.contentView.appendChild(section);

  renderStoryList(
    section.querySelector(
      "#singleViewStories"
    ),
    stories
  );
}


/* =========================================================
   SINCE LAST CHECK
========================================================= */

function renderSinceLastCheck() {
  state.currentView = "since";
  state.currentCategory = null;

  closeMenu();

  setActiveNav(null, "since");

  setPageHeader(
    "Since Last Check",
    "Only developments published since your previous visit."
  );

  const stories =
    state.previousVisit
      ? state.clusters
          .filter(isNewSinceVisit)
          .sort(
            (a, b) =>
              new Date(storyTimestamp(b)) -
              new Date(storyTimestamp(a))
          )
      : topBriefStories();

  renderSingleView(
    "Since Last Check",
    stories,
    state.previousVisit
      ? `${stories.length} new developments`
      : "Your first recorded visit."
  );
}


/* =========================================================
   DEVELOPING
========================================================= */

function renderDevelopingView() {
  state.currentView = "developing";
  state.currentCategory = null;

  closeMenu();

  setActiveNav(null, "developing");

  setPageHeader(
    "Developing",
    "Important stories receiving material new information."
  );

  const stories =
    developingStories();

  renderSingleView(
    "Developing",
    stories,
    `${stories.length} active stories`
  );
}


/* =========================================================
   SAVED
========================================================= */

function renderSaved() {
  state.currentView = "saved";
  state.currentCategory = null;

  closeMenu();

  setActiveNav(null, "saved");

  setPageHeader(
    "Saved",
    "Stories you've kept for later."
  );

  const stories =
    state.clusters.filter(isSaved);

  renderSingleView(
    "Saved",
    stories,
    `${stories.length} saved stories`
  );
}


/* =========================================================
   SOURCES
========================================================= */

function renderSourcesView() {
  state.currentView = "sources";
  state.currentCategory = null;

  closeMenu();

  setActiveNav(null, "sources");

  setPageHeader(
    "Sources",
    "Feed health for the latest refresh."
  );

  const sources =
    state.data?.sources || [];

  els.contentView.innerHTML = "";

  const section =
    document.createElement("section");

  section.className =
    "content-section";

  section.innerHTML = `
    <div class="view-header">

      <div class="section-kicker">
        SOURCE HEALTH
      </div>

      <h2>Sources</h2>

      <p>
        ${sources.filter(source => source.ok).length}
        of ${sources.length} feeds healthy.
      </p>

    </div>

    <div class="story-list">

      ${sources.map(source => `
        <div class="story-card">

          <div class="story-topline">

            <span
              class="importance-label ${
                source.ok
                  ? "significant"
                  : ""
              }"
            >
              ${
                source.ok
                  ? "Healthy"
                  : "Unavailable"
              }
            </span>

            <span class="category-label">
              ${escapeHtml(
                source.category || ""
              )}
            </span>

          </div>

          <h3 class="story-title">
            ${escapeHtml(
              source.source || ""
            )}
          </h3>

          <div class="story-meta">
            ${Number(
              source.item_count || 0
            )}
            items retrieved
          </div>

        </div>
      `).join("")}

    </div>
  `;

  els.contentView.appendChild(section);
}


/* =========================================================
   ARCHIVES
========================================================= */

async function renderArchives() {
  state.currentView = "archives";
  state.currentCategory = null;

  closeMenu();

  setActiveNav(null, "archives");

  setPageHeader(
    "Archives",
    "Previous Daily Intelligence briefings."
  );

  els.contentView.innerHTML = `
    <div class="loading-card">
      Loading archives…
    </div>
  `;

  try {
    const response =
      await fetch(
        `${ARCHIVES_URL}?v=${Date.now()}`,
        { cache: "no-store" }
      );

    if (!response.ok) {
      throw new Error("Archive unavailable");
    }

    const archives =
      await response.json();

    els.contentView.innerHTML = `
      <section class="content-section">

        <div class="view-header">

          <div class="section-kicker">
            ARCHIVE
          </div>

          <h2>Daily Briefings</h2>

          <p>
            ${archives.length}
            archived briefings.
          </p>

        </div>

        <div class="story-list">

          ${archives.map(item => `
            <div class="story-card">

              <div class="category-label">
                DAILY BRIEF
              </div>

              <h3 class="story-title">
                ${escapeHtml(item.date)}
              </h3>

              <div class="story-meta">
                ${item.count || 0}
                essential stories
              </div>

            </div>
          `).join("")}

        </div>

      </section>
    `;

  } catch {
    els.contentView.innerHTML = `
      <div class="empty-state">

        <h2>
          Archives unavailable.
        </h2>

        <p>
          Today's briefing is unaffected.
        </p>

      </div>
    `;
  }
}


/* =========================================================
   SEARCH
========================================================= */

function searchStories(query) {
  const q =
    query.trim().toLowerCase();

  if (!q) {
    renderBrief();
    return;
  }

  const results =
    state.clusters.filter(story => {
      const haystack = [
        story.title,
        story.description,
        story.brief,
        story.category,
        story.market_impact,
        ...(story.sources || [])
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });

  state.currentView = "search";

  setPageHeader(
    "Search",
    `${results.length} results for “${query}”.`
  );

  renderSingleView(
    `Results for “${query}”`,
    results
  );
}


/* =========================================================
   SOURCE SHEET
========================================================= */

function openSources(story) {
  const articles =
    story.articles || [];

  els.sheetTitle.textContent =
    story.title || "Coverage";

  if (!articles.length) {
    els.sheetSources.innerHTML = `
      <a
        class="sheet-source"
        href="${escapeHtml(primaryUrl(story))}"
        target="_blank"
        rel="noopener noreferrer"
      >

        <div class="sheet-source-name">
          ${escapeHtml(primaryPublisher(story))}
        </div>

        <div class="sheet-source-title">
          ${escapeHtml(story.title || "")}
        </div>

      </a>
    `;
  } else {
    els.sheetSources.innerHTML =
      articles
        .slice()
        .sort(
          (a, b) =>
            new Date(b.published_at || 0) -
            new Date(a.published_at || 0)
        )
        .map(article => `
          <a
            class="sheet-source"
            href="${escapeHtml(article.url || "#")}"
            target="_blank"
            rel="noopener noreferrer"
          >

            <div class="sheet-source-name">
              ${escapeHtml(
                article.source || "Source"
              )}
            </div>

            <div class="sheet-source-title">
              ${escapeHtml(
                article.title ||
                story.title ||
                ""
              )}
            </div>

            <div class="sheet-source-time">
              ${escapeHtml(
                timeAgo(article.published_at)
              )}
            </div>

          </a>
        `)
        .join("");
  }

  els.sourceSheet.classList.remove("hidden");

  els.sourceSheet.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.style.overflow = "hidden";
}


function closeSources() {
  els.sourceSheet.classList.add("hidden");

  els.sourceSheet.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.style.overflow = "";
}


/* =========================================================
   HEADER / NAV
========================================================= */

function setPageHeader(title, description) {
  els.pageTitle.textContent = title;
  els.pageDescription.textContent = description;
}


function setActiveNav(
  category = null,
  view = null
) {
  document
    .querySelectorAll(".nav-item")
    .forEach(button => {
      button.classList.remove("active");

      if (
        category &&
        button.dataset.category === category
      ) {
        button.classList.add("active");
      }

      if (
        view &&
        button.dataset.view === view
      ) {
        button.classList.add("active");
      }
    });
}


function openMenu() {
  document.body.classList.add("menu-open");

  els.openMenu?.setAttribute(
    "aria-expanded",
    "true"
  );
}


function closeMenu() {
  document.body.classList.remove("menu-open");

  els.openMenu?.setAttribute(
    "aria-expanded",
    "false"
  );
}


/* =========================================================
   HEALTH / SINCE
========================================================= */

function updateHealth() {
  const sources =
    state.data?.sources || [];

  const healthy =
    sources.filter(source => source.ok).length;

  const total =
    sources.length;

  const ratio =
    total ? healthy / total : 0;

  const healthClass =
    ratio >= .8
      ? "healthy"
      : ratio >= .5
        ? "partial"
        : "unhealthy";

  [
    els.healthDot,
    els.sidebarHealthDot
  ].forEach(dot => {
    if (!dot) return;

    dot.classList.remove(
      "healthy",
      "partial",
      "unhealthy"
    );

    dot.classList.add(healthClass);
  });

  els.sidebarStatus.textContent =
    `${healthy}/${total} sources healthy`;
}


function updateTimestamp() {
  const generated =
    state.data?.generated_at;

  els.lastUpdated.textContent =
    generated
      ? `Updated ${timeAgo(generated)}`
      : "Updated recently";
}


function updateSincePanel() {
  if (!state.previousVisit) {
    els.sinceSummary.textContent =
      "First visit recorded. Changes will appear from your next visit.";

    return;
  }

  const fresh =
    state.clusters.filter(isNewSinceVisit);

  const significant =
    fresh.filter(story =>
      importanceLevel(story) !== "noteworthy"
    );

  if (!fresh.length) {
    els.sinceSummary.textContent =
      "No new developments since your last check.";

    return;
  }

  els.sinceSummary.textContent =
    `${significant.length} significant ${
      significant.length === 1
        ? "development"
        : "developments"
    } since your last check.`;
}


/* =========================================================
   THEME
========================================================= */

function applyTheme() {
  const stored =
    localStorage.getItem("di_theme");

  const prefersDark =
    window.matchMedia?.(
      "(prefers-color-scheme: dark)"
    ).matches;

  const theme =
    stored ||
    (prefersDark ? "dark" : "light");

  document.documentElement.setAttribute(
    "data-theme",
    theme
  );
}


function toggleTheme() {
  const current =
    document.documentElement.getAttribute(
      "data-theme"
    );

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


/* =========================================================
   CURRENT VIEW
========================================================= */

function renderCurrentView() {
  if (
    state.currentView === "category" &&
    state.currentCategory
  ) {
    showCategory(state.currentCategory);
    return;
  }

  if (state.currentView === "since") {
    renderSinceLastCheck();
    return;
  }

  if (state.currentView === "developing") {
    renderDevelopingView();
    return;
  }

  if (state.currentView === "saved") {
    renderSaved();
    return;
  }

  if (state.currentView === "sources") {
    renderSourcesView();
    return;
  }

  if (state.currentView === "archives") {
    renderArchives();
    return;
  }

  renderBrief();
}


/* =========================================================
   EVENTS
========================================================= */

function wireNavigationEvents() {
  document
    .querySelectorAll(".nav-item")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const category =
            button.dataset.category;

          const view =
            button.dataset.view;

          if (category) {
            showCategory(category);
            return;
          }

          if (view === "brief") {
            closeMenu();
            renderBrief();
          }

          if (view === "since") {
            renderSinceLastCheck();
          }

          if (view === "developing") {
            renderDevelopingView();
          }

          if (view === "saved") {
            renderSaved();
          }

          if (view === "archives") {
            renderArchives();
          }

          if (view === "sources") {
            renderSourcesView();
          }
        }
      );
    });
}


function wireEvents() {
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

  els.searchButton?.addEventListener(
    "click",
    () => {
      els.searchPanel.classList.toggle("hidden");

      if (
        !els.searchPanel.classList.contains("hidden")
      ) {
        setTimeout(
          () => els.searchInput?.focus(),
          50
        );
      }
    }
  );

  els.closeSearch?.addEventListener(
    "click",
    () => {
      els.searchPanel.classList.add("hidden");
      els.searchInput.value = "";
      renderBrief();
    }
  );

  els.searchInput?.addEventListener(
    "input",
    event =>
      searchStories(event.target.value)
  );

  els.viewSinceButton?.addEventListener(
    "click",
    renderSinceLastCheck
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
        els.searchPanel?.classList.add("hidden");
      }
    }
  );
}


/* =========================================================
   LOAD
========================================================= */

async function loadData() {
  try {
    const response =
      await fetch(
        `${DATA_URL}?v=${Date.now()}`,
        { cache: "no-store" }
      );

    if (!response.ok) {
      throw new Error(
        `Data returned ${response.status}`
      );
    }

    const data =
      await response.json();

    state.data = data;

    state.clusters =
      Array.isArray(data.clusters)
        ? data.clusters
        : [];

    state.top =
      Array.isArray(data.top)
        ? data.top
        : [];

    els.todayDate.textContent =
      longToday().toUpperCase();

    updateTimestamp();
    updateHealth();
    updateSincePanel();

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

    els.lastUpdated.textContent =
      "Data unavailable";
  }
}


/* =========================================================
   START
========================================================= */

applyTheme();

/*
  Add Markets before wiring navigation,
  otherwise the dynamically-added buttons
  wouldn't receive click handlers.
*/
installMarketsNavigation();

wireEvents();
wireNavigationEvents();

loadData();
