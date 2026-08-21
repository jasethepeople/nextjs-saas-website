#!/usr/bin/env bash
set -euo pipefail

echo "Setting up Northstar…"

if [ ! -f .env ]; then
  cp environment.template .env
  echo "Created .env from environment.template. Update DATABASE_URL and JWT_SECRET before continuing."
else
  echo "Using existing .env file."
fi

pnpm install
pnpm drizzle-kit generate

if grep -q "mysql://USER:PASSWORD@HOST" .env; then
  echo "Database migration skipped: set DATABASE_URL in .env, then run: pnpm drizzle-kit migrate"
else
  pnpm drizzle-kit migrate
  echo "Database migration completed."
fi

echo "Setup complete. Start the app with: pnpm dev"
