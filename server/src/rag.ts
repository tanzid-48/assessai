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

export type SearchHit = {
  chunkId: string;
  materialId: string;
  fileName: string;
  page: number;
  index: number;
  topicId: string | null;
  score: number;
  text: string;
};

// Both vectors have length 1, so their dot product equals the cosine similarity
function dot(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Finds the chunks of one course whose meaning is closest to the query text.
// A higher score means a closer match (1 is identical, around 0.5 or below is usually unrelated).
export async function searchChunks(
  courseId: ObjectId,
  query: string,
  options: { topicId?: ObjectId; limit?: number } = {},
): Promise<SearchHit[]> {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const [queryVector] = await embedTexts([query], "query");

  // Only vectors made the same way as the query vector can be compared
  const filter: Record<string, unknown> = { courseId, embedKey: EMBED_KEY };
  if (options.topicId) filter.topicId = options.topicId;

  const candidates = await chunks().find(filter).toArray();

  return candidates
    .map((c) => ({
      chunkId: String(c._id),
      materialId: String(c.materialId),
      fileName: String(c.fileName),
      page: Number(c.page),
      index: Number(c.index),
      topicId: c.topicId ? String(c.topicId) : null,
      score:
        Math.round(dot(queryVector, c.embedding as number[]) * 10000) / 10000,
      text: String(c.text),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
