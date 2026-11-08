// 재건 2단계 공개 페이지 점검 (Plan 10.4). 읽기만 한다
//
// 실행: node --env-file=.env scripts/smoke/stage2-public.mjs [--base http://localhost:4321]
//
// 확인하는 것
// - 발행 글 전체의 /blog/<slug>가 200이고 <h1> 제목이 entries의 제목과 같다. 초안 글의 slug는 404다
// - /blog 목록의 카드 수 = 발행 post 수
// - 7.4 리다이렉트가 301이고 목적지가 200이다
// - /series/<key>의 글 수와 순서
// - RSS·사이트맵이 XML이고 사이트맵에 옛 연재 주소가 없다
// - 공개 응답에 Set-Cookie가 없고 Vercel-Cache-Tag가 있다

import process from 'node:process';
import { initAdmin, parseArgs } from '../migrate/lib/admin.mjs';

const args = parseArgs();
const BASE = (typeof args.base === 'string' ? args.base : 'http://localhost:4321').replace(/\/$/, '');

const failures = [];
let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function decodeEntities(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .trim();
}

async function get(path, redirect = 'manual') {
  const response = await fetch(`${BASE}${path}`, { redirect });
  const body = redirect === 'manual' && response.status >= 300 && response.status < 400 ? '' : await response.text();
  return { response, body };
}

// 공개 응답 공통 검사
function checkPublicHeaders(path, response) {
  check(!response.headers.get('set-cookie'), `${path}: Set-Cookie가 있다`);
  check(Boolean(response.headers.get('vercel-cache-tag')), `${path}: Vercel-Cache-Tag가 없다`);
}

async function main() {
  const { db } = initAdmin();
  const snapshot = await db.collection('entries').get();
  const entries = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const publishedPosts = entries.filter((entry) => entry.status === 'published' && entry.kind === 'post');
  const notPublic = entries.filter((entry) => entry.status !== 'published' || entry.kind !== 'post');
  console.log(`entries ${entries.length}개 (공개 post ${publishedPosts.length}, 그 밖 ${notPublic.length}) / 기준 ${BASE}`);

  // 1. 글 상세
  for (const entry of publishedPosts) {
    const path = encodeURI(`/blog/${entry.published.slug}`);
    const { response, body } = await get(path);
    check(response.status === 200, `${path}: ${response.status}`);
    const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    check(h1 && decodeEntities(h1[1]) === entry.published.title, `${path}: 제목이 다르다 (${h1 ? decodeEntities(h1[1]) : '없음'})`);
    checkPublicHeaders(path, response);
    check((response.headers.get('vercel-cache-tag') ?? '').includes(`post-${entry.id}`), `${path}: post-${entry.id} 태그가 없다`);
  }
  for (const entry of notPublic) {
    const slug = entry.draft?.slug;
    if (!slug || publishedPosts.some((post) => post.published.slug === slug)) continue;
    const path = encodeURI(`/blog/${slug}`);
    const { response } = await get(path);
    check(response.status === 404, `${path}(공개 아님): ${response.status}`);
  }

  // 2. 목록
  const blog = await get('/blog');
  check(blog.response.status === 200, `/blog: ${blog.response.status}`);
  checkPublicHeaders('/blog', blog.response);
  // 목록은 React 섬의 props(JSON)로 글을 넘긴다. 글 ID 수를 센다
  const listedIds = publishedPosts.filter((post) => blog.body.includes(post.id));
  const slugMentions = (blog.body.match(/&quot;slug&quot;:\[0,&quot;/g) ?? []).length;
  check(listedIds.length === publishedPosts.length, `/blog: 목록의 글 ${listedIds.length}편, 기대 ${publishedPosts.length}`);
  check(slugMentions === publishedPosts.length, `/blog: 목록 props의 slug ${slugMentions}개, 기대 ${publishedPosts.length}`);

  // 3. 리다이렉트 (Plan 7.4)
  const redirects = [
    ['/series/wesbos', '/series/wesbos30'],
    ['/series/크래프톤-정글', '/blog/tag/크래프톤-정글'],
    ['/blog/tag/크래프톤 정글', '/blog/tag/크래프톤-정글'],
    ['/blog/tag/크래프톤정글', '/blog/tag/크래프톤-정글'],
    ['/blog/tag/proxy lab', '/blog/tag/proxy-lab'],
    ['/blog/tag/CSAPP', '/blog/tag/csapp'],
    ['/blog/tag/최소 신장 트리', '/blog/tag/최소-신장-트리'],
    ['/blog/tag/LLM', '/blog/tag/llm'],
  ];
  for (const [from, to] of redirects) {
    const { response } = await get(encodeURI(from));
    const location = response.headers.get('location') ?? '';
    check(response.status === 301, `${from}: ${response.status}`);
    check(decodeURIComponent(location) === to, `${from}: Location ${decodeURIComponent(location)}, 기대 ${to}`);
    const target = await get(encodeURI(to));
    check(target.response.status === 200, `${to}: ${target.response.status}`);
  }
  // 카테고리와 같은 뜻의 태그는 그 카테고리 글을 보인다
  for (const [tag, category] of [['javascript', 'javascript'], ['운영체제', 'os']]) {
    const { response, body } = await get(encodeURI(`/blog/tag/${tag}`));
    const expected = publishedPosts.filter((post) => post.published.category === category).length;
    const match = body.match(/(\d+)개의 포스트/);
    check(response.status === 200 && match && Number(match[1]) === expected, `/blog/tag/${tag}: ${match?.[1]}편, 기대 ${expected}`);
  }

  // 4. 연재
  const seriesKeys = new Map();
  for (const post of publishedPosts) {
    if (!post.published.series) continue;
    const list = seriesKeys.get(post.published.series.key) ?? [];
    list.push(post);
    seriesKeys.set(post.published.series.key, list);
  }
  const seriesIndex = await get('/series');
  check(seriesIndex.response.status === 200, `/series: ${seriesIndex.response.status}`);
  checkPublicHeaders('/series', seriesIndex.response);
  for (const [key, members] of seriesKeys) {
    const path = `/series/${key}`;
    const { response, body } = await get(path);
    check(response.status === 200, `${path}: ${response.status}`);
    const expectedOrder = members
      .sort((a, b) => a.published.series.order - b.published.series.order)
      .map((post) => `/blog/${post.published.slug}`);
    // 화면은 한글 slug를 인코딩하지 않고 넣기도 한다. 디코딩해서 비교한다
    const actualOrder = [...body.matchAll(/href="(\/blog\/[^"]+)"/g)]
      .map((match) => decodeURI(match[1]))
      .filter((href) => expectedOrder.includes(href));
    const deduped = actualOrder.filter((href, index) => actualOrder.indexOf(href) === index);
    check(
      JSON.stringify(deduped) === JSON.stringify(expectedOrder),
      `${path}: 순서가 다르다 (${deduped.length}편, 기대 ${expectedOrder.length}편)`,
    );
    console.log(`- ${path}: ${deduped.length}편`);
  }

  // 5. RSS, 사이트맵
  const rss = await get('/rss.xml');
  check(rss.response.status === 200 && rss.body.startsWith('<?xml'), '/rss.xml: XML이 아니다');
  check((rss.body.match(/<item>/g) ?? []).length === publishedPosts.length, '/rss.xml: item 수가 다르다');
  checkPublicHeaders('/rss.xml', rss.response);
  const sitemap = await get('/sitemap-posts.xml');
  check(sitemap.response.status === 200 && sitemap.body.startsWith('<?xml'), '/sitemap-posts.xml: XML이 아니다');
  check(!/\/series\/(wesbos|%ED%81%AC)/.test(sitemap.body.replace(/\/series\/wesbos30/g, '')), '사이트맵에 옛 연재 주소가 있다');
  checkPublicHeaders('/sitemap-posts.xml', sitemap.response);

  // 6. 홈
  const home = await get('/');
  check(home.response.status === 200, `/: ${home.response.status}`);
  checkPublicHeaders('/', home.response);

  console.log(`\n점검 ${checks}건, 실패 ${failures.length}건`);
  for (const message of failures) console.log(`  ✗ ${message}`);
  process.exitCode = failures.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
