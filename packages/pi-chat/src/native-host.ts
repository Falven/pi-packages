import {
  InteractiveMode,
  sessionEntryToContextMessages,
  type AgentSession,
  type ExtensionContext,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent"
import {
  Container,
  ScrollView,
  TuiAltScreen,
  VStack,
  type Component,
  sliceByColumn,
  stripTerminalSequences,
} from "@earendil-works/pi-tui"
import type { StackLayoutNode } from "@earendil-works/pi-tui/dist/layout-node.js"
const { allocateStackSizes } = (await import(
  new URL(
    "./components/stack.js",
    import.meta.resolve("@earendil-works/pi-tui"),
  ).href
)) as typeof import("@earendil-works/pi-tui/dist/components/stack.js")
const LAYOUT_NODE = Symbol.for("@earendil-works/pi-tui/layout-node")
const { dispatchMouseEvent } = (await import(
  new URL("./tui.js", import.meta.resolve("@earendil-works/pi-tui")).href
)) as typeof import("@earendil-works/pi-tui/dist/tui.js")

/* oxlint-disable eslint/no-underscore-dangle -- This adapter targets Pi 1.0.2's private persistence seams. */

type Entry = SessionEntry
type Message = AgentSession["messages"][number]
type NativeAssistant = Component & {
  contentContainer: Container
  updateContent(message: Message, streaming?: boolean): void
}
type NativeMode = {
  version: string
  renderer: {
    mode: string
    layoutRoot?: Component
    setLayoutRoot(root?: Component): void
  }
  fullscreenLayoutRoot: Component
  transcriptScrollView: ScrollView
  chatContainer: Container
  documentContainer: Container
  sessionManager: Pick<
    AgentSession["sessionManager"],
    "getBranch" | "getEntry" | "appendMessage" | "appendCustomMessageEntry"
  >
  session: {
    agent: { subscribe(listener: (event: unknown) => void): () => void }
    extensionRunner: { getEntryRenderer(name: string): unknown }
    _entryIdsByMessage: WeakMap<object, string>
    recordBashResult: (...args: unknown[]) => unknown
    _pendingBashMessages: object[]
    _appendCustomMessage(message: Message): void
  }
  bashComponent?: Component
  pendingBashComponents: Component[]
  pendingTools: Map<string, Component>
  streamingComponent?: NativeAssistant
  renderSessionEntries(entries: Entry[], options?: unknown): void
  renderSessionItems(items: Iterable<unknown>, options?: unknown): void
  renderInitialMessages(): void
  addCustomEntryToChat(entry: Entry): void
  addMessageToChat(message: Message, options?: unknown): void
  handleEvent(event: {
    type: string
    message?: Message
    entry?: Entry
  }): Promise<void>
  showError?(message: string): void
}

export type Occurrence = {
  entry: Entry | undefined
  message: Message | undefined
  itemOrdinal?: number
  contentIndex?: number
  contentIndices?: number[]
  component?: Component
  resultEntry?: Entry
  resultMessage?: Message
  parts: Map<number, Occurrence>
}

const active = new WeakMap<InteractiveMode, NativeChatHost>()

function requiredMode(host: InteractiveMode): NativeMode {
  const mode = host as unknown as NativeMode
  const root = mode.fullscreenLayoutRoot as VStack | undefined
  if (
    mode.version !== "1.0.2" ||
    !mode.chatContainer ||
    !mode.documentContainer ||
    !mode.transcriptScrollView ||
    !root ||
    root.children[0] !== mode.transcriptScrollView ||
    root.children.length !== 2 ||
    (mode.renderer.mode === "fullscreen" &&
      mode.renderer.layoutRoot !== root) ||
    typeof mode.renderSessionEntries !== "function" ||
    typeof mode.renderSessionItems !== "function" ||
    typeof mode.addMessageToChat !== "function" ||
    typeof mode.handleEvent !== "function"
  ) {
    throw new Error(
      "pi-chat requires the unowned Pi 1.0.2 fullscreen chat host",
    )
  }
  return mode
}

class OwnedRoot extends VStack {
  private readonly invalidateNative: () => void
  private readonly layoutChat: () => void

  constructor(
    children: ConstructorParameters<typeof VStack>[0],
    invalidateNative: () => void,
    layoutChat: () => void,
  ) {
    super(children)
    this.invalidateNative = invalidateNative
    this.layoutChat = layoutChat
  }

  override invalidate() {
    this.invalidateNative()
  }

  [LAYOUT_NODE](): StackLayoutNode {
    this.layoutChat()
    return {
      type: "vstack",
      entries: this.entries,
      gap: this.gap,
      align: this.align,
    }
  }
}

type Leaf = {
  component: Component
  occurrence: Occurrence | undefined
  rows: string[]
  start: number
}

type SelectionPoint = {
  row: number
  col: number
  scrollView?: ScrollView
  occurrence?: Occurrence
  component?: Component
  localRow?: number
  boundary?: boolean
}

function rendererSelection(
  renderer: TuiAltScreen,
  name: "selectionAnchor" | "selectionFocus",
) {
  return (
    renderer as unknown as Record<typeof name, SelectionPoint | undefined>
  )[name]
}

class RawLeaf extends Container {
  constructor(
    readonly component: Component,
    readonly rows: string[],
  ) {
    super()
    this.children.push(component)
  }

  override render() {
    return this.rows
  }

  override invalidate() {}

  override handleMouse(
    event: Parameters<NonNullable<Component["handleMouse"]>>[0],
  ) {
    return dispatchMouseEvent(this.component, event)
  }
}

export class NativeChatHost {
  readonly host: NativeMode
  readonly occurrences: Occurrence[] = []
  readonly byEntryId = new Map<string, Occurrence>()
  readonly byComponent = new Map<Component, Occurrence>()
  private readonly projections = new Map<string, Map<number, Occurrence>>()
  readonly root: VStack
  readonly transcript: ScrollView
  private readonly painting = new VStack()
  private leaves: Leaf[] = []
  private viewportHeight = 0
  private totalRows = 0
  private layoutWidth = 0
  private boundRenderer: TuiAltScreen | undefined
  private selectionTimer: NodeJS.Timeout | undefined
  private readonly rendererMethods = new Map<
    string,
    { original: Function; wrapped: Function; descriptor?: PropertyDescriptor }
  >()
  private readonly oldRoot: Component
  private readonly originals = new Map<string, (...args: never[]) => unknown>()
  private readonly wrappers = new Map<string, (...args: never[]) => unknown>()
  private readonly ownDescriptors = new Map<
    string,
    PropertyDescriptor | undefined
  >()
  private readonly chatMethods = new Map<
    string,
    (...args: never[]) => unknown
  >()
  private readonly chatWrappers = new Map<
    string,
    (...args: never[]) => unknown
  >()
  private readonly chatDescriptors = new Map<
    string,
    PropertyDescriptor | undefined
  >()
  private readonly assistantMethods = new Map<
    NativeAssistant,
    {
      original: NativeAssistant["updateContent"]
      wrapped: NativeAssistant["updateContent"]
      descriptor?: PropertyDescriptor
    }
  >()
  private readonly assistantChildren = new Map<
    NativeAssistant,
    Set<Component>
  >()
  private readonly assistantIndices = new Map<NativeAssistant, Set<number>>()
  private readonly liveMessages = new WeakMap<object, Occurrence>()
  private readonly bashMessages = new WeakMap<object, Component>()
  private readonly toolResults = new WeakMap<object, Component>()
  private unsubscribe?: () => void
  private source: Occurrence | undefined
  private streaming: Occurrence | undefined
  private active = true
  private indexedIds: string[] = []

  private constructor(host: NativeMode) {
    this.host = host
    this.oldRoot = host.fullscreenLayoutRoot
    this.transcript = new ScrollView(host.documentContainer, {
      follow: "end",
      primary: true,
      overscroll: "chain",
      scrollbar: host.transcriptScrollView.scrollbar,
    })
    this.root = new OwnedRoot(
      [
        {
          component: this.painting,
          basis: 0,
          grow: 1,
          shrink: 1,
          minSize: 1,
        },
        {
          component: (this.oldRoot as VStack).children[1]!,
          basis: "auto",
          grow: 0,
          shrink: 1,
          minSize: 1,
        },
      ],
      () => this.oldRoot.invalidate(),
      () => this.layoutChat(),
    )
  }

  static install(host: InteractiveMode): NativeChatHost {
    if (active.has(host)) throw new Error("pi-chat chat root is already owned")
    const mode = requiredMode(host)
    const adapter = new NativeChatHost(mode)
    try {
      adapter.wrapNativeConstruction()
      adapter.bindRenderer()
      mode.fullscreenLayoutRoot = adapter.root
      if (mode.renderer.mode === "fullscreen")
        mode.renderer.setLayoutRoot(adapter.root)
      adapter.indexBranch()
      adapter.unsubscribe = mode.session.agent.subscribe((event) => {
        adapter.promotePersistedMessage(event)
      })
      active.set(host, adapter)
      return adapter
    } catch (error) {
      adapter.dispose()
      throw error
    }
  }

  private layoutChat() {
    const renderer = this.host.renderer as unknown as TuiAltScreen
    const width = Math.max(1, renderer.terminal.columns)
    const height = Math.max(1, renderer.terminal.rows)
    const dock = (this.oldRoot as VStack).children[1]!
    const dockHeight = dock.render(width).length
    const [available] = allocateStackSizes(
      [
        { component: this.painting, basis: 0, grow: 1, shrink: 1, minSize: 1 },
        { component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 },
      ],
      [0, dockHeight],
      height,
      0,
    )
    const contentWidth = this.transcript.getContentWidth(width)
    const oldLeaves = this.leaves
    const oldAnchor = rendererSelection(renderer, "selectionAnchor")
    const oldFocus = rendererSelection(renderer, "selectionFocus")
    const selectedStart =
      oldAnchor && oldFocus ? Math.min(oldAnchor.row, oldFocus.row) : -1
    const selectedEnd =
      oldAnchor && oldFocus ? Math.max(oldAnchor.row, oldFocus.row) : -1
    const wasFollowing = this.transcript.isFollowingEnd
    const anchor =
      !wasFollowing &&
      oldLeaves.find(
        (leaf) =>
          this.transcript.scrollTop >= leaf.start &&
          this.transcript.scrollTop < leaf.start + leaf.rows.length,
      )
    const anchorRow = anchor ? this.transcript.scrollTop - anchor.start : 0
    let start = 0
    const components = this.host.documentContainer.children.flatMap(
      (component) =>
        component === this.host.chatContainer
          ? this.host.chatContainer.children
          : [component],
    )
    const leaves = components.map((component) => {
      const rows = component.render(contentWidth)
      const leaf = {
        component,
        occurrence: this.byComponent.get(component),
        rows,
        start,
      }
      start += rows.length
      return leaf
    })
    this.leaves = leaves
    this.viewportHeight = available ?? 0
    this.totalRows = start
    this.transcript.updateLayout(start, this.viewportHeight, () =>
      renderer.requestRender(),
    )
    if (anchor) {
      const next = leaves.find((leaf) =>
        anchor.occurrence
          ? leaf.occurrence === anchor.occurrence
          : leaf.component === anchor.component,
      )
      if (next)
        this.transcript.scrollTo(
          next.start + Math.min(anchorRow, Math.max(0, next.rows.length - 1)),
          { disableFollow: true },
        )
    }
    const widthChanged = this.layoutWidth !== 0 && this.layoutWidth !== width
    this.layoutWidth = width
    for (const point of [oldAnchor, oldFocus]) {
      if (point?.scrollView !== this.transcript || !point.component) continue
      const leaf = leaves.find((candidate) =>
        point.occurrence
          ? candidate.occurrence === point.occurrence
          : candidate.component === point.component,
      )
      if (
        leaf &&
        point.localRow !== undefined &&
        point.localRow < leaf.rows.length
      ) {
        point.row = leaf.start + point.localRow
        point.component = leaf.component
      } else this.clearSelection(renderer)
    }
    if (widthChanged) this.clearSelection(renderer)
    else if (selectedStart >= 0 && oldAnchor?.scrollView === this.transcript) {
      for (const old of oldLeaves) {
        if (
          old.start > selectedEnd ||
          old.start + old.rows.length <= selectedStart
        )
          continue
        const next = leaves.find((leaf) =>
          old.occurrence
            ? leaf.occurrence === old.occurrence
            : leaf.component === old.component,
        )
        if (
          !next ||
          next.rows.length !== old.rows.length ||
          next.rows.some((line, row) => line !== old.rows[row])
        ) {
          this.clearSelection(renderer)
          break
        }
      }
    }
    this.painting.clear()
    const top = this.transcript.scrollTop
    const bottom = top + this.viewportHeight
    for (const leaf of leaves) {
      const sourceStart = Math.max(0, top - leaf.start)
      const sourceEnd = Math.min(leaf.rows.length, bottom - leaf.start)
      if (sourceEnd <= sourceStart) continue
      const raw = new RawLeaf(leaf.component, leaf.rows)
      const window = new ScrollView(raw, {
        follow: "none",
        scrollbar: "hidden",
      })
      window.updateLayout(leaf.rows.length, sourceEnd - sourceStart, () =>
        renderer.requestRender(),
      )
      window.scrollTo(sourceStart, { disableFollow: true })
      this.painting.addChild(window, {
        basis: sourceEnd - sourceStart,
        grow: 0,
        shrink: 0,
      })
    }
  }

  private leafAt(row: number) {
    return this.leaves.find(
      (leaf) => row >= leaf.start && row < leaf.start + leaf.rows.length,
    )
  }

  private pointAt(x: number, y: number): SelectionPoint {
    const row = Math.max(
      0,
      Math.min(
        Math.max(0, this.totalRows - 1),
        this.transcript.scrollTop +
          Math.max(0, Math.min(this.viewportHeight - 1, y)),
      ),
    )
    const leaf = this.leafAt(row)
    return {
      row,
      col: Math.max(0, Math.min(this.layoutWidth - 1, x)),
      scrollView: this.transcript,
      ...(leaf
        ? {
            component: leaf.component,
            ...(leaf.occurrence ? { occurrence: leaf.occurrence } : {}),
            localRow: row - leaf.start,
          }
        : {}),
    }
  }

  private selectedText(renderer: TuiAltScreen): string | undefined {
    const bounds = (
      renderer as unknown as {
        getSelectionBounds():
          | { start: SelectionPoint; end: SelectionPoint }
          | undefined
      }
    ).getSelectionBounds()
    if (!bounds || bounds.start.scrollView !== this.transcript) return undefined
    const columns = (
      renderer as unknown as {
        getSelectionColumns(
          line: string,
          row: number,
          selection: { start: SelectionPoint; end: SelectionPoint },
        ): { start: number; end: number }
      }
    ).getSelectionColumns
    const lines: string[] = []
    for (const leaf of this.leaves) {
      const first = Math.max(bounds.start.row, leaf.start)
      const last = Math.min(bounds.end.row, leaf.start + leaf.rows.length - 1)
      for (let row = first; row <= last; row++) {
        const line = leaf.rows[row - leaf.start]!
        const range = columns.call(renderer, line, row, bounds)
        lines.push(
          stripTerminalSequences(
            sliceByColumn(
              line,
              range.start,
              Math.max(0, range.end - range.start),
              true,
            ),
          ).trimEnd(),
        )
      }
    }
    const text = lines.join("\n")
    return text || undefined
  }

  private clearSelection(renderer: TuiAltScreen) {
    ;(
      renderer as unknown as { clearTextSelection(): void }
    ).clearTextSelection()
  }

  private ownsRenderer(renderer: TuiAltScreen) {
    return (
      this.active &&
      (this.host.renderer as unknown) === renderer &&
      this.host.fullscreenLayoutRoot === this.root &&
      (renderer as unknown as { layoutRoot?: Component }).layoutRoot ===
        this.root
    )
  }

  private bindRenderer() {
    if (this.host.renderer.mode !== "fullscreen") return
    const renderer = this.host.renderer as unknown as TuiAltScreen
    if (this.boundRenderer === renderer) return
    this.unbindRenderer()
    this.boundRenderer = renderer
    const bind = (
      name: string,
      replacement: (original: Function) => Function,
    ) => {
      const target = renderer as unknown as Record<string, unknown>
      const original = target[name] as Function
      const descriptor = Object.getOwnPropertyDescriptor(renderer, name)
      const wrapped = replacement(original)
      target[name] = wrapped
      this.rendererMethods.set(name, {
        original,
        wrapped,
        ...(descriptor ? { descriptor } : {}),
      })
    }
    bind(
      "getPrimaryScrollView",
      (original) => () =>
        this.ownsRenderer(renderer) ? this.transcript : original.call(renderer),
    )
    bind(
      "routeWheel",
      (original) => (event: { x: number; y: number }, delta: number) => {
        if (!this.ownsRenderer(renderer) || event.y >= this.viewportHeight)
          return original.call(renderer, event, delta)
        this.transcript.scrollBy(delta)
        renderer.requestRender()
      },
    )
    bind("scrollToPrompt", (original) => (direction: number) => {
      if (!this.ownsRenderer(renderer))
        return original.call(renderer, direction)
      // oxlint-disable-next-line eslint/no-control-regex -- Pi marks prompt rows with OSC 133.
      const marker = /^\x1b\]133;A(?:\x07|\x1b\\)/
      for (const leaf of direction < 0
        ? this.leaves.toReversed()
        : this.leaves) {
        if (direction < 0 && leaf.start >= this.transcript.scrollTop) continue
        if (
          direction > 0 &&
          leaf.start + leaf.rows.length <= this.transcript.scrollTop
        )
          continue
        const first =
          direction < 0
            ? Math.min(
                leaf.rows.length - 1,
                this.transcript.scrollTop - leaf.start - 1,
              )
            : Math.max(0, this.transcript.scrollTop - leaf.start + 1)
        for (
          let local = first;
          local >= 0 && local < leaf.rows.length;
          local += direction
        ) {
          if (!marker.test(leaf.rows[local] ?? "")) continue
          const row = leaf.start + local
          this.transcript.scrollTo(row)
          renderer.requestRender()
          return
        }
      }
    })
    bind(
      "getSelectionPoint",
      (original) =>
        (event: { x: number; y: number }, scrollView?: ScrollView) => {
          if (
            !this.ownsRenderer(renderer) ||
            (event.y >= this.viewportHeight && scrollView !== this.transcript)
          )
            return original.call(renderer, event, scrollView)
          return this.pointAt(event.x, event.y)
        },
    )
    bind(
      "getScrollSelectionPoint",
      (original) => (scrollView: ScrollView, x: number, y: number) =>
        this.ownsRenderer(renderer) && scrollView === this.transcript
          ? this.pointAt(x, y)
          : original.call(renderer, scrollView, x, y),
    )
    bind("getSelectionSourceLine", (original) => (point: SelectionPoint) => {
      if (!this.ownsRenderer(renderer) || point.scrollView !== this.transcript)
        return original.call(renderer, point)
      const leaf = this.leafAt(point.row)
      return leaf?.rows[point.row - leaf.start] ?? ""
    })
    bind(
      "updateSelectionAutoScroll",
      (original) => (event: { x: number; y: number }) => {
        const state = renderer as unknown as {
          selectionAnchor?: SelectionPoint
          selectionDragPointer?: { x: number; y: number }
          selectionAutoScrollDirection: number
          selectionAutoScrollTimer?: NodeJS.Timeout
          stopSelectionAutoScroll(): void
          autoScrollSelection(): void
        }
        if (
          !this.ownsRenderer(renderer) ||
          state.selectionAnchor?.scrollView !== this.transcript
        )
          return original.call(renderer, event)
        const direction =
          event.y <= 0 ? -1 : event.y >= this.viewportHeight - 1 ? 1 : 0
        if (!direction) {
          state.stopSelectionAutoScroll()
          return
        }
        state.selectionDragPointer = { x: event.x, y: event.y }
        state.selectionAutoScrollDirection = direction
        if (state.selectionAutoScrollTimer) return
        const timer = setInterval(() => state.autoScrollSelection(), 50)
        timer.unref()
        state.selectionAutoScrollTimer = timer
        this.selectionTimer = timer
      },
    )
    bind("autoScrollSelection", (original) => () => {
      const state = renderer as unknown as {
        selectionAnchor?: SelectionPoint
        selectionDragPointer?: { x: number; y: number }
        selectionAutoScrollDirection: number
        stopSelectionAutoScroll(): void
        updateSelectionFocus(point: SelectionPoint): void
      }
      if (
        !this.ownsRenderer(renderer) ||
        state.selectionAnchor?.scrollView !== this.transcript
      )
        return original.call(renderer)
      const pointer = state.selectionDragPointer
      const direction = state.selectionAutoScrollDirection
      if (!pointer || !direction) return state.stopSelectionAutoScroll()
      if (this.transcript.scrollBy(direction) === direction)
        return state.stopSelectionAutoScroll()
      state.updateSelectionFocus(this.pointAt(pointer.x, pointer.y))
      renderer.requestRender()
    })
    bind(
      "getActiveSelectionText",
      (original) => () =>
        this.ownsRenderer(renderer)
          ? (this.selectedText(renderer) ?? original.call(renderer))
          : original.call(renderer),
    )
    bind(
      "applySelection",
      (original) => (screen: string[], layout: unknown) => {
        const anchor = rendererSelection(renderer, "selectionAnchor")
        const focus = rendererSelection(renderer, "selectionFocus")
        if (
          !this.ownsRenderer(renderer) ||
          anchor?.scrollView !== this.transcript ||
          focus?.scrollView !== this.transcript
        )
          return original.call(renderer, screen, layout)
        const target = renderer as unknown as Record<string, unknown>
        target["selectionAnchor"] = {
          ...anchor,
          row: anchor.row - this.transcript.scrollTop,
          scrollView: undefined,
        }
        target["selectionFocus"] = {
          ...focus,
          row: focus.row - this.transcript.scrollTop,
          scrollView: undefined,
        }
        try {
          return [
            ...(original.call(
              renderer,
              screen.slice(0, this.viewportHeight),
              layout,
            ) as string[]),
            ...screen.slice(this.viewportHeight),
          ]
        } finally {
          target["selectionAnchor"] = anchor
          target["selectionFocus"] = focus
        }
      },
    )
  }

  private unbindRenderer() {
    const renderer = this.boundRenderer
    if (!renderer) return
    if (this.selectionTimer) {
      clearInterval(this.selectionTimer)
      const state = renderer as unknown as {
        selectionAutoScrollTimer?: NodeJS.Timeout
      }
      if (state.selectionAutoScrollTimer === this.selectionTimer)
        delete state.selectionAutoScrollTimer
      this.selectionTimer = undefined
    }
    for (const [name, method] of this.rendererMethods) {
      const target = renderer as unknown as Record<string, unknown>
      if (target[name] !== method.wrapped) continue
      if (method.descriptor)
        Object.defineProperty(renderer, name, method.descriptor)
      else delete target[name]
    }
    this.rendererMethods.clear()
    this.boundRenderer = undefined
  }

  static current(host: InteractiveMode): NativeChatHost | undefined {
    return active.get(host)
  }

  private indexBranch() {
    const branch = this.host.sessionManager.getBranch()
    const common = Math.min(this.indexedIds.length, branch.length)
    if (
      this.indexedIds.some(
        (id, index) => index < common && id !== branch[index]?.id,
      ) ||
      branch.length < this.indexedIds.length
    ) {
      this.byEntryId.clear()
      this.projections.clear()
      this.indexedIds = []
    }
    for (let index = this.indexedIds.length; index < branch.length; index++) {
      const entry = branch[index]!
      this.indexedIds.push(entry.id)
      if (!this.byEntryId.has(entry.id))
        this.byEntryId.set(entry.id, this.newOccurrence(entry))
    }
  }

  private recordNative(component: Component) {
    if (!this.byComponent.has(component)) this.associate(component)
  }

  private newOccurrence(entry?: Entry): Occurrence {
    const occurrence: Occurrence = {
      entry,
      message: undefined,
      parts: new Map(),
    }
    this.occurrences.push(occurrence)
    return occurrence
  }

  private forEntry(entry: Entry): Occurrence {
    let occurrence = this.byEntryId.get(entry.id)
    if (!occurrence) {
      occurrence = this.newOccurrence(entry)
      this.byEntryId.set(entry.id, occurrence)
    }
    return occurrence
  }

  private forProjectedItem(entry: Entry, ordinal: number): Occurrence {
    let items = this.projections.get(entry.id)
    if (!items) {
      items = new Map()
      this.projections.set(entry.id, items)
    }
    let occurrence = items.get(ordinal)
    if (!occurrence) {
      occurrence =
        ordinal === 0 ? this.forEntry(entry) : this.newOccurrence(entry)
      occurrence.itemOrdinal = ordinal
      items.set(ordinal, occurrence)
    }
    return occurrence
  }

  private forMessage(message: Message): Occurrence {
    let occurrence = this.liveMessages.get(message)
    if (!occurrence) {
      occurrence = this.newOccurrence()
      this.liveMessages.set(message, occurrence)
    }
    occurrence.message = message
    return occurrence
  }

  private withSource<T>(source: Occurrence | undefined, work: () => T): T {
    const previous = this.source
    this.source = source
    try {
      return work()
    } finally {
      this.source = previous
    }
  }

  private associate(component: Component) {
    if (!this.active || !this.source) return
    if (
      this.source.message?.role === "assistant" &&
      "contentContainer" in component
    ) {
      this.source.component = component
      this.byComponent.set(component, this.source)
      this.bindAssistant(component as NativeAssistant, this.source)
    } else if (
      "toolCallId" in component &&
      typeof component.toolCallId === "string" &&
      this.source.message?.role === "assistant"
    ) {
      const index = this.source.message.content.findIndex(
        (part) => part.type === "toolCall" && part.id === component.toolCallId,
      )
      if (index >= 0) this.bindPart(this.source, index, component)
    } else {
      const notice = this.newOccurrence(this.source.entry)
      notice.message = this.source.message
      if (this.source.itemOrdinal !== undefined)
        notice.itemOrdinal = this.source.itemOrdinal
      notice.component = component
      this.byComponent.set(component, notice)
    }
  }

  private bindPart(owner: Occurrence, index: number, component: Component) {
    let part = owner.parts.get(index)
    if (!part) {
      part = this.newOccurrence(owner.entry)
      part.contentIndex = index
      owner.parts.set(index, part)
    }
    if (
      part.component &&
      part.component !== component &&
      this.byComponent.get(part.component) === part
    ) {
      this.byComponent.delete(part.component)
    }
    part.message = owner.message
    part.component = component
    this.byComponent.set(component, part)
  }

  private bindThinkingRun(
    owner: Occurrence,
    start: number,
    end: number,
    component: Component,
  ) {
    const part = owner.parts.get(start) ?? this.newOccurrence(owner.entry)
    if (
      part.component &&
      part.component !== component &&
      this.byComponent.get(part.component) === part
    ) {
      this.byComponent.delete(part.component)
    }
    part.contentIndex = start
    part.contentIndices = Array.from(
      { length: end - start + 1 },
      (_, offset) => start + offset,
    )
    part.message = owner.message
    part.component = component
    for (let index = start; index <= end; index++) owner.parts.set(index, part)
    this.byComponent.set(component, part)
  }

  private bindAssistant(component: NativeAssistant, owner: Occurrence) {
    const isActive = () => this.active
    const bind = () => {
      if (!this.active || owner.message?.role !== "assistant") return
      const oldChildren = this.assistantChildren.get(component)
      const oldIndices = this.assistantIndices.get(component)
      if (oldChildren) {
        for (const child of oldChildren) {
          this.byComponent.delete(child)
          for (const index of oldIndices ?? []) {
            const part = owner.parts.get(index)
            if (part?.component === child) {
              delete part.component
              part.message = owner.message
            }
          }
        }
      }
      const bound = new Set<Component>()
      const boundIndices = new Set<number>()
      const content = owner.message.content
      const children = component.contentContainer.children
      let child = content.some(
        (part) =>
          (part.type === "text" && part.text.trim()) ||
          (part.type === "thinking" && part.thinking.trim()),
      )
        ? 1
        : 0
      for (let index = 0; index < content.length; index++) {
        const part = content[index]!
        if (part.type === "text" && part.text.trim()) {
          if (children[child]) {
            this.bindPart(owner, index, children[child]!)
            bound.add(children[child]!)
            boundIndices.add(index)
          }
          child++
        } else if (part.type === "thinking") {
          const start = index
          let visible = false
          while (
            index < content.length &&
            content[index]?.type === "thinking"
          ) {
            const thinkingPart = content[index]
            if (thinkingPart?.type === "thinking")
              visible ||= Boolean(thinkingPart.thinking.trim())
            index++
          }
          index--
          if (visible) {
            if (children[child]) {
              this.bindThinkingRun(owner, start, index, children[child]!)
              bound.add(children[child]!)
              for (let partIndex = start; partIndex <= index; partIndex++)
                boundIndices.add(partIndex)
            }
            child++
            if (
              content
                .slice(index + 1)
                .some(
                  (next) =>
                    (next.type === "text" && next.text.trim()) ||
                    (next.type === "thinking" && next.thinking.trim()),
                )
            )
              child++
          }
        }
      }
      for (const index of oldIndices ?? []) {
        if (!boundIndices.has(index)) owner.parts.delete(index)
      }
      this.assistantChildren.set(component, bound)
      this.assistantIndices.set(component, boundIndices)
    }
    const previous = component.updateContent
    if (!this.assistantMethods.has(component)) {
      const descriptor = Object.getOwnPropertyDescriptor(
        component,
        "updateContent",
      )
      const wrapped = function (
        this: NativeAssistant,
        message: Message,
        streaming?: boolean,
      ) {
        previous.call(this, message, streaming)
        if (!isActive()) return
        owner.message = message
        bind()
      }
      component.updateContent = wrapped
      this.assistantMethods.set(component, {
        original: previous,
        wrapped,
        ...(descriptor ? { descriptor } : {}),
      })
    }
    bind()
  }

  private releaseAssistant(component: NativeAssistant) {
    const methods = this.assistantMethods.get(component)
    if (!methods) return
    if (component.updateContent === methods.wrapped) {
      if (methods.descriptor)
        Object.defineProperty(component, "updateContent", methods.descriptor)
      else
        delete (component as unknown as Record<string, unknown>)[
          "updateContent"
        ]
    }
    for (const child of this.assistantChildren.get(component) ?? [])
      this.byComponent.delete(child)
    this.assistantChildren.delete(component)
    this.assistantIndices.delete(component)
    this.assistantMethods.delete(component)
  }

  private wrapNativeConstruction() {
    const host = this.host
    const wrap = (
      name: string,
      make: (
        original: (...args: never[]) => unknown,
      ) => (...args: never[]) => unknown,
    ) => {
      const original = (
        host as unknown as Record<string, (...args: never[]) => unknown>
      )[name]!
      const implementation = make(original)
      const wrapped = (...args: never[]) =>
        this.active ? implementation(...args) : original.apply(host, args)
      this.originals.set(name, original)
      this.wrappers.set(name, wrapped)
      this.ownDescriptors.set(name, Object.getOwnPropertyDescriptor(host, name))
      Object.defineProperty(host, name, {
        configurable: true,
        writable: true,
        value: wrapped,
      })
    }
    for (const name of ["addChild", "removeChild", "clear"] as const) {
      const original = host.chatContainer[name] as (...args: never[]) => unknown
      this.chatMethods.set(name, original)
      this.chatDescriptors.set(
        name,
        Object.getOwnPropertyDescriptor(host.chatContainer, name),
      )
      if (name === "addChild") {
        const wrapped = ((component: Component) => {
          original.call(host.chatContainer, component as never)
          if (this.active) this.recordNative(component)
        }) as typeof host.chatContainer.addChild
        host.chatContainer.addChild = wrapped
        this.chatWrappers.set(name, wrapped as (...args: never[]) => unknown)
      } else {
        const wrapped = (...args: never[]) => {
          const result = original.apply(host.chatContainer, args)
          if (!this.active) return result
          if (name === "clear") {
            for (const component of this.assistantMethods.keys())
              this.releaseAssistant(component)
            this.occurrences.length = 0
            this.byEntryId.clear()
            this.projections.clear()
            this.indexedIds = []
            this.byComponent.clear()
            this.streaming = undefined
          } else {
            const component = args[0] as Component | undefined
            if (component) {
              if (this.assistantMethods.has(component as NativeAssistant))
                this.releaseAssistant(component as NativeAssistant)
              const occurrence = this.byComponent.get(component)
              if (occurrence?.component === component)
                delete occurrence.component
              this.byComponent.delete(component)
            }
          }
          return result
        }
        ;(host.chatContainer as unknown as Record<string, unknown>)[name] =
          wrapped
        this.chatWrappers.set(name, wrapped)
      }
    }
    wrap(
      "addMessageToChat",
      (original) => (message: Message, options?: unknown) => {
        const owner = this.source ?? this.forMessage(message)
        owner.message = message
        const before = host.chatContainer.children.length
        return this.withSource(owner, () => {
          const result = original.call(host, message as never, options as never)
          for (const child of host.chatContainer.children.slice(before)) {
            if ("contentContainer" in child)
              this.bindAssistant(child as NativeAssistant, owner)
          }
          const added = host.chatContainer.children.slice(before)
          if (added.length && message.role !== "assistant") {
            const presenter = added.at(-1)!
            owner.component = presenter
            this.byComponent.set(presenter, owner)
          }
          return result
        })
      },
    )
    wrap("mountInteractiveTui", (original) => (...args: unknown[]) => {
      const result = original.apply(host, args as never[])
      this.bindRenderer()
      return result
    })
    wrap(
      "renderSessionEntries",
      () => (entries: Entry[], options?: unknown) => {
        this.indexBranch()
        const pairs = entries.flatMap((entry) => {
          const items =
            entry.type === "custom" ||
            (entry.type === "usage" && entry.kind === "cache_warm")
              ? [entry]
              : sessionEntryToContextMessages(entry as never)
          const projected =
            (entry.type === "compaction" || entry.type === "branch_summary") &&
            entry.usage &&
            items.length
              ? [
                  ...items,
                  {
                    type: "compaction_cost",
                    kind: entry.type,
                    usage: entry.usage,
                  },
                ]
              : items
          return projected.map((item, ordinal) => ({
            item,
            owner: this.forProjectedItem(entry, ordinal),
          }))
        })
        const setSource = (owner: Occurrence) => {
          this.source = owner
        }
        function* scopedItems() {
          for (const { item, owner } of pairs) {
            if (typeof item === "object" && item && "role" in item)
              owner.message = item as Message
            setSource(owner)
            yield item
          }
        }
        const previous = this.source
        try {
          return host.renderSessionItems(scopedItems(), options)
        } finally {
          this.source = previous
        }
      },
    )
    wrap("addCustomEntryToChat", (original) => (entry: Entry) => {
      const before = new Set(host.chatContainer.children)
      const result = original.call(host, entry as never)
      for (const child of host.chatContainer.children) {
        if (!before.has(child)) this.recordNative(child)
      }
      return result
    })
    wrap(
      "handleEvent",
      (original) =>
        (event: { type: string; message?: Message; entry?: Entry }) => {
          let owner: Occurrence | undefined
          if (
            event.type === "message_end" &&
            event.message?.role === "toolResult"
          ) {
            const component = host.pendingTools.get(event.message.toolCallId)
            if (component) this.toolResults.set(event.message, component)
          }
          if (event.entry) owner = this.forEntry(event.entry)
          else if (event.message) {
            owner =
              event.type === "message_start" ||
              event.message.role !== "assistant"
                ? this.forMessage(event.message)
                : (this.streaming ?? this.forMessage(event.message))
            owner.message = event.message
            this.liveMessages.set(event.message, owner)
          }
          if (
            event.type === "message_start" &&
            event.message?.role === "assistant"
          )
            this.streaming = owner
          const result = this.withSource(owner, () =>
            original.call(host, event as never),
          )
          if (
            event.message?.role === "assistant" &&
            host.streamingComponent &&
            owner
          ) {
            this.bindAssistant(host.streamingComponent, owner)
          }
          if (
            event.type === "message_end" &&
            event.message?.role === "assistant" &&
            this.streaming === owner
          )
            this.streaming = undefined
          return result
        },
    )
    const session = host.session
    const record = session.recordBashResult
    this.originals.set(
      "recordBashResult",
      record as (...args: never[]) => unknown,
    )
    this.ownDescriptors.set(
      "recordBashResult",
      Object.getOwnPropertyDescriptor(session, "recordBashResult"),
    )
    const wrappedRecord = (...args: unknown[]) => {
      const before = session._pendingBashMessages.length
      const result = record.apply(session, args)
      if (!this.active) return result
      const component = host.bashComponent ?? host.pendingBashComponents.at(-1)
      const pending = session._pendingBashMessages[before]
      if (component && pending) this.bashMessages.set(pending, component)
      return result
    }
    session.recordBashResult = wrappedRecord
    this.wrappers.set(
      "recordBashResult",
      wrappedRecord as (...args: never[]) => unknown,
    )

    const manager = host.sessionManager
    const appendMessage = manager.appendMessage
    this.originals.set(
      "appendMessage",
      appendMessage as (...args: never[]) => unknown,
    )
    this.ownDescriptors.set(
      "appendMessage",
      Object.getOwnPropertyDescriptor(manager, "appendMessage"),
    )
    const wrappedAppendMessage: typeof manager.appendMessage = (message) => {
      const id = appendMessage.call(manager, message)
      if (!this.active || message.role !== "bashExecution") return id
      const entry = manager.getEntry(id)
      const component = this.bashMessages.get(message) ?? host.bashComponent
      if (entry && component) {
        const owner = this.forEntry(entry)
        owner.message = message
        owner.component = component
        this.byComponent.set(component, owner)
      }
      return id
    }
    manager.appendMessage = wrappedAppendMessage
    this.wrappers.set(
      "appendMessage",
      wrappedAppendMessage as (...args: never[]) => unknown,
    )

    const appendCustom = session._appendCustomMessage
    this.originals.set(
      "_appendCustomMessage",
      appendCustom as (...args: never[]) => unknown,
    )
    this.ownDescriptors.set(
      "_appendCustomMessage",
      Object.getOwnPropertyDescriptor(session, "_appendCustomMessage"),
    )
    const wrappedAppendCustom = (message: Message) => {
      if (!this.active) return appendCustom.call(session, message)
      const originalAppend = manager.appendCustomMessageEntry
      const previous = Object.getOwnPropertyDescriptor(
        manager,
        "appendCustomMessageEntry",
      )
      const scopedAppend: typeof manager.appendCustomMessageEntry = (
        ...args
      ) => {
        const id = originalAppend.apply(manager, args)
        const entry = manager.getEntry(id)
        if (entry) {
          const owner = this.forEntry(entry)
          owner.message = message
          this.liveMessages.set(message, owner)
        }
        return id
      }
      manager.appendCustomMessageEntry = scopedAppend
      try {
        return appendCustom.call(session, message)
      } finally {
        if (manager.appendCustomMessageEntry === scopedAppend) {
          if (previous)
            Object.defineProperty(manager, "appendCustomMessageEntry", previous)
          else
            delete (manager as unknown as Record<string, unknown>)[
              "appendCustomMessageEntry"
            ]
        }
      }
    }
    session._appendCustomMessage = wrappedAppendCustom
    this.wrappers.set(
      "_appendCustomMessage",
      wrappedAppendCustom as (...args: never[]) => unknown,
    )
  }

  private promotePersistedMessage(event: unknown) {
    if (
      !this.active ||
      !event ||
      typeof event !== "object" ||
      !("type" in event) ||
      event.type !== "message_end" ||
      !("message" in event)
    )
      return
    const message = event.message as Message
    const id = this.host.session._entryIdsByMessage.get(message)
    if (!id) return
    const entry = this.host.sessionManager.getEntry(id)
    if (!entry) return
    const occurrence = this.liveMessages.get(message)
    if (occurrence) {
      occurrence.entry = entry
      this.byEntryId.set(id, occurrence)
      for (const part of occurrence.parts.values()) part.entry = entry
    }
    const bash = this.bashMessages.get(message)
    if (bash) this.byComponent.set(bash, this.forEntry(entry))
    const tool = this.toolResults.get(message)
    const call = tool && this.byComponent.get(tool)
    if (call) {
      call.resultEntry = entry
      call.resultMessage = message
    }
  }

  dispose() {
    if (!this.active) return
    this.active = false
    this.unsubscribe?.()
    this.unbindRenderer()
    for (const [name] of this.originals) {
      const target =
        name === "appendMessage"
          ? this.host.sessionManager
          : name === "recordBashResult" || name === "_appendCustomMessage"
            ? this.host.session
            : this.host
      if (
        (target as unknown as Record<string, unknown>)[name] ===
        this.wrappers.get(name)
      ) {
        const descriptor = this.ownDescriptors.get(name)
        if (descriptor) Object.defineProperty(target, name, descriptor)
        else delete (target as unknown as Record<string, unknown>)[name]
      }
    }
    for (const [name] of this.chatMethods) {
      if (
        (this.host.chatContainer as unknown as Record<string, unknown>)[
          name
        ] === this.chatWrappers.get(name)
      ) {
        const descriptor = this.chatDescriptors.get(name)
        if (descriptor)
          Object.defineProperty(this.host.chatContainer, name, descriptor)
        else
          delete (
            this.host.chatContainer as unknown as Record<string, unknown>
          )[name]
      }
    }
    for (const component of this.assistantMethods.keys())
      this.releaseAssistant(component)
    this.assistantChildren.clear()
    this.assistantIndices.clear()
    if (this.host.fullscreenLayoutRoot === this.root)
      this.host.fullscreenLayoutRoot = this.oldRoot
    if (this.host.renderer.layoutRoot === this.root)
      this.host.renderer.setLayoutRoot(this.oldRoot)
    if (active.get(this.host as unknown as InteractiveMode) === this)
      active.delete(this.host as unknown as InteractiveMode)
    this.occurrences.length = 0
    this.leaves = []
    this.painting.clear()
    this.byEntryId.clear()
    this.byComponent.clear()
    this.projections.clear()
    this.indexedIds = []
  }
}

type Bootstrap = { renderer: unknown; install(host: InteractiveMode): void }
const pending = new Set<Bootstrap>()
let descriptor: PropertyDescriptor | undefined
let bootstrapWrapper: NativeMode["renderSessionEntries"] | undefined

export function armHistoryBootstrap(
  renderer: unknown,
  install: (host: InteractiveMode) => void,
) {
  const token: Bootstrap = { renderer, install }
  pending.add(token)
  if (!descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(
      InteractiveMode.prototype,
      "renderSessionEntries",
    )
    if (!descriptor || typeof descriptor.value !== "function")
      throw new Error("pi-chat cannot observe Pi history construction")
    const original = descriptor.value as NativeMode["renderSessionEntries"]
    bootstrapWrapper = function (
      this: NativeMode,
      entries: Entry[],
      options?: unknown,
    ) {
      for (const candidate of pending) {
        if (
          this.session?.extensionRunner?.getEntryRenderer?.(
            "pi-chat.relationship",
          ) === candidate.renderer
        ) {
          try {
            candidate.install(this as unknown as InteractiveMode)
          } catch (error) {
            this.showError?.(
              `pi-chat: ${error instanceof Error ? error.message : String(error)}`,
            )
            return original.call(this, entries, options)
          } finally {
            disarmHistoryBootstrap(candidate)
          }
          return this.renderSessionEntries(entries, options)
        }
      }
      return original.call(this, entries, options)
    }
    Object.defineProperty(InteractiveMode.prototype, "renderSessionEntries", {
      ...descriptor,
      value: bootstrapWrapper,
    })
  }
  return () => disarmHistoryBootstrap(token)
}

function disarmHistoryBootstrap(token: Bootstrap) {
  pending.delete(token)
  if (pending.size === 0 && descriptor) {
    if (
      (InteractiveMode.prototype as unknown as NativeMode)
        .renderSessionEntries === bootstrapWrapper
    )
      Object.defineProperty(
        InteractiveMode.prototype,
        "renderSessionEntries",
        descriptor,
      )
    descriptor = undefined
    bootstrapWrapper = undefined
  }
}

export function captureHost(ctx: ExtensionContext): InteractiveMode {
  if (ctx.mode !== "tui") throw new Error("pi-chat requires Pi TUI mode")
  const prior = Object.getOwnPropertyDescriptor(
    InteractiveMode.prototype,
    "setExtensionWidget",
  )
  if (!prior || typeof prior.value !== "function")
    throw new Error("pi-chat cannot observe Pi widget host")
  let host: InteractiveMode | undefined
  Object.defineProperty(InteractiveMode.prototype, "setExtensionWidget", {
    ...prior,
    value: function (this: InteractiveMode, ...args: unknown[]) {
      // oxlint-disable-next-line typescript/no-this-alias -- The prototype observer must capture Pi's receiver.
      host = this
      Object.defineProperty(
        InteractiveMode.prototype,
        "setExtensionWidget",
        prior,
      )
      return prior.value.apply(this, args)
    },
  })
  try {
    ctx.ui.setWidget("pi-chat.host", undefined)
  } finally {
    Object.defineProperty(
      InteractiveMode.prototype,
      "setExtensionWidget",
      prior,
    )
  }
  if (
    !host ||
    (host as unknown as NativeMode).sessionManager !==
      (ctx.sessionManager as unknown)
  )
    throw new Error("pi-chat could not acquire this Pi session's host")
  return host
}
