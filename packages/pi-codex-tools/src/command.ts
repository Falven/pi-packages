import { userInfo } from "node:os"
import { delimiter, join, resolve } from "node:path"
import {
  getAgentDir,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { boundedPreview, contentHash } from "./presentation.ts"
import type { ProcessPresentation, ProcessSessions } from "./process.ts"

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
): ToolDefinition<
  typeof parameters,
  {
    command: string
    cwd: string
    effectiveArgs: Record<string, unknown>
    process?: ProcessPresentation
    outputHash?: string
  }
> {
  return {
    name: "exec_command",
    label: "Command",
    description:
      "Runs a command in a PTY, returning output or a session ID for ongoing interaction.",
    parameters,
    exposure: "codemode",
    async execute(_id, args, signal, onUpdate, ctx) {
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
      const cwd =
        args.workdir === undefined ? ctx.cwd : resolve(ctx.cwd, args.workdir)
      const yieldTime = Math.min(
        30000,
        Math.max(250, args.yield_time_ms ?? 10000),
      )
      const maxTokens = args.max_output_tokens ?? 10000
      const effectiveArgs = {
        cmd: boundedPreview(command),
        workdir: boundedPreview(cwd),
        shell: boundedPreview(shell),
        login: args.login !== false,
        tty: args.tty ?? false,
        yield_time_ms: yieldTime,
        max_output_tokens: maxTokens,
      }
      onUpdate?.({ content: [], details: { command, cwd, effectiveArgs } })
      const result = await processes.start(
        {
          shell,
          command,
          login: args.login !== false,
          cwd,
          env,
          tty: args.tty ?? false,
        },
        yieldTime,
        maxTokens,
        signal,
        (snapshot) =>
          onUpdate?.({
            content: [],
            details: { command, cwd, effectiveArgs, process: snapshot },
          }),
      )
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        details: {
          command,
          cwd,
          effectiveArgs,
          outputHash: contentHash([{ type: "text", text: result.output }]),
        },
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
): ToolDefinition<
  typeof inputParameters,
  { effectiveArgs: Record<string, unknown> }
> {
  return {
    name: "write_stdin",
    label: "Input",
    description:
      "Writes characters to an existing unified exec session and returns recent output.",
    parameters: inputParameters,
    exposure: "codemode",
    async execute(_id, args, signal, onUpdate) {
      signal = signal ? AbortSignal.any([signal, lifetime]) : lifetime
      signal.throwIfAborted()
      if (!available())
        throw new Error(
          "Process input is not available in the active tool scope",
        )
      const chars = args.chars ?? ""
      const minimum = chars ? 250 : 5000
      const yieldTime = Math.min(
        chars ? 30000 : 300000,
        Math.max(minimum, args.yield_time_ms ?? minimum),
      )
      const maxTokens = args.max_output_tokens ?? 10000
      const effectiveArgs = {
        session_id: args.session_id,
        chars: boundedPreview(chars),
        yield_time_ms: yieldTime,
        max_output_tokens: maxTokens,
      }
      onUpdate?.({ content: [], details: { effectiveArgs } })
      const result = await processes.write(
        args.session_id,
        chars,
        yieldTime,
        maxTokens,
        signal,
      )
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        details: { effectiveArgs },
      }
    },
  }
}
