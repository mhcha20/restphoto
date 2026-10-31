import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const toPart = (part: MessageContent): TextContent | ImageContent | FileContent =>
  typeof part === "string" ? { type: "text", text: part } : part;

let client: Anthropic | null = null;
const getClient = (): Anthropic => {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  client ??= new Anthropic({ apiKey: ENV.anthropicApiKey });
  return client;
};

/** OpenAI-style content part -> Anthropic content block. */
const toBlock = (
  part: TextContent | ImageContent | FileContent
): Anthropic.ContentBlockParam => {
  if (part.type === "text") return { type: "text", text: part.text };

  if (part.type === "image_url") {
    const url = part.image_url.url;
    const data = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(url);
    if (data) {
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: data[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: data[2],
        },
      };
    }
    return { type: "image", source: { type: "url", url } };
  }

  if (part.file_url.mime_type === "application/pdf") {
    return { type: "document", source: { type: "url", url: part.file_url.url } };
  }
  throw new Error(`Unsupported file type for Claude: ${part.file_url.mime_type ?? "unknown"}`);
};

/**
 * Calls Claude through the Anthropic Messages API and returns an OpenAI-shaped
 * result so existing callers (translation, address lookup, photo analysis) keep working.
 * Structured output (`response_format: json_schema`) uses `output_config.format`.
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (params.tools && params.tools.length > 0) {
    throw new Error("invokeLLM: tools are not supported by the Claude adapter");
  }

  const system: string[] = [];
  const messages: Anthropic.MessageParam[] = [];
  for (const m of params.messages) {
    const parts = ensureArray(m.content).map(toPart);
    if (m.role === "system") {
      system.push(
        parts.map((p) => (p.type === "text" ? p.text : "")).filter(Boolean).join("\n")
      );
      continue;
    }
    if (m.role !== "user" && m.role !== "assistant") {
      throw new Error(`invokeLLM: unsupported role "${m.role}"`);
    }
    messages.push({ role: m.role, content: parts.map(toBlock) });
  }

  const format = params.responseFormat ?? params.response_format;
  const schema = params.outputSchema ?? params.output_schema;
  const jsonSchema =
    format?.type === "json_schema" ? format.json_schema.schema : schema?.schema;

  const response = await getClient().messages.create({
    model: ENV.anthropicModel,
    max_tokens: params.maxTokens ?? params.max_tokens ?? 16000,
    ...(system.length > 0 ? { system: system.join("\n\n") } : {}),
    messages,
    // Low effort is plenty for short extraction / translation tasks.
    output_config: {
      effort: "low",
      ...(jsonSchema ? { format: { type: "json_schema", schema: jsonSchema } } : {}),
    },
  } as Anthropic.MessageCreateParamsNonStreaming);

  if (response.stop_reason === "refusal") {
    throw new Error("LLM declined the request");
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    id: response.id,
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: response.stop_reason,
      },
    ],
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}
