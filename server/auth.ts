import type { Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { getUserById } from "./db";

export const LOCAL_SESSION_COOKIE = "saas_session";
const encoder = new TextEncoder();

function signingKey() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is required for local authentication.");
  return encoder.encode(value);
}

function cookieValue(req: Request, name: string) {
  const item = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return item?.slice(name.length + 1);
}

export async function createLocalSession(res: Response, userId: number) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(signingKey());

  res.cookie(LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearLocalSession(res: Response) {
  res.clearCookie(LOCAL_SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function localSessionUser(req: Request) {
  const token = cookieValue(req, LOCAL_SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey());
    const userId = Number(payload.userId);
    return Number.isFinite(userId) ? (await getUserById(userId)) ?? null : null;
  } catch {
    return null;
  }
}
