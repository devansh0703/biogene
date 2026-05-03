import { pgTable, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const samplesTable = pgTable("samples", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("active"),
  concentration: real("concentration"),
  unit: text("unit"),
  volume: real("volume"),
  organism: text("organism"),
  tissue: text("tissue"),
  storageLocation: text("storage_location"),
  barcode: text("barcode"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const experimentsTable = pgTable("experiments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("planned"),
  sampleIds: jsonb("sample_ids").$type<string[]>().default([]),
  protocol: text("protocol"),
  notes: text("notes"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSampleSchema = createInsertSchema(samplesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExperimentSchema = createInsertSchema(experimentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Sample = typeof samplesTable.$inferSelect;
export type Experiment = typeof experimentsTable.$inferSelect;
export type InsertSample = z.infer<typeof insertSampleSchema>;
export type InsertExperiment = z.infer<typeof insertExperimentSchema>;
