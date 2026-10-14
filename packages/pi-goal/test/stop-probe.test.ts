import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
  CustomEditor,
  VERSION,
  type ExtensionContext,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent"
import { openNativeHost } from "../../../fixtures/native-host.ts"
import attachments from "../../pi-attachments/src/index.ts"
import chat from "../../pi-chat/src/index.ts"
import composer from "../../pi-composer/src/index.ts"
import skills from "../../pi-skill-references/src/index.ts"

type EditorFactory = NonNullable<
  ReturnType<ExtensionContext["ui"]["getEditorComponent"]>
>
type StopEditor = ReturnType<EditorFactory> & {
  onEscape?: () => void
  isShowingAutocomplete(): boolean
}

// Feasibility probe: pause is controlled; editor dispatch and interruption are native.
function stopProbe(pause: () => Promise<void>) {
  const events: string[] = []
  let editor: StopEditor | undefined
  let installed: EditorFactory | undefined
  let previous: EditorFactory | undefined
  let nativeStop: (() => void) | undefined
  let wrappedStop: (() => void) | undefined
  let active = true
  let pauseStarted = 0
  let stopDelivered = 0

  const install = (ctx: ExtensionContext) => {
    if (
      ctx.mode !== "tui" ||
      (installed && ctx.ui.getEditorComponent() === installed)
    )
      return
    previous = ctx.ui.getEditorComponent()
    const base = previous
    installed = (tui, theme, keys) => {
      const next =
        base?.(tui, theme, keys) ?? new CustomEditor(tui, theme, keys)
      assert(
        "isShowingAutocomplete" in next &&
          typeof next.isShowingAutocomplete === "function",
        "The probe requires native autocomplete dispatch",
      )
      editor = next as StopEditor
      return next
    }
    ctx.ui.setEditorComponent(installed)
    assert(editor)
    // The native delegation is assigned after the factory returns.
    const original = editor.onEscape
    assert(original, "The host must wire native Stop before composition")
    nativeStop = original
    wrappedStop = () => {
      if (!active || ctx.isIdle()) {
        original()
        return
      }
      pauseStarted = performance.now()
      events.push("pause-start")
      let timeout: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          events.push("pause-timeout")
          resolve()
        }, 500)
      })
      void Promise.race([Promise.resolve().then(pause), deadline])
        .catch(() => {
          events.push("pause-error")
        })
        .finally(() => {
          clearTimeout(timeout)
          if (!active) return
          stopDelivered = performance.now()
          events.push("native-stop")
          original()
        })
    }
    editor.onEscape = wrappedStop
  }

  const extension: ExtensionFactory = (pi) => {
    // Every session_start owner has installed its editor before this boundary.
    pi.on("before_agent_start", (_event, ctx) => install(ctx))
    pi.on("agent_settled", () => {
      events.push("settled")
    })
    pi.on("session_shutdown", (_event, ctx) => {
      active = false
      if (editor && editor.onEscape === wrappedStop) {
        if (nativeStop) editor.onEscape = nativeStop
        else delete editor.onEscape
      }
      if (installed && ctx.ui.getEditorComponent() === installed)
        ctx.ui.setEditorComponent(previous)
    })
  }
  return {
    extension,
    events,
    get editor() {
      assert(editor)
      return editor
    },
    get elapsed() {
      return stopDelivered - pauseStarted
    },
  }
}

const companions = [composer, attachments, chat, skills]

for (const order of ["native", "first", "last"] as const) {
  for (const remapped of [false, true]) {
    test(`Stop dispatch: ${order}, ${remapped ? "remapped" : "default"}`, async (t) => {
      const probe = stopProbe(async () => {
        probe.events.push("pause-done")
      })
      const host = await openNativeHost(t, {
        noTools: "all",
        holdResponses: true,
        keybindings: remapped ? { "app.interrupt": "ctrl+shift+k" } : {},
        extensionFactories:
          order === "native"
            ? [probe.extension]
            : order === "first"
              ? [probe.extension, ...companions]
              : [...companions, probe.extension],
      })
      t.diagnostic(`Runtime ${VERSION}; ${order}`)
      await writeFile(join(host.directory, "probe-note.md"), "Probe note")
      await host.type("Keep working")
      await host.key("\r")
      await t.waitFor(() => assert.equal(host.requests.length, 1))
      assert.equal(host.session.isStreaming, true)
      if (order !== "native") {
        await host.key("\x1b[122;9u")
        assert.equal(host.ui.getEditorText(), "Keep working")
        await host.key("\x1b[122;10u")
        assert.equal(host.ui.getEditorText(), "")
      }

      await host.type("@probe-")
      await t.waitFor(() => assert(probe.editor.isShowingAutocomplete()))
      await host.key("\x1b")
      assert.equal(probe.editor.isShowingAutocomplete(), false)
      assert.deepEqual(probe.events, [])
      assert.equal(host.session.isStreaming, true)
      host.ui.setEditorText("")

      const stopKey = remapped ? "\x1b[107;6u" : "\x1b"
      const overlay = host.ui.custom<void>(
        (_tui, _theme, keys, done) => ({
          render: () => ["Stop probe overlay"],
          invalidate() {},
          handleInput(data: string) {
            if (keys.matches(data, "app.interrupt")) done()
          },
        }),
        { overlay: true },
      )
      assert.match(await host.frame(), /Stop probe overlay/)
      await host.key(stopKey)
      await overlay
      assert.deepEqual(probe.events, [])
      assert.equal(host.session.isStreaming, true)

      if (remapped) {
        await host.key("\x1b")
        assert.deepEqual(probe.events, [])
        assert.equal(host.session.isStreaming, true)
      }
      await host.key(stopKey)
      await t.waitFor(() => assert(probe.events.includes("settled")))
      assert.deepEqual(probe.events, [
        "pause-start",
        "pause-done",
        "native-stop",
        "settled",
      ])
      assert.equal(host.session.isStreaming, false)
      assert.equal(host.requests.length, 1)
      assert(probe.elapsed < 500)
    })
  }
}

for (const outcome of ["throw", "failure", "timeout"] as const) {
  test(`Native interruption survives pause ${outcome}`, async (t) => {
    const probe = stopProbe(() => {
      if (outcome === "throw") throw new Error("Controlled pause failure")
      return outcome === "failure"
        ? Promise.reject(new Error("Controlled pause failure"))
        : new Promise<void>(() => {})
    })
    const host = await openNativeHost(t, {
      noTools: "all",
      holdResponses: true,
      extensionFactories: [...companions, probe.extension],
    })
    await host.type("Keep working")
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    await host.key("\x1b")
    await t.waitFor(() => assert(probe.events.includes("settled")))
    assert.deepEqual(probe.events, [
      "pause-start",
      outcome === "timeout" ? "pause-timeout" : "pause-error",
      "native-stop",
      "settled",
    ])
    assert.equal(host.session.isStreaming, false)
    assert.equal(host.requests.length, 1)
    if (outcome === "timeout") assert(probe.elapsed >= 490)
    assert(probe.elapsed < 750, "The 500 ms timer must release native Stop")
    t.diagnostic(`Native Stop delivered after ${probe.elapsed.toFixed(1)} ms`)
  })
}

test("A raw session abort does not request a pause", async (t) => {
  const probe = stopProbe(async () => {
    assert.fail("Only native Stop may request a pause")
  })
  const host = await openNativeHost(t, {
    noTools: "all",
    holdResponses: true,
    extensionFactories: [probe.extension, ...companions],
  })
  await host.type("Keep working")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  await host.session.abort()
  await t.waitFor(() => assert(probe.events.includes("settled")))
  assert.deepEqual(probe.events, ["settled"])
})

for (const remapped of [false, true]) {
  test(`Stop cancels native retry: ${remapped ? "remapped" : "default"}`, async (t) => {
    const probe = stopProbe(async () => {
      probe.events.push("pause-done")
    })
    const host = await openNativeHost(t, {
      noTools: "all",
      responseStatus: 503,
      keybindings: remapped ? { "app.interrupt": "ctrl+shift+k" } : {},
      settings: {
        retry: {
          enabled: true,
          maxRetries: 1,
          baseDelayMs: 30_000,
          maxAgentDelayMs: 30_000,
          provider: { maxRetries: 0 },
        },
      },
      extensionFactories: [probe.extension, ...companions],
    })
    let retryError: string | undefined
    host.session.subscribe((event) => {
      if (event.type === "auto_retry_end") retryError = event.finalError
    })
    await host.type("Keep working")
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.session.isRetrying, true))
    await host.key(remapped ? "\x1b[107;6u" : "\x1b")
    await t.waitFor(() => assert(probe.events.includes("settled")))
    assert.equal(retryError, "Retry cancelled")
    assert.equal(host.requests.length, 1)
    assert.deepEqual(probe.events, [
      "pause-start",
      "pause-done",
      "native-stop",
      "settled",
    ])
  })

  test(`Stop cancels native compaction: ${remapped ? "remapped" : "default"}`, async (t) => {
    const probe = stopProbe(async () => {
      probe.events.push("pause-done")
    })
    const host = await openNativeHost(t, {
      noTools: "all",
      holdResponses: true,
      keybindings: remapped ? { "app.interrupt": "ctrl+shift+k" } : {},
      settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
      extensionFactories: [...companions, probe.extension],
    })
    /* eslint-disable no-await-in-loop -- Complete each real turn before starting the next. */
    for (let turn = 1; turn <= 2; turn++) {
      await host.type(`Working turn ${turn}`)
      await host.key("\r")
      await t.waitFor(() => assert.equal(host.requests.length, turn))
      host.reply()
      await t.waitFor(() => assert.equal(probe.events.length, turn))
    }
    /* eslint-enable no-await-in-loop */
    assert.deepEqual(probe.events.splice(0), ["settled", "settled"])
    let compactionAborted = false
    host.session.subscribe((event) => {
      if (event.type === "compaction_end") compactionAborted = event.aborted
    })
    const compaction = assert.rejects(host.session.compact(), /cancel|abort/i)
    await t.waitFor(() => assert.equal(host.requests.length, 3))
    assert.equal(host.session.isCompacting, true)
    await host.key(remapped ? "\x1b[107;6u" : "\x1b")
    await compaction
    assert.equal(compactionAborted, true)
    assert.equal(host.session.isCompacting, false)
    assert.equal(host.requests.length, 3)
    assert.deepEqual(probe.events, ["pause-start", "pause-done", "native-stop"])
  })
}

const replacementEditor: EditorFactory = (tui, theme, keys) =>
  new CustomEditor(tui, theme, keys)

test("Shutdown preserves a later editor owner and suppresses delayed Stop", async (t) => {
  let finishPause: (() => void) | undefined
  const probe = stopProbe(
    () => new Promise<void>((resolve) => (finishPause = resolve)),
  )
  let shutdownFactory: EditorFactory | undefined
  const host = await openNativeHost(t, {
    noTools: "all",
    holdResponses: true,
    extensionFactories: [
      ...companions,
      probe.extension,
      (pi) => {
        pi.on("session_shutdown", (_event, ctx) => {
          shutdownFactory = ctx.ui.getEditorComponent()
        })
      },
    ],
  })
  await host.type("Keep working")
  await host.key("\r")
  await t.waitFor(() => assert.equal(host.requests.length, 1))
  const oldEditor = probe.editor
  const oldHandler = oldEditor.onEscape
  await host.key("\x1b")
  assert(finishPause)
  host.ui.setEditorComponent(replacementEditor)
  await host.close()
  assert.equal(shutdownFactory, replacementEditor)
  assert.notEqual(oldEditor.onEscape, oldHandler)
  finishPause()
  await new Promise(setImmediate)
  assert.deepEqual(probe.events, ["pause-start", "settled"])
  assert.equal(host.requests.length, 1)
})

for (const order of ["first", "last"] as const) {
  test(`Packaged editor composition: ${order}`, async (t) => {
    const probe = stopProbe(async () => {
      probe.events.push("pause-done")
    })
    const directory = await mkdtemp(join(tmpdir(), "goal-stop-probe-"))
    const key = Symbol.for(`goal-stop-probe:${randomUUID()}`)
    const registry = globalThis as Record<symbol, ExtensionFactory>
    registry[key] = probe.extension
    t.after(async () => {
      delete registry[key]
      await rm(directory, { recursive: true, force: true })
    })
    const probePath = join(directory, "probe.ts")
    await writeFile(
      probePath,
      `export default (pi) => globalThis[Symbol.for(${JSON.stringify(Symbol.keyFor(key))})](pi)`,
    )
    const companionPaths = [
      "pi-composer",
      "pi-attachments",
      "pi-chat",
      "pi-skill-references",
    ].map((name) =>
      fileURLToPath(new URL(`../../${name}/src/index.ts`, import.meta.url)),
    )
    const host = await openNativeHost(t, {
      noTools: "all",
      holdResponses: true,
      extensionPaths:
        order === "first"
          ? [probePath, ...companionPaths]
          : [...companionPaths, probePath],
    })
    await host.type("Keep working")
    await host.key("\r")
    await t.waitFor(() => assert.equal(host.requests.length, 1))
    await host.key("\x1b[122;9u")
    assert.equal(host.ui.getEditorText(), "Keep working")
    await host.key("\x1b[122;10u")
    assert.equal(host.ui.getEditorText(), "")
    await host.key("\x1b")
    await t.waitFor(() => assert(probe.events.includes("settled")))
    assert.deepEqual(probe.events, [
      "pause-start",
      "pause-done",
      "native-stop",
      "settled",
    ])
    assert.equal(host.requests.length, 1)
  })
}
