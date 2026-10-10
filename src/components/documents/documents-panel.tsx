"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileImage, FileSpreadsheet, FileText, FolderOpen, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { RelativeTime } from "@/components/common/relative-time";
import { api, errorMessage } from "@/lib/api-client";

export type DocumentRow = {
  id: string;
  title: string;
  fileName: string;
  category: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: string;
  url: string;
  downloadUrl: string;
};

export const DOCUMENT_CATEGORIES: Record<string, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  STAFF: "Staff",
  FINANCE: "Finance",
  EXAM: "Exam",
  GENERAL: "General",
};

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileIcon({ mime, className }: { mime: string; className?: string }) {
  const Icon = mime.startsWith("image/") ? FileImage : mime.includes("sheet") ? FileSpreadsheet : FileText;
  const tone = mime === "application/pdf" ? "bg-danger-subtle text-danger-foreground" : mime.startsWith("image/") ? "bg-info-subtle text-info-foreground" : mime.includes("sheet") ? "bg-success-subtle text-success-foreground" : "bg-primary-subtle text-primary-subtle-foreground";
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", tone, className)}>
      <Icon className="size-5" />
    </span>
  );
}

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx";

export function UploadDocumentDrawer({
  open,
  onOpenChange,
  entity,
  defaultCategory,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entity: { entityType: "student" | "staff"; entityId: string } | null;
  defaultCategory: string;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = (f: File | undefined) => {
    if (!f) return;
    setError(f.size > 10 * 1024 * 1024 ? "Documents can be up to 10 MB." : null);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError("Choose a file to upload.");
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", title);
      form.set("category", category);
      if (entity) {
        form.set("entityType", entity.entityType);
        form.set("entityId", entity.entityId);
      }
      const { message } = await api.upload("/api/documents", form);
      toast.success(message);
      setFile(null);
      setTitle("");
      onOpenChange(false);
      onUploaded();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Upload document" description="PDF, image, Word or Excel — up to 10 MB. Files are stored privately." formId="upload-form" submitLabel="Upload" submitting={busy}>
      <form id="upload-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormAlert>{error}</FormAlert>
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose a file or drop it here"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            dragging ? "border-primary bg-primary-subtle/50" : "border-border-strong hover:bg-muted/40",
          )}
        >
          {file ? (
            <>
              <FileIcon mime={file.type} />
              <p className="text-small font-medium">{file.name}</p>
              <p className="text-caption text-muted-foreground">{formatBytes(file.size)} · click to choose another</p>
            </>
          ) : (
            <>
              <Upload className="size-6 text-muted-foreground" />
              <p className="text-small font-medium">Drop a file here or click to browse</p>
              <p className="text-caption text-muted-foreground">PDF, JPG, PNG, WebP, DOCX or XLSX</p>
            </>
          )}
          <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => choose(e.target.files?.[0])} />
        </div>
        <Field label="Title" htmlFor="doc-title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. B-Form copy" maxLength={160} />
        </Field>
        <Field label="Category" htmlFor="doc-category">
          <OptionSelect id="doc-category" value={category} onChange={(v) => setCategory(v ?? "GENERAL")} options={Object.entries(DOCUMENT_CATEGORIES).map(([value, label]) => ({ value, label }))} />
        </Field>
      </form>
    </FormDrawer>
  );
}

/** Documents attached to one student or staff member. */
export function DocumentsPanel({ entity, canManage, defaultCategory }: { entity: { entityType: "student" | "staff"; entityId: string }; canManage: boolean; defaultCategory: string }) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [removing, setRemoving] = useState<DocumentRow | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ rows: DocumentRow[] }>(`/api/documents?entityType=${entity.entityType}&entityId=${entity.entityId}`);
      setDocs(data.rows);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [entity.entityType, entity.entityId]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ rows: DocumentRow[] }>(`/api/documents?entityType=${entity.entityType}&entityId=${entity.entityId}`)
      .then(({ data }) => !cancelled && setDocs(data.rows))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [entity.entityType, entity.entityId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-h2">Documents</h2>
          <p className="text-small text-muted-foreground">Stored privately. Links expire after 15 minutes.</p>
        </div>
        {canManage && (
          <Button onClick={() => setUploadOpen(true)}>
            <Upload /> Upload
          </Button>
        )}
      </div>

      {failed ? (
        <EmptyState compact icon={FolderOpen} title="We couldn't load documents" description="Please try again." actions={<Button variant="outline" onClick={load}>Try again</Button>} />
      ) : docs === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No documents yet"
          description="Upload B-Forms, certificates, medical records or transfer letters."
          actions={canManage && <Button onClick={() => setUploadOpen(true)}><Upload /> Upload document</Button>}
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileIcon mime={d.mimeType} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium">{d.title}</p>
                <p className="truncate text-caption text-muted-foreground">
                  {DOCUMENT_CATEGORIES[d.category] ?? d.category} · {formatBytes(d.sizeBytes)} · {d.uploadedBy ?? "Unknown"} · <RelativeTime date={d.createdAt} />
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
      )}

      <UploadDocumentDrawer open={uploadOpen} onOpenChange={setUploadOpen} entity={entity} defaultCategory={defaultCategory} onUploaded={load} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title={`Remove “${removing?.title ?? ""}”?`}
        description="The document will no longer be available here. This is recorded in the audit log."
        confirmLabel="Remove document"
        onConfirm={async () => {
          if (!removing) return;
          try {
            const { message } = await api.delete(`/api/documents/${removing.id}`);
            toast.success(message);
            await load();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}
