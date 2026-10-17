import type { ActivityItem, CallFacts } from "./types.ts";

export function fallbackItems(facts: CallFacts): ActivityItem[] {
  return [
    {
      id: facts.id,
      kind: "tool",
      target: facts.name,
      status: facts.status,
      body: {
        source: true,
        name: facts.name,
        args: facts.args,
        cwd: facts.cwd,
        result: facts.result,
      },
    },
  ];
}
