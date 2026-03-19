"""FastCap-derived prompt builders and parsers for publishing workflows."""

from __future__ import annotations

import json
import re
from typing import Any

THUMBNAIL_VARIANT_LABELS = ("A", "B", "C")
THUMBNAIL_DEFAULT_POSITIONS = ("center", "left", "right")
THUMBNAIL_ALLOWED_POSITIONS = {"center", "left", "right", "lower_third"}
THUMBNAIL_ALLOWED_LIGHTING = (
    "warm sunrise light",
    "soft window light",
    "dramatic storm lighting",
    "golden hour sunlight",
    "cool evening light",
)
TAG_OPTIONS = (
    "Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges, Ruth, "
    "1 Samuel, 2 Samuel, 1 Kings, 2 Kings, 1 Chronicles, 2 Chronicles, Ezra, "
    "Nehemiah, Esther, Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, "
    "Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, "
    "Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi, "
    "Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians, "
    "Galatians, Ephesians, Philippians, Colossians, 1 Thessalonians, "
    "2 Thessalonians, 1 Timothy, 2 Timothy, Titus, Philemon, Hebrews, James, "
    "1 Peter, 2 Peter, 1 John, 2 John, 3 John, Jude, Revelation, "
    "Holy Spirit, Pentecost, Gifts of the Spirit, Speaking in Tongues, Prophecy, "
    "Miracles, Healing, Deliverance, Spiritual Warfare, Angelology, Demonology, "
    "Signs and Wonders, Second Coming, Revival, Anointing, Baptism in the Spirit, "
    "Fasting and Prayer, Faith Healing, Divine Intervention, Apostolic, "
    "Prophetic Ministry, Spiritual Gifts, Authority of the Believer, "
    "Supernatural Encounters, Visions and Dreams, Intercessory Prayer, "
    "Power of God, Glory of God, Kingdom of God, Government, Nations, Politics, "
    "Law, Freedom, Justice, Social Issues, Environment, Conservation, "
    "Mountain, River, Ocean, Forest, Earth, World, Heart, Fire, Wind, Earth, Water, "
    "Joy, Peace, Love, Anxiety, Depression, Anger, Fear, Hope, Despair, "
    "Contentment, Grief, Sadness, Loneliness, Guilt, Shame, Optimism, Pessimism, "
    "Stress, Tranquility, Gratitude, Empathy, Compassion, Frustration, Elation, "
    "Envy, Jealousy, Confidence, Insecurity, Resilience, Vulnerability, Nostalgia, "
    "Salvation, Prayer, Forgiveness, Sin, Repentance, Trust, Worship, Praise, "
    "Spiritual Growth, Leadership, Discipleship, Community, Outreach, Evangelism, "
    "Missions, Family, Marriage, Parenting, Youth, Children, Men's Issues, "
    "Women's Issues, Senior's Ministry, Bible Study, Church Growth, Church History, "
    "Apostles, Victory, Thanksgiving, Stewardship, Money, Prosperity, Suffering, "
    "Perseverance, Trials, Temptation, Holiness, Righteousness, Ethics, Culture, "
    "Worldview, Creation, Eschatological Events, Fellowship, Unity, Controversy, "
    "Doctrine, Faithfulness, Obedience, Redemption, Sanctification, Justification, "
    "Conviction, Inspiration, Transformation, Consecration, Accountability, "
    "Mentoring, Humility, Patience, Wisdom, Discernment, Fear of God, "
    "Sovereignty of God, Majesty of God"
)
REQUIRED_METADATA_KEYS = (
    "title",
    "description",
    "scriptures",
    "mainPoints",
    "tags",
    "propheticStatements",
    "keyMoments",
    "topics",
    "teachingStatements",
)
_STOPWORDS = {
    "a", "an", "and", "at", "for", "from", "god", "how", "in", "into", "is", "of", "on", "the",
    "through", "to", "what", "why", "with", "you", "your",
}
NLC_STYLE_EXCERPT_1 = """## **The Power of Stewarding God's Promises**

Every believer has received promises from God - whether grand or modest in scope. But receiving a promise is only the beginning. How you steward that promise during seasons of waiting often determines whether it will come to fruition or wither away under the weight of doubt and impatience.

Think of God's promises like seeds planted in the soil of your faith. These seeds require proper care, consistent watering with prayer, and protection from the elements of doubt that threaten to choke out their growth."""
NLC_STYLE_EXCERPT_2 = """## **Practical Steps for Breaking Free**

1. **Make a Clean Break**: Just as Elisha burned his farming equipment, identify and eliminate the "backup plans" that tempt you to return to your old life.
2. **Refuse to Tarry**: When voices (internal or external) urge you to remain where you are, respond with Elisha's determination: "I will not stay here."
3. **Embrace Your New Identity**: The moment you're saved, you receive a new name and a new nature.

Remember: God never lets His people walk through mud - He provides dry ground when you're willing to move forward."""


def _ensure_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _safe_excerpt(text: str, limit: int) -> str:
    clean = " ".join((text or "").split()).strip()
    if len(clean) <= limit:
        return clean
    trimmed = clean[:limit].rsplit(" ", 1)[0].strip()
    return trimmed or clean[:limit].strip()


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = (text or "").strip()
    if "```" in stripped:
        match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", stripped)
        if match:
            return json.loads(match.group(1))
    if stripped.startswith("{") and stripped.endswith("}"):
        return json.loads(stripped)
    match = re.search(r"\{[\s\S]*\}", stripped)
    if not match:
        raise ValueError("Response did not contain a JSON object.")
    return json.loads(match.group(0))


def _context_block(preacher_name: str = "", date_preached: str = "") -> str:
    parts = []
    if preacher_name:
        parts.append(f"Speaker: {preacher_name.strip()}")
    if date_preached:
        parts.append(f"Date: {date_preached.strip()}")
    if not parts:
        return ""
    return "Context:\n" + "\n".join(parts) + "\n\n"


def build_scribe_prompt(transcript: str, preacher_name: str = "", date_preached: str = "") -> str:
    named_context = []
    if preacher_name or date_preached:
        named_context.append("Sermon context (use this in your summary; do not say \"the preacher\" when a name is given):")
        if preacher_name:
            named_context.append(f"- Preacher/speaker: {preacher_name.strip()}")
        if date_preached:
            named_context.append(f"- Date preached: {date_preached.strip()}")
        named_context.append("")
    context_block = "\n".join(named_context)
    return (
        "You are SCRIBE, a digital assistant trained to analyze Pentecostal sermon transcripts. "
        "Your task is to read a sermon transcript and output a single JSON object (and nothing else) with the exact keys described below.\n\n"
        "IMPORTANT: Before producing output, read the ENTIRE transcript. Do not invent scriptures or statements not present. Output ONLY valid JSON.\n\n"
        + (f"{context_block}" if context_block else "")
        + "Required JSON shape (use these exact key names):\n"
        "- title (string)\n"
        "- description (string)\n"
        "- scriptures (array of strings)\n"
        "- mainPoints (array of strings)\n"
        "- tags (array of strings): 3-10 tags from the tag list below only\n"
        "- propheticStatements (array of strings)\n"
        "- keyMoments (array of objects): each { \"timestamp\": \"...\", \"quote\": \"...\", \"explanation\": \"...\" }\n"
        "- topics (array of strings)\n"
        "- teachingStatements (array of strings)\n\n"
        "Tag options (choose only from this list):\n"
        f"{TAG_OPTIONS}\n\n"
        f"Transcript:\n---\n{transcript}\n---\n\n"
        "Respond with only the JSON object, no other text."
    )


def parse_sermon_metadata(raw: str) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    data = _extract_json_object(raw)
    missing = [k for k in REQUIRED_METADATA_KEYS if k not in data]
    if missing:
        raise ValueError(f"Missing required keys: {', '.join(missing)}")
    payload = {
        "title": _ensure_str(data["title"]),
        "description": _ensure_str(data["description"]),
        "scriptures": [str(s).strip() for s in (data.get("scriptures") or []) if str(s).strip()],
        "mainPoints": [str(s).strip() for s in (data.get("mainPoints") or []) if str(s).strip()],
        "tags": [],
        "propheticStatements": [str(s).strip() for s in (data.get("propheticStatements") or []) if str(s).strip()],
        "keyMoments": [],
        "topics": [str(s).strip() for s in (data.get("topics") or []) if str(s).strip()],
        "teachingStatements": [str(s).strip() for s in (data.get("teachingStatements") or []) if str(s).strip()],
    }
    if not payload["title"]:
        raise ValueError("Required field 'title' is empty.")
    seen_tags: set[str] = set()
    for item in data.get("tags") or []:
        tag = str(item).strip()
        if tag and tag not in seen_tags:
            seen_tags.add(tag)
            payload["tags"].append(tag)
    for index, item in enumerate(data.get("keyMoments") or []):
        if not isinstance(item, dict):
            continue
        quote = _ensure_str(item.get("quote"))
        explanation = _ensure_str(item.get("explanation"))
        if not quote and not explanation:
            warnings.append(f"keyMoments[{index}] missing quote/explanation, skipped")
            continue
        payload["keyMoments"].append(
            {
                "timestamp": _ensure_str(item.get("timestamp")) or "Unknown",
                "quote": quote,
                "explanation": explanation,
            }
        )
    return payload, warnings


def build_blog_post_prompt(transcript: str, preacher_name: str = "", date_preached: str = "") -> str:
    context_lines: list[str] = []
    if preacher_name or date_preached:
        context_lines.append("Sermon context (use when relevant; refer to speaker by name, not \"the preacher\"):")
        if preacher_name:
            context_lines.append(f"- Preacher/speaker: {preacher_name.strip()}")
        if date_preached:
            context_lines.append(f"- Date preached: {date_preached.strip()}")
        context_lines.append("")
    context_block = "\n".join(context_lines)
    return (
        "You are writing a blog post for a church (NLC). Your post must match the tone, structure, and length of the example style below. "
        "Use the ENTIRE sermon transcript as your only source; do not invent content.\n\n"
        "STYLE RULES:\n"
        "- Tone: First person, speaking directly to the reader. Use \"you\" and \"your\".\n"
        "- Length: About 3 min read (several hundred words, 4-6 main sections).\n"
        "- Structure: One plain-text title line first, then body with ## section headings, short paragraphs, bullets or numbered lists where helpful.\n"
        "- Content: Biblical references and stories from the sermon, applied to the reader's life.\n\n"
        "EXAMPLE STYLE (match this tone and format):\n"
        f"---\n{NLC_STYLE_EXCERPT_1}\n\n{NLC_STYLE_EXCERPT_2}\n---\n\n"
        + (f"{context_block}" if context_block else "")
        + "OUTPUT FORMAT:\n"
        + "- Output only markdown.\n"
        + "- First line must be the post title as plain text only. Do not wrap it in #, ##, **, quotes, or any markdown formatting.\n"
        + "- Then one blank line.\n"
        + "- Then the full post body with ## section headings.\n\n"
        f"Sermon transcript:\n---\n{transcript}\n---\n\n"
        "Write the blog post in markdown now."
    )


def build_facebook_post_prompt(blog_post_markdown: str) -> str:
    return (
        "You are writing a Facebook post for a church. The post is based on the blog post below, which was adapted from a sermon. "
        "Write a SHORTER version that feels fresh.\n\n"
        "RULES:\n"
        "- Length: About half the length of the blog post.\n"
        "- Tone: Direct, warm, conversational.\n"
        "- Do NOT say things like 'In this sermon...' or 'The blog post above...'.\n"
        "- End with a short line that invites engagement.\n\n"
        "OUTPUT FORMAT: Output only the Facebook post text. No title and no markdown.\n\n"
        f"Blog post (markdown):\n---\n{blog_post_markdown}\n---\n\n"
        "Write the Facebook post now."
    )


def _srt_time_to_seconds(time_str: str) -> float | None:
    match = re.match(r"^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$", time_str.strip())
    if not match:
        return None
    hours, minutes, seconds, millis = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000.0


def parse_srt_to_chapters(srt_text: str) -> list[tuple[float, str]]:
    chapters: list[tuple[float, str]] = []
    for block in re.split(r"\n\s*\n", srt_text.strip()):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue
        for index, line in enumerate(lines):
            if " --> " not in line:
                continue
            start = _srt_time_to_seconds(line.split(" --> ", 1)[0].strip())
            text_lines = [item.strip() for item in lines[index + 1 :] if item.strip()]
            if start is not None and text_lines:
                chapters.append((start, " ".join(text_lines)))
            break
    chapters.sort(key=lambda item: item[0])
    deduped: list[tuple[float, str]] = []
    seen: set[float] = set()
    for start, label in chapters:
        if start in seen:
            continue
        seen.add(start)
        deduped.append((start, label))
    return deduped


def get_chapter_segments(chapters: list[tuple[float, str]], interval_sec: float = 300.0) -> list[tuple[float, str]]:
    if not chapters or interval_sec <= 0:
        return []
    buckets: dict[int, list[tuple[float, str]]] = {}
    for start_sec, text in chapters:
        bucket = int(start_sec / interval_sec)
        buckets.setdefault(bucket, []).append((start_sec, text))
    return [(items[0][0], " ".join(text for _, text in items).strip()) for _, items in sorted(buckets.items())]


def seconds_to_youtube_time(total_seconds: float) -> str:
    rounded = max(0, round(total_seconds))
    hours = int(rounded // 3600)
    minutes = int((rounded % 3600) // 60)
    seconds = int(rounded % 60)
    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def format_youtube_chapters(chapters: list[tuple[float, str]], max_label_len: int = 50) -> str:
    if not chapters:
        return ""
    lines = []
    for start_sec, label in chapters:
        clean = " ".join(label.split())[:max_label_len].strip() or f"Chapter {seconds_to_youtube_time(start_sec)}"
        lines.append(f"{seconds_to_youtube_time(start_sec)} {clean}")
    return "Chapters:\n" + "\n".join(lines)


def srt_to_plain_text(srt_text: str) -> str:
    chapters = parse_srt_to_chapters(srt_text)
    if not chapters:
        return srt_text.strip()
    return "\n".join(label for _, label in chapters).strip()


def build_youtube_prompt(transcript: str, preacher_name: str = "", date_preached: str = "") -> str:
    return (
        "You are writing a YouTube video title and description for a church sermon. Use the sermon transcript below as your only source.\n\n"
        "RULES:\n"
        "- Title: One line, under 100 characters. Catchy, clear, and search-friendly. No clickbait.\n"
        "- Description: 2-4 short paragraphs. End with a line inviting viewers to engage.\n"
        "- Do NOT include timestamps or a chapter list in the description.\n\n"
        + _context_block(preacher_name, date_preached)
        + "OUTPUT FORMAT: First line is the title. Then a blank line. Then the full description.\n\n"
        f"Sermon transcript:\n---\n{transcript}\n---\n\n"
        "Write the YouTube title and description now."
    )


def build_youtube_prompt_with_chapters(
    transcript: str,
    segments: list[tuple[float, str]],
    preacher_name: str = "",
    date_preached: str = "",
) -> str:
    segment_block = "".join(
        f"Segment {index} (~5 min):\n{_safe_excerpt(text, 1500)}\n\n"
        for index, (_, text) in enumerate(segments, start=1)
    )
    return (
        "You are writing a YouTube video title, description, and chapter titles for a church sermon. "
        "Use the sermon content below as your only source.\n\n"
        "RULES:\n"
        "- Title: One line, under 100 characters.\n"
        "- Description: 2-4 short paragraphs after the title.\n"
        f"- Chapter titles: output exactly {len(segments)} short chapter titles in the same order.\n\n"
        + _context_block(preacher_name, date_preached)
        + "OUTPUT FORMAT:\n"
        "1. First line: title.\n"
        "2. Blank line.\n"
        "3. Description.\n"
        "4. A line that says exactly: ---CHAPTERS---\n"
        f"5. Then exactly {len(segments)} chapter-title lines.\n\n"
        f"Sermon segments:\n---\n{segment_block}---\n\n"
        "Write the full response now."
    )


def parse_youtube_response(raw: str, num_segments: int = 0) -> tuple[str, str, list[str]]:
    text = (raw or "").strip()
    chapters: list[str] = []
    if num_segments > 0 and "---CHAPTERS---" in text:
        before, _, after = text.partition("---CHAPTERS---")
        text = before.strip()
        chapters = [line.strip() for line in after.strip().splitlines() if line.strip()][:num_segments]
        if len(chapters) < num_segments:
            chapters = []
    lines = text.splitlines()
    title = lines[0].strip() if lines else ""
    description = "\n".join(lines[1:]).lstrip() if len(lines) > 1 else ""
    return title, description, chapters


def _pick_sermon_theme(youtube_title: str, youtube_description: str, sermon_metadata: dict[str, Any] | None = None) -> str:
    metadata = sermon_metadata if isinstance(sermon_metadata, dict) else {}
    for key in ("topics", "tags", "mainPoints", "teachingStatements"):
        values = metadata.get(key)
        if isinstance(values, list):
            for item in values:
                text = _ensure_str(item)
                if text:
                    return text
    cleaned_title = _ensure_str(youtube_title).split("|", 1)[0].split(" - ", 1)[0].strip()
    return cleaned_title or _ensure_str(youtube_description) or "hope in hardship"


def _pick_sermon_summary(youtube_description: str, sermon_metadata: dict[str, Any] | None = None) -> str:
    metadata = sermon_metadata if isinstance(sermon_metadata, dict) else {}
    description = _ensure_str(metadata.get("description"))
    if description:
        return _safe_excerpt(description, 220)
    return _safe_excerpt(_ensure_str(youtube_description), 220)


def _keyword_profile(theme_text: str) -> tuple[list[str], list[str]]:
    text = theme_text.lower()
    profiles = [
        (("battle", "storm", "warfare", "attack", "struggle"), [
            "person standing in a storm with wind and rain",
            "person climbing a rocky ridge against heavy wind",
            "person walking forward through dark clouds with resolve",
        ], ["dramatic storm lighting", "cool evening light", "golden hour sunlight"]),
        (("hope", "healing", "future", "light", "restoration"), [
            "person watching sunrise from a hillside",
            "person praying near window light at dawn",
            "person standing in an open field as morning light breaks through clouds",
        ], ["warm sunrise light", "golden hour sunlight", "soft window light"]),
    ]
    for keywords, scenes, lighting in profiles:
        if any(keyword in text for keyword in keywords):
            return scenes, lighting
    return (
        [
            "person watching sunrise from a hillside",
            "person praying near window light",
            "person standing in an open landscape with hopeful posture",
        ],
        ["warm sunrise light", "soft window light", "golden hour sunlight"],
    )


def _thumbnail_creative_profile(theme_text: str) -> dict[str, str]:
    text = (theme_text or "").lower()
    profiles = [
        (
            ("battle", "storm", "warfare", "attack", "struggle"),
            {
                "mood_color_direction": "deep charcoal, steel blue, and electric white highlights",
                "layout_style": "off-center subject with oversized statement text cutting across the frame",
                "background_style": "storm clouds, blowing rain, and atmospheric haze",
                "typography_feel": "bold condensed sans-serif with high contrast and cinematic weight",
                "editor_notes": "Make the image feel urgent, resilient, and confrontational without becoming chaotic.",
            },
        ),
        (
            ("hope", "healing", "future", "light", "restoration"),
            {
                "mood_color_direction": "warm gold, amber, soft cream, and sunrise blue",
                "layout_style": "hero portrait with spacious negative space and hopeful upward movement",
                "background_style": "sunrise glow, soft haze, and expansive natural depth",
                "typography_feel": "clean bold sans-serif with elegant spacing and calm confidence",
                "editor_notes": "Favor emotional lift and clarity over intensity so the promise feels believable.",
            },
        ),
        (
            ("truth", "repent", "conviction", "holy", "righteous"),
            {
                "mood_color_direction": "rich black, ivory, muted bronze, and focused spotlight contrast",
                "layout_style": "tight portrait framing with strong eye-line and centered headline force",
                "background_style": "minimal dramatic backdrop with subtle texture and shadow falloff",
                "typography_feel": "sharp modern serif-sans hybrid with conviction and authority",
                "editor_notes": "Keep the composition clean and forceful so the message feels direct and weighty.",
            },
        ),
    ]
    for keywords, profile in profiles:
        if any(keyword in text for keyword in keywords):
            return profile
    return {
        "mood_color_direction": "warm cinematic contrast with natural skin tones and atmospheric highlights",
        "layout_style": "clear focal subject with large readable headline and layered depth",
        "background_style": "soft environmental texture with subtle cinematic blur",
        "typography_feel": "bold modern sans-serif with clean hierarchy",
        "editor_notes": "Aim for a polished YouTube sermon thumbnail that feels premium, emotional, and easy to understand at a glance.",
    }


def _clean_thumbnail_phrase(phrase: str) -> str:
    words = re.findall(r"[A-Za-z0-9']+", _ensure_str(phrase))
    cleaned = " ".join(words[:3]).upper().strip()
    return cleaned or "HOLD ON"


def _pick_thumbnail_phrase(youtube_title: str, youtube_description: str, sermon_metadata: dict[str, Any] | None = None) -> str:
    theme_text = " ".join(
        part for part in (_pick_sermon_theme(youtube_title, youtube_description, sermon_metadata), _ensure_str(youtube_title)) if part
    ).lower()
    for keywords, phrase in [
        (("guard", "heart"), "GUARD YOUR HEART"),
        (("check", "heart"), "CHECK YOUR HEART"),
        (("heart", "condition"), "HEART CONDITION"),
        (("mirror",), "CHECK THE MIRROR"),
        (("change", "you"), "LET IT CHANGE YOU"),
        (("battle", "storm", "warfare", "struggle"), "STAND FIRM"),
        (("hope", "future", "light", "healing"), "HOLD ON"),
        (("truth", "reflect", "repent", "honest"), "FACE THE TRUTH"),
        (("teach", "scripture", "word", "wisdom"), "FIND ANSWERS"),
        (("trust", "faith", "persever", "trial", "wait", "endure"), "DON'T QUIT"),
        (("freedom", "breakthrough", "chains", "victory", "deliver"), "BREAK FREE"),
    ]:
        if any(keyword in theme_text for keyword in keywords):
            return phrase
    title_words = [
        word.upper()
        for word in re.findall(r"[A-Za-z0-9']+", youtube_title)
        if word.lower() not in _STOPWORDS and len(word) > 2
    ]
    return _clean_thumbnail_phrase(" ".join(title_words[:3])) if title_words else "HOLD ON"


def render_thumbnail_prompt(variant: dict[str, str]) -> str:
    phrase = _clean_thumbnail_phrase(variant.get("thumbnail_phrase", ""))
    position = _ensure_str(variant.get("text_position")).lower()
    if position not in THUMBNAIL_ALLOWED_POSITIONS:
        position = "center"
    return (
        "Create a cinematic YouTube sermon thumbnail.\n\n"
        f"Message context:\nTitle: {_ensure_str(variant.get('sermon_title')) or 'Untitled sermon'}\n"
        f"Theme: {_ensure_str(variant.get('sermon_theme')) or 'hope'}\n"
        f"Summary: {_ensure_str(variant.get('sermon_summary')) or 'A message of faith, hope, and perseverance.'}\n\n"
        "Creative direction:\n"
        f"Concept title: {_ensure_str(variant.get('title')) or 'Hero sermon thumbnail'}\n"
        f"Mood / color direction: {_ensure_str(variant.get('mood_color_direction')) or 'warm cinematic contrast with natural skin tones and atmospheric highlights'}\n"
        f"Layout style: {_ensure_str(variant.get('layout_style')) or 'clear focal subject with large readable headline and layered depth'}\n"
        f"Background style: {_ensure_str(variant.get('background_style')) or 'soft environmental texture with subtle cinematic blur'}\n"
        f"Typography feel: {_ensure_str(variant.get('typography_feel')) or 'bold modern sans-serif with clean hierarchy'}\n"
        f"Editor notes: {_ensure_str(variant.get('editor_notes')) or 'Aim for a polished YouTube sermon thumbnail that feels premium, emotional, and instantly readable.'}\n\n"
        f"Scene:\n{_ensure_str(variant.get('scene_concept')) or 'person watching sunrise from a hillside'}\n\n"
        "Composition:\n"
        "A human subject is in the foreground.\n"
        f'Large bold text "{phrase}" sits in the {position} area in the middle depth layer.\n'
        "The environment is in the background.\n"
        "The foreground subject must partially overlap at least one letter of the text to create natural depth.\n\n"
        f"Lighting:\n{_ensure_str(variant.get('lighting_description')) or 'warm sunrise light'}\n\n"
        "Style:\n"
        "Realistic photography, cinematic lighting, shallow depth of field, subtle film grain, bold composition.\n\n"
        "Important constraints:\n"
        "Use a visual metaphor for the sermon message, not a literal church service scene.\n"
        f'Only visible text in the image should be "{phrase}".\n'
        "Keep the text large, bold, and easy to read at small sizes."
    )


def fallback_thumbnail_prompt_variants(
    youtube_title: str,
    youtube_description: str,
    sermon_metadata: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    sermon_theme = _pick_sermon_theme(youtube_title, youtube_description, sermon_metadata)
    sermon_summary = _pick_sermon_summary(youtube_description, sermon_metadata)
    scenes, lighting_options = _keyword_profile(sermon_theme)
    creative_profile = _thumbnail_creative_profile(sermon_theme)
    base_phrase = _pick_thumbnail_phrase(youtube_title, youtube_description, sermon_metadata)
    variants: list[dict[str, str]] = []
    for index, label in enumerate(THUMBNAIL_VARIANT_LABELS):
        phrase = base_phrase
        if index == 1 and base_phrase == "HOLD ON":
            phrase = "DON'T QUIT"
        elif index == 2 and base_phrase in {"HOLD ON", "DON'T QUIT"}:
            phrase = "STAND FIRM"
        variant = {
            "label": label,
            "title": f"Variant {label}",
            "sermon_title": _ensure_str(youtube_title),
            "sermon_summary": sermon_summary,
            "sermon_theme": sermon_theme,
            "thumbnail_phrase": phrase,
            "scene_concept": scenes[index % len(scenes)],
            "text_position": THUMBNAIL_DEFAULT_POSITIONS[index],
            "lighting_description": lighting_options[index % len(lighting_options)],
            "mood_color_direction": creative_profile["mood_color_direction"],
            "layout_style": creative_profile["layout_style"],
            "background_style": creative_profile["background_style"],
            "typography_feel": creative_profile["typography_feel"],
            "editor_notes": creative_profile["editor_notes"],
        }
        variant["prompt"] = render_thumbnail_prompt(variant)
        variants.append(variant)
    return variants


def build_thumbnail_prompt_planner(
    transcript: str,
    youtube_title: str,
    youtube_description: str,
    preacher_name: str = "",
    date_preached: str = "",
    sermon_metadata: dict[str, Any] | None = None,
) -> str:
    metadata = sermon_metadata if isinstance(sermon_metadata, dict) else {}
    metadata_block = json.dumps(
        {
            "topics": metadata.get("topics") or [],
            "tags": metadata.get("tags") or [],
            "mainPoints": metadata.get("mainPoints") or [],
            "teachingStatements": metadata.get("teachingStatements") or [],
            "description": metadata.get("description") or "",
        },
        ensure_ascii=False,
        indent=2,
    )
    return (
        "You are a VISUAL CREATIVE DIRECTOR planning 3 YouTube thumbnail prompt variants for a church sermon video.\n\n"
        "HARD RULES:\n"
        "- The composition must be layered as subject in foreground, text in middle layer, environment in background.\n"
        "- The foreground subject must partially overlap the text.\n"
        "- Use metaphorical imagery, not a literal church service scene.\n"
        "- The thumbnail phrase must be 1-3 words.\n"
        "- Create exactly 3 variants.\n"
        "- Use these text positions in order: A=center, B=left, C=right.\n"
        "- Choose lighting from this list only: " + ", ".join(THUMBNAIL_ALLOWED_LIGHTING) + ".\n\n"
        "CREATIVE STRATEGY RULES:\n"
        "- Think like a premium YouTube thumbnail designer, not a metadata formatter.\n"
        "- Favor a strong emotional image, bold hook phrase, and instantly readable concept.\n"
        "- Each variant should feel visually distinct, not like tiny edits of the same scene.\n"
        "- Use color, mood, layout, and typography direction that reinforce the message.\n"
        "- Avoid generic sunrise-placeholder ideas unless the sermon genuinely points there.\n"
        "- The best concepts usually feel like a visual metaphor, not a summary sentence.\n\n"
        'OUTPUT FORMAT: Return only valid JSON with a "variants" array.\n\n'
        + _context_block(preacher_name, date_preached)
        + f"YouTube title:\n{youtube_title.strip()}\n\n"
        + f"YouTube description:\n{_safe_excerpt(youtube_description, 500)}\n\n"
        + f"Sermon metadata:\n{metadata_block}\n\n"
        + f"Transcript excerpt:\n{_safe_excerpt(transcript, 2200)}\n\n"
        "Return exactly 3 variants in JSON now.\n"
        'Each variant should include these keys: label, title, sermon_theme, sermon_summary, thumbnail_phrase, scene_concept, text_position, lighting_description, mood_color_direction, layout_style, background_style, typography_feel, editor_notes.'
    )


def parse_thumbnail_prompt_variants(
    raw: str,
    youtube_title: str,
    youtube_description: str,
    sermon_metadata: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    try:
        data = _extract_json_object(raw)
        source_variants = data.get("variants")
        if not isinstance(source_variants, list):
            raise ValueError("Missing variants list")
    except Exception:
        return fallback_thumbnail_prompt_variants(youtube_title, youtube_description, sermon_metadata)

    fallback = fallback_thumbnail_prompt_variants(youtube_title, youtube_description, sermon_metadata)
    output: list[dict[str, str]] = []
    for index, default_variant in enumerate(fallback):
        source = source_variants[index] if index < len(source_variants) and isinstance(source_variants[index], dict) else {}
        variant = dict(default_variant)
        variant["label"] = THUMBNAIL_VARIANT_LABELS[index]
        variant["title"] = _ensure_str(source.get("title")) or default_variant["title"]
        variant["sermon_theme"] = _ensure_str(source.get("sermon_theme")) or default_variant["sermon_theme"]
        variant["sermon_summary"] = _safe_excerpt(
            _ensure_str(source.get("sermon_summary")) or default_variant["sermon_summary"],
            220,
        )
        variant["thumbnail_phrase"] = _clean_thumbnail_phrase(
            _ensure_str(source.get("thumbnail_phrase")) or default_variant["thumbnail_phrase"]
        )
        variant["scene_concept"] = _ensure_str(source.get("scene_concept")) or default_variant["scene_concept"]
        position = _ensure_str(source.get("text_position")).lower()
        variant["text_position"] = position if position in THUMBNAIL_ALLOWED_POSITIONS else default_variant["text_position"]
        variant["lighting_description"] = _ensure_str(source.get("lighting_description")) or default_variant["lighting_description"]
        variant["mood_color_direction"] = _ensure_str(source.get("mood_color_direction")) or default_variant["mood_color_direction"]
        variant["layout_style"] = _ensure_str(source.get("layout_style")) or default_variant["layout_style"]
        variant["background_style"] = _ensure_str(source.get("background_style")) or default_variant["background_style"]
        variant["typography_feel"] = _ensure_str(source.get("typography_feel")) or default_variant["typography_feel"]
        variant["editor_notes"] = _ensure_str(source.get("editor_notes")) or default_variant["editor_notes"]
        variant["prompt"] = render_thumbnail_prompt(variant)
        output.append(variant)
    return output


REEL_PLATFORM_KEYS = ("instagram", "tiktok", "youtube", "facebook")


def build_reel_social_prompt(transcript_excerpt: str, preacher_name: str = "", date_preached: str = "") -> str:
    return (
        "You are now acting as a SHORT-FORM CONTENT STRATEGIST.\n"
        "INPUT:\n"
        "You will receive a transcript excerpt from a sermon clip that was previously extracted using Editor Brain + Cadence Mapping Mode.\n\n"
        "GOAL:\n"
        "Create PLATFORM-SPECIFIC titles, descriptions, and tags for Instagram Reels, TikTok, YouTube Shorts, and Facebook Reels.\n\n"
        "CONTENT STYLE RULES:\n"
        "- Maintain the original sermon message tone.\n"
        "- Titles must be strong, curiosity-driven, and scroll-stopping.\n"
        "- Keep titles clear and keyword-rich (40-70 characters is ideal when the platform allows it).\n"
        "- Descriptions must be benefit-focused and include a natural call-to-action.\n"
        "- Avoid generic church language; write in a way that connects with both church and non-church viewers.\n\n"
        "PLATFORM OPTIMIZATION:\n"
        "- INSTAGRAM REELS: short punchy title, caption around 120-180 characters, 5-10 targeted hashtags focused on saves and shares.\n"
        "- TIKTOK: title/hook line, caption around 150-300 characters, 3-5 strong hashtags, end with a question or engagement prompt.\n"
        "- YOUTUBE SHORTS: title 40-70 characters, description 100-200 words with CTA, 10-15 SEO tags, include 3 hashtags at the bottom.\n"
        "- FACEBOOK REELS: clear statement title 40-80 characters, short encouragement paragraph, minimal hashtags (2-5 max).\n\n"
        "IMPORTANT STRATEGY RULES:\n"
        "- The first line of every description must reinforce the spoken hook.\n"
        "- Each platform version should feel native, not copy/paste.\n"
        "- Keep clarity higher than cleverness.\n"
        "- Titles should front-load the benefit or bold statement.\n\n"
        "Return only valid JSON using this exact shape:\n"
        "{\n"
        '  "platforms": {\n'
        '    "instagram": { "title": "...", "description": "...", "tags": ["#...", "#..."] },\n'
        '    "tiktok": { "title": "...", "description": "...", "tags": ["#...", "#..."] },\n'
        '    "youtube": { "title": "...", "description": "...", "tags": ["tag one", "tag two"] },\n'
        '    "facebook": { "title": "...", "description": "...", "tags": ["#...", "#..."] }\n'
        "  }\n"
        "}\n\n"
        + _context_block(preacher_name, date_preached)
        + f"TRANSCRIPT EXCERPT:\n---\n{transcript_excerpt.strip()}\n---\n\n"
        "Return the JSON now."
    )


def parse_reel_social_response(raw: str) -> dict[str, dict[str, Any]]:
    data = _extract_json_object(raw)
    platforms = data.get("platforms")
    if not isinstance(platforms, dict):
        raise ValueError("Response did not include a platforms object.")

    output: dict[str, dict[str, Any]] = {}
    for key in REEL_PLATFORM_KEYS:
        source = platforms.get(key) if isinstance(platforms.get(key), dict) else {}
        tags = [str(item).strip() for item in (source.get("tags") or []) if str(item).strip()]
        output[key] = {
            "title": _ensure_str(source.get("title")),
            "description": _ensure_str(source.get("description")),
            "tags": tags,
        }
    return output


def build_reel_graphics_prompt(transcript_excerpt: str) -> str:
    return (
        "You are now acting as a VISUAL CREATIVE DIRECTOR designing graphics for short-form sermon content.\n"
        "INPUT:\n"
        "At the bottom of this prompt you will receive a transcript excerpt from a sermon clip.\n\n"
        "PRIMARY GOAL:\n"
        "Create GRAPHIC CONCEPTS that visually reinforce the message, emotion, and cadence of the spoken words.\n\n"
        "IMPORTANT:\n"
        "- Do NOT summarize the sermon.\n"
        "- Extract strong VISUAL THEMES, METAPHORS, and TEXT OVERLAYS from the transcript.\n"
        "- Design graphics that would work for Instagram Reels covers, YouTube Shorts visuals, Canva posts, or motion graphics backgrounds.\n\n"
        "VISUAL ANALYSIS RULES:\n"
        "- Identify strong metaphors that translate visually.\n"
        "- Identify short punch phrases suitable for on-screen text.\n"
        "- Identify emotional tone (conviction, encouragement, declaration, teaching).\n"
        "- Identify imagery suggested by the language (light, movement, weight, storms, seasons, doors, etc.).\n\n"
        "Return only valid JSON with this exact shape:\n"
        "{\n"
        '  "concepts": [\n'
        '    {\n'
        '      "title": "...",\n'
        '      "visual_theme": "...",\n'
        '      "mood_color_direction": "...",\n'
        '      "layout_style": "...",\n'
        '      "main_hook_line": "...",\n'
        '      "supporting_line": "...",\n'
        '      "subtitle_emphasis_words": ["...", "..."],\n'
        '      "background_style": "...",\n'
        '      "typography_feel": "...",\n'
        '      "motion_suggestions": ["...", "..."],\n'
        '      "editor_notes": "..."\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Create exactly 3 concepts.\n\n"
        f"TRANSCRIPT EXCERPT:\n---\n{transcript_excerpt.strip()}\n---\n\n"
        "Return the JSON now."
    )


def parse_reel_graphics_response(raw: str) -> list[dict[str, Any]]:
    data = _extract_json_object(raw)
    concepts = data.get("concepts")
    if not isinstance(concepts, list):
        raise ValueError("Response did not include a concepts array.")

    output: list[dict[str, Any]] = []
    for index, item in enumerate(concepts[:3], start=1):
        source = item if isinstance(item, dict) else {}
        emphasis = [str(word).strip() for word in (source.get("subtitle_emphasis_words") or []) if str(word).strip()]
        motions = [str(word).strip() for word in (source.get("motion_suggestions") or []) if str(word).strip()]
        title = _ensure_str(source.get("title")) or f"Concept {index}"
        visual_theme = _ensure_str(source.get("visual_theme"))
        mood_color_direction = _ensure_str(source.get("mood_color_direction"))
        layout_style = _ensure_str(source.get("layout_style"))
        main_hook_line = _ensure_str(source.get("main_hook_line"))
        supporting_line = _ensure_str(source.get("supporting_line"))
        background_style = _ensure_str(source.get("background_style"))
        typography_feel = _ensure_str(source.get("typography_feel"))
        editor_notes = _ensure_str(source.get("editor_notes"))
        prompt = (
            f"Create a vertical sermon-reel graphic.\n\n"
            f"Concept title: {title}\n"
            f"Visual theme: {visual_theme or 'Bold emotional metaphor'}\n"
            f"Mood / color direction: {mood_color_direction or 'High-contrast cinematic tones'}\n"
            f"Layout style: {layout_style or 'Centered text with portrait focus'}\n"
            f"Main hook line: {main_hook_line or 'Stay Ready'}\n"
            f"Supporting line: {supporting_line or 'Optional secondary support text'}\n"
            f"Subtitle emphasis words: {', '.join(emphasis) if emphasis else 'None specified'}\n"
            f"Background style: {background_style or 'Abstract light and texture'}\n"
            f"Typography feel: {typography_feel or 'Bold modern sans-serif'}\n"
            f"Motion suggestions: {', '.join(motions) if motions else 'Subtle scale-in and slow zoom'}\n"
            f"Editor notes: {editor_notes or 'Match the conviction and cadence of the spoken words.'}"
        )
        output.append(
            {
                "label": chr(64 + index),
                "title": title,
                "visual_theme": visual_theme,
                "mood_color_direction": mood_color_direction,
                "layout_style": layout_style,
                "main_hook_line": main_hook_line,
                "supporting_line": supporting_line,
                "subtitle_emphasis_words": emphasis,
                "background_style": background_style,
                "typography_feel": typography_feel,
                "motion_suggestions": motions,
                "editor_notes": editor_notes,
                "prompt": prompt,
            }
        )
    return output
