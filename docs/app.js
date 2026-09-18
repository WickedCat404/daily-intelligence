const DATA_URL="./data/latest.json",ARCHIVES_URL="./data/archives.json";

const state={
  data:null,
  clusters:[],
  top:[],
  markets:{},
  currentView:"brief",
  currentCategory:null,
  saved:new Set(JSON.parse(localStorage.getItem("di_saved")||"[]")),
  previousVisit:localStorage.getItem("di_last_visit"),
  currentVisit:new Date().toISOString()
};

const $=id=>document.getElementById(id);

const els={
  menuOverlay:$("menuOverlay"),
  openMenu:$("openMenu"),
  closeMenu:$("closeMenu"),
  searchButton:$("searchButton"),
  desktopSearchTrigger:$("desktopSearchTrigger"),
  searchPanel:$("searchPanel"),
  searchInput:$("searchInput"),
  closeSearch:$("closeSearch"),
  themeButton:$("themeButton"),
  sidebarThemeButton:$("sidebarThemeButton"),
  todayDate:$("todayDate"),
  topbarDate:$("topbarDate"),
  topbarUpdated:$("topbarUpdated"),
  pageTitle:$("pageTitle"),
  pageDescription:$("pageDescription"),
  lastUpdated:$("lastUpdated"),
  sidebarHealthDot:$("sidebarHealthDot"),
  healthDot:$("healthDot"),
  sidebarStatus:$("sidebarStatus"),
  sinceLastPanel:$("sinceLastPanel"),
  sinceSummary:$("sinceSummary"),
  viewSinceButton:$("viewSinceButton"),
  contentView:$("contentView"),
  contextRail:$("contextRail"),
  glanceGrid:$("glanceGrid"),
  changedSummary:$("changedSummary"),
  contextSinceButton:$("contextSinceButton"),
  topicChips:$("topicChips"),
  sourceSheet:$("sourceSheet"),
  sheetBackdrop:$("sheetBackdrop"),
  closeSheet:$("closeSheet"),
  sheetTitle:$("sheetTitle"),
  sheetSources:$("sheetSources")
};

function esc(v=""){
  return String(v)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function clean(v=""){
  const d=document.createElement("div");
  d.innerHTML=v;
  return(d.textContent||d.innerText||"")
    .replace(/\s+/g," ")
    .trim();
}

function trunc(v,n=55){
  const w=clean(v).split(/\s+/).filter(Boolean);
  return w.length<=n?w.join(" "):w.slice(0,n).join(" ")+"…";
}

function date(v){
  if(!v)return null;
  const d=new Date(v);
  return Number.isNaN(d.getTime())?null:d;
}

function ago(v){
  const d=date(v);
  if(!d)return"";

  const s=Math.max(0,(Date.now()-d)/1000);

  if(s<60)return"just now";

  const m=Math.floor(s/60);
  if(m<60)return`${m}m ago`;

  const h=Math.floor(m/60);
  if(h<24)return`${h}h ago`;

  const x=Math.floor(h/24);
  return x===1?"yesterday":`${x}d ago`;
}

function stamp(s){
  return s.published_at||
    s.primary?.published_at||
    s.articles?.[0]?.published_at||
    "";
}

function key(s){
  return s.cluster_key||s.url||s.title;
}

function url(s){
  return s.primary?.url||
    s.articles?.[0]?.url||
    s.url||
    "#";
}

function publisher(s){
  return s.primary?.source||
    s.sources?.[0]||
    "Source";
}

function sourceCount(s){
  return Number(s.source_count)||
    (Array.isArray(s.sources)?s.sources.length:0)||
    (Array.isArray(s.articles)?s.articles.length:0)||
    1;
}

function summary(s,n=55){
  return trunc(
    s.brief||
    s.description||
    s.primary?.description||
    "",
    n
  );
}

function cat(c){
  return({
    "Macro Economics":"Economy & Policy",
    "Business & Micro":"Business",
    "Companies & Earnings":"Companies"
  }[c]||c);
}

function norm(v=""){
  return String(v)
    .toLowerCase()
    .replace(/&/g,"and")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

const CATEGORY_ALIASES={
  "Indian Politics":[
    "indian politics",
    "india politics",
    "politics india",
    "national politics",
    "politics"
  ],
  "Macro Economics":[
    "macro economics",
    "economy policy",
    "economy and policy",
    "indian economy",
    "economy"
  ],
  "Business & Micro":[
    "business micro",
    "business and micro",
    "business",
    "companies earnings",
    "corporate india"
  ],
  "Indian Markets":[
    "indian markets",
    "markets india",
    "markets"
  ],
  "World Politics":[
    "world politics",
    "global politics",
    "international politics"
  ],
  "Science & Climate":[
    "science climate",
    "science and climate",
    "climate science"
  ]
};

function matchesCategory(s,wanted){
  const actual=norm(s.category||"");
  const targets=(CATEGORY_ALIASES[wanted]||[wanted]).map(norm);

  if(targets.includes(actual))return true;

  if(wanted==="Indian Politics"){
    const text=norm(`${s.title||""} ${s.description||""}`);

    return(
      (actual==="india"||actual==="politics")&&
      /\b(parliament|lok sabha|rajya sabha|bjp|congress|election|minister|government|opposition|cabinet|political)\b/.test(text)
    );
  }

  return false;
}

function dedupe(a=[]){
  const seen=new Set();

  return a.filter(s=>{
    const k=key(s);

    if(!k||seen.has(k))return false;

    seen.add(k);
    return true;
  });
}

function sort(a=[]){
  return[...a].sort((x,y)=>
    (Number(y.importance||0)-Number(x.importance||0))||
    (
      (date(stamp(y))?.getTime()||0)-
      (date(stamp(x))?.getTime()||0)
    )
  );
}

function level(s){
  const l=String(s.importance_label||"").toLowerCase();

  if(["critical","significant","noteworthy"].includes(l)){
    return l;
  }

  const n=Number(s.importance||0);

  return n>=60
    ?"critical"
    :n>=43
      ?"significant"
      :"noteworthy";
}

function fresh(s){
  const a=date(stamp(s));
  const b=date(state.previousVisit);

  return!!(a&&b&&a>b);
}

function saved(s){
  return state.saved.has(key(s));
}

function toggleSaved(s){
  const k=key(s);

  state.saved.has(k)
    ?state.saved.delete(k)
    :state.saved.add(k);

  localStorage.setItem(
    "di_saved",
    JSON.stringify([...state.saved])
  );

  renderCurrent();
}

function setHeader(t,d){
  els.pageTitle.textContent=t;
  els.pageDescription.textContent=d;
}

function showSince(v=true){
  els.sinceLastPanel?.classList.toggle("hidden",!v);
}

function setActive({view=null,category=null}={}){
  document
    .querySelectorAll(".nav-item,.mobile-nav-item")
    .forEach(b=>{
      b.classList.remove("active");

      if(view&&b.dataset.view===view){
        b.classList.add("active");
      }

      if(category&&b.dataset.category===category){
        b.classList.add("active");
      }
    });
}

function meta(s){
  return`
    <div class="story-meta">
      <span>${esc(publisher(s))}</span>
      <span>·</span>
      <span>
        ${sourceCount(s)}
        ${sourceCount(s)===1?"source":"sources"}
      </span>
      <span>·</span>
      <span>${esc(ago(stamp(s)))}</span>
    </div>
  `;
}

function why(s){
  const v=
    s.why_it_matters||
    s.market_impact||
    s.context||
    "";

  return v
    ?`
      <div class="why-matters">
        <strong>Why it matters:</strong>
        ${esc(trunc(v,38))}
      </div>
    `
    :"";
}

function actions(s,id){
  return`
    <div class="story-actions">

      <button
        class="story-action"
        data-source="${esc(id)}"
      >
        ${
          sourceCount(s)>1
            ?`View ${sourceCount(s)} sources`
            :"View source"
        }
      </button>

      <a
        class="story-action"
        href="${esc(url(s))}"
        target="_blank"
        rel="noopener"
      >
        Read ${esc(publisher(s))} →
      </a>

      <button
        class="story-action save-button ${saved(s)?"saved":""}"
        data-save="${esc(id)}"
      >
        ${saved(s)?"Saved":"Save"}
      </button>

    </div>
  `;
}

function storyMarkup(s,kind="normal"){
  const id=encodeURIComponent(key(s));

  return`
    <article class="${
      kind==="lead"
        ?"lead-story"
        :kind==="secondary"
          ?"secondary-story"
          :"story-card"
    }">

      <div class="story-topline">

        <span class="importance-label ${level(s)}">
          ${esc(level(s))}
        </span>

        <span class="category-label">
          ${esc(cat(s.category||"News"))}
        </span>

        ${
          fresh(s)
            ?'<span class="story-state">NEW</span>'
            :""
        }

      </div>

      <h3 class="story-title">
        ${esc(s.title||"")}
      </h3>

      ${
        summary(
          s,
          kind==="lead"
            ?62
            :kind==="secondary"
              ?32
              :48
        )
          ?`
            <p class="story-summary">
              ${esc(summary(
                s,
                kind==="lead"
                  ?62
                  :kind==="secondary"
                    ?32
                    :48
              ))}
            </p>
          `
          :""
      }

      ${kind==="lead"?why(s):""}

      ${meta(s)}

      ${actions(s,id)}

    </article>
  `;
}

function wireStoryActions(){

  document
    .querySelectorAll("[data-source]")
    .forEach(b=>{

      b.onclick=()=>{

        const s=
          state.clusters.find(
            x=>encodeURIComponent(key(x))===b.dataset.source
          )||
          state.top.find(
            x=>encodeURIComponent(key(x))===b.dataset.source
          );

        if(s)openSources(s);
      };

    });

  document
    .querySelectorAll("[data-save]")
    .forEach(b=>{

      b.onclick=()=>{

        const s=
          state.clusters.find(
            x=>encodeURIComponent(key(x))===b.dataset.save
          )||
          state.top.find(
            x=>encodeURIComponent(key(x))===b.dataset.save
          );

        if(s)toggleSaved(s);
      };

    });
}

function empty(title,desc){

  els.contentView.innerHTML=`
    <section class="empty-state">

      <div class="empty-state-icon">◇</div>

      <h2>${esc(title)}</h2>

      <p>${esc(desc)}</p>

      <button
        class="primary-button"
        id="emptyHome"
      >
        Back to The Brief
      </button>

    </section>
  `;

  $("emptyHome").onclick=renderBrief;
}

const EXPLORE=[
  "India",
  "Indian Politics",
  "Macro Economics",
  "Business & Micro",
  "World",
  "Geopolitics",
  "AI",
  "Technology"
];

function categoryStories(c){
  return sort(
    state.clusters.filter(
      s=>matchesCategory(s,c)
    )
  );
}

function renderRail(){

  if(!els.glanceGrid)return;

  els.glanceGrid.innerHTML=`
    <div class="glance-item">
      <div class="glance-value">
        ${state.top.length||Math.min(8,state.clusters.length)}
      </div>
      <div class="glance-name">must know</div>
    </div>

    <div class="glance-item">
      <div class="glance-value">
        ${state.clusters.filter(s=>s.is_developing).length}
      </div>
      <div class="glance-name">developing</div>
    </div>

    <div class="glance-item">
      <div class="glance-value">
        ${state.data?.article_count||0}
      </div>
      <div class="glance-name">articles scanned</div>
    </div>

    <div class="glance-item">
      <div class="glance-value">
        ${state.clusters.length}
      </div>
      <div class="glance-name">events clustered</div>
    </div>
  `;

  const f=
    state.previousVisit
      ?state.clusters.filter(fresh)
      :[];

  els.changedSummary.textContent=
    state.previousVisit
      ?(
        f.length
          ?`${Math.min(f.length,12)} developments are worth catching up on.`
          :"You're caught up."
      )
      :"Your catch-up starts on your next visit.";

  els.topicChips.innerHTML=
    EXPLORE
      .slice(0,6)
      .map(c=>`
        <button
          class="topic-chip"
          data-chip="${esc(c)}"
        >
          ${esc(cat(c))}
        </button>
      `)
      .join("");

  document
    .querySelectorAll("[data-chip]")
    .forEach(
      b=>b.onclick=()=>showCategory(b.dataset.chip)
    );
}

function renderBrief(){

  state.currentView="brief";
  state.currentCategory=null;

  closeMenu();

  setActive({view:"brief"});

  setHeader(
    "The Brief",
    "What matters today, without the noise."
  );

  showSince(true);

  const stories=
    dedupe(
      state.top.length
        ?state.top
        :sort(state.clusters)
    ).slice(0,8);

  if(!stories.length){
    return empty(
      "No major developments right now.",
      "The briefing is deliberately quiet when the signal is weak."
    );
  }

  const lead=stories[0];
  const second=stories.slice(1,3);
  const more=stories.slice(3);

  const dev=
    sort(
      state.clusters.filter(
        s=>s.is_developing
      )
    ).slice(0,4);

  els.contentView.innerHTML=`
    <section class="content-section">

      <div class="section-heading">

        <div>
          <div class="section-kicker">
            TODAY'S SIGNAL
          </div>

          <h2>
            What deserves your attention
          </h2>
        </div>

        <span class="section-count">
          ${stories.length}
        </span>

      </div>

      ${storyMarkup(lead,"lead")}

      <div class="secondary-grid">
        ${
          second
            .map(s=>storyMarkup(s,"secondary"))
            .join("")
        }
      </div>

      ${
        more.length
          ?`
            <div class="brief-more">

              <div class="section-kicker">
                ALSO WORTH KNOWING
              </div>

              ${
                more.map(s=>`
                  <div class="compact-row">

                    <span class="compact-category">
                      ${esc(cat(s.category||"News"))}
                    </span>

                    <a
                      class="compact-title"
                      href="${esc(url(s))}"
                      target="_blank"
                      rel="noopener"
                    >
                      ${esc(s.title||"")}
                    </a>

                    <span class="compact-time">
                      ${esc(ago(stamp(s)))}
                    </span>

                  </div>
                `).join("")
              }

            </div>
          `
          :""
      }

    </section>

    ${
      dev.length
        ?`
          <section class="content-section">

            <div class="section-heading">

              <div>
                <div class="section-kicker">
                  DEVELOPING NOW
                </div>

                <h2>
                  Stories still moving
                </h2>
              </div>

              <button
                class="quiet-button"
                id="allDeveloping"
              >
                View all →
              </button>

            </div>

            <div class="developing-list">

              ${
                dev.map(s=>`
                  <article
                    class="developing-card"
                    data-dev="${encodeURIComponent(key(s))}"
                  >

                    <div class="developing-meta">
                      ${esc(cat(s.category||"News"))}
                      ·
                      ${esc(ago(stamp(s)))}
                    </div>

                    <h3>
                      ${esc(s.title||"")}
                    </h3>

                  </article>
                `).join("")
              }

            </div>

          </section>
        `
        :""
    }

    <section class="content-section">

      <div class="section-heading">

        <div>
          <div class="section-kicker">
            GO DEEPER
          </div>

          <h2>
            Explore by topic
          </h2>
        </div>

      </div>

      <div class="category-grid">

        ${
          EXPLORE.map(c=>`
            <button
              class="category-card"
              data-explore="${esc(c)}"
            >

              <div class="category-card-name">
                ${esc(cat(c))}
              </div>

              <div class="category-card-count">
                ${categoryStories(c).length}
                developments →
              </div>

            </button>
          `).join("")
        }

      </div>

    </section>
  `;

  wireStoryActions();

  if($("allDeveloping")){
    $("allDeveloping").onclick=renderDeveloping;
  }

  document
    .querySelectorAll("[data-dev]")
    .forEach(b=>{

      b.onclick=()=>{

        const s=
          state.clusters.find(
            x=>encodeURIComponent(key(x))===b.dataset.dev
          );

        if(s)openSources(s);
      };

    });

  document
    .querySelectorAll("[data-explore]")
    .forEach(
      b=>b.onclick=()=>showCategory(b.dataset.explore)
    );
}

function showCategory(c){

  if(c==="Indian Markets"){
    return renderMarkets();
  }

  state.currentView="category";
  state.currentCategory=c;

  closeMenu();

  setActive({category:c});

  setHeader(
    cat(c),
    `Significant developments in ${cat(c)}.`
  );

  showSince(true);

  const a=categoryStories(c);

  if(!a.length){
    return empty(
      `No significant ${cat(c).toLowerCase()} development right now.`,
      "Nothing currently clears the briefing threshold for this topic. The page will populate automatically when qualifying stories arrive."
    );
  }

  els.contentView.innerHTML=`
    <section class="content-section">

      <div class="view-header">

        <div class="section-kicker">
          DAILY INTELLIGENCE
        </div>

        <h2>
          ${esc(cat(c))}
        </h2>

        <p>
          ${a.length} developments
        </p>

      </div>

      <div class="story-list">
        ${a.map(s=>storyMarkup(s)).join("")}
      </div>

    </section>
  `;

  wireStoryActions();
}

function renderSince(){

  state.currentView="since";
  state.currentCategory=null;

  closeMenu();

  setActive({view:"since"});

  setHeader(
    "Since Last Check",
    "The developments worth catching up on since your previous visit."
  );

  showSince(false);

  if(!state.previousVisit){
    return empty(
      "Your catch-up starts after this visit.",
      "When you return, this view will surface the most consequential developments published in between."
    );
  }

  const all=
    sort(
      state.clusters.filter(fresh)
    );

  const a=all.slice(0,12);

  if(!a.length){
    return empty(
      "You're caught up.",
      "No new developments have cleared the briefing threshold since your last visit."
    );
  }

  els.contentView.innerHTML=`
    <section class="content-section">

      <div class="view-header">

        <div class="section-kicker">
          YOUR CATCH-UP
        </div>

        <h2>
          ${a.length} developments worth catching up on
        </h2>

        <p>
          ${all.length} total new developments detected.
          Showing the highest-priority ${a.length}.
        </p>

      </div>

      <div class="story-list">
        ${a.map(s=>storyMarkup(s)).join("")}
      </div>

    </section>
  `;

  wireStoryActions();
}

function renderDeveloping(){

  state.currentView="developing";
  state.currentCategory=null;

  closeMenu();

  setActive({view:"developing"});

  setHeader(
    "Developing",
    "Stories still receiving material new information."
  );

  showSince(false);

  const a=
    sort(
      state.clusters.filter(
        s=>s.is_developing
      )
    );

  if(!a.length){
    return empty(
      "Nothing material is actively developing.",
      "When a story begins receiving consequential new information, it will move here."
    );
  }

  els.contentView.innerHTML=`
    <section class="content-section">

      <div class="view-header">

        <div class="section-kicker">
          LIVE WATCH
        </div>

        <h2>
          ${a.length} stories still moving
        </h2>

        <p>
          Prioritised by significance and recency.
        </p>

      </div>

      <div class="story-list">
        ${a.map(s=>storyMarkup(s)).join("")}
      </div>

    </section>
  `;

  wireStoryActions();
}

function marketSet(cats){
  return sort(
    state.clusters.filter(
      s=>cats.some(
        c=>matchesCategory(s,c)
      )
    )
  );
}

function marketItem(s){
  return`
    <article class="market-item">

      <div class="story-topline">
        <span class="category-label">
          ${esc(cat(s.category||"Markets"))}
        </span>
      </div>

      <h3>
        <a
          href="${esc(url(s))}"
          target="_blank"
          rel="noopener"
        >
          ${esc(s.title||"")}
        </a>
      </h3>

      ${
        summary(s,30)
          ?`
            <p>
              ${esc(summary(s,30))}
            </p>
          `
          :""
      }

      ${meta(s)}

    </article>
  `;
}

function renderMarkets(){

  state.currentView="markets";
  state.currentCategory=null;

  closeMenu();

  setActive({view:"markets"});

  setHeader(
    "Markets",
    "Indian markets, companies and investing — without the trading noise."
  );

  showSince(true);

  const india=
    marketSet([
      "Indian Markets",
      "Macro Economics"
    ]);

  const companies=
    marketSet([
      "Business & Micro"
    ]);

  const global=
    sort(
      state.clusters.filter(
        s=>
          norm(s.category)==="global india"||
          s.category==="Global → India"
      )
    );

  const all=
    dedupe(
      sort([
        ...india,
        ...companies,
        ...global
      ])
    );

  const lead=all[0];
  const side=all.slice(1,3);

  if(!lead){
    return empty(
      "No material market development right now.",
      "Routine price movement is deliberately filtered out. Material market, corporate and investing developments will appear here."
    );
  }

  const ipos=[
    ...(state.markets.ipo_open||[]),
    ...(state.markets.ipo_upcoming||[]),
    ...(state.markets.ipo_recent||[])
  ].slice(0,6);

  const mf=
    dedupe(
      state.markets.mutual_fund_news||
      state.clusters.filter(
        s=>
          /mutual fund|amfi|\bsip\b/i.test(
            `${s.title||""} ${s.description||""}`
          )
      )
    ).slice(0,4);

  els.contentView.innerHTML=`
    <div class="markets-dashboard">

      <section class="market-pulse-strip">

        <div class="pulse-card">
          <div class="pulse-label">
            Market signal
          </div>
          <div class="pulse-value">
            ${india.length} India
          </div>
        </div>

        <div class="pulse-card">
          <div class="pulse-label">
            Corporate
          </div>
          <div class="pulse-value">
            ${companies.length} stories
          </div>
        </div>

        <div class="pulse-card">
          <div class="pulse-label">
            Global → India
          </div>
          <div class="pulse-value">
            ${global.length} links
          </div>
        </div>

        <div class="pulse-card">
          <div class="pulse-label">
            IPO watch
          </div>
          <div class="pulse-value">
            ${ipos.length} tracked
          </div>
        </div>

      </section>

      <section class="market-hero">

        <article class="market-lead-card">

          <div class="story-topline">

            <span class="importance-label ${level(lead)}">
              ${esc(level(lead))}
            </span>

            <span class="category-label">
              ${esc(cat(lead.category||"Markets"))}
            </span>

          </div>

          <h2>
            ${esc(lead.title||"")}
          </h2>

          <p class="story-summary">
            ${esc(summary(lead,62))}
          </p>

          ${why(lead)}

          ${meta(lead)}

          ${actions(
            lead,
            encodeURIComponent(key(lead))
          )}

        </article>

        <div class="market-side-stack">

          ${
            side.map(s=>`
              <article class="market-mini">

                <div class="section-kicker">
                  ${esc(cat(s.category||"Markets"))}
                </div>

                <h3>
                  <a
                    href="${esc(url(s))}"
                    target="_blank"
                    rel="noopener"
                  >
                    ${esc(s.title||"")}
                  </a>
                </h3>

                ${meta(s)}

              </article>
            `).join("")
          }

        </div>

      </section>

      ${
        india.slice(1,7).length
          ?`
            <section class="market-module">

              <div class="market-module-head">

                <div>
                  <div class="section-kicker">
                    INDIA TODAY
                  </div>

                  <h2>
                    Market & policy intelligence
                  </h2>
                </div>

              </div>

              <div class="market-module-grid">
                ${
                  india
                    .slice(1,7)
                    .map(marketItem)
                    .join("")
                }
              </div>

            </section>
          `
          :""
      }

      ${
        global.length
          ?`
            <section class="market-module">

              <div class="market-module-head">

                <div>
                  <div class="section-kicker">
                    TRANSMISSION WATCH
                  </div>

                  <h2>
                    Global → India
                  </h2>
                </div>

              </div>

              <div class="market-module-grid">
                ${
                  global
                    .slice(0,4)
                    .map(marketItem)
                    .join("")
                }
              </div>

            </section>
          `
          :""
      }

      ${
        companies.length
          ?`
            <section class="market-module">

              <div class="market-module-head">

                <div>
                  <div class="section-kicker">
                    CORPORATE INDIA
                  </div>

                  <h2>
                    Companies
                  </h2>
                </div>

              </div>

              <div class="market-module-grid">
                ${
                  companies
                    .slice(0,6)
                    .map(marketItem)
                    .join("")
                }
              </div>

            </section>
          `
          :""
      }

      ${
        ipos.length
          ?`
            <section class="market-module">

              <div class="market-module-head">

                <div>
                  <div class="section-kicker">
                    PRIMARY MARKET
                  </div>

                  <h2>
                    IPO watch
                  </h2>
                </div>

              </div>

              <div class="ipo-grid">

                ${
                  ipos.map(i=>`
                    <article class="ipo-card">

                      <div class="section-kicker">
                        ${esc(i.status||"IPO")}
                      </div>

                      <h3>
                        ${
                          i.url
                            ?`
                              <a
                                href="${esc(i.url)}"
                                target="_blank"
                                rel="noopener"
                              >
                                ${esc(i.name||"")}
                              </a>
                            `
                            :esc(i.name||"")
                        }
                      </h3>

                      <div class="ipo-facts">

                        ${
                          [
                            i.price_band,
                            i.issue_size,
                            i.lot_size
                              ?`Lot ${i.lot_size}`
                              :null,
                            i.close_date
                              ?`Closes ${i.close_date}`
                              :null
                          ]
                          .filter(Boolean)
                          .map(
                            x=>`
                              <span class="ipo-fact">
                                ${esc(x)}
                              </span>
                            `
                          )
                          .join("")
                        }

                      </div>

                    </article>
                  `).join("")
                }

              </div>

            </section>
          `
          :""
      }

      ${
        mf.length
          ?`
            <section class="market-module">

              <div class="market-module-head">

                <div>
                  <div class="section-kicker">
                    HOUSEHOLD INVESTING
                  </div>

                  <h2>
                    Mutual funds
                  </h2>
                </div>

              </div>

              <div class="market-module-grid">
                ${mf.map(marketItem).join("")}
              </div>

            </section>
          `
          :""
      }

    </div>
  `;

  wireStoryActions();
}

function renderExplore(){

  state.currentView="explore";
  state.currentCategory=null;

  closeMenu();

  setActive({view:"explore"});

  setHeader(
    "Explore",
    "Move through today's intelligence by topic."
  );

  showSince(false);

  const a=[
    ...EXPLORE,
    "World Politics",
    "Science & Climate",
    "The Ken"
  ];

  els.contentView.innerHTML=`
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

        ${
          a.map(c=>`
            <button
              class="category-card"
              data-explore="${esc(c)}"
            >

              <div class="category-card-name">
                ${esc(cat(c))}
              </div>

              <div class="category-card-count">
                ${categoryStories(c).length}
                developments →
              </div>

            </button>
          `).join("")
        }

      </div>

    </section>
  `;

  document
    .querySelectorAll("[data-explore]")
    .forEach(
      b=>b.onclick=()=>showCategory(b.dataset.explore)
    );
}

function renderSaved(){

  state.currentView="saved";
  state.currentCategory=null;

  closeMenu();

  setActive({view:"saved"});

  setHeader(
    "Saved",
    "Stories you've kept for later."
  );

  showSince(false);

  const a=
    state.clusters.filter(saved);

  if(!a.length){
    return empty(
      "Nothing saved yet.",
      "Save a development when you want to return to it later."
    );
  }

  els.contentView.innerHTML=`
    <section class="content-section">

      <div class="view-header">

        <div class="section-kicker">
          YOUR READING LIST
        </div>

        <h2>
          Saved
        </h2>

        <p>
          ${a.length} stories
        </p>

      </div>

      <div class="story-list">
        ${a.map(s=>storyMarkup(s)).join("")}
      </div>

    </section>
  `;

  wireStoryActions();
}

function renderSources(){

  state.currentView="sources";

  closeMenu();

  setActive({view:"sources"});

  setHeader(
    "Sources",
    "The feeds powering today's briefing."
  );

  showSince(false);

  const a=state.data?.sources||[];

  if(!a.length){
    return empty(
      "Source information isn't available.",
      "The current briefing did not include a source-health list."
    );
  }

  els.contentView.innerHTML=`
    <section class="content-section">

      <div class="view-header">

        <div class="section-kicker">
          SOURCE HEALTH
        </div>

        <h2>
          ${a.filter(x=>x.ok).length}
          of
          ${a.length}
          sources healthy
        </h2>

        <p>
          Feed availability, not an editorial rating.
        </p>

      </div>

      <div class="category-grid">

        ${
          a.map(x=>`
            <div class="category-card">

              <span
                class="status-dot ${x.ok?"healthy":"unhealthy"}"
              ></span>

              <div
                class="category-card-name"
                style="margin-top:10px"
              >
                ${esc(x.name||x.source||"Source")}
              </div>

              <div class="category-card-count">
                ${
                  x.ok
                    ?"Feed healthy"
                    :"Feed unavailable"
                }
              </div>

            </div>
          `).join("")
        }

      </div>

    </section>
  `;
}

async function renderArchives(){

  state.currentView="archives";

  closeMenu();

  setActive({view:"archives"});

  setHeader(
    "Archives",
    "Previous Daily Intelligence briefings."
  );

  showSince(false);

  els.contentView.innerHTML=
    '<div class="loading-card">Loading archives…</div>';

  try{

    const r=
      await fetch(
        `${ARCHIVES_URL}?v=${Date.now()}`,
        {cache:"no-store"}
      );

    if(!r.ok)throw 0;

    const d=await r.json();

    const a=
      Array.isArray(d)
        ?d
        :(d.archives||d.items||[]);

    if(!a.length){
      return empty(
        "No archived briefings yet.",
        "Previous editions will appear here as the archive grows."
      );
    }

    els.contentView.innerHTML=`
      <section class="content-section">

        <div class="view-header">

          <div class="section-kicker">
            PREVIOUS EDITIONS
          </div>

          <h2>
            Archives
          </h2>

          <p>
            ${a.length} editions
          </p>

        </div>

        <div class="category-grid">

          ${
            a.map(x=>`
              <div class="category-card">

                <div class="category-card-name">
                  ${
                    esc(
                      x.date||
                      x.generated_at||
                      x.title||
                      "Briefing"
                    )
                  }
                </div>

                <div class="category-card-count">
                  ${
                    x.cluster_count??
                    x.story_count??
                    ""
                  }
                  stories
                </div>

              </div>
            `).join("")
          }

        </div>

      </section>
    `;

  }catch{

    empty(
      "Archives couldn't load.",
      "Today's briefing is unaffected."
    );
  }
}

function openSources(s){

  const a=
    Array.isArray(s.articles)&&s.articles.length
      ?s.articles
      :[
        {
          source:publisher(s),
          title:s.title,
          url:url(s),
          published_at:stamp(s)
        }
      ];

  els.sheetTitle.textContent=
    s.title||"Coverage";

  els.sheetSources.innerHTML=
    a.map(x=>`
      <a
        class="sheet-source"
        href="${esc(x.url||"#")}"
        target="_blank"
        rel="noopener"
      >

        <div class="sheet-source-name">
          ${esc(x.source||"Source")}
        </div>

        <div class="sheet-source-title">
          ${esc(x.title||s.title||"")}
        </div>

        <div class="sheet-source-time">
          ${esc(ago(x.published_at))}
        </div>

      </a>
    `).join("");

  els.sourceSheet.classList.remove("hidden");

  els.sourceSheet.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.style.overflow="hidden";
}

function closeSources(){

  els.sourceSheet.classList.add("hidden");

  els.sourceSheet.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.style.overflow="";
}

function openMenu(){
  document.body.classList.add("menu-open");

  els.openMenu?.setAttribute(
    "aria-expanded",
    "true"
  );
}

function closeMenu(){
  document.body.classList.remove("menu-open");

  els.openMenu?.setAttribute(
    "aria-expanded",
    "false"
  );
}

function applyTheme(){

  const t=
    localStorage.getItem("di_theme")||
    (
      matchMedia("(prefers-color-scheme: dark)").matches
        ?"dark"
        :"light"
    );

  document.documentElement.setAttribute(
    "data-theme",
    t
  );
}

function toggleTheme(){

  const n=
    document.documentElement.getAttribute("data-theme")==="dark"
      ?"light"
      :"dark";

  document.documentElement.setAttribute(
    "data-theme",
    n
  );

  localStorage.setItem(
    "di_theme",
    n
  );
}

function openSearch(){

  els.searchPanel.classList.remove("hidden");

  setTimeout(
    ()=>els.searchInput.focus(),
    20
  );
}

function closeSearch(restore=false){

  els.searchPanel.classList.add("hidden");

  if(restore){
    els.searchInput.value="";
    renderBrief();
  }
}

function search(q){

  q=q.trim().toLowerCase();

  if(!q){
    return renderBrief();
  }

  state.currentView="search";

  setActive();

  setHeader(
    "Search",
    `Results for “${q}”.`
  );

  showSince(false);

  const a=
    sort(
      state.clusters.filter(s=>
        [
          s.title,
          s.description,
          s.brief,
          s.category,
          s.market_impact,
          ...(s.sources||[])
        ]
        .join(" ")
        .toLowerCase()
        .includes(q)
      )
    );

  if(!a.length){
    return empty(
      `No results for “${q}”.`,
      "Try a broader topic, company, person or country."
    );
  }

  els.contentView.innerHTML=`
    <section class="content-section">

      <div class="view-header">

        <div class="section-kicker">
          SEARCH
        </div>

        <h2>
          Results for “${esc(q)}”
        </h2>

        <p>
          ${a.length} results
        </p>

      </div>

      <div class="story-list">
        ${a.map(s=>storyMarkup(s)).join("")}
      </div>

    </section>
  `;

  wireStoryActions();
}

function navigate(b){

  const c=b.dataset.category;
  const v=b.dataset.view;

  if(c){
    return showCategory(c);
  }

  (
    {
      brief:renderBrief,
      since:renderSince,
      developing:renderDeveloping,
      markets:renderMarkets,
      explore:renderExplore,
      saved:renderSaved,
      archives:renderArchives,
      sources:renderSources
    }[v]||
    renderBrief
  )();
}

function renderCurrent(){

  (
    {
      brief:renderBrief,
      since:renderSince,
      developing:renderDeveloping,
      markets:renderMarkets,
      explore:renderExplore,
      saved:renderSaved,
      sources:renderSources,
      archives:renderArchives,
      category:()=>showCategory(
        state.currentCategory
      ),
      search:()=>search(
        els.searchInput.value
      )
    }[state.currentView]||
    renderBrief
  )();
}

function health(d){

  const a=d.sources||[];

  const h=
    a.filter(x=>x.ok).length;

  const r=
    a.length
      ?h/a.length
      :0;

  const c=
    r>=.85
      ?"healthy"
      :r>=.6
        ?"partial"
        :"unhealthy";

  els.sidebarStatus.textContent=
    a.length
      ?`${h}/${a.length} sources healthy`
      :"Source health unavailable";

  [
    els.sidebarHealthDot,
    els.healthDot
  ].forEach(x=>{

    x?.classList.remove(
      "healthy",
      "partial",
      "unhealthy"
    );

    x?.classList.add(c);
  });
}

function updateSince(){

  if(!state.previousVisit){

    els.sinceSummary.textContent=
      "Your catch-up will begin on your next visit.";

    return;
  }

  const a=
    state.clusters.filter(fresh);

  els.sinceSummary.textContent=
    a.length
      ?`${Math.min(a.length,12)} developments worth catching up on`
      :"You're caught up. No significant new developments.";
}

async function load(){

  try{

    const r=
      await fetch(
        `${DATA_URL}?v=${Date.now()}`,
        {cache:"no-store"}
      );

    if(!r.ok){
      throw Error(r.status);
    }

    const d=await r.json();

    state.data=d;

    state.clusters=
      Array.isArray(d.clusters)
        ?d.clusters
        :[];

    state.top=
      Array.isArray(d.top)
        ?d.top
        :[];

    state.markets=
      d.markets||{};

    els.todayDate.textContent=
      new Intl.DateTimeFormat(
        "en-IN",
        {
          weekday:"long",
          day:"numeric",
          month:"long"
        }
      )
      .format(new Date())
      .toUpperCase();

    els.topbarDate.textContent=
      new Intl.DateTimeFormat(
        "en-IN",
        {
          day:"numeric",
          month:"short",
          year:"numeric"
        }
      )
      .format(new Date());

    const u=
      `Updated ${ago(d.generated_at)}`;

    els.lastUpdated.textContent=u;
    els.topbarUpdated.textContent=u;

    health(d);
    updateSince();
    renderRail();
    renderBrief();

    localStorage.setItem(
      "di_last_visit",
      state.currentVisit
    );

  }catch(e){

    console.error(e);

    setHeader(
      "Daily Intelligence",
      "The briefing is temporarily unavailable."
    );

    showSince(false);

    empty(
      "The briefing couldn't load.",
      "Refresh again in a moment."
    );
  }
}

applyTheme();

document
  .querySelectorAll(
    ".nav-item,.mobile-nav-item,.brand-button"
  )
  .forEach(
    b=>b.addEventListener(
      "click",
      ()=>navigate(b)
    )
  );

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
  openSearch
);

els.desktopSearchTrigger?.addEventListener(
  "click",
  openSearch
);

els.closeSearch?.addEventListener(
  "click",
  ()=>closeSearch(true)
);

els.searchInput?.addEventListener(
  "input",
  e=>search(e.target.value)
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
  e=>{

    if(
      (e.metaKey||e.ctrlKey)&&
      e.key.toLowerCase()==="k"
    ){
      e.preventDefault();
      openSearch();
    }

    if(e.key==="Escape"){
      closeMenu();
      closeSources();
      closeSearch(false);
    }
  }
);

load();
