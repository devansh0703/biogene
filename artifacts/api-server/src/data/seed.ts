// In-memory seed data for the demo API. Rich, realistic bioinformatics records
// so the app loads with real content without requiring a live Postgres.

export interface Row {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

const picks = {
  ref: ["A", "C", "G", "T"],
  alt: ["G", "A", "T", "C"],
};

export const seed = {
  genomicsJobs: [
    { filename: "tumor_exome_wgs_pass.vcf", status: "succeeded", variantCount: 1873, completedAt: daysAgo(9) },
    { filename: "family_trio_snps.vcf", status: "succeeded", variantCount: 421, completedAt: daysAgo(7) },
    { filename: "pancancer_chip_raw.vcf", status: "running", variantCount: 0, completedAt: null },
    { filename: "germline_panel.csv", status: "succeeded", variantCount: 68, completedAt: daysAgo(3) },
    { filename: "invitro_mutagenesis.tsv", status: "pending", variantCount: 0, completedAt: null },
  ],

  variants: [
    variant("BRCA1", "17", 41246119, "missense_variant", "pathogenic", 0.43, "rs1131691044"),
    variant("BRCA1", "17", 41245478, "frameshift_variant", "pathogenic", 0.62, "rs80357906"),
    variant("BRCA2", "13", 32332243, "stop_gained", "pathogenic", 0.98, "rs587782329"),
    variant("TP53", "17", 7578406, "missense_variant", "pathogenic", 0.51, "rs28934578"),
    variant("TP53", "17", 7577538, "missense_variant", "likely_pathogenic", 0.37, "rs121912664"),
    variant("EGFR", "7", 55249063, "missense_variant", "likely_pathogenic", 0.31, "rs121913465"),
    variant("EGFR", "7", 55242515, "frameshift_variant", "pathogenic", 0.22, "rs121913438"),
    variant("KRAS", "12", 25398285, "missense_variant", "pathogenic", 0.44, "rs121913530"),
    variant("KRAS", "12", 25380275, "missense_variant", "likely_pathogenic", 0.29, "rs112445441"),
    variant("ALK", "2", 29415661, "intron_variant", "benign", 0.09, "rs35645112"),
    variant("BRAF", "7", 140453136, "missense_variant", "pathogenic", 0.55, "rs113488022"),
    variant("PTEN", "10", 89624258, "frameshift_variant", "pathogenic", 0.41, "rs121909225"),
    variant("PIK3CA", "3", 178936091, "missense_variant", "pathogenic", 0.36, "rs104886003"),
    variant("MTHFR", "1", 11854476, "missense_variant", "benign", 0.34, "rs1801133"),
    variant("APOE", "19", 45412079, "missense_variant", "benign", 0.27, "rs7412"),
    variant("CFTR", "7", 117199644, "frameshift_variant", "pathogenic", 0.48, "rs113993960"),
    variant("COL1A1", "17", 48275363, "missense_variant", "likely_pathogenic", 0.31, "rs28936390"),
    variant("HBB", "11", 5248232, "missense_variant", "pathogenic", 0.83, "rs334"),
    variant("VHL", "3", 10183628, "missense_variant", "pathogenic", 0.39, "rs5030820"),
    variant("RET", "10", 43114180, "missense_variant", "likely_pathogenic", 0.28, "rs750036341"),
    variant("EGFR", "7", 55242415, "missense_variant", "pathogenic", 0.33, "rs121913431"),
    variant("TP53", "17", 7577111, "splice_acceptor_variant", "pathogenic", 0.52, "rs121912660"),
    variant("BRCA2", "13", 32315400, "stop_gained", "pathogenic", 0.94, "rs80358871"),
    variant("ATM", "11", 108175462, "missense_variant", "likely_pathogenic", 0.26, "rs121434299"),
    variant("ERBB2", "17", 37880204, "missense_variant", "likely_pathogenic", 0.24, "rs121913473"),
  ],

  crisprJobs: [
    { geneName: "TP53", status: "succeeded", guidesCount: 24, pamType: "NGG", sequenceLength: 1820 },
    { geneName: "BRCA1", status: "succeeded", guidesCount: 18, pamType: "NGG", sequenceLength: 5592 },
    { geneName: "EGFR", status: "running", guidesCount: 0, pamType: "NGG", sequenceLength: 414 },
    { geneName: "KRAS", status: "succeeded", guidesCount: 31, pamType: "NGG", sequenceLength: 2203 },
    { geneName: "MYC", status: "queued", guidesCount: 0, pamType: "NGA", sequenceLength: 1139 },
  ],

  guideRnas: [
    guide("TP53", "GAGTTCCTCATGCTGGGCCA", "GGG", 152, "+", 0.87, 52.1, 0.11, 1),
    guide("TP53", "GAGTCTGCCTCAAGGCTCCA", "CGG", 789, "-", 0.84, 58.6, 0.15, 2),
    guide("TP53", "CCTGATGGTCCATGGTGCAC", "AGG", 1241, "+", 0.78, 54.3, 0.22, 3),
    guide("TP53", "TGACAGCGAAGGTGAAACAC", "GGG", 341, "-", 0.82, 55.0, 0.18, 4),
    guide("BRCA1", "GATTCCTGGCTCTGCATCAC", "GGG", 210, "+", 0.91, 55.8, 0.09, 1),
    guide("BRCA1", "CAGAGTACATCGTACTTCCC", "AGG", 1440, "-", 0.82, 53.7, 0.18, 2),
    guide("BRCA1", "AATCTTGAAGTCCCAGGCCA", "GGG", 3310, "+", 0.86, 52.9, 0.14, 3),
    guide("KRAS", "GTTGGAGCTGGTGGCGTAGGC", "GGG", 62, "+", 0.96, 60.0, 0.06, 1),
    guide("KRAS", "ACTGGTGGAGTATTTGATAGT", "AGG", 147, "-", 0.88, 45.0, 0.12, 2),
    guide("KRAS", "GTTGGAGCTGGTGGCGTAGG", "CGG", 61, "+", 0.93, 61.9, 0.08, 3),
  ],

  samples: [
    sample("Tumor biopsy A-104", "Tumor", "48.6", "ng/ul", 120, "Homo sapiens", "Breast", "Fridge-2 Rack-B", "BF-A104", "Infiltrating ductal carcinoma"),
    sample("Blood WBC B-217", "Blood", "52.1", "ng/ul", 400, "Homo sapiens", "Peripheral blood", "Fridge-1 Rack-A", "BF-B217", "Matched normal germline"),
    sample("FFPE Lung C-330", "FFPE", "18.2", "ng/ul", 45, "Homo sapiens", "Lung", "Rack-4 Shelf-2", "BF-C330", "NSCLC adenocarcinoma"),
    sample("Plasma cfDNA D-118", "Liquid biopsy", "9.4", "ng/ul", 200, "Homo sapiens", "Plasma", "Fridge-2 Rack-C", "BF-D118", "ctDNA monitoring"),
    sample("Cell line HEK293", "Cell line", "73.0", "ng/ul", 300, "Homo sapiens", "Embryonic kidney", "Rack-1 Shelf-1", "BF-E001", "CRISPR host"),
    sample("Cell line HeLa", "Cell line", "81.3", "ng/ul", 300, "Homo sapiens", "Cervix", "Rack-1 Shelf-2", "BF-E002", "Knockdown reference"),
    sample("RNA Brain Cortex X-221", "RNA", "120.6", "ng/ul", 80, "Homo sapiens", "Brain cortex", "Fridge-3 Rack-A", "BF-X221", "Bulk RNA-seq"),
    sample("RNA Liver Y-552", "RNA", "94.2", "ng/ul", 90, "Homo sapiens", "Liver", "Fridge-3 Rack-B", "BF-Y552", "Bulk RNA-seq"),
    sample("Mouse tumor MC38", "Tumor", "31.7", "ng/ul", 60, "Mus musculus", "Colon", "Rack-6 Shelf-2", "BF-M001", "Syngeneic model"),
    sample("FFPE Colon G-444", "FFPE", "12.8", "ng/ul", 35, "Homo sapiens", "Colon", "Fridge-4 Rack-C", "BF-G444", "CRC resection"),
    sample("DNA NA12878 ref", "DNA reference", "66.4", "ng/ul", 500, "Homo sapiens", "Lymphoblastoid", "Rack-9 Shelf-1", "BF-R001", "Genome in a bottle"),
    sample("Archived Fetal K-990", "FFPE", "7.9", "ng/ul", 20, "Homo sapiens", "Placenta", "Rack-7 Rack-C", "BF-K990", "Archived, low yield"),
  ],

  experiments: [
    exp("Whole-exome trio capture", "WES", "completed", "Agilent SureSelect V6", "Tumor + matched normal"),
    exp("CRISPR knockout screen", "CRISPR-Cas9", "running", "custom", "TP53 dependency screen"),
    exp("ATAC-seq chromatin profiling", "ATAC-seq", "completed", "Active Motif", "Open chromatin atlas"),
    exp("RNA-seq organoid profiling", "RNA-seq", "planned", "Illumina TruSeq", "Patient-derived organoids"),
    exp("Car-T editing validation", "CRISPR-Cas9", "running", "custom", "primary T-cell editing"),
    exp("Methylation EPIC array", "Methylation", "completed", "Illumina EPIC", "TCGA-normal comparison"),
  ],

  nlpEntities: [
    ent("olaparib", "drug", "CHEBI:34327", 0.96),
    ent("BRCA1", "gene", "HGNC:1100", 0.99),
    ent("breast cancer", "disease", "MONDO:0003706", 0.94),
    ent("cisplatin", "drug", "CHEBI:27899", 0.91),
    ent("TP53", "gene", "HGNC:11998", 0.98),
    ent("trastuzumab", "drug", "CHEBI:38607", 0.95),
    ent("HER2", "gene", "HGNC:3430", 0.97),
    ent("ovarian cancer", "disease", "MONDO:0003665", 0.93),
    ent("paclitaxel", "drug", "CHEBI:45863", 0.9),
    ent("EGFR", "gene", "HGNC:3236", 0.96),
    ent("glioblastoma", "disease", "MONDO:0014532", 0.92),
    ent("temozolomide", "drug", "CHEBI:82141", 0.85),
    ent("VEGF", "gene", "HGNC:12680", 0.89),
    ent("lung adenocarcinoma", "disease", "MONDO:0005052", 0.9),
    ent("crizotinib", "drug", "CHEBI:90112", 0.84),
    ent("ALK", "gene", "HGNC:427", 0.95),
    ent("infliximab", "drug", "CHEBI:62166", 0.82),
    ent("TNF", "gene", "HGNC:11892", 0.88),
    ent("rheumatoid arthritis", "disease", "MONDO:0008383", 0.91),
    ent("methotrexate", "drug", "CHEBI:50673", 0.87),
    ent("metformin", "drug", "CHEBI:6801", 0.93),
    ent("type 2 diabetes", "disease", "MONDO:0005148", 0.92),
    ent("INS", "gene", "HGNC:6081", 0.9),
    ent("rickets", "disease", "MONDO:0007106", 0.79),
    ent("PDCD1", "gene", "HGNC:8760", 0.94),
  ],

  nlpRelations: [
    rel("olaparib", "treats", "ovarian cancer", 0.92),
    rel("trastuzumab", "treats", "breast cancer", 0.9),
    rel("BRCA1", "associated_with", "breast cancer", 0.95),
    rel("cisplatin", "sensitizes", "TP53", 0.87),
    rel("crizotinib", "targets", "ALK", 0.85),
    rel("temozolomide", "treats", "glioblastoma", 0.84),
    rel("EGFR", "associated_with", "lung adenocarcinoma", 0.9),
    rel("paclitaxel", "treats", "ovarian cancer", 0.81),
    rel("infliximab", "targets", "TNF", 0.86),
    rel("methotrexate", "treats", "rheumatoid arthritis", 0.83),
    rel("metformin", "treats", "type 2 diabetes", 0.89),
    rel("VEGF", "associated_with", "glioblastoma", 0.77),
    rel("HER2", "associated_with", "ovarian cancer", 0.72),
    rel("PDCD1", "associated_with", "lung adenocarcinoma", 0.76),
  ],

  transcriptomicsJobs: [
    { name: "Tumor RNA-seq T-104", status: "succeeded", sampleType: "RNA", readsCount: 18250000, genesDetected: 21482, referenceGenome: "GRCh38", pairedEnd: "true" },
    { name: "Cell line screen bulk RNA", status: "queued", sampleType: "RNA", readsCount: 0, genesDetected: 0, referenceGenome: "GRCh38", pairedEnd: "true" },
    { name: "Liver normal bulk RNA", status: "succeeded", sampleType: "RNA", readsCount: 15200000, genesDetected: 20451, referenceGenome: "GRCh38", pairedEnd: "true" },
    { name: "scRNA PBMC 10x V3", status: "running", sampleType: "scRNA", readsCount: 95000000, genesDetected: 18933, referenceGenome: "GRCh38", pairedEnd: "false" },
    { name: "Brain cortex bulk RNA", status: "succeeded", sampleType: "RNA", readsCount: 20700000, genesDetected: 22641, referenceGenome: "GRCh38", pairedEnd: "true" },
    { name: "Tumor organoid RNA-seq", status: "failed", sampleType: "RNA", readsCount: 4180000, genesDetected: 0, referenceGenome: "GRCh38", pairedEnd: "true" },
    { name: "Blood PBMC bulk RNA", status: "succeeded", sampleType: "RNA", readsCount: 13200000, genesDetected: 17109, referenceGenome: "GRCh38", pairedEnd: "true" },
  ],
};

export function withIds(list: Array<Record<string, unknown>>): Row[] {
  return list.map((r) => ({ ...r, id: r.id as string, createdAt: new Date(), updatedAt: new Date() }));
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function variant(
  gene: string, chromosome: string, position: number,
  consequence: string, significance: string, af: number, rsId: string,
) {
  return {
    id: uid(`${gene}-${rsId}`),
    jobId: "",
    chromosome,
    position,
    ref: picks.ref[Math.floor(Math.random() * picks.ref.length)],
    alt: picks.alt[Math.floor(Math.random() * picks.alt.length)],
    quality: Math.round((70 + Math.random() * 30) * 10) / 10,
    filter: "PASS",
    rsId,
    gene,
    consequence,
    significance,
    alleleFrequency: af,
    createdAt: daysAgo(Math.floor(Math.random() * 8) + 1),
  };
}

function guide(
  geneName: string, sequence: string, pam: string, position: number,
  strand: string, score: number, gc: number, offTarget: number, rank: number,
) {
  return {
    id: uid(`${geneName}-p${position}`),
    jobId: "",
    sequence,
    pamSequence: pam,
    position,
    strand,
    score,
    gcContent: gc,
    offTargetScore: offTarget,
    selfComplementarity: Math.round((score * 100) % 40) / 100,
    rank,
    createdAt: daysAgo(Math.floor(Math.random() * 5)),
  };
}

function sample(
  name: string, type: string, concentration: string, unit: string, volume: number,
  organism: string, tissue: string, storage: string, barcode: string, notes: string,
) {
  return {
    id: uid(name), name, type, status: "active",
    concentration: parseFloat(concentration), unit, volume,
    organism, tissue, storageLocation: storage, barcode, notes,
    createdAt: daysAgo(Math.floor(Math.random() * 20) + 1),
  };
}

function exp(name: string, type: string, status: string, protocol: string, notes: string) {
  return {
    id: uid(name), name, type, status,
    sampleIds: [] as string[], protocol, notes,
    startedAt: status === "running" || status === "completed" ? daysAgo(2) : null,
    completedAt: status === "completed" ? daysAgo(1) : null,
    createdAt: daysAgo(Math.floor(Math.random() * 15) + 1),
  };
}

function ent(entityText: string, entityType: string, normalizedId: string, confidence: number) {
  return { id: uid(entityText), entityText, entityType, normalizedId, confidence, sourceText: null, startOffset: null, endOffset: null, createdAt: daysAgo(4) };
}

function rel(subjectText: string, predicate: string, objectText: string, confidence: number) {
  return { id: uid(subjectText + objectText), subjectText, predicate, objectText, confidence, evidence: "co-occurrence", createdAt: daysAgo(4) };
}

export function uid(seedStr: string): string {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) | 0;
  return `seed-${(h >>> 0).toString(16)}-${Math.floor(Math.random() * 1e6).toString(16)}`;
}