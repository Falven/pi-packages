import type {
  AgentToolResult,
  SourceInfo,
  ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent"

export type ActivityStatus = "running" | "completed" | "failed" | "unknown"
export type ActivityResult = Pick<AgentToolResult<unknown>, "content"> & {
  details?: unknown
  isError: boolean
}
export type CallFacts = {
  id: string
  name: string
  args: unknown
  cwd: string
  status: ActivityStatus
  provenance: SourceInfo | undefined
  result: ActivityResult | undefined
  skills: readonly { name: string; path: string }[]
}
export type ActivityItem = {
  id: string
  kind: "loaded" | "tool" | "edit" | "read" | "command" | "image" | "execution"
  action?: "read" | "search" | "list"
  target?: string | undefined
  targetKey?: string
  command?: string
  changes?: { added: number; removed: number }
  status: ActivityStatus
  body: {
    name: string
    args: unknown
    cwd: string
    result: ActivityResult | undefined
    renderers?: () => ConstructorParameters<typeof ToolExecutionComponent>[4]
    availability?: "omitted"
  }
}
export function argumentsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
