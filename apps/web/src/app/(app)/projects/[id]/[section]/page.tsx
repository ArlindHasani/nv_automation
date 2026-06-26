import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/project/project-workspace";
import { ProjectProvider } from "@/contexts/project-context";
import { loadProject } from "@/lib/projects";
import type { ProjectSection } from "@/lib/types";
import { PROJECT_SECTIONS } from "@/lib/types";

const VALID_SECTIONS = new Set(PROJECT_SECTIONS.map((s) => s.id));

export default async function ProjectSectionPage({
  params,
}: {
  params: Promise<{ id: string; section: string }>;
}) {
  const { id, section } = await params;

  if (!VALID_SECTIONS.has(section as ProjectSection)) {
    notFound();
  }

  const bundle = await loadProject(id);
  if (!bundle) notFound();

  return (
    <ProjectProvider projectId={id} section={section as ProjectSection}>
      <ProjectWorkspace />
    </ProjectProvider>
  );
}
