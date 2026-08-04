import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trace } from '@llm-sentinel/tracing';
import { AuthModule } from './auth/auth.module';
import { TracesModule } from './traces/traces.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuditModule } from './audit/audit.module';
import { PoliciesModule } from './policies/policies.module';
import { Policy } from './policies/policy.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [Trace, Policy],
        synchronize: false,
      }),
    }),

    AuthModule,
    TracesModule,
    DashboardModule,
    AlertsModule,
    AuditModule,
    PoliciesModule,
  ],
})
export class AppModule {}
