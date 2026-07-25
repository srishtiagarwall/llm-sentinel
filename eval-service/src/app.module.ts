import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvalModule } from './evaluators/eval.module';
import { SqsConsumerModule } from './sqs/sqs-consumer.module';
import { Trace } from './trace/trace.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [Trace],
        synchronize: false, // gateway owns schema sync
      }),
    }),

    EvalModule,
    SqsConsumerModule,
  ],
})
export class AppModule {}
