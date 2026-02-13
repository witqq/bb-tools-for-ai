#!/usr/bin/env node
import {Command} from 'commander';
import {
  addInlineComment,
  addPullRequestComment,
  addReviewer,
  browseRepository,
  createPullRequest,
  getBuildStatus,
  getCloneUrl,
  getCurrentUser,
  getInboxPullRequests,
  getPullRequest,
  getPullRequestChanges,
  getPullRequestComments,
  getPullRequestCommits,
  getPullRequestDiff,
  getPullRequestMergeStatus,
  getPullRequestStats,
  getRepositoryFile,
  listBranches,
  listProjects,
  listPullRequests,
  listRepositories,
  replyToComment,
  searchUsers
} from './src/client.js';
import {hasToken, saveToken} from './src/token.js';
import {createInterface} from 'readline';

const program = new Command();

program
  .name('bb')
  .description('Bitbucket Server CLI tool')
  .version('1.0.0');

// ==================== SETUP ====================
program
  .command('setup')
  .description('Setup Bitbucket access token')
  .action(async () => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    console.log('=== Bitbucket Token Setup ===\n');

    if (hasToken()) {
      const overwrite = await question('Token already exists. Overwrite? (y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Setup cancelled.');
        rl.close();
        return;
      }
    }

    console.log('\n1. Go to your Bitbucket Server instance');
    console.log('2. Profile → Personal Access Tokens → Create Token');
    console.log('3. Permissions: READ for repositories\n');

    const token = await question('Enter your Bitbucket access token: ');

    if (!token || token.trim().length < 10) {
      console.error('✗ Invalid token');
      rl.close();
      process.exit(1);
    }

    saveToken(token.trim());
    console.log('\n✓ Setup complete! Token encrypted and saved.');
    console.log('\nTry: bb pr:list');

    rl.close();
  });

// ==================== WHOAMI ====================
program
  .command('whoami')
  .description('Show current user info from token')
  .action(async () => {
    try {
      const user = await getCurrentUser();
      console.log('\n=== Current User ===\n');
      console.log(`Name:         ${user.displayName}`);
      console.log(`Username:     ${user.name}`);
      console.log(`Email:        ${user.emailAddress}`);
      console.log(`Slug:         ${user.slug}`);
      console.log();
    } catch (error) {
      console.error('✗ Error:', error.message);
      if (error.response?.status === 401) {
        console.error('Token invalid or expired. Run: bb setup\n');
      }
      process.exit(1);
    }
  });

// ==================== USER COMMANDS ====================

// User Search
program
  .command('user:search <query>')
  .alias('users')
  .description('Search users by name (Russian or English), username or email')
  .option('--json', 'Output as JSON')
  .action(async (query, options) => {
    try {
      const users = await searchUsers(query);

      if (options.json) {
        console.log(JSON.stringify(users, null, 2));
        return;
      }

      console.log(`\n=== Users matching "${query}" ===\n`);

      if (users.length === 0) {
        console.log('No users found.\n');
        return;
      }

      users.forEach(u => {
        const status = u.active ? '' : ' [inactive]';
        console.log(`${u.username}${status}`);
        console.log(`   ${u.displayName}`);
        if (u.email) console.log(`   ${u.email}`);
        console.log();
      });

      console.log(`Total: ${users.length} user(s)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// ==================== PR COMMANDS ====================

// PR List
program
  .command('pr:list')
  .description('List pull requests')
  .option('-s, --state <state>', 'Filter by state (OPEN, MERGED, DECLINED, ALL)', 'OPEN')
  .option('-a, --author <username>', 'Filter by author username')
  .option('-r, --reviewer <username>', 'Filter by reviewer username')
  .option('-l, --limit <number>', 'Max number of PRs to return', '25')
  .option('--all-repos', 'Search across all known repositories')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const result = await listPullRequests({
        state: options.state,
        author: options.author,
        reviewer: options.reviewer,
        limit: parseInt(options.limit),
        allRepos: options.allRepos
      });

      const prs = result.values || [];

      if (options.json) {
        console.log(JSON.stringify(prs, null, 2));
        return;
      }

      const modeInfo = options.allRepos ? ' (all repos)' : '';
      console.log(`\n=== Pull Requests (${options.state})${modeInfo} ===\n`);

      if (prs.length === 0) {
        console.log('No pull requests found.\n');
        return;
      }

      prs.forEach(pr => {
        const repoInfo = pr._repoInfo ? ` [${pr._repoInfo.project}/${pr._repoInfo.repo}]` : '';
        console.log(`#${pr.id}${repoInfo} [${pr.state}] ${pr.title}`);
        console.log(`   Author: ${pr.author.user.name}`);
        console.log(`   Branch: ${pr.fromRef.displayId} → ${pr.toRef.displayId}`);
        console.log();
      });

      console.log(`Total: ${prs.length} PR(s)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// PR Info
program
  .command('pr:info <id>')
  .description('Get pull request information')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const stats = await getPullRequestStats(id);

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }

      console.log('\n=== Pull Request Info ===\n');
      console.log(`ID:          ${stats.id}`);
      console.log(`Title:       ${stats.title}`);
      console.log(`State:       ${stats.state}`);
      console.log(`Author:      ${stats.author}`);
      console.log(`Branch:      ${stats.fromBranch} → ${stats.toBranch}`);
      console.log(`\nComments:    ${stats.totalComments}`);
      console.log(`Blockers:    ${stats.blockerComments}`);
      console.log(`Approvals:   ${stats.approvals}`);
      console.log();
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// PR Comments
program
  .command('pr:comments <id>')
  .description('Get pull request comments')
  .option('-b, --blocker', 'Show only BLOCKER comments')
  .option('-c, --context', 'Include code context for inline comments')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const comments = await getPullRequestComments(id, {
        blocker: options.blocker,
        withContext: options.context
      });

      if (options.json) {
        console.log(JSON.stringify(comments, null, 2));
        return;
      }

      console.log(`\n=== PR #${id} Comments ${options.blocker ? '(BLOCKER only)' : ''} ===\n`);

      if (comments.length === 0) {
        console.log('No comments found.\n');
        return;
      }

      comments.forEach((comment, idx) => {
        console.log(`[${idx + 1}] ${comment.severity} by ${comment.author}`);
        if (comment.file) {
          console.log(`    File: ${comment.file}:${comment.line || '?'}`);
        }

        // Показать контекст кода если есть
        if (comment.codeContext && comment.codeContext.length > 0) {
          console.log('    ┌─────────────────────────────────────');
          comment.codeContext.forEach(ctx => {
            const marker = ctx.isTarget ? '>>>' : '   ';
            const typeMarker = ctx.type === 'ADDED' ? '+' : ' ';
            console.log(`    │${marker} ${ctx.line}${typeMarker} ${ctx.text}`);
          });
          console.log('    └─────────────────────────────────────');
        }

        console.log(`    ${comment.text}`);
        console.log();
      });

      console.log(`Total: ${comments.length} comment(s)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// Add Comment to PR
program
  .command('pr:comment <id> <text>')
  .description('Add general comment to PR')
  .option('-b, --blocker', 'Mark as BLOCKER severity')
  .action(async (id, text, options) => {
    try {
      const severity = options.blocker ? 'BLOCKER' : 'NORMAL';
      const result = await addPullRequestComment(id, text, {severity});
      console.log(`✓ Comment added to PR #${id} (${severity})`);
      console.log(`  ID: ${result.id}`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// Add Inline Comment to file in PR
program
  .command('pr:comment:inline <id> <file> <line> <text>')
  .description('Add inline comment to file in PR')
  .option('-b, --blocker', 'Mark as BLOCKER severity')
  .option('-t, --line-type <type>', 'Line type: ADDED, REMOVED, CONTEXT', 'ADDED')
  .action(async (id, file, line, text, options) => {
    try {
      const severity = options.blocker ? 'BLOCKER' : 'NORMAL';
      const result = await addInlineComment(id, text, file, line, {
        severity,
        lineType: options.lineType
      });
      console.log(`✓ Inline comment added to PR #${id}`);
      console.log(`  File: ${file}:${line}`);
      console.log(`  Severity: ${severity}`);
      console.log(`  ID: ${result.id}`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// Reply to existing comment
program
  .command('pr:comment:reply <prId> <commentId> <text>')
  .description('Reply to existing comment')
  .action(async (prId, commentId, text) => {
    try {
      const result = await replyToComment(prId, commentId, text);
      console.log(`✓ Reply added to comment #${commentId} in PR #${prId}`);
      console.log(`  ID: ${result.id}`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// My Reviews (оптимизировано: 1 запрос вместо N+1)
program
  .command('pr:reviews')
  .alias('reviews')
  .description('Show PRs assigned to you for review')
  .option('-s, --state <state>', 'Filter by state (OPEN, MERGED, DECLINED)', 'OPEN')
  .option('-l, --limit <number>', 'Max PRs to return', '50')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const result = await getInboxPullRequests('REVIEWER', {
        state: options.state,
        limit: parseInt(options.limit)
      });
      const prs = result.values || [];

      if (options.json) {
        const output = prs.map(pr => {
          const myReview = pr.reviewers?.find(r => r.role === 'REVIEWER');
          return {
            id: pr.id,
            title: pr.title,
            state: pr.state,
            author: pr.author.user.name,
            branch: `${pr.fromRef.displayId} → ${pr.toRef.displayId}`,
            myStatus: myReview?.status || 'UNKNOWN'
          };
        });
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      console.log(`\n=== PRs to Review (${options.state}) ===\n`);

      if (prs.length === 0) {
        console.log('No PRs assigned for review.\n');
        return;
      }

      prs.forEach(pr => {
        const myReview = pr.reviewers?.find(r => r.role === 'REVIEWER');
        const status = myReview?.status === 'APPROVED' ? '✓ APPROVED' : '⏳ NEEDS REVIEW';
        console.log(`#${pr.id} [${status}] ${pr.title}`);
        console.log(`   Author: ${pr.author.user.name}`);
        console.log(`   Branch: ${pr.fromRef.displayId} → ${pr.toRef.displayId}`);
        console.log();
      });

      const pending = prs.filter(pr => {
        const myReview = pr.reviewers?.find(r => r.role === 'REVIEWER');
        return myReview?.status !== 'APPROVED';
      });
      console.log(`Total: ${prs.length} PR(s) (${pending.length} pending review)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      if (error.response?.status === 401) {
        console.error('Token invalid or expired. Run: bb setup\n');
      }
      process.exit(1);
    }
  });

// PR Create
program
  .command('pr:create')
  .description('Create a pull request')
  .option('-t, --title <title>', 'PR title (required)')
  .option('-d, --description <description>', 'PR description')
  .option('-b, --branch <branch>', 'Source branch (defaults to current branch)')
  .option('--target <branch>', 'Target branch', 'dev')
  .option('-r, --reviewer <username>', 'Add reviewer (can be used multiple times)', (val, acc) => {
    acc.push(val);
    return acc;
  }, [])
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      // Get current branch if not specified
      let fromBranch = options.branch;
      if (!fromBranch) {
        const {execSync} = await import('child_process');
        fromBranch = execSync('git rev-parse --abbrev-ref HEAD', {encoding: 'utf8'}).trim();
      }

      if (!options.title) {
        console.error('✗ Error: --title is required');
        process.exit(1);
      }

      const pr = await createPullRequest({
        title: options.title,
        description: options.description || '',
        fromBranch,
        toBranch: options.target,
        reviewers: options.reviewer
      });

      if (options.json) {
        console.log(JSON.stringify(pr, null, 2));
        return;
      }

      console.log('\n✓ Pull Request created!\n');
      console.log(`ID:          ${pr.id}`);
      console.log(`Title:       ${pr.title}`);
      console.log(`Branch:      ${pr.fromRef.displayId} → ${pr.toRef.displayId}`);
      console.log(`URL:         ${pr.links?.self?.[0]?.href || `PR #${pr.id}`}`);
      console.log();
    } catch (error) {
      console.error('✗ Error:', error.response?.data?.errors?.[0]?.message || error.message);
      process.exit(1);
    }
  });

// PR Add Reviewer
program
  .command('pr:reviewer <id>')
  .description('Add reviewer to pull request')
  .option('-a, --add <username>', 'Username to add as reviewer')
  .action(async (id, options) => {
    try {
      if (!options.add) {
        console.error('✗ Error: --add <username> is required');
        process.exit(1);
      }

      const pr = await addReviewer(id, options.add);
      console.log(`\n✓ Added ${options.add} as reviewer to PR #${id}\n`);
    } catch (error) {
      console.error('✗ Error:', error.response?.data?.errors?.[0]?.message || error.message);
      process.exit(1);
    }
  });

// Reviewed By - find PRs where user was a reviewer (uses native API filter)
program
  .command('pr:reviewed-by <username>')
  .description('Find PRs where user was a reviewer')
  .option('-s, --state <state>', 'Filter by state (OPEN, MERGED, DECLINED, ALL)', 'MERGED')
  .option('-l, --limit <number>', 'Max PRs to return', '50')
  .option('--all-repos', 'Search across all known repositories')
  .option('--json', 'Output as JSON')
  .action(async (username, options) => {
    try {
      const result = await listPullRequests({
        state: options.state,
        reviewer: username,
        limit: parseInt(options.limit),
        allRepos: options.allRepos
      });
      const prs = result.values || [];

      if (options.json) {
        const output = prs.map(pr => ({
          id: pr.id,
          title: pr.title,
          state: pr.state,
          author: pr.author.user.name,
          branch: `${pr.fromRef.displayId} → ${pr.toRef.displayId}`,
          repository: pr._repoInfo ? `${pr._repoInfo.project}/${pr._repoInfo.repo}` : undefined
        }));
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      const modeInfo = options.allRepos ? ' (all repos)' : '';
      console.log(`\n=== PRs Reviewed by "${username}" (${options.state})${modeInfo} ===\n`);

      if (prs.length === 0) {
        console.log(`No PRs found where "${username}" was a reviewer.\n`);
        return;
      }

      prs.forEach(pr => {
        const repoInfo = pr._repoInfo ? ` [${pr._repoInfo.project}/${pr._repoInfo.repo}]` : '';
        console.log(`#${pr.id}${repoInfo} [${pr.state}] ${pr.title}`);
        console.log(`   Author: ${pr.author.user.name}`);
        console.log(`   Branch: ${pr.fromRef.displayId} → ${pr.toRef.displayId}`);
        console.log();
      });

      console.log(`Total: ${prs.length} PR(s)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      if (error.response?.status === 401) {
        console.error('Token invalid or expired. Run: bb setup\n');
      }
      process.exit(1);
    }
  });

// PR My - мои PR (как автора)
program
  .command('pr:my')
  .description('Show your own pull requests')
  .option('-s, --state <state>', 'Filter by state (OPEN, MERGED, DECLINED)', 'OPEN')
  .option('-l, --limit <number>', 'Max PRs to return', '25')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      // Получаем username текущего пользователя
      const user = await getCurrentUser();
      const result = await listPullRequests({
        state: options.state,
        limit: parseInt(options.limit),
        author: user.name
      });
      const prs = result.values || [];

      if (options.json) {
        const output = prs.map(pr => ({
          id: pr.id,
          title: pr.title,
          state: pr.state,
          branch: `${pr.fromRef.displayId} → ${pr.toRef.displayId}`,
          reviewers: pr.reviewers?.map(r => ({name: r.user.name, status: r.status})) || []
        }));
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      console.log(`\n=== My Pull Requests (${options.state}) ===\n`);

      if (prs.length === 0) {
        console.log('No pull requests found.\n');
        return;
      }

      prs.forEach(pr => {
        const approvals = pr.reviewers?.filter(r => r.status === 'APPROVED').length || 0;
        const total = pr.reviewers?.length || 0;
        console.log(`#${pr.id} [${pr.state}] ${pr.title}`);
        console.log(`   Branch: ${pr.fromRef.displayId} → ${pr.toRef.displayId}`);
        console.log(`   Approvals: ${approvals}/${total}`);
        console.log();
      });

      console.log(`Total: ${prs.length} PR(s)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// PR Merge Check
program
  .command('pr:merge-check <id>')
  .description('Check if PR can be merged')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const status = await getPullRequestMergeStatus(id);

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      console.log(`\n=== Merge Status for PR #${id} ===\n`);
      console.log(`Can Merge:   ${status.canMerge ? '✓ Yes' : '✗ No'}`);
      console.log(`Conflicted:  ${status.conflicted ? '✗ Yes' : '✓ No'}`);
      console.log(`Outcome:     ${status.outcome}`);

      if (status.vetoes && status.vetoes.length > 0) {
        console.log('\nVetoes:');
        status.vetoes.forEach(v => {
          console.log(`   - ${v.summaryMessage}`);
        });
      }
      console.log();
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// PR Build Status
program
  .command('pr:build <id>')
  .description('Show CI/build status for PR')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const pr = await getPullRequest(id);
      const commitId = pr.fromRef.latestCommit;
      const buildStatus = await getBuildStatus(commitId);
      const builds = buildStatus.values || [];

      if (options.json) {
        console.log(JSON.stringify({commit: commitId, builds}, null, 2));
        return;
      }

      console.log(`\n=== Build Status for PR #${id} ===\n`);
      console.log(`Commit: ${commitId.slice(0, 8)}`);

      if (builds.length === 0) {
        console.log('No builds found.\n');
        return;
      }

      builds.forEach(build => {
        const icon = build.state === 'SUCCESSFUL' ? '✓' : build.state === 'FAILED' ? '✗' : '⏳';
        console.log(`\n${icon} ${build.name || 'Build'}`);
        console.log(`   State: ${build.state}`);
        if (build.url) console.log(`   URL: ${build.url}`);
      });
      console.log();
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// PR Diff
program
  .command('pr:diff <id>')
  .description('Show PR diff')
  .option('-p, --path <path>', 'Filter by file path')
  .option('-c, --context <lines>', 'Context lines', '3')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const diff = await getPullRequestDiff(id, {
        path: options.path,
        contextLines: parseInt(options.context)
      });

      if (options.json) {
        console.log(JSON.stringify(diff, null, 2));
        return;
      }

      const diffs = diff.diffs || [];
      console.log(`\n=== Diff for PR #${id} ===\n`);
      console.log(`Files changed: ${diffs.length}\n`);

      diffs.forEach(d => {
        const path = d.destination?.toString || d.source?.toString || 'unknown';
        console.log(`--- ${path}`);

        if (d.hunks) {
          d.hunks.forEach(hunk => {
            hunk.segments?.forEach(seg => {
              seg.lines?.forEach(line => {
                const prefix = line.type === 'ADDED' ? '+' : line.type === 'REMOVED' ? '-' : ' ';
                console.log(`${prefix} ${line.line}`);
              });
            });
          });
        }
        console.log();
      });
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// PR Changes (list of changed files)
program
  .command('pr:changes <id>')
  .description('List changed files in PR')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const changes = await getPullRequestChanges(id);
      const files = changes.values || [];

      if (options.json) {
        console.log(JSON.stringify(files, null, 2));
        return;
      }

      console.log(`\n=== Changed Files in PR #${id} ===\n`);

      if (files.length === 0) {
        console.log('No changes found.\n');
        return;
      }

      files.forEach(f => {
        const type = f.type === 'ADD' ? '+' : f.type === 'DELETE' ? '-' : 'M';
        const path = f.path?.toString || 'unknown';
        console.log(`[${type}] ${path}`);
      });

      console.log(`\nTotal: ${files.length} file(s)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// PR Commits
program
  .command('pr:commits <id>')
  .description('List commits in PR')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const commits = await getPullRequestCommits(id);
      const values = commits.values || [];

      if (options.json) {
        console.log(JSON.stringify(values, null, 2));
        return;
      }

      console.log(`\n=== Commits in PR #${id} ===\n`);

      if (values.length === 0) {
        console.log('No commits found.\n');
        return;
      }

      values.forEach(c => {
        const shortId = c.id?.slice(0, 8) || 'unknown';
        const message = c.message?.split('\n')[0] || '';
        const author = c.author?.name || 'unknown';
        console.log(`${shortId} ${message}`);
        console.log(`   Author: ${author}`);
        console.log();
      });

      console.log(`Total: ${values.length} commit(s)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// ==================== ANALYZE COMMANDS ====================

// Analyze Developer
program
  .command('analyze:developer <username>')
  .description('Extract developer profile (PRs + received comments)')
  .option('-l, --limit <number>', 'Max PRs to process', '20')
  .option('-d, --delay <ms>', 'Delay between requests', '500')
  .option('-o, --output <file>', 'Output file path')
  .option('--all-repos', 'Search across all repositories')
  .action(async (username, options) => {
    const {spawn} = await import('child_process');
    const args = [
      'scripts/analysis/developer-profile.js',
      username,
      `--limit=${options.limit}`,
      `--delay=${options.delay}`
    ];
    if (options.output) args.push(`--output=${options.output}`);
    if (options.allRepos) args.push('--all-repos');

    const child = spawn('node', args, {
      cwd: import.meta.dirname,
      stdio: 'inherit'
    });
    child.on('close', code => process.exit(code));
  });

// Analyze Reviewer
program
  .command('analyze:reviewer <username>')
  .description('Extract reviewer comments with code context')
  .option('-l, --limit <number>', 'Max PRs to process', '10')
  .option('-d, --delay <ms>', 'Delay between requests', '500')
  .option('-o, --output <file>', 'Output file path')
  .option('--all-repos', 'Search across all repositories')
  .action(async (username, options) => {
    const {spawn} = await import('child_process');
    const args = [
      'scripts/analysis/reviewer-comments.js',
      username,
      `--limit=${options.limit}`,
      `--delay=${options.delay}`
    ];
    if (options.output) args.push(`--output=${options.output}`);
    if (options.allRepos) args.push('--all-repos');

    const child = spawn('node', args, {
      cwd: import.meta.dirname,
      stdio: 'inherit'
    });
    child.on('close', code => process.exit(code));
  });

// ==================== REPOSITORY COMMANDS ====================

// List projects
program
  .command('repo:projects')
  .description('List all projects')
  .option('-l, --limit <number>', 'Max projects to return', '100')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const result = await listProjects({limit: parseInt(options.limit)});
      const projects = result.values || [];

      if (options.json) {
        console.log(JSON.stringify(projects, null, 2));
        return;
      }

      console.log('\n=== Projects ===\n');

      if (projects.length === 0) {
        console.log('No projects found.\n');
        return;
      }

      projects.forEach(p => {
        console.log(`${p.key} - ${p.name}`);
        if (p.description) console.log(`   ${p.description}`);
      });

      console.log(`\nTotal: ${projects.length} project(s)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// List repositories in project
program
  .command('repo:list <project>')
  .description('List repositories in project')
  .option('-l, --limit <number>', 'Max repos to return', '100')
  .option('--json', 'Output as JSON')
  .action(async (project, options) => {
    try {
      const result = await listRepositories(project, {limit: parseInt(options.limit)});
      const repos = result.values || [];

      if (options.json) {
        console.log(JSON.stringify(repos, null, 2));
        return;
      }

      console.log(`\n=== Repositories in ${project} ===\n`);

      if (repos.length === 0) {
        console.log('No repositories found.\n');
        return;
      }

      repos.forEach(r => {
        console.log(`${r.slug}`);
        if (r.description) console.log(`   ${r.description}`);
      });

      console.log(`\nTotal: ${repos.length} repo(s)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// Browse repository directory
program
  .command('repo:browse [path]')
  .description('List files in repository directory')
  .option('-p, --project <key>', 'Project key')
  .option('-r, --repo <slug>', 'Repository slug')
  .option('-a, --at <ref>', 'Branch or commit')
  .option('-l, --limit <number>', 'Max files to return', '1000')
  .option('--json', 'Output as JSON')
  .action(async (dirPath = '', options) => {
    try {
      const result = await browseRepository(dirPath, {
        project: options.project,
        repo: options.repo,
        at: options.at,
        limit: parseInt(options.limit)
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const children = result.children?.values || [];
      const path = result.path?.toString || '/';

      console.log(`\n=== ${path} ===\n`);

      if (children.length === 0) {
        console.log('Empty directory.\n');
        return;
      }

      // Sort: directories first, then files
      const sorted = children.sort((a, b) => {
        if (a.type === 'DIRECTORY' && b.type !== 'DIRECTORY') return -1;
        if (a.type !== 'DIRECTORY' && b.type === 'DIRECTORY') return 1;
        return (a.path?.toString || '').localeCompare(b.path?.toString || '');
      });

      sorted.forEach(item => {
        const icon = item.type === 'DIRECTORY' ? '📁' : '📄';
        const name = item.path?.toString || item.name || 'unknown';
        console.log(`${icon} ${name}`);
      });

      console.log(`\nTotal: ${children.length} item(s)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// Get file content
program
  .command('repo:file <path>')
  .description('Get file content from repository')
  .option('-p, --project <key>', 'Project key')
  .option('-r, --repo <slug>', 'Repository slug')
  .option('-a, --at <ref>', 'Branch or commit')
  .action(async (filePath, options) => {
    try {
      const content = await getRepositoryFile(filePath, {
        project: options.project,
        repo: options.repo,
        at: options.at
      });

      // Content can be string or object depending on file type
      if (typeof content === 'string') {
        console.log(content);
      } else {
        console.log(JSON.stringify(content, null, 2));
      }
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// List branches
program
  .command('repo:branches')
  .description('List repository branches')
  .option('-p, --project <key>', 'Project key')
  .option('-r, --repo <slug>', 'Repository slug')
  .option('-f, --filter <text>', 'Filter by branch name')
  .option('-l, --limit <number>', 'Max branches to return', '100')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const result = await listBranches({
        project: options.project,
        repo: options.repo,
        filterText: options.filter,
        limit: parseInt(options.limit)
      });
      const branches = result.values || [];

      if (options.json) {
        console.log(JSON.stringify(branches, null, 2));
        return;
      }

      console.log('\n=== Branches ===\n');

      if (branches.length === 0) {
        console.log('No branches found.\n');
        return;
      }

      branches.forEach(b => {
        const isDefault = b.isDefault ? ' (default)' : '';
        console.log(`${b.displayId}${isDefault}`);
      });

      console.log(`\nTotal: ${branches.length} branch(es)\n`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// Clone repository
program
  .command('repo:clone <project> <repo> [dest]')
  .description('Clone repository using token auth')
  .action(async (project, repo, dest) => {
    try {
      const {execSync} = await import('child_process');
      const cloneUrl = getCloneUrl(project, repo);
      const destination = dest || repo;

      console.log(`Cloning ${project}/${repo} to ${destination}...`);
      execSync(`git clone ${cloneUrl} ${destination}`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log(`\n✓ Cloned to ${destination}`);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

// Get clone URL (for manual use)
program
  .command('repo:clone-url <project> <repo>')
  .description('Get clone URL with token (for manual cloning)')
  .action((project, repo) => {
    try {
      const url = getCloneUrl(project, repo);
      console.log(url);
    } catch (error) {
      console.error('✗ Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
