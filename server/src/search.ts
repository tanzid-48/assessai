import { Router } from "express";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";
import { loadCourse } from "./outline";
import { searchChunks } from "./rag";

// Finds the parts of a course's materials that best match a question or a topic
export const searchRouter = Router();

const searchSchema = z.object({
  query: z.string().trim().min(3).max(500),
  topicId: z.string().optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

searchRouter.post(
  "/:courseId/search",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Write a search text of 3 to 500 characters" });
    }

    // A topic filter is optional, but if given it must belong to this course
    let topicId: ObjectId | undefined;
    if (parsed.data.topicId) {
      const topic = ObjectId.isValid(parsed.data.topicId)
        ? await getDB()
            .collection("topics")
            .findOne({
              _id: new ObjectId(parsed.data.topicId),
              courseId: course._id,
            })
        : null;
      if (!topic)
        return res
          .status(400)
          .json({ error: "Topic not found in this course" });
      topicId = topic._id;
    }

    try {
      const hits = await searchChunks(course._id, parsed.data.query, {
        topicId,
        limit: parsed.data.limit,
      });
      res.json({ query: parsed.data.query, hits });
    } catch (err) {
      console.error("Search failed:", err);
      res.status(502).json({
        error:
          "The AI service did not respond or its limit was reached. Please try again in a minute.",
      });
    }
  },
);
