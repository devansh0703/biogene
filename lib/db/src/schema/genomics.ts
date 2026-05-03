import { pgTable, text, integer, real, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const genomicsJobsTable = pgTable("genomics_jobs", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  status: text("status").notNull().default("pending"),
  variantCount: integer("variant_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const variantsTable = pgTable("variants", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => genomicsJobsTable.id),
  chromosome: text("chromosome").notNull(),
  position: integer("position").notNull(),
  ref: text("ref").notNull(),
  alt: text("alt").notNull(),
  quality: real("quality"),
  filter: text("filter"),
  rsId: text("rs_id"),
  gene: text("gene"),
  consequence: text("consequence"),
  significance: text("significance"),
  alleleFrequency: real("allele_frequency"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGenomicsJobSchema = createInsertSchema(genomicsJobsTable);
export const insertVariantSchema = createInsertSchema(variantsTable);
export type GenomicsJob = typeof genomicsJobsTable.$inferSelect;
export type InsertGenomicsJob = z.infer<typeof insertGenomicsJobSchema>;
export type Variant = typeof variantsTable.$inferSelect;
export type InsertVariant = z.infer<typeof insertVariantSchema>;
