import axios from 'axios';
import {loadToken} from './token.js';
import {BITBUCKET_CONFIG} from './config.js';

const {HOST, BASE_URL, PROJECT, REPO} = BITBUCKET_CONFIG;
const DEBUG = process.env.DEBUG === '1';

// Known repositories to search for --all-repos mode
// Add your repositories here
const ALL_REPOS = [
  {project: 'MYPROJECT', repo: 'my-repo'},
  // {project: 'OTHER', repo: 'other-repo'},
];

/**
 * Добавить фильтр по роли в параметры запроса
 */
function addRoleFilter(params, options) {
  if (options.reviewer) {
    params['role.1'] = 'REVIEWER';
    params['username.1'] = options.reviewer;
  } else if (options.author) {
    params['role.1'] = 'AUTHOR';
    params['username.1'] = options.author;
  }
}

/**
 * Создать HTTP-клиент с авторизацией
 */
function createClient() {
  const token = loadToken();

  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });

  // Логирование запросов в debug режиме
  if (DEBUG) {
    client.interceptors.request.use(config => {
      console.log(`→ ${config.method.toUpperCase()} ${config.url}`);
      return config;
    });

    client.interceptors.response.use(
      response => {
        console.log(`← ${response.status} ${response.config.url}`);
        return response;
      },
      error => {
        console.error(`✗ ${error.message}`);
        return Promise.reject(error);
      }
    );
  }

  return client;
}

/**
 * Получить информацию о PR
 * @param prId - ID PR
 * @param options.project - проект (по умолчанию из конфига)
 * @param options.repo - репозиторий (по умолчанию из конфига)
 */
export async function getPullRequest(prId, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;
  const url = `/projects/${project}/repos/${repo}/pull-requests/${prId}`;
  const response = await client.get(url);
  return response.data;
}

/**
 * Получить активности PR (комментарии, апрувы, etc)
 * @param prId - ID PR
 * @param options.project - проект (по умолчанию из конфига)
 * @param options.repo - репозиторий (по умолчанию из конфига)
 */
export async function getPullRequestActivities(prId, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;
  const url = `/projects/${project}/repos/${repo}/pull-requests/${prId}/activities`;

  const params = {
    limit: options.limit || 1000,
    start: options.start || 0
  };

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Получить список PR
 * @param options.allRepos - если true, ищет по всем репозиториям
 * @param options.reviewer - фильтр по reviewer
 * @param options.author - фильтр по автору
 */
export async function listPullRequests(options = {}) {
  const client = createClient();

  // Multi-repo search
  if (options.allRepos) {
    const allPRs = [];
    const limitPerRepo = Math.ceil((options.limit || 25) / ALL_REPOS.length) + 10;

    for (const {project, repo} of ALL_REPOS) {
      try {
        const url = `/projects/${project}/repos/${repo}/pull-requests`;
        const params = {
          state: options.state || 'OPEN',
          limit: limitPerRepo,
          start: options.start || 0
        };

        addRoleFilter(params, options);

        const response = await client.get(url, {params});
        const prs = (response.data.values || []).map(pr => ({
          ...pr,
          _repoInfo: {project, repo}
        }));
        allPRs.push(...prs);
      } catch (error) {
        // Skip repos with errors
      }
    }

    // Sort by date and limit
    allPRs.sort((a, b) => (b.updatedDate || 0) - (a.updatedDate || 0));
    return {values: allPRs.slice(0, options.limit || 25)};
  }

  // Single repo search
  const url = `/projects/${PROJECT}/repos/${REPO}/pull-requests`;

  const params = {
    state: options.state || 'OPEN',
    limit: options.limit || 25,
    start: options.start || 0
  };

  addRoleFilter(params, options);

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Извлечь контекст кода из diff для файла и строки
 */
function extractCodeContext(diff, filePath, line, contextSize = 3) {
  if (!diff || !diff.diffs) return null;

  const fileDiff = diff.diffs.find(d =>
    d.destination?.toString === filePath ||
    d.source?.toString === filePath ||
    d.destination?.name === filePath ||
    d.source?.name === filePath
  );

  if (!fileDiff || !fileDiff.hunks) return null;

  for (const hunk of fileDiff.hunks) {
    if (!hunk.segments) continue;

    let currentLine = hunk.destinationLine || 1;
    const lines = [];

    for (const segment of hunk.segments) {
      for (const segLine of segment.lines || []) {
        if (segment.type === 'ADDED' || segment.type === 'CONTEXT') {
          if (Math.abs(currentLine - line) <= contextSize) {
            lines.push({
              line: currentLine,
              type: segment.type,
              text: segLine.line,
              isTarget: currentLine === line
            });
          }
          currentLine++;
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
 * Получить комментарии PR (только комментарии из activities)
 * @param prId - ID PR
 * @param options.blocker - только BLOCKER
 * @param options.withContext - добавить сниппеты кода для inline комментариев
 */
export async function getPullRequestComments(prId, options = {}) {
  // Поддержка старого API (второй аргумент boolean)
  if (typeof options === 'boolean') {
    options = {blocker: options};
  }

  const activities = await getPullRequestActivities(prId);

  // Получаем diff если нужен контекст
  let diff = null;
  if (options.withContext) {
    try {
      diff = await getPullRequestDiff(prId);
    } catch (e) {
      // Игнорируем ошибки получения diff
    }
  }

  const comments = activities.values
    .filter(activity => activity.action === 'COMMENTED' && activity.comment)
    .map(activity => {
      const comment = {
        id: activity.comment.id,
        text: activity.comment.text,
        severity: activity.comment.severity || 'NORMAL',
        author: activity.comment.author.name,
        createdDate: activity.comment.createdDate,
        file: activity.commentAnchor?.path,
        line: activity.commentAnchor?.line
      };

      // Добавляем контекст кода если есть файл и строка
      if (options.withContext && comment.file && comment.line && diff) {
        comment.codeContext = extractCodeContext(diff, comment.file, comment.line);
      }

      return comment;
    });

  if (options.blocker) {
    return comments.filter(c => c.severity === 'BLOCKER');
  }

  return comments;
}

/**
 * Получить статистику PR
 */
export async function getPullRequestStats(prId) {
  const [pr, activities] = await Promise.all([
    getPullRequest(prId),
    getPullRequestActivities(prId)
  ]);

  const comments = activities.values.filter(a => a.action === 'COMMENTED');
  const blockers = comments.filter(a => a.comment?.severity === 'BLOCKER');
  const approvals = activities.values.filter(a => a.action === 'APPROVED');

  return {
    id: pr.id,
    title: pr.title,
    state: pr.state,
    author: pr.author.user.name,
    fromBranch: pr.fromRef.displayId,
    toBranch: pr.toRef.displayId,
    totalComments: comments.length,
    blockerComments: blockers.length,
    approvals: approvals.length
  };
}

/**
 * Создать Pull Request
 * @param options.title - заголовок PR
 * @param options.description - описание PR
 * @param options.fromBranch - исходная ветка
 * @param options.toBranch - целевая ветка (по умолчанию dev)
 * @param options.reviewers - массив username ревьюверов
 */
export async function createPullRequest(options = {}) {
  const client = createClient();
  const url = `/projects/${PROJECT}/repos/${REPO}/pull-requests`;

  const body = {
    title: options.title,
    description: options.description || '',
    fromRef: {
      id: `refs/heads/${options.fromBranch}`,
      repository: {
        slug: REPO,
        project: {key: PROJECT}
      }
    },
    toRef: {
      id: `refs/heads/${options.toBranch || 'dev'}`,
      repository: {
        slug: REPO,
        project: {key: PROJECT}
      }
    }
  };

  if (options.reviewers && options.reviewers.length > 0) {
    body.reviewers = options.reviewers.map(username => ({
      user: {name: username}
    }));
  }

  const response = await client.post(url, body);
  return response.data;
}

/**
 * Добавить ревьювера к PR
 * @param prId - ID PR
 * @param username - username ревьювера
 */
export async function addReviewer(prId, username) {
  // Сначала получаем текущий PR
  const pr = await getPullRequest(prId);
  const client = createClient();
  const url = `/projects/${PROJECT}/repos/${REPO}/pull-requests/${prId}`;

  // Добавляем нового ревьювера к существующим
  const existingReviewers = pr.reviewers || [];
  const newReviewers = [...existingReviewers, {user: {name: username}}];

  const body = {
    version: pr.version,
    reviewers: newReviewers
  };

  const response = await client.put(url, body);
  return response.data;
}

/**
 * Получить информацию о текущем пользователе по токену
 */
export async function getCurrentUser() {
  const client = createClient();

  // Используем whoami endpoint для получения username
  const whoamiResponse = await client.get(`${HOST}/plugins/servlet/applinks/whoami`);
  const username = whoamiResponse.data.trim();

  const userResponse = await client.get(`${HOST}/rest/api/1.0/users/${username}`);

  return {
    name: userResponse.data.name,
    slug: userResponse.data.slug,
    displayName: userResponse.data.displayName,
    emailAddress: userResponse.data.emailAddress
  };
}

/**
 * Поиск пользователей по имени (русскому или английскому)
 * Использует официальный API /rest/api/1.0/users?filter=
 * @param query - строка поиска (часть имени, username или email)
 */
export async function searchUsers(query) {
  const client = createClient();

  const response = await client.get(`${HOST}/rest/api/1.0/users`, {
    params: {filter: query, limit: 25}
  });

  return (response.data.values || []).map(u => ({
    username: u.name,
    displayName: u.displayName || '',
    email: u.emailAddress || '',
    active: u.active
  }));
}

/**
 * Получить PR из inbox текущего пользователя
 * @param role - REVIEWER или AUTHOR
 * @param options.state - OPEN, MERGED, DECLINED
 * @param options.limit - лимит результатов
 */
export async function getInboxPullRequests(role, options = {}) {
  const client = createClient();

  const params = {
    role,
    limit: options.limit || 50
  };

  if (options.state && options.state !== 'ALL') {
    params.state = options.state;
  }

  const response = await client.get(`${HOST}/rest/api/1.0/inbox/pull-requests`, {params});
  return response.data;
}

/**
 * Получить статус возможности merge для PR
 */
export async function getPullRequestMergeStatus(prId, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;
  const url = `/projects/${project}/repos/${repo}/pull-requests/${prId}/merge`;
  const response = await client.get(url);
  return response.data;
}

/**
 * Получить diff для PR
 */
export async function getPullRequestDiff(prId, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;
  const url = `/projects/${project}/repos/${repo}/pull-requests/${prId}/diff`;

  const params = {};
  if (options.path) {
    params.path = options.path;
  }
  if (options.contextLines) {
    params.contextLines = options.contextLines;
  }

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Получить список изменённых файлов в PR
 */
export async function getPullRequestChanges(prId, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;
  const url = `/projects/${project}/repos/${repo}/pull-requests/${prId}/changes`;

  const params = {
    limit: options.limit || 1000
  };

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Получить коммиты PR
 */
export async function getPullRequestCommits(prId, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;
  const url = `/projects/${project}/repos/${repo}/pull-requests/${prId}/commits`;

  const params = {
    limit: options.limit || 100
  };

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Получить статус билда для коммита
 */
export async function getBuildStatus(commitId) {
  const client = createClient();
  const response = await client.get(`${HOST}/rest/build-status/1.0/commits/${commitId}`);
  return response.data;
}

/**
 * Получить содержимое файла на конкретном коммите/ветке
 * @param filePath - путь к файлу в репозитории
 * @param at - commit hash или branch name
 * @param options.project - проект
 * @param options.repo - репозиторий
 */
export async function getFileContent(filePath, at, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;
  const url = `/projects/${project}/repos/${repo}/raw/${filePath}`;

  const params = {};
  if (at) {
    params.at = at;
  }

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Добавить общий комментарий к PR (не привязанный к файлу)
 * @param prId - ID PR
 * @param text - текст комментария
 * @param options.severity - BLOCKER или NORMAL (по умолчанию NORMAL)
 * @param options.project - проект
 * @param options.repo - репозиторий
 */
export async function addPullRequestComment(prId, text, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;
  const url = `/projects/${project}/repos/${repo}/pull-requests/${prId}/comments`;

  const body = {
    text,
    severity: options.severity || 'NORMAL'
  };

  const response = await client.post(url, body);
  return response.data;
}

/**
 * Добавить inline-комментарий к файлу в PR
 * @param prId - ID PR
 * @param text - текст комментария
 * @param filePath - путь к файлу
 * @param line - номер строки
 * @param options.severity - BLOCKER или NORMAL (по умолчанию NORMAL)
 * @param options.lineType - ADDED, REMOVED, CONTEXT
 * @param options.fileType - TO (новая версия), FROM (старая версия)
 * @param options.project - проект
 * @param options.repo - репозиторий
 */
export async function addInlineComment(prId, text, filePath, line, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;

  // Получаем PR для fromHash/toHash
  // ВАЖНО: в anchor fromHash = toRef (целевая), toHash = fromRef (исходная)
  const pr = await getPullRequest(prId, {project, repo});
  const fromHash = pr.toRef?.latestCommit;
  const toHash = pr.fromRef?.latestCommit;

  const url = `/projects/${project}/repos/${repo}/pull-requests/${prId}/comments`;

  const body = {
    text,
    severity: options.severity || 'NORMAL',
    anchor: {
      path: filePath,
      srcPath: filePath,
      line: parseInt(line),
      lineType: options.lineType || 'ADDED',
      fileType: options.fileType || 'TO',
      diffType: 'EFFECTIVE',
      fromHash,
      toHash
    }
  };

  const response = await client.post(url, body);
  return response.data;
}

/**
 * Ответить на существующий комментарий
 * @param prId - ID PR
 * @param parentCommentId - ID родительского комментария
 * @param text - текст ответа
 * @param options.project - проект
 * @param options.repo - репозиторий
 */
export async function replyToComment(prId, parentCommentId, text, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;
  const url = `/projects/${project}/repos/${repo}/pull-requests/${prId}/comments`;

  const body = {
    text,
    parent: {
      id: parseInt(parentCommentId)
    }
  };

  const response = await client.post(url, body);
  return response.data;
}

// ==================== REPOSITORY FILE OPERATIONS ====================

/**
 * Получить список файлов в директории репозитория
 * @param dirPath - путь к директории (пустой = корень)
 * @param options.project - проект
 * @param options.repo - репозиторий
 * @param options.at - commit hash или branch name
 * @param options.limit - лимит файлов
 */
export async function browseRepository(dirPath = '', options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;

  // Bitbucket API: /browse для listing, /raw для content
  const url = `/projects/${project}/repos/${repo}/browse/${dirPath}`;

  const params = {
    limit: options.limit || 1000
  };
  if (options.at) {
    params.at = options.at;
  }

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Получить содержимое файла из репозитория
 * @param filePath - путь к файлу
 * @param options.project - проект
 * @param options.repo - репозиторий
 * @param options.at - commit hash или branch name
 */
export async function getRepositoryFile(filePath, options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;

  const url = `/projects/${project}/repos/${repo}/raw/${filePath}`;

  const params = {};
  if (options.at) {
    params.at = options.at;
  }

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Получить список веток репозитория
 * @param options.project - проект
 * @param options.repo - репозиторий
 * @param options.filterText - фильтр по имени
 * @param options.limit - лимит результатов
 */
export async function listBranches(options = {}) {
  const client = createClient();
  const project = options.project || PROJECT;
  const repo = options.repo || REPO;

  const url = `/projects/${project}/repos/${repo}/branches`;

  const params = {
    limit: options.limit || 100
  };
  if (options.filterText) {
    params.filterText = options.filterText;
  }

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Получить список репозиториев в проекте
 * @param projectKey - ключ проекта
 * @param options.limit - лимит результатов
 */
export async function listRepositories(projectKey, options = {}) {
  const client = createClient();

  const url = `/projects/${projectKey}/repos`;

  const params = {
    limit: options.limit || 100
  };

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Получить список проектов
 * @param options.limit - лимит результатов
 */
export async function listProjects(options = {}) {
  const client = createClient();

  const url = '/projects';

  const params = {
    limit: options.limit || 100
  };

  const response = await client.get(url, {params});
  return response.data;
}

/**
 * Получить clone URL для репозитория
 * @param project - ключ проекта
 * @param repo - slug репозитория
 */
export function getCloneUrl(project, repo) {
  const token = loadToken();
  const encodedToken = encodeURIComponent(token);
  const hostWithoutProtocol = HOST.replace(/^https?:\/\//, '');
  return `https://${encodedToken}@${hostWithoutProtocol}/scm/${project.toLowerCase()}/${repo}.git`;
}

/**
 * Скачать архив репозитория
 * @param project - ключ проекта
 * @param repo - slug репозитория
 * @param options.at - branch или commit
 * @param options.format - zip или tar.gz
 */
export async function downloadArchive(project, repo, options = {}) {
  const client = createClient();
  const format = options.format || 'zip';
  const at = options.at || 'master';

  const url = `${HOST}/rest/api/latest/projects/${project}/repos/${repo}/archive`;

  const params = {
    at,
    format
  };

  const response = await client.get(url, {
    params,
    responseType: 'arraybuffer'
  });

  return response.data;
}
