import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/dashboard' })
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(DashboardGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string;
    try {
      const payload = this.jwtService.verify(token);
      client.data.tenantId = payload.tenantId;
      client.join(`tenant:${payload.tenantId}`);
      this.logger.log(`Client connected: ${client.id} (tenant: ${payload.tenantId})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Called by other services to push a new trace event to the tenant's dashboard
  pushTrace(tenantId: string, trace: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).emit('trace', trace);
  }

  // Called by alert engine to push alerts in real time
  pushAlert(tenantId: string, alert: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).emit('alert', alert);
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() _data: unknown, @ConnectedSocket() client: Socket) {
    client.emit('pong', { ts: Date.now() });
  }
}
