import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Draft-only suggestion for public FB/IG comments (staff reviews before sending).
 */
export async function suggestPublicCommentReply(input: {
  platform: "facebook" | "instagram";
  commentText: string;
  authorName: string | null;
  brandName?: string;
}): Promise<{ text: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model =
    process.env.META_COMMENT_SUGGEST_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_MODEL;

  const brand =
    input.brandName?.trim() ||
    process.env.META_COMMENT_SUGGEST_BRAND?.trim() ||
    process.env.SALES_AGENT_BRAND_NAME?.trim() ||
    "our business";

  const system = [
    "You draft short public replies for Facebook Page or Instagram comments.",
    "Match the commenter's language when reasonable.",
    "Be polite and concise (under 500 characters). No markdown.",
    "Do not promise refunds, discounts, compensation, or legal outcomes.",
    "Do not disclose private customer data or internal processes.",
    "Output only the reply body — no quotes, labels, or preamble.",
  ].join("\n");

  const openai = new OpenAI({ apiKey });
  const userBits = [
    `Platform: ${input.platform}`,
    input.authorName ? `Commenter: ${input.authorName}` : null,
    `Brand: ${brand}`,
    `Comment:\n"""${input.commentText.slice(0, 4000)}"""`,
  ].filter(Boolean);

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.45,
    max_tokens: 350,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userBits.join("\n") },
    ],
  });

  let text = completion.choices[0]?.message?.content?.trim() ?? "";
  text = text.replace(/^[\s"'“”]+|[\s"'“”]+$/g, "").trim();

  return { text: text.slice(0, 8000), model };
}
