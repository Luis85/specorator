# Recipe: Branch hygiene after merge

Use after a PR has been merged (or explicitly abandoned) to clean up local and remote state.

## Preconditions

- The PR is in `MERGED` or `CLOSED` state.
- You are *not* currently on the merged branch in any active worktree (the branch you are checked out on cannot be deleted).

## Steps

### 1. Confirm the PR's final state

```sh
gh pr view <n> --json state,mergeCommit,mergedAt
```

Only proceed when `state` is `MERGED` or `CLOSED`. If the PR is still `OPEN`, stop — branch deletion would orphan the work.

### 2. Delete the remote branch (if not already deleted)

`gh pr merge --delete-branch` removes the remote branch automatically. If that step was skipped or failed, delete manually:

```sh
git push origin --delete <branch-name>
```

If the response says the branch does not exist on the remote, the merge step already cleaned it. Continue.

### 3. Remove the local worktree

If you used a worktree for the branch:

```sh
git worktree remove <path-to-worktree>
```

If `git worktree remove` reports `Permission denied` (Windows often holds file locks via running editors, dev servers, or watch processes), close the holding process and retry. As a last resort:

```sh
rm -rf <path-to-worktree>   # POSIX
# or
Remove-Item -Recurse -Force <path-to-worktree>   # PowerShell

git worktree prune
```

`git worktree prune` clears the orphaned registration left behind when the directory is removed out-of-band.

### 4. Delete the local branch

```sh
git branch -D <branch-name>
```

`-D` is required when the branch was squash-merged (the branch SHA is not an ancestor of the squash commit, so `-d` will refuse).

### 5. Sync `develop`

```sh
git fetch origin develop --prune
```

`--prune` removes stale remote-tracking branches that were deleted on the server.

### 6. Verify state

```sh
git worktree list
git branch --list '<type>/*'
```

Neither command should show the just-merged branch.

## Failure handling

- **`git worktree remove` keeps failing** even after closing the editor. Identify the locking process with `lsof <path>` (POSIX) or `handle.exe <path>` (Windows). Common culprits: a watch-mode test runner (`vitest --watch`), a dev server (`npm run dev`), an IDE indexer.
- **The branch was force-pushed and `gh pr merge --delete-branch` failed silently.** The remote branch may still exist with newer commits than the merged squash captured. Inspect with `git ls-remote origin '<type>/*'`. If the remote head is the same as the merged head, delete; if it has unexpected commits, stop and ask the maintainer — there may be unsynced work.
- **You cannot delete the local branch because it is checked out somewhere.** Run `git worktree list` to find the holding worktree and clean it up first.
