import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TracesController } from './traces.controller';
import { TracesService } from './traces.service';
import { Trace } from '../trace/trace.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Trace]), AuthModule],
  controllers: [TracesController],
  providers: [TracesService],
})
export class TracesModule {}
