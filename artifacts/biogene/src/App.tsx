import { AppLayout } from "@/components/layout";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Genomics from "@/pages/genomics";
import Protein from "@/pages/protein";
import Crispr from "@/pages/crispr";
import Nlp from "@/pages/nlp";
import Genome from "@/pages/genome";
import Lims from "@/pages/lims";
import Drugs from "@/pages/drugs";
import Transcriptomics from "@/pages/transcriptomics";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/genomics" component={Genomics} />
        <Route path="/protein" component={Protein} />
        <Route path="/crispr" component={Crispr} />
        <Route path="/nlp" component={Nlp} />
        <Route path="/genome" component={Genome} />
        <Route path="/lims" component={Lims} />
        <Route path="/drugs" component={Drugs} />
        <Route path="/transcriptomics" component={Transcriptomics} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
