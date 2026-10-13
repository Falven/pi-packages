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
  VStack,
  type Component,
} from "@earendil-works/pi-tui"

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

  constructor(
    children: ConstructorParameters<typeof VStack>[0],
    invalidateNative: () => void,
  ) {
    super(children)
    this.invalidateNative = invalidateNative
  }

  override invalidate() {
    this.invalidateNative()
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
          component: this.transcript,
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
    )
  }

  static install(host: InteractiveMode): NativeChatHost {
    if (active.has(host)) throw new Error("pi-chat chat root is already owned")
    const mode = requiredMode(host)
    const adapter = new NativeChatHost(mode)
    try {
      adapter.wrapNativeConstruction()
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
    this.byEntryId.clear()
    this.byComponent.clear()
    this.projections.clear()
    this.indexedIds = []
  }
}

type Bootstrap = { renderer: unknown; install(host: InteractiveMode): void }
const pending = new Set<Bootstrap>()
let descriptor: PropertyDescriptor | undefined

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
    Object.defineProperty(InteractiveMode.prototype, "renderSessionEntries", {
      ...descriptor,
      value: function (this: NativeMode, entries: Entry[], options?: unknown) {
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
      },
    })
  }
  return () => disarmHistoryBootstrap(token)
}

function disarmHistoryBootstrap(token: Bootstrap) {
  pending.delete(token)
  if (pending.size === 0 && descriptor) {
    Object.defineProperty(
      InteractiveMode.prototype,
      "renderSessionEntries",
      descriptor,
    )
    descriptor = undefined
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
