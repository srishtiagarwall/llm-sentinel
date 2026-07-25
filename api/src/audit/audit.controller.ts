import { Controller, Get, Query, UseGuards, Request, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { AuditService } from './audit.service';
import { IsDateString } from 'class-validator';

class AuditQueryDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
}

@Controller('audit')
@UseGuards(AuthGuard('jwt'))
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('report')
  async getReport(@Request() req: any, @Query() query: AuditQueryDto) {
    return this.auditService.generateReport(
      req.user.tenantId,
      new Date(query.from),
      new Date(query.to),
    );
  }

  // Returns the same report as a downloadable JSON file
  @Get('report/download')
  async downloadReport(
    @Request() req: any,
    @Query() query: AuditQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.auditService.generateReport(
      req.user.tenantId,
      new Date(query.from),
      new Date(query.to),
    );

    const filename = `audit-report-${req.user.tenantId}-${query.from}-${query.to}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(report, null, 2));
  }
}
