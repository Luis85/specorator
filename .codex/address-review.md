# Recipe: Address review feedback

Use after a reviewer (human or bot — Codex, dependabot, etc.) has posted feedback on an open PR.

## Why this recipe exists

Reviews on this repository can include both a top-level summary body and inline file-line comments. They are returned by **different gh API endpoints**. A common failure mode is to query only the summary, see boilerplate text, and squash-merge while real feedback sits unaddressed in the inline comments.

The rule: **inspect both endpoints before you merge**.

## Preconditions

- The PR is open.
- At least one reviewer has posted feedback (or a bot has finished its scan).

## Steps

### 1. Fetch both endpoints

```sh
# Top-level review summaries (state, summary body, who reviewed)
gh pr view <n> --json reviews --jq '.reviews[] | {
  author: .author.login,
  state,
  commit: .commit.oid,
  submittedAt,
  body: (.body[0:400])
}'

# Inline file-line comments (the actual technical feedback)
gh api --paginate repos/<owner>/<repo>/pulls/<n>/comments --jq '.[] | {
  path,
  line,
  commit: .commit_id,
  submittedAt: .created_at,
  body: (.body[0:600])
}'
```

`--paginate` is required: without it, `gh api` returns only the first page (30 comments by default) and a long-running review thread on the PR will silently lose later comments. The `--jq` filter is applied per page, so pagination still produces a single concatenated stream of records.

If the inline endpoint returns a non-empty array, treat each entry as real review feedback that must be resolved before merge.

### 2. Reconcile each comment with the current head

For each inline comment, compare its `commit_id` to the PR's current head SHA:

```sh
gh pr view <n> --json headRefOid --jq .headRefOid
```

Three cases:

| `commit_id` vs head | Meaning | Action |
|---|---|---|
| Equal to head | Reviewer saw the latest code. | Address the feedback. |
| Older than head, line content unchanged | Feedback still applies. | Address. |
| Older than head, line content changed | The new code may already resolve, partially resolve, or sidestep the feedback. | Read the new line and decide. Do not assume it's resolved without reading. |

Note: GitHub may reposition stale inline comments to the latest commit when the line content survives. The `commit_id` may show as the current head even though no fresh review happened. Use `submittedAt` from the matching `reviews` entry to confirm whether a real re-review occurred.

### 3. Address the feedback

Each inline comment must end up in one of three states before merge:

1. **Fixed in code** — the simplest path. Push the fix, let CI re-run.
2. **Justified in a reply** — when the reviewer's premise is wrong or the trade-off is intentional. Reply on the inline thread with the reasoning. Do not delete the comment. The maintainer decides whether the justification is acceptable.
3. **Explicitly waived by a human maintainer** — only the human owner of the change can waive. Bots cannot waive their own feedback; you cannot waive on the maintainer's behalf.

When pushing a code fix, use a commit message that names the comment you are addressing:

```
chore(ci): strip CRLF before SHA-suffix match

Address Codex P2 inline review on PR #125 (commit d5941b1).
<short why, short how>
```

This makes the audit trail readable when someone scans `git log` later.

### 4. Verify before merge

Before squash-merging, re-run step 1. If new comments appeared on the latest commit, repeat the loop. Do not merge while any inline comment is unresolved.

```sh
# Final check
gh pr view <n> --json mergeable,mergeStateStatus,statusCheckRollup
gh api --paginate repos/<owner>/<repo>/pulls/<n>/comments --jq '.[]' | jq -s 'length'
```

If `mergeStateStatus` is `CLEAN`, all checks SUCCESS, and every inline comment has been addressed, proceed to merge per [`open-pr.md`](./open-pr.md) §5.

## Failure handling

- **Reviewer comment is a false positive** (a regression Codex flagged that does not exist). Verify against the actual code path with file:line citations. Reply with the verification on the inline thread. Do not silently ignore. The PR description or follow-up commit should record that the claim was investigated and dismissed, in case future readers see the same comment.
- **Reviewer requests scope expansion that is out of scope for the PR.** Open a follow-up issue, link it from a reply on the inline thread, and proceed with the merge — the original PR's acceptance criteria are the contract.
- **A reviewer keeps posting new findings on every push** (true for many automated reviewers). This is normal. Address each finding in turn. The PR is ready when the latest push receives no new actionable feedback (Codex typically reacts with 👍 or stays silent on a clean review).
