// 문서 출처 경로 /d/** 의 라우트 (문서 서가 1단계, 사용자 결정 2026-11-17)
// - Vercel은 라우트가 없는 경로를 서버 함수로 보내지 않고 정적 404를 준다.
//   이 라우트가 있어야 문서 출처(raw.cruzlab.dev/d/…) 요청이 함수와 미들웨어에 닿는다.
// - 문서 출처 호스트의 요청은 미들웨어가 먼저 처리하고 여기까지 오지 않는다.
// - 여기까지 오는 요청은 블로그 호스트의 /d/** 다. 문서를 주지 않고 404다.

import type { APIRoute } from 'astro';
import { libraryOffResponse } from '@/library/server/raw';

export const prerender = false;

export const ALL: APIRoute = () => libraryOffResponse();
