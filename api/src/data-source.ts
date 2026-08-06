import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Trace } from '@llm-sentinel/tracing';
import { Policy } from './policies/policy.entity';
import { User } from './auth/user.entity';

// Used only by the TypeORM CLI (npm run migration:* in api/package.json) —
// the running app builds its own connection via TypeOrmModule.forRootAsync
// in app.module.ts. Keep the entity list in sync between the two.
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Trace, Policy, User],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
