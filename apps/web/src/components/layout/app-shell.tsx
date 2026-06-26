import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { listProjectSummaries } from "@/lib/projects";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const projects = await listProjectSummaries();

  return (
    <SidebarProvider>
      <AppSidebar projects={projects} />
      <SidebarInset className="bg-background">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/50 px-6 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1 size-9" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <span className="text-base text-muted-foreground">
            Local workspace · files saved under <code className="text-sm">projects/</code>
          </span>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
