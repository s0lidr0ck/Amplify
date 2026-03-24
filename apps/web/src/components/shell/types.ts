import type { ReactNode } from "react";

export type ShellTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export type GlobalRailItem = {
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
  description?: string;
  badge?: string;
  icon?: ReactNode;
  children?: GlobalRailChildItem[];
};

export type GlobalRailChildItem = {
  label: string;
  href?: string;
  active?: boolean;
  badge?: string;
  tone?: ShellTone;
  children?: GlobalRailChildItem[];
};

export type WorkspaceTabItem = {
  label: string;
  href: string;
  active?: boolean;
  badge?: string;
  disabled?: boolean;
};

export type WorkspaceRailItem = {
  label: string;
  href?: string;
  active?: boolean;
  description?: string;
  badge?: string;
  tone?: ShellTone;
  icon?: ReactNode;
};

export type WorkspaceRailSection = {
  label: string;
  description?: string;
  action?: ReactNode;
  items: WorkspaceRailItem[];
};

export type InspectorStat = {
  label: string;
  value: string;
  tone?: ShellTone;
  helper?: string;
};
