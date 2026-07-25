import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // eval-service has no HTTP routes — it's a pure SQS consumer
  await app.init();
  console.log('LLM Sentinel Eval Service started — listening on SQS');
}
bootstrap();
