import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type ExtensionContext,
  getSettingsListTheme,
  truncateToVisualLines,
} from "@earendil-works/pi-coding-agent";
import { SettingsList } from "@earendil-works/pi-tui";

const sizes = { Small: "small", Medium: "medium", Large: "large" } as const;
export type ThumbnailSize = (typeof sizes)[keyof typeof sizes];

function readSettings(path: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Expected a settings object");
    return value as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Could not read attachment settings ${path}: ${String(error)}`, {
      cause: error,
    });
  }
}

function thumbnailSize(value: unknown, path: string): ThumbnailSize {
  if (value === "small" || value === "medium" || value === "large") return value;
  throw new Error(`Invalid thumbnail size in ${path}: expected small, medium, or large`);
}

export function thumbnailSettings(storage: string, signal: AbortSignal) {
  // Mutable preferences must stay outside the immutable snapshot directory.
  const directory = dirname(storage);
  const path = join(directory, "pi-attachments.json");
  let size: ThumbnailSize = "medium";
  function save(value: ThumbnailSize) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.pi-attachments-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, `${JSON.stringify({ thumbnailSize: value }, null, 2)}\n`, {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
      renameSync(temporary, path);
      size = value;
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  const saved = readSettings(path);
  if (saved) {
    if (saved["thumbnailSize"] !== undefined) size = thumbnailSize(saved["thumbnailSize"], path);
  } else {
    // Migrate only the prior user preference; Pi's settings stay untouched.
    const legacyPath = join(directory, "settings.json");
    const legacy = readSettings(legacyPath)?.["extensionSettings"];
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
      const value = (legacy as Record<string, unknown>)["pi-attachments.thumbnailSize"];
      if (value !== undefined) save(thumbnailSize(value, legacyPath));
    }
  }
  const label = () => size.charAt(0).toUpperCase() + size.slice(1);
  return {
    get size() {
      return size;
    },
    show(ctx: ExtensionContext): Promise<void> {
      return ctx.ui.custom<void>(
        (tui, theme, _keybindings, done) => {
          const close = () => done();
          signal.addEventListener("abort", close, { once: true });
          const list = new SettingsList(
            [
              {
                id: "thumbnailSize",
                label: "Attachment thumbnail size",
                description: "Maximum width and height of attachment previews",
                currentValue: label(),
                values: Object.keys(sizes),
              },
            ],
            1,
            getSettingsListTheme(),
            (id, value) => {
              try {
                save(sizes[value as keyof typeof sizes]);
              } catch (error) {
                list.updateValue(id, label());
                ctx.ui.notify(`Could not save attachment settings: ${String(error)}`, "error");
              }
            },
            close,
          );
          return {
            render(width) {
              return [
                ...truncateToVisualLines(theme.fg("accent", "Attachment settings"), 1, width)
                  .visualLines,
                ...list.render(width),
              ];
            },
            handleInput(data) {
              list.handleInput(data);
              tui.requestRender();
            },
            handleMouse(event) {
              return list.handleMouse({ ...event, y: event.y - 1 });
            },
            invalidate() {
              list.invalidate();
            },
            dispose() {
              signal.removeEventListener("abort", close);
            },
          };
        },
        { overlay: true },
      );
    },
  };
}
