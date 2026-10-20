import { ObjectId } from "mongodb";
import { getDB } from "./db";
import { EMBED_KEY, embedTexts } from "./gemini";

const chunks = () => getDB().collection("chunks");
const materials = () => getDB().collection("materials");

const GROUP_SIZE = 16;

export type IndexResult = {
  status: "ready" | "failed";
  total: number;
  embedded: number;
};

// Gives every chunk of a material an embedding vector.
// Chunks that already have a vector made the same way are skipped, so it is safe to run again.
// This function never throws: on failure it marks the material as "failed" and returns.
export async function indexMaterial(
  materialId: ObjectId,
): Promise<IndexResult> {
  const total = await chunks().countDocuments({ materialId });
  let embedded = 0;

  try {
    // Chunks with no vector yet, or a vector made with another model or size
    const todo = await chunks()
      .find({ materialId, embedKey: { $ne: EMBED_KEY } })
      .project({ text: 1 })
      .sort({ index: 1 })
      .toArray();

    for (let i = 0; i < todo.length; i += GROUP_SIZE) {
      const group = todo.slice(i, i + GROUP_SIZE);
      const vectors = await embedTexts(
        group.map((c) => String(c.text)),
        "document",
      );

      // Save after every group, so a later failure keeps the work already done
      await chunks().bulkWrite(
        group.map((c, n) => ({
          updateOne: {
            filter: { _id: c._id },
            update: { $set: { embedding: vectors[n], embedKey: EMBED_KEY } },
          },
        })),
      );
      embedded += group.length;
    }

    await materials().updateOne(
      { _id: materialId },
      { $set: { indexStatus: "ready" } },
    );
    return { status: "ready", total, embedded };
  } catch (err) {
    console.error("Indexing failed:", err);
    await materials()
      .updateOne({ _id: materialId }, { $set: { indexStatus: "failed" } })
      .catch(() => {});
    return { status: "failed", total, embedded };
  }
}
