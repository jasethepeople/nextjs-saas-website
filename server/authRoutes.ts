import type { Express, Request } from "express";
import { randomUUID } from "crypto";
import { createLocalSession } from "./auth";
import { upsertGoogleUser } from "./db";

const GOOGLE_STATE_COOKIE = "google_oauth_state";

function appOrigin(req: Request) {
  return `${req.protocol}://${req.get("host")}`;
}

export function registerCredentialOAuthRoutes(app: Express) {
  app.get("/api/auth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.redirect("/sign-in?error=google_not_configured");

    const state = randomUUID();
    const redirectUri = `${appOrigin(req)}/api/auth/google/callback`;
    res.cookie(GOOGLE_STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/" });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const state = req.query.state;
    const code = req.query.code;
    const expectedState = req.cookies?.[GOOGLE_STATE_COOKIE];
    res.clearCookie(GOOGLE_STATE_COOKIE, { path: "/" });
    if (typeof code !== "string" || typeof state !== "string" || state !== expectedState) return res.redirect("/sign-in?error=google_state_invalid");
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.redirect("/sign-in?error=google_not_configured");

    try {
      const redirectUri = `${appOrigin(req)}/api/auth/google/callback`;
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const token = await tokenResponse.json() as { access_token?: string };
      if (!tokenResponse.ok || !token.access_token) throw new Error("Google token exchange failed");
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
      const profile = await profileResponse.json() as { sub?: string; email?: string; name?: string };
      if (!profileResponse.ok || !profile.sub || !profile.email) throw new Error("Google profile could not be verified");
      const user = await upsertGoogleUser({ subject: profile.sub, email: profile.email, name: profile.name ?? null });
      await createLocalSession(res, user.id);
      return res.redirect("/app");
    } catch (error) {
      console.error("[Google OAuth]", error);
      return res.redirect("/sign-in?error=google_failed");
    }
  });
}
