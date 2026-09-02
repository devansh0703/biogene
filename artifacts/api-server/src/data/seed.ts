// In-memory seed data for the demo API. Generates large, realistic
// bioinformatics datasets so every list/dashboard is fully populated without
// requiring a live Postgres.

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

const GENE_PANEL: Array<[string, string, number]> = [
  ["BRCA1", "17", 41246119], ["BRCA2", "13", 32332243], ["TP53", "17", 7578406],
  ["EGFR", "7", 55249063], ["KRAS", "12", 25398285], ["ALK", "2", 29415661],
  ["BRAF", "7", 140453136], ["PTEN", "10", 89624258], ["PIK3CA", "3", 178936091],
  ["MTHFR", "1", 11854476], ["APOE", "19", 45412079], ["CFTR", "7", 117199644],
  ["COL1A1", "17", 48275363], ["HBB", "11", 5248232], ["VHL", "3", 10183628],
  ["RET", "10", 43114180], ["ATM", "11", 108175462], ["ERBB2", "17", 37880204],
  ["MYC", "8", 128750000], ["NRAS", "1", 115258748], ["MET", "7", 116339757],
  ["FGFR3", "4", 1803561], ["IDH1", "2", 209113057], ["JAK2", "9", 5073770],
  ["ABL1", "9", 133729449], ["CDH1", "16", 68852955], ["MLH1", "3", 37034836],
  ["MSH2", "2", 47630471], ["RB1", "13", 48933661], ["SMAD4", "18", 51030505],
];

const CONSEQUENCES = [
  "missense_variant", "frameshift_variant", "stop_gained", "splice_acceptor_variant",
  "splice_donor_variant", "synonymous_variant", "intron_variant", "5_prime_UTR_variant",
  "3_prime_UTR_variant", "inframe_deletion", "start_lost", "nonsense",
];

const SIGNIFICANCES = ["pathogenic", "likely_pathogenic", "benign", "likely_benign", "uncertain_significance"];

const CHROMOSOMES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "X", "Y"];

const TISSUES = [
  "Breast", "Lung", "Colon", "Liver", "Brain cortex", "Prostate", "Ovary", "Pancreas",
  "Kidney", "Peripheral blood", "Plasma", "Bone marrow", "Lymph node", "Skin",
  "Stomach", "Esophagus", "Bladder", "Cervix", "Endometrium", "Thyroid",
];

const ORGANSMS = ["Homo sapiens", "Mus musculus", "Rattus norvegicus", "Canis lupus familiaris"];

const PAMS = ["NGG", "NGA", "NNGRRT", "TTTV"];

const PROTOCOLS = [
  "Agilent SureSelect V6", "Illumina TruSeq", "custom", "Active Motif", "Illumina EPIC",
  "10x Genomics", "KAPA HyperPrep", "Nextera Flex", "NEBNext", "Twist Biosciences",
];

const GENES = GENE_PANEL.map((g) => g[0]);

const DRUGS = [
  "olaparib", "cisplatin", "trastuzumab", "paclitaxel", "temozolomide", "crizotinib",
  "infliximab", "methotrexate", "metformin", "imatinib", "erlotinib", "sorafenib",
  "sunitinib", "bevacizumab", "nivolumab", "pembrolizumab", "doxorubicin", "gemcitabine",
  "tamoxifen", "anastrozole", "letrozole", "carboplatin", "5-fluorouracil", "oxaliplatin",
  "irinotecan", "docetaxel", "vinblastine", "bortezomib", "rituximab", "adalimumab",
];

const DISEASES = [
  "breast cancer", "ovarian cancer", "lung adenocarcinoma", "glioblastoma",
  "rheumatoid arthritis", "type 2 diabetes", "colon cancer", "pancreatic cancer",
  "prostate cancer", "melanoma", "acute myeloid leukemia", "chronic myeloid leukemia",
  "alzheimer disease", "parkinson disease", "cystic fibrosis", "sickle cell disease",
  "hereditary nonpolyposis colorectal cancer", "neuroblastoma", "renal cell carcinoma",
  "hepatocellular carcinoma", "multiple myeloma", "non-hodgkin lymphoma", "melanoma",
  "gastric cancer", "endometrial cancer",
];

const RELATION_PREDICATES = ["treats", "targets", "associated_with", "sensitizes", "binds", "inhibits"];

const SAMPLE_TYPES = ["Tumor", "Blood", "FFPE", "Liquid biopsy", "Cell line", "RNA", "DNA reference", "Bone marrow", "Saliva", "Urine"];
const SAMPLE_STATUS = ["active", "depleted", "degraded", "archived"];

const EXP_TYPES = ["WES", "CRISPR-Cas9", "ATAC-seq", "RNA-seq", "Methylation", "scRNA-seq", "ChIP-seq", "Hi-C", "WGS", "Car-T"];
const EXP_STATUS = ["planned", "running", "completed", "failed"];

const READ_TYPES = ["RNA", "scRNA", "DNA", "sRNA"];

const GENE_SUFFIX = ["R1", "L2", "C3", "Q4", "B5", "A6", "X7", "Z8", "P9", "M10", "N11", "K12", "S13", "D14", "F15", "G16"];
const DRUG_PREFIX = ["Azi", "Bro", "Cyto", "Daro", "Ele", "Fal", "Giri", "Halo", "Iso", "Juta", "Keto", "Lixo", "Moxa", "Nobi", "Ofra", "Pura", "Quira", "Ravo", "Soli", "Timo"];
const DRUG_SUFFIX = ["zole", "tinib", "mab", "ib", "sertan", "prazole", "mycin", "statin", "pril", "dil", "alone", "virid", "bacin", "iane", "crine", "sone"];
const DISEASE_MOD = ["metastatic ", "advanced ", "early-stage ", "recurrent ", "drug-resistant ", "aplastic ", "infantile ", "sporadic ", "familial ", "chronic ", "acute ", "idiopathic "];
const DISEASE_N = [
  "carcinoma", "sarcoma", "leukemia", "lymphoma", "melanoma", "neuroblastoma",
  "adenocarcinoma", "glioblastoma", "myeloma", "carcinoid", "ependymoma", "glioma",
  "retinoblastoma", "meningioma", "osteosarcoma", "astrocytoma", "cholangiocarcinoma",
  "mesothelioma", "teratoma", "nephroblastoma",
];

export const seed = {
  genomicsJobs: [
    { filename: "tumor_exome_wgs_pass.vcf", status: "succeeded", variantCount: 1873, completedAt: daysAgo(9) },
    { filename: "family_trio_snps.vcf", status: "succeeded", variantCount: 421, completedAt: daysAgo(7) },
    { filename: "pancancer_chip_raw.vcf", status: "running", variantCount: 0, completedAt: null },
    { filename: "germline_panel.csv", status: "succeeded", variantCount: 68, completedAt: daysAgo(3) },
    { filename: "invitro_mutagenesis.tsv", status: "pending", variantCount: 0, completedAt: null },
  ].concat(
    range(900).map((i) => ({
      filename: `panel_${panelSample(i)}_${seq(i)}.vcf`,
      status: statusOf(i < 700, ["succeeded", "running", "pending", "failed"]),
      variantCount: i < 700 ? 200 + ((i * 73) % 9000) : 0,
      completedAt: i < 700 ? daysAgo(Math.max(1, 200 - i)) : null,
    })),
  ),

  variants: makeVariants(),

  crisprJobs: ranging("crisprJobs", (i) => {
    const gene = GENES[i % GENES.length];
    const done = i % 3 !== 1;
    return {
      geneName: gene, status: done ? "succeeded" : "running",
      guidesCount: done ? 8 + ((i * 7) % 40) : 0,
      pamType: PAMS[i % PAMS.length],
      sequenceLength: 300 + ((i * 211) % 8000),
    };
  }, 1500),

  guideRnas: makeGuides(),

  samples: makeSamples(),

  experiments: ranging("experiments", (i) => {
    const status = EXP_STATUS[i % EXP_STATUS.length];
    return {
      name: `${EXP_TYPES[i % EXP_TYPES.length]} ${1163 + i * 13}`,
      type: EXP_TYPES[i % EXP_TYPES.length],
      status,
      protocol: PROTOCOLS[i % PROTOCOLS.length],
      notes: `Batch ${i + 1} workflow`,
      startedAt: status === "running" || status === "completed" ? daysAgo(1 + (i % 7)) : null,
      completedAt: status === "completed" ? daysAgo(i % 6) : null,
      sampleIds: [],
    };
  }, 1000),

  nlpEntities: makeEntities(),

  nlpRelations: makeRelations(),

  transcriptomicsJobs: ranging("transcriptomicsJobs", (i) => {
    const done = i % 4 !== 1;
    const reads = done ? [18250000, 15200000, 20700000, 13200000, 9540000, 11000000, 16800000, 14300000][i % 8] : 0;
    return {
      name: `${READ_TYPES[i % READ_TYPES.length]} ${["T-", "L-", "B-", "P-"][i % 4]}${700 + i}`,
      status: done ? "succeeded" : "running",
      sampleType: READ_TYPES[i % READ_TYPES.length],
      readsCount: reads,
      genesDetected: done ? 17000 + ((i * 37) % 6000) : 0,
      referenceGenome: "GRCh38",
      pairedEnd: i % 3 === 0 ? "false" : "true",
    };
  }, 1200),
};

function makeVariants() {
  const variants: Array<Record<string, unknown>> = [];
  let idx = 0;
  for (let i = 0; i < 6000; i++) {
    const [gene, chromosome, base] = GENE_PANEL[(i * 7) % GENE_PANEL.length];
    variants.push({
      id: uid(`${gene}-g${i}`),
      jobId: "",
      chromosome,
      position: base + i * 37,
      ref: picks.ref[i % picks.ref.length],
      alt: picks.alt[(i + 2) % picks.alt.length],
      quality: Math.round((50 + ((i * 29) % 50)) * 10) / 10,
      filter: i % 13 === 0 ? "lowQual" : "PASS",
      rsId: `rs${9e8 + i * 104729}`,
      gene,
      consequence: CONSEQUENCES[(i * 5) % CONSEQUENCES.length],
      significance: SIGNIFICANCES[(i * 2) % SIGNIFICANCES.length],
      alleleFrequency: Math.round((((i * 11) % 100) + Math.random()) / 100 * 100) / 100,
      createdAt: daysAgo((i % 180) + 1),
    });
    idx++;
  }
  return variants;
}

function makeGuides() {
  const guides: Array<Record<string, unknown>> = [];
  let idx = 0;
  const guideSeqs = [
    "GAGTTCCTCATGCTGGGCCA", "GAGTCTGCCTCAAGGCTCCA", "CCTGATGGTCCATGGTGCAC",
    "TGACAGCGAAGGTGAAACAC", "GATTCCTGGCTCTGCATCAC", "CAGAGTACATCGTACTTCCC",
    "AATCTTGAAGTCCCAGGCCA", "GTTGGAGCTGGTGGCGTAGGC", "ACTGGTGGAGTATTTGATAGT",
    "GTTGGAGCTGGTGGCGTAGG", "ACCCGGCTGTCGTGCGATAT", "TCCCGCCCTGTCTATGCAGG",
    "CGAGGGAACCTCGGTTGCGC", "TCACAGTAGTCTCTCCCACT", "TCTCCCGGTCAAGGCCCCCA",
    "GAAACCCGCTGTGAGCATCG", "GGCACGGAGAGCCAAGCGTC", "CTCACGCAACCTGTAATCCA",
    "TAGTATTGAGTTCATTGCCC", "CAGAATCCGATTCCTAAGGA", "TCACGGACGAATGTCCAGGA",
  ];
  for (let i = 0; i < 8000; i++) {
    const gene = GENES[(i * 7) % GENES.length];
    guides.push({
      id: uid(`${gene}-guide${i}`),
      jobId: "",
      sequence: guideSeqs[i % guideSeqs.length],
      pamSequence: ["GGG", "CGG", "AGG", "TGG"][i % 4],
      position: 50 + (i % 5000) * 89,
      strand: i % 2 === 0 ? "+" : "-",
      score: Math.round((70 + ((i * 23) % 30)) / 100 * 100) / 100,
      gcContent: Math.round((40 + ((i * 13) % 30)) / 100 * 100) / 100,
      offTargetScore: Math.round((5 + ((i * 11) % 40)) / 100 * 100) / 100,
      selfComplementarity: Math.round((5 + ((i * 7) % 35)) / 100 * 100) / 100,
      rank: (i % 20) + 1,
      createdAt: daysAgo(i % 12),
    });
    idx++;
  }
  return guides;
}

function makeSamples() {
  const samples: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 1500; i++) {
    const type = SAMPLE_TYPES[i % SAMPLE_TYPES.length];
    samples.push({
      id: uid(`sample${i}`),
      name: `${type} ${prefix(i)}-${(i % 9000) + 100}`,
      type,
      status: SAMPLE_STATUS[(i * 5) % SAMPLE_STATUS.length],
      concentration: Math.round((3 + ((i * 13) % 120) * 1.7) * 10) / 10,
      unit: "ng/ul",
      volume: Math.round((10 + ((i * 7) % 490)) * 10) / 10,
      organism: ORGANSMS[(i * 3) % ORGANSMS.length],
      tissue: TISSUES[(i * 3) % TISSUES.length],
      storageLocation: `Rack-${(i % 24) + 1} Shelf-${(i % 5) + 1}`,
      barcode: `BF-${String.fromCharCode(65 + (i % 26))}${(i % 10).toString()}${(i % 1000).toString().padStart(3, "0")}`,
      notes: note(type),
      createdAt: daysAgo((i % 365) + 1),
      updatedAt: daysAgo(Math.floor(Math.random() * 5)),
    });
  }
  return samples;
}

function makeEntities() {
  const entities: Array<Record<string, unknown>> = [];
  GENES.forEach((gene, i) => entities.push(ent(gene, "gene", `HGNC:${1100 + i * 37}`, rnd(0.88, 0.99))));
  DRUGS.forEach((drug, i) => entities.push(ent(drug, "drug", `CHEBI:${34327 + i * 131}`, rnd(0.82, 0.96))));
  DISEASES.forEach((disease, i) => entities.push(ent(disease, "disease", `MONDO:${3706 + i * 47}`, rnd(0.79, 0.94))));
  // Generate many more unique entities for a fully-populated graph.
  let k = 0;
  for (let i = 0; i < 700; i++) {
    entities.push(ent(genGeneName(i), "gene", `HGNC:${5000 + i * 13}`, rnd(0.86, 0.99)));
    entities.push(ent(genDrugName(i), "drug", `CHEBI:${80000 + i * 17}`, rnd(0.8, 0.97)));
    entities.push(ent(genDiseaseName(i), "disease", `MONDO:${9000 + i * 23}`, rnd(0.76, 0.95)));
    k++;
  }
  return entities;
}

function makeRelations() {
  const relations: Array<Record<string, unknown>> = [];
  const pool: Array<{ text: string; type: string }> = [
    ...DRUGS.map((t) => ({ text: t, type: "drug" })),
    ...GENES.map((t) => ({ text: t, type: "gene" })),
    ...DISEASES.map((t) => ({ text: t, type: "disease" })),
  ];
  for (let i = 0; i < 100; i++) {
    relations.push(makeRel(i, pool));
  }
  for (let i = 0; i < 3000; i++) {
    relations.push(makeRel(i + 100, pool, true));
  }
  return relations;
}

function makeRel(i: number, pool: Array<{ text: string; type: string }>, synthetic = false) {
  const pred = RELATION_PREDICATES[(i * 3) % RELATION_PREDICATES.length];
  const subject = synthetic ? genNoun(i) : pool[i % pool.length].text;
  const object = synthetic ? genNoun(i + 37) : pool[(i * 7) % pool.length].text;
  return {
    id: uid(`rel${i}`),
    subjectText: subject,
    predicate: pred,
    objectText: object,
    confidence: Math.round((70 + ((i * 19) % 30)) / 100 * 100) / 100,
    evidence: "literature co-occurrence",
    createdAt: daysAgo(i % 12),
  };
}

// helper shims ---------------------------------------------------------------

function ranging<T>(key: string, fn: (i: number) => T, n: number): T[] {
  return range(n).map((i) => fn(i));
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function rnd(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function statusOf(ready: boolean, choices: string[]): string {
  if (!ready) return "pending";
  return choices[(Math.random() * 3) >>> 0];
}

function panelSample(i: number): string {
  return GENES[i % GENES.length];
}

function seq(i: number): string {
  return String.fromCharCode(97 + (i % 26)) + (i % 1000);
}

function prefix(i: number): string {
  return String.fromCharCode(65 + (i % 26));
}

function note(type: string): string {
  const tn: Record<string, string> = {
    Tumor: "Surgically resected tumor tissue",
    Blood: "Peripheral blood collection",
    FFPE: "Formalin-fixed paraffin-embedded block",
    "Liquid biopsy": "Cell-free circulating DNA from plasma",
    "Cell line": "Immortalized in-vitro culture",
    RNA: "Total RNA extract",
    "DNA reference": "Certified reference material",
    "Bone marrow": "Aspirated marrow biopsy",
    Saliva: "Non-invasive saliva collection",
    Urine: "Urinary sediment specimen",
  };
  return tn[type] ?? "Biobank accession";
}

function genGeneName(i: number): string {
  return `GENE${GENE_SUFFIX[i % GENE_SUFFIX.length]}${Math.floor(i / GENE_SUFFIX.length)}`;
}

function genDrugName(i: number): string {
  return DRUG_PREFIX[i % DRUG_PREFIX.length] + DRUG_SUFFIX[(i * 7) % DRUG_SUFFIX.length];
}

function genDiseaseName(i: number): string {
  return DISEASE_MOD[i % DISEASE_MOD.length] + DISEASE_N[(i * 3) % DISEASE_N.length] + (i % 4 === 0 ? ` type ${i}` : "");
}

function genNoun(i: number): string {
  return genDiseaseName(i);
}

export function withIds(list: Array<Record<string, unknown>>): Row[] {
  return list.map((r) => ({ ...r, id: r.id as string, createdAt: new Date(), updatedAt: new Date() }));
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

function ent(entityText: string, entityType: string, normalizedId: string, confidence: number) {
  return { id: uid(entityText), entityText, entityType, normalizedId, confidence, sourceText: null, startOffset: null, endOffset: null, createdAt: daysAgo(4) };
}

export function uid(seedStr: string): string {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) | 0;
  return `seed-${(h >>> 0).toString(16)}-${Math.floor(Math.random() * 1e6).toString(16)}`;
}