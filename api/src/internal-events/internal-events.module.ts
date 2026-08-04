import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trace } from '@llm-sentinel/tracing';
import { InternalEventsController } from './internal-events.controller';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Trace]), DashboardModule, AlertsModule, AuthModule],
  controllers: [InternalEventsController],
})
export class InternalEventsModule {}
