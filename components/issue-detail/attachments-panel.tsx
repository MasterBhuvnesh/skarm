"use client";

import { useMutation, useQuery } from "convex/react";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/components/issue-detail/format";
import { IssueDetailSlotProps } from "@/components/issue-detail/slots";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function fileIcon(fileType: string) {
  if (fileType.startsWith("image/")) {
    return ImageIcon;
  }
  if (
    fileType === "application/pdf" ||
    fileType.startsWith("text/") ||
    fileType.includes("document")
  ) {
    return FileText;
  }
  return Paperclip;
}

export function AttachmentsPanel({ issue }: IssueDetailSlotProps) {
  const attachments = useQuery(api.attachments.listByIssue, {
    issueId: issue._id,
  });
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const createAttachment = useMutation(api.attachments.create);
  const removeAttachment = useMutation(api.attachments.remove);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (files: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name} is larger than 25 MB`);
          continue;
        }
        const fileType = file.type || "application/octet-stream";
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": fileType },
          body: file,
        });
        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }
        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };
        await createAttachment({
          issueId: issue._id,
          storageId,
          fileName: file.name,
          fileType,
          fileSize: file.size,
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload attachment"
      );
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const handleRemove = (attachmentId: Id<"attachments">) => {
    removeAttachment({ attachmentId }).catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete attachment"
      );
    });
  };

  return (
    <section className="mb-5">
      <div className="flex h-6 items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">
          Attachments
        </h3>
        <Button
          variant="ghost"
          size="icon"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          aria-label="Upload attachment"
          className="size-6 text-muted-foreground"
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void uploadFiles(e.target.files);
            }
          }}
        />
      </div>

      {attachments && attachments.length > 0 ? (
        <div className="flex flex-col pt-1">
          {attachments.map((attachment) => {
            const Icon = fileIcon(attachment.fileType);
            return (
              <div
                key={attachment._id}
                className="group -mx-1 flex h-8 items-center gap-2 rounded-md px-1 text-xs transition-colors hover:bg-accent/50"
              >
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                {attachment.url ? (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`${attachment.fileName} - uploaded by ${attachment.uploaderName}`}
                    className="min-w-0 flex-1 truncate hover:underline"
                  >
                    {attachment.fileName}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {attachment.fileName}
                  </span>
                )}
                <span className="shrink-0 text-[11px] text-muted-foreground/70 group-hover:hidden">
                  {formatFileSize(attachment.fileSize)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(attachment._id)}
                  aria-label="Delete attachment"
                  className="hidden size-5 shrink-0 group-hover:inline-flex"
                >
                  <X className="size-3" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="pt-1 text-xs text-muted-foreground/60">No attachments</p>
      )}
    </section>
  );
}
