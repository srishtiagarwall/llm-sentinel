import { Controller, Get, Query, UseGuards, Request, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { AuditService } from './audit.service';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

class AuditQueryDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
}

class AuditDownloadQueryDto extends AuditQueryDto {
  @IsIn(['json', 'pdf'])
  @IsOptional()
  format?: 'json' | 'pdf';
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

  // Returns the report as a downloadable file — JSON by default, PDF via ?format=pdf
  @Get('report/download')
  async downloadReport(
    @Request() req: any,
    @Query() query: AuditDownloadQueryDto,
    @Res() res: Response,
  ) {
    const tenantId = req.user.tenantId;
    const from = new Date(query.from);
    const to = new Date(query.to);
    const baseFilename = `audit-report-${tenantId}-${query.from}-${query.to}`;

    if (query.format === 'pdf') {
      const pdfBytes = await this.auditService.generateReportPdf(tenantId, from, to);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.pdf"`);
      res.send(Buffer.from(pdfBytes));
      return;
    }

    const report = await this.auditService.generateReport(tenantId, from, to);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.json"`);
    res.send(JSON.stringify(report, null, 2));
  }
}
