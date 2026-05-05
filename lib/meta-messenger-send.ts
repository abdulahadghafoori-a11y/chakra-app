import { metaGraphOrigin } from "@/lib/meta-marketing-api";
import { getMetaPageAccessToken } from "@/lib/meta-page-token";

async function sendMessengerPayload(body: Record<string, unknown>) {
  const token = getMetaPageAccessToken();
  const url = new URL(`${metaGraphOrigin()}/me/messages`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    recipient_id?: string;
    message_id?: string;
  };
  if (!res.ok) {
    const msg = json.error?.message ?? `Send API ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function sendMessengerText(
  recipientPsid: string,
  text: string,
): Promise<void> {
  await sendMessengerPayload({
    recipient: { id: recipientPsid },
    messaging_type: "RESPONSE",
    message: { text: text.slice(0, 2000) },
  });
}

export async function sendInstagramDmText(
  recipientIgsid: string,
  text: string,
): Promise<void> {
  await sendMessengerPayload({
    messaging_product: "instagram",
    recipient: { id: recipientIgsid },
    message: { text: text.slice(0, 1000) },
  });
}
