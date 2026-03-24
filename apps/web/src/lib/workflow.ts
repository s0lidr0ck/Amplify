export type WorkflowStage = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  disabled?: boolean;
};

export type WorkflowCategory = {
  id: "ingest" | "generate" | "publish" | "analytics";
  label: string;
  shortLabel: string;
  description: string;
  summary: string;
  href: string;
  stageHrefs: string[];
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
    href: "metadata",
    label: "Metadata Studio",
    shortLabel: "Metadata",
    description: "Extract structured metadata for downstream publishing.",
  },
  {
    href: "publishing",
    label: "Publishing",
    shortLabel: "Publish",
    description: "Review the Wix publishing package, confirm SEO fields, and publish the post live.",
  },
  {
    href: "analytics",
    label: "Analytics",
    shortLabel: "Analytics",
    description: "Track brand, platform, and content performance from one private reporting workspace.",
  },
];

export const workflowCategories: WorkflowCategory[] = [
  {
    id: "ingest",
    label: "Ingest",
    shortLabel: "Ingest",
    description: "Capture the source, cut the sermon master, and lock the transcript.",
    summary: "Raw media intake and transcript readiness.",
    href: "source",
    stageHrefs: ["source", "trim", "transcript"],
  },
  {
    id: "generate",
    label: "Generate",
    shortLabel: "Generate",
    description: "Shape the content package across clips, visuals, copy, blog, and metadata.",
    summary: "All generated assets and review loops.",
    href: "clips",
    stageHrefs: [
      "sermon-thumbnail",
      "clips",
      "reel",
      "reel-thumbnail",
      "title-desc",
      "text-post",
      "blog",
      "metadata",
    ],
  },
  {
    id: "publish",
    label: "Publish",
    shortLabel: "Publish",
    description: "Finalize outbound distribution and launch the finished post.",
    summary: "Release controls, SEO, and destination readiness.",
    href: "publishing",
    stageHrefs: ["publishing"],
  },
  {
    id: "analytics",
    label: "Analytics",
    shortLabel: "Analytics",
    description: "Aggregate performance at the brand, platform, and content levels.",
    summary: "Cross-platform reporting and post-performance insight.",
    href: "analytics",
    stageHrefs: ["analytics"],
  },
];

export function getWorkflowStage(stageHref: string) {
  return workflowStages.find((stage) => stage.href === stageHref) ?? null;
}

export function getWorkflowCategoryForStage(stageHref: string) {
  return workflowCategories.find((category) => category.stageHrefs.includes(stageHref)) ?? null;
}

export function getStageState(index: number, activeIndex: number): "complete" | "current" | "upcoming" {
  if (index < activeIndex) return "complete";
  if (index === activeIndex) return "current";
  return "upcoming";
}
