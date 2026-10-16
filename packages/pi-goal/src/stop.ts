import {
  CustomEditor,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent"

type EditorFactory = NonNullable<
  ReturnType<ExtensionContext["ui"]["getEditorComponent"]>
>
type StopEditor = ReturnType<EditorFactory> & {
  onEscape?: () => void
  isShowingAutocomplete(): boolean
}

function ownsCallback(editor: StopEditor, callback: () => void): boolean {
  // Companion proxies bind callback reads; the stored public value is stable.
  return Object.getOwnPropertyDescriptor(editor, "onEscape")?.value === callback
}

export function createGoalStop(
  pause: (ctx: ExtensionContext) => void | Promise<void>,
): { install(ctx: ExtensionContext): void; dispose(): void } {
  let owner:
    | {
        ctx: ExtensionContext
        factory: EditorFactory
        previous: EditorFactory | undefined
        editor: StopEditor | undefined
      }
    | undefined
  let binding:
    | {
        editor: StopEditor
        original: PropertyDescriptor
        stop: () => void
        cancel: Set<() => void>
      }
    | undefined

  const detach = () => {
    const old = binding
    binding = undefined
    if (!old) return false
    for (const cancel of old.cancel) cancel()
    if (!ownsCallback(old.editor, old.stop)) return false
    Object.defineProperty(old.editor, "onEscape", old.original)
    return true
  }

  return {
    install(ctx) {
      if (ctx.mode !== "tui") return
      const current = ctx.ui.getEditorComponent()
      if (!owner || owner.factory !== current) {
        detach()
        const next: NonNullable<typeof owner> = {
          ctx,
          previous: current,
          editor: undefined,
          factory: (tui, theme, keys) => {
            const editor =
              current?.(tui, theme, keys) ?? new CustomEditor(tui, theme, keys)
            if (
              !("isShowingAutocomplete" in editor) ||
              typeof editor.isShowingAutocomplete !== "function"
            )
              throw new Error("Goal Stop requires native editor key dispatch.")
            next.editor = editor as StopEditor
            return editor
          },
        }
        owner = next
        try {
          ctx.ui.setEditorComponent(next.factory)
        } catch (error) {
          owner = undefined
          ctx.ui.setEditorComponent(current)
          throw error
        }
      }
      if (!owner) return
      owner.ctx = ctx
      const installed = owner
      const editor = installed.editor
      if (
        binding &&
        binding.editor === editor &&
        ownsCallback(editor, binding.stop)
      )
        return
      detach()
      // The host wires native delegation after the editor factory returns.
      const original = editor?.onEscape
      const descriptor =
        editor && Object.getOwnPropertyDescriptor(editor, "onEscape")
      if (!editor || !original || !descriptor) {
        owner = undefined
        ctx.ui.setEditorComponent(installed.previous)
        throw new Error("Goal Stop requires a native interruption handler.")
      }
      const cancel = new Set<() => void>()
      const stop = () => {
        const owns = () =>
          owner === installed &&
          binding?.stop === stop &&
          ownsCallback(editor, stop) &&
          installed.ctx.ui.getEditorComponent() === installed.factory
        if (!owns() || installed.ctx.isIdle()) {
          original()
          return
        }
        let release: () => void
        let timeout: ReturnType<typeof setTimeout>
        const deadline = new Promise<void>((resolve, reject) => {
          release = resolve
          timeout = setTimeout(
            () => reject(new Error("Goal pause did not finish within 500 ms")),
            500,
          )
        })
        const finish = () => {
          clearTimeout(timeout)
          release()
          cancel.delete(finish)
        }
        cancel.add(finish)
        void Promise.race([
          Promise.resolve().then(() => {
            if (owns()) return pause(installed.ctx)
          }),
          deadline,
        ])
          .catch((error: unknown) => ({ error }))
          .then((failure) => {
            finish()
            if (!owns()) return
            try {
              if (!installed.ctx.isIdle()) original()
            } finally {
              if (failure)
                installed.ctx.ui.notify(
                  `Could not pause the goal: ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`,
                  "error",
                )
            }
          })
      }
      binding = { editor, original: descriptor, stop, cancel }
      editor.onEscape = stop
    },
    dispose() {
      const old = owner
      owner = undefined
      const ownedCallback = detach()
      if (
        old &&
        ownedCallback &&
        old.ctx.ui.getEditorComponent() === old.factory
      )
        old.ctx.ui.setEditorComponent(old.previous)
    },
  }
}
