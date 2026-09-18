/* ============================================================
   DAILY INTELLIGENCE
   V6 APPLICATION
   Signal over noise.
   ============================================================ */

const DATA_URL = "./data/latest.json";
const ARCHIVES_URL = "./data/archives.json";


/* ============================================================
   STATE
   ============================================================ */

const state = {
  data: null,
  clusters: [],
  top: [],
  markets: {},

  currentView: "brief",
  currentCategory: null,

  saved: new Set(
    JSON.parse(localStorage.getItem("di_saved") || "[]")
  ),

  previousVisit: localStorage.getItem("di_last_visit"),
  currentVisit: new Date().toISOString()
};


const $ = id => document.getElementById(id);


const els = {
  menuOverlay: $("menuOverlay"),
  openMenu: $("openMenu"),
  closeMenu: $("closeMenu"),

  searchButton: $("searchButton"),
  desktopSearchTrigger: $("desktopSearchTrigger"),
  searchPanel: $("searchPanel"),
  searchInput: $("searchInput"),
  closeSearch: $("closeSearch"),

  themeButton: $("themeButton"),
  sidebarThemeButton: $("sidebarThemeButton"),

  todayDate: $("todayDate"),
  topbarDate: $("topbarDate"),
  topbarUpdated: $("topbarUpdated"),

  pageTitle: $("pageTitle"),
  pageDescription: $("pageDescription"),
  lastUpdated: $("lastUpdated"),

  sidebarHealthDot: $("sidebarHealthDot"),
  healthDot: $("healthDot"),
  sidebarStatus: $("sidebarStatus"),

  sinceLastPanel: $("sinceLastPanel"),
  sinceSummary: $("sinceSummary"),
  viewSinceButton: $("viewSinceButton"),

  contentView: $("contentView"),

  contextRail: $("contextRail"),
  glancePanel: $("glancePanel"),
  glanceGrid: $("glanceGrid"),
  changedPanel: $("changedPanel"),
  changedSummary: $("changedSummary"),
  contextSinceButton: $("contextSinceButton"),
  topicPanel: $("topicPanel"),
  topicChips: $("topicChips"),

  sourceSheet: $("sourceSheet"),
  sheetBackdrop: $("sheetBackdrop"),
  closeSheet: $("closeSheet"),
  sheetTitle: $("sheetTitle"),
  sheetSources: $("sheetSources"),

  mobileBottomNav: $("mobileBottomNav")
};


/* ============================================================
   BASIC HELPERS
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
  const words = cleanText(text)
    .split(/\s+/)
    .filter(Boolean);

  if (words.length <= limit) {
    return words.join(" ");
  }

  return words
    .slice(0, limit)
    .join(" ") + "…";
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
    (Date.now() - date.getTime()) / 1000
  );

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  return days === 1
    ? "yesterday"
    : `${days}d ago`;
}


function formatToday() {
  return new Intl.DateTimeFormat(
    "en-IN",
    {
      weekday: "long",
      day: "numeric",
      month: "long"
    }
  )
    .format(new Date())
    .toUpperCase();
}


function formatCompactDate() {
  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  ).format(new Date());
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


function sourceCount(story) {
  if (story.source_count) {
    return Number(story.source_count);
  }

  if (Array.isArray(story.sources)) {
    return story.sources.length;
  }

  if (Array.isArray(story.articles)) {
    return Math.max(1, story.articles.length);
  }

  return 1;
}


function usefulSummary(story, limit = 70) {
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
    "Business & Micro": "Business",
    "Indian Markets": "Markets",
    "Companies & Earnings": "Companies",
    "Global → India": "Global → India"
  };

  return aliases[category] || category;
}


function dedupeStories(stories = []) {
  const seen = new Set();

  return stories.filter(story => {
    const key = storyKey(story);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}


function sortByImportance(stories = []) {
  return [...stories].sort((a, b) => {
    const importanceDifference =
      Number(b.importance || 0) -
      Number(a.importance || 0);

    if (importanceDifference !== 0) {
      return importanceDifference;
    }

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
  const supplied =
    String(story.importance_label || "")
      .toLowerCase();

  if (
    ["critical", "significant", "noteworthy"]
      .includes(supplied)
  ) {
    return supplied;
  }

  const score = Number(story.importance || 0);

  if (score >= 60) {
    return "critical";
  }

  if (score >= 43) {
    return "significant";
  }

  return "noteworthy";
}


function importanceScore(story) {
  const score = Number(story.importance || 0);

  if (score) {
    return score;
  }

  const level = importanceLevel(story);

  if (level === "critical") return 60;
  if (level === "significant") return 45;

  return 25;
}


function isNewSinceVisit(story) {
  if (!state.previousVisit) {
    return false;
  }

  const storyDate = parseDate(
    storyTimestamp(story)
  );

  const previous = parseDate(
    state.previousVisit
  );

  return Boolean(
    storyDate &&
    previous &&
    storyDate > previous
  );
}


/* ============================================================
   SAVED STORIES
   ============================================================ */

function isSaved(story) {
  return state.saved.has(
    storyKey(story)
  );
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


/* ============================================================
   PAGE CHROME
   ============================================================ */

function setPageHeader(title, description) {
  if (els.pageTitle) {
    els.pageTitle.textContent = title;
  }

  if (els.pageDescription) {
    els.pageDescription.textContent = description;
  }
}


function setActiveNavigation({
  view = null,
  category = null
} = {}) {
  document
    .querySelectorAll(
      ".nav-item, .mobile-nav-item"
    )
    .forEach(button => {
      button.classList.remove("active");
    });


  document
    .querySelectorAll(".nav-item")
    .forEach(button => {
      if (
        view &&
        button.dataset.view === view
      ) {
        button.classList.add("active");
      }

      if (
        category &&
        button.dataset.category === category
      ) {
        button.classList.add("active");
      }

      if (
        view === "markets" &&
        (
          button.dataset.view === "markets" ||
          button.dataset.category === "Indian Markets"
        )
      ) {
        button.classList.add("active");
      }
    });


  document
    .querySelectorAll(".mobile-nav-item")
    .forEach(button => {
      if (
        button.dataset.view === view
      ) {
        button.classList.add("active");
      }
    });
}


function showSincePanel(show = true) {
  if (!els.sinceLastPanel) return;

  els.sinceLastPanel.classList.toggle(
    "hidden",
    !show
  );
}


function hideContextRail() {
  els.contextRail?.classList.add("hidden");

  els.glancePanel?.classList.add("hidden");
  els.changedPanel?.classList.add("hidden");
  els.topicPanel?.classList.add("hidden");
}


/* ============================================================
   STORY CARD
   ============================================================ */

function marketImpactHtml(story) {
  if (!story.market_impact) {
    return "";
  }

  return `
    <div class="context-box">

      <div class="context-title">
        INDIA CONNECTION
      </div>

      <div class="context-headline">
        ${escapeHtml(story.market_impact)}
      </div>

    </div>
  `;
}


function storyCard(
  story,
  {
    compact = false,
    showSummary = true
  } = {}
) {
  const level = importanceLevel(story);

  const publisher =
    primaryPublisher(story);

  const count =
    sourceCount(story);

  const summary =
    usefulSummary(
      story,
      compact ? 38 : 70
    );

  const article =
    document.createElement("article");

  article.className =
    `story-card ${
      level === "critical"
        ? "is-critical"
        : ""
    }`;


  article.innerHTML = `
    <div class="story-topline">

      <span class="importance-label ${level}">
        ${escapeHtml(level)}
      </span>

      <span class="category-label">
        ${escapeHtml(
          displayCategory(
            story.category || "News"
          )
        )}
      </span>

      ${
        isNewSinceVisit(story)
          ? `
            <span class="story-state">
              NEW
            </span>
          `
          : ""
      }

    </div>


    <h3 class="story-title">
      ${escapeHtml(story.title || "")}
    </h3>


    ${
      showSummary && summary
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

      <span class="meta-separator">·</span>

      <span>
        ${count}
        ${count === 1 ? "source" : "sources"}
      </span>

      <span class="meta-separator">·</span>

      <span>
        ${escapeHtml(
          timeAgo(
            storyTimestamp(story)
          )
        )}
      </span>

    </div>


    <div class="story-actions">

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
          isSaved(story)
            ? "saved"
            : ""
        }"
        type="button"
      >
        ${
          isSaved(story)
            ? "Saved"
            : "Save"
        }
      </button>

    </div>
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


  return article;
}


function renderStoryCards(
  container,
  stories,
  options = {}
) {
  if (!container) return;

  container.innerHTML = "";

  stories.forEach(story => {
    container.appendChild(
      storyCard(story, options)
    );
  });
}


/* ============================================================
   EMPTY STATE
   ============================================================ */

function emptyStateHtml({
  title = "Nothing important enough right now.",
  description =
    "No significant developments currently match this view.",
  button = true
} = {}) {
  return `
    <section class="empty-state">

      <div
        class="empty-state-icon"
        aria-hidden="true"
      >
        ◇
      </div>

      <h2>
        ${escapeHtml(title)}
      </h2>

      <p>
        ${escapeHtml(description)}
      </p>

      ${
        button
          ? `
            <button
              class="primary-button empty-back-button"
              type="button"
            >
              Back to The Brief
            </button>
          `
          : ""
      }

    </section>
  `;
}


function wireEmptyBackButton() {
  document
    .querySelector(".empty-back-button")
    ?.addEventListener(
      "click",
      renderBrief
    );
}


/* ============================================================
   BRIEF
   ============================================================ */

function getBriefStories() {
  const supplied =
    Array.isArray(state.top)
      ? state.top
      : [];

  if (supplied.length) {
    return dedupeStories(supplied)
      .slice(0, 8);
  }

  return sortByImportance(
    state.clusters
  ).slice(0, 8);
}


function renderBrief() {
  state.currentView = "brief";
  state.currentCategory = null;

  closeMenu();
  closeSearchPanel(false);

  setActiveNavigation({
    view: "brief"
  });

  setPageHeader(
    "The Brief",
    "What matters today, without the noise."
  );

  showSincePanel(true);
  hideContextRail();


  const stories =
    getBriefStories();


  if (!stories.length) {
    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          "No major developments right now.",
        description:
          "The briefing is deliberately quiet when the signal is weak."
      });

    wireEmptyBackButton();

    return;
  }


  els.contentView.innerHTML = `
    <section
      id="briefSection"
      class="content-section brief-section"
    >

      <div class="section-heading">

        <div>

          <div class="section-kicker">
            TODAY'S BRIEF
          </div>

          <h2>
            Developments worth your attention
          </h2>

        </div>

        <span class="section-count">
          ${stories.length}
        </span>

      </div>


      <div
        id="briefStories"
        class="story-list brief-story-grid"
      ></div>

    </section>


    ${renderDevelopingPreview()}


    ${renderExplorePreview()}
  `;


  renderStoryCards(
    $("briefStories"),
    stories
  );


  wireDevelopingPreview();
  wireExploreCards();
}


/* ============================================================
   DEVELOPING PREVIEW
   ============================================================ */

function getDevelopingStories() {
  return sortByImportance(
    state.clusters.filter(
      story =>
        story.is_developing === true
    )
  );
}


function renderDevelopingPreview() {
  const stories =
    getDevelopingStories()
      .slice(0, 4);

  if (!stories.length) {
    return "";
  }


  return `
    <section
      id="developingSection"
      class="content-section developing-section"
    >

      <div class="section-heading">

        <div>

          <div class="section-kicker developing-kicker">
            DEVELOPING NOW
          </div>

          <h2>
            Stories still moving
          </h2>

        </div>

        <button
          class="quiet-button developing-all-button"
          type="button"
        >
          View all
        </button>

      </div>


      <div
        class="developing-list"
      >

        ${stories.map(story => `
          <article
            class="developing-card"
            data-story-key="${escapeHtml(storyKey(story))}"
          >

            <div class="developing-meta">
              ${escapeHtml(
                timeAgo(
                  storyTimestamp(story)
                )
              )}
            </div>

            <h3>
              ${escapeHtml(story.title || "")}
            </h3>

          </article>
        `).join("")}

      </div>

    </section>
  `;
}


function wireDevelopingPreview() {
  document
    .querySelector(".developing-all-button")
    ?.addEventListener(
      "click",
      renderDeveloping
    );


  document
    .querySelectorAll(".developing-card")
    .forEach(card => {
      card.addEventListener(
        "click",
        () => {
          const story =
            state.clusters.find(
              item =>
                storyKey(item) ===
                card.dataset.storyKey
            );

          if (story) {
            openSources(story);
          }
        }
      );
    });
}


/* ============================================================
   EXPLORE
   ============================================================ */

const exploreCategories = [
  "India",
  "Indian Politics",
  "Macro Economics",
  "Business & Micro",
  "World",
  "Geopolitics",
  "AI",
  "Technology"
];


function categoryCount(category) {
  return state.clusters.filter(
    story =>
      story.category === category
  ).length;
}


function renderExplorePreview() {
  return `
    <section
      id="exploreSection"
      class="content-section explore-section"
    >

      <div class="section-heading">

        <div>

          <div class="section-kicker">
            EXPLORE
          </div>

          <h2>
            Explore by topic
          </h2>

        </div>

      </div>


      <div
        id="categoryGrid"
        class="category-grid"
      >

        ${exploreCategories.map(
          category => `
            <button
              class="category-card"
              type="button"
              data-explore-category="${escapeHtml(category)}"
            >

              <div class="category-card-name">
                ${escapeHtml(
                  displayCategory(category)
                )}
              </div>

              <div class="category-card-count">
                ${categoryCount(category)}
                ${
                  categoryCount(category) === 1
                    ? "development"
                    : "developments"
                }
              </div>

            </button>
          `
        ).join("")}

      </div>

    </section>
  `;
}


function wireExploreCards() {
  document
    .querySelectorAll(
      "[data-explore-category]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          showCategory(
            button.dataset.exploreCategory
          );
        }
      );
    });
}


function renderExplore() {
  state.currentView = "explore";
  state.currentCategory = null;

  closeMenu();

  setActiveNavigation({
    view: "explore"
  });

  setPageHeader(
    "Explore",
    "Move through today's intelligence by topic."
  );

  showSincePanel(false);
  hideContextRail();


  const categories = [
    "India",
    "Indian Politics",
    "Macro Economics",
    "Business & Micro",
    "Indian Markets",
    "World",
    "Geopolitics",
    "World Politics",
    "AI",
    "Technology",
    "Science & Climate",
    "The Ken"
  ];


  els.contentView.innerHTML = `
    <section class="content-section">

      <div class="section-heading">

        <div>

          <div class="section-kicker">
            ALL TOPICS
          </div>

          <h2>
            Choose where to go deeper
          </h2>

        </div>

      </div>


      <div class="category-grid">

        ${categories.map(
          category => `
            <button
              class="category-card"
              type="button"
              data-explore-category="${escapeHtml(category)}"
            >

              <div class="category-card-name">
                ${escapeHtml(
                  displayCategory(category)
                )}
              </div>

              <div class="category-card-count">
                ${categoryCount(category)}
                ${
                  categoryCount(category) === 1
                    ? "development"
                    : "developments"
                }
              </div>

            </button>
          `
        ).join("")}

      </div>

    </section>
  `;


  wireExploreCards();
}


/* ============================================================
   CATEGORY VIEW
   ============================================================ */

function showCategory(category) {
  if (
    category === "Indian Markets"
  ) {
    renderMarkets();
    return;
  }


  state.currentView = "category";
  state.currentCategory = category;

  closeMenu();

  setActiveNavigation({
    category
  });


  const stories =
    sortByImportance(
      state.clusters.filter(
        story =>
          story.category === category
      )
    );


  const label =
    displayCategory(category);


  setPageHeader(
    label,
    `Significant developments in ${label}.`
  );


  showSincePanel(true);
  hideContextRail();


  if (!stories.length) {
    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          `No significant ${label.toLowerCase()} development right now.`,
        description:
          "That doesn't mean nothing is happening. It means nothing currently clears the briefing threshold."
      });

    wireEmptyBackButton();

    return;
  }


  els.contentView.innerHTML = `
    <section class="content-section category-view">

      <div class="view-header">

        <div class="section-kicker">
          DAILY INTELLIGENCE
        </div>

        <h2>
          ${escapeHtml(label)}
        </h2>

        <p>
          ${stories.length}
          ${
            stories.length === 1
              ? "development"
              : "developments"
          }
        </p>

      </div>


      <div
        id="categoryStoryList"
        class="story-list"
      ></div>

    </section>
  `;


  renderStoryCards(
    $("categoryStoryList"),
    stories
  );
}


/* ============================================================
   SINCE LAST CHECK
   ============================================================ */

function getFreshStories() {
  if (!state.previousVisit) {
    return [];
  }

  return state.clusters.filter(
    isNewSinceVisit
  );
}


function getCatchupStories() {
  const fresh =
    sortByImportance(
      getFreshStories()
    );

  /*
    Keep the catch-up intentionally finite.
    This does NOT alter the underlying data.
  */

  return fresh.slice(0, 12);
}


function renderSince() {
  state.currentView = "since";
  state.currentCategory = null;

  closeMenu();

  setActiveNavigation({
    view: "since"
  });

  setPageHeader(
    "Since Last Check",
    "The developments worth catching up on since your previous visit."
  );

  showSincePanel(false);
  hideContextRail();


  if (!state.previousVisit) {
    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          "Your catch-up starts after this visit.",
        description:
          "When you return, this view will surface the most consequential developments published in between."
      });

    wireEmptyBackButton();

    return;
  }


  const allFresh =
    sortByImportance(
      getFreshStories()
    );

  const catchup =
    getCatchupStories();


  if (!allFresh.length) {
    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          "You're caught up.",
        description:
          "No new developments have cleared the briefing threshold since your last visit."
      });

    wireEmptyBackButton();

    return;
  }


  els.contentView.innerHTML = `
    <section class="content-section">

      <div class="view-header">

        <div class="section-kicker">
          SINCE YOU LAST CHECKED
        </div>

        <h2>
          ${catchup.length}
          ${
            catchup.length === 1
              ? "development"
              : "developments"
          }
          worth catching up on
        </h2>

        <p>
          ${allFresh.length}
          total new
          ${
            allFresh.length === 1
              ? "development was"
              : "developments were"
          }
          detected. Showing the highest-priority ${catchup.length}.
        </p>

      </div>


      <div
        id="sinceStoryList"
        class="story-list"
      ></div>

    </section>
  `;


  renderStoryCards(
    $("sinceStoryList"),
    catchup
  );
}


/* ============================================================
   DEVELOPING VIEW
   ============================================================ */

function renderDeveloping() {
  state.currentView = "developing";
  state.currentCategory = null;

  closeMenu();

  setActiveNavigation({
    view: "developing"
  });

  setPageHeader(
    "Developing",
    "Stories still receiving material new information."
  );

  showSincePanel(false);
  hideContextRail();


  const stories =
    getDevelopingStories();


  if (!stories.length) {
    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          "Nothing material is actively developing.",
        description:
          "When a story begins receiving consequential new information, it will move here."
      });

    wireEmptyBackButton();

    return;
  }


  els.contentView.innerHTML = `
    <section class="content-section developing-section">

      <div class="section-heading">

        <div>

          <div class="section-kicker developing-kicker">
            LIVE WATCH
          </div>

          <h2>
            ${stories.length}
            ${
              stories.length === 1
                ? "story"
                : "stories"
            }
            still moving
          </h2>

        </div>

      </div>


      <div
        id="developingFullList"
        class="story-list"
      ></div>

    </section>
  `;


  renderStoryCards(
    $("developingFullList"),
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

  setActiveNavigation({
    view: "saved"
  });

  setPageHeader(
    "Saved",
    "Stories you've kept for later."
  );

  showSincePanel(false);
  hideContextRail();


  const stories =
    state.clusters.filter(
      isSaved
    );


  if (!stories.length) {
    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          "Nothing saved yet.",
        description:
          "Save a development when you want to return to it without searching for it again."
      });

    wireEmptyBackButton();

    return;
  }


  els.contentView.innerHTML = `
    <section class="content-section">

      <div class="view-header">

        <div class="section-kicker">
          YOUR READING LIST
        </div>

        <h2>
          Saved
        </h2>

        <p>
          ${stories.length}
          ${
            stories.length === 1
              ? "story"
              : "stories"
          }
        </p>

      </div>


      <div
        id="savedStoryList"
        class="story-list"
      ></div>

    </section>
  `;


  renderStoryCards(
    $("savedStoryList"),
    stories
  );
}


/* ============================================================
   MARKETS
   V6 — NOT A NEWSPAPER
   ============================================================ */

function marketStoriesByCategory(
  categories
) {
  return sortByImportance(
    state.clusters.filter(
      story =>
        categories.includes(
          story.category
        )
    )
  );
}


function compactMarketCard(story) {
  if (!story) return "";

  return `
    <article class="market-secondary-item">

      <div class="story-topline">

        <span class="importance-label ${importanceLevel(story)}">
          ${escapeHtml(
            importanceLevel(story)
          )}
        </span>

        <span class="category-label">
          ${escapeHtml(
            displayCategory(
              story.category || "Markets"
            )
          )}
        </span>

      </div>


      <h3>
        <a
          href="${escapeHtml(primaryUrl(story))}"
          target="_blank"
          rel="noopener noreferrer"
          style="text-decoration:none"
        >
          ${escapeHtml(story.title || "")}
        </a>
      </h3>


      <div class="story-meta">

        <span>
          ${escapeHtml(
            primaryPublisher(story)
          )}
        </span>

        <span>·</span>

        <span>
          ${escapeHtml(
            timeAgo(
              storyTimestamp(story)
            )
          )}
        </span>

      </div>

    </article>
  `;
}


function marketHeadlineItem(story) {
  if (!story) return "";

  const summary =
    usefulSummary(story, 35);

  return `
    <article class="market-headline-row">

      <a
        href="${escapeHtml(primaryUrl(story))}"
        target="_blank"
        rel="noopener noreferrer"
      >
        <h3>
          ${escapeHtml(story.title || "")}
        </h3>
      </a>

      ${
        summary
          ? `
            <p>
              ${escapeHtml(summary)}
            </p>
          `
          : ""
      }

      <div class="story-meta">

        <span>
          ${escapeHtml(
            primaryPublisher(story)
          )}
        </span>

        <span>·</span>

        <span>
          ${escapeHtml(
            timeAgo(
              storyTimestamp(story)
            )
          )}
        </span>

      </div>

    </article>
  `;
}


function marketSectionHeader(
  title,
  kicker = ""
) {
  return `
    <div class="market-section-header">

      <div>

        ${
          kicker
            ? `
              <div class="section-kicker">
                ${escapeHtml(kicker)}
              </div>
            `
            : ""
        }

        <h2>
          ${escapeHtml(title)}
        </h2>

      </div>

    </div>
  `;
}


function renderIPOCard(ipo) {
  const details = [
    ipo.price_band
      ? `Price ${ipo.price_band}`
      : null,

    ipo.issue_size
      ? `Issue ${ipo.issue_size}`
      : null,

    ipo.lot_size
      ? `Lot ${ipo.lot_size}`
      : null,

    ipo.close_date
      ? `Closes ${ipo.close_date}`
      : null
  ].filter(Boolean);


  return `
    <article class="ipo-newspaper-item">

      <div class="ipo-status">
        ${escapeHtml(
          ipo.status || "IPO"
        )}
      </div>

      <h3>
        ${
          ipo.url
            ? `
              <a
                href="${escapeHtml(ipo.url)}"
                target="_blank"
                rel="noopener noreferrer"
                style="text-decoration:none"
              >
                ${escapeHtml(ipo.name || "")}
              </a>
            `
            : escapeHtml(
                ipo.name || ""
              )
        }
      </h3>


      ${
        details.length
          ? `
            <div class="ipo-facts">

              ${details.map(
                detail => `
                  <span>
                    ${escapeHtml(detail)}
                  </span>
                `
              ).join("")}

            </div>
          `
          : ""
      }


      ${
        ipo.what_to_know
          ? `
            <p class="story-summary">
              ${escapeHtml(
                truncateWords(
                  ipo.what_to_know,
                  35
                )
              )}
            </p>
          `
          : ""
      }

    </article>
  `;
}


function renderIPOModule() {
  const structured = [
    ...(state.markets.ipo_open || []),
    ...(state.markets.ipo_upcoming || []),
    ...(state.markets.ipo_recent || [])
  ].slice(0, 6);


  if (structured.length) {
    return `
      <section class="market-section">

        ${marketSectionHeader(
          "IPOs",
          "PRIMARY MARKET"
        )}

        <div class="ipo-newspaper-grid">
          ${structured
            .map(renderIPOCard)
            .join("")}
        </div>

      </section>
    `;
  }


  const stories =
    marketStoriesByCategory(
      ["IPO"]
    ).slice(0, 5);


  if (!stories.length) {
    return "";
  }


  return `
    <section class="market-section">

      ${marketSectionHeader(
        "IPOs",
        "PRIMARY MARKET"
      )}

      <div class="market-news-columns">

        <div>
          ${stories
            .slice(0, 3)
            .map(marketHeadlineItem)
            .join("")}
        </div>

        <div class="market-news-column">
          ${stories
            .slice(3)
            .map(marketHeadlineItem)
            .join("")}
        </div>

      </div>

    </section>
  `;
}


function getMutualFundStories() {
  let stories =
    Array.isArray(
      state.markets.mutual_fund_news
    )
      ? state.markets.mutual_fund_news
      : [];


  if (!stories.length) {
    stories =
      state.clusters.filter(
        story => {
          const text =
            `${story.title || ""} ${
              story.description || ""
            }`
              .toLowerCase();

          return (
            story.category === "Mutual Funds" ||
            text.includes("mutual fund") ||
            text.includes("amfi") ||
            text.includes("sip contribution") ||
            text.includes("fund inflow")
          );
        }
      );
  }


  return dedupeStories(
    stories
  ).slice(0, 6);
}


function renderMutualFundsModule() {
  const stories =
    getMutualFundStories();


  if (!stories.length) {
    return "";
  }


  return `
    <section class="market-section">

      ${marketSectionHeader(
        "Mutual Funds",
        "HOUSEHOLD INVESTING"
      )}

      <div class="market-news-columns">

        <div>
          ${stories
            .slice(0, 3)
            .map(marketHeadlineItem)
            .join("")}
        </div>

        <div class="market-news-column">
          ${stories
            .slice(3)
            .map(marketHeadlineItem)
            .join("")}
        </div>

      </div>

    </section>
  `;
}


function renderMarkets() {
  state.currentView = "markets";
  state.currentCategory = null;

  closeMenu();

  setActiveNavigation({
    view: "markets"
  });

  setPageHeader(
    "Markets",
    "Indian markets, companies and investing."
  );

  showSincePanel(true);
  hideContextRail();


  const india =
    marketStoriesByCategory([
      "Indian Markets",
      "Macro Economics"
    ]);


  const companies =
    marketStoriesByCategory([
      "Companies & Earnings",
      "Business & Micro"
    ]);


  const globalIndia =
    marketStoriesByCategory([
      "Global → India"
    ]);


  const combined =
    dedupeStories(
      sortByImportance([
        ...india,
        ...companies,
        ...globalIndia
      ])
    );


  const lead =
    combined[0] || null;


  const secondary =
    combined
      .filter(
        story =>
          storyKey(story) !==
          storyKey(lead || {})
      )
      .slice(0, 3);


  const used =
    new Set(
      [lead, ...secondary]
        .filter(Boolean)
        .map(storyKey)
    );


  const indiaMore =
    india
      .filter(
        story =>
          !used.has(
            storyKey(story)
          )
      )
      .slice(0, 6);


  const globalMore =
    globalIndia
      .filter(
        story =>
          !used.has(
            storyKey(story)
          )
      )
      .slice(0, 5);


  const companyMore =
    companies
      .filter(
        story =>
          storyKey(story) !==
          storyKey(lead || {})
      )
      .slice(0, 6);


  if (!lead) {
    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          "No material market development right now.",
        description:
          "Routine price movement is deliberately filtered out. Material market, corporate and investing developments will appear here."
      });

    wireEmptyBackButton();

    return;
  }


  const leadSummary =
    usefulSummary(lead, 90);


  els.contentView.innerHTML = `
    <div class="markets-front-page">


      <section class="markets-top-grid">

        <article class="market-lead">

          <div class="story-topline">

            <span class="importance-label ${importanceLevel(lead)}">
              ${escapeHtml(
                importanceLevel(lead)
              )}
            </span>

            <span class="category-label">
              ${escapeHtml(
                displayCategory(
                  lead.category || "Markets"
                )
              )}
            </span>

          </div>


          <h2>
            ${escapeHtml(
              lead.title || ""
            )}
          </h2>


          ${
            leadSummary
              ? `
                <p class="market-lead-summary">
                  ${escapeHtml(
                    leadSummary
                  )}
                </p>
              `
              : ""
          }


          ${marketImpactHtml(lead)}


          <div class="story-meta">

            <span>
              ${escapeHtml(
                primaryPublisher(lead)
              )}
            </span>

            <span>·</span>

            <span>
              ${sourceCount(lead)}
              ${
                sourceCount(lead) === 1
                  ? "source"
                  : "sources"
              }
            </span>

            <span>·</span>

            <span>
              ${escapeHtml(
                timeAgo(
                  storyTimestamp(lead)
                )
              )}
            </span>

          </div>


          <div class="story-actions">

            <button
              id="marketLeadSources"
              class="story-action"
              type="button"
            >
              ${
                sourceCount(lead) > 1
                  ? `View ${sourceCount(lead)} sources`
                  : "View source"
              }
            </button>

            <a
              class="story-action"
              href="${escapeHtml(
                primaryUrl(lead)
              )}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read ${escapeHtml(
                primaryPublisher(lead)
              )} →
            </a>

          </div>

        </article>


        <div class="market-secondary">

          <div class="section-kicker">
            ALSO WORTH KNOWING
          </div>

          ${secondary
            .map(compactMarketCard)
            .join("")}

        </div>

      </section>


      ${
        indiaMore.length ||
        globalMore.length
          ? `
            <section class="market-section">

              ${marketSectionHeader(
                "Market intelligence",
                "INDIA & THE WORLD"
              )}

              <div class="market-news-columns">

                <div class="market-news-column">

                  <div class="market-column-title">
                    India
                  </div>

                  ${
                    indiaMore.length
                      ? indiaMore
                          .map(marketHeadlineItem)
                          .join("")
                      : `
                        <div class="loading-card">
                          No additional India market signal.
                        </div>
                      `
                  }

                </div>


                <div class="market-news-column">

                  <div class="market-column-title">
                    Global → India
                  </div>

                  ${
                    globalMore.length
                      ? globalMore
                          .map(marketHeadlineItem)
                          .join("")
                      : `
                        <div class="loading-card">
                          No material global transmission story right now.
                        </div>
                      `
                  }

                </div>

              </div>

            </section>
          `
          : ""
      }


      ${
        companyMore.length
          ? `
            <section class="market-section">

              ${marketSectionHeader(
                "Companies",
                "CORPORATE INDIA"
              )}

              <div class="market-news-columns">

                <div class="market-news-column">
                  ${companyMore
                    .slice(0, 3)
                    .map(marketHeadlineItem)
                    .join("")}
                </div>

                <div class="market-news-column">
                  ${companyMore
                    .slice(3, 6)
                    .map(marketHeadlineItem)
                    .join("")}
                </div>

              </div>

            </section>
          `
          : ""
      }


      ${renderIPOModule()}


      ${renderMutualFundsModule()}


      <div class="market-editorial-note">

        Markets filters for material economic,
        corporate, IPO and investing developments.
        Routine price moves and low-signal market chatter
        are intentionally deprioritised.

      </div>

    </div>
  `;


  $("marketLeadSources")
    ?.addEventListener(
      "click",
      () => openSources(lead)
    );
}


/* ============================================================
   SEARCH
   ============================================================ */

function openSearchPanel() {
  els.searchPanel?.classList.remove(
    "hidden"
  );

  window.setTimeout(
    () => els.searchInput?.focus(),
    20
  );
}


function closeSearchPanel(
  restoreBrief = false
) {
  els.searchPanel?.classList.add(
    "hidden"
  );

  if (restoreBrief) {
    if (els.searchInput) {
      els.searchInput.value = "";
    }

    renderBrief();
  }
}


function searchStories(query) {
  const q =
    query
      .trim()
      .toLowerCase();


  if (!q) {
    renderBrief();
    return;
  }


  const results =
    sortByImportance(
      state.clusters.filter(
        story =>
          [
            story.title,
            story.description,
            story.brief,
            story.category,
            story.market_impact,
            ...(story.sources || [])
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
      )
    );


  state.currentView = "search";
  state.currentCategory = null;


  setActiveNavigation();


  setPageHeader(
    "Search",
    `${results.length} results for “${query}”.`
  );


  showSincePanel(false);
  hideContextRail();


  if (!results.length) {
    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          `No results for “${query}”.`,
        description:
          "Try a broader topic, company, person or country."
      });

    wireEmptyBackButton();

    return;
  }


  els.contentView.innerHTML = `
    <section class="content-section search-results">

      <div class="view-header">

        <div class="section-kicker">
          SEARCH
        </div>

        <h2>
          Results for “${escapeHtml(query)}”
        </h2>

        <p>
          ${results.length}
          ${
            results.length === 1
              ? "result"
              : "results"
          }
        </p>

      </div>


      <div
        id="searchStoryList"
        class="story-list"
      ></div>

    </section>
  `;


  renderStoryCards(
    $("searchStoryList"),
    results
  );
}


/* ============================================================
   SOURCE SHEET
   ============================================================ */

function openSources(story) {
  if (
    !els.sheetTitle ||
    !els.sheetSources ||
    !els.sourceSheet
  ) {
    return;
  }


  const articles =
    Array.isArray(story.articles)
      ? story.articles
      : [];


  const sources =
    articles.length
      ? articles
      : [{
          source:
            primaryPublisher(story),

          title:
            story.title,

          url:
            primaryUrl(story),

          published_at:
            storyTimestamp(story)
        }];


  els.sheetTitle.textContent =
    story.title || "Coverage";


  els.sheetSources.innerHTML =
    sources.map(
      article => `
        <a
          class="sheet-source"
          href="${escapeHtml(
            article.url || "#"
          )}"
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
              timeAgo(
                article.published_at
              )
            )}
          </div>

        </a>
      `
    ).join("");


  els.sourceSheet.classList.remove(
    "hidden"
  );

  els.sourceSheet.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.style.overflow =
    "hidden";
}


function closeSources() {
  els.sourceSheet?.classList.add(
    "hidden"
  );

  els.sourceSheet?.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.style.overflow = "";
}


/* ============================================================
   SOURCES VIEW
   ============================================================ */

function renderSources() {
  state.currentView = "sources";
  state.currentCategory = null;

  closeMenu();

  setActiveNavigation({
    view: "sources"
  });

  setPageHeader(
    "Sources",
    "The publishers feeding today's briefing."
  );

  showSincePanel(false);
  hideContextRail();


  const sources =
    Array.isArray(state.data?.sources)
      ? state.data.sources
      : [];


  if (!sources.length) {
    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          "Source information isn't available.",
        description:
          "The briefing data did not include a source-health list.",
        button: true
      });

    wireEmptyBackButton();

    return;
  }


  els.contentView.innerHTML = `
    <section class="content-section">

      <div class="view-header">

        <div class="section-kicker">
          SOURCE HEALTH
        </div>

        <h2>
          ${sources.filter(source => source.ok).length}
          of ${sources.length}
          sources healthy
        </h2>

        <p>
          Source health describes feed availability,
          not an editorial rating of the publisher.
        </p>

      </div>


      <div class="category-grid">

        ${sources.map(
          source => `
            <div class="category-card">

              <div class="story-topline">

                <span
                  class="status-dot ${
                    source.ok
                      ? "healthy"
                      : "unhealthy"
                  }"
                ></span>

              </div>

              <div class="category-card-name">
                ${escapeHtml(
                  source.name ||
                  source.source ||
                  "Source"
                )}
              </div>

              <div class="category-card-count">
                ${
                  source.ok
                    ? "Feed healthy"
                    : "Feed unavailable"
                }
              </div>

            </div>
          `
        ).join("")}

      </div>

    </section>
  `;
}


/* ============================================================
   ARCHIVES
   ============================================================ */

async function renderArchives() {
  state.currentView = "archives";
  state.currentCategory = null;

  closeMenu();

  setActiveNavigation({
    view: "archives"
  });

  setPageHeader(
    "Archives",
    "Previous Daily Intelligence briefings."
  );

  showSincePanel(false);
  hideContextRail();


  els.contentView.innerHTML = `
    <div class="loading-card">
      Loading archives…
    </div>
  `;


  try {
    const response =
      await fetch(
        `${ARCHIVES_URL}?v=${Date.now()}`,
        {
          cache: "no-store"
        }
      );


    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const archiveData =
      await response.json();


    const items =
      Array.isArray(archiveData)
        ? archiveData
        : (
            archiveData.archives ||
            archiveData.items ||
            []
          );


    if (!items.length) {
      els.contentView.innerHTML =
        emptyStateHtml({
          title:
            "No archived briefings yet.",
          description:
            "Previous editions will appear here as the archive grows."
        });

      wireEmptyBackButton();

      return;
    }


    els.contentView.innerHTML = `
      <section class="content-section">

        <div class="view-header">

          <div class="section-kicker">
            PREVIOUS EDITIONS
          </div>

          <h2>
            Archives
          </h2>

          <p>
            ${items.length}
            ${
              items.length === 1
                ? "edition"
                : "editions"
            }
          </p>

        </div>


        <div class="category-grid">

          ${items.map(
            item => `
              <article class="category-card">

                <div class="category-card-name">
                  ${escapeHtml(
                    item.date ||
                    item.generated_at ||
                    item.title ||
                    "Briefing"
                  )}
                </div>

                <div class="category-card-count">
                  ${
                    item.cluster_count ??
                    item.story_count ??
                    ""
                  }
                  ${
                    (
                      item.cluster_count ??
                      item.story_count
                    ) !== undefined
                      ? "stories"
                      : ""
                  }
                </div>

              </article>
            `
          ).join("")}

        </div>

      </section>
    `;

  } catch (error) {
    console.error(
      "Archive load failed:",
      error
    );


    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          "Archives couldn't load.",
        description:
          "Today's briefing is unaffected. Try the archive again later."
      });


    wireEmptyBackButton();
  }
}


/* ============================================================
   MENU
   ============================================================ */

function openMenu() {
  document.body.classList.add(
    "menu-open"
  );

  els.openMenu?.setAttribute(
    "aria-expanded",
    "true"
  );
}


function closeMenu() {
  document.body.classList.remove(
    "menu-open"
  );

  els.openMenu?.setAttribute(
    "aria-expanded",
    "false"
  );
}


/* ============================================================
   THEME
   ============================================================ */

function applyTheme() {
  const stored =
    localStorage.getItem(
      "di_theme"
    );


  const theme =
    stored ||
    (
      window.matchMedia?.(
        "(prefers-color-scheme: dark)"
      ).matches
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


/* ============================================================
   NAVIGATION
   ============================================================ */

function navigateFromButton(button) {
  const category =
    button.dataset.category;

  const view =
    button.dataset.view;


  if (
    view === "markets" ||
    category === "Indian Markets"
  ) {
    renderMarkets();
    return;
  }


  if (category) {
    showCategory(category);
    return;
  }


  switch (view) {
    case "brief":
      renderBrief();
      break;

    case "since":
      renderSince();
      break;

    case "developing":
      renderDeveloping();
      break;

    case "explore":
      renderExplore();
      break;

    case "saved":
      renderSaved();
      break;

    case "archives":
      renderArchives();
      break;

    case "sources":
      renderSources();
      break;

    default:
      renderBrief();
  }
}


function wireNavigation() {
  document
    .querySelectorAll(
      ".nav-item, .mobile-nav-item, .sidebar-brand, .mobile-brand"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => navigateFromButton(button)
      );
    });
}


/* ============================================================
   CURRENT VIEW
   ============================================================ */

function renderCurrentView() {
  switch (state.currentView) {
    case "markets":
      return renderMarkets();

    case "category":
      return showCategory(
        state.currentCategory
      );

    case "since":
      return renderSince();

    case "developing":
      return renderDeveloping();

    case "explore":
      return renderExplore();

    case "saved":
      return renderSaved();

    case "sources":
      return renderSources();

    case "archives":
      return renderArchives();

    case "search":
      return searchStories(
        els.searchInput?.value || ""
      );

    default:
      return renderBrief();
  }
}


/* ============================================================
   SOURCE HEALTH
   ============================================================ */

function updateSourceHealth(data) {
  const sources =
    Array.isArray(data.sources)
      ? data.sources
      : [];


  const healthy =
    sources.filter(
      source => source.ok
    ).length;


  if (els.sidebarStatus) {
    els.sidebarStatus.textContent =
      sources.length
        ? `${healthy}/${sources.length} sources healthy`
        : "Source health unavailable";
  }


  const ratio =
    sources.length
      ? healthy / sources.length
      : 0;


  const healthClass =
    ratio >= 0.85
      ? "healthy"
      : ratio >= 0.6
        ? "partial"
        : "unhealthy";


  [
    els.sidebarHealthDot,
    els.healthDot
  ].forEach(dot => {
    if (!dot) return;

    dot.classList.remove(
      "healthy",
      "partial",
      "unhealthy"
    );

    dot.classList.add(
      healthClass
    );
  });
}


/* ============================================================
   SINCE SUMMARY
   ============================================================ */

function updateSinceSummary() {
  if (!els.sinceSummary) {
    return;
  }


  if (!state.previousVisit) {
    els.sinceSummary.textContent =
      "Your catch-up will begin on your next visit.";

    return;
  }


  const fresh =
    getFreshStories();


  const catchup =
    getCatchupStories();


  if (!fresh.length) {
    els.sinceSummary.textContent =
      "You're caught up. No significant new developments.";

    return;
  }


  els.sinceSummary.textContent =
    `${catchup.length} ${
      catchup.length === 1
        ? "development"
        : "developments"
    } worth catching up on`;
}


/* ============================================================
   LOAD DATA
   ============================================================ */

async function loadData() {
  try {
    const response =
      await fetch(
        `${DATA_URL}?v=${Date.now()}`,
        {
          cache: "no-store"
        }
      );


    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
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


    state.markets =
      data.markets || {};


    const today =
      formatToday();


    if (els.todayDate) {
      els.todayDate.textContent =
        today;
    }


    if (els.topbarDate) {
      els.topbarDate.textContent =
        formatCompactDate();
    }


    const updated =
      `Updated ${
        timeAgo(data.generated_at)
      }`;


    if (els.lastUpdated) {
      els.lastUpdated.textContent =
        updated;
    }


    if (els.topbarUpdated) {
      els.topbarUpdated.textContent =
        updated;
    }


    updateSourceHealth(data);
    updateSinceSummary();


    renderBrief();


    /*
      Record this visit only after the previous visit
      has already been used to build the catch-up state.
    */

    localStorage.setItem(
      "di_last_visit",
      state.currentVisit
    );

  } catch (error) {
    console.error(
      "Daily Intelligence load failed:",
      error
    );


    setPageHeader(
      "Daily Intelligence",
      "The briefing is temporarily unavailable."
    );


    showSincePanel(false);


    els.contentView.innerHTML =
      emptyStateHtml({
        title:
          "The briefing couldn't load.",
        description:
          "Refresh again in a moment.",
        button: false
      });
  }
}


/* ============================================================
   EVENTS
   ============================================================ */

applyTheme();

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


els.sidebarThemeButton?.addEventListener(
  "click",
  toggleTheme
);


els.viewSinceButton?.addEventListener(
  "click",
  renderSince
);


els.contextSinceButton?.addEventListener(
  "click",
  renderSince
);


els.searchButton?.addEventListener(
  "click",
  openSearchPanel
);


els.desktopSearchTrigger?.addEventListener(
  "click",
  openSearchPanel
);


els.closeSearch?.addEventListener(
  "click",
  () => closeSearchPanel(true)
);


els.searchInput?.addEventListener(
  "input",
  event => {
    searchStories(
      event.target.value
    );
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

      if (
        els.searchPanel &&
        !els.searchPanel.classList.contains(
          "hidden"
        )
      ) {
        closeSearchPanel(false);
      }
    }
  }
);


/* ============================================================
   START
   ============================================================ */

loadData();
