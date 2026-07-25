import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardGateway } from './dashboard.gateway';
import { Trace } from '../trace/trace.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Trace]), AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardGateway],
  exports: [DashboardGateway],
})
export class DashboardModule {}
