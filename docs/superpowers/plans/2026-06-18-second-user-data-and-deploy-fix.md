# Second-User Data + Repo-Rename Deploy Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the live deployed PWA (broken by a repo rename) and document how a second person gets their own isolated data.

**Architecture:** The app is a client-only React/Vite PWA with no backend; per-browser `localStorage` already isolates each user's data. The repo was renamed `Sticker-Swap` → `Sticker-Collector`, but the Vite `base` is still hardcoded to the old name, so the deployed `index.html` requests assets under `/Sticker-Swap/` (404). Fix is a one-line config change plus aligning stale documentation, then a redeploy from `main`.

**Tech Stack:** Vite 5 (`base` path for GitHub Pages project site), GitHub Actions Pages deploy (triggers on push to `main`), Markdown docs.

## Global Constraints

- Correct repo name / Pages project path: **`Sticker-Collector`** (verbatim, case-sensitive).
- Current public URL: **`https://alejbasurto7.github.io/Sticker-Collector/`**.
- Deploy trigger: push/merge to **`main`** only ([.github/workflows/deploy.yml](../../../.github/workflows/deploy.yml)).
- No new dependencies, no app behavior changes, no accounts/sync/onboarding UI (out of scope per spec).
- Out of scope (do **not** touch): the stale deploy-branch name in `README.md` and in `docs/ARCHITECTURE.md` line ~238; only base-path references are in scope.
- Work happens on branch `claude/second-user-deploy-fix` (already created off `main`; the spec is already committed there).

---

### Task 1: Fix the Vite base path (restores the deploy)

**Files:**
- Modify: `vite.config.ts:8`

**Interfaces:**
- Consumes: nothing.
- Produces: a build whose emitted `dist/index.html` references assets under `/Sticker-Collector/`. No code symbols; downstream tasks are documentation only.

- [ ] **Step 1: Reproduce the bug — build and observe the wrong base path**

Run:
```bash
npm run build
grep -oE '/(Sticker-[A-Za-z]+)/' dist/index.html | sort -u
```
Expected (the bug): output shows `/Sticker-Swap/` — proving the deployed asset paths are wrong.

- [ ] **Step 2: Change the hardcoded repo name**

In `vite.config.ts`, change line 8 from:
```ts
const REPO = 'Sticker-Swap';
```
to:
```ts
const REPO = 'Sticker-Collector';
```

- [ ] **Step 3: Rebuild and verify the base path is now correct**

Run:
```bash
npm run build
grep -oE '/(Sticker-[A-Za-z]+)/' dist/index.html | sort -u
```
Expected: output shows **only** `/Sticker-Collector/` and no `/Sticker-Swap/`.

- [ ] **Step 4: Confirm no stray old base path remains in the build**

Run:
```bash
grep -c 'Sticker-Swap' dist/index.html
```
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts
git commit -m "fix(build): set Vite base to renamed repo Sticker-Collector

The repo was renamed Sticker-Swap -> Sticker-Collector but the Vite base
was still hardcoded to the old name, so the deployed index.html requested
assets under /Sticker-Swap/ and 404'd. Point base at the new repo name."
```

---

### Task 2: Align ARCHITECTURE.md base-path references

**Files:**
- Modify: `docs/ARCHITECTURE.md:227`, `docs/ARCHITECTURE.md:239`

**Interfaces:**
- Consumes: the corrected base path from Task 1 (`/Sticker-Collector/`).
- Produces: documentation consistent with the live deployment. Nothing depends on it.

- [ ] **Step 1: Update the build-comment base path (line ~227)**

Change:
```
npm run build     # tsc -b && vite build  ->  dist/  (base /Sticker-Swap/)
```
to:
```
npm run build     # tsc -b && vite build  ->  dist/  (base /Sticker-Collector/)
```

- [ ] **Step 2: Update the production base-path sentence (line ~239)**

Change:
```
  (or manual `workflow_dispatch`). The production base path is `/Sticker-Swap/`.
```
to:
```
  (or manual `workflow_dispatch`). The production base path is `/Sticker-Collector/`.
```

- [ ] **Step 3: Verify no base-path reference to the old name remains in this file**

Run:
```bash
grep -n 'Sticker-Swap' docs/ARCHITECTURE.md
```
Expected: no output (exit code 1). (The stale deploy-branch name on line ~238 is a different string, `claude/figuritas-...`, and is intentionally left untouched per scope.)

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs(architecture): update base path to Sticker-Collector"
```

---

### Task 3: Add the README "second user / sharing" section

**Files:**
- Modify: `README.md` (insert a new section immediately before the `## Export / import format` heading)

**Interfaces:**
- Consumes: the correct public URL (`https://alejbasurto7.github.io/Sticker-Collector/`).
- Produces: user-facing documentation. Nothing depends on it.

- [ ] **Step 1: Insert the new section**

In `README.md`, immediately **before** the line:
```
## Export / import format
```
insert this block (followed by a blank line):

```markdown
## Using it with a friend / a second user

Each person gets their **own** collection automatically — there are no accounts and nothing
is shared between devices. All data lives in *your* browser's local storage, so two people
on two different phones (or two different browsers) have completely separate collections. A
brand-new user starts with an empty album.

**To share the app:** send your friend the link —
**https://alejbasurto7.github.io/Sticker-Collector/** — and have them open it and choose
**"Add to Home Screen"** to install it. Once they've started their own collection, you can
trade with each other using the **Trade** tab's QR codes.

**One gotcha:** a separate phone or browser means separate data (what you want). But two
people sharing the *same browser on the same phone* would share one collection — for that
case use a separate device/browser, or the in-app multi-album feature.

**Caveat:** data is local-only. There's no cross-device sync, and clearing your browser's
site data (or uninstalling the app) erases that collection — there is no cloud backup.
```

- [ ] **Step 2: Verify the section and URL are present**

Run:
```bash
grep -n 'Using it with a friend' README.md
grep -c 'alejbasurto7.github.io/Sticker-Collector/' README.md
```
Expected: first grep prints the heading line; second prints a count `>= 1`.

- [ ] **Step 3: Confirm the README names no old base path / URL**

Run:
```bash
grep -n 'Sticker-Swap' README.md
```
Expected: no output (exit code 1).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): explain second-user data isolation and how to share"
```

---

### Task 4: Final repo-wide check, deploy, and live verification

**Files:** none modified (verification + deploy only).

**Interfaces:**
- Consumes: all prior task commits on `claude/second-user-deploy-fix`.
- Produces: a working live deployment at the current URL.

- [ ] **Step 1: Repo-wide check that source/config/user-docs no longer name the old repo**

Run:
```bash
git grep -n 'Sticker-Swap' -- vite.config.ts README.md docs/ARCHITECTURE.md
```
Expected: no output (exit code 1). (Matches inside `docs/superpowers/specs/` and `docs/superpowers/plans/` are intentional — they document the rename — and are excluded here.)

- [ ] **Step 2: Land the branch on `main` to trigger the deploy**

> Outward action — confirm with the user before pushing to `main`, since this publishes the live site.

```bash
git checkout main
git merge --no-ff claude/second-user-deploy-fix
git push origin main
```

- [ ] **Step 3: Wait for the Pages deploy to finish**

Run:
```bash
gh run watch "$(gh run list --workflow=deploy.yml --branch=main --limit=1 --json databaseId --jq '.[0].databaseId')"
```
Expected: the run completes with conclusion `success`.

- [ ] **Step 4: Verify the live site loads its assets (the real fix)**

Run:
```bash
JS=$(curl -sL "https://alejbasurto7.github.io/Sticker-Collector/" | grep -oE 'src="[^"]*\.js"' | head -1 | sed -E 's/src="([^"]*)"/\1/')
echo "asset path: $JS"
curl -s -o /dev/null -w "%{http_code}\n" -L "https://alejbasurto7.github.io/Sticker-Collector${JS}"
```
Expected: `asset path:` starts with `/Sticker-Collector/assets/`, and the status code is **`200`** (no longer 404).

---

## Self-Review

**Spec coverage:**
- Part 1 (fix deploy: vite `base`, redeploy, verify 200) → Task 1 + Task 4. ✓
- Part 2 (ARCHITECTURE.md base-path references) → Task 2. ✓
- Part 3 (README second-user/sharing section with correct URL) → Task 3. ✓
- Verification summary (build emits `/Sticker-Collector/`; live asset 200; no stray `Sticker-Swap` in source/config/user-docs; README section present) → Tasks 1, 3, 4. ✓
- Non-goals (no accounts/sync/UI; README deploy-branch drift untouched) → respected; called out in Global Constraints. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every edit shows exact before/after text and full inserted content. ✓

**Type consistency:** No code symbols introduced; the only literal shared across tasks is the repo name `Sticker-Collector` and the URL `https://alejbasurto7.github.io/Sticker-Collector/`, used identically everywhere. ✓
