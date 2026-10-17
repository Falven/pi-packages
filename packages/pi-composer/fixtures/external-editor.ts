import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const file = process.argv[2];
assert(file, "Pi must pass its draft file to the external editor");
const source = await readFile(file, "utf8");
await writeFile(file, `${source}\n${"x".repeat(5100)}\n**External edit**\n`);
