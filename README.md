# BB Tools for AI

CLI for Bitbucket Server API. Pull request management, code review workflows, and developer analytics from the terminal.

## Requirements

- Node.js 18+
- Access to a Bitbucket Server instance
- Personal Access Token with READ permissions

## Quick Start

```bash
# Install globally
npm install -g bb-tools-for-ai

# Or run directly with npx (no install needed)
npx bb-tools-for-ai setup

# Setup your Bitbucket server connection
bb setup

# Start using
bb whoami
bb pr:list
bb reviews
```

## Installation

### npm (recommended)

```bash
npm install -g bb-tools-for-ai
bb setup
```

### npx (no install)

```bash
npx bb-tools-for-ai setup
npx bb-tools-for-ai pr:list
npx bb-tools-for-ai reviews
```

### From source

```bash
git clone https://github.com/witqq/bb-tools-for-ai.git
cd bb-tools-for-ai
npm install
npm link
```

After `npm link`, the `bb` command is available globally.

## Configuration

Run the interactive setup wizard:

```bash
bb setup
```

The wizard will:
1. Ask for your Bitbucket Server URL
2. Auto-detect project and repository from `git remote`
3. Prompt for your Personal Access Token

Configuration is saved to `.bbconfig` and `.token` in your current working directory.

## Commands

### User info

```bash
bb whoami                          # Current user
bb user:search john                # Search users
```

### Pull requests

```bash
bb pr:list                         # Open PRs
bb pr:list --state MERGED -l 50   # Merged PRs
bb pr:list --author jdoe           # PRs by author
bb pr:list --all-repos             # Search all configured repos

bb pr:my                           # My open PRs
bb pr:my --state MERGED            # My merged PRs
bb reviews                         # PRs assigned for my review
```

### PR details

```bash
bb pr:info 123                     # PR stats
bb pr:comments 123                 # All comments
bb pr:comments 123 --blocker       # BLOCKER comments only
bb pr:comments 123 --context       # With code context
bb pr:changes 123                  # Changed files
bb pr:commits 123                  # Commits
bb pr:diff 123                     # Diff
bb pr:merge-check 123              # Merge status
bb pr:build 123                    # CI status
```

### PR commenting

```bash
bb pr:comment 123 "General comment"
bb pr:comment 123 "Critical!" --blocker
bb pr:comment:inline 123 "src/file.ts" 42 "Comment on line"
bb pr:comment:reply 123 456 "Reply text"
```

### PR creation

```bash
bb pr:create --title "TASK-123 - Description" --target dev
bb pr:create --title "Title" -r reviewer1 -r reviewer2
bb pr:reviewer 123 --add username
```

### Developer analytics

```bash
bb analyze:developer jdoe --limit=50 -o profile.json
bb analyze:reviewer jdoe --limit=100 -o comments.json
```

### Repository browsing

```bash
bb repo:projects                   # List projects
bb repo:list MYPROJECT             # List repos in project
bb repo:branches                   # List branches
bb repo:browse src/                # Browse directory
bb repo:file src/index.ts          # Get file content
bb repo:clone PROJ repo-name       # Clone with token auth
```

## Multi-repo search

Add repositories to `ALL_REPOS` in `src/client.js`, then use `--all-repos`:

```bash
bb pr:list --all-repos
bb pr:reviewed-by jdoe --all-repos
bb analyze:developer jdoe --all-repos
```

## JSON output

All commands support `--json` for machine-readable output:

```bash
bb pr:list --json
bb pr:comments 123 --json
```

## Debug mode

```bash
DEBUG=1 bb pr:info 123
```

## Project structure

```
bb-tools-for-ai/
├── bb.js                 # CLI entry point
├── src/
│   ├── client.js         # API client (all HTTP calls)
│   ├── token.js          # Token management (encrypt/decrypt)
│   └── config.js         # Configuration (HOST, PROJECT, REPO)
├── scripts/
│   └── analysis/         # Analysis scripts
│       ├── developer-profile.js
│       └── reviewer-comments.js
├── .bbconfig             # Server config (not committed)
├── .token                # Encrypted token (not committed)
└── package.json
```

## License

MIT
