from __future__ import annotations

import asyncio
import hashlib
import json
import math
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo
import xml.etree.ElementTree as ET

import httpx


# ============================================================
# CONFIG
# ============================================================

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
ARCHIVE = DATA / "archive"

DATA.mkdir(parents=True, exist_ok=True)
ARCHIVE.mkdir(parents=True, exist_ok=True)

TZ = "Asia/Kolkata"

LOOKBACK_HOURS = 96
MAX_FEED_ITEMS = 40

MIN_CLUSTER_SCORE = 18
BRIEF_MIN_SCORE = 43
BRIEF_MAX = 8


# ============================================================
# GOOGLE NEWS DISCOVERY
#
# Google News RSS is used for discovery.
# It is NOT treated as the authoritative publisher.
# ============================================================

def google_news_feed(query: str) -> str:
    return (
        "https://news.google.com/rss/search?"
        f"q={quote_plus(query)}"
        "&hl=en-IN&gl=IN&ceid=IN:en"
    )


# ============================================================
# SOURCES
# ============================================================

SOURCES = [

    # INDIA
    {
        "name": "The Hindu India",
        "category": "India",
        "url": "https://www.thehindu.com/news/national/feeder/default.rss",
        "weight": 5,
        "primary": False,
    },
    {
        "name": "Indian Express India",
        "category": "India",
        "url": "https://indianexpress.com/section/india/feed/",
        "weight": 5,
        "primary": False,
    },
    {
        "name": "NDTV India",
        "category": "India",
        "url": "https://feeds.feedburner.com/ndtvnews-india-news",
        "weight": 3,
        "primary": False,
    },

    # INDIAN POLITICS
    {
        "name": "Indian Express Political Pulse",
        "category": "Indian Politics",
        "url": "https://indianexpress.com/section/political-pulse/feed/",
        "weight": 5,
        "primary": False,
    },
    {
        "name": "The Hindu Politics",
        "category": "Indian Politics",
        "url": "https://www.thehindu.com/news/national/politics/feeder/default.rss",
        "weight": 5,
        "primary": False,
    },

    # ECONOMY
    {
        "name": "Mint Economy",
        "category": "Macro Economics",
        "url": "https://www.livemint.com/rss/economy",
        "weight": 4,
        "primary": False,
    },
    {
        "name": "RBI",
        "category": "Macro Economics",
        "url": "https://www.rbi.org.in/pressreleases_rss.aspx",
        "weight": 5,
        "primary": True,
    },

    # BUSINESS
    {
        "name": "Economic Times",
        "category": "Business & Micro",
        "url": "https://economictimes.indiatimes.com/rssfeedstopstories.cms",
        "weight": 3,
        "primary": False,
    },
    {
        "name": "Mint Companies",
        "category": "Business & Micro",
        "url": "https://www.livemint.com/rss/companies",
        "weight": 4,
        "primary": False,
    },

    # INDIAN MARKETS
    {
        "name": "India Market Discovery",
        "category": "Indian Markets",
        "url": google_news_feed(
            '"Nifty" OR "Sensex" OR "SEBI" OR "FII" OR "DII" '
            'OR "Indian stock market" when:2d'
        ),
        "weight": 3,
        "primary": False,
    },

    # IPO DISCOVERY
    {
        "name": "India IPO Discovery",
        "category": "IPO",
        "url": google_news_feed(
            'India IPO price band issue size lot size '
            'subscription listing NSE BSE when:7d'
        ),
        "weight": 3,
        "primary": False,
    },

    # COMPANIES / EARNINGS
    {
        "name": "India Earnings Discovery",
        "category": "Companies & Earnings",
        "url": google_news_feed(
            'India company quarterly results earnings acquisition '
            'merger guidance NSE BSE when:2d'
        ),
        "weight": 3,
        "primary": False,
    },

    # MUTUAL FUNDS
    {
        "name": "India Mutual Fund Discovery",
        "category": "Mutual Funds",
        "url": google_news_feed(
            'India mutual funds AMFI SEBI SIP inflows outflows '
            'NFO expense ratio when:7d'
        ),
        "weight": 3,
        "primary": False,
    },

    # GLOBAL -> INDIA
    {
        "name": "Global Market Drivers",
        "category": "Global → India",
        "url": google_news_feed(
            '"Federal Reserve" OR "US Treasury yields" OR "Brent crude" '
            'OR OPEC OR "dollar index" OR "China economy" '
            'OR tariffs OR "Red Sea" when:2d'
        ),
        "weight": 3,
        "primary": False,
    },

    # WORLD
    {
        "name": "BBC World",
        "category": "World",
        "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
        "weight": 5,
        "primary": False,
    },
    {
        "name": "Al Jazeera",
        "category": "Geopolitics",
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "weight": 4,
        "primary": False,
    },
    {
        "name": "BBC Politics",
        "category": "World Politics",
        "url": "https://feeds.bbci.co.uk/news/politics/rss.xml",
        "weight": 4,
        "primary": False,
    },

    # AI
    {
        "name": "OpenAI",
        "category": "AI",
        "url": "https://openai.com/news/rss.xml",
        "weight": 5,
        "primary": True,
    },
    {
        "name": "Google DeepMind",
        "category": "AI",
        "url": "https://deepmind.google/blog/rss.xml",
        "weight": 5,
        "primary": True,
    },
    {
        "name": "TechCrunch AI",
        "category": "AI",
        "url": "https://techcrunch.com/category/artificial-intelligence/feed/",
        "weight": 3,
        "primary": False,
    },
    {
        "name": "MIT Technology Review AI",
        "category": "AI",
        "url": "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
        "weight": 5,
        "primary": False,
    },
    {
        "name": "Hugging Face",
        "category": "AI",
        "url": "https://huggingface.co/blog/feed.xml",
        "weight": 4,
        "primary": True,
    },

    # TECHNOLOGY
    {
        "name": "The Verge",
        "category": "Technology",
        "url": "https://www.theverge.com/rss/index.xml",
        "weight": 3,
        "primary": False,
    },
    {
        "name": "TechCrunch",
        "category": "Technology",
        "url": "https://techcrunch.com/feed/",
        "weight": 3,
        "primary": False,
    },

    # SCIENCE
    {
        "name": "Quanta Magazine",
        "category": "Science & Climate",
        "url": "https://www.quantamagazine.org/feed/",
        "weight": 5,
        "primary": False,
    },
    {
        "name": "MIT News",
        "category": "Science & Climate",
        "url": "https://news.mit.edu/rss/feed",
        "weight": 4,
        "primary": True,
    },

    # THE KEN
    {
        "name": "The Ken",
        "category": "The Ken",
        "url": "https://the-ken.com/feed/",
        "weight": 5,
        "primary": False,
    },
]


# ============================================================
# REGEX
# ============================================================

STOP = set("""
the a an and or but if then of to in on for from by with at as is
are was were be been this that these those it its their his her our
your into over after before amid says said say new latest live update
updates news report reports how why what who when where could would
should will can may more about than up down out off today yesterday
breaking exclusive explained india indian
""".split())


AI_RE = re.compile(
    r"\b(artificial intelligence|generative ai|machine learning|"
    r"large language model|llm|openai|chatgpt|anthropic|claude|"
    r"gemini|deepmind|agentic|foundation model|ai model|ai agent)\b",
    re.I,
)

MACRO = re.compile(
    r"\b(inflation|interest rate|repo rate|central bank|rbi|"
    r"federal reserve|fed rate|gdp|economic growth|fiscal|monetary|"
    r"currency|rupee|employment|unemployment|budget|deficit|"
    r"bond yield|liquidity|current account|trade deficit|"
    r"open market operation|omo)\b",
    re.I,
)

GEO = re.compile(
    r"\b(war|ceasefire|military|airstrike|missile|nuclear|sanction|"
    r"sanctions|nato|gaza|israel|iran|ukraine|russia|china|taiwan|"
    r"houthi|red sea|invasion|peace talks|border conflict)\b",
    re.I,
)

SCIENCE = re.compile(
    r"\b(climate|emissions|global warming|space mission|nasa|physics|"
    r"quantum|genome|scientists|researchers|discovery|telescope|"
    r"asteroid|renewable energy|clinical trial)\b",
    re.I,
)

INDIAN_MARKETS = re.compile(
    r"\b(nifty|sensex|nse|bse|sebi|dalal street|stock market|"
    r"equity market|equities|fii|fiis|fpi|fpis|dii|diis|"
    r"foreign portfolio investors|market cap|market capitalisation|"
    r"benchmark index|bank nifty)\b",
    re.I,
)

IPO_RE = re.compile(
    r"\b(ipo|initial public offering|public issue|price band|"
    r"anchor investors|issue opens|issue closes|subscription|"
    r"grey market premium|gmp|red herring prospectus|rhp|drhp|"
    r"listing date|listed at|listing gain|listing premium)\b",
    re.I,
)

COMPANY_EVENT = re.compile(
    r"\b(quarterly results|earnings|revenue|net profit|ebitda|"
    r"guidance|acquisition|acquires|merger|stake sale|buyback|"
    r"rights issue|fundraise|fund raising|demerger|order book|"
    r"capital expenditure|capex)\b",
    re.I,
)

MUTUAL_FUND_RE = re.compile(
    r"\b(mutual fund|mutual funds|amfi|sip contribution|sip inflow|"
    r"equity fund|debt fund|small cap fund|small-cap fund|"
    r"mid cap fund|mid-cap fund|flexi cap|index fund|"
    r"exchange traded fund|etf|nfo|new fund offer|expense ratio|"
    r"assets under management|aum)\b",
    re.I,
)

FUND_FLOW_RE = re.compile(
    r"\b(inflow|inflows|outflow|outflows|net flow|net inflow|"
    r"net outflow|sip contribution|aum rises|aum falls|"
    r"assets under management)\b",
    re.I,
)

CRUDE = re.compile(
    r"\b(brent|crude oil|oil prices|opec|opec\+|oil supply|"
    r"oil production|strait of hormuz)\b",
    re.I,
)

FED = re.compile(
    r"\b(federal reserve|fed rate|fed rates|fed meeting|"
    r"jerome powell|us interest rates|fomc)\b",
    re.I,
)

US_YIELDS = re.compile(
    r"\b(treasury yield|treasury yields|us 10-year|10-year yield|"
    r"us yields)\b",
    re.I,
)

DOLLAR = re.compile(
    r"\b(dollar index|dxy|strong dollar|weaker dollar|"
    r"dollar rises|dollar falls|us dollar)\b",
    re.I,
)

CHINA = re.compile(
    r"\b(china economy|chinese economy|china growth|china stimulus|"
    r"china property|chinese demand|beijing stimulus)\b",
    re.I,
)

TRADE = re.compile(
    r"\b(tariff|tariffs|trade war|export ban|export controls|"
    r"trade restrictions|import duty|trade agreement)\b",
    re.I,
)

SHIPPING = re.compile(
    r"\b(red sea|shipping disruption|shipping costs|freight rates|"
    r"strait of hormuz|suez canal|container rates)\b",
    re.I,
)

SEMICONDUCTORS = re.compile(
    r"\b(semiconductor|semiconductors|chip export|chip exports|"
    r"nvidia|advanced chips|chip restrictions)\b",
    re.I,
)

SEBI_RE = re.compile(r"\bsebi\b", re.I)
RBI_RE = re.compile(r"\b(rbi|reserve bank of india)\b", re.I)
FLOWS_RE = re.compile(
    r"\b(fii|fiis|fpi|fpis|dii|diis|foreign portfolio investors)\b",
    re.I,
)


# ============================================================
# NOISE
# ============================================================

CRIME = re.compile(
    r"\b(murder|murdered|stabbed|stabbing|shot dead|rape|raped|"
    r"robbery|robbed|kidnap|kidnapped|body found|dead body|"
    r"domestic dispute|road rage|assaulted)\b",
    re.I,
)

SYSTEMIC_CASUALTY = re.compile(
    r"\b(terror|terrorist|war|airstrike|bombing|earthquake|tsunami|"
    r"cyclone|hurricane|flood|wildfire|industrial disaster|"
    r"train crash|plane crash|mass shooting|stampede|"
    r"public health emergency)\b",
    re.I,
)

ENTERTAINMENT = re.compile(
    r"\b(bollywood|actor|actress|celebrity|movie review|box office|"
    r"trailer|web series|reality show|fashion|wedding photos|"
    r"influencer|dating rumours|dating rumors)\b",
    re.I,
)

SPORTS = re.compile(
    r"\b(cricket|ipl|football match|premier league|champions league|"
    r"tennis|wimbledon|us open|fifa|scorecard|wickets)\b",
    re.I,
)

LIFESTYLE = re.compile(
    r"\b(horoscope|zodiac|recipe|beauty tips|weight loss tips|"
    r"relationship tips|viral hack)\b",
    re.I,
)

CLICKBAIT = re.compile(
    r"\b(you won't believe|internet reacts|netizens react|"
    r"breaks internet|goes viral|must watch|shocking video|"
    r"fans react|stuns fans)\b",
    re.I,
)

POLITICAL_THEATRE = re.compile(
    r"\b(slams|hits out|lashes out|takes dig|mocks|taunts|"
    r"fires back|war of words|sparks row|demands apology)\b",
    re.I,
)


# ============================================================
# IMPORTANCE
# ============================================================

SYSTEMIC = re.compile(
    r"\b(supreme court|parliament|cabinet|central bank|rbi|sebi|"
    r"regulator|regulation|policy|legislation|law|bill|budget|"
    r"tax|tariff|sanctions|interest rate|inflation|gdp|liquidity|"
    r"financial system|banking system|trade agreement|merger|"
    r"acquisition|bankruptcy|default|antitrust|national security|"
    r"ceasefire|military|nuclear|election result|referendum|"
    r"drug approval|scientific discovery)\b",
    re.I,
)

LARGE_SCALE = re.compile(
    r"\b(billion|trillion|lakh crore|nationwide|millions|"
    r"record high|record low|systemic|state of emergency)\b",
    re.I,
)

CRITICAL_EVENT = re.compile(
    r"\b(war declared|full-scale invasion|nuclear attack|"
    r"nuclear strike|major terror attack|state of emergency|"
    r"sovereign default|banking crisis|financial crisis|"
    r"market crash|trading halted nationwide|capital controls|"
    r"emergency rate cut|emergency rate hike|nationwide lockdown|"
    r"constitutional crisis)\b",
    re.I,
)


# ============================================================
# CALENDAR DETECTION
# ============================================================

CALENDAR_EVENT = re.compile(
    r"\b("
    r"results on|earnings on|results today|earnings today|"
    r"ipo opens|ipo opening|ipo closes|ipo closing|"
    r"listing on|to list on|"
    r"rbi meeting|mpc meeting|policy meeting|"
    r"fomc meeting|fed meeting|"
    r"inflation data|cpi data|gdp data|"
    r"monetary policy"
    r")\b",
    re.I,
)


# ============================================================
# HELPERS
# ============================================================

TAG_RE = re.compile(r"<[^>]+>")


def clean_html(value):
    text = TAG_RE.sub(" ", unescape(value or ""))
    text = re.sub(r"\s+", " ", text).strip()

    for pattern in [
        r"read more.*$",
        r"click here.*$",
        r"continue reading.*$",
        r"subscribe to.*$",
    ]:
        text = re.sub(pattern, "", text, flags=re.I).strip()

    return text


def normalized(text):
    text = clean_html(text).lower()

    text = re.sub(
        r"\b(live|breaking|latest|update|updates|exclusive|explained)\b",
        " ",
        text,
    )

    text = re.sub(r"[^a-z0-9 ]", " ", text)

    return re.sub(r"\s+", " ", text).strip()


def words(text):
    return [
        word
        for word in normalized(text).split()
        if len(word) > 2 and word not in STOP
    ]


def vector(text):
    return Counter(words(text))


def cosine(a, b):
    if not a or not b:
        return 0

    dot = sum(a[key] * b.get(key, 0) for key in a)

    na = math.sqrt(sum(x * x for x in a.values()))
    nb = math.sqrt(sum(x * x for x in b.values()))

    if not na or not nb:
        return 0

    return dot / (na * nb)


def parse_date(value):
    if not value:
        return datetime.now(timezone.utc).isoformat()

    try:
        dt = parsedate_to_datetime(value.strip())

        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)

        return dt.astimezone(timezone.utc).isoformat()

    except Exception:
        pass

    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))

        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)

        return dt.astimezone(timezone.utc).isoformat()

    except Exception:
        return datetime.now(timezone.utc).isoformat()


def age_hours(value):
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))

        return max(
            0,
            (datetime.now(timezone.utc) - dt).total_seconds() / 3600,
        )

    except Exception:
        return 999


def text_of(node, names):
    for child in list(node):
        tag = child.tag.split("}")[-1].lower()

        if tag in names and child.text:
            return child.text

    return ""


def stable_key(title):
    raw = " ".join(words(title)[:14])

    return hashlib.sha1(raw.encode()).hexdigest()[:20]


# ============================================================
# FEED PARSER
# ============================================================

def parse_feed(data):
    root = ET.fromstring(data)

    output = []

    for node in root.iter():
        tag = node.tag.split("}")[-1].lower()

        if tag not in {"item", "entry"}:
            continue

        title = text_of(node, {"title"})

        description = text_of(
            node,
            {"description", "summary", "content", "encoded"},
        )

        date = text_of(
            node,
            {"pubdate", "published", "updated", "date"},
        )

        link = text_of(node, {"link"})

        if not link:
            for child in list(node):
                child_tag = child.tag.split("}")[-1].lower()

                if child_tag == "link" and child.attrib.get("href"):
                    link = child.attrib["href"]
                    break

        title = clean_html(title)
        description = clean_html(description)

        if title and link:
            output.append(
                {
                    "title": title,
                    "description": description,
                    "url": link.strip(),
                    "published_at": parse_date(date),
                }
            )

    return output[:MAX_FEED_ITEMS]


async def fetch(client, source):
    checked = datetime.now(timezone.utc).isoformat()

    try:
        response = await client.get(source["url"])
        response.raise_for_status()

        rows = parse_feed(response.content)

        for row in rows:
            row.update(
                {
                    "source": source["name"],
                    "source_weight": source["weight"],
                    "base_category": source["category"],
                    "primary_source": source.get("primary", False),
                }
            )

        return rows, {
            "source": source["name"],
            "category": source["category"],
            "ok": True,
            "item_count": len(rows),
            "checked_at": checked,
            "error": None,
        }

    except Exception as exc:
        return [], {
            "source": source["name"],
            "category": source["category"],
            "ok": False,
            "item_count": 0,
            "checked_at": checked,
            "error": str(exc)[:180],
        }


# ============================================================
# CLASSIFICATION
# ============================================================

def classify(article):
    text = article["title"] + " " + article["description"]
    base = article["base_category"]

    if base == "IPO":
        return "IPO"

    if base == "Mutual Funds":
        return "Mutual Funds"

    if base in {
        "Indian Markets",
        "Global → India",
        "Companies & Earnings",
    }:
        return base

    if IPO_RE.search(text) and INDIAN_MARKETS.search(text):
        return "IPO"

    if MUTUAL_FUND_RE.search(text):
        return "Mutual Funds"

    if COMPANY_EVENT.search(text) and INDIAN_MARKETS.search(text):
        return "Companies & Earnings"

    if (
        INDIAN_MARKETS.search(text)
        and base in {"Business & Micro", "Macro Economics"}
    ):
        return "Indian Markets"

    if AI_RE.search(text) and base not in {
        "Indian Politics",
        "World Politics",
        "Geopolitics",
    }:
        return "AI"

    if MACRO.search(text) and base not in {
        "Geopolitics",
        "World Politics",
    }:
        return "Macro Economics"

    if GEO.search(text) and base == "World":
        return "Geopolitics"

    if SCIENCE.search(text) and not AI_RE.search(text):
        return "Science & Climate"

    return base


# ============================================================
# NOISE
# ============================================================

def noise_penalty(article):
    text = article["title"] + " " + article["description"]

    penalty = 0

    if ENTERTAINMENT.search(text):
        penalty += 65

    if SPORTS.search(text):
        penalty += 65

    if LIFESTYLE.search(text):
        penalty += 70

    if CLICKBAIT.search(text):
        penalty += 50

    if POLITICAL_THEATRE.search(text):
        penalty += 35

    if CRIME.search(text):
        penalty += 5 if SYSTEMIC_CASUALTY.search(text) else 65

    return penalty


def should_drop(article):
    return noise_penalty(article) >= 60


# ============================================================
# INDIA MARKET TRANSMISSION
# ============================================================

def market_context(text):
    channels = []
    explanations = []

    if CRUDE.search(text):
        channels.extend(["Crude oil", "Inflation", "INR"])

        explanations.append(
            "Sustained changes in crude prices can affect India's "
            "import bill, inflation, the rupee and rate expectations."
        )

    if FED.search(text):
        channels.extend(["Fed", "Foreign flows"])

        explanations.append(
            "US monetary-policy expectations can influence global "
            "funding conditions, foreign portfolio flows and "
            "valuation-sensitive Indian assets."
        )

    if US_YIELDS.search(text):
        channels.extend(["US yields", "Foreign flows"])

        explanations.append(
            "Changes in US Treasury yields can alter the relative "
            "attractiveness of emerging-market assets and global "
            "cost-of-capital conditions."
        )

    if DOLLAR.search(text):
        channels.extend(["Dollar", "INR"])

        explanations.append(
            "Broad dollar moves can affect the rupee, imported costs "
            "and foreign-investor positioning."
        )

    if CHINA.search(text):
        channels.extend(["China", "Commodities"])

        explanations.append(
            "Changes in Chinese growth and demand can transmit through "
            "commodities, metals, manufacturing and regional demand."
        )

    if TRADE.search(text):
        channels.append("Trade")

        explanations.append(
            "Trade restrictions can alter export demand, supply chains "
            "and sector-level competitiveness."
        )

    if SHIPPING.search(text):
        channels.extend(["Shipping", "Input costs"])

        explanations.append(
            "Shipping disruptions can alter freight and import costs "
            "and affect companies dependent on global supply chains."
        )

    if SEMICONDUCTORS.search(text):
        channels.append("Semiconductors")

        explanations.append(
            "Global chip supply and trade restrictions can affect "
            "electronics, autos, technology hardware and manufacturing."
        )

    if SEBI_RE.search(text):
        channels.append("SEBI")

        explanations.append(
            "SEBI rules can directly change trading, disclosure, "
            "capital-raising or intermediary conditions in India."
        )

    if RBI_RE.search(text):
        channels.extend(["RBI", "Rates"])

        explanations.append(
            "RBI rates and liquidity conditions influence borrowing "
            "costs, bond yields, banking conditions and valuation inputs."
        )

    if FLOWS_RE.search(text):
        channels.append("Institutional flows")

        explanations.append(
            "Foreign and domestic institutional flows affect market "
            "liquidity and demand, although daily flows alone do not "
            "explain market direction."
        )

    # Deduplicate tags while preserving order.
    channels = list(dict.fromkeys(channels))

    if not explanations:
        return None, []

    return explanations[0], channels[:5]


# ============================================================
# SIGNAL SCORE
# ============================================================

def article_signal(article):
    text = article["title"] + " " + article["description"]

    score = article.get("source_weight", 3) * 4

    age = age_hours(article["published_at"])

    score += max(0, 28 - age * 0.7)

    if article.get("primary_source"):
        score += 10

    if SYSTEMIC.search(text):
        score += 16

    if LARGE_SCALE.search(text):
        score += 8

    category_bonus = {
        "India": 5,
        "Indian Politics": 6,
        "Macro Economics": 8,
        "Business & Micro": 4,
        "Indian Markets": 7,
        "Global → India": 7,
        "Companies & Earnings": 5,
        "IPO": 4,
        "Mutual Funds": 4,
        "World": 4,
        "World Politics": 4,
        "Geopolitics": 8,
        "AI": 7,
        "Technology": 3,
        "Science & Climate": 5,
        "The Ken": 2,
    }

    score += category_bonus.get(article["category"], 0)

    impact, channels = market_context(text)

    if article["category"] == "Global → India" and channels:
        score += 8

    score -= noise_penalty(article)

    return round(score, 2)


# ============================================================
# CLUSTERING
# ============================================================

def cluster_articles(rows):
    rows = sorted(
        rows,
        key=lambda x: x["published_at"],
        reverse=True,
    )

    used = set()
    clusters = []

    for i, article in enumerate(rows):

        if i in used:
            continue

        members = [article]
        used.add(i)

        base_vector = vector(article["title"])

        for j, candidate in enumerate(rows):

            if j in used:
                continue

            # Do not merge dedicated datasets across categories.
            if article["category"] in {"IPO", "Mutual Funds"}:
                if candidate["category"] != article["category"]:
                    continue

            try:
                a_time = datetime.fromisoformat(
                    article["published_at"].replace("Z", "+00:00")
                )

                b_time = datetime.fromisoformat(
                    candidate["published_at"].replace("Z", "+00:00")
                )

                if abs((a_time - b_time).total_seconds()) > 60 * 3600:
                    continue

            except Exception:
                pass

            candidate_vector = vector(candidate["title"])

            similarity = cosine(base_vector, candidate_vector)

            a_words = set(words(article["title"]))
            b_words = set(words(candidate["title"]))

            common = a_words & b_words

            overlap = len(common) / max(
                1,
                min(len(a_words), len(b_words)),
            )

            same_category = article["category"] == candidate["category"]

            threshold = 0.34 if same_category else 0.40

            if (
                similarity >= threshold
                or (
                    overlap >= 0.50
                    and len(common) >= 3
                )
            ):
                members.append(candidate)
                used.add(j)

        clusters.append(make_cluster(members))

    return sorted(
        clusters,
        key=lambda x: (
            x["importance"],
            x["published_at"],
        ),
        reverse=True,
    )


CATEGORY_PRIORITY = [
    "IPO",
    "Mutual Funds",
    "Indian Markets",
    "Global → India",
    "Companies & Earnings",
    "Macro Economics",
    "Indian Politics",
    "India",
    "Geopolitics",
    "World Politics",
    "World",
    "AI",
    "Science & Climate",
    "Technology",
    "Business & Micro",
    "The Ken",
]


def choose_category(members):
    categories = [x["category"] for x in members]

    for category in CATEGORY_PRIORITY:
        if category in categories:
            return category

    return categories[0]


def choose_primary(members):
    return max(
        members,
        key=lambda x: (
            article_signal(x)
            + min(len(x.get("description", "")), 700) / 100
            + (6 if x.get("primary_source") else 0)
        ),
    )


def choose_description(members):
    options = []

    for article in members:
        description = clean_html(article.get("description", ""))

        if len(description) < 45:
            continue

        score = (
            article_signal(article)
            + min(len(description), 700) / 80
        )

        options.append((score, description))

    if not options:
        return ""

    options.sort(reverse=True, key=lambda x: x[0])

    text = options[0][1]

    if len(text) > 850:
        text = text[:847].rsplit(" ", 1)[0] + "…"

    return text


def importance_label(members, score, source_count):
    combined = " ".join(
        x["title"] + " " + x["description"]
        for x in members
    )

    if (
        CRITICAL_EVENT.search(combined)
        and score >= 70
        and source_count >= 2
    ):
        return "critical"

    if score >= BRIEF_MIN_SCORE:
        return "significant"

    return "noteworthy"


def make_cluster(members):
    primary = choose_primary(members)
    category = choose_category(members)

    sources = sorted(set(x["source"] for x in members))

    best_score = max(article_signal(x) for x in members)

    confirmation_bonus = min(
        15,
        max(0, len(sources) - 1) * 5,
    )

    official_bonus = (
        6
        if any(x.get("primary_source") for x in members)
        else 0
    )

    importance = (
        best_score
        + confirmation_bonus
        + official_bonus
    )

    combined_text = " ".join(
        x["title"] + " " + x["description"]
        for x in members
    )

    impact, channels = market_context(combined_text)

    if category not in {
        "Indian Markets",
        "Global → India",
        "Companies & Earnings",
        "Macro Economics",
        "Geopolitics",
        "IPO",
    }:
        impact = None
        channels = []

    published = max(x["published_at"] for x in members)

    label = importance_label(
        members,
        importance,
        len(sources),
    )

    return {
        "cluster_key": stable_key(primary["title"]),
        "title": primary["title"],
        "description": choose_description(members),
        "brief": choose_description(members),
        "category": category,
        "published_at": published,
        "importance": round(importance, 2),
        "importance_label": label,
        "source_count": len(sources),
        "sources": sources,
        "primary": primary,
        "articles": sorted(
            members,
            key=lambda x: x["published_at"],
            reverse=True,
        ),
        "market_impact": impact,
        "market_channels": channels,
        "is_developing": False,
        "summary_mode": "source-brief",
    }


# ============================================================
# THE BRIEF
# ============================================================

CATEGORY_CAPS = {
    "India": 2,
    "Indian Politics": 1,
    "Macro Economics": 1,
    "Business & Micro": 1,
    "Indian Markets": 1,
    "Global → India": 1,
    "Companies & Earnings": 1,
    "World": 1,
    "World Politics": 1,
    "Geopolitics": 2,
    "AI": 1,
    "Technology": 1,
    "Science & Climate": 1,
    "The Ken": 1,
}

CATEGORY_FAMILIES = {
    "India": "india",
    "Indian Politics": "india",
    "Macro Economics": "economy",
    "Business & Micro": "business",
    "Companies & Earnings": "business",
    "Indian Markets": "markets",
    "Global → India": "markets",
    "World": "world",
    "World Politics": "world",
    "Geopolitics": "world",
    "AI": "technology",
    "Technology": "technology",
    "Science & Climate": "science",
    "The Ken": "special",
}


def select_brief(clusters):
    # IPO and MF discovery have dedicated views.
    eligible = [
        cluster
        for cluster in clusters
        if (
            cluster["category"] not in {"IPO", "Mutual Funds"}
            and cluster["importance_label"] in {
                "critical",
                "significant",
            }
            and cluster["importance"] >= BRIEF_MIN_SCORE
        )
    ]

    selected = []
    category_counts = Counter()
    family_counts = Counter()

    # First pass: diversity.
    for cluster in eligible:
        category = cluster["category"]
        family = CATEGORY_FAMILIES.get(category, category)

        if family_counts[family] >= 1:
            continue

        selected.append(cluster)

        category_counts[category] += 1
        family_counts[family] += 1

        if len(selected) >= 6:
            break

    # Second pass: genuinely strong additional stories.
    if len(selected) < BRIEF_MAX:

        for cluster in eligible:

            if cluster in selected:
                continue

            category = cluster["category"]
            family = CATEGORY_FAMILIES.get(category, category)

            if (
                category_counts[category]
                >= CATEGORY_CAPS.get(category, 1)
            ):
                continue

            if family_counts[family] >= 2:
                continue

            selected.append(cluster)

            category_counts[category] += 1
            family_counts[family] += 1

            if len(selected) >= BRIEF_MAX:
                break

    return selected[:BRIEF_MAX]


# ============================================================
# V5.2 IPO INTELLIGENCE
# ============================================================

def extract_ipo_name(title):
    title = re.sub(
        r"\s*[-|:]\s*(IPO|initial public offering).*$",
        "",
        title,
        flags=re.I,
    )

    title = re.sub(
        r"\bIPO\b.*$",
        "",
        title,
        flags=re.I,
    ).strip(" :-|")

    return title[:100] or "IPO"


def ipo_status(text):
    lower = text.lower()

    if re.search(
        r"\b(opens today|open for subscription|subscription opens|"
        r"issue opens today|ipo opens today)\b",
        lower,
    ):
        return "OPEN NOW"

    if re.search(
        r"\b(upcoming ipo|to open|will open|opens on|"
        r"set to open|scheduled to open)\b",
        lower,
    ):
        return "UPCOMING"

    if re.search(
        r"\b(listed at|listing gain|listing premium|"
        r"listing discount|market debut|debuted at)\b",
        lower,
    ):
        return "RECENTLY LISTED"

    return "IPO UPDATE"


def extract_price_band(text):
    patterns = [
        r"(?:price band|price range)[^\d₹]{0,12}"
        r"(₹?\s?[\d,]+(?:\.\d+)?)\s*(?:-|to|–)\s*"
        r"(₹?\s?[\d,]+(?:\.\d+)?)",

        r"₹\s?([\d,]+)\s*(?:-|to|–)\s*₹?\s?([\d,]+)"
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.I)

        if match:
            a = match.group(1).replace("₹", "").strip()
            b = match.group(2).replace("₹", "").strip()

            return f"₹{a}–₹{b}"

    return None


def extract_lot_size(text):
    match = re.search(
        r"(?:lot size|minimum bid)[^\d]{0,15}([\d,]+)\s*(?:shares?)?",
        text,
        re.I,
    )

    return match.group(1) if match else None


def extract_issue_size(text):
    match = re.search(
        r"(?:issue size|ipo size)[^₹\d]{0,15}"
        r"₹?\s?([\d,.]+)\s*(crore|cr|billion|million)",
        text,
        re.I,
    )

    if not match:
        return None

    value = match.group(1)
    unit = match.group(2)

    return f"₹{value} {unit}"


def build_ipo_data(clusters):
    open_items = []
    upcoming_items = []
    recent_items = []

    for story in clusters:

        if story["category"] != "IPO":
            continue

        text = (
            story["title"]
            + " "
            + story.get("description", "")
        )

        status = ipo_status(text)

        item = {
            "name": extract_ipo_name(story["title"]),
            "status": status,
            "sector": None,
            "price_band": extract_price_band(text),
            "issue_size": extract_issue_size(text),
            "lot_size": extract_lot_size(text),
            "close_date": None,
            "listing_date": None,
            "what_to_know": useful_ipo_description(story),
            "url": story["primary"].get("url"),
            "source": story["primary"].get("source"),
            "published_at": story["published_at"],
        }

        if status == "OPEN NOW":
            open_items.append(item)

        elif status == "UPCOMING":
            upcoming_items.append(item)

        elif status == "RECENTLY LISTED":
            recent_items.append(item)

    return {
        "ipo_open": open_items[:15],
        "ipo_upcoming": upcoming_items[:15],
        "ipo_recent": recent_items[:15],
    }


def useful_ipo_description(story):
    description = clean_html(story.get("description", ""))

    if not description:
        return (
            "Review the offer document, use of proceeds, "
            "fresh issue versus OFS and listed peers."
        )

    words_list = description.split()

    if len(words_list) > 55:
        description = " ".join(words_list[:55]) + "…"

    return description


# ============================================================
# MUTUAL FUND INTELLIGENCE
# ============================================================

def build_mutual_fund_data(clusters):
    news = []

    flow_items = []

    for story in clusters:

        if story["category"] != "Mutual Funds":
            continue

        news.append(story)

        text = (
            story["title"]
            + " "
            + story.get("description", "")
        )

        if FUND_FLOW_RE.search(text):

            flow_items.append(
                {
                    "category": "FUND FLOWS",
                    "title": story["title"],
                    "description": useful_summary_for_market(story),
                    "source": story["primary"].get("source"),
                    "url": story["primary"].get("url"),
                    "published_at": story["published_at"],
                }
            )

    return {
        "mutual_fund_news": news[:15],
        "fund_flows": flow_items[:12],
    }


def useful_summary_for_market(story):
    text = clean_html(
        story.get("brief")
        or story.get("description")
        or ""
    )

    words_list = text.split()

    if len(words_list) > 65:
        text = " ".join(words_list[:65]) + "…"

    return text


# ============================================================
# MARKET CALENDAR
#
# Conservative by design.
# We do not infer dates that aren't explicit.
# ============================================================

def build_calendar(clusters):
    events = []

    seen = set()

    for story in clusters:

        text = (
            story["title"]
            + " "
            + story.get("description", "")
        )

        if not CALENDAR_EVENT.search(text):
            continue

        if story["category"] == "IPO":
            event_type = "IPO"

        elif RBI_RE.search(text):
            event_type = "RBI"

        elif FED.search(text):
            event_type = "FED"

        elif COMPANY_EVENT.search(text):
            event_type = "EARNINGS"

        else:
            event_type = "MACRO"

        key = normalized(story["title"])

        if key in seen:
            continue

        seen.add(key)

        events.append(
            {
                "type": event_type,
                "date": short_calendar_date(story["published_at"]),
                "title": story["title"],
                "why_it_matters": (
                    story.get("market_impact")
                    or useful_summary_for_market(story)
                ),
                "url": story["primary"].get("url"),
            }
        )

    return events[:15]


def short_calendar_date(value):
    try:
        dt = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        ).astimezone(ZoneInfo(TZ))

        return dt.strftime("%d %b")

    except Exception:
        return ""


# ============================================================
# INVESTOR CONVERSATION
#
# Intentionally empty until a dedicated community-data
# pipeline is added.
#
# We do not label news headlines as "investor sentiment".
# ============================================================

def build_investor_conversation():
    return []


# ============================================================
# MARKET OBJECT
# ============================================================

def build_markets(clusters):
    ipo = build_ipo_data(clusters)
    funds = build_mutual_fund_data(clusters)

    return {
        "ipo_open": ipo["ipo_open"],
        "ipo_upcoming": ipo["ipo_upcoming"],
        "ipo_recent": ipo["ipo_recent"],

        "investor_conversation":
            build_investor_conversation(),

        "mutual_fund_news":
            funds["mutual_fund_news"],

        "fund_flows":
            funds["fund_flows"],

        "calendar":
            build_calendar(clusters),
    }


# ============================================================
# MAIN
# ============================================================

async def main():

    headers = {
        "User-Agent":
            "DailyIntelligence/5.2 "
            "(personal RSS intelligence reader)"
    }

    timeout = httpx.Timeout(
        20.0,
        connect=10.0,
    )

    async with httpx.AsyncClient(
        headers=headers,
        follow_redirects=True,
        timeout=timeout,
    ) as client:

        results = await asyncio.gather(
            *[
                fetch(client, source)
                for source in SOURCES
            ]
        )

    health = [
        status
        for _, status in results
    ]

    incoming = [
        article
        for batch, _ in results
        for article in batch
    ]

    cutoff = (
        datetime.now(timezone.utc)
        - timedelta(hours=LOOKBACK_HOURS)
    )

    unique = {}

    noise_filtered = 0
    stale_filtered = 0

    for article in incoming:

        article["category"] = classify(article)

        try:
            published = datetime.fromisoformat(
                article["published_at"].replace(
                    "Z",
                    "+00:00",
                )
            )

            if published < cutoff:
                stale_filtered += 1
                continue

        except Exception:
            pass

        if should_drop(article):
            noise_filtered += 1
            continue

        article["signal_score"] = article_signal(article)

        unique[article["url"]] = article

    rows = list(unique.values())

    clusters = cluster_articles(rows)

    clusters = [
        cluster
        for cluster in clusters
        if cluster["importance"] >= MIN_CLUSTER_SCORE
    ]

    top = select_brief(clusters)

    markets = build_markets(clusters)

    generated = datetime.now(timezone.utc).isoformat()

    payload = {
        "version": "5.2",
        "generated_at": generated,

        "article_count": len(rows),
        "cluster_count": len(clusters),
        "brief_count": len(top),

        "noise_filtered": noise_filtered,
        "stale_filtered": stale_filtered,

        "clustering_mode": "signal-diversity-v5.2",
        "summary_mode": "source-brief",

        "sources": health,
        "top": top,
        "clusters": clusters,

        # NEW IN V5.2
        "markets": markets,
    }

    (DATA / "latest.json").write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    # ========================================================
    # DAILY ARCHIVE
    # ========================================================

    local = datetime.now(ZoneInfo(TZ))

    date = local.date().isoformat()

    archive_file = ARCHIVE / f"{date}.json"

    if (
        local.hour > 6
        or (
            local.hour == 6
            and local.minute >= 15
        )
    ) and not archive_file.exists():

        archive_file.write_text(
            json.dumps(
                {
                    "date": date,
                    "created_at": generated,
                    "top": top,
                    "markets": {
                        "ipo_open":
                            markets["ipo_open"],
                        "ipo_upcoming":
                            markets["ipo_upcoming"],
                    },
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )

    # ========================================================
    # ARCHIVE INDEX
    # ========================================================

    archives = []

    for path in sorted(
        ARCHIVE.glob("*.json"),
        reverse=True,
    )[:60]:

        try:
            archive = json.loads(
                path.read_text(
                    encoding="utf-8"
                )
            )

            archives.append(
                {
                    "date":
                        archive.get(
                            "date",
                            path.stem,
                        ),

                    "created_at":
                        archive.get(
                            "created_at"
                        ),

                    "count":
                        len(
                            archive.get(
                                "top",
                                [],
                            )
                        ),
                }
            )

        except Exception:
            pass

    (DATA / "archives.json").write_text(
        json.dumps(
            archives,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    # ========================================================
    # LOGGING / QA
    # ========================================================

    healthy = sum(
        1
        for source in health
        if source["ok"]
    )

    failed = [
        source["source"]
        for source in health
        if not source["ok"]
    ]

    market_count = sum(
        1
        for cluster in clusters
        if cluster["category"] in {
            "Indian Markets",
            "Global → India",
            "Companies & Earnings",
        }
    )

    critical_count = sum(
        1
        for cluster in top
        if cluster["importance_label"] == "critical"
    )

    print(
        "\n"
        "============================================\n"
        "DAILY INTELLIGENCE V5.2\n"
        "============================================"
    )

    print(f"Useful articles:       {len(rows)}")
    print(f"Clusters:              {len(clusters)}")
    print(f"Brief stories:         {len(top)}")
    print(f"Critical stories:      {critical_count}")

    print(f"Market stories:        {market_count}")

    print(
        f"IPO open:              "
        f"{len(markets['ipo_open'])}"
    )

    print(
        f"IPO upcoming:          "
        f"{len(markets['ipo_upcoming'])}"
    )

    print(
        f"Recently listed:       "
        f"{len(markets['ipo_recent'])}"
    )

    print(
        f"Mutual fund stories:   "
        f"{len(markets['mutual_fund_news'])}"
    )

    print(
        f"Fund flow stories:     "
        f"{len(markets['fund_flows'])}"
    )

    print(
        f"Calendar events:       "
        f"{len(markets['calendar'])}"
    )

    print(f"Noise filtered:        {noise_filtered}")
    print(f"Stale filtered:        {stale_filtered}")
    print(f"Healthy sources:       {healthy}/{len(health)}")

    if failed:
        print("\nFailed feeds:")

        for source in failed:
            print(f"  - {source}")

    print(
        "============================================\n"
    )


if __name__ == "__main__":
    asyncio.run(main())
