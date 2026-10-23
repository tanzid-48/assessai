import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { buildDetail } from "./papers";

// The paper with its questions filled in, as returned by buildDetail
type Detail = Awaited<ReturnType<typeof buildDetail>>;
type Part = Detail["paper"]["questions"][number]["parts"][number];
type PaperQuestion = NonNullable<Part["question"]>;
type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

export type ExportKind = "paper" | "key";
export type CourseInfo = { code: string; title: string };

const FONT = "Times New Roman";
const SIZE = 22; // half points, so 22 is 11 pt
const MARGIN = 1134; // 2 cm in twips
const WIDTH = 11906 - 2 * MARGIN; // usable width of an A4 page
// Columns of the question table: number, part, question, marks and outcome
const COLUMNS = [500, 560, WIDTH - 500 - 560 - 1500, 1500];

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const NO_TABLE_BORDERS = {
  ...NO_BORDERS,
  insideHorizontal: NONE,
  insideVertical: NONE,
};

const formatMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

type TextStyle = {
  bold?: boolean;
  italics?: boolean;
  size?: number;
  color?: string;
};

function run(text: string, style: TextStyle = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: style.size ?? SIZE,
    bold: style.bold,
    italics: style.italics,
    color: style.color,
  });
}

type LineOptions = TextStyle & {
  align?: Align;
  before?: number;
  after?: number;
  indent?: number;
};

// One paragraph of plain text
function line(text: string, o: LineOptions = {}) {
  return new Paragraph({
    alignment: o.align,
    spacing: { before: o.before ?? 0, after: o.after ?? 60 },
    indent: o.indent ? { left: o.indent } : undefined,
    children: [run(text, o)],
  });
}

// A text with several lines becomes several paragraphs
function lines(text: string, o: LineOptions = {}) {
  return text.split(/\r?\n/).map((t) => line(t, o));
}

const EXAM_VERBS = [
  "Define",
  "Explain",
  "Identify",
  "Describe",
  "Compare",
  "Calculate",
  "State",
  "List",
  "Write",
  "Discuss",
  "Differentiate",
  "Derive",
  "Find",
  "Prove",
  "Analyze",
  "Evaluate",
  "Draw",
  "Illustrate",
  "Justify",
  "Summarize",
  "Outline",
  "Determine",
  "Generate",
  "Compute",
];
const VERB_START = new RegExp(`^(${EXAM_VERBS.join("|")})\\b`);

// PUB papers print the exam verb at the start of a question in bold
function questionParagraphs(text: string) {
  const [first, ...rest] = text.split(/\r?\n/);
  const verb = first.match(VERB_START)?.[1];
  const head = verb
    ? [run(verb, { bold: true }), run(first.slice(verb.length))]
    : [run(first)];
  return [
    new Paragraph({ spacing: { after: 60 }, children: head }),
    ...rest.map((t) => line(t)),
  ];
}

function optionParagraphs(q: PaperQuestion) {
  return (q.options ?? []).map((o, i) =>
    line(`${String.fromCharCode(65 + i)}. ${o}`, { indent: 360, after: 30 }),
  );
}

// The part of the answer key: correct option, suggested answer and the source pages
function answerParagraphs(q: PaperQuestion) {
  const out: Paragraph[] = [];

  if (q.type === "mcq" && q.correctIndex !== null) {
    out.push(
      line(`Correct option: ${String.fromCharCode(65 + q.correctIndex)}`, {
        bold: true,
        before: 80,
      }),
    );
  }
  out.push(
    line(q.type === "mcq" ? "Explanation" : "Suggested answer", {
      bold: true,
      before: 80,
      after: 30,
    }),
  );
  out.push(...lines(q.answer, { color: "333333", after: 30 }));

  // The same file and page is listed once
  const pages = [
    ...new Set(q.sources.map((s) => `${s.fileName}, page ${s.page}`)),
  ];
  if (pages.length > 0) {
    out.push(
      line(`Source: ${pages.join("; ")}`, {
        italics: true,
        size: 18,
        color: "666666",
        before: 60,
      }),
    );
  }
  return out;
}

function cell(width: number, children: Paragraph[]) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.TOP,
    children: children.length > 0 ? children : [new Paragraph("")],
  });
}

type RowArgs = {
  number: string;
  part: string;
  q: PaperQuestion;
  marks: number;
  coLabel: string;
  kind: ExportKind;
};

// One question: number, part, the text (with options and answer in the key) and marks with the outcome
function questionRow({ number, part, q, marks, coLabel, kind }: RowArgs) {
  const outcome = q.cloCode.replace(/^CLO/, coLabel);
  const text = [...questionParagraphs(q.text), ...optionParagraphs(q)];
  if (kind === "key") text.push(...answerParagraphs(q));

  return new TableRow({
    // In the paper a question is not split over two pages. The answer key may be longer than a page.
    cantSplit: kind === "paper",
    children: [
      cell(COLUMNS[0], number ? [line(number, { bold: true })] : []),
      cell(COLUMNS[1], part ? [line(part)] : []),
      cell(COLUMNS[2], text),
      cell(COLUMNS[3], [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 60 },
          children: [run(formatMarks(marks)), run(`   ${outcome}`)],
        }),
      ]),
    ],
  });
}

// The centred "Or," between a question and its choice
function orRow() {
  return new TableRow({
    cantSplit: true,
    children: [
      cell(COLUMNS[0], []),
      cell(COLUMNS[1], []),
      cell(COLUMNS[2], [
        line("Or,", { bold: true, align: AlignmentType.CENTER, before: 40 }),
      ]),
      cell(COLUMNS[3], []),
    ],
  });
}

// The printed heading of the paper
function heading(detail: Detail, kind: ExportKind, course: CourseInfo) {
  const p = detail.paper;
  const out: (Paragraph | Table)[] = [
    line("Pundra University of Science & Technology", {
      bold: true,
      size: 28,
      align: AlignmentType.CENTER,
      after: 40,
    }),
  ];

  if (p.program)
    out.push(
      line(`Program: ${p.program}`, { align: AlignmentType.CENTER, after: 20 }),
    );

  const batchSemester = [
    p.batch && `Batch: ${p.batch}`,
    p.semester && `Semester: ${p.semester}`,
  ]
    .filter(Boolean)
    .join(", ");
  if (batchSemester)
    out.push(line(batchSemester, { align: AlignmentType.CENTER, after: 20 }));

  out.push(
    line(p.title, { bold: true, align: AlignmentType.CENTER, after: 20 }),
  );
  out.push(
    line(`Course Code: ${course.code}      Course Title: ${course.title}`, {
      bold: true,
      align: AlignmentType.CENTER,
      after: 120,
    }),
  );
  if (kind === "key") {
    out.push(
      line("ANSWER KEY (for teachers only)", {
        bold: true,
        size: 24,
        align: AlignmentType.CENTER,
        after: 120,
      }),
    );
  }

  // Time on the left and full marks on the right
  out.push(
    new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      columnWidths: [WIDTH / 2, WIDTH / 2],
      borders: NO_TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            cell(WIDTH / 2, [
              line(`Time: ${p.durationMinutes} Minutes`, { bold: true }),
            ]),
            cell(WIDTH / 2, [
              line(`Full Marks: ${formatMarks(p.totalMarks)}`, {
                bold: true,
                align: AlignmentType.RIGHT,
              }),
            ]),
          ],
        }),
      ],
    }),
  );

  if (p.instructions)
    out.push(
      line(p.instructions, { italics: true, size: 20, before: 80, after: 160 }),
    );
  return out;
}

// Builds the Word file of a paper ("paper") or of its answer key ("key")
export async function renderDocx(
  detail: Detail,
  kind: ExportKind,
  course: CourseInfo,
): Promise<Buffer> {
  const coLabel = detail.paper.coLabel;
  const rows: TableRow[] = [];

  detail.paper.questions.forEach((q, qi) => {
    q.parts.forEach((part, pi) => {
      if (!part.question) return;

      const number = pi === 0 ? `${qi + 1}.` : "";
      const label =
        q.parts.length > 1 ? `(${String.fromCharCode(97 + pi)})` : "";
      rows.push(
        questionRow({
          number,
          part: label,
          q: part.question,
          marks: part.marks,
          coLabel,
          kind,
        }),
      );

      if (part.orQuestion) {
        rows.push(orRow());
        rows.push(
          questionRow({
            number: "",
            part: "",
            q: part.orQuestion,
            marks: part.marks,
            coLabel,
            kind,
          }),
        );
      }
    });
  });

  const doc = new Document({
    creator: "PUB AssessAI",
    title: detail.paper.title,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: MARGIN,
              bottom: MARGIN,
              left: MARGIN,
              right: MARGIN,
            },
          },
        },
        children: [
          ...heading(detail, kind, course),
          new Table({
            width: { size: WIDTH, type: WidthType.DXA },
            columnWidths: COLUMNS,
            borders: NO_TABLE_BORDERS,
            rows,
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
