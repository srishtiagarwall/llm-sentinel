import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // eval-service's real job is polling the trace-eval queue (started by
  // SqsConsumerModule's onModuleInit, independent of HTTP) — the listen()
  // call below only exists so this process binds $PORT and satisfies
  // platforms that require a web service to do so (e.g. Render's free tier,
  // which has no Background Worker plan). Locally/Docker Compose this port
  // is simply unused.
  const port = process.env.PORT ?? 3002;
  await app.listen(port);
  console.log(`LLM Sentinel Eval Service started — listening on SQS, HTTP on port ${port}`);
}
bootstrap();
