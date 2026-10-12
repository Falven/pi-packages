import assert from "node:assert/strict"
import { once } from "node:events"
import { existsSync } from "node:fs"
import { appendFile, mkdir, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { convertToPng } from "@earendil-works/pi-coding-agent"

assert(process.argv[2], "Pass a temporary acceptance directory")
const directory = resolve(process.argv[2])
const agent = join(directory, "agent")
const files = join(directory, "files")
await Promise.all(
  [agent, files, join(directory, "sessions")].map((path) =>
    mkdir(path, { recursive: true }),
  ),
)
await writeFile(
  join(agent, "settings.json"),
  JSON.stringify({
    quietStartup: true,
    theme: "dark",
    retry: { enabled: false },
    compaction: { enabled: false },
  }),
)
await writeFile(
  join(agent, "keybindings.json"),
  JSON.stringify({
    "app.session.new": "ctrl+alt+n",
    "app.session.resume": "ctrl+alt+r",
  }),
)
await Promise.all(
  [
    ["review", "Review the combined request exactly once."],
    ["audit", "Audit the captured context exactly once."],
    ["literal", "Literal code must not invoke these instructions."],
  ].map(async ([name, body]) => {
    const path = join(directory, "skills", name)
    await mkdir(path, { recursive: true })
    await writeFile(
      join(path, "SKILL.md"),
      `---\nname: ${name}\ndescription: Mixed ${name} acceptance\n---\n${body}\n`,
    )
  }),
)
const long =
  "Attached /skill:audit and /skill:audit.\n\n```text\n\t/skill:literal\n```\n"
await Promise.all(
  Object.entries({
    "small-4999.txt": "Small /skill:review\n".padEnd(4999, "s"),
    "large-5000.txt": long.padEnd(5000, "L"),
    "large-5001.txt": long.padEnd(5001, "L"),
    "short.txt": "Short /skill:audit\n",
    "copied notes.txt": "Captured file /skill:literal\n",
    "current source.md": "Current source version one\n",
    "draft.md": [
      "# Mixed request",
      "",
      '**Apply** /skill:review to @"current source.md".',
      "",
      "- [ ] Check the captured context",
      "> Keep this quoted context.",
      "",
      "```ts",
      'const literal = "/skill:literal";',
      "```",
      "",
      "Final prose to select and replace.",
    ].join("\n"),
    "scroll.md": Array.from(
      { length: 40 },
      (_, index) => `**Row ${String(index).padStart(2, "0")}** é 👩‍💻 界`,
    ).join("\n"),
  }).map(([name, contents]) => writeFile(join(files, name), contents)),
)
const bitmap = Buffer.alloc(54 + 320 * 160 * 3)
bitmap.write("BM")
bitmap.writeUInt32LE(bitmap.length, 2)
bitmap.writeUInt32LE(54, 10)
bitmap.writeUInt32LE(40, 14)
bitmap.writeInt32LE(320, 18)
bitmap.writeInt32LE(160, 22)
bitmap.writeUInt16LE(1, 26)
bitmap.writeUInt16LE(24, 28)
for (let pixel = 0; pixel < 320 * 160; pixel++) {
  bitmap[54 + pixel * 3 + (pixel % 320 < 160 ? 2 : 0)] = 255
}
const png = await convertToPng(bitmap.toString("base64"), "image/bmp")
assert(png, "Pi must convert the acceptance image")
await writeFile(join(files, "red blue.png"), Buffer.from(png.data, "base64"))

let sequence = 0
const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404).end()
    return
  }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const payload = JSON.parse(Buffer.concat(chunks).toString())
  const number = ++sequence
  await appendFile(
    join(directory, "requests.jsonl"),
    JSON.stringify(payload) + "\n",
  )
  await writeFile(
    join(directory, `request-${number}.json`),
    JSON.stringify(payload, null, 2),
  )
  // The second terminal controls a real pending HTTP response or HTTP 500.
  while (existsSync(join(directory, "model.hold")) && !response.destroyed) {
    // oxlint-disable-next-line no-await-in-loop -- Release follows the user's acceptance action.
    await delay(100)
  }
  if (response.destroyed) return
  if (existsSync(join(directory, "model.fail"))) {
    response.writeHead(500, { "content-type": "application/json" })
    response.end(
      JSON.stringify({ error: { message: "Acceptance model failure" } }),
    )
    return
  }
  const user = payload.messages.findLast((message) => message.role === "user")
  const parts = Array.isArray(user.content)
    ? user.content
    : [{ type: "text", text: user.content }]
  const text = parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
  const images = parts.filter((part) => part.type === "image_url").length
  const skills = ["review", "audit", "literal"]
    .map((name) => `${name}=${text.split(`<skill name="${name}"`).length - 1}`)
    .join(", ")
  response.writeHead(200, { "content-type": "text/event-stream" })
  response.end(
    `data: ${JSON.stringify({
      id: `acceptance-${number}`,
      object: "chat.completion.chunk",
      model: "mixed-acceptance",
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content: `Local request ${number}: images=${images}; ${skills}.`,
          },
          finish_reason: "stop",
        },
      ],
    })}\n\ndata: [DONE]\n\n`,
  )
})
server.listen(0, "127.0.0.1")
await once(server, "listening")
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`
await writeFile(
  join(agent, "models.json"),
  JSON.stringify({
    providers: {
      ticket22: {
        baseUrl,
        api: "openai-completions",
        apiKey: "local-acceptance-only",
        models: [
          {
            id: "mixed-acceptance",
            input: ["text", "image"],
            contextWindow: 128000,
            maxTokens: 100,
          },
        ],
      },
    },
  }),
)
await writeFile(join(directory, "ready.json"), JSON.stringify({ baseUrl }))
process.stdout.write(`Local acceptance model ready: ${directory}\n`)
