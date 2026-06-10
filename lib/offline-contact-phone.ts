import { nanoid } from "nanoid";

/** Stored in `contacts.phone_number` when an in-store customer has no phone. */
export const OFFLINE_CONTACT_PHONE_PREFIX = "offline_";

export function isOfflinePlaceholderPhone(phoneNumber: string): boolean {
  return phoneNumber.startsWith(OFFLINE_CONTACT_PHONE_PREFIX);
}

/** Unique synthetic key for offline contacts without a real phone. */
export function allocateOfflinePlaceholderPhone(): string {
  return `${OFFLINE_CONTACT_PHONE_PREFIX}${nanoid(12).toLowerCase()}`;
}
