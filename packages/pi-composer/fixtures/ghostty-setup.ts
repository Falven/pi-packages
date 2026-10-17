import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import piComposer from "../src/index.ts";
import { openHost } from "./host.ts";

export const forwarding = [
  "keybind = super+a=csi:97;9u",
  "keybind = super+enter=csi:13;9u",
  "keybind = super+arrow_up=csi:1;9A",
  "keybind = super+arrow_down=csi:1;9B",
  "keybind = super+z=csi:122;9u",
  "keybind = super+shift+z=csi:122;10u",
  "keybind = shift+page_up=csi:5;2~",
  "keybind = shift+page_down=csi:6;2~",
].join("\n");

export async function setupHost(
  t: TestContext,
  contents: string,
  name = "config",
  extensionFactories: ExtensionFactory[] = [],
) {
  const directory = await mkdtemp(join(tmpdir(), "pi-composer-ghostty-test-"));
  const previousPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "darwin" });
  const previousHome = process.env["HOME"];
  const previousXdg = process.env["XDG_CONFIG_HOME"];
  const previousFixedHome = process.env["CFFIXED_USER_HOME"];
  process.env["HOME"] = directory;
  delete process.env["XDG_CONFIG_HOME"];
  delete process.env["CFFIXED_USER_HOME"];
  try {
    const app = join(directory, "Library/Application Support/com.mitchellh.ghostty");
    await mkdir(app, { recursive: true });
    const file = join(app, name);
    await writeFile(file, contents, { mode: 0o640 });
    const state = {
      includes: false,
      includePath: "/resolved/include",
      extraArgCount: 0,
      accountHomeMatchesExpected: true,
      invalid: false,
      denied: false,
      version: "1.3.1",
      effective: "",
      candidateInvalid: false,
      acl: false,
      candidateAcl: false,
      usKeyboardLayout: true,
      keyRemap: false,
      ancestors: new Map([
        [
          process.pid,
          `${process.ppid} ${process.getuid?.()} /Applications/Ghostty.app/Contents/MacOS/ghostty`,
        ],
      ]),
    };
    const host = await openHost(t, {
      directory,
      extensionFactories,
      composer: (pi) =>
        piComposer({
          ...pi,
          exec: async (command, args) => {
            let stdout = "";
            let code = 0;
            if (command === "/bin/ps") stdout = state.ancestors.get(Number(args[1])) ?? "";
            else if (command === "/usr/bin/python3")
              stdout = JSON.stringify({
                schema: 1,
                pid: Number(args[2]),
                extraArgCount: state.extraArgCount,
                homeCount: 1,
                readable: !state.denied,
                parseOk: true,
                sameUid: true,
                identityStable: true,
                terminalBinaryMatchesPs: true,
                procargsPathMatchesPs: true,
                argv0MatchesExecutable: true,
                homeMatchesExpected: true,
                xdgMatchesExpected: true,
                fixedHomeAbsent: true,
                accountHomeMatchesExpected: state.accountHomeMatchesExpected,
                usKeyboardLayout: state.usKeyboardLayout,
              });
            else if (command === "/bin/ls")
              stdout = `-rw-r-----@ 1 fixture staff 15 Oct 12 12:00 ${args[1]}\n${state.acl || (state.candidateAcl && args[1] !== file) ? " 0: group:everyone deny write\n" : ""}`;
            else if (args[0] === "+version") stdout = `Ghostty ${state.version}\n`;
            else if (args[0] === "+validate-config")
              code = state.invalid || (args.length > 1 && state.candidateInvalid) ? 1 : 0;
            else if (args[0] === "+show-config")
              stdout = `${state.includes ? `config-file = ${state.includePath}\n` : ""}${state.keyRemap ? "key-remap = ctrl=super\n" : ""}`;
            else if (args[0] === "+list-keybinds")
              stdout =
                state.effective ||
                ((await readFile(file, "utf8")).includes("# BEGIN pi-composer keybindings")
                  ? forwarding
                  : "keybind = super+a=select_all");
            else throw new Error(`Unexpected OS operation: ${command}`);
            return { stdout, stderr: "", code, killed: false };
          },
        }),
    });
    return { host, file, app, state };
  } finally {
    // Register after openHost's teardown so it closes before removing its directory.
    t.after(async () => {
      Object.defineProperty(process, "platform", previousPlatform);
      if (previousHome === undefined) delete process.env["HOME"];
      else process.env["HOME"] = previousHome;
      if (previousXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
      else process.env["XDG_CONFIG_HOME"] = previousXdg;
      if (previousFixedHome === undefined) delete process.env["CFFIXED_USER_HOME"];
      else process.env["CFFIXED_USER_HOME"] = previousFixedHome;
      await rm(directory, { recursive: true, force: true });
    });
  }
}
