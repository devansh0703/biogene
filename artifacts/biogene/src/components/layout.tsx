import { Link, useLocation } from "wouter";
import { Activity, Dna, Database, Microchip, Library, FlaskConical, Stethoscope, LineChart, Search, MessagesSquare } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { title: "Dashboard", url: "/", icon: Activity },
  { title: "Research Chat", url: "/rag", icon: MessagesSquare },
  { title: "Global Search", url: "/search", icon: Search },
  { title: "Variant Analysis", url: "/genomics", icon: Dna },
  { title: "Protein Structure", url: "/protein", icon: Microchip },
  { title: "CRISPR Design", url: "/crispr", icon: Database },
  { title: "Biomedical NLP", url: "/nlp", icon: Library },
  { title: "Genome Browser", url: "/genome", icon: LineChart },
  { title: "Lab Management", url: "/lims", icon: FlaskConical },
  { title: "Drug Discovery", url: "/drugs", icon: Stethoscope },
  { title: "RNA-Seq", url: "/transcriptomics", icon: Activity },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-black text-white font-mono">
        <Sidebar className="border-r border-border bg-card w-64 flex-shrink-0">
          <SidebarContent>
            <div className="p-4 border-b border-border">
              <h1 className="text-xl font-bold tracking-tight uppercase">BioGene</h1>
              <p className="text-xs text-muted-foreground mt-1 uppercase">v0.1.0 // System Active</p>
            </div>
            <SidebarGroup>
              <SidebarGroupLabel className="text-muted-foreground uppercase text-xs tracking-widest mt-4 mb-2 px-4">
                Modules
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV_ITEMS.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url}
                        className="rounded-none hover:bg-secondary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:font-bold"
                      >
                        <Link
                          href={item.url}
                          className="flex items-center gap-3 px-4 py-2 uppercase text-sm"
                          data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <div className="flex-1 overflow-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
