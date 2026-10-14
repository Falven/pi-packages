import assert from "node:assert/strict"
import test, { type TestContext } from "node:test"
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent"
import { openNativeHost } from "../../../fixtures/native-host.ts"

async function admissionProbe(
  t: TestContext,
  transition: "reload" | "remove" | "dispose",
  admission: "queued" | "timer" | "waitForIdle" = "queued",
  asynchronousSettlement = false,
) {
  let enabled = true
  let transitionQueued = false
  let generation = 0
  let delayedSettlement = false
  const events: string[] = []
  const host = await openNativeHost(t, {
    extensionFactories: [
      (pi) => {
        pi.registerCommand("admission-probe", {
          description: "Reload the admission probe",
          handler: async (_args, ctx) => {
            if (transition === "dispose") {
              await host.runtime.dispose()
              events.push("disposed")
            } else {
              if (transition === "remove") enabled = false
              await ctx.reload()
              events.push("reloaded")
            }
          },
        })
        pi.on("agent_settled", () => {
          if (transitionQueued) return
          transitionQueued = true
          pi.sendUserMessage("/admission-probe", {
            expandPromptTemplates: true,
          })
        })
      },
      (pi) => {
        if (!enabled) return
        const nonce = `admission-${++generation}`
        let disposed = false
        let queued = false
        let pending: NodeJS.Immediate | undefined
        let commandContext: ExtensionCommandContext | undefined
        pi.on("session_shutdown", () => {
          disposed = true
          events.push("shutdown")
          if (pending) {
            clearImmediate(pending)
            pending = undefined
            events.push("cancelled")
          }
        })
        pi.registerCommand("goal", {
          description: "Manage the goal",
          handler: async (args, ctx) => {
            if (args === "arm") {
              commandContext = ctx
              return
            }
            events.push("admission")
            if (disposed || args !== nonce) {
              events.push("rejected")
              return
            }
            pi.sendMessage(
              {
                customType: "goal-continuation",
                content: "Continue the current goal.",
                display: false,
              },
              { triggerTurn: true },
            )
          },
        })
        pi.on("agent_settled", async (_event, ctx) => {
          if (queued || disposed) return
          queued = true
          const admit = () => {
            pending = undefined
            if (disposed) return
            pi.sendUserMessage(`/goal ${nonce}`, {
              expandPromptTemplates: true,
            })
          }
          if (admission === "timer") pending = setImmediate(admit)
          else if (admission === "waitForIdle") {
            assert(commandContext)
            events.push(`idle:${ctx.isIdle()}`)
            await commandContext.waitForIdle()
            events.push("idle-resolved")
            admit()
          } else admit()
        })
      },
      (pi) => {
        if (!asynchronousSettlement) return
        pi.on("agent_settled", async () => {
          if (delayedSettlement) return
          delayedSettlement = true
          events.push("settling")
          await new Promise<void>((resolve) => setImmediate(resolve))
          events.push("settled")
        })
      },
    ],
  })

  if (admission === "waitForIdle") await host.session.prompt("/goal arm")
  await host.session.prompt("Start the admission probe")
  await new Promise<void>((resolve) => setImmediate(resolve))

  return { host, events }
}

test("probe: removing the extension delivers a queued admission command as user input", async (t) => {
  const { host, events } = await admissionProbe(t, "remove")

  assert.deepEqual(events, ["shutdown", "reloaded"])
  assert.equal(host.requests.length, 2)
  assert.deepEqual(host.requests[1]?.messages.at(-1), {
    role: "user",
    content: [{ type: "text", text: "/goal admission-1" }],
  })
})

test("probe: retaining reload rejects a stale goal admission", async (t) => {
  const { host, events } = await admissionProbe(t, "reload")

  assert.deepEqual(events, ["shutdown", "reloaded", "admission", "rejected"])
  assert.equal(host.requests.length, 1)
})

test("probe: ordinary disposal rejects a pending goal admission", async (t) => {
  const { host, events } = await admissionProbe(t, "dispose")

  assert.deepEqual(events, ["shutdown", "disposed", "admission", "rejected"])
  assert.equal(host.requests.length, 1)
})

test("probe: an extension-owned pending action is cancelled before removal", async (t) => {
  const { host, events } = await admissionProbe(t, "remove", "timer")

  assert.deepEqual(events, ["shutdown", "cancelled", "reloaded"])
  assert.equal(host.requests.length, 1)
})

test("probe: asynchronous settlement can enqueue the deferred admission before removal", async (t) => {
  const { host, events } = await admissionProbe(t, "remove", "timer", true)

  assert.deepEqual(events, ["settling", "settled", "shutdown", "reloaded"])
  assert.equal(host.requests.length, 2)
  assert.deepEqual(host.requests[1]?.messages.at(-1), {
    role: "user",
    content: [{ type: "text", text: "/goal admission-1" }],
  })
})

test("probe: waitForIdle resolves before asynchronous settlement completes", async (t) => {
  const { host, events } = await admissionProbe(
    t,
    "remove",
    "waitForIdle",
    true,
  )

  assert.deepEqual(events, [
    "idle:true",
    "idle-resolved",
    "settling",
    "settled",
    "shutdown",
    "reloaded",
  ])
  assert.equal(host.requests.length, 2)
  assert.deepEqual(host.requests[1]?.messages.at(-1), {
    role: "user",
    content: [{ type: "text", text: "/goal admission-1" }],
  })
})
