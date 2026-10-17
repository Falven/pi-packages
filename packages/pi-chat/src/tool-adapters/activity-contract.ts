import { createHash } from "node:crypto";

export const activityType = "pi.activity";

export type ActivityStatus = "running" | "completed" | "failed" | "unknown" | "unattempted";

export type ActivityFile = {
  id: string;
  path: string;
  status: ActivityStatus;
  args?: Record<string, unknown>;
  changes?: { added: number; removed: number };
  output?: string;
  outputOmitted?: boolean;
};

export type ActivityOperation = {
  id: string;
  order: number;
  revision: number;
  status: ActivityStatus;
  cwd?: string;
  args?: Record<string, unknown>;
  output?: string;
  outputOmitted?: boolean;
} & (
  | { kind: "command"; commands: string[]; shell?: string[] }
  | { kind: "edit"; path?: string; files?: ActivityFile[] }
  | { kind: "image"; path?: string }
  | { kind: "tool"; name: string }
  | { kind: "output" }
);

export type ActivityUpdate = {
  version: 1;
  id: string;
  callId: string;
  sessionId: string;
  revision: number;
  operations: ActivityOperation[];
};

type Content = readonly (
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
)[];

export type ActivityDetails = {
  activity: {
    update: ActivityUpdate;
    imageOwners: (string | null)[];
    contentHash: string;
    activityHash: string;
  };
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const optionalString = (value: unknown) => value === undefined || typeof value === "string";
const statuses = new Set<ActivityStatus>([
  "running",
  "completed",
  "failed",
  "unknown",
  "unattempted",
]);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function contentHash(content: Content, nativeHints = false): string {
  return hash(
    content.flatMap((part, index) => {
      if (part.type === "image") return [{ type: "image" }];
      // Pi may append conversion/resize hints immediately after a processed image.
      if (
        nativeHints &&
        content[index - 1]?.type === "image" &&
        /^(?:\[Image converted from [\w/+.-]+ to [\w/+.-]+\.\](?:\n|$))(?:\[Image: original \d+x\d+, displayed at \d+x\d+\. Multiply coordinates by \d+\.\d+ to map to original image\.\])?$|^\[Image: original \d+x\d+, displayed at \d+x\d+\. Multiply coordinates by \d+\.\d+ to map to original image\.\]$/.test(
          part.text,
        )
      )
        return [];
      return [part];
    }),
  );
}

function body(value: Record<string, unknown>): boolean {
  return (
    optionalString(value["output"]) &&
    (value["outputOmitted"] === undefined || typeof value["outputOmitted"] === "boolean") &&
    (value["args"] === undefined || object(value["args"]))
  );
}

function file(value: unknown): value is ActivityFile {
  if (
    !object(value) ||
    !id(value["id"]) ||
    !id(value["path"]) ||
    !statuses.has(value["status"] as ActivityStatus) ||
    !body(value)
  )
    return false;
  const changes = value["changes"];
  return (
    changes === undefined ||
    (object(changes) && integer(changes["added"]) && integer(changes["removed"]))
  );
}

function operation(value: unknown): value is ActivityOperation {
  if (
    !object(value) ||
    !id(value["id"]) ||
    !integer(value["order"]) ||
    !integer(value["revision"]) ||
    !statuses.has(value["status"] as ActivityStatus) ||
    !optionalString(value["cwd"]) ||
    !body(value)
  )
    return false;
  switch (value["kind"]) {
    case "command":
      return (
        Array.isArray(value["commands"]) &&
        value["commands"].length > 0 &&
        value["commands"].every((command) => typeof command === "string") &&
        (value["shell"] === undefined ||
          (Array.isArray(value["shell"]) &&
            id(value["shell"][0]) &&
            value["shell"].every((word) => typeof word === "string")))
      );
    case "edit": {
      const files = value["files"];
      return (
        optionalString(value["path"]) &&
        (files === undefined ||
          (Array.isArray(files) &&
            files.every(file) &&
            new Set(files.map((item) => item.id)).size === files.length))
      );
    }
    case "image":
      return optionalString(value["path"]);
    case "tool":
      return id(value["name"]);
    case "output":
      return true;
    default:
      return false;
  }
}

export function readActivityUpdate(value: unknown): ActivityUpdate | undefined {
  if (
    !object(value) ||
    value["version"] !== 1 ||
    !id(value["id"]) ||
    !id(value["callId"]) ||
    !id(value["sessionId"]) ||
    !integer(value["revision"]) ||
    !Array.isArray(value["operations"]) ||
    !value["operations"].every(operation)
  )
    return;
  const operations = value["operations"];
  const revision = value["revision"];
  if (
    operations.some((item) => item.revision > revision) ||
    new Set(operations.map((item) => item.id)).size !== operations.length
  )
    return;
  return value as ActivityUpdate;
}

function owners(
  update: ActivityUpdate,
  content: Content,
  value: unknown,
): value is (string | null)[] {
  const ids = new Set(update.operations.map((item) => item.id));
  return (
    Array.isArray(value) &&
    value.length === content.filter((part) => part.type === "image").length &&
    value.every((owner) => owner === null || (typeof owner === "string" && ids.has(owner)))
  );
}

export function readActivity(result: {
  content: Content;
  details?: unknown;
}): ActivityDetails["activity"] | undefined {
  if (!object(result.details) || !object(result.details["activity"])) return;
  const data = result.details["activity"];
  const update = readActivityUpdate(data["update"]);
  if (!update || !owners(update, result.content, data["imageOwners"])) return;
  try {
    if (
      data["activityHash"] !== hash({ update, imageOwners: data["imageOwners"] }) ||
      (data["contentHash"] !== contentHash(result.content) &&
        data["contentHash"] !== contentHash(result.content, true))
    )
      return;
  } catch {
    // Metadata that cannot represent JSON facts is not a presentation contract.
    return;
  }
  return data as ActivityDetails["activity"];
}
