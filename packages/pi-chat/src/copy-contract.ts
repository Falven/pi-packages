import type {
  AgentToolResult,
  Theme,
  ToolExecutionComponent,
  ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

// This structural agreement is also declared by the optional transcript consumer.
export type CopySource = {
  kind: string;
  status: string;
  changes?: { added: number; removed: number };
  body: {
    name: string;
    args: unknown;
    result:
      | (Pick<AgentToolResult<unknown>, "content" | "structuredContent"> & {
          details?: unknown;
          isError: boolean;
        })
      | undefined;
    copyContent?: AgentToolResult<unknown>["content"];
    copyOmitted?: boolean;
    availability?: "omitted";
  };
};

export type CopyEnvironment = {
  theme(): Theme;
  outputPad(): number;
  handleInput(data: string, activate: () => void): void;
  requestRender(): void;
  setStatus(text: string | undefined): void;
};

export type CopyControl = Component & {
  focused: boolean;
  readonly enabled: boolean;
  row: number;
  column: number;
  height: number;
  width: number;
  readonly owner?: Component | undefined;
  dispose(): void;
};

export type ItemCopyControls = {
  readonly actions: CopyControl[];
  wrap(renderers: ToolRenderers): ToolRenderers;
  mount(body: ToolExecutionComponent): void;
  measure(root: Component): ReadonlyMap<number, number>;
  dispose(): void;
};

export type CopyControls = {
  item(source: () => CopySource, owner: Component): ItemCopyControls;
  response(parts: () => readonly string[]): CopyControl;
  isAction(value: unknown): value is CopyControl;
};

export type CopyProvider = (environment: CopyEnvironment) => CopyControls;
