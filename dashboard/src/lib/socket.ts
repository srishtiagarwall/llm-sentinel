import { io, Socket } from 'socket.io-client';
import { API_URL, getToken } from './api';

let socket: Socket | null = null;

// Connects once per session — DashboardGateway (api/src/dashboard/dashboard.gateway.ts)
// authenticates via handshake.auth.token and joins a per-tenant room server-side.
export function connectDashboardSocket(): Socket {
  if (socket?.connected) return socket;

  socket = io(`${API_URL}/dashboard`, {
    auth: { token: getToken() },
    transports: ['websocket'],
  });

  return socket;
}

export function disconnectDashboardSocket(): void {
  socket?.disconnect();
  socket = null;
}
