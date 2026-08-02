"use client";

// TEMPORARY. A harness for looking at the rail in each state without needing
// a signed-in session and a live API. Delete once checked.

import { SignalRail } from "@/components/workflow/SignalRail";
import { stageStates, type StageProgress } from "@/lib/stageGating";

const NOTHING: StageProgress = {
  source: false,
  trim: false,
  transcript: false,
  titleDesc: false,
  sermonThumbnail: false,
  clips: false,
  reel: false,
  reelThumbnail: false,
  blog: false,
  textPost: false,
  metadata: false,
  published: false,
};

const TRANSCRIBED: StageProgress = { ...NOTHING, source: true, trim: true, transcript: true };

const SCENES: { title: string; note: string; progress: StageProgress; at: string | null }[] = [
  {
    title: "Brand new project",
    note: "Only the source is open. Everything else says what it is waiting for.",
    progress: NOTHING,
    at: "source",
  },
  {
    title: "Trimmed, not transcribed",
    note: "The chain has moved on one. The fan is still shut.",
    progress: { ...NOTHING, source: true, trim: true },
    at: "trim",
  },
  {
    title: "Transcript approved",
    note: "The moment it opens up: eight outputs available at once, in any order.",
    progress: TRANSCRIBED,
    at: "transcript",
  },
  {
    title: "Clips done, working the blog",
    note: "Out of order on purpose — nothing objects.",
    progress: { ...TRANSCRIBED, clips: true },
    at: "blog",
  },
  {
    title: "Title and a blog written",
    note: "Publish opens, because there is now something to send and a title to send it under.",
    progress: { ...TRANSCRIBED, clips: true, titleDesc: true, blog: true },
    at: "blog",
  },
  {
    title: "Published",
    note: "Results opens last.",
    progress: {
      ...TRANSCRIBED,
      clips: true,
      titleDesc: true,
      blog: true,
      reel: true,
      published: true,
    },
    at: "publishing",
  },
];

export default function RailPreview() {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 p-10">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Signal rail states</h1>
        <p className="mt-1 text-sm text-muted">
          Hover a faint stage to see why it is waiting.
        </p>
      </div>
      {SCENES.map((scene) => (
        <div key={scene.title} className="grid gap-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold text-ink">{scene.title}</h2>
            <span className="text-2xs text-muted">{scene.note}</span>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <SignalRail
              projectId="preview"
              stageStatus={stageStates(scene.progress, scene.at)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
