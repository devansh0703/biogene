import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  getGlobalSearchQueryOptions, getGetSearchSchemaQueryOptions, getGetSearchFacetsQueryOptions,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "@/lib/api-url";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink } from "lucide-react";

interface SearchHit {
  id: string;
  collection: string;
  rowId: string;
  score: number;
  snippet: string;
  fields: Record<string, unknown>;
  links: Record<string, string>;
}

const COLLECTION_LABELS: Record<string, string> = {
  genomicsJobs: "Genomics Jobs",
  variants: "Variants",
  crisprJobs: "CRISPR Jobs",
  guideRnas: "Guide RNAs",
  samples: "Samples",
  experiments: "Experiments",
  nlpEntities: "NLP Entities",
  nlpRelations: "NLP Relations",
  transcriptomicsJobs: "RNA-Seq Jobs",
};

const LINK_LABELS: Record<string, string> = {
  dbsnp: "dbSNP",
  clinvar: "ClinVar",
  ensembl: "Ensembl",
  ucsc: "UCSC",
  app: "Open",
};

function FieldChips({ fields }: { fields: Record<string, unknown> }) {
  const entries = Object.entries(fields).slice(0, 8);
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([k, v]) => (
        v != null && String(v).length > 0 ? (
          <span key={k} className="text-[10px] font-mono border border-border px-1 py-0.5 text-muted-foreground">
            {k}: {String(v).slice(0, 30)}
          </span>
        ) : null
      ))}
    </div>
  );
}

export default function GlobalSearch() {
  const [, navigate] = useLocation();
  const params = useQueryParams();
  const initialQuery = params["q"] ?? "";
  const activeCollections = (params["collections"] ?? "").split(",").filter(Boolean);

  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => { setInput(initialQuery); setQuery(initialQuery); }, [initialQuery]);

  const { data: schema } = useQuery(getGetSearchSchemaQueryOptions());

  const enabled = query.trim().length > 0;
  const { data: results, isFetching } = useQuery(
    getGlobalSearchQueryOptions(
      { q: query, collections: activeCollections.length ? activeCollections.join(",") : undefined, limit: 30 },
      { query: { enabled, queryKey: ["global-search", query, activeCollections.join(",")] } },
    ),
  );

  const { data: geneFacets } = useQuery(
    getGetSearchFacetsQueryOptions(
      { field: "gene", collections: activeCollections.includes("variants") ? "variants" : undefined, q: enabled ? query : undefined },
      { query: { enabled: enabled && (activeCollections.length === 0 || activeCollections.includes("variants")), queryKey: ["facets-gene", query, activeCollections.join(",")] } },
    ),
  );
  const { data: statusFacets } = useQuery(
    getGetSearchFacetsQueryOptions(
      { field: "status", q: enabled ? query : undefined, collections: activeCollections.length ? activeCollections.join(",") : undefined },
      { query: { enabled, queryKey: ["facets-status", query, activeCollections.join(",")] } },
    ),
  );

  const runSearch = (q?: string) => {
    const nextQuery = q ?? input;
    setQuery(nextQuery);
    const sp = new URLSearchParams();
    if (nextQuery) sp.set("q", nextQuery);
    if (activeCollections.length) sp.set("collections", activeCollections.join(","));
    navigate(`/search?${sp.toString()}`);
  };

  const toggleCollection = (c: string) => {
    const next = activeCollections.includes(c)
      ? activeCollections.filter((x) => x !== c)
      : [...activeCollections, c];
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (next.length) sp.set("collections", next.join(","));
    navigate(`/search?${sp.toString()}`);
  };

  const hits = (results?.results ?? []) as unknown as SearchHit[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Global Search</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">
          BM25-ranked natural-language search across every dataset. Try <code className="text-white">BRCA1</code>, <code className="text-white">pathogenic</code>, or field filters like <code className="text-white">significance:pathogenic</code>
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search everything (genes, variants, guides, samples, entities...)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          className="rounded-none font-mono text-sm bg-black border-border"
          data-testid="global-search-input"
          autoFocus
        />
        <Button onClick={() => runSearch()} disabled={!input.trim()} className="rounded-none uppercase text-xs">
          <Search className="h-4 w-4 mr-1" /> {isFetching ? "..." : "Search"}
        </Button>
      </div>

      {/* Collection scope filter */}
      {schema && (
        <div className="flex flex-wrap gap-1.5">
          {schema.collections.map((c) => (
            <button
              key={c.collection}
              onClick={() => toggleCollection(c.collection)}
              className={`text-[11px] font-mono px-2 py-1 border transition-colors ${
                activeCollections.includes(c.collection)
                  ? "bg-white text-black border-white"
                  : "border-border text-muted-foreground hover:text-white"
              }`}
              data-testid="collection-filter"
            >
              {COLLECTION_LABELS[c.collection] ?? c.collection} ({c.count.toLocaleString()})
            </button>
          ))}
        </div>
      )}

      {/* Facets */}
      {(geneFacets?.facets?.length || statusFacets?.facets?.length) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {geneFacets?.facets?.length ? (
            <div className="border border-border bg-card p-3">
              <p className="text-[10px] uppercase text-muted-foreground mb-2">Top genes in results</p>
              <div className="flex flex-wrap gap-1">
                {geneFacets.facets.slice(0, 12).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => runSearch(`${query} gene:${f.key}`.trim())}
                    className="text-[11px] font-mono border border-border px-1.5 py-0.5 hover:bg-white/10"
                  >
                    {f.key} <span className="text-muted-foreground">({f.count})</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {statusFacets?.facets?.length ? (
            <div className="border border-border bg-card p-3">
              <p className="text-[10px] uppercase text-muted-foreground mb-2">Status distribution</p>
              <div className="flex flex-wrap gap-1">
                {statusFacets.facets.slice(0, 12).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => runSearch(`${query} status:${f.key}`.trim())}
                    className="text-[11px] font-mono border border-border px-1.5 py-0.5 hover:bg-white/10"
                  >
                    {f.key} <span className="text-muted-foreground">({f.count})</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Results */}
      {isFetching && <Skeleton className="h-64 rounded-none" />}

      {!isFetching && enabled && (
        <>
          <p className="text-xs text-muted-foreground font-mono">
            {results?.total?.toLocaleString() ?? 0} results for "{query}"
            {activeCollections.length ? ` in ${activeCollections.join(", ")}` : " across all datasets"}
          </p>
          <div className="space-y-2">
            {hits.length === 0 && (
              <p className="text-xs text-muted-foreground font-mono uppercase py-8 text-center">No matches — try broader terms or clear collection filters</p>
            )}
            {hits.map((hit) => (
              <div key={hit.id} className="border border-border bg-card p-3 hover:bg-white/5 transition-colors">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge className="rounded-none bg-white text-black text-[10px] uppercase">
                      {COLLECTION_LABELS[hit.collection] ?? hit.collection}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground">score {hit.score.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {Object.entries(hit.links ?? {}).filter(([k]) => k !== "app").map(([k, url]) => (
                      <a
                        key={k}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-mono text-muted-foreground hover:text-white flex items-center gap-0.5"
                      >
                        {LINK_LABELS[k] ?? k} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ))}
                    <a href={hit.links?.app ?? "#"} className="text-[10px] font-mono underline hover:text-white">
                      {LINK_LABELS.app}
                    </a>
                  </div>
                </div>
                {hit.snippet && <p className="text-xs font-mono mt-1.5 text-white/80">{hit.snippet}</p>}
                <FieldChips fields={hit.fields ?? {}} />
              </div>
            ))}
          </div>
        </>
      )}

      {!enabled && (
        <div className="border border-border bg-card p-8 text-center">
          <p className="text-xs font-mono text-muted-foreground uppercase">Type a query to search {schema ? schema.collections.reduce((a, c) => a + c.count, 0).toLocaleString() : ""} indexed records</p>
        </div>
      )}
    </div>
  );
}
