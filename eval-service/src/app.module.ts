import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvalModule } from './evaluators/eval.module';
import { SqsConsumerModule } from './sqs/sqs-consumer.module';
import { Trace } from '@llm-sentinel/tracing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
  // AppController/AppService give this service a root HTTP route —
  // eval-service's actual job (polling the trace-eval queue) is unrelated to
  // HTTP and runs regardless of whether anything ever calls this route. It
  // exists only so eval-service can run as a Render free-tier Web Service
  // (the free tier has no Background Worker plan) instead of needing a paid
  // worker plan — see render.yaml and the README's Render walkthrough.
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
