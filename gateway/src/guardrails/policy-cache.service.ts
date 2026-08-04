import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom } from 'rxjs';
import Redis from 'ioredis';

export interface CachedPolicy {
  id: string;
  name: string;
  condition: string;
  action: 'BLOCK' | 'ALERT';
  alert: boolean;
  model: string | null;
  userId: string | null;
}

const CACHE_TTL_SECONDS = 30;
const CACHE_KEY_PREFIX = 'policy-cache:';

@Injectable()
export class PolicyCacheService {
  private readonly logger = new Logger(PolicyCacheService.name);
  private readonly redis: Redis;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.redis = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  }

  // Reads from Redis cache; refreshes from the api service on miss/stale so the
  // hot path avoids a network call on every request under normal operation.
  async getEnabledPolicies(tenantId: string): Promise<CachedPolicy[]> {
    const cacheKey = `${CACHE_KEY_PREFIX}${tenantId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      this.logger.warn(`Redis read failed for ${cacheKey}, falling back to fetch`, err as Error);
    }

    return this.refresh(tenantId);
  }

  private async refresh(tenantId: string): Promise<CachedPolicy[]> {
    // api's NestJS app applies a global 'api' prefix (see api/src/main.ts).
    const apiUrl = this.config.get<string>('API_SERVICE_URL') ?? 'http://localhost:3001';
    const serviceToken = this.jwtService.sign({ sub: 'gateway-service', tenantId, role: 'service' });

    try {
      const response = await firstValueFrom(
        this.http.get<CachedPolicy[]>(`${apiUrl}/api/policies/enabled`, {
          headers: { Authorization: `Bearer ${serviceToken}` },
        }),
      );

      const policies = response.data ?? [];
      await this.redis
        .set(`${CACHE_KEY_PREFIX}${tenantId}`, JSON.stringify(policies), 'EX', CACHE_TTL_SECONDS)
        .catch((err) => this.logger.warn('Redis write failed, cache not persisted', err as Error));

      return policies;
    } catch (err) {
      this.logger.error(`Failed to fetch policies for tenant ${tenantId} — enforcing no policies`, err as Error);
      // Fail open on the policy fetch itself (not on individual rule evaluation) —
      // an api outage shouldn't take the gateway down, but it does mean policy
      // enforcement is temporarily unavailable for tenants without a warm cache.
      return [];
    }
  }
}
