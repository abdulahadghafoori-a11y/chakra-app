"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getOrdersForCtwaSession,
  type CtwaSessionOrderAlertRow,
} from "@/actions/order";

export function useCtwaSessionOrders(
  ctwaSessionId: string | undefined,
  enabled: boolean,
) {
  const [orders, setOrders] = useState<CtwaSessionOrderAlertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const notifyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const sessionId = (ctwaSessionId ?? "").trim();
    if (!enabled || !sessionId) {
      setOrders([]);
      notifyKeyRef.current = null;
      return;
    }

    let cancelled = false;
    setLoading(true);
    void getOrdersForCtwaSession(sessionId)
      .then((rows) => {
        if (cancelled) return;
        setOrders(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ctwaSessionId, enabled]);

  useEffect(() => {
    if (!enabled || loading || orders.length === 0) return;
    const sessionId = (ctwaSessionId ?? "").trim();
    if (!sessionId) return;
    const key = `${sessionId}::${orders.map((o) => o.id).join(",")}`;
    if (notifyKeyRef.current === key) return;
    notifyKeyRef.current = key;
    toast.warning(
      orders.length === 1
        ? "An order already uses this CTWA session"
        : `${orders.length} orders already use this CTWA session`,
      {
        description:
          "Creating another order on the same session may duplicate Meta attribution. Confirm this is intentional.",
        duration: 12_000,
      },
    );
  }, [enabled, loading, orders, ctwaSessionId]);

  return { orders, loading };
}
