import { useOutletContext } from "react-router-dom";
import type { Id } from "@convex/dataModel";

import { Clips } from "../../components/Clips";
import { DeleteSermon } from "../../components/DeleteSermon";
import { Jobs } from "../../components/Jobs";
import { PiecePage } from "../../components/PiecePage";
import { Publish } from "../../components/Publish";
import { Transcript } from "../../components/Transcript";
import { WritingList } from "../../components/WritingList";
import { STAGES, type StageSlug } from "../../lib/stages";

/**
 * The five rooms.
 *
 * Each one is a screenful with a single job, built out of the components
 * that used to be stacked on one scroll. Almost nothing here is new work —
 * the value is that they are now separate places you can be, link to, and
 * come back to, with a heading that says what the room is for.
 *
 * The heading is not decoration. Somebody who did not build this app opens
 * "Clips & reels" and needs one line telling them what it is before they
 * start pressing things, and that line is the difference between a tool and
 * a wall of buttons.
 */

export type RoomContext = {
  projectId: Id<"amplifyProjects">;
  /** For the one control that has to name what it is about to destroy. */
  title: string;
  /**
   * The video this sermon's timestamps count into: the file the transcript
   * was read from, which is the trimmed sermon when there is one and the
   * recording itself when the sermon arrived already cut.
   */
  timelineAssetId: Id<"amplifyAssets"> | null;
  hasTranscript: boolean;
  /** Rendered by the layout, because Source needs the upload and trim UI. */
  source: React.ReactNode;
};

export function useRoom() {
  return useOutletContext<RoomContext>();
}

/** The room's own title and one line of orientation. */
export function RoomHeading({ slug }: { slug: StageSlug }) {
  const stage = STAGES.find((s) => s.slug === slug)!;
  return (
    <header className="grid gap-1">
      <h2 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-ink">
        {stage.label}
      </h2>
      <p className="text-sm text-muted">{stage.blurb}</p>
    </header>
  );
}

export function SourceRoom() {
  const { source, projectId, title } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="source" />
      {source}
      {/* Last, and quiet. Source is where a sermon begins and the room
          nobody comes back to once it has gone out, which makes it the
          right home for the one control that cannot be undone. */}
      <DeleteSermon projectId={projectId} title={title} />
    </div>
  );
}

export function TranscriptRoom() {
  const { projectId } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="transcript" />
      {/* Above the transcript: while it is being made, the progress IS the
          page, and it used to report two rooms away on Source. */}
      <Jobs projectId={projectId} types={["transcribe"]} />
      <Transcript projectId={projectId} />
    </div>
  );
}

export function WritingRoom() {
  const { projectId } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="writing" />
      <WritingList projectId={projectId} />
    </div>
  );
}

/** One piece of writing, on a page of its own. */
export function WritingPieceRoom() {
  const { projectId } = useRoom();
  return <PiecePage projectId={projectId} />;
}

/**
 * The pictures a sermon goes out under.
 *
 * Its own room rather than the fifth item in a list called Writing, which
 * it never was. The thumbnail is the highest-leverage image in the whole
 * pipeline — it decides whether the sermon gets watched at all — and the
 * website refuses to publish without a cover picked, so burying it under
 * prose hid both the work and the thing blocking a publish.
 */
export function VisualsRoom() {
  const { projectId } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="visuals" />
      <PiecePage projectId={projectId} kind="thumbnail_concepts" />
    </div>
  );
}

export function ClipsRoom() {
  const { projectId, timelineAssetId, hasTranscript } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="clips" />
      {/* One gallery, not a gallery and a list of the same moments under a
          second heading. A reel is what a clip becomes — captions, a cover,
          the edit an editor hands back — and all of it now lives on the
          clip it belongs to, which is where it was already filed. */}
      <Jobs projectId={projectId} types={["clip_export"]} />
      <Clips
        projectId={projectId}
        timelineAssetId={timelineAssetId}
        hasTranscript={hasTranscript}
      />
    </div>
  );
}

export function PublishRoom() {
  const { projectId } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="publish" />
      <Jobs projectId={projectId} types={["publish"]} />
      <Publish projectId={projectId} />
    </div>
  );
}
