/**
 * MUSELY Presence & Real-time Client
 *
 * - Connects to ws(s)://<host>/api/ws?token=<jwt>
 * - Auto-reconnects with exponential backoff (1s → 32s cap)
 * - Sends HEARTBEAT every 25s to keep lastSeenAt fresh
 * - Sends navigator.sendBeacon on pagehide/beforeunload for fast offline
 * - Exposes typed event subscriptions for presence, delivery, read, messages, typing
 */

import api from './api';

const HEARTBEAT_MS = 20_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 32_000;

type PresencePayload = { userId: string; isOnline: boolean; lastSeenAt: string | null };
type DeliveredPayload = { messageId: string; conversationId: string; deliveredAt: string };
type ReadPayload = { conversationId: string; readerId: string; readAt: string };
type NewMessagePayload = { message: any };
type TypingPayload = { conversationId: string; userId: string; displayName: string; isTyping: boolean };

type EventMap = {
  presenceChange: PresencePayload;
  messageDelivered: DeliveredPayload;
  messagesRead: ReadPayload;
  newMessage: NewMessagePayload;
  typingChange: TypingPayload;
  connected: { userId: string };
};

type Callback<T> = (data: T) => void;

class PresenceClientClass {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private wsHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private httpHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_BASE_MS;
  private intentionalClose = false;
  private isHttpFallback = false;
  private listeners: { [K in keyof EventMap]?: Callback<EventMap[K]>[] } = {};

  // ---- Public API ----

  connect(token: string) {
    this.token = token;
    this.intentionalClose = false;
    this.reconnectDelay = RECONNECT_BASE_MS;
    this._openSocket();
    this._registerPageEvents();
  }

  disconnect() {
    this.intentionalClose = true;
    this._clearTimers();
    this._removePageEvents();
    if (this.ws) {
      this.ws.close(1000, 'logout');
      this.ws = null;
    }
    this.token = null;
    this.listeners = {};
    this.isHttpFallback = false;
  }

  on<K extends keyof EventMap>(event: K, cb: Callback<EventMap[K]>): () => void {
    if (!this.listeners[event]) {
      (this.listeners as any)[event] = [];
    }
    (this.listeners[event] as Callback<EventMap[K]>[]).push(cb);
    return () => this.off(event, cb);
  }

  off<K extends keyof EventMap>(event: K, cb: Callback<EventMap[K]>) {
    const arr = this.listeners[event] as Callback<EventMap[K]>[] | undefined;
    if (arr) {
      (this.listeners as any)[event] = arr.filter(fn => fn !== cb);
    }
  }

  // ---- Internals ----

  private _emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    const arr = this.listeners[event] as Callback<EventMap[K]>[] | undefined;
    if (arr) arr.forEach(fn => fn(data));
  }

  private _getWebSocketUrl(): string {
    let wsHost = location.host;
    let wsProto = location.protocol === 'https:' ? 'wss' : 'ws';

    const envApi = import.meta.env.VITE_API_URL as string | undefined;
    if (envApi && envApi.startsWith('http')) {
      try {
        const u = new URL(envApi);
        wsHost = u.host;
        wsProto = u.protocol === 'https:' ? 'wss' : 'ws';
      } catch {}
    }

    return `${wsProto}://${wsHost}/api/ws?token=${encodeURIComponent(this.token || '')}`;
  }

  private _openSocket() {
    if (!this.token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return; // already open
    }

    const url = this._getWebSocketUrl();

    try {
      this.ws = new WebSocket(url);
    } catch {
      this._enableHttpFallback();
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = RECONNECT_BASE_MS; // reset backoff
      this.isHttpFallback = false;
      this._stopHttpHeartbeat();
      this._startWsHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        switch (msg.type) {
          case 'CONNECTED':
            this._emit('connected', { userId: msg.userId });
            break;
          case 'PRESENCE_CHANGE':
            this._emit('presenceChange', {
              userId: msg.userId,
              isOnline: msg.isOnline,
              lastSeenAt: msg.lastSeenAt ?? null,
            });
            break;
          case 'MESSAGE_DELIVERED':
            this._emit('messageDelivered', {
              messageId: msg.messageId,
              conversationId: msg.conversationId,
              deliveredAt: msg.deliveredAt,
            });
            break;
          case 'MESSAGES_READ':
            this._emit('messagesRead', {
              conversationId: msg.conversationId,
              readerId: msg.readerId,
              readAt: msg.readAt,
            });
            break;
          case 'NEW_MESSAGE':
            this._emit('newMessage', { message: msg.message });
            break;
          case 'TYPING':
            this._emit('typingChange', {
              conversationId: msg.conversationId,
              userId: msg.userId,
              displayName: msg.displayName,
              isTyping: msg.isTyping,
            });
            break;
          case 'PONG':
            // server-side pong to our PING — no-op
            break;
        }
      } catch {
        // ignore malformed
      }
    };

    this.ws.onclose = () => {
      this._clearWsHeartbeat();
      if (!this.intentionalClose) {
        this._enableHttpFallback();
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this._enableHttpFallback();
      this.ws?.close();
    };
  }

  private _enableHttpFallback() {
    if (!this.isHttpFallback) {
      this.isHttpFallback = true;
      this._startHttpHeartbeat();
    }
  }

  private _startWsHeartbeat() {
    this._clearWsHeartbeat();
    this.wsHeartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'HEARTBEAT' }));
      } else {
        this._clearWsHeartbeat();
        this._enableHttpFallback();
        this._scheduleReconnect();
      }
    }, HEARTBEAT_MS);
  }

  private _clearWsHeartbeat() {
    if (this.wsHeartbeatTimer !== null) {
      clearInterval(this.wsHeartbeatTimer);
      this.wsHeartbeatTimer = null;
    }
  }

  private _startHttpHeartbeat() {
    this._stopHttpHeartbeat();
    if (!this.token || this.intentionalClose) return;

    // Send immediate heartbeat
    api.post('/users/presence/heartbeat').catch(() => {});

    // Periodic heartbeat to keep presence alive in serverless environment
    this.httpHeartbeatTimer = setInterval(() => {
      if (!this.token || this.intentionalClose) {
        this._stopHttpHeartbeat();
        return;
      }
      api.post('/users/presence/heartbeat').catch(() => {});
    }, HEARTBEAT_MS);
  }

  private _stopHttpHeartbeat() {
    if (this.httpHeartbeatTimer !== null) {
      clearInterval(this.httpHeartbeatTimer);
      this.httpHeartbeatTimer = null;
    }
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer !== null || this.intentionalClose || !this.token) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._openSocket();
    }, this.reconnectDelay);
    // Exponential backoff with cap
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_CAP_MS);
  }

  private _clearTimers() {
    this._clearWsHeartbeat();
    this._stopHttpHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _beaconOffline = () => {
    if (!this.token) return;
    const envApi = (import.meta.env.VITE_API_URL as string) || '/api';
    const baseUrl = envApi.startsWith('http') ? envApi.replace(/\/api\/?$/, '') : '';
    const offlineUrl = `${baseUrl}/api/users/presence/offline`;

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ token: this.token })], { type: 'application/json' });
        navigator.sendBeacon(offlineUrl, blob);
      } else {
        fetch(offlineUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
          },
          body: JSON.stringify({ token: this.token }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
  };

  private _onOnline = () => {
    // Immediate reconnect on network restore
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectDelay = RECONNECT_BASE_MS;
    this._openSocket();
  };

  private _onOffline = () => {
    // When network is lost, WS will close and _scheduleReconnect will kick in
    // Nothing to do here — the onclose handler handles it
  };

  private _registerPageEvents() {
    window.addEventListener('pagehide', this._beaconOffline);
    window.addEventListener('beforeunload', this._beaconOffline);
    window.addEventListener('online', this._onOnline);
    window.addEventListener('offline', this._onOffline);
  }

  private _removePageEvents() {
    window.removeEventListener('pagehide', this._beaconOffline);
    window.removeEventListener('beforeunload', this._beaconOffline);
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
  }
}

// Singleton
export const presenceClient = new PresenceClientClass();
