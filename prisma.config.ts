import 'dotenv/config';
import type { PrismaConfig } from 'prisma';

export default {
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./.cache/usage.db',
  },
} satisfies PrismaConfig;
