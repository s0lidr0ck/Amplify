export type RouteFlavor = "current" | "canonical";

export type GlobalDestinationId =
  | "home"
  | "projects"
  | "calendar"
  | "publish-queue"
  | "analytics"
  | "library"
  | "settings";

export type WorkspaceId = "overview" | "ingest" | "generate" | "publish" | "analytics";

export type IngestSubviewId = "source" | "trim" | "transcript" | "jobs";
export type GenerateSubviewId =
  | "assets"
  | "clips"
  | "reel"
  | "visuals"
  | "sermon-thumbnail"
  | "reel-thumbnail"
  | "copy"
  | "blog"
  | "metadata";
export type PublishSubviewId = "release" | "calendar" | "results";
export type AnalyticsSubviewId = "brand" | "platforms" | "content" | "reports";

export type WorkspaceSubviewId =
  | IngestSubviewId
  | GenerateSubviewId
  | PublishSubviewId
  | AnalyticsSubviewId;

export interface RoutePaths {
  current?: string;
  canonical: string;
}

export interface GlobalDestination {
  id: GlobalDestinationId;
  label: string;
  description: string;
  paths: RoutePaths;
}

export interface WorkspaceSubview {
  id: WorkspaceSubviewId;
  label: string;
  shortLabel: string;
  description: string;
  navGroup?: string;
  paths: RoutePaths;
  availableInCurrentApp: boolean;
}

export interface WorkspaceSubviewGroup {
  id: string;
  label: string;
  items: Array<{
    id: WorkspaceSubviewId;
    label: string;
    shortLabel: string;
    description: string;
    href: string;
    availableInCurrentApp: boolean;
  }>;
}

export interface ProjectWorkspace {
  id: WorkspaceId;
  label: string;
  shortLabel: string;
  description: string;
  paths: RoutePaths;
  landingLabel: string;
  defaultSubviewId: WorkspaceSubviewId | null;
  subviews: ReadonlyArray<WorkspaceSubview>;
}

export interface WorkspaceRouteContext {
  projectId: string | null;
  workspace: ProjectWorkspace | null;
  subview: WorkspaceSubview | null;
  matchedPath: string;
  matchedFlavor: RouteFlavor | null;
}

export const globalDestinations: ReadonlyArray<GlobalDestination> = [
  {
    id: "home",
    label: "Home",
    description: "Command-center landing page for the studio.",
    paths: {
      current: "/",
      canonical: "/",
    },
  },
  {
    id: "projects",
    label: "Projects",
    description: "Queue and manage active content projects.",
    paths: {
      canonical: "/projects",
    },
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Plan intake, publish dates, and release windows.",
    paths: {
      canonical: "/calendar",
    },
  },
  {
    id: "publish-queue",
    label: "Publish Queue",
    description: "Review release-ready packages and destination status.",
    paths: {
      canonical: "/publish-queue",
    },
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Monitor brand, platform, and content performance.",
    paths: {
      canonical: "/analytics",
    },
  },
  {
    id: "library",
    label: "Library",
    description: "Browse archived projects, assets, and outputs.",
    paths: {
      current: "/library",
      canonical: "/library",
    },
  },
  {
    id: "settings",
    label: "Settings",
    description: "Configure studio defaults and connected services.",
    paths: {
      current: "/settings",
      canonical: "/settings",
    },
  },
];

export const projectWorkspaces: ReadonlyArray<ProjectWorkspace> = [
  {
    id: "overview",
    label: "Overview",
    shortLabel: "Overview",
    description: "Project health, blockers, changes, and next actions.",
    paths: {
      current: "/projects/:projectId",
      canonical: "/projects/:projectId/overview",
    },
    landingLabel: "Overview",
    defaultSubviewId: null,
    subviews: [],
  },
  {
    id: "ingest",
    label: "Ingest",
    shortLabel: "Ingest",
    description: "Bring in the source, cut the master, and lock the transcript.",
    paths: {
      current: "/projects/:projectId/source",
      canonical: "/projects/:projectId/ingest",
    },
    landingLabel: "Source",
    defaultSubviewId: "source",
    subviews: [
      {
        id: "source",
        label: "Source",
        shortLabel: "Source",
        description: "Upload, replace, and validate the sermon source file.",
        navGroup: "Capture",
        paths: {
          current: "/projects/:projectId/source",
          canonical: "/projects/:projectId/ingest/source",
        },
        availableInCurrentApp: true,
      },
      {
        id: "trim",
        label: "Trim",
        shortLabel: "Trim",
        description: "Set sermon boundaries and build the sermon master.",
        navGroup: "Capture",
        paths: {
          current: "/projects/:projectId/trim",
          canonical: "/projects/:projectId/ingest/trim",
        },
        availableInCurrentApp: true,
      },
      {
        id: "transcript",
        label: "Transcript",
        shortLabel: "Transcript",
        description: "Generate, inspect, and approve the transcript.",
        navGroup: "Finalize",
        paths: {
          current: "/projects/:projectId/transcript",
          canonical: "/projects/:projectId/ingest/transcript",
        },
        availableInCurrentApp: true,
      },
      {
        id: "jobs",
        label: "Jobs",
        shortLabel: "Jobs",
        description: "View ingest-related jobs, logs, and retries.",
        navGroup: "Finalize",
        paths: {
          canonical: "/projects/:projectId/ingest/jobs",
        },
        availableInCurrentApp: false,
      },
    ],
  },
  {
    id: "generate",
    label: "Generate",
    shortLabel: "Generate",
    description: "Shape clips, visuals, copy, blog, and metadata into a content package.",
    paths: {
      current: "/projects/:projectId/generate",
      canonical: "/projects/:projectId/generate",
    },
    landingLabel: "Assets",
    defaultSubviewId: "assets",
    subviews: [
      {
        id: "assets",
        label: "Assets",
        shortLabel: "Assets",
        description: "Content package overview with readiness, gaps, and recommended next actions.",
        navGroup: "Studio",
        paths: {
          current: "/projects/:projectId/generate",
          canonical: "/projects/:projectId/generate/assets",
        },
        availableInCurrentApp: true,
      },
      {
        id: "clips",
        label: "Clips",
        shortLabel: "Clips",
        description: "Ranked clip candidates and editorial timing controls.",
        navGroup: "Studio",
        paths: {
          current: "/projects/:projectId/clips",
          canonical: "/projects/:projectId/generate/clips",
        },
        availableInCurrentApp: true,
      },
      {
        id: "reel",
        label: "Reel",
        shortLabel: "Reel",
        description: "Long-form reel assembly and final deliverable review.",
        navGroup: "Deliverables",
        paths: {
          current: "/projects/:projectId/reel",
          canonical: "/projects/:projectId/generate/reel",
        },
        availableInCurrentApp: true,
      },
      {
        id: "visuals",
        label: "Visuals",
        shortLabel: "Visuals",
        description: "Thumbnail prompts, visual comparisons, and cover assets.",
        navGroup: "Studio",
        paths: {
          current: "/projects/:projectId/visuals",
          canonical: "/projects/:projectId/generate/visuals",
        },
        availableInCurrentApp: true,
      },
      {
        id: "sermon-thumbnail",
        label: "Sermon Thumb",
        shortLabel: "Sermon Thumb",
        description: "Generate prompt directions and upload the sermon cover image.",
        navGroup: "Studio",
        paths: {
          current: "/projects/:projectId/sermon-thumbnail",
          canonical: "/projects/:projectId/sermon-thumbnail",
        },
        availableInCurrentApp: true,
      },
      {
        id: "reel-thumbnail",
        label: "Reel Thumb",
        shortLabel: "Reel Thumb",
        description: "Generate prompt directions and upload the reel cover image.",
        navGroup: "Studio",
        paths: {
          current: "/projects/:projectId/reel-thumbnail",
          canonical: "/projects/:projectId/reel-thumbnail",
        },
        availableInCurrentApp: true,
      },
      {
        id: "copy",
        label: "Copy",
        shortLabel: "Copy",
        description: "Title, description, social copy, and text-post editing.",
        navGroup: "Studio",
        paths: {
          current: "/projects/:projectId/text",
          canonical: "/projects/:projectId/generate/copy",
        },
        availableInCurrentApp: true,
      },
      {
        id: "blog",
        label: "Blog",
        shortLabel: "Blog",
        description: "Long-form blog draft and excerpt review.",
        navGroup: "Deliverables",
        paths: {
          current: "/projects/:projectId/blog",
          canonical: "/projects/:projectId/generate/blog",
        },
        availableInCurrentApp: true,
      },
      {
        id: "metadata",
        label: "Metadata",
        shortLabel: "Metadata",
        description: "Structured metadata for downstream publishing.",
        navGroup: "Deliverables",
        paths: {
          current: "/projects/:projectId/metadata",
          canonical: "/projects/:projectId/generate/metadata",
        },
        availableInCurrentApp: true,
      },
    ],
  },
  {
    id: "publish",
    label: "Publish",
    shortLabel: "Publish",
    description: "Prepare the release package, validate the destination, and publish.",
    paths: {
      current: "/projects/:projectId/publishing",
      canonical: "/projects/:projectId/publish",
    },
    landingLabel: "Release",
    defaultSubviewId: "release",
    subviews: [
      {
        id: "release",
        label: "Release",
        shortLabel: "Release",
        description: "Release readiness, approvals, and launch controls.",
        navGroup: "Desk",
        paths: {
          current: "/projects/:projectId/publishing",
          canonical: "/projects/:projectId/publish/release",
        },
        availableInCurrentApp: true,
      },
      {
        id: "calendar",
        label: "Calendar",
        shortLabel: "Calendar",
        description: "Schedule and release timing.",
        navGroup: "Desk",
        paths: {
          canonical: "/projects/:projectId/publish/calendar",
        },
        availableInCurrentApp: true,
      },
      {
        id: "results",
        label: "Results",
        shortLabel: "Results",
        description: "Publish history and audit trail.",
        navGroup: "History",
        paths: {
          canonical: "/projects/:projectId/publish/results",
        },
        availableInCurrentApp: true,
      },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    shortLabel: "Analytics",
    description: "Track brand, platform, and content performance.",
    paths: {
      current: "/projects/:projectId/analytics",
      canonical: "/projects/:projectId/analytics",
    },
    landingLabel: "Brand",
    defaultSubviewId: "brand",
    subviews: [
      {
        id: "brand",
        label: "Brand",
        shortLabel: "Brand",
        description: "Cross-platform rollups and overall audience growth.",
        navGroup: "Overview",
        paths: {
          current: "/projects/:projectId/analytics",
          canonical: "/projects/:projectId/analytics/brand",
        },
        availableInCurrentApp: true,
      },
      {
        id: "platforms",
        label: "Platforms",
        shortLabel: "Platforms",
        description: "Channel-by-channel performance and comparisons.",
        navGroup: "Breakdowns",
        paths: {
          canonical: "/projects/:projectId/analytics/platforms",
        },
        availableInCurrentApp: false,
      },
      {
        id: "content",
        label: "Content",
        shortLabel: "Content",
        description: "Asset-level performance and winners/losers.",
        navGroup: "Breakdowns",
        paths: {
          canonical: "/projects/:projectId/analytics/content",
        },
        availableInCurrentApp: false,
      },
      {
        id: "reports",
        label: "Reports",
        shortLabel: "Reports",
        description: "Saved reports and exportable views.",
        navGroup: "Reports",
        paths: {
          canonical: "/projects/:projectId/analytics/reports",
        },
        availableInCurrentApp: false,
      },
    ],
  },
];

export interface WorkspaceRouteAlias {
  workspaceId: WorkspaceId;
  subviewId: WorkspaceSubviewId;
  currentPath: string;
}

export const workspaceRouteAliases: ReadonlyArray<WorkspaceRouteAlias> = [
  { workspaceId: "ingest", subviewId: "source", currentPath: "/projects/:projectId/source" },
  { workspaceId: "ingest", subviewId: "trim", currentPath: "/projects/:projectId/trim" },
  { workspaceId: "ingest", subviewId: "transcript", currentPath: "/projects/:projectId/transcript" },
  { workspaceId: "generate", subviewId: "assets", currentPath: "/projects/:projectId/generate" },
  { workspaceId: "generate", subviewId: "clips", currentPath: "/projects/:projectId/clips" },
  { workspaceId: "generate", subviewId: "reel", currentPath: "/projects/:projectId/reel" },
  { workspaceId: "generate", subviewId: "visuals", currentPath: "/projects/:projectId/visuals" },
  { workspaceId: "generate", subviewId: "sermon-thumbnail", currentPath: "/projects/:projectId/sermon-thumbnail" },
  { workspaceId: "generate", subviewId: "reel-thumbnail", currentPath: "/projects/:projectId/reel-thumbnail" },
  { workspaceId: "generate", subviewId: "copy", currentPath: "/projects/:projectId/text" },
  { workspaceId: "generate", subviewId: "copy", currentPath: "/projects/:projectId/text-post" },
  { workspaceId: "generate", subviewId: "copy", currentPath: "/projects/:projectId/title-desc" },
  { workspaceId: "generate", subviewId: "blog", currentPath: "/projects/:projectId/blog" },
  { workspaceId: "generate", subviewId: "metadata", currentPath: "/projects/:projectId/metadata" },
  { workspaceId: "publish", subviewId: "release", currentPath: "/projects/:projectId/publishing" },
  { workspaceId: "analytics", subviewId: "brand", currentPath: "/projects/:projectId/analytics" },
];

function normalizePathname(pathname: string) {
  return pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

function fillProjectPath(template: string, projectId: string) {
  return template.replace(/:projectId/g, encodeURIComponent(projectId));
}

export function getGlobalDestination(destinationId: GlobalDestinationId) {
  return globalDestinations.find((destination) => destination.id === destinationId) ?? null;
}

export function getWorkspace(workspaceId: WorkspaceId) {
  return projectWorkspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}

export function getWorkspaceSubview(workspaceId: WorkspaceId, subviewId: WorkspaceSubviewId) {
  return getWorkspace(workspaceId)?.subviews.find((subview) => subview.id === subviewId) ?? null;
}

export function getWorkspacePath(workspaceId: WorkspaceId, projectId: string, flavor: RouteFlavor = "current") {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return null;
  return fillProjectPath(workspace.paths[flavor] ?? workspace.paths.canonical, projectId);
}

export function getWorkspaceSubviewPath(
  workspaceId: WorkspaceId,
  subviewId: WorkspaceSubviewId,
  projectId: string,
  flavor: RouteFlavor = "current"
) {
  const subview = getWorkspaceSubview(workspaceId, subviewId);
  if (!subview) return null;
  const path = subview.paths[flavor] ?? subview.paths.canonical;
  return fillProjectPath(path, projectId);
}

export function getWorkspaceSubnav(
  workspaceId: WorkspaceId,
  projectId: string,
  flavor: RouteFlavor = "current"
) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return [];

  return workspace.subviews.map((subview) => ({
    id: subview.id,
    label: subview.label,
    shortLabel: subview.shortLabel,
    description: subview.description,
    href: fillProjectPath(subview.paths[flavor] ?? subview.paths.canonical, projectId),
    availableInCurrentApp: subview.availableInCurrentApp,
  }));
}

export function getWorkspaceTabLabel(workspaceId: WorkspaceId) {
  return getWorkspace(workspaceId)?.label ?? null;
}

export function getWorkspaceSubviewLabel(workspaceId: WorkspaceId, subviewId: WorkspaceSubviewId) {
  return getWorkspaceSubview(workspaceId, subviewId)?.label ?? null;
}

export function getWorkspaceContextFromPathname(pathname: string): WorkspaceRouteContext {
  const normalized = normalizePathname(pathname);
  const projectMatch = normalized.match(/^\/projects\/([^/]+)(?:\/.*)?$/);
  const projectId = projectMatch?.[1] ? decodeURIComponent(projectMatch[1]) : null;

  if (!projectId) {
    return {
      projectId: null,
      workspace: null,
      subview: null,
      matchedPath: normalized,
      matchedFlavor: null,
    };
  }

  const exactWorkspace = projectWorkspaces.find((workspace) => {
    const currentPath = workspace.paths.current ? fillProjectPath(workspace.paths.current, projectId) : null;
    const canonicalPath = fillProjectPath(workspace.paths.canonical, projectId);
    return normalized === currentPath || normalized === canonicalPath;
  });

  if (exactWorkspace) {
    const defaultSubview =
      exactWorkspace.defaultSubviewId != null
        ? getWorkspaceSubview(exactWorkspace.id, exactWorkspace.defaultSubviewId)
        : null;

    return {
      projectId,
      workspace: exactWorkspace,
      subview: defaultSubview,
      matchedPath: normalized,
      matchedFlavor: normalized === fillProjectPath(exactWorkspace.paths.current ?? exactWorkspace.paths.canonical, projectId)
        ? "current"
        : "canonical",
    };
  }

  for (const workspace of projectWorkspaces) {
    for (const subview of workspace.subviews) {
      const currentPath = subview.paths.current ? fillProjectPath(subview.paths.current, projectId) : null;
      const canonicalPath = fillProjectPath(subview.paths.canonical, projectId);
      if (normalized !== currentPath && normalized !== canonicalPath) continue;

      return {
        projectId,
        workspace,
        subview,
        matchedPath: normalized,
        matchedFlavor: normalized === currentPath ? "current" : "canonical",
      };
    }
  }

  for (const alias of workspaceRouteAliases) {
    const workspace = getWorkspace(alias.workspaceId);
    const subview = workspace ? getWorkspaceSubview(workspace.id, alias.subviewId) : null;
    const aliasCurrent = fillProjectPath(alias.currentPath, projectId);
    const aliasCanonical = subview ? fillProjectPath(subview.paths.canonical, projectId) : null;
    if (normalized !== aliasCurrent && normalized !== aliasCanonical) continue;

    if (workspace && subview) {
      return {
        projectId,
        workspace,
        subview,
        matchedPath: normalized,
        matchedFlavor: "current",
      };
    }
  }

  return {
    projectId,
    workspace: getWorkspace("overview"),
    subview: null,
    matchedPath: normalized,
    matchedFlavor: "canonical",
  };
}

export function getWorkspaceNavigation(projectId: string, flavor: RouteFlavor = "current") {
  return projectWorkspaces.map((workspace) => ({
    id: workspace.id,
    label: workspace.label,
    shortLabel: workspace.shortLabel,
    description: workspace.description,
    href: getWorkspacePath(workspace.id, projectId, flavor) ?? "#",
    landingLabel: workspace.landingLabel,
  }));
}

export function getWorkspaceSectionItems(
  workspaceId: WorkspaceId,
  projectId: string,
  flavor: RouteFlavor = "current"
) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return [];

  return workspace.subviews.map((subview) => ({
    id: subview.id,
    label: subview.label,
    shortLabel: subview.shortLabel,
    description: subview.description,
    navGroup: subview.navGroup,
    href: getWorkspaceSubviewPath(workspaceId, subview.id, projectId, flavor) ?? "#",
    availableInCurrentApp: subview.availableInCurrentApp,
  }));
}

export function getWorkspaceSectionGroups(
  workspaceId: WorkspaceId,
  projectId: string,
  flavor: RouteFlavor = "current"
): WorkspaceSubviewGroup[] {
  const items = getWorkspaceSectionItems(workspaceId, projectId, flavor);
  const groups = new Map<string, WorkspaceSubviewGroup>();

  for (const item of items) {
    const groupLabel = item.navGroup ?? "Workspace";
    const groupId = groupLabel.toLowerCase().replace(/\s+/g, "-");
    const existing = groups.get(groupId);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    groups.set(groupId, {
      id: groupId,
      label: groupLabel,
      items: [item],
    });
  }

  return Array.from(groups.values());
}

