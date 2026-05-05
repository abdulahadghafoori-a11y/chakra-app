import { metaGraphOrigin } from "@/lib/meta-marketing-api";
import { getMetaPageAccessToken } from "@/lib/meta-page-token";

async function graphFormPost(path: string, body: Record<string, string>) {
  const token = getMetaPageAccessToken();
  const url = new URL(`${metaGraphOrigin()}${path}`);
  url.searchParams.set("access_token", token);
  const form = new URLSearchParams(body);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    success?: boolean;
    id?: string;
  };
  if (!res.ok) {
    const msg = json.error?.message ?? `Graph ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function graphDelete(path: string) {
  const token = getMetaPageAccessToken();
  const url = new URL(`${metaGraphOrigin()}${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), { method: "DELETE" });
  const json = (await res.json()) as { error?: { message?: string }; success?: boolean };
  if (!res.ok) {
    const msg = json.error?.message ?? `Graph ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function graphJsonPost(path: string, jsonBody: Record<string, unknown>) {
  const token = getMetaPageAccessToken();
  const url = new URL(`${metaGraphOrigin()}${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jsonBody),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    id?: string;
  };
  if (!res.ok) {
    const msg = json.error?.message ?? `Graph ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

/** Nested reply on a Page comment. */
export async function replyToFacebookComment(
  externalCommentId: string,
  message: string,
): Promise<void> {
  await graphFormPost(`/${externalCommentId}/comments`, {
    message: message.slice(0, 8000),
  });
}

/** Hide or unhide a Page post comment. */
export async function setFacebookCommentHidden(
  externalCommentId: string,
  hidden: boolean,
): Promise<void> {
  await graphFormPost(`/${externalCommentId}`, {
    is_hidden: hidden ? "true" : "false",
  });
}

export async function deleteFacebookComment(
  externalCommentId: string,
): Promise<void> {
  await graphDelete(`/${externalCommentId}`);
}

/** Reply to an Instagram comment (IG Graph comment id). */
export async function replyToInstagramComment(
  externalCommentId: string,
  message: string,
): Promise<void> {
  await graphJsonPost(`/${externalCommentId}/replies`, {
    message: message.slice(0, 8000),
  });
}

export async function deleteInstagramComment(
  externalCommentId: string,
): Promise<void> {
  await graphDelete(`/${externalCommentId}`);
}

/**
 * Instagram hides comments via Graph hide edge when supported.
 */
export async function hideInstagramComment(
  externalCommentId: string,
): Promise<void> {
  await graphFormPost(`/${externalCommentId}`, { hide: "true" });
}
