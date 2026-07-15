/**
 * On reconnect: invalidate all queries so RLS-filtered data replaces stale cache (§6.8).
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineReconnect() {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      void queryClient.invalidateQueries();
    }
  }, [online, queryClient]);

  return null;
}
