/**
 * WebSocket Client for Real-Time Updates
 *
 * Provides real-time generation status updates from backend
 */

import { TokenManager } from './api-client';
import { GenerationUpdate, WebSocketMessage } from './types/api';

// ============================================================================
// Types
// ============================================================================

type MessageHandler = (message: WebSocketMessage) => void;
type ConnectionHandler = () => void;
type ErrorHandler = (error: Event) => void;

interface WebSocketOptions {
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

// ============================================================================
// WebSocket Client Class
// ============================================================================

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private options: Required<WebSocketOptions>;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private disconnectionHandlers: Set<ConnectionHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private isConnecting = false;

  constructor(url?: string, options: WebSocketOptions = {}) {
    this.url = url || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
    this.options = {
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
    };
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      // Get auth token
      const token = TokenManager.getToken();
      if (!token) {
        console.warn('No auth token available for WebSocket connection');
      }

      // Build WebSocket URL with token
      const wsUrl = token ? `${this.url}?token=${token}` : this.url;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.options.reconnect = false; // Disable auto-reconnect

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  private handleOpen(): void {
    console.log('WebSocket connected');
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // Start heartbeat
    this.startHeartbeat();

    // Notify connection handlers
    this.connectionHandlers.forEach((handler) => handler());
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);

      // Handle heartbeat response
      if (message.type === 'pong') {
        return;
      }

      // Notify message handlers
      this.messageHandlers.forEach((handler) => handler(message));
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
    this.errorHandlers.forEach((handler) => handler(event));
  }

  private handleClose(event: CloseEvent): void {
    console.log('WebSocket disconnected:', event.code, event.reason);
    this.isConnecting = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Notify disconnection handlers
    this.disconnectionHandlers.forEach((handler) => handler());

    // Attempt reconnection
    if (this.options.reconnect) {
      this.scheduleReconnect();
    }
  }

  // ==========================================================================
  // Reconnection Logic
  // ==========================================================================

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectInterval * Math.min(this.reconnectAttempts, 5);

    console.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // ==========================================================================
  // Heartbeat
  // ==========================================================================

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, this.options.heartbeatInterval);
  }

  // ==========================================================================
  // Send Message
  // ==========================================================================

  send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  // ==========================================================================
  // Subscribe to Generation Updates
  // ==========================================================================

  subscribeToGeneration(generationId: string): void {
    this.send({
      type: 'subscribe',
      generation_id: generationId,
    });
  }

  unsubscribeFromGeneration(generationId: string): void {
    this.send({
      type: 'unsubscribe',
      generation_id: generationId,
    });
  }

  // ==========================================================================
  // Event Listener Management
  // ==========================================================================

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectionHandlers.add(handler);
    return () => this.disconnectionHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  // ==========================================================================
  // State Getters
  // ==========================================================================

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get connectionState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}

// ============================================================================
// React Hook for WebSocket
// ============================================================================

import { useEffect, useRef, useState } from 'react';

interface UseWebSocketOptions extends WebSocketOptions {
  enabled?: boolean;
  onMessage?: MessageHandler;
  onConnect?: ConnectionHandler;
  onDisconnect?: ConnectionHandler;
  onError?: ErrorHandler;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocketClient | null>(null);

  const { enabled = true, onMessage, onConnect, onDisconnect, onError, ...wsOptions } = options;

  useEffect(() => {
    if (!enabled) return;

    // Create WebSocket client
    wsRef.current = new WebSocketClient(undefined, wsOptions);

    // Set up event handlers
    const unsubscribeMessage = wsRef.current.onMessage((message) => {
      setLastMessage(message);
      onMessage?.(message);
    });

    const unsubscribeConnect = wsRef.current.onConnect(() => {
      setIsConnected(true);
      onConnect?.();
    });

    const unsubscribeDisconnect = wsRef.current.onDisconnect(() => {
      setIsConnected(false);
      onDisconnect?.();
    });

    const unsubscribeError = wsRef.current.onError((error) => {
      onError?.(error);
    });

    // Connect
    wsRef.current.connect();

    // Cleanup
    return () => {
      unsubscribeMessage();
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeError();
      wsRef.current?.disconnect();
    };
  }, [enabled, onMessage, onConnect, onDisconnect, onError]);

  return {
    isConnected,
    lastMessage,
    send: (data: any) => wsRef.current?.send(data),
    subscribe: (generationId: string) => wsRef.current?.subscribeToGeneration(generationId),
    unsubscribe: (generationId: string) => wsRef.current?.unsubscribeFromGeneration(generationId),
  };
}

// ============================================================================
// React Hook for Generation Updates
// ============================================================================

interface UseGenerationUpdatesOptions {
  generationId: string;
  enabled?: boolean;
  onUpdate?: (update: GenerationUpdate) => void;
}

export function useGenerationUpdates({
  generationId,
  enabled = true,
  onUpdate,
}: UseGenerationUpdatesOptions) {
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    enabled,
    onMessage: (message) => {
      if (message.type === 'generation_update') {
        const update = message.data as GenerationUpdate;

        if (update.generation_id === generationId) {
          setStatus(update.status);
          setProgress(update.progress || 0);
          setError(update.error_message || null);
          onUpdate?.(update);
        }
      }
    },
  });

  useEffect(() => {
    if (isConnected && generationId) {
      subscribe(generationId);

      return () => {
        unsubscribe(generationId);
      };
    }
  }, [isConnected, generationId, subscribe, unsubscribe]);

  return {
    isConnected,
    status,
    progress,
    error,
  };
}

// ============================================================================
// Export
// ============================================================================

export default WebSocketClient;
