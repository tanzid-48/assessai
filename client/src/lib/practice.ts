// The shapes of what the practice, tutor and progress routes of the server send

export type QType = "mcq" | "short" | "broad";
export type Source = { fileName: string; page: number };

export const TYPE_LABEL: Record<QType, string> = {
  mcq: "Multiple choice",
  short: "Short answer",
  broad: "Broad answer",
};

export type Weak = { topic: string; percent: number };
export type TopicInfo = {
  topicId: string;
  name: string;
  mcq: number;
  short: number;
  broad: number;
};
export type CourseInfo = {
  courseId: string;
  code: string;
  title: string;
  weak: Weak[];
  topics: TopicInfo[];
};

export type Item = {
  slot: string;
  number: number;
  type: QType;
  text: string;
  options: string[] | null;
  topicName: string | null;
  cloCode: string;
  answered: boolean;
  // These come back only after the question has been answered
  yourChoice?: number | null;
  yourText?: string;
  correct?: boolean | null;
  correctChoice?: number | null;
  solution?: string;
  sources?: Source[];
};
export type Summary = {
  total: number;
  answered: number;
  mcqAnswered: number;
  correct: number;
  percent: number | null;
  wrongTopics: string[];
};
export type Session = {
  sessionId: string;
  status: "in_progress" | "finished";
  startedAt: string;
  summary: Summary;
  items: Item[];
};

export type StartBody = {
  courseId: string;
  topicId?: string;
  type: QType;
  count: number;
  weakOnly: boolean;
};
