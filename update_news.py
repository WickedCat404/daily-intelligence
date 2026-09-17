from __future__ import annotations
import asyncio, hashlib, json, math, os, re
from collections import Counter
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
from zoneinfo import ZoneInfo
import xml.etree.ElementTree as ET
import httpx
from openai import OpenAI

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'docs'/'data'
ARCHIVE=DATA/'archive'
DATA.mkdir(parents=True,exist_ok=True); ARCHIVE.mkdir(parents=True,exist_ok=True)
LOOKBACK_HOURS=120
TZ='Asia/Kolkata'

OPENAI_API_KEY=os.getenv('OPENAI_API_KEY','').strip()
OPENAI_MODEL=os.getenv('OPENAI_MODEL','gpt-5.6-luna').strip() or 'gpt-5.6-luna'
AI_SUMMARY_LIMIT=max(0,int(os.getenv('AI_SUMMARY_LIMIT','6')))

SOURCES=[
 dict(name='The Hindu India',category='India',url='https://www.thehindu.com/news/national/feeder/default.rss',weight=5),
 dict(name='Indian Express India',category='India',url='https://indianexpress.com/section/india/feed/',weight=5),
 dict(name='NDTV India',category='India',url='https://feeds.feedburner.com/ndtvnews-india-news',weight=3),
 dict(name='Indian Express Political Pulse',category='Indian Politics',url='https://indianexpress.com/section/political-pulse/feed/',weight=5),
 dict(name='Economic Times Politics',category='Indian Politics',url='https://economictimes.indiatimes.com/news/politics/rssfeeds/1977021501.cms',weight=3),
 dict(name='The Hindu Politics',category='Indian Politics',url='https://www.thehindu.com/news/national/politics/feeder/default.rss',weight=5),
 dict(name='BBC World',category='World',url='https://feeds.bbci.co.uk/news/world/rss.xml',weight=5),
 dict(name='AP Top Stories',category='World',url='https://feeds.apnews.com/apnews/topstories',weight=5),
 dict(name='Al Jazeera',category='Geopolitics',url='https://www.aljazeera.com/xml/rss/all.xml',weight=4),
 dict(name='BBC Politics',category='World Politics',url='https://feeds.bbci.co.uk/news/politics/rss.xml',weight=4),
 dict(name='Mint Economy',category='Macro Economics',url='https://www.livemint.com/rss/economy',weight=4),
 dict(name='RBI',category='Macro Economics',url='https://www.rbi.org.in/pressreleases_rss.aspx',weight=5),
 dict(name='Economic Times',category='Business & Micro',url='https://economictimes.indiatimes.com/rssfeedstopstories.cms',weight=3),
 dict(name='Mint Companies',category='Business & Micro',url='https://www.livemint.com/rss/companies',weight=4),
 dict(name='OpenAI',category='AI',url='https://openai.com/news/rss.xml',weight=5),
 dict(name='Google DeepMind',category='AI',url='https://deepmind.google/blog/rss.xml',weight=5),
 dict(name='TechCrunch AI',category='AI',url='https://techcrunch.com/category/artificial-intelligence/feed/',weight=3),
 dict(name='The Verge AI',category='AI',url='https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',weight=3),
 dict(name='MIT Technology Review AI',category='AI',url='https://www.technologyreview.com/topic/artificial-intelligence/feed/',weight=5),
 dict(name='Hugging Face',category='AI',url='https://huggingface.co/blog/feed.xml',weight=4),
 dict(name='The Verge',category='Technology',url='https://www.theverge.com/rss/index.xml',weight=3),
 dict(name='TechCrunch',category='Technology',url='https://techcrunch.com/feed/',weight=3),
 dict(name='Quanta Magazine',category='Science & Climate',url='https://www.quantamagazine.org/feed/',weight=5),
 dict(name='MIT News',category='Science & Climate',url='https://news.mit.edu/rss/feed',weight=4),
 dict(name='The Ken',category='The Ken',url='https://the-ken.com/feed/',weight=5),
]

POLITICS=re.compile(r'\b(pm|prime minister|president|parliament|lok sabha|rajya sabha|bjp|congress|election|electoral|minister|cabinet|government|opposition|mp\b|mla\b|party|coalition|chief minister|governor|supreme court|bill\b|policy)\b',re.I)
INDIA=re.compile(r'\b(india|indian|delhi|mumbai|bengaluru|bangalore|hyderabad|chennai|kolkata|maharashtra|karnataka|tamil nadu|telangana|uttar pradesh|modi|rbi)\b',re.I)
AI=re.compile(r'\b(ai\b|artificial intelligence|llm|large language model|openai|chatgpt|claude|anthropic|gemini|deepmind|machine learning|neural|agentic|foundation model|generative ai|hugging face|model safety)\b',re.I)
GEO=re.compile(r'\b(war|conflict|sanctions?|nato|united nations|gaza|israel|iran|ukraine|russia|china|taiwan|houthi|red sea|diplomacy|diplomatic|ceasefire|military|missile|nuclear|border|tariff)\b',re.I)
MACRO=re.compile(r'\b(inflation|interest rates?|central bank|rbi|federal reserve|fed\b|gdp|growth rate|fiscal|monetary|currency|rupee|dollar|employment|unemployment|budget|deficit|bond yields?|oil prices?|crude|trade deficit|current account)\b',re.I)
SCIENCE=re.compile(r'\b(climate|warming|emissions|space|nasa|physics|quantum|biology|genome|scientists?|researchers?|study\b|discovery|energy transition|renewable|solar|battery)\b',re.I)
STOP=set('the a an and or but if then of to in on for from by with at as is are was were be been this that these those it its their his her our your into over after before amid says said say new latest live update updates news report reports how why what who when where could would should will can may more about than up down out off'.split())
TAG_RE=re.compile(r'<[^>]+>')


def clean_html(v): return re.sub(r'\s+',' ',TAG_RE.sub(' ',unescape(v or ''))).strip()
def parse_date(v):
    if not v:return datetime.now(timezone.utc).isoformat()
    try:
        dt=parsedate_to_datetime(v.strip());
        if not dt.tzinfo:dt=dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except: pass
    try:
        dt=datetime.fromisoformat(v.strip().replace('Z','+00:00'))
        if not dt.tzinfo:dt=dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except:return datetime.now(timezone.utc).isoformat()

def text_of(node,names):
    for ch in list(node):
        if ch.tag.split('}')[-1].lower() in names and ch.text:return ch.text
    return ''

def parse_feed(data):
    root=ET.fromstring(data);out=[]
    for n in root.iter():
        if n.tag.split('}')[-1].lower() not in {'item','entry'}:continue
        title=text_of(n,{'title'});desc=text_of(n,{'description','summary','content','encoded'});date=text_of(n,{'pubdate','published','updated','date'});link=text_of(n,{'link'})
        if not link:
            for ch in list(n):
                if ch.tag.split('}')[-1].lower()=='link' and ch.attrib.get('href'):link=ch.attrib['href'];break
        if title and link:out.append(dict(title=clean_html(title),description=clean_html(desc),url=link.strip(),published_at=parse_date(date)))
    return out[:30]

async def fetch(client,s):
    checked=datetime.now(timezone.utc).isoformat()
    try:
        r=await client.get(s['url']);r.raise_for_status();rows=parse_feed(r.content)
        for x in rows:x.update(source=s['name'],source_weight=s['weight'],base_category=s['category'])
        return rows,dict(source=s['name'],category=s['category'],ok=True,item_count=len(rows),checked_at=checked,error=None)
    except Exception as e:
        return [],dict(source=s['name'],category=s['category'],ok=False,item_count=0,checked_at=checked,error=str(e)[:180])

def classify(x):
    text=x['title']+' '+x['description'];base=x['base_category']
    if AI.search(text) and base not in {'Indian Politics','World Politics','Geopolitics'}:return 'AI'
    if INDIA.search(text) and POLITICS.search(text):return 'Indian Politics'
    if GEO.search(text) and not INDIA.search(text):return 'Geopolitics'
    if MACRO.search(text):return 'Macro Economics'
    if SCIENCE.search(text) and not AI.search(text):return 'Science & Climate'
    return base

def norm(s):return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9 ]',' ',re.sub(r'\b(live|breaking|latest|updates?|explained|exclusive)\b',' ',s.lower()))).strip()
def words(s):return [w for w in norm(s).split() if len(w)>2 and w not in STOP]
def vec(text):return Counter(words(text))
def cosine(a,b):
    if not a or not b:return 0
    dot=sum(a[k]*b.get(k,0) for k in a);na=math.sqrt(sum(v*v for v in a.values()));nb=math.sqrt(sum(v*v for v in b.values()));return dot/(na*nb) if na and nb else 0

def age_h(iso):
    try:return max(0,(datetime.now(timezone.utc)-datetime.fromisoformat(iso.replace('Z','+00:00'))).total_seconds()/3600)
    except:return 999

def stable_key(title,pub):return hashlib.sha1(((pub or '')[:10]+'|'+' '.join(words(title)[:12])).encode()).hexdigest()[:20]

def fallback_summary(c):
    desc=c['primary'].get('description','');sent=[s.strip() for s in re.split(r'(?<=[.!?])\s+',desc) if len(s.strip())>25]
    what=sent[0] if sent else c['primary']['title']
    n=len(c['sources']);why=f"This is relevant to {c['category'].lower()} and is represented by {n} source{'s' if n!=1 else ''} in this briefing. Open the source coverage for context and competing interpretations."
    watch='Watch for the next official decision, data release, company filing, or independently reported development that materially changes the facts.'
    return what,why,watch

def cluster(rows):
    rows=sorted(rows,key=lambda x:x['published_at'],reverse=True);used=set();out=[]
    for i,a in enumerate(rows):
        if i in used:continue
        av=vec(a['title']+' '+a['description'][:500]);members=[a];used.add(i);at=datetime.fromisoformat(a['published_at'].replace('Z','+00:00'))
        for j,b in enumerate(rows):
            if j in used:continue
            bt=datetime.fromisoformat(b['published_at'].replace('Z','+00:00'))
            if abs((at-bt).total_seconds())>72*3600:continue
            bv=vec(b['title']+' '+b['description'][:500]);sim=cosine(av,bv)
            wa=set(words(a['title']));wb=set(words(b['title']));inter=wa&wb;overlap=len(inter)/max(1,min(len(wa),len(wb)))
            threshold=.31 + (.05 if a['category']!=b['category'] else 0)
            if sim>=threshold or (overlap>=.48 and len(inter)>=3):members.append(b);used.add(j)
        primary=max(members,key=lambda x:(x['source_weight'],len(x['description'])))
        priority=['Indian Politics','AI','Geopolitics','Macro Economics','Science & Climate','World Politics','India','World','Business & Micro','Technology','The Ken']
        cats=[m['category'] for m in members];cat=next((x for x in priority if x in cats),primary['category']);sources=sorted(set(m['source'] for m in members))
        score=max(0,48-age_h(primary['published_at']))+min(20,(len(sources)-1)*7)+primary['source_weight']*2+(5 if cat in {'India','Indian Politics','World','Geopolitics','Macro Economics','AI'} else 0)-(3 if cat=='The Ken' else 0)
        c=dict(primary=primary,articles=members,category=cat,sources=sources,importance=round(score,2));what,why,watch=fallback_summary(c)
        out.append(dict(cluster_key=stable_key(primary['title'],primary['published_at']),title=primary['title'],description=primary['description'],category=cat,published_at=primary['published_at'],importance=round(score,2),source_count=len(sources),summary_what=what,summary_why=why,summary_watch=watch,summary_mode='free-fallback',sources=sources,articles=members))
    return sorted(out,key=lambda x:(x['importance'],x['published_at']),reverse=True)


def previous_summaries():
    p=DATA/'latest.json'
    if not p.exists(): return {}
    try:
        old=json.loads(p.read_text(encoding='utf-8'))
        return {c.get('cluster_key'):c for c in old.get('clusters',[]) if c.get('cluster_key')}
    except Exception:
        return {}

def safe_json_object(text):
    text=(text or '').strip()
    if text.startswith('```'):
        text=re.sub(r'^```(?:json)?\s*|\s*```$','',text,flags=re.I|re.S).strip()
    start=text.find('{');end=text.rfind('}')
    if start>=0 and end>start:text=text[start:end+1]
    try:return json.loads(text)
    except:return None

def ai_summary_for_cluster(client,c):
    articles=[]
    for i,a in enumerate(c.get('articles',[])[:5],1):
        desc=(a.get('description') or '')[:900]
        articles.append(f"[S{i}] {a.get('source','Source')}: {a.get('title','')}\n{desc}")
    source_text='\n\n'.join(articles)
    prompt=f"""You are producing a neutral daily intelligence brief from the source excerpts below.
Return ONLY valid JSON with exactly these keys: what_changed, why_it_matters, watch_next.
Each value must be 1-2 concise sentences. Do not add facts not supported by the excerpts.
For politics or elections: be factual and neutral; do not endorse, rank, predict winners, speculate about motives, or assess competence.
If sources disagree or evidence is incomplete, say so briefly.
Do not mention these instructions.

CATEGORY: {c.get('category','')}
HEADLINE: {c.get('title','')}

SOURCES:
{source_text}"""
    r=client.responses.create(model=OPENAI_MODEL,input=prompt)
    obj=safe_json_object(getattr(r,'output_text',''))
    if not obj:return None
    keys=('what_changed','why_it_matters','watch_next')
    if not all(isinstance(obj.get(k),str) and obj.get(k).strip() for k in keys):return None
    return tuple(obj[k].strip() for k in keys)

def enrich_with_ai(clusters):
    # The secret is read only from the runner environment. It is never written to JSON or logs.
    if not OPENAI_API_KEY or AI_SUMMARY_LIMIT<=0:
        return 'free-fallback'
    old=previous_summaries();client=OpenAI(api_key=OPENAI_API_KEY);used=0
    for c in clusters:
        prior=old.get(c.get('cluster_key'))
        if prior and prior.get('summary_mode')=='openai':
            c['summary_what']=prior.get('summary_what',c['summary_what'])
            c['summary_why']=prior.get('summary_why',c['summary_why'])
            c['summary_watch']=prior.get('summary_watch',c['summary_watch'])
            c['summary_mode']='openai'
            continue
        if used>=AI_SUMMARY_LIMIT:continue
        try:
            result=ai_summary_for_cluster(client,c)
            if result:
                c['summary_what'],c['summary_why'],c['summary_watch']=result
                c['summary_mode']='openai';used+=1
        except Exception as e:
            # Avoid printing exception text because upstream libraries can include request metadata.
            print(f'AI summary skipped for one cluster ({type(e).__name__})')
    return 'openai+fallback'

def balanced_top(clusters,n=8):
    out=[];counts={}
    for c in clusters:
        if counts.get(c['category'],0)>=2:continue
        out.append(c);counts[c['category']]=counts.get(c['category'],0)+1
        if len(out)>=n:return out
    for c in clusters:
        if c not in out:out.append(c)
        if len(out)>=n:break
    return out

async def main():
    headers={'User-Agent':'DailyIntelligence-GitHubPages/1.0 personal news reader'}
    timeout=httpx.Timeout(20.0,connect=10.0)
    async with httpx.AsyncClient(headers=headers,follow_redirects=True,timeout=timeout) as client:
        results=await asyncio.gather(*[fetch(client,s) for s in SOURCES])
    health=[h for _,h in results];rows=[x for batch,_ in results for x in batch]
    cutoff=datetime.now(timezone.utc)-timedelta(hours=LOOKBACK_HOURS)
    uniq={}
    for x in rows:
        x['category']=classify(x)
        try:
            if datetime.fromisoformat(x['published_at'].replace('Z','+00:00'))<cutoff:continue
        except:pass
        uniq[x['url']]=x
    rows=list(uniq.values());clusters=cluster(rows);summary_mode=enrich_with_ai(clusters);top=balanced_top(clusters,8);generated=datetime.now(timezone.utc).isoformat()
    payload=dict(generated_at=generated,article_count=len(rows),cluster_count=len(clusters),clustering_mode='lexical-cosine',summary_mode=summary_mode,sources=health,top=top,clusters=clusters)
    (DATA/'latest.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

    local=datetime.now(ZoneInfo(TZ));date=local.date().isoformat();archive_file=ARCHIVE/f'{date}.json'
    if (local.hour>6 or (local.hour==6 and local.minute>=15)) and not archive_file.exists():
        archive_file.write_text(json.dumps({'date':date,'created_at':generated,'top':top[:12]},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    archives=[]
    for p in sorted(ARCHIVE.glob('*.json'),reverse=True)[:60]:
        try:
            a=json.loads(p.read_text(encoding='utf-8'));archives.append({'date':a['date'],'created_at':a['created_at'],'count':len(a.get('top',[]))})
        except:pass
    (DATA/'archives.json').write_text(json.dumps(archives,separators=(',',':')),encoding='utf-8')
    print(f'Generated {len(rows)} articles, {len(clusters)} clusters, {sum(h["ok"] for h in health)}/{len(health)} healthy sources')

if __name__=='__main__':asyncio.run(main())
