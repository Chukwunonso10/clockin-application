import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // CLI operations like db push / migrate require direct connections (DIRECT_URL) rather than transaction poolers
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/clockin_dev?schema=public",
  },
});
