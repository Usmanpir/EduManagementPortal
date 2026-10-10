"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, FolderOpen, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { DOCUMENT_CATEGORIES, FileIcon, UploadDocumentDrawer, formatBytes } from "@/components/documents/documents-panel";
import { FilterBar } from "@/components/data/filter-bar";
import { Pagination } from "@/components/data/pagination";
import { useUrlState } from "@/components/data/use-url-state";
import { useHotkey } from "@/components/shell/shell-context";
import { api, errorMessage } from "@/lib/api-client";

type Row = { id: string; title: string; fileName: string; category: string; mimeType: string; sizeBytes: number; entityType: string | null; entityId: string | null; owner: string | null; uploadedBy: string | null; createdAt: string; url: string; downloadUrl: string };

export function DocumentsView({ rows, total, scope, page, pageSize, canSeeAll, canManage, hasFilters }: { rows: Row[]; total: number; scope: "library" | "all"; page: number; pageSize: number; canSeeAll: boolean; canManage: boolean; hasFilters: boolean }) {
  const router = useRouter();
  const { set } = useUrlState();
  const [upload, setUpload] = useState(false);
  const [removing, setRemoving] = useState<Row | null>(null);
  useHotkey("n", () => setUpload(true), canManage);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Documents"
        description={scope === "library" ? "Policies, circulars, forms and other files for the whole school. Stored privately; links expire after 15 minutes." : "Every file in the school, including those attached to students and staff."}
        actions={
          canManage && (
            <Button onClick={() => setUpload(true)}>
              <Upload /> Upload to library
            </Button>
          )
        }
      />
      {canSeeAll && (
        <div role="tablist" aria-label="Scope" className="flex gap-1 border-b">
          {(
            [
              ["library", "School library"],
              ["all", "All files"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" type="button" aria-selected={scope === k} onClick={() => set({ scope: k === "library" ? null : k, page: null })} className={cn("-mb-px border-b-2 px-3 py-2.5 text-small font-medium", scope === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      )}
      <FilterBar searchPlaceholder="Search by title" filters={[{ key: "category", label: "Category", options: Object.entries(DOCUMENT_CATEGORIES).map(([value, label]) => ({ value, label })) }]} />

      {rows.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={hasFilters ? "No documents match" : scope === "library" ? "The library is empty" : "No documents yet"}
          description={hasFilters ? "Try a different search or category." : "Upload the timetable, fee schedule, uniform policy or any circular parents and staff ask for. Student files live on each student's profile."}
          actions={canManage && !hasFilters && <Button onClick={() => setUpload(true)}><Upload /> Upload a document</Button>}
        />
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
            {rows.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <FileIcon mime={d.mimeType} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small font-medium">{d.title}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {DOCUMENT_CATEGORIES[d.category] ?? d.category}
                    {d.owner && d.entityId && (
                      <>
                        {" · "}
                        <Link href={d.entityType === "student" ? `/students/${d.entityId}?tab=documents` : `/staff/${d.entityId}?tab=documents`} className="font-medium text-foreground hover:underline">
                          {d.owner}
                        </Link>
                      </>
                    )}{" "}
                    · {formatBytes(d.sizeBytes)} · {d.uploadedBy ?? "Unknown"} · <RelativeTime date={d.createdAt} />
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" asChild>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${d.title}`}>
                    <Eye />
                  </a>
                </Button>
                <Button variant="ghost" size="icon-sm" asChild>
                  <a href={d.downloadUrl} aria-label={`Download ${d.title}`}>
                    <Download />
                  </a>
                </Button>
                {canManage && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${d.title}`} onClick={() => setRemoving(d)}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={pageSize} total={total} noun="documents" />
        </>
      )}

      <UploadDocumentDrawer open={upload} onOpenChange={setUpload} entity={null} defaultCategory="GENERAL" onUploaded={() => router.refresh()} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title={`Remove “${removing?.title ?? ""}”?`}
        description="It will no longer be available. This is recorded in the audit log."
        confirmLabel="Remove document"
        onConfirm={async () => {
          try {
            toast.success((await api.delete(`/api/documents/${removing!.id}`)).message);
            setRemoving(null);
            router.refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
