import Link from "next/link";
import {
  ArrowRight,
  Database,
  FolderKanban,
  ListTree,
  Sparkles,
} from "lucide-react";
import { CreateProjectButton } from "@/components/create-project-dialog";
import { PageHeader, StatCard } from "@/components/layout/page-header";
import { listProjectSummaries } from "@/lib/projects";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await listProjectSummaries();
  const totalRows = projects.reduce((s, p) => s + p.dataRowCount, 0);
  const totalQuestions = projects.reduce((s, p) => s + p.questionCount, 0);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Dashboard"
        description="Manage NV survey projects, datasets, and interview runs"
        icon={Sparkles}
      >
        <CreateProjectButton />
      </PageHeader>

      <div className="space-y-8 p-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Projects" value={projects.length} icon={FolderKanban} />
          <StatCard label="Total questions" value={totalQuestions} icon={ListTree} />
          <StatCard label="Active rows" value={totalRows} icon={Database} />
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">
            Your projects
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}/setup`}
                className="group rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FolderKanban className="size-5" />
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <h3 className="mt-4 font-semibold tracking-tight">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.id}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="secondary">{p.questionCount} questions</Badge>
                  <Badge variant="outline">{p.datasetCount} datasets</Badge>
                  <Badge variant="outline">{p.dataRowCount} rows</Badge>
                </div>
              </Link>
            ))}
          </div>

          {projects.length === 0 && (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <FolderKanban className="mx-auto mb-4 size-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">No projects yet</p>
              <div className="mt-4">
                <CreateProjectButton />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
