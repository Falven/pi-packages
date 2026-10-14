import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { userInfo } from "node:os"
import { delimiter, join } from "node:path"
import {
  getAgentDir,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { OutputBuffer } from "./output.ts"

const parameters = Type.Object(
  {
    cmd: Type.String(),
    justification: Type.Optional(Type.String()),
    login: Type.Optional(Type.Boolean()),
    max_output_tokens: Type.Optional(Type.Integer({ minimum: 0 })),
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
    yield_time_ms: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
)

export function createCommand(
  pi: ExtensionAPI,
  available: () => boolean,
  lifetime: AbortSignal,
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
      if (args.tty) throw new Error("Interactive execution is not available")
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
      const started = performance.now()
      const child = spawn(
        shell,
        [args.login === false ? "-c" : "-lc", command],
        {
          cwd: args.workdir ?? ctx.cwd,
          env,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      )
      const output = new OutputBuffer(args.max_output_tokens ?? 10000)
      child.stdout.on("data", (chunk: Buffer) => output.append(chunk))
      child.stderr.on("data", (chunk: Buffer) => output.append(chunk))
      const stop = () => {
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL")
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
          }
        }
      }
      signal?.addEventListener("abort", stop, { once: true })
      if (signal?.aborted) stop()
      const exitCode = await new Promise<number>((resolve, reject) => {
        child.once("error", reject)
        child.once("close", (code) => resolve(code ?? 1))
      }).finally(() => signal?.removeEventListener("abort", stop))
      const result = {
        chunk_id: randomBytes(3).toString("hex"),
        wall_time_seconds: (performance.now() - started) / 1000,
        exit_code: exitCode,
        ...output.result(),
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        details: undefined,
      }
    },
  }
}
