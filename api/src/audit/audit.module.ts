import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { Trace } from '@llm-sentinel/tracing';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Trace]), AuthModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
