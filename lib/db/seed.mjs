import pg from "pg";
import { randomUUID } from "node:crypto";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // -------- GENOMICS --------
  const gj1 = randomUUID();
  const gj2 = randomUUID();
  await pool.query(
    `INSERT INTO genomics_jobs (id, filename, status, variant_count, completed_at) VALUES
      ($1, 'tumor_exome_wgs_pass.vcf', 'succeeded', 1873, now() - interval '3 days'),
      ($2, 'family_trio_snps.vcf', 'succeeded', 421, now() - interval '1 day')`,
    [gj1, gj2],
  );

  const variants = [
    [gj1, "chr17", 41246119, "A", "G", 98.5, "PASS", "rs1131691044", "BRCA1", "missense_variant", "pathogenic", 0.43],
    [gj1, "chr13", 32332243, "C", "T", 99.9, "PASS", "rs587782329", "BRCA2", "stop_gained", "pathogenic", 0.98],
    [gj1, "chr17", 7578406, "G", "T", 95.2, "PASS", "rs28934578", "TP53", "missense_variant", "pathogenic", 0.51],
    [gj2, "chr7", 55249063, "C", "G", 88.4, "PASS", "rs121913465", "EGFR", "missense_variant", "likely_pathogenic", 0.31],
    [gj2, "chr22", 50623591, "A", "G", 72.8, "PASS", "rs113993960", "BCR", "intron_variant", "benign", 0.12],
  ];
  for (const v of variants) {
    await pool.query(
      `INSERT INTO variants (id, job_id, chromosome, position, ref, alt, quality, filter, rs_id, gene, consequence, significance, allele_frequency, created_at) VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now() - interval '3 days')`,
      [randomUUID(), ...v],
    );
  }

  // -------- CRISPR --------
  const cj1 = randomUUID();
  const cj2 = randomUUID();
  await pool.query(
    `INSERT INTO crispr_jobs (id, gene_name, status, guides_count, pam_type, sequence_length, created_at) VALUES
      ($1, 'TP53', 'succeeded', 24, 'NGG', 1820, now() - interval '2 days'),
      ($2, 'BRCA1', 'running', 12, 'NGG', 5592, now() - interval '5 hours')`,
    [cj1, cj2],
  );
  const guides = [
    [cj1, "GAGTTCCTCATGCTGGGCCA", "GGG", 152, "+", 0.87, 52.1, 0.11, 0.24, 1],
    [cj1, "GAGTCTGCCTCAAGGCTCCA", "CGG", 789, "-", 0.84, 58.6, 0.15, 0.3, 2],
    [cj1, "CCTGATGGTCCATGGTGCAC", "AGG", 1241, "+", 0.78, 54.3, 0.22, 0.41, 3],
    [cj2, "GATTCCTGGCTCTGCATCAC", "GGG", 210, "+", 0.91, 55.8, 0.09, 0.19, 1],
    [cj2, "CAGAGTACATCGTACTTCCC", "AGG", 1440, "-", 0.82, 53.7, 0.18, 0.35, 2],
  ];
  for (const g of guides) {
    await pool.query(
      `INSERT INTO guide_rnas (id, job_id, sequence, pam_sequence, position, strand, score, gc_content, off_target_score, self_complementarity, rank) VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [randomUUID(), ...g],
    );
  }

  // -------- LIMS --------
  const s1 = randomUUID();
  const s2 = randomUUID();
  const s3 = randomUUID();
  const e1 = randomUUID();
  await pool.query(
    `INSERT INTO samples (id, name, type, status, concentration, unit, volume, organism, tissue, storage_location, barcode, notes, created_at, updated_at) VALUES
      ($1, 'Tumor biopsy A-104', 'Tumor', 'active', 38.5, 'ng/ul', 120, 'Homo sapiens', 'Breast', 'Fridge-2 Rack-B', 'BF-A104', 'Infiltrating ductal carcinoma', now() - interval '5 days', now()),
      ($2, 'Blood WBC B-217', 'Blood', 'active', 52.1, 'ng/ul', 400, 'Homo sapiens', 'Peripheral blood', 'Fridge-1 Rack-A', 'BF-B217', 'Matched normal germline', now() - interval '4 days', now()),
      ($3, 'FFPE Lung C-330', 'FFPE', 'archived', 18.2, 'ng/ul', 45, 'Homo sapiens', 'Lung', 'Rack-4 Shelf-2', 'BF-C330', 'NSCLC adenocarcinoma', now() - interval '30 days', now())`,
    [s1, s2, s3],
  );
  await pool.query(
    `INSERT INTO experiments (id, name, type, status, sample_ids, protocol, notes, started_at, created_at, updated_at) VALUES
      ($1, 'Whole-exome trio capture', 'WES', 'completed', $2::jsonb, 'Agilent SureSelect V6', 'Tumor + matched normal', now() - interval '3 days', now() - interval '3 days', now()),
      ($3, 'CRISPR knockout screen', 'CRISPR-Cas9', 'in_progress', $2::jsonb, 'custom', 'TP53 dependency screen', now() - interval '5 hours', now() - interval '5 hours', now())`,
    [e1, JSON.stringify([s1, s2]), randomUUID()],
  );

  // -------- NLP --------
  await pool.query(
    `INSERT INTO nlp_entities (id, entity_text, entity_type, normalized_id, confidence, source_text, start_offset, end_offset, created_at) VALUES
      ($1, 'olaparib', 'DRUG', 'CHEBI:34327', 0.96, 'Olaparib maintenance therapy in BRCA-mutated ovarian cancer', 0, 8, now() - interval '1 day'),
      ($2, 'BRCA1', 'GENE', 'HGNC:1100', 0.99, 'germline pathogenic BRCA1 variants confer elevated hereditary breast cancer risk', 0, 5, now() - interval '1 day'),
      ($3, 'breast cancer', 'DISEASE', 'MONDO:0003706', 0.94, 'hereditary breast cancer risk', 42, 55, now() - interval '1 day'),
      ($4, 'cisplatin', 'DRUG', 'CHEBI:27899', 0.91, 'cisplatin sensitivity in TP53-null cell lines', 0, 8, now() - interval '1 day'),
      ($5, 'TP53', 'GENE', 'HGNC:11998', 0.98, 'cisplatin sensitivity in TP53-null cell lines', 25, 29, now() - interval '1 day')`,
    [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()],
  );
  await pool.query(
    `INSERT INTO nlp_relations (id, subject_text, predicate, object_text, confidence, evidence, created_at) VALUES
      ($1, 'olaparib', 'TREATS', 'BRCA1', 0.92, 'olaparib maintenance therapy in BRCA-mutated ovarian cancer', now() - interval '1 day'),
      ($2, 'cisplatin', 'SENSITIZES', 'TP53', 0.87, 'cisplatin sensitivity in TP53-null cell lines', now() - interval '1 day'),
      ($3, 'BRCA1', 'ASSOCIATED_WITH', 'breast cancer', 0.95, 'hereditary breast cancer risk', now() - interval '1 day')`,
    [randomUUID(), randomUUID(), randomUUID()],
  );

  // -------- TRANSCRIPTOMICS --------
  await pool.query(
    `INSERT INTO transcriptomics_jobs (id, name, status, sample_type, reads_count, genes_detected, reference_genome, paired_end, created_at, completed_at) VALUES
      ($1, 'Tumor RNA-seq T-104', 'succeeded', 'RNA', 18250000, 21482, 'GRCh38', 'true', now() - interval '6 days', now() - interval '6 days'),
      ($2, 'Cell line screen bulk RNA', 'queued', 'RNA', 6230000, 19871, 'GRCh38', 'true', now() - interval '2 hours', null)`,
    [randomUUID(), randomUUID()],
  );

  console.log("Seed complete.");
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });