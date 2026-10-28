"use client";

import { useEffect, useRef } from "react";

/**
 * Fires one anonymous view ping per opportunity per browser session —
 * sessionStorage keeps a reload or a back-navigation from inflating the count.
 */
export function ViewTracker({ opportunityId }: { opportunityId: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    const key = `eckz_viewed_${opportunityId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode / storage disabled — still count the view.
    }

    void fetch("/api/track/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId }),
      keepalive: true,
    }).catch(() => {});
  }, [opportunityId]);

  return null;
}
