import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

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

function normalizeSiteUrl(value) {
  const normalized = value.endsWith('/') ? value : `${value}/`;
  return new URL(normalized).toString();
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;

    const key = current.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      args[key] = 'true';
      continue;
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function buildFilePath({ filePath, slug, pubDate }) {
  if (filePath) return filePath;
  if (!slug || !pubDate) return null;

  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${TARGET.postsPath}/${year}-${month}-${day}-${slug}.md`;
}

function buildPublicUrl({ publicUrl, slug, publicSiteUrl }) {
  if (publicUrl) return publicUrl;
  if (!slug) return null;
  return new URL(`/blog/${slug}`, publicSiteUrl).toString();
}

async function probeGitHubFile(envValues, filePath) {
  if (!envValues.GITHUB_TOKEN) {
    return {
      ok: false,
      detail: 'GITHUB_TOKEN이 없어 GitHub 파일을 확인할 수 없습니다.',
    };
  }

  if (!filePath) {
    return {
      ok: false,
      detail: 'filePath가 없어 GitHub 파일 위치를 계산할 수 없습니다.',
    };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${TARGET.repository}/contents/${filePath}?ref=${TARGET.branch}`,
      {
        headers: {
          Authorization: `Bearer ${envValues.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'cruz-lab-publish-verify',
        },
      }
    );

    if (!response.ok) {
      return {
        ok: false,
        detail: `GitHub 파일 확인 실패: ${response.status} ${response.statusText}`,
      };
    }

    return {
      ok: true,
      detail: `${filePath} 파일이 GitHub 저장소에 존재합니다.`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `GitHub 파일 확인 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
    };
  }
}

async function probePublicPage(publicUrl) {
  if (!publicUrl) {
    return {
      ok: false,
      detail: 'publicUrl이 없어 공개 페이지를 확인할 수 없습니다.',
    };
  }

  try {
    const response = await fetch(publicUrl, { redirect: 'follow' });

    return {
      ok: response.ok,
      detail: response.ok
        ? `공개 페이지 응답 확인: ${response.status} ${response.statusText}`
        : `공개 페이지 응답 실패: ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `공개 페이지 확인 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
    };
  }
}

function printUsage() {
  console.log('Usage: npm run publish:verify -- --slug <slug> [--pub-date <iso>] [--file-path <path>] [--public-url <url>]');
  console.log('');
  console.log('Examples:');
  console.log('  npm run publish:verify -- --slug wesbos30-01-drum-kit --pub-date 2025-12-03T00:00:00.000Z');
  console.log('  npm run publish:verify -- --slug llm-yatcha-ai-council --file-path content/posts/2026-03-26-llm-yatcha-ai-council.md');
}

async function main() {
  const envValues = await readEnvFile();
  const args = parseArgs(process.argv.slice(2));
  const publicSiteUrl = normalizeSiteUrl(envValues.PUBLIC_SITE_URL || DEFAULT_PUBLIC_SITE_URL);

  const slug = args.slug;
  const filePath = buildFilePath({
    filePath: args['file-path'],
    slug,
    pubDate: args['pub-date'],
  });
  const publicUrl = buildPublicUrl({
    publicUrl: args['public-url'],
    slug,
    publicSiteUrl,
  });

  if (!slug) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const githubCheck = await probeGitHubFile(envValues, filePath);
  const publicPageCheck = await probePublicPage(publicUrl);

  const checks = [
    {
      label: 'GitHub File',
      ok: githubCheck.ok,
      detail: githubCheck.detail,
    },
    {
      label: 'Public Page',
      ok: publicPageCheck.ok,
      detail: publicPageCheck.detail,
    },
  ];

  console.log('=== Publish Verify ===');
  console.log(`slug: ${slug}`);
  console.log(`filePath: ${filePath || 'unresolved'}`);
  console.log(`publicUrl: ${publicUrl || 'unresolved'}`);
  console.log('');

  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label}: ${check.detail}`);
  }

  if (checks.some((check) => !check.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
