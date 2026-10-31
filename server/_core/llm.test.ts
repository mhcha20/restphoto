import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...a: unknown[]) => createMock(...a) };
  },
}));
vi.mock("./env", () => ({
  ENV: { anthropicApiKey: "test-key", anthropicModel: "claude-opus-5-5" },
}));

import { invokeLLM } from "./llm";

const reply = (text: string, stop_reason = "end_turn") => ({
  id: "msg_1",
  model: "claude-opus-5-5",
  stop_reason,
  content: [{ type: "text", text }],
  usage: { input_tokens: 10, output_tokens: 5 },
});

describe("invokeLLM (Claude adapter)", () => {
  beforeEach(() => createMock.mockReset());

  it("moves system messages to `system` and returns OpenAI-shaped text", async () => {
    createMock.mockResolvedValue(reply("hello"));
    const res = await invokeLLM({
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
      ],
    });
    const req = createMock.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.system).toBe("be brief");
    expect(req.messages).toEqual([{ role: "user", content: [{ type: "text", text: "hi" }] }]);
    expect(req.thinking).toBeUndefined();
    expect(req.temperature).toBeUndefined();
    expect(req.output_config.effort).toBe("low");
    expect(res.choices[0].message.content).toBe("hello");
    expect(res.usage?.total_tokens).toBe(15);
  });

  it("maps json_schema response_format to output_config.format", async () => {
    createMock.mockResolvedValue(reply('{"a":1}'));
    const schema = { type: "object", properties: { a: { type: "number" } }, required: ["a"], additionalProperties: false };
    await invokeLLM({
      messages: [{ role: "user", content: "x" }],
      response_format: { type: "json_schema", json_schema: { name: "t", strict: true, schema } },
    });
    expect(createMock.mock.calls[0][0].output_config.format).toEqual({ type: "json_schema", schema });
  });

  it("maps image URLs and data URLs to Claude image blocks", async () => {
    createMock.mockResolvedValue(reply("ok"));
    await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "look" },
            { type: "image_url", image_url: { url: "https://example.com/a.jpg" } },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
          ],
        },
      ],
    });
    const blocks = createMock.mock.calls[0][0].messages[0].content;
    expect(blocks[1]).toEqual({ type: "image", source: { type: "url", url: "https://example.com/a.jpg" } });
    expect(blocks[2]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });
  });

  it("throws on refusal and rejects tools", async () => {
    createMock.mockResolvedValue(reply("", "refusal"));
    await expect(invokeLLM({ messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/declined/);
    await expect(
      invokeLLM({ messages: [{ role: "user", content: "x" }], tools: [{ type: "function", function: { name: "f" } }] })
    ).rejects.toThrow(/tools are not supported/);
  });
});
