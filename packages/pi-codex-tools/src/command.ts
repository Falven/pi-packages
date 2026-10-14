import { userInfo } from "node:os"
import { delimiter, join } from "node:path"
import {
  getAgentDir,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import type { ProcessSessions } from "./process.ts"

// Integer conversion rounds fractions before validation; multipleOf preserves rejection.
const nonnegativeInteger = Type.Number({ minimum: 0, multipleOf: 1 })
const parameters = Type.Object(
  {
    cmd: Type.String(),
    justification: Type.Optional(Type.String()),
    login: Type.Optional(Type.Boolean()),
    max_output_tokens: Type.Optional(nonnegativeInteger),
    prefix_rule: Type.Optional(Type.Array(Type.String())),
    sandbox_permissions: Type.Optional(
      Type.Union([
        Type.Literal("use_default"),
        Type.Literal("require_escalated"),
      ]),
    ),
    shell: Type.Optional(Type.String()),
    tty: Type.Optional(Type.Boolean()),
    workdir: Type.Optional(Type.String()),
    yield_time_ms: Type.Optional(nonnegativeInteger),
  },
  { additionalProperties: false },
)

export function createCommand(
  pi: ExtensionAPI,
  available: () => boolean,
  lifetime: AbortSignal,
  processes: ProcessSessions,
): ToolDefinition<typeof parameters, undefined> {
  return {
    name: "exec_command",
    label: "Command",
    description:
      "Runs a command in a PTY, returning output or a session ID for ongoing interaction.",
    parameters,
    exposure: "codemode",
    async execute(_id, args, signal, _onUpdate, ctx) {
      signal = signal ? AbortSignal.any([signal, lifetime]) : lifetime
      signal.throwIfAborted()
      if (!available())
        throw new Error(
          "Command execution is not available in the active tool scope",
        )
      if (args.sandbox_permissions === "require_escalated")
        throw new Error("Elevated execution is not available from this host")
      const settings = pi.getSettings()
      const shell = args.shell ?? settings.shellPath ?? userInfo().shell
      if (!shell) throw new Error("The user has no configured shell")
      const command = settings.shellCommandPrefix
        ? `${settings.shellCommandPrefix}\n${args.cmd}`
        : args.cmd
      const env = { ...process.env }
      for (const key of [
        "PI_SESSION_ID",
        "PI_SESSION_FILE",
        "PI_PROVIDER",
        "PI_MODEL",
        "PI_REASONING_LEVEL",
      ])
        delete env[key]
      const managed = join(getAgentDir(), "bin")
      const path = env["PATH"] ?? ""
      env["PATH"] = path.split(delimiter).includes(managed)
        ? path
        : [managed, path].filter(Boolean).join(delimiter)
      env["PI_SESSION_ID"] = ctx.sessionManager.getSessionId()
      const sessionFile = ctx.sessionManager.getSessionFile()
      if (sessionFile) env["PI_SESSION_FILE"] = sessionFile
      if (ctx.model) {
        env["PI_PROVIDER"] = ctx.model.provider
        env["PI_MODEL"] = ctx.model.id
      }
      if (ctx.thinkingLevel) env["PI_REASONING_LEVEL"] = ctx.thinkingLevel
      const result = await processes.start(
        {
          shell,
          command,
          login: args.login !== false,
          cwd: args.workdir ?? ctx.cwd,
          env,
          tty: args.tty ?? false,
        },
        Math.min(30000, Math.max(250, args.yield_time_ms ?? 10000)),
        args.max_output_tokens ?? 10000,
        signal,
      )
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        details: undefined,
      }
    },
  }
}

const inputParameters = Type.Object(
  {
    session_id: Type.Number({
      minimum: -2147483648,
      maximum: 2147483647,
      multipleOf: 1,
    }),
    chars: Type.Optional(Type.String()),
    max_output_tokens: Type.Optional(nonnegativeInteger),
    yield_time_ms: Type.Optional(nonnegativeInteger),
  },
  { additionalProperties: false },
)

export function createStdin(
  available: () => boolean,
  lifetime: AbortSignal,
  processes: ProcessSessions,
): ToolDefinition<typeof inputParameters, undefined> {
  return {
    name: "write_stdin",
    label: "Input",
    description:
      "Writes characters to an existing unified exec session and returns recent output.",
    parameters: inputParameters,
    exposure: "codemode",
    async execute(_id, args, signal) {
      signal = signal ? AbortSignal.any([signal, lifetime]) : lifetime
      signal.throwIfAborted()
      if (!available())
        throw new Error(
          "Process input is not available in the active tool scope",
        )
      const chars = args.chars ?? ""
      const minimum = chars ? 250 : 5000
      const result = await processes.write(
        args.session_id,
        chars,
        Math.min(
          chars ? 30000 : 300000,
          Math.max(minimum, args.yield_time_ms ?? minimum),
        ),
        args.max_output_tokens ?? 10000,
        signal,
      )
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        details: undefined,
      }
    },
  }
}
