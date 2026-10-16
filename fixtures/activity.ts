import { createHash } from "node:crypto"

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")

// Independent publisher of the documented wire format, without a runtime package.
export function activityDetails<T>(
  update: T,
  content: readonly (
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  )[],
  imageOwners: (string | null)[] = content
    .filter((part) => part.type === "image")
    .map(() => null),
) {
  return {
    activity: {
      update,
      imageOwners,
      contentHash: hash(
        content.map((part) =>
          part.type === "image" ? { type: "image" } : part,
        ),
      ),
      activityHash: hash({ update, imageOwners }),
    },
  }
}
