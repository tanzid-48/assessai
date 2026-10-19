import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is missing in the .env file");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// Model names come from .env, so they can change without touching the code
const TEXT_MODELS = (
  process.env.GEMINI_MODELS ??
  "gemini-flash-latest,gemini-3.8-flash,gemini-3.1-flash-lite"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

// Keep error output short so it is easy to read
function short(err: unknown) {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, " ").slice(0, 220);
}

// 1) Which flash and embedding models can this key see?
async function listModels() {
  console.log("\n1) Models this key can see (flash and embedding only):");
  try {
    const names: string[] = [];
    const pager = await ai.models.list();
    for await (const m of pager) {
      const name = (m.name ?? "").replace("models/", "");
      if (/flash|embedding/i.test(name)) names.push(name);
    }
    console.log(names.length ? names.join("\n") : "(none found)");
  } catch (err) {
    console.log("Could not list models:", short(err));
  }
}

// 2) Does each text model answer, and does it support JSON output?
async function testTextModels() {
  console.log("\n2) Text generation with JSON output:");
  for (const model of TEXT_MODELS) {
    const started = Date.now();
    try {
      const res = await ai.models.generateContent({
        model,
        contents: 'Return a JSON object with the key "ok" set to true.',
        config: { responseMimeType: "application/json" },
      });
      console.log(
        `OK    ${model}  (${Date.now() - started} ms)  ->  ${res.text?.trim()}`,
      );
    } catch (err) {
      console.log(`FAIL  ${model}  ->  ${short(err)}`);
    }
  }
}

// 3) Does the embedding model work?
async function testEmbedding() {
  console.log("\n3) Embedding:");
  try {
    const res = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: ["Digital image processing basics"],
    });
    const size = res.embeddings?.[0]?.values?.length;
    console.log(`OK    ${EMBED_MODEL}  ->  vector size ${size}`);
  } catch (err) {
    console.log(`FAIL  ${EMBED_MODEL}  ->  ${short(err)}`);
  }
}

async function main() {
  await listModels();
  await testTextModels();
  await testEmbedding();
}

main();
