import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Policy } from './policy.entity';
import { CreatePolicyDto, UpdatePolicyDto } from './policy.dto';

@Injectable()
export class PoliciesService {
  constructor(
    @InjectRepository(Policy)
    private readonly repo: Repository<Policy>,
  ) {}

  async create(tenantId: string, dto: CreatePolicyDto): Promise<Policy> {
    const policy = this.repo.create({
      ...dto,
      tenantId,
      alert: dto.alert ?? true,
      enabled: dto.enabled ?? true,
      model: dto.model ?? null,
      userId: dto.userId ?? null,
    });
    return this.repo.save(policy);
  }

  async findAll(tenantId: string): Promise<Policy[]> {
    return this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  // Used by the gateway's policy cache refresh — only enabled rules matter at enforcement time.
  async findAllEnabled(tenantId: string): Promise<Policy[]> {
    return this.repo.find({ where: { tenantId, enabled: true } });
  }

  async findOne(tenantId: string, id: string): Promise<Policy> {
    const policy = await this.repo.findOne({ where: { id, tenantId } });
    if (!policy) throw new NotFoundException(`Policy ${id} not found`);
    return policy;
  }

  async update(tenantId: string, id: string, dto: UpdatePolicyDto): Promise<Policy> {
    const policy = await this.findOne(tenantId, id);
    Object.assign(policy, dto);
    return this.repo.save(policy);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const policy = await this.findOne(tenantId, id);
    await this.repo.remove(policy);
  }
}
