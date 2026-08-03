import { useOutletContext } from "react-router-dom";
import type { Id } from "@convex/dataModel";

import { Clips } from "../../components/Clips";
import { Outputs } from "../../components/Outputs";
import { Publish } from "../../components/Publish";
import { Reels } from "../../components/Reels";
import { Transcript } from "../../components/Transcript";
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
  masterAssetId: Id<"amplifyAssets"> | null;
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
  const { source } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="source" />
      {source}
    </div>
  );
}

export function TranscriptRoom() {
  const { projectId } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="transcript" />
      <Transcript projectId={projectId} />
    </div>
  );
}

export function WritingRoom() {
  const { projectId } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="writing" />
      <Outputs projectId={projectId} />
    </div>
  );
}

export function ClipsRoom() {
  const { projectId, masterAssetId, hasTranscript } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="clips" />
      {/* Clips above reels because that is the order of the work: you find a
          moment, cut it, and only then is there something to write captions
          for. Reels first would be a list of things made from nothing. */}
      <Clips
        projectId={projectId}
        masterAssetId={masterAssetId}
        hasTranscript={hasTranscript}
      />
      <Reels projectId={projectId} />
    </div>
  );
}

export function PublishRoom() {
  const { projectId } = useRoom();
  return (
    <div className="grid gap-5">
      <RoomHeading slug="publish" />
      <Publish projectId={projectId} />
    </div>
  );
}
