"""Turning the blog prompt's markdown into what Wix Blog accepts.

The rule under test is the one that protects against silent damage: a line
this converter does not understand becomes a paragraph carrying its literal
text. A converter that drops the unfamiliar produces a post that reads
perfectly well and is missing a paragraph, which is the kind of bug found by
a reader months later, if at all.
"""

from __future__ import annotations

from worker.ricos import markdown_to_ricos


def texts(doc: dict) -> list[str]:
    """Every scrap of text in the document, in order."""
    out: list[str] = []

    def walk(node: dict) -> None:
        if node.get("type") == "TEXT":
            out.append(node["textData"]["text"])
        for child in node.get("nodes", []):
            walk(child)

    for node in doc["nodes"]:
        walk(node)
    return out


def decorations(doc: dict) -> list[str]:
    found: list[str] = []

    def walk(node: dict) -> None:
        if node.get("type") == "TEXT":
            for d in node["textData"].get("decorations", []):
                found.append(d["type"])
        for child in node.get("nodes", []):
            walk(child)

    for node in doc["nodes"]:
        walk(node)
    return found


def test_paragraph_becomes_a_paragraph():
    doc = markdown_to_ricos("Just a line of prose.")
    assert doc["nodes"][0]["type"] == "PARAGRAPH"
    assert texts(doc) == ["Just a line of prose."]


def test_heading_levels():
    doc = markdown_to_ricos("## Section\n\n### Smaller")
    assert doc["nodes"][0]["type"] == "HEADING"
    assert doc["nodes"][0]["headingData"]["level"] == 2
    assert doc["nodes"][1]["headingData"]["level"] == 3


def test_bullets_become_one_list():
    doc = markdown_to_ricos("- first\n- second")
    assert len(doc["nodes"]) == 1
    assert doc["nodes"][0]["type"] == "BULLETED_LIST"
    assert texts(doc) == ["first", "second"]


def test_numbered_list():
    doc = markdown_to_ricos("1. first\n2. second")
    assert doc["nodes"][0]["type"] == "ORDERED_LIST"
    assert texts(doc) == ["first", "second"]


def test_a_list_ends_when_the_prose_starts_again():
    doc = markdown_to_ricos("- one\n\nAfter.")
    assert [n["type"] for n in doc["nodes"]] == ["BULLETED_LIST", "PARAGRAPH"]


def test_switching_list_kind_starts_a_new_list():
    doc = markdown_to_ricos("- one\n1. two")
    assert [n["type"] for n in doc["nodes"]] == ["BULLETED_LIST", "ORDERED_LIST"]


def test_bold_and_italic_are_marked_not_stripped():
    doc = markdown_to_ricos("He is **worthy** of it all.")
    assert texts(doc) == ["He is ", "worthy", " of it all."]
    assert "BOLD" in decorations(doc)


def test_italic_alone():
    doc = markdown_to_ricos("Repair the *altar*.")
    assert texts(doc) == ["Repair the ", "altar", "."]
    assert "ITALIC" in decorations(doc)


def test_unknown_syntax_survives_as_text():
    # The whole point. A blockquote, a table, an image tag - anything the
    # converter has no node for must still reach the page.
    weird = "> Elijah said, come near unto me."
    doc = markdown_to_ricos(weird)
    assert weird in "".join(texts(doc))


def test_blank_lines_do_not_make_empty_paragraphs():
    doc = markdown_to_ricos("One.\n\n\n\nTwo.")
    assert len(doc["nodes"]) == 2


def test_every_node_has_an_id():
    # Ricos rejects nodes without one, and the failure is a 400 that says
    # nothing useful about which node was wrong.
    doc = markdown_to_ricos("## A\n\nB\n\n- c")
    for node in doc["nodes"]:
        assert node["id"]


def test_empty_input_is_an_empty_document():
    assert markdown_to_ricos("") == {"nodes": []}


def test_nothing_is_lost_from_a_realistic_post():
    markdown = (
        "## He Deserves My Altar\n"
        "\n"
        "Noah built one and God answered with a **covenant**.\n"
        "\n"
        "- An altar of praise\n"
        "- An altar of surrender\n"
        "\n"
        "How do our altars look tonight?\n"
    )
    doc = markdown_to_ricos(markdown)
    joined = "".join(texts(doc))
    for fragment in [
        "He Deserves My Altar",
        "Noah built one",
        "covenant",
        "An altar of praise",
        "An altar of surrender",
        "How do our altars look tonight?",
    ]:
        assert fragment in joined
