#!/usr/bin/env node
/**
 * Extract developer profile: their PRs + all review comments received
 * Usage: ./extract-developer-profile.js <username> [--limit N] [--delay MS] [--output FILE] [--all-repos]
 *
 * Собирает:
 * - Все PR разработчика
 * - Все комментарии которые он получил от ревьюверов
 * - Код который был раскритикован
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

const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 20;
const DELAY_MS = delayArg ? parseInt(delayArg.split('=')[1]) : 500;
const OUTPUT_FILE = outputArg ? outputArg.split('=')[1] : null;

if (!username) {
  console.error('Usage: ./extract-developer-profile.js <username> [--limit=N] [--delay=MS] [--output=FILE] [--all-repos]');
  console.error('');
  console.error('Options:');
  console.error('  --all-repos    Search across all repositories (default: only configured repo)');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get PRs authored by user using role filter
 * Uses bb-client listPullRequests with author filter
 */
async function getPRsByAuthor(authorUsername, state, limit, useAllRepos = false) {
  return await listPullRequests({
    state,
    author: authorUsername,
    limit,
    allRepos: useAllRepos
  });
}

/**
 * Get diff for a PR to extract code context
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
 * Get file content at specific commit
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
function extractLinesFromContent(content, targetLine, contextSize = 5) {
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
  console.log(`\n👤 Extracting developer profile: ${username}`);
  console.log(`   Limit: ${LIMIT} PRs, Delay: ${DELAY_MS}ms between requests`);
  console.log(`   Mode: ${allRepos ? 'ALL REPOSITORIES' : 'default repo only'}\n`);

  // Step 1: Get PRs authored by user
  console.log('📋 Fetching PRs authored by user...');
  const result = await getPRsByAuthor(username, 'MERGED', LIMIT, allRepos);
  const prs = result.values || [];
  console.log(`   Found ${prs.length} PRs\n`);

  if (prs.length === 0) {
    console.log('No PRs found for this user.');
    process.exit(0);
  }

  const output = {
    developer: username,
    extractedAt: new Date().toISOString(),
    totalPRs: prs.length,
    totalCommentsReceived: 0,
    commentsBySeverity: {BLOCKER: 0, NORMAL: 0},
    commentsByReviewer: {},
    commentsByFile: {},
    prs: []
  };

  // Step 2: For each PR, get all review comments
  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    // Extract project/repo from PR (for all-repos mode)
    const prProject = pr._repoInfo?.project || pr.toRef?.repository?.project?.key || PROJECT;
    const prRepo = pr._repoInfo?.repo || pr.toRef?.repository?.slug || REPO;
    const repoInfo = allRepos ? ` [${prProject}/${prRepo}]` : '';

    console.log(`[${i + 1}/${prs.length}] PR #${pr.id}${repoInfo}: ${pr.title.substring(0, 50)}...`);

    await sleep(DELAY_MS);

    // Get full PR info
    const fullPR = await getPullRequest(pr.id, {project: prProject, repo: prRepo});
    const toCommit = fullPR.toRef?.latestCommit;

    await sleep(DELAY_MS);

    // Get activities (all comments from all reviewers)
    const activities = await getPullRequestActivities(pr.id, {project: prProject, repo: prRepo});
    const comments = (activities.values || [])
      .filter(a => a.action === 'COMMENTED' && a.comment)
      // Exclude self-comments
      .filter(a => {
        const authorName = a.comment.author?.name?.toLowerCase() || '';
        return authorName !== username.toLowerCase();
      });

    if (comments.length === 0) {
      console.log(`   No review comments`);
      output.prs.push({
        id: pr.id,
        title: pr.title,
        repository: allRepos ? `${prProject}/${prRepo}` : undefined,
        branch: `${pr.fromRef.displayId} → ${pr.toRef.displayId}`,
        reviewers: fullPR.reviewers?.map(r => r.user?.name) || [],
        commentsReceived: []
      });
      continue;
    }

    console.log(`   Received ${comments.length} review comments`);

    // Get diff for code context
    await sleep(DELAY_MS);
    const diff = await getPRDiff(pr.id, prProject, prRepo);

    const prData = {
      id: pr.id,
      title: pr.title,
      repository: allRepos ? `${prProject}/${prRepo}` : undefined,
      branch: `${pr.fromRef.displayId} → ${pr.toRef.displayId}`,
      reviewers: fullPR.reviewers?.map(r => r.user?.name) || [],
      commentsReceived: []
    };

    // Process each comment
    for (const activity of comments) {
      const comment = activity.comment;
      const anchor = activity.commentAnchor;
      const reviewer = comment.author?.name || 'unknown';

      const commentData = {
        id: comment.id,
        reviewer: reviewer,
        severity: comment.severity || 'NORMAL',
        text: comment.text,
        createdAt: new Date(comment.createdDate).toISOString(),
        file: anchor?.path || null,
        line: anchor?.line || null,
        lineType: anchor?.lineType || null,
        codeContext: null
      };

      // Try to get code context
      if (anchor?.path && anchor?.line && toCommit) {
        await sleep(DELAY_MS / 2);
        const fileContent = await getFileAtCommit(anchor.path, toCommit, prProject, prRepo);
        if (fileContent) {
          commentData.codeContext = extractLinesFromContent(fileContent, anchor.line, 5);
        }
      }

      // Update stats
      output.totalCommentsReceived++;
      output.commentsBySeverity[commentData.severity] =
        (output.commentsBySeverity[commentData.severity] || 0) + 1;
      output.commentsByReviewer[reviewer] =
        (output.commentsByReviewer[reviewer] || 0) + 1;

      if (commentData.file) {
        const ext = commentData.file.split('.').pop() || 'other';
        output.commentsByFile[ext] = (output.commentsByFile[ext] || 0) + 1;
      }

      prData.commentsReceived.push(commentData);
    }

    output.prs.push(prData);
  }

  // Output results
  console.log('\n' + '='.repeat(60));
  console.log('📊 Developer Profile Summary:');
  console.log(`   Developer: ${output.developer}`);
  console.log(`   Total PRs: ${output.totalPRs}`);
  console.log(`   Total comments received: ${output.totalCommentsReceived}`);
  console.log(`   By severity:`, output.commentsBySeverity);
  console.log(`   By reviewer:`, output.commentsByReviewer);
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
