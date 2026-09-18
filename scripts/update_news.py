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
MAX_FEED_ITEMS = 35

MIN_CLUSTER_SCORE = 18
BRIEF_MIN_SCORE = 43

BRIEF_MIN = 5
BRIEF_MAX = 8


# ============================================================
# GOOGLE NEWS RSS HELPER
# Used only as an additional discovery feed.
# The linked article remains the publisher's article.
# ============================================================

def google_news_feed(query):
    return (
        "https://news.google.com/rss/search?"
        f"q={quote_plus(query)}"
        "&hl=en-IN&gl=IN&ceid=IN:en"
    )


# ============================================================
# SOURCES
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


    # ---------------- POLITICS ----------------

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


    # ---------------- INDIAN MARKETS ----------------

    {
        "name": "Indian Markets",
        "category": "Indian Markets",
        "url": google_news_feed(
            'India stock market Nifty Sensex SEBI RBI FII DII '
            'when:2d'
        ),
        "weight": 3,
        "primary": False,
    },

    {
        "name": "India Market Policy",
        "category": "Indian Markets",
        "url": google_news_feed(
            'India markets SEBI NSE BSE IPO mutual funds '
            'foreign investors when:2d'
        ),
        "weight": 3,
        "primary": False,
    },


    # ---------------- COMPANIES / EARNINGS ----------------

    {
        "name": "India Companies & Earnings",
        "category": "Companies & Earnings",
        "url": google_news_feed(
            'India company earnings results acquisition merger IPO '
            'NSE BSE when:2d'
        ),
        "weight": 3,
        "primary": False,
    },


    # ---------------- GLOBAL → INDIA ----------------

    {
        "name": "Global Market Drivers",
        "category": "Global → India",
        "url": google_news_feed(
            'Federal Reserve US yields dollar crude oil OPEC China '
            'global markets India when:2d'
        ),
        "weight": 3,
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
# LANGUAGE RULES
# ============================================================

STOP = set("""
the a an and or but if then of to in on for from by with at as
is are was were be been this that these those it its their his
her our your into over after before amid says said say new latest
live update updates news report reports how why what who when where
could would should will can may more about than up down out off
today yesterday breaking exclusive explained india indian
""".split())


POLITICS = re.compile(
    r"\b("
    r"prime minister|president|parliament|lok sabha|rajya sabha|"
    r"bjp|congress|election|electoral|minister|cabinet|opposition|"
    r"coalition|chief minister|governor|legislation|political party|"
    r"campaign|manifesto"
    r")\b",
    re.I,
)


AI_RE = re.compile(
    r"\b("
    r"artificial intelligence|generative ai|machine learning|"
    r"large language model|llm|openai|chatgpt|anthropic|claude|"
    r"gemini|deepmind|agentic|foundation model|ai model|ai agent"
    r")\b",
    re.I,
)


MACRO = re.compile(
    r"\b("
    r"inflation|interest rate|repo rate|central bank|rbi|"
    r"federal reserve|fed rate|gdp|economic growth|fiscal|monetary|"
    r"currency|rupee|employment|unemployment|budget|deficit|"
    r"bond yield|bond yields|liquidity|current account|trade deficit|"
    r"open market operation|omo"
    r")\b",
    re.I,
)


GEO = re.compile(
    r"\b("
    r"war|ceasefire|military|airstrike|missile|nuclear|sanction|"
    r"sanctions|nato|gaza|israel|iran|ukraine|russia|china|taiwan|"
    r"houthi|red sea|invasion|peace talks|border conflict"
    r")\b",
    re.I,
)


SCIENCE = re.compile(
    r"\b("
    r"climate|emissions|global warming|space mission|nasa|physics|"
    r"quantum|genome|scientists|researchers|discovery|telescope|"
    r"asteroid|renewable energy|clinical trial"
    r")\b",
    re.I,
)


# ============================================================
# MARKETS
# ============================================================

INDIAN_MARKETS = re.compile(
    r"\b("
    r"nifty|sensex|nse|bse|sebi|dalal street|stock market|"
    r"equity market|equities|fii|fiis|dii|diis|foreign investors|"
    r"mutual fund|market cap|market capitalisation|market capitalization|"
    r"ipo|listing|shares|benchmark index"
    r")\b",
    re.I,
)


COMPANY_EVENT = re.compile(
    r"\b("
    r"quarterly results|earnings|revenue|profit|net profit|"
    r"operating profit|ebitda|guidance|acquisition|acquires|merger|"
    r"stake sale|buyback|rights issue|fundraise|fund raising|"
    r"ipo|listing|demerger|order book"
    r")\b",
    re.I,
)


CRUDE = re.compile(
    r"\b("
    r"brent|crude oil|oil prices|opec|opec\+|oil supply|"
    r"oil production"
    r")\b",
    re.I,
)


FED = re.compile(
    r"\b("
    r"federal reserve|fed rate|fed rates|jerome powell|"
    r"us interest rates|rate cut|rate hike"
    r")\b",
    re.I,
)


US_YIELDS = re.compile(
    r"\b("
    r"treasury yield|treasury yields|us 10-year|10-year yield|"
    r"bond yields|us yields"
    r")\b",
    re.I,
)


DOLLAR = re.compile(
    r"\b("
    r"dollar index|dxy|strong dollar|dollar rises|dollar falls|"
    r"us dollar"
    r")\b",
    re.I,
)


CHINA = re.compile(
    r"\b("
    r"china economy|chinese economy|china growth|china stimulus|"
    r"china property|chinese demand|beijing stimulus"
    r")\b",
    re.I,
)


TRADE = re.compile(
    r"\b("
    r"tariff|tariffs|trade war|export ban|export controls|"
    r"trade restrictions|import duty|trade agreement"
    r")\b",
    re.I,
)


SHIPPING = re.compile(
    r"\b("
    r"red sea|shipping disruption|shipping costs|freight rates|"
    r"strait of hormuz|suez canal|container rates"
    r")\b",
    re.I,
)


SEMICONDUCTORS = re.compile(
    r"\b("
    r"semiconductor|semiconductors|chip export|chip exports|"
    r"nvidia|advanced chips|chip restrictions"
    r")\b",
    re.I,
)


# ============================================================
# NOISE
# ============================================================

CRIME = re.compile(
    r"\b("
    r"murder|murdered|stabbed|stabbing|shot dead|rape|raped|"
    r"robbery|robbed|kidnap|kidnapped|body found|dead body|"
    r"domestic dispute|road rage|assaulted"
    r")\b",
    re.I,
)


SYSTEMIC_CASUALTY = re.compile(
    r"\b("
    r"terror|terrorist|war|airstrike|bombing|earthquake|tsunami|"
    r"cyclone|hurricane|flood|wildfire|industrial disaster|"
    r"train crash|plane crash|mass shooting|stampede|"
    r"public health emergency"
    r")\b",
    re.I,
)


ENTERTAINMENT = re.compile(
    r"\b("
    r"bollywood|actor|actress|celebrity|movie review|box office|"
    r"trailer|web series|reality show|fashion|wedding photos|"
    r"influencer|dating rumours|dating rumors"
    r")\b",
    re.I,
)


SPORTS = re.compile(
    r"\b("
    r"cricket|ipl|football match|premier league|champions league|"
    r"tennis|wimbledon|us open|fifa|scorecard|wickets"
    r")\b",
    re.I,
)


LIFESTYLE = re.compile(
    r"\b("
    r"horoscope|zodiac|recipe|beauty tips|weight loss tips|"
    r"relationship tips|viral hack"
    r")\b",
    re.I,
)


CLICKBAIT = re.compile(
    r"\b("
    r"you won't believe|internet reacts|netizens react|"
    r"breaks internet|goes viral|must watch|shocking video|"
    r"fans react|stuns fans"
    r")\b",
    re.I,
)


POLITICAL_THEATRE = re.compile(
    r"\b("
    r"slams|hits out|lashes out|takes dig|mocks|taunts|"
    r"fires back|war of words|sparks row|demands apology"
    r")\b",
    re.I,
)


# ============================================================
# HIGH CONSEQUENCE
# ============================================================

SYSTEMIC = re.compile(
    r"\b("
    r"supreme court|parliament|cabinet|central bank|rbi|sebi|"
    r"regulator|regulation|policy|legislation|law|bill|budget|"
    r"tax|tariff|sanctions|interest rate|inflation|gdp|liquidity|"
    r"financial system|banking system|trade agreement|merger|"
    r"acquisition|bankruptcy|default|antitrust|national security|"
    r"ceasefire|military|nuclear|election result|referendum|"
    r"drug approval|scientific discovery"
    r")\b",
    re.I,
)


LARGE_SCALE = re.compile(
    r"\b("
    r"billion|trillion|lakh crore|nationwide|millions|"
    r"record high|record low|systemic|state of emergency"
    r")\b",
    re.I,
)


CRITICAL_EVENT = re.compile(
    r"\b("
    r"war declared|invasion|nuclear attack|nuclear strike|"
    r"major terror attack|state of emergency|sovereign default|"
    r"banking crisis|financial crisis|market crash|"
    r"emergency rate cut|emergency rate hike|"
    r"nationwide lockdown|constitutional crisis"
    r")\b",
    re.I,
)


# ============================================================
# TEXT HELPERS
# ============================================================

TAG_RE = re.compile(r"<[^>]+>")


def clean_html(value):
    text = TAG_RE.sub(
        " ",
        unescape(value or "")
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    ).strip()

    junk = [
        r"read more.*$",
        r"click here.*$",
        r"continue reading.*$",
        r"subscribe to.*$",
        r"the post .* first appeared.*$",
    ]

    for pattern in junk:
        text = re.sub(
            pattern,
            "",
            text,
            flags=re.I
        ).strip()

    return text


def normalized(text):
    text = clean_html(text).lower()

    text = re.sub(
        r"\b("
        r"live|breaking|latest|update|updates|"
        r"exclusive|explained"
        r")\b",
        " ",
        text
    )

    text = re.sub(
        r"[^a-z0-9 ]",
        " ",
        text
    )

    return re.sub(
        r"\s+",
        " ",
        text
    ).strip()


def words(text):
    return [
        word
        for word in normalized(text).split()
        if len(word) > 2
        and word not in STOP
    ]


def vector(text):
    return Counter(words(text))


def cosine(a, b):
    if not a or not b:
        return 0

    dot = sum(
        a[key] * b.get(key, 0)
        for key in a
    )

    na = math.sqrt(
        sum(x * x for x in a.values())
    )

    nb = math.sqrt(
        sum(x * x for x in b.values())
    )

    if not na or not nb:
        return 0

    return dot / (na * nb)


def parse_date(value):
    if not value:
        return datetime.now(
            timezone.utc
        ).isoformat()

    try:
        dt = parsedate_to_datetime(
            value.strip()
        )

        if not dt.tzinfo:
            dt = dt.replace(
                tzinfo=timezone.utc
            )

        return dt.astimezone(
            timezone.utc
        ).isoformat()

    except Exception:
        pass

    try:
        dt = datetime.fromisoformat(
            value.strip().replace(
                "Z",
                "+00:00"
            )
        )

        if not dt.tzinfo:
            dt = dt.replace(
                tzinfo=timezone.utc
            )

        return dt.astimezone(
            timezone.utc
        ).isoformat()

    except Exception:
        return datetime.now(
            timezone.utc
        ).isoformat()


def age_hours(value):
    try:
        dt = datetime.fromisoformat(
            value.replace(
                "Z",
                "+00:00"
            )
        )

        return max(
            0,
            (
                datetime.now(timezone.utc)
                - dt
            ).total_seconds()
            / 3600
        )

    except Exception:
        return 999


def text_of(node, names):
    for child in list(node):
        tag = (
            child.tag
            .split("}")[-1]
            .lower()
        )

        if (
            tag in names
            and child.text
        ):
            return child.text

    return ""


def stable_key(title):
    raw = " ".join(
        words(title)[:14]
    )

    return hashlib.sha1(
        raw.encode()
    ).hexdigest()[:20]


# ============================================================
# FEED PARSER
# ============================================================

def parse_feed(data):
    root = ET.fromstring(data)

    output = []

    for node in root.iter():
        tag = (
            node.tag
            .split("}")[-1]
            .lower()
        )

        if tag not in {
            "item",
            "entry"
        }:
            continue

        title = text_of(
            node,
            {"title"}
        )

        description = text_of(
            node,
            {
                "description",
                "summary",
                "content",
                "encoded"
            }
        )

        date = text_of(
            node,
            {
                "pubdate",
                "published",
                "updated",
                "date"
            }
        )

        link = text_of(
            node,
            {"link"}
        )

        if not link:
            for child in list(node):
                child_tag = (
                    child.tag
                    .split("}")[-1]
                    .lower()
                )

                if (
                    child_tag == "link"
                    and child.attrib.get("href")
                ):
                    link = child.attrib["href"]
                    break

        title = clean_html(title)
        description = clean_html(
            description
        )

        if title and link:
            output.append({
                "title": title,
                "description": description,
                "url": link.strip(),
                "published_at": parse_date(date),
            })

    return output[:MAX_FEED_ITEMS]


async def fetch(client, source):
    checked = datetime.now(
        timezone.utc
    ).isoformat()

    try:
        response = await client.get(
            source["url"]
        )

        response.raise_for_status()

        rows = parse_feed(
            response.content
        )

        for row in rows:
            row.update({
                "source": source["name"],
                "source_weight": source["weight"],
                "base_category": source["category"],
                "primary_source": source.get(
                    "primary",
                    False
                ),
            })

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
            "error": str(exc)[:160],
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

    base = article[
        "base_category"
    ]

    # Preserve explicit market discovery feeds.
    if base in {
        "Indian Markets",
        "Global → India",
        "Companies & Earnings"
    }:
        return base

    if (
        COMPANY_EVENT.search(text)
        and INDIAN_MARKETS.search(text)
    ):
        return "Companies & Earnings"

    if (
        INDIAN_MARKETS.search(text)
        and base in {
            "Business & Micro",
            "Macro Economics"
        }
    ):
        return "Indian Markets"

    if (
        AI_RE.search(text)
        and base not in {
            "Indian Politics",
            "World Politics",
            "Geopolitics"
        }
    ):
        return "AI"

    if (
        MACRO.search(text)
        and base not in {
            "Geopolitics",
            "World Politics"
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
        if SYSTEMIC_CASUALTY.search(text):
            penalty += 5
        else:
            penalty += 65

    return penalty


def should_drop(article):
    return (
        noise_penalty(article)
        >= 60
    )


# ============================================================
# MARKET IMPACT
# ============================================================

def market_context(text):
    """
    Describes a transmission channel.

    It does NOT predict whether Indian equities
    will rise or fall.
    """

    channels = []
    explanations = []

    if CRUDE.search(text):
        channels.append("Crude oil")

        explanations.append(
            "Sustained changes in crude prices can affect "
            "India's import bill, inflation, the rupee and "
            "rate expectations."
        )

    if FED.search(text):
        channels.append("Fed")

        explanations.append(
            "US monetary-policy expectations can influence "
            "global funding conditions, foreign portfolio flows "
            "and valuation-sensitive Indian assets."
        )

    if US_YIELDS.search(text):
        channels.append("US yields")

        explanations.append(
            "Changes in US Treasury yields can alter the relative "
            "attractiveness of emerging-market assets and global "
            "cost-of-capital conditions."
        )

    if DOLLAR.search(text):
        channels.append("Dollar / INR")

        explanations.append(
            "Broad dollar moves can affect the rupee, imported "
            "costs and foreign-investor positioning."
        )

    if CHINA.search(text):
        channels.append("China")

        explanations.append(
            "Changes in Chinese growth and demand can transmit "
            "through commodities, metals, global manufacturing "
            "and regional risk appetite."
        )

    if TRADE.search(text):
        channels.append("Trade")

        explanations.append(
            "Trade restrictions and tariff changes can affect "
            "exporters, supply chains and sector-level competitiveness."
        )

    if SHIPPING.search(text):
        channels.append("Shipping")

        explanations.append(
            "Shipping disruptions can raise freight and import costs "
            "and affect companies dependent on global supply chains."
        )

    if SEMICONDUCTORS.search(text):
        channels.append("Semiconductors")

        explanations.append(
            "Global chip restrictions and supply changes can affect "
            "technology supply chains, electronics manufacturing and "
            "semiconductor investment."
        )

    if not explanations:
        return None, []

    # Keep cards compact.
    return explanations[0], channels[:4]


# ============================================================
# ARTICLE SIGNAL
# ============================================================

def article_signal(article):
    text = (
        article["title"]
        + " "
        + article["description"]
    )

    score = (
        article.get(
            "source_weight",
            3
        ) * 4
    )

    age = age_hours(
        article["published_at"]
    )

    score += max(
        0,
        28 - age * 0.7
    )

    if article.get(
        "primary_source"
    ):
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
        0
    )

    impact, channels = market_context(
        text
    )

    if (
        article["category"]
        == "Global → India"
        and channels
    ):
        score += 8

    score -= noise_penalty(
        article
    )

    return round(score, 2)


# ============================================================
# CLUSTERING
# ============================================================

def cluster_articles(rows):
    rows = sorted(
        rows,
        key=lambda x:
            x["published_at"],
        reverse=True
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

            try:
                a_time = datetime.fromisoformat(
                    article[
                        "published_at"
                    ].replace(
                        "Z",
                        "+00:00"
                    )
                )

                b_time = datetime.fromisoformat(
                    candidate[
                        "published_at"
                    ].replace(
                        "Z",
                        "+00:00"
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
                candidate_vector
            )

            a_words = set(
                words(article["title"])
            )

            b_words = set(
                words(candidate["title"])
            )

            common = (
                a_words & b_words
            )

            overlap = (
                len(common)
                / max(
                    1,
                    min(
                        len(a_words),
                        len(b_words)
                    )
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
                members.append(
                    candidate
                )

                used.add(j)

        clusters.append(
            make_cluster(members)
        )

    return sorted(
        clusters,
        key=lambda x: (
            x["importance"],
            x["published_at"]
        ),
        reverse=True
    )


# ============================================================
# CLUSTER BUILDING
# ============================================================

CATEGORY_PRIORITY = [
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
                len(
                    x.get(
                        "description",
                        ""
                    )
                ),
                700
            ) / 100
            + (
                6
                if x.get(
                    "primary_source"
                )
                else 0
            )
        )
    )


def choose_description(members):
    options = []

    for article in members:

        description = clean_html(
            article.get(
                "description",
                ""
            )
        )

        if len(description) < 45:
            continue

        score = (
            article_signal(article)
            + min(
                len(description),
                700
            ) / 80
        )

        options.append(
            (
                score,
                description
            )
        )

    if not options:
        return ""

    options.sort(
        reverse=True,
        key=lambda x: x[0]
    )

    text = options[0][1]

    if len(text) > 850:
        text = (
            text[:847]
            .rsplit(" ", 1)[0]
            + "…"
        )

    return text


def critical_label(
    members,
    score,
    source_count
):
    """
    Critical requires an exceptional event,
    not merely a large score.

    This deliberately makes CRITICAL rare.
    """

    combined = " ".join(
        (
            x["title"]
            + " "
            + x["description"]
        )
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
    primary = choose_primary(
        members
    )

    category = choose_category(
        members
    )

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
            len(sources) - 1
        ) * 5
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
        (
            x["title"]
            + " "
            + x["description"]
        )
        for x in members
    )

    impact, channels = market_context(
        combined_text
    )

    # Only expose market context on relevant categories.
    if category not in {
        "Indian Markets",
        "Global → India",
        "Companies & Earnings",
        "Macro Economics",
        "Geopolitics"
    }:
        impact = None
        channels = []

    published = max(
        x["published_at"]
        for x in members
    )

    label = critical_label(
        members,
        importance,
        len(sources)
    )

    return {
        "cluster_key":
            stable_key(
                primary["title"]
            ),

        "title":
            primary["title"],

        "description":
            choose_description(
                members
            ),

        "brief":
            choose_description(
                members
            ),

        "category":
            category,

        "published_at":
            published,

        "importance":
            round(
                importance,
                2
            ),

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
                reverse=True
            ),

        "market_impact":
            impact,

        "market_channels":
            channels,

        # Reserved for future genuine update detection.
        "is_developing":
            False,

        "summary_mode":
            "source-brief",
    }


# ============================================================
# BRIEF DIVERSITY
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
    """
    Select only stories that clear the significance bar.

    We prefer diversity, but significance always comes first.
    """

    eligible = [
        cluster
        for cluster in clusters
        if (
            cluster[
                "importance_label"
            ] in {
                "critical",
                "significant"
            }
            and cluster[
                "importance"
            ] >= BRIEF_MIN_SCORE
        )
    ]

    selected = []
    category_counts = Counter()
    family_counts = Counter()

    # Pass 1:
    # one strong story from different families.
    for cluster in eligible:

        category = cluster[
            "category"
        ]

        family = (
            CATEGORY_FAMILIES.get(
                category,
                category
            )
        )

        if family_counts[
            family
        ] >= 1:
            continue

        selected.append(
            cluster
        )

        category_counts[
            category
        ] += 1

        family_counts[
            family
        ] += 1

        if len(selected) >= 6:
            break


    # Pass 2:
    # allow genuinely strong second stories.
    if len(selected) < BRIEF_MAX:

        for cluster in eligible:

            if cluster in selected:
                continue

            category = cluster[
                "category"
            ]

            family = (
                CATEGORY_FAMILIES.get(
                    category,
                    category
                )
            )

            if (
                category_counts[
                    category
                ]
                >= CATEGORY_CAPS.get(
                    category,
                    1
                )
            ):
                continue

            if (
                family_counts[
                    family
                ] >= 2
            ):
                continue

            selected.append(
                cluster
            )

            category_counts[
                category
            ] += 1

            family_counts[
                family
            ] += 1

            if (
                len(selected)
                >= BRIEF_MAX
            ):
                break


    # If fewer than five genuinely significant
    # stories exist, we do NOT fill with junk.
    return selected[:BRIEF_MAX]


# ============================================================
# MAIN
# ============================================================

async def main():

    headers = {
        "User-Agent":
            "DailyIntelligence/5.1 "
            "(personal RSS reader)"
    }

    timeout = httpx.Timeout(
        20.0,
        connect=10.0
    )

    async with httpx.AsyncClient(
        headers=headers,
        follow_redirects=True,
        timeout=timeout
    ) as client:

        results = await asyncio.gather(
            *[
                fetch(
                    client,
                    source
                )
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
        datetime.now(
            timezone.utc
        )
        - timedelta(
            hours=LOOKBACK_HOURS
        )
    )


    unique = {}

    noise_filtered = 0
    stale_filtered = 0


    for article in incoming:

        article["category"] = classify(
            article
        )

        try:
            published = (
                datetime.fromisoformat(
                    article[
                        "published_at"
                    ].replace(
                        "Z",
                        "+00:00"
                    )
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


        article[
            "signal_score"
        ] = article_signal(
            article
        )


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
        if (
            cluster[
                "importance"
            ]
            >= MIN_CLUSTER_SCORE
        )
    ]


    top = select_brief(
        clusters
    )


    generated = datetime.now(
        timezone.utc
    ).isoformat()


    payload = {
        "version": "5.1",

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
            "signal-diversity-v5.1",

        "summary_mode":
            "source-brief",

        "sources":
            health,

        "top":
            top,

        "clusters":
            clusters,
    }


    (
        DATA / "latest.json"
    ).write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            separators=(
                ",",
                ":"
            )
        ),
        encoding="utf-8"
    )


    # ========================================================
    # DAILY ARCHIVE
    # ========================================================

    local = datetime.now(
        ZoneInfo(TZ)
    )

    date = (
        local.date()
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
                    ":"
                )
            ),
            encoding="utf-8"
        )


    # ========================================================
    # ARCHIVE INDEX
    # ========================================================

    archives = []

    for path in sorted(
        ARCHIVE.glob(
            "*.json"
        ),
        reverse=True
    )[:60]:

        try:
            archive = json.loads(
                path.read_text(
                    encoding="utf-8"
                )
            )

            archives.append({
                "date":
                    archive.get(
                        "date",
                        path.stem
                    ),

                "created_at":
                    archive.get(
                        "created_at"
                    ),

                "count":
                    len(
                        archive.get(
                            "top",
                            []
                        )
                    ),
            })

        except Exception:
            pass


    (
        DATA / "archives.json"
    ).write_text(
        json.dumps(
            archives,
            ensure_ascii=False,
            separators=(
                ",",
                ":"
            )
        ),
        encoding="utf-8"
    )


    healthy = sum(
        1
        for source in health
        if source["ok"]
    )


    market_count = sum(
        1
        for cluster in clusters
        if cluster["category"] in {
            "Indian Markets",
            "Global → India",
            "Companies & Earnings"
        }
    )


    critical_count = sum(
        1
        for cluster in top
        if (
            cluster[
                "importance_label"
            ]
            == "critical"
        )
    )


    print(
        "\n"
        "============================================\n"
        "DAILY INTELLIGENCE V5.1\n"
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
        f"Critical stories:      {critical_count}"
    )

    print(
        f"Market stories:        {market_count}"
    )

    print(
        f"Noise filtered:        {noise_filtered}"
    )

    print(
        f"Stale filtered:        {stale_filtered}"
    )

    print(
        f"Healthy sources:       {healthy}/{len(health)}"
    )

    print(
        "============================================\n"
    )


if __name__ == "__main__":
    asyncio.run(main())
