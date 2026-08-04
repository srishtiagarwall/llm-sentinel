import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom } from 'rxjs';

const logger = new Logger('TraceEventNotifier');

// Notifies api's dashboard WebSocket gateway that a trace was created or
// updated, so the live dashboard feed reflects real writes instead of only
// showing data on manual refresh. Called by both gateway (on trace save)
// and eval-service (on score update) — neither owns the socket server,
// which lives in api, so this is a fire-and-forget HTTP call authenticated
// with a self-signed service JWT (same pattern as the gateway policy cache).
export async function notifyTraceEvent(
  http: HttpService,
  jwtService: JwtService,
  apiUrl: string,
  tenantId: string,
  traceId: string,
): Promise<void> {
  const serviceToken = jwtService.sign({ sub: 'internal-service', tenantId, role: 'service' });

  try {
    // api's NestJS app applies a global 'api' prefix (see api/src/main.ts).
    await firstValueFrom(
      http.post(
        `${apiUrl}/api/internal/events/trace`,
        { traceId },
        { headers: { Authorization: `Bearer ${serviceToken}` } },
      ),
    );
  } catch (err) {
    // Never let a dashboard-push failure affect the caller's own write path.
    logger.warn(`Failed to notify trace event for ${traceId}`, err as Error);
  }
}
