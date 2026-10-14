import assert from "node:assert/strict"
import type { TestContext } from "node:test"
import type { EditorComponent } from "@earendil-works/pi-tui"
import {
  openNativeHost,
  type NativeHostOptions,
} from "../../../fixtures/native-host.ts"
import {
  registerEditor,
  type AttachmentEditorAccess,
  type AttachmentSubmission,
} from "../../pi-attachments/src/editor.ts"

type Options = NativeHostOptions & {
  composer?: boolean
  prepare?: (request: AttachmentSubmission) => Promise<string>
  hasPending?: (identity: object) => boolean
}

export async function openAttachmentEditor(
  t: TestContext,
  options: Options = {},
) {
  const {
    composer = true,
    prepare,
    hasPending,
    extensionFactories = [],
    extensionPaths = [],
    ...rest
  } = options
  let access: AttachmentEditorAccess | undefined
  let editor: EditorComponent | undefined
  const origins: string[] = []
  const host = await openNativeHost(t, {
    ...rest,
    noTools: "all",
    extensionFactories,
    extensionPaths: [
      ...(composer
        ? [new URL("../src/index.ts", import.meta.url).pathname]
        : []),
      ...extensionPaths,
    ],
    extension: (pi) => {
      const lifetime = new AbortController()
      pi.on("session_shutdown", () => lifetime.abort())
      registerEditor(pi, lifetime.signal, {
        attach(selectedEditor, selected) {
          access = selected
          editor = selectedEditor
          return () => {
            if (access === selected) {
              access = undefined
              editor = undefined
            }
          }
        },
        change(_editor, _ctx, origin) {
          origins.push(origin ?? "edit")
        },
        prepare: prepare ?? (async (request) => request.text),
        hasPending: hasPending ?? (() => false),
      })
    },
  })
  await t.waitFor(() => assert.ok(access))
  return {
    ...host,
    origins,
    get editor(): EditorComponent {
      assert.ok(editor)
      return editor
    },
    get access(): AttachmentEditorAccess {
      assert.ok(access)
      return access
    },
  }
}
