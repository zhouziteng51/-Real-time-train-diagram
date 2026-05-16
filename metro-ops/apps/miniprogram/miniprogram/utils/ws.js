const { buildWsUrl } = require("./api");

class RealtimeSocket {
  constructor(path = "") {
    this.path = path;
    this.socket = null;
    this.listeners = new Set();
    this.rooms = new Set();
    this.opening = false;
  }

  connect() {
    if (this.socket || this.opening) return;
    this.opening = true;
    this.socket = wx.connectSocket({ url: buildWsUrl(this.path) });
    this.socket.onOpen(() => {
      this.opening = false;
      this.subscribe(Array.from(this.rooms));
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
    });
    this.socket.onError(() => {
      this.socket = null;
      this.opening = false;
    });
  }

  onMessage(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribe(rooms) {
    for (const room of rooms) this.rooms.add(room);
    if (!this.socket) {
      this.connect();
      return;
    }
    this.socket.send({
      data: JSON.stringify({ type: "subscribe", rooms }),
    });
  }

  close() {
    this.socket?.close({});
    this.socket = null;
    this.opening = false;
  }
}

module.exports = {
  RealtimeSocket,
};
