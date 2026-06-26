"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Database,
  FolderKanban,
  Home,
  ListTree,
  Play,
  Settings2,
  Sparkles,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import type { ProjectSection, ProjectSummary } from "@/lib/types";
import { PROJECT_SECTIONS } from "@/lib/types";

const SECTION_ICONS: Record<ProjectSection, LucideIcon> = {
  setup: Settings2,
  datasets: Database,
  definition: ListTree,
  explore: Compass,
  run: Play,
};

interface AppSidebarProps {
  projects: ProjectSummary[];
}

function activeProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] ?? null;
}

function activeSection(pathname: string): ProjectSection | null {
  const match = pathname.match(/^\/projects\/[^/]+\/([^/]+)/);
  return (match?.[1] as ProjectSection) ?? null;
}

export function AppSidebar({ projects }: AppSidebarProps) {
  const pathname = usePathname();
  const currentProjectId = activeProjectId(pathname);
  const currentSection = activeSection(pathname);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" />}
              className="data-[active=true]:bg-transparent"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Zap className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold tracking-tight">NV Automation</span>
                <span className="text-xs text-sidebar-foreground/60">
                  Survey cloning
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/"}
                  render={<Link href="/" />}
                  tooltip="Home"
                >
                  <Home className="size-4" />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    isActive={currentProjectId === project.id}
                    render={<Link href={`/projects/${project.id}/setup`} />}
                    tooltip={project.name}
                  >
                    <FolderKanban className="size-4" />
                    <span className="truncate">{project.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {projects.length === 0 && (
                <p className="px-2 py-1 text-xs text-sidebar-foreground/50">
                  No projects yet
                </p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {currentProjectId && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {PROJECT_SECTIONS.map((section) => {
                    const Icon = SECTION_ICONS[section.id];
                    return (
                      <SidebarMenuItem key={section.id}>
                        <SidebarMenuButton
                          isActive={currentSection === section.id}
                          render={
                            <Link
                              href={`/projects/${currentProjectId}/${section.id}`}
                            />
                          }
                          tooltip={section.label}
                        >
                          <Icon className="size-4" />
                          <span>{section.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <CreateProjectDialog />
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-sidebar-foreground/50">
          <Sparkles className="size-3.5" />
          <span>Local workspace</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
