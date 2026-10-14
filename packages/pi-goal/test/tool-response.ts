export function toolResponse(
  name: string,
  args: unknown,
  id: string,
  usage: unknown,
) {
  return [
    {
      event: {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id,
                  type: "function",
                  function: { name, arguments: JSON.stringify(args) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
    },
    {
      event: {
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        usage,
      },
    },
    { event: "[DONE]" },
    { end: true } as const,
  ]
}
