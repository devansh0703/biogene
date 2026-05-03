import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transcriptomicsJobsTable = pgTable("transcriptomics_jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("pending"),
  sampleType: text("sample_type").notNull(),
  readsCount: integer("reads_count"),
  genesDetected: integer("genes_detected"),
  referenceGenome: text("reference_genome").default("GRCh38"),
  pairedEnd: text("paired_end").default("false"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertTranscriptomicsJobSchema = createInsertSchema(transcriptomicsJobsTable).omit({ id: true, createdAt: true });
export type TranscriptomicsJob = typeof transcriptomicsJobsTable.$inferSelect;
export type InsertTranscriptomicsJob = z.infer<typeof insertTranscriptomicsJobSchema>;
