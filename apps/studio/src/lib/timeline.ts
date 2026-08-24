/**
 * Which video a sermon's timestamps count into.
 *
 * Every mark this app stores against a sermon — a clip's start, the edges of
 * a reel — is a position in whatever file was transcribed, because the marks
 * were read out of that transcript. Anything that seeks to one has to open
 * the same file, or it lands somewhere else entirely.
 *
 * That is usually the trimmed sermon, and for a long while the clips room
 * assumed it always was. It is not: a sermon can arrive already topped and
 * tailed — an import of a clip somebody else cut, a re-file of last week's —
 * and then there is nothing to trim, no master is ever made, and the
 * transcript is read straight off the recording. The room went blank on
 * exactly those sermons: grey tiles where the frames should be, no player,
 * no trim, and a dead "Cut it", on moments that had already been found and
 * scored. Following the transcript instead of assuming the master fixes that
 * without guessing, since the transcript names its file.
 */

type Asset = { _id: string; kind: string };

export function timelineAsset<T extends Asset>(
  assets: T[],
  transcriptAssetId: string | null,
): T | null {
  // What was actually read. Looked up in the live list rather than trusted
  // whole, because re-trimming retires the old master and leaves the
  // transcript pointing at a file that is no longer served.
  const read = assets.find((a) => a._id === transcriptAssetId);
  if (read) return read;

  // No transcript yet, or its file has been retired. The sermon if one has
  // been cut, the whole service otherwise — the same order the transcript
  // page picks in when deciding what to send off to be read, so the two
  // cannot disagree about which file this sermon is.
  return (
    assets.find((a) => a.kind === "sermon_master") ??
    assets.find((a) => a.kind === "source_video") ??
    null
  );
}
