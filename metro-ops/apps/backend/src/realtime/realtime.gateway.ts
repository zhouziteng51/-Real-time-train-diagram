import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WebSocketServer, WebSocket } from "ws";
import {
  WsClientMessageSchema,
  type WsServerMessage,
  globalNetworkRoom,
} from "@metro-ops/shared";
import { resolveWsPort } from "./realtime.config.js";

const WS_PATH = "/ws/network";
const WS_PORT = resolveWsPort();

@Injectable()
export class RealtimeGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private wss?: WebSocketServer;
  private readonly rooms = new Map<string, Set<WebSocket>>();
  private readonly clientRooms = new WeakMap<WebSocket, Set<string>>();
  private onlineClients = 0;

  onModuleInit(): void {
    this.wss = new WebSocketServer({ port: WS_PORT, path: WS_PATH });
    this.wss.on("connection", (socket) => this.handleConnection(socket));
    this.logger.log(`WebSocket listening on ws://127.0.0.1:${WS_PORT}${WS_PATH}`);
  }

  onModuleDestroy(): void {
    this.wss?.close();
  }

  broadcast(room: string, payload: WsServerMessage): void {
    const subs = this.rooms.get(room);
    if (!subs || subs.size === 0) return;
    const msg = JSON.stringify(payload);
    for (const client of subs) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  broadcastGlobal(payload: WsServerMessage): void {
    this.broadcast(globalNetworkRoom(), payload);
  }

  private handleConnection(socket: WebSocket): void {
    this.onlineClients += 1;
    this.clientRooms.set(socket, new Set());
    this.joinRoom(socket, globalNetworkRoom());

    socket.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const result = WsClientMessageSchema.safeParse(parsed);
      if (!result.success) return;

      if (result.data.type === "subscribe") {
        for (const room of result.data.rooms) this.joinRoom(socket, room);
      } else {
        for (const room of result.data.rooms) this.leaveRoom(socket, room);
      }
    });

    socket.on("close", () => this.cleanup(socket));
    socket.on("error", () => this.cleanup(socket));
  }

  private joinRoom(socket: WebSocket, room: string): void {
    let set = this.rooms.get(room);
    if (!set) {
      set = new Set();
      this.rooms.set(room, set);
    }
    set.add(socket);
    this.clientRooms.get(socket)?.add(room);
  }

  private leaveRoom(socket: WebSocket, room: string): void {
    this.rooms.get(room)?.delete(socket);
    this.clientRooms.get(socket)?.delete(room);
  }

  private cleanup(socket: WebSocket): void {
    const joined = this.clientRooms.get(socket);
    if (!joined) return;
    for (const room of joined) this.rooms.get(room)?.delete(socket);
    this.clientRooms.delete(socket);
    this.onlineClients = Math.max(0, this.onlineClients - 1);
  }

  stats(): { onlineClients: number; rooms: Array<{ room: string; clients: number }> } {
    return {
      onlineClients: this.onlineClients,
      rooms: Array.from(this.rooms.entries())
        .map(([room, clients]) => ({
          room,
          clients: Array.from(clients).filter(
            (client) => client.readyState === WebSocket.OPEN,
          ).length,
        }))
        .sort((a, b) => a.room.localeCompare(b.room)),
    };
  }
}
