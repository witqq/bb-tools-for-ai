# BB CLI Usage

CLI for Bitbucket Server API.

## Installation

```bash
cd bb-tools-for-ai
npm install
```

## Initial setup

```bash
bb setup
```

## Commands

### User info
```bash
bb whoami
```

### Search users
```bash
bb user:search john               # Search by name, username or email
bb users john                     # Short alias
bb user:search --json john        # JSON output
```

### Pull Requests

**List PRs:**
```bash
bb pr:list                        # Open PRs
bb pr:list --state MERGED         # Merged PRs
bb pr:list --state ALL            # All PRs
bb pr:list --author jdoe          # PRs by author
bb pr:list --reviewer jsmith      # PRs where jsmith is reviewer
bb pr:list --limit 50             # Limit results
bb pr:list --all-repos            # Search all configured repos
bb pr:list --json                 # JSON output
```

**My PRs:**
```bash
bb pr:my                          # My open PRs
bb pr:my --state MERGED           # My merged PRs
bb pr:my --json                   # JSON output
```

**My reviews:**
```bash
bb pr:reviews                     # PRs where you are reviewer
bb reviews                        # Short alias
bb pr:reviews --state MERGED      # Merged PRs you reviewed
bb pr:reviews --json              # JSON output
```

**PR info:**
```bash
bb pr:info 123                    # PR stats
bb pr:info 123 --json
```

**PR comments:**
```bash
bb pr:comments 123                # All comments
bb pr:comments 123 --blocker     # BLOCKER only
bb pr:comments 123 --context     # With code context for inline
bb pr:comments 123 --json
```

**Add comments:**
```bash
bb pr:comment 123 "Comment text"                    # General comment
bb pr:comment 123 "Critical issue" --blocker        # BLOCKER comment

# Inline comment on file (attached to diff line)
bb pr:comment:inline 123 "src/file.ts" 42 "Comment on line"
bb pr:comment:inline 123 "src/file.ts" 42 "Blocker" --blocker
bb pr:comment:inline 123 "src/file.ts" 42 "Text" -t CONTEXT

# Reply to comment
bb pr:comment:reply 123 456 "Fixed"
```

**Changed files:**
```bash
bb pr:changes 123                 # List changed files
bb pr:changes 123 --json
```

**Commits:**
```bash
bb pr:commits 123                 # List commits in PR
bb pr:commits 123 --json
```

**Diff:**
```bash
bb pr:diff 123                    # Show diff
bb pr:diff 123 --path src/        # Filter by path
bb pr:diff 123 --json             # JSON output (full diff)
```

**Merge status:**
```bash
bb pr:merge-check 123             # Check merge possibility
bb pr:merge-check 123 --json
```

**CI/build status:**
```bash
bb pr:build 123                   # Build status
bb pr:build 123 --json
```

**PRs by reviewer:**
```bash
bb pr:reviewed-by jsmith                  # Merged PRs where user was reviewer
bb pr:reviewed-by jsmith -s OPEN          # Open PRs
bb pr:reviewed-by jsmith -l 100           # Limit 100
bb pr:reviewed-by jsmith --all-repos      # All repos
bb pr:reviewed-by jsmith --json
```

**Create PR:**
```bash
bb pr:create --title "TASK-123 - Description"
bb pr:create --title "Title" --description "Body text"
bb pr:create --title "Title" --branch feature/my-branch --target dev
bb pr:create --title "Title" -r reviewer1 -r reviewer2
```

**Add reviewer:**
```bash
bb pr:reviewer 123 --add jsmith
```

## Global installation

```bash
npm link
bb whoami
bb reviews
bb pr:list
```

## Help

```bash
bb --help
bb pr:list --help
bb pr:info --help
```
