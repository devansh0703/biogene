import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface NglStageType {
  removeAllComponents: () => void;
  loadFile: (
    path: string,
    params?: { ext?: string; defaultRepresentation?: boolean },
  ) => Promise<
    | void
    | {
        addRepresentation: (type: string, params?: Record<string, unknown>) => void;
        autoView: (duration?: number) => void;
      }
  >;
  handleResize: () => void;
  dispose: () => void;
}

/**
 * Loads a PDB entry from RCSB into NGL and renders a cartoon view.
 * Used inside the RAG chat sidebar when the topic resolves to a structure.
 */
export function StructureCard({ pdbId, title }: { pdbId: string; title?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<NglStageType | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!containerRef.current || stageRef.current) return;
      const NGL = await import("ngl");
      const stage = new (NGL as unknown as { Stage: new (el: HTMLElement, opts?: Record<string, unknown>) => NglStageType }).Stage(
        containerRef.current,
        { backgroundColor: "black" },
      );
      stageRef.current = stage;
      const comp = await stage.loadFile(`https://files.rcsb.org/download/${pdbId}.pdb`, {
        ext: "pdb",
        defaultRepresentation: false,
      });
      if (cancelled || !comp) return;
      comp.addRepresentation("cartoon", { colorScheme: "sstruc" });
      comp.addRepresentation("ball+stick", { sele: "ligand", colorScheme: "element" });
      comp.autoView();
      setReady(true);
    }
    void load().catch(() => setReady(false));
    return () => {
      cancelled = true;
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, [pdbId]);

  return (
    <Card className="rounded-none border-primary/40 bg-card overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wide flex items-center gap-2">
          Structure
          <Badge variant="outline" className="font-mono text-[10px]">{pdbId}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-56 w-full bg-black">
          <div ref={containerRef} className="absolute inset-0" style={{ position: "relative" }} />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-muted-foreground uppercase">
              Loading {pdbId} from RCSB…
            </div>
          )}
        </div>
        {title && <p className="px-4 py-2 text-[11px] text-muted-foreground font-mono line-clamp-2">{title}</p>}
        <div className="px-4 pb-3">
          <a
            href={`https://www.rcsb.org/structure/${pdbId}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-mono text-primary hover:underline"
          >
            View on RCSB PDB ↗
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
