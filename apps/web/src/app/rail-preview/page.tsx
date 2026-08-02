"use client";

// TEMPORARY. A harness for looking at the shared vocabulary and the rail's
// states without a session or a running API. Delete along with the exemption
// in app/providers.tsx once the backend is redeployed.

import { SignalRail } from "@/components/workflow/SignalRail";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
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
    <div className="mx-auto grid max-w-5xl gap-10 p-10">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink">
          Amplify — design preview
        </h1>
        <p className="mt-1 text-sm text-muted">
          The vocabulary every stage page is built from, and the rail in each
          state. Hover a faint stage to see why it is waiting.
        </p>
      </header>
      <section className="grid gap-3">
        <p className="section-label">The rail</p>
        {SCENES.map((scene) => (
          <div key={scene.title} className="grid gap-1.5">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-sm font-medium text-ink">{scene.title}</h2>
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
      </section>

      <section className="grid gap-3">
        <p className="section-label">Cards, as a page uses them</p>

        <Card>
          <CardHeader
            eyebrow="Transcript"
            title="Sermon transcript"
            description="Generated from the sermon master. Review and approve before anything downstream can be written."
            action={<Button size="sm">Approve</Button>}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="success">Ready</Badge>
            <Badge tone="neutral">41:12</Badge>
            <Badge tone="info">Whisper large-v3</Badge>
            <Badge tone="warning">2 low-confidence spans</Badge>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader eyebrow="Clips" title="Clip candidates" />
            <p className="mt-3 font-mono text-2xl text-ink">4</p>
            <p className="text-sm text-muted">ready to export</p>
          </Card>
          <Card>
            <CardHeader eyebrow="Reel" title="Final reel" />
            <p className="mt-3 text-sm text-muted">Nothing uploaded yet.</p>
          </Card>
        </div>

        <Alert tone="warning">
          The sermon master is older than the source video. Re-trim before
          transcribing, or the transcript will describe the wrong cut.
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button size="sm">Small</Button>
        </div>
      </section>
    </div>
  );
}
