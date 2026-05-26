type EventHandler = (data: any) => void;

interface Pending {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
}

export class SignalingClient {
  private ws?: WebSocket;
  private pending = new Map<string, Pending>();
  private handlers = new Map<string, Set<EventHandler>>();
  private nextId = 0;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('WebSocket error'));
      this.ws.onmessage = (e) => this.onMessage(e.data);
      this.ws.onclose = () => this.emit('disconnected', null);
    });
  }

  private onMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(new Error(msg.error ?? 'unknown error'));
      return;
    }

    if (msg.event) this.emit(msg.event, msg.data);
  }

  request<T = any>(method: string, params?: any): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('not connected'));
    }
    const id = String(++this.nextId);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler) {
    this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, data: any) {
    this.handlers.get(event)?.forEach((h) => h(data));
  }

  close() {
    this.ws?.close();
  }
}
