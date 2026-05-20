"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { UseFormReturn } from "react-hook-form";

import { getContactByPhone } from "@/actions/contact";
import { getCtwaSessionsByPhone, type CtwaSessionRow } from "@/actions/ctwa";
import type { ContactPhase, FormValues } from "@/components/new-order-form/shared";
import { isValidE164Input } from "@/lib/phone-e164";

export function usePhoneLookup(form: UseFormReturn<FormValues>) {
  const [sessions, setSessions] = useState<CtwaSessionRow[]>([]);
  const [loadingPhoneData, setLoadingPhoneData] = useState(false);
  const [contactPhase, setContactPhase] = useState<ContactPhase>({
    status: "idle",
  });
  const multiSessionNotifyKeyRef = useRef<string | null>(null);

  const phone = form.watch("phone");

  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = (phone ?? "").trim();
      if (!trimmed) {
        setSessions([]);
        form.setValue("ctwaSessionId", "");
        setContactPhase({ status: "idle" });
        multiSessionNotifyKeyRef.current = null;
        return;
      }
      if (!isValidE164Input(trimmed)) {
        setSessions([]);
        form.setValue("ctwaSessionId", "");
        setContactPhase({ status: "idle" });
        multiSessionNotifyKeyRef.current = null;
        return;
      }
      setContactPhase({ status: "loading" });
      setLoadingPhoneData(true);
      void Promise.all([
        getCtwaSessionsByPhone(trimmed),
        getContactByPhone(trimmed),
      ])
        .then(([rows, contact]) => {
          setSessions(rows);
          form.setValue("ctwaSessionId", rows[0]?.id ?? "");
          if (contact) {
            setContactPhase({ status: "found", contact });
          } else {
            setContactPhase({ status: "not_found" });
          }
        })
        .finally(() => setLoadingPhoneData(false));
    }, 450);
    return () => clearTimeout(t);
  }, [phone, form]);

  useEffect(() => {
    if (loadingPhoneData || sessions.length <= 1) return;
    const key = `${(phone ?? "").trim()}::${sessions.length}`;
    if (multiSessionNotifyKeyRef.current === key) return;
    multiSessionNotifyKeyRef.current = key;
    toast.info("Multiple CTWA sessions for this contact", {
      description:
        "Choose the session that matches this customer's WhatsApp ad click. Latest is pre-selected — confirm before you submit.",
      duration: 10_000,
    });
  }, [loadingPhoneData, phone, sessions.length]);

  useEffect(() => {
    if (contactPhase.status === "not_found") {
      form.setError("phone", {
        type: "manual",
        message:
          "No contact found for this number. The customer must reach you on WhatsApp first.",
      });
    } else {
      form.clearErrors("phone");
    }
  }, [contactPhase, form]);

  return { sessions, loadingPhoneData, contactPhase, phone };
}
