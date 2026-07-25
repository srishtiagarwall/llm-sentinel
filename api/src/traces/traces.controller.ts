import { Controller, Get, Param, Query, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TracesService } from './traces.service';
import { IsOptional, IsDateString, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

class TraceQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() model?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() blocked?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

class StatsQueryDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
}

@Controller('traces')
@UseGuards(AuthGuard('jwt'))
export class TracesController {
  constructor(private readonly tracesService: TracesService) {}

  @Get()
  findAll(@Request() req: any, @Query() query: TraceQueryDto) {
    return this.tracesService.findAll({
      tenantId: req.user.tenantId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      model: query.model,
      blocked: query.blocked,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('stats')
  async getStats(@Request() req: any, @Query() query: StatsQueryDto) {
    return this.tracesService.getStats(
      req.user.tenantId,
      new Date(query.from),
      new Date(query.to),
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    const trace = await this.tracesService.findOne(id, req.user.tenantId);
    if (!trace) throw new NotFoundException('Trace not found');
    return trace;
  }
}
