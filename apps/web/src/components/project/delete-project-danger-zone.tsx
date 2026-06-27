"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeleteProjectDangerZoneProps {
  projectId: string;
  projectName: string;
}

export function DeleteProjectDangerZone({
  projectId,
  projectName,
}: DeleteProjectDangerZoneProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const nameMatches = confirmName.trim() === projectName.trim();

  function closeDialog() {
    setOpen(false);
    setConfirmName("");
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Failed to delete project");
      return;
    }
    toast.success("Project deleted");
    closeDialog();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border shadow-sm">
        <div className="border-b bg-muted/30 px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Danger zone</h2>
        </div>

        <div className="space-y-2 px-6 py-5">
          <h3 className="text-sm font-semibold text-foreground">
            Delete this project
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Permanently remove this project and all data stored on disk —
            datasets, question definitions, explore runs, interview queue, and
            worker configuration. This action cannot be undone.
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">
            projects/{projectId}
          </p>
        </div>

        <div className="flex justify-end border-t bg-muted/20 px-6 py-4">
          <Button
            type="button"
            variant="destructive"
            onClick={() => setOpen(true)}
          >
            <Trash2 className="mr-2 size-4" />
            Delete this project
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeDialog();
          else setOpen(true);
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 pr-14">
            <DialogTitle className="text-lg font-semibold">
              Delete project
            </DialogTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This will permanently delete the project and everything under{" "}
              <span className="break-all font-mono text-xs text-foreground">
                projects/{projectId}
              </span>
              . You cannot recover this data.
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Project name</p>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <p className="wrap-break-word text-sm font-medium leading-snug text-foreground">
                  {projectName}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delete-project-confirm" className="text-sm">
                To confirm, type the project name exactly as shown above
              </Label>
              <Input
                id="delete-project-confirm"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder="Enter project name"
                autoComplete="off"
                disabled={deleting}
                className="h-10"
              />
              {confirmName.length > 0 && !nameMatches ? (
                <p className="text-sm text-destructive">
                  Project name does not match.
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 gap-2 rounded-none border-t bg-muted/30 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting || !nameMatches}
            >
              {deleting ? "Deleting..." : "I understand, delete this project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
