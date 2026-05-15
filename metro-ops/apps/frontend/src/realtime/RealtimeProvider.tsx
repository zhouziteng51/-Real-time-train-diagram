import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  WS_EVENTS,
  WsServerMessageSchema,
  globalNetworkRoom,
  importJobRoom,
  tripRoom,
} from "@metro-ops/shared";
import {
  useAppStore,
  useImportStore,
  useRealtimeStore,
} from "../store/index.js";
import { RafBatcher } from "./batcher.js";

const WS_URL =
  typeof window === "undefined"
    ? ""
    : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/network`;

interface Props {
  children: ReactNode;
}

export function RealtimeProvider({ children }: Props) {
  const qc = useQueryClient();
  const setStatus = useRealtimeStore((s) => s.setConnectionStatus);
  const merge = useRealtimeStore((s) => s.mergeVehicles);
  const upsertJob = useImportStore((s) => s.upsertJob);
  const currentJobId = useImportStore((s) => s.currentJobId);
  const selectedTripId = useAppStore((s) => s.selectedTripId);
  const socketRef = useRef<WebSocket | null>(null);
  const batcherRef = useRef<RafBatcher | null>(null);
  const joinedRoomsRef = useRef(new Set<string>());
  const desiredRoomsRef = useRef<Set<string>>(new Set([globalNetworkRoom()]));
  const syncRoomsRef = useRef<(rooms: Set<string>) => void>(() => undefined);

  const desiredRooms = useMemo(() => {
    const rooms = new Set<string>([globalNetworkRoom()]);
    if (currentJobId) rooms.add(importJobRoom(currentJobId));
    if (selectedTripId) rooms.add(tripRoom(selectedTripId));
    return rooms;
  }, [currentJobId, selectedTripId]);

  useEffect(() => {
    desiredRoomsRef.current = desiredRooms;
    syncRoomsRef.current(desiredRooms);
  }, [desiredRooms]);

  useEffect(() => {
    if (!WS_URL) return;
    const batcher = new RafBatcher((items, sentAt) => merge(items, sentAt));
    batcherRef.current = batcher;

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const syncRooms = (rooms: Set<string>) => {
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const joined = joinedRoomsRef.current;
      const subscribe = Array.from(rooms).filter((room) => !joined.has(room));
      const unsubscribe = Array.from(joined).filter((room) => !rooms.has(room));

      if (subscribe.length > 0) {
        ws.send(JSON.stringify({ type: "subscribe", rooms: subscribe }));
        for (const room of subscribe) joined.add(room);
      }

      if (unsubscribe.length > 0) {
        ws.send(JSON.stringify({ type: "unsubscribe", rooms: unsubscribe }));
        for (const room of unsubscribe) joined.delete(room);
      }
    };
    syncRoomsRef.current = syncRooms;

    const open = () => {
      if (disposed) return;
      setStatus("CONNECTING");
      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;

      ws.onopen = () => {
        joinedRoomsRef.current.clear();
        setStatus("ONLINE");
        syncRooms(desiredRoomsRef.current);
      };

      ws.onmessage = (evt) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(evt.data);
        } catch {
          return;
        }
        const msg = WsServerMessageSchema.safeParse(parsed);
        if (!msg.success) return;

        switch (msg.data.event) {
          case WS_EVENTS.VehicleUpdated:
            batcher.push(msg.data.items, msg.data.sentAt);
            break;
          case WS_EVENTS.ImportJobUpdated:
            upsertJob(msg.data.job);
            qc.invalidateQueries({ queryKey: ["imports"] });
            qc.invalidateQueries({ queryKey: ["imports", msg.data.job.id] });
            if (msg.data.job.status === "IMPORTED") {
              qc.invalidateQueries({ queryKey: ["trips", "active"] });
              qc.invalidateQueries({ queryKey: ["trips", "history"] });
            }
            break;
          case WS_EVENTS.TripStatusChanged:
            qc.invalidateQueries({ queryKey: ["trip", msg.data.tripId] });
            qc.invalidateQueries({ queryKey: ["trips", "active"] });
            qc.invalidateQueries({ queryKey: ["trips", "history"] });
            break;
          default:
            break;
        }
      };

      ws.onclose = () => {
        joinedRoomsRef.current.clear();
        if (disposed) return;
        setStatus("OFFLINE");
        retryTimer = setTimeout(open, 2000);
      };
      ws.onerror = () => {
        ws.close();
      };
    };

    open();
    return () => {
      disposed = true;
      syncRoomsRef.current = () => undefined;
      if (retryTimer) clearTimeout(retryTimer);
      joinedRoomsRef.current.clear();
      batcherRef.current = null;
      socketRef.current?.close();
    };
  }, [merge, qc, setStatus, upsertJob]);

  return <>{children}</>;
}
