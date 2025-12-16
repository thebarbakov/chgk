import "dotenv/config";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL),
  adminLogin: required("ADMIN_LOGIN", process.env.ADMIN_LOGIN),
  adminPassword: required("ADMIN_PASSWORD", process.env.ADMIN_PASSWORD),
  appSecret: required("APP_SECRET", process.env.APP_SECRET),
  nodeEnv: process.env.NODE_ENV || "development",
  adminSessionTtlMs: Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 7), // 7 дней по умолчанию
  blackBoxMusicPath: process.env.BLACK_BOX_MUSIC_PATH || "/media/sfx/black_box.mp3",
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  adminCookieName: process.env.ADMIN_COOKIE_NAME || "chgk_admin_token",
  cookieSecure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
};
