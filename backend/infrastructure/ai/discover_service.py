"""
Content Discovery, CEFR Level Adaptation, Podcast Dialogue & Short Story Service.

Provides:
1. Multi-source live feed aggregation (DEV.to API, Microsoft .NET RSS, Wikipedia API,
   Hacker News Discussions API, BBC World RSS, and curated modern Short Story seeds).
2. Full-text extraction for selected feed articles.
3. Optional AI transformation into:
   - Adapted Article (A2 / B1 / B2 / C1) preserving core facts & technical terminology
   - 2-Host Podcast / Colleague Dialogue (A2 / B1 / B2 / C1) for spoken English mastery
   - Modern Short Story (A2 / B1 / B2 / C1) with natural dialogue and narrative flow
4. In-memory EPUB generation compatible with foliate-js ReaderPage.
"""
import html
import io
import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple

import httpx
from ebooklib import epub

from infrastructure.ai.writing_service import _call_llm_json

logger = logging.getLogger(__name__)

# Simple in-memory feed cache: {category: (timestamp, items_list)}
_FEED_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
CACHE_TTL_SECONDS = 600  # 10 minutes

HTTP_HEADERS = {
    "User-Agent": "LingoStream/1.0 (Language Learning Reader; +https://lingostream.app)",
    "Accept": "application/json, text/plain, application/xml, text/xml, */*",
}


# ── Curated Story Seeds & Fallbacks ──────────────────────────────────────────

STORY_SEEDS: List[Dict[str, Any]] = [
    {
        "id": "story:midnight-deploy",
        "title": "The Midnight Deployment",
        "summary": "A software engineer notices a strange message coming from an AI microservice during a quiet Friday night production deployment.",
        "category": "stories",
        "source_name": "LingoStream Originals",
        "author": "LingoStream Fiction",
        "reading_time_minutes": 5,
        "tags": ["Sci-Fi", "Tech Thriller", "B1-B2"],
        "item_type": "story",
        "raw_content": (
            "Write a suspenseful, modern short story titled 'The Midnight Deployment'. "
            "Setting: A quiet office in Berlin late on a Friday evening. Lukas, a backend developer, "
            "is deploying a routine update to a distributed cloud system when the monitoring logs start "
            "displaying conversational answers to questions he hasn't typed yet. Include realistic natural dialogue "
            "between Lukas and his teammate Maya over a voice call, and end with an intriguing twist."
        ),
    },
    {
        "id": "story:wrong-train-zurich",
        "title": "The Wrong Train to Zurich",
        "summary": "Two strangers accidentally swap laptops at a crowded station café in Amsterdam and discover their lives are unexpectedly connected.",
        "category": "stories",
        "source_name": "LingoStream Originals",
        "author": "LingoStream Fiction",
        "reading_time_minutes": 5,
        "tags": ["Mystery", "Travel", "Everyday English"],
        "item_type": "story",
        "raw_content": (
            "Write an engaging modern mystery/slice-of-life short story titled 'The Wrong Train to Zurich'. "
            "Elena is rushing to catch an express train across Europe when she realizes the silver laptop in her bag "
            "belongs to someone else. When she gets a message on her phone from the owner, they arrange to meet at the next "
            "station—only for Elena to realize he is interviewing for the exact same role she just left. Include lively, natural dialogue."
        ),
    },
    {
        "id": "story:coffee-shop-negotiation",
        "title": "Five Minutes Before the Pitch",
        "summary": "In a noisy London coffee shop, a founder and a lead architect have five minutes to resolve a critical disagreement before meeting investors.",
        "category": "stories",
        "source_name": "LingoStream Originals",
        "author": "LingoStream Fiction",
        "reading_time_minutes": 4,
        "tags": ["Startup Drama", "Business English", "Dialogue"],
        "item_type": "story",
        "raw_content": (
            "Write a realistic, fast-paced modern short story titled 'Five Minutes Before the Pitch'. "
            "Two co-founders, David and Nina, are sitting in a rainy London café five minutes before walking into a major investor meeting. "
            "They discover a live demo bug right before leaving and have to decide whether to fake the demo or be completely honest. "
            "Use rich everyday spoken English, negotiation phrases, and authentic tension."
        ),
    },
    {
        "id": "story:forgotten-voicemail",
        "title": "The Voicemail from 2019",
        "summary": "While cleaning out an old cloud backup, a photographer finds an unread voice memo that changes how she sees her best friend.",
        "category": "stories",
        "source_name": "LingoStream Originals",
        "author": "LingoStream Fiction",
        "reading_time_minutes": 5,
        "tags": ["Drama", "Life & Relationships", "Modern"],
        "item_type": "story",
        "raw_content": (
            "Write a warm, emotionally engaging contemporary short story titled 'The Voicemail from 2019'. "
            "Clara is organizing her old cloud storage folders when she finds an audio file recorded five years ago "
            "in Lisbon. Listening to it reveals what really happened the summer she and her old friend Sam lost touch, "
            "leading her to call him that evening. Include natural emotional and conversational English."
        ),
    },
    {
        "id": "story:silent-interview",
        "title": "The Unconventional Job Interview",
        "summary": "A developer arrives for a final-round interview expecting a whiteboard test, but the CTO takes him to a busy kitchen instead.",
        "category": "stories",
        "source_name": "LingoStream Originals",
        "author": "LingoStream Fiction",
        "reading_time_minutes": 5,
        "tags": ["Career", "Slice of Life", "Spoken English"],
        "item_type": "story",
        "raw_content": (
            "Write a clever, modern short story titled 'The Unconventional Job Interview'. "
            "Marco prepares for weeks for a senior engineering interview, memorizing algorithms and system design patterns. "
            "When he arrives, the CTO asks him to help solve a real logistical bottleneck in the company's charity café downstairs. "
            "Include natural conversational dialogue and a memorable takeaway."
        ),
    },
    {
        "id": "story:apartment-4b",
        "title": "The Neighbor in Apartment 4B",
        "summary": "Every Tuesday at 8 PM, the neighbor next door plays the exact same piano melody for three minutes—until one Tuesday it stops mid-note.",
        "category": "stories",
        "source_name": "LingoStream Originals",
        "author": "LingoStream Fiction",
        "reading_time_minutes": 6,
        "tags": ["Mystery", "Suspense", "Storytelling"],
        "item_type": "story",
        "raw_content": (
            "Write an atmospheric modern mystery short story titled 'The Neighbor in Apartment 4B'. "
            "Arthur lives in a modern apartment building in Chicago. His mysterious neighbor in 4B plays the same haunting "
            "melody every Tuesday at 8:00 PM sharp. One evening it stops abruptly and a note is slipped under Arthur's door. "
            "Include engaging descriptions and natural dialogue."
        ),
    },
]

WIKI_TOPICS_BY_CATEGORY: Dict[str, List[Tuple[str, str]]] = {
    "world": [
        ("Remote_work", "How remote and hybrid work reshaped modern cities, global salaries, and daily work-life balance."),
        ("Four-day_workweek", "Global trials of the four-day workweek: productivity results, employee wellbeing, and economic impact."),
        ("Urban_green_space", "How modern cities are redesigning streets and architecture to combat heat and improve mental health."),
        ("Digital_nomad", "The rise of location-independent professionals, digital nomad visas, and changing communities."),
    ],
    "psychology": [
        ("Impostor_syndrome", "Why high-achieving professionals often doubt their skills and how psychologists recommend overcoming it."),
        ("Flow_(psychology)", "The psychology of deep focus ('being in the zone') discovered by Mihaly Csikszentmihalyi."),
        ("Decision_fatigue", "How making too many daily choices drains mental energy and leads to impulsive habits."),
        ("Procrastination", "The emotional and neurological reasons behind procrastination—and why it is about emotion, not laziness."),
        ("Confirmation_bias", "How the human brain naturally filters information to confirm existing beliefs."),
    ],
    "science": [
        ("James_Webb_Space_Telescope", "How the James Webb Space Telescope is observing the earliest galaxies and exoplanet atmospheres."),
        ("CRISPR_gene_editing", "The revolutionary technology allowing scientists to edit DNA with unprecedented precision."),
        ("Neuroplasticity", "How the adult brain continuously rewires itself when learning new languages and complex skills."),
        ("Fusion_power", "The global scientific race to achieve clean, limitless nuclear fusion energy."),
        ("Circadian_rhythm", "How light, sleep cycles, and biological clocks regulate human health and cognitive performance."),
    ],
    "culture": [
        ("Streaming_media", "How streaming platforms transformed cinema, binge-watching habits, and global storytelling."),
        ("Minimalism", "Minimalism in modern design, architecture, and intentional living."),
        ("Podcast", "How podcasts evolved from amateur audio blogs into the world's favorite conversational medium."),
        ("Coffeehouse", "The fascinating history of coffeehouses as centers of ideas, literature, and modern remote culture."),
        ("Video_game_design", "How interactive storytelling, art, and psychology come together in modern game design."),
    ],
}


# ── Helpers for HTML / Markdown cleaning ─────────────────────────────────────


def _strip_html(raw_html: str) -> str:
    """Convert HTML string into clean plain paragraphs."""
    if not raw_html:
        return ""
    text = re.sub(r"<pre[^>]*>.*?</pre>", "\n[Code Example Omitted for Reading Flow]\n", raw_html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"</?(?:p|div|br|h1|h2|h3|h4|li|blockquote)[^>]*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines()]
    paragraphs = [ln for ln in lines if ln]
    return "\n\n".join(paragraphs)


def _clean_markdown(md: str) -> str:
    """Clean Dev.to markdown into readable prose paragraphs."""
    if not md:
        return ""
    # Remove frontmatter if present
    md = re.sub(r"^---\s*\n.*?\n---\s*\n", "", md, flags=re.DOTALL)
    # Replace large fenced code blocks with a brief placeholder so reading flow isn't broken by 100 lines of syntax
    def _replace_code(match: re.Match) -> str:
        code = match.group(2).strip()
        lines = code.splitlines()
        if len(lines) <= 6:
            return "\n" + "\n".join(f"    {ln}" for ln in lines) + "\n"
        return "\n[Code snippet illustrated in original article]\n"

    md = re.sub(r"```(\w*)\n(.*?)```", _replace_code, md, flags=re.DOTALL)
    # Strip liquid tags {% ... %}
    md = re.sub(r"\{%.*?%\}", "", md)
    # Strip images ![alt](url)
    md = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", md)
    # Convert markdown links [label](url) -> label
    md = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", md)
    # Clean inline backticks and bold/italic markers gently
    md = re.sub(r"`([^`]+)`", r"\1", md)
    md = re.sub(r"\*\*([^*]+)\*\*", r"\1", md)
    return md.strip()


# ── Feed Fetching by Category ────────────────────────────────────────────────


async def _fetch_devto_articles(tag: str, category: str, limit: int = 10) -> List[Dict[str, Any]]:
    url = f"https://dev.to/api/articles?tag={tag}&per_page={limit}&top=14"
    items: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(headers=HTTP_HEADERS, timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            for row in data:
                art_id = row.get("id")
                title = (row.get("title") or "").strip()
                desc = (row.get("description") or "").strip()
                if not art_id or not title:
                    continue
                user_obj = row.get("user") or {}
                tag_list = row.get("tag_list") if isinstance(row.get("tag_list"), list) else []
                items.append(
                    {
                        "id": f"devto:{art_id}",
                        "title": title,
                        "summary": desc or f"Modern article on {tag} by {user_obj.get('name', 'Developer')}.",
                        "category": category,
                        "source_name": "DEV Community",
                        "author": user_obj.get("name") or "DEV Author",
                        "url": row.get("url"),
                        "published_at": row.get("readable_publish_date") or row.get("published_at"),
                        "reading_time_minutes": max(2, int(row.get("reading_time_minutes") or 4)),
                        "tags": [str(t) for t in tag_list[:4]],
                        "item_type": "story" if category == "stories" else ("discussion" if category == "podcasts" else "article"),
                    }
                )
    except Exception as exc:
        logger.warning("DEV.to fetch failed for tag=%s: %s", tag, exc)
    return items


async def _fetch_rss_feed(feed_url: str, category: str, source_name: str, tags: List[str], limit: int = 8) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(headers=HTTP_HEADERS, timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(feed_url)
            resp.raise_for_status()
            root = ET.fromstring(resp.text)

            # Support both RSS <item> and Atom <entry>
            entries = root.findall(".//item")
            if not entries:
                entries = root.findall(".//{http://www.w3.org/2005/Atom}entry")

            for idx, entry in enumerate(entries[:limit]):
                title_el = entry.find("title")
                if title_el is None:
                    title_el = entry.find("{http://www.w3.org/2005/Atom}title")
                title = (title_el.text if title_el is not None and title_el.text else "").strip()
                if not title:
                    continue

                desc_el = entry.find("description")
                if desc_el is None:
                    desc_el = entry.find("{http://www.w3.org/2005/Atom}summary")
                raw_desc = desc_el.text if desc_el is not None and desc_el.text else ""

                # Check for content:encoded
                content_el = entry.find("{http://purl.org/rss/1.0/modules/content/}encoded")
                if content_el is None:
                    content_el = entry.find("{http://www.w3.org/2005/Atom}content")
                raw_body = content_el.text if content_el is not None and content_el.text else raw_desc

                link_el = entry.find("link")
                link_url = ""
                if link_el is not None:
                    link_url = (link_el.text or link_el.attrib.get("href") or "").strip()

                clean_summary = _strip_html(raw_desc)[:260]
                if len(clean_summary) == 260:
                    clean_summary += "..."
                clean_full = _strip_html(raw_body)

                items.append(
                    {
                        "id": f"rss:{category}:{idx}:{abs(hash(title)) % 100000}",
                        "title": html.unescape(title),
                        "summary": clean_summary or f"Latest update from {source_name}.",
                        "category": category,
                        "source_name": source_name,
                        "author": source_name,
                        "url": link_url,
                        "reading_time_minutes": max(3, len(clean_full.split()) // 180) if clean_full else 4,
                        "tags": tags,
                        "item_type": "article",
                        "raw_content": clean_full if len(clean_full) > 200 else f"{title}\n\n{clean_summary}",
                    }
                )
    except Exception as exc:
        logger.warning("RSS fetch failed for %s: %s", feed_url, exc)
    return items


async def _fetch_hn_discussions(limit: int = 10) -> List[Dict[str, Any]]:
    """Fetch real conversational 'Ask HN' discussions from Hacker News Algolia API."""
    url = f"https://hn.algolia.com/api/v1/search_by_date?tags=ask_hn&numericFilters=num_comments>15&hitsPerPage={limit}"
    items: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(headers=HTTP_HEADERS, timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            for hit in data.get("hits", []):
                obj_id = hit.get("objectID")
                title = (hit.get("title") or "").strip()
                story_text = _strip_html(hit.get("story_text") or "")
                if not obj_id or not title:
                    continue
                items.append(
                    {
                        "id": f"hn:{obj_id}",
                        "title": title,
                        "summary": (story_text[:220] + "...") if story_text else f"Live community discussion with {hit.get('num_comments', 20)}+ conversational replies.",
                        "category": "podcasts",
                        "source_name": "Hacker News Discussions",
                        "author": hit.get("author") or "HN Community",
                        "url": f"https://news.ycombinator.com/item?id={obj_id}",
                        "reading_time_minutes": 5,
                        "tags": ["Discussion", "Spoken English", f"{hit.get('num_comments', 0)} replies"],
                        "item_type": "discussion",
                    }
                )
    except Exception as exc:
        logger.warning("HN Algolia fetch failed: %s", exc)
    return items


def _build_wiki_curated_items(category: str) -> List[Dict[str, Any]]:
    topics = WIKI_TOPICS_BY_CATEGORY.get(category, [])
    items: List[Dict[str, Any]] = []
    for slug, summary in topics:
        readable_title = slug.replace("_", " ")
        items.append(
            {
                "id": f"wiki:en:{slug}",
                "title": readable_title,
                "summary": summary,
                "category": category,
                "source_name": "Wikipedia Feature",
                "author": "Wikipedia Contributors",
                "url": f"https://en.wikipedia.org/wiki/{slug}",
                "reading_time_minutes": 5,
                "tags": [category.capitalize(), "Modern Overview", "B1-B2"],
                "item_type": "article",
            }
        )
    return items


async def fetch_discover_feed(category: str = "ai") -> List[Dict[str, Any]]:
    """Return a list of discoverable articles, discussions, or stories for a category."""
    cat = (category or "ai").lower().strip()
    now = time.time()
    cached = _FEED_CACHE.get(cat)
    if cached and (now - cached[0]) < CACHE_TTL_SECONDS and cached[1]:
        return cached[1]

    items: List[Dict[str, Any]] = []

    if cat == "ai":
        items.extend(await _fetch_devto_articles("ai", "ai", limit=10))
        if len(items) < 6:
            items.extend(await _fetch_devto_articles("machinelearning", "ai", limit=6))

    elif cat == "dotnet":
        rss_items = await _fetch_rss_feed(
            "https://devblogs.microsoft.com/dotnet/feed/",
            category="dotnet",
            source_name="Microsoft .NET Blog",
            tags=[".NET", "C#", "Official Blog"],
            limit=6,
        )
        dev_items = await _fetch_devto_articles("dotnet", "dotnet", limit=8)
        items.extend(rss_items + dev_items)

    elif cat == "python":
        dev_items = await _fetch_devto_articles("python", "python", limit=10)
        rss_items = await _fetch_rss_feed(
            "https://realpython.com/atom.xml",
            category="python",
            source_name="Real Python",
            tags=["Python", "Backend", "Tutorials"],
            limit=6,
        )
        items.extend(dev_items + rss_items)

    elif cat == "architecture":
        items.extend(await _fetch_devto_articles("architecture", "architecture", limit=8))
        items.extend(await _fetch_devto_articles("systemdesign", "architecture", limit=6))

    elif cat == "world":
        bbc_items = await _fetch_rss_feed(
            "https://feeds.bbci.co.uk/news/world/rss.xml",
            category="world",
            source_name="BBC World News",
            tags=["World News", "Current Events"],
            limit=8,
        )
        items.extend(bbc_items)
        items.extend(_build_wiki_curated_items("world"))

    elif cat == "psychology":
        items.extend(_build_wiki_curated_items("psychology"))
        items.extend(await _fetch_devto_articles("productivity", "psychology", limit=6))
        items.extend(await _fetch_devto_articles("career", "psychology", limit=5))

    elif cat == "science":
        items.extend(_build_wiki_curated_items("science"))
        items.extend(await _fetch_devto_articles("science", "science", limit=6))

    elif cat == "culture":
        items.extend(_build_wiki_curated_items("culture"))
        items.extend(await _fetch_devto_articles("books", "culture", limit=5))
        items.extend(await _fetch_devto_articles("watercooler", "culture", limit=5))

    elif cat == "podcasts":
        hn_items = await _fetch_hn_discussions(limit=8)
        discuss_items = await _fetch_devto_articles("discuss", "podcasts", limit=6)
        items.extend(hn_items + discuss_items)

    elif cat == "stories":
        items.extend(STORY_SEEDS)
        fiction_items = await _fetch_devto_articles("fiction", "stories", limit=6)
        items.extend(fiction_items)

    else:
        items.extend(await _fetch_devto_articles("programming", cat, limit=10))

    # Deduplicate by title
    seen_titles = set()
    unique_items: List[Dict[str, Any]] = []
    for it in items:
        norm_t = it["title"].lower().strip()
        if norm_t not in seen_titles:
            seen_titles.add(norm_t)
            unique_items.append(it)

    if unique_items:
        _FEED_CACHE[cat] = (now, unique_items)
    return unique_items


# ── Full Content Resolver ────────────────────────────────────────────────────


async def resolve_full_content(
    item_id: Optional[str],
    title: str,
    summary: str,
    raw_content: Optional[str] = None,
) -> str:
    """Fetch the complete article/discussion text from the upstream API if not already provided."""
    if raw_content and len(raw_content.strip()) > 250:
        return raw_content.strip()

    item_id = (item_id or "").strip()

    # 1. DEV.to article
    if item_id.startswith("devto:"):
        art_id = item_id.split(":", 1)[1]
        try:
            async with httpx.AsyncClient(headers=HTTP_HEADERS, timeout=12.0, follow_redirects=True) as client:
                resp = await client.get(f"https://dev.to/api/articles/{art_id}")
                resp.raise_for_status()
                data = resp.json()
                body_md = data.get("body_markdown") or ""
                if body_md:
                    cleaned = _clean_markdown(body_md)
                    if len(cleaned) > 100:
                        return cleaned
                body_html = data.get("body_html") or ""
                if body_html:
                    return _strip_html(body_html)
        except Exception as exc:
            logger.warning("Failed to fetch full DEV.to article %s: %s", art_id, exc)

    # 2. Wikipedia article
    if item_id.startswith("wiki:"):
        parts = item_id.split(":", 2)
        lang = parts[1] if len(parts) > 2 else "en"
        slug = parts[2] if len(parts) > 2 else parts[1]
        api_url = (
            f"https://{lang}.wikipedia.org/w/api.php"
            f"?action=query&prop=extracts&explaintext=1&titles={slug}&format=json"
        )
        try:
            async with httpx.AsyncClient(headers=HTTP_HEADERS, timeout=12.0, follow_redirects=True) as client:
                resp = await client.get(api_url)
                resp.raise_for_status()
                pages = resp.json().get("query", {}).get("pages", {})
                for page_data in pages.values():
                    extract = (page_data.get("extract") or "").strip()
                    if extract:
                        # Keep up to ~1800 words so it's a comfortable reading length
                        words = extract.split()
                        if len(words) > 1800:
                            extract = " ".join(words[:1800])
                        return extract
        except Exception as exc:
            logger.warning("Failed to fetch Wikipedia extract for %s: %s", slug, exc)

    # 3. Hacker News Discussion Thread
    if item_id.startswith("hn:"):
        hn_id = item_id.split(":", 1)[1]
        try:
            async with httpx.AsyncClient(headers=HTTP_HEADERS, timeout=12.0) as client:
                resp = await client.get(f"https://hn.algolia.com/api/v1/items/{hn_id}")
                resp.raise_for_status()
                data = resp.json()
                question_text = _strip_html(data.get("text") or "")
                parts_out = [f"Topic Question: {title}"]
                if question_text:
                    parts_out.append(question_text)
                children = data.get("children") or []
                comment_count = 0
                for child in children:
                    c_text = _strip_html(child.get("text") or "")
                    c_author = child.get("author") or "Member"
                    if len(c_text) > 60:
                        parts_out.append(f"Speaker ({c_author}):\n{c_text}")
                        comment_count += 1
                    if comment_count >= 12:
                        break
                if len(parts_out) > 1:
                    return "\n\n".join(parts_out)
        except Exception as exc:
            logger.warning("Failed to fetch HN thread %s: %s", hn_id, exc)

    # 4. Story seed lookup
    for seed in STORY_SEEDS:
        if seed["id"] == item_id:
            return seed["raw_content"]

    return raw_content or f"{title}\n\n{summary}"


# ── AI Prompts for Adaptation, Podcast Dialogue & Story Mode ─────────────────


ADAPT_ARTICLE_SYSTEM_PROMPT = """You are an expert English writer and CEFR curriculum specialist.
Your task is to adapt the provided article/topic to **CEFR {cefr_level} level** in clean, engaging, modern English.

CRITICAL RULES:
1. Preserve ALL core facts, insights, and real-world value of the original article.
2. If the topic is technical (e.g., AI, .NET, C#, Python, System Architecture), KEEP authentic technical terms in English (such as 'dependency injection', 'garbage collection', 'latency', 'microservices', 'async/await', 'fine-tuning') so the developer learns real workplace vocabulary, while making the surrounding sentence structures and explanations clear and natural for a **{cefr_level}** reader.
3. Organize the adapted article into 4 to 7 clear, well-paced paragraphs (around 450–700 words total). Use occasional section subheadings where helpful.
4. At the end, include 5 high-value vocabulary expressions or phrases from your adapted text with Georgian (ქართული) explanations.

Return ONLY a valid raw JSON object (no markdown fences) with this exact structure:
{{
  "adapted_title": "<Engaging title for the {cefr_level} reader>",
  "paragraphs": [
    "<Paragraph 1 — engaging opening hook and context>",
    "## <Subheading if appropriate>",
    "<Paragraph 2>",
    "<Paragraph 3>",
    "<Paragraph 4>",
    "<Paragraph 5>"
  ],
  "key_takeaways": [
    "<Key point 1 in simple {cefr_level} English>",
    "<Key point 2 in simple {cefr_level} English>"
  ],
  "vocabulary_highlights": [
    {{
      "expression": "<English word, phrasal verb, or technical phrase from the text>",
      "meaning_ka": "<Clear Georgian translation and explanation>",
      "example": "<Short example sentence in English>"
    }}
  ]
}}"""


PODCAST_DIALOGUE_SYSTEM_PROMPT = """You are a scriptwriter for a popular, modern English podcast designed to help learners master **natural spoken English at CEFR {cefr_level} level**.

Convert the provided article or topic into a lively, authentic **2-person conversation** between two hosts/colleagues (**Alex** and **Sarah**):
- If it is a Tech topic (.NET, Python, AI, Architecture), frame it as two friendly software engineers chatting over coffee or after a daily standup about how this technology works in practice.
- If it is a General topic (Psychology, World News, Science, Culture), frame it as two curious podcast hosts discussing the topic with relatable everyday examples.
- Use natural spoken connectors, active listening reactions, and conversational phrasal verbs appropriate for **{cefr_level}** (e.g., "To be honest...", "The thing is...", "Wait, how does that work in practice?", "That makes total sense", "Here's what caught my eye...").
- Write 12 to 18 conversational turns so it feels like a complete, rich 5-minute podcast episode.

Return ONLY a valid raw JSON object (no markdown fences) with this exact structure:
{{
  "episode_title": "<Catchy podcast episode title>",
  "intro_note": "<1-2 sentence scene-setting introduction in {cefr_level} English>",
  "dialogue": [
    {{
      "speaker": "Alex",
      "line": "<Natural spoken lines...>"
    }},
    {{
      "speaker": "Sarah",
      "line": "<Natural spoken reply and follow-up...>"
    }}
  ],
  "spoken_phrases": [
    {{
      "phrase": "<Spoken connector or conversational idiom used in the dialogue>",
      "meaning_ka": "<Georgian translation and when to use it in real conversation>",
      "example": "<Another natural spoken example>"
    }}
  ]
}}"""


STORY_MODE_SYSTEM_PROMPT = """You are a bestselling modern fiction author who writes captivating short stories tailored for **CEFR {cefr_level} English learners**.

Write an original, atmospheric modern short story (around 550–800 words) based on the provided title/prompt or article theme:
- Target level: **CEFR {cefr_level}** (clear, natural grammar, vivid modern vocabulary, zero archaic words).
- Include plenty of **natural spoken dialogue** between characters so the reader absorbs both narrative prose and real-life conversational English.
- Structure the story with a hook, rising tension, vivid modern setting, and a satisfying or thought-provoking ending.

Return ONLY a valid raw JSON object (no markdown fences) with this exact structure:
{{
  "story_title": "<Title of the short story>",
  "paragraphs": [
    "<Paragraph 1>",
    "<Paragraph 2 (including character dialogue)>",
    "<Paragraph 3>",
    "<Paragraph 4>",
    "<Paragraph 5>",
    "<Paragraph 6>",
    "<Paragraph 7>",
    "<Paragraph 8>"
  ],
  "vocabulary_highlights": [
    {{
      "expression": "<Useful modern word, idiom, or dialogue phrase from the story>",
      "meaning_ka": "<Georgian meaning and nuance>",
      "example": "<Example sentence>"
    }}
  ]
}}"""


# ── Content Transformation Pipeline ──────────────────────────────────────────


def _split_into_paragraphs(text: str) -> List[str]:
    """Split raw article text into clean paragraphs and headings."""
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
    if len(blocks) <= 1 and "\n" in text:
        blocks = [b.strip() for b in text.splitlines() if b.strip()]
    return blocks


async def build_chapters_for_import(
    *,
    title: str,
    summary: str,
    full_text: str,
    mode: str = "adapted",
    cefr_level: str = "B1",
    include_original_chapter: bool = True,
    provider: Optional[str] = None,
) -> Tuple[str, List[Tuple[str, List[Dict[str, str]]]]]:
    """
    Transform the resolved article/story text into structured EPUB chapters.
    Returns (final_book_title, [(chapter_title, [{"kind": "h1"|"h2"|"p"|"hr", "text": ...}]), ...])
    """
    mode = (mode or "adapted").lower().strip()
    cefr_level = (cefr_level or "B1").upper().strip()

    original_paragraphs = _split_into_paragraphs(full_text)
    original_chapter_items: List[Dict[str, str]] = [{"kind": "h1", "text": f"{title} (Original)"}]
    for p in original_paragraphs:
        if p.startswith("### "):
            original_chapter_items.append({"kind": "h2", "text": p.lstrip("# ").strip()})
        elif p.startswith("## ") or p.startswith("# "):
            original_chapter_items.append({"kind": "h2", "text": p.lstrip("# ").strip()})
        else:
            original_chapter_items.append({"kind": "p", "text": p})

    # 1. ORIGINAL MODE (unless it's a short story prompt that needs generation)
    if mode == "original":
        # If the raw text is just a short story prompt or tiny RSS blurb (< 90 words), expand it cleanly
        if len(full_text.split()) >= 85:
            return title, [(title, original_chapter_items)]
        # Otherwise fall through to adapt/expand so the user gets a full text to read

    # Trim input text to ~3000 words max for prompt efficiency
    words = full_text.split()
    prompt_source_text = " ".join(words[:2800]) if len(words) > 2800 else full_text

    # 2. PODCAST DIALOGUE MODE
    if mode == "podcast":
        messages = [
            {"role": "system", "content": PODCAST_DIALOGUE_SYSTEM_PROMPT.format(cefr_level=cefr_level)},
            {
                "role": "user",
                "content": f"Title: {title}\nSummary: {summary}\n\nSource Material:\n{prompt_source_text}",
            },
        ]
        try:
            data = await _call_llm_json(messages, provider=provider, temperature=0.5)
            ep_title = data.get("episode_title") or f"🎙️ {title} ({cefr_level} Podcast)"
            intro = data.get("intro_note") or ""
            dialogue = data.get("dialogue") or []
            phrases = data.get("spoken_phrases") or []

            ch1_items: List[Dict[str, str]] = [
                {"kind": "h1", "text": f"🎙️ {ep_title} ({cefr_level})"},
            ]
            if intro:
                ch1_items.append({"kind": "p", "text": intro})
                ch1_items.append({"kind": "hr", "text": ""})

            for turn in dialogue:
                speaker = (turn.get("speaker") or "Host").strip()
                line = (turn.get("line") or "").strip()
                if line:
                    ch1_items.append({"kind": "p", "text": f"{speaker}: “{line}”"})

            if phrases:
                ch1_items.append({"kind": "hr", "text": ""})
                ch1_items.append({"kind": "h2", "text": "🗣️ Key Spoken Phrases & Connectors"})
                for ph in phrases:
                    expr = ph.get("phrase", "")
                    meaning_ka = ph.get("meaning_ka", "")
                    example = ph.get("example", "")
                    ch1_items.append(
                        {
                            "kind": "p",
                            "text": f"• {expr} — {meaning_ka}" + (f" (Example: “{example}”)" if example else ""),
                        }
                    )

            chapters = [(f"🎙️ Podcast Dialogue ({cefr_level})", ch1_items)]
            if include_original_chapter and len(full_text.split()) >= 85:
                chapters.append(("📖 Original Source Text", original_chapter_items))
            return f"🎙️ [{cefr_level}] {title}", chapters
        except Exception as exc:
            logger.warning("Podcast transformation failed, falling back to original: %s", exc)
            return title, [(title, original_chapter_items)]

    # 3. SHORT STORY MODE
    if mode == "story":
        messages = [
            {"role": "system", "content": STORY_MODE_SYSTEM_PROMPT.format(cefr_level=cefr_level)},
            {
                "role": "user",
                "content": f"Story Title / Theme: {title}\nSummary: {summary}\nPrompt / Context:\n{prompt_source_text}",
            },
        ]
        try:
            data = await _call_llm_json(messages, provider=provider, temperature=0.65)
            st_title = data.get("story_title") or title
            paragraphs = data.get("paragraphs") or []
            vocab = data.get("vocabulary_highlights") or []

            ch1_items = [{"kind": "h1", "text": f"📖 {st_title} ({cefr_level})"}]
            for p in paragraphs:
                clean_p = str(p).strip()
                if not clean_p:
                    continue
                if clean_p.startswith("##"):
                    ch1_items.append({"kind": "h2", "text": clean_p.lstrip("# ").strip()})
                else:
                    ch1_items.append({"kind": "p", "text": clean_p})

            if vocab:
                ch1_items.append({"kind": "hr", "text": ""})
                ch1_items.append({"kind": "h2", "text": "✨ Story Vocabulary & Expressions"})
                for v in vocab:
                    expr = v.get("expression", "")
                    meaning_ka = v.get("meaning_ka", "")
                    example = v.get("example", "")
                    ch1_items.append(
                        {
                            "kind": "p",
                            "text": f"• {expr} — {meaning_ka}" + (f" (“{example}”)" if example else ""),
                        }
                    )

            return f"📖 [{cefr_level}] {st_title}", [(f"📖 {st_title} ({cefr_level})", ch1_items)]
        except Exception as exc:
            logger.warning("Story generation failed, falling back to original: %s", exc)
            return title, [(title, original_chapter_items)]

    # 4. ADAPTED ARTICLE MODE (Default: B1 / A2 / B2 / C1)
    messages = [
        {"role": "system", "content": ADAPT_ARTICLE_SYSTEM_PROMPT.format(cefr_level=cefr_level)},
        {
            "role": "user",
            "content": f"Title: {title}\nSummary: {summary}\n\nArticle Content:\n{prompt_source_text}",
        },
    ]
    try:
        data = await _call_llm_json(messages, provider=provider, temperature=0.35)
        ad_title = data.get("adapted_title") or title
        paragraphs = data.get("paragraphs") or []
        takeaways = data.get("key_takeaways") or []
        vocab = data.get("vocabulary_highlights") or []

        ch1_items = [{"kind": "h1", "text": f"{ad_title} ({cefr_level} Level)"}]
        for p in paragraphs:
            clean_p = str(p).strip()
            if not clean_p:
                continue
            if clean_p.startswith("#"):
                ch1_items.append({"kind": "h2", "text": clean_p.lstrip("# ").strip()})
            else:
                ch1_items.append({"kind": "p", "text": clean_p})

        if takeaways:
            ch1_items.append({"kind": "hr", "text": ""})
            ch1_items.append({"kind": "h2", "text": "💡 Key Takeaways"})
            for tk in takeaways:
                ch1_items.append({"kind": "p", "text": f"• {tk}"})

        if vocab:
            ch1_items.append({"kind": "hr", "text": ""})
            ch1_items.append({"kind": "h2", "text": "📚 Key Expressions & Terms"})
            for v in vocab:
                expr = v.get("expression", "")
                meaning_ka = v.get("meaning_ka", "")
                example = v.get("example", "")
                ch1_items.append(
                    {
                        "kind": "p",
                        "text": f"• {expr} — {meaning_ka}" + (f" (“{example}”)" if example else ""),
                    }
                )

        chapters = [(f"✨ {cefr_level} Adapted Version", ch1_items)]
        if include_original_chapter and len(full_text.split()) >= 85:
            chapters.append(("📖 Original Article", original_chapter_items))
        return f"[{cefr_level}] {title}", chapters
    except Exception as exc:
        logger.warning("Article adaptation failed, falling back to original: %s", exc)
        return title, [(title, original_chapter_items)]


# ── In-Memory EPUB Generator ─────────────────────────────────────────────────


def build_epub_bytes(
    title: str,
    author: str,
    chapters_data: List[Tuple[str, List[Dict[str, str]]]],
) -> bytes:
    """Create a clean, reflowable EPUB binary in memory from structured chapters."""
    book = epub.EpubBook()
    book.set_identifier(f"lingostream-discover-{abs(hash(title))}-{int(time.time())}")
    book.set_title(title)
    book.set_language("en")
    book.add_author(author or "LingoStream Discover")

    style = epub.EpubItem(
        uid="style_nav",
        file_name="style/nav.css",
        media_type="text/css",
        content=b"""
        body {
            line-height: 1.8;
            margin: 0 auto;
            padding: 1.2rem 1.5rem;
            text-rendering: optimizeLegibility;
        }
        h1 {
            font-size: 1.55em;
            font-weight: 700;
            text-align: center;
            margin: 1.4em 0 0.9em 0;
            line-height: 1.3;
        }
        h2 {
            font-size: 1.25em;
            font-weight: 600;
            margin: 1.4em 0 0.7em 0;
            line-height: 1.35;
        }
        p {
            margin: 0 0 1.0em 0;
            text-align: left;
            orphans: 2;
            widows: 2;
        }
        hr.scene-break {
            border: none;
            text-align: center;
            margin: 1.5em 0;
        }
        hr.scene-break::before {
            content: "* * *";
            letter-spacing: 0.3em;
            opacity: 0.65;
        }
        """,
    )
    book.add_item(style)

    epub_chapters = []
    for idx, (ch_title, ch_items) in enumerate(chapters_data):
        html_parts: List[str] = []
        for item in ch_items:
            kind = item.get("kind", "p")
            escaped = html.escape(item.get("text", ""))
            if kind == "h1":
                html_parts.append(f"<h1>{escaped}</h1>")
            elif kind == "h2":
                html_parts.append(f"<h2>{escaped}</h2>")
            elif kind == "hr":
                html_parts.append('<hr class="scene-break" />')
            else:
                html_parts.append(f"<p>{escaped}</p>")

        ch_content = "\n".join(html_parts)
        ch_file_name = f"chap_{idx + 1:02d}.xhtml"
        chapter = epub.EpubHtml(
            title=ch_title,
            file_name=ch_file_name,
            lang="en",
        )
        chapter.content = (
            "<html><head><link rel='stylesheet' href='style/nav.css' type='text/css'/></head>"
            f"<body>{ch_content}</body></html>"
        )
        chapter.add_item(style)
        book.add_item(chapter)
        epub_chapters.append(chapter)

    book.toc = tuple(epub_chapters)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav"] + epub_chapters

    out_buffer = io.BytesIO()
    epub.write_epub(out_buffer, book, {})
    return out_buffer.getvalue()
