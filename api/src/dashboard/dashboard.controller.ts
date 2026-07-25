import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverview(@Request() req: any) {
    return this.dashboardService.getOverview(req.user.tenantId);
  }

  @Get('cost-breakdown')
  getCostBreakdown(@Request() req: any) {
    return this.dashboardService.getCostBreakdown(req.user.tenantId);
  }
}
