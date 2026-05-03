import { useState, useEffect, useRef } from "react";
import {
  useSearchProteins, useGetProteinStructure, useGetProteinAnnotations, useGetFeaturedProteins,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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
    { query: { enabled: !!searchTerm } }
  );
  const { data: structureData, isLoading: structLoading } = useGetProteinStructure(
    selectedPdbId ?? "",
    { query: { enabled: !!selectedPdbId } }
  );
  const { data: annotationData, isLoading: annotLoading } = useGetProteinAnnotations(
    selectedPdbId ?? "",
    { query: { enabled: !!selectedPdbId } }
  );

  const displayedProteins = searchTerm ? (searchData?.proteins ?? []) : (featuredData?.proteins ?? []);
  const isLoadingList = searchTerm ? searchLoading : featuredLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Protein Structure</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">RCSB PDB Search + NGL 3D Viewer + UniProt Annotations</p>
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
                  <span>{selectedPdbId} — 3D Structure</span>
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
                      ["Chains", structureData.chains?.length ?? 0],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="flex justify-between border-b border-border py-1">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="truncate max-w-[150px]">{String(v)}</span>
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
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {annotLoading ? (
              <Skeleton className="h-64 rounded-none" />
            ) : annotationData ? (
              <Card className="rounded-none border-border bg-card">
                <CardHeader><CardTitle className="text-sm uppercase">UniProt Annotations</CardTitle></CardHeader>
                <CardContent className="font-mono text-xs space-y-3">
                  {annotationData.uniprotId && (
                    <div className="flex gap-2 items-center">
                      <span className="text-muted-foreground">UniProt</span>
                      <Badge className="rounded-none bg-white text-black text-xs">{annotationData.uniprotId}</Badge>
                      {annotationData.gene && <Badge className="rounded-none bg-white/20 text-white text-xs">{annotationData.gene}</Badge>}
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
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-bold uppercase text-muted-foreground mb-3">
          {searchTerm ? `Search Results for "${searchTerm}"` : "Featured Structures"}
        </h2>
        {isLoadingList ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-none" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
    </div>
  );
}
