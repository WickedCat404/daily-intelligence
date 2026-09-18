const DATA_URL = "./data/latest.json";
const ARCHIVES_URL = "./data/archives.json";

const state = {
  data: null,
  clusters: [],
  top: [],
  markets: {},
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

  div.innerHTML = value;

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

  if (words.length <= limit) {
    return words.join(" ");
  }

  return (
    words
      .slice(0, limit)
      .join(" ")
    + "…"
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
   REAL STORY IMAGES
============================================================ */

function imageUrl(story) {
  if (!story) {
    return "";
  }

  if (story.image_url) {
    return story.image_url;
  }

  if (
    story.primary?.image_url
  ) {
    return (
      story.primary.image_url
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
          item?.image_url
      );

    if (article?.image_url) {
      return article.image_url;
    }
  }

  return "";
}


function visualMarkup(
  story,
  kind = "card"
) {
  const image =
    imageUrl(story);

  if (image) {
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
          onerror="
            this.parentElement.classList.add('image-failed');
            this.remove();
          "
        >
      </div>
    `;
  }

  /*
   * Deliberately restrained fallback.
   * No fabricated stock imagery.
   */
  return `
    <div
      class="story-visual visual-fallback ${esc(kind)}"
      aria-hidden="true"
    >
      <span>DI</span>
      <strong>
        ${esc(
          cat(
            story?.category ||
            "Intelligence"
          )
        )}
      </strong>
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
        "Markets"
    }[category] ||
    category
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

  "World Politics": [
    "world politics",
    "global politics",
    "international politics"
  ],

  "Science & Climate": [
    "science climate",
    "science and climate",
    "climate science"
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

  if (
    targets.includes(actual)
  ) {
    return true;
  }

  /*
   * Politics feeds are currently weak.
   * This is only a conservative fallback
   * for already-India-classified stories.
   */
  if (
    wanted ===
    "Indian Politics"
  ) {
    const text =
      norm(
        `${
          story?.title || ""
        } ${
          story?.description || ""
        }`
      );

    return (
      (
        actual === "india" ||
        actual === "politics"
      ) &&
      /\b(parliament|lok sabha|rajya sabha|bjp|congress|election|minister|government|opposition|cabinet|political)\b/
        .test(text)
    );
  }

  return false;
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
   BRIEF SELECTION
============================================================ */

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
      typeof brief[0]
      === "object"
    ) {
      return brief;
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

    if (matched.length) {
      return matched;
    }
  }

  return sortStories(
    clusters
  ).slice(0, 8);
}


function displayBrief() {
  return dedupe(
    state.top.length
      ? state.top
      : sortStories(
          state.clusters
        )
  ).slice(0, 5);
}


/* ============================================================
   SAVE / BOOKMARK
============================================================ */

function toggleSaved(
  story
) {
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
   PAGE HEADER
============================================================ */

function setHeader(
  eyebrow,
  title,
  description
) {
  if (els.eyebrow) {
    els.eyebrow.textContent =
      eyebrow;
  }

  /*
   * Kept for compatibility with
   * the hidden legacy element.
   */
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
  els.sinceLastPanel
    ?.classList
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
    .forEach(button => {
      button.classList.remove(
        "active"
      );

      if (
        view &&
        button.dataset.view
        === view
      ) {
        button.classList.add(
          "active"
        );
      }

      if (
        category &&
        button.dataset.category
        === category
      ) {
        button.classList.add(
          "active"
        );
      }
    });
}


/* ============================================================
   STORY META
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
        rel="noopener"
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
   MAIN STORY MARKUP
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
        ? 24
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
            story?.title || ""
          )}
        </h3>

        ${
          summary(
            story,
            summaryLimit
          )
            ? `
              <p
                class="story-summary"
              >
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

        ${
          actions(
            story,
            id
          )
        }

      </div>

    </article>
  `;
}


/* ============================================================
   FIND STORY
============================================================ */

function findStory(
  encodedKey
) {
  return (
    state.clusters.find(
      story =>
        encodeURIComponent(
          key(story)
        ) === encodedKey
    ) ||
    state.top.find(
      story =>
        encodeURIComponent(
          key(story)
        ) === encodedKey
    )
  );
}


/* ============================================================
   STORY ACTION BINDINGS
============================================================ */

function wireStoryActions() {
  document
    .querySelectorAll(
      "[data-source]"
    )
    .forEach(button => {
      button.onclick =
        event => {
          event.preventDefault();
          event.stopPropagation();

          const story =
            findStory(
              button.dataset.source
            );

          if (story) {
            openSources(story);
          }
        };
    });


  document
    .querySelectorAll(
      "[data-save]"
    )
    .forEach(button => {
      button.onclick =
        event => {
          event.preventDefault();
          event.stopPropagation();

          const story =
            findStory(
              button.dataset.save
            );

          if (story) {
            toggleSaved(story);
          }
        };
    });
}


/* ============================================================
   EMPTY STATE
============================================================ */

function empty(
  title,
  description
) {
  if (!els.contentView) {
    return;
  }

  els.contentView.innerHTML = `
    <section class="empty-state">

      <div
        class="empty-state-icon"
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
   EXPLORE TOPICS
============================================================ */

const EXPLORE = [
  "India",
  "Indian Politics",
  "Macro Economics",
  "Business & Micro",
  "Indian Markets",
  "World",
  "Geopolitics",
  "AI",
  "Technology",
  "Science & Climate"
];


/* ============================================================
   RIGHT CONTEXT RAIL
============================================================ */

function renderRail() {
  if (
    !els.contextRail
  ) {
    return;
  }

  const brief =
    displayBrief();

  const developing =
    state.clusters.filter(
      story =>
        story?.is_developing
    );

  if (els.glanceGrid) {
    els.glanceGrid.innerHTML = `
      <div
        class="glance-item"
      >
        <div
          class="glance-value"
        >
          ${brief.length}
        </div>

        <div
          class="glance-name"
        >
          in today's brief
        </div>
      </div>

      <div
        class="glance-item"
      >
        <div
          class="glance-value"
        >
          ${developing.length}
        </div>

        <div
          class="glance-name"
        >
          developing stories
        </div>
      </div>

      <div
        class="glance-item"
      >
        <div
          class="glance-value"
        >
          ${
            state.data
              ?.article_count ||
            0
          }
        </div>

        <div
          class="glance-name"
        >
          articles scanned
        </div>
      </div>

      <div
        class="glance-item"
      >
        <div
          class="glance-value"
        >
          ${
            state.clusters
              .length
          }
        </div>

        <div
          class="glance-name"
        >
          events clustered
        </div>
      </div>
    `;
  }


  const changed =
    state.previousVisit
      ? state.clusters.filter(
          fresh
        )
      : [];


  if (
    els.changedSummary
  ) {
    els.changedSummary.textContent =
      state.previousVisit
        ? (
            changed.length
              ? `${
                  Math.min(
                    changed.length,
                    12
                  )
                } developments are worth catching up on.`
              : "You're caught up."
          )
        : "Your catch-up starts on your next visit.";
  }


  if (
    els.topicChips
  ) {
    els.topicChips.innerHTML =
      EXPLORE
        .slice(0, 7)
        .map(
          category => `
            <button
              class="topic-chip"
              data-chip="${esc(
                category
              )}"
            >
              ${esc(
                cat(category)
              )}
            </button>
          `
        )
        .join("");


    document
      .querySelectorAll(
        "[data-chip]"
      )
      .forEach(
        button => {
          button.onclick =
            () =>
              showCategory(
                button.dataset.chip
              );
        }
      );
  }
}


/* ============================================================
   DEVELOPING TIMELINE DATA
============================================================ */

function developingStories() {
  const explicit =
    sortStories(
      state.clusters.filter(
        story =>
          story?.is_developing
      )
    );

  if (explicit.length) {
    return explicit;
  }

  /*
   * The backend currently has very few explicit developing
   * flags. On The Brief we can still show a restrained
   * "recent signal" timeline using highly ranked recent
   * developments, without labelling them as breaking news.
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

        return (
          published &&
          published.getTime()
          >= cutoff &&
          Number(
            story?.importance ||
            0
          ) >= 43
        );
      }
    )
  );
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
      "The Brief is still forming",
      "No sufficiently important developments are available yet."
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

  const recent =
    developingStories()
      .filter(
        story =>
          key(story) !==
          key(lead)
      )
      .slice(0, 3);

  els.contentView.innerHTML = `
    <section
      class="brief-layout"
    >

      <div
        class="brief-lead"
      >
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

              <div
                class="section-heading-row"
              >
                <h2>
                  Other important developments
                </h2>
              </div>

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
        recent.length
          ? developingTimelineMarkup(
              recent,
              false
            )
          : ""
      }

    </section>
  `;

  wireStoryActions();
  renderRail();
}


/* ============================================================
   DEVELOPING TIMELINE
============================================================ */

function developingTimelineMarkup(
  stories,
  full = false
) {
  if (!stories.length) {
    return "";
  }

  return `
    <section
      class="developing-timeline-section ${
        full
          ? "developing-full"
          : ""
      }"
    >

      <div
        class="section-heading-row developing-heading"
      >
        <div>
          <div
            class="section-kicker"
          >
            DEVELOPING NOW
          </div>

          <h2>
            ${
              full
                ? "Stories still moving"
                : "What is changing"
            }
          </h2>
        </div>

        ${
          !full
            ? `
              <button
                class="text-button"
                data-open-developing
              >
                View all →
              </button>
            `
            : ""
        }
      </div>

      <div
        class="developing-timeline"
      >

        ${stories
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

                  <div
                    class="timeline-marker"
                    aria-hidden="true"
                  ></div>

                  <div
                    class="timeline-time"
                  >
                    ${esc(
                      clock(
                        stamp(story)
                      )
                    )}
                  </div>

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

                      ${
                        story?.is_developing
                          ? `
                            <span
                              class="story-state developing-state"
                            >
                              DEVELOPING
                            </span>
                          `
                          : `
                            <span
                              class="story-state"
                            >
                              RECENT
                            </span>
                          `
                      }
                    </div>

                    <h3>
                      ${esc(
                        story?.title ||
                        ""
                      )}
                    </h3>

                    ${
                      full &&
                      summary(
                        story,
                        34
                      )
                        ? `
                          <p>
                            ${esc(
                              summary(
                                story,
                                34
                              )
                            )}
                          </p>
                        `
                        : ""
                    }

                    <div
                      class="timeline-meta"
                    >
                      <span>
                        ${esc(
                          publisher(
                            story
                          )
                        )}
                      </span>

                      <span>·</span>

                      <span>
                        ${sourceCount(
                          story
                        )}
                        ${
                          sourceCount(
                            story
                          ) === 1
                            ? "source"
                            : "sources"
                        }
                      </span>
                    </div>

                    ${
                      full
                        ? `
                          <div
                            class="timeline-actions"
                          >
                            <button
                              class="story-action"
                              data-source="${esc(
                                id
                              )}"
                            >
                              View sources
                            </button>

                            <a
                              class="story-action"
                              href="${esc(
                                url(story)
                              )}"
                              target="_blank"
                              rel="noopener"
                            >
                              Read →
                            </a>

                            <button
                              class="story-action save-button ${
                                saved(
                                  story
                                )
                                  ? "saved"
                                  : ""
                              }"
                              data-save="${esc(
                                id
                              )}"
                            >
                              ${
                                saved(
                                  story
                                )
                                  ? "★ Saved"
                                  : "☆ Save"
                              }
                            </button>
                          </div>
                        `
                        : ""
                    }

                  </div>

                </article>
              `;
            }
          )
          .join("")}

      </div>

    </section>
  `;
}


/* ============================================================
   SINCE LAST CHECK
============================================================ */

function sinceStories() {
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

        return (
          published &&
          published > previous
        );
      }
    )
  );
}


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

  const stories =
    sinceStories();

  if (!state.previousVisit) {
    empty(
      "Your catch-up starts next time",
      "Daily Intelligence has saved this visit. On your next return, this view will show what changed while you were away."
    );

    renderRail();

    return;
  }

  if (!stories.length) {
    empty(
      "You're caught up",
      "No new developments have been published since your previous visit."
    );

    renderRail();

    return;
  }

  renderStream(
    stories.slice(
      0,
      30
    ),
    {
      title:
        `${stories.length} new developments`,
      description:
        "Ordered by importance and recency."
    }
  );

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
    "DEVELOPING",
    "Stories still moving",
    "Live and recently evolving developments worth keeping an eye on."
  );

  showSince(false);

  let stories =
    sortStories(
      state.clusters.filter(
        story =>
          story?.is_developing
      )
    );

  /*
   * Until the backend begins setting more explicit
   * is_developing flags, this view uses recent,
   * high-importance stories as a clearly labelled
   * recent-signal fallback.
   */
  if (!stories.length) {
    stories =
      developingStories()
        .slice(0, 15);
  }

  if (!stories.length) {
    empty(
      "Nothing is developing right now",
      "No high-signal developing stories are available at the moment."
    );

    renderRail();

    return;
  }

  els.contentView.innerHTML =
    developingTimelineMarkup(
      stories,
      true
    );

  wireStoryActions();
  renderRail();
}


/* ============================================================
   GENERIC CATEGORY VIEW
============================================================ */

function showCategory(
  category
) {
  state.currentView =
    "category";

  state.currentCategory =
    category;

  setActive({
    category
  });

  const stories =
    categoryStories(
      category
    );

  const copy = {
    "India": [
      "INDIA",
      "India",
      "The national developments with the strongest policy, economic and institutional signal."
    ],

    "Indian Politics": [
      "INDIAN POLITICS",
      "Indian Politics",
      "Substantive political and governance developments, without the daily theatre."
    ],

    "Macro Economics": [
      "ECONOMY & POLICY",
      "Economy & Policy",
      "Inflation, rates, fiscal policy, regulation and the forces shaping India's economy."
    ],

    "Business & Micro": [
      "BUSINESS",
      "Business",
      "Companies, sectors and commercial developments that matter beyond a single headline."
    ],

    "Companies & Earnings": [
      "COMPANIES",
      "Companies & Earnings",
      "Material earnings, acquisitions, capital allocation and corporate developments."
    ],

    "Indian Markets": [
      "MARKETS",
      "Indian Markets",
      "The signals moving Indian equities, capital flows, rates and investor positioning."
    ],

    "Global → India": [
      "GLOBAL → INDIA",
      "Global → India",
      "Global rates, commodities, trade and geopolitical forces transmitting into India."
    ],

    "World": [
      "WORLD",
      "World",
      "The most consequential international developments."
    ],

    "Geopolitics": [
      "GEOPOLITICS",
      "Geopolitics",
      "Conflict, diplomacy, sanctions and strategic shifts with wider consequences."
    ],

    "World Politics": [
      "WORLD POLITICS",
      "World Politics",
      "Political and institutional developments shaping major economies."
    ],

    "AI": [
      "ARTIFICIAL INTELLIGENCE",
      "Artificial Intelligence",
      "Models, products, research, policy and the companies shaping the AI landscape."
    ],

    "Technology": [
      "TECHNOLOGY",
      "Technology",
      "Important technology developments beyond the daily product-launch cycle."
    ],

    "Science & Climate": [
      "SCIENCE & CLIMATE",
      "Science & Climate",
      "Research, climate and scientific developments with lasting implications."
    ],

    "The Ken": [
      "THE KEN",
      "The Ken",
      "Recent intelligence from The Ken."
    ]
  };

  const [
    eyebrow,
    title,
    description
  ] =
    copy[category] || [
      String(
        category
      ).toUpperCase(),
      cat(category),
      "Recent developments in this topic."
    ];

  setHeader(
    eyebrow,
    title,
    description
  );

  showSince(false);

  if (!stories.length) {
    empty(
      `No strong ${cat(
        category
      )} signal right now`,
      "Daily Intelligence only shows developments that clear the relevance threshold. This section will fill when stronger stories arrive."
    );

    renderRail();

    return;
  }

  renderStream(
    stories.slice(
      0,
      35
    ),
    {
      title:
        `${stories.length} developments`,
      description:
        "Ranked by importance, confirmation and recency."
    }
  );

  renderRail();
}


/* ============================================================
   STORY STREAM
============================================================ */

function renderStream(
  stories,
  {
    title = "",
    description = ""
  } = {}
) {
  if (!els.contentView) {
    return;
  }

  const lead =
    stories[0];

  const rest =
    stories.slice(1);

  els.contentView.innerHTML = `
    <section
      class="stream-layout"
    >

      ${
        title
          ? `
            <div
              class="stream-heading"
            >
              <div>
                <h2>
                  ${esc(title)}
                </h2>

                ${
                  description
                    ? `
                      <p>
                        ${esc(
                          description
                        )}
                      </p>
                    `
                    : ""
                }
              </div>
            </div>
          `
          : ""
      }

      ${
        lead
          ? `
            <div
              class="stream-lead"
            >
              ${storyMarkup(
                lead,
                "lead"
              )}
            </div>
          `
          : ""
      }

      ${
        rest.length
          ? `
            <div
              class="story-stream"
            >
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
}


/* ============================================================
   MARKETS
============================================================ */

function marketStories() {
  const categories =
    new Set([
      "Indian Markets",
      "Global → India",
      "Companies & Earnings",
      "IPO",
      "Mutual Funds",
      "Macro Economics"
    ]);

  return sortStories(
    state.clusters.filter(
      story =>
        categories.has(
          story?.category
        )
    )
  );
}


function marketSection(
  title,
  stories,
  limit = 6
) {
  const items =
    stories.slice(
      0,
      limit
    );

  if (!items.length) {
    return "";
  }

  return `
    <section
      class="market-section"
    >

      <div
        class="section-heading-row"
      >
        <h2>
          ${esc(title)}
        </h2>
      </div>

      <div
        class="market-story-list"
      >
        ${items
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
    "Indian equities, companies, IPOs, funds and the global forces transmitting into India."
  );

  showSince(false);

  const all =
    marketStories();

  const indian =
    all.filter(
      story =>
        story?.category ===
        "Indian Markets"
    );

  const globalIndia =
    all.filter(
      story =>
        story?.category ===
        "Global → India"
    );

  const companies =
    all.filter(
      story =>
        story?.category ===
        "Companies & Earnings"
    );

  const macro =
    all.filter(
      story =>
        story?.category ===
        "Macro Economics"
    );

  const ipo =
    all.filter(
      story =>
        story?.category ===
        "IPO"
    );

  const funds =
    all.filter(
      story =>
        story?.category ===
        "Mutual Funds"
    );

  if (!all.length) {
    empty(
      "Markets are quiet",
      "No market developments currently clear the intelligence threshold."
    );

    renderRail();

    return;
  }

  const lead =
    all[0];

  els.contentView.innerHTML = `
    <section
      class="markets-layout"
    >

      ${
        lead
          ? `
            <div
              class="markets-lead"
            >
              ${storyMarkup(
                lead,
                "lead"
              )}
            </div>
          `
          : ""
      }

      <div
        class="market-columns"
      >

        ${marketSection(
          "Indian markets",
          indian,
          8
        )}

        ${marketSection(
          "Global → India",
          globalIndia,
          8
        )}

      </div>

      ${marketSection(
        "Companies & earnings",
        companies,
        8
      )}

      ${marketSection(
        "Economy & policy",
        macro,
        6
      )}

      ${marketSection(
        "IPO intelligence",
        ipo,
        8
      )}

      ${marketSection(
        "Mutual funds",
        funds,
        8
      )}

    </section>
  `;

  wireStoryActions();
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
    "Your saved intelligence",
    "Stories you bookmarked for later."
  );

  showSince(false);

  const stories =
    sortStories(
      state.clusters.filter(
        story =>
          saved(story)
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

  renderStream(
    stories,
    {
      title:
        `${stories.length} saved ${
          stories.length === 1
            ? "story"
            : "stories"
        }`,
      description:
        "Your personal reading list."
    }
  );

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
    "Explore intelligence",
    "Move through the topics Daily Intelligence is tracking."
  );

  showSince(false);

  const cards =
    EXPLORE.map(
      category => {
        const stories =
          categoryStories(
            category
          );

        const lead =
          stories[0];

        return `
          <button
            class="explore-card"
            data-explore="${esc(
              category
            )}"
          >

            <div
              class="explore-card-top"
            >
              <span>
                ${esc(
                  cat(category)
                )}
              </span>

              <strong>
                ${stories.length}
              </strong>
            </div>

            ${
              lead
                ? `
                  <h3>
                    ${esc(
                      lead.title
                    )}
                  </h3>

                  <p>
                    ${esc(
                      summary(
                        lead,
                        20
                      )
                    )}
                  </p>
                `
                : `
                  <h3>
                    No major signal
                  </h3>

                  <p>
                    Nothing currently clears the relevance threshold.
                  </p>
                `
            }

            <span
              class="explore-arrow"
            >
              Explore →
            </span>

          </button>
        `;
      }
    ).join("");

  els.contentView.innerHTML = `
    <section
      class="explore-layout"
    >

      <div
        class="explore-grid"
      >
        ${cards}
      </div>

    </section>
  `;

  document
    .querySelectorAll(
      "[data-explore]"
    )
    .forEach(
      button => {
        button.onclick =
          () =>
            showCategory(
              button.dataset
                .explore
            );
      }
    );

  renderRail();
}


/* ============================================================
   SEARCH
============================================================ */

function searchStories(
  query
) {
  const q =
    norm(query);

  if (!q) {
    return [];
  }

  return sortStories(
    state.clusters.filter(
      story => {
        const haystack =
          norm(
            [
              story?.title,
              story?.description,
              story?.brief,
              story?.category,
              publisher(story),
              ...(story?.sources || [])
            ]
              .filter(Boolean)
              .join(" ")
          );

        return haystack.includes(
          q
        );
      }
    )
  );
}


function renderSearchResults(
  query
) {
  state.currentView =
    "search";

  state.currentCategory =
    null;

  setActive({});

  const stories =
    searchStories(
      query
    );

  setHeader(
    "SEARCH",
    query
      ? `Results for “${query}”`
      : "Search intelligence",
    query
      ? `${stories.length} matching developments`
      : "Search across today's clustered intelligence."
  );

  showSince(false);

  if (!query) {
    empty(
      "Search Daily Intelligence",
      "Type a company, policy, country, technology or topic into the search field."
    );

    renderRail();

    return;
  }

  if (!stories.length) {
    empty(
      "No matching intelligence",
      `Nothing in the current intelligence set matches “${query}”.`
    );

    renderRail();

    return;
  }

  renderStream(
    stories.slice(
      0,
      40
    ),
    {
      title:
        `${stories.length} matches`,
      description:
        "Search results from the current intelligence set."
    }
  );

  renderRail();
}


/* ============================================================
   SOURCE SHEET
============================================================ */

function openSources(
  story
) {
  if (!els.sourceSheet) {
    return;
  }

  const articles =
    Array.isArray(
      story?.articles
    ) &&
    story.articles.length
      ? story.articles
      : [
          story?.primary
        ].filter(Boolean);

  els.sheetTitle.textContent =
    story?.title ||
    "Sources";

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
            rel="noopener"
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

            <p>
              ${esc(
                article?.title ||
                story?.title ||
                ""
              )}
            </p>

            <span
              class="source-open"
            >
              Open →
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
}


function closeSources() {
  els.sourceSheet
    ?.classList
    .remove(
      "open"
    );

  els.sourceSheet
    ?.setAttribute(
      "aria-hidden",
      "true"
    );
}


/* ============================================================
   SEARCH PANEL
============================================================ */

function openSearch() {
  els.searchPanel
    ?.classList
    .remove(
      "hidden"
    );

  setTimeout(
    () =>
      els.searchInput
        ?.focus(),
    30
  );
}


function closeSearch() {
  els.searchPanel
    ?.classList
    .add(
      "hidden"
    );
}


/* ============================================================
   SIDEBAR / MOBILE MENU
============================================================ */

function openSidebar() {
  /*
   * Desktop sidebar is fixed.
   * On mobile CSS will hide it completely,
   * leaving the fixed bottom navigation as
   * the sole primary navigation system.
   */
  document.body.classList.add(
    "sidebar-open"
  );

  els.menuOverlay
    ?.setAttribute(
      "aria-hidden",
      "false"
    );
}


function closeSidebar() {
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
   THEME
============================================================ */

function applyTheme(
  theme
) {
  document.documentElement.dataset.theme =
    theme;

  localStorage.setItem(
    "di_theme",
    theme
  );
}


function toggleTheme() {
  const current =
    document.documentElement
      .dataset.theme ||
    "light";

  applyTheme(
    current === "dark"
      ? "light"
      : "dark"
  );
}


/* ============================================================
   CURRENT VIEW
============================================================ */

function renderCurrent() {
  if (
    state.currentView ===
    "brief"
  ) {
    renderBrief();
    return;
  }

  if (
    state.currentView ===
    "since"
  ) {
    renderSince();
    return;
  }

  if (
    state.currentView ===
    "developing"
  ) {
    renderDeveloping();
    return;
  }

  if (
    state.currentView ===
    "markets"
  ) {
    renderMarkets();
    return;
  }

  if (
    state.currentView ===
    "saved"
  ) {
    renderSaved();
    return;
  }

  if (
    state.currentView ===
    "explore"
  ) {
    renderExplore();
    return;
  }

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

  renderBrief();
}
/* ============================================================
   NAVIGATION BINDINGS
============================================================ */

function bindNavigation() {
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

            closeSidebar();

            if (
              view === "brief"
            ) {
              renderBrief();
              return;
            }

            if (
              view === "since"
            ) {
              renderSince();
              return;
            }

            if (
              view === "developing"
            ) {
              renderDeveloping();
              return;
            }

            if (
              view === "markets"
            ) {
              renderMarkets();
              return;
            }

            if (
              view === "saved"
            ) {
              renderSaved();
              return;
            }

            if (
              view === "explore"
            ) {
              renderExplore();
              return;
            }

            renderBrief();
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
              button.dataset
                .category;

            closeSidebar();

            if (category) {
              showCategory(
                category
              );
            }
          }
        );
      }
    );


  document
    .addEventListener(
      "click",
      event => {
        const developing =
          event.target.closest(
            "[data-open-developing]"
          );

        if (developing) {
          renderDeveloping();
        }
      }
    );
}


/* ============================================================
   GENERAL UI BINDINGS
============================================================ */

function bindUI() {
  els.openMenu
    ?.addEventListener(
      "click",
      openSidebar
    );


  els.closeMenu
    ?.addEventListener(
      "click",
      closeSidebar
    );


  els.menuOverlay
    ?.addEventListener(
      "click",
      closeSidebar
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
        const query =
          event.target.value
            .trim();

        if (
          query.length >= 2
        ) {
          renderSearchResults(
            query
          );
        }
      }
    );


  els.searchInput
    ?.addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
          "Enter"
        ) {
          const query =
            event.target.value
              .trim();

          closeSearch();

          renderSearchResults(
            query
          );
        }

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


  document
    .addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
          "Escape"
        ) {
          closeSources();
          closeSearch();
          closeSidebar();
        }
      }
    );
}


/* ============================================================
   HEADER / STATUS
============================================================ */

function renderDateHeader() {
  const now =
    new Date();

  const formatted =
    new Intl.DateTimeFormat(
      "en-IN",
      {
        weekday: "short",
        day: "numeric",
        month: "short"
      }
    ).format(now);

  if (
    els.topbarDate
  ) {
    els.topbarDate.textContent =
      formatted;
  }
}


function renderUpdateStatus() {
  const generated =
    state.data
      ?.generated_at;

  const updateText =
    generated
      ? `Updated ${ago(
          generated
        )}`
      : "Update unavailable";

  if (
    els.lastUpdated
  ) {
    els.lastUpdated.textContent =
      updateText;
  }

  if (
    els.topbarUpdated
  ) {
    els.topbarUpdated.textContent =
      updateText;
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

  const healthyEnough =
    !total ||
    healthy / total >= 0.7;


  if (
    els.healthDot
  ) {
    els.healthDot.classList.toggle(
      "warning",
      !healthyEnough
    );
  }


  if (
    els.sidebarHealthDot
  ) {
    els.sidebarHealthDot
      .classList
      .toggle(
        "warning",
        !healthyEnough
      );
  }


  if (
    els.sidebarStatus
  ) {
    els.sidebarStatus.textContent =
      total
        ? `${healthy}/${total} sources healthy`
        : "Intelligence online";
  }
}


/* ============================================================
   SINCE LAST VISIT PANEL
============================================================ */

function renderSincePanel() {
  if (
    !els.sinceSummary
  ) {
    return;
  }

  if (
    !state.previousVisit
  ) {
    els.sinceSummary.textContent =
      "Your first catch-up will appear on your next visit.";

    return;
  }

  const stories =
    sinceStories();

  if (!stories.length) {
    els.sinceSummary.textContent =
      "You're caught up. No major new developments since your last visit.";

    return;
  }

  const critical =
    stories.filter(
      story =>
        level(story) ===
        "critical"
    ).length;

  const significant =
    stories.filter(
      story =>
        level(story) ===
        "significant"
    ).length;

  const categories =
    [
      ...new Set(
        stories
          .map(
            story =>
              cat(
                story?.category ||
                ""
              )
          )
          .filter(Boolean)
      )
    ]
      .slice(0, 3)
      .join(", ");


  let message =
    `${stories.length} new ${
      stories.length === 1
        ? "development"
        : "developments"
    } since your last visit.`;

  if (critical) {
    message +=
      ` ${critical} ${
        critical === 1
          ? "is"
          : "are"
      } critical.`;
  } else if (significant) {
    message +=
      ` ${significant} ${
        significant === 1
          ? "is"
          : "are"
      } significant.`;
  }

  if (categories) {
    message +=
      ` Most activity: ${categories}.`;
  }

  els.sinceSummary.textContent =
    message;
}


/* ============================================================
   DATA NORMALISATION
============================================================ */

function normalisePayload(
  data
) {
  const clusters =
    Array.isArray(
      data?.clusters
    )
      ? data.clusters
      : [];


  /*
   * V5.4 stores image_url directly on clusters and
   * individual articles. Nothing synthetic is created here.
   */
  state.clusters =
    dedupe(
      clusters
        .filter(
          story =>
            story &&
            story.title
        )
    );


  state.top =
    dedupe(
      briefOf(
        data,
        state.clusters
      )
    );


  state.markets =
    data?.markets &&
    typeof data.markets ===
      "object"
      ? data.markets
      : {};
}


/* ============================================================
   DATA LOAD
============================================================ */

async function loadData() {
  const response =
    await fetch(
      `${DATA_URL}?v=${Date.now()}`,
      {
        cache: "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      `latest.json returned ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !data ||
    typeof data !==
      "object"
  ) {
    throw new Error(
      "latest.json did not contain a valid payload"
    );
  }

  state.data =
    data;

  normalisePayload(
    data
  );
}


/* ============================================================
   ARCHIVES
============================================================ */

async function loadArchives() {
  try {
    const response =
      await fetch(
        `${ARCHIVES_URL}?v=${Date.now()}`,
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      return [];
    }

    return await response.json();

  } catch (error) {
    return [];
  }
}


/* ============================================================
   ERROR STATE
============================================================ */

function renderLoadError(
  error
) {
  console.error(
    "Daily Intelligence failed to load:",
    error
  );

  setHeader(
    "DAILY INTELLIGENCE",
    "We couldn't load today's intelligence",
    "The page loaded, but the latest data could not be read."
  );

  showSince(false);

  if (
    els.contentView
  ) {
    els.contentView.innerHTML = `
      <section
        class="empty-state load-error"
      >

        <div
          class="empty-state-icon"
        >
          !
        </div>

        <h2>
          Intelligence unavailable
        </h2>

        <p>
          The latest data file could not be loaded.
          This is usually temporary.
        </p>

        <button
          class="primary-button"
          id="retryLoad"
        >
          Retry
        </button>

      </section>
    `;

    $("retryLoad")
      ?.addEventListener(
        "click",
        () => {
          window.location.reload();
        }
      );
  }


  if (
    els.sidebarStatus
  ) {
    els.sidebarStatus.textContent =
      "Data unavailable";
  }


  els.healthDot
    ?.classList
    .add(
      "warning"
    );


  els.sidebarHealthDot
    ?.classList
    .add(
      "warning"
    );
}


/* ============================================================
   MOBILE SAFETY
============================================================ */

function enforceMobileNavigation() {
  /*
   * CSS will perform the visual work in the next replacement.
   * This JS safety closes any legacy drawer state whenever
   * the viewport enters mobile width.
   */
  const mobile =
    window.matchMedia(
      "(max-width: 760px)"
    );

  const handle =
    event => {
      if (
        event.matches
      ) {
        closeSidebar();
      }
    };

  handle(mobile);

  if (
    typeof mobile
      .addEventListener ===
    "function"
  ) {
    mobile.addEventListener(
      "change",
      handle
    );
  } else if (
    typeof mobile
      .addListener ===
    "function"
  ) {
    mobile.addListener(
      handle
    );
  }
}


/* ============================================================
   IMAGE FAILURE SAFETY
============================================================ */

function bindImageSafety() {
  document
    .addEventListener(
      "error",
      event => {
        const image =
          event.target;

        if (
          !image ||
          image.tagName !==
            "IMG" ||
          !image.closest(
            ".story-visual"
          )
        ) {
          return;
        }

        const wrapper =
          image.closest(
            ".story-visual"
          );

        wrapper?.classList.add(
          "image-failed"
        );
      },
      true
    );
}


/* ============================================================
   BOOT
============================================================ */

async function boot() {
  /*
   * Theme first so we do not flash the wrong theme.
   */
  applyTheme(
    localStorage.getItem(
      "di_theme"
    ) ||
    "light"
  );


  renderDateHeader();

  bindNavigation();
  bindUI();
  bindImageSafety();
  enforceMobileNavigation();


  try {
    await loadData();

    renderUpdateStatus();
    renderSincePanel();

    /*
     * Brief is always the default landing view.
     */
    renderBrief();


    /*
     * Archives are intentionally non-blocking.
     * They can be used by a future archive view
     * without delaying today's intelligence.
     */
    loadArchives()
      .then(
        archives => {
          state.archives =
            Array.isArray(
              archives
            )
              ? archives
              : [];
        }
      )
      .catch(
        () => {
          state.archives = [];
        }
      );


    /*
     * Store this visit only after today's data has loaded.
     * previousVisit remains the value captured before boot.
     */
    localStorage.setItem(
      "di_last_visit",
      state.currentVisit
    );


    document.body.classList.add(
      "app-ready"
    );


    document.dispatchEvent(
      new CustomEvent(
        "daily-intelligence-ready",
        {
          detail: {
            version:
              state.data
                ?.version ||
              null,

            clusters:
              state.clusters
                .length,

            brief:
              displayBrief()
                .length
          }
        }
      )
    );

  } catch (error) {
    renderLoadError(
      error
    );

    document.body.classList.add(
      "app-ready"
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
