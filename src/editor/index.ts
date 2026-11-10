// 에디터 패키지 공개 API (재건 3단계 Plan 4.1)
// - createEditorExtensions: 스키마(DOM 없이 돈다). 변환기·왕복 검사가 쓴다.
// - markdownToDoc·docToMarkdown: 마크다운 변환기.
// - EditorApp: 에디터 화면 루트(React). 관리자 앱(src/admin/AdminApp.tsx)이 /admin/edit/<id>에서 늦게 받아 그린다(5단계 D9).
// - Node 스크립트는 이 파일이 아니라 extensions·markdown 모듈을 직접 가져온다(React를 싣지 않기 위해서다).

export { createEditorExtensions } from './extensions/index.ts';
export { docToMarkdown, markdownToDoc, type ConversionWarning } from './markdown/index.ts';
export { default as EditorApp } from './ui/EditorApp';
