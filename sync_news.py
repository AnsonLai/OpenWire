"""
sync_news.py

Jamstack pre-generator script for the News Aggregator.
Fetches Google News RSS and weaves in high-quality direct RSS feeds
(BBC News, CBC News, CTV News, ABC News, Global News, etc.) using
smart deduplication, fair-share source quotas, and cadence-paced interleaving.

Extracts canonical article URLs, captures real high-res images from RSS enclosures
or OpenGraph meta tags, applies paywall bypass strategies, and exports static JSON
files per topic into `data/` and `news.json`.

Run this script locally or in a scheduled GitHub Action to populate your
Azure Storage $web container for instant, zero-CORS loading with 40-50 rich headlines!
"""

import os
import json
import re
import html
import tempfile
import argparse
from datetime import datetime, timezone
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

SKIP_PAGE_IMAGES = False

# Optional: decode Google News links if googlenewsdecoder is available
try:
    from googlenewsdecoder import new_decoderv1
    HAS_DECODER = True
except ImportError:
    HAS_DECODER = False

# Supported Topic Feeds (Primary Google News curated anchors)
TOPICS = {
    "top": "https://news.google.com/rss",
    "latest": "https://news.google.com/rss",
    "ai": "https://news.google.com/rss/search?q=%22Artificial+Intelligence%22+OR+AI+when%3A3d",
    "canada": "https://news.google.com/rss?hl=en-CA&gl=CA&ceid=CA:en",
    "vancouver": "https://news.google.com/rss/search?q=Vancouver&hl=en-CA&gl=CA&ceid=CA:en",
    "bc": "https://news.google.com/rss/search?q=%22British+Columbia%22&hl=en-CA&gl=CA&ceid=CA:en",
    "business": "https://news.google.com/rss/headlines/section/topic/BUSINESS",
    "technology": "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY",
    "world": "https://news.google.com/rss/headlines/section/topic/WORLD",
    "science": "https://news.google.com/rss/headlines/section/topic/SCIENCE",
    "entertainment": "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT",
    "sports": "https://news.google.com/rss/headlines/section/topic/SPORTS",
}

# High-Quality Secondary Direct RSS Feeds mapped by topic
# Each feed has a fair-share limit to augment the list without overwhelming it (7-10 quota)
SECONDARY_FEEDS = {
    "top": [
        {"name": "CBC News", "domain": "cbc.ca", "url": "https://www.cbc.ca/cmlink/rss-topstories", "limit": 10},
        {"name": "Global News", "domain": "globalnews.ca", "url": "https://globalnews.ca/feed/", "limit": 8},
        {"name": "New York Times", "domain": "nytimes.com", "url": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", "limit": 10},
        {"name": "BBC News", "domain": "bbc.co.uk", "url": "https://feeds.bbci.co.uk/news/rss.xml", "limit": 10},
        {"name": "CNBC", "domain": "cnbc.com", "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html", "limit": 8},
        {"name": "Fox News", "domain": "foxnews.com", "url": "http://feeds.foxnews.com/foxnews/latest", "limit": 8},
        {"name": "Politico", "domain": "politico.com", "url": "https://rss.politico.com/playbook.xml", "limit": 7},
        {"name": "ABC News", "domain": "abcnews.go.com", "url": "https://abcnews.go.com/abcnews/topstories", "limit": 8},
        {"name": "Al Jazeera", "domain": "aljazeera.com", "url": "https://www.aljazeera.com/xml/rss/all.xml", "limit": 8},
    ],
    "latest": [
        {"name": "CBC News", "domain": "cbc.ca", "url": "https://www.cbc.ca/cmlink/rss-topstories", "limit": 10},
        {"name": "Global News", "domain": "globalnews.ca", "url": "https://globalnews.ca/feed/", "limit": 8},
        {"name": "New York Times", "domain": "nytimes.com", "url": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", "limit": 10},
        {"name": "BBC News", "domain": "bbc.co.uk", "url": "https://feeds.bbci.co.uk/news/rss.xml", "limit": 10},
        {"name": "CNBC", "domain": "cnbc.com", "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html", "limit": 8},
        {"name": "ABC News", "domain": "abcnews.go.com", "url": "https://abcnews.go.com/abcnews/topstories", "limit": 8},
        {"name": "Fox News", "domain": "foxnews.com", "url": "http://feeds.foxnews.com/foxnews/latest", "limit": 8},
        {"name": "Al Jazeera", "domain": "aljazeera.com", "url": "https://www.aljazeera.com/xml/rss/all.xml", "limit": 8},
    ],
    "canada": [
        {"name": "CBC Canada", "domain": "cbc.ca", "url": "https://www.cbc.ca/cmlink/rss-canada", "limit": 10},
        {"name": "Global News Canada", "domain": "globalnews.ca", "url": "https://globalnews.ca/feed/", "limit": 8},
    ],
    "vancouver": [
        {"name": "CBC British Columbia", "domain": "cbc.ca", "url": "https://www.cbc.ca/cmlink/rss-canada-britishcolumbia", "limit": 10},
        {"name": "Global News BC", "domain": "globalnews.ca", "url": "https://globalnews.ca/bc/feed/", "limit": 9},
    ],
    "bc": [
        {"name": "CBC British Columbia", "domain": "cbc.ca", "url": "https://www.cbc.ca/cmlink/rss-canada-britishcolumbia", "limit": 10},
        {"name": "Global News BC", "domain": "globalnews.ca", "url": "https://globalnews.ca/bc/feed/", "limit": 9},
    ],
    "business": [
        {"name": "Investing.com", "domain": "investing.com", "url": "https://www.investing.com/rss/news.rss", "limit": 9},
        {"name": "Bloomberg Quicktake", "domain": "youtube.com", "url": "https://www.youtube.com/feeds/videos.xml?user=Bloomberg", "limit": 8},
        {"name": "CNBC", "domain": "cnbc.com", "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html", "limit": 8},
        {"name": "BBC Business", "domain": "bbc.co.uk", "url": "https://feeds.bbci.co.uk/news/business/rss.xml", "limit": 8},
        {"name": "CBC Business", "domain": "cbc.ca", "url": "https://www.cbc.ca/cmlink/rss-business", "limit": 8},
    ],
    "technology": [
        {"name": "Ars Technica", "domain": "arstechnica.com", "url": "http://feeds.arstechnica.com/arstechnica/index", "limit": 9},
        {"name": "The Verge", "domain": "youtube.com", "url": "https://www.youtube.com/feeds/videos.xml?user=TheVerge", "limit": 8},
        {"name": "Gizmodo", "domain": "gizmodo.com", "url": "https://gizmodo.com/rss", "limit": 8},
        {"name": "Hacker News", "domain": "ycombinator.com", "url": "https://news.ycombinator.com/rss", "limit": 8},
        {"name": "Slashdot", "domain": "slashdot.org", "url": "http://rss.slashdot.org/Slashdot/slashdotMain", "limit": 8},
        {"name": "BBC Technology", "domain": "bbc.co.uk", "url": "https://feeds.bbci.co.uk/news/technology/rss.xml", "limit": 8},
        {"name": "CBC Tech", "domain": "cbc.ca", "url": "https://www.cbc.ca/cmlink/rss-technology", "limit": 7},
    ],
    "world": [
        {"name": "BBC World", "domain": "bbc.co.uk", "url": "http://feeds.bbci.co.uk/news/world/rss.xml", "limit": 10},
        {"name": "The Guardian World", "domain": "theguardian.com", "url": "https://www.theguardian.com/world/rss", "limit": 9},
        {"name": "New York Times World", "domain": "nytimes.com", "url": "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "limit": 9},
        {"name": "Al Jazeera", "domain": "aljazeera.com", "url": "https://www.aljazeera.com/xml/rss/all.xml", "limit": 8},
        {"name": "CNN World", "domain": "cnn.com", "url": "http://rss.cnn.com/rss/edition_world.rss", "limit": 8},
        {"name": "CNBC International", "domain": "cnbc.com", "url": "https://www.cnbc.com/id/100727362/device/rss/rss.html", "limit": 7},
        {"name": "CBC World", "domain": "cbc.ca", "url": "https://www.cbc.ca/cmlink/rss-world", "limit": 7},
        {"name": "ABC World News", "domain": "abcnews.go.com", "url": "https://abcnews.go.com/abcnews/internationalheadlines", "limit": 7},
    ],
    "science": [
        {"name": "BBC Science", "domain": "bbc.co.uk", "url": "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "limit": 9},
        {"name": "Ars Technica Science", "domain": "arstechnica.com", "url": "http://feeds.arstechnica.com/arstechnica/index", "limit": 8},
    ],
    "entertainment": [
        {"name": "BBC Entertainment", "domain": "bbc.co.uk", "url": "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", "limit": 8},
        {"name": "ABC Entertainment", "domain": "abcnews.go.com", "url": "https://abcnews.go.com/abcnews/entertainmentheadlines", "limit": 8},
    ],
    "sports": [
        {"name": "CBC Sports", "domain": "cbc.ca", "url": "https://www.cbc.ca/cmlink/rss-sports", "limit": 9},
        {"name": "ABC Sports", "domain": "abcnews.go.com", "url": "https://abcnews.go.com/abcnews/sportsheadlines", "limit": 8},
    ],
}

# Proven domain strategies
DOMAIN_RULES = {
    # Free / Open Access (Direct)
    "bbc.com": {"strategy": "direct", "label": "BBC News"},
    "bbc.co.uk": {"strategy": "direct", "label": "BBC News"},
    "npr.org": {"strategy": "direct", "label": "NPR"},
    "apnews.com": {"strategy": "direct", "label": "Associated Press"},
    "reuters.com": {"strategy": "direct", "label": "Reuters"},
    "theguardian.com": {"strategy": "direct", "label": "The Guardian"},
    "cnn.com": {"strategy": "direct", "label": "CNN"},
    "arstechnica.com": {"strategy": "direct", "label": "Ars Technica"},
    "theverge.com": {"strategy": "direct", "label": "The Verge"},
    "techcrunch.com": {"strategy": "direct", "label": "TechCrunch"},
    "aljazeera.com": {"strategy": "direct", "label": "Al Jazeera"},
    "cbsnews.com": {"strategy": "direct", "label": "CBS News"},
    "nbcnews.com": {"strategy": "direct", "label": "NBC News"},
    "abcnews.go.com": {"strategy": "direct", "label": "ABC News"},
    "usatoday.com": {"strategy": "direct", "label": "USA Today"},
    "politico.com": {"strategy": "direct", "label": "Politico"},
    "globalnews.ca": {"strategy": "direct", "label": "Global News"},
    "cbc.ca": {"strategy": "direct", "label": "CBC News"},
    "ctvnews.ca": {"strategy": "direct", "label": "CTV News"},
    "citynews.ca": {"strategy": "direct", "label": "CityNews"},
    "thestar.com": {"strategy": "direct", "label": "Toronto Star"},
    "cnbc.com": {"strategy": "direct", "label": "CNBC"},
    "investing.com": {"strategy": "direct", "label": "Investing.com"},
    "foxnews.com": {"strategy": "direct", "label": "Fox News"},
    "slashdot.org": {"strategy": "direct", "label": "Slashdot"},
    "ycombinator.com": {"strategy": "direct", "label": "Hacker News"},
    "youtube.com": {"strategy": "direct", "label": "YouTube"},
    "gizmodo.com": {"strategy": "direct", "label": "Gizmodo"},

    # Standard Bypass
    "vancouversun.com": {"strategy": "smry", "label": "Vancouver Sun"},
    "theprovince.com": {"strategy": "smry", "label": "The Province"},
    "timescolonist.com": {"strategy": "smry", "label": "Times Colonist"},
    "nytimes.com": {"strategy": "smry", "label": "New York Times"},
    "theatlantic.com": {"strategy": "smry", "label": "The Atlantic"},
    "washingtonpost.com": {"strategy": "smry", "label": "Washington Post"},
    "medium.com": {"strategy": "smry", "label": "Medium"},
    "newyorker.com": {"strategy": "smry", "label": "The New Yorker"},
    "businessinsider.com": {"strategy": "removepaywall", "label": "Business Insider"},
    "wired.com": {"strategy": "removepaywall", "label": "Wired"},

    # Hard Paywall requiring Archive scan
    "wsj.com": {"strategy": "archive_is", "label": "Wall Street Journal"},
    "bloomberg.com": {"strategy": "archive_is", "label": "Bloomberg"},
    "ft.com": {"strategy": "archive_is", "label": "Financial Times"},
    "economist.com": {"strategy": "archive_is", "label": "The Economist"},
    "barrons.com": {"strategy": "archive_is", "label": "Barron's"},
    "theinformation.com": {"strategy": "archive_is", "label": "The Information"},
    "telegraph.co.uk": {"strategy": "archive_is", "label": "The Telegraph"},
}

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

# Common XML namespaces in RSS feeds
MEDIA_NAMESPACES = {
    "media": "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc": "http://purl.org/dc/elements/1.1/",
}

def normalize_domain(url_or_domain: str) -> str:
    """Extracts base domain from a URL or hostname."""
    if not url_or_domain:
        return ""
    host = url_or_domain.lower().strip()
    if host.startswith("http://") or host.startswith("https://"):
        try:
            parsed = urllib.parse.urlparse(host)
            host = parsed.netloc or parsed.path
        except Exception:
            pass
    host = host.split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host

def get_domain_rule(domain: str) -> dict:
    """Looks up matching domain rule."""
    if domain in DOMAIN_RULES:
        return {"domain": domain, **DOMAIN_RULES[domain]}
    for known_domain, rule in DOMAIN_RULES.items():
        if domain.endswith("." + known_domain):
            return {"domain": domain, **rule}
    return {"domain": domain, "strategy": "direct", "label": domain}

def normalize_article_url(raw_url: str) -> str:
    """Strips tracking parameters, fragments, and trailing slashes for deduplication."""
    if not raw_url:
        return ""
    try:
        parsed = urllib.parse.urlparse(raw_url)
        clean_host = parsed.hostname.lower().replace("www.", "") if parsed.hostname else ""
        clean_path = parsed.path.rstrip("/")
        
        # Filter tracking query parameters
        tracking_params = {
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'ref', 'source', 'cmpid', 'mc_cid', 'mc_eid', 'fbclid', 'gclid'
        }
        query_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=False)
        clean_query = urllib.parse.urlencode([(k, v) for k, v in query_pairs if k.lower() not in tracking_params])

        return f"https://{clean_host}{clean_path}" + (f"?{clean_query}" if clean_query else "")
    except Exception:
        return raw_url.strip().lower().rstrip("/")

def normalize_title_for_comparison(raw_title: str) -> str:
    """Cleans a title for similarity comparison by stripping publisher suffixes and punctuation."""
    if not raw_title:
        return ""
    title = raw_title.lower()
    # Strip common publisher suffixes: " - BBC News", " | CBC News", etc.
    title = re.sub(r"\s+[-–—|]\s+[a-z0-9\s.]+$", "", title)
    # Strip punctuation and collapse whitespace
    title = re.sub(r"[^\w\s]", " ", title)
    return re.sub(r"\s+", " ", title).strip()

def calculate_title_similarity(title_a: str, title_b: str) -> float:
    """Computes token-based Jaccard similarity between two headlines."""
    norm_a = normalize_title_for_comparison(title_a)
    norm_b = normalize_title_for_comparison(title_b)

    if norm_a == norm_b:
        return 1.0
    if not norm_a or not norm_b:
        return 0.0

    tokens_a = {w for w in norm_a.split(" ") if len(w) > 2}
    tokens_b = {w for w in norm_b.split(" ") if len(w) > 2}

    if not tokens_a or not tokens_b:
        return 0.0

    intersection = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)
    return intersection / union if union > 0 else 0.0

def is_duplicate_article(art_a: dict, art_b: dict) -> bool:
    """Checks whether two articles are duplicates based on URL or title similarity."""
    url_a = normalize_article_url(art_a.get("originalUrl") or art_a.get("targetUrl", ""))
    url_b = normalize_article_url(art_b.get("originalUrl") or art_b.get("targetUrl", ""))
    if url_a and url_b and url_a == url_b:
        return True

    similarity = calculate_title_similarity(art_a.get("title", ""), art_b.get("title", ""))
    if similarity >= 0.75:
        return True

    # Same-domain matching: lower threshold and keyword overlap for same publisher
    domain_a = normalize_domain(art_a.get("domain") or art_a.get("source", ""))
    domain_b = normalize_domain(art_b.get("domain") or art_b.get("source", ""))
    if domain_a and domain_b and domain_a == domain_b:
        if similarity >= 0.25:
            return True
        norm_a = normalize_title_for_comparison(art_a.get("title", ""))
        norm_b = normalize_title_for_comparison(art_b.get("title", ""))
        words_a = {w for w in norm_a.split(" ") if len(w) >= 4}
        words_b = {w for w in norm_b.split(" ") if len(w) >= 4}
        if len(words_a & words_b) >= 2:
            return True

    return False

def merge_article_metadata(primary_art: dict, secondary_art: dict) -> dict:
    """Merges matching articles, retaining the richest image and canonical URL."""
    merged = dict(primary_art)
    if not merged.get("imageUrl") and secondary_art.get("imageUrl"):
        merged["imageUrl"] = secondary_art["imageUrl"]
    if ("news.google.com" in merged.get("originalUrl", "")) and secondary_art.get("originalUrl"):
        merged["originalUrl"] = secondary_art["originalUrl"]
        merged["targetUrl"] = secondary_art.get("targetUrl") or secondary_art["originalUrl"]
    return merged

# Regex patterns indicating non-editorial images (logos, icons, placeholders, avatars)
REJECT_PATTERNS = [
    re.compile(r"\.svg(?:\?|#|$)", re.I),
    re.compile(r"\.ico(?:\?|#|$)", re.I),
    re.compile(r"^data:image", re.I),
    re.compile(r"(?:^|[_\-/.])(?:fav)?icon(?:s)?(?:[_\-/.]|\d|$)", re.I),
    re.compile(r"(?:^|[_\-/.])logo(?:s)?(?:[_\-/.]|\d|$)", re.I),
    re.compile(r"(?:^|[_\-/.])avatar(?:s)?(?:[_\-/.]|\d|$)", re.I),
    re.compile(r"(?:^|[_\-/.])badge(?:s)?(?:[_\-/.]|\d|$)", re.I),
    re.compile(r"(?:^|[_\-/.])(placeholder|spacer|pixel|tracking|spinner|sprite|1x1|clear\.gif|blank\.gif)", re.I),
    re.compile(r"akamai-logo", re.I),
    re.compile(r"apple-touch-icon", re.I),
    re.compile(r"masthead", re.I),
]

def is_valid_article_image(url: str, width: int = None, height: int = None) -> bool:
    """Validates that a candidate image is a genuine editorial photo and not a logo/favicon."""
    if not url or not isinstance(url, str):
        return False
    clean = url.strip()
    if not clean.startswith("http://") and not clean.startswith("https://"):
        return False

    for pat in REJECT_PATTERNS:
        if pat.search(clean):
            return False

    if width is not None and height is not None and width > 0 and height > 0:
        # Minimum resolution requirement for news editorial photos
        if width < 280 or height < 160:
            return False
        aspect_ratio = width / height
        # Square or near-square images under 450px are almost always publisher logos/crests
        if 0.85 <= aspect_ratio <= 1.15 and width <= 450:
            return False
        # Extreme aspect ratios (thin banners or skyscraper ads)
        if aspect_ratio < 0.6 or aspect_ratio > 3.2:
            return False

    return True

def extract_page_image(url: str) -> str:
    """
    Extracts high-resolution editorial photo from article page while strictly filtering out
    publisher logos, favicons, site icons, author avatars, and tracking pixels.
    Tiers: OpenGraph -> Twitter -> JSON-LD Article -> Microdata -> Figure <img> -> Microlink Fallback.
    """
    if not url or "news.google.com" in url:
        return ""

    def test_candidate(candidate: str, width: int = None, height: int = None) -> str:
        if not candidate:
            return ""
        cand = html.unescape(candidate.strip())
        if cand.startswith("//"):
            cand = "https:" + cand
        elif cand.startswith("/") or not cand.startswith("http"):
            try:
                cand = urllib.parse.urljoin(url, cand)
            except Exception:
                return ""
        return cand if is_valid_article_image(cand, width, height) else ""

    chunk = ""
    req = urllib.request.Request(url, headers=BROWSER_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=4.5) as resp:
            chunk = resp.read(400000).decode("utf-8", errors="ignore")
    except Exception:
        pass

    if chunk:
        # Tier 1: OpenGraph meta tags
        og_matches = re.finditer(r'<meta[^>]+(?:property|name)=["\'](?:og:image|og:image:url|og:image:secure_url)["\'][^>]+content=["\']([^"\']+)["\']', chunk, re.I)
        for m in og_matches:
            c = test_candidate(m.group(1))
            if c:
                return c

        og_rev = re.finditer(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|og:image:url|og:image:secure_url)["\']', chunk, re.I)
        for m in og_rev:
            c = test_candidate(m.group(1))
            if c:
                return c

        # Tier 2: Twitter card meta tags
        tw_matches = re.finditer(r'<meta[^>]+(?:property|name)=["\'](?:twitter:image|twitter:image:src)["\'][^>]+content=["\']([^"\']+)["\']', chunk, re.I)
        for m in tw_matches:
            c = test_candidate(m.group(1))
            if c:
                return c

        tw_rev = re.finditer(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:twitter:image|twitter:image:src)["\']', chunk, re.I)
        for m in tw_rev:
            c = test_candidate(m.group(1))
            if c:
                return c

        # Tier 3: Schema.org JSON-LD scripts
        json_ld_matches = re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>', chunk, re.I)
        for m in json_ld_matches:
            try:
                data = json.loads(m.group(1))
                items = data if isinstance(data, list) else [data]
                for it in items:
                    if not isinstance(it, dict):
                        continue
                    t = str(it.get("@type", "")).lower()
                    if "article" in t or "news" in t or "report" in t or "webpage" in t:
                        img_field = it.get("image")
                        if isinstance(img_field, str):
                            c = test_candidate(img_field)
                            if c:
                                return c
                        elif isinstance(img_field, list):
                            for sub in img_field:
                                u = sub if isinstance(sub, str) else (sub.get("url") if isinstance(sub, dict) else "")
                                w = sub.get("width") if isinstance(sub, dict) else None
                                h = sub.get("height") if isinstance(sub, dict) else None
                                c = test_candidate(u, w, h)
                                if c:
                                    return c
                        elif isinstance(img_field, dict) and img_field.get("url"):
                            c = test_candidate(img_field.get("url"), img_field.get("width"), img_field.get("height"))
                            if c:
                                return c

                        thumb = it.get("thumbnailUrl")
                        if isinstance(thumb, str):
                            c = test_candidate(thumb)
                            if c:
                                return c
            except Exception:
                pass

        # Tier 4: link rel="image_src" or meta itemprop="image"
        link_matches = re.finditer(r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)["\']', chunk, re.I)
        for m in link_matches:
            c = test_candidate(m.group(1))
            if c:
                return c

        itemprop_matches = re.finditer(r'<meta[^>]+itemprop=["\']image["\'][^>]+content=["\']([^"\']+)["\']', chunk, re.I)
        for m in itemprop_matches:
            c = test_candidate(m.group(1))
            if c:
                return c

        # Tier 5: In-article <figure> or <article> <img> tags
        article_blocks = re.findall(r'<(?:article|figure|main)[^>]*>([\s\S]*?)</(?:article|figure|main)>', chunk, re.I)
        for block in article_blocks:
            img_tags = re.findall(r'<img[^>]+(?:src|data-src|srcset)=["\']([^"\']+)["\'][^>]*>', block, re.I)
            for raw_src in img_tags:
                c = test_candidate(raw_src)
                if c:
                    return c

    # Tier 6: Microlink fallback API for protected sites (403 Forbidden, Cloudflare, SPAs)
    try:
        ml_url = f"https://api.microlink.io/?url={urllib.parse.quote(url)}"
        ml_req = urllib.request.Request(ml_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(ml_req, timeout=3.5) as ml_resp:
            ml_data = json.loads(ml_resp.read().decode("utf-8"))
            if ml_data.get("status") == "success":
                img_obj = ml_data.get("data", {}).get("image")
                if isinstance(img_obj, dict):
                    cand_url = img_obj.get("url", "")
                    w = img_obj.get("width")
                    h = img_obj.get("height")
                    c = test_candidate(cand_url, w, h)
                    if c:
                        return c
    except Exception:
        pass

    return ""

# Backwards compatibility alias
extract_og_image = extract_page_image

def build_article_record(topic_name: str, idx: int, title: str, source_name: str, canonical_url: str, pub_date: str, image_url: str) -> dict:
    """Constructs a normalized article record with domain strategy applied."""
    domain = normalize_domain(canonical_url)
    rule = get_domain_rule(domain)
    strategy = rule["strategy"]

    article = {
        "id": f"art-{topic_name}-{idx}",
        "title": title.strip(),
        "source": rule.get("label") or source_name,
        "domain": domain,
        "originalUrl": canonical_url,
        "pubDate": pub_date,
        "status": "free",
        "badge": "Free",
        "targetUrl": canonical_url,
        "archiveUrl": f"https://archive.is/newest/{canonical_url}",
        "imageUrl": image_url,
    }

    if strategy == "direct":
        article["status"] = "free"
        article["badge"] = "Free"
        article["targetUrl"] = canonical_url
    elif strategy == "smry":
        article["status"] = "bypassed"
        article["badge"] = "SMRY"
        article["targetUrl"] = f"https://smry.ai/{canonical_url}"
    elif strategy == "removepaywall":
        article["status"] = "bypassed"
        article["badge"] = "RemovePaywall"
        article["targetUrl"] = f"https://www.removepaywall.com/search?url={urllib.parse.quote(canonical_url)}"
    elif strategy in ("archive_is", "wayback"):
        article["status"] = "bypassed"
        article["badge"] = "Archive.is" if strategy == "archive_is" else "Wayback"
        article["targetUrl"] = f"https://archive.is/newest/{canonical_url}" if strategy == "archive_is" else f"https://web.archive.org/web/*/{canonical_url}"

    return article

def process_single_google_item(item, topic_name: str, idx: int) -> dict:
    """Processes a single Google News RSS item: decodes link and extracts image."""
    raw_title = item.find("title").text if item.find("title") is not None else ""
    link = item.find("link").text if item.find("link") is not None else ""
    pub_date = item.find("pubDate").text if item.find("pubDate") is not None else ""
    source_elem = item.find("source")

    source_name = source_elem.text if source_elem is not None else ""
    source_url = source_elem.attrib.get("url", "") if source_elem is not None else ""

    if " - " in raw_title:
        title, pub = raw_title.rsplit(" - ", 1)
        source_name = pub.strip() or source_name
    else:
        title = raw_title

    canonical_url = link
    if HAS_DECODER and "news.google.com" in link:
        try:
            dec = new_decoderv1(link)
            if dec.get("status"):
                canonical_url = dec.get("decoded_url")
        except Exception:
            pass

    image_url = extract_image_from_xml_item(item)
    if not image_url and not SKIP_PAGE_IMAGES:
        image_url = extract_og_image(canonical_url)
    return build_article_record(topic_name, idx, title, source_name, canonical_url, pub_date, image_url)

def extract_image_from_xml_item(item) -> str:
    """Extracts lead image from RSS item enclosure or media:content tags with 0ms network latency."""
    # 1. Check <enclosure url="..." type="image/..." />
    enclosure = item.find("enclosure")
    if enclosure is not None:
        url = enclosure.attrib.get("url", "")
        enc_type = enclosure.attrib.get("type", "")
        if url and ("image" in enc_type or re.search(r"\.(jpg|jpeg|png|webp)", url, re.I)):
            if is_valid_article_image(url):
                return url

    # 2. Check <media:content url="..." />
    media_content = item.find("media:content", MEDIA_NAMESPACES)
    if media_content is not None:
        url = media_content.attrib.get("url", "")
        w = int(media_content.attrib.get("width", 0)) if media_content.attrib.get("width", "").isdigit() else None
        h = int(media_content.attrib.get("height", 0)) if media_content.attrib.get("height", "").isdigit() else None
        if url and is_valid_article_image(url, w, h):
            return url

    # 3. Check <media:thumbnail url="..." />
    media_thumb = item.find("media:thumbnail", MEDIA_NAMESPACES)
    if media_thumb is not None:
        url = media_thumb.attrib.get("url", "")
        w = int(media_thumb.attrib.get("width", 0)) if media_thumb.attrib.get("width", "").isdigit() else None
        h = int(media_thumb.attrib.get("height", 0)) if media_thumb.attrib.get("height", "").isdigit() else None
        if url and is_valid_article_image(url, w, h):
            return url

    # 4. Check <media:group><media:thumbnail url="..." /> (YouTube Atom format)
    media_group = item.find("media:group", MEDIA_NAMESPACES)
    if media_group is not None:
        group_thumb = media_group.find("media:thumbnail", MEDIA_NAMESPACES)
        if group_thumb is not None and group_thumb.attrib.get("url"):
            url = group_thumb.attrib.get("url")
            if is_valid_article_image(url):
                return url

    return ""

def process_direct_feed(feed_cfg: dict, topic_name: str) -> list:
    """Fetches a secondary direct RSS or Atom feed (BBC, CBC, YouTube, Ars Technica) and extracts articles with native images."""
    feed_name = feed_cfg["name"]
    feed_url = feed_cfg["url"]
    feed_limit = feed_cfg.get("limit", 8)

    req = urllib.request.Request(feed_url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            xml_content = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"  [DIRECT FEED] Error fetching '{feed_name}': {e}")
        return []

    try:
        root = ET.fromstring(xml_content)
    except Exception as e:
        print(f"  [DIRECT FEED] XML parse error for '{feed_name}': {e}")
        return []

    items = root.findall(".//item")
    is_atom = False
    is_rdf = False

    if not items:
        # Check RDF / RSS 1.0 (e.g. Slashdot)
        rdf_ns = {"rss": "http://purl.org/rss/1.0/"}
        items = root.findall(".//rss:item", rdf_ns)
        if items:
            is_rdf = True

    if not items:
        # Check Atom <entry> elements (e.g. YouTube feeds)
        atom_ns = {"atom": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/"}
        items = root.findall(".//atom:entry", atom_ns) or root.findall(".//entry")
        if items:
            is_atom = True

    articles = []

    for idx, item in enumerate(items[:feed_limit * 2]):  # scan up to double limit to account for filtering
        if len(articles) >= feed_limit:
            break

        if is_atom:
            atom_ns = {"atom": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/"}
            title_elem = item.find("atom:title", atom_ns) if item.find("atom:title", atom_ns) is not None else item.find("title")
            link_elem = item.find("atom:link", atom_ns) if item.find("atom:link", atom_ns) is not None else item.find("link")
            pub_elem = item.find("atom:published", atom_ns) if item.find("atom:published", atom_ns) is not None else (item.find("atom:updated", atom_ns) or item.find("published"))

            raw_title = title_elem.text if title_elem is not None else ""
            link = link_elem.attrib.get("href", "") if link_elem is not None else (link_elem.text if link_elem is not None else "")
            pub_date = pub_elem.text if pub_elem is not None else ""
        elif is_rdf:
            rdf_ns = {"rss": "http://purl.org/rss/1.0/", "dc": "http://purl.org/dc/elements/1.1/"}
            raw_title = item.findtext("rss:title", namespaces=rdf_ns) or item.findtext("title") or ""
            link = item.findtext("rss:link", namespaces=rdf_ns) or item.findtext("link") or ""
            pub_date = item.findtext("dc:date", namespaces=rdf_ns) or item.findtext("pubDate") or ""
        else:
            title_elem = item.find("title")
            link_elem = item.find("link")
            pub_elem = item.find("pubDate")

            raw_title = title_elem.text if title_elem is not None else ""
            link = link_elem.text if link_elem is not None else ""
            pub_date = pub_elem.text if pub_elem is not None else ""

        if not raw_title or not link:
            continue

        clean_title = html.unescape(raw_title.strip())
        image_url = extract_image_from_xml_item(item)

        # Fallback to OG image extraction only if image is absent, limit allows, and not youtube
        if not image_url and not SKIP_PAGE_IMAGES and len(articles) < 3 and "youtube.com" not in link:
            image_url = extract_og_image(link)

        art_id = f"art-{topic_name}-{feed_cfg['domain'][:4]}-{idx}"
        art = build_article_record(topic_name, idx, clean_title, feed_name, link, pub_date, image_url)
        art["id"] = art_id
        articles.append(art)

    # For articles still missing an image (e.g. Al Jazeera, Politico), extract OG image concurrently
    missing_imgs = [a for a in articles if not a.get("imageUrl") and "youtube.com" not in a.get("originalUrl", "")]
    if missing_imgs and not SKIP_PAGE_IMAGES:
        with ThreadPoolExecutor(max_workers=min(len(missing_imgs), 6)) as executor:
            future_to_art = {executor.submit(extract_og_image, a["originalUrl"]): a for a in missing_imgs}
            for fut in future_to_art:
                try:
                    img = fut.result()
                    if img:
                        future_to_art[fut]["imageUrl"] = img
                except Exception:
                    pass

    print(f"  [DIRECT FEED] '{feed_name}' yielded {len(articles)} articles (images: {sum(1 for a in articles if a.get('imageUrl'))}).")
    return articles

def weave_feeds(primary_articles: list, secondary_feed_groups: list, lead_anchor_count=2, max_consecutive_per_domain=2, cadence_interval=2, max_total=60) -> list:
    """
    Weaves Google News and direct RSS feeds into a balanced magazine stream:
    1. Preserves Google News lead stories at positions 0-1 for the Hero Cover Story.
    2. Applies fair-share quotas to each secondary source (7-10 articles).
    3. Deduplicates incoming secondary items against the primary pool.
    4. Interleaves secondary feeds with cadence pacing (2 primary -> 1 secondary).
    5. Prevents domain clustering (max 2 consecutive from same domain).
    """
    if not secondary_feed_groups:
        return primary_articles[:max_total]

    # Deduplicate primary pool
    primary_pool = []
    seen_urls = set()
    for art in primary_articles:
        norm_url = normalize_article_url(art.get("originalUrl", ""))
        if not norm_url or norm_url not in seen_urls:
            if norm_url:
                seen_urls.add(norm_url)
            primary_pool.append(art)

    # Lead anchor stories (Hero + top 2-up)
    result = primary_pool[:lead_anchor_count]
    primary_pool = primary_pool[lead_anchor_count:]

    # Prepare secondary queues
    feed_queues = []
    for group in secondary_feed_groups:
        feed_cfg = group["feedConfig"]
        feed_limit = feed_cfg.get("limit", 8)
        capped_items = []

        for art in group.get("articles", []):
            if len(capped_items) >= feed_limit:
                break

            # Deduplicate against result and primary pool, enriching matching stories with direct image and canonical URL
            is_dupe = False
            for i in range(len(result)):
                if is_duplicate_article(result[i], art):
                    result[i] = merge_article_metadata(result[i], art)
                    is_dupe = True
                    break

            if not is_dupe:
                for i in range(len(primary_pool)):
                    if is_duplicate_article(primary_pool[i], art):
                        primary_pool[i] = merge_article_metadata(primary_pool[i], art)
                        is_dupe = True
                        break

            if not is_dupe:
                norm_url = normalize_article_url(art.get("originalUrl", ""))
                if not norm_url or norm_url not in seen_urls:
                    if norm_url:
                        seen_urls.add(norm_url)
                    capped_items.append(art)

        if capped_items:
            feed_queues.append({"name": feed_cfg["name"], "items": capped_items})

    def would_exceed_domain_limit(candidate: dict) -> bool:
        if len(result) < max_consecutive_per_domain:
            return False
        candidate_domain = normalize_domain(candidate.get("domain", ""))
        if not candidate_domain:
            return False
        return all(
            normalize_domain(result[-i].get("domain", "")) == candidate_domain
            for i in range(1, max_consecutive_per_domain + 1)
        )

    queue_idx = 0
    primary_since_secondary = 0

    while (primary_pool or any(q["items"] for q in feed_queues)) and len(result) < max_total:
        has_secondary = any(q["items"] for q in feed_queues)
        should_insert_secondary = has_secondary and (primary_since_secondary >= cadence_interval or not primary_pool)

        if should_insert_secondary:
            picked_article = None
            searched = 0
            while searched < len(feed_queues):
                cur_q = feed_queues[queue_idx]
                queue_idx = (queue_idx + 1) % len(feed_queues)
                searched += 1

                if cur_q["items"] and not would_exceed_domain_limit(cur_q["items"][0]):
                    picked_article = cur_q["items"].pop(0)
                    break

            # Fallback if domain limit blocked all queues but primary is exhausted
            if not picked_article and not primary_pool:
                for q in feed_queues:
                    if q["items"]:
                        picked_article = q["items"].pop(0)
                        break

            if picked_article:
                result.append(picked_article)
                primary_since_secondary = 0
                continue

        # Insert primary article
        if primary_pool:
            found_idx = -1
            for i, p_art in enumerate(primary_pool):
                if not would_exceed_domain_limit(p_art):
                    found_idx = i
                    break

            picked_primary = primary_pool.pop(found_idx) if found_idx != -1 else primary_pool.pop(0)
            result.append(picked_primary)
            primary_since_secondary += 1
        elif not has_secondary:
            break

    return result[:max_total]

def process_topic(topic_name: str, primary_url: str) -> list:
    """Processes a topic by fetching Google News and weaving with direct secondary feeds."""
    print(f"\n==========================================")
    print(f"Processing Topic: [{topic_name.upper()}]")
    print(f"==========================================")

    # 1. Fetch Primary Google News RSS
    req = urllib.request.Request(primary_url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            xml_content = resp.read().decode("utf-8")
    except Exception as e:
        print(f"Error fetching Google News for {topic_name}: {e}")
        xml_content = ""

    google_articles = []
    if xml_content:
        try:
            root = ET.fromstring(xml_content)
            items = root.findall(".//item")
            selected_items = items[:26]  # 26 Google News items as anchor pool
            print(f"Found {len(items)} Google News items. Processing top {len(selected_items)}...")

            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [
                    executor.submit(process_single_google_item, item, topic_name, idx)
                    for idx, item in enumerate(selected_items)
                ]
                google_articles = [f.result() for f in futures]
        except Exception as e:
            print(f"XML parse error for Google News in {topic_name}: {e}")

    # 2. Fetch Configured Secondary Direct Feeds
    secondary_configs = SECONDARY_FEEDS.get(topic_name, [])
    secondary_groups = []

    if secondary_configs:
        print(f"Fetching {len(secondary_configs)} direct secondary feeds...")
        with ThreadPoolExecutor(max_workers=len(secondary_configs)) as executor:
            future_to_cfg = {
                executor.submit(process_direct_feed, cfg, topic_name): cfg
                for cfg in secondary_configs
            }
            for future in future_to_cfg:
                cfg = future_to_cfg[future]
                try:
                    feed_arts = future.result()
                    if feed_arts:
                        secondary_groups.append({"feedConfig": cfg, "articles": feed_arts})
                except Exception as e:
                    print(f"Error processing secondary feed {cfg['name']}: {e}")

    # 3. Weave Feeds Together (Smart deduplication + fair-share + anti-clustering)
    final_articles = weave_feeds(
        google_articles,
        secondary_groups,
        lead_anchor_count=0 if topic_name == "latest" else 2,
        max_consecutive_per_domain=2,
        cadence_interval=2,
        max_total=60
    )

    if topic_name == "latest":
        def parse_pub_timestamp(art):
            pub = art.get("pubDate", "")
            if not pub:
                return 0
            try:
                import email.utils
                return email.utils.parsedate_to_datetime(pub).timestamp()
            except Exception:
                return 0
        final_articles.sort(key=parse_pub_timestamp, reverse=True)

    # 4. Final enrichment pass for any remaining articles lacking an image
    missing_in_final = [a for a in final_articles if not a.get("imageUrl") and "youtube.com" not in a.get("originalUrl", "")]
    if missing_in_final and not SKIP_PAGE_IMAGES:
        print(f"[{topic_name.upper()}] Resolving images for {len(missing_in_final)} articles missing photos...")
        with ThreadPoolExecutor(max_workers=min(len(missing_in_final), 8)) as executor:
            future_to_art = {executor.submit(extract_page_image, a["originalUrl"]): a for a in missing_in_final}
            for fut in future_to_art:
                try:
                    img = fut.result()
                    if img:
                        future_to_art[fut]["imageUrl"] = img
                except Exception:
                    pass

    img_count = sum(1 for a in final_articles if a.get("imageUrl"))
    print(f"[{topic_name.upper()}] Final woven feed: {len(final_articles)} articles ({img_count} photos).")
    return final_articles

def write_json_atomic(path, data):
    """Keep the last complete snapshot if a write is interrupted."""
    target = os.path.abspath(path)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=os.path.dirname(target), delete=False) as output:
            temp_path = output.name
            json.dump(data, output, indent=2)
        os.replace(temp_path, target)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


def sync():
    """Refresh snapshots, preserving previous files when a topic fails."""
    os.makedirs("data", exist_ok=True)
    all_results = {}
    failed_topics = []
    for topic_name, primary_url in TOPICS.items():
        try:
            articles = process_topic(topic_name, primary_url)
        except Exception as error:
            print(f"[{topic_name}] Refresh failed: {error}")
            articles = []
        if not articles:
            failed_topics.append(topic_name)
            continue
        fetched_at = datetime.now(timezone.utc).isoformat()
        for article in articles:
            article["fetchedAt"] = fetched_at
        topic_file = os.path.join("data", f"news_{topic_name}.json")
        write_json_atomic(topic_file, articles)
        print(f"Saved {len(articles)} articles to {topic_file}")
        all_results[topic_name] = articles
    if "top" in all_results:
        write_json_atomic("news.json", all_results["top"])
    if not all_results:
        raise RuntimeError("No topics refreshed; preserving existing snapshots.")
    if failed_topics:
        print("Kept previous snapshots for: " + ", ".join(failed_topics))
    print(f"Refreshed {len(all_results)} of {len(TOPICS)} topics.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Refresh OpenWire news snapshots.")
    parser.add_argument('--skip-page-images', action='store_true', help='Use feed images without crawling article pages.')
    SKIP_PAGE_IMAGES = parser.parse_args().skip_page_images
    sync()
