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
// - 5단계 PR-D(D20, Plan 8.1): 모든 공개 페이지의 관리자 표시 + 독자 흐름 수집 스크립트(인라인 모듈 1개, 합 2 KB 안),
//   글 상세의 data-entry-id·#post-body, 404 화면의 data-not-found, /about 익명 통계 안내 한 줄(10).
//   개발 서버는 스크립트를 인라인하지 않으므로 크기 대신 수집 모듈이 실렸는지만 본다(크기는 빌드 결과로 잰다).
// - 5단계 PR-E(T13, 리뷰 B10): 글·노트·프로젝트 글 상세와 /og/<id>.png의 Server-Timing 헤더 항목.

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
// D19 매거진형: 대표 카드(최신 글) 수, 연도 묶음(section) 수, 대표 카드의 글 주소
const featuredOf = (html) => (html.match(/<li[^>]*\sdata-featured/g) ?? []).length;
const yearGroupsOf = (html) => (html.match(/<section[^>]*\sdata-year-group/g) ?? []).length;
const featuredHrefOf = (html) =>
  html.match(/<li[^>]*\sdata-featured[\s\S]*?<a href="([^"]+)"/)?.[1] ?? '';
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
// 10. 독자 흐름 공개 스크립트(5단계 D20). 관리자 표시(인라인, cruz-admin-hint)와 수집(인라인 모듈, /api/track)이 한 개씩
const TRACKER_BUDGET_BYTES = 2048;
// 태그의 속성만 본다(수집 스크립트 안의 선택자 글자 "[data-not-found]"·"[data-entry-id]"는 빼고)
const hasNotFoundMark = (html) => /<section\b[^<>]*\sdata-not-found[\s>]/.test(html);
let trackerBytes = 0;
function checkTrackerScripts(label, html) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((match) => ({ attrs: match[1], code: match[2] }));
  const hint = scripts.filter((script) => script.code.includes('cruz-admin-hint'));
  check(hint.length === 1, `${label} 관리자 표시 스크립트 ${hint.length}개`);
  if (html.includes('/@vite/client')) {
    // 개발 서버: 수집 모듈은 BaseLayout의 스크립트 주소로 실린다
    check(/<script type="module" src="[^"]*BaseLayout\.astro\?astro&type=script/.test(html), `${label} 수집 모듈(개발 서버)이 없다`);
    return;
  }
  const tracker = scripts.filter((script) => script.code.includes('/api/track'));
  check(tracker.length === 1 && /type="module"/.test(tracker[0]?.attrs ?? ''), `${label} 수집 스크립트(인라인 모듈) ${tracker.length}개`);
  if (hint.length !== 1 || tracker.length !== 1) return;
  // 모듈 1개: 다른 청크를 가져오지 않는다
  check(!/\bimport\b/.test(tracker[0].code), `${label} 수집 스크립트가 다른 모듈을 가져온다`);
  const bytes = Buffer.byteLength(hint[0].code) + Buffer.byteLength(tracker[0].code);
  trackerBytes = Math.max(trackerBytes, bytes);
  check(bytes <= TRACKER_BUDGET_BYTES, `${label} 관리자 표시 + 수집 스크립트 ${bytes}바이트 > ${TRACKER_BUDGET_BYTES}`);
}

// 글 상세 공통: 목차 = h2·h3, 코드 틀 = 펜스, KaTeX 링크는 수식 글만, 아일랜드 0, cdnjs 0
// - 5단계 D20: 수집 스크립트, <article data-entry-id="글 ID">, 본문 #post-body
function checkArticle(label, html, markdown, entryId) {
  checkTrackerScripts(label, html);
  check(html.includes(`data-entry-id="${entryId}"`), `${label} data-entry-id`);
  check(html.includes('id="post-body"'), `${label} #post-body`);
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

// Server-Timing 헤더 (5단계 T13): 필요한 항목이 있고 total·inst로 끝난다
// - 글 상세의 render 안 항목(assets·hl·md)은 메모리 결과를 쓴 요청에 없으므로 보지 않는다.
const SERVER_TIMING_TAIL = /, total;dur=[\d.]+, inst;desc="req \d+ age [\d.]+s"$/;
function checkServerTiming(label, res, names) {
  const header = res.headers.get('server-timing') ?? '';
  const present = new Set(header.split(', ').map((item) => item.split(';')[0]));
  const missing = names.filter((name) => !present.has(name));
  check(SERVER_TIMING_TAIL.test(header) && missing.length === 0, `${label} Server-Timing ${missing.join(',')} ${header}`);
}

// 1. 글마다
for (const entry of posts) {
  const urlPath = encodeURI(`/blog/${entry.published.slug}`);
  const { res, body } = await get(urlPath);
  check(res.status === 200, `${urlPath} 상태 ${res.status}`);
  checkArticle(urlPath, body, entry.published.markdown, entry.id);
  check(hasTag(res, `post-${entry.id}`), `${urlPath} 캐시 태그`);
  check(ogImageOf(body).endsWith(`/og/${entry.id}.png`), `${urlPath} og:image ${ogImageOf(body)}`);
  checkServerTiming(urlPath, res, ['db', 'render', 'adj']);
}

// 2. /blog
const blog = await get('/blog');
const blogBytes = Buffer.byteLength(blog.body);
check(blog.res.status === 200, `/blog ${blog.res.status}`);
check(blogBytes <= 100 * 1024, `/blog HTML ${blogBytes}바이트`);
check(rowsOf(blog.body) === posts.length, `/blog 행 ${rowsOf(blog.body)} != ${posts.length}`);
// D19: 대표 카드는 1개이고 최신 글이다. 나머지 글은 연도 묶음에 있다
check(featuredOf(blog.body) === 1, `/blog 대표 카드 ${featuredOf(blog.body)}개`);
check(
  featuredHrefOf(blog.body) === encodeURI(`/blog/${posts[0].published.slug}`),
  `/blog 대표 카드 주소 ${featuredHrefOf(blog.body)}`,
);
check(yearGroupsOf(blog.body) >= 1, `/blog 연도 묶음 ${yearGroupsOf(blog.body)}개`);
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
    check(featuredOf(body) === 1, `/blog/category/${category.key} 대표 카드 ${featuredOf(body)}개`);
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
  // D19: 대표 카드 1개. 글이 1편이면 연도 묶음이 없다(대표만)
  check(featuredOf(body) === 1, `/blog/tag/${tag} 대표 카드 ${featuredOf(body)}개`);
  if (count === 1)
    check(yearGroupsOf(body) === 0, `/blog/tag/${tag} 연도 묶음 ${yearGroupsOf(body)}개(글 1편)`);
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
  checkTrackerScripts(urlPath, page.body);
  check(page.body.includes(`data-entry-id="${note.id}"`), `${urlPath} data-entry-id`);
  checkServerTiming(urlPath, page.res, ['db', 'render', 'adj']);
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
    checkArticle(urlPath, body, entry.published.markdown, entry.id);
    const h1 = body.match(/<h1 id="post-title"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
    check(normalizeText(h1) === entry.published.title, `${urlPath} 제목 ${normalizeText(h1)}`);
    check(hasTag(res, `post-${entry.id}`), `${urlPath} 캐시 태그`);
    check(ogImageOf(body).endsWith(`/og/${entry.id}.png`), `${urlPath} og:image`);
    checkServerTiming(urlPath, res, ['db', 'render', 'project']);
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
  checkServerTiming(`/og/${entry.id}.png`, res, ['db', 'imp-satori', 'imp-resvg', 'font', 'satori', 'resvg']);
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
checkServerTiming('/og/no-such-entry.png', missingOg, ['db']);
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
  // 5단계 D20: SSR 404도 수집 스크립트가 404 이벤트를 보낸다
  checkTrackerScripts(urlPath, page.body);
  check(hasNotFoundMark(page.body), `${urlPath} data-not-found`);
}

// 10. 독자 흐름(5단계 D20): 목록·소개·404 화면의 스크립트, 404 표시, /about 안내 한 줄. 글이 아닌 페이지에는 data-entry-id가 없다
for (const [label, page] of [
  ['/', home],
  ['/blog', blog],
  ['/notes', notesPage],
  ['/about', about],
  ['/no-such-page', missingPage],
]) {
  checkTrackerScripts(label, page.body);
  check(!page.body.includes('data-entry-id='), `${label} 글이 아닌 페이지에 data-entry-id`);
}
check(hasNotFoundMark(missingPage.body), '/no-such-page data-not-found');
check(about.body.includes('이 사이트는 쿠키·개인정보 없이 익명 방문 수를 셉니다.'), '/about 익명 통계 안내 한 줄');
check(!hasNotFoundMark(blog.body), '/blog에 data-not-found');

const summary = {
  base,
  posts: posts.length,
  notes: notes.length,
  projects: projects.length,
  projectParts: projectPosts.length,
  checks,
  fail: failures.length,
  blogBytes,
  trackerBytes,
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
