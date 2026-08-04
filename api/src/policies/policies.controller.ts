import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PoliciesService } from './policies.service';
import { CreatePolicyDto, UpdatePolicyDto } from './policy.dto';

@Controller('policies')
@UseGuards(AuthGuard('jwt'))
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreatePolicyDto) {
    return this.policiesService.create(req.user.tenantId, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.policiesService.findAll(req.user.tenantId);
  }

  // Consumed by the gateway to refresh its policy cache — service-to-service call,
  // still tenant-scoped via the caller's JWT.
  @Get('enabled')
  findAllEnabled(@Request() req: any) {
    return this.policiesService.findAllEnabled(req.user.tenantId);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.policiesService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdatePolicyDto) {
    return this.policiesService.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.policiesService.remove(req.user.tenantId, id);
  }
}
