// Command defaults adapted from OpenAI Codex 740e5af3; see ../NOTICE.
// Edit these activity settings, then reload Pi. Native Pi settings remain in Pi.
type Recognizer =
  | "cat"
  | "head"
  | "tail"
  | "nl"
  | "sed"
  | "ls"
  | "eza"
  | "tree"
  | "du"
  | "rg"
  | "grep"
  | "ag"
  | "fd"
  | "find"
  | "git"
  | "bat"
  | "less"
  | "more"
  | "awk"
  | "python"
  | "get-content"
  | "xargs";

export const activityConfig = {
  commands: {
    // Remove a name to show it as a command. Aliases use the selected command's syntax.
    names: {
      cat: "cat",
      head: "head",
      tail: "tail",
      nl: "nl",
      sed: "sed",
      ls: "ls",
      rg: "rg",
      grep: "grep",
      fd: "fd",
      find: "find",
      eza: "eza",
      exa: "eza",
      tree: "tree",
      du: "du",
      rga: "rg",
      "ripgrep-all": "rg",
      egrep: "grep",
      fgrep: "grep",
      ag: "ag",
      ack: "ag",
      pt: "ag",
      git: "git",
      bat: "bat",
      batcat: "bat",
      less: "less",
      more: "more",
      awk: "awk",
      xargs: "xargs",
      python: "python",
      python2: "python",
      python3: "python",
    } as Record<string, Recognizer>,
    caseInsensitiveNames: { "get-content": "get-content" } as Record<string, Recognizer>,
    prefixes: { "python2.": "python", "python3.": "python" } as Record<string, Recognizer>,
    // Suppress these formatting helpers when a shell script has another operation.
    formatting: ["wc", "tr", "cut", "sort", "uniq", "tee", "column", "yes", "printf"],
    // Short labels skip these directory names; file identity and expanded commands stay intact.
    omitPathComponents: ["build", "dist", "node_modules", "src"],
  },
  labels: {
    command: { running: "Running", completed: "Ran", expanded: "command" },
    edit: {
      running: "Editing",
      completed: "Edited",
      failed: "Edit failed:",
      unknown: "Edit",
      unattempted: "Not edited",
    },
    read: { running: "Reading", completed: "Read" },
    list: { running: "Listing", completed: "Listed" },
    search: { running: "Searching", completed: "Searched" },
    image: { running: "Viewing", completed: "Viewed" },
    tool: { running: "Calling", completed: "Called" },
    skill: "skill",
    files: "files",
    imageNoun: "image",
    in: "in",
    for: "for",
    output: "Output",
    error: "Error",
    failed: " (failed)",
    unknown: " (status unknown)",
    unattempted: " (not attempted)",
  },
  // Native working indicator. {value} is the file, command, query, folder, or tool name.
  working: {
    thinking: "Thinking",
    read: "Reading {value}",
    skill: "Reading {value} skill",
    edit: "Editing files",
    command: "Running {value}",
    emptyCommand: "Running command",
    search: "Searching for {value}",
    searchFiles: "Searching files",
    searchFolder: "Searching files in {value} folder",
    listFolder: "Listing files in {value} folder",
    listFiles: "Listing files",
    tool: "Calling {value}",
  },
  // Entry order is the group summary order.
  groups: {
    loaded: {
      completed: { singular: "loaded a tool", plural: "loaded tools" },
      running: { singular: "loading a tool", plural: "loading tools" },
    },
    tool: {
      completed: { singular: "called a tool", plural: "called tools" },
      running: { singular: "calling a tool", plural: "calling tools" },
    },
    edit: {
      completed: { singular: "edited a file", plural: "edited files" },
      running: { singular: "editing a file", plural: "editing files" },
    },
    read: {
      completed: { singular: "read files", plural: "read files" },
      running: { singular: "reading files", plural: "reading files" },
    },
    command: {
      completed: { singular: "ran a command", plural: "ran commands" },
      running: { singular: "running a command", plural: "running commands" },
    },
    image: {
      completed: { singular: "viewed an image", plural: "viewed images" },
      running: { singular: "viewing an image", plural: "viewing images" },
    },
    output: {
      completed: { singular: "error", plural: "errors" },
      running: { singular: "error", plural: "errors" },
    },
  },
  emptyGroup: "Worked",
  body: {
    image: "Image",
    edit: "Edit",
    error: "Error",
    callError: "Call error:",
    omitted: "[Output omitted from history]",
  },
};
