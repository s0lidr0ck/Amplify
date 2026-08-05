import addASermon from "./01-add-a-sermon.md?raw";
import cutTheSermonOut from "./02-cut-the-sermon-out.md?raw";
import checkTheTranscript from "./03-check-the-transcript.md?raw";
import readWhatItWrote from "./04-read-what-it-wrote.md?raw";
import pickACover from "./05-pick-a-cover.md?raw";
import chooseTheClips from "./06-choose-the-clips.md?raw";
import handTheReelsBack from "./07-hand-the-reels-back.md?raw";
import publishing from "./08-publishing.md?raw";

/**
 * The manual, in the order the work happens.
 *
 * Written as Markdown files rather than as components so the words can be
 * edited by somebody who is not editing the app, and imported raw so there
 * is no build step, no index to regenerate, and no way for a chapter to
 * exist on disk without appearing here.
 *
 * Two sections, because the audiences are different. Everything up to the
 * reels is what a person preparing a sermon does. Publishing is somebody
 * else's job — usually one person at the church — and putting it in the
 * same list would suggest everybody is expected to get to the end.
 */

export type Chapter = {
  slug: string;
  title: string;
  /** One line, shown in the sidebar and at the top of the chapter. */
  blurb: string;
  body: string;
};

export type Section = {
  key: string;
  title: string;
  note?: string;
  chapters: Chapter[];
};

export const SECTIONS: Section[] = [
  {
    key: "getting-started",
    title: "Preparing a sermon",
    chapters: [
      {
        slug: "add-a-sermon",
        title: "Add a sermon",
        blurb: "What Amplify does, and how a sermon starts.",
        body: addASermon,
      },
      {
        slug: "cut-the-sermon-out",
        title: "Cut the sermon out of the service",
        blurb: "Upload the recording and trim it to the preaching.",
        body: cutTheSermonOut,
      },
      {
        slug: "check-the-transcript",
        title: "Check the transcript",
        blurb: "Read it, fix the names, approve it.",
        body: checkTheTranscript,
      },
      {
        slug: "read-what-it-wrote",
        title: "Read what it wrote",
        blurb: "The blog post, the packaging, the short version.",
        body: readWhatItWrote,
      },
      {
        slug: "pick-a-cover",
        title: "Pick a cover",
        blurb: "Five concepts, and the picture the sermon goes out under.",
        body: pickACover,
      },
      {
        slug: "choose-the-clips",
        title: "Choose the clips",
        blurb: "What the scores mean, and how to disagree with them.",
        body: chooseTheClips,
      },
      {
        slug: "hand-the-reels-back",
        title: "Hand the reels back",
        blurb: "Download, edit, upload — and what happens when you do.",
        body: handTheReelsBack,
      },
    ],
  },
  {
    key: "admins",
    title: "For admins",
    note: "Most people never open this room.",
    chapters: [
      {
        slug: "publishing",
        title: "Publishing",
        blurb: "Sending it out, and connecting the places it goes.",
        body: publishing,
      },
    ],
  },
];

export const CHAPTERS: Chapter[] = SECTIONS.flatMap((s) => s.chapters);

export function chapterAt(slug: string | undefined): Chapter | null {
  if (!slug) return null;
  return CHAPTERS.find((c) => c.slug === slug) ?? null;
}
