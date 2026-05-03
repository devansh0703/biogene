import { pgTable, text, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nlpEntitiesTable = pgTable("nlp_entities", {
  id: text("id").primaryKey(),
  entityText: text("entity_text").notNull(),
  entityType: text("entity_type").notNull(),
  normalizedId: text("normalized_id"),
  confidence: real("confidence").notNull(),
  sourceText: text("source_text"),
  startOffset: integer("start_offset"),
  endOffset: integer("end_offset"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const nlpRelationsTable = pgTable("nlp_relations", {
  id: text("id").primaryKey(),
  subjectText: text("subject_text").notNull(),
  predicate: text("predicate").notNull(),
  objectText: text("object_text").notNull(),
  confidence: real("confidence").notNull(),
  evidence: text("evidence"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNlpEntitySchema = createInsertSchema(nlpEntitiesTable);
export const insertNlpRelationSchema = createInsertSchema(nlpRelationsTable);
export type NlpEntity = typeof nlpEntitiesTable.$inferSelect;
export type NlpRelation = typeof nlpRelationsTable.$inferSelect;
export type InsertNlpEntity = z.infer<typeof insertNlpEntitySchema>;
export type InsertNlpRelation = z.infer<typeof insertNlpRelationSchema>;
