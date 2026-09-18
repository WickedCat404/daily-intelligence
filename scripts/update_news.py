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
# DAILY INTELLIGENCE V5.3
#
# Editorial principle:
#   The Brief = only the most consequential developments.
#   Markets   = a dense financial-newspaper front page.
#
# No OpenAI/API calls.
# No invented market data.
# No fabricated investor sentiment.
# ============================================================

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
ARCHIVE = DATA / "archive"

DATA.mkdir(parents=True, exist_ok=True)
ARCHIVE.mkdir(parents=True, exist_ok=True)

TZ = "Asia/Kolkata"

LOOKBACK_HOURS = 96
MARKET_LOOKBACK_HOURS = 120
IPO_LOOKBACK_HOURS = 168
MF_LOOKBACK_HOURS = 168

MAX_FEED_ITEMS = 45

MIN_CLUSTER_SCORE = 18
BRIEF_MIN_SCORE = 43
BRIEF_MAX = 8


# ============================================================
# GOOGLE NEWS DISCOVERY
# ============================================================

def google_news_feed(query: str) -> str:
    return (
        "https://news.google.com/rss/search?"
        f"q={quote_plus(query)}"
        "&hl=en-IN&gl=IN&ceid=IN:en"
    )


# ============================================================
# SOURCES
#
# Direct feeds where possible.
# Google News RSS for discovery where structured free feeds
# are unreliable.
# ============================================================

SOURCES = [

    # ---------------- INDIA ----------------

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


    # ---------------- INDIAN POLITICS ----------------

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


    # ---------------- ECONOMY ----------------

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


    # ---------------- BUSINESS ----------------

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


    # ========================================================
    # MARKETS DISCOVERY
    # ========================================================

    {
        "name": "India Markets",
        "category": "Indian Markets",
        "url": google_news_feed(
            '"Nifty" OR "Sensex" OR "Indian stock market" '
            'OR "NSE" OR "BSE" when:2d'
        ),
        "weight": 4,
        "primary": False,
    },

    {
        "name": "India Market Policy",
        "category": "Indian Markets",
        "url": google_news_feed(
            'India SEBI markets regulation FII FPI DII '
            'market liquidity capital markets when:3d'
        ),
        "weight": 4,
        "primary": False,
    },

    {
        "name": "India Market Macro",
        "category": "Indian Markets",
        "url": google_news_feed(
            'India rupee bond yields RBI liquidity '
            'stock market investors when:3d'
        ),
        "weight": 4,
        "primary": False,
    },


    # ========================================================
    # COMPANIES / STOCKS
    # ========================================================

    {
        "name": "Corporate India",
        "category": "Companies & Earnings",
        "url": google_news_feed(
            'India company earnings results acquisition merger '
            'demerger capex order NSE BSE when:3d'
        ),
        "weight": 4,
        "primary": False,
    },

    {
        "name": "India Earnings",
        "category": "Companies & Earnings",
        "url": google_news_feed(
            'India quarterly results revenue profit EBITDA '
            'guidance NSE BSE when:3d'
        ),
        "weight": 4,
        "primary": False,
    },

    {
        "name": "India Corporate Actions",
        "category": "Companies & Earnings",
        "url": google_news_feed(
            'India listed company acquisition merger stake sale '
            'buyback demerger rights issue fundraising when:3d'
        ),
        "weight": 4,
        "primary": False,
    },


    # ========================================================
    # IPOs
    # ========================================================

    {
        "name": "India IPO",
        "category": "IPO",
        "url": google_news_feed(
            'India IPO price band issue size lot size '
            'subscription NSE BSE when:7d'
        ),
        "weight": 4,
        "primary": False,
    },

    {
        "name": "Upcoming IPOs",
        "category": "IPO",
        "url": google_news_feed(
            '"upcoming IPO" India OR "IPO opens" India '
            'OR "public issue opens" India when:7d'
        ),
        "weight": 4,
        "primary": False,
    },

    {
        "name": "IPO Listings",
        "category": "IPO",
        "url": google_news_feed(
            'India IPO listing debut listed NSE BSE when:7d'
        ),
        "weight": 4,
        "primary": False,
    },


    # ========================================================
    # MUTUAL FUNDS
    # ========================================================

    {
        "name": "Mutual Funds India",
        "category": "Mutual Funds",
        "url": google_news_feed(
            'India mutual funds AMFI SIP inflows outflows '
            'SEBI mutual fund when:7d'
        ),
        "weight": 4,
        "primary": False,
    },

    {
        "name": "Mutual Fund Policy",
        "category": "Mutual Funds",
        "url": google_news_feed(
            'SEBI mutual fund regulation expense ratio '
            'NFO India when:14d'
        ),
        "weight": 4,
        "primary": False,
    },

    {
        "name": "Mutual Fund Flows",
        "category": "Mutual Funds",
        "url": google_news_feed(
            'AMFI equity mutual fund inflow SIP contribution '
            'small cap mid cap fund flows India when:14d'
        ),
        "weight": 4,
        "primary": False,
    },


    # ========================================================
    # GLOBAL -> INDIA
    # ========================================================

    {
        "name": "Global Rates",
        "category": "Global → India",
        "url": google_news_feed(
            '"Federal Reserve" OR "US Treasury yields" '
            'OR "dollar index" global markets when:2d'
        ),
        "weight": 4,
        "primary": False,
    },

    {
        "name": "Global Commodities",
        "category": "Global → India",
        "url": google_news_feed(
            '"Brent crude" OR OPEC OR oil prices '
            'global markets India when:2d'
        ),
        "weight": 4,
        "primary": False,
    },

    {
        "name": "Global Trade",
        "category": "Global → India",
        "url": google_news_feed(
            'tariffs trade war China exports shipping '
            'Red Sea global markets India when:3d'
        ),
        "weight": 4,
        "primary": False,
    },


    # ---------------- WORLD ----------------

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


    # ---------------- AI ----------------

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


    # ---------------- TECHNOLOGY ----------------

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


    # ---------------- SCIENCE ----------------

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


    # ---------------- THE KEN ----------------

    {
        "name": "The Ken",
        "category": "The Ken",
        "url": "https://the-ken.com/feed/",
        "weight": 5,
        "primary": False,
    },
]


# ============================================================
# LANGUAGE PATTERNS
# ============================================================

STOP = set("""
the a an and or but if then of to in on for from by with at as
is are was were be been this that these those it its their his
her our your into over after before amid says said say new
latest live update updates news report reports how why what who
when where could would should will can may more about than up
down out off today yesterday breaking exclusive explained
india indian
""".split())


AI_RE = re.compile(
    r"\b(artificial intelligence|generative ai|machine learning|"
    r"large language model|llm|openai|chatgpt|anthropic|claude|"
    r"gemini|deepmind|agentic|foundation model|ai model|ai agent)\b",
    re.I,
)

MACRO = re.compile(
    r"\b(inflation|interest rate|repo rate|central bank|rbi|"
    r"federal reserve|gdp|economic growth|fiscal|monetary|"
    r"currency|rupee|employment|unemployment|budget|deficit|"
    r"bond yield|liquidity|current account|trade deficit|omo|"
    r"open market operation)\b",
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


# ============================================================
# MARKETS
# ============================================================

INDIAN_MARKETS = re.compile(
    r"\b(nifty|sensex|nse|bse|sebi|dalal street|stock market|"
    r"equity market|equities|fii|fiis|fpi|fpis|dii|diis|"
    r"foreign portfolio investors|institutional investors|"
    r"market cap|market capitalisation|benchmark index|bank nifty|"
    r"midcap index|smallcap index|market breadth)\b",
    re.I,
)

COMPANY_EVENT = re.compile(
    r"\b(quarterly results|quarterly earnings|earnings|revenue|"
    r"net profit|ebitda|guidance|acquisition|acquires|merger|"
    r"stake sale|buyback|rights issue|fundraise|fund raising|"
    r"demerger|order book|capex|capital expenditure|"
    r"regulatory approval|large order|contract win)\b",
    re.I,
)

MATERIAL_COMPANY_EVENT = re.compile(
    r"\b(acquisition|merger|demerger|bankruptcy|default|"
    r"large order|major order|regulatory action|fraud|"
    r"record profit|record loss|profit warning|guidance cut|"
    r"guidance raised|buyback|rights issue|stake sale|"
    r"capital expenditure|capex|fundraise|fund raising)\b",
    re.I,
)

ROUTINE_STOCK_MOVE = re.compile(
    r"\b(shares rise|shares fall|stock rises|stock falls|"
    r"stock jumps|stock drops|stock surges|stock tumbles|"
    r"shares jump|shares surge|shares tumble|shares slip|"
    r"stock up|stock down)\b",
    re.I,
)

ANALYST_NOISE = re.compile(
    r"\b(buy rating|sell rating|target price|price target|"
    r"brokerage recommends|brokerage says|top stock pick|"
    r"stocks to buy|stocks to sell|multibagger|"
    r"stock recommendation)\b",
    re.I,
)


# ============================================================
# IPO
# ============================================================

IPO_RE = re.compile(
    r"\b(ipo|initial public offering|public issue|price band|"
    r"anchor investors|issue opens|issue closes|subscription|"
    r"red herring prospectus|rhp|drhp|listing date|listed at|"
    r"listing gain|listing premium|market debut)\b",
    re.I,
)

IPO_OPEN = re.compile(
    r"\b(open for subscription|opens for subscription|"
    r"subscription opens|issue opens|ipo opens|opens today|"
    r"opened for subscription)\b",
    re.I,
)

IPO_UPCOMING = re.compile(
    r"\b(upcoming ipo|to open|will open|opens on|set to open|"
    r"scheduled to open|plans ipo|files drhp|files for ipo|"
    r"gets sebi approval|receives sebi approval)\b",
    re.I,
)

IPO_LISTED = re.compile(
    r"\b(listed at|lists at|listing gain|listing premium|"
    r"listing discount|market debut|debuted at|stock market debut)\b",
    re.I,
)

GMP_RE = re.compile(
    r"\b(gmp|grey market premium|grey market)\b",
    re.I,
)


# ============================================================
# MUTUAL FUNDS
# ============================================================

MUTUAL_FUND_RE = re.compile(
    r"\b(mutual fund|mutual funds|amfi|sip contribution|sip inflow|"
    r"equity fund|debt fund|small cap fund|small-cap fund|"
    r"mid cap fund|mid-cap fund|flexi cap|index fund|"
    r"exchange traded fund|etf|nfo|new fund offer|expense ratio|"
    r"assets under management|aum)\b",
    re.I,
)

MF_SYSTEMIC = re.compile(
    r"\b(amfi|sebi|regulation|rule|expense ratio|tax|taxation|"
    r"sip contribution|net inflow|net outflow|fund flows|"
    r"assets under management|aum|stress test|liquidity)\b",
    re.I,
)

MF_PROMO_NOISE = re.compile(
    r"\b(best mutual fund|best fund|top mutual fund|"
    r"funds to buy|mutual funds to invest|"
    r"₹?10,?000 becomes|crorepati|wealth creator|"
    r"highest return fund|top performing fund)\b",
    re.I,
)


# ============================================================
# GLOBAL -> INDIA TRANSMISSION
# ============================================================

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
    r"\b(treasury yield|treasury yields|us 10-year|"
    r"10-year yield|us yields)\b",
    re.I,
)

DOLLAR = re.compile(
    r"\b(dollar index|dxy|strong dollar|weaker dollar|"
    r"dollar rises|dollar falls|us dollar)\b",
    re.I,
)

CHINA = re.compile(
    r"\b(china economy|chinese economy|china growth|"
    r"china stimulus|china property|chinese demand|"
    r"beijing stimulus)\b",
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
# BASIC HELPERS
# ============================================================

TAG_RE = re.compile(r"<[^>]+>")


def clean_html(value):
    text = TAG_RE.sub(" ", unescape(value or ""))
    text = re.sub(r"\s+", " ", text).strip()

    text = re.sub(r"read more.*$", "", text, flags=re.I)
    text = re.sub(r"continue reading.*$", "", text, flags=re.I)
    text = re.sub(r"subscribe to.*$", "", text, flags=re.I)

    return text.strip()


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


def stable_key(title):
    raw = " ".join(words(title)[:14])

    return hashlib.sha1(raw.encode()).hexdigest()[:20]


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
        dt = datetime.fromisoformat(
            value.strip().replace("Z", "+00:00")
        )

        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)

        return dt.astimezone(timezone.utc).isoformat()

    except Exception:
        return datetime.now(timezone.utc).isoformat()


def age_hours(value):
    try:
        dt = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )

        return max(
            0,
            (
                datetime.now(timezone.utc) - dt
            ).total_seconds() / 3600,
        )

    except Exception:
        return 999


def text_of(node, names):
    for child in list(node):
        tag = child.tag.split("}")[-1].lower()

        if tag in names and child.text:
            return child.text

    return ""


# ============================================================
# RSS
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
            {
                "description",
                "summary",
                "content",
                "encoded",
            },
        )

        date = text_of(
            node,
            {
                "pubdate",
                "published",
                "updated",
                "date",
            },
        )

        link = text_of(node, {"link"})

        if not link:
            for child in list(node):
                child_tag = child.tag.split("}")[-1].lower()

                if (
                    child_tag == "link"
                    and child.attrib.get("href")
                ):
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
                    "primary_source": source.get(
                        "primary",
                        False,
                    ),
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
    text = (
        article["title"]
        + " "
        + article["description"]
    )

    base = article["base_category"]

    # Dedicated discovery feeds take priority.

    if base in {
        "Indian Markets",
        "Global → India",
        "Companies & Earnings",
        "IPO",
        "Mutual Funds",
    }:
        return base

    if IPO_RE.search(text):
        return "IPO"

    if MUTUAL_FUND_RE.search(text):
        return "Mutual Funds"

    if (
        COMPANY_EVENT.search(text)
        and INDIAN_MARKETS.search(text)
    ):
        return "Companies & Earnings"

    if (
        INDIAN_MARKETS.search(text)
        and base in {
            "Business & Micro",
            "Macro Economics",
        }
    ):
        return "Indian Markets"

    if (
        AI_RE.search(text)
        and base not in {
            "Indian Politics",
            "World Politics",
            "Geopolitics",
        }
    ):
        return "AI"

    if (
        MACRO.search(text)
        and base not in {
            "Geopolitics",
            "World Politics",
        }
    ):
        return "Macro Economics"

    if (
        GEO.search(text)
        and base == "World"
    ):
        return "Geopolitics"

    if (
        SCIENCE.search(text)
        and not AI_RE.search(text)
    ):
        return "Science & Climate"

    return base


# ============================================================
# NOISE
# ============================================================

def noise_penalty(article):
    text = (
        article["title"]
        + " "
        + article["description"]
    )

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
        penalty += (
            5
            if SYSTEMIC_CASUALTY.search(text)
            else 65
        )

    # Markets-specific noise.

    if ANALYST_NOISE.search(text):
        penalty += 45

    if (
        ROUTINE_STOCK_MOVE.search(text)
        and not MATERIAL_COMPANY_EVENT.search(text)
        and not SYSTEMIC.search(text)
    ):
        penalty += 25

    if MF_PROMO_NOISE.search(text):
        penalty += 55

    # GMP is chatter, not primary IPO intelligence.
    if (
        GMP_RE.search(text)
        and not (
            IPO_OPEN.search(text)
            or IPO_UPCOMING.search(text)
            or IPO_LISTED.search(text)
        )
    ):
        penalty += 30

    return penalty


def should_drop(article):
    return noise_penalty(article) >= 60


# ============================================================
# INDIA TRANSMISSION
# ============================================================

def market_context(text):
    channels = []
    explanations = []

    if CRUDE.search(text):
        channels.extend([
            "Crude oil",
            "Inflation",
            "INR",
        ])

        explanations.append(
            "Sustained crude-price changes can affect India's "
            "import bill, inflation, the rupee and rate expectations."
        )

    if FED.search(text):
        channels.extend([
            "Fed",
            "Foreign flows",
        ])

        explanations.append(
            "US monetary-policy expectations can influence global "
            "funding conditions, foreign portfolio flows and "
            "valuation-sensitive Indian assets."
        )

    if US_YIELDS.search(text):
        channels.extend([
            "US yields",
            "Foreign flows",
        ])

        explanations.append(
            "US Treasury yields can alter the relative attractiveness "
            "of emerging-market assets and global cost-of-capital "
            "conditions."
        )

    if DOLLAR.search(text):
        channels.extend([
            "Dollar",
            "INR",
        ])

        explanations.append(
            "Broad dollar moves can affect the rupee, imported costs "
            "and foreign-investor positioning."
        )

    if CHINA.search(text):
        channels.extend([
            "China",
            "Commodities",
        ])

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
        channels.extend([
            "Shipping",
            "Input costs",
        ])

        explanations.append(
            "Shipping disruptions can change freight and import costs "
            "and affect companies dependent on global supply chains."
        )

    if SEMICONDUCTORS.search(text):
        channels.append("Semiconductors")

        explanations.append(
            "Global chip supply and trade restrictions can affect "
            "electronics, autos, technology hardware and manufacturing."
        )

    channels = list(dict.fromkeys(channels))

    return (
        explanations[0] if explanations else None,
        channels[:5],
    )


# ============================================================
# SIGNAL SCORE
# ============================================================

def article_signal(article):
    text = (
        article["title"]
        + " "
        + article["description"]
    )

    score = article.get(
        "source_weight",
        3,
    ) * 4

    age = age_hours(
        article["published_at"]
    )

    score += max(
        0,
        28 - age * 0.7,
    )

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

        "Business & Micro": 3,

        "Indian Markets": 9,
        "Global → India": 8,
        "Companies & Earnings": 7,
        "IPO": 6,
        "Mutual Funds": 6,

        "World": 4,
        "World Politics": 4,
        "Geopolitics": 8,

        "AI": 7,
        "Technology": 3,
        "Science & Climate": 5,
        "The Ken": 2,
    }

    score += category_bonus.get(
        article["category"],
        0,
    )

    # Material corporate event > random stock movement.

    if (
        article["category"] == "Companies & Earnings"
        and MATERIAL_COMPANY_EVENT.search(text)
    ):
        score += 10

    # Useful mutual-fund information > promotional content.

    if (
        article["category"] == "Mutual Funds"
        and MF_SYSTEMIC.search(text)
    ):
        score += 9

    # Useful IPO status signal.

    if (
        article["category"] == "IPO"
        and (
            IPO_OPEN.search(text)
            or IPO_UPCOMING.search(text)
            or IPO_LISTED.search(text)
        )
    ):
        score += 8

    impact, channels = market_context(text)

    if (
        article["category"] == "Global → India"
        and channels
    ):
        score += 10

    score -= noise_penalty(article)

    return round(score, 2)


# ============================================================
# CLUSTERING
# ============================================================

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
    categories = [
        x["category"]
        for x in members
    ]

    for category in CATEGORY_PRIORITY:
        if category in categories:
            return category

    return categories[0]


def choose_primary(members):
    return max(
        members,
        key=lambda x: (
            article_signal(x)
            + min(
                len(x.get("description", "")),
                700,
            ) / 100
            + (
                6
                if x.get("primary_source")
                else 0
            )
        ),
    )


def choose_description(members):
    options = []

    for article in members:
        description = clean_html(
            article.get(
                "description",
                "",
            )
        )

        if len(description) < 45:
            continue

        score = (
            article_signal(article)
            + min(
                len(description),
                700,
            ) / 80
        )

        options.append(
            (
                score,
                description,
            )
        )

    if not options:
        return ""

    options.sort(
        reverse=True,
        key=lambda x: x[0],
    )

    text = options[0][1]

    if len(text) > 850:
        text = (
            text[:847]
            .rsplit(" ", 1)[0]
            + "…"
        )

    return text


def importance_label(
    members,
    score,
    source_count,
):
    combined = " ".join(
        x["title"]
        + " "
        + x["description"]
        for x in members
    )

    # Critical is intentionally rare.

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

    sources = sorted(
        set(
            x["source"]
            for x in members
        )
    )

    best_score = max(
        article_signal(x)
        for x in members
    )

    confirmation_bonus = min(
        15,
        max(
            0,
            len(sources) - 1,
        ) * 5,
    )

    official_bonus = (
        6
        if any(
            x.get("primary_source")
            for x in members
        )
        else 0
    )

    importance = (
        best_score
        + confirmation_bonus
        + official_bonus
    )

    combined_text = " ".join(
        x["title"]
        + " "
        + x["description"]
        for x in members
    )

    impact, channels = market_context(
        combined_text
    )

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

    published = max(
        x["published_at"]
        for x in members
    )

    label = importance_label(
        members,
        importance,
        len(sources),
    )

    description = choose_description(
        members
    )

    return {
        "cluster_key":
            stable_key(primary["title"]),

        "title":
            primary["title"],

        "description":
            description,

        "brief":
            description,

        "category":
            category,

        "published_at":
            published,

        "importance":
            round(importance, 2),

        "importance_label":
            label,

        "source_count":
            len(sources),

        "sources":
            sources,

        "primary":
            primary,

        "articles":
            sorted(
                members,
                key=lambda x:
                    x["published_at"],
                reverse=True,
            ),

        "market_impact":
            impact,

        "market_channels":
            channels,

        "is_developing":
            False,

        "summary_mode":
            "source-brief",
    }


def cluster_articles(rows):
    rows = sorted(
        rows,
        key=lambda x:
            x["published_at"],
        reverse=True,
    )

    used = set()
    clusters = []

    for i, article in enumerate(rows):

        if i in used:
            continue

        members = [article]

        used.add(i)

        base_vector = vector(
            article["title"]
        )

        for j, candidate in enumerate(rows):

            if j in used:
                continue

            # Dedicated finance categories should not bleed
            # into each other merely because the company name
            # appears in both stories.

            if article["category"] in {
                "IPO",
                "Mutual Funds",
            }:
                if (
                    candidate["category"]
                    != article["category"]
                ):
                    continue

            try:
                a_time = datetime.fromisoformat(
                    article[
                        "published_at"
                    ].replace(
                        "Z",
                        "+00:00",
                    )
                )

                b_time = datetime.fromisoformat(
                    candidate[
                        "published_at"
                    ].replace(
                        "Z",
                        "+00:00",
                    )
                )

                if abs(
                    (
                        a_time - b_time
                    ).total_seconds()
                ) > 60 * 3600:
                    continue

            except Exception:
                pass

            candidate_vector = vector(
                candidate["title"]
            )

            similarity = cosine(
                base_vector,
                candidate_vector,
            )

            a_words = set(
                words(article["title"])
            )

            b_words = set(
                words(candidate["title"])
            )

            common = (
                a_words
                & b_words
            )

            overlap = (
                len(common)
                / max(
                    1,
                    min(
                        len(a_words),
                        len(b_words),
                    ),
                )
            )

            same_category = (
                article["category"]
                == candidate["category"]
            )

            threshold = (
                0.34
                if same_category
                else 0.40
            )

            if (
                similarity >= threshold
                or (
                    overlap >= 0.50
                    and len(common) >= 3
                )
            ):
                members.append(candidate)

                used.add(j)

        clusters.append(
            make_cluster(members)
        )

    return sorted(
        clusters,
        key=lambda x: (
            x["importance"],
            x["published_at"],
        ),
        reverse=True,
    )


# ============================================================
# THE BRIEF
#
# Markets has much more content.
# The Brief remains selective.
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
    eligible = [
        cluster
        for cluster in clusters
        if (
            cluster["category"]
            not in {
                "IPO",
                "Mutual Funds",
            }
            and cluster[
                "importance_label"
            ]
            in {
                "critical",
                "significant",
            }
            and cluster[
                "importance"
            ]
            >= BRIEF_MIN_SCORE
        )
    ]

    selected = []

    category_counts = Counter()
    family_counts = Counter()

    # First pass: category diversity.

    for cluster in eligible:

        category = cluster["category"]

        family = CATEGORY_FAMILIES.get(
            category,
            category,
        )

        if family_counts[family] >= 1:
            continue

        selected.append(cluster)

        category_counts[category] += 1
        family_counts[family] += 1

        if len(selected) >= 6:
            break

    # Second pass: genuinely important extras.

    for cluster in eligible:

        if len(selected) >= BRIEF_MAX:
            break

        if cluster in selected:
            continue

        category = cluster["category"]

        family = CATEGORY_FAMILIES.get(
            category,
            category,
        )

        if (
            category_counts[category]
            >= CATEGORY_CAPS.get(
                category,
                1,
            )
        ):
            continue

        if family_counts[family] >= 2:
            continue

        selected.append(cluster)

        category_counts[category] += 1
        family_counts[family] += 1

    return selected[:BRIEF_MAX]


# ============================================================
# IPO STRUCTURED EXTRACTION
#
# Conservative.
# Missing data stays missing.
# ============================================================

def extract_price_band(text):
    patterns = [
        (
            r"(?:price band|price range)"
            r"[^\d₹]{0,15}"
            r"₹?\s?([\d,]+(?:\.\d+)?)"
            r"\s*(?:-|to|–)\s*"
            r"₹?\s?([\d,]+(?:\.\d+)?)"
        ),

        (
            r"₹\s?([\d,]+)"
            r"\s*(?:-|to|–)\s*"
            r"₹?\s?([\d,]+)"
        ),
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.I,
        )

        if match:
            return (
                f"₹{match.group(1)}"
                f"–₹{match.group(2)}"
            )

    return None


def extract_issue_size(text):
    match = re.search(
        r"(?:issue size|ipo size)"
        r"[^₹\d]{0,20}"
        r"₹?\s?([\d,.]+)"
        r"\s*(crore|cr|billion|million)",
        text,
        re.I,
    )

    if not match:
        return None

    return (
        f"₹{match.group(1)} "
        f"{match.group(2)}"
    )


def extract_lot_size(text):
    match = re.search(
        r"(?:lot size|minimum bid)"
        r"[^\d]{0,20}"
        r"([\d,]+)"
        r"\s*(?:shares?)?",
        text,
        re.I,
    )

    return (
        match.group(1)
        if match
        else None
    )


def ipo_status(text):
    if IPO_LISTED.search(text):
        return "RECENTLY LISTED"

    if IPO_OPEN.search(text):
        return "OPEN NOW"

    if IPO_UPCOMING.search(text):
        return "UPCOMING"

    return "IPO UPDATE"


def extract_ipo_name(title):
    value = re.sub(
        r"\s*[-|:]\s*"
        r"(IPO|initial public offering).*$",
        "",
        title,
        flags=re.I,
    )

    if len(value.strip()) < 3:
        return title[:100]

    return value.strip()[:100]


def useful_ipo_text(story):
    text = clean_html(
        story.get("description", "")
    )

    if not text:
        return ""

    parts = text.split()

    if len(parts) > 50:
        text = (
            " ".join(parts[:50])
            + "…"
        )

    return text


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
            + story.get(
                "description",
                "",
            )
        )

        status = ipo_status(text)

        # Don't pretend a generic IPO mention is an
        # active/upcoming/listed issue.

        if status == "IPO UPDATE":
            continue

        item = {
            "name":
                extract_ipo_name(
                    story["title"]
                ),

            "status":
                status,

            "sector":
                None,

            "price_band":
                extract_price_band(text),

            "issue_size":
                extract_issue_size(text),

            "lot_size":
                extract_lot_size(text),

            "close_date":
                None,

            "listing_date":
                None,

            "what_to_know":
                useful_ipo_text(story),

            "url":
                story["primary"].get(
                    "url"
                ),

            "source":
                story["primary"].get(
                    "source"
                ),

            "published_at":
                story["published_at"],
        }

        if status == "OPEN NOW":
            open_items.append(item)

        elif status == "UPCOMING":
            upcoming_items.append(item)

        elif status == "RECENTLY LISTED":
            recent_items.append(item)

    return {
        "ipo_open":
            open_items[:8],

        "ipo_upcoming":
            upcoming_items[:8],

        "ipo_recent":
            recent_items[:8],
    }


# ============================================================
# MUTUAL FUNDS

def build_mutual_fund_data(clusters):
    stories = [
        story
        for story in clusters
        if story["category"]
        == "Mutual Funds"
    ]

    stories = sorted(
        stories,
        key=lambda x: (
            x["importance"],
            x["published_at"],
        ),
        reverse=True,
    )

    flow_stories = []

    for story in stories:

        text = (
            story["title"]
            + " "
            + story.get(
                "description",
                "",
            )
        )

        if MF_SYSTEMIC.search(text):
            flow_stories.append(story)

    return {
        "mutual_fund_news":
            stories[:12],

        # These remain actual stories, not invented
        # numerical data.
        "fund_flows":
            flow_stories[:8],
    }


# ============================================================
# MARKET DATA OBJECT
#
# Frontend uses this for IPO + MF.
# Main market headlines still come from clusters.
# ============================================================

def build_markets(clusters):
    ipo = build_ipo_data(clusters)

    mf = build_mutual_fund_data(
        clusters
    )

    return {
        "ipo_open":
            ipo["ipo_open"],

        "ipo_upcoming":
            ipo["ipo_upcoming"],

        "ipo_recent":
            ipo["ipo_recent"],

        "mutual_fund_news":
            mf["mutual_fund_news"],

        "fund_flows":
            mf["fund_flows"],

        # Intentionally blank until a genuine
        # community-discussion pipeline exists.
        "investor_conversation":
            [],

        # Removed from the visible V5.3 interface.
        "calendar":
            [],
    }


# ============================================================
# MAIN
# ============================================================

async def main():
    headers = {
        "User-Agent":
            "DailyIntelligence/5.3 "
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
                fetch(
                    client,
                    source,
                )
                for source in SOURCES
            ]
        )

    health = [
        status
        for _,
        status
        in results
    ]

    incoming = [
        article
        for batch, _
        in results
        for article
        in batch
    ]

    now = datetime.now(
        timezone.utc
    )

    unique = {}

    noise_filtered = 0
    stale_filtered = 0

    for article in incoming:

        article["category"] = classify(
            article
        )

        try:
            published = datetime.fromisoformat(
                article[
                    "published_at"
                ].replace(
                    "Z",
                    "+00:00",
                )
            )

            age = (
                now - published
            ).total_seconds() / 3600

        except Exception:
            age = 999

        category = article["category"]

        if category == "IPO":
            max_age = IPO_LOOKBACK_HOURS

        elif category == "Mutual Funds":
            max_age = MF_LOOKBACK_HOURS

        elif category in {
            "Indian Markets",
            "Global → India",
            "Companies & Earnings",
        }:
            max_age = MARKET_LOOKBACK_HOURS

        else:
            max_age = LOOKBACK_HOURS

        if age > max_age:
            stale_filtered += 1
            continue

        if should_drop(article):
            noise_filtered += 1
            continue

        article["signal_score"] = (
            article_signal(article)
        )

        # URL dedupe.
        unique[
            article["url"]
        ] = article

    rows = list(
        unique.values()
    )

    clusters = cluster_articles(
        rows
    )

    clusters = [
        cluster
        for cluster in clusters
        if cluster["importance"]
        >= MIN_CLUSTER_SCORE
    ]

    top = select_brief(
        clusters
    )

    markets = build_markets(
        clusters
    )

    generated = datetime.now(
        timezone.utc
    ).isoformat()

    payload = {
        "version":
            "5.3",

        "generated_at":
            generated,

        "article_count":
            len(rows),

        "cluster_count":
            len(clusters),

        "brief_count":
            len(top),

        "noise_filtered":
            noise_filtered,

        "stale_filtered":
            stale_filtered,

        "clustering_mode":
            "editorial-markets-v5.3",

        "summary_mode":
            "source-brief",

        "sources":
            health,

        "top":
            top,

        "clusters":
            clusters,

        "markets":
            markets,
    }

    (
        DATA
        / "latest.json"
    ).write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            separators=(
                ",",
                ":",
            ),
        ),
        encoding="utf-8",
    )


    # ========================================================
    # DAILY ARCHIVE
    # ========================================================

    local = datetime.now(
        ZoneInfo(TZ)
    )

    date = (
        local
        .date()
        .isoformat()
    )

    archive_file = (
        ARCHIVE
        / f"{date}.json"
    )

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
                    "date":
                        date,

                    "created_at":
                        generated,

                    "top":
                        top,
                },
                ensure_ascii=False,
                separators=(
                    ",",
                    ":",
                ),
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

    (
        DATA
        / "archives.json"
    ).write_text(
        json.dumps(
            archives,
            ensure_ascii=False,
            separators=(
                ",",
                ":",
            ),
        ),
        encoding="utf-8",
    )


    # ========================================================
    # QA LOG
    # ========================================================

    healthy = sum(
        1
        for source
        in health
        if source["ok"]
    )

    failed = [
        source["source"]
        for source
        in health
        if not source["ok"]
    ]

    market_stories = [
        cluster
        for cluster in clusters
        if cluster["category"]
        in {
            "Indian Markets",
            "Global → India",
            "Companies & Earnings",
        }
    ]

    india_market = sum(
        1
        for x in market_stories
        if x["category"]
        == "Indian Markets"
    )

    global_india = sum(
        1
        for x in market_stories
        if x["category"]
        == "Global → India"
    )

    companies = sum(
        1
        for x in market_stories
        if x["category"]
        == "Companies & Earnings"
    )

    critical = sum(
        1
        for x in top
        if x["importance_label"]
        == "critical"
    )

    print(
        "\n"
        "============================================\n"
        "DAILY INTELLIGENCE V5.3\n"
        "============================================"
    )

    print(
        f"Useful articles:       {len(rows)}"
    )

    print(
        f"Clusters:              {len(clusters)}"
    )

    print(
        f"Brief stories:         {len(top)}"
    )

    print(
        f"Critical stories:      {critical}"
    )

    print(
        f"Indian Markets:        {india_market}"
    )

    print(
        f"Global -> India:       {global_india}"
    )

    print(
        f"Companies & Earnings:  {companies}"
    )

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
        f"Noise filtered:        {noise_filtered}"
    )

    print(
        f"Stale filtered:        {stale_filtered}"
    )

    print(
        f"Healthy sources:       "
        f"{healthy}/{len(health)}"
    )

    if failed:

        print(
            "\nFailed feeds:"
        )

        for source in failed:
            print(
                f"  - {source}"
            )

    print(
        "============================================\n"
    )


if __name__ == "__main__":
    asyncio.run(main())
