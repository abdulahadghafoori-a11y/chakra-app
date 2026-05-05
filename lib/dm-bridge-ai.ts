import OpenAI from "openai";

export type DmBridgeChannel = "messenger" | "instagram_dm";

const DEFAULT_MODEL = "gpt-4o-mini";

function requiredWhatsappUrl(): string {
  const u = process.env.WHATSAPP_REDIRECT_URL?.trim();
  if (!u) {
    throw new Error("WHATSAPP_REDIRECT_URL is not set");
  }
  return u;
}

function normalizeUrlForContains(url: string): string {
  try {
    const p = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${p.hostname}${p.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function responseContainsUrl(text: string, whatsappUrl: string): boolean {
  const t = text.toLowerCase();
  if (t.includes(whatsappUrl.toLowerCase())) return true;
  const norm = normalizeUrlForContains(whatsappUrl);
  return norm.length > 3 && t.includes(norm);
}

function fallbackBody(
  channel: DmBridgeChannel,
  userMessage: string,
  whatsappUrl: string,
  brandName: string | undefined,
): string {
  const brand = brandName?.trim() || "our shop";
  const opener =
    channel === "instagram_dm"
      ? "Thanks for your message on Instagram."
      : "Thanks for your message.";
  const tail =
    userMessage.trim().length > 0
      ? " To help you properly, please continue on WhatsApp:"
      : " Please reach us on WhatsApp:";
  return `${opener}${tail}\n${whatsappUrl}\n— ${brand}`;
}

/**
 * Single outbound DM — natural language + mandatory WhatsApp continuation link.
 */
export async function composeDmBridgeReply(input: {
  channel: DmBridgeChannel;
  userMessage: string;
  brandName?: string;
}): Promise<{ text: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const whatsappUrl = requiredWhatsappUrl();
  const model =
    process.env.DM_BRIDGE_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_MODEL;

  const append = process.env.DM_BRIDGE_SYSTEM_PROMPT_APPEND?.trim();

  const channelLabel =
    input.channel === "instagram_dm" ? "Instagram Direct" : "Facebook Messenger";

  const system = [
    `You reply exactly once on ${channelLabel}.`,
    "Keep the reply short (max ~450 characters), friendly, and helpful.",
    `You must include this WhatsApp link verbatim so the customer can tap it: ${whatsappUrl}`,
    "Do not promise order fulfillment, refunds, or discounts on this channel—only acknowledge and redirect.",
    "Do not ask follow-up questions that require answering on Messenger or Instagram; steer them to WhatsApp.",
    append ? `Additional brand guidance: ${append}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.45,
    max_tokens: 400,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content:
          input.userMessage.trim().length > 0
            ? `Customer wrote:\n"""${input.userMessage.slice(0, 4000)}"""\nCompose the single reply with the WhatsApp link.`
            : "Compose the single reply with the WhatsApp link.",
      },
    ],
  });

  let text = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!responseContainsUrl(text, whatsappUrl)) {
    const retry = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: "system", content: system + "\nYour previous reply forgot the link; fix it." },
        {
          role: "user",
          content: input.userMessage.trim().slice(0, 4000),
        },
      ],
    });
    text = retry.choices[0]?.message?.content?.trim() ?? "";
  }

  if (!responseContainsUrl(text, whatsappUrl)) {
    text = fallbackBody(
      input.channel,
      input.userMessage,
      whatsappUrl,
      input.brandName,
    );
  }

  return { text: text.slice(0, 2000), model };
}
