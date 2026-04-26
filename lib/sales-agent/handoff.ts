const HANDOFF_PATTERNS = [
  /\bhuman\b/i,
  /\bagent\b/i,
  /\boperator\b/i,
  /\bsupport\b/i,
  /\breal\s*person\b/i,
  /انسان/,
  /اپراتور/,
  /پشتیبان/,
  /انسان\s*واقعی/,
];

/**
 * User explicitly asks for a human / operator.
 */
export function shouldHandOffToHuman(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return HANDOFF_PATTERNS.some((re) => re.test(t));
}

export const HANDOFF_REPLY_DARI =
  "درخواست شما ثبت شد. یکی از همکاران ما به‌زودی در واتساپ پاسخ می‌دهد. لطفاً کمی صبر کنید.";
