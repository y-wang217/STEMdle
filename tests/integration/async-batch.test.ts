/** Asynchronous generation: a batch is created immediately, then progresses through stages in the background. */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { executeBatch, startGenerationBatch } from "@/lib/factory/pipeline";
import { getActivity } from "@/lib/factory/activity";
import { resetDb } from "../helpers";

let adminId: string;
beforeAll(async () => {
  ({ adminId } = await resetDb());
});

describe("async generation batches", () => {
  it("starts queued, finishes with a stored summary, and shows up in activity", async () => {
    const { batchId } = await startGenerationBatch({ slot: 2, count: 3, providerId: "procedural", adminId, seed: 5 });
    const [queued] = await sql<{ status: string; stage: string }[]>`select status, stage from generation_batches where id = ${batchId}`;
    expect(queued).toEqual({ status: "running", stage: "queued" });
    expect((await getActivity()).batches.find((b) => b.id === batchId)?.status).toBe("running");

    const summary = await executeBatch(batchId);
    expect(summary.produced).toBe(3);
    const act = await getActivity();
    const b = act.batches.find((x) => x.id === batchId)!;
    expect(b).toMatchObject({ status: "completed", stage: "done", produced: 3 });
    expect(b.summary?.passed).toBe(summary.passed);
    await expect(executeBatch(batchId)).rejects.toThrow(/completed/);
  });

  it("marks batches that stopped responding as failed instead of running forever", async () => {
    const { batchId } = await startGenerationBatch({ slot: 2, count: 2, providerId: "procedural", adminId, seed: 6 });
    await sql`update generation_batches set updated_at = now() - interval '7 minutes' where id = ${batchId}`;
    const b = (await getActivity()).batches.find((x) => x.id === batchId)!;
    expect(b.status).toBe("failed");
    expect(b.error).toMatch(/stopped responding/);
  });

  it("rejects invalid requests before creating a batch", async () => {
    await expect(startGenerationBatch({ slot: 9, count: 3, providerId: "procedural", adminId })).rejects.toThrow(/slot/);
    await expect(startGenerationBatch({ slot: 1, count: 0, providerId: "procedural", adminId })).rejects.toThrow(/count/);
  });
});
