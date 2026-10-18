import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";

export type Role = "admin" | "teacher" | "student";

// Requires a logged-in user. Reads the session from the cookie on every request.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    return res.status(401).json({ error: "Please log in" });
  }

  // Make the user available to the route handler
  res.locals.user = session.user;
  next();
}

// Requires one of the given roles. The check runs on the server,
// so hiding buttons in the UI is never the only protection.
export function requireRole(...roles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      return res.status(401).json({ error: "Please log in" });
    }

    const role = (session.user as { role?: string }).role ?? "student";
    if (!roles.includes(role as Role)) {
      return res.status(403).json({ error: "You do not have permission" });
    }

    res.locals.user = session.user;
    next();
  };
}
