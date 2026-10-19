import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

// Structural agreement with an optional presentation owner; no resource-specific interpretation.
export type SourceRange = { from: number; to: number };
export type SourceTextRange = SourceRange & { text?: string };
export type SourceSelection = SourceRange & {
  message: AgentSession["messages"][number];
  contentIndex: number | undefined;
  component: Component | undefined;
};
export type SourcePresentation = {
  searchRanges(
    message: AgentSession["messages"][number],
    contentIndex: number | undefined,
  ): SourceTextRange[] | undefined;
  select(selection: SourceSelection | undefined): boolean;
  visibleRanges(
    message: AgentSession["messages"][number],
    contentIndex: number | undefined,
  ): SourceRange[] | undefined;
};
export type SourcePresentationProvider = (sessionManager: unknown) => SourcePresentation;
