import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AlertsService } from './alerts.service';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

class AlertsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(168) hours?: number;
}

@Controller('alerts')
@UseGuards(AuthGuard('jwt'))
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  getAlerts(@Request() req: any, @Query() query: AlertsQueryDto) {
    return this.alertsService.getRecentAlerts(req.user.tenantId, query.hours ?? 24);
  }
}
