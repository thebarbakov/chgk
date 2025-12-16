import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { config } from "./config";

type Session = { login: string; issuedAt: number; expiresAt: number };

// Stateless token based on HMAC, so не слетает при рестарте сервера.
export class AdminSessionManager {
  constructor(private ttlMs: number = config.adminSessionTtlMs || 1000 * 60 * 60 * 12) {}

  getTtlMs(): number {
    return this.ttlMs;
  }

  private sign(payload: string): string {
    return crypto.createHmac("sha256", config.appSecret).update(payload).digest("hex");
  }

  issue(login: string): string {
    const now = Date.now();
    const expiresAt = now + this.ttlMs;
    const payload = `${login}.${now}.${expiresAt}`;
    const token = `${Buffer.from(payload).toString("base64url")}.${this.sign(payload)}`;
    return token;
  }

  verify(token: string | undefined): Session | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0], "base64url").toString("utf8");
    const [login, issuedStr, expStr] = payload.split(".");
    if (!login || !issuedStr || !expStr) return null;
    const expectedSig = this.sign(payload);
    if (expectedSig !== parts[1]) return null;
    const issuedAt = Number(issuedStr);
    const expiresAt = Number(expStr);
    if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt)) return null;
    if (expiresAt < Date.now()) return null;
    return { login, issuedAt, expiresAt };
  }

  revoke(_token: string | undefined) {
    // Stateless, ничего не делаем.
  }
}

export interface AuthedRequest extends Request {
  adminLogin?: string;
}

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return header.split(";").reduce<Record<string, string>>((acc, pair) => {
    const [rawName, ...rest] = pair.trim().split("=");
    if (!rawName) return acc;
    const name = rawName.trim();
    const value = rest.join("=");
    acc[name] = decodeURIComponent(value || "");
    return acc;
  }, {});
}

function extractAdminToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (bearer) return bearer;
  const cookies = parseCookies(req.headers.cookie);
  return cookies[config.adminCookieName];
}

export function requireAdmin(manager: AdminSessionManager) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const token = extractAdminToken(req);
    const session = manager.verify(token);
    if (!session) {
      return res.status(401).json({ error: "unauthorized" });
    }
    req.adminLogin = session.login;
    return next();
  };
}
