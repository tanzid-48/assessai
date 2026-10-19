// Letters of the course code (e.g. "CSE") shown inside the course icon
export function prefixFor(code: string) {
  return code.replace(/[^A-Za-z]/g, "").slice(0, 3) || "?";
}
