import { Controller, Post, Body, UseGuards, NotFoundException, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trace } from '@llm-sentinel/tracing';
import { DashboardGateway } from '../dashboard/dashboard.gateway';
import { AlertsService } from '../alerts/alerts.service';
import { TraceEventDto } from './internal-events.dto';

// Called by gateway (after a trace is saved) and eval-service (after scores
// are updated) so the dashboard's WebSocket feed reflects real writes.
// Guarded the same way as every other endpoint — gateway/eval-service
// authenticate with a self-signed service JWT (see PolicyCacheService).
@Controller('internal/events')
@UseGuards(AuthGuard('jwt'))
export class InternalEventsController {
  constructor(
    @InjectRepository(Trace)
    private readonly traceRepo: Repository<Trace>,
    private readonly dashboardGateway: DashboardGateway,
    private readonly alertsService: AlertsService,
  ) {}

  @Post('trace')
  async onTraceEvent(@Request() req: any, @Body() dto: TraceEventDto) {
    const trace = await this.traceRepo.findOne({
      where: { id: dto.traceId, tenantId: req.user.tenantId },
    });
    if (!trace) throw new NotFoundException(`Trace ${dto.traceId} not found`);

    this.dashboardGateway.pushTrace(trace.tenantId, trace as unknown as Record<string, unknown>);

    const alerts = this.alertsService.evaluateTrace(trace);
    for (const alert of alerts) {
      this.dashboardGateway.pushAlert(trace.tenantId, alert as unknown as Record<string, unknown>);
    }

    return { pushed: true, alertCount: alerts.length };
  }
}
