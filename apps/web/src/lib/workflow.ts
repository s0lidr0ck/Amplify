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
    description: "Generate, inspect, and approve the sermon transcript.",
  },
  {
    href: "clips",
    label: "Clip Lab",
    shortLabel: "Clips",
    description: "Analyze the sermon and shape the short-form clip candidates.",
  },
  {
    href: "blog",
    label: "Blog Draft",
    shortLabel: "Blog",
    description: "Create the long-form written adaptation of the message.",
  },
  {
    href: "packaging",
    label: "Posts",
    shortLabel: "Posts",
    description: "Generate YouTube packaging, thumbnail prompts, and social copy.",
  },
  {
    href: "reel",
    label: "Final Reel",
    shortLabel: "Reel",
    description: "Assemble the final long-form deliverable for distribution.",
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
    description: "Coming soon.",
    disabled: true,
  },
];

export function getStageState(index: number, activeIndex: number): "complete" | "current" | "upcoming" {
  if (index < activeIndex) return "complete";
  if (index === activeIndex) return "current";
  return "upcoming";
}
