# Sticker Swap — Phase 1 Implementation Plan ("Master Swap Diff Tool")

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-operator web app (live on Render, used from a phone browser) where the Master maintains his Panini World Cup 2026 collection and computes reservation-safe, two-way swap diffs against pasted "Figuritas"-format lists from counterparties.

**Architecture:** Next.js 16 (App Router) front end over a framework-agnostic `src/server/` domain layer (import adapter, atomic collection service, pure diff, commitment/completion). One integer `quantity` per sticker is the source of truth; all mutations are atomic single-SQL-statement writes floored at `1 + committed` so a promised spare can never be double-promised, tapped away, re-pasted away, or completed away. A single shared password (signed httpOnly cookie, enforced in `src/proxy.ts`) gates everything — no user accounts in Phase 1.

**Tech Stack:** Next.js 16 + React 19 + TypeScript · Prisma 6 + PostgreSQL · Tailwind CSS v4 · Zod 4 · jose (signed cookie) · `@paralleldrive/cuid2` · Vitest 3 (unit + real-Postgres integration) · Render (Web Service + managed Postgres + release seed) · GitHub Actions CI (Postgres service).

**Source spec:** [`docs/superpowers/specs/2026-06-13-sticker-swap-phase1-design.md`](../specs/2026-06-13-sticker-swap-phase1-design.md). Section references like "spec §7.2" point at that file. Parent design: [`2026-06-13-sticker-swap-design.md`](../specs/2026-06-13-sticker-swap-design.md).

---

## How to use this plan

- Work top-to-bottom. Each sub-phase (P1.0 → P1.3) is independently shippable and ends in a green test suite + a working app.
- Every task is TDD where it touches domain logic: write the failing test, watch it fail, implement the minimum, watch it pass, commit. Pure logic is unit-tested; the atomic SQL floors are integration-tested against a **real** Postgres (they cannot be meaningfully mocked).
- Run commands from the repo root (`c:\Users\T0226129\Claude\Projects\Sticker Swap`). Examples use `npm` and POSIX-style paths; on PowerShell the same npm scripts work.
- The repo already contains `docs/`, `.git`, and `.gitignore`. **Do not** run `create-next-app` (it refuses a non-empty dir) — this plan scaffolds files explicitly.

---

## Conventions (read once — every task depends on these)

These names/signatures are fixed. Later tasks reference them verbatim; do not rename.

**Path alias:** `@/*` → `src/*` (configured in `tsconfig.json` and Vitest).

**Canonical sticker code** — `src/lib/code.ts`:
```ts
export const codeOf = (shortName: string, number: string): string => `${shortName}-${number}`;

export function splitCode(code: string): [shortName: string, number: string] {
  const i = code.lastIndexOf("-");
  return [code.slice(0, i), code.slice(i + 1)];
}

/** Deterministic order: shortName lexicographic, then number numerically ("00" sorts first). */
export function compareCodes(a: string, b: string): number {
  const [sa, na] = splitCode(a);
  const [sb, nb] = splitCode(b);
  if (sa !== sb) return sa < sb ? -1 : 1;
  return Number(na) - Number(nb);
}
```

**Tile state** — `src/lib/tile.ts`:
```ts
export type TileState = "missing" | "owned" | "spare";
export const tileState = (q: number): TileState => (q <= 0 ? "missing" : q === 1 ? "owned" : "spare");
export const spareCount = (q: number): number => Math.max(q - 1, 0);
```

**Reservation floor (the one rule that makes a promised spare un-removable)** — `src/server/collection/floor.ts`:
```ts
/** Lowest quantity a sticker may hold given `committed` PENDING GIVE copies.
 *  committed === 0 → may fall to 0 (missing). committed > 0 → must keep 1 owned + committed spares. */
export function flooredQuantity(target: number, committed: number): number {
  return committed > 0 ? Math.max(target, committed + 1) : Math.max(target, 0);
}
```

**Import contract** — `src/server/import/types.ts`:
```ts
export type Intent = "need" | "swap" | "own";
export type ParseMode = "combined"; // Phase 1 only uses combined mode
export interface ParsedEntry { shortName: string; number: string; copies: number; intent: Intent; }
export interface ParseResult { entries: ParsedEntry[]; skipped: string[]; warnings: string[]; }
export interface FormatParser { id: string; label: string; parse(text: string, mode: ParseMode): ParseResult; }
```

**Pure diff** — `src/server/diff/compute.ts`:
```ts
export interface DiffInput {
  myQuantities: Map<string, number>;        // code -> quantity (>=1; absent = missing)
  committedGiveByCode: Map<string, number>; // code -> Σ PENDING GIVE qty (ALL counterparties)
  committedGetCodes: Set<string>;           // codes with a PENDING GET (ANY counterparty)
  theirMissing: Set<string>;                // M_C (codes)
  theirSpares: Map<string, number>;         // S_C (code -> copies)
  thisCpGiveCodes: Set<string>;             // PENDING GIVE to THIS counterparty
  thisCpGetCodes: Set<string>;              // PENDING GET from THIS counterparty
  universeCodes: Set<string>;               // all valid codes (ignore anything else)
}
export interface DiffResult {
  iGive: string[];        // available: my spares they're missing
  theyGive: string[];     // available: their spares I'm missing
  committedGive: string[];// already committed GIVE to this cp
  committedGet: string[]; // already committed GET from this cp
}
export function computeDiff(input: DiffInput): DiffResult;
```

**Collection service** — `src/server/collection/service.ts`:
```ts
export function applyDeltas(
  deltas: { stickerId: string; delta: number }[],
): Promise<{ stickerId: string; quantity: number }[]>; // quantity 0 means now missing
```

**Counterparty parse** — `src/server/counterparty/parse.ts`:
```ts
export interface CounterpartyParse { missing: Set<string>; spares: Map<string, number>; skipped: string[]; }
export function parseCounterparty(rawText: string, universeCodes: Set<string>): CounterpartyParse;
```

**Commitment service** — `src/server/swaps/commitments.ts`:
```ts
export type Direction = "GIVE" | "GET";
export function createCommitment(
  counterpartyId: string, stickerId: string, direction: Direction,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
export function cancelCommitment(id: string): Promise<void>;
export function completeSwap(counterpartyId: string): Promise<void>;
```

**Auth:** cookie name `ss_session`; helpers in `src/server/auth/cookie.ts` (jose, edge-safe) and `src/server/auth/password.ts` (node `timingSafeEqual`).

**Env vars:** `DATABASE_URL`, `APP_PASSWORD`, `COOKIE_SECRET` (≥16 chars), `APP_URL` (optional).

---

## File Structure (built across this plan)

```
sticker-swap/
├─ package.json · tsconfig.json · next.config.ts · postcss.config.mjs · .node-version · .env.example
├─ render.yaml                       # web service + Postgres + release seed (P1.0)
├─ docker-compose.test.yml           # local test Postgres (P1.0)
├─ vitest.config.ts · vitest.integration.config.ts
├─ .github/workflows/ci.yml
├─ data/albums/world-cup-2026.txt    # canonical 994-sticker universe
├─ prisma/
│  ├─ schema.prisma                  # 6 models
│  ├─ migrations/
│  └─ seed.ts                        # calls seedUniverse(); idempotent
├─ tests/
│  ├─ unit/                          # figuritas, floor, diff, counterparty parse, copy-text, universe parser
│  └─ integration/                   # helpers + decrement floor, import clamp, commitments, completion
└─ src/
   ├─ proxy.ts                       # Next 16 middleware: password-cookie gate
   ├─ app/
   │  ├─ layout.tsx · globals.css
   │  ├─ login/page.tsx
   │  ├─ (app)/layout.tsx            # top nav: Album · Counterparties · Active Swaps
   │  ├─ (app)/page.tsx              # Album grid + summary + bulk import
   │  ├─ (app)/counterparties/page.tsx · (app)/counterparties/[id]/page.tsx
   │  ├─ (app)/swaps/page.tsx        # Active Swaps overview
   │  └─ api/ login · logout · collection · collection/import ·
   │           counterparties · counterparties/[id] ·
   │           counterparties/[id]/commitments · counterparties/[id]/complete ·
   │           commitments/[id] · swaps/active
   ├─ server/
   │  ├─ auth/        cookie.ts · password.ts
   │  ├─ seed/        universe.ts          # pure parser + seedUniverse(prisma, text)
   │  ├─ import/      types.ts · figuritas.ts · registry.ts
   │  ├─ collection/  floor.ts · service.ts · import.ts · summary.ts
   │  ├─ counterparty/ parse.ts
   │  ├─ diff/        compute.ts · query.ts
   │  └─ swaps/       commitments.ts · active.ts
   ├─ components/     LoginForm · AlbumGrid · StickerTile · ImportDialog ·
   │                  DiffView · CommitToggle · CancelButton · CompleteButton ·
   │                  CopyButton · ActiveSwapsList
   └─ lib/            prisma.ts · env.ts · code.ts · tile.ts · copy-text.ts · schemas.ts · debounce.ts
```

---
---

# Sub-Phase P1.0 — Scaffold & Seed

**Delivers:** Next.js 16 + Prisma + Tailwind, 6-model schema, the 994-sticker seed, `render.yaml`, the password gate (`/login` + `src/proxy.ts`), and CI with a Postgres service. Ends with: `npm run dev` serves a login-gated empty album shell; `npm run test` and `npm run test:integration` are green.

---

### Task 0.1: Scaffold the Next.js 16 + TypeScript + Tailwind app shell

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.node-version`, `next-env.d.ts` (auto), `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (temporary placeholder)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sticker-swap",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=20" },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts",
    "test:watch": "vitest --config vitest.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed"
  },
  "dependencies": {
    "@paralleldrive/cuid2": "^2.2.2",
    "@prisma/client": "^6.2.0",
    "jose": "^5.9.0",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^25.0.0",
    "prisma": "^6.2.0",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vite-tsconfig-paths": "^5.1.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.ts`, `postcss.config.mjs`, `.node-version`**

`next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;
```

`postcss.config.mjs`:
```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

`.node-version`:
```
20
```

- [ ] **Step 4: Create the base app shell**

`src/app/globals.css`:
```css
@import "tailwindcss";

:root { color-scheme: light dark; }
body { @apply bg-gray-50 text-gray-900; }
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sticker Swap",
  description: "Master swap diff tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` (temporary; replaced in P1.1 Task 1.10):
```tsx
export default function Home() {
  return <main className="p-6 text-xl font-semibold">Sticker Swap — scaffold OK</main>;
}
```

- [ ] **Step 5: Install and verify the build**

Run:
```bash
npm install
npm run build
```
Expected: install succeeds; `next build` completes with no type errors and lists the `/` route.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json next.config.ts postcss.config.mjs .node-version next-env.d.ts src/app
git commit -m "chore: scaffold Next.js 16 + TypeScript + Tailwind app shell"
```

---

### Task 0.2: Unit-test harness (Vitest)

**Files:**
- Create: `vitest.config.ts`, `tests/unit/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

`tests/unit/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { codeOf } from "@/lib/code";

describe("smoke", () => {
  it("builds a canonical code", () => {
    expect(codeOf("MEX", "5")).toBe("MEX-5");
  });
});
```

- [ ] **Step 2: Create the Vitest config and the `code.ts` util**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
```

`src/lib/code.ts` — full content from **Conventions → Canonical sticker code** above (`codeOf`, `splitCode`, `compareCodes`).

- [ ] **Step 3: Run the test to verify it passes**

Run: `npm run test`
Expected: 1 passed (`smoke`).

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests/unit/smoke.test.ts src/lib/code.ts
git commit -m "test: add Vitest unit harness + code util"
```

---

### Task 0.3: Prisma schema (6 models) + client singleton + first migration

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/prisma.ts`, `.env`

- [ ] **Step 1: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Album {
  id         String    @id @default(cuid())
  slug       String    @unique
  name       String
  year       Int
  emoji      String
  orderIndex Int       @default(0)
  sections   Section[]
  stickers   Sticker[]
}

model Section {
  id          String    @id @default(cuid())
  albumId     String
  album       Album     @relation(fields: [albumId], references: [id], onDelete: Cascade)
  shortName   String
  emoji       String
  displayName String
  orderIndex  Int       @default(0)
  stickers    Sticker[]

  @@unique([albumId, shortName, emoji])
}

model Sticker {
  id              String           @id @default(cuid())
  sectionId       String
  section         Section          @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  albumId         String
  album           Album            @relation(fields: [albumId], references: [id], onDelete: Cascade)
  number          String
  code            String
  orderIndex      Int              @default(0)
  collectionEntry CollectionEntry?
  commitments     SwapCommitment[]

  @@unique([albumId, code])
  @@unique([sectionId, number])
  @@index([albumId, orderIndex])
}

model CollectionEntry {
  id        String  @id @default(cuid())
  stickerId String  @unique
  sticker   Sticker @relation(fields: [stickerId], references: [id], onDelete: Cascade)
  quantity  Int // app-enforced >= 1; a row at 0 is deleted (missing)
}

model Counterparty {
  id          String           @id @default(cuid())
  name        String
  rawText     String
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  commitments SwapCommitment[]
}

model SwapCommitment {
  id             String              @id @default(cuid())
  counterpartyId String
  counterparty   Counterparty        @relation(fields: [counterpartyId], references: [id], onDelete: Cascade)
  stickerId      String
  sticker        Sticker             @relation(fields: [stickerId], references: [id], onDelete: Cascade)
  direction      CommitmentDirection
  quantity       Int                 @default(1)
  status         CommitmentStatus    @default(PENDING)
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  @@index([stickerId, status, direction])
  @@index([counterpartyId, status])
}

enum CommitmentDirection {
  GIVE
  GET
}

enum CommitmentStatus {
  PENDING
  DONE
  CANCELLED
}
```

- [ ] **Step 2: Create the Prisma client singleton**

`src/lib/prisma.ts`:
```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 3: Point `.env` at a local Postgres and create the migration**

Create `.env` (gitignored) with a reachable local Postgres URL, e.g.:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sticker_swap_dev"
```
Run:
```bash
npx prisma migrate dev --name init
```
Expected: a migration is created under `prisma/migrations/`, applied, and `@prisma/client` is generated. (If no local Postgres, start one first — see Task 0.4's `docker-compose.test.yml` pattern, or use any Postgres 16.)

- [ ] **Step 4: Verify the client + schema typecheck**

Run: `npm run typecheck`
Expected: no errors (Prisma types now exist).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/prisma.ts
git commit -m "feat: add 6-model Prisma schema, client singleton, init migration"
```

---

### Task 0.4: Integration-test harness against real Postgres

**Files:**
- Create: `docker-compose.test.yml`, `.env.test`, `vitest.integration.config.ts`, `tests/integration/helpers.ts`, `tests/integration/connectivity.test.ts`

- [ ] **Step 1: Create the local test Postgres + test env**

`docker-compose.test.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: sticker_swap_test
    ports:
      - "5433:5432"
```

`.env.test` (gitignored — add `*.test` is already covered by `.env*.local`? No: add `.env.test` to `.gitignore` if not present):
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sticker_swap_test"
```

Add to `.gitignore` (one line, under the secrets block):
```
.env.test
```

- [ ] **Step 2: Create the integration Vitest config**

`vitest.integration.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false, // shared DB; run files serially
    env: { NODE_ENV: "test" },
  },
});
```

`tests/integration/global-setup.ts`:
```ts
import { execSync } from "node:child_process";
import { config } from "dotenv";

export default function setup() {
  config({ path: ".env.test" });
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
```

Add `dotenv` to devDependencies: `npm install -D dotenv`.

- [ ] **Step 3: Create the reset/seed helper**

`tests/integration/helpers.ts`:
```ts
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { seedUniverse } from "@/server/seed/universe";

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "SwapCommitment","CollectionEntry","Counterparty","Sticker","Section","Album" RESTART IDENTITY CASCADE;`,
  );
}

export async function seedTestUniverse(): Promise<void> {
  await resetDb();
  const text = readFileSync("data/albums/world-cup-2026.txt", "utf8");
  await seedUniverse(prisma, text);
}
```
(`seedUniverse` is created in Task 0.6; this file will not typecheck until then — that's expected. The connectivity test below does not import it.)

- [ ] **Step 4: Write a connectivity integration test**

`tests/integration/connectivity.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

describe("db connectivity", () => {
  afterAll(async () => { await prisma.$disconnect(); });

  it("can round-trip a query", async () => {
    const rows = await prisma.$queryRawUnsafe<{ one: number }[]>("SELECT 1 AS one");
    expect(rows[0].one).toBe(1);
  });
});
```

- [ ] **Step 5: Run it**

Start Postgres and run:
```bash
docker compose -f docker-compose.test.yml up -d
npm run test:integration
```
Expected: migrations apply, `db connectivity` passes.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.test.yml vitest.integration.config.ts tests/integration .gitignore package.json package-lock.json
git commit -m "test: add real-Postgres integration harness"
```

---

### Task 0.5: Create the canonical universe data file

**Files:**
- Create: `data/albums/world-cup-2026.txt`

- [ ] **Step 1: Create the 994-sticker universe file**

`data/albums/world-cup-2026.txt` (52 sections: 3 FWC + 48 countries + CC; `a..b` is an inclusive range the seed parser expands; `00` is preserved; lines starting with `#` are comments):
```
# Panini FIFA World Cup 2026 — canonical universe (994 stickers)
# Format: SHORTNAME EMOJI: numbers   (numbers may use a..b ranges; "00" preserved)
FWC 🏆: 00, 1, 2, 3, 4
FWC 🌎: 5, 6, 7, 8
FWC 📜: 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
MEX 🇲🇽: 1..20
RSA 🇿🇦: 1..20
KOR 🇰🇷: 1..20
CZE 🇨🇿: 1..20
CAN 🇨🇦: 1..20
BIH 🇧🇦: 1..20
QAT 🇶🇦: 1..20
SUI 🇨🇭: 1..20
BRA 🇧🇷: 1..20
MAR 🇲🇦: 1..20
HAI 🇭🇹: 1..20
SCO 🏴: 1..20
USA 🇺🇸: 1..20
PAR 🇵🇾: 1..20
AUS 🇦🇺: 1..20
TUR 🇹🇷: 1..20
GER 🇩🇪: 1..20
CUW 🇨🇼: 1..20
CIV 🇨🇮: 1..20
ECU 🇪🇨: 1..20
NED 🇳🇱: 1..20
JPN 🇯🇵: 1..20
SWE 🇸🇪: 1..20
TUN 🇹🇳: 1..20
BEL 🇧🇪: 1..20
EGY 🇪🇬: 1..20
IRN 🇮🇷: 1..20
NZL 🇳🇿: 1..20
ESP 🇪🇸: 1..20
CPV 🇨🇻: 1..20
KSA 🇸🇦: 1..20
URU 🇺🇾: 1..20
FRA 🇫🇷: 1..20
SEN 🇸🇳: 1..20
IRQ 🇮🇶: 1..20
NOR 🇳🇴: 1..20
ARG 🇦🇷: 1..20
ALG 🇩🇿: 1..20
AUT 🇦🇹: 1..20
JOR 🇯🇴: 1..20
POR 🇵🇹: 1..20
COD 🇨🇩: 1..20
UZB 🇺🇿: 1..20
COL 🇨🇴: 1..20
ENG 🏴: 1..20
CRO 🇭🇷: 1..20
GHA 🇬🇭: 1..20
PAN 🇵🇦: 1..20
CC 🥤: 1..14
```

- [ ] **Step 2: Commit**

```bash
git add data/albums/world-cup-2026.txt
git commit -m "data: add canonical World Cup 2026 universe (994 stickers)"
```

---

### Task 0.6: Universe parser (pure) — TDD

**Files:**
- Create: `src/server/seed/universe.ts` (parser part), `tests/unit/universe.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/universe.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseUniverse } from "@/server/seed/universe";

describe("parseUniverse", () => {
  it("expands ranges, preserves 00, builds codes, and counts 994", () => {
    const text = readFileSync("data/albums/world-cup-2026.txt", "utf8");
    const sections = parseUniverse(text);

    expect(sections).toHaveLength(52);

    const total = sections.reduce((n, s) => n + s.stickers.length, 0);
    expect(total).toBe(994);

    const fwcTrophy = sections[0];
    expect(fwcTrophy.shortName).toBe("FWC");
    expect(fwcTrophy.emoji).toBe("🏆");
    expect(fwcTrophy.stickers[0].number).toBe("00");
    expect(fwcTrophy.stickers[0].code).toBe("FWC-00");

    const mex = sections.find((s) => s.shortName === "MEX")!;
    expect(mex.stickers).toHaveLength(20);
    expect(mex.stickers.at(-1)!.code).toBe("MEX-20");
  });

  it("ignores comment and blank lines", () => {
    const sections = parseUniverse("# comment\n\nCC 🥤: 1, 2\n");
    expect(sections).toHaveLength(1);
    expect(sections[0].stickers.map((s) => s.number)).toEqual(["1", "2"]);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- universe`
Expected: FAIL — `parseUniverse` is not exported.

- [ ] **Step 3: Implement the parser**

`src/server/seed/universe.ts`:
```ts
import { codeOf } from "@/lib/code";

export interface StickerDef { number: string; code: string; orderIndex: number; }
export interface SectionDef {
  shortName: string;
  emoji: string;
  displayName: string;
  orderIndex: number;
  stickers: StickerDef[];
}

const LINE = /^(\S+)\s+(\S+)\s*:\s*(.+)$/u;

function expandNumbers(spec: string): string[] {
  const out: string[] = [];
  for (const raw of spec.split(",")) {
    const tok = raw.trim();
    if (!tok) continue;
    const range = tok.match(/^(\d+)\.\.(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let i = start; i <= end; i++) out.push(String(i));
    } else {
      out.push(tok); // preserves "00"
    }
  }
  return out;
}

export function parseUniverse(text: string): SectionDef[] {
  const sections: SectionDef[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(LINE);
    if (!m) continue;
    const shortName = m[1].toUpperCase();
    const emoji = m[2];
    const numbers = expandNumbers(m[3]);
    sections.push({
      shortName,
      emoji,
      displayName: shortName,
      orderIndex: sections.length,
      stickers: numbers.map((number, i) => ({ number, code: codeOf(shortName, number), orderIndex: i })),
    });
  }
  return sections;
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- universe`
Expected: PASS (both tests; total 994; 52 sections).

- [ ] **Step 5: Commit**

```bash
git add src/server/seed/universe.ts tests/unit/universe.test.ts
git commit -m "feat: pure World Cup universe parser (range expansion, 994 stickers)"
```

---

### Task 0.7: `seedUniverse` (idempotent DB upsert) + integration test

**Files:**
- Modify: `src/server/seed/universe.ts` (append `seedUniverse`)
- Create: `prisma/seed.ts`, `tests/integration/seed.test.ts`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/seed.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedTestUniverse } from "./helpers";

describe("seedUniverse", () => {
  beforeAll(async () => { await seedTestUniverse(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("creates exactly one album, 52 sections, 994 stickers", async () => {
    expect(await prisma.album.count()).toBe(1);
    expect(await prisma.section.count()).toBe(52);
    expect(await prisma.sticker.count()).toBe(994);
  });

  it("is idempotent on re-run (no duplicates)", async () => {
    const text = (await import("node:fs")).readFileSync("data/albums/world-cup-2026.txt", "utf8");
    const { seedUniverse } = await import("@/server/seed/universe");
    await seedUniverse(prisma, text);
    expect(await prisma.sticker.count()).toBe(994);
    expect(await prisma.section.count()).toBe(52);
  });

  it("stores codes the diff/import will join on", async () => {
    const mex5 = await prisma.sticker.findFirst({ where: { code: "MEX-5" } });
    const fwc00 = await prisma.sticker.findFirst({ where: { code: "FWC-00" } });
    expect(mex5).not.toBeNull();
    expect(fwc00?.number).toBe("00");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test:integration -- seed`
Expected: FAIL — `seedUniverse` is not exported.

- [ ] **Step 3: Implement `seedUniverse` and `prisma/seed.ts`**

Append to `src/server/seed/universe.ts`:
```ts
import type { PrismaClient } from "@prisma/client";

const ALBUM = { slug: "world-cup-2026", name: "Panini FIFA World Cup 2026", year: 2026, emoji: "🏆" };

export async function seedUniverse(prisma: PrismaClient, text: string): Promise<void> {
  const sections = parseUniverse(text);

  const album = await prisma.album.upsert({
    where: { slug: ALBUM.slug },
    update: { name: ALBUM.name, year: ALBUM.year, emoji: ALBUM.emoji },
    create: { ...ALBUM, orderIndex: 0 },
  });

  for (const s of sections) {
    const section = await prisma.section.upsert({
      where: { albumId_shortName_emoji: { albumId: album.id, shortName: s.shortName, emoji: s.emoji } },
      update: { displayName: s.displayName, orderIndex: s.orderIndex },
      create: { albumId: album.id, shortName: s.shortName, emoji: s.emoji, displayName: s.displayName, orderIndex: s.orderIndex },
    });

    for (const st of s.stickers) {
      await prisma.sticker.upsert({
        where: { albumId_code: { albumId: album.id, code: st.code } },
        update: { sectionId: section.id, number: st.number, orderIndex: st.orderIndex },
        create: { albumId: album.id, sectionId: section.id, number: st.number, code: st.code, orderIndex: st.orderIndex },
      });
    }
  }
}
```

`prisma/seed.ts`:
```ts
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { seedUniverse } from "../src/server/seed/universe";

const prisma = new PrismaClient();

async function main() {
  const text = readFileSync("data/albums/world-cup-2026.txt", "utf8");
  await seedUniverse(prisma, text);
  const count = await prisma.sticker.count();
  console.log(`Seeded ${count} stickers.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```
(`prisma/seed.ts` imports via relative path, not `@/`, because `tsx` runs it outside the Vite alias resolver.)

- [ ] **Step 4: Run the test + a real seed**

Run:
```bash
npm run test:integration -- seed
DATABASE_URL="$(grep DATABASE_URL .env | cut -d'"' -f2)" npm run db:seed
```
Expected: integration test passes (1 album / 52 sections / 994 stickers, idempotent); `npm run db:seed` logs `Seeded 994 stickers.`

- [ ] **Step 5: Commit**

```bash
git add src/server/seed/universe.ts prisma/seed.ts tests/integration/seed.test.ts
git commit -m "feat: idempotent universe seed + integration test (994 stickers)"
```

---

### Task 0.8: Env validation

**Files:**
- Create: `src/lib/env.ts`, `.env.example`

- [ ] **Step 1: Create the env schema**

`src/lib/env.ts`:
```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_PASSWORD: z.string().min(1),
  COOKIE_SECRET: z.string().min(16, "COOKIE_SECRET must be at least 16 characters"),
  APP_URL: z.string().url().optional(),
});

/** Server-only env. Do not import from edge/middleware (use process.env.COOKIE_SECRET there). */
export const env = schema.parse(process.env);
```

- [ ] **Step 2: Create `.env.example`**

`.env.example`:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sticker_swap_dev"
APP_PASSWORD="change-me"
COOKIE_SECRET="at-least-sixteen-characters-long-secret"
APP_URL="http://localhost:3000"
```

- [ ] **Step 3: Add the values to your local `.env`** (so the app can boot):

```
APP_PASSWORD="change-me"
COOKIE_SECRET="at-least-sixteen-characters-long-secret"
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat: zod-validated server env + .env.example"
```

---

### Task 0.9: Auth helpers (signed cookie + password) — TDD

**Files:**
- Create: `src/server/auth/cookie.ts`, `src/server/auth/password.ts`, `tests/unit/auth.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/auth.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createSessionToken, verifySessionToken } from "@/server/auth/cookie";
import { verifyPassword } from "@/server/auth/password";

beforeAll(() => {
  process.env.COOKIE_SECRET = "at-least-sixteen-characters-long-secret";
  process.env.APP_PASSWORD = "hunter2-correct-horse";
});

describe("session cookie", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it("rejects a tampered/empty token", async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken("not.a.jwt")).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken();
    process.env.COOKIE_SECRET = "a-totally-different-secret-value";
    expect(await verifySessionToken(token)).toBe(false);
    process.env.COOKIE_SECRET = "at-least-sixteen-characters-long-secret";
  });
});

describe("password", () => {
  it("accepts the configured password and rejects others", () => {
    expect(verifyPassword("hunter2-correct-horse")).toBe(true);
    expect(verifyPassword("wrong")).toBe(false);
    expect(verifyPassword("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- auth`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the helpers**

`src/server/auth/cookie.ts` (jose; works in both node and edge runtimes):
```ts
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ss_session";

const secret = (): Uint8Array => {
  const s = process.env.COOKIE_SECRET;
  if (!s) throw new Error("COOKIE_SECRET is not set");
  return new TextEncoder().encode(s);
};

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: "master" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}
```

`src/server/auth/password.ts` (node runtime — used only inside the `/api/login` route handler):
```ts
import { timingSafeEqual } from "node:crypto";

export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  const a = Buffer.from(input, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- auth`
Expected: PASS (all cases, incl. wrong-secret rejection).

- [ ] **Step 5: Commit**

```bash
git add src/server/auth tests/unit/auth.test.ts
git commit -m "feat: signed-cookie + password auth helpers (TDD)"
```

---

### Task 0.10: `/login` page + `/api/login` + `/api/logout`

**Files:**
- Create: `src/lib/schemas.ts`, `src/app/api/login/route.ts`, `src/app/api/logout/route.ts`, `src/app/login/page.tsx`, `src/components/LoginForm.tsx`

- [ ] **Step 1: Create the shared Zod schemas file**

`src/lib/schemas.ts`:
```ts
import { z } from "zod";

export const loginSchema = z.object({ password: z.string().min(1) });

export const collectionPatchSchema = z.object({
  deltas: z.array(z.object({ stickerId: z.string().min(1), delta: z.number().int() })).min(1).max(2000),
});

export const importSchema = z.object({ text: z.string(), commit: z.boolean().optional() });

export const counterpartyCreateSchema = z.object({ name: z.string().min(1).max(120), rawText: z.string() });
export const counterpartyUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  rawText: z.string().optional(),
});

export const commitmentCreateSchema = z.object({
  stickerId: z.string().min(1),
  direction: z.enum(["GIVE", "GET"]),
});
```

- [ ] **Step 2: Create the login/logout route handlers**

`src/app/api/login/route.ts`:
```ts
import { cookies } from "next/headers";
import { loginSchema } from "@/lib/schemas";
import { verifyPassword } from "@/server/auth/password";
import { createSessionToken, SESSION_COOKIE } from "@/server/auth/cookie";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid input" }, { status: 400 });

  if (!verifyPassword(parsed.data.password)) {
    return Response.json({ error: "incorrect password" }, { status: 401 });
  }

  const token = await createSessionToken();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.json({ ok: true });
}
```

`src/app/api/logout/route.ts`:
```ts
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/server/auth/cookie";

export async function POST() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Create the login page + form component**

`src/components/LoginForm.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) router.replace("/");
    else setError("Incorrect password");
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex max-w-xs flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">Sticker Swap</h1>
      <input
        type="password"
        aria-label="Password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Password"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50">
        {busy ? "…" : "Enter"}
      </button>
    </form>
  );
}
```

`src/app/login/page.tsx`:
```tsx
import { LoginForm } from "@/components/LoginForm";
export default function LoginPage() {
  return <LoginForm />;
}
```

- [ ] **Step 4: Verify build + manual smoke**

Run: `npm run build`
Expected: build succeeds; `/login`, `/api/login`, `/api/logout` appear in route output.
Optional manual: `npm run dev`, open `/login`, wrong password → "Incorrect password"; correct (`APP_PASSWORD`) → redirect to `/`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas.ts src/app/api/login src/app/api/logout src/app/login src/components/LoginForm.tsx
git commit -m "feat: login/logout routes + login page"
```

---

### Task 0.11: Password gate middleware (`src/proxy.ts`)

**Files:**
- Create: `src/proxy.ts`

- [ ] **Step 1: Create the middleware**

`src/proxy.ts` (Next.js 16 names middleware `proxy.ts`; export default + a `config` matcher excluding `/login`, `/api/login`, and static assets):
```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/cookie";

export default async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/login).*)"],
};
```

> **Next 16 note:** if your installed Next version still expects a named `middleware` export rather than `proxy`, rename the file to `src/middleware.ts` and change `export default async function proxy` to `export async function middleware`. The matcher and body are identical. Verify against the installed version's docs.

- [ ] **Step 2: Verify the gate**

Run: `npm run dev`, then with a fresh browser (no cookie) open `/` → you are redirected to `/login`. After logging in, `/` loads. `GET /api/login` is unauthenticated-reachable (excluded by the matcher).

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: password-cookie gate middleware (proxy.ts)"
```

---

### Task 0.12: Render blueprint + CI

**Files:**
- Create: `render.yaml`, `.github/workflows/ci.yml`

- [ ] **Step 1: Create `render.yaml`**

```yaml
databases:
  - name: sticker-swap-db
    plan: free
    postgresMajorVersion: "16"

services:
  - type: web
    name: sticker-swap
    runtime: node
    plan: free
    buildCommand: npm ci && npx prisma generate && npm run build
    startCommand: npm run start
    preDeployCommand: npx prisma migrate deploy && npx prisma db seed
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: sticker-swap-db
          property: connectionString
      - key: APP_PASSWORD
        sync: false
      - key: COOKIE_SECRET
        sync: false
      - key: APP_URL
        sync: false
      - key: NODE_VERSION
        value: "20"
```

- [ ] **Step 2: Create the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: sticker_swap_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5433/sticker_swap_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: npm run test
      - run: npm run test:integration
      - run: npm run build
```

> The integration global-setup loads `.env.test`; in CI, `DATABASE_URL` is already exported, and `dotenv` will not overwrite an existing var. Add `override: false` is the default, so the CI `DATABASE_URL` wins. (`.env.test` is gitignored and absent in CI — `config()` silently no-ops.)

- [ ] **Step 3: Verify CI locally (dry equivalent)**

Run the same sequence locally against the test DB:
```bash
docker compose -f docker-compose.test.yml up -d
npm run test && npm run test:integration && npm run build
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add render.yaml .github/workflows/ci.yml
git commit -m "ci: Render blueprint + GitHub Actions (Postgres service)"
```

**P1.0 checkpoint:** login-gated empty shell runs locally; `npm run test`, `npm run test:integration`, and `npm run build` are green; CI is wired; the DB seeds 994 stickers.

---
---

# Sub-Phase P1.1 — Collection

**Delivers:** the interactive album grid (tap / edit-mode `±`), the **atomic delta API** with the `1 + committed` floor + optimistic UI, the progress/spare summary, and the **Bulk-import** dialog (Figuritas combined mode, preview + skip + clamp reports). Ends with: the Master can seed his collection by paste and adjust tiles by tap, with reservations respected.

---

### Task 1.1: `flooredQuantity` helper — TDD

**Files:**
- Create: `src/server/collection/floor.ts`, `tests/unit/floor.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/floor.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { flooredQuantity } from "@/server/collection/floor";

describe("flooredQuantity", () => {
  it("allows falling to 0 (missing) when nothing is committed", () => {
    expect(flooredQuantity(0, 0)).toBe(0);
    expect(flooredQuantity(-3, 0)).toBe(0);
    expect(flooredQuantity(2, 0)).toBe(2);
  });

  it("keeps 1 owned + committed spares when copies are reserved", () => {
    expect(flooredQuantity(0, 2)).toBe(3); // must keep 1 + 2
    expect(flooredQuantity(2, 2)).toBe(3);
    expect(flooredQuantity(5, 2)).toBe(5); // target above floor is untouched
    expect(flooredQuantity(1, 1)).toBe(2);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- floor`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/server/collection/floor.ts` — full content from **Conventions → Reservation floor** above.

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- floor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/collection/floor.ts tests/unit/floor.test.ts
git commit -m "feat: reservation floor helper (TDD)"
```

---

### Task 1.2: Atomic collection service (increment / floored decrement) — integration TDD

**Files:**
- Create: `src/server/collection/service.ts`, `tests/integration/collection.test.ts`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/collection.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedTestUniverse } from "./helpers";
import { applyDeltas } from "@/server/collection/service";

async function stickerId(code: string): Promise<string> {
  const s = await prisma.sticker.findFirstOrThrow({ where: { code } });
  return s.id;
}
async function qty(code: string): Promise<number> {
  const id = await stickerId(code);
  const e = await prisma.collectionEntry.findUnique({ where: { stickerId: id } });
  return e?.quantity ?? 0;
}

describe("applyDeltas", () => {
  beforeAll(async () => { await seedTestUniverse(); });
  beforeEach(async () => {
    await prisma.swapCommitment.deleteMany();
    await prisma.collectionEntry.deleteMany();
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("increments from missing to owned to spare", async () => {
    const id = await stickerId("MEX-5");
    expect((await applyDeltas([{ stickerId: id, delta: 1 }]))[0].quantity).toBe(1);
    expect((await applyDeltas([{ stickerId: id, delta: 1 }]))[0].quantity).toBe(2);
    expect(await qty("MEX-5")).toBe(2);
  });

  it("decrements to missing (deletes the row) when nothing is committed", async () => {
    const id = await stickerId("MEX-5");
    await applyDeltas([{ stickerId: id, delta: 1 }]); // owned
    const out = await applyDeltas([{ stickerId: id, delta: -1 }]);
    expect(out[0].quantity).toBe(0);
    expect(await prisma.collectionEntry.findUnique({ where: { stickerId: id } })).toBeNull();
  });

  it("clamps a decrement at 1 + committed and cannot remove a promised spare", async () => {
    const id = await stickerId("MEX-5");
    await applyDeltas([{ stickerId: id, delta: 3 }]); // qty 3 = 2 spares
    const cp = await prisma.counterparty.create({ data: { name: "Mateo", rawText: "" } });
    await prisma.swapCommitment.create({
      data: { counterpartyId: cp.id, stickerId: id, direction: "GIVE", quantity: 2, status: "PENDING" },
    });
    // try to drain to missing
    const out = await applyDeltas([{ stickerId: id, delta: -10 }]);
    expect(out[0].quantity).toBe(3); // floored at 1 + 2
    expect(await qty("MEX-5")).toBe(3);
  });

  it("ignores PENDING GET and DONE/CANCELLED GIVE when computing the floor", async () => {
    const id = await stickerId("MEX-5");
    await applyDeltas([{ stickerId: id, delta: 2 }]); // qty 2
    const cp = await prisma.counterparty.create({ data: { name: "X", rawText: "" } });
    await prisma.swapCommitment.createMany({
      data: [
        { counterpartyId: cp.id, stickerId: id, direction: "GET", quantity: 1, status: "PENDING" },
        { counterpartyId: cp.id, stickerId: id, direction: "GIVE", quantity: 1, status: "CANCELLED" },
      ],
    });
    const out = await applyDeltas([{ stickerId: id, delta: -5 }]);
    expect(out[0].quantity).toBe(0); // no PENDING GIVE → floor is 0
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test:integration -- collection`
Expected: FAIL — `applyDeltas` not found.

- [ ] **Step 3: Implement the service**

`src/server/collection/service.ts`:
```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

async function increment(tx: Tx, stickerId: string, delta: number): Promise<number> {
  const row = await tx.collectionEntry.upsert({
    where: { stickerId },
    create: { stickerId, quantity: delta }, // delta >= 1; base missing = 0
    update: { quantity: { increment: delta } },
    select: { quantity: true },
  });
  return row.quantity;
}

/** Single-statement decrement: floors at (committed>0 ? committed+1 : 0); deletes the row at 0.
 *  Returns the resulting quantity (0 = now missing). */
async function decrement(tx: Tx, stickerId: string, delta: number): Promise<number> {
  const rows = await tx.$queryRaw<{ quantity: number }[]>(Prisma.sql`
    WITH committed AS (
      SELECT COALESCE(SUM(sc."quantity"), 0)::int AS n
      FROM "SwapCommitment" sc
      WHERE sc."stickerId" = ${stickerId}
        AND sc."status" = 'PENDING'
        AND sc."direction" = 'GIVE'
    ),
    computed AS (
      SELECT ce."id",
        GREATEST(
          ce."quantity" + ${delta},
          CASE WHEN committed.n = 0 THEN 0 ELSE committed.n + 1 END
        ) AS newqty
      FROM "CollectionEntry" ce, committed
      WHERE ce."stickerId" = ${stickerId}
    ),
    deleted AS (
      DELETE FROM "CollectionEntry"
      WHERE "id" IN (SELECT "id" FROM computed WHERE newqty <= 0)
      RETURNING 0 AS quantity
    ),
    updated AS (
      UPDATE "CollectionEntry" ce
      SET "quantity" = computed.newqty
      FROM computed
      WHERE ce."id" = computed."id" AND computed.newqty > 0
      RETURNING ce."quantity"
    )
    SELECT quantity FROM deleted
    UNION ALL
    SELECT quantity FROM updated
  `);
  return rows[0]?.quantity ?? 0; // no row existed → already missing
}

export async function applyDeltas(
  deltas: { stickerId: string; delta: number }[],
): Promise<{ stickerId: string; quantity: number }[]> {
  return prisma.$transaction(async (tx) => {
    const out: { stickerId: string; quantity: number }[] = [];
    for (const { stickerId, delta } of deltas) {
      let quantity: number;
      if (delta > 0) quantity = await increment(tx, stickerId, delta);
      else if (delta < 0) quantity = await decrement(tx, stickerId, delta);
      else {
        const e = await tx.collectionEntry.findUnique({ where: { stickerId }, select: { quantity: true } });
        quantity = e?.quantity ?? 0;
      }
      out.push({ stickerId, quantity });
    }
    return out;
  });
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test:integration -- collection`
Expected: PASS (increment, decrement-to-missing, clamp at 1+committed, floor ignores GET/CANCELLED).

- [ ] **Step 5: Commit**

```bash
git add src/server/collection/service.ts tests/integration/collection.test.ts
git commit -m "feat: atomic reservation-aware collection delta service (integration TDD)"
```

---

### Task 1.3: `PATCH /api/collection` route

**Files:**
- Create: `src/app/api/collection/route.ts`

- [ ] **Step 1: Implement the route handler**

`src/app/api/collection/route.ts`:
```ts
import { collectionPatchSchema } from "@/lib/schemas";
import { applyDeltas } from "@/server/collection/service";

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = collectionPatchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid input" }, { status: 400 });

  const applied = await applyDeltas(parsed.data.deltas);
  return Response.json({ applied });
}
```

- [ ] **Step 2: Verify build + manual smoke**

Run: `npm run build`
Expected: `/api/collection` listed. Manual (while logged in): `PATCH` with `{ "deltas": [{ "stickerId": "<id>", "delta": 1 }] }` returns `{ applied: [{ stickerId, quantity: 1 }] }`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/collection/route.ts
git commit -m "feat: PATCH /api/collection (batched atomic deltas)"
```

---

### Task 1.4: Collection summary (`GET /api/collection`) + service

**Files:**
- Create: `src/server/collection/summary.ts`; Modify: `src/app/api/collection/route.ts`

- [ ] **Step 1: Implement the summary service**

`src/server/collection/summary.ts`:
```ts
import { prisma } from "@/lib/prisma";

export interface CollectionSummary {
  total: number;
  owned: number;
  missing: number;
  spares: number;
  percent: number; // 0..100, rounded
}

export async function getSummary(): Promise<CollectionSummary> {
  const [total, entries] = await Promise.all([
    prisma.sticker.count(),
    prisma.collectionEntry.findMany({ select: { quantity: true } }),
  ]);
  const owned = entries.length;
  const spares = entries.reduce((n, e) => n + Math.max(e.quantity - 1, 0), 0);
  const missing = total - owned;
  const percent = total === 0 ? 0 : Math.round((owned / total) * 100);
  return { total, owned, missing, spares, percent };
}
```

- [ ] **Step 2: Add the GET handler**

Append to `src/app/api/collection/route.ts`:
```ts
import { getSummary } from "@/server/collection/summary";

export async function GET() {
  return Response.json(await getSummary());
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds; `/api/collection` supports GET + PATCH.

- [ ] **Step 4: Commit**

```bash
git add src/server/collection/summary.ts src/app/api/collection/route.ts
git commit -m "feat: GET /api/collection progress + spare summary"
```

---

### Task 1.5: Figuritas adapter — TDD

**Files:**
- Create: `src/server/import/types.ts`, `src/server/import/figuritas.ts`, `src/server/import/registry.ts`, `tests/unit/figuritas.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/figuritas.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { figuritasParser } from "@/server/import/figuritas";

describe("figuritas adapter (combined mode)", () => {
  it("ignores emoji, parses (×M), splits faltan/cambio on the Swaps header", () => {
    const text = [
      "MEX 🇲🇽: 1, 2, 3",
      "FWC 🏆: 00",
      "Swaps",
      "BRA 🇧🇷: 5, 7 (×3)",
    ].join("\n");
    const r = figuritasParser.parse(text, "combined");

    const needs = r.entries.filter((e) => e.intent === "need");
    const swaps = r.entries.filter((e) => e.intent === "swap");

    expect(needs.map((e) => `${e.shortName}-${e.number}`)).toEqual(["MEX-1", "MEX-2", "MEX-3", "FWC-00"]);
    expect(needs.every((e) => e.copies === 1)).toBe(true);

    expect(swaps.map((e) => [`${e.shortName}-${e.number}`, e.copies])).toEqual([
      ["BRA-5", 1],
      ["BRA-7", 3],
    ]);
  });

  it("treats everything as need before a Swaps header (counterparty faltan)", () => {
    const r = figuritasParser.parse("ARG 🇦🇷: 9, 10", "combined");
    expect(r.entries).toHaveLength(2);
    expect(r.entries.every((e) => e.intent === "need")).toBe(true);
  });

  it("collects unparseable lines/tokens in skipped, never throwing", () => {
    const r = figuritasParser.parse("garbage line\nMEX 🇲🇽: 1, oops, 2", "combined");
    expect(r.skipped).toContain("garbage line");
    expect(r.skipped).toContain("oops");
    expect(r.entries.map((e) => e.number)).toEqual(["1", "2"]);
  });

  it("accepts a lowercase x as the multiplier and is case-insensitive on Swaps", () => {
    const r = figuritasParser.parse("swaps\nMEX 🇲🇽: 4 (x2)", "combined");
    expect(r.entries).toEqual([{ shortName: "MEX", number: "4", copies: 2, intent: "swap" }]);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- figuritas`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the types, adapter, and registry**

`src/server/import/types.ts` — full content from **Conventions → Import contract** above.

`src/server/import/figuritas.ts`:
```ts
import type { FormatParser, Intent, ParseMode, ParseResult, ParsedEntry } from "./types";

const SWAPS_HEADER = /^swaps$/i;
const LINE = /^(\S+)\s+(\S+)\s*:\s*(.+)$/u;
const NUM = /^(\d+)(?:\s*\(\s*[×xX]\s*(\d+)\s*\))?$/u;

function parse(text: string, _mode: ParseMode): ParseResult {
  const entries: ParsedEntry[] = [];
  const skipped: string[] = [];
  let intent: Intent = "need"; // above the Swaps header

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (SWAPS_HEADER.test(line)) { intent = "swap"; continue; }

    const m = line.match(LINE);
    if (!m) { skipped.push(rawLine); continue; }

    const shortName = m[1].toUpperCase();
    for (const tokRaw of m[3].split(",")) {
      const tok = tokRaw.trim();
      if (!tok) continue;
      const nm = tok.match(NUM);
      if (!nm) { skipped.push(tok); continue; }
      entries.push({ shortName, number: nm[1], copies: nm[2] ? Number(nm[2]) : 1, intent });
    }
  }

  return { entries, skipped, warnings: [] };
}

export const figuritasParser: FormatParser = { id: "figuritas", label: "Figuritas (faltan / cambio)", parse };
```

`src/server/import/registry.ts`:
```ts
import type { FormatParser } from "./types";
import { figuritasParser } from "./figuritas";

const REGISTRY: Record<string, FormatParser> = { [figuritasParser.id]: figuritasParser };

export function getParser(id: string): FormatParser {
  const p = REGISTRY[id];
  if (!p) throw new Error(`Unknown import format: ${id}`);
  return p;
}

export const defaultParser = figuritasParser;
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- figuritas`
Expected: PASS (emoji-ignore, `(×M)`, Swaps split, skipped, lowercase `x`).

- [ ] **Step 5: Commit**

```bash
git add src/server/import tests/unit/figuritas.test.ts
git commit -m "feat: Figuritas import adapter + registry (TDD)"
```

---

### Task 1.6: Import planner (pure) + applier — TDD (unit + integration)

**Files:**
- Create: `src/server/collection/import.ts`, `tests/unit/import-plan.test.ts`, `tests/integration/import.test.ts`

- [ ] **Step 1: Write the failing unit test for the pure planner**

`tests/unit/import-plan.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planImport } from "@/server/collection/import";

const universe = new Set(["MEX-1", "MEX-2", "MEX-3", "BRA-5", "BRA-7"]);

describe("planImport (combined mode)", () => {
  it("needs → missing, swaps → 1+M, everything unlisted → owned (qty 1)", () => {
    const text = ["MEX 🇲🇽: 1", "Swaps", "BRA 🇧🇷: 7 (×3)"].join("\n");
    const plan = planImport(text, universe, new Map());

    expect(plan.targets.get("MEX-1")).toBe(0); // need
    expect(plan.targets.get("BRA-7")).toBe(4); // 1 + 3
    expect(plan.targets.get("MEX-2")).toBe(1); // unlisted → owned
    expect(plan.targets.get("BRA-5")).toBe(1); // unlisted → owned
    expect(plan.clamped).toEqual([]);
  });

  it("a bare swap line means owned + 1 spare (qty 2)", () => {
    const plan = planImport("Swaps\nBRA 🇧🇷: 5", universe, new Map());
    expect(plan.targets.get("BRA-5")).toBe(2);
  });

  it("floors at 1+committed and reports clamped codes, never dropping a promised spare", () => {
    // BRA-5 has 2 committed GIVE; a paste marking it missing must clamp to 3.
    const text = "BRA 🇧🇷: 5"; // need (no Swaps header → all need)
    const plan = planImport(text, universe, new Map([["BRA-5", 2]]));
    expect(plan.targets.get("BRA-5")).toBe(3);
    expect(plan.clamped).toContain("BRA-5");
  });

  it("reports unknown codes as skipped and does not target them", () => {
    const plan = planImport("ZZZ 🏴: 9", universe, new Map());
    expect(plan.skipped).toContain("ZZZ-9");
    expect(plan.targets.has("ZZZ-9")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- import-plan`
Expected: FAIL — `planImport` not found.

- [ ] **Step 3: Implement the planner + DB applier/preview**

`src/server/collection/import.ts`:
```ts
import { prisma } from "@/lib/prisma";
import { codeOf } from "@/lib/code";
import { figuritasParser } from "@/server/import/figuritas";
import { flooredQuantity } from "./floor";

export interface ImportPlan {
  targets: Map<string, number>; // code -> final quantity (0 = missing)
  skipped: string[];
  clamped: string[];
}

export interface ImportPreview {
  ownCount: number;
  missingCount: number;
  spareTotal: number;
  skipped: string[];
  clamped: string[];
}

/** Pure: compute the full target quantity for every universe code under combined-mode semantics. */
export function planImport(
  text: string,
  universeCodes: Set<string>,
  committedGiveByCode: Map<string, number>,
): ImportPlan {
  const pr = figuritasParser.parse(text, "combined");
  const needCodes = new Set<string>();
  const swapCopies = new Map<string, number>();
  const skipped = [...pr.skipped];

  for (const e of pr.entries) {
    const code = codeOf(e.shortName, e.number);
    if (!universeCodes.has(code)) { skipped.push(code); continue; }
    if (e.intent === "need") needCodes.add(code);
    else if (e.intent === "swap") swapCopies.set(code, (swapCopies.get(code) ?? 0) + e.copies);
  }

  const targets = new Map<string, number>();
  const clamped: string[] = [];
  for (const code of universeCodes) {
    let target: number;
    if (needCodes.has(code)) target = 0;
    else if (swapCopies.has(code)) target = 1 + swapCopies.get(code)!;
    else target = 1; // unlisted → owned

    const committed = committedGiveByCode.get(code) ?? 0;
    const final = flooredQuantity(target, committed);
    if (committed > 0 && final > target) clamped.push(code);
    targets.set(code, final);
  }

  return { targets, skipped, clamped };
}

async function loadContext() {
  const stickers = await prisma.sticker.findMany({ select: { id: true, code: true } });
  const idByCode = new Map(stickers.map((s) => [s.code, s.id]));
  const codeById = new Map(stickers.map((s) => [s.id, s.code]));
  const universeCodes = new Set(stickers.map((s) => s.code));
  const give = await prisma.swapCommitment.groupBy({
    by: ["stickerId"],
    where: { status: "PENDING", direction: "GIVE" },
    _sum: { quantity: true },
  });
  const committedGiveByCode = new Map<string, number>();
  for (const g of give) committedGiveByCode.set(codeById.get(g.stickerId)!, g._sum.quantity ?? 0);
  return { idByCode, universeCodes, committedGiveByCode };
}

export async function previewImport(text: string): Promise<ImportPreview> {
  const { universeCodes, committedGiveByCode } = await loadContext();
  const plan = planImport(text, universeCodes, committedGiveByCode);
  let ownCount = 0, missingCount = 0, spareTotal = 0;
  for (const q of plan.targets.values()) {
    if (q === 0) missingCount++;
    else { ownCount++; spareTotal += Math.max(q - 1, 0); }
  }
  return { ownCount, missingCount, spareTotal, skipped: plan.skipped, clamped: plan.clamped };
}

export async function applyImport(text: string): Promise<{ skipped: string[]; clamped: string[] }> {
  const { idByCode, universeCodes, committedGiveByCode } = await loadContext();
  const plan = planImport(text, universeCodes, committedGiveByCode);

  await prisma.$transaction(async (tx) => {
    for (const [code, qty] of plan.targets) {
      const stickerId = idByCode.get(code)!;
      if (qty <= 0) {
        await tx.collectionEntry.deleteMany({ where: { stickerId } });
      } else {
        await tx.collectionEntry.upsert({
          where: { stickerId },
          create: { stickerId, quantity: qty },
          update: { quantity: qty },
        });
      }
    }
  });

  return { skipped: plan.skipped, clamped: plan.clamped };
}
```

- [ ] **Step 4: Write the failing integration test for the applier**

`tests/integration/import.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedTestUniverse } from "./helpers";
import { applyImport } from "@/server/collection/import";

async function qty(code: string): Promise<number> {
  const s = await prisma.sticker.findFirstOrThrow({ where: { code } });
  const e = await prisma.collectionEntry.findUnique({ where: { stickerId: s.id } });
  return e?.quantity ?? 0;
}

describe("applyImport", () => {
  beforeAll(async () => { await seedTestUniverse(); });
  beforeEach(async () => {
    await prisma.swapCommitment.deleteMany();
    await prisma.collectionEntry.deleteMany();
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("marks unlisted as owned, needs as missing, swaps as 1+M", async () => {
    const res = await applyImport(["MEX 🇲🇽: 1", "Swaps", "MEX 🇲🇽: 2 (×2)"].join("\n"));
    expect(res.skipped).toEqual([]);
    expect(await qty("MEX-1")).toBe(0); // need
    expect(await qty("MEX-2")).toBe(3); // 1 + 2
    expect(await qty("BRA-5")).toBe(1); // unlisted → owned
  });

  it("clamps a re-paste so a promised spare survives, and reports it", async () => {
    await applyImport("Swaps\nMEX 🇲🇽: 5 (×2)"); // MEX-5 -> qty 3 (2 spares)
    const s = await prisma.sticker.findFirstOrThrow({ where: { code: "MEX-5" } });
    const cp = await prisma.counterparty.create({ data: { name: "Mateo", rawText: "" } });
    await prisma.swapCommitment.create({
      data: { counterpartyId: cp.id, stickerId: s.id, direction: "GIVE", quantity: 2, status: "PENDING" },
    });
    // re-paste marks MEX-5 as a need (missing)
    const res = await applyImport("MEX 🇲🇽: 5");
    expect(res.clamped).toContain("MEX-5");
    expect(await qty("MEX-5")).toBe(3); // floored at 1 + 2
  });
});
```

- [ ] **Step 5: Run both — expect pass**

Run:
```bash
npm run test -- import-plan
npm run test:integration -- import
```
Expected: PASS for both (planner semantics; applier writes + clamp report).

- [ ] **Step 6: Commit**

```bash
git add src/server/collection/import.ts tests/unit/import-plan.test.ts tests/integration/import.test.ts
git commit -m "feat: Figuritas combined import planner + applier (preview/skip/clamp)"
```

---

### Task 1.7: `POST /api/collection/import` route

**Files:**
- Create: `src/app/api/collection/import/route.ts`

- [ ] **Step 1: Implement the route**

`src/app/api/collection/import/route.ts`:
```ts
import { importSchema } from "@/lib/schemas";
import { previewImport, applyImport } from "@/server/collection/import";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid input" }, { status: 400 });

  const { text, commit } = parsed.data;
  if (commit) return Response.json(await applyImport(text));
  return Response.json(await previewImport(text));
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: `/api/collection/import` listed.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/collection/import/route.ts
git commit -m "feat: POST /api/collection/import (preview + commit)"
```

---

### Task 1.8: Tile state utils + debounce — TDD

**Files:**
- Create: `src/lib/tile.ts`, `src/lib/debounce.ts`, `tests/unit/tile.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/tile.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { tileState, spareCount } from "@/lib/tile";

describe("tileState", () => {
  it("maps quantity to a non-color state", () => {
    expect(tileState(0)).toBe("missing");
    expect(tileState(1)).toBe("owned");
    expect(tileState(2)).toBe("spare");
    expect(tileState(5)).toBe("spare");
  });
  it("computes spare badge count", () => {
    expect(spareCount(0)).toBe(0);
    expect(spareCount(1)).toBe(0);
    expect(spareCount(4)).toBe(3);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- tile`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/tile.ts` — full content from **Conventions → Tile state** above.

`src/lib/debounce.ts`:
```ts
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- tile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tile.ts src/lib/debounce.ts tests/unit/tile.test.ts
git commit -m "feat: tile state utils + debounce (TDD)"
```

---

### Task 1.9: `StickerTile` + `AlbumGrid` (optimistic, batched)

**Files:**
- Create: `src/components/StickerTile.tsx`, `src/components/AlbumGrid.tsx`

- [ ] **Step 1: Create `StickerTile`**

`src/components/StickerTile.tsx`:
```tsx
"use client";
import { tileState, spareCount } from "@/lib/tile";

export interface TileSticker { id: string; code: string; number: string }

const STATE_CLASSES: Record<string, string> = {
  missing: "border-dashed border-gray-300 text-gray-400",
  owned: "border-solid border-green-600 bg-green-50 text-green-800",
  spare: "border-solid border-blue-600 bg-blue-50 text-blue-800",
};

export function StickerTile({
  sticker,
  quantity,
  editMode,
  onTap,
  onDecrement,
}: {
  sticker: TileSticker;
  quantity: number;
  editMode: boolean;
  onTap: (id: string) => void;
  onDecrement: (id: string) => void;
}) {
  const state = tileState(quantity);
  const spares = spareCount(quantity);
  const label = `${sticker.code}, ${state}${spares > 0 ? `, ${spares} spare${spares > 1 ? "s" : ""}` : ""}`;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        onClick={() => onTap(sticker.id)}
        onContextMenu={(e) => { e.preventDefault(); onDecrement(sticker.id); }}
        className={`flex h-12 w-12 items-center justify-center rounded border-2 text-sm font-medium ${STATE_CLASSES[state]}`}
      >
        <span aria-hidden>{state === "owned" ? "✓" : sticker.number}</span>
        {spares > 0 && (
          <span aria-hidden className="absolute -right-1 -top-1 rounded-full bg-blue-600 px-1 text-[10px] text-white">
            +{spares}
          </span>
        )}
      </button>
      {editMode && (
        <button
          type="button"
          aria-label={`Decrement ${sticker.code}`}
          onClick={() => onDecrement(sticker.id)}
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded bg-gray-800 px-1 text-xs text-white"
        >
          −
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `AlbumGrid` (optimistic + debounced batch sync)**

`src/components/AlbumGrid.tsx`:
```tsx
"use client";
import { useRef, useState } from "react";
import { StickerTile, type TileSticker } from "./StickerTile";
import { debounce } from "@/lib/debounce";

export interface GridSection {
  id: string;
  shortName: string;
  emoji: string;
  displayName: string;
  stickers: TileSticker[];
}

export function AlbumGrid({
  sections,
  initialQuantities,
}: {
  sections: GridSection[];
  initialQuantities: Record<string, number>;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities);
  const [editMode, setEditMode] = useState(false);
  const pending = useRef<Map<string, number>>(new Map());

  const flush = useRef(
    debounce(async () => {
      const batch = [...pending.current.entries()].map(([stickerId, delta]) => ({ stickerId, delta }));
      pending.current.clear();
      if (batch.length === 0) return;
      try {
        const res = await fetch("/api/collection", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deltas: batch }),
        });
        if (!res.ok) throw new Error("sync failed");
        const { applied } = (await res.json()) as { applied: { stickerId: string; quantity: number }[] };
        // reconcile to server truth (handles clamped decrements)
        setQuantities((q) => {
          const next = { ...q };
          for (const a of applied) next[a.stickerId] = a.quantity;
          return next;
        });
      } catch {
        // failed sync: re-fetch authoritative state
        const res = await fetch("/api/collection/state");
        if (res.ok) setQuantities(await res.json());
      }
    }, 400),
  ).current;

  function queue(stickerId: string, delta: number) {
    setQuantities((q) => ({ ...q, [stickerId]: Math.max((q[stickerId] ?? 0) + delta, 0) }));
    pending.current.set(stickerId, (pending.current.get(stickerId) ?? 0) + delta);
    flush();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditMode((m) => !m)}
          className="rounded border px-3 py-1 text-sm"
          aria-pressed={editMode}
        >
          {editMode ? "Done editing" : "Edit"}
        </button>
      </div>
      {sections.map((s) => (
        <section key={s.id}>
          <h2 className="mb-2 text-sm font-semibold">
            <span aria-hidden>{s.emoji} </span>
            {s.displayName}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,3rem)] gap-3">
            {s.stickers.map((st) => (
              <StickerTile
                key={st.id}
                sticker={st}
                quantity={quantities[st.id] ?? 0}
                editMode={editMode}
                onTap={(id) => queue(id, +1)}
                onDecrement={(id) => queue(id, -1)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add the authoritative-state fallback endpoint**

The grid's failure path re-fetches `GET /api/collection/state`. Create `src/app/api/collection/state/route.ts`:
```ts
import { prisma } from "@/lib/prisma";

export async function GET() {
  const entries = await prisma.collectionEntry.findMany({ select: { stickerId: true, quantity: true } });
  const out: Record<string, number> = {};
  for (const e of entries) out[e.stickerId] = e.quantity;
  return Response.json(out);
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/StickerTile.tsx src/components/AlbumGrid.tsx src/app/api/collection/state/route.ts
git commit -m "feat: optimistic batched AlbumGrid + StickerTile (accessible states)"
```

---

### Task 1.10: Album page + app nav layout + ImportDialog wiring

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/components/ImportDialog.tsx`
- Delete: `src/app/page.tsx` (the temporary placeholder — the album now lives in the `(app)` group)

- [ ] **Step 1: Remove the placeholder and create the app-group layout (top nav)**

Delete `src/app/page.tsx`.

`src/app/(app)/layout.tsx`:
```tsx
import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="flex gap-4 border-b bg-white px-4 py-3 text-sm font-medium">
        <Link href="/">Album</Link>
        <Link href="/counterparties">Counterparties</Link>
        <Link href="/swaps">Active Swaps</Link>
      </nav>
      <main className="p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create the `ImportDialog` component**

`src/components/ImportDialog.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface PreviewResult { ownCount: number; missingCount: number; spareTotal: number; skipped: string[]; clamped: string[] }

export function ImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function doPreview() {
    setBusy(true);
    const res = await fetch("/api/collection/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setBusy(false);
    if (res.ok) setPreview(await res.json());
  }

  async function doApply() {
    setBusy(true);
    const res = await fetch("/api/collection/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, commit: true }),
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setPreview(null);
      setText("");
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
        Bulk import
      </button>
    );
  }

  return (
    <div className="rounded border bg-white p-4">
      <p className="mb-2 text-sm text-gray-600">
        Paste a Figuritas list. Lines above a <code>Swaps</code> header are needs; below are your spares.
        Everything not listed is marked owned.
      </p>
      <textarea
        aria-label="Figuritas list"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full rounded border p-2 font-mono text-sm"
      />
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={doPreview} className="rounded border px-3 py-1 text-sm">
          Preview
        </button>
        <button
          type="button"
          disabled={busy || !preview}
          onClick={doApply}
          className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Apply
        </button>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-sm text-gray-500">
          Cancel
        </button>
      </div>
      {preview && (
        <div className="mt-3 text-sm">
          <p>
            Will own <b>{preview.ownCount}</b>, missing <b>{preview.missingCount}</b>, spares <b>{preview.spareTotal}</b>.
          </p>
          {preview.skipped.length > 0 && (
            <p className="text-amber-700">Skipped (unknown): {preview.skipped.join(", ")}</p>
          )}
          {preview.clamped.length > 0 && (
            <p className="text-blue-700">Kept (promised spares): {preview.clamped.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the Album page (Server Component)**

`src/app/(app)/page.tsx`:
```tsx
import { prisma } from "@/lib/prisma";
import { getSummary } from "@/server/collection/summary";
import { AlbumGrid, type GridSection } from "@/components/AlbumGrid";
import { ImportDialog } from "@/components/ImportDialog";

export const dynamic = "force-dynamic";

export default async function AlbumPage() {
  const [sectionsRaw, entries, summary] = await Promise.all([
    prisma.section.findMany({
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        shortName: true,
        emoji: true,
        displayName: true,
        stickers: { orderBy: { orderIndex: "asc" }, select: { id: true, code: true, number: true } },
      },
    }),
    prisma.collectionEntry.findMany({ select: { stickerId: true, quantity: true } }),
    getSummary(),
  ]);

  const sections: GridSection[] = sectionsRaw;
  const initialQuantities: Record<string, number> = {};
  for (const e of entries) initialQuantities[e.stickerId] = e.quantity;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-700">
          Owned <b>{summary.owned}</b>/{summary.total} ({summary.percent}%) · Spares <b>{summary.spares}</b> · Missing{" "}
          <b>{summary.missing}</b>
        </p>
        <ImportDialog />
      </header>
      <AlbumGrid sections={sections} initialQuantities={initialQuantities} />
    </div>
  );
}
```

- [ ] **Step 4: Verify build + manual smoke**

Run: `npm run build`
Expected: succeeds; `/` (in the `(app)` group) renders the grid. Manual: log in → album grid shows; "Bulk import" → paste `MEX 🇲🇽: 1`, Preview shows counts, Apply marks the rest owned; tapping a tile increments and persists across refresh.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)" src/components/ImportDialog.tsx
git rm src/app/page.tsx
git commit -m "feat: album page (grid + summary + bulk import) with top nav"
```

**P1.1 checkpoint:** the Master can seed his collection by paste and adjust it by tap/edit; all writes are atomic and reservation-aware; unit + integration suites green.

---
---

# Sub-Phase P1.2 — Counterparties & Diff

**Delivers:** counterparty CRUD (name + paste), the **reservation-aware two-way diff** grouped by section, and the plain-text **Copy** button. Ends with: the Master can add a person, paste their list, and see exactly what to give and get — already excluding anything reserved elsewhere.

---

### Task 2.1: Counterparty parse — TDD

**Files:**
- Create: `src/server/counterparty/parse.ts`, `tests/unit/counterparty-parse.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/counterparty-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseCounterparty } from "@/server/counterparty/parse";

const universe = new Set(["MEX-1", "MEX-2", "BRA-5", "BRA-7", "ARG-9"]);

describe("parseCounterparty", () => {
  it("maps faltan→missing and cambio→spares (with copies)", () => {
    const text = ["MEX 🇲🇽: 1, 2", "Swaps", "BRA 🇧🇷: 5, 7 (×3)"].join("\n");
    const p = parseCounterparty(text, universe);
    expect([...p.missing].sort()).toEqual(["MEX-1", "MEX-2"]);
    expect(p.spares.get("BRA-5")).toBe(1);
    expect(p.spares.get("BRA-7")).toBe(3);
  });

  it("collects out-of-universe codes as skipped", () => {
    const p = parseCounterparty("ZZZ 🏴: 9", universe);
    expect(p.skipped).toContain("ZZZ-9");
    expect(p.missing.size).toBe(0);
  });

  it("with no Swaps header treats the whole list as their faltan", () => {
    const p = parseCounterparty("ARG 🇦🇷: 9", universe);
    expect([...p.missing]).toEqual(["ARG-9"]);
    expect(p.spares.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- counterparty-parse`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/server/counterparty/parse.ts`:
```ts
import { codeOf } from "@/lib/code";
import { figuritasParser } from "@/server/import/figuritas";

export interface CounterpartyParse {
  missing: Set<string>;
  spares: Map<string, number>;
  skipped: string[];
}

export function parseCounterparty(rawText: string, universeCodes: Set<string>): CounterpartyParse {
  const pr = figuritasParser.parse(rawText, "combined");
  const missing = new Set<string>();
  const spares = new Map<string, number>();
  const skipped = [...pr.skipped];

  for (const e of pr.entries) {
    const code = codeOf(e.shortName, e.number);
    if (!universeCodes.has(code)) { skipped.push(code); continue; }
    if (e.intent === "need") missing.add(code);
    else if (e.intent === "swap") spares.set(code, (spares.get(code) ?? 0) + e.copies);
  }

  return { missing, spares, skipped };
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- counterparty-parse`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/counterparty/parse.ts tests/unit/counterparty-parse.test.ts
git commit -m "feat: counterparty rawText parser (missing/spares) (TDD)"
```

---

### Task 2.2: Pure reservation-aware diff — TDD

**Files:**
- Create: `src/server/diff/compute.ts`, `tests/unit/diff.test.ts`

- [ ] **Step 1: Write the failing test (both safeguards + committed exclusion)**

`tests/unit/diff.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeDiff, type DiffInput } from "@/server/diff/compute";

const universe = new Set(["MEX-5", "BRA-12", "ARG-3", "FWC-00"]);

function base(overrides: Partial<DiffInput> = {}): DiffInput {
  return {
    myQuantities: new Map(),
    committedGiveByCode: new Map(),
    committedGetCodes: new Set(),
    theirMissing: new Set(),
    theirSpares: new Map(),
    thisCpGiveCodes: new Set(),
    thisCpGetCodes: new Set(),
    universeCodes: universe,
    ...overrides,
  };
}

describe("computeDiff", () => {
  it("I give them = my offerable spares ∩ their missing", () => {
    const r = computeDiff(base({
      myQuantities: new Map([["MEX-5", 3]]), // 2 spares
      theirMissing: new Set(["MEX-5", "BRA-12"]), // BRA-12 I don't own
    }));
    expect(r.iGive).toEqual(["MEX-5"]);
  });

  it("They give me = their spares ∩ my effective-missing", () => {
    const r = computeDiff(base({
      theirSpares: new Map([["ARG-3", 1], ["FWC-00", 2]]),
      myQuantities: new Map([["FWC-00", 1]]), // I own FWC-00 already
    }));
    expect(r.theyGive).toEqual(["ARG-3"]);
  });

  it("safeguard 1: a GIVE committed elsewhere drops the spare from another cp's iGive", () => {
    const without = computeDiff(base({
      myQuantities: new Map([["MEX-5", 2]]), // 1 spare
      theirMissing: new Set(["MEX-5"]),
    }));
    expect(without.iGive).toEqual(["MEX-5"]);

    const withCommit = computeDiff(base({
      myQuantities: new Map([["MEX-5", 2]]),
      committedGiveByCode: new Map([["MEX-5", 1]]), // promised to someone else
      theirMissing: new Set(["MEX-5"]),
    }));
    expect(withCommit.iGive).toEqual([]); // offerable now 0
  });

  it("safeguard 2: a GET committed elsewhere drops the sticker from another cp's theyGive", () => {
    const r = computeDiff(base({
      theirSpares: new Map([["BRA-12", 1]]),
      committedGetCodes: new Set(["BRA-12"]), // already getting it from someone else
    }));
    expect(r.theyGive).toEqual([]); // effectiveMissing false
  });

  it("excludes this cp's own commitments from available and lists them as committed", () => {
    const r = computeDiff(base({
      myQuantities: new Map([["MEX-5", 2]]),
      committedGiveByCode: new Map([["MEX-5", 1]]),
      theirMissing: new Set(["MEX-5"]),
      thisCpGiveCodes: new Set(["MEX-5"]),
      theirSpares: new Map([["ARG-3", 1]]),
      thisCpGetCodes: new Set(["ARG-3"]),
    }));
    expect(r.iGive).toEqual([]);
    expect(r.theyGive).toEqual([]);
    expect(r.committedGive).toEqual(["MEX-5"]);
    expect(r.committedGet).toEqual(["ARG-3"]);
  });

  it("ignores codes outside the universe", () => {
    const r = computeDiff(base({
      myQuantities: new Map([["MEX-5", 2]]),
      theirMissing: new Set(["MEX-5", "ZZZ-1"]),
    }));
    expect(r.iGive).toEqual(["MEX-5"]);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- diff`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure diff**

`src/server/diff/compute.ts`:
```ts
import { compareCodes } from "@/lib/code";

export interface DiffInput {
  myQuantities: Map<string, number>;
  committedGiveByCode: Map<string, number>;
  committedGetCodes: Set<string>;
  theirMissing: Set<string>;
  theirSpares: Map<string, number>;
  thisCpGiveCodes: Set<string>;
  thisCpGetCodes: Set<string>;
  universeCodes: Set<string>;
}

export interface DiffResult {
  iGive: string[];
  theyGive: string[];
  committedGive: string[];
  committedGet: string[];
}

export function computeDiff(input: DiffInput): DiffResult {
  const q = (c: string) => input.myQuantities.get(c) ?? 0;
  const spareCount = (c: string) => Math.max(q(c) - 1, 0);
  const committedGive = (c: string) => input.committedGiveByCode.get(c) ?? 0;
  const offerable = (c: string) => spareCount(c) - committedGive(c);
  const effectiveMissing = (c: string) => q(c) === 0 && !input.committedGetCodes.has(c);

  const iGive: string[] = [];
  for (const code of input.theirMissing) {
    if (!input.universeCodes.has(code)) continue;
    if (input.thisCpGiveCodes.has(code)) continue;
    if (offerable(code) >= 1) iGive.push(code);
  }

  const theyGive: string[] = [];
  for (const code of input.theirSpares.keys()) {
    if (!input.universeCodes.has(code)) continue;
    if (input.thisCpGetCodes.has(code)) continue;
    if (effectiveMissing(code)) theyGive.push(code);
  }

  return {
    iGive: iGive.sort(compareCodes),
    theyGive: theyGive.sort(compareCodes),
    committedGive: [...input.thisCpGiveCodes].sort(compareCodes),
    committedGet: [...input.thisCpGetCodes].sort(compareCodes),
  };
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- diff`
Expected: PASS (both safeguards, committed exclusion, universe filter).

- [ ] **Step 5: Commit**

```bash
git add src/server/diff/compute.ts tests/unit/diff.test.ts
git commit -m "feat: pure reservation-aware two-way diff (TDD)"
```

---

### Task 2.3: Diff query builder (DB → grouped view)

**Files:**
- Create: `src/server/diff/query.ts`

- [ ] **Step 1: Implement the query/grouping builder**

`src/server/diff/query.ts`:
```ts
import { prisma } from "@/lib/prisma";
import { parseCounterparty } from "@/server/counterparty/parse";
import { computeDiff, type DiffResult } from "./compute";

export interface DiffGroupItem { code: string; number: string; stickerId: string }
export interface DiffSectionGroup { sectionId: string; shortName: string; emoji: string; displayName: string; items: DiffGroupItem[] }

export interface CounterpartyDiff {
  counterparty: { id: string; name: string; rawText: string };
  result: DiffResult;
  skipped: string[];
  /** code arrays regrouped by section (album order) for rendering */
  groups: {
    iGive: DiffSectionGroup[];
    theyGive: DiffSectionGroup[];
    committedGive: DiffSectionGroup[];
    committedGet: DiffSectionGroup[];
  };
}

function groupBySection(
  codes: string[],
  meta: Map<string, { stickerId: string; number: string; sectionId: string }>,
  sections: { id: string; shortName: string; emoji: string; displayName: string; orderIndex: number }[],
): DiffSectionGroup[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const buckets = new Map<string, DiffGroupItem[]>();
  for (const code of codes) {
    const m = meta.get(code)!;
    if (!buckets.has(m.sectionId)) buckets.set(m.sectionId, []);
    buckets.get(m.sectionId)!.push({ code, number: m.number, stickerId: m.stickerId });
  }
  return [...buckets.entries()]
    .map(([sectionId, items]) => {
      const s = byId.get(sectionId)!;
      return { sectionId, shortName: s.shortName, emoji: s.emoji, displayName: s.displayName, items, orderIndex: s.orderIndex };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(({ orderIndex: _o, ...g }) => g);
}

export async function getCounterpartyDiff(counterpartyId: string): Promise<CounterpartyDiff | null> {
  const cp = await prisma.counterparty.findUnique({ where: { id: counterpartyId } });
  if (!cp) return null;

  const [stickers, sections, entries, pendingGive, pendingGet, thisCp] = await Promise.all([
    prisma.sticker.findMany({ select: { id: true, code: true, number: true, sectionId: true } }),
    prisma.section.findMany({
      orderBy: { orderIndex: "asc" },
      select: { id: true, shortName: true, emoji: true, displayName: true, orderIndex: true },
    }),
    prisma.collectionEntry.findMany({ select: { stickerId: true, quantity: true } }),
    prisma.swapCommitment.groupBy({
      by: ["stickerId"],
      where: { status: "PENDING", direction: "GIVE" },
      _sum: { quantity: true },
    }),
    prisma.swapCommitment.findMany({ where: { status: "PENDING", direction: "GET" }, select: { stickerId: true } }),
    prisma.swapCommitment.findMany({
      where: { counterpartyId, status: "PENDING" },
      select: { stickerId: true, direction: true },
    }),
  ]);

  const codeById = new Map(stickers.map((s) => [s.id, s.code]));
  const meta = new Map(stickers.map((s) => [s.code, { stickerId: s.id, number: s.number, sectionId: s.sectionId }]));
  const universeCodes = new Set(stickers.map((s) => s.code));

  const myQuantities = new Map<string, number>();
  for (const e of entries) myQuantities.set(codeById.get(e.stickerId)!, e.quantity);

  const committedGiveByCode = new Map<string, number>();
  for (const g of pendingGive) committedGiveByCode.set(codeById.get(g.stickerId)!, g._sum.quantity ?? 0);

  const committedGetCodes = new Set(pendingGet.map((c) => codeById.get(c.stickerId)!));
  const thisCpGiveCodes = new Set(thisCp.filter((c) => c.direction === "GIVE").map((c) => codeById.get(c.stickerId)!));
  const thisCpGetCodes = new Set(thisCp.filter((c) => c.direction === "GET").map((c) => codeById.get(c.stickerId)!));

  const parsed = parseCounterparty(cp.rawText, universeCodes);

  const result = computeDiff({
    myQuantities,
    committedGiveByCode,
    committedGetCodes,
    theirMissing: parsed.missing,
    theirSpares: parsed.spares,
    thisCpGiveCodes,
    thisCpGetCodes,
    universeCodes,
  });

  return {
    counterparty: { id: cp.id, name: cp.name, rawText: cp.rawText },
    result,
    skipped: parsed.skipped,
    groups: {
      iGive: groupBySection(result.iGive, meta, sections),
      theyGive: groupBySection(result.theyGive, meta, sections),
      committedGive: groupBySection(result.committedGive, meta, sections),
      committedGet: groupBySection(result.committedGet, meta, sections),
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/diff/query.ts
git commit -m "feat: counterparty diff query + section grouping"
```

---

### Task 2.4: Counterparty CRUD routes

**Files:**
- Create: `src/app/api/counterparties/route.ts`, `src/app/api/counterparties/[id]/route.ts`

- [ ] **Step 1: Implement the collection route (list + create)**

`src/app/api/counterparties/route.ts`:
```ts
import { prisma } from "@/lib/prisma";
import { counterpartyCreateSchema } from "@/lib/schemas";

export async function GET() {
  const rows = await prisma.counterparty.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      commitments: { where: { status: "PENDING" }, select: { direction: true } },
    },
  });
  const list = rows.map((c) => ({
    id: c.id,
    name: c.name,
    give: c.commitments.filter((x) => x.direction === "GIVE").length,
    get: c.commitments.filter((x) => x.direction === "GET").length,
  }));
  return Response.json(list);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = counterpartyCreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid input" }, { status: 400 });
  const cp = await prisma.counterparty.create({ data: parsed.data, select: { id: true } });
  return Response.json(cp, { status: 201 });
}
```

- [ ] **Step 2: Implement the item route (read+diff, update, delete-releases-commitments)**

`src/app/api/counterparties/[id]/route.ts`:
```ts
import { prisma } from "@/lib/prisma";
import { counterpartyUpdateSchema } from "@/lib/schemas";
import { getCounterpartyDiff } from "@/server/diff/query";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const diff = await getCounterpartyDiff(id);
  if (!diff) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(diff);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = counterpartyUpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid input" }, { status: 400 });
  await prisma.counterparty.update({ where: { id }, data: parsed.data });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.$transaction(async (tx) => {
    // release reservations first so promised copies/needs return to the pool
    await tx.swapCommitment.updateMany({
      where: { counterpartyId: id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await tx.counterparty.delete({ where: { id } });
  });
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `/api/counterparties` and `/api/counterparties/[id]` listed.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/counterparties
git commit -m "feat: counterparty CRUD routes (list/create/read+diff/update/delete)"
```

---

### Task 2.5: Copy-text formatter — TDD

**Files:**
- Create: `src/lib/copy-text.ts`, `tests/unit/copy-text.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/copy-text.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatCopyText } from "@/lib/copy-text";

describe("formatCopyText", () => {
  it("renders the give/get one-liner with counts", () => {
    const out = formatCopyText(["MEX-5", "BRA-12"], ["ARG-3", "FWC-00"]);
    expect(out).toBe("I GIVE (2): MEX-5, BRA-12 · I GET (2): ARG-3, FWC-00");
  });
  it("handles empty lists", () => {
    expect(formatCopyText([], [])).toBe("I GIVE (0):  · I GET (0): ");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- copy-text`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/copy-text.ts`:
```ts
export function formatCopyText(iGive: string[], iGet: string[]): string {
  return `I GIVE (${iGive.length}): ${iGive.join(", ")} · I GET (${iGet.length}): ${iGet.join(", ")}`;
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- copy-text`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/copy-text.ts tests/unit/copy-text.test.ts
git commit -m "feat: plain-text copy formatter (TDD)"
```

---

### Task 2.6: Counterparties list page + Add-person form

**Files:**
- Create: `src/app/(app)/counterparties/page.tsx`, `src/components/AddCounterparty.tsx`

- [ ] **Step 1: Create the Add-person client component**

`src/components/AddCounterparty.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddCounterparty() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/counterparties", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, rawText }),
    });
    setBusy(false);
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/counterparties/${id}`);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
        Add person
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded border bg-white p-4">
      <input
        aria-label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Primo Mateo)"
        className="rounded border px-3 py-2"
        required
      />
      <textarea
        aria-label="Their Figuritas list"
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={6}
        placeholder={"MEX 🇲🇽: 1, 2\nSwaps\nBRA 🇧🇷: 5 (×2)"}
        className="rounded border p-2 font-mono text-sm"
      />
      <div className="flex gap-2">
        <button disabled={busy} className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500">
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the list page (Server Component)**

`src/app/(app)/counterparties/page.tsx`:
```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AddCounterparty } from "@/components/AddCounterparty";

export const dynamic = "force-dynamic";

export default async function CounterpartiesPage() {
  const rows = await prisma.counterparty.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, commitments: { where: { status: "PENDING" }, select: { direction: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Counterparties</h1>
        <AddCounterparty />
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((c) => {
          const give = c.commitments.filter((x) => x.direction === "GIVE").length;
          const get = c.commitments.filter((x) => x.direction === "GET").length;
          return (
            <li key={c.id}>
              <Link href={`/counterparties/${c.id}`} className="flex justify-between rounded border bg-white px-4 py-3">
                <span>{c.name}</span>
                <span className="text-sm text-gray-500">give {give} · get {get}</span>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-sm text-gray-500">No counterparties yet.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `/counterparties` listed.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/counterparties/page.tsx" src/components/AddCounterparty.tsx
git commit -m "feat: counterparties list + add-person"
```

---

### Task 2.7: Counterparty detail page (DiffView + Copy + editable paste)

**Files:**
- Create: `src/app/(app)/counterparties/[id]/page.tsx`, `src/components/DiffView.tsx`, `src/components/CopyButton.tsx`, `src/components/EditCounterparty.tsx`

> The detail page in this task renders the **available** diff (I give / they give) and the Copy button. The **Commit** toggles, the "Committed with…" group's cancel controls, and the "Complete swap" button are added in P1.3 (Task 3.6) — `DiffView` is built here with a stub for those so the page is usable now and extended later.

- [ ] **Step 1: Create `CopyButton`**

`src/components/CopyButton.tsx`:
```tsx
"use client";
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded border px-3 py-1 text-sm"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
```

- [ ] **Step 2: Create `EditCounterparty` (edit name + re-paste)**

`src/components/EditCounterparty.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function EditCounterparty({ id, name, rawText }: { id: string; name: string; rawText: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(name);
  const [t, setT] = useState(rawText);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/counterparties/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: n, rawText: t }),
    });
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded border px-3 py-1 text-sm">
        Edit list
      </button>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2 rounded border bg-white p-4">
      <input aria-label="Name" value={n} onChange={(e) => setN(e.target.value)} className="rounded border px-3 py-2" />
      <textarea
        aria-label="Their Figuritas list"
        value={t}
        onChange={(e) => setT(e.target.value)}
        rows={8}
        className="rounded border p-2 font-mono text-sm"
      />
      <div className="flex gap-2">
        <button disabled={busy} className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-50">Save</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500">Cancel</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create `DiffView`** (P1.2 version — available groups; the committed groups + commit/cancel/complete controls are wired in Task 3.6)

`src/components/DiffView.tsx`:
```tsx
import type { DiffSectionGroup } from "@/server/diff/query";

export function DiffGroups({ title, groups }: { title: string; groups: DiffSectionGroup[] }) {
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">
        {title} <span className="text-sm font-normal text-gray-500">({count})</span>
      </h2>
      {count === 0 && <p className="text-sm text-gray-400">Nothing here.</p>}
      <div className="flex flex-col gap-2">
        {groups.map((g) => (
          <div key={g.sectionId} className="text-sm">
            <span className="font-medium">
              <span aria-hidden>{g.emoji} </span>
              {g.displayName}:
            </span>{" "}
            {g.items.map((it) => it.code).join(", ")}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create the detail page**

`src/app/(app)/counterparties/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getCounterpartyDiff } from "@/server/diff/query";
import { DiffGroups } from "@/components/DiffView";
import { CopyButton } from "@/components/CopyButton";
import { EditCounterparty } from "@/components/EditCounterparty";
import { formatCopyText } from "@/lib/copy-text";

export const dynamic = "force-dynamic";

export default async function CounterpartyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const diff = await getCounterpartyDiff(id);
  if (!diff) notFound();

  const copyText = formatCopyText(diff.result.iGive, diff.result.theyGive);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{diff.counterparty.name}</h1>
        <div className="flex gap-2">
          <CopyButton text={copyText} />
          <EditCounterparty id={id} name={diff.counterparty.name} rawText={diff.counterparty.rawText} />
        </div>
      </div>

      {diff.skipped.length > 0 && (
        <p className="text-sm text-amber-700">Unrecognized codes in their list: {diff.skipped.join(", ")}</p>
      )}

      <DiffGroups title="I give them" groups={diff.groups.iGive} />
      <DiffGroups title="They give me" groups={diff.groups.theyGive} />
    </div>
  );
}
```

- [ ] **Step 5: Verify build + manual smoke**

Run: `npm run build`
Expected: `/counterparties/[id]` listed. Manual: seed your collection (P1.1), add a counterparty whose `Swaps` spares overlap your missing and whose faltan overlap your spares — the two lists populate; Copy yields `I GIVE (n): … · I GET (m): …`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/counterparties/[id]/page.tsx" src/components/DiffView.tsx src/components/CopyButton.tsx src/components/EditCounterparty.tsx
git commit -m "feat: counterparty detail diff view + copy + edit"
```

**P1.2 checkpoint:** add a person, paste their list, see the reservation-aware two-way diff grouped by section, and copy it as plain text. Unit + integration suites green.

---
---

# Sub-Phase P1.3 — Commitments & Completion

**Delivers:** commit/cancel toggles + the "Committed with…" groups, transactional commitment validation, **atomic "Complete swap"** (mutating the collection), and the **Active Swaps** overview. Ends with: the Master can reserve gives/gets across deals (double-promising is structurally impossible) and complete a swap that updates his collection.

---

### Task 3.1: Create commitment (transactional validation) — integration TDD

**Files:**
- Create: `src/server/swaps/commitments.ts` (createCommitment only), `tests/integration/commitments.test.ts`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/commitments.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedTestUniverse } from "./helpers";
import { applyDeltas } from "@/server/collection/service";
import { createCommitment } from "@/server/swaps/commitments";

async function sid(code: string): Promise<string> {
  return (await prisma.sticker.findFirstOrThrow({ where: { code } })).id;
}

describe("createCommitment", () => {
  let cpId: string;
  beforeAll(async () => { await seedTestUniverse(); });
  beforeEach(async () => {
    await prisma.swapCommitment.deleteMany();
    await prisma.collectionEntry.deleteMany();
    await prisma.counterparty.deleteMany();
    cpId = (await prisma.counterparty.create({ data: { name: "Mateo", rawText: "" } })).id;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("allows a GIVE when an offerable spare exists, then blocks a second once exhausted", async () => {
    const id = await sid("MEX-5");
    await applyDeltas([{ stickerId: id, delta: 2 }]); // 1 spare
    const first = await createCommitment(cpId, id, "GIVE");
    expect(first.ok).toBe(true);
    const second = await createCommitment(cpId, id, "GIVE"); // offerable now 0
    expect(second.ok).toBe(false);
  });

  it("rejects a GIVE when there is no spare", async () => {
    const id = await sid("MEX-5");
    await applyDeltas([{ stickerId: id, delta: 1 }]); // owned, no spare
    const r = await createCommitment(cpId, id, "GIVE");
    expect(r.ok).toBe(false);
  });

  it("allows a GET when the sticker is missing, then blocks a second GET", async () => {
    const id = await sid("BRA-12"); // missing (no entry)
    const first = await createCommitment(cpId, id, "GET");
    expect(first.ok).toBe(true);
    const second = await createCommitment(cpId, id, "GET");
    expect(second.ok).toBe(false);
  });

  it("rejects a GET when the sticker is already owned", async () => {
    const id = await sid("BRA-12");
    await applyDeltas([{ stickerId: id, delta: 1 }]); // owned
    const r = await createCommitment(cpId, id, "GET");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test:integration -- commitments`
Expected: FAIL — `createCommitment` not found.

- [ ] **Step 3: Implement `createCommitment`**

`src/server/swaps/commitments.ts`:
```ts
import { Prisma } from "@prisma/client";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";

export type Direction = "GIVE" | "GET";

export async function createCommitment(
  counterpartyId: string,
  stickerId: string,
  direction: Direction,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const id = createId();

  if (direction === "GIVE") {
    // Conditional insert: only succeeds if offerable (spareCount - committedGive) >= 1, atomically.
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO "SwapCommitment" ("id","counterpartyId","stickerId","direction","quantity","status","createdAt","updatedAt")
      SELECT ${id}, ${counterpartyId}, ${stickerId}, 'GIVE'::"CommitmentDirection", 1, 'PENDING'::"CommitmentStatus", now(), now()
      WHERE (
        COALESCE((SELECT "quantity" FROM "CollectionEntry" WHERE "stickerId" = ${stickerId}), 0) - 1
        - COALESCE((SELECT SUM("quantity") FROM "SwapCommitment"
                    WHERE "stickerId" = ${stickerId} AND "status" = 'PENDING' AND "direction" = 'GIVE'), 0)
      ) >= 1
      RETURNING "id"
    `);
    return rows.length > 0 ? { ok: true, id } : { ok: false, reason: "no longer available" };
  }

  // GET: only if the sticker is missing (no CollectionEntry) and no PENDING GET already exists.
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO "SwapCommitment" ("id","counterpartyId","stickerId","direction","quantity","status","createdAt","updatedAt")
    SELECT ${id}, ${counterpartyId}, ${stickerId}, 'GET'::"CommitmentDirection", 1, 'PENDING'::"CommitmentStatus", now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM "CollectionEntry" WHERE "stickerId" = ${stickerId})
      AND NOT EXISTS (SELECT 1 FROM "SwapCommitment"
                      WHERE "stickerId" = ${stickerId} AND "status" = 'PENDING' AND "direction" = 'GET')
    RETURNING "id"
  `);
  return rows.length > 0 ? { ok: true, id } : { ok: false, reason: "no longer needed" };
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test:integration -- commitments`
Expected: PASS (GIVE offerable gate, GET missing gate, both no-double rules).

- [ ] **Step 5: Commit**

```bash
git add src/server/swaps/commitments.ts tests/integration/commitments.test.ts
git commit -m "feat: transactional createCommitment (GIVE offerable / GET missing) (TDD)"
```

---

### Task 3.2: Cancel commitment — integration TDD

**Files:**
- Modify: `src/server/swaps/commitments.ts` (add `cancelCommitment`); Modify: `tests/integration/commitments.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside `tests/integration/commitments.test.ts`'s `describe`:
```ts
  it("cancelling a GIVE releases the spare so it can be re-committed", async () => {
    const id = await sid("MEX-5");
    await applyDeltas([{ stickerId: id, delta: 2 }]); // 1 spare
    const first = await createCommitment(cpId, id, "GIVE");
    if (!first.ok) throw new Error("setup failed");

    const { cancelCommitment } = await import("@/server/swaps/commitments");
    await cancelCommitment(first.id);

    const again = await createCommitment(cpId, id, "GIVE"); // spare returned to pool
    expect(again.ok).toBe(true);
    const row = await prisma.swapCommitment.findUniqueOrThrow({ where: { id: first.id } });
    expect(row.status).toBe("CANCELLED");
  });
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test:integration -- commitments`
Expected: FAIL — `cancelCommitment` not found.

- [ ] **Step 3: Implement**

Append to `src/server/swaps/commitments.ts`:
```ts
export async function cancelCommitment(id: string): Promise<void> {
  await prisma.swapCommitment.update({ where: { id }, data: { status: "CANCELLED" } });
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test:integration -- commitments`
Expected: PASS (cancel releases reservation; status CANCELLED).

- [ ] **Step 5: Commit**

```bash
git add src/server/swaps/commitments.ts tests/integration/commitments.test.ts
git commit -m "feat: cancelCommitment releases reservation (TDD)"
```

---

### Task 3.3: Complete swap (atomic, mutates collection) — integration TDD

**Files:**
- Modify: `src/server/swaps/commitments.ts` (add `completeSwap`); Create: `tests/integration/complete.test.ts`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/complete.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedTestUniverse } from "./helpers";
import { applyDeltas } from "@/server/collection/service";
import { createCommitment, completeSwap } from "@/server/swaps/commitments";

async function sid(code: string): Promise<string> {
  return (await prisma.sticker.findFirstOrThrow({ where: { code } })).id;
}
async function qty(code: string): Promise<number> {
  const id = await sid(code);
  return (await prisma.collectionEntry.findUnique({ where: { stickerId: id } }))?.quantity ?? 0;
}

describe("completeSwap", () => {
  let cpId: string;
  beforeAll(async () => { await seedTestUniverse(); });
  beforeEach(async () => {
    await prisma.swapCommitment.deleteMany();
    await prisma.collectionEntry.deleteMany();
    await prisma.counterparty.deleteMany();
    cpId = (await prisma.counterparty.create({ data: { name: "Mateo", rawText: "" } })).id;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("decrements gives, increments gets, and marks all DONE", async () => {
    const give = await sid("MEX-5");
    const get = await sid("BRA-12");
    await applyDeltas([{ stickerId: give, delta: 2 }]); // 1 spare to give
    const g = await createCommitment(cpId, give, "GIVE");
    const r = await createCommitment(cpId, get, "GET");
    expect(g.ok && r.ok).toBe(true);

    await completeSwap(cpId);

    expect(await qty("MEX-5")).toBe(1); // spare physically left; still owned
    expect(await qty("BRA-12")).toBe(1); // missing → owned
    const statuses = await prisma.swapCommitment.findMany({ where: { counterpartyId: cpId }, select: { status: true } });
    expect(statuses.every((s) => s.status === "DONE")).toBe(true);
  });

  it("a give never empties a sticker (stays >= 1 owned)", async () => {
    const give = await sid("MEX-5");
    await applyDeltas([{ stickerId: give, delta: 2 }]);
    await createCommitment(cpId, give, "GIVE");
    await completeSwap(cpId);
    expect(await qty("MEX-5")).toBe(1);
  });

  it("a get is idempotent if the sticker is already owned (no double-count)", async () => {
    const get = await sid("BRA-12");
    await createCommitment(cpId, get, "GET"); // committed while missing
    await applyDeltas([{ stickerId: get, delta: 1 }]); // becomes owned in the meantime
    await completeSwap(cpId);
    expect(await qty("BRA-12")).toBe(1); // stays owned, not bumped to 2
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test:integration -- complete`
Expected: FAIL — `completeSwap` not found.

- [ ] **Step 3: Implement `completeSwap`**

Append to `src/server/swaps/commitments.ts`:
```ts
type Tx = Prisma.TransactionClient;

/** Floored decrement reused from the collection service semantics (kept local to avoid a circular import). */
async function decrementInTx(tx: Tx, stickerId: string, copies: number): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    WITH committed AS (
      SELECT COALESCE(SUM(sc."quantity"), 0)::int AS n
      FROM "SwapCommitment" sc
      WHERE sc."stickerId" = ${stickerId} AND sc."status" = 'PENDING' AND sc."direction" = 'GIVE'
    ),
    computed AS (
      SELECT ce."id",
        GREATEST(ce."quantity" - ${copies}, CASE WHEN committed.n = 0 THEN 0 ELSE committed.n + 1 END) AS newqty
      FROM "CollectionEntry" ce, committed
      WHERE ce."stickerId" = ${stickerId}
    ),
    deleted AS (
      DELETE FROM "CollectionEntry" WHERE "id" IN (SELECT "id" FROM computed WHERE newqty <= 0)
    )
    UPDATE "CollectionEntry" ce
    SET "quantity" = computed.newqty
    FROM computed
    WHERE ce."id" = computed."id" AND computed.newqty > 0
  `);
}

export async function completeSwap(counterpartyId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const pending = await tx.swapCommitment.findMany({
      where: { counterpartyId, status: "PENDING" },
      select: { stickerId: true, direction: true, quantity: true },
    });

    // Mark DONE first so the give-decrement floor no longer counts these as reserved.
    await tx.swapCommitment.updateMany({
      where: { counterpartyId, status: "PENDING" },
      data: { status: "DONE" },
    });

    for (const c of pending) {
      if (c.direction === "GIVE") {
        await decrementInTx(tx, c.stickerId, c.quantity);
      } else {
        // GET: ensure owned (missing → qty 1; idempotent if already owned)
        await tx.collectionEntry.upsert({
          where: { stickerId: c.stickerId },
          create: { stickerId: c.stickerId, quantity: 1 },
          update: {},
        });
      }
    }
  });
}
```

> Note: `decrementInTx` is a deliberate local copy of the collection-service decrement (without the `RETURNING` projection) to avoid passing a transaction client across module boundaries. Both share the identical floor expression; if you change the floor in one, change it in both. (The `flooredQuantity` unit test in Task 1.1 documents the contract.)

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test:integration -- complete`
Expected: PASS (give decrement, get increment, give-never-empties, get-idempotent, all DONE).

- [ ] **Step 5: Commit**

```bash
git add src/server/swaps/commitments.ts tests/integration/complete.test.ts
git commit -m "feat: atomic completeSwap mutates collection + marks DONE (TDD)"
```

---

### Task 3.4: Commitment + completion routes

**Files:**
- Create: `src/app/api/counterparties/[id]/commitments/route.ts`, `src/app/api/commitments/[id]/route.ts`, `src/app/api/counterparties/[id]/complete/route.ts`

- [ ] **Step 1: Create the commitment route (membership check + service)**

`src/app/api/counterparties/[id]/commitments/route.ts`:
```ts
import { prisma } from "@/lib/prisma";
import { commitmentCreateSchema } from "@/lib/schemas";
import { parseCounterparty } from "@/server/counterparty/parse";
import { createCommitment } from "@/server/swaps/commitments";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: counterpartyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = commitmentCreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid input" }, { status: 400 });

  const { stickerId, direction } = parsed.data;

  const [cp, sticker, stickers] = await Promise.all([
    prisma.counterparty.findUnique({ where: { id: counterpartyId } }),
    prisma.sticker.findUnique({ where: { id: stickerId }, select: { code: true } }),
    prisma.sticker.findMany({ select: { code: true } }),
  ]);
  if (!cp || !sticker) return Response.json({ error: "not found" }, { status: 404 });

  // Validate the counterparty actually wants/has this sticker (defense beyond the UI affordance).
  const cpParse = parseCounterparty(cp.rawText, new Set(stickers.map((s) => s.code)));
  if (direction === "GIVE" && !cpParse.missing.has(sticker.code)) {
    return Response.json({ error: "they are not missing this" }, { status: 409 });
  }
  if (direction === "GET" && !cpParse.spares.has(sticker.code)) {
    return Response.json({ error: "they do not offer this" }, { status: 409 });
  }

  const result = await createCommitment(counterpartyId, stickerId, direction);
  if (!result.ok) return Response.json({ error: result.reason }, { status: 409 });
  return Response.json({ id: result.id }, { status: 201 });
}
```

- [ ] **Step 2: Create the cancel route**

`src/app/api/commitments/[id]/route.ts`:
```ts
import { cancelCommitment } from "@/server/swaps/commitments";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await cancelCommitment(id);
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Create the complete route**

`src/app/api/counterparties/[id]/complete/route.ts`:
```ts
import { completeSwap } from "@/server/swaps/commitments";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await completeSwap(id);
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: the three new routes listed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/counterparties/[id]/commitments" "src/app/api/commitments/[id]" "src/app/api/counterparties/[id]/complete"
git commit -m "feat: commitment create/cancel + complete-swap routes"
```

---

### Task 3.5: Active swaps service + `GET /api/swaps/active`

**Files:**
- Create: `src/server/swaps/active.ts`, `src/app/api/swaps/active/route.ts`

- [ ] **Step 1: Implement the service**

`src/server/swaps/active.ts`:
```ts
import { prisma } from "@/lib/prisma";

export interface ActiveSwap { counterpartyId: string; name: string; give: number; get: number }

export async function listActiveSwaps(): Promise<ActiveSwap[]> {
  const rows = await prisma.counterparty.findMany({
    where: { commitments: { some: { status: "PENDING" } } },
    select: {
      id: true,
      name: true,
      commitments: { where: { status: "PENDING" }, select: { direction: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((c) => ({
    counterpartyId: c.id,
    name: c.name,
    give: c.commitments.filter((x) => x.direction === "GIVE").length,
    get: c.commitments.filter((x) => x.direction === "GET").length,
  }));
}
```

- [ ] **Step 2: Implement the route**

`src/app/api/swaps/active/route.ts`:
```ts
import { listActiveSwaps } from "@/server/swaps/active";

export async function GET() {
  return Response.json(await listActiveSwaps());
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `/api/swaps/active` listed.

- [ ] **Step 4: Commit**

```bash
git add src/server/swaps/active.ts src/app/api/swaps/active/route.ts
git commit -m "feat: active swaps service + GET /api/swaps/active"
```

---

### Task 3.6: Wire commit/cancel/complete into the counterparty detail page

**Files:**
- Create: `src/components/CommitToggle.tsx`, `src/components/CancelButton.tsx`, `src/components/CompleteButton.tsx`
- Modify: `src/components/DiffView.tsx`, `src/app/(app)/counterparties/[id]/page.tsx`

- [ ] **Step 1: Create the three client controls**

`src/components/CommitToggle.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CommitToggle({
  counterpartyId,
  stickerId,
  direction,
}: {
  counterpartyId: string;
  stickerId: string;
  direction: "GIVE" | "GET";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/counterparties/${counterpartyId}/commitments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stickerId, direction }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error ?? "unavailable");
  }

  return (
    <span className="ml-1 inline-flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={commit}
        className="rounded border px-1 text-xs disabled:opacity-50"
        aria-label={`Commit ${direction}`}
      >
        Commit
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
```

`src/components/CancelButton.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelButton({ commitmentId }: { commitmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch(`/api/commitments/${commitmentId}`, { method: "DELETE" });
        setBusy(false);
        if (res.ok) router.refresh();
      }}
      className="ml-1 rounded border px-1 text-xs disabled:opacity-50"
      aria-label="Cancel commitment"
    >
      Cancel
    </button>
  );
}
```

`src/components/CompleteButton.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompleteButton({ counterpartyId }: { counterpartyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch(`/api/counterparties/${counterpartyId}/complete`, { method: "POST" });
        setBusy(false);
        if (res.ok) router.refresh();
      }}
      className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-50"
    >
      {busy ? "Completing…" : "Complete swap"}
    </button>
  );
}
```

- [ ] **Step 2: Extend `DiffView` with a committable variant + committed groups**

Append to `src/components/DiffView.tsx`:
```tsx
import { CommitToggle } from "./CommitToggle";
import { CancelButton } from "./CancelButton";

export function AvailableGroups({
  title,
  groups,
  counterpartyId,
  direction,
}: {
  title: string;
  groups: DiffSectionGroup[];
  counterpartyId: string;
  direction: "GIVE" | "GET";
}) {
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">
        {title} <span className="text-sm font-normal text-gray-500">({count})</span>
      </h2>
      {count === 0 && <p className="text-sm text-gray-400">Nothing here.</p>}
      <div className="flex flex-col gap-2">
        {groups.map((g) => (
          <div key={g.sectionId} className="text-sm">
            <span className="font-medium">
              <span aria-hidden>{g.emoji} </span>
              {g.displayName}:
            </span>{" "}
            {g.items.map((it) => (
              <span key={it.code} className="mr-2 inline-block">
                {it.code}
                <CommitToggle counterpartyId={counterpartyId} stickerId={it.stickerId} direction={direction} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export interface CommittedRow { commitmentId: string; code: string }

export function CommittedGroup({ title, rows }: { title: string; rows: CommittedRow[] }) {
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">
        {title} <span className="text-sm font-normal text-gray-500">({rows.length})</span>
      </h2>
      {rows.length === 0 && <p className="text-sm text-gray-400">Nothing committed yet.</p>}
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.commitmentId} className="text-sm">
            {r.code}
            <CancelButton commitmentId={r.commitmentId} />
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Extend the diff query to return committed rows with their commitment IDs**

The committed groups need each commitment's `id` (to cancel). Add to `src/server/diff/query.ts` — extend the `CounterpartyDiff` interface and the return value:

Add fields to the `CounterpartyDiff` interface:
```ts
  committed: {
    give: { commitmentId: string; code: string }[];
    get: { commitmentId: string; code: string }[];
  };
```

In `getCounterpartyDiff`, change the `thisCp` query to include `id`:
```ts
    prisma.swapCommitment.findMany({
      where: { counterpartyId, status: "PENDING" },
      select: { id: true, stickerId: true, direction: true },
    }),
```
and before the `return`, build the committed rows:
```ts
  const committedGive = thisCp
    .filter((c) => c.direction === "GIVE")
    .map((c) => ({ commitmentId: c.id, code: codeById.get(c.stickerId)! }))
    .sort((a, b) => compareCodes(a.code, b.code));
  const committedGet = thisCp
    .filter((c) => c.direction === "GET")
    .map((c) => ({ commitmentId: c.id, code: codeById.get(c.stickerId)! }))
    .sort((a, b) => compareCodes(a.code, b.code));
```
Add the import at the top of `query.ts`: `import { compareCodes } from "@/lib/code";`
And add `committed: { give: committedGive, get: committedGet }` to the returned object.

- [ ] **Step 4: Rewrite the detail page to use the available + committed groups + complete**

Replace `src/app/(app)/counterparties/[id]/page.tsx` with:
```tsx
import { notFound } from "next/navigation";
import { getCounterpartyDiff } from "@/server/diff/query";
import { AvailableGroups, CommittedGroup } from "@/components/DiffView";
import { CopyButton } from "@/components/CopyButton";
import { EditCounterparty } from "@/components/EditCounterparty";
import { CompleteButton } from "@/components/CompleteButton";
import { formatCopyText } from "@/lib/copy-text";

export const dynamic = "force-dynamic";

export default async function CounterpartyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const diff = await getCounterpartyDiff(id);
  if (!diff) notFound();

  const copyText = formatCopyText(diff.result.iGive, diff.result.theyGive);
  const hasCommitments = diff.committed.give.length + diff.committed.get.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{diff.counterparty.name}</h1>
        <div className="flex gap-2">
          <CopyButton text={copyText} />
          <EditCounterparty id={id} name={diff.counterparty.name} rawText={diff.counterparty.rawText} />
        </div>
      </div>

      {diff.skipped.length > 0 && (
        <p className="text-sm text-amber-700">Unrecognized codes in their list: {diff.skipped.join(", ")}</p>
      )}

      <AvailableGroups title="I give them" groups={diff.groups.iGive} counterpartyId={id} direction="GIVE" />
      <AvailableGroups title="They give me" groups={diff.groups.theyGive} counterpartyId={id} direction="GET" />

      <CommittedGroup title={`Committed with ${diff.counterparty.name} — gives`} rows={diff.committed.give} />
      <CommittedGroup title={`Committed with ${diff.counterparty.name} — gets`} rows={diff.committed.get} />

      {hasCommitments && (
        <div className="flex justify-end">
          <CompleteButton counterpartyId={id} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify build + manual smoke (the full safeguard demo)**

Run: `npm run build`
Expected: succeeds. Manual golden path: seed your collection; add two counterparties who both miss a sticker you have exactly one spare of; Commit it as a GIVE to the first → it disappears from the second's "I give them"; add a sticker you're missing that two counterparties both offer, Commit a GET from one → it disappears from the other's "They give me"; Complete the first swap → your album updates (spare leaves, get arrives).

- [ ] **Step 6: Commit**

```bash
git add src/components/CommitToggle.tsx src/components/CancelButton.tsx src/components/CompleteButton.tsx src/components/DiffView.tsx src/server/diff/query.ts "src/app/(app)/counterparties/[id]/page.tsx"
git commit -m "feat: commit/cancel toggles + committed groups + complete swap in detail page"
```

---

### Task 3.7: Active Swaps overview page

**Files:**
- Create: `src/app/(app)/swaps/page.tsx`, `src/components/ActiveSwapsList.tsx`

- [ ] **Step 1: Create the list component**

`src/components/ActiveSwapsList.tsx`:
```tsx
import Link from "next/link";
import type { ActiveSwap } from "@/server/swaps/active";

export function ActiveSwapsList({ swaps }: { swaps: ActiveSwap[] }) {
  if (swaps.length === 0) return <p className="text-sm text-gray-500">No active swaps.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {swaps.map((s) => (
        <li key={s.counterpartyId}>
          <Link
            href={`/counterparties/${s.counterpartyId}`}
            className="flex justify-between rounded border bg-white px-4 py-3"
          >
            <span>{s.name}</span>
            <span className="text-sm text-gray-500">give {s.give} · get {s.get}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Create the page**

`src/app/(app)/swaps/page.tsx`:
```tsx
import { listActiveSwaps } from "@/server/swaps/active";
import { ActiveSwapsList } from "@/components/ActiveSwapsList";

export const dynamic = "force-dynamic";

export default async function SwapsPage() {
  const swaps = await listActiveSwaps();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Active Swaps</h1>
      <ActiveSwapsList swaps={swaps} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build + final full suite**

Run:
```bash
npm run build
npm run test
docker compose -f docker-compose.test.yml up -d
npm run test:integration
```
Expected: build succeeds; both suites green.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/swaps/page.tsx" src/components/ActiveSwapsList.tsx
git commit -m "feat: Active Swaps overview page"
```

**P1.3 checkpoint (Phase 1 complete):** reservations are structurally enforced (no double-promise, no double-chase); completing a swap atomically mutates the collection; the Active Swaps page summarizes every open deal. The full unit + integration suites are green, the app builds, and `render.yaml` deploys it with a release-time seed.

---
---

## Deployment (after P1.3)

1. Push the repo to GitHub (CI runs the full suite against the Postgres service).
2. In Render, create a Blueprint from `render.yaml`. It provisions the Web Service + managed Postgres and runs `prisma migrate deploy && prisma db seed` on release.
3. Set the three secret env vars in the Render dashboard: `APP_PASSWORD`, `COOKIE_SECRET` (≥16 chars), `APP_URL` (the Render URL). `DATABASE_URL` is wired automatically.
4. Open the Render URL on the phone → `/login` → enter `APP_PASSWORD` → the album grid loads. No install needed.

---

## Self-Review (completed against the spec)

**1. Spec coverage** — every Phase 1 requirement maps to a task:

| Spec section | Task(s) |
|---|---|
| §3 stack / hosting / single-password access / single album | 0.1, 0.3, 0.9–0.12 |
| §4 six-model domain (Album/Section/Sticker/CollectionEntry/Counterparty/SwapCommitment) | 0.3 |
| §5.1 grid states & gestures (tap / edit `±` / non-color states / a11y labels) | 1.8, 1.9 |
| §5.2 atomic reservation-aware writes (`1+committed` floor, optimistic batched UI) | 1.1, 1.2, 1.3, 1.9 |
| §5.3 bulk import (combined, preview + skip + clamp, reservation floor) | 1.5, 1.6, 1.7, 1.10 |
| §6.1 Figuritas adapter + registry (emoji-ignore, `×M`, Swaps split, skipped) | 1.5 |
| §6.2 counterparty lifecycle (create/view/edit/delete-releases-commitments) | 2.4, 2.6, 2.7 |
| §7 reservation-aware diff (offerable, effectiveMissing, both safeguards) | 2.2, 2.3 |
| §7.1 commitment create (GIVE offerable / GET effectiveMissing, transactional) + cancel | 3.1, 3.2, 3.4 |
| §7.2 atomic completion (give decrement, get increment, idempotent, DONE) | 3.3, 3.4 |
| §8 UI (login, album, counterparties, counterparty detail, active swaps, nav) | 0.10, 1.10, 2.6, 2.7, 3.6, 3.7 |
| §8 Copy button (grouped + plain text) | 2.5, 2.7 |
| §9 API surface (login/logout, collection PATCH/GET/import, counterparties CRUD, commitments, complete, swaps/active) | 0.10, 1.3, 1.4, 1.7, 2.4, 3.4, 3.5 |
| §10 framework-free `src/server/*` units + dedicated tests; atomic floors integration-tested | all server tasks; 0.4, 1.2, 1.6, 3.1–3.3 |
| §11 Render blueprint + release seed; Next 16 async `cookies()`/`params`; `proxy.ts` | 0.12, 0.10, 0.11, 2.4, 3.4 |
| §12 security baseline (signed httpOnly+SameSite cookie, Zod on every mutation, floor as safety property) | 0.9, 0.11, all routes, 1.1–1.2 |
| §13 testing (unit: adapter/applier/diff/completion math; integration: floor/clamp/validation/completion) | 0.6, 1.1, 1.5, 1.6, 2.1, 2.2, 2.5, 3.1–3.3 |
| §14 sub-phases P1.0–P1.3 independently shippable | the four sub-phase groupings |

**2. Placeholder scan** — no "TBD"/"add error handling"/"similar to Task N". Every code step shows full content; every test shows real assertions; every command shows expected output.

**3. Type consistency** — checked against the Conventions block: `applyDeltas`, `flooredQuantity`, `computeDiff`/`DiffInput`/`DiffResult`, `parseCounterparty`/`CounterpartyParse`, `figuritasParser`, `planImport`/`previewImport`/`applyImport`, `createCommitment`/`cancelCommitment`/`completeSwap`, `getCounterpartyDiff`/`CounterpartyDiff`, `SESSION_COOKIE`, schema names in `src/lib/schemas.ts`, and the `(committed > 0 ? committed + 1 : 0)` floor expression (identical in `flooredQuantity`, the `decrement` SQL, and `decrementInTx`) all line up across tasks. The DiffView is built once in P1.2 (available groups) and explicitly extended in P1.3 (Task 3.6) — no signature drift.

**Known intentional deviations from a literal reading of the spec, with rationale (noted inline where they occur):**
- The decrement/import floor is the *conditional* `committed > 0 ? committed+1 : 0`, not the literal `1 + committed` from §5.2/§5.3 — the literal form would force a needed sticker (committed 0) to owned. The conditional form is what "missing = row deleted at 0" requires, and is unit-documented in Task 1.1. (See plan note at Task 1.6 and the `flooredQuantity` contract.)
- GET completion is "ensure owned" (`upsert create 1 / update {}`), honoring the spec's "idempotent if already owned (no-op)" over the literal "`q ← q+1`". (Task 3.3.)
- The seed data file uses `a..b` ranges expanded by the universe parser instead of 994 explicit lines — same 994 stickers, reviewable file, range expansion unit-tested. (Tasks 0.5–0.6.)
