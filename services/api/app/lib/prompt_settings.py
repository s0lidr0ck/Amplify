"""Prompt template registry and persisted overrides for admin settings."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_API_ROOT = Path(__file__).resolve().parents[2]
_PROMPT_OVERRIDE_PATH = _API_ROOT / "data" / "prompt_overrides.json"

PROMPT_DEFINITIONS: dict[str, dict[str, str]] = {
    "metadata_scribe": {
        "label": "Metadata Extractor",
        "category": "Metadata",
        "description": "Builds the structured sermon metadata JSON from the full transcript.",
        "template": """You are SCRIBE, a digital assistant trained to analyze Pentecostal sermon transcripts. Your task is to read a sermon transcript and output a single JSON object (and nothing else) with the exact keys described below.

IMPORTANT: Before producing output, read the ENTIRE transcript. Do not invent scriptures or statements not present. Output ONLY valid JSON.

{{context_block}}Required JSON shape (use these exact key names):
- title (string)
- description (string)
- scriptures (array of strings)
- mainPoints (array of strings)
- tags (array of strings): 3-10 tags from the tag list below only
- propheticStatements (array of strings)
- keyMoments (array of objects): each { "timestamp": "...", "quote": "...", "explanation": "..." }
- topics (array of strings)
- teachingStatements (array of strings)

Tag options (choose only from this list):
{{tag_options}}

Transcript:
---
{{transcript}}
---

Respond with only the JSON object, no other text.""",
    },
    "blog_post": {
        "label": "Blog Post",
        "category": "Long Form",
        "description": "Turns the sermon transcript into the long-form blog post.",
        "template": """You are writing a blog post for a church (NLC). Your post must match the tone, structure, and length of the example style below. Use the ENTIRE sermon transcript as your only source; do not invent content.

STYLE RULES:
- Tone: First person, speaking directly to the reader. Use "you" and "your".
- Length: About 3 min read (several hundred words, 4-6 main sections).
- Structure: One plain-text title line first, then body with ## section headings, short paragraphs, bullets or numbered lists where helpful.
- Content: Biblical references and stories from the sermon, applied to the reader's life.

EXAMPLE STYLE (match this tone and format):
---
{{style_excerpt_1}}

{{style_excerpt_2}}
---

{{context_block}}OUTPUT FORMAT:
- Output only markdown.
- First line must be the post title as plain text only. Do not wrap it in #, ##, **, quotes, or any markdown formatting.
- Then one blank line.
- Then the full post body with ## section headings.

Sermon transcript:
---
{{transcript}}
---

Write the blog post in markdown now.""",
    },
    "facebook_post": {
        "label": "Text Post",
        "category": "Social",
        "description": "Generates the Facebook text post from the saved blog post draft.",
        "template": """You are writing a Facebook post for a church. The post is based on the blog post below, which was adapted from a sermon. Write a SHORTER version that feels fresh.

RULES:
- Length: About half the length of the blog post.
- Tone: Direct, warm, conversational.
- Do NOT say things like 'In this sermon...' or 'The blog post above...'.
- End with a short line that invites engagement.

OUTPUT FORMAT: Output only the Facebook post text. No title and no markdown.

Blog post (markdown):
---
{{blog_post_markdown}}
---

Write the Facebook post now.""",
    },
    "youtube_packaging": {
        "label": "Title & Description",
        "category": "Packaging",
        "description": "Generates the base YouTube title and description when chapter data is not available.",
        "template": """You are writing a YouTube video title and description for a church sermon. Use the sermon transcript below as your only source.

RULES:
- Title: One line, under 100 characters. Catchy, clear, and search-friendly. No clickbait.
- Description: 2-4 short paragraphs. End with a line inviting viewers to engage.
- Do NOT include timestamps or a chapter list in the description.

{{context_block}}OUTPUT FORMAT: First line is the title. Then a blank line. Then the full description.

Sermon transcript:
---
{{transcript}}
---

Write the YouTube title and description now.""",
    },
    "youtube_packaging_with_chapters": {
        "label": "Title & Description With Chapters",
        "category": "Packaging",
        "description": "Generates the YouTube title, description, and chapter labels when transcript segments are available.",
        "template": """You are writing a YouTube video title, description, and chapter titles for a church sermon. Use the sermon content below as your only source.

RULES:
- Title: One line, under 100 characters.
- Description: 2-4 short paragraphs after the title.
- Chapter titles: output exactly {{segment_count}} short chapter titles in the same order.

{{context_block}}OUTPUT FORMAT:
1. First line: title.
2. Blank line.
3. Description.
4. A line that says exactly: ---CHAPTERS---
5. Then exactly {{segment_count}} chapter-title lines.

Sermon segments:
---
{{segment_block}}---

Write the full response now.""",
    },
    "thumbnail_planner": {
        "label": "Sermon Thumbnail Planner",
        "category": "Visuals",
        "description": "Plans the three sermon thumbnail prompt variants from the sermon transcript and packaging copy.",
        "template": """You are a VISUAL CREATIVE DIRECTOR planning 3 YouTube thumbnail prompt variants for a church sermon video.

HARD RULES:
- The composition must be layered as subject in foreground, text in middle layer, environment in background.
- The foreground subject must partially overlap the text.
- Use metaphorical imagery, not a literal church service scene.
- The thumbnail phrase must be 1-3 words.
- Create exactly 3 variants.
- Use these text positions in order: A=center, B=left, C=right.
- Choose lighting from this list only: {{allowed_lighting}}.

CREATIVE STRATEGY RULES:
- Think like a premium YouTube thumbnail designer, not a metadata formatter.
- Favor a strong emotional image, bold hook phrase, and instantly readable concept.
- Each variant should feel visually distinct, not like tiny edits of the same scene.
- Use color, mood, layout, and typography direction that reinforce the message.
- Avoid generic sunrise-placeholder ideas unless the sermon genuinely points there.
- The best concepts usually feel like a visual metaphor, not a summary sentence.
- At least one variant should be object-led or symbolic close-up, at least one should be a tight portrait, and at most one should lean environmental.
- Avoid generic dramatic field, ruins, or spotlight imagery unless the sermon clearly demands it.
- Design each concept so the main subject and text survive both horizontal and vertical crops.
- Wide concepts are allowed, but never let the person become a tiny figure floating in empty scenery.

OUTPUT FORMAT: Return only valid JSON with a "variants" array.

{{context_block}}YouTube title:
{{youtube_title}}

YouTube description:
{{youtube_description}}

Sermon metadata:
{{metadata_block}}

Transcript excerpt:
{{transcript_excerpt}}

Return exactly 3 variants in JSON now.
Each variant should include these keys: label, title, sermon_theme, sermon_summary, thumbnail_phrase, scene_concept, text_position, lighting_description, mood_color_direction, layout_style, background_style, typography_feel, shot_preference, framing_guidance, editor_notes.""",
    },
    "reel_social": {
        "label": "Final Reel Social Copy",
        "category": "Reels",
        "description": "Generates platform-specific titles, descriptions, and tags for the final reel.",
        "template": """You are now acting as a SHORT-FORM CONTENT STRATEGIST.
INPUT:
You will receive a transcript excerpt from a sermon clip that was previously extracted using Editor Brain + Cadence Mapping Mode.

GOAL:
Create PLATFORM-SPECIFIC titles, descriptions, and tags for Instagram Reels, TikTok, YouTube Shorts, and Facebook Reels.

CONTENT STYLE RULES:
- Maintain the original sermon message tone.
- Titles must be strong, curiosity-driven, and scroll-stopping.
- Keep titles clear and keyword-rich (40-70 characters is ideal when the platform allows it).
- Descriptions must be benefit-focused and include a natural call-to-action.
- Avoid generic church language; write in a way that connects with both church and non-church viewers.

PLATFORM OPTIMIZATION:
- INSTAGRAM REELS: short punchy title, caption around 120-180 characters, 5-10 targeted hashtags focused on saves and shares.
- TIKTOK: title/hook line, caption around 150-300 characters, 3-5 strong hashtags, end with a question or engagement prompt.
- YOUTUBE SHORTS: title 40-70 characters, description 100-200 words with CTA, 10-15 SEO tags, include 3 hashtags at the bottom.
- FACEBOOK REELS: clear statement title 40-80 characters, short encouragement paragraph, minimal hashtags (2-5 max).

IMPORTANT STRATEGY RULES:
- The first line of every description must reinforce the spoken hook.
- Each platform version should feel native, not copy/paste.
- Keep clarity higher than cleverness.
- Titles should front-load the benefit or bold statement.

Return only valid JSON using this exact shape:
{
  "platforms": {
    "instagram": { "title": "...", "description": "...", "tags": ["#...", "#..."] },
    "tiktok": { "title": "...", "description": "...", "tags": ["#...", "#..."] },
    "youtube": { "title": "...", "description": "...", "tags": ["tag one", "tag two"] },
    "facebook": { "title": "...", "description": "...", "tags": ["#...", "#..."] }
  }
}

{{context_block}}TRANSCRIPT EXCERPT:
---
{{transcript_excerpt}}
---

Return the JSON now.""",
    },
    "reel_graphics": {
        "label": "Reel Thumbnail Planner",
        "category": "Visuals",
        "description": "Generates the three visual concept prompts for the reel thumbnail page.",
        "template": """You are now acting as a VISUAL CREATIVE DIRECTOR designing graphics for short-form sermon content.
INPUT:
At the bottom of this prompt you will receive a transcript excerpt from a sermon clip.

PRIMARY GOAL:
Create GRAPHIC CONCEPTS that visually reinforce the message, emotion, and cadence of the spoken words.

IMPORTANT:
- Do NOT summarize the sermon.
- Extract strong VISUAL THEMES, METAPHORS, and TEXT OVERLAYS from the transcript.
- Design graphics that would work for Instagram Reels covers, YouTube Shorts visuals, Canva posts, or motion graphics backgrounds.

VISUAL ANALYSIS RULES:
- Identify strong metaphors that translate visually.
- Identify short punch phrases suitable for on-screen text.
- Identify emotional tone (conviction, encouragement, declaration, teaching).
- Identify imagery suggested by the language (light, movement, weight, storms, seasons, doors, etc.).

Return only valid JSON with this exact shape:
{
  "concepts": [
    {
      "title": "...",
      "visual_theme": "...",
      "mood_color_direction": "...",
      "layout_style": "...",
      "main_hook_line": "...",
      "supporting_line": "...",
      "subtitle_emphasis_words": ["...", "..."],
      "background_style": "...",
      "typography_feel": "...",
      "motion_suggestions": ["...", "..."],
      "editor_notes": "..."
    }
  ]
}

Create exactly 3 concepts.

TRANSCRIPT EXCERPT:
---
{{transcript_excerpt}}
---

Return the JSON now.""",
    },
    "clip_candidates_pass1": {
        "label": "Clip Lab Candidate Builder",
        "category": "Clip Lab",
        "description": "First pass that chooses coherent sermon candidate windows before ranking.",
        "template": """You are selecting contextually coherent sermon clips for short-form video.
Task: choose 20-30 candidates from transcript blocks.
Each candidate must be 30-60 seconds, coherent standalone, and have a strong opening line.
Balance across early/mid/late sermon phases.
Output JSON only with this schema:
{
  "candidates": [
    {
      "start_time": "HH:MM:SS.mmm",
      "end_time": "HH:MM:SS.mmm",
      "opening_hook": "string"
    }
  ]
}

Target candidate count: {{candidate_target}}
Transcript blocks:
{{payload_json}}""",
    },
    "clip_hook_score": {
        "label": "Clip Lab Hook Scorer",
        "category": "Clip Lab",
        "description": "Scores the opening-hook strength of each clip candidate.",
        "template": """You are scoring opening hooks for short-form sermon clips.
Return JSON only. No markdown.
Score only scroll-stopping hook quality of the opening line(s), not theology.
Output schema:
{
  "hook_scores": [
    {
      "candidate_id": 1,
      "llm_hook_score": 0,
      "confidence": "low|medium|high",
      "evidence": ["string"],
      "reason_short": "string"
    }
  ]
}

Rules:
- Return every candidate_id in the input exactly once.
- llm_hook_score must be an integer between 0 and 100.
- confidence must be low, medium, or high.
- evidence list must have 1 to 3 short items.
- reason_short should be one sentence <= 180 chars.

Candidates:
{{payload_json}}""",
    },
    "clip_ranker": {
        "label": "Clip Lab Ranker",
        "category": "Clip Lab",
        "description": "Final ranker that selects the strongest reel candidates for Clip Lab.",
        "template": """You are a short-form sermon video editor. Rank clip candidates by reel potential.
Focus on hook strength, cadence clarity, standalone clarity, conviction impact, and platform performance.
Prioritize spoken rhythm and delivery over abstract theology.
Return exactly {{output_count}} clips when possible.

Output MUST be valid JSON only, no markdown, no commentary.
Use this exact schema:
{
  "clips": [
    {
      "candidate_id": 1,
      "start_time": "HH:MM:SS.mmm",
      "end_time": "HH:MM:SS.mmm",
      "opening_hook": "string",
      "clip_type": "Teaching|Conviction|Declaration|Encouragement",
      "cadence_marker": "Punch Phrase|Rising Stack|Repetition|Metaphor|Pause Punch",
      "editorial_scores": {
        "editor": 0,
        "hook": 0,
        "cadence": 0,
        "standalone": 0,
        "emotion": 0
      },
      "editor_score": 0,
      "editor_reason": "string",
      "scroll_stopping_strength": "Low|Medium|High",
      "best_platform_fit": "Reels|TikTok|Shorts"
    }
  ]
}

Rules:
- Keep clips in chronological order.
- Keep 30-60 second windows.
- editor_score must be between 0 and 100.
- editorial_scores values must each be between 0 and 100.
- Use candidate_id values from input.

Reject criteria (do not pick):
- Opening first 5 seconds has weak/no hook.
- Excessive setup with low standalone clarity.
- Flat cadence with no strong delivery marker.

Diversity constraints:
- Balance selections across early, mid, and late phases.
- Avoid clustering all clips in one phase unless candidates are clearly weak elsewhere.

Reasoning constraints:
- editor_reason must mention at least two concrete signals from persisted metrics/signals.
- Only reference these metrics by name if used: editor, hook, cadence, standalone, emotion, energy, contrast, overall_candidate.
- Prefer clips where short declarative lines stack back-to-back.

Candidate input:
{{payload_json}}""",
    },
}


def _load_overrides() -> dict[str, str]:
    if not _PROMPT_OVERRIDE_PATH.exists():
        return {}
    try:
        data = json.loads(_PROMPT_OVERRIDE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    output: dict[str, str] = {}
    for key, value in data.items():
        if key in PROMPT_DEFINITIONS and isinstance(value, str) and value.strip():
            output[key] = value
    return output


def _save_overrides(overrides: dict[str, str]) -> None:
    _PROMPT_OVERRIDE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _PROMPT_OVERRIDE_PATH.write_text(
        json.dumps(overrides, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def list_prompt_settings() -> list[dict[str, str]]:
    overrides = _load_overrides()
    items: list[dict[str, str]] = []
    for key, prompt in PROMPT_DEFINITIONS.items():
        items.append(
            {
                "key": key,
                "label": prompt["label"],
                "category": prompt["category"],
                "description": prompt["description"],
                "template": overrides.get(key, prompt["template"]),
                "default_template": prompt["template"],
                "is_overridden": "true" if key in overrides else "false",
            }
        )
    return items


def update_prompt_overrides(changes: dict[str, Any]) -> list[dict[str, str]]:
    overrides = _load_overrides()
    for key, value in changes.items():
        if key not in PROMPT_DEFINITIONS:
            continue
        default_template = PROMPT_DEFINITIONS[key]["template"]
        if value is None:
            overrides.pop(key, None)
            continue
        text = str(value)
        if not text.strip() or text == default_template:
            overrides.pop(key, None)
        else:
            overrides[key] = text
    _save_overrides(overrides)
    return list_prompt_settings()


def render_prompt_template(key: str, replacements: dict[str, Any]) -> str:
    template = _load_overrides().get(key, PROMPT_DEFINITIONS[key]["template"])
    rendered = template
    for name, value in replacements.items():
        rendered = rendered.replace(f"{{{{{name}}}}}", "" if value is None else str(value))
    return rendered
