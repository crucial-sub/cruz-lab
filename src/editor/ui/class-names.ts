// 조건부 클래스 이어 붙이기 (재건 3단계, 작업 문서 5절 51)
// - prettier-plugin-tailwindcss가 템플릿 문자열 조각의 앞 공백을 지운다. 조건부 클래스는 이 함수로 잇는다.

// 참인 클래스 이름만 공백으로 잇는다
export function classNames(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
