import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent"
import { Key, type KeyId } from "@earendil-works/pi-tui"

function isKey(value: unknown): value is KeyId {
  if (typeof value !== "string") return false
  const normalized = value.toLowerCase()
  const prefix = /^(?:(?:ctrl|alt|shift|super)\+)*/.exec(normalized)![0]
  const modifiers = prefix.split("+").slice(0, -1)
  if (new Set(modifiers).size !== modifiers.length) return false
  const base = normalized.slice(prefix.length)
  return (
    /^[a-z0-9]$/.test(base) ||
    Object.values(Key).some(
      (key) => typeof key === "string" && key.toLowerCase() === base,
    )
  )
}

export function registerShortcuts(
  pi: ExtensionAPI,
  handlers: {
    attach: (ctx: ExtensionContext) => void | Promise<void>
    manage: (ctx: ExtensionContext) => void | Promise<void>
  },
): void {
  const path = join(getAgentDir(), "keybindings.json")
  function report(error: unknown) {
    pi.on("session_start", (_event, ctx) => {
      ctx.ui.notify(
        `Could not configure attachment shortcuts in ${path}: ${String(error)}. Commands remain available.`,
        "error",
      )
    })
  }
  let config: Record<string, unknown> = {}
  try {
    const value: unknown = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    )
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error(`${path} must contain a JSON object`)
    config = value as Record<string, unknown>
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      report(error)
      return
    }
  }
  for (const [action, description, fallback] of [
    ["attach", "Attach…", "ctrl+alt+f"],
    ["manage", "Manage attachments…", "ctrl+alt+a"],
  ] as const) {
    const id = `extension.attachments.${action}`
    const value = Object.hasOwn(config, id) ? config[id] : fallback
    const keys = typeof value === "string" ? [value] : value
    if (!Array.isArray(keys) || !keys.every(isKey)) {
      report(`${id} must be a valid Pi key or a list of keys`)
      continue
    }
    for (const key of keys)
      pi.registerShortcut(key, {
        description,
        handler: handlers[action],
      })
  }
}
