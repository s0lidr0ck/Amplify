"""FastCap-derived prompt builders and parsers for publishing workflows."""

from __future__ import annotations

import json
import re
from typing import Any

from app.lib.prompt_settings import render_prompt_template

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
    return render_prompt_template(
        "metadata_scribe",
        {
            "context_block": context_block,
            "tag_options": TAG_OPTIONS,
            "transcript": transcript,
        },
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
    return render_prompt_template(
        "blog_post",
        {
            "context_block": context_block,
            "style_excerpt_1": NLC_STYLE_EXCERPT_1,
            "style_excerpt_2": NLC_STYLE_EXCERPT_2,
            "transcript": transcript,
        },
    )


def build_facebook_post_prompt(blog_post_markdown: str) -> str:
    return render_prompt_template("facebook_post", {"blog_post_markdown": blog_post_markdown})


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
    return render_prompt_template(
        "youtube_packaging",
        {
            "context_block": _context_block(preacher_name, date_preached),
            "transcript": transcript,
        },
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
    return render_prompt_template(
        "youtube_packaging_with_chapters",
        {
            "context_block": _context_block(preacher_name, date_preached),
            "segment_count": len(segments),
            "segment_block": segment_block,
        },
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


def _thumbnail_framing_variants() -> list[dict[str, str]]:
    return [
        {
            "framing_guidance": "Object-led close-up with the symbolic object and text both dominant. Compose so the core idea survives horizontal and vertical crops.",
            "shot_preference": "symbolic close-up",
        },
        {
            "framing_guidance": "Tight emotional portrait or torso-up human moment. Keep the face, gesture, and text inside a safe central zone for both 16:9 and 9:16 use.",
            "shot_preference": "tight portrait",
        },
        {
            "framing_guidance": "Medium environmental composition with stronger atmosphere, but keep the subject large enough that the frame never feels empty in landscape.",
            "shot_preference": "medium environmental",
        },
    ]


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

    # Build replacements from variant data, applying fallback defaults.
    replacements: dict[str, str] = {}

    # Pass through every key from the variant so custom planner fields
    # (e.g. emotional_hook, curiosity_gap) are available in the template.
    for key, value in variant.items():
        if key != "prompt":
            replacements[key] = _ensure_str(value)

    # Map well-known fields with fallback defaults.
    replacements["sermon_title"] = _ensure_str(variant.get("sermon_title")) or "Untitled sermon"
    replacements["sermon_theme"] = _ensure_str(variant.get("sermon_theme")) or "hope"
    replacements["sermon_summary"] = _ensure_str(variant.get("sermon_summary")) or "A message of faith, hope, and perseverance."
    replacements["concept_title"] = _ensure_str(variant.get("title")) or "Hero sermon thumbnail"
    replacements["mood_color_direction"] = _ensure_str(variant.get("mood_color_direction")) or "warm cinematic contrast with natural skin tones and atmospheric highlights"
    replacements["layout_style"] = _ensure_str(variant.get("layout_style")) or "clear focal subject with large readable headline and layered depth"
    replacements["background_style"] = _ensure_str(variant.get("background_style")) or "soft environmental texture with subtle cinematic blur"
    replacements["typography_feel"] = _ensure_str(variant.get("typography_feel")) or "bold modern sans-serif with clean hierarchy"
    replacements["shot_preference"] = _ensure_str(variant.get("shot_preference")) or "tight portrait"
    replacements["framing_guidance"] = _ensure_str(variant.get("framing_guidance")) or "Keep the subject and headline readable in both horizontal and vertical crops."
    replacements["editor_notes"] = _ensure_str(variant.get("editor_notes")) or "Aim for a polished YouTube sermon thumbnail that feels premium, emotional, and instantly readable."
    replacements["scene_concept"] = _ensure_str(variant.get("scene_concept")) or "person watching sunrise from a hillside"
    replacements["thumbnail_phrase"] = phrase
    replacements["text_position"] = position
    replacements["lighting_description"] = _ensure_str(variant.get("lighting_description")) or "warm sunrise light"

    return render_prompt_template("thumbnail_render", replacements)


def fallback_thumbnail_prompt_variants(
    youtube_title: str,
    youtube_description: str,
    sermon_metadata: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    sermon_theme = _pick_sermon_theme(youtube_title, youtube_description, sermon_metadata)
    sermon_summary = _pick_sermon_summary(youtube_description, sermon_metadata)
    scenes, lighting_options = _keyword_profile(sermon_theme)
    creative_profile = _thumbnail_creative_profile(sermon_theme)
    framing_variants = _thumbnail_framing_variants()
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
            "framing_guidance": framing_variants[index]["framing_guidance"],
            "shot_preference": framing_variants[index]["shot_preference"],
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
    return render_prompt_template(
        "thumbnail_planner",
        {
            "allowed_lighting": ", ".join(THUMBNAIL_ALLOWED_LIGHTING),
            "context_block": _context_block(preacher_name, date_preached),
            "youtube_title": youtube_title.strip(),
            "youtube_description": _safe_excerpt(youtube_description, 500),
            "metadata_block": metadata_block,
            "transcript_excerpt": _safe_excerpt(transcript, 2200),
        },
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

        # Pass through ALL keys from the LLM response so custom planner
        # fields (e.g. emotional_hook, curiosity_gap) are available in the
        # thumbnail_render template.
        for key, value in source.items():
            cleaned = _ensure_str(value) if isinstance(value, str) else str(value) if value is not None else ""
            if cleaned:
                variant[key] = cleaned

        # Apply well-known field mapping with fallback defaults.
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
        variant["shot_preference"] = _ensure_str(source.get("shot_preference")) or default_variant["shot_preference"]
        variant["framing_guidance"] = _ensure_str(source.get("framing_guidance")) or default_variant["framing_guidance"]
        variant["editor_notes"] = _ensure_str(source.get("editor_notes")) or default_variant["editor_notes"]
        variant["prompt"] = render_thumbnail_prompt(variant)
        output.append(variant)
    return output


REEL_PLATFORM_KEYS = ("instagram", "tiktok", "youtube", "facebook")


def build_reel_social_prompt(transcript_excerpt: str, preacher_name: str = "", date_preached: str = "") -> str:
    return render_prompt_template(
        "reel_social",
        {
            "context_block": _context_block(preacher_name, date_preached),
            "transcript_excerpt": transcript_excerpt.strip(),
        },
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
    return render_prompt_template("reel_graphics", {"transcript_excerpt": transcript_excerpt.strip()})


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
