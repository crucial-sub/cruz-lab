const GITHUB_OWNER = 'crucial-sub';
const GITHUB_REPO = 'cruz-lab';
const GITHUB_BRANCH = 'main';
const POSTS_PATH = 'content/posts';

interface GitHubFileResponse {
  sha: string;
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
  const getResponse = await githubRequest(filePath);

  let existingSha: string | undefined;
  if (getResponse.ok) {
    const existingFile = (await getResponse.json()) as GitHubFileResponse;
    existingSha = existingFile.sha;
  }

  const body: Record<string, string> = {
    message,
    content: Buffer.from(content).toString('base64'),
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

  return { filePath };
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
