import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is missing in the .env file");
  process.exit(1);
}

export const ai = new GoogleGenAI({ apiKey });

// Model settings come from .env, so they can change without touching the code
export const EMBED_MODEL =
  process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";
export const EMBED_DIMENSIONS =
  Number(process.env.GEMINI_EMBED_DIMENSIONS) || 768;

// Text models to try, in order (comma separated in .env)
const TEXT_MODELS = (
  process.env.GEMINI_MODELS ??
  "gemini-3.8-flash,gemini-flash-latest,gemini-3.1-flash-lite"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Describes how a vector was made. Vectors made in different ways must never be compared.
export const EMBED_KEY = `${EMBED_MODEL}:${EMBED_DIMENSIONS}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// True when waiting and trying again can help: the rate limit was hit (429) or the service is busy (5xx)
function isRetryable(err: unknown) {
  const status = (err as { status?: number }).status;
  if (typeof status === "number") return status === 429 || status >= 500;
  return /429|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(
    err instanceof Error ? err.message : String(err),
  );
}

// Runs a Gemini call and retries it a few times, waiting longer after each failure
export async function withRetry<T>(
  label: string,
  run: () => Promise<T>,
  tries = 4,
): Promise<T> {
  let waitMs = 2000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!isRetryable(err) || attempt >= tries) throw err;
      console.warn(
        `${label} failed (attempt ${attempt} of ${tries}), retrying in ${waitMs / 1000} s`,
      );
      await sleep(waitMs);
      waitMs *= 2;
    }
  }
}

// Scales a vector to length 1, so that cosine similarity becomes a simple dot product
function normalize(v: number[]) {
  const length = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) || 1;
  return v.map((x) => x / length);
}

// Turns texts into vectors. Use "document" for material chunks and "query" for a search text.
// Send small groups (the caller sends at most 16 texts at a time).
export async function embedTexts(
  texts: string[],
  kind: "document" | "query",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const res = await withRetry("Embedding", () =>
    ai.models.embedContent({
      model: EMBED_MODEL,
      contents: texts,
      config: {
        taskType:
          kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
        outputDimensionality: EMBED_DIMENSIONS,
      },
    }),
  );

  const vectors = (res.embeddings ?? []).map((e) => e.values ?? []);
  if (vectors.length !== texts.length) {
    throw new Error(
      `Asked for ${texts.length} embeddings but received ${vectors.length}`,
    );
  }
  if (vectors.some((v) => v.length !== EMBED_DIMENSIONS)) {
    throw new Error("Received a vector of an unexpected size");
  }
  return vectors.map(normalize);
}

// Asks Gemini for a JSON answer and checks it against a Zod schema.
// If a model fails (limit reached, busy, or an answer in the wrong format), the next model is tried.
export async function generateJson<T>(
  prompt: string,
  schema: ZodType<T>,
): Promise<{ data: T; model: string }> {
  let lastError: unknown = new Error("No Gemini text model is configured");

  for (const model of TEXT_MODELS) {
    try {
      const res = await withRetry(`Generation (${model})`, () =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json", temperature: 0.4 },
        }),
      );

      // Some models wrap the JSON in a code fence, so remove it first
      const raw = (res.text ?? "")
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");

      const parsed = schema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        throw new Error(
          `The answer did not match the expected format: ${parsed.error.issues[0]?.message ?? "unknown problem"}`,
        );
      }
      return { data: parsed.data, model };
    } catch (err) {
      lastError = err;
      console.warn(
        `Model ${model} failed:`,
        err instanceof Error ? err.message.slice(0, 200) : err,
      );
    }
  }
  throw lastError;
}
