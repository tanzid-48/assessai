// Gradient pairs for course icons. The course code decides which one is used,
// so a course keeps the same colour on every page.
const GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-fuchsia-500 to-purple-500",
];

export function gradientFor(code: string) {
  let sum = 0;
  for (const ch of code) sum += ch.charCodeAt(0);
  return GRADIENTS[sum % GRADIENTS.length];
}

// Letters of the code (e.g. "CSE") shown inside the icon
export function prefixFor(code: string) {
  return code.replace(/[^A-Za-z]/g, "").slice(0, 3) || "?";
}
