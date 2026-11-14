# ASCENSO — instructions for Claude

Space mission design game for NASA Space Apps 2026 (Space Mission Design Game challenge).
React + TypeScript + Vite. UI text and docs are in Spanish; keep them in Spanish.

- `src/sim` — pure TypeScript simulation, no React imports. Tested in `src/sim/sim.test.ts`.
- `src/ui` — React screens and Canvas 2D drawing.
- `docs/FUENTES.md` — every external source or data value used must be cited here (Space Apps rule).

Commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`.

## Team workflow — three people work on this repo at once, each with their own Claude

Other people are changing the same files right now. Follow these rules on every task.

### Before starting work

1. Run `git status` and `git fetch origin`.
2. Never work on `main`. Create a branch from the latest `origin/main`:
   `git switch -c <person>/<short-task> origin/main` (e.g. `tomas/wind-tunnel-ui`).
   If already on a task branch, bring it up to date first: `git merge origin/main`.
3. If the working tree has uncommitted changes you did not make, stop and ask the user.

### While working

- Change only what the task needs. No drive-by reformatting, renaming, reordering imports,
  or moving files — these create merge conflicts with the other two branches.
- Prefer adding a new file over growing a shared one. The files most likely to collide are
  `src/sim/flight.ts`, `src/ui/Flight.tsx`, `src/ui/Lab.tsx`, `src/sim/catalog.ts` and
  `src/styles.css`: keep edits there small and local, and append new CSS at the end of a
  clearly named section rather than rewriting existing rules.
- Do not change the signature or meaning of anything exported from `src/sim` without telling
  the user first; the other branches depend on it.
- Adding or upgrading a dependency changes `package-lock.json`, which conflicts easily.
  Ask the user before doing it, and mention it in the PR.

### Committing and sharing

- Commit only when the user asks. Stage files by name (`git add src/ui/Lab.tsx`), never
  `git add -A` or `git add .`.
- Before pushing: `git fetch origin`, `git merge origin/main`, then `npm run typecheck`
  and `npm test`. Both must pass.
- Push the branch and open a pull request into `main`. Keep PRs small and merge them
  often — a branch that lives for hours conflicts far less than one that lives for days.
- Never push directly to `main`, never `git push --force` on `main`, never
  `git reset --hard` or `git checkout -- <file>` on work you did not write.

### Merge conflicts

- A conflict means someone else changed the same lines. Keep both intentions: read both
  sides and combine them. Never resolve by taking "ours" or "theirs" for a whole file.
- After resolving, run `npm run typecheck` and `npm test` again.
- If it is not obvious how the two changes fit together, stop and ask the user, who can
  check with the teammate who wrote the other side.

### Never commit

`.env*`, `.vercel/`, `dist/`, `node_modules/`, or `.docx` files. Secrets and the game
design document are shared outside git.
