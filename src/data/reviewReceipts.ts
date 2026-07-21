import { useState } from "react";
import { DATASET_VERSION, MODEL_VERSION } from "./catalog";

const STORAGE_KEY = "key-of-providence-review-receipts-v1";

export interface ReviewReceipt {
  receiptId: string;
  entityType: "facility" | "policy";
  entityId: string;
  decision: "approve-draft" | "retain-needs-review";
  reviewerAlias: string;
  reason: string;
  createdAt: string;
  datasetVersion: string;
  modelVersion: string;
  previousHash: string | null;
  receiptHash: string;
  authority: "local-unsigned-draft";
}

export interface ReviewReceiptInput {
  entityType: ReviewReceipt["entityType"];
  entityId: string;
  decision: ReviewReceipt["decision"];
  reviewerAlias: string;
  reason: string;
  createdAt?: string;
}

const sha256 = async (text: string) => {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot create a SHA-256 review receipt.");
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

export const createReviewReceipt = async (input: ReviewReceiptInput, previousHash: string | null): Promise<ReviewReceipt> => {
  const reviewerAlias = input.reviewerAlias.trim();
  const reason = input.reason.trim();
  if (reviewerAlias.length < 2) throw new Error("Reviewer alias must contain at least two characters.");
  if (reason.length < 12) throw new Error("Review reason must contain at least twelve characters.");
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(createdAt))) throw new Error("Review time must be a valid ISO timestamp.");
  const receiptId = `local-review:${input.entityType}:${input.entityId}:${createdAt}`;
  const payload = {
    receiptId,
    entityType: input.entityType,
    entityId: input.entityId,
    decision: input.decision,
    reviewerAlias,
    reason,
    createdAt,
    datasetVersion: DATASET_VERSION,
    modelVersion: MODEL_VERSION,
    previousHash,
    authority: "local-unsigned-draft" as const,
  };
  return { ...payload, receiptHash: await sha256(JSON.stringify(payload)) };
};

export const readReviewReceipts = (): ReviewReceipt[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export const appendReviewReceipt = async (input: ReviewReceiptInput) => {
  const receipts = readReviewReceipts();
  const receipt = await createReviewReceipt(input, receipts.at(-1)?.receiptHash ?? null);
  const next = [...receipts, receipt];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return { receipt, receipts: next };
};

export const useReviewReceipts = (entityId: string) => {
  const [allReceipts, setAllReceipts] = useState<ReviewReceipt[]>(readReviewReceipts);
  const append = async (input: Omit<ReviewReceiptInput, "entityId" | "entityType">) => {
    const result = await appendReviewReceipt({ ...input, entityId, entityType: "facility" });
    setAllReceipts(result.receipts);
    return result.receipt;
  };
  return { receipts: allReceipts.filter((receipt) => receipt.entityId === entityId), allReceipts, append };
};

export const downloadReviewReceipts = (receipts: ReviewReceipt[]) => {
  const payload = {
    exportedAt: new Date().toISOString(),
    datasetVersion: DATASET_VERSION,
    modelVersion: MODEL_VERSION,
    authority: "local-unsigned-draft",
    warning: "Hashes detect accidental chain changes but are not authenticated signatures and cannot approve or modify a published release.",
    receipts,
  };
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `key-of-providence-local-review-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
};
