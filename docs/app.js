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

const $ = (id) => document.getElementById(id);

const els = {
  body: document.body,
  sidebar: $("sidebar"),
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

  briefSection: $("briefSection"),
  briefStories: $("briefStories"),
  briefCount: $("briefCount"),

  developingSection: $("developingSection"),
  developingStories: $("developingStories"),
  developingCount: $("developingCount"),

  exploreSection: $("exploreSection"),
  categoryGrid: $("categoryGrid"),

  sourceSheet: $("sourceSheet"),
  sheetBackdrop: $("sheetBackdrop"),
  closeSheet: $("closeSheet"),
  sheetTitle: $("sheetTitle"),
  sheetSources: $("sheetSources")
};


function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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


function cleanText(value = "") {
  const div = document.createElement("div");
  div.innerHTML = value;

  return (div.textContent || div.innerText || "")
    .replace(/\s+/g, " ")
    .trim();
}


function truncateWords(text, maxWords = 90) {
  const clean = cleanText(text);

  if (!clean) return "";

  const words = clean.split(/\s+/);

  if (words.length <= maxWords) {
    return clean;
  }

  let result = words
    .slice(0, maxWords)
    .join(" ");

  result = result.replace(
    /[,;:\-–—]\s*$/,
    ""
  );

  return `${result}…`;
}


function usefulSummary(story) {
  const primaryDescription =
    story.description ||
    story.primary?.description ||
    "";

  if (primaryDescription.trim()) {
    return truncateWords(primaryDescription, 90);
  }

  const articleWithDescription =
    (story.articles || []).find(
      article =>
        article.description &&
        article.description.trim()
    );

  if (articleWithDescription) {
    return truncateWords(
      articleWithDescription.description,
      90
    );
  }

  return "";
}


function storyTimestamp(story) {
  return (
    story.published_at ||
    story.primary?.published_at ||
    story.articles?.[0]?.published_at ||
    ""
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

  if (names.length) return names.length;

  return story.source_count || 1;
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


function normalizedImportance(story) {
  const score =
    Number(story.importance) || 0;

  const sources = sourceCount(story);

  const ageHours = (() => {
    const date = parseDate(
      storyTimestamp(story)
    );

    if (!date) return 999;

    return Math.max(
      0,
      (Date.now() - date.getTime()) /
        3600000
    );
  })();

  /*
    These labels are intentionally conservative.

    CRITICAL should be rare.
    SIGNIFICANT is the normal "Brief" level.
  */

  if (
    score >= 68 &&
    sources >= 2 &&
    ageHours <= 48
  ) {
    return "critical";
  }

  if (
    score >= 42 ||
    sources >= 2
  ) {
    return "significant";
  }

  return "noteworthy";
}


function importanceLabel(story) {
  const level =
    normalizedImportance(story);

  if (level === "critical") {
    return "Critical";
  }

  if (level === "significant") {
    return "Significant";
  }

  return "Noteworthy";
}


function isNewSinceVisit(story) {
  if (!state.previousVisit) return false;

  const storyDate =
    parseDate(storyTimestamp(story));

  const previous =
    parseDate(state.previousVisit);

  if (!storyDate || !previous) {
    return false;
  }

  return storyDate > previous;
}


function isDeveloping(story) {
  const articles =
    story.articles || [];

  if (articles.length < 2) {
    return false;
  }

  const timestamps = articles
    .map(article =>
      parseDate(article.published_at)
    )
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (timestamps.length < 2) {
    return false;
  }

  const first = timestamps[0];
  const last =
    timestamps[timestamps.length - 1];

  const spreadHours =
    (last - first) / 3600000;

  const recentlyUpdated =
    (Date.now() - last.getTime()) /
      3600000 <= 18;

  return (
    spreadHours >= 1 &&
    recentlyUpdated
  );
}


function storyState(story) {
  if (isDeveloping(story)) {
    return "Updated";
  }

  if (isNewSinceVisit(story)) {
    return "New";
  }

  return "";
}


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


function buildContext(story) {
  const candidates = state.clusters
    .filter(other =>
      storyKey(other) !== storyKey(story)
    )
    .filter(other =>
      other.category === story.category
    )
    .filter(other => {
      const a = new Set(
        String(story.title || "")
          .toLowerCase()
          .split(/\W+/)
          .filter(word => word.length > 4)
      );

      const b = new Set(
        String(other.title || "")
          .toLowerCase()
          .split(/\W+/)
          .filter(word => word.length > 4)
      );

      const overlap =
        [...a].filter(word =>
          b.has(word)
        ).length;

      return overlap >= 2;
    })
    .sort(
      (a, b) =>
        new Date(storyTimestamp(b)) -
        new Date(storyTimestamp(a))
    )
    .slice(0, 3);

  return candidates;
}


function storyCard(story) {
  const level =
    normalizedImportance(story);

  const label =
    importanceLabel(story);

  const summary =
    usefulSummary(story);

  const sources =
    sourceNames(story);

  const count =
    sourceCount(story);

  const stateLabel =
    storyState(story);

  const context =
    buildContext(story);

  const article = document.createElement(
    "article"
  );

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

          ${context
            .map(item => `
              <div class="context-item">
                <span class="context-date">
                  ${escapeHtml(
                    shortDate(
                      storyTimestamp(item)
                    )
                  )}
                </span>

                <span class="context-headline">
                  ${escapeHtml(item.title)}
                </span>
              </div>
            `)
            .join("")}
        </div>
      `
      : "";

  article.innerHTML = `
    <div class="story-topline">

      <span
        class="importance-label ${level}"
      >
        ${escapeHtml(label)}
      </span>

      <span class="category-label">
        ${escapeHtml(
          story.category || "News"
        )}
      </span>

      ${
        stateLabel
          ? `
            <span class="story-state">
              ${escapeHtml(stateLabel)}
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


    <div class="story-meta">

      <span>
        ${
          count === 1
            ? escapeHtml(
                sources[0] || "1 source"
              )
            : `${count} sources`
        }
      </span>

      <span class="meta-separator">
        ·
      </span>

      <span>
        ${escapeHtml(
          timeAgo(
            storyTimestamp(story)
          )
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
            ? "View coverage"
            : "Source"
        }
      </button>

      <a
        class="story-action"
        href="${escapeHtml(
          primaryUrl(story)
        )}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Read more →
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

    ${contextHtml}
  `;

  const coverageButton =
    article.querySelector(
      ".coverage-button"
    );

  coverageButton?.addEventListener(
    "click",
    () => openSources(story)
  );

  const saveButton =
    article.querySelector(
      ".save-button"
    );

  saveButton?.addEventListener(
    "click",
    () => toggleSaved(story)
  );

  const contextButton =
    article.querySelector(
      ".context-button"
    );

  const contextBox =
    article.querySelector(
      ".context-box"
    );

  contextButton?.addEventListener(
    "click",
    () => {
      contextBox?.classList.toggle(
        "hidden"
      );

      contextButton.textContent =
        contextBox?.classList.contains(
          "hidden"
        )
          ? "Context"
          : "Hide context";
    }
  );

  return article;
}


function renderStoryList(
  container,
  stories
) {
  container.innerHTML = "";

  if (!stories.length) {
    container.innerHTML = `
      <div class="loading-card">
        No significant stories in this view.
      </div>
    `;

    return;
  }

  stories.forEach(story => {
    container.appendChild(
      storyCard(story)
    );
  });
}


function topBriefStories() {
  /*
    Prefer backend-selected Top stories,
    but remove weak items where possible.
  */

  const candidates =
    state.top.length
      ? state.top
      : state.clusters;

  const strong = candidates.filter(
    story =>
      normalizedImportance(story) !==
      "noteworthy"
  );

  const selected =
    strong.length >= 4
      ? strong
      : candidates;

  return selected.slice(0, 8);
}


function developingStories() {
  return state.clusters
    .filter(isDeveloping)
    .sort(
      (a, b) =>
        new Date(storyTimestamp(b)) -
        new Date(storyTimestamp(a))
    )
    .slice(0, 6);
}


function renderBrief() {
  setPageHeader(
    "The Brief",
    "What matters today, without the noise."
  );

  els.contentView.innerHTML = "";

  const briefSection =
    document.createElement("section");

  briefSection.className =
    "content-section";

  const stories =
    topBriefStories();

  briefSection.innerHTML = `
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
      id="dynamicBriefStories"
      class="story-list"
    ></div>
  `;

  els.contentView.appendChild(
    briefSection
  );

  renderStoryList(
    briefSection.querySelector(
      "#dynamicBriefStories"
    ),
    stories
  );


  const developing =
    developingStories();

  if (developing.length) {
    const section =
      document.createElement("section");

    section.className =
      "content-section";

    section.innerHTML = `
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
              data-story-key="${escapeHtml(
                storyKey(story)
              )}"
            >
              <div class="section-kicker">
                ${escapeHtml(
                  story.category || ""
                )}
              </div>

              <h3>
                ${escapeHtml(
                  story.title
                )}
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
      section
    );

    section
      .querySelectorAll(
        ".developing-card"
      )
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

  renderExplore();
}


function renderExplore() {
  const counts = {};

  state.clusters.forEach(story => {
    const category =
      story.category || "Other";

    counts[category] =
      (counts[category] || 0) + 1;
  });

  const preferredOrder = [
    "India",
    "Indian Politics",
    "Macro Economics",
    "Business & Micro",
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
      ${preferredOrder
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
    .querySelectorAll(
      ".category-card"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          showCategory(
            button.dataset.category
          );
        }
      );
    });
}


function displayCategory(category) {
  const names = {
    "Macro Economics":
      "Economy & Policy",

    "Business & Micro":
      "Business"
  };

  return names[category] || category;
}


function showCategory(category) {
  state.currentView = "category";
  state.currentCategory = category;

  closeMenu();

  setActiveNav(category);

  setPageHeader(
    displayCategory(category),
    `Latest significant developments in ${displayCategory(
      category
    )}.`
  );

  const stories = state.clusters
    .filter(
      story =>
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
        ? "story"
        : "stories"
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

  els.contentView.appendChild(
    section
  );

  renderStoryList(
    section.querySelector(
      "#singleViewStories"
    ),
    stories
  );

  showEmpty(!stories.length);
}


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
              new Date(
                storyTimestamp(b)
              ) -
              new Date(
                storyTimestamp(a)
              )
          )
      : topBriefStories();

  renderSingleView(
    "Since Last Check",
    stories,
    state.previousVisit
      ? `${stories.length} new ${
          stories.length === 1
            ? "development"
            : "developments"
        }`
      : "This is your first recorded visit, so today's Brief is shown."
  );
}


function renderDevelopingView() {
  state.currentView = "developing";
  state.currentCategory = null;

  closeMenu();

  setActiveNav(
    null,
    "developing"
  );

  setPageHeader(
    "Developing",
    "Stories receiving meaningful new coverage."
  );

  const stories =
    developingStories();

  renderSingleView(
    "Developing",
    stories,
    `${stories.length} active ${
      stories.length === 1
        ? "story"
        : "stories"
    }`
  );
}


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
    state.clusters.filter(
      story => isSaved(story)
    );

  renderSingleView(
    "Saved",
    stories,
    `${stories.length} saved ${
      stories.length === 1
        ? "story"
        : "stories"
    }`
  );
}


function renderSourcesView() {
  state.currentView = "sources";
  state.currentCategory = null;

  closeMenu();

  setActiveNav(null, "sources");

  setPageHeader(
    "Sources",
    "Health of the feeds powering your briefing."
  );

  els.contentView.innerHTML = "";

  const sources =
    state.data?.sources || [];

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
        ${sources.filter(s => s.ok).length}
        of ${sources.length}
        feeds healthy on the latest refresh.
      </p>
    </div>

    <div class="story-list">

      ${sources
        .map(source => `
          <div class="story-card">

            <div class="story-topline">
              <span
                class="importance-label ${
                  source.ok
                    ? "significant"
                    : "noteworthy"
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
        `)
        .join("")}

    </div>
  `;

  els.contentView.appendChild(
    section
  );
}


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
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        "Archive index unavailable"
      );
    }

    const archives =
      await response.json();

    els.contentView.innerHTML = "";

    const section =
      document.createElement("section");

    section.className =
      "content-section";

    section.innerHTML = `
      <div class="view-header">

        <div class="section-kicker">
          ARCHIVE
        </div>

        <h2>Daily Briefings</h2>

        <p>
          ${archives.length}
          archived briefings available.
        </p>

      </div>

      <div class="story-list">

        ${archives
          .map(item => `
            <div class="story-card">

              <div class="story-topline">
                <span class="category-label">
                  DAILY BRIEF
                </span>
              </div>

              <h3 class="story-title">
                ${escapeHtml(
                  new Intl.DateTimeFormat(
                    "en-IN",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric"
                    }
                  ).format(
                    new Date(
                      `${item.date}T12:00:00`
                    )
                  )
                )}
              </h3>

              <div class="story-meta">
                ${item.count || 0}
                essential stories
              </div>

            </div>
          `)
          .join("")}

      </div>
    `;

    els.contentView.appendChild(
      section
    );

  } catch (error) {
    els.contentView.innerHTML = `
      <div class="empty-state">
        <h2>Archives unavailable.</h2>
        <p>
          Today's briefing is unaffected.
        </p>
      </div>
    `;
  }
}


function searchStories(query) {
  const normalized =
    query.trim().toLowerCase();

  if (!normalized) {
    renderBrief();
    return;
  }

  const results =
    state.clusters.filter(story => {
      const haystack = [
        story.title,
        story.description,
        story.category,
        ...(story.sources || [])
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(
        normalized
      );
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


function openSources(story) {
  const articles =
    story.articles || [];

  els.sheetTitle.textContent =
    story.title || "Coverage";

  if (!articles.length) {
    els.sheetSources.innerHTML = `
      <a
        class="sheet-source"
        href="${escapeHtml(
          primaryUrl(story)
        )}"
        target="_blank"
        rel="noopener noreferrer"
      >
        <div class="sheet-source-name">
          Primary source
        </div>

        <div class="sheet-source-title">
          ${escapeHtml(
            story.title || ""
          )}
        </div>
      </a>
    `;
  } else {
    els.sheetSources.innerHTML =
      articles
        .slice()
        .sort(
          (a, b) =>
            new Date(
              b.published_at || 0
            ) -
            new Date(
              a.published_at || 0
            )
        )
        .map(article => `
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
                article.source ||
                "Source"
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
        `)
        .join("");
  }

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
  els.sourceSheet.classList.add(
    "hidden"
  );

  els.sourceSheet.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.style.overflow = "";
}


function setPageHeader(
  title,
  description
) {
  els.pageTitle.textContent = title;

  els.pageDescription.textContent =
    description;
}


function setActiveNav(
  category = null,
  view = null
) {
  document
    .querySelectorAll(".nav-item")
    .forEach(button => {
      button.classList.remove(
        "active"
      );

      if (
        category &&
        button.dataset.category ===
          category
      ) {
        button.classList.add(
          "active"
        );
      }

      if (
        view &&
        button.dataset.view === view
      ) {
        button.classList.add(
          "active"
        );
      }
    });
}


function showEmpty(show) {
  els.emptyState.classList.toggle(
    "hidden",
    !show
  );
}


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


function renderCurrentView() {
  if (
    state.currentView ===
      "category" &&
    state.currentCategory
  ) {
    showCategory(
      state.currentCategory
    );

    return;
  }

  if (state.currentView === "since") {
    renderSinceLastCheck();
    return;
  }

  if (
    state.currentView ===
    "developing"
  ) {
    renderDevelopingView();
    return;
  }

  if (state.currentView === "saved") {
    renderSaved();
    return;
  }

  if (
    state.currentView ===
    "sources"
  ) {
    renderSourcesView();
    return;
  }

  if (
    state.currentView ===
    "archives"
  ) {
    renderArchives();
    return;
  }

  renderBrief();
}


function updateSincePanel() {
  if (!state.previousVisit) {
    els.sinceSummary.textContent =
      "First visit recorded. From your next visit, we'll show only what changed.";

    return;
  }

  const newStories =
    state.clusters.filter(
      isNewSinceVisit
    );

  const significant =
    newStories.filter(
      story =>
        normalizedImportance(story) !==
        "noteworthy"
    );

  const developing =
    newStories.filter(
      isDeveloping
    );

  if (!newStories.length) {
    els.sinceSummary.textContent =
      "No new developments since your last check.";

    return;
  }

  els.sinceSummary.textContent =
    `${significant.length} significant ${
      significant.length === 1
        ? "development"
        : "developments"
    } · ${developing.length} developing ${
      developing.length === 1
        ? "story"
        : "stories"
    } updated`;
}


function updateHealth() {
  const sources =
    state.data?.sources || [];

  const healthy =
    sources.filter(
      source => source.ok
    ).length;

  const total =
    sources.length;

  const ratio =
    total
      ? healthy / total
      : 0;

  const healthClass =
    ratio >= 0.8
      ? "healthy"
      : ratio >= 0.5
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

    dot.classList.add(
      healthClass
    );
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


function applyTheme() {
  const stored =
    localStorage.getItem(
      "di_theme"
    );

  const prefersDark =
    window.matchMedia &&
    window.matchMedia(
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
      els.searchPanel.classList.toggle(
        "hidden"
      );

      if (
        !els.searchPanel.classList.contains(
          "hidden"
        )
      ) {
        setTimeout(
          () =>
            els.searchInput?.focus(),
          50
        );
      }
    }
  );


  els.closeSearch?.addEventListener(
    "click",
    () => {
      els.searchPanel.classList.add(
        "hidden"
      );

      els.searchInput.value = "";

      state.searchQuery = "";

      renderBrief();
    }
  );


  els.searchInput?.addEventListener(
    "input",
    event => {
      state.searchQuery =
        event.target.value;

      searchStories(
        state.searchQuery
      );
    }
  );


  els.viewSinceButton?.addEventListener(
    "click",
    renderSinceLastCheck
  );


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
            state.currentView =
              "brief";

            state.currentCategory =
              null;

            setActiveNav(
              null,
              "brief"
            );

            closeMenu();
            renderBrief();
          }

          if (view === "since") {
            renderSinceLastCheck();
          }

          if (
            view === "developing"
          ) {
            renderDevelopingView();
          }

          if (view === "saved") {
            renderSaved();
          }

          if (
            view === "archives"
          ) {
            renderArchives();
          }

          if (view === "sources") {
            renderSourcesView();
          }
        }
      );
    });


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

        els.searchPanel?.classList.add(
          "hidden"
        );
      }
    }
  );
}


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
        `News data returned ${response.status}`
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

    /*
      Record the visit only AFTER we've compared
      the current data with the previous visit.
    */
    localStorage.setItem(
      "di_last_visit",
      state.currentVisit
    );

  } catch (error) {
    console.error(
      "Daily Intelligence failed to load:",
      error
    );

    els.contentView.innerHTML = `
      <div class="empty-state">

        <h2>
          The briefing couldn't load.
        </h2>

        <p>
          The latest data may still be updating.
          Refresh the page in a moment.
        </p>

      </div>
    `;

    els.lastUpdated.textContent =
      "Data unavailable";

    els.sidebarStatus.textContent =
      "Unable to load briefing";
  }
}


applyTheme();
wireEvents();
loadData();
