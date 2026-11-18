#!/usr/bin/env node
// 명령 lab: 문서 서가 맥 입구 (서가 1단계 T8, Plan L2·J16·J18·J20)
//
// 실행:
//   lab push [--server 주소] [--no-qr] [--qr-png 폴더] [--notify] <경로…>   고른 md·html 파일 또는 폴더를 서가에 올린다
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
// - 종료 코드: 0 모두 올림, 1 하나라도 실패, 2 쓰는 법이 틀림.

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import QRCode from 'qrcode';
import { planPush, PushError, pushJob } from '../src/library/client/push.ts';

const DEFAULT_SERVER = 'https://www.cruzlab.dev';
const KEYCHAIN_SERVICE = 'cruz-lab-library';
const KEYCHAIN_ACCOUNT = 'library-token';
const SECURITY = '/usr/bin/security';

const USAGE = `쓰는 법:
  lab push [--server 주소] [--no-qr] [--qr-png 폴더] [--notify] <경로…>
      md·html 파일 또는 폴더째 문서를 서가에 올린다. 문서가 쓰는 자산은 원본 폴더에서 찾아 함께 올린다.
      서버 기본값: LAB_SERVER 또는 ${DEFAULT_SERVER}
      --qr-png 폴더: 문서마다 QR 그림(lab-qr-{문서 id}.png)을 만든다
      --notify: 끝나면 맥 알림을 띄우고 주소를 클립보드에 넣는다 (Finder 빠른 동작)
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
  const options = { server: process.env.LAB_SERVER?.trim() || DEFAULT_SERVER, qr: true, qrPng: null, notify: false, paths: [] };
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
    } else if (arg === '--qr-png') {
      const value = args[i + 1];
      if (!value) throw new UsageError('--qr-png 뒤에 폴더가 필요하다.');
      options.qrPng = resolve(value);
      i += 1;
    } else if (arg === '--no-qr') {
      options.qr = false;
    } else if (arg === '--notify') {
      options.notify = true;
    } else if (arg.startsWith('--')) {
      throw new UsageError(`모르는 선택: ${arg}`);
    } else {
      options.paths.push(arg);
    }
  }
  if (options.paths.length === 0) throw new UsageError('올릴 경로가 없다.');
  if (!/^https?:\/\/[^/]+/.test(options.server)) throw new UsageError(`서버 주소가 틀렸다: ${options.server}`);
  options.server = options.server.replace(/\/+$/, '');
  return options;
}

const PLAN_ERRORS = {
  NOT_FOUND: '경로가 없습니다',
  OUTSIDE_HOME: '홈 폴더 밖 파일은 올릴 수 없습니다',
  NOT_DOC: 'md·html 파일이나 폴더가 아닙니다',
  NO_ENTRY_IN_FOLDER: '폴더 뿌리에서 진입 파일(index.html, 하나뿐인 html·md)을 정할 수 없습니다',
  EMPTY: '폴더에 올릴 파일이 없습니다',
};

const NOTE_LABELS = {
  missing: '원본에 없음',
  outside: '문서 밖 주소(함께 올리지 않음)',
  type: '받지 않는 형식(함께 올리지 않음)',
  skipped: '뺀 파일',
};

// 올리기 실패를 한 줄 글로. 자주 겪는 원인은 할 일을 덧붙인다
function describePushError(error, server) {
  if (!(error instanceof PushError)) return error instanceof Error ? error.message : String(error);
  if (error.code === 'UNAUTHENTICATED') {
    return `${error.message} 서버의 LIBRARY_TOKEN_SHA256이 키체인 토큰의 해시와 같은지 봅니다(lab token).`;
  }
  if (error.status === 404) return `서가가 꺼져 있거나 서버 주소가 틀렸습니다 (${server}).`;
  return error.message;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 맥 알림 (글은 인자로 넘겨 AppleScript 따옴표 문제를 피한다)
function notify(title, body) {
  spawnSync('/usr/bin/osascript', [
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

async function runPush(args) {
  const options = parsePushArgs(args);
  const token = resolveToken();
  if (!token) throw new Error('서가 토큰이 없습니다. 터미널에서 lab token을 실행합니다.');

  const docs = new Map(); // 문서 id → 요약 (md·html 짝은 한 문서다)
  const failures = [];
  const plans = await planPush(options.paths, { home: homedir() });

  for (const plan of plans) {
    if (!plan.ok) {
      const message = `${plan.target}: ${PLAN_ERRORS[plan.error] ?? plan.error}`;
      failures.push(message);
      console.error(`실패: ${message}`);
      continue;
    }
    for (const job of plan.jobs) {
      const total = job.files.reduce((sum, file) => sum + file.bytes, 0);
      console.log(`올리는 중: ${job.fileName} (${job.format}, 파일 ${job.files.length}개, ${formatBytes(total)})`);
      for (const note of plan.notes) console.log(`  알림: ${NOTE_LABELS[note.kind] ?? note.kind}: ${note.ref}`);
      try {
        const doc = await pushJob(job, { server: options.server, token });
        docs.set(doc.id, doc);
        console.log(`올림: ${doc.title}`);
        console.log(`  ${doc.url}`);
      } catch (error) {
        const message = `${job.fileName}: ${describePushError(error, options.server)}`;
        failures.push(message);
        console.error(`실패: ${message}`);
      }
    }
  }

  if (options.qr && !options.notify) {
    // 터미널은 색 QR(어두운 바탕에서도 찍힌다). 그 밖은 색 제어 문자가 그대로 찍히므로 글자 QR
    const textOptions = process.stdout.isTTY ? { type: 'terminal', small: true } : { type: 'utf8' };
    for (const doc of docs.values()) {
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
    if (urls.length > 0) spawnSync('/usr/bin/pbcopy', { input: urls.join('\n') });
    const copied = urls.length > 0 ? ' 주소를 클립보드에 넣었습니다.' : '';
    if (failures.length === 0) {
      const first = [...docs.values()][0];
      notify('서가에 올렸습니다', docs.size === 1 ? `${first.title}.${copied}` : `문서 ${docs.size}개.${copied}`);
    } else {
      const more = failures.length > 1 ? ` 외 ${failures.length - 1}건` : '';
      const title = docs.size > 0 ? `서가: ${docs.size}개 올림, ${failures.length}개 실패` : '서가 올리기 실패';
      notify(title, `${failures[0]}${more}.${copied}`);
    }
  }

  return failures.length === 0 ? 0 : 1;
}

// ---------- 시작 ----------

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'push') return runPush(rest);
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
