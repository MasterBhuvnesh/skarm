import { v } from "convex/values";
import {
  scheduleGithubAttachmentComment,
  scheduleGithubAttachmentRemoval,
} from "./github/sync";
import { getOrgIssue } from "./issues";
import { logActivity } from "./lib/activity";
import { orgMutation, orgQuery } from "./lib/customFunctions";

/** Server-side cap; the upload UI also enforces this before uploading. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const attachmentValidator = v.object({
  _id: v.id("attachments"),
  _creationTime: v.number(),
  issueId: v.id("issues"),
  fileName: v.string(),
  fileType: v.string(),
  fileSize: v.number(),
  uploadedBy: v.id("users"),
  uploaderName: v.string(),
  /** Short-lived download URL from Convex storage (null if file is gone). */
  url: v.union(v.string(), v.null()),
});

/** Step 1 of an upload: mint a short-lived URL the client POSTs the file to. */
export const generateUploadUrl = orgMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Step 2 of an upload: link the stored file to an issue. */
export const create = orgMutation({
  args: {
    issueId: v.id("issues"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
  },
  returns: v.id("attachments"),
  handler: async (ctx, args) => {
    const issue = await getOrgIssue(ctx, ctx.org._id, args.issueId);

    if (args.fileSize > MAX_ATTACHMENT_BYTES) {
      throw new Error("Attachments are limited to 25 MB");
    }

    const fileName = args.fileName.trim() || "Untitled";
    const attachmentId = await ctx.db.insert("attachments", {
      orgId: ctx.org._id,
      issueId: issue._id,
      storageId: args.storageId,
      fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      uploadedBy: ctx.user._id,
    });

    await logActivity(ctx, {
      orgId: ctx.org._id,
      issueId: issue._id,
      actorId: ctx.user._id,
      type: "attachment_added",
      field: "attachment",
      newValue: fileName,
    });

    // Surface the file on the linked GitHub issue (as a comment), if any.
    await scheduleGithubAttachmentComment(
      ctx,
      issue._id,
      attachmentId,
      fileName,
      args.storageId
    );

    return attachmentId;
  },
});

export const listByIssue = orgQuery({
  args: { issueId: v.id("issues") },
  returns: v.array(attachmentValidator),
  handler: async (ctx, args) => {
    await getOrgIssue(ctx, ctx.org._id, args.issueId);

    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();

    const result = [];
    for (const attachment of attachments) {
      const uploader = await ctx.db.get(attachment.uploadedBy);
      result.push({
        _id: attachment._id,
        _creationTime: attachment._creationTime,
        issueId: attachment.issueId,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        uploadedBy: attachment.uploadedBy,
        uploaderName: uploader?.name ?? "Unknown user",
        url: await ctx.storage.getUrl(attachment.storageId),
      });
    }
    return result;
  },
});

export const remove = orgMutation({
  args: { attachmentId: v.id("attachments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment || attachment.orgId !== ctx.org._id) {
      throw new Error("Attachment not found");
    }
    const isUploader = attachment.uploadedBy === ctx.user._id;
    const isAdmin = ctx.membership.role === "admin";
    if (!isUploader && !isAdmin) {
      throw new Error(
        "Only the uploader or an admin can delete an attachment"
      );
    }

    // Delete the mirrored GitHub comment(s) before the mapping rows go away.
    await scheduleGithubAttachmentRemoval(
      ctx,
      attachment.issueId,
      attachment._id
    );

    await ctx.storage.delete(attachment.storageId);
    await ctx.db.delete(attachment._id);

    await logActivity(ctx, {
      orgId: ctx.org._id,
      issueId: attachment.issueId,
      actorId: ctx.user._id,
      type: "attachment_removed",
      field: "attachment",
      oldValue: attachment.fileName,
    });
    return null;
  },
});
