import type { TestContext } from "node:test"
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent"
import {
  openNativeHost,
  type NativeHostOptions,
} from "../../../fixtures/native-host.ts"

type HostOptions = NativeHostOptions & { composer?: ExtensionFactory }

export async function openHost(t: TestContext, options: HostOptions = {}) {
  const {
    composer,
    extensionFactories = [],
    extensionPaths = [],
    ...rest
  } = options
  return openNativeHost(t, {
    ...rest,
    noTools: "all",
    extensionFactories: [
      ...(composer ? [composer] : []),
      ...extensionFactories,
    ],
    extensionPaths: [
      ...(composer
        ? []
        : [new URL("../src/index.ts", import.meta.url).pathname]),
      ...extensionPaths,
    ],
  })
}
