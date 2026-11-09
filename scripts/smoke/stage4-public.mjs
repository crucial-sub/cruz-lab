// 재건 4단계 공개 페이지 점검 (Plan 8.2의 1~10). 읽기만 한다
//
// 실행 (저장소 루트에서):
//   node --env-file=.env scripts/smoke/stage4-public.mjs [--base http://localhost:4327] [--static .vercel/output/static]
//        [--project-baseline <폴더>] [--skip-stage2]
//
// - 2단계 공개 점검(scripts/smoke/stage2-public.mjs: 글 상세 200·제목, 초안 404, 목록 수, 리다이렉트, 연재 순서,
//   RSS·사이트맵, 헤더)을 끝에 그대로 돌린다(Plan 8.2 머리말). --skip-stage2로 뺄 수 있다.
// - --static: 빌드 결과(.vercel/output/static)를 주면 sitemap-0.xml(prerender 페이지와 매개변수 없는 SSR 페이지)에
//   /about·/projects가 있는지도 본다.
// - --project-baseline: 프로젝트 글 이전 전의 옛 정적 페이지 HTML 폴더(<key>--<slug>.html). 주면 옛 본문과 새 본문의
//   글자(태그 제거)를 견준다(Plan 11절 "이전 뒤 옛 정적 페이지와 새 페이지의 본문 텍스트 비교"). 이전 때 한 번 쓴다.
// - 4단계 PR-A(글 상세)·PR-B(목록·노트·404) 점검 스크립트를 합쳐 옮겼다. 프로젝트(6)·OG(7)를 더했다.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseMarkdown } from '../../src/lib/content/markdown.ts';
import { CATEGORIES } from '../../src/lib/taxonomy.ts';
import { ENTRIES, SERIES_META, initAdmin, parseArgs } from '../migrate/lib/admin.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const base = (typeof args.base === 'string' ? args.base : 'http://localhost:4327').replace(
  /\/$/,
  '',
);
const staticDir = typeof args.static === 'string' ? path.resolve(args.static) : null;
const baselineDir =
  typeof args['project-baseline'] === 'string' ? path.resolve(args['project-baseline']) : null;

const { db } = initAdmin();
const [snap, metaSnap] = await Promise.all([
  db.collection(ENTRIES).where('status', '==', 'published').get(),
  db.collection(SERIES_META).get(),
]);
const published = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
const byNewest = (a, b) => b.publishedAt.toMillis() - a.publishedAt.toMillis();
const posts = published.filter((entry) => entry.kind === 'post').sort(byNewest);
const notes = published.filter((entry) => entry.kind === 'note').sort(byNewest);
const projectPosts = published.filter(
  (entry) => entry.kind === 'project' && entry.published.series,
);
const projectMeta = new Map(
  metaSnap.docs
    .filter((docSnap) => docSnap.get('project'))
    .map((docSnap) => [docSnap.id, docSnap.data()]),
);
// 발행 Part가 있는 프로젝트 (order 순, Part는 번호 순)
const projects = [...projectMeta]
  .map(([key, meta]) => ({
    key,
    meta,
    posts: projectPosts
      .filter((entry) => entry.published.series.key === key)
      .sort((a, b) => a.published.series.order - b.published.series.order),
  }))
  .filter((project) => project.posts.length > 0)
  .sort((a, b) => a.meta.project.order - b.meta.project.order || a.key.localeCompare(b.key));

let checks = 0;
const failures = [];
const check = (ok, message) => {
  checks += 1;
  if (!ok) failures.push(message);
};
const stats = {
  pages: 0,
  toc: 0,
  figures: 0,
  math: 0,
  projectParts: 0,
  ogImages: 0,
  baselineCompared: 0,
};

async function get(urlPath) {
  const res = await fetch(base + urlPath, { redirect: 'manual' });
  const isRedirect = res.status >= 300 && res.status < 400;
  const body = isRedirect ? '' : await res.text();
  // 10. 공개 응답 전부: Set-Cookie 없음
  check(!res.headers.get('set-cookie'), `${urlPath} Set-Cookie`);
  stats.pages += 1;
  return { res, body };
}
const rowsOf = (html) => (html.match(/<li[^>]*\sdata-post-row/g) ?? []).length;
const islandsOf = (html) => (html.match(/<astro-island/g) ?? []).length;
const ogImageOf = (html) => html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? '';
const hasTag = (res, tag) => (res.headers.get('vercel-cache-tag') ?? '').split(',').includes(tag);
function countFences(markdown) {
  let count = 0;
  const walk = (node) => {
    if (node.type === 'code' && node.lang !== 'math') count += 1;
    for (const child of node.children ?? []) walk(child);
  };
  walk(parseMarkdown(markdown));
  return count;
}
// 본문의 마크다운 이미지 수 (프로젝트 글 이미지 주소 검사가 빈 결과로 통과하지 않게 수를 맞춘다)
function countImages(markdown) {
  let count = 0;
  const walk = (node) => {
    if (node.type === 'image') count += 1;
    for (const child of node.children ?? []) walk(child);
  };
  walk(parseMarkdown(markdown));
  return count;
}
// 글 상세 공통: 목차 = h2·h3, 코드 틀 = 펜스, KaTeX 링크는 수식 글만, 아일랜드 0, cdnjs 0
function checkArticle(label, html, markdown) {
  const side = html.match(/<aside class="post-toc-side[\s\S]*?<\/aside>/)?.[0] ?? '';
  const tocCount = (side.match(/data-toc-link=/g) ?? []).length;
  const headingCount = (html.match(/<h[23] id="/g) ?? []).length;
  check(tocCount === headingCount, `${label} 목차 ${tocCount} != h2·h3 ${headingCount}`);
  const figures = (html.match(/<figure class="code-block" data-lang=/g) ?? []).length;
  check(
    figures === countFences(markdown),
    `${label} 코드 틀 ${figures} != 펜스 ${countFences(markdown)}`,
  );
  const hasKatex = html.includes('class="katex"');
  check(hasKatex === /<link[^>]+katex[^>]*\.css/.test(html), `${label} KaTeX 링크`);
  check(islandsOf(html) === 0, `${label} astro-island ${islandsOf(html)}`);
  check(!html.includes('cdnjs'), `${label} cdnjs`);
  stats.toc += tocCount;
  stats.figures += figures;
  stats.math += hasKatex ? 1 : 0;
}

// 1. 글마다
for (const entry of posts) {
  const urlPath = encodeURI(`/blog/${entry.published.slug}`);
  const { res, body } = await get(urlPath);
  check(res.status === 200, `${urlPath} 상태 ${res.status}`);
  checkArticle(urlPath, body, entry.published.markdown);
  check(hasTag(res, `post-${entry.id}`), `${urlPath} 캐시 태그`);
  check(ogImageOf(body).endsWith(`/og/${entry.id}.png`), `${urlPath} og:image ${ogImageOf(body)}`);
}

// 2. /blog
const blog = await get('/blog');
const blogBytes = Buffer.byteLength(blog.body);
check(blog.res.status === 200, `/blog ${blog.res.status}`);
check(blogBytes <= 100 * 1024, `/blog HTML ${blogBytes}바이트`);
check(rowsOf(blog.body) === posts.length, `/blog 행 ${rowsOf(blog.body)} != ${posts.length}`);
check(islandsOf(blog.body) === 0, '/blog astro-island');
const tabNav = blog.body.match(/<nav class="category-tabs"[\s\S]*?<\/nav>/)?.[0] ?? '';
const tabs = [
  ...tabNav.matchAll(
    /href="([^"]+)"[^>]*>\s*([^<]+?)\s*<span class="category-count"[^>]*>(\d+)<\/span>/g,
  ),
].map((match) => ({ href: match[1], count: Number(match[3]) }));
const allTab = tabs.find((tab) => tab.href === '/blog');
const categoryTabs = tabs.filter((tab) => tab.href !== '/blog');
const catCounts = new Map();
for (const entry of posts)
  catCounts.set(entry.published.category, (catCounts.get(entry.published.category) ?? 0) + 1);
const nonEmpty = CATEGORIES.filter((category) => (catCounts.get(category.key) ?? 0) > 0);
check(allTab?.count === posts.length, `전체 탭 ${allTab?.count}`);
check(
  categoryTabs.length === nonEmpty.length,
  `카테고리 탭 ${categoryTabs.length} != ${nonEmpty.length}`,
);
check(
  categoryTabs.reduce((sum, tab) => sum + tab.count, 0) === posts.length,
  '카테고리 탭 합 != 발행 post',
);
const tagCounts = new Map();
for (const entry of posts)
  for (const tag of entry.published.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
const chipList = blog.body.match(/<ul class="tag-chips"[\s\S]*?<\/ul>/)?.[0] ?? '';
const chips = [
  ...chipList.matchAll(
    /href="\/blog\/tag\/([^"]+)"[^>]*>\s*#([^<]+?)\s*<span class="tag-count"[^>]*>(\d+)<\/span>/g,
  ),
].map((match) => ({ tag: decodeURIComponent(match[1]), count: Number(match[3]) }));
check(chips.length === tagCounts.size, `태그 칩 ${chips.length} != ${tagCounts.size}`);
for (const chip of chips)
  check(
    tagCounts.get(chip.tag) === chip.count,
    `칩 ${chip.tag} ${chip.count} != ${tagCounts.get(chip.tag)}`,
  );

// 3. 카테고리·태그
for (const category of CATEGORIES) {
  const { res, body } = await get(`/blog/category/${category.key}`);
  const expected = catCounts.get(category.key) ?? 0;
  if (expected > 0) {
    check(
      res.status === 200 && rowsOf(body) === expected,
      `/blog/category/${category.key} ${res.status} 행 ${rowsOf(body)} != ${expected}`,
    );
    check(islandsOf(body) === 0, `/blog/category/${category.key} astro-island`);
  } else {
    check(res.status === 404, `/blog/category/${category.key}(글 없음) ${res.status}`);
  }
  for (const synonym of category.synonymTags) {
    const redirect = await get(encodeURI(`/blog/tag/${synonym}`));
    check(
      redirect.res.status === 301 &&
        redirect.res.headers.get('location') === `/blog/category/${category.key}`,
      `/blog/tag/${synonym} ${redirect.res.status} → ${redirect.res.headers.get('location')}`,
    );
  }
}
for (const [tag, count] of tagCounts) {
  const { res, body } = await get(`/blog/tag/${encodeURIComponent(tag)}`);
  check(
    res.status === 200 && rowsOf(body) === count,
    `/blog/tag/${tag} ${res.status} 행 ${rowsOf(body)} != ${count}`,
  );
}

// 4. 노트
const notesPage = await get('/notes');
const noteArticles = (notesPage.body.match(/<article class="note-item"/g) ?? []).length;
check(
  notesPage.res.status === 200 && noteArticles === notes.length,
  `/notes ${notesPage.res.status} 노트 ${noteArticles} != ${notes.length}`,
);
check(islandsOf(notesPage.body) === 0, '/notes astro-island');
for (const note of notes) {
  const urlPath = encodeURI(`/notes/${note.published.slug}`);
  const page = await get(urlPath);
  check(page.res.status === 200, `${urlPath} ${page.res.status}`);
  check(hasTag(page.res, `post-${note.id}`), `${urlPath} 캐시 태그`);
  check(
    ogImageOf(page.body).endsWith(`/og/${note.id}.png`),
    `${urlPath} og:image ${ogImageOf(page.body)}`,
  );
  const viaBlog = await get(encodeURI(`/blog/${note.published.slug}`));
  check(
    viaBlog.res.status === 301 && viaBlog.res.headers.get('location') === urlPath,
    `/blog/<노트> ${viaBlog.res.status} → ${viaBlog.res.headers.get('location')}`,
  );
}
const home = await get('/');
check(home.res.status === 200 && islandsOf(home.body) === 0, `/ ${home.res.status}`);
check(home.body.includes('id="home-notes-title"') === notes.length > 0, '홈 최신 노트 구역');

// 5. 연재 순서는 2단계 점검이 본다(끝에서 돌린다). 여기서는 목록·상세가 아일랜드 없이 뜨는지만 본다
for (const urlPath of ['/series', '/series/pintos']) {
  const page = await get(urlPath);
  check(
    page.res.status === 200 && islandsOf(page.body) === 0,
    `${urlPath} ${page.res.status} 아일랜드 ${islandsOf(page.body)}`,
  );
}

// 6. 프로젝트 (D1): 목록 카드 수·순서, Part마다 200·제목·이미지 주소·Part 탭 수, /projects/<key> 302, /blog/<slug> 301
const projectsPage = await get('/projects');
check(
  projectsPage.res.status === 200 && islandsOf(projectsPage.body) === 0,
  `/projects ${projectsPage.res.status}`,
);
check(hasTag(projectsPage.res, 'posts'), '/projects 캐시 태그');
const cardHrefs = [
  ...projectsPage.body.matchAll(/<h2 class="project-card-title"[^>]*>\s*<a href="([^"]+)"/g),
].map((match) => match[1]);
check(
  JSON.stringify(cardHrefs) ===
    JSON.stringify(
      projects.map((project) =>
        encodeURI(`/projects/${project.key}/${project.posts[0].published.slug}`),
      ),
    ),
  `/projects 카드 ${cardHrefs.length}개·순서가 다르다 (${cardHrefs.join(', ')})`,
);
const normalizeText = (html) =>
  html
    .replace(/<a class="heading-anchor"[\s\S]*?<\/a>/g, '')
    .replace(/<div class="code-head">[\s\S]*?<\/div>/g, '')
    // 코드 하이라이트 토큰(span) 경계는 글자 사이다. 공백으로 바꾸지 않는다(옛 Shiki와 새 Shiki의 토큰 나눔이 다르다)
    .replace(/<\/?span[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x26;|&amp;/g, '&')
    .replace(/&lt;|&#x3C;/g, '<')
    .replace(/&gt;|&#x3E;/g, '>')
    .replace(/&quot;|&#x22;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
for (const project of projects) {
  const first = await get(`/projects/${project.key}`);
  check(
    first.res.status === 302 &&
      first.res.headers.get('location') ===
        encodeURI(`/projects/${project.key}/${project.posts[0].published.slug}`),
    `/projects/${project.key} ${first.res.status} → ${first.res.headers.get('location')}`,
  );
  for (const entry of project.posts) {
    const slug = entry.published.slug;
    const urlPath = encodeURI(`/projects/${project.key}/${slug}`);
    const { res, body } = await get(urlPath);
    check(res.status === 200, `${urlPath} ${res.status}`);
    checkArticle(urlPath, body, entry.published.markdown);
    const h1 = body.match(/<h1 id="post-title"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
    check(normalizeText(h1) === entry.published.title, `${urlPath} 제목 ${normalizeText(h1)}`);
    check(hasTag(res, `post-${entry.id}`), `${urlPath} 캐시 태그`);
    check(ogImageOf(body).endsWith(`/og/${entry.id}.png`), `${urlPath} og:image`);
    const bodyHtml =
      body.match(/id="post-body"[^>]*>([\s\S]*?)<footer class="post-footer"/)?.[1] ?? '';
    // 본문을 못 찾으면 아래 검사가 빈 값으로 통과한다. 먼저 막는다(PR-C 리뷰 중요 3)
    check(bodyHtml.trim().length > 0, `${urlPath} 본문을 찾지 못했다`);
    const images = [...bodyHtml.matchAll(/<img [^>]*src="([^"]+)"/g)].map((match) => match[1]);
    check(
      images.length === countImages(entry.published.markdown),
      `${urlPath} 이미지 ${images.length} != 본문 ${countImages(entry.published.markdown)}`,
    );
    check(
      !/\.\.\/assets\/img\/projects|\/_astro\//.test(bodyHtml),
      `${urlPath} 옛 이미지 경로가 남았다`,
    );
    check(
      images.every((src) => src.includes('/o/assets%2F')),
      `${urlPath} 이미지가 assets/가 아니다`,
    );
    const tabsCount = (body.match(/class="part-tab"/g) ?? []).length;
    check(
      tabsCount === (project.posts.length > 1 ? project.posts.length : 0),
      `${urlPath} Part 탭 ${tabsCount} != ${project.posts.length}`,
    );
    const viaBlog = await get(encodeURI(`/blog/${slug}`));
    check(
      viaBlog.res.status === 301 && viaBlog.res.headers.get('location') === urlPath,
      `/blog/${slug} ${viaBlog.res.status} → ${viaBlog.res.headers.get('location')}`,
    );
    stats.projectParts += 1;
    // 옛 정적 페이지와 본문 글자 비교 (이전 때 한 번)
    if (baselineDir) {
      const file = path.join(baselineDir, `${project.key}--${slug}.html`);
      if (!existsSync(file)) {
        check(false, `${urlPath} 옛 페이지 파일이 없다 ${file}`);
      } else {
        const old =
          readFileSync(file, 'utf8').match(
            /<section class="prose"[^>]*>([\s\S]*?)<\/section>\s*<section class="mt-14/,
          )?.[1] ?? '';
        check(old.trim().length > 0, `${urlPath} 옛 페이지 본문을 찾지 못했다`);
        const a = normalizeText(old);
        const b = normalizeText(bodyHtml);
        let at = 0;
        while (at < a.length && a[at] === b[at]) at += 1;
        check(
          a === b,
          `${urlPath} 본문 글자가 옛 페이지와 다르다 (${at}번째 글자부터: 옛 "${a.slice(at, at + 40)}" / 새 "${b.slice(at, at + 40)}")`,
        );
        stats.baselineCompared += 1;
      }
    }
  }
  const missingPart = await get(`/projects/${project.key}/no-such-part`);
  check(
    missingPart.res.status === 404,
    `/projects/${project.key}/no-such-part ${missingPart.res.status}`,
  );
}
// 발행 프로젝트 글은 모두 위에서 열려야 한다. 프로젝트 정보(seriesMeta.project)가 없거나 깨진 프로젝트의 글은
// 404가 되고 위 반복에서 빠진다. 그 경우를 거짓 통과로 넘기지 않는다(PR-C 리뷰 중요 3)
check(
  stats.projectParts === projectPosts.length,
  `열어 본 프로젝트 글 ${stats.projectParts} != 발행 프로젝트 글 ${projectPosts.length}`,
);
for (const entry of projectPosts.filter((item) => !projectMeta.has(item.published.series.key))) {
  check(
    false,
    `프로젝트 정보가 없는 발행 프로젝트 글: ${entry.id} (${entry.published.series.key})`,
  );
}

// 7. OG 이미지 (D13): 글 3·노트 1·프로젝트 글 1 + 기본
const ogTargets = [...posts.slice(0, 3), ...notes.slice(0, 1), ...projectPosts.slice(0, 1)];
for (const entry of ogTargets) {
  const res = await fetch(`${base}/og/${entry.id}.png`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const isPng = bytes
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  check(
    res.status === 200 && res.headers.get('content-type') === 'image/png',
    `/og/${entry.id}.png ${res.status} ${res.headers.get('content-type')}`,
  );
  check(
    isPng && bytes.readUInt32BE(16) === 1200 && bytes.readUInt32BE(20) === 630,
    `/og/${entry.id}.png 크기`,
  );
  check(hasTag(res, `post-${entry.id}`) && hasTag(res, 'posts'), `/og/${entry.id}.png 캐시 태그`);
  check(
    /s-maxage=86400/.test(res.headers.get('cache-control') ?? ''),
    `/og/${entry.id}.png Cache-Control`,
  );
  check(!res.headers.get('set-cookie'), `/og/${entry.id}.png Set-Cookie`);
  stats.ogImages += 1;
}
const defaultOg = await fetch(`${base}/og/default.png`);
const defaultBytes = Buffer.from(await defaultOg.arrayBuffer());
check(
  defaultOg.status === 200 &&
    defaultBytes.readUInt32BE(16) === 1200 &&
    defaultBytes.readUInt32BE(20) === 630,
  `/og/default.png ${defaultOg.status}`,
);
const missingOg = await fetch(`${base}/og/no-such-entry.png`);
check(
  missingOg.status === 404 && !/s-maxage/.test(missingOg.headers.get('cache-control') ?? ''),
  `/og/no-such-entry.png ${missingOg.status}`,
);
for (const page of [home, blog, notesPage, projectsPage]) {
  check(
    ogImageOf(page.body).endsWith('/og/default.png'),
    `목록 페이지 og:image ${ogImageOf(page.body)}`,
  );
}

// 8. RSS·사이트맵
const rss = await get('/rss.xml');
check((rss.body.match(/<item>/g) ?? []).length === posts.length, '/rss.xml item 수');
const notesRss = await get('/notes/rss.xml');
check(
  notesRss.res.status === 200 && (notesRss.body.match(/<item>/g) ?? []).length === notes.length,
  '/notes/rss.xml item 수',
);
const sitemap = await get('/sitemap-posts.xml');
for (const category of nonEmpty)
  check(
    sitemap.body.includes(`/blog/category/${category.key}<`),
    `사이트맵 카테고리 ${category.key}`,
  );
for (const category of CATEGORIES.filter((item) => !nonEmpty.includes(item))) {
  check(
    !sitemap.body.includes(`/blog/category/${category.key}<`),
    `사이트맵에 글 없는 카테고리 ${category.key}`,
  );
}
for (const note of notes)
  check(
    sitemap.body.includes(encodeURI(`/notes/${note.published.slug}`)),
    `사이트맵 노트 ${note.published.slug}`,
  );
for (const tag of tagCounts.keys())
  check(sitemap.body.includes(`/blog/tag/${encodeURIComponent(tag)}<`), `사이트맵 태그 ${tag}`);
for (const project of projects) {
  for (const entry of project.posts) {
    check(
      sitemap.body.includes(`${encodeURI(`/projects/${project.key}/${entry.published.slug}`)}<`),
      `사이트맵 프로젝트 글 ${entry.published.slug}`,
    );
  }
}
// 목록 페이지는 sitemap-0.xml에만 (중복 없음)
for (const listPath of ['/', '/blog', '/notes', '/series', '/projects']) {
  check(
    !sitemap.body.includes(`<loc>${new URL(listPath, 'https://www.cruzlab.dev').href}</loc>`),
    `sitemap-posts에 ${listPath} 중복`,
  );
}
if (staticDir) {
  const file = path.join(staticDir, 'sitemap-0.xml');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  check(/\/about\/?</.test(text), 'sitemap-0.xml에 /about');
  check(/\/projects\/?</.test(text), 'sitemap-0.xml에 /projects');
  check(
    !/\/projects\/[^<]+\/[^<]+</.test(text),
    'sitemap-0.xml에 옛 prerender 프로젝트 글 주소가 남았다',
  );
}

// 9. /about 200, 404 페이지·SSR 404 6종: 상태 404, 안내 화면, CDN 저장 안 함, noindex
const about = await get('/about');
check(about.res.status === 200 && islandsOf(about.body) === 0, `/about ${about.res.status}`);
check(
  ogImageOf(about.body).endsWith('/og/default.png'),
  `/about og:image ${ogImageOf(about.body)}`,
);
const missingPage = await get('/no-such-page');
check(
  missingPage.res.status === 404 && missingPage.body.includes('id="not-found-title"'),
  `/no-such-page ${missingPage.res.status}`,
);
for (const urlPath of [
  '/blog/category/no-such',
  '/blog/tag/no-such-tag',
  '/series/no-such',
  '/notes/no-such',
  '/projects/no-such',
  `/projects/${projects[0]?.key ?? 'x'}/no-such-part`,
]) {
  const page = await get(urlPath);
  const cacheControl = page.res.headers.get('cache-control') ?? '';
  check(page.res.status === 404, `${urlPath} 상태 ${page.res.status}`);
  check(page.body.includes('id="not-found-title"'), `${urlPath} 안내 화면 없음`);
  check(
    !/s-maxage/.test(cacheControl) && !page.res.headers.get('vercel-cache-tag'),
    `${urlPath} 캐시 헤더 ${cacheControl}`,
  );
  check(page.body.includes('<meta name="robots" content="noindex">'), `${urlPath} noindex 없음`);
}

const summary = {
  base,
  posts: posts.length,
  notes: notes.length,
  projects: projects.length,
  projectParts: projectPosts.length,
  checks,
  fail: failures.length,
  blogBytes,
  ...stats,
};
console.log(JSON.stringify(summary));
for (const message of failures) console.log('  ✗', message);

// 2단계 공개 점검 (Plan 8.2 머리말: 그대로 포함한다)
let stage2Failed = false;
if (args['skip-stage2'] !== true) {
  console.log('\n— 2단계 공개 점검 (scripts/smoke/stage2-public.mjs) —');
  try {
    execFileSync(process.execPath, [path.join(SCRIPT_DIR, 'stage2-public.mjs'), '--base', base], {
      stdio: 'inherit',
      env: process.env,
    });
  } catch {
    stage2Failed = true;
  }
}
process.exitCode = failures.length > 0 || stage2Failed ? 1 : 0;
