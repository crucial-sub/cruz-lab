import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT_DIR = process.cwd();
const DEFAULT_PUBLIC_SITE_URL = 'https://cruzlab.dev/';
const TARGET = {
  repository: 'crucial-sub/cruz-lab',
  branch: 'main',
  postsPath: 'content/posts',
};

function parseDotEnv(raw) {
  const values = {};

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    values[key] = value;
  }

  return values;
}

async function readEnvFile() {
  try {
    const raw = await fs.readFile(path.join(ROOT_DIR, '.env'), 'utf8');
    return parseDotEnv(raw);
  } catch {
    return {};
  }
}

async function readAstroSite() {
  const configModule = await import(pathToFileURL(path.join(ROOT_DIR, 'astro.config.mjs')).href);
  const site = configModule?.default?.site;
  return site ? String(site) : DEFAULT_PUBLIC_SITE_URL;
}

async function readPostFileStats() {
  const postsDir = path.join(ROOT_DIR, 'content/posts');
  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  const markdownFiles = entries.filter((entry) => entry.isFile() && /\.(md|mdx)$/i.test(entry.name));
  return {
    postsDir,
    markdownCount: markdownFiles.length,
    sampleFiles: markdownFiles.slice(0, 3).map((entry) => entry.name),
  };
}

async function probeGitHub(envValues) {
  if (!envValues.GITHUB_TOKEN) {
    return {
      ok: false,
      skipped: true,
      detail: 'GITHUB_TOKEN이 없어 GitHub API 확인을 건너뜁니다.',
    };
  }

  try {
    const headers = {
      Authorization: `Bearer ${envValues.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'cruz-lab-publish-preflight',
    };

    const branchResponse = await fetch(
      `https://api.github.com/repos/${TARGET.repository}/branches/${TARGET.branch}`,
      { headers }
    );

    if (!branchResponse.ok) {
      return {
        ok: false,
        skipped: false,
        detail: `GitHub 브랜치 확인 실패: ${branchResponse.status} ${branchResponse.statusText}`,
      };
    }

    const contentsResponse = await fetch(
      `https://api.github.com/repos/${TARGET.repository}/contents/${TARGET.postsPath}?ref=${TARGET.branch}`,
      { headers }
    );

    if (!contentsResponse.ok) {
      return {
        ok: false,
        skipped: false,
        detail: `GitHub 포스트 경로 확인 실패: ${contentsResponse.status} ${contentsResponse.statusText}`,
      };
    }

    const repoResponse = await fetch(
      `https://api.github.com/repos/${TARGET.repository}`,
      { headers }
    );

    if (!repoResponse.ok) {
      return {
        ok: false,
        skipped: false,
        detail: `GitHub 저장소 권한 확인 실패: ${repoResponse.status} ${repoResponse.statusText}`,
      };
    }

    const repoPayload = await repoResponse.json();
    const hasWritePermission = Boolean(
      repoPayload?.permissions?.push ||
      repoPayload?.permissions?.admin ||
      repoPayload?.permissions?.maintain
    );

    if (!hasWritePermission) {
      return {
        ok: false,
        skipped: false,
        detail: `${TARGET.repository} 저장소는 보이지만 push 권한이 확인되지 않았습니다.`,
      };
    }

    return {
      ok: true,
      skipped: false,
      detail: `${TARGET.repository} / ${TARGET.branch} / ${TARGET.postsPath} 접근과 push 권한 확인`,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      detail: `GitHub API 확인 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
    };
  }
}

async function probePublicSite(publicSiteUrl) {
  try {
    const response = await fetch(new URL('/blog', publicSiteUrl), { redirect: 'follow' });
    return {
      ok: response.ok,
      detail: response.ok
        ? `공개 사이트 응답 확인: ${response.status} ${response.statusText}`
        : `공개 사이트 응답 실패: ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `공개 사이트 확인 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
    };
  }
}

function formatCheck(label, ready, detail) {
  return `${ready ? 'PASS' : 'FAIL'} ${label}: ${detail}`;
}

async function main() {
  const envValues = await readEnvFile();
  const publicSiteUrl = await readAstroSite();
  const postStats = await readPostFileStats();
  const githubProbe = await probeGitHub(envValues);
  const publicSiteProbe = await probePublicSite(publicSiteUrl);

  const checks = [
    {
      label: 'Firebase API Key',
      ready: Boolean(envValues.PUBLIC_FIREBASE_API_KEY),
      detail: envValues.PUBLIC_FIREBASE_API_KEY ? '설정됨' : '.env에 값이 없습니다.',
    },
    {
      label: 'Admin Email',
      ready: Boolean(envValues.PUBLIC_ADMIN_EMAIL),
      detail: envValues.PUBLIC_ADMIN_EMAIL || '.env에 값이 없습니다.',
    },
    {
      label: 'GitHub Token',
      ready: Boolean(envValues.GITHUB_TOKEN),
      detail: envValues.GITHUB_TOKEN ? '설정됨' : '.env에 값이 없습니다.',
    },
    {
      label: 'Public Site URL',
      ready: Boolean(publicSiteUrl),
      detail: publicSiteUrl,
    },
    {
      label: 'content/posts',
      ready: postStats.markdownCount > 0,
      detail: `${postStats.postsDir} (${postStats.markdownCount} files)`,
    },
    {
      label: 'GitHub Target Probe',
      ready: githubProbe.ok,
      detail: githubProbe.detail,
    },
    {
      label: 'Public Site Probe',
      ready: publicSiteProbe.ok,
      detail: publicSiteProbe.detail,
    },
  ];

  console.log('=== Publish Preflight ===');
  console.log(`cwd: ${ROOT_DIR}`);
  console.log(`target: ${TARGET.repository} / ${TARGET.branch} / ${TARGET.postsPath}`);
  console.log(`sample posts: ${postStats.sampleFiles.join(', ') || 'none'}`);
  console.log('');

  for (const check of checks) {
    console.log(formatCheck(check.label, check.ready, check.detail));
  }

  console.log('');
  console.log('Manual follow-up:');
  console.log('1. 관리자에서 새 글 또는 기존 글을 연다.');
  console.log('2. Publish Modal에서 실시간 진단 상태와 공개 사이트 기준 URL을 확인한다.');
  console.log('3. 출간 후 관리자 목록의 배너에서 GitHub 파일 -> 커밋 -> 공개 페이지 순서로 확인한다.');
  console.log('4. 공개 페이지 반영이 늦으면 잠시 뒤 새로고침해 배포 지연 여부만 다시 본다.');

  const failedRequiredChecks = checks.filter(
    (check) =>
      ['Firebase API Key', 'Admin Email', 'GitHub Token', 'content/posts', 'GitHub Target Probe'].includes(
        check.label
      ) && !check.ready
  );

  if (failedRequiredChecks.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
