# BB Tools for AI

CLI for Bitbucket Server API.

## Commands

```bash
# User info
bb whoami                            # Current user
bb user:search john                  # Search users

# My PRs and reviews
bb pr:my                             # My open PRs
bb pr:my --state MERGED              # My merged PRs
bb reviews                           # PRs assigned for review

# PR details
bb pr:info 123                       # PR stats
bb pr:comments 123 --blocker         # BLOCKER comments
bb pr:comments 123 --context         # With code context
bb pr:changes 123                    # Changed files
bb pr:commits 123                    # Commits
bb pr:diff 123                       # Diff
bb pr:merge-check 123                # Merge status
bb pr:build 123                      # CI status

# PR commenting
bb pr:comment 123 "General comment"
bb pr:comment 123 "Critical!" --blocker
bb pr:comment:inline 123 "src/file.ts" 42 "Inline comment"
bb pr:comment:reply 123 456 "Reply"

# Lists and search
bb pr:list                           # Open PRs
bb pr:list --state MERGED -l 50      # Merged PRs
bb pr:list --author jdoe             # PRs by author
bb pr:list --all-repos               # All repositories
bb pr:reviewed-by jsmith             # PRs where user was reviewer

# Create and manage
bb pr:create --title "Title" --target dev
bb pr:reviewer 123 --add username

# Developer analytics
bb analyze:developer jdoe --limit=50 -o profile.json
bb analyze:reviewer jsmith --limit=100 -o comments.json
```

## Multi-repo search

Configure repositories in `src/client.js` `ALL_REPOS` array. Use `--all-repos` flag.

## Global availability

After `npm link` the `bb` command is available globally.

## Full documentation

See `USAGE.md` in the project directory.
