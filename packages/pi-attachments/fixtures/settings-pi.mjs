import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { thumbnailSettings } from "../src/settings.ts";
import { nativePi } from "./native-pi.mjs";

export function settingsPi(t, state = {}) {
  return nativePi(t, [], {
    ...state,
    attachments: false,
    extensionFactories: [
      (pi) => {
        const lifetime = new AbortController();
        const settings = thumbnailSettings(join(getAgentDir(), "pi-attachments"), lifetime.signal);
        pi.registerCommand("test-attachment-settings", {
          description: "Exercise attachment settings in native Pi",
          handler: (_args, ctx) => settings.show(ctx),
        });
        pi.on("session_shutdown", () => lifetime.abort());
      },
    ],
  });
}
