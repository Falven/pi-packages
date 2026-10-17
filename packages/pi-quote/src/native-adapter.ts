import type { ExtensionContext } from "@earendil-works/pi-coding-agent"
import {
  TuiAltScreen,
  compositeTuiLine,
  sliceByColumn,
  stripTerminalSequences,
  type Component,
  type EditorComponent,
  type ScrollView,
  type TUI,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui"
import type { LayoutFrame } from "@earendil-works/pi-tui/dist/layout.js"
import { quoteInsertion, quoteSelection } from "./quote.ts"

const { dispatchMouseEvent } = (await import(
  new URL("./tui.js", import.meta.resolve("@earendil-works/pi-tui")).href
)) as typeof import("@earendil-works/pi-tui/dist/tui.js")
const { getScrollViewBox } = (await import(
  new URL("./layout.js", import.meta.resolve("@earendil-works/pi-tui")).href
)) as typeof import("@earendil-works/pi-tui/dist/layout.js")
const { isImageLine, getKittyImagePlacementRows } = (await import(
  new URL("./terminal-image.js", import.meta.resolve("@earendil-works/pi-tui"))
    .href
)) as typeof import("@earendil-works/pi-tui/dist/terminal-image.js")

type Point = { row: number; col: number; scrollView?: ScrollView }
type Selection = { start: Point; end: Point }
type NativeRenderer = TUI & {
  currentLayout: LayoutFrame | undefined
  selectionPressActive: boolean
  selectionFocus?: Point
  getSelectionBounds(): Selection | undefined
  getActiveSelectionText(): string | undefined
  getSelectionSourceLine(point: Point): string
  resetTextSelection(): void
  compositeScrollToEndIndicator(
    screen: string[],
    layout: LayoutFrame,
    width: number,
  ): string[]
  compositeFlashes(screen: string[], width: number, height: number): string[]
  dispatchMouseToLayout(
    event: TuiMouseEvent,
  ): ReturnType<typeof dispatchMouseEvent>
}
type PromptEditor = EditorComponent & {
  insertTextAtCursor(text: string): void
  getCursor(): { line: number; col: number }
  getEditorSelection?(): { from: number; to: number }
}
type Snapshot = Selection & { text: string; source: string; width: number }
type Position = { row: number; col: number }
const label = "[Quote]"

function findEditor(component: Component): PromptEditor | undefined {
  if (
    typeof Reflect.get(component, "getText") === "function" &&
    typeof Reflect.get(component, "insertTextAtCursor") === "function" &&
    typeof Reflect.get(component, "getCursor") === "function" &&
    typeof Reflect.get(component, "onSubmit") === "function" &&
    Reflect.get(component, "actionHandlers") instanceof Map &&
    Reflect.get(component, "actionHandlers").has("app.message.followUp")
  )
    return component as PromptEditor
  const children = Reflect.get(component, "children") as Component[] | undefined
  for (const child of children ?? []) {
    const editor = findEditor(child)
    if (editor) return editor
  }
  return undefined
}

export class QuoteAdapter {
  private renderer: NativeRenderer | undefined
  private detach: (() => void) | undefined
  private active = true
  private failed = false
  private snapshot: Snapshot | undefined
  private pressed: string | undefined
  private position: Position | undefined
  private docked = false
  private renderedDocked = false
  private readonly button: Component
  readonly widget: Component & { dispose(): void }

  constructor(
    private readonly tui: TUI,
    private readonly ctx: ExtensionContext,
  ) {
    this.button = {
      render: () => [this.ctx.ui.theme.fg("muted", label)],
      invalidate() {},
      handleMouse: (event) => {
        if (
          event.button !== "left" ||
          event.y !== 0 ||
          event.x < 0 ||
          event.x >= label.length ||
          (event.type !== "press" && event.type !== "click")
        )
          return undefined
        if (event.type === "press") this.pressed = this.snapshot?.text
        else {
          const text = this.pressed
          this.pressed = undefined
          if (text) this.insert(text)
        }
        return { handled: true }
      },
    }
    this.widget = {
      render: (width) => {
        this.syncRenderer()
        if (!this.renderer || !this.active) return []
        this.renderedDocked =
          this.docked && !!this.snapshot && width >= label.length
        return this.renderedDocked ? this.button.render(width) : [""]
      },
      invalidate() {},
      handleMouse: (event) =>
        this.renderedDocked && !!this.snapshot
          ? dispatchMouseEvent(this.button, event)
          : undefined,
      dispose: () => this.dispose(),
    }
  }

  private syncRenderer() {
    // Pi's live TUI proxy forwards valueOf to the current renderer instance.
    const current = this.tui.valueOf()
    if (current === this.renderer || !this.active || this.failed) return
    this.detach?.()
    this.detach = undefined
    this.renderer = undefined
    this.hide()
    if (!(current instanceof TuiAltScreen)) return
    const renderer = current as unknown as NativeRenderer
    for (const name of [
      "getSelectionBounds",
      "getActiveSelectionText",
      "getSelectionSourceLine",
      "resetTextSelection",
      "compositeFlashes",
      "dispatchMouseToLayout",
      "compositeScrollToEndIndicator",
    ] as const) {
      if (typeof renderer[name] !== "function") {
        this.failed = true
        this.ctx.ui.notify(
          `pi-quote cannot attach: Pi is missing ${name}()`,
          "error",
        )
        return
      }
    }
    if (typeof renderer.selectionPressActive !== "boolean") {
      this.failed = true
      this.ctx.ui.notify(
        "pi-quote cannot attach: Pi's selection state is unavailable",
        "error",
      )
      return
    }
    this.renderer = renderer
    const restore: (() => void)[] = []
    const bind = <
      K extends
        | "compositeFlashes"
        | "dispatchMouseToLayout"
        | "compositeScrollToEndIndicator",
    >(
      name: K,
      wrap: (original: NativeRenderer[K]) => NativeRenderer[K],
    ) => {
      const descriptor = Object.getOwnPropertyDescriptor(renderer, name)
      const replacement = wrap(renderer[name])
      renderer[name] = replacement
      restore.push(() => {
        if (renderer[name] !== replacement) return
        if (descriptor) Object.defineProperty(renderer, name, descriptor)
        else Reflect.deleteProperty(renderer, name)
      })
    }
    let frame: LayoutFrame
    bind(
      "compositeScrollToEndIndicator",
      (original) => (screen, layout, width) => {
        frame = layout
        return original.call(renderer, screen, layout, width)
      },
    )
    bind("compositeFlashes", (original) => (screen, width, height) => {
      const painted = original.call(renderer, screen, width, height)
      return this.active && this.renderer === renderer
        ? this.paint(painted, width, frame)
        : painted
    })
    bind("dispatchMouseToLayout", (original) => (event) => {
      if (!this.active || this.renderer !== renderer)
        return original.call(renderer, event)
      if (event.type === "press") this.pressed = undefined
      const at = this.position
      if (
        at &&
        this.snapshot &&
        event.screenY === at.row &&
        event.screenX >= at.col &&
        event.screenX < at.col + label.length
      ) {
        const result = dispatchMouseEvent(this.button, {
          ...event,
          x: event.screenX - at.col,
          y: 0,
          width: label.length,
          height: 1,
        })
        if (result) return result
      }
      return original.call(renderer, event)
    })
    this.detach = () => {
      for (const undo of restore.toReversed()) undo()
    }
  }

  private paint(
    screen: string[],
    width: number,
    layout: LayoutFrame,
  ): string[] {
    const renderer = this.renderer!
    const bounds = renderer.getSelectionBounds()
    if (
      !this.active ||
      renderer.selectionPressActive ||
      renderer.hasOverlay() ||
      !bounds?.start.scrollView ||
      bounds.start.scrollView !== layout?.primaryScrollView ||
      !findEditor(this.tui)
    ) {
      this.hide()
      return screen
    }
    // Pi commits currentLayout after painting; extract against this frame during redraws.
    const previous = renderer.currentLayout
    try {
      renderer.currentLayout = layout
      const text = renderer.getActiveSelectionText()
      if (
        this.snapshot?.start === bounds.start &&
        this.snapshot.end === bounds.end
      ) {
        if (this.snapshot.width !== width || this.snapshot.source !== text) {
          renderer.resetTextSelection()
          this.hide()
        }
      } else {
        this.snapshot = text?.trim()
          ? {
              ...bounds,
              source: text,
              width,
              text: quoteSelection(
                text,
                bounds.start.row,
                bounds.end.row,
                (row) =>
                  renderer.getSelectionSourceLine({ ...bounds.start, row }),
              ),
            }
          : undefined
      }
    } finally {
      renderer.currentLayout = previous
    }
    if (!this.snapshot) {
      this.hide()
      return screen
    }
    const box = getScrollViewBox(layout, bounds.start.scrollView)
    const focus = renderer.selectionFocus
    let position: Position | undefined
    if (box && focus && width >= label.length + 2) {
      const row = box.rect.y + focus.row - bounds.start.scrollView.scrollTop
      const col = box.rect.x + focus.col
      const clear = (at: Position) => {
        if (
          at.row < Math.max(box.rect.y, box.clip.y) ||
          at.row >=
            Math.min(
              box.rect.y + box.rect.height,
              box.clip.y + box.clip.height,
            ) ||
          at.col < 1 ||
          at.col + label.length >= width - 1 ||
          screen.some(
            (line, imageRow) =>
              imageRow <= at.row &&
              isImageLine(line) &&
              at.row < imageRow + (getKittyImagePlacementRows(line) ?? 1),
          )
        )
          return false
        return !stripTerminalSequences(
          sliceByColumn(
            screen[at.row] ?? "",
            at.col - 1,
            label.length + 2,
            true,
          ),
        ).trim()
      }
      position = [
        { row, col: col + 2 },
        { row, col: col - label.length - 2 },
        {
          row: row - 1,
          col: Math.min(width - label.length - 2, Math.max(1, col)),
        },
        {
          row: row + 1,
          col: Math.min(width - label.length - 2, Math.max(1, col)),
        },
      ].find(clear)
    }
    this.position = this.renderedDocked ? undefined : position
    const docked = !position
    if (docked !== this.docked) {
      this.docked = docked
      renderer.requestRender()
    }
    if (!position || this.renderedDocked) return screen
    const painted = [...screen]
    painted[position.row] = compositeTuiLine(
      painted[position.row] ?? "",
      this.button.render(label.length)[0]!,
      position.col,
      label.length,
      width,
    )
    return painted
  }

  quote() {
    if (this.snapshot && !this.renderer?.hasOverlay())
      this.insert(this.snapshot.text)
  }

  private insert(text: string) {
    const editor = findEditor(this.tui)
    if (!editor || !this.active) return
    const draft = editor.getText()
    const selection = editor.getEditorSelection?.()
    const cursor = editor.getCursor()
    const offset =
      selection?.from ??
      draft
        .split("\n")
        .slice(0, cursor.line)
        .reduce((at, line) => at + line.length + 1, 0) + cursor.col
    editor.insertTextAtCursor(quoteInsertion(text, draft.slice(0, offset)))
    this.renderer?.resetTextSelection()
    this.hide()
    this.tui.setFocus(editor)
    this.tui.requestRender()
  }

  dismiss(): boolean {
    if ((!this.snapshot && !this.pressed) || this.renderer?.hasOverlay())
      return false
    this.pressed = undefined
    this.renderer?.resetTextSelection()
    this.hide()
    this.tui.requestRender()
    return true
  }

  private hide() {
    this.snapshot = undefined
    this.position = undefined
    if (this.docked) {
      this.docked = false
      this.tui.requestRender()
    }
  }

  dispose() {
    this.active = false
    this.pressed = undefined
    this.hide()
    this.detach?.()
    this.detach = undefined
    this.renderer = undefined
  }
}
