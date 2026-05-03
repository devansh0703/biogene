import { pgTable, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const crisprJobsTable = pgTable("crispr_jobs", {
  id: text("id").primaryKey(),
  geneName: text("gene_name"),
  status: text("status").notNull().default("pending"),
  guidesCount: integer("guides_count"),
  pamType: text("pam_type").default("NGG"),
  sequenceLength: integer("sequence_length"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const guideRnasTable = pgTable("guide_rnas", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => crisprJobsTable.id),
  sequence: text("sequence").notNull(),
  pamSequence: text("pam_sequence").notNull(),
  position: integer("position").notNull(),
  strand: text("strand").notNull(),
  score: real("score").notNull(),
  gcContent: real("gc_content").notNull(),
  offTargetScore: real("off_target_score"),
  selfComplementarity: real("self_complementarity"),
  rank: integer("rank").notNull(),
});

export const insertCrisprJobSchema = createInsertSchema(crisprJobsTable);
export const insertGuideRnaSchema = createInsertSchema(guideRnasTable);
export type CrisprJob = typeof crisprJobsTable.$inferSelect;
export type GuideRna = typeof guideRnasTable.$inferSelect;
export type InsertCrisprJob = z.infer<typeof insertCrisprJobSchema>;
export type InsertGuideRna = z.infer<typeof insertGuideRnaSchema>;
