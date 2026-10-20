import fs from "node:fs";

// pdfjs-dist ships a "legacy" build for Node.js, so that one is used here
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type PageText = { page: number; text: string };

// Reads a PDF and returns the text of every page.
// Page numbers start at 1, the same numbers a student sees in the PDF viewer.
export async function extractPdfPages(filePath: string): Promise<PageText[]> {
  const data = new Uint8Array(fs.readFileSync(filePath));

  // Keep the loading task, because it is what must be closed when we are done
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const pdf = await loadingTask.promise;

  const pages: PageText[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();

      // Join the text pieces of the page. A line break is added where the PDF marks one.
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }

      // Tidy the spaces and blank lines
      const clean = text
        .replace(/[ \t]+/g, " ")
        .replace(/ ?\n ?/g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();

      pages.push({ page: n, text: clean });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

export type Chunk = { page: number; index: number; text: string };

const MAX_WORDS = 220; // about one or two paragraphs
const MIN_WORDS = 25; // anything shorter is merged into its neighbour or dropped

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

// Splits every page into chunks of roughly MAX_WORDS words.
// A chunk never crosses a page boundary, so its page number is always exact.
export function chunkPages(pages: PageText[]): Chunk[] {
  const result: { page: number; text: string }[] = [];

  for (const { page, text } of pages) {
    if (!text) continue;

    const pieces: string[] = [];
    let lines: string[] = [];
    let count = 0;

    const flush = () => {
      if (lines.length) {
        pieces.push(lines.join("\n"));
        lines = [];
        count = 0;
      }
    };

    // Work line by line, so a chunk ends at the end of a line and not in the middle of a sentence
    for (const line of text.split("\n")) {
      const words = line.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;

      // One extremely long line is cut into several pieces
      if (words.length > MAX_WORDS) {
        flush();
        for (let i = 0; i < words.length; i += MAX_WORDS) {
          pieces.push(words.slice(i, i + MAX_WORDS).join(" "));
        }
        continue;
      }

      // Start a new chunk when this line would make the current one too long
      if (count + words.length > MAX_WORDS) flush();
      lines.push(words.join(" "));
      count += words.length;
    }
    flush();

    // A short last piece is merged into the one before it, so nothing at the end of a page is lost
    if (pieces.length > 1 && wordCount(pieces[pieces.length - 1]) < MIN_WORDS) {
      const tail = pieces.pop() as string;
      pieces[pieces.length - 1] += "\n" + tail;
    }

    for (const t of pieces) result.push({ page, text: t });
  }

  // Drop tiny fragments, such as a page that only holds a page number or a title
  return result
    .filter((c) => wordCount(c.text) >= MIN_WORDS)
    .map((c, i) => ({ ...c, index: i }));
}
