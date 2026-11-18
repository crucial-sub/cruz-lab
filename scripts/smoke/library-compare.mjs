// 서가 화면 대조 (서가 1단계 T10, Plan 8.2, 기준 C2: 자산이 있는 HTML이 원본과 같게 보인다)
//
// 실행 (저장소 루트에서):
//   pnpm smoke:library-compare [--base http://localhost:4341] [--raw <문서 출처>] [--out <폴더>]
//                              [--a <html 파일>] [--b <폴더>] [--max-height 20000]
//
// 하는 일 (번호 순서):
//   1. 대조 문서 셋을 홈 폴더 안 임시 폴더로 복사한다. 영상 문서는 ffmpeg로 10초 시험 영상을 만든다.
//      기본 셋(사용자 결정 2026-11-18): 꼴 a = ~/Desktop/docs/2026-11-06-cruz-lab-audit-1-current-state.html + 그림 폴더,
//      꼴 b = ~/Desktop/docs/beer-pour-mood/ (폴더째), 영상 = 만든 시험 영상 + 짧은 html.
//   2. 관리자 세션으로 세 문서를 서가에 올린다(프로젝트 library-smoke).
//   3. 원본은 로컬 http 서버로, 같은 문서는 서가 문서 주소(/admin/library/d/{id} → 문서 출처)로 연다.
//      헤드리스 Chrome으로 375px·1280px 전체 쪽을 캡처하고 측정한다(쪽 높이, 그림, 영상 상태).
//      움직임 줄이기와 밝은 화면을 흉내 낸다. 캡처 전에 끝까지 내려 lazy 그림을 부른다. 영상은 2초로 옮긴다.
//   4. 두 캡처를 픽셀로 견주고 차이 그림을 만든다. 대조 페이지(index.html)와 manifest.json을 --out에 쓴다
//      (기본 ~/Desktop/docs/library-compare/{시각}-{대상}/, 전역 규칙 4).
//   5. 끝에(실패해도) 시험 문서를 내리고 흔적이 0인지 본다. 임시 폴더를 지운다.
// - 판정: 같은 폭, 높이 차 2px 이하, 그림이 모두 불림(깨진 그림 0), 픽셀 차이 1% 이하, 영상은 재생 준비·길이·되감기 범위가 같다.
// - 미리보기는 .env의 VERCEL_AUTOMATION_BYPASS_SECRET이 있어야 닿는다(library-lib.mjs). 비밀값은 출력하지 않는다.

import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { planPush } from '../../src/library/client/push.ts';
import { parseArgs } from '../migrate/lib/admin.mjs';
import {
  ADMIN_COOKIE,
  assertReachable,
  createAdminSession,
  docRemnants,
  launchChrome,
  makeTargetFetch,
  removeSmokeDoc,
  resolveTargets,
  startStaticServer,
  uploadSmokeDoc,
} from './library-lib.mjs';

const args = parseArgs();
const targets = resolveTargets(args);
const tfetch = makeTargetFetch(targets);
const HOME = homedir();
const A_HTML = typeof args.a === 'string' ? path.resolve(args.a) : path.join(HOME, 'Desktop/docs/2026-11-06-cruz-lab-audit-1-current-state.html');
const B_DIR = typeof args.b === 'string' ? path.resolve(args.b) : path.join(HOME, 'Desktop/docs/beer-pour-mood');
const MAX_HEIGHT = Number(args['max-height'] ?? 20_000);
const WIDTHS = [375, 1280];
const PIXEL_THRESHOLD = 32; // 채널 차이가 이보다 크면 다른 픽셀
const MAX_DIFF_RATIO = 0.01;
const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(/[-: ]/g, '').slice(0, 12);
const runId = stamp.slice(2);
const targetLabel = new URL(targets.base).host.replace(/[^a-z0-9.-]/gi, '-');
const OUT = typeof args.out === 'string' ? path.resolve(args.out) : path.join(HOME, 'Desktop/docs/library-compare', `${stamp}-${targetLabel}`);


// ───────────── 1. 대조 문서 준비 ─────────────

// 홈 폴더 안 임시 폴더에 사본을 만든다. 돌려주는 것: 문서마다 { key, label, kind, target(올릴 경로), entry(원본을 여는 상대 경로) }
async function prepareSources(workDir) {
  const aDir = path.join(workDir, 'a');
  await mkdir(aDir, { recursive: true });
  await cp(A_HTML, path.join(aDir, path.basename(A_HTML)));
  // 문서가 가리키는 자산 폴더를 함께 복사한다(같은 폴더의 하위 폴더 전부. planPush가 그중 문서가 쓰는 것만 고른다)
  const aSource = path.dirname(A_HTML);
  const html = await readFile(A_HTML, 'utf8');
  const assetDirs = new Set([...html.matchAll(/(?:src|href)="([^"/:#?][^"/:#?]*)\//g)].map((match) => match[1]));
  for (const dir of assetDirs) await cp(path.join(aSource, dir), path.join(aDir, dir), { recursive: true }).catch(() => undefined);

  const bDir = path.join(workDir, 'b', path.basename(B_DIR));
  await cp(B_DIR, bDir, { recursive: true });

  const videoDir = path.join(workDir, 'video-doc');
  await mkdir(videoDir, { recursive: true });
  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=10:size=640x360:rate=30',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', path.join(videoDir, 'clip.mp4'),
  ]);
  await writeFile(
    path.join(videoDir, 'index.html'),
    `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>서가 화면 대조: 영상 문서</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0 auto; max-width: 720px; padding: 24px 16px 48px; line-height: 1.55; color: #121614; background: #f4f5f3; }
  video { display: block; width: 100%; height: auto; background: #000; border-radius: 8px; }
</style>
</head>
<body>
<h1>영상 문서</h1>
<p>ffmpeg로 만든 10초 시험 영상이다(testsrc2, 640×360, H.264). 서가 화면 대조(Plan 8.2)만 쓰고 바로 지운다.</p>
<video src="clip.mp4" controls preload="auto" muted playsinline width="640" height="360"></video>
</body>
</html>
`,
  );
  return [
    { key: 'a', label: '꼴 a: html + 옆 폴더 그림', kind: 'a', target: path.join(aDir, path.basename(A_HTML)), entry: `a/${path.basename(A_HTML)}`, source: A_HTML },
    { key: 'b', label: '꼴 b: 폴더째 문서', kind: 'b', target: bDir, entry: `b/${path.basename(B_DIR)}/index.html`, source: B_DIR },
    { key: 'video', label: '영상 문서', kind: 'video', target: videoDir, entry: 'video-doc/index.html', source: 'ffmpeg testsrc2 10초' },
  ];
}

// ───────────── 3. 캡처·측정 ─────────────

// 쪽을 준비한다: 글꼴, 끝까지 내려 lazy 그림 부르기, 그림 기다리기, 영상 2초로 옮기기, 맨 위로
const SETTLE = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await Promise.race([document.fonts.ready, wait(8000)]);
  const step = Math.max(200, Math.floor(innerHeight * 0.8));
  for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 80; y += step, i += 1) { scrollTo(0, y); await wait(120); }
  scrollTo(0, document.documentElement.scrollHeight);
  await wait(300);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && [...document.images].some((img) => !img.complete)) await wait(200);
  for (const video of document.querySelectorAll('video')) {
    if (video.readyState < 2) await Promise.race([new Promise((r) => video.addEventListener('loadeddata', r, { once: true })), wait(15000)]);
    video.pause();
    await Promise.race([new Promise((r) => { video.addEventListener('seeked', r, { once: true }); video.currentTime = 2; }), wait(10000)]);
  }
  scrollTo(0, 0);
  await wait(800);
  return true;
})()`;

const MEASURE = `(() => {
  const images = [...document.images];
  const video = document.querySelector('video');
  return {
    title: document.title,
    href: location.href,
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    docHeight: document.documentElement.scrollHeight,
    images: images.length,
    loaded: images.filter((img) => img.complete && img.naturalWidth > 0).length,
    broken: images.filter((img) => !(img.complete && img.naturalWidth > 0)).map((img) => img.getAttribute('src')),
    stylesheets: document.styleSheets.length,
    fonts: document.fonts.status,
    video: video ? {
      readyState: video.readyState,
      duration: Math.round(video.duration * 100) / 100,
      currentTime: Math.round(video.currentTime * 100) / 100,
      seekableEnd: video.seekable.length ? Math.round(video.seekable.end(video.seekable.length - 1) * 100) / 100 : 0,
      videoWidth: video.videoWidth,
      error: video.error ? video.error.code : null,
    } : null,
  };
})()`;

async function captureSide(page, url, width, file) {
  await page.setViewport(width, width < 768 ? 812 : 900);
  const nav = await page.navigate(url, 45_000);
  await page.evaluate(SETTLE);
  const measure = await page.evaluate(MEASURE);
  const shot = await page.screenshotFull(MAX_HEIGHT);
  await writeFile(path.join(OUT, file), shot.png);
  return { file, status: nav.status, loadedEvent: nav.loaded, ...measure, shotWidth: shot.width, shotHeight: shot.height, fullHeight: shot.fullHeight };
}

// 두 캡처를 픽셀로 견준다 (정적 서버 출처의 빈 쪽에서 계산한다. 같은 출처라 canvas가 더러워지지 않는다)
const DIFF_FN = `async (aUrl, bUrl, threshold) => {
  const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('그림을 못 읽음 ' + u)); i.src = u; });
  const [a, b] = await Promise.all([load(aUrl), load(bUrl)]);
  const w = Math.min(a.naturalWidth, b.naturalWidth), h = Math.min(a.naturalHeight, b.naturalHeight);
  const pixels = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
  const da = pixels(a), db = pixels(b);
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ox = out.getContext('2d'); const od = ox.createImageData(w, h);
  let diff = 0, firstY = -1, lastY = -1;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
    if (d > threshold) {
      diff += 1; od.data[i] = 220; od.data[i + 1] = 38; od.data[i + 2] = 30; od.data[i + 3] = 255;
      const y = Math.floor(i / 4 / w); if (firstY < 0) firstY = y; lastY = y;
    } else {
      const g = (da[i] + da[i + 1] + da[i + 2]) / 3; const v = Math.round(255 - (255 - g) * 0.22);
      od.data[i] = v; od.data[i + 1] = v; od.data[i + 2] = v; od.data[i + 3] = 255;
    }
  }
  ox.putImageData(od, 0, 0);
  return { width: w, height: h, diff, ratio: diff / (w * h), firstY, lastY, png: out.toDataURL('image/png') };
}`;

// 한 쌍의 판정
function judge(original, raw, pixel) {
  const reasons = [];
  if (original.shotWidth !== raw.shotWidth) reasons.push(`폭이 다르다 (${original.shotWidth} / ${raw.shotWidth})`);
  if (Math.abs(original.docHeight - raw.docHeight) > 2) reasons.push(`쪽 높이가 다르다 (${original.docHeight} / ${raw.docHeight})`);
  if (raw.scrollWidth > raw.innerWidth) reasons.push(`문서 출처에서 가로로 넘친다 (${raw.scrollWidth} > ${raw.innerWidth})`);
  if (original.images !== raw.images || original.loaded !== raw.loaded) reasons.push(`그림 수가 다르다 (${original.loaded}/${original.images} · ${raw.loaded}/${raw.images})`);
  if (raw.broken.length > 0) reasons.push(`문서 출처의 깨진 그림: ${raw.broken.join(', ')}`);
  if (original.video || raw.video) {
    const ov = original.video ?? {};
    const rv = raw.video ?? {};
    if (!(rv.readyState >= 2) || rv.error) reasons.push(`문서 출처 영상이 준비되지 않았다 (readyState ${rv.readyState}, 오류 ${rv.error})`);
    if (Math.abs((ov.duration ?? 0) - (rv.duration ?? 0)) > 0.1) reasons.push(`영상 길이가 다르다 (${ov.duration} / ${rv.duration})`);
    if (Math.abs((rv.seekableEnd ?? 0) - (rv.duration ?? 0)) > 0.2) reasons.push(`문서 출처 영상의 되감기 범위가 짧다 (${rv.seekableEnd} / ${rv.duration})`);
    if (Math.abs((ov.currentTime ?? 0) - (rv.currentTime ?? 0)) > 0.05) reasons.push(`영상 위치가 다르다 (${ov.currentTime} / ${rv.currentTime})`);
  }
  if (pixel.ratio > MAX_DIFF_RATIO) reasons.push(`픽셀 차이 ${(pixel.ratio * 100).toFixed(2)}% (기준 ${MAX_DIFF_RATIO * 100}%)`);
  return { pass: reasons.length === 0, reasons };
}

// ───────────── 4. 대조 페이지 ─────────────

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (ratio) => `${(ratio * 100).toFixed(ratio < 0.0001 && ratio > 0 ? 4 : 2)}%`;
const num = (value) => new Intl.NumberFormat('ko-KR').format(value);

function renderPage(manifest) {
  const pairs = manifest.docs.flatMap((doc) => doc.widths.map((item) => ({ doc, ...item })));
  const passed = pairs.filter((pair) => pair.verdict.pass).length;
  const maxRatio = Math.max(0, ...pairs.map((pair) => pair.pixel.ratio));
  const waffle = pairs
    .map((pair) => `<span class="sq ${pair.verdict.pass ? 'ok' : 'risk'}" title="${escapeHtml(`${pair.doc.label} ${pair.width}px`)}"></span>`)
    .join('');
  const barWidth = Math.min(100, (maxRatio / MAX_DIFF_RATIO) * 100);
  let fig = 0;
  const rows = pairs
    .map((pair) => {
      const { original: o, raw: r } = pair;
      const video = r.video ? `${r.video.readyState} · ${r.video.duration}s · 되감기 ${r.video.seekableEnd}s` : '—';
      return `<tr>
  <td>${escapeHtml(pair.doc.label)}</td>
  <td class="n">${pair.width}<small>px</small></td>
  <td class="n">${num(o.docHeight)} / ${num(r.docHeight)}<small>px</small></td>
  <td class="n">${o.loaded}/${o.images} · ${r.loaded}/${r.images}</td>
  <td class="n">${r.broken.length}</td>
  <td>${escapeHtml(video)}</td>
  <td class="n">${pct(pair.pixel.ratio)}</td>
  <td>${pair.verdict.pass ? '<span class="chip ok">● 같다</span>' : '<span class="chip risk">■ 차이</span>'}</td>
</tr>`;
    })
    .join('\n');
  const sections = manifest.docs
    .map((doc) => {
      const figures = doc.widths
        .map((item) => {
          fig += 1;
          const cut = item.original.fullHeight > item.original.shotHeight ? ` 캡처는 위 ${num(item.original.shotHeight)}px까지다(쪽 ${num(item.original.fullHeight)}px).` : '';
          const claim = item.verdict.pass
            ? `${item.width}px에서 원본과 문서 출처가 같게 보인다. 픽셀 차이 ${pct(item.pixel.ratio)}.${cut}`
            : `${item.width}px에서 차이가 있다: ${item.verdict.reasons.join('; ')}.${cut}`;
          const shot = (file, label, cls = '') =>
            `<div class="col"><div class="col-head mono">${label}</div><div class="shot ${cls}" data-sync><a href="${file}"><img src="${file}" alt="${escapeHtml(`${doc.label} ${item.width}px ${label}`)}" width="${item.original.shotWidth}" loading="lazy"></a></div></div>`;
          return `<figure>
  <div class="frame pair w${item.width}">
    ${shot(item.original.file, '원본 · 로컬 http')}
    ${shot(item.raw.file, '문서 출처')}
    ${shot(item.pixel.file, '차이 · 빨강 = 다른 픽셀', 'diff')}
  </div>
  <figcaption><span class="mono">Fig. ${fig}</span> ${escapeHtml(claim)}</figcaption>
</figure>`;
        })
        .join('\n');
      return `<section>
  <header class="sec-head"><span class="mono label">${escapeHtml(doc.kindLabel)}</span><h2>${escapeHtml(doc.title)}</h2></header>
  <p class="meta mono">원본 ${escapeHtml(doc.source.replace(HOME, '~'))} · 서가 문서 id ${escapeHtml(doc.id)} · 파일 ${doc.fileCount}개</p>
  ${figures}
</section>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>서가 화면 대조 ${escapeHtml(manifest.atKst)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='3' y='6' width='12' height='20' rx='2' fill='none' stroke='%23955700' stroke-width='2.5'/%3E%3Crect x='17' y='6' width='12' height='20' rx='2' fill='none' stroke='%23121614' stroke-width='2.5'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&family=Geist+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root {
    color-scheme: light dark;
    --bg:#f4f5f3; --surface:#ffffff; --border:#dfe3e0; --border-bright:#888e8b; --text:#121614; --text-dim:#545e59;
    --accent:#955700; --ok:#1c7443; --warn:#7a5e00; --risk:#b0341e; --info:#1a6890; --accent-dim: rgb(149 87 0 / .14);
    --t-label:.75rem; --t-small:.875rem; --t-body:1rem; --t-lead:1.25rem; --t-h2:1.625rem; --t-h1:clamp(2.25rem,5.5vw,4rem);
    --s-1:.25rem; --s-2:.5rem; --s-3:.75rem; --s-4:1rem; --s-5:1.5rem; --s-6:2rem; --s-7:3rem; --s-8:4.5rem;
    --r-1:4px; --r-2:10px;
    --sans: Geist, "Apple SD Gothic Neo", "Pretendard", -apple-system, sans-serif;
    --mono: "Geist Mono", ui-monospace, "SF Mono", monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0b0d0c; --surface:#121614; --border:#1f2522; --border-bright:#5e6662; --text:#e6ebe8; --text-dim:#919d97;
      --accent:#f2a93b; --ok:#6fcf97; --warn:#e8c547; --risk:#ef6f5c; --info:#6cb6e0; --accent-dim: rgb(242 169 59 / .14); }
  }
  html { font-size: 17px; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); line-height: 1.55; font-kerning: normal; font-synthesis: none; }
  ::selection { background: var(--accent-dim); }
  main { max-width: 64rem; margin: 0 auto; padding: var(--s-7) var(--s-4) var(--s-8); }
  .mono { font-family: var(--mono); font-size: var(--t-label); color: var(--text-dim); }
  .kicker { display: flex; align-items: center; gap: var(--s-2); }
  .kicker::before { content: ""; width: var(--s-5); height: 2px; background: var(--accent); }
  h1 { font-size: var(--t-h1); line-height: 1.05; letter-spacing: -.035em; font-weight: 600; margin: var(--s-4) 0; text-wrap: balance; }
  h1 .num { color: var(--accent); font-variant-numeric: tabular-nums; }
  .deck { font-size: var(--t-lead); color: var(--text-dim); max-width: 46ch; margin: 0 0 var(--s-4); text-wrap: pretty; }
  .deck b { color: var(--text); font-weight: 600; }
  .kpi { display: flex; flex-wrap: wrap; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: var(--r-2); overflow: hidden; margin: var(--s-6) 0 var(--s-8); }
  .kpi > div { flex: 1 1 14rem; background: var(--surface); padding: var(--s-4) var(--s-5); min-width: 0; }
  .kpi .v { font-size: 2.75rem; font-weight: 600; letter-spacing: -.04em; font-variant-numeric: tabular-nums; line-height: 1.1; margin: var(--s-2) 0; }
  .kpi .v small { font-size: var(--t-body); color: var(--text-dim); letter-spacing: 0; font-weight: 400; }
  .sq { display: inline-block; width: .9rem; height: .9rem; border-radius: 2px; margin-right: 3px; }
  .sq.ok { background: var(--ok); } .sq.risk { background: var(--risk); }
  .bar { height: .5rem; background: var(--border); border-radius: 2px; position: relative; }
  .bar i { position: absolute; inset: 0 auto 0 0; background: var(--accent); border-radius: 2px; }
  .bar-label { display: flex; justify-content: space-between; margin-top: var(--s-1); }
  section { margin-top: var(--s-8); }
  .sec-head { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 9fr); gap: var(--s-5); border-top: 1px solid var(--border); padding-top: var(--s-4); align-items: baseline; }
  .sec-head .label { text-transform: uppercase; letter-spacing: .08em; }
  h2 { font-size: var(--t-h2); letter-spacing: -.01em; font-weight: 600; margin: 0; line-height: 1.2; text-wrap: balance; }
  .meta { margin: var(--s-3) 0 var(--s-5); overflow-wrap: anywhere; }
  figure { margin: 0 0 var(--s-6); }
  .frame { background: var(--bg); background-image: radial-gradient(var(--border) 1px, transparent 1px); background-size: 16px 16px; border: 1px solid var(--border); border-radius: var(--r-2); padding: var(--s-4); }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--s-4); }
  .col { min-width: 0; }
  .col-head { margin-bottom: var(--s-2); }
  .shot { max-height: 34rem; overflow: auto; border: 1px solid var(--border-bright); border-radius: var(--r-1); background: var(--surface); }
  .shot img { display: block; width: 100%; height: auto; }
  .w375 .shot img { max-width: 375px; margin: 0 auto; }
  figcaption { margin-top: var(--s-3); color: var(--text-dim); max-width: 68ch; text-wrap: pretty; }
  figcaption .mono { margin-right: var(--s-2); }
  .table-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--r-2); background: var(--surface); }
  table { border-collapse: collapse; width: 100%; min-width: 48rem; }
  th { font-family: var(--mono); font-size: var(--t-label); color: var(--text-dim); text-align: left; font-weight: 400; background: var(--surface); padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--border); }
  td { padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td small { color: var(--text-dim); margin-left: 2px; }
  .chip { font-family: var(--mono); font-size: var(--t-label); font-weight: 600; border: 1px solid currentColor; border-radius: var(--r-1); padding: 1px var(--s-2); white-space: nowrap; }
  .chip.ok { color: var(--ok); } .chip.risk { color: var(--risk); }
  .rules { max-width: 65ch; color: var(--text-dim); padding-left: var(--s-5); }
  a { color: inherit; }
  a:focus-visible, .shot:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media print { .shot { max-height: none; } }
</style>
</head>
<body>
<main>
  <p class="mono kicker">서가 1단계 T10 · Plan 8.2 화면 대조 (C2)</p>
  <h1><span class="num">${passed}/${pairs.length}</span> 쌍이 원본과 같게 보인다</h1>
  <p class="deck">원본을 로컬 http 서버로 열고, 같은 문서를 <b>서가 문서 주소 → 문서 출처</b>로 열어 같은 폭으로 캡처했다.</p>
  <p class="mono">대상 ${escapeHtml(manifest.targets.base)} → ${escapeHtml(manifest.targets.raw)} · ${escapeHtml(manifest.atKst)} (한국 시간) · Chrome 헤드리스, 밝은 화면, 움직임 줄이기</p>

  <div class="kpi" role="group" aria-label="대조 요약">
    <div><div class="mono">같게 보이는 쌍</div><div class="v">${passed}<small> / ${pairs.length}</small></div><div aria-hidden="true">${waffle}</div></div>
    <div><div class="mono">가장 큰 픽셀 차이</div><div class="v">${pct(maxRatio)}</div><div class="bar" role="img" aria-label="기준 ${MAX_DIFF_RATIO * 100}% 대비"><i style="width:${barWidth}%"></i></div><div class="bar-label mono"><span>0%</span><span>기준 ${MAX_DIFF_RATIO * 100}%</span></div></div>
    <div><div class="mono">대조 문서</div><div class="v">${manifest.docs.length}<small> 개 × 폭 ${WIDTHS.length}</small></div><div class="mono">${WIDTHS.map((w) => `${w}px`).join(' · ')}</div></div>
  </div>

  <section style="margin-top:0">
    <header class="sec-head"><span class="mono label">측정값</span><h2>쪽 높이·그림·영상이 두 쪽에서 같다</h2></header>
    <p class="meta mono">높이와 그림은 "원본 / 문서 출처". 영상은 문서 출처의 readyState · 길이 · 되감기 끝.</p>
    <div class="table-scroll"><table>
      <thead><tr><th>문서</th><th>폭</th><th>쪽 높이</th><th>그림 불림</th><th>깨진 그림</th><th>영상</th><th>픽셀 차이</th><th>판정</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table></div>
  </section>

${sections}

  <section>
    <header class="sec-head"><span class="mono label">판정 규칙</span><h2>다섯 가지가 모두 맞아야 "같다"다</h2></header>
    <ol class="rules">
      <li>캡처 폭이 같다. 문서 출처에서 가로로 넘치지 않는다.</li>
      <li>쪽 높이 차이가 2px 이하다.</li>
      <li>그림 수와 불린 그림 수가 같고, 문서 출처에 깨진 그림이 없다.</li>
      <li>영상이 있으면 재생 준비(readyState ≥ 2), 길이, 되감기 범위, 2초 위치가 같다.</li>
      <li>채널 차이가 ${PIXEL_THRESHOLD}보다 큰 픽셀이 ${MAX_DIFF_RATIO * 100}% 이하다.</li>
    </ol>
  </section>
</main>
<script>
  // 같은 그림 안의 세 캡처를 함께 내린다
  for (const frame of document.querySelectorAll('.pair')) {
    const boxes = [...frame.querySelectorAll('[data-sync]')];
    let lock = false;
    for (const box of boxes) {
      box.tabIndex = 0;
      box.addEventListener('scroll', () => {
        if (lock) return;
        lock = true;
        const ratio = box.scrollTop / Math.max(1, box.scrollHeight - box.clientHeight);
        for (const other of boxes) if (other !== box) other.scrollTop = ratio * (other.scrollHeight - other.clientHeight);
        requestAnimationFrame(() => { lock = false; });
      });
    }
  }
</script>
</body>
</html>
`;
}

// ───────────── 실행 ─────────────

async function main() {
  console.log(`화면 대조 대상: 블로그 ${targets.base}, 문서 출처 ${targets.raw}${tfetch.bypass ? ', Vercel 우회 머리 씀' : ''}`);
  const reach = await assertReachable(targets, tfetch);
  if (!reach.ok) {
    console.error(`대상에 닿지 못했다: ${reach.origin} — ${reach.reason}`);
    process.exitCode = 2;
    return;
  }
  await mkdir(OUT, { recursive: true });
  const workDir = await mkdtemp(path.join(HOME, 'library-compare-'));
  let server = null;
  let page = null;
  let session = '';
  const uploaded = [];
  const cleanup = [];
  const manifest = { at: new Date().toISOString(), atKst: stamp.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3 $4:$5'), targets, docs: [], cleanup };
  try {
    const sources = await prepareSources(workDir);
    session = await createAdminSession(targets, tfetch);
    const plans = await planPush(sources.map((source) => source.target), { home: HOME });
    for (const [index, plan] of plans.entries()) {
      if (!plan.ok) throw new Error(`올리기 계획 실패: ${plan.target} (${plan.error})`);
      const source = sources[index];
      const job = plan.jobs[0];
      const relativePath = `compare-${source.key}-${runId}.html`;
      const doc = await uploadSmokeDoc(targets, tfetch, session, job, relativePath);
      uploaded.push(doc);
      manifest.docs.push({ ...source, id: doc.id, title: doc.title, kindLabel: source.label, fileCount: doc.files.length, notes: plan.notes, widths: [] });
      console.log(`  올림: ${source.label} — 파일 ${doc.files.length}개${plan.notes.length ? `, 알림 ${plan.notes.length}개` : ''}`);
    }

    server = await startStaticServer([
      { prefix: '/__out/', dir: OUT },
      { prefix: '/', dir: workDir },
    ]);
    await writeFile(path.join(OUT, '_blank.html'), '<!doctype html><meta charset="utf-8"><title>diff</title>');
    page = await launchChrome({ bypassSecret: tfetch.bypass ? tfetch.secret : '', bypassHosts: tfetch.hosts });
    if (tfetch.bypass) {
      await page.navigate(`${targets.base}/robots.txt`);
      await page.navigate(`${targets.raw}/d/_open`);
    }
    await page.setCookie({ name: ADMIN_COOKIE, value: session, url: `${targets.base}/`, httpOnly: true, secure: !targets.local, sameSite: 'Lax' });

    for (const doc of manifest.docs) {
      for (const width of WIDTHS) {
        const original = await captureSide(page, `${server.origin}/${encodeURI(doc.entry)}`, width, `${doc.key}-${width}-original.png`);
        const raw = await captureSide(page, `${targets.base}/admin/library/d/${doc.id}`, width, `${doc.key}-${width}-raw.png`);
        await page.setViewport(1280);
        await page.navigate(`${server.origin}/__out/_blank.html`);
        const diff = await page.evaluate(`(${DIFF_FN})('/__out/${original.file}', '/__out/${raw.file}', ${PIXEL_THRESHOLD})`);
        const pixelFile = `${doc.key}-${width}-diff.png`;
        await writeFile(path.join(OUT, pixelFile), Buffer.from(diff.png.split(',')[1], 'base64'));
        const pixel = { file: pixelFile, width: diff.width, height: diff.height, diff: diff.diff, ratio: diff.ratio, firstY: diff.firstY, lastY: diff.lastY };
        const verdict = judge(original, raw, pixel);
        if (!raw.href.startsWith(`${targets.raw}/d/${doc.id}/`)) verdict.reasons.unshift(`문서 출처에서 열리지 않았다 (${raw.href.split('?')[0]})`);
        verdict.pass = verdict.reasons.length === 0;
        doc.widths.push({ width, original, raw, pixel, verdict });
        console.log(`  ${verdict.pass ? '✓' : '✗'} ${doc.label} ${width}px — 픽셀 차이 ${pct(pixel.ratio)}, 높이 ${original.docHeight}/${raw.docHeight}, 그림 ${original.loaded}/${original.images}·${raw.loaded}/${raw.images}${verdict.pass ? '' : ` — ${verdict.reasons.join('; ')}`}`);
      }
    }
  } finally {
    if (page) await page.close();
    if (server) await server.close();
    for (const doc of uploaded) {
      const status = await removeSmokeDoc(targets, tfetch, session, doc.id).catch((error) => `오류 ${error.message}`);
      const remnants = await docRemnants(doc.id).catch((error) => ({ error: error.message }));
      cleanup.push({ id: doc.id, removed: status, remnants });
      console.log(`  내림: ${doc.id} → ${status}, 흔적 ${JSON.stringify(remnants)}`);
    }
    await rm(workDir, { recursive: true, force: true });
    await rm(path.join(OUT, '_blank.html'), { force: true });
  }

  // 임시 폴더 경로(target)는 manifest에 남기지 않는다(뒷정리 뒤에는 없는 경로다)
  const docsForManifest = manifest.docs.map((doc) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== 'target')));
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ ...manifest, docs: docsForManifest }, null, 2));
  await writeFile(path.join(OUT, 'index.html'), renderPage(manifest));
  const pairs = manifest.docs.flatMap((doc) => doc.widths);
  const failed = pairs.filter((pair) => !pair.verdict.pass).length;
  const dirty = cleanup.filter((item) => item.removed !== 204 || item.remnants.doc !== false || item.remnants.files !== 0 || item.remnants.revisions !== 0);
  console.log(`\n대조 ${pairs.length}쌍: 같다 ${pairs.length - failed}, 차이 ${failed}. 뒷정리 ${dirty.length === 0 ? '흔적 0' : `남은 것 ${dirty.length}`}`);
  console.log(`대조 페이지: ${path.join(OUT, 'index.html')}`);
  if (failed > 0 || dirty.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
