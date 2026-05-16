const { buildWsUrl } = require("./api");

class RealtimeSocket {
  constructor(path = "") {
    this.path = path;
    this.socket = null;
    this.listeners = new Set();
    this.rooms = new Set();
    this.opening = false;
    this.connected = false;
  }

  connect() {
    if (this.socket || this.opening) return;
    this.opening = true;
    this.socket = wx.connectSocket({ url: buildWsUrl(this.path) });
    this.socket.onOpen(() => {
      this.opening = false;
      this.connected = true;
      this.flushSubscriptions();
    });
    this.socket.onMessage((evt) => {
      try {
        const payload = JSON.parse(evt.data);
        for (const listener of this.listeners) listener(payload);
      } catch {
        // ignore malformed frames
      }
    });
    this.socket.onClose(() => {
      this.socket = null;
      this.opening = false;
      this.connected = false;
    });
    this.socket.onError(() => {
      this.socket = null;
      this.opening = false;
      this.connected = false;
    });
  }

  onMessage(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribe(rooms) {
    for (const room of rooms) this.rooms.add(room);
    if (!this.socket || this.opening || !this.connected) {
      this.connect();
      return;
    }
    this.flushSubscriptions();
  }

  close() {
    this.socket?.close({});
    this.socket = null;
    this.opening = false;
    this.connected = false;
  }

  flushSubscriptions() {
    if (!this.socket || !this.connected) return;
    const rooms = Array.from(this.rooms);
    if (rooms.length === 0) return;
    this.socket.send({
      data: JSON.stringify({ type: "subscribe", rooms }),
    });
  }
}

module.exports = {
  RealtimeSocket,
};
