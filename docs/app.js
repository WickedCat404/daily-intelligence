const CATEGORIES = [
  ['BRIEFING',['Top 8','Since Last Visit','Bookmarks','Archives']],
  ['INDIA',['India','Indian Politics']],
  ['WORLD',['World','World Politics','Geopolitics']],
  ['ECONOMY',['Macro Economics','Business & Micro']],
  ['FRONTIER',['AI','Technology','Science & Climate']],
  ['DEEP READS',['The Ken']],
  ['SYSTEM',['Source Health']]
];
const subtitles={
  'Top 8':'The smallest useful briefing across the biggest domains.',
  'Since Last Visit':'Only developments published after your previous visit.',
  'Bookmarks':'Your quiet reading list, stored in this browser.',
  'Archives':'One saved morning snapshot per day.',
  'India':'National developments without duplicating political coverage.',
  'Indian Politics':'Government, Parliament, parties, elections and policy in India.',
  'World':'Major global developments outside the dedicated geopolitics lane.',
  'World Politics':'Political developments beyond India.',
  'Geopolitics':'Conflict, diplomacy, sanctions, strategic trade and shifts in global power.',
  'Macro Economics':'Rates, inflation, growth, currency, fiscal policy and central banks.',
  'Business & Micro':'Companies, sectors, competition, consumers and regulation.',
  'AI':'Models, research, safety, policy and the business of AI.',
  'Technology':'Important technology outside the dedicated AI lane.',
  'Science & Climate':'Scientific advances, energy transition and climate developments.',
  'The Ken':'The Ken headlines and excerpts. Open the original for subscriber content.',
  'Source Health':'Which feeds succeeded in the latest scheduled refresh.'
};
const glossary=[
  {re:/\bbasis points?|bps\b/i,title:'Basis point',body:'One basis point is 0.01 percentage point. A 25 bps rate move is 0.25 percentage point.'},
  {re:/\bbond yield|yields\b/i,title:'Bond yield',body:'The return implied by a bond’s market price. Rising yields often mean borrowing becomes more expensive and bond prices are falling.'},
  {re:/\bcurrent account/i,title:'Current account',body:'A country’s broad balance of trade in goods, services, income and transfers with the rest of the world.'},
  {re:/\bfiscal deficit/i,title:'Fiscal deficit',body:'The gap between a government’s total spending and its non-borrowed receipts. It must generally be financed through borrowing.'},
  {re:/\bquantitative easing|\bQE\b/i,title:'Quantitative easing',body:'A central bank buys financial assets to add liquidity and push down longer-term borrowing costs.'},
  {re:/\btoken|context window/i,title:'Context window',body:'The amount of information an AI model can consider in one interaction, usually measured in tokens.'},
  {re:/\binference/i,title:'AI inference',body:'The stage where a trained model processes new input and generates an output. Inference cost and speed matter greatly at scale.'},
  {re:/\bembargo|sanctions?\b/i,title:'Economic sanctions',body:'Restrictions used to limit trade, finance or access to assets. Their effect depends on enforcement, workarounds and who bears the cost.'},
  {re:/\btariff/i,title:'Tariff',body:'A tax on imported goods. It can protect domestic producers, but may also raise input or consumer prices and trigger retaliation.'}
];
let state={view:'Top 8',data:null,lastVisit:localStorage.getItem('di.github.lastVisit'),bookmarks:new Set(JSON.parse(localStorage.getItem('di.github.bookmarks')||'[]'))};
const nowISO=new Date().toISOString();
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function ago(iso){const d=new Date(iso),m=Math.max(1,Math.round((Date.now()-d)/60000));if(m<60)return `${m}m`;const h=Math.round(m/60);if(h<24)return `${h}h`;return `${Math.round(h/24)}d`}
function sourcePills(x){return (x.articles||[]).filter((a,i,arr)=>arr.findIndex(b=>b.source===a.source)===i).slice(0,5).map((a,i)=>`<a class="source-pill" target="_blank" rel="noopener" href="${esc(a.url)}">S${i+1} · ${esc(a.source)}</a>`).join('')}
function briefBlock(x){if(!x.summary_what)return '';return `<div class="brief"><div><b>What changed</b><span>${esc(x.summary_what)}</span></div><div><b>Why it matters</b><span>${esc(x.summary_why)}</span></div><div><b>Watch next</b><span>${esc(x.summary_watch)}</span></div></div>`}
function card(x){const saved=state.bookmarks.has(x.cluster_key);const tags=[];if(x.category==='AI')tags.push('<span class="tag ai">AI</span>');if(x.source_count>1)tags.push(`<span class="tag multi">${x.source_count} sources</span>`);return `<article class="story"><div><div class="eyebrow">${esc(x.category)} · ${esc(x.sources?.[0]||'')}</div><h4><a target="_blank" rel="noopener" href="${esc(x.articles?.[0]?.url||'#')}">${esc(x.title)}</a></h4><p>${esc((x.description||'').slice(0,320))}</p><div class="source-row">${tags.join('')}${sourcePills(x)}</div>${briefBlock(x)}</div><div class="story-side"><span class="time">${ago(x.published_at)} ago</span><button class="star ${saved?'on':''}" onclick="toggleBookmark('${esc(x.cluster_key)}')">${saved?'★':'☆'}</button></div></article>`}
function section(title,items,note=''){return `<section class="section"><div class="section-head"><h3>${esc(title)}</h3><span>${esc(note||`${items.length} stories`)}</span></div>${items.length?items.map(card).join(''):'<div class="empty">Nothing here yet.</div>'}</section>`}
function renderNav(){document.getElementById('nav').innerHTML=CATEGORIES.map(([label,items])=>`<div class="nav-group"><div class="nav-label">${label}</div>${items.map(v=>`<button class="nav-btn ${state.view===v?'active':''}" onclick="selectView('${v.replaceAll("'","\\'")}')"><span>${v}</span></button>`).join('')}</div>`).join('')}
function updatePulse(){const d=state.data||{};document.getElementById('pulse').innerHTML=`<span><b>${(d.top||[]).length}</b> essential stories</span><span><b>${d.article_count||0}</b> fetched articles</span><span><b>${d.cluster_count||0}</b> story clusters</span><span><b>${esc(d.clustering_mode||'lexical')}</b> clustering</span>`}
function conceptFor(items){const text=items.map(x=>`${x.title} ${x.description}`).join(' ');return glossary.find(g=>g.re.test(text))||{title:'Signal vs noise',body:'Ask what actually changed, what is merely commentary, and which next factual event would invalidate today’s narrative.'}}
function contextCards(items){const c=conceptFor(items);return `<div class="context-grid"><div class="context-card"><div class="kicker">Reading lens</div><h3>Three questions before you move on</h3><p>What actually changed? Who gains or loses? What next factual development would materially change the story?</p></div><div class="context-card concept"><div class="kicker">Concept in context</div><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></div></div>`}
function topView(){const top=state.data.top||[];if(!top.length)return '<div class="empty">No stories were generated in the latest refresh.</div>';const first=top[0];return `<div class="lead"><div class="eyebrow">${esc(first.category)} · ${first.source_count} source${first.source_count===1?'':'s'} · ${ago(first.published_at)} ago</div><h3><a target="_blank" rel="noopener" href="${esc(first.articles?.[0]?.url||'#')}">${esc(first.title)}</a></h3><p>${esc((first.description||'').slice(0,480))}</p><div class="source-row">${sourcePills(first)}</div>${briefBlock(first)}</div>${contextCards(top)}${section('Essential today',top.slice(1),'Balanced across domains')}`}
function categoryView(cat){const rows=(state.data.clusters||[]).filter(x=>x.category===cat).sort((a,b)=>new Date(b.published_at)-new Date(a.published_at));return section(cat,rows,`${rows.length} clustered stories`)}
function sinceView(){const cutoff=state.lastVisit?new Date(state.lastVisit):new Date(Date.now()-24*3600000);const rows=(state.data.clusters||[]).filter(x=>new Date(x.published_at)>cutoff).sort((a,b)=>new Date(b.published_at)-new Date(a.published_at));return section('New developments',rows,`${rows.length} since ${state.lastVisit?'last visit':'24h'}`)}
function bookmarksView(){const rows=(state.data.clusters||[]).filter(x=>state.bookmarks.has(x.cluster_key));return section('Saved',rows,`${rows.length} saved in this browser`)}
function healthView(){const rows=state.data.sources||[];return `<section class="section"><div class="section-head"><h3>Source health</h3><span>${rows.filter(x=>x.ok).length}/${rows.length} healthy</span></div><table class="health-table"><thead><tr><th>Source</th><th>Category</th><th>Status</th><th>Items</th><th>Checked</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.source)}</td><td>${esc(x.category)}</td><td class="${x.ok?'ok':'bad'}">${x.ok?'OK':'Fail'}</td><td>${x.item_count||0}</td><td>${x.checked_at?new Date(x.checked_at).toLocaleString():'—'}</td></tr>`).join('')}</tbody></table></section>`}
async function archivesView(){try{const r=await fetch(`./data/archives.json?t=${Date.now()}`);const rows=r.ok?await r.json():[];return `<section class="section"><div class="section-head"><h3>Daily archives</h3><span>${rows.length} snapshots</span></div><div class="archive-grid">${rows.map(x=>`<div class="archive-card" onclick="openArchive('${esc(x.date)}')"><b>${esc(x.date)}</b><span>${esc(x.count)} top stories</span></div>`).join('')||'<div class="empty">The first archive is created after 6:15 AM India time.</div>'}</div></section>`}catch{return '<div class="empty">Archive index unavailable.</div>'}}
async function openArchive(date){const r=await fetch(`./data/archive/${date}.json?t=${Date.now()}`);if(!r.ok)return;const a=await r.json();document.getElementById('pageTitle').textContent=date;document.getElementById('pageSubtitle').textContent='Saved morning intelligence snapshot';document.getElementById('content').innerHTML=section('Top stories',a.top||[],`${(a.top||[]).length} archived stories`)}
async function selectView(v){state.view=v;renderNav();document.getElementById('pageTitle').textContent=v;document.getElementById('pageSubtitle').textContent=subtitles[v]||'Focused, clustered coverage.';document.getElementById('content').innerHTML='<div class="loading">Loading…</div>';let html='';if(v==='Top 8')html=topView();else if(v==='Since Last Visit')html=sinceView();else if(v==='Bookmarks')html=bookmarksView();else if(v==='Archives')html=await archivesView();else if(v==='Source Health')html=healthView();else html=categoryView(v);document.getElementById('content').innerHTML=html}
function toggleBookmark(key){state.bookmarks.has(key)?state.bookmarks.delete(key):state.bookmarks.add(key);localStorage.setItem('di.github.bookmarks',JSON.stringify([...state.bookmarks]));selectView(state.view)}
function search(q){const s=q.trim().toLowerCase();if(!s)return selectView(state.view);const rows=(state.data.clusters||[]).filter(x=>(`${x.title} ${x.description} ${x.category} ${(x.sources||[]).join(' ')}`).toLowerCase().includes(s));document.getElementById('pageTitle').textContent=`Search: ${q}`;document.getElementById('pageSubtitle').textContent='Matches from the latest multi-day intelligence window.';document.getElementById('content').innerHTML=section('Search results',rows,`${rows.length} matches`)}
async function loadData(){document.getElementById('statusText').textContent='Checking latest…';const r=await fetch(`./data/latest.json?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error('latest.json not available yet');state.data=await r.json();document.getElementById('statusText').textContent=`Updated ${new Date(state.data.generated_at).toLocaleString([], {hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}`;updatePulse();await selectView(state.view)}
document.getElementById('refreshBtn').onclick=()=>loadData().catch(e=>document.getElementById('statusText').textContent='Update unavailable');
document.getElementById('searchInput').addEventListener('input',e=>{if(e.target.value.trim().length>=2)search(e.target.value);else if(!e.target.value.trim())selectView(state.view)});
document.getElementById('themeBtn').onclick=()=>{const dark=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=dark?'light':'dark';localStorage.setItem('di.github.theme',dark?'light':'dark')};const theme=localStorage.getItem('di.github.theme');if(theme)document.documentElement.dataset.theme=theme;
renderNav();loadData().catch(e=>{document.getElementById('content').innerHTML=`<div class="empty">${esc(e.message)}. Run the GitHub Action once, then reload.</div>`;document.getElementById('statusText').textContent='Waiting for first update'}).finally(()=>localStorage.setItem('di.github.lastVisit',nowISO));
