import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 Configuration
 * Reads the PostgreSQL connection URL strictly from the environment (DATABASE_URL).
 * Never hardcode database credentials in this file.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
