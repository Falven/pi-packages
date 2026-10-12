import {
  getSelectListTheme,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent"
import {
  getNativeClipboard,
  matchesKey,
  SelectList,
  type AutocompleteProvider,
} from "@earendil-works/pi-tui"

function labels(
  base: AutocompleteProvider,
  prefix: string,
): AutocompleteProvider {
  return {
    ...(base.triggerCharacters
      ? { triggerCharacters: base.triggerCharacters }
      : {}),
    async getSuggestions(...args) {
      const result = await base.getSuggestions(...args)
      return (
        result && {
          ...result,
          items: result.items.map((item) =>
            Object.assign({}, item, { label: `${prefix} ${item.label}` }),
          ),
        }
      )
    },
    applyCompletion: (...args) => base.applyCompletion(...args),
    shouldTriggerFileCompletion: (...args) =>
      base.shouldTriggerFileCompletion?.(...args) ?? true,
  }
}

export default function mixedAcceptance(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((base) => labels(base, "early"))
    ctx.ui.setWidget("mixed-acceptance", ["Mixed acceptance fixture ready"])
    ctx.ui.onTerminalInput((data) =>
      matchesKey(data, "ctrl+alt+l") ? { data: "LISTENER" } : undefined,
    )
  })
  pi.registerShortcut("ctrl+alt+u", {
    description: "Acceptance: update completion provider",
    handler: async (ctx) => {
      ctx.ui.addAutocompleteProvider((base) => labels(base, "updated"))
      ctx.ui.notify("Acceptance provider updated", "info")
    },
  })
  pi.registerShortcut("ctrl+alt+p", {
    description: "Acceptance: custom skill picker",
    handler: async (ctx) => {
      const reference = await ctx.ui.custom<string | undefined>(
        (_tui, _theme, _keys, done) => {
          const picker = new SelectList(
            [
              { value: "/skill:review", label: "Review mixed request" },
              { value: "/skill:literal", label: "Literal example skill" },
            ],
            5,
            getSelectListTheme(),
          )
          picker.onSelect = (item) => done(item.value)
          picker.onCancel = () => done(undefined)
          return picker
        },
        { overlay: true },
      )
      if (reference !== undefined) ctx.ui.pasteToEditor(reference)
    },
  })
  pi.registerShortcut("ctrl+alt+e", {
    description: "Acceptance: extension text paste",
    handler: async (ctx) => {
      const text = await getNativeClipboard()?.getText()
      if (text === undefined)
        throw new Error("Native text clipboard unavailable")
      if (text !== null) ctx.ui.pasteToEditor(text)
    },
  })
  pi.registerShortcut("ctrl+alt+s", {
    description: "Acceptance: native extension shortcut",
    handler: async (ctx) => {
      ctx.ui.notify("Acceptance shortcut received", "info")
    },
  })
  pi.registerCommand("acceptance-reload", {
    description: "Acceptance: reload resources with the current draft intact",
    handler: async (_args, ctx) => ctx.reload(),
  })
  pi.registerShortcut("ctrl+alt+y", {
    description: "Acceptance: reload resources",
    handler: async () => {
      pi.sendUserMessage("/acceptance-reload", { expandPromptTemplates: true })
    },
  })
  pi.registerShortcut("ctrl+alt+c", {
    description: "Acceptance: clean unused attachment data",
    handler: async () => {
      pi.sendUserMessage("/attachments-cleanup", {
        expandPromptTemplates: true,
      })
    },
  })
  pi.registerShortcut("ctrl+alt+d", {
    description: "Acceptance: recover a composer draft",
    handler: async () => {
      pi.sendUserMessage("/composer-recover", { expandPromptTemplates: true })
    },
  })
  pi.registerShortcut("ctrl+alt+q", {
    description: "Acceptance: quit with the current draft intact",
    handler: async (ctx) => ctx.shutdown(),
  })
}
