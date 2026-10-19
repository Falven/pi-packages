import { accessSync, constants, statSync } from "node:fs";
import { userInfo } from "node:os";
import { delimiter, join, parse, resolve } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import { argumentError, invalidArgument, objectArguments } from "./arguments.ts";
import { boundedPreview, contentHash } from "./presentation.ts";
import type { ProcessPresentation, ProcessSessions } from "./process.ts";

// Integer conversion rounds fractions before validation; multipleOf preserves rejection.
const commandInteger = Type.Number({ minimum: 0, exclusiveMaximum: 2 ** 64, multipleOf: 1 });
const parameters = Type.Object(
  {
    cmd: Type.String(),
    justification: Type.Optional(Type.String()),
    login: Type.Optional(Type.Boolean()),
    max_output_tokens: Type.Optional(commandInteger),
    prefix_rule: Type.Optional(Type.Array(Type.String())),
    sandbox_permissions: Type.Optional(
      Type.Union([Type.Literal("use_default"), Type.Literal("require_escalated")]),
    ),
    shell: Type.Optional(Type.String()),
    tty: Type.Optional(Type.Boolean()),
    workdir: Type.Optional(Type.String()),
    yield_time_ms: Type.Optional(commandInteger),
  },
  { additionalProperties: false },
);

type ShellKind = "bash" | "zsh" | "sh" | "powershell" | "cmd";

function shellKind(path: string): ShellKind | undefined {
  let part = parse(path);
  while (part.base === "." && part.dir) part = parse(part.dir);
  const name = part.name;
  switch (name) {
    case "bash":
    case "zsh":
    case "sh":
    case "cmd":
      return name;
    case "pwsh":
    case "powershell":
      return "powershell";
  }
  return name && name !== path ? shellKind(name) : undefined;
}

function shellFile(path: string, executable = false): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (executable) accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function explicitShell(path: string): string {
  const kind = shellKind(path);
  if (!kind) return "/bin/sh";
  const account = userInfo().shell;
  if (account && shellKind(account) === kind && shellFile(account)) return account;
  const fallbacks = {
    bash: ["/bin/bash", "/usr/bin/bash"],
    zsh: ["/bin/zsh"],
    sh: ["/bin/sh"],
    pwsh: ["/usr/local/bin/pwsh"],
    powershell: [],
    cmd: [],
  };
  for (const name of kind === "powershell" ? (["pwsh", "powershell"] as const) : [kind]) {
    for (const directory of process.env["PATH"]?.split(delimiter) ?? []) {
      const candidate = resolve(directory, name);
      if (shellFile(candidate, true)) return candidate;
    }
    const fallback = fallbacks[name].find((candidate) => shellFile(candidate));
    if (fallback) return fallback;
  }
  return "/bin/sh";
}

export function createCommand(
  pi: ExtensionAPI,
  available: () => boolean,
  lifetime: AbortSignal,
  processes: ProcessSessions,
): ToolDefinition<
  typeof parameters,
  {
    command: string;
    cwd: string;
    effectiveArgs: Record<string, unknown>;
    process?: ProcessPresentation;
    outputHash?: string;
  }
> {
  return {
    name: "exec_command",
    label: "Command",
    description:
      "Runs a command in a PTY, returning output or a session ID for ongoing interaction.",
    parameters,
    exposure: "codemode",
    prepareArguments(args) {
      const input = objectArguments("exec_command", args);
      // The reference resolves the command environment before parsing the command fields.
      if (input["workdir"] != null && typeof input["workdir"] !== "string")
        throw invalidArgument(input, "workdir", "a string");
      const prepared: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (
          !Object.hasOwn(parameters.properties, key) ||
          value === undefined ||
          (value === null && !["cmd", "tty", "yield_time_ms"].includes(key))
        )
          continue;
        const field = key as keyof typeof parameters.properties;
        if (!Check(parameters.properties[field], value)) {
          if (key === "prefix_rule" && Array.isArray(value))
            throw invalidArgument(
              input,
              key,
              "a string",
              value.findIndex((item) => typeof item !== "string"),
            );
          if (key === "sandbox_permissions" && typeof value === "string") {
            if (value === "with_additional_permissions")
              throw new Error("Additional permissions are not available from this host");
            throw argumentError(
              input,
              `unknown variant \`${value}\`, expected one of \`use_default\`, \`require_escalated\`, \`with_additional_permissions\``,
              key,
            );
          }
          throw invalidArgument(
            input,
            key,
            key === "tty" || key === "login"
              ? "a boolean"
              : key === "yield_time_ms"
                ? "u64"
                : key === "max_output_tokens"
                  ? "usize"
                  : key === "prefix_rule"
                    ? "a sequence"
                    : "a string",
          );
        }
        prepared[key] = value;
      }
      if (!Object.hasOwn(prepared, "cmd")) throw argumentError(input, "missing field `cmd`");
      if (prepared["justification"] !== undefined && prepared["sandbox_permissions"] === undefined)
        throw new Error(
          '`justification` requires an explicit `sandbox_permissions`; use `sandbox_permissions: "require_escalated"` for unsandboxed execution, or omit `justification`.',
        );
      return prepared as Static<typeof parameters>;
    },
    async execute(_id, args, signal, onUpdate, ctx) {
      signal = signal ? AbortSignal.any([signal, lifetime]) : lifetime;
      signal.throwIfAborted();
      if (!available())
        throw new Error("Command execution is not available in the active tool scope");
      if (args.sandbox_permissions === "require_escalated")
        throw new Error("Elevated execution is not available from this host");
      const settings = pi.getSettings();
      const shell =
        args.shell === undefined
          ? (settings.shellPath ?? userInfo().shell)
          : explicitShell(args.shell);
      if (!shell) throw new Error("The user has no configured shell");
      const command = settings.shellCommandPrefix
        ? `${settings.shellCommandPrefix}\n${args.cmd}`
        : args.cmd;
      const login = args.login !== false;
      const kind = args.shell === undefined ? undefined : shellKind(shell);
      const commandArgs =
        kind === "powershell"
          ? [...(login ? [] : ["-NoProfile"]), "-Command", command]
          : kind === "cmd"
            ? ["/c", command]
            : [login ? "-lc" : "-c", command];
      const env = { ...process.env };
      for (const key of [
        "PI_SESSION_ID",
        "PI_SESSION_FILE",
        "PI_PROVIDER",
        "PI_MODEL",
        "PI_REASONING_LEVEL",
      ])
        delete env[key];
      const managed = join(getAgentDir(), "bin");
      const path = env["PATH"] ?? "";
      env["PATH"] = path.split(delimiter).includes(managed)
        ? path
        : [managed, path].filter(Boolean).join(delimiter);
      env["PI_SESSION_ID"] = ctx.sessionManager.getSessionId();
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (sessionFile) env["PI_SESSION_FILE"] = sessionFile;
      if (ctx.model) {
        env["PI_PROVIDER"] = ctx.model.provider;
        env["PI_MODEL"] = ctx.model.id;
      }
      if (ctx.thinkingLevel) env["PI_REASONING_LEVEL"] = ctx.thinkingLevel;
      const cwd = args.workdir === undefined ? ctx.cwd : resolve(ctx.cwd, args.workdir);
      const yieldTime = Math.min(30000, Math.max(250, args.yield_time_ms ?? 10000));
      const maxTokens = args.max_output_tokens ?? 10000;
      const effectiveArgs = {
        cmd: boundedPreview(command),
        workdir: boundedPreview(cwd),
        shell: boundedPreview(shell),
        login,
        tty: args.tty ?? false,
        yield_time_ms: yieldTime,
        max_output_tokens: maxTokens,
      };
      onUpdate?.({ content: [], details: { command, cwd, effectiveArgs } });
      const result = await processes.start(
        {
          shell,
          args: commandArgs,
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
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        details: {
          command,
          cwd,
          effectiveArgs,
          outputHash: contentHash([{ type: "text", text: result.output }]),
        },
      };
    },
  };
}

const inputUnsignedInteger = Type.Number({ minimum: 0, exclusiveMaximum: 2 ** 64, multipleOf: 1 });
const inputParameters = Type.Object(
  {
    session_id: Type.Number({
      minimum: -2147483648,
      maximum: 2147483647,
      multipleOf: 1,
    }),
    chars: Type.Optional(Type.String()),
    max_output_tokens: Type.Optional(inputUnsignedInteger),
    yield_time_ms: Type.Optional(inputUnsignedInteger),
  },
  { additionalProperties: false },
);

export function createStdin(
  available: () => boolean,
  lifetime: AbortSignal,
  processes: ProcessSessions,
): ToolDefinition<typeof inputParameters, { effectiveArgs: Record<string, unknown> }> {
  return {
    name: "write_stdin",
    label: "Input",
    description: "Writes characters to an existing unified exec session and returns recent output.",
    parameters: inputParameters,
    exposure: "codemode",
    prepareArguments(args) {
      const input = objectArguments("write_stdin", args);
      const prepared: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (value === undefined || !Object.hasOwn(inputParameters.properties, key)) continue;
        if (key === "max_output_tokens" && value === null) continue;
        const field = key as keyof typeof inputParameters.properties;
        if (!Check(inputParameters.properties[field], value))
          throw invalidArgument(
            input,
            key,
            key === "session_id"
              ? "i32"
              : key === "chars"
                ? "a string"
                : key === "yield_time_ms"
                  ? "u64"
                  : "usize",
          );
        prepared[key] = value;
      }
      if (!Object.hasOwn(prepared, "session_id"))
        throw argumentError(input, "missing field `session_id`");
      return prepared as Static<typeof inputParameters>;
    },
    async execute(_id, args, signal, onUpdate) {
      signal = signal ? AbortSignal.any([signal, lifetime]) : lifetime;
      signal.throwIfAborted();
      if (!available()) throw new Error("Process input is not available in the active tool scope");
      const chars = args.chars ?? "";
      const minimum = chars ? 250 : 5000;
      const yieldTime = Math.min(
        chars ? 30000 : 300000,
        Math.max(minimum, args.yield_time_ms ?? 250),
      );
      const maxTokens = args.max_output_tokens ?? 10000;
      const effectiveArgs = {
        session_id: args.session_id,
        chars: boundedPreview(chars),
        yield_time_ms: yieldTime,
        max_output_tokens: maxTokens,
      };
      onUpdate?.({ content: [], details: { effectiveArgs } });
      const result = await processes.write(args.session_id, chars, yieldTime, maxTokens, signal);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        details: { effectiveArgs },
      };
    },
  };
}
