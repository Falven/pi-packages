/* eslint-disable no-await-in-loop -- Parent identity must be discovered before inspecting its parent. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { chmod, chown, lstat, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { ghosttyContextProbe } from "./ghostty-context.ts";

const begin = "# BEGIN pi-composer keybindings";
const end = "# END pi-composer keybindings";
const bindings = [
  "super+a=csi:97;9u",
  "super+enter=csi:13;9u",
  "super+arrow_up=csi:1;9A",
  "super+arrow_down=csi:1;9B",
  "super+z=csi:122;9u",
  "super+shift+z=csi:122;10u",
  "shift+page_up=csi:5;2~",
  "shift+page_down=csi:6;2~",
];
const shortcuts =
  "Cmd+A, Cmd+Enter, Cmd+Up, Cmd+Down, Cmd+Z, Cmd+Shift+Z, Shift+Fn+Up, Shift+Fn+Down";

async function execute(pi: ExtensionAPI, command: string, args: string[]) {
  const result = await pi.exec(command, args, { timeout: 5000 });
  if (result.code !== 0 || result.killed)
    throw new Error(`Verification failed: ${command} ${args[0] ?? ""}`);
  return result.stdout;
}

async function context(pi: ExtensionAPI, requireUsLayout: boolean) {
  if (process.platform !== "darwin" || process.env["CFFIXED_USER_HOME"] !== undefined)
    throw new Error("Ghostty setup verification is unavailable for this process context");
  const home = homedir();
  const xdg = process.env["XDG_CONFIG_HOME"] ?? null;
  if (
    !isAbsolute(home) ||
    process.env["HOME"] !== home ||
    (xdg !== null && (!xdg || !isAbsolute(xdg)))
  )
    throw new Error("Ghostty setup verification is unavailable for this HOME/XDG context");
  let pid = process.pid;
  let binary: string | undefined;
  for (let depth = 0; depth < 64 && pid > 1; depth++) {
    const row = (
      await execute(pi, "/bin/ps", ["-p", String(pid), "-o", "ppid=,uid=,comm="])
    ).trim();
    const match = /^(\d+)\s+(\d+)\s+(.+)$/.exec(row);
    if (!match) break;
    const path = match[3]!;
    if (isAbsolute(path) && path.endsWith("/Ghostty.app/Contents/MacOS/ghostty")) {
      if (Number(match[2]) !== process.getuid?.()) break;
      binary = path;
      break;
    }
    const parent = Number(match[1]);
    if (parent === pid) break;
    pid = parent;
  }
  if (!binary)
    throw new Error("Ghostty setup verification is unavailable: no same-user Ghostty ancestor");
  // Darwin procargs2 is unstable; refuse writes when its optional Python probe cannot prove context.
  const probe: unknown = JSON.parse(
    await execute(pi, "/usr/bin/python3", [
      "-c",
      ghosttyContextProbe,
      String(pid),
      JSON.stringify({ terminalBinary: binary, home, xdg }),
    ]),
  );
  if (!probe || typeof probe !== "object")
    throw new Error("Ghostty setup verification is unavailable: invalid process probe");
  const fields = probe as Record<string, unknown>;
  if (
    fields["schema"] !== 1 ||
    fields["pid"] !== pid ||
    fields["extraArgCount"] !== 0 ||
    fields["homeCount"] !== 1 ||
    ![
      "readable",
      "parseOk",
      "sameUid",
      "identityStable",
      "terminalBinaryMatchesPs",
      "procargsPathMatchesPs",
      "argv0MatchesExecutable",
      "homeMatchesExpected",
      "xdgMatchesExpected",
      "fixedHomeAbsent",
      "accountHomeMatchesExpected",
    ].every((field) => fields[field] === true)
  )
    throw new Error(
      "Ghostty setup verification is unavailable: runtime arguments or roots cannot be matched",
    );
  if (requireUsLayout && fields["usKeyboardLayout"] !== true)
    throw new Error(
      "Ghostty setup verification is unavailable: require the native U.S. keyboard layout and input source; other or unknown layouts need manual setup",
    );
  const version = await execute(pi, binary, ["+version"]);
  if (!/^Ghostty 1\.3\.1(?:\r?\n|$)/.test(version))
    throw new Error(
      "Ghostty setup verification is unavailable for this Ghostty version (verified: 1.3.1)",
    );
  return { pid, binary, home, xdg };
}

async function verifyPermissions(pi: ExtensionAPI, path: string) {
  const listing = await execute(pi, "/bin/ls", ["-lde", path]);
  if (listing[10] === "+" || /^\s*\d+:/m.test(listing))
    throw new Error(`Unsupported configuration permissions: ACL on ${path}; resolve it manually`);
  if (!/^-[rwxSsTt-]{9}[@ ] [^\n]+\n$/.test(listing))
    throw new Error(`Configuration permissions could not be verified: ${path}`);
}

async function sources(pi: ExtensionAPI, home: string, xdg: string | null) {
  const app = join(home, "Library/Application Support/com.mitchellh.ghostty");
  const xdgDirectory = join(xdg ?? join(home, ".config"), "ghostty");
  const paths = [
    join(xdgDirectory, "config"),
    join(xdgDirectory, "config.ghostty"),
    join(app, "config"),
    join(app, "config.ghostty"),
  ];
  const files = await Promise.all(
    paths.map(async (path) => {
      try {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.uid !== process.getuid?.())
          throw new Error(`Unsupported configuration file: ${path}`);
        await verifyPermissions(pi, path);
        const contents = await readFile(path);
        return { path, stat, contents };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    }),
  );
  const loaded = files.filter((file) => file !== null);
  if (loaded.length !== 1 || !files.slice(2).some(Boolean))
    throw new Error(
      "Ghostty setup verification is unavailable: require one Application Support configuration and no other default roots",
    );
  return { files, file: loaded[0]! };
}

function block(eol: string, finalNewline: boolean) {
  return `${eol}${begin}${eol}# pi-composer original-final-newline: ${finalNewline ? "yes" : "no"}${eol}${bindings.map((binding) => `keybind = ${binding}`).join(eol)}${eol}${end}${finalNewline ? eol : ""}`;
}

function managed(text: string) {
  const starts = [...text.matchAll(/BEGIN pi-composer keybindings/g)];
  const ends = [...text.matchAll(/END pi-composer keybindings/g)];
  if (!starts.length && !ends.length) return null;
  if (starts.length !== 1 || ends.length !== 1)
    throw new Error("Managed Ghostty block is changed or duplicated; resolve it manually");
  const index = text.indexOf(begin);
  const eol = text.slice(index - 2, index) === "\r\n" ? "\r\n" : "\n";
  for (const finalNewline of [true, false]) {
    const expected = block(eol, finalNewline);
    const start = index - eol.length;
    const tail = text.slice(start + expected.length);
    if (
      start >= 0 &&
      text.slice(start, start + expected.length) === expected &&
      (finalNewline || tail === "" || /^\r?\n/.test(tail))
    )
      return { start, length: expected.length };
  }
  throw new Error("Managed Ghostty block is changed or incomplete; resolve it manually");
}

export function setupKeybinds(pi: ExtensionAPI): void {
  pi.registerCommand("setup-keybinds", {
    description: "Review, install, or remove persistent terminal keybindings",
    handler: async (args, ctx) => {
      if (!/^ghostty(?:\s+remove)?$/.test(args.trim())) {
        ctx.ui.notify(
          "Usage: /setup-keybinds <terminal> [remove]\nSupported terminals: ghostty",
          "info",
        );
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify("Interactive confirmation is required. No settings changed.", "error");
        return;
      }
      let staging: string | undefined;
      let written = false;
      try {
        const removing = /\s+remove$/.test(args.trim());
        const initialContext = await context(pi, !removing);
        const initial = await sources(pi, initialContext.home, initialContext.xdg);
        await execute(pi, initialContext.binary, ["+validate-config"]);
        const config = await execute(pi, initialContext.binary, ["+show-config"]);
        if (/^config-file\s*=/m.test(config))
          throw new Error(
            "Ghostty setup verification is unavailable: configuration includes require manual resolution",
          );
        const effective = await execute(pi, initialContext.binary, ["+list-keybinds", "--plain"]);
        const text = initial.file.contents.toString("utf8");
        if (!Buffer.from(text).equals(initial.file.contents))
          throw new Error("Unsupported configuration encoding");
        const existing = managed(text);
        if (removing && !existing) {
          ctx.ui.notify("No managed Ghostty block is installed. No settings changed.", "info");
          return;
        }
        if (!removing) {
          if (/^key-remap[ \t]*=[ \t]*\S/m.test(config))
            throw new Error(
              "Ghostty setup verification is unavailable: modifier remapping changes shortcut matching; resolve it manually",
            );
          const physical =
            /^keybind = ((?:[^/\n=]+\/)?super\+(?:key_a|key_z|shift\+key_z))(?:=|>)/m.exec(
              effective,
            );
          if (physical)
            throw new Error(
              `Ghostty setup verification is unavailable: physical binding ${physical[1]} has priority over letter forwarding in ${initial.file.path}; resolve it manually`,
            );
        }
        if (!removing && existing) {
          const ineffective = bindings.find(
            (binding) => !effective.split(/\r?\n/).includes(`keybind = ${binding}`),
          );
          if (ineffective)
            throw new Error(
              `Managed binding ${ineffective.split("=")[0]} is not effective in ${initial.file.path}; resolve it manually`,
            );
          ctx.ui.notify("Ghostty keybindings are already installed. No settings changed.", "info");
          return;
        }
        const eol = text.includes("\r\n") ? "\r\n" : "\n";
        const proposed =
          removing && existing
            ? text.slice(0, existing.start) + text.slice(existing.start + existing.length)
            : text + block(eol, text.endsWith("\n"));
        staging = await mkdtemp(join(dirname(initial.file.path), ".pi-composer-keybindings-"));
        const candidate = join(staging, "config");
        await writeFile(candidate, proposed, {
          mode: initial.file.stat.mode & 0o7777,
        });
        await chown(candidate, initial.file.stat.uid, initial.file.stat.gid);
        await chmod(candidate, initial.file.stat.mode & 0o7777);
        await verifyPermissions(pi, candidate);
        await execute(pi, initialContext.binary, [
          "+validate-config",
          `--config-file=${candidate}`,
        ]);
        // Last-wins applies only after excluding higher-priority physical bindings.
        const confirmed = await ctx.ui.confirm(
          removing ? "Remove Ghostty keybindings" : "Set up Ghostty keybindings",
          `${initial.file.path}\n\n${shortcuts}\n\n${removing ? "Remove only the unmodified managed block." : "Install persistent forwarding for these eight shortcuts."} These bindings affect programs outside Pi until removal and Ghostty configuration reload. Pi keybindings are unchanged.`,
        );
        if (!confirmed) {
          ctx.ui.notify("Cancelled. No settings changed.", "info");
          return;
        }
        const currentContext = await context(pi, !removing);
        if (JSON.stringify(currentContext) !== JSON.stringify(initialContext))
          throw new Error("Ghostty context changed during review");
        const current = await sources(pi, initialContext.home, initialContext.xdg);
        if (
          current.files.some((file, index) => {
            const previous = initial.files[index];
            return file === null
              ? previous !== null
              : previous === null ||
                  previous === undefined ||
                  file.path !== previous.path ||
                  file.stat.ino !== previous.stat.ino ||
                  file.stat.dev !== previous.stat.dev ||
                  file.stat.uid !== previous.stat.uid ||
                  file.stat.gid !== previous.stat.gid ||
                  file.stat.mode !== previous.stat.mode ||
                  file.stat.ctimeMs !== previous.stat.ctimeMs ||
                  file.stat.mtimeMs !== previous.stat.mtimeMs ||
                  !file.contents.equals(previous.contents);
          })
        )
          throw new Error("Ghostty configuration changed during review");
        await rename(candidate, initial.file.path);
        written = true;
        ctx.ui.notify(
          `Ghostty keybindings ${removing ? "removed" : "installed"}. Reload Ghostty configuration with Cmd+Shift+, or its Reload Configuration menu action.`,
          "info",
        );
      } catch (error) {
        ctx.ui.notify(
          `${error instanceof Error ? error.message : String(error)}. ${written ? "Settings were written." : "No settings changed."}`,
          "error",
        );
      } finally {
        if (staging) {
          try {
            await rm(staging, { recursive: true, force: true });
          } catch (error) {
            ctx.ui.notify(`Could not remove temporary validation data: ${String(error)}`, "error");
          }
        }
      }
    },
  });
}
