/**
 * Bitbucket Server configuration
 *
 * HOST, PROJECT, REPO are stored in .bbconfig file (set via `bb setup`).
 * PROJECT and REPO auto-detected from `git remote get-url origin` if not overridden.
 */

import fs from 'fs';
import {execSync} from 'child_process';
import path from 'path';

export const CONFIG_FILE = path.join(process.cwd(), '.bbconfig');

export function loadConfigFile() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return {};
}

export function detectFromGitRemote() {
  try {
    const url = execSync('git remote get-url origin', {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}).trim();
    const sshMatch = url.match(/ssh:\/\/[^/]+(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    const httpMatch = url.match(/https?:\/\/[^/]+\/scm\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    const m = sshMatch || httpMatch;
    if (m) return {project: m[1], repo: m[2]};
  } catch { /* not in a git repo */ }
  return {};
}

export function saveConfig(data) {
  const current = loadConfigFile();
  const merged = {...current};
  if (data.host !== undefined) merged.host = data.host.replace(/\/+$/, '');
  if (data.project !== undefined) merged.project = data.project;
  if (data.repo !== undefined) merged.repo = data.repo;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
}

export function hasConfig() {
  return fs.existsSync(CONFIG_FILE) && !!loadConfigFile().host;
}

const fileConfig = loadConfigFile();
const gitInfo = detectFromGitRemote();
const host = fileConfig.host || '';

export const BITBUCKET_CONFIG = {
  HOST: host,
  BASE_URL: host ? `${host}/rest/api/1.0` : '',
  PROJECT: gitInfo.project || fileConfig.project || '',
  REPO: gitInfo.repo || fileConfig.repo || ''
};
