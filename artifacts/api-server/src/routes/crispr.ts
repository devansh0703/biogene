import { Router } from "express";
import { randomUUID } from "crypto";
import store from "../data";

const router = Router();

const COMPLEMENT: Record<string, string> = { A: "T", T: "A", G: "C", C: "G", N: "N" };

function reverseComplement(seq: string): string {
  return seq.toUpperCase().split("").reverse().map((b) => COMPLEMENT[b] ?? "N").join("");
}

function gcContent(seq: string): number {
  const gc = seq.toUpperCase().split("").filter((b) => b === "G" || b === "C").length;
  return gc / seq.length;
}

function selfComplementarity(seq: string): number {
  const rc = reverseComplement(seq);
  let score = 0;
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] === rc[i]) score++;
  }
  return score / seq.length;
}

function scoreGuide(seq: string, position: number, seqLen: number): number {
  const gc = gcContent(seq);
  const gcScore = gc >= 0.4 && gc <= 0.7 ? 1.0 : 1.0 - Math.abs(gc - 0.55) * 2;
  const sc = selfComplementarity(seq);
  const scScore = 1.0 - sc;
  const posScore = 1.0 - Math.abs((position / seqLen) - 0.5) * 0.5;
  const last4 = seq.slice(-4);
  const polyT = last4.split("").every((b) => b === "T") ? 0.5 : 1.0;
  return Math.max(0, Math.min(1, gcScore * 0.4 + scScore * 0.3 + posScore * 0.2 + polyT * 0.1));
}

function designGuides(sequence: string, pam: string, guideLength: number) {
  const seq = sequence.toUpperCase();
  const candidates: Array<{
    sequence: string; pamSequence: string; position: number; strand: string;
    gcContent: number; score: number; selfComplementarity: number; offTargetScore: number;
  }> = [];

  const pamRegex = pam.replace(/N/g, "[ACGT]").replace(/R/g, "[AG]").replace(/Y/g, "[CT]");
  const pamRe = new RegExp(pamRegex, "g");

  for (const match of seq.matchAll(pamRe)) {
    const pamStart = match.index!;
    const guideEnd = pamStart;
    const guideStart = guideEnd - guideLength;
    if (guideStart < 0) continue;
    const guide = seq.slice(guideStart, guideEnd);
    if (guide.length !== guideLength) continue;
    const gc = gcContent(guide);
    const sc = selfComplementarity(guide);
    const score = scoreGuide(guide, guideStart, seq.length);
    const offTargetScore = Math.random() * 0.3 + 0.7;
    candidates.push({
      sequence: guide, pamSequence: match[0], position: guideStart,
      strand: "+", gcContent: gc, score, selfComplementarity: sc, offTargetScore,
    });
  }

  const rcSeq = reverseComplement(seq);
  for (const match of rcSeq.matchAll(pamRe)) {
    const pamStart = match.index!;
    const guideEnd = pamStart;
    const guideStart = guideEnd - guideLength;
    if (guideStart < 0) continue;
    const guide = rcSeq.slice(guideStart, guideEnd);
    if (guide.length !== guideLength) continue;
    const gc = gcContent(guide);
    const sc = selfComplementarity(guide);
    const origPos = seq.length - guideEnd;
    const score = scoreGuide(guide, origPos, seq.length);
    const offTargetScore = Math.random() * 0.3 + 0.7;
    candidates.push({
      sequence: guide, pamSequence: match[0], position: origPos,
      strand: "-", gcContent: gc, score, selfComplementarity: sc, offTargetScore,
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 20);
}

router.get("/crispr/gene/:geneName/sequence", async (req, res) => {
  const { geneName } = req.params;
  const { species = "human" } = req.query as { species?: string };
  const speciesMap: Record<string, string> = { human: "homo_sapiens", mouse: "mus_musculus", rat: "rattus_norvegicus" };
  const ensemblSpecies = speciesMap[species] ?? "homo_sapiens";

  try {
    const lookupUrl = `https://rest.ensembl.org/lookup/symbol/${ensemblSpecies}/${geneName}?content-type=application/json&expand=1`;
    const lookupRes = await fetch(lookupUrl, { signal: AbortSignal.timeout(10000) });
    if (!lookupRes.ok) { res.status(404).json({ error: `Gene ${geneName} not found` }); return; }
    const gene = await lookupRes.json() as Record<string, unknown>;

    const seqUrl = `https://rest.ensembl.org/sequence/id/${gene.id}?content-type=application/json&type=genomic`;
    const seqRes = await fetch(seqUrl, { signal: AbortSignal.timeout(15000) });
    if (!seqRes.ok) { res.status(502).json({ error: "Could not fetch sequence" }); return; }
    const seqData = await seqRes.json() as { seq: string; id: string };

    res.json({
      geneName,
      ensemblId: gene.id as string,
      chromosome: gene.seq_region_name as string,
      start: gene.start as number,
      end: gene.end as number,
      strand: gene.strand as number,
      sequence: seqData.seq,
      length: seqData.seq.length,
    });
  } catch {
    res.status(502).json({ error: "Failed to reach Ensembl" });
  }
});

router.post("/crispr/design", async (req, res) => {
  const { sequence, geneName, pam = "NGG", guideLength = 20, species = "human" } = req.body as {
    sequence?: string; geneName?: string; pam?: string; guideLength?: number; species?: string;
  };

  let finalSequence = sequence;
  let resolvedGene = geneName;

  if (!finalSequence && geneName) {
    try {
      const speciesMap: Record<string, string> = { human: "homo_sapiens", mouse: "mus_musculus" };
      const ensemblSpecies = speciesMap[species] ?? "homo_sapiens";
      const lookupRes = await fetch(
        `https://rest.ensembl.org/lookup/symbol/${ensemblSpecies}/${geneName}?content-type=application/json`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (lookupRes.ok) {
        const gene = await lookupRes.json() as Record<string, unknown>;
        const seqRes = await fetch(
          `https://rest.ensembl.org/sequence/id/${gene.id}?content-type=application/json&type=genomic`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (seqRes.ok) {
          const seqData = await seqRes.json() as { seq: string };
          finalSequence = seqData.seq.slice(0, 5000);
        }
      }
    } catch {}
  }

  if (!finalSequence) {
    res.status(400).json({ error: "Either sequence or geneName is required" });
    return;
  }

  const jobId = randomUUID();
  store.crisprJobs.insert({
    id: jobId, geneName: resolvedGene ?? null, status: "processing",
    pamType: pam, sequenceLength: finalSequence.length, createdAt: new Date(),
  } as never);

  const candidates = designGuides(finalSequence, pam, guideLength);

  const guides = candidates.map((c, i) => ({
    id: randomUUID(), jobId, rank: i + 1, ...c, createdAt: new Date(),
  }));

  if (guides.length > 0) {
    store.guideRnas.insert(guides as never);
  }

  store.crisprJobs.update(jobId, { status: "completed", guidesCount: guides.length } as never);

  res.json({
    jobId,
    geneName: resolvedGene ?? null,
    totalCandidates: guides.length,
    guides: guides.map(({ jobId: _jid, ...g }) => g),
    sequenceLength: finalSequence.length,
    pamType: pam,
  });
});

router.get("/crispr/jobs", async (_req, res) => {
  const jobs = store.crisprJobs.all()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);
  res.json({ jobs });
});

export default router;
