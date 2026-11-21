#!/usr/bin/env node
// 명령 lab: 문서 서가 맥 입구 (서가 1단계 T8, Plan L2·J16·J18·J20)
//
// 실행:
//   lab push [--server 주소] [--no-qr] [--qr-png 폴더] [--notify] [--force] [--each | --entry 파일] <경로…>   고른 md·html 파일 또는 폴더를 서가에 올린다
//   lab pull [--server 주소] [경로…]                        폰에서 고친 md(폰 판)를 맥 원본에 되돌린다 (서가 2단계 J40)
//   lab token [--new | --copy]                              서가 토큰을 키체인에 만들고, 서버에 넣을 해시를 보인다
//   lab help
//
// - 올리기 로직은 공용 모듈 src/library/client/push.ts에 있다(Raycast 확장 T9도 같은 모듈을 쓴다).
//   Node 22.18 이상이 .ts를 바로 가져온다(타입 지우기). 감싸개 ~/.local/bin/lab이 Node 24 절대 경로로 이 파일을 부른다.
// - 서가 토큰은 macOS 키체인(서비스 cruz-lab-library)에만 둔다. 화면에 보이지 않는다(사용자 결정 2026-11-18, 토큰 A).
//   서버에는 토큰의 SHA-256만 둔다(LIBRARY_TOKEN_SHA256). LAB_TOKEN 환경 변수는 자동 시험용 길이다.
// - 서버: --server > LAB_SERVER > https://www.cruzlab.dev
// - QR(J20): 터미널이면 색 QR, 아니면(Claude 도구 결과·로그) 색 제어 문자 없는 글자 QR.
//   --qr-png 폴더: 문서마다 QR 그림 {폴더}/lab-qr-{문서 id}.png를 만든다(스킬이 대화 화면에 그림으로 보일 때).
// - --notify: Finder 빠른 동작용. 끝나면 맥 알림을 띄우고 서가 문서 주소를 클립보드에 넣는다(J18). QR은 그리지 않는다.
// - 서가 2단계 J42: md를 다시 올릴 때 아직 되돌리지 않은 폰 판이 있으면 서버가 409(PHONE_EDIT_PENDING)로 막는다.
//   터미널이면 묻는다(y/N). 터미널이 아니면(Finder 빠른 동작, Claude 도구) 멈추고 lab pull 또는 --force를 안내한다.
// - 서가 2단계 J52: 올린 문서가 공유 중인 묶음·문서에 들면 "주의:" 줄을 보인다. --notify면 알림에 첫 경고 줄을 싣는다.
// - lab pull(J40): 인자가 없으면 폰 판이 있는 문서 모두. 원본이 서가가 아는 내용일 때만 백업한 뒤 바꾼다.
//   아니면 원본 옆에 {이름}.phone.md를 두고 차이 앞부분을 보인다(공용 모듈 src/library/client/pull.ts).
// - 폴더 2차 Plan J75·J76·J79: 문서가 여러 편이거나 모호한 폴더는 추측하지 않는다.
//   --each(문서 모음), --entry(문서 하나 + 진입 파일)로 고른다. 터미널이면 번호로 묻고, --notify면 맥 확인 창으로 묻는다.
//   그 밖(Claude 도구, 스크립트)은 계획과 다시 실행할 명령을 보이고 그 폴더를 올리지 않는다(종료 코드 3).
//   문서 모음은 QR을 그리지 않고 제목과 주소 목록을 보인다.
// - 종료 코드: 0 모두 올림·되돌림, 1 하나라도 실패, 2 쓰는 법이 틀림 또는 (lab pull) 충돌이 있어 원본을 두었다,
//   3 고를 폴더가 남았다(다른 실패가 있으면 1).

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import QRCode from 'qrcode';
import {
  describeApiError,
  describeFolderChoice,
  describeNote,
  describePlanError,
  describePullOutcome,
  folderDialogText,
  folderRerunCommands,
  pickNumbered,
} from '../src/library/client/messages.ts';
import { backupDirFor, pullExitCode, pullTargets } from '../src/library/client/pull.ts';
import { planPush, previewCollection, PushError, pushJob, resolveFolderChoice } from '../src/library/client/push.ts';
import { sharedByLines } from '../src/library/share.ts';

const DEFAULT_SERVER = 'https://www.cruzlab.dev';
const KEYCHAIN_SERVICE = 'cruz-lab-library';
const KEYCHAIN_ACCOUNT = 'library-token';
const SECURITY = '/usr/bin/security';
// 맥 알림·확인 창·클립보드 명령이 있는 곳. LAB_MAC_BIN은 자동 시험이 가짜 명령을 끼우는 길이다
const MAC_BIN = process.env.LAB_MAC_BIN || '/usr/bin';

const USAGE = `쓰는 법:
  lab push [--server 주소] [--no-qr] [--qr-png 폴더] [--notify] [--force] [--each | --entry 파일] <경로…>
      md·html 파일 또는 폴더를 서가에 올린다. 문서가 쓰는 자산은 원본 폴더에서 찾아 함께 올린다.
      문서가 여러 편인 폴더는 묻는다(터미널이 아니면 올리지 않고 종료 코드 3).
      --each: 폴더 뿌리의 문서를 문서마다 올린다(문서 모음)
      --entry 파일: 폴더 전체를 문서 하나로 올린다. 뿌리의 그 파일이 진입 파일이다. 폴더 경로 하나에만 쓴다
      서버 기본값: LAB_SERVER 또는 ${DEFAULT_SERVER}
      --qr-png 폴더: 문서마다 QR 그림(lab-qr-{문서 id}.png)을 만든다
      --notify: 끝나면 맥 알림을 띄우고 주소를 클립보드에 넣는다 (Finder 빠른 동작)
      --force: 폰에서 고친 판(아직 맥에 없음)이 있어도 맥 원본으로 덮어쓴다. 없으면 터미널에서 묻는다
  lab pull [--server 주소] [경로…]
      폰에서 고친 md(폰 판)를 맥 원본에 되돌린다. 경로가 없으면 폰 판이 있는 문서 모두.
      원본이 서가가 아는 내용일 때만 바꾼다(앞 원본은 ~/Library/Application Support/cruz-lab/pull-backup/에 둔다).
      원본도 바뀌었으면 원본을 두고 옆에 {이름}.phone.md를 만든다. 합친 뒤 lab push로 올린다(종료 코드 2)
  lab token            키체인에 서가 토큰이 없으면 만든다. 서버에 넣을 해시(LIBRARY_TOKEN_SHA256)를 보인다
  lab token --new      새 토큰으로 바꾼다 (서버의 해시도 바꿔야 한다)
  lab token --copy     토큰을 클립보드에 넣는다 (Raycast 설정에 넣을 때)`;

class UsageError extends Error {}

// ---------- 키체인 ----------

// 키체인의 서가 토큰. 없으면 null
function readKeychainToken() {
  const result = spawnSync(SECURITY, ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w'], {
    encoding: 'utf8',
  });
  const token = result.status === 0 ? result.stdout.trim() : '';
  return token || null;
}

// 키체인에 토큰을 넣는다(있으면 바꾼다)
// - 토큰을 명령 인자로 넘기지 않는다(다른 프로세스가 ps로 볼 수 있다). security -i의 표준 입력으로 준다.
function writeKeychainToken(token) {
  const command = `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${KEYCHAIN_ACCOUNT} -l ${KEYCHAIN_SERVICE} -w ${token}\n`;
  const result = spawnSync(SECURITY, ['-i'], { input: command, encoding: 'utf8' });
  if (result.status !== 0 || readKeychainToken() !== token) {
    throw new Error(`키체인에 토큰을 넣지 못했습니다. ${result.stderr?.trim() ?? ''}`.trim());
  }
}

// 쓸 토큰: LAB_TOKEN(시험용) > 키체인
function resolveToken() {
  return process.env.LAB_TOKEN?.trim() || readKeychainToken();
}

const sha256Hex = (text) => createHash('sha256').update(text).digest('hex');

// ---------- lab token ----------

function printServerSteps(token) {
  console.log('');
  console.log('서버에 넣을 값 (LIBRARY_TOKEN_SHA256):');
  console.log(`  ${sha256Hex(token)}`);
  console.log('');
  console.log('이 값을 넣을 곳:');
  console.log('  1. Vercel 환경 변수 LIBRARY_TOKEN_SHA256 (넣은 뒤 다시 배포한다)');
  console.log('  2. 로컬 개발 서버: 저장소 .env의 LIBRARY_TOKEN_SHA256 줄');
  console.log('');
  console.log(`토큰 자체는 키체인(${KEYCHAIN_SERVICE})에만 있다. Raycast에 넣을 때: lab token --copy`);
}

function runToken(args) {
  const flags = new Set(args);
  for (const flag of flags) {
    if (flag !== '--new' && flag !== '--copy') throw new UsageError(`모르는 선택: ${flag}`);
  }
  if (flags.has('--new') && flags.has('--copy')) throw new UsageError('--new와 --copy는 함께 쓰지 않는다.');
  const existing = readKeychainToken();

  if (flags.has('--copy')) {
    if (!existing) throw new Error('키체인에 서가 토큰이 없습니다. 먼저 lab token을 실행합니다.');
    const result = spawnSync('/usr/bin/pbcopy', { input: existing });
    if (result.status !== 0) throw new Error('클립보드에 넣지 못했습니다.');
    console.log('서가 토큰을 클립보드에 넣었습니다. 붙여 넣은 뒤 다른 글을 복사해 클립보드를 덮습니다.');
    return 0;
  }

  if (existing && !flags.has('--new')) {
    console.log(`키체인에 서가 토큰이 있습니다 (${KEYCHAIN_SERVICE}).`);
    printServerSteps(existing);
    return 0;
  }

  const token = randomBytes(32).toString('base64url');
  writeKeychainToken(token);
  console.log(existing ? '새 서가 토큰으로 바꿨습니다. 서버의 해시를 바꾸기 전까지 올리기는 401입니다.' : '새 서가 토큰을 키체인에 넣었습니다.');
  printServerSteps(token);
  return 0;
}

// ---------- lab push ----------

function parsePushArgs(args) {
  const options = {
    server: process.env.LAB_SERVER?.trim() || DEFAULT_SERVER,
    qr: true,
    qrPng: null,
    notify: false,
    force: false,
    each: false,
    entry: null,
    serverGiven: false, // 사용자가 --server로 지정했다 (다시 실행할 명령에 잇는다)
    paths: [],
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      options.paths.push(...args.slice(i + 1));
      break;
    }
    if (arg === '--server') {
      const value = args[i + 1];
      if (!value) throw new UsageError('--server 뒤에 주소가 필요하다.');
      options.server = value;
      options.serverGiven = true;
      i += 1;
    } else if (arg.startsWith('--server=')) {
      options.server = arg.slice('--server='.length);
      options.serverGiven = true;
    } else if (arg === '--each') {
      options.each = true;
    } else if (arg === '--entry') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) throw new UsageError('--entry 뒤에 폴더 뿌리의 파일 이름이 필요하다.');
      options.entry = value;
      i += 1;
    } else if (arg.startsWith('--entry=')) {
      options.entry = arg.slice('--entry='.length);
      if (!options.entry) throw new UsageError('--entry 뒤에 폴더 뿌리의 파일 이름이 필요하다.');
    } else if (arg === '--qr-png') {
      const value = args[i + 1];
      if (!value) throw new UsageError('--qr-png 뒤에 폴더가 필요하다.');
      options.qrPng = resolve(value);
      i += 1;
    } else if (arg === '--no-qr') {
      options.qr = false;
    } else if (arg === '--notify') {
      options.notify = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('--')) {
      throw new UsageError(`모르는 선택: ${arg}`);
    } else {
      options.paths.push(arg);
    }
  }
  if (options.paths.length === 0) throw new UsageError('올릴 경로가 없다.');
  if (options.each && options.entry !== null) throw new UsageError('--each와 --entry는 함께 쓰지 않는다.');
  if (options.entry !== null && options.paths.length !== 1) throw new UsageError('--entry는 폴더 경로 하나에만 쓴다.');
  if (!/^https?:\/\/[^/]+/.test(options.server)) throw new UsageError(`서버 주소가 틀렸다: ${options.server}`);
  options.server = options.server.replace(/\/+$/, '');
  return options;
}

// 계획 오류·알림·올리기 실패의 글은 공용 모듈 client/messages.ts에 있다(Raycast 확장과 같은 글)

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 맥 알림 (글은 인자로 넘겨 AppleScript 따옴표 문제를 피한다)
function notify(title, body) {
  spawnSync(join(MAC_BIN, 'osascript'), [
    '-e',
    'on run argv',
    '-e',
    'display notification (item 2 of argv) with title (item 1 of argv)',
    '-e',
    'end run',
    title,
    body,
  ]);
}

// 터미널에서 예/아니오를 묻는다. y·yes만 예다
async function askYesNo(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

// ---------- 모호한 폴더 고르기 (폴더 2차 Plan J75·J76) ----------

// AppleScript를 줄마다 -e로 넘긴다. 글은 인자로 넘겨 따옴표 문제를 피한다
function runAppleScript(lines, args) {
  return spawnSync(join(MAC_BIN, 'osascript'), [...lines.flatMap((line) => ['-e', line]), ...args], { encoding: 'utf8' });
}

// 세 단추 확인 창. 답: 누른 단추의 글, 취소면 CANCEL
const CHOICE_DIALOG = [
  'on run argv',
  'activate',
  'try',
  'set answer to display dialog (item 1 of argv) with title "서가에 올리기" buttons {"취소", (item 3 of argv), (item 2 of argv)} default button (item 2 of argv) cancel button "취소"',
  'return button returned of answer',
  'on error number -128',
  'return "CANCEL"',
  'end try',
  'end run',
];

// 진입 파일 목록 창. 답: 고른 이름, 취소면 CANCEL
const ENTRY_LIST = [
  'on run argv',
  'activate',
  'set answer to choose from list argv with title "서가에 올리기" with prompt "진입 파일을 고릅니다." OK button name "올리기" cancel button name "취소"',
  'if answer is false then return "CANCEL"',
  'return item 1 of answer',
  'end run',
];

const CHOICE_CANCELLED = { kind: 'cancelled' };
const CHOICE_PENDING = { kind: 'pending' };

// Finder 빠른 동작: 맥 확인 창으로 묻는다 (L14). 창을 띄우지 못하면 올리지 않고 알림만 보인다
async function chooseByDialog(plan, collection, home) {
  const folder = plan.choice.folder ?? '폴더';
  const dialogFailed = () => {
    notify('서가: 올리지 않았습니다', `${folder}: 창을 띄우지 못해 올리지 않았습니다. 터미널에서 lab push로 올립니다.`);
    return CHOICE_PENDING;
  };
  const cancelled = () => {
    notify('서가: 올리지 않았습니다', `${folder} 폴더를 올리지 않았습니다.`);
    return CHOICE_CANCELLED;
  };

  const eachLabel = `문서 모음 ${collection.docs.length}편`;
  const entryLabel = '문서 하나…';
  const dialog = runAppleScript(CHOICE_DIALOG, [folderDialogText(plan.choice, collection), eachLabel, entryLabel]);
  if (dialog.status !== 0) return dialogFailed();
  const answer = dialog.stdout.trim();
  if (answer === 'CANCEL') return cancelled();
  if (answer === eachLabel) return { kind: 'plan', plan: await resolveFolderChoice(plan, { mode: 'each' }, { home }) };
  if (answer !== entryLabel) return dialogFailed();

  const list = runAppleScript(ENTRY_LIST, plan.choice.entryOptions);
  if (list.status !== 0) return dialogFailed();
  const entry = list.stdout.trim().normalize('NFC');
  if (entry === 'CANCEL') return cancelled();
  if (!entry) return dialogFailed();
  return { kind: 'plan', plan: await resolveFolderChoice(plan, { mode: 'entry', entry }, { home }) };
}

// 터미널: 계획을 보이고 번호로 묻는다. 맞지 않는 답은 취소다
async function chooseByTerminal(plan, collection, home) {
  for (const line of describeFolderChoice(plan.choice, collection)) console.log(line);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`  1) 문서 모음 ${collection.docs.length}편`);
    console.log('  2) 문서 하나 (진입 파일 고르기)');
    console.log('  3) 취소');
    const mode = pickNumbered(await rl.question('번호: '), ['each', 'entry', 'cancel']);
    if (mode === 'each') return { kind: 'plan', plan: await resolveFolderChoice(plan, { mode: 'each' }, { home }) };
    if (mode === 'entry') {
      plan.choice.entryOptions.forEach((name, index) => console.log(`  ${index + 1}) ${name}`));
      const entry = pickNumbered(await rl.question('진입 파일 번호: '), plan.choice.entryOptions);
      if (entry) return { kind: 'plan', plan: await resolveFolderChoice(plan, { mode: 'entry', entry }, { home }) };
    }
  } finally {
    rl.close();
  }
  console.log('올리지 않았습니다.');
  return CHOICE_CANCELLED;
}

// 묻지 못하는 곳(Claude 도구, 스크립트): 계획과 다시 실행할 명령만 보인다. 올리지 않는다 (J75)
function printPendingChoice(plan, collection, options) {
  for (const line of describeFolderChoice(plan.choice, collection)) console.log(line);
  const commands = folderRerunCommands(plan.target, {
    server: options.serverGiven ? options.server : undefined,
    force: options.force,
  });
  console.log('이 폴더는 올리지 않았습니다. 고른 뒤 다시 실행합니다:');
  console.log(`  문서 모음: ${commands.each}`);
  console.log(`  문서 하나: ${commands.entry}`);
}

// 모호한 폴더 하나를 푼다
// - { kind: 'plan', plan }: 고른 계획. cancelled: 사용자가 취소했다. pending: 아직 고르지 못했다
async function chooseFolder(plan, options, home) {
  if (options.each) return { kind: 'plan', plan: await resolveFolderChoice(plan, { mode: 'each' }, { home }) };
  if (options.entry !== null) {
    return { kind: 'plan', plan: await resolveFolderChoice(plan, { mode: 'entry', entry: options.entry }, { home }) };
  }
  const collection = await previewCollection(plan);
  if (options.notify) return chooseByDialog(plan, collection, home);
  if (process.stdin.isTTY && process.stdout.isTTY) return chooseByTerminal(plan, collection, home);
  printPendingChoice(plan, collection, options);
  return CHOICE_PENDING;
}

// 작업 하나를 올린다. 폰 판이 있어 막히면(409 PHONE_EDIT_PENDING) 터미널에서만 묻고, 예면 force로 다시 올린다 (J42)
// - 터미널이 아니거나 아니오면 그 오류를 그대로 던진다(실패 글이 lab pull과 --force를 안내한다)
async function pushWithAsk(job, options, token) {
  try {
    return await pushJob(job, { server: options.server, token, force: options.force });
  } catch (error) {
    const canAsk = process.stdin.isTTY && process.stdout.isTTY && !options.notify;
    if (!(error instanceof PushError) || error.code !== 'PHONE_EDIT_PENDING' || options.force || !canAsk) throw error;
    const yes = await askYesNo(
      `  폰에서 고친 판이 맥 원본에 아직 없습니다. 맥 원본으로 덮어쓸까요? 폰 판을 먼저 가져오려면 N 뒤 lab pull. (y/N) `,
    );
    if (!yes) throw error;
    return pushJob(job, { server: options.server, token, force: true });
  }
}

async function runPush(args) {
  const options = parsePushArgs(args);
  const token = resolveToken();
  if (!token) throw new Error('서가 토큰이 없습니다. 터미널에서 lab token을 실행합니다.');

  const docs = new Map(); // 문서 id → 요약 (md·html 짝은 한 문서다)
  const qrDocs = new Map(); // QR을 그릴 문서. 문서 모음은 그리지 않는다 (J79)
  const failures = [];
  const warnings = new Set(); // 공유 중 경고 줄 (Finder 알림에 첫 줄을 싣는다)
  const home = homedir();
  const plans = await planPush(options.paths, { home });
  let pendingChoices = 0;

  // --entry는 모호한 폴더에만 쓴다. 파일이나 문서 1편이 분명한 폴더에 쓰면 고른 값이 무시되므로 올리지 않는다
  if (options.entry !== null && plans[0].ok) {
    throw new UsageError('--entry는 문서가 여러 편인 폴더에만 쓴다. 이 경로는 --entry 없이 올린다.');
  }

  // --each를 문서 1편이 분명한 폴더에 쓰면 폴더 전체가 한 문서로 올라간다. 사용자의 뜻과 달라 올리지 않는다
  if (options.each) {
    const clear = plans.find((plan) => plan.ok && statSync(plan.target).isDirectory());
    if (clear) throw new UsageError(`--each는 문서가 여러 편인 폴더에 쓴다. 이 폴더는 --each 없이 올린다: ${clear.target}`);
  }

  for (const planned of plans) {
    let plan = planned;
    if (!plan.ok && plan.error === 'NEEDS_CHOICE') {
      const chosen = await chooseFolder(plan, options, home);
      if (chosen.kind === 'pending') pendingChoices += 1;
      if (chosen.kind !== 'plan') continue;
      plan = chosen.plan;
    }
    if (!plan.ok) {
      const message = `${plan.target}: ${describePlanError(plan.error, plan.rootDocs, plan)}`;
      failures.push(message);
      console.error(`실패: ${message}`);
      continue;
    }
    const planDocs = new Map();
    let planFailed = 0;
    if (plan.collection) for (const note of plan.notes) console.log(`알림: ${describeNote(note)}`);
    for (const job of plan.jobs) {
      const total = job.files.reduce((sum, file) => sum + file.bytes, 0);
      console.log(`올리는 중: ${job.fileName} (${job.format}, 파일 ${job.files.length}개, ${formatBytes(total)})`);
      if (!plan.collection) for (const note of plan.notes) console.log(`  알림: ${describeNote(note)}`);
      try {
        const doc = await pushWithAsk(job, options, token);
        docs.set(doc.id, doc);
        planDocs.set(doc.id, doc);
        if (!plan.collection) qrDocs.set(doc.id, doc);
        console.log(`올림: ${doc.title}`);
        if (!plan.collection) console.log(`  ${doc.url}`);
        // 공유 중인 묶음·문서에 들어갔다 (서가 2단계 J52)
        for (const line of sharedByLines(doc.sharedBy)) {
          console.log(`  주의: ${line}`);
          warnings.add(line);
        }
      } catch (error) {
        const message = `${job.fileName}: ${describeApiError(error, options.server)}`;
        failures.push(message);
        planFailed += 1;
        console.error(`실패: ${message}`);
      }
    }
    // 문서 모음의 결과: 제목과 주소 목록 (J79)
    if (plan.collection) {
      console.log('');
      console.log(`문서 모음 ${basename(plan.target).normalize('NFC')}: 올림 ${planDocs.size}편, 실패 ${planFailed}건`);
      for (const doc of planDocs.values()) {
        console.log(`  ${doc.title}`);
        console.log(`    ${doc.url}`);
      }
    }
  }

  if (options.qr && !options.notify) {
    // 터미널은 색 QR(어두운 바탕에서도 찍힌다). 그 밖은 색 제어 문자가 그대로 찍히므로 글자 QR
    const textOptions = process.stdout.isTTY ? { type: 'terminal', small: true } : { type: 'utf8' };
    for (const doc of qrDocs.values()) {
      console.log('');
      console.log(`QR: ${doc.title}`);
      console.log(await QRCode.toString(doc.url, textOptions));
      if (options.qrPng) {
        const file = join(options.qrPng, `lab-qr-${doc.id}.png`);
        await QRCode.toFile(file, doc.url, { type: 'png', width: 360, margin: 2 });
        console.log(`QR 그림: ${file}`);
      }
    }
  }

  if (options.notify) {
    const urls = [...docs.values()].map((doc) => doc.url);
    if (urls.length > 0) spawnSync(join(MAC_BIN, 'pbcopy'), { input: urls.join('\n') });
    const copied = urls.length > 0 ? ' 주소를 클립보드에 넣었습니다.' : '';
    const warning = warnings.size > 0 ? ` ${[...warnings][0]}` : '';
    if (failures.length === 0 && docs.size > 0) {
      const first = [...docs.values()][0];
      notify('서가에 올렸습니다', `${docs.size === 1 ? `${first.title}.` : `문서 ${docs.size}개.`}${copied}${warning}`);
    } else if (failures.length > 0) {
      const more = failures.length > 1 ? ` 외 ${failures.length - 1}건` : '';
      const title = docs.size > 0 ? `서가: ${docs.size}개 올림, ${failures.length}개 실패` : '서가 올리기 실패';
      notify(title, `${failures[0]}${more}.${copied}${warning}`);
    }
  }

  if (failures.length > 0) return 1;
  return pendingChoices > 0 ? 3 : 0;
}

// ---------- lab pull ----------

function parsePullArgs(args) {
  const options = { server: process.env.LAB_SERVER?.trim() || DEFAULT_SERVER, paths: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      options.paths.push(...args.slice(i + 1));
      break;
    }
    if (arg === '--server') {
      const value = args[i + 1];
      if (!value) throw new UsageError('--server 뒤에 주소가 필요하다.');
      options.server = value;
      i += 1;
    } else if (arg.startsWith('--server=')) {
      options.server = arg.slice('--server='.length);
    } else if (arg.startsWith('--')) {
      throw new UsageError(`모르는 선택: ${arg}`);
    } else {
      options.paths.push(arg);
    }
  }
  if (!/^https?:\/\/[^/]+/.test(options.server)) throw new UsageError(`서버 주소가 틀렸다: ${options.server}`);
  options.server = options.server.replace(/\/+$/, '');
  return options;
}

async function runPull(args) {
  const options = parsePullArgs(args);
  const token = resolveToken();
  if (!token) throw new Error('서가 토큰이 없습니다. 터미널에서 lab token을 실행합니다.');
  const home = homedir();
  const outcomes = await pullTargets(options.paths, {
    server: options.server,
    token,
    home,
    backupDir: backupDirFor(home, new Date()),
    describeError: (error) => describeApiError(error, options.server),
  });
  if (outcomes.length === 0) {
    console.log('되돌릴 폰 판이 없습니다.');
    return 0;
  }
  for (const outcome of outcomes) {
    const text = describePullOutcome(outcome, home).join('\n');
    if (outcome.kind === 'failed') console.error(text);
    else console.log(text);
  }
  const count = (kind) => outcomes.filter((outcome) => outcome.kind === kind).length;
  console.log('');
  console.log(
    `되돌림 ${count('replaced')}, 같음 ${count('same')}, 충돌 ${count('conflict')}, 건너뜀 ${count('skipped')}, 실패 ${count('failed')}`,
  );
  return pullExitCode(outcomes);
}

// ---------- 시작 ----------

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'push') return runPush(rest);
  if (command === 'pull') return runPull(rest);
  if (command === 'token') return runToken(rest);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE);
    return command ? 0 : 2;
  }
  throw new UsageError(`모르는 명령: ${command}`);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\n${USAGE}`);
      process.exitCode = 2;
      return;
    }
    console.error(`실패: ${error instanceof Error ? error.message : String(error)}`);
    if (process.argv.includes('--notify')) notify('서가 올리기 실패', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
