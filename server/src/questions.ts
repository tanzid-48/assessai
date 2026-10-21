import { Router } from "express";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";
import { loadCourse } from "./outline";
import { searchChunks } from "./rag";
import { generateJson } from "./gemini";

// AI-written exam questions. New questions always start as "pending" until a teacher approves them.
export const questionsRouter = Router();

const topicsCol = () => getDB().collection("topics");
const closCol = () => getDB().collection("clos");
const chunksCol = () => getDB().collection("chunks");
const questionsCol = () => getDB().collection("questions");

// The materials must match the topic at least this well before any question is written.
// In tests unrelated text scored about 0.50 and related text 0.59 or more.
const MIN_SCORE = 0.55;
// How many of the best matching chunks are used (each one together with the chunk before and after it)
const TOP_HITS = 4;

// What the teacher sends
const generateSchema = z.object({
  topicId: z.string(),
  cloId: z.string(),
  type: z.enum(["mcq", "short", "broad"]),
  count: z.number().int().min(1).max(5).default(3),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});
type QuestionType = z.infer<typeof generateSchema>["type"];

// What the AI must send back. Capital letters are tolerated, for example "Easy".
const lower = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : v;
export const BLOOM = [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
] as const;

const aiQuestion = z.object({
  text: z.string().trim().min(10).max(800),
  options: z.array(z.string().trim().min(1).max(300)).optional(),
  correctIndex: z.number().int().optional(),
  answer: z.string().trim().min(3).max(3000),
  difficulty: z.preprocess(lower, z.enum(["easy", "medium", "hard"])),
  bloom: z.preprocess(lower, z.enum(BLOOM)),
  sources: z.array(z.number().int()).min(1).max(8),
});
const aiOutput = z.object({ questions: z.array(aiQuestion).min(1).max(10) });

// A piece of the materials that is shown to the AI
type Excerpt = {
  chunkId: ObjectId;
  materialId: ObjectId;
  fileName: string;
  page: number;
  index: number;
  text: string;
};

// Takes the best matches plus the chunk before and after each one,
// because a table or a worked example can continue in the next chunk.
async function loadExcerpts(
  courseId: ObjectId,
  hits: { materialId: string; index: number }[],
): Promise<Excerpt[]> {
  const wanted = hits.map((h) => ({
    materialId: new ObjectId(h.materialId),
    index: { $in: [h.index - 1, h.index, h.index + 1] },
  }));

  // The vectors are long and not needed here
  const docs = await chunksCol()
    .find({ courseId, $or: wanted })
    .project({ embedding: 0 })
    .toArray();

  return docs
    .map((d) => ({
      chunkId: d._id as ObjectId,
      materialId: d.materialId as ObjectId,
      fileName: String(d.fileName),
      page: Number(d.page),
      index: Number(d.index),
      text: String(d.text),
    }))
    .sort(
      (a, b) =>
        String(a.materialId).localeCompare(String(b.materialId)) ||
        a.index - b.index,
    );
}

const TYPE_RULES: Record<QuestionType, string> = {
  mcq: 'Multiple choice: "options" holds exactly 4 different options and "correctIndex" is the position (0 to 3) of the one correct option. "answer" explains in one or two sentences why that option is correct.',
  short:
    'Short answer: a question that can be answered in 1 to 3 sentences. "answer" is the suggested answer. Do not include "options" or "correctIndex".',
  broad:
    'Broad answer: a question that needs a longer, structured answer or a worked calculation. "answer" is the full suggested answer with the key points or the steps. Do not include "options" or "correctIndex".',
};

function buildPrompt(args: {
  course: string;
  topic: string;
  cloCode: string;
  cloText: string;
  type: QuestionType;
  count: number;
  difficulty?: string;
  excerpts: Excerpt[];
}) {
  const excerptText = args.excerpts
    .map((e, i) => `[${i + 1}] (${e.fileName}, page ${e.page})\n${e.text}`)
    .join("\n\n");

  return `You write exam questions for a university course. Use ONLY the numbered excerpts below as the source of facts. Do not use outside knowledge.

Course: ${args.course}
Topic: ${args.topic}
Learning outcome (${args.cloCode}): ${args.cloText}

Task: write ${args.count} different ${args.type} question(s) about this topic that test the learning outcome.${
    args.difficulty
      ? ` Every question must have the difficulty "${args.difficulty}".`
      : " Mix the difficulty levels."
  }

Rules:
- Every question and its answer must be fully supported by the excerpts. Never ask about something the excerpts do not cover.
- ${TYPE_RULES[args.type]}
- Start each question with an exam verb such as Define, Explain, Identify, Describe, Compare, Calculate or State.
- "difficulty" is easy, medium or hard. "bloom" is one of: remember, understand, apply, analyze, evaluate, create.
- "sources" lists the numbers of the excerpts that support the question and its answer, for example [2, 3].
- For a calculation, work it out carefully and show the result in "answer".
- The excerpts come from a PDF, so some words may be joined together by a reading error (for example "expected value"). Write such words correctly in the questions and answers.
- Write formulas in plain text such as E[X] = 1/λ and (a + b) / 2. Do not use LaTeX or dollar signs.
- Write in English. Return only JSON.

Return this JSON shape ("options" and "correctIndex" only for multiple choice):
{"questions":[{"text":"...","options":["...","...","...","..."],"correctIndex":0,"answer":"...","difficulty":"easy","bloom":"remember","sources":[1]}]}

Excerpts:
${excerptText}`;
}

// Generate questions from the course materials (the teacher of the course, or an admin)
questionsRouter.post(
  "/:courseId/questions/generate",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Choose a topic, a CLO and a question type (1 to 5 questions)",
      });
    }
    const { topicId, cloId, type, count, difficulty } = parsed.data;

    if (!ObjectId.isValid(topicId) || !ObjectId.isValid(cloId)) {
      return res.status(400).json({ error: "Invalid topic or CLO" });
    }

    // Both must belong to this course
    const [topic, clo] = await Promise.all([
      topicsCol().findOne({ _id: new ObjectId(topicId), courseId: course._id }),
      closCol().findOne({ _id: new ObjectId(cloId), courseId: course._id }),
    ]);
    if (!topic)
      return res.status(400).json({ error: "Topic not found in this course" });
    if (!clo)
      return res.status(400).json({ error: "CLO not found in this course" });

    try {
      // 1. Find the parts of the materials that match the topic
      const hits = await searchChunks(course._id, String(topic.name), {
        limit: TOP_HITS,
      });
      if (hits.length === 0) {
        return res.status(422).json({
          error:
            "No material is ready for this course yet. Upload a PDF first.",
          topScore: 0,
        });
      }
      const topScore = hits[0].score;
      if (topScore < MIN_SCORE) {
        return res.status(422).json({
          error: `The uploaded materials do not cover "${topic.name}" well enough. Upload material about this topic first.`,
          topScore,
        });
      }

      // 2. Ask the AI for questions based on those parts only
      const excerpts = await loadExcerpts(course._id, hits);
      const { data, model } = await generateJson(
        buildPrompt({
          course: `${course.code} ${course.title}`,
          topic: String(topic.name),
          cloCode: String(clo.code),
          cloText: String(clo.text),
          type,
          count,
          difficulty,
          excerpts,
        }),
        aiOutput,
      );

      // 3. Keep only the questions that are complete and point to real excerpts
      const valid: { q: z.infer<typeof aiQuestion>; refs: number[] }[] = [];
      let dropped = 0;

      for (const q of data.questions) {
        if (valid.length >= count) break;

        const refs = [...new Set(q.sources)].filter(
          (n) => n >= 1 && n <= excerpts.length,
        );
        if (refs.length === 0) {
          dropped++;
          continue;
        }

        if (type === "mcq") {
          const options = q.options ?? [];
          const distinct =
            new Set(options.map((o) => o.toLowerCase())).size === 4;
          const indexOk =
            q.correctIndex !== undefined &&
            q.correctIndex >= 0 &&
            q.correctIndex <= 3;
          if (options.length !== 4 || !distinct || !indexOk) {
            dropped++;
            continue;
          }
        }
        valid.push({ q, refs });
      }

      if (valid.length === 0) {
        return res.status(502).json({
          error: "The AI did not return usable questions. Please try again.",
        });
      }

      // 4. Save them as "pending". The source reference is the file and the page of each excerpt.
      const docs = valid.map(({ q, refs }) => ({
        courseId: course._id,
        topicId: topic._id,
        cloId: clo._id,
        cloCode: clo.code,
        type,
        text: q.text,
        options: type === "mcq" ? q.options : null,
        correctIndex: type === "mcq" ? q.correctIndex : null,
        answer: q.answer,
        difficulty: difficulty ?? q.difficulty,
        bloom: q.bloom,
        // The same file and page is listed only once, even if two excerpts came from it
        sources: [
          ...new Map(
            refs.map((n) => {
              const e = excerpts[n - 1];
              return [
                `${e.materialId}:${e.page}`,
                {
                  chunkId: e.chunkId,
                  materialId: e.materialId,
                  fileName: e.fileName,
                  page: e.page,
                },
              ] as const;
            }),
          ).values(),
        ],
        status: "pending",
        generatedBy: model,
        createdBy: new ObjectId(res.locals.user.id),
        createdAt: new Date(),
      }));

      const inserted = await questionsCol().insertMany(docs);

      res.status(201).json({
        model,
        topScore,
        dropped,
        questions: docs.map((d, i) => ({ _id: inserted.insertedIds[i], ...d })),
      });
    } catch (err) {
      console.error("Question generation failed:", err);
      res.status(502).json({
        error:
          "The AI service did not give a usable answer. Please try again in a minute.",
      });
    }
  },
);
