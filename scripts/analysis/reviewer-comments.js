#!/usr/bin/env node
/**
 * Extract all comments from a reviewer with code context
 * Usage: ./extract-reviewer-comments.js <username> [--limit N] [--delay MS] [--output FILE] [--all-repos]
 */

import {
  listPullRequests,
  getPullRequestActivities,
  getPullRequest,
  getPullRequestDiff,
  getFileContent
} from '../../src/client.js';
import {BITBUCKET_CONFIG} from '../../src/config.js';
import {writeFileSync} from 'fs';

const {PROJECT, REPO} = BITBUCKET_CONFIG;

// Parse arguments
const args = process.argv.slice(2);
const username = args.find(a => !a.startsWith('--'));
const limitArg = args.find(a => a.startsWith('--limit='));
const delayArg = args.find(a => a.startsWith('--delay='));
const outputArg = args.find(a => a.startsWith('--output='));
const allRepos = args.includes('--all-repos');

const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 10;
const DELAY_MS = delayArg ? parseInt(delayArg.split('=')[1]) : 500;
const OUTPUT_FILE = outputArg ? outputArg.split('=')[1] : null;

if (!username) {
  console.error('Usage: ./extract-reviewer-comments.js <username> [--limit=N] [--delay=MS] [--output=FILE] [--all-repos]');
  console.error('');
  console.error('Options:');
  console.error('  --all-repos    Search across all repositories (default: only configured repo)');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get diff for a PR to extract code context (wrapper with error handling)
 */
async function getPRDiff(prId, project, repo) {
  try {
    return await getPullRequestDiff(prId, {
      project,
      repo,
      contextLines: 5
    });
  } catch (error) {
    console.error(`  ⚠ Could not get diff for PR #${prId}: ${error.message}`);
    return null;
  }
}

/**
 * Extract code context from diff for a specific file and line
 */
function extractCodeContext(diff, filePath, line) {
  if (!diff || !diff.diffs) return null;

  const fileDiff = diff.diffs.find(d =>
    d.destination?.toString === filePath ||
    d.source?.toString === filePath ||
    d.destination?.name === filePath ||
    d.source?.name === filePath
  );

  if (!fileDiff || !fileDiff.hunks) return null;

  // Find the hunk containing this line
  for (const hunk of fileDiff.hunks) {
    if (!hunk.segments) continue;

    let currentLine = hunk.destinationLine || 1;
    const lines = [];

    for (const segment of hunk.segments) {
      for (const segLine of segment.lines || []) {
        if (segment.type === 'ADDED' || segment.type === 'CONTEXT') {
          if (Math.abs(currentLine - line) <= 3) {
            lines.push({
              line: currentLine,
              type: segment.type,
              text: segLine.line
            });
          }
          currentLine++;
        } else if (segment.type === 'REMOVED') {
          // Skip removed lines for destination line count
        }
      }
    }

    if (lines.length > 0) {
      return lines;
    }
  }

  return null;
}

/**
 * Get file content at specific commit for better context
 */
async function getFileAtCommit(filePath, commitId, project, repo) {
  try {
    return await getFileContent(filePath, commitId, {project, repo});
  } catch (error) {
    return null;
  }
}

/**
 * Extract context lines from file content
 */
function extractLinesFromContent(content, targetLine, contextSize = 3) {
  if (!content) return null;

  const lines = content.split('\n');
  const start = Math.max(0, targetLine - contextSize - 1);
  const end = Math.min(lines.length, targetLine + contextSize);

  return lines.slice(start, end).map((text, idx) => ({
    line: start + idx + 1,
    text,
    isTarget: start + idx + 1 === targetLine
  }));
}

async function main() {
  console.log(`\n🔍 Extracting comments from reviewer: ${username}`);
  console.log(`   Limit: ${LIMIT} PRs, Delay: ${DELAY_MS}ms between requests`);
  console.log(`   Mode: ${allRepos ? 'ALL REPOSITORIES' : 'default repo only'}\n`);

  // Step 1: Get PRs where user was reviewer
  console.log('📋 Fetching PRs...');
  const result = await listPullRequests({
    state: 'MERGED',
    reviewer: username,
    limit: LIMIT,
    allRepos: allRepos
  });
  const prs = result.values || [];
  console.log(`   Found ${prs.length} PRs\n`);

  const output = {
    reviewer: username,
    extractedAt: new Date().toISOString(),
    totalPRs: prs.length,
    totalComments: 0,
    commentsBySeverity: {BLOCKER: 0, NORMAL: 0},
    commentsByFile: {},
    prs: []
  };

  // Step 2: For each PR, get comments and code context
  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    // Extract project/repo from PR (for all-repos mode)
    const prProject = pr._repoInfo?.project || pr.toRef?.repository?.project?.key || PROJECT;
    const prRepo = pr._repoInfo?.repo || pr.toRef?.repository?.slug || REPO;
    const repoInfo = allRepos ? ` [${prProject}/${prRepo}]` : '';

    console.log(`[${i + 1}/${prs.length}] PR #${pr.id}${repoInfo}: ${pr.title.substring(0, 50)}...`);

    await sleep(DELAY_MS);

    // Get full PR info for commit hash
    const fullPR = await getPullRequest(pr.id, {project: prProject, repo: prRepo});
    const toCommit = fullPR.toRef?.latestCommit;

    await sleep(DELAY_MS);

    // Get activities (comments)
    const activities = await getPullRequestActivities(pr.id, {project: prProject, repo: prRepo});
    const comments = (activities.values || [])
      .filter(a => a.action === 'COMMENTED' && a.comment)
      .filter(a => {
        const authorName = a.comment.author?.name?.toLowerCase() || '';
        const authorSlug = a.comment.author?.slug?.toLowerCase() || '';
        const searchName = username.toLowerCase();
        return authorName.includes(searchName) || authorSlug.includes(searchName);
      });

    if (comments.length === 0) {
      console.log(`   No comments from ${username}`);
      continue;
    }

    console.log(`   Found ${comments.length} comments`);

    // Get diff for code context
    await sleep(DELAY_MS);
    const diff = await getPRDiff(pr.id, prProject, prRepo);

    const prData = {
      id: pr.id,
      title: pr.title,
      author: pr.author.user.name,
      repository: allRepos ? `${prProject}/${prRepo}` : undefined,
      branch: `${pr.fromRef.displayId} → ${pr.toRef.displayId}`,
      comments: []
    };

    // Process each comment
    for (const activity of comments) {
      const comment = activity.comment;
      const anchor = activity.commentAnchor;

      const commentData = {
        id: comment.id,
        severity: comment.severity || 'NORMAL',
        text: comment.text,
        createdAt: new Date(comment.createdDate).toISOString(),
        file: anchor?.path || null,
        line: anchor?.line || null,
        lineType: anchor?.lineType || null, // ADDED, REMOVED, CONTEXT
        codeContext: null
      };

      // Try to get code context
      if (anchor?.path && anchor?.line) {
        // First try from diff
        let context = extractCodeContext(diff, anchor.path, anchor.line);

        // If no context from diff, try to get file content
        if (!context && toCommit) {
          await sleep(DELAY_MS / 2);
          const fileContent = await getFileAtCommit(anchor.path, toCommit, prProject, prRepo);
          if (fileContent) {
            context = extractLinesFromContent(fileContent, anchor.line);
          }
        }

        if (context) {
          commentData.codeContext = context;
        }
      }

      // Update stats
      output.totalComments++;
      output.commentsBySeverity[commentData.severity] =
        (output.commentsBySeverity[commentData.severity] || 0) + 1;

      if (commentData.file) {
        // Group by file extension
        const ext = commentData.file.split('.').pop() || 'other';
        output.commentsByFile[ext] = (output.commentsByFile[ext] || 0) + 1;
      }

      prData.comments.push(commentData);
    }

    output.prs.push(prData);
  }

  // Output results
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Total PRs processed: ${output.totalPRs}`);
  console.log(`   Total comments: ${output.totalComments}`);
  console.log(`   By severity:`, output.commentsBySeverity);
  console.log(`   By file type:`, output.commentsByFile);

  if (OUTPUT_FILE) {
    writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\n💾 Saved to: ${OUTPUT_FILE}`);
  } else {
    console.log('\n📄 Output (use --output=FILE to save):');
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
