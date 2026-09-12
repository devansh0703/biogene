import { useState, useEffect, useRef } from "react";
import {
  useSearchProteins, useGetProteinStructure, useGetProteinAnnotations, useGetFeaturedProteins,
  useGetRelatedProteins,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartCard, CountBarChart, type Count } from "@/components/charts";
import { ExternalLink } from "lucide-react";

interface NglStageType {
  loadFile(url: string, params?: Record<string, unknown>): Promise<unknown>;
  setSpin(spin: boolean): void;
  autoView(): void;
  dispose(): void;
}

function ProteinViewer({ cifUrl, pdbId }: { cifUrl: string; pdbId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<NglStageType | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!containerRef.current || !cifUrl) return;
    let mounted = true;
    setStatus("loading");

    (async () => {
      try {
        const NGL = await import("ngl");
        if (!mounted || !containerRef.current) return;

        if (stageRef.current) { stageRef.current.dispose(); stageRef.current = null; }

        const stage = new (NGL as unknown as { Stage: new (el: HTMLElement, opts?: Record<string, unknown>) => NglStageType }).Stage(containerRef.current, {
          backgroundColor: "black",
          quality: "medium",
        });
        stageRef.current = stage;

        await stage.loadFile(cifUrl, { defaultRepresentation: false }).then((comp: unknown) => {
          const component = comp as {
            addRepresentation(type: string, params?: Record<string, unknown>): unknown;
            autoView(): void;
          };
          component.addRepresentation("cartoon", { colorScheme: "chainid", smoothSheet: true });
          component.addRepresentation("ball+stick", {
            sele: "hetero and not water",
            colorScheme: "element",
            scale: 0.4,
          });
          component.autoView();
          if (mounted) setStatus("ready");
        });

        stage.setSpin(true);
      } catch {
        if (mounted) setStatus("error");
      }
    })();

    return () => {
      mounted = false;
      if (stageRef.current) { stageRef.current.dispose(); stageRef.current = null; }
    };
  }, [cifUrl, pdbId]);

  return (
    <div className="relative w-full h-96 bg-black border border-border">
      <div ref={containerRef} className="w-full h-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <p className="text-xs font-mono text-muted-foreground uppercase animate-pulse">Loading structure...</p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <p className="text-xs font-mono text-muted-foreground uppercase">Failed to load 3D structure</p>
        </div>
      )}
      {status === "ready" && (
        <div className="absolute top-2 right-2 text-xs font-mono text-muted-foreground bg-black/50 px-2 py-1">
          {pdbId} // NGL VIEWER
        </div>
      )}
    </div>
  );
}

export default function Protein() {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPdbId, setSelectedPdbId] = useState<string | null>(null);

  const { data: featuredData, isLoading: featuredLoading } = useGetFeaturedProteins();
  const { data: searchData, isLoading: searchLoading } = useSearchProteins(
    { query: searchTerm },
    { query: { enabled: !!searchTerm, queryKey: ["protein-search", searchTerm] } },
  );
  const { data: structureData, isLoading: structLoading } = useGetProteinStructure(
    selectedPdbId ?? "",
    { query: { enabled: !!selectedPdbId, queryKey: ["protein-structure", selectedPdbId] } },
  );
  const { data: annotationData, isLoading: annotLoading } = useGetProteinAnnotations(
    selectedPdbId ?? "",
    { query: { enabled: !!selectedPdbId, queryKey: ["protein-annotations", selectedPdbId] } },
  );
  const { data: relatedData, isLoading: relatedLoading } = useGetRelatedProteins(
    selectedPdbId ?? "",
    { query: { enabled: !!selectedPdbId, queryKey: ["protein-related", selectedPdbId] } },
  );

  const displayedProteins = searchTerm ? (searchData?.proteins ?? []) : (featuredData?.proteins ?? []);
  const isLoadingList = searchTerm ? searchLoading : featuredLoading;

  const ligandCounts: Count[] =
    (
      (annotationData as { featureCounts?: Array<{ type: string; count: number }> } | undefined)
        ?.featureCounts ?? []
    ).map((f) => ({ key: f.type, count: f.count }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Protein Structure</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">RCSB PDB Search + NGL 3D Viewer + UniProt Annotations + Sequence Clusters</p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search proteins (e.g. hemoglobin, BRCA1, insulin)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setSearchTerm(query); }}
          className="rounded-none font-mono text-sm bg-black border-border flex-1"
          data-testid="protein-search-input"
        />
        <Button
          onClick={() => setSearchTerm(query)}
          disabled={!query || searchLoading}
          className="rounded-none uppercase text-xs"
          data-testid="protein-search-btn"
        >
          {searchLoading ? "Searching..." : "Search PDB"}
        </Button>
        {searchTerm && (
          <Button
            variant="outline"
            onClick={() => { setSearchTerm(""); setQuery(""); }}
            className="rounded-none uppercase text-xs border-border"
          >
            Clear
          </Button>
        )}
      </div>

      {selectedPdbId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Card className="rounded-none border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {selectedPdbId} — 3D Structure
                    <a
                      href={`https://www.rcsb.org/structure/${selectedPdbId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-white flex items-center gap-0.5 text-xs font-mono"
                    >
                      RCSB <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    <a
                      href={`https://www.ebi.ac.uk/pdbe/entry/pdb/${selectedPdbId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-white flex items-center gap-0.5 text-xs font-mono"
                    >
                      PDBe <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPdbId(null)}
                    className="rounded-none text-xs text-muted-foreground h-6"
                  >
                    Close
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {structLoading ? (
                  <Skeleton className="h-96 rounded-none" />
                ) : structureData ? (
                  <ProteinViewer cifUrl={structureData.cifUrl} pdbId={structureData.pdbId} />
                ) : null}
              </CardContent>
            </Card>

            {structureData && (
              <Card className="rounded-none border-border bg-card">
                <CardHeader><CardTitle className="text-sm uppercase">Structure Info</CardTitle></CardHeader>
                <CardContent className="font-mono text-xs space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      ["Method", structureData.method],
                      ["Resolution", structureData.resolution ? `${structureData.resolution}Å` : "N/A"],
                      ["Organism", structureData.organism],
                      ["Helices / Sheets", structureData.secondaryStructure ? `${structureData.secondaryStructure.helices} / ${structureData.secondaryStructure.sheets}` : "—"],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="flex justify-between border-b border-border py-1">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="truncate max-w-[150px]">{String(v ?? "—")}</span>
                      </div>
                    ))}
                  </div>
                  {(structureData.chains ?? []).length > 0 && (
                    <div>
                      <p className="text-muted-foreground uppercase mb-1">Chains</p>
                      <div className="flex flex-wrap gap-1">
                        {structureData.chains!.map((c) => (
                          <span key={c.chainId} className="border border-border px-2 py-0.5 text-xs">
                            {c.chainId} ({c.length} aa)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(structureData.bindingSites ?? []).length > 0 && (
                    <div>
                      <p className="text-muted-foreground uppercase mb-1">Binding Sites</p>
                      <div className="flex flex-wrap gap-1">
                        {structureData.bindingSites!.map((s) => (
                          <span key={s.siteId} className="border border-border px-2 py-0.5 text-xs" title={s.details}>
                            {s.siteId}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {((structureData.citations as Array<{ title: string; journal?: string; year?: string | null; pmid?: string | null; doi?: string | null; pubmedUrl?: string | null; doiUrl?: string | null }> | undefined) ?? []).length > 0 && (
                    <div>
                      <p className="text-muted-foreground uppercase mb-1">Primary Citations</p>
                      <div className="space-y-1.5">
                        {(structureData.citations as Array<{ title: string; journal?: string; year?: string | null; pmid?: string | null; doi?: string | null; pubmedUrl?: string | null; doiUrl?: string | null }>).map((c, i) => (
                          <div key={i} className="border-b border-border py-1">
                            <p className="text-white/80 leading-snug">{c.title || "Untitled"}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {c.journal && <span className="text-muted-foreground">{c.journal}{c.year ? ` (${c.year})` : ""}</span>}
                              {c.pubmedUrl && (
                                <a href={c.pubmedUrl} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white flex items-center gap-0.5">
                                  PubMed:{c.pmid} <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                              {c.doiUrl && (
                                <a href={c.doiUrl} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white flex items-center gap-0.5">
                                  DOI <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {annotLoading ? (
              <Skeleton className="h-64 rounded-none" />
            ) : annotationData ? (
              <Card className="rounded-none border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-sm uppercase flex items-center gap-3">
                    <span>UniProt Annotations</span>
                    {annotationData.uniprotId && (
                      <a
                        href={annotationData.uniprotUrl ?? `https://www.uniprot.org/uniprotkb/${annotationData.uniprotId}/entry`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-mono text-muted-foreground hover:text-white flex items-center gap-0.5"
                      >
                        {annotationData.uniprotId} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-xs space-y-3">
                  {annotationData.gene && (
                    <div className="flex gap-2 items-center">
                      <span className="text-muted-foreground">Gene</span>
                      <Badge className="rounded-none bg-white/20 text-white text-xs">{annotationData.gene}</Badge>
                      {annotationData.sequenceLength && (
                        <span className="text-muted-foreground">{annotationData.sequenceLength} aa</span>
                      )}
                    </div>
                  )}
                  {annotationData.function && (
                    <div>
                      <p className="text-muted-foreground uppercase mb-1">Function</p>
                      <p className="text-white/80 leading-relaxed">{annotationData.function}</p>
                    </div>
                  )}
                  {(annotationData.subcellularLocation ?? []).length > 0 && (
                    <div>
                      <p className="text-muted-foreground uppercase mb-1">Subcellular Location</p>
                      <div className="flex flex-wrap gap-1">
                        {annotationData.subcellularLocation!.map((loc) => (
                          <span key={loc} className="border border-border px-2 py-0.5">{loc}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(annotationData.goTerms ?? []).length > 0 && (
                    <div>
                      <p className="text-muted-foreground uppercase mb-1">GO Terms</p>
                      <div className="space-y-1 max-h-32 overflow-auto">
                        {annotationData.goTerms!.slice(0, 8).map((g) => (
                          <div key={g.id} className="flex gap-2 items-center">
                            <span className="text-muted-foreground w-20 flex-shrink-0">{g.category}</span>
                            <span className="truncate">{g.term}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(annotationData.diseases ?? []).length > 0 && (
                    <div>
                      <p className="text-muted-foreground uppercase mb-1">Associated Diseases</p>
                      <div className="space-y-1">
                        {annotationData.diseases!.slice(0, 4).map((d) => (
                          <div key={d.name} className="border-b border-border py-1">
                            <p className="font-bold">{d.name}</p>
                            {d.description && <p className="text-muted-foreground text-xs mt-0.5">{d.description.slice(0, 120)}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {/* Related structures from the same sequence cluster */}
            {selectedPdbId && (
              <Card className="rounded-none border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-sm uppercase flex items-center justify-between flex-wrap gap-2">
                    <span>Related Structures — Same Sequence Cluster</span>
                    {relatedData?.clusterId && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        cluster {relatedData.clusterId} ({relatedData.similarityCutoff ?? 100}% identity)
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {relatedLoading ? (
                    <Skeleton className="h-48 rounded-none" />
                  ) : (relatedData?.related ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground font-mono uppercase py-4 text-center">No cluster members found</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {(relatedData?.related ?? []).slice(0, 6).map((p) => (
                        <button
                          key={p.pdbId}
                          onClick={() => setSelectedPdbId(p.pdbId)}
                          className="text-left border border-border hover:bg-white/5 transition-colors"
                          title={p.title}
                        >
                          <div className="h-32 bg-black">
                            <ProteinViewer cifUrl={p.pdbId ? `https://files.rcsb.org/download/${p.pdbId.toUpperCase()}.cif` : ""} pdbId={p.pdbId} />
                          </div>
                          <div className="p-2">
                            <p className="font-bold font-mono text-xs">{p.pdbId}</p>
                            <p className="text-[10px] text-muted-foreground line-clamp-1">{p.title}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-bold uppercase text-muted-foreground mb-3">
          {searchTerm ? `Search Results for "${searchTerm}"` : "Latest Deposited Structures — live from RCSB"}
        </h2>
        {isLoadingList ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-none" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {(displayedProteins).map((p) => (
              <button
                key={p.pdbId}
                onClick={() => setSelectedPdbId(p.pdbId)}
                className={`text-left border p-3 transition-colors ${selectedPdbId === p.pdbId
                  ? "border-white bg-white/10"
                  : "border-border bg-card hover:bg-white/5"
                  }`}
                data-testid="protein-card"
              >
                <p className="font-bold font-mono text-sm">{p.pdbId}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.title}</p>
                {p.method && <p className="text-xs text-muted-foreground mt-1">{p.method}</p>}
                {p.resolution && (
                  <p className="text-xs font-mono mt-1">{p.resolution}Å</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {ligandCounts.length > 0 && (
        <ChartCard title="Ligand & Feature Counts" subtitle="current entry">
          <CountBarChart data={ligandCounts} layout="horizontal" />
        </ChartCard>
      )}
    </div>
  );
}
