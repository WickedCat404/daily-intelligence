from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
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
TOP_BRIEF_COUNT = 8


# ============================================================
# SOURCES
# ============================================================

SOURCES = [
    dict(
        name="The Hindu India",
        category="India",
        url="https://www.thehindu.com/news/national/feeder/default.rss",
        weight=5,
        primary=False,
    ),
    dict(
        name="Indian Express India",
        category="India",
        url="https://indianexpress.com/section/india/feed/",
        weight=5,
        primary=False,
    ),
    dict(
        name="NDTV India",
        category="India",
        url="https://feeds.feedburner.com/ndtvnews-india-news",
        weight=3,
        primary=False,
    ),
    dict(
        name="Indian Express Political Pulse",
        category="Indian Politics",
        url="https://indianexpress.com/section/political-pulse/feed/",
        weight=5,
        primary=False,
    ),
    dict(
        name="Economic Times Politics",
        category="Indian Politics",
        url="https://economictimes.indiatimes.com/news/politics/rssfeeds/1977021501.cms",
        weight=3,
        primary=False,
    ),
    dict(
        name="The Hindu Politics",
        category="Indian Politics",
        url="https://www.thehindu.com/news/national/politics/feeder/default.rss",
        weight=5,
        primary=False,
    ),
    dict(
        name="BBC World",
        category="World",
        url="https://feeds.bbci.co.uk/news/world/rss.xml",
        weight=5,
        primary=False,
    ),
    dict(
        name="AP Top Stories",
        category="World",
        url="https://feeds.apnews.com/apnews/topstories",
        weight=5,
        primary=False,
    ),
    dict(
        name="Al Jazeera",
        category="Geopolitics",
        url="https://www.aljazeera.com/xml/rss/all.xml",
        weight=4,
        primary=False,
    ),
    dict(
        name="BBC Politics",
        category="World Politics",
        url="https://feeds.bbci.co.uk/news/politics/rss.xml",
        weight=4,
        primary=False,
    ),
    dict(
        name="Mint Economy",
        category="Macro Economics",
        url="https://www.livemint.com/rss/economy",
        weight=4,
        primary=False,
    ),
    dict(
        name="RBI",
        category="Macro Economics",
        url="https://www.rbi.org.in/pressreleases_rss.aspx",
        weight=5,
        primary=True,
    ),
    dict(
        name="Economic Times",
        category="Business & Micro",
        url="https://economictimes.indiatimes.com/rssfeedstopstories.cms",
        weight=3,
        primary=False,
    ),
    dict(
        name="Mint Companies",
        category="Business & Micro",
        url="https://www.livemint.com/rss/companies",
        weight=4,
        primary=False,
    ),
    dict(
        name="OpenAI",
        category="AI",
        url="https://openai.com/news/rss.xml",
        weight=5,
        primary=True,
    ),
    dict(
        name="Google DeepMind",
        category="AI",
        url="https://deepmind.google/blog/rss.xml",
        weight=5,
        primary=True,
    ),
    dict(
        name="TechCrunch AI",
        category="AI",
        url="https://techcrunch.com/category/artificial-intelligence/feed/",
        weight=3,
        primary=False,
    ),
    dict(
        name="The Verge AI",
        category="AI",
        url="https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
        weight=3,
        primary=False,
    ),
    dict(
        name="MIT Technology Review AI",
        category="AI",
        url="https://www.technologyreview.com/topic/artificial-intelligence/feed/",
        weight=5,
        primary=False,
    ),
    dict(
        name="Hugging Face",
        category="AI",
        url="https://huggingface.co/blog/feed.xml",
        weight=4,
        primary=True,
    ),
    dict(
        name="The Verge",
        category="Technology",
        url="https://www.theverge.com/rss/index.xml",
        weight=3,
        primary=False,
    ),
    dict(
        name="TechCrunch",
        category="Technology",
        url="https://techcrunch.com/feed/",
        weight=3,
        primary=False,
    ),
    dict(
        name="Quanta Magazine",
        category="Science & Climate",
        url="https://www.quantamagazine.org/feed/",
        weight=5,
        primary=False,
    ),
    dict(
        name="MIT News",
        category="Science & Climate",
        url="https://news.mit.edu/rss/feed",
        weight=4,
        primary=True,
    ),
    dict(
        name="The Ken",
        category="The Ken",
        url="https://the-ken.com/feed/",
        weight=5,
        primary=False,
    ),
]


# ============================================================
# CLASSIFICATION
# ============================================================

POLITICS = re.compile(
    r"\b("
    r"prime minister|president|parliament|lok sabha|rajya sabha|"
    r"bjp|congress|election|electoral|minister|cabinet|government|"
    r"opposition|coalition|chief minister|governor|legislation|"
    r"political party|campaign|manifesto"
    r")\b",
    re.I,
)

INDIA = re.compile(
    r"\b("
    r"india|indian|delhi|mumbai|bengaluru|bangalore|hyderabad|"
    r"chennai|kolkata|maharashtra|karnataka|tamil nadu|telangana|"
    r"uttar pradesh|gujarat|rajasthan|kerala|modi|rbi"
    r")\b",
    re.I,
)

AI = re.compile(
    r"\b("
    r"artificial intelligence|generative ai|machine learning|"
    r"large language model|llm|openai|chatgpt|anthropic|claude|"
    r"gemini|deepmind|agentic|foundation model|neural network|"
    r"hugging face|ai model|ai agent"
    r")\b",
    re.I,
)

GEO = re.compile(
    r"\b("
    r"war|conflict|sanction|sanctions|nato|united nations|gaza|"
    r"israel|iran|ukraine|russia|china|taiwan|houthi|red sea|"
    r"diplomacy|diplomatic|ceasefire|military|missile|nuclear|"
    r"border dispute|peace talks|invasion|airstrike"
    r")\b",
    re.I,
)

MACRO = re.compile(
    r"\b("
    r"inflation|interest rate|interest rates|central bank|rbi|"
    r"federal reserve|gdp|economic growth|fiscal|monetary|currency|"
    r"rupee|dollar|employment|unemployment|budget|deficit|"
    r"bond yield|bond yields|crude oil|trade deficit|current account|"
    r"repo rate|liquidity|open market operation|omo"
    r")\b",
    re.I,
)

SCIENCE = re.compile(
    r"\b("
    r"climate|global warming|emissions|space mission|nasa|physics|"
    r"quantum|biology|genome|scientists|researchers|discovery|"
    r"energy transition|renewable energy|solar energy|battery technology|"
    r"clinical trial|telescope|asteroid"
    r")\b",
    re.I,
)


# ============================================================
# HIGH-SIGNAL / LOW-SIGNAL LANGUAGE
# ============================================================

SYSTEMIC = re.compile(
    r"\b("
    r"government|supreme court|high court|parliament|cabinet|"
    r"central bank|rbi|regulator|regulation|policy|legislation|"
    r"law|bill|budget|tax|tariff|sanction|interest rate|inflation|"
    r"gdp|recession|liquidity|banking system|financial system|"
    r"trade agreement|trade deal|merger|acquisition|ipo|"
    r"bankruptcy|default|antitrust|competition commission|"
    r"sebi|rbi|court ruling|constitutional|national security|"
    r"ceasefire|military|nuclear|election result|referendum|"
    r"ai model|chip|semiconductor|drug approval|clinical trial|"
    r"scientific discovery|climate agreement"
    r")\b",
    re.I,
)

MAJOR_SCALE = re.compile(
    r"\b("
    r"billion|trillion|crore|lakh crore|nationwide|national|"
    r"millions|million people|massive|record high|record low|"
    r"statewide|global|worldwide|systemic|emergency|"
    r"state of emergency"
    r")\b",
    re.I,
)

CRIME_NOISE = re.compile(
    r"\b("
    r"murder|murdered|killed|stabbed|stabbing|shooting|shot dead|"
    r"rape|raped|assault|robbery|robbed|theft|kidnap|kidnapped|"
    r"body found|dead body|suicide|domestic dispute|"
    r"family dispute|road rage"
    r")\b",
    re.I,
)

MAJOR_CASUALTY_CONTEXT = re.compile(
    r"\b("
    r"terror|terrorist|terrorism|war|airstrike|bombing|"
    r"earthquake|tsunami|cyclone|hurricane|flood|wildfire|"
    r"industrial accident|building collapse|train crash|"
    r"plane crash|aviation accident|stampede|mass shooting|"
    r"military attack|missile attack|public health emergency"
    r")\b",
    re.I,
)

ENTERTAINMENT_NOISE = re.compile(
    r"\b("
    r"bollywood|actor|actress|celebrity|film star|movie review|"
    r"box office|trailer|web series|reality show|fashion|"
    r"wedding photos|viral video|influencer|instagram|"
    r"relationship rumours|dating rumours"
    r")\b",
    re.I,
)

SPORTS_NOISE = re.compile(
    r"\b("
    r"cricket|ipl|football match|premier league|champions league|"
    r"tennis|wimbledon|us open|australian open|fifa|"
    r"scorecard|match score|runs|wickets|goal scored"
    r")\b",
    re.I,
)

LIFESTYLE_NOISE = re.compile(
    r"\b("
    r"horoscope|zodiac|recipe|fashion tips|beauty tips|"
    r"weight loss tips|relationship tips|travel tips|"
    r"viral hack|food recipe"
    r")\b",
    re.I,
)

CLICKBAIT = re.compile(
    r"\b("
    r"you won't believe|internet reacts|netizens react|"
    r"breaks internet|goes viral|must watch|shocking video|"
    r"fans react|stuns fans|leaves internet divided"
    r")\b",
    re.I,
)

ROUTINE_POLITICAL_NOISE = re.compile(
    r"\b("
    r"slams|hits out|lashes out|takes dig|mocks|taunts|"
    r"fires back|war of words|sparks row|controversial remark|"
    r"demands apology|calls .* liar"
    r")\b",
    re.I,
)


# ============================================================
# TEXT HELPERS
# ============================================================

STOP = set(
    """
    the a an and or but if then of to in on for from by with at as
    is are was were be been this that these those it its their his
    her our your into over after before amid says said say new latest
    live update updates news report reports how why what who when where
    could would should will can may more about than up down out off
    today yesterday breaking exclusive explained
    """.split()
)

TAG_RE = re.compile(r"<[^>]+>")

JUNK_SUMMARY_PATTERNS = [
    re.compile(r"read more.*$", re.I),
    re.compile(r"click here.*$", re.I),
    re.compile(r"the post .* first appeared.*$", re.I),
    re.compile(r"continue reading.*$", re.I),
    re.compile(r"this article .* appeared.*$", re.I),
    re.compile(r"subscribe to .*$", re.I),
]


def clean_html(value):
    text = TAG_RE.sub(" ", unescape(value or ""))
    text = re.sub(r"\s+", " ", text).strip()

    for pattern in JUNK_SUMMARY_PATTERNS:
        text = pattern.sub("", text).strip()

    return text


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


def text_of(node, names):
    for child in list(node):
        tag = child.tag.split("}")[-1].lower()

        if tag in names and child.text:
            return child.text

    return ""


def normalized(text):
    text = clean_html(text).lower()

    text = re.sub(
        r"\b(live|breaking|latest|updates?|explained|exclusive)\b",
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

    dot = sum(
        a[key] * b.get(key, 0)
        for key in a
    )

    na = math.sqrt(
        sum(value * value for value in a.values())
    )

    nb = math.sqrt(
        sum(value * value for value in b.values())
    )

    if not na or not nb:
        return 0

    return dot / (na * nb)


def age_hours(iso):
    try:
        dt = datetime.fromisoformat(
            iso.replace("Z", "+00:00")
        )

        return max(
            0,
            (
                datetime.now(timezone.utc) - dt
            ).total_seconds() / 3600,
        )

    except Exception:
        return 999


def stable_key(title, published):
    raw = (
        (published or "")[:10]
        + "|"
        + " ".join(words(title)[:12])
    )

    return hashlib.sha1(
        raw.encode()
    ).hexdigest()[:20]


# ============================================================
# FEED PARSING
# ============================================================

def parse_feed(data):
    root = ET.fromstring(data)
    output = []

    for node in root.iter():
        tag = node.tag.split("}")[-1].lower()

        if tag not in {"item", "entry"}:
            continue

        title = text_of(
            node,
            {"title"},
        )

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

        link = text_of(
            node,
            {"link"},
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
# CATEGORY CLASSIFICATION
# ============================================================

def classify(article):
    text = (
        article["title"]
        + " "
        + article["description"]
    )

    base = article["base_category"]

    if (
        AI.search(text)
        and base
        not in {
            "Indian Politics",
            "World Politics",
            "Geopolitics",
        }
    ):
        return "AI"

    if (
        INDIA.search(text)
        and POLITICS.search(text)
    ):
        return "Indian Politics"

    if (
        GEO.search(text)
        and not INDIA.search(text)
    ):
        return "Geopolitics"

    if MACRO.search(text):
        return "Macro Economics"

    if (
        SCIENCE.search(text)
        and not AI.search(text)
    ):
        return "Science & Climate"

    return base


# ============================================================
# NOISE FILTER
# ============================================================

def noise_penalty(article):
    text = (
        article["title"]
        + " "
        + article["description"]
    )

    penalty = 0

    if ENTERTAINMENT_NOISE.search(text):
        penalty += 55

    if SPORTS_NOISE.search(text):
        penalty += 55

    if LIFESTYLE_NOISE.search(text):
        penalty += 60

    if CLICKBAIT.search(text):
        penalty += 45

    if ROUTINE_POLITICAL_NOISE.search(text):
        penalty += 28

    if CRIME_NOISE.search(text):
        if not (
            MAJOR_CASUALTY_CONTEXT.search(text)
            or SYSTEMIC.search(text)
            or MAJOR_SCALE.search(text)
        ):
            penalty += 55
        else:
            penalty += 5

    return penalty


def should_drop(article):
    penalty = noise_penalty(article)

    # Very strong noise can disappear entirely.
    if penalty >= 55:
        return True

    return False


# ============================================================
# ARTICLE SIGNAL
# ============================================================

def article_signal(article):
    text = (
        article["title"]
        + " "
        + article["description"]
    )

    score = 0.0

    # Source quality
    score += article.get(
        "source_weight",
        3,
    ) * 4

    # Recency
    age = age_hours(
        article["published_at"]
    )

    score += max(
        0,
        30 - age * 0.75,
    )

    # Primary / official source
    if article.get(
        "primary_source"
    ):
        score += 10

    # Systemic importance
    if SYSTEMIC.search(text):
        score += 18

    if MAJOR_SCALE.search(text):
        score += 10

    # Important subject areas
    category = article["category"]

    category_bonus = {
        "Indian Politics": 7,
        "Macro Economics": 9,
        "Geopolitics": 9,
        "AI": 8,
        "India": 6,
        "World": 5,
        "World Politics": 5,
        "Business & Micro": 5,
        "Science & Climate": 6,
        "Technology": 4,
        "The Ken": 3,
    }

    score += category_bonus.get(
        category,
        0,
    )

    score -= noise_penalty(article)

    return round(score, 2)


# ============================================================
# CLUSTERING
# ============================================================

def cluster_articles(rows):
    rows = sorted(
        rows,
        key=lambda item:
            item["published_at"],
        reverse=True,
    )

    used = set()
    clusters = []

    for i, article in enumerate(rows):
        if i in used:
            continue

        article_vector = vector(
            article["title"]
            + " "
            + article["description"][:500]
        )

        members = [article]
        used.add(i)

        article_time = datetime.fromisoformat(
            article["published_at"].replace(
                "Z",
                "+00:00",
            )
        )

        for j, candidate in enumerate(rows):
            if j in used:
                continue

            candidate_time = datetime.fromisoformat(
                candidate[
                    "published_at"
                ].replace(
                    "Z",
                    "+00:00",
                )
            )

            if abs(
                (
                    article_time
                    - candidate_time
                ).total_seconds()
            ) > 72 * 3600:
                continue

            candidate_vector = vector(
                candidate["title"]
                + " "
                + candidate[
                    "description"
                ][:500]
            )

            similarity = cosine(
                article_vector,
                candidate_vector,
            )

            a_words = set(
                words(article["title"])
            )

            b_words = set(
                words(candidate["title"])
            )

            overlap_words = (
                a_words & b_words
            )

            overlap = (
                len(overlap_words)
                / max(
                    1,
                    min(
                        len(a_words),
                        len(b_words),
                    ),
                )
            )

            threshold = 0.31

            if (
                article["category"]
                != candidate["category"]
            ):
                threshold += 0.05

            if (
                similarity >= threshold
                or (
                    overlap >= 0.48
                    and len(
                        overlap_words
                    ) >= 3
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
        key=lambda item: (
            item["importance"],
            item["published_at"],
        ),
        reverse=True,
    )


# ============================================================
# CLUSTER SCORING
# ============================================================

CATEGORY_PRIORITY = [
    "Indian Politics",
    "Macro Economics",
    "India",
    "Geopolitics",
    "World Politics",
    "World",
    "AI",
    "Business & Micro",
    "Science & Climate",
    "Technology",
    "The Ken",
]


def cluster_category(members):
    categories = [
        member["category"]
        for member in members
    ]

    for category in CATEGORY_PRIORITY:
        if category in categories:
            return category

    return members[0]["category"]


def choose_primary(members):
    def primary_score(article):
        description_quality = min(
            len(
                article.get(
                    "description",
                    "",
                )
            ),
            900,
        ) / 100

        return (
            article_signal(article)
            + (
                8
                if article.get(
                    "primary_source"
                )
                else 0
            )
            + description_quality
        )

    return max(
        members,
        key=primary_score,
    )


def best_description(members):
    candidates = []

    for article in members:
        description = clean_html(
            article.get(
                "description",
                ""
            )
        )

        if len(description) < 40:
            continue

        # Avoid descriptions that simply repeat headline.
        title_norm = normalized(
            article["title"]
        )

        desc_norm = normalized(
            description
        )

        repeated = (
            title_norm
            and desc_norm.startswith(
                title_norm
            )
        )

        score = (
            article_signal(article)
            + min(
                len(description),
                700,
            ) / 80
            + (
                5
                if article.get(
                    "primary_source"
                )
                else 0
            )
            - (
                8
                if repeated
                else 0
            )
        )

        candidates.append(
            (
                score,
                description,
            )
        )

    if not candidates:
        return ""

    candidates.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    description = candidates[0][1]

    # Backend safety cap. Frontend also caps by words.
    if len(description) > 850:
        description = (
            description[:847]
            .rsplit(" ", 1)[0]
            + "…"
        )

    return description


def make_cluster(members):
    primary = choose_primary(
        members
    )

    category = cluster_category(
        members
    )

    sources = sorted(
        set(
            member["source"]
            for member in members
        )
    )

    primary_sources = sorted(
        set(
            member["source"]
            for member in members
            if member.get(
                "primary_source"
            )
        )
    )

    best_article_score = max(
        article_signal(member)
        for member in members
    )

    # Multi-source confirmation is valuable,
    # but capped so volume alone cannot dominate.
    confirmation_bonus = min(
        18,
        max(
            0,
            len(sources) - 1
        ) * 6,
    )

    primary_bonus = (
        8
        if primary_sources
        else 0
    )

    cluster_penalty = min(
        noise_penalty(member)
        for member in members
    )

    importance = (
        best_article_score
        + confirmation_bonus
        + primary_bonus
        - cluster_penalty * 0.35
    )

    description = best_description(
        members
    )

    return {
        "cluster_key": stable_key(
            primary["title"],
            primary["published_at"],
        ),
        "title": primary["title"],
        "description": description,
        "category": category,
        "published_at": max(
            member["published_at"]
            for member in members
        ),
        "importance": round(
            importance,
            2,
        ),
        "source_count": len(
            sources
        ),
        "sources": sources,
        "primary_sources": primary_sources,
        "primary": primary,
        "articles": sorted(
            members,
            key=lambda item:
                item["published_at"],
            reverse=True,
        ),
        "summary_mode": "source-brief",
    }


# ============================================================
# BRIEF SELECTION
# ============================================================

def category_cap(category):
    # Prevent one subject from swallowing the briefing.
    caps = {
        "Indian Politics": 2,
        "India": 2,
        "Macro Economics": 2,
        "Geopolitics": 2,
        "World": 2,
        "World Politics": 1,
        "AI": 2,
        "Business & Micro": 2,
        "Technology": 1,
        "Science & Climate": 1,
        "The Ken": 1,
    }

    return caps.get(
        category,
        1,
    )


def select_top_brief(clusters):
    """
    The Brief is deliberately selective.

    We do not fill eight slots merely because
    eight slots exist.
    """

    selected = []
    counts = {}

    # Strong threshold first.
    strong = [
        cluster
        for cluster in clusters
        if cluster["importance"] >= 42
    ]

    for cluster in strong:
        category = cluster[
            "category"
        ]

        if counts.get(
            category,
            0,
        ) >= category_cap(category):
            continue

        selected.append(
            cluster
        )

        counts[category] = (
            counts.get(
                category,
                0,
            )
            + 1
        )

        if (
            len(selected)
            >= TOP_BRIEF_COUNT
        ):
            break

    # Ensure the briefing isn't absurdly empty
    # when feeds are unusually quiet.
    if len(selected) < 4:
        for cluster in clusters:
            if cluster in selected:
                continue

            if (
                cluster["importance"]
                < 30
            ):
                continue

            category = cluster[
                "category"
            ]

            if counts.get(
                category,
                0,
            ) >= category_cap(category):
                continue

            selected.append(
                cluster
            )

            counts[category] = (
                counts.get(
                    category,
                    0,
                )
                + 1
            )

            if len(selected) >= 4:
                break

    return selected


# ============================================================
# MAIN
# ============================================================

async def main():
    headers = {
        "User-Agent":
            "DailyIntelligence/5.0 "
            "personal-news-reader"
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
        for _, status in results
    ]

    rows = [
        article
        for batch, _ in results
        for article in batch
    ]

    cutoff = (
        datetime.now(timezone.utc)
        - timedelta(
            hours=LOOKBACK_HOURS
        )
    )

    unique = {}

    dropped_noise = 0

    for article in rows:
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

            if published < cutoff:
                continue

        except Exception:
            pass

        if should_drop(article):
            dropped_noise += 1
            continue

        article["signal_score"] = (
            article_signal(article)
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

    # Remove clusters that remain extremely weak
    # after aggregation.
    clusters = [
        cluster
        for cluster in clusters
        if cluster["importance"] >= 18
    ]

    top = select_top_brief(
        clusters
    )

    generated = datetime.now(
        timezone.utc
    ).isoformat()

    payload = {
        "version": "5.0",
        "generated_at": generated,
        "article_count": len(rows),
        "cluster_count": len(
            clusters
        ),
        "noise_filtered": dropped_noise,
        "clustering_mode":
            "lexical-cosine",
        "summary_mode":
            "source-brief",
        "sources": health,
        "top": top,
        "clusters": clusters,
    }

    (
        DATA / "latest.json"
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
        local.date().isoformat()
    )

    archive_file = (
        ARCHIVE
        / f"{date}.json"
    )

    # Capture one stable daily briefing
    # after 6:15 AM India time.
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
                    "created_at":
                        generated,
                    "top": top,
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
                        archive["date"],
                    "created_at":
                        archive[
                            "created_at"
                        ],
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
        DATA / "archives.json"
    ).write_text(
        json.dumps(
            archives,
            separators=(
                ",",
                ":",
            ),
        ),
        encoding="utf-8",
    )


    healthy = sum(
        1
        for source in health
        if source["ok"]
    )

    print(
        f"V5 generated: "
        f"{len(rows)} useful articles, "
        f"{len(clusters)} clusters, "
        f"{len(top)} Brief stories, "
        f"{dropped_noise} noisy articles filtered, "
        f"{healthy}/{len(health)} sources healthy."
    )


if __name__ == "__main__":
    asyncio.run(main())
