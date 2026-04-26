import OpenAI from "openai";
import { asc, eq } from "drizzle-orm";

import { conversationMessages } from "@/drizzle/schema";
import { db } from "@/lib/db";

import { SALES_AGENT_SYSTEM_PROMPT } from "./prompt";
import { runProductToolCall } from "./product-tools";

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the product catalog by name, SKU, or description. Returns matches with USD list prices from the database.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Terms from the customer (not translated).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product",
      description:
        "Load a single product by UUID when the customer refers to a row from search_products.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product id (UUID)." },
        },
        required: ["product_id"],
      },
    },
  },
];

const FALLBACK_REPLY =
  "متأسفانه الان نتوانستم پاسخ بدهم. دوباره بنویسید یا بنویسید «اپراتور» تا همکار انسانی وصل شود.";

/**
 * Loads conversation history (including the latest user row) and returns assistant text.
 */
export async function runSalesAgentReply(
  conversationId: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const openai = new OpenAI({ apiKey });

  const history = await db
    .select({
      role: conversationMessages.role,
      content: conversationMessages.content,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(asc(conversationMessages.createdAt))
    .limit(50);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SALES_AGENT_SYSTEM_PROMPT },
    ...history.map((h): OpenAI.Chat.ChatCompletionMessageParam => {
      if (h.role === "user") {
        return { role: "user", content: h.content };
      }
      if (h.role === "assistant") {
        return { role: "assistant", content: h.content };
      }
      return { role: "user", content: `[${h.role}] ${h.content}` };
    }),
  ];

  for (let step = 0; step < 12; step++) {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 700,
    });

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}") as Record<
            string,
            unknown
          >;
        } catch {
          args = {};
        }
        const result = await runProductToolCall(tc.function.name, args);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
      continue;
    }

    const text = msg.content?.trim();
    if (text) return text.slice(0, 4096);
    break;
  }

  return FALLBACK_REPLY;
}
