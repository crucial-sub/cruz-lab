const GITHUB_OWNER = 'crucial-sub';
const GITHUB_REPO = 'cruz-lab';
const GITHUB_BRANCH = 'main';
const POSTS_PATH = 'content/posts';

export function getGitHubPublishTarget() {
  return {
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    branch: GITHUB_BRANCH,
    postsPath: POSTS_PATH,
    repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
  };
}

interface GitHubFileResponse {
  sha: string;
}

interface GitHubCommitResponse {
  commit?: {
    sha?: string;
    html_url?: string;
  };
  content?: {
    path?: string;
    html_url?: string;
  };
}

interface GitHubRepoResponse {
  permissions?: {
    push?: boolean;
    admin?: boolean;
    maintain?: boolean;
  };
}

async function githubRequest(path: string, init: RequestInit = {}) {
  const token = import.meta.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('GITHUB_TOKEN이 설정되지 않았습니다.');
  }

  return fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'cruz-lab-web-cms',
      ...(init.headers || {}),
    },
  });
}

async function githubApiRequest(path: string, init: RequestInit = {}) {
  const token = import.meta.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('GITHUB_TOKEN이 설정되지 않았습니다.');
  }

  return fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'cruz-lab-web-cms',
      ...(init.headers || {}),
    },
  });
}

async function readGitHubError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export async function probeGitHubPublishTarget() {
  const target = getGitHubPublishTarget();

  if (!import.meta.env.GITHUB_TOKEN) {
    return {
      ready: false,
      detail: 'GITHUB_TOKEN이 없어 GitHub 저장소와 브랜치 접근을 실제로 확인할 수 없습니다.',
    };
  }

  const repoResponse = await githubApiRequest('');
  if (!repoResponse.ok) {
    return {
      ready: false,
      detail: `GitHub API가 ${target.repository} 저장소 접근을 확인하지 못했습니다. (${await readGitHubError(repoResponse)})`,
    };
  }

  const repoPayload = (await repoResponse.json()) as GitHubRepoResponse;
  const hasWritePermission = Boolean(
    repoPayload.permissions?.push || repoPayload.permissions?.admin || repoPayload.permissions?.maintain
  );

  if (!hasWritePermission) {
    return {
      ready: false,
      detail: `GitHub 토큰으로 ${target.repository} 저장소를 읽을 수 있지만, ${target.branch} 브랜치에 반영할 push 권한은 확인되지 않았습니다.`,
    };
  }

  const branchResponse = await githubApiRequest(`/branches/${GITHUB_BRANCH}`);
  if (!branchResponse.ok) {
    return {
      ready: false,
      detail: `GitHub API가 ${target.repository}의 ${target.branch} 브랜치를 확인하지 못했습니다. (${await readGitHubError(branchResponse)})`,
    };
  }

  const postsPathResponse = await githubApiRequest(`/contents/${POSTS_PATH}?ref=${GITHUB_BRANCH}`);
  if (!postsPathResponse.ok) {
    return {
      ready: false,
      detail: `GitHub API가 ${target.postsPath} 경로를 확인하지 못했습니다. (${await readGitHubError(postsPathResponse)})`,
    };
  }

  return {
    ready: true,
    detail: `GitHub API에서 ${target.repository}의 push 권한과 ${target.branch} 브랜치, ${target.postsPath} 경로 접근을 확인했습니다.`,
  };
}

export async function probeGitHubPostFile(filePath?: string) {
  if (!filePath) {
    return {
      ready: false,
      detail: '출간 응답에 GitHub 파일 경로가 없어 다시 확인할 수 없습니다.',
    };
  }

  const response = await githubRequest(filePath);
  if (!response.ok) {
    return {
      ready: false,
      detail: `GitHub 파일 확인 실패: ${await readGitHubError(response)}`,
    };
  }

  return {
    ready: true,
    detail: `${filePath} 파일이 GitHub 저장소에 존재합니다.`,
  };
}

export async function upsertPostFile({
  fileName,
  content,
  message,
}: {
  fileName: string;
  content: string;
  message: string;
}) {
  const filePath = `${POSTS_PATH}/${fileName}`;
  const putResult = await upsertGitHubFile({
    filePath,
    contentBase64: Buffer.from(content).toString('base64'),
    message,
  });

  return {
    filePath,
    commitSha: putResult.commitSha,
    commitUrl: putResult.commitUrl,
    fileUrl: putResult.fileUrl,
  };
}

export async function upsertRepositoryAssetFile({
  filePath,
  contentBase64,
  message,
}: {
  filePath: string;
  contentBase64: string;
  message: string;
}) {
  const result = await upsertGitHubFile({
    filePath,
    contentBase64,
    message,
  });

  return {
    filePath,
    commitSha: result.commitSha,
    commitUrl: result.commitUrl,
    fileUrl: result.fileUrl,
  };
}

export async function deletePostFile({
  fileName,
  message,
}: {
  fileName: string;
  message: string;
}) {
  const filePath = `${POSTS_PATH}/${fileName}`;
  const getResponse = await githubRequest(filePath);

  if (!getResponse.ok) {
    return { filePath, deleted: false };
  }

  const existingFile = (await getResponse.json()) as GitHubFileResponse;

  const deleteResponse = await githubRequest(filePath, {
    method: 'DELETE',
    body: JSON.stringify({
      message,
      sha: existingFile.sha,
      branch: GITHUB_BRANCH,
    }),
  });

  if (!deleteResponse.ok) {
    throw new Error(await deleteResponse.text());
  }

  return { filePath, deleted: true };
}

async function upsertGitHubFile({
  filePath,
  contentBase64,
  message,
}: {
  filePath: string;
  contentBase64: string;
  message: string;
}) {
  const getResponse = await githubRequest(filePath);

  let existingSha: string | undefined;
  if (getResponse.ok) {
    const existingFile = (await getResponse.json()) as GitHubFileResponse;
    existingSha = existingFile.sha;
  }

  const body: Record<string, string> = {
    message,
    content: contentBase64,
    branch: GITHUB_BRANCH,
  };

  if (existingSha) {
    body.sha = existingSha;
  }

  const putResponse = await githubRequest(filePath, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

  if (!putResponse.ok) {
    throw new Error(await putResponse.text());
  }

  const putResult = (await putResponse.json()) as GitHubCommitResponse;

  return {
    commitSha: putResult.commit?.sha,
    commitUrl: putResult.commit?.html_url,
    fileUrl:
      putResult.content?.html_url ||
      `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${filePath}`,
  };
}
