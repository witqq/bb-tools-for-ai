# BB Tools for AI

CLI for Bitbucket Server API. Pull request management, code review workflows, and developer analytics from the terminal.

## Requirements

- Node.js 18+
- Access to a Bitbucket Server instance
- Personal Access Token with READ permissions

## Installation

```bash
git clone https://github.com/witqq/bb-tools-for-ai.git
cd bb-tools-for-ai
npm install
npm link
```

After `npm link`, the `bb` command is available globally.

## Configuration

### 1. Set your Bitbucket Server

Edit `src/config.js`:

```js
export const BITBUCKET_CONFIG = {
  HOST: 'https://bitbucket.your-company.com',
  BASE_URL: 'https://bitbucket.your-company.com/rest/api/1.0',
  PROJECT: 'MYPROJECT',
  REPO: 'my-repo'
};
```

### 2. Set up token

```bash
bb setup
```

The token is stored locally in `.token` file (XOR + base64 encoded, not committed to git).

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
├── .token                # Encrypted token (not committed)
└── package.json
```

## License

MIT
