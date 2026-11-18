// "서가에 올리기" 명령의 올리기 묶음 (서가 1단계 T9, Plan J19)
// - 고른 경로마다 공용 모듈로 계획(planPush)을 세우고, 작업마다 올린다(pushJob). lab push와 같은 규칙이다.
// - 결과를 보고 하나로 모은다: 올린 문서, 알림(빠진 자산 등), 실패. 하나가 실패해도 나머지를 올린다.
// - 사용자 결정(2026-11-18): 고른 파일만 올린다. md·html 짝을 둘 다 고르면 서버가 한 문서로 묶는다(같은 문서 id).
// - @raycast/api를 가져오지 않는다(루트 vitest가 시험한다. tests/library/raycast-lib.test.ts).

import { basename } from 'node:path';
import { describeApiError, describeNote, describePlanError } from '../../../../src/library/client/messages.ts';
import { planPush, pushJob, type PushedDoc } from '../../../../src/library/client/push.ts';
import { RAYCAST_UNAUTHORIZED_HINT } from './settings';

export interface UploadReport {
  docs: PushedDoc[]; // 올린 문서 (문서 id마다 하나)
  notes: string[]; // "이름 — 원본에 없음: img/a.png"
  failures: string[]; // "이름: 이유"
}

export interface UploadOptions {
  home: string;
  server: string;
  token: string;
  fetch?: typeof fetch;
  onStatus?: (text: string) => void; // 진행 글 ("notes.md (1/2)", "notes.md (1/2) · 파일 3/5")
}

export async function uploadPaths(paths: readonly string[], options: UploadOptions): Promise<UploadReport> {
  const docs = new Map<string, PushedDoc>();
  const notes: string[] = [];
  const failures: string[] = [];
  const plans = await planPush(paths, { home: options.home });

  const jobCount = plans.reduce((sum, plan) => sum + (plan.ok ? plan.jobs.length : 0), 0);
  let jobIndex = 0;
  for (const plan of plans) {
    const name = basename(plan.target).normalize('NFC');
    if (!plan.ok) {
      failures.push(`${name}: ${describePlanError(plan.error)}`);
      continue;
    }
    for (const note of plan.notes) notes.push(`${name} — ${describeNote(note)}`);
    for (const job of plan.jobs) {
      jobIndex += 1;
      const label = `${job.fileName} (${jobIndex}/${jobCount})`;
      options.onStatus?.(label);
      try {
        const doc = await pushJob(job, {
          server: options.server,
          token: options.token,
          fetch: options.fetch,
          onProgress: (sent, total) => options.onStatus?.(`${label} · 파일 ${sent}/${total}`),
        });
        docs.set(doc.id, doc);
      } catch (error) {
        failures.push(`${job.fileName}: ${describeApiError(error, options.server, RAYCAST_UNAUTHORIZED_HINT)}`);
      }
    }
  }
  return { docs: [...docs.values()], notes, failures };
}
