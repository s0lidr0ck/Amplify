import { useMutation } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { useState } from "react";

/**
 * Fixing the handout by hand.
 *
 * The structured pieces in this product are regenerate-or-nothing, and the
 * reasoning behind that is sound: hand-editing JSON is a worse tool than
 * the button that writes it again. But this piece goes to a copier and then
 * to a congregation under the pastor's name, and "one question is worded
 * badly" should not cost the other eleven sections.
 *
 * So: fields, not JSON. Every part of the sheet is a labelled box, lists
 * are one-per-line where the items are sentences, and anything with a shape
 * — a scripture and its note, a day and its reading — keeps that shape in
 * the form. Rows can be dropped, because "one of these five truths is
 * really two" is the single most likely edit.
 *
 * Unknown keys are carried through untouched, so a draft written by an
 * older or newer version of the prompt loses nothing by being opened here.
 */

type Row = Record<string, string>;
type Guide = Record<string, unknown>;

const INPUT =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink focus:border-brand focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-1.5 border-t border-border pt-4 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="section-label">{label}</h3>
        {hint && <span className="text-2xs text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** A sentence or a paragraph. Everything here is prose, so nothing is an input. */
function Text({
  value,
  rows = 2,
  placeholder,
  onChange,
}: {
  value: string;
  rows?: number;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${INPUT} resize-y`}
    />
  );
}

/**
 * A list of sentences, edited as lines.
 *
 * One textarea rather than eight inputs with add and remove buttons: the
 * questions arrive as a block, they get read as a block, and reordering
 * them is a matter of moving a line. Blank lines are dropped on save, so
 * deleting one is deleting one.
 */
function LineList({
  items,
  onChange,
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <textarea
      rows={Math.max(4, items.length + 1)}
      value={items.join("\n")}
      onChange={(e) => onChange(e.target.value.split("\n"))}
      className={`${INPUT} resize-y`}
    />
  );
}

/** Rows that have parts — a reference and its note, a day and its reading. */
function RowList({
  rows,
  columns,
  onChange,
}: {
  rows: Row[];
  columns: { key: string; label: string; grow?: boolean }[];
  onChange: (next: Row[]) => void;
}) {
  const update = (i: number, key: string, value: string) =>
    onChange(rows.map((r, j) => (i === j ? { ...r, [key]: value } : r)));

  return (
    <div className="grid gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 gap-1.5 sm:flex sm:items-start">
            {columns.map((c) => (
              <input
                key={c.key}
                value={typeof row[c.key] === "string" ? row[c.key] : ""}
                placeholder={c.label}
                onChange={(e) => update(i, c.key, e.target.value)}
                className={`${INPUT} ${c.grow ? "sm:flex-[2]" : "sm:flex-1"}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            aria-label={`Remove row ${i + 1}`}
            className="mt-1.5 shrink-0 px-1 text-sm text-faint transition-colors hover:text-danger"
          >
            ×
          </button>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="text-2xs text-faint">Nothing here.</p>
      )}
    </div>
  );
}

/** Read a string off the draft without trusting it to be one. */
function str(guide: Guide, key: string): string {
  const value = guide[key];
  return typeof value === "string" ? value : "";
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]).filter(Boolean) : [];
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as unknown[]).map((v) => (typeof v === "string" ? v : String(v)))
    : [];
}

export function StudyGuideEditor({
  draftId,
  payloadJson,
  onDone,
}: {
  draftId: Id<"amplifyDrafts">;
  payloadJson: string;
  onDone: () => void;
}) {
  const edit = useMutation(api.amplifyDrafts.edit);
  const [guide, setGuide] = useState<Guide>(
    () => JSON.parse(payloadJson) as Guide,
  );
  const [busy, setBusy] = useState(false);

  const set = (key: string, value: unknown) =>
    setGuide((prev) => ({ ...prev, [key]: value }));

  const contrast = (guide.contrast ?? {}) as {
    leftLabel?: string;
    rightLabel?: string;
    rows?: Row[];
  };
  const setContrast = (patch: Partial<typeof contrast>) =>
    set("contrast", { ...contrast, ...patch });

  const verse = (guide.memoryVerse ?? {}) as { reference?: string; text?: string };

  const save = async () => {
    setBusy(true);
    try {
      // Blank lines are how somebody deletes an item, so they are dropped
      // here rather than printed as gaps on the sheet.
      const clean = (key: string) =>
        stringsOf(guide[key])
          .map((s) => s.trim())
          .filter(Boolean);

      await edit({
        draftId,
        payloadJson: JSON.stringify({
          ...guide,
          reflectionPrompts: clean("reflectionPrompts"),
          keyTakeaways: clean("keyTakeaways"),
        }),
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <Field label="Title">
        <Text rows={1} value={str(guide, "title")} onChange={(v) => set("title", v)} />
      </Field>

      <Field label="Primary text">
        <Text
          rows={1}
          value={str(guide, "primaryText")}
          onChange={(v) => set("primaryText", v)}
        />
      </Field>

      {/* In page order rather than the order the prompt writes them. The
          model produces this last, once it has the whole lesson worked out;
          the reader meets it first, and so does anybody fixing it. */}
      <Field
        label="Overview"
        hint="the paragraph that opens the front page"
      >
        <Text
          rows={5}
          value={str(guide, "overview")}
          onChange={(v) => set("overview", v)}
        />
      </Field>

      <Field label="Lesson purpose">
        <Text value={str(guide, "purpose")} onChange={(v) => set("purpose", v)} />
      </Field>

      <Field label="The central truth">
        <Text
          rows={3}
          value={str(guide, "centralTruth")}
          onChange={(v) => set("centralTruth", v)}
        />
        <Text
          rows={1}
          placeholder="The question it turns on"
          value={str(guide, "centralQuestion")}
          onChange={(v) => set("centralQuestion", v)}
        />
      </Field>

      <Field label="Key scriptures" hint="reference, then what it contributes">
        <RowList
          rows={rowsOf(guide.keyScriptures)}
          columns={[
            { key: "reference", label: "Reference" },
            { key: "note", label: "What it contributes", grow: true },
          ]}
          onChange={(next) => set("keyScriptures", next)}
        />
      </Field>

      <Field label="Main truths">
        <RowList
          rows={rowsOf(guide.mainTruths)}
          columns={[
            { key: "heading", label: "The point" },
            { key: "body", label: "The explanation", grow: true },
          ]}
          onChange={(next) => set("mainTruths", next)}
        />
      </Field>

      <Field
        label="Contrast table"
        hint="leave the rows empty and it stays off the sheet"
      >
        <div className="grid gap-1.5 sm:flex">
          <input
            value={contrast.leftLabel ?? ""}
            placeholder="Left column"
            onChange={(e) => setContrast({ leftLabel: e.target.value })}
            className={`${INPUT} sm:flex-1`}
          />
          <input
            value={contrast.rightLabel ?? ""}
            placeholder="Right column"
            onChange={(e) => setContrast({ rightLabel: e.target.value })}
            className={`${INPUT} sm:flex-1`}
          />
        </div>
        <RowList
          rows={rowsOf(contrast.rows)}
          columns={[
            { key: "left", label: "Left" },
            { key: "right", label: "Right" },
          ]}
          onChange={(next) => setContrast({ rows: next })}
        />
      </Field>

      <Field label="Personal reflection" hint="one per line">
        <LineList
          items={stringsOf(guide.reflectionPrompts)}
          onChange={(next) => set("reflectionPrompts", next)}
        />
      </Field>

      <Field label="This week">
        <RowList
          rows={rowsOf(guide.weekPlan)}
          columns={[
            { key: "day", label: "Day" },
            { key: "read", label: "Read" },
            { key: "focus", label: "Focus", grow: true },
          ]}
          onChange={(next) => set("weekPlan", next)}
        />
      </Field>

      <Field label="Key takeaways" hint="one per line">
        <LineList
          items={stringsOf(guide.keyTakeaways)}
          onChange={(next) => set("keyTakeaways", next)}
        />
      </Field>

      <Field label="Memory verse">
        <div className="grid gap-1.5">
          <input
            value={verse.reference ?? ""}
            placeholder="Reference"
            onChange={(e) =>
              set("memoryVerse", { ...verse, reference: e.target.value })
            }
            className={INPUT}
          />
          <Text
            value={verse.text ?? ""}
            placeholder="The verse itself"
            onChange={(v) => set("memoryVerse", { ...verse, text: v })}
          />
        </div>
      </Field>

      <Field label="Closing">
        <Text value={str(guide, "closing")} onChange={(v) => set("closing", v)} />
      </Field>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          disabled={busy}
          onClick={save}
          className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white hover:bg-ink/85 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onDone}
          className="text-2xs text-muted underline hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
