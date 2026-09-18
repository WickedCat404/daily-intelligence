/* ============================================================
   DAILY INTELLIGENCE
   Frontend V7.2
   ------------------------------------------------------------
   Compatible with:
   - current docs/index.html
   - V5.4 latest.json
   - real publisher image_url fields
   ============================================================ */

"use strict";


/* ============================================================
   DATA / STATE
   ============================================================ */

const DATA_URL = "./data/latest.json";
const ARCHIVES_URL = "./data/archives.json";

const state = {
  data: null,
  clusters: [],
  top: [],
  markets: {},
  archives: [],

  currentView: "brief",
  currentCategory: null,

  saved: new Set(
    JSON.parse(
      localStorage.getItem("di_saved") || "[]"
    )
  ),

  previousVisit:
    localStorage.getItem("di_last_visit"),

  currentVisit:
    new Date().toISOString()
};


const $ = id =>
  document.getElementById(id);


const els = {
  menuOverlay: $("menuOverlay"),

  openMenu: $("openMenu"),
  closeMenu: $("closeMenu"),

  searchButton: $("searchButton"),
  desktopSearchTrigger:
    $("desktopSearchTrigger"),

  searchPanel: $("searchPanel"),
  searchInput: $("searchInput"),
  closeSearch: $("closeSearch"),

  themeButton: $("themeButton"),
  sidebarThemeButton:
    $("sidebarThemeButton"),

  eyebrow: $("eyebrow"),
  todayDate: $("todayDate"),

  topbarDate: $("topbarDate"),
  topbarUpdated: $("topbarUpdated"),

  pageTitle: $("pageTitle"),
  pageDescription:
    $("pageDescription"),

  lastUpdated: $("lastUpdated"),

  sidebarHealthDot:
    $("sidebarHealthDot"),

  healthDot: $("healthDot"),
  sidebarStatus: $("sidebarStatus"),

  sinceLastPanel:
    $("sinceLastPanel"),

  sinceSummary: $("sinceSummary"),
  viewSinceButton:
    $("viewSinceButton"),

  contentView: $("contentView"),
  contextRail: $("contextRail"),

  glanceGrid: $("glanceGrid"),

  changedSummary:
    $("changedSummary"),

  contextSinceButton:
    $("contextSinceButton"),

  topicChips: $("topicChips"),

  sourceSheet: $("sourceSheet"),
  sheetBackdrop: $("sheetBackdrop"),
  closeSheet: $("closeSheet"),
  sheetTitle: $("sheetTitle"),
  sheetSources: $("sheetSources")
};


/* ============================================================
   BASIC HELPERS
   ============================================================ */

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function clean(value = "") {
  const div =
    document.createElement("div");

  div.innerHTML =
    String(value || "");

  return (
    div.textContent ||
    div.innerText ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
}


function trunc(value, limit = 55) {
  const words =
    clean(value)
      .split(/\s+/)
      .filter(Boolean);

  if (
    words.length <= limit
  ) {
    return words.join(" ");
  }

  return (
    words
      .slice(0, limit)
      .join(" ") +
    "…"
  );
}


function date(value) {
  if (!value) {
    return null;
  }

  const parsed =
    new Date(value);

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed;
}


function ago(value) {
  const parsed =
    date(value);

  if (!parsed) {
    return "";
  }

  const seconds =
    Math.max(
      0,
      (
        Date.now() -
        parsed.getTime()
      ) / 1000
    );

  if (seconds < 60) {
    return "just now";
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days =
    Math.floor(
      hours / 24
    );

  return days === 1
    ? "yesterday"
    : `${days}d ago`;
}


function clock(value) {
  const parsed =
    date(value);

  if (!parsed) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      hour: "numeric",
      minute: "2-digit"
    }
  ).format(parsed);
}


function stamp(story) {
  return (
    story?.published_at ||
    story?.primary?.published_at ||
    story?.articles?.[0]?.published_at ||
    ""
  );
}


function key(story) {
  return (
    story?.cluster_key ||
    story?.url ||
    story?.title ||
    ""
  );
}


function url(story) {
  return (
    story?.primary?.url ||
    story?.articles?.[0]?.url ||
    story?.url ||
    "#"
  );
}


function publisher(story) {
  return (
    story?.primary?.source ||
    story?.sources?.[0] ||
    story?.source ||
    "Source"
  );
}


function sourceCount(story) {
  return (
    Number(
      story?.source_count
    ) ||
    (
      Array.isArray(
        story?.sources
      )
        ? story.sources.length
        : 0
    ) ||
    (
      Array.isArray(
        story?.articles
      )
        ? story.articles.length
        : 0
    ) ||
    1
  );
}


function summary(
  story,
  limit = 55
) {
  return trunc(
    story?.brief ||
    story?.description ||
    story?.primary?.description ||
    "",
    limit
  );
}


/* ============================================================
   REAL V5.4 STORY IMAGES
   ============================================================ */

function imageUrl(story) {
  if (!story) {
    return "";
  }

  if (
    typeof story.image_url ===
      "string" &&
    story.image_url.trim()
  ) {
    return story.image_url.trim();
  }

  if (
    typeof story.primary
      ?.image_url ===
      "string" &&
    story.primary.image_url.trim()
  ) {
    return (
      story.primary.image_url.trim()
    );
  }

  if (
    Array.isArray(
      story.articles
    )
  ) {
    const article =
      story.articles.find(
        item =>
          typeof item?.image_url ===
            "string" &&
          item.image_url.trim()
      );

    if (article) {
      return (
        article.image_url.trim()
      );
    }
  }

  return "";
}


function fallbackVisual(
  story,
  kind
) {
  return `
    <div
      class="story-visual visual-fallback ${esc(kind)}"
      aria-hidden="true"
    >
      <strong>
        ${esc(
          cat(
            story?.category ||
            "Intelligence"
          )
        )}
      </strong>

      <span>DI</span>
    </div>
  `;
}


function visualMarkup(
  story,
  kind = "card"
) {
  const image =
    imageUrl(story);

  if (!image) {
    return fallbackVisual(
      story,
      kind
    );
  }

  return `
    <div
      class="story-visual ${esc(kind)}"
    >
      <img
        src="${esc(image)}"
        alt=""
        loading="${
          kind === "hero"
            ? "eager"
            : "lazy"
        }"
        decoding="async"
        referrerpolicy="no-referrer"
      >

      <div
        class="image-fallback-content"
        aria-hidden="true"
      >
        <strong>
          ${esc(
            cat(
              story?.category ||
              "Intelligence"
            )
          )}
        </strong>

        <span>DI</span>
      </div>
    </div>
  `;
}


/* ============================================================
   CATEGORY HELPERS
   ============================================================ */

function cat(category) {
  return (
    {
      "Macro Economics":
        "Economy & Policy",

      "Business & Micro":
        "Business",

      "Companies & Earnings":
        "Companies",

      "Global → India":
        "Global → India",

      "Indian Markets":
        "Markets",

      "Science & Climate":
        "Science & Climate"
    }[category] ||
    category ||
    "News"
  );
}


function norm(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}


const CATEGORY_ALIASES = {
  "India": [
    "india"
  ],

  "Indian Politics": [
    "indian politics",
    "india politics",
    "politics india",
    "national politics",
    "politics"
  ],

  "Macro Economics": [
    "macro economics",
    "economy policy",
    "economy and policy",
    "indian economy",
    "economy"
  ],

  "Business & Micro": [
    "business micro",
    "business and micro",
    "business"
  ],

  "Companies & Earnings": [
    "companies earnings",
    "companies and earnings",
    "corporate india",
    "companies"
  ],

  "Indian Markets": [
    "indian markets",
    "markets india",
    "markets"
  ],

  "Global → India": [
    "global india",
    "global to india"
  ],

  "World": [
    "world"
  ],

  "Geopolitics": [
    "geopolitics"
  ],

  "World Politics": [
    "world politics",
    "global politics",
    "international politics"
  ],

  "AI": [
    "ai",
    "artificial intelligence"
  ],

  "Technology": [
    "technology",
    "tech"
  ],

  "Science & Climate": [
    "science climate",
    "science and climate",
    "climate science"
  ],

  "The Ken": [
    "the ken"
  ]
};


function matchesCategory(
  story,
  wanted
) {
  const actual =
    norm(
      story?.category || ""
    );

  const targets =
    (
      CATEGORY_ALIASES[
        wanted
      ] ||
      [wanted]
    ).map(norm);

  return targets.includes(
    actual
  );
}


/* ============================================================
   COLLECTION HELPERS
   ============================================================ */

function dedupe(
  stories = []
) {
  const seen =
    new Set();

  return stories.filter(
    story => {
      const storyKey =
        key(story);

      if (
        !storyKey ||
        seen.has(storyKey)
      ) {
        return false;
      }

      seen.add(storyKey);

      return true;
    }
  );
}


function sortStories(
  stories = []
) {
  return [
    ...stories
  ].sort(
    (a, b) =>
      (
        Number(
          b?.importance || 0
        ) -
        Number(
          a?.importance || 0
        )
      ) ||
      (
        (
          date(
            stamp(b)
          )?.getTime() ||
          0
        ) -
        (
          date(
            stamp(a)
          )?.getTime() ||
          0
        )
      )
  );
}


function level(story) {
  const value =
    String(
      story?.importance_label ||
      ""
    ).toLowerCase();

  if (
    [
      "critical",
      "significant",
      "noteworthy"
    ].includes(value)
  ) {
    return value;
  }

  const score =
    Number(
      story?.importance || 0
    );

  if (score >= 70) {
    return "critical";
  }

  if (score >= 43) {
    return "significant";
  }

  return "noteworthy";
}


function fresh(story) {
  const published =
    date(
      stamp(story)
    );

  const previous =
    date(
      state.previousVisit
    );

  return Boolean(
    published &&
    previous &&
    published > previous
  );
}


function saved(story) {
  return state.saved.has(
    key(story)
  );
}


function categoryStories(
  category
) {
  return sortStories(
    state.clusters.filter(
      story =>
        matchesCategory(
          story,
          category
        )
    )
  );
}


/* ============================================================
   DATA ARRAY DISCOVERY
   ============================================================ */

function clustersOf(data) {
  const candidates = [
    data?.clusters,
    data?.stories,
    data?.events,
    data?.items
  ];

  for (
    const candidate
    of candidates
  ) {
    if (
      Array.isArray(candidate) &&
      candidate.length
    ) {
      return candidate;
    }
  }

  return [];
}


function briefOf(
  data,
  clusters
) {
  const fields = [
    "top",
    "brief",
    "daily_brief",
    "top_stories",
    "must_know"
  ];

  for (
    const fieldName
    of fields
  ) {
    const brief =
      data?.[fieldName];

    if (
      !Array.isArray(brief) ||
      !brief.length
    ) {
      continue;
    }

    if (
      typeof brief[0] ===
      "object"
    ) {
      return dedupe(
        brief
      );
    }

    const ids =
      new Set(
        brief.map(String)
      );

    const matched =
      clusters.filter(
        cluster =>
          ids.has(
            String(
              key(cluster)
            )
          )
      );

    if (
      matched.length
    ) {
      return dedupe(
        matched
      );
    }
  }

  return sortStories(
    clusters
  ).slice(0, 8);
}


/*
 * Presentation rule:
 * Backend may select up to 8 stories.
 * The Brief UI intentionally shows exactly the first 5.
 */
function displayBrief() {
  const source =
    state.top.length
      ? state.top
      : sortStories(
          state.clusters
        );

  return dedupe(
    source
  ).slice(0, 5);
}


/* ============================================================
   SAVE / BOOKMARK
   ============================================================ */

function toggleSaved(story) {
  const storyKey =
    key(story);

  if (!storyKey) {
    return;
  }

  if (
    state.saved.has(
      storyKey
    )
  ) {
    state.saved.delete(
      storyKey
    );
  } else {
    state.saved.add(
      storyKey
    );
  }

  localStorage.setItem(
    "di_saved",
    JSON.stringify(
      [...state.saved]
    )
  );

  renderCurrent();
}


/* ============================================================
   HEADER
   ============================================================ */

function setHeader(
  eyebrow,
  title,
  description
) {
  /*
   * Every DOM write is guarded.
   * This permanently removes the historical
   * $("#eyebrow").textContent crash.
   */
  if (els.eyebrow) {
    els.eyebrow.textContent =
      eyebrow;
  }

  if (els.todayDate) {
    els.todayDate.textContent =
      eyebrow;
  }

  if (els.pageTitle) {
    els.pageTitle.textContent =
      title;
  }

  if (
    els.pageDescription
  ) {
    els.pageDescription.textContent =
      description;
  }
}


function showSince(
  visible = true
) {
  if (
    !els.sinceLastPanel
  ) {
    return;
  }

  els.sinceLastPanel
    .classList
    .toggle(
      "hidden",
      !visible
    );
}


/* ============================================================
   ACTIVE NAVIGATION
   ============================================================ */

function setActive({
  view = null,
  category = null
} = {}) {
  document
    .querySelectorAll(
      ".nav-item, .mobile-nav-item"
    )
    .forEach(
      button => {
        button.classList.remove(
          "active"
        );

        if (
          view &&
          button.dataset.view ===
            view
        ) {
          button.classList.add(
            "active"
          );
        }

        if (
          category &&
          button.dataset.category ===
            category
        ) {
          button.classList.add(
            "active"
          );
        }
      }
    );
}


/* ============================================================
   STORY META / CONTEXT
   ============================================================ */

function meta(story) {
  const count =
    sourceCount(story);

  return `
    <div class="story-meta">

      <span>
        ${esc(
          publisher(story)
        )}
      </span>

      <span>·</span>

      <span>
        ${esc(
          ago(
            stamp(story)
          )
        )}
      </span>

      <span>·</span>

      <span>
        ${count}
        ${
          count === 1
            ? "source"
            : "sources"
        }
      </span>

    </div>
  `;
}


function why(story) {
  const value =
    story?.why_it_matters ||
    story?.market_impact ||
    story?.context ||
    "";

  if (!value) {
    return "";
  }

  return `
    <div class="why-matters">

      <strong>
        Why it matters
      </strong>

      <span>
        ${esc(
          trunc(
            value,
            38
          )
        )}
      </span>

    </div>
  `;
}


/* ============================================================
   STORY ACTIONS
   ============================================================ */

function actions(
  story,
  id
) {
  const count =
    sourceCount(story);

  return `
    <div class="story-actions">

      <button
        class="story-action"
        type="button"
        data-source="${esc(id)}"
      >
        ${
          count > 1
            ? `View ${count} sources`
            : "View source"
        }
      </button>

      <a
        class="story-action"
        href="${esc(
          url(story)
        )}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Read
        ${esc(
          publisher(story)
        )}
        →
      </a>

      <button
        class="story-action save-button ${
          saved(story)
            ? "saved"
            : ""
        }"
        type="button"
        data-save="${esc(id)}"
        aria-label="${
          saved(story)
            ? "Remove bookmark"
            : "Save story"
        }"
      >
        ${
          saved(story)
            ? "★ Saved"
            : "☆ Save"
        }
      </button>

    </div>
  `;
}


/* ============================================================
   STORY COMPONENT
   ============================================================ */

function storyMarkup(
  story,
  kind = "normal"
) {
  const id =
    encodeURIComponent(
      key(story)
    );

  const lead =
    kind === "lead";

  const secondary =
    kind === "secondary";

  const importance =
    level(story);

  const summaryLimit =
    lead
      ? 46
      : secondary
        ? 22
        : 36;

  return `
    <article
      class="${
        lead
          ? "lead-story"
          : secondary
            ? "secondary-story"
            : "story-card"
      }"
    >

      ${
        lead
          ? visualMarkup(
              story,
              "hero"
            )
          : secondary
            ? visualMarkup(
                story,
                "card"
              )
            : ""
      }

      <div class="story-body">

        <div class="story-topline">

          <span
            class="importance-label ${esc(
              importance
            )}"
          >
            ${esc(
              importance
            )}
          </span>

          <span
            class="category-label"
          >
            ${esc(
              cat(
                story?.category ||
                "News"
              )
            )}
          </span>

          ${
            fresh(story)
              ? `
                <span
                  class="story-state"
                >
                  NEW
                </span>
              `
              : ""
          }

        </div>

        <h3 class="story-title">
          ${esc(
            story?.title ||
            "Untitled development"
          )}
        </h3>

        ${
          summary(
            story,
            summaryLimit
          )
            ? `
              <p class="story-summary">
                ${esc(
                  summary(
                    story,
                    summaryLimit
                  )
                )}
              </p>
            `
            : ""
        }

        ${
          lead
            ? why(story)
            : ""
        }

        ${meta(story)}

        ${actions(
          story,
          id
        )}

      </div>

    </article>
  `;
}


/* ============================================================
   STORY LOOKUP / ACTION BINDINGS
   ============================================================ */

function findStory(
  encodedKey
) {
  const collections = [
    state.clusters,
    state.top
  ];

  for (
    const collection
    of collections
  ) {
    const match =
      collection.find(
        story =>
          encodeURIComponent(
            key(story)
          ) === encodedKey
      );

    if (match) {
      return match;
    }
  }

  return null;
}


function wireStoryActions() {
  document
    .querySelectorAll(
      "[data-source]"
    )
    .forEach(
      button => {
        button.onclick =
          event => {
            event.preventDefault();
            event.stopPropagation();

            const story =
              findStory(
                button.dataset.source
              );

            if (story) {
              openSources(
                story
              );
            }
          };
      }
    );


  document
    .querySelectorAll(
      "[data-save]"
    )
    .forEach(
      button => {
        button.onclick =
          event => {
            event.preventDefault();
            event.stopPropagation();

            const story =
              findStory(
                button.dataset.save
              );

            if (story) {
              toggleSaved(
                story
              );
            }
          };
      }
    );
}


/* ============================================================
   EMPTY STATE
   ============================================================ */

function empty(
  title,
  description
) {
  if (
    !els.contentView
  ) {
    return;
  }

  els.contentView.innerHTML = `
    <section class="empty-state">

      <div
        class="empty-state-icon"
        aria-hidden="true"
      >
        ◇
      </div>

      <h2>
        ${esc(title)}
      </h2>

      <p>
        ${esc(description)}
      </p>

      <button
        class="primary-button"
        id="emptyHome"
        type="button"
      >
        Back to The Brief
      </button>

    </section>
  `;

  $("emptyHome")
    ?.addEventListener(
      "click",
      renderBrief
    );
}
/* ============================================================
   RIGHT CONTEXT RAIL
   ============================================================ */

function newSinceVisit() {
  const previous =
    date(
      state.previousVisit
    );

  if (!previous) {
    return [];
  }

  return sortStories(
    state.clusters.filter(
      story => {
        const published =
          date(
            stamp(story)
          );

        return Boolean(
          published &&
          published > previous
        );
      }
    )
  );
}


function significantSinceVisit() {
  return newSinceVisit()
    .filter(
      story =>
        [
          "critical",
          "significant"
        ].includes(
          level(story)
        )
    );
}


function developingStories() {
  const explicit =
    sortStories(
      state.clusters.filter(
        story =>
          story?.is_developing ===
          true
      )
    );

  if (explicit.length) {
    return explicit.slice(
      0,
      8
    );
  }

  /*
   * V5.4 currently leaves is_developing false.
   * Until the backend has an explicit developing-event
   * model, use a restrained fallback:
   * recent + consequential stories only.
   */
  const cutoff =
    Date.now() -
    12 * 60 * 60 * 1000;

  return sortStories(
    state.clusters.filter(
      story => {
        const published =
          date(
            stamp(story)
          );

        if (
          !published ||
          published.getTime() <
            cutoff
        ) {
          return false;
        }

        return [
          "critical",
          "significant"
        ].includes(
          level(story)
        );
      }
    )
  ).slice(0, 5);
}


function busiestCategory(
  stories = []
) {
  if (!stories.length) {
    return null;
  }

  const counts = {};

  stories.forEach(
    story => {
      const category =
        cat(
          story?.category ||
          ""
        );

      if (!category) {
        return;
      }

      counts[category] =
        (
          counts[category] ||
          0
        ) + 1;
    }
  );

  return Object.entries(
    counts
  )
    .sort(
      (a, b) =>
        b[1] - a[1]
    )[0]?.[0] ||
    null;
}


function renderRail() {
  const brief =
    displayBrief();

  const developing =
    developingStories();

  if (els.glanceGrid) {
    els.glanceGrid.innerHTML = `
      <div class="glance-item">
        <strong
          class="glance-value"
        >
          ${brief.length}
        </strong>

        <span
          class="glance-name"
        >
          in today's brief
        </span>
      </div>

      <div class="glance-item">
        <strong
          class="glance-value"
        >
          ${developing.length}
        </strong>

        <span
          class="glance-name"
        >
          developing stories
        </span>
      </div>

      <div class="glance-item">
        <strong
          class="glance-value"
        >
          ${
            Number(
              state.data
                ?.article_count
            ) || "—"
          }
        </strong>

        <span
          class="glance-name"
        >
          articles scanned
        </span>
      </div>

      <div class="glance-item">
        <strong
          class="glance-value"
        >
          ${
            Number(
              state.data
                ?.cluster_count
            ) || "—"
          }
        </strong>

        <span
          class="glance-name"
        >
          events clustered
        </span>
      </div>
    `;
  }


  const changed =
    newSinceVisit();

  const significant =
    significantSinceVisit();

  if (els.changedSummary) {
    if (!state.previousVisit) {
      els.changedSummary.textContent =
        "Your next visit will show what changed while you were away.";
    } else if (
      !changed.length
    ) {
      els.changedSummary.textContent =
        "No new developments since your last visit.";
    } else {
      els.changedSummary.textContent =
        `${changed.length} new ${
          changed.length === 1
            ? "development"
            : "developments"
        }, including ${significant.length} significant.`;
    }
  }


  if (els.topicChips) {
    const topics = [
      ["India", "India"],
      ["Markets", "markets"],
      ["AI", "AI"],
      [
        "Economy",
        "Macro Economics"
      ],
      [
        "Geopolitics",
        "Geopolitics"
      ],
      [
        "Technology",
        "Technology"
      ],
      [
        "Climate",
        "Science & Climate"
      ]
    ];

    els.topicChips.innerHTML =
      topics
        .map(
          ([label, target]) => `
            <button
              class="topic-chip"
              type="button"
              data-topic="${esc(
                target
              )}"
            >
              ${esc(label)}
            </button>
          `
        )
        .join("");

    els.topicChips
      .querySelectorAll(
        "[data-topic]"
      )
      .forEach(
        button => {
          button.onclick = () => {
            const target =
              button.dataset.topic;

            if (
              target ===
              "markets"
            ) {
              renderMarkets();
            } else {
              renderCategory(
                target
              );
            }
          };
        }
      );
  }
}


/* ============================================================
   SINCE LAST CHECK PANEL
   ============================================================ */

function renderSinceSummary() {
  if (!els.sinceSummary) {
    return;
  }

  const changed =
    newSinceVisit();

  const significant =
    significantSinceVisit();

  if (!state.previousVisit) {
    els.sinceSummary.textContent =
      "Your first visit is ready. Future visits will highlight what changed.";
    return;
  }

  if (!changed.length) {
    els.sinceSummary.textContent =
      "No new developments since your last visit.";
    return;
  }

  const busiest =
    busiestCategory(
      changed
    );

  let text =
    `${changed.length} new ${
      changed.length === 1
        ? "development"
        : "developments"
    } since your last visit.`;

  if (
    significant.length
  ) {
    text +=
      ` ${significant.length} ${
        significant.length === 1
          ? "is"
          : "are"
      } significant.`;
  }

  if (busiest) {
    text +=
      ` Most activity: ${busiest}.`;
  }

  els.sinceSummary.textContent =
    text;
}


/* ============================================================
   SECTION HEADING
   ============================================================ */

function sectionHeading(
  label,
  action = ""
) {
  return `
    <div class="section-heading-row">

      <h2>
        ${esc(label)}
      </h2>

      ${
        action
          ? `
            <span>
              ${esc(action)}
            </span>
          `
          : ""
      }

    </div>
  `;
}


/* ============================================================
   DEVELOPING TIMELINE COMPONENT
   ============================================================ */

function timelineMarkup(
  stories,
  limit = 3
) {
  return `
    <div class="developing-timeline">

      ${stories
        .slice(0, limit)
        .map(
          story => {
            const id =
              encodeURIComponent(
                key(story)
              );

            return `
              <article
                class="timeline-item"
              >

                <time
                  class="timeline-time"
                  datetime="${esc(
                    stamp(story)
                  )}"
                >
                  ${esc(
                    clock(
                      stamp(story)
                    )
                  )}
                </time>

                <span
                  class="timeline-marker"
                  aria-hidden="true"
                ></span>

                <div
                  class="timeline-content"
                >

                  <div
                    class="story-topline"
                  >
                    <span
                      class="category-label"
                    >
                      ${esc(
                        cat(
                          story?.category ||
                          "News"
                        )
                      )}
                    </span>

                    <span
                      class="importance-label ${esc(
                        level(story)
                      )}"
                    >
                      ${esc(
                        level(story)
                      )}
                    </span>
                  </div>

                  <h3>
                    ${esc(
                      story?.title ||
                      "Untitled development"
                    )}
                  </h3>

                  ${
                    summary(
                      story,
                      28
                    )
                      ? `
                        <p>
                          ${esc(
                            summary(
                              story,
                              28
                            )
                          )}
                        </p>
                      `
                      : ""
                  }

                  <div
                    class="timeline-actions"
                  >
                    <button
                      class="story-action"
                      type="button"
                      data-source="${esc(
                        id
                      )}"
                    >
                      ${
                        sourceCount(
                          story
                        ) > 1
                          ? "View sources"
                          : "View source"
                      }
                    </button>

                    <a
                      class="story-action"
                      href="${esc(
                        url(story)
                      )}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Read →
                    </a>

                    <button
                      class="story-action save-button ${
                        saved(story)
                          ? "saved"
                          : ""
                      }"
                      type="button"
                      data-save="${esc(
                        id
                      )}"
                    >
                      ${
                        saved(story)
                          ? "★ Saved"
                          : "☆ Save"
                      }
                    </button>
                  </div>

                </div>

              </article>
            `;
          }
        )
        .join("")}

    </div>
  `;
}


/* ============================================================
   THE BRIEF
   ============================================================ */

function renderBrief() {
  state.currentView =
    "brief";

  state.currentCategory =
    null;

  setActive({
    view: "brief"
  });

  setHeader(
    "TODAY'S BRIEF",
    "5 developments worth your attention",
    "A focused view on what's important in India, the world and beyond."
  );

  showSince(true);

  const stories =
    displayBrief();

  if (!stories.length) {
    empty(
      "No brief is available yet",
      "The intelligence pipeline has not produced any qualifying developments."
    );

    renderRail();

    return;
  }

  const lead =
    stories[0];

  const supporting =
    stories.slice(
      1,
      5
    );

  const developing =
    developingStories()
      .filter(
        story =>
          !stories.some(
            briefStory =>
              key(
                briefStory
              ) ===
              key(story)
          )
      )
      .slice(0, 3);

  /*
   * If all developing fallback stories overlap the Brief,
   * use the next strongest recent stories so the timeline
   * remains useful without duplicating the cards above it.
   */
  const timelineStories =
    developing.length
      ? developing
      : sortStories(
          state.clusters.filter(
            story =>
              !stories.some(
                briefStory =>
                  key(
                    briefStory
                  ) ===
                  key(story)
              )
          )
        ).slice(0, 3);


  els.contentView.innerHTML = `
    <section class="brief-layout">

      <div class="brief-lead">
        ${storyMarkup(
          lead,
          "lead"
        )}
      </div>

      ${
        supporting.length
          ? `
            <section
              class="important-section"
            >

              ${sectionHeading(
                "Other important developments"
              )}

              <div
                class="important-grid"
              >
                ${supporting
                  .map(
                    story =>
                      storyMarkup(
                        story,
                        "secondary"
                      )
                  )
                  .join("")}
              </div>

            </section>
          `
          : ""
      }

      ${
        timelineStories.length
          ? `
            <section
              class="developing-timeline-section"
            >

              <div
                class="developing-heading"
              >
                <div>
                  <span
                    class="section-kicker developing-kicker"
                  >
                    DEVELOPING NOW
                  </span>

                  <h2>
                    Stories still moving
                  </h2>
                </div>

                <button
                  class="quiet-button"
                  id="briefDevelopingButton"
                  type="button"
                >
                  View all →
                </button>
              </div>

              ${timelineMarkup(
                timelineStories,
                3
              )}

            </section>
          `
          : ""
      }

    </section>
  `;

  wireStoryActions();

  $("briefDevelopingButton")
    ?.addEventListener(
      "click",
      renderDeveloping
    );

  renderRail();
}


/* ============================================================
   GENERIC CATEGORY STREAM
   ============================================================ */

const CATEGORY_DESCRIPTIONS = {
  "India":
    "National developments with policy, economic or institutional significance.",

  "Indian Politics":
    "Political developments and public-policy decisions shaping India.",

  "Macro Economics":
    "Inflation, rates, fiscal policy, regulation and the Indian economy.",

  "Business & Micro":
    "Companies, industries and commercial developments worth tracking.",

  "Companies & Earnings":
    "Material corporate events, earnings and strategic moves.",

  "World":
    "Consequential international developments beyond India.",

  "Geopolitics":
    "Conflict, diplomacy, sanctions and geopolitical shifts.",

  "World Politics":
    "Political developments in major countries and institutions.",

  "AI":
    "Models, products, research and policy shaping artificial intelligence.",

  "Technology":
    "Technology businesses, products, infrastructure and regulation.",

  "Science & Climate":
    "Science, climate and research developments with lasting consequence.",

  "The Ken":
    "Selected developments from The Ken."
};


function renderCategory(
  category
) {
  state.currentView =
    "category";

  state.currentCategory =
    category;

  setActive({
    category
  });

  setHeader(
    "INTELLIGENCE",
    cat(category),
    CATEGORY_DESCRIPTIONS[
      category
    ] ||
    `The latest consequential developments in ${cat(
      category
    )}.`
  );

  showSince(false);

  const stories =
    categoryStories(
      category
    );

  if (!stories.length) {
    empty(
      `No ${cat(
        category
      )} developments`,
      "There are no qualifying stories in the current intelligence window."
    );

    renderRail();

    return;
  }

  const lead =
    stories[0];

  const rest =
    stories.slice(
      1,
      13
    );

  els.contentView.innerHTML = `
    <section class="stream-layout">

      <div class="stream-heading">
        <div>
          <h2>
            Latest
          </h2>

          <p>
            ${stories.length}
            ${
              stories.length === 1
                ? "development"
                : "developments"
            }
            in the current window
          </p>
        </div>
      </div>

      <div class="stream-lead">
        ${storyMarkup(
          lead,
          "lead"
        )}
      </div>

      ${
        rest.length
          ? `
            <div class="story-stream">
              ${rest
                .map(
                  story =>
                    storyMarkup(
                      story,
                      "normal"
                    )
                )
                .join("")}
            </div>
          `
          : ""
      }

    </section>
  `;

  wireStoryActions();

  renderRail();
}


/* ============================================================
   DEVELOPING VIEW
   ============================================================ */

function renderDeveloping() {
  state.currentView =
    "developing";

  state.currentCategory =
    null;

  setActive({
    view: "developing"
  });

  setHeader(
    "LIVE INTELLIGENCE",
    "Developing",
    "Recent consequential stories that may still be changing."
  );

  showSince(false);

  const stories =
    developingStories();

  if (!stories.length) {
    empty(
      "Nothing is actively developing",
      "No recent high-importance story currently meets the developing threshold."
    );

    renderRail();

    return;
  }

  els.contentView.innerHTML = `
    <section
      class="developing-timeline-section developing-full"
    >

      <div
        class="developing-heading"
      >
        <div>
          <span
            class="section-kicker developing-kicker"
          >
            DEVELOPING NOW
          </span>

          <h2>
            Latest movement
          </h2>
        </div>
      </div>

      ${timelineMarkup(
        stories,
        stories.length
      )}

    </section>
  `;

  wireStoryActions();

  renderRail();
}


/* ============================================================
   SINCE LAST CHECK VIEW
   ============================================================ */

function renderSince() {
  state.currentView =
    "since";

  state.currentCategory =
    null;

  setActive({
    view: "since"
  });

  setHeader(
    "SINCE LAST CHECK",
    "What changed while you were away",
    "New developments published since your previous visit."
  );

  showSince(false);

  if (
    !state.previousVisit
  ) {
    empty(
      "No previous visit yet",
      "Come back later and this view will isolate what changed since this visit."
    );

    renderRail();

    return;
  }

  const stories =
    newSinceVisit();

  if (!stories.length) {
    empty(
      "You're caught up",
      "There are no new developments since your previous visit."
    );

    renderRail();

    return;
  }

  const significant =
    stories.filter(
      story =>
        [
          "critical",
          "significant"
        ].includes(
          level(story)
        )
    );

  const ordinary =
    stories.filter(
      story =>
        ![
          "critical",
          "significant"
        ].includes(
          level(story)
        )
    );

  els.contentView.innerHTML = `
    <section class="stream-layout">

      ${
        significant.length
          ? `
            <div class="stream-heading">
              <div>
                <h2>
                  Worth your attention
                </h2>

                <p>
                  ${significant.length}
                  significant
                  ${
                    significant.length ===
                    1
                      ? "development"
                      : "developments"
                  }
                </p>
              </div>
            </div>

            <div class="story-stream">
              ${significant
                .map(
                  story =>
                    storyMarkup(
                      story,
                      "normal"
                    )
                )
                .join("")}
            </div>
          `
          : ""
      }

      ${
        ordinary.length
          ? `
            <div
              class="stream-heading"
              style="margin-top:24px"
            >
              <div>
                <h2>
                  Also new
                </h2>

                <p>
                  ${ordinary.length}
                  additional
                  ${
                    ordinary.length ===
                    1
                      ? "development"
                      : "developments"
                  }
                </p>
              </div>
            </div>

            <div class="story-stream">
              ${ordinary
                .slice(0, 20)
                .map(
                  story =>
                    storyMarkup(
                      story,
                      "normal"
                    )
                )
                .join("")}
            </div>
          `
          : ""
      }

    </section>
  `;

  wireStoryActions();

  renderRail();
}
/* ============================================================
   MARKETS
   ============================================================ */

function marketStories(
  category
) {
  return sortStories(
    state.clusters.filter(
      story =>
        matchesCategory(
          story,
          category
        )
    )
  );
}


function marketSection(
  title,
  stories,
  limit = 5
) {
  if (!stories.length) {
    return "";
  }

  return `
    <section class="market-section">

      ${sectionHeading(
        title
      )}

      <div
        class="market-story-list"
      >
        ${stories
          .slice(0, limit)
          .map(
            story =>
              storyMarkup(
                story,
                "normal"
              )
          )
          .join("")}
      </div>

    </section>
  `;
}


function ipoItemMarkup(
  item
) {
  if (!item) {
    return "";
  }

  const details = [
    item.price_band,
    item.issue_size,
    item.lot_size
      ? `Lot ${item.lot_size}`
      : null
  ].filter(Boolean);

  return `
    <article class="story-card">

      <div class="story-body">

        <div class="story-topline">

          <span
            class="importance-label noteworthy"
          >
            ${esc(
              item.status ||
              "IPO UPDATE"
            )}
          </span>

          <span
            class="category-label"
          >
            IPO
          </span>

        </div>

        <h3 class="story-title">
          ${esc(
            item.name ||
            "IPO update"
          )}
        </h3>

        ${
          details.length
            ? `
              <p class="story-summary">
                ${esc(
                  details.join(
                    " · "
                  )
                )}
              </p>
            `
            : ""
        }

        ${
          item.what_to_know
            ? `
              <p class="story-summary">
                ${esc(
                  trunc(
                    item.what_to_know,
                    32
                  )
                )}
              </p>
            `
            : ""
        }

        <div class="story-meta">
          <span>
            ${esc(
              item.source ||
              "Source"
            )}
          </span>

          ${
            item.published_at
              ? `
                <span>·</span>

                <span>
                  ${esc(
                    ago(
                      item.published_at
                    )
                  )}
                </span>
              `
              : ""
          }
        </div>

        ${
          item.url
            ? `
              <div class="story-actions">

                <a
                  class="story-action"
                  href="${esc(
                    item.url
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read source →
                </a>

              </div>
            `
            : ""
        }

      </div>

    </article>
  `;
}


function ipoSection(
  title,
  items
) {
  if (
    !Array.isArray(items) ||
    !items.length
  ) {
    return "";
  }

  return `
    <section class="market-section">

      ${sectionHeading(
        title
      )}

      <div
        class="market-story-list"
      >
        ${items
          .slice(0, 6)
          .map(
            ipoItemMarkup
          )
          .join("")}
      </div>

    </section>
  `;
}


function renderMarkets() {
  state.currentView =
    "markets";

  state.currentCategory =
    null;

  setActive({
    view: "markets"
  });

  setHeader(
    "MARKETS",
    "Markets",
    "Indian markets first, with the global developments that can move them."
  );

  showSince(false);

  const india =
    marketStories(
      "Indian Markets"
    );

  const global =
    marketStories(
      "Global → India"
    );

  const companies =
    marketStories(
      "Companies & Earnings"
    );

  const macro =
    marketStories(
      "Macro Economics"
    );

  const mutual =
    Array.isArray(
      state.markets
        ?.mutual_fund_news
    )
      ? state.markets
          .mutual_fund_news
      : categoryStories(
          "Mutual Funds"
        );

  const leadCandidates =
    dedupe([
      ...india,
      ...global,
      ...companies,
      ...macro
    ]);

  const lead =
    sortStories(
      leadCandidates
    )[0];

  const ipoOpen =
    state.markets
      ?.ipo_open ||
    [];

  const ipoUpcoming =
    state.markets
      ?.ipo_upcoming ||
    [];

  const ipoRecent =
    state.markets
      ?.ipo_recent ||
    [];


  if (
    !lead &&
    !ipoOpen.length &&
    !ipoUpcoming.length &&
    !ipoRecent.length &&
    !mutual.length
  ) {
    empty(
      "Markets are quiet",
      "No qualifying market developments are available in the current intelligence window."
    );

    renderRail();

    return;
  }


  els.contentView.innerHTML = `
    <section class="markets-layout">

      ${
        lead
          ? `
            <div class="markets-lead">
              ${storyMarkup(
                lead,
                "lead"
              )}
            </div>
          `
          : ""
      }

      <div class="market-columns">

        <div>

          ${marketSection(
            "Indian markets",
            india.filter(
              story =>
                !lead ||
                key(story) !==
                  key(lead)
            ),
            6
          )}

          ${marketSection(
            "Companies & earnings",
            companies.filter(
              story =>
                !lead ||
                key(story) !==
                  key(lead)
            ),
            6
          )}

        </div>

        <div>

          ${marketSection(
            "Global → India",
            global.filter(
              story =>
                !lead ||
                key(story) !==
                  key(lead)
            ),
            6
          )}

          ${marketSection(
            "Economy & policy",
            macro.filter(
              story =>
                !lead ||
                key(story) !==
                  key(lead)
            ),
            5
          )}

        </div>

      </div>

      ${ipoSection(
        "IPOs open now",
        ipoOpen
      )}

      ${ipoSection(
        "Upcoming IPOs",
        ipoUpcoming
      )}

      ${ipoSection(
        "Recently listed",
        ipoRecent
      )}

      ${marketSection(
        "Mutual funds",
        mutual,
        8
      )}

    </section>
  `;

  wireStoryActions();

  renderRail();
}


/* ============================================================
   EXPLORE
   ============================================================ */

function renderExplore() {
  state.currentView =
    "explore";

  state.currentCategory =
    null;

  setActive({
    view: "explore"
  });

  setHeader(
    "EXPLORE",
    "Explore",
    "Move beyond the brief and browse the intelligence stream by subject."
  );

  showSince(false);

  const sections = [
    [
      "India",
      "India",
      "National developments with lasting policy or institutional consequence."
    ],

    [
      "Indian Politics",
      "Indian Politics",
      "Political developments and public-policy decisions."
    ],

    [
      "Economy & Policy",
      "Macro Economics",
      "Rates, inflation, fiscal policy, regulation and the economy."
    ],

    [
      "Markets",
      "markets",
      "Indian markets, companies, IPOs, funds and global transmission."
    ],

    [
      "Geopolitics",
      "Geopolitics",
      "Conflict, diplomacy, sanctions and geopolitical shifts."
    ],

    [
      "AI",
      "AI",
      "Models, products, research and policy shaping artificial intelligence."
    ],

    [
      "Technology",
      "Technology",
      "Technology businesses, products, infrastructure and regulation."
    ],

    [
      "Science & Climate",
      "Science & Climate",
      "Research, climate and scientific developments worth tracking."
    ]
  ];


  els.contentView.innerHTML = `
    <section class="explore-layout">

      <div class="explore-grid">

        ${sections
          .map(
            (
              [
                label,
                target,
                description
              ]
            ) => {
              const count =
                target ===
                "markets"
                  ? dedupe([
                      ...marketStories(
                        "Indian Markets"
                      ),
                      ...marketStories(
                        "Global → India"
                      ),
                      ...marketStories(
                        "Companies & Earnings"
                      )
                    ]).length
                  : categoryStories(
                      target
                    ).length;

              return `
                <button
                  class="explore-card"
                  type="button"
                  data-explore="${esc(
                    target
                  )}"
                >

                  <div
                    class="explore-card-top"
                  >
                    <span>
                      ${esc(label)}
                    </span>

                    <strong>
                      ${count}
                    </strong>
                  </div>

                  <h3>
                    ${esc(label)}
                  </h3>

                  <p>
                    ${esc(
                      description
                    )}
                  </p>

                  <span
                    class="explore-arrow"
                  >
                    Explore →
                  </span>

                </button>
              `;
            }
          )
          .join("")}

      </div>

    </section>
  `;


  document
    .querySelectorAll(
      "[data-explore]"
    )
    .forEach(
      button => {
        button.onclick = () => {
          const target =
            button.dataset.explore;

          if (
            target ===
            "markets"
          ) {
            renderMarkets();
          } else {
            renderCategory(
              target
            );
          }
        };
      }
    );

  renderRail();
}


/* ============================================================
   SAVED
   ============================================================ */

function renderSaved() {
  state.currentView =
    "saved";

  state.currentCategory =
    null;

  setActive({
    view: "saved"
  });

  setHeader(
    "SAVED",
    "Saved stories",
    "Your bookmarked developments, kept locally in this browser."
  );

  showSince(false);

  const stories =
    sortStories(
      state.clusters.filter(
        story =>
          state.saved.has(
            key(story)
          )
      )
    );


  if (!stories.length) {
    empty(
      "Nothing saved yet",
      "Use the Save button on any story to keep it here."
    );

    renderRail();

    return;
  }


  els.contentView.innerHTML = `
    <section class="stream-layout">

      <div class="stream-heading">
        <div>
          <h2>
            Bookmarks
          </h2>

          <p>
            ${stories.length}
            ${
              stories.length === 1
                ? "saved story"
                : "saved stories"
            }
          </p>
        </div>
      </div>

      <div class="story-stream">

        ${stories
          .map(
            story =>
              storyMarkup(
                story,
                "normal"
              )
          )
          .join("")}

      </div>

    </section>
  `;

  wireStoryActions();

  renderRail();
}


/* ============================================================
   SEARCH
   ============================================================ */

function openSearch() {
  if (!els.searchPanel) {
    return;
  }

  els.searchPanel.classList.add(
    "open"
  );

  els.searchPanel.setAttribute(
    "aria-hidden",
    "false"
  );

  window.setTimeout(
    () =>
      els.searchInput
        ?.focus(),
    50
  );
}


function closeSearch() {
  if (!els.searchPanel) {
    return;
  }

  els.searchPanel.classList.remove(
    "open"
  );

  els.searchPanel.setAttribute(
    "aria-hidden",
    "true"
  );
}


function renderSearch(
  query
) {
  const term =
    clean(query)
      .toLowerCase();

  state.currentView =
    "search";

  state.currentCategory =
    null;

  setActive({});

  showSince(false);

  if (!term) {
    setHeader(
      "SEARCH",
      "Search intelligence",
      "Search across the current intelligence window."
    );

    empty(
      "Start typing to search",
      "Search story titles, summaries, categories and publishers."
    );

    renderRail();

    return;
  }


  const results =
    sortStories(
      state.clusters.filter(
        story => {
          const haystack = [
            story?.title,
            story?.description,
            story?.brief,
            story?.category,
            story?.primary
              ?.source,
            ...(story?.sources ||
              [])
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(
            term
          );
        }
      )
    );


  setHeader(
    "SEARCH",
    `Results for “${query}”`,
    `${results.length} ${
      results.length === 1
        ? "development"
        : "developments"
    } found.`
  );


  if (!results.length) {
    empty(
      "No matching stories",
      "Try another company, country, topic or policy term."
    );

    renderRail();

    return;
  }


  els.contentView.innerHTML = `
    <section class="stream-layout">

      <div class="story-stream">

        ${results
          .slice(0, 30)
          .map(
            story =>
              storyMarkup(
                story,
                "normal"
              )
          )
          .join("")}

      </div>

    </section>
  `;

  wireStoryActions();

  renderRail();
}


/* ============================================================
   SOURCE SHEET
   ============================================================ */

function sourceArticles(
  story
) {
  if (
    Array.isArray(
      story?.articles
    ) &&
    story.articles.length
  ) {
    return story.articles;
  }

  if (story?.primary) {
    return [
      story.primary
    ];
  }

  return [story];
}


function openSources(
  story
) {
  if (
    !els.sourceSheet ||
    !els.sheetSources
  ) {
    /*
     * Graceful fallback if the sheet
     * is absent from a future HTML build.
     */
    const target =
      url(story);

    if (
      target &&
      target !== "#"
    ) {
      window.open(
        target,
        "_blank",
        "noopener,noreferrer"
      );
    }

    return;
  }


  const articles =
    sourceArticles(
      story
    );


  if (els.sheetTitle) {
    els.sheetTitle.textContent =
      story?.title ||
      "Sources";
  }


  els.sheetSources.innerHTML =
    articles
      .map(
        article => `
          <a
            class="source-sheet-item"
            href="${esc(
              article?.url ||
              "#"
            )}"
            target="_blank"
            rel="noopener noreferrer"
          >

            <div>
              <strong>
                ${esc(
                  article?.source ||
                  "Source"
                )}
              </strong>

              <span>
                ${esc(
                  ago(
                    article
                      ?.published_at
                  )
                )}
              </span>
            </div>

            ${
              article
                ?.description
                ? `
                  <p>
                    ${esc(
                      trunc(
                        article.description,
                        28
                      )
                    )}
                  </p>
                `
                : ""
            }

            <span
              class="source-open"
            >
              Open article →
            </span>

          </a>
        `
      )
      .join("");


  els.sourceSheet.classList.add(
    "open"
  );

  els.sourceSheet.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.classList.add(
    "sheet-open"
  );
}


function closeSources() {
  if (!els.sourceSheet) {
    return;
  }

  els.sourceSheet.classList.remove(
    "open"
  );

  els.sourceSheet.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.classList.remove(
    "sheet-open"
  );
}


/* ============================================================
   THEME
   ============================================================ */

function currentTheme() {
  return (
    document.documentElement
      .dataset.theme ||
    "light"
  );
}


function applyTheme(
  theme
) {
  const next =
    theme === "dark"
      ? "dark"
      : "light";

  document.documentElement
    .dataset.theme =
      next;

  localStorage.setItem(
    "di_theme",
    next
  );

  const label =
    next === "dark"
      ? "Switch to light mode"
      : "Switch to dark mode";

  [
    els.themeButton,
    els.sidebarThemeButton
  ]
    .filter(Boolean)
    .forEach(
      button => {
        button.setAttribute(
          "aria-label",
          label
        );
      }
    );
}


function toggleTheme() {
  applyTheme(
    currentTheme() === "dark"
      ? "light"
      : "dark"
  );
}


/* ============================================================
   MENU
   ============================================================ */

function openMenu() {
  /*
   * Desktop sidebar is fixed.
   * Mobile CSS intentionally removes
   * this legacy drawer system.
   */
  if (
    window.matchMedia(
      "(max-width: 760px)"
    ).matches
  ) {
    return;
  }

  document.body.classList.add(
    "sidebar-open"
  );

  els.menuOverlay
    ?.setAttribute(
      "aria-hidden",
      "false"
    );
}


function closeMenu() {
  document.body.classList.remove(
    "sidebar-open"
  );

  els.menuOverlay
    ?.setAttribute(
      "aria-hidden",
      "true"
    );
}


/* ============================================================
   CURRENT VIEW RE-RENDER
   ============================================================ */

function renderCurrent() {
  switch (
    state.currentView
  ) {
    case "markets":
      renderMarkets();
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

    case "since":
      renderSince();
      break;

    case "category":
      renderCategory(
        state.currentCategory
      );
      break;

    case "brief":
    default:
      renderBrief();
      break;
  }
}


/* ============================================================
   NAVIGATION WIRING
   ============================================================ */

function wireNavigation() {
  document
    .querySelectorAll(
      "[data-view]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            const view =
              button.dataset.view;

            closeMenu();
            closeSearch();

            switch (view) {
              case "brief":
                renderBrief();
                break;

              case "markets":
                renderMarkets();
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

              case "since":
                renderSince();
                break;

              default:
                renderBrief();
                break;
            }

            window.scrollTo({
              top: 0,
              behavior: "smooth"
            });
          }
        );
      }
    );


  document
    .querySelectorAll(
      "[data-category]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            const category =
              button.dataset.category;

            if (!category) {
              return;
            }

            closeMenu();
            closeSearch();

            renderCategory(
              category
            );

            window.scrollTo({
              top: 0,
              behavior: "smooth"
            });
          }
        );
      }
    );
}


/* ============================================================
   GLOBAL EVENT WIRING
   ============================================================ */

function wireGlobalEvents() {
  els.openMenu
    ?.addEventListener(
      "click",
      openMenu
    );

  els.closeMenu
    ?.addEventListener(
      "click",
      closeMenu
    );

  els.menuOverlay
    ?.addEventListener(
      "click",
      closeMenu
    );


  els.searchButton
    ?.addEventListener(
      "click",
      openSearch
    );

  els.desktopSearchTrigger
    ?.addEventListener(
      "click",
      openSearch
    );

  els.closeSearch
    ?.addEventListener(
      "click",
      closeSearch
    );


  els.searchInput
    ?.addEventListener(
      "input",
      event => {
        renderSearch(
          event.target.value
        );
      }
    );


  els.searchInput
    ?.addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
          "Escape"
        ) {
          closeSearch();
        }
      }
    );


  els.themeButton
    ?.addEventListener(
      "click",
      toggleTheme
    );

  els.sidebarThemeButton
    ?.addEventListener(
      "click",
      toggleTheme
    );


  els.viewSinceButton
    ?.addEventListener(
      "click",
      renderSince
    );

  els.contextSinceButton
    ?.addEventListener(
      "click",
      renderSince
    );


  els.closeSheet
    ?.addEventListener(
      "click",
      closeSources
    );

  els.sheetBackdrop
    ?.addEventListener(
      "click",
      closeSources
    );


  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      closeMenu();
      closeSearch();
      closeSources();
    }
  );


  /*
   * Real article images can fail because of
   * hotlink protection or expired CDN URLs.
   * Replace only the failed image with the
   * restrained DI fallback.
   */
  document.addEventListener(
    "error",
    event => {
      const image =
        event.target;

      if (
        !(image instanceof
          HTMLImageElement)
      ) {
        return;
      }

      if (
        !image.closest(
          ".story-visual"
        )
      ) {
        return;
      }

      const visual =
        image.closest(
          ".story-visual"
        );

      image.remove();

      visual?.classList.add(
        "visual-fallback"
      );
    },
    true
  );


  /*
   * If the viewport crosses into mobile,
   * ensure the old drawer state cannot linger.
   */
  window.addEventListener(
    "resize",
    () => {
      if (
        window.innerWidth <=
        760
      ) {
        closeMenu();
      }
    }
  );
}


/* ============================================================
   STATUS / DATES
   ============================================================ */

function updateStatus() {
  const generated =
    state.data
      ?.generated_at;

  const parsed =
    date(generated);

  const localNow =
    new Date();


  const formattedDate =
    new Intl.DateTimeFormat(
      "en-IN",
      {
        weekday: "short",
        day: "numeric",
        month: "short"
      }
    ).format(
      localNow
    );


  if (els.topbarDate) {
    els.topbarDate.textContent =
      formattedDate;
  }


  if (
    els.topbarUpdated
  ) {
    els.topbarUpdated.textContent =
      parsed
        ? `Updated ${ago(
            generated
          )}`
        : "Updated recently";
  }


  if (els.lastUpdated) {
    els.lastUpdated.textContent =
      parsed
        ? `Updated ${ago(
            generated
          )}`
        : "Updated recently";
  }


  const sources =
    Array.isArray(
      state.data?.sources
    )
      ? state.data.sources
      : [];

  const healthy =
    sources.filter(
      source =>
        source?.ok
    ).length;

  const total =
    sources.length;


  if (
    els.sidebarStatus
  ) {
    els.sidebarStatus.textContent =
      total
        ? `${healthy}/${total} sources healthy`
        : "Sources ready";
  }


  const healthyEnough =
    !total ||
    healthy / total >=
      0.75;


  [
    els.healthDot,
    els.sidebarHealthDot
  ]
    .filter(Boolean)
    .forEach(
      dot => {
        dot.classList.toggle(
          "warning",
          !healthyEnough
        );
      }
    );
}


/* ============================================================
   DATA LOAD
   ============================================================ */

async function fetchJson(
  resource
) {
  const separator =
    resource.includes("?")
      ? "&"
      : "?";

  const response =
    await fetch(
      `${resource}${separator}v=${Date.now()}`,
      {
        cache: "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  return response.json();
}


async function loadData() {
  const data =
    await fetchJson(
      DATA_URL
    );

  state.data =
    data || {};

  state.clusters =
    clustersOf(
      state.data
    );

  state.top =
    briefOf(
      state.data,
      state.clusters
    );

  state.markets =
    state.data
      ?.markets ||
    {};


  try {
    const archives =
      await fetchJson(
        ARCHIVES_URL
      );

    state.archives =
      Array.isArray(
        archives
      )
        ? archives
        : [];
  } catch {
    /*
     * Archives are non-critical.
     * The current intelligence view
     * must still boot.
     */
    state.archives = [];
  }
}


/* ============================================================
   BOOT FAILURE
   ============================================================ */

function bootFailure(
  error
) {
  console.error(
    "Daily Intelligence boot failed:",
    error
  );

  setHeader(
    "DAILY INTELLIGENCE",
    "Unable to load today's intelligence",
    "The interface loaded, but the latest data file could not be read."
  );

  showSince(false);

  if (
    els.contentView
  ) {
    els.contentView.innerHTML = `
      <section class="empty-state">

        <div
          class="empty-state-icon"
          aria-hidden="true"
        >
          !
        </div>

        <h2>
          Intelligence unavailable
        </h2>

        <p>
          Please refresh the page.
          If this persists, check
          docs/data/latest.json
          in the deployed site.
        </p>

        <button
          class="primary-button"
          id="retryLoad"
          type="button"
        >
          Try again
        </button>

      </section>
    `;

    $("retryLoad")
      ?.addEventListener(
        "click",
        () =>
          window.location.reload()
      );
  }
}


/* ============================================================
   INITIAL THEME
   ============================================================ */

function initialiseTheme() {
  const stored =
    localStorage.getItem(
      "di_theme"
    );

  if (
    stored === "dark" ||
    stored === "light"
  ) {
    applyTheme(
      stored
    );

    return;
  }

  /*
   * Keep the editorial light theme as
   * the default even if the operating
   * system itself is dark.
   */
  applyTheme(
    "light"
  );
}


/* ============================================================
   BOOT
   ============================================================ */

async function boot() {
  initialiseTheme();

  wireNavigation();
  wireGlobalEvents();

  try {
    await loadData();

    updateStatus();
    renderSinceSummary();
    renderBrief();

    /*
     * Record this visit only after the
     * previous visit has already been
     * used to calculate "Since last check".
     */
    localStorage.setItem(
      "di_last_visit",
      state.currentVisit
    );

    document.documentElement
      .classList.add(
        "di-ready"
      );

  } catch (error) {
    bootFailure(
      error
    );
  }
}


/* ============================================================
   START
   ============================================================ */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    boot,
    {
      once: true
    }
  );
} else {
  boot();
}
