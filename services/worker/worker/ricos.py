"""Markdown to Ricos, the rich-content format Wix Blog takes.

Only as much markdown as the blog prompt actually emits: a plain title line,
`##` headings, paragraphs, and the occasional list. Inline `**bold**` and
`*italic*` are carried as decorations rather than left on the page as
asterisks.

The rule everything else bends to: anything unrecognised becomes a paragraph
carrying its literal text. A converter that quietly drops what it does not
understand produces a blog post that reads perfectly well and is missing a
paragraph, which is the kind of bug found by a reader months later, if at
all.
"""

from __future__ import annotations

import itertools
import re
from typing import Any

_counter = itertools.count(1)


def _node_id(prefix: str) -> str:
    return f"{prefix}-{next(_counter)}"


# One pattern for both marks, so a line is walked once and the pieces come
# out in the order they appear. Two passes would nest badly on a line that
# holds one of each.
_INLINE = re.compile(r"\*\*(.+?)\*\*|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")

_BULLET = re.compile(r"^\s*[-*+]\s+(.*)$")
_NUMBER = re.compile(r"^\s*\d+[.)]\s+(.*)$")
_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")


def _text_nodes(text: str) -> list[dict[str, Any]]:
    """Split a line into TEXT nodes, marking bold and italic runs."""
    pieces: list[tuple[str, list[str]]] = []
    index = 0
    for match in _INLINE.finditer(text):
        if match.start() > index:
            pieces.append((text[index : match.start()], []))
        if match.group(1) is not None:
            pieces.append((match.group(1), ["BOLD"]))
        else:
            pieces.append((match.group(2), ["ITALIC"]))
        index = match.end()
    if index < len(text):
        pieces.append((text[index:], []))

    return [
        {
            "type": "TEXT",
            "id": "",
            "nodes": [],
            "textData": {
                "text": chunk,
                "decorations": [{"type": d} for d in decos],
            },
        }
        for chunk, decos in pieces
        if chunk
    ]


def _paragraph(text: str) -> dict[str, Any]:
    return {
        "type": "PARAGRAPH",
        "id": _node_id("par"),
        "nodes": _text_nodes(text),
        "paragraphData": {},
    }


def _heading(level: int, text: str) -> dict[str, Any]:
    return {
        "type": "HEADING",
        "id": _node_id("head"),
        "nodes": _text_nodes(text),
        "headingData": {"level": level},
    }


def _list_item(text: str) -> dict[str, Any]:
    return {
        "type": "LIST_ITEM",
        "id": _node_id("item"),
        "nodes": [_paragraph(text)],
    }


def _list(kind: str, items: list[str]) -> dict[str, Any]:
    return {
        "type": kind,
        "id": _node_id("list"),
        "nodes": [_list_item(i) for i in items],
    }


def markdown_to_ricos(markdown: str) -> dict[str, Any]:
    """Convert markdown into a Ricos rich-content document."""
    nodes: list[dict[str, Any]] = []
    pending: list[str] = []
    pending_kind = ""

    def flush_list() -> None:
        nonlocal pending, pending_kind
        if pending:
            nodes.append(_list(pending_kind, pending))
        pending = []
        pending_kind = ""

    for raw in markdown.splitlines():
        line = raw.rstrip()
        if not line.strip():
            # Blank lines separate blocks; they are not content of their own.
            flush_list()
            continue

        bullet = _BULLET.match(line)
        number = _NUMBER.match(line)

        if bullet:
            if pending_kind and pending_kind != "BULLETED_LIST":
                flush_list()
            pending_kind = "BULLETED_LIST"
            pending.append(bullet.group(1))
            continue
        if number:
            if pending_kind and pending_kind != "ORDERED_LIST":
                flush_list()
            pending_kind = "ORDERED_LIST"
            pending.append(number.group(1))
            continue

        flush_list()

        heading = _HEADING.match(line)
        if heading:
            nodes.append(_heading(min(len(heading.group(1)), 6), heading.group(2)))
            continue

        # Everything else, including syntax this converter has no node for.
        # It reaches the page as its own literal text rather than vanishing.
        nodes.append(_paragraph(line))

    flush_list()
    return {"nodes": nodes}
