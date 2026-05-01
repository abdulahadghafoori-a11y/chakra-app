import OpenAI from "openai";
import { desc, eq } from "drizzle-orm";

import {
  conversationMessages,
  conversationProfiles,
  conversations,
} from "@/drizzle/schema";
import { db } from "@/lib/db";

import { getSalesAgentSystemPrompt, type SalesPromptContext } from "./prompt";
import { runProductToolCall } from "./product-tools";
import { runSalesToolCall, type SalesAgentToolContext } from "./sales-tools";

const HISTORY_LIMIT = 20;

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
        "Load one product by UUID (from search_products). Returns price, description, specs_json, faq_json, knowledge_notes — only state product facts present in the payload.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product id (UUID)." },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_store_policy",
      description:
        "Return official store/business text from the database for a topic slug: payment, shipping, warranty, returns, general, or any custom slug you added in the admin KB.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "Topic or slug: payment, shipping, warranty, returns, general, or custom slug (e.g. about_us).",
          },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_business_knowledge",
      description:
        "Search editable business articles (policies, how we work) when get_store_policy slug is unknown or the customer asks broad questions.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keywords from the customer message (Dari or Latin).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_customer_profile",
      description:
        "Persist structured customer facts on this WhatsApp conversation.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          city: { type: "string" },
          address_note: { type: "string" },
          budget_band: { type: "string" },
          urgency: {
            type: "string",
            enum: ["today", "this_week", "browsing"],
          },
          interested_product_ids: {
            description: "Array of product UUID strings or comma-separated.",
            oneOf: [
              { type: "array", items: { type: "string" } },
              { type: "string" },
            ],
          },
          trust_objection: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_lead_score",
      description: "Set hot/warm/cool lead score with a short reason.",
      parameters: {
        type: "object",
        properties: {
          score: { type: "string", enum: ["hot", "warm", "cold"] },
          reason: { type: "string" },
        },
        required: ["score"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_sales_stage",
      description: "Move the conversation to the next sales stage.",
      parameters: {
        type: "object",
        properties: {
          stage: {
            type: "string",
            enum: [
              "new",
              "discovering",
              "recommending",
              "objection_handling",
              "confirming_order",
              "ready_for_human_order",
              "handoff",
              "closed",
            ],
          },
        },
        required: ["stage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_conversation_summary",
      description:
        "Store a short rolling summary (Dari) for long threads; call sparingly.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_draft_order",
      description:
        "Create a draft order in the database after required confirmations; never replaces final order creation.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string" },
                quantity: { type: "integer", minimum: 1 },
              },
              required: ["product_id", "quantity"],
            },
          },
          confirmed_payment_on_delivery: { type: "boolean" },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "handoff_to_human",
      description:
        "Stop bot replies for this thread; human team takes over. Provide reason.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_capi_event",
      description:
        "Send deduped Meta CAPI funnel event (Lead, ViewContent, AddToCart). Requires stable dedupe_key per milestone.",
      parameters: {
        type: "object",
        properties: {
          event_name: {
            type: "string",
            enum: ["Lead", "ViewContent", "AddToCart"],
          },
          dedupe_key: {
            type: "string",
            description: "Stable key, e.g. vc_<product_id> or lead_intent_1",
          },
          product_id: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
          value: { type: "number" },
        },
        required: ["event_name", "dedupe_key"],
      },
    },
  },
];

const FALLBACK_REPLY =
  "متأسفانه الان نتوانستم پاسخ بدهم. دوباره بنویسید یا بنویسید «اپراتور» تا همکار انسانی وصل شود.";

function buildProfileFactLines(
  profile: typeof conversationProfiles.$inferSelect | undefined,
): string[] {
  if (!profile) return [];
  const lines: string[] = [];
  if (profile.customerName?.trim()) {
    lines.push(`نام: ${profile.customerName.trim()}`);
  }
  if (profile.city?.trim()) lines.push(`شهر: ${profile.city.trim()}`);
  if (profile.addressNote?.trim()) {
    lines.push(`آدرس/یادداشت: ${profile.addressNote.trim()}`);
  }
  if (profile.budgetBand?.trim()) {
    lines.push(`بودجه (باند): ${profile.budgetBand.trim()}`);
  }
  if (profile.urgency?.trim()) lines.push(`فوریت: ${profile.urgency.trim()}`);
  if (profile.interestedProductIds?.trim()) {
    lines.push(`علاقه به محصولات (شناسه): ${profile.interestedProductIds.trim()}`);
  }
  if (profile.trustObjection) {
    lines.push("نگرانی اعتماد: بله");
  }
  return lines;
}

async function loadRecentHistory(conversationId: string) {
  const rows = await db
    .select({
      role: conversationMessages.role,
      content: conversationMessages.content,
      createdAt: conversationMessages.createdAt,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(HISTORY_LIMIT);

  return rows.reverse();
}

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

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv) {
    throw new Error("conversation not found");
  }

  if (
    conv.status === "handoff" ||
    conv.stage === "handoff" ||
    conv.stage === "closed"
  ) {
    return "";
  }

  const [profile] = await db
    .select()
    .from(conversationProfiles)
    .where(eq(conversationProfiles.conversationId, conversationId))
    .limit(1);

  const promptCtx: SalesPromptContext = {
    stage: conv.stage,
    leadScore: conv.leadScore,
    profileFactLines: buildProfileFactLines(profile),
    conversationSummary: conv.conversationSummary,
  };

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const openai = new OpenAI({ apiKey });

  const history = await loadRecentHistory(conversationId);

  const toolCtx: SalesAgentToolContext = {
    conversationId,
    waIdDigits: conv.waId,
    contactId: conv.contactId,
  };

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: getSalesAgentSystemPrompt(promptCtx) },
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
      temperature: 0.35,
      max_tokens: 900,
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
        const name = tc.function.name;
        let result: string;
        if (name === "search_products" || name === "get_product") {
          result = await runProductToolCall(name, args);
        } else {
          result = await runSalesToolCall(name, args, toolCtx);
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });

        if (name === "handoff_to_human") {
          return "";
        }
      }
      continue;
    }

    const text = msg.content?.trim();
    if (text) return text.slice(0, 4096);
    break;
  }

  return FALLBACK_REPLY;
}
