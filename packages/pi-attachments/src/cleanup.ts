import { createHash } from "node:crypto";
import {
  constants,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type UnpublishedCapture = {
  directory: string;
  files: { name: string; data: string }[];
};

type UnusedFile = {
  name: string;
  size: number;
  checksum: string;
  stagedChecksum: string;
};

const marker = ".unused.json";
const requestName = /^request-[a-zA-Z0-9]+$/;
const imageName = /^input-image-[1-9]\d*(?:\.(?:png|jpeg|gif|webp|bmp))?$/;
const checksumPattern = /^[a-f0-9]{64}$/;
const noFollow = constants.O_RDONLY | constants.O_NOFOLLOW;

function checksum(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function checkDirectory(path: string, expected: Stats): void {
  const current = lstatSync(path);
  if (!current.isDirectory() || current.dev !== expected.dev || current.ino !== expected.ino)
    throw new Error(`Cleanup directory changed: ${path}`);
}

export function markUnused(
  storage: string,
  capture: UnpublishedCapture,
  replacement: string,
): void {
  if (
    !lstatSync(storage).isDirectory() ||
    !lstatSync(capture.directory).isDirectory() ||
    !lstatSync(replacement).isDirectory()
  )
    throw new Error(`Cleanup eligibility could not be saved: ${capture.directory}`);
  const files = capture.files.flatMap(({ name, data }) => {
    const path = join(capture.directory, name);
    if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) return [];
    const staged = readFileSync(path, { flag: noFollow });
    const saved = Buffer.from(data, "base64");
    if (!saved.subarray(0, staged.length).equals(staged)) return [];
    return [
      {
        name,
        size: saved.length,
        checksum: checksum(saved),
        stagedChecksum: checksum(staged),
      },
    ];
  });
  writeFileSync(
    join(capture.directory, marker),
    JSON.stringify({
      version: 1,
      replacement: basename(replacement),
      recoveryChecksum: checksum(
        readFileSync(join(replacement, "request.draft.md"), { flag: noFollow }),
      ),
      files,
    }),
    { flag: "wx", mode: 0o600, flush: true },
  );
}

export function registerCleanup(pi: ExtensionAPI, storage: string): void {
  pi.registerCommand("attachments-cleanup", {
    description: "Reclaim unused attachment staging; retain snapshots and recovery",
    handler: async (_args, ctx) => {
      let files = 0;
      let bytes = 0;
      const errors: string[] = [];
      try {
        const storageInfo = lstatSync(storage);
        if (!storageInfo.isDirectory())
          throw new Error(`Attachment storage is not a directory: ${storage}`);
        const root = realpathSync(storage);
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          if (!entry.isDirectory() || !requestName.test(entry.name)) continue;
          const directory = join(root, entry.name);
          try {
            checkDirectory(storage, storageInfo);
            const directoryInfo = lstatSync(directory);
            if (!directoryInfo.isDirectory()) continue;
            if (!lstatSync(join(directory, marker)).isFile()) continue;
            const proof = readFileSync(join(directory, marker), {
              encoding: "utf8",
              flag: noFollow,
            });
            checkDirectory(storage, storageInfo);
            checkDirectory(directory, directoryInfo);
            const record = JSON.parse(proof);
            if (
              record?.version !== 1 ||
              typeof record.replacement !== "string" ||
              !requestName.test(record.replacement) ||
              record.replacement === entry.name ||
              typeof record.recoveryChecksum !== "string" ||
              !checksumPattern.test(record.recoveryChecksum) ||
              !Array.isArray(record.files) ||
              !record.files.every(
                (file: UnusedFile) =>
                  file &&
                  typeof file.name === "string" &&
                  imageName.test(file.name) &&
                  Number.isSafeInteger(file.size) &&
                  file.size >= 0 &&
                  typeof file.checksum === "string" &&
                  checksumPattern.test(file.checksum) &&
                  typeof file.stagedChecksum === "string" &&
                  checksumPattern.test(file.stagedChecksum),
              )
            )
              throw new Error(`Unrecognized cleanup eligibility: ${directory}`);
            const names = new Set(record.files.map((file: { name: string }) => file.name));
            // Unknown files and every readable or partial recovery record stay protected.
            if (readdirSync(directory).some((name) => name !== marker && !names.has(name)))
              continue;
            const replacement = join(root, record.replacement);
            if (!lstatSync(replacement).isDirectory()) continue;
            if (!lstatSync(join(replacement, "request.draft.md")).isFile()) continue;
            if (
              checksum(
                readFileSync(join(replacement, "request.draft.md"), {
                  flag: noFollow,
                }),
              ) !== record.recoveryChecksum
            )
              continue;
            if (
              !record.files.every((file: UnusedFile) => {
                const path = join(replacement, file.name);
                const saved = lstatSync(path);
                return (
                  saved.isFile() &&
                  saved.size === file.size &&
                  checksum(readFileSync(path, { flag: noFollow })) === file.checksum
                );
              })
            )
              continue;
            for (const file of record.files) {
              checkDirectory(storage, storageInfo);
              checkDirectory(directory, directoryInfo);
              const path = join(directory, file.name);
              const contents = lstatSync(path, { throwIfNoEntry: false });
              if (!contents) continue;
              if (!contents.isFile() || contents.nlink !== 1 || contents.size > file.size) continue;
              if (checksum(readFileSync(path, { flag: noFollow })) !== file.stagedChecksum)
                continue;
              if (
                readFileSync(join(directory, marker), {
                  encoding: "utf8",
                  flag: noFollow,
                }) !== proof
              )
                throw new Error(`Cleanup eligibility changed: ${directory}`);
              checkDirectory(storage, storageInfo);
              checkDirectory(directory, directoryInfo);
              unlinkSync(path);
              files++;
              bytes += contents.size;
            }
            checkDirectory(storage, storageInfo);
            checkDirectory(directory, directoryInfo);
            if (readdirSync(directory).length === 1) {
              unlinkSync(join(directory, marker));
              rmdirSync(directory);
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT")
              errors.push(`${directory}: ${String(error)}`);
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") errors.push(String(error));
      }
      ctx.ui.notify(
        `Attachment cleanup: removed ${files} file${files === 1 ? "" : "s"} (${bytes} bytes); ${errors.length} failure${errors.length === 1 ? "" : "s"}. Snapshots and uncertain data retained.${errors.length ? `\n${errors.join("\n")}` : ""}`,
        errors.length ? "error" : "info",
      );
    },
  });
}
