export type WorkflowStage = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  disabled?: boolean;
};

export const workflowStages: WorkflowStage[] = [
  {
    href: "source",
    label: "Source Intake",
    shortLabel: "Source",
    description: "Bring in the raw sermon video and confirm the upload is ready.",
  },
  {
    href: "trim",
    label: "Sermon Master",
    shortLabel: "Trim",
    description: "Set the sermon boundaries and generate the clean master asset.",
  },
  {
    href: "transcript",
    label: "Transcript Review",
    shortLabel: "Transcript",
    description: "Generate, inspect, and review the sermon transcript.",
  },
  {
    href: "sermon-thumbnail",
    label: "Sermon Thumbnail",
    shortLabel: "Sermon Thumb",
    description: "Generate the three sermon thumbnail prompt ideas and upload the chosen artwork.",
  },
  {
    href: "clips",
    label: "Clip Lab",
    shortLabel: "Clips",
    description: "Analyze the sermon and shape the short-form clip candidates.",
  },
  {
    href: "reel",
    label: "Final Reel",
    shortLabel: "Reel",
    description: "Assemble the final long-form deliverable for distribution.",
  },
  {
    href: "reel-thumbnail",
    label: "Reel Thumbnail",
    shortLabel: "Reel Thumb",
    description: "Review the reel thumbnail prompt ideas and upload the selected cover image.",
  },
  {
    href: "title-desc",
    label: "Title & Desc",
    shortLabel: "Title & Desc",
    description: "Generate and refine the YouTube title and description for the sermon.",
  },
  {
    href: "text-post",
    label: "Text Post",
    shortLabel: "Text Post",
    description: "Generate and edit the text-only social post for the sermon.",
  },
  {
    href: "blog",
    label: "Blog Post",
    shortLabel: "Blog",
    description: "Create the long-form written adaptation of the message.",
  },
  {
    href: "publishing",
    label: "Publishing",
    shortLabel: "Publish",
    description: "Review the Wix publishing package, confirm SEO fields, and publish the post live.",
  },
  {
    href: "metadata",
    label: "Metadata Studio",
    shortLabel: "Metadata",
    description: "Extract structured metadata for downstream publishing.",
  },
];

export function getStageState(index: number, activeIndex: number): "complete" | "current" | "upcoming" {
  if (index < activeIndex) return "complete";
  if (index === activeIndex) return "current";
  return "upcoming";
}
