// 서가 문서 주소의 QR 코드 (서가 1단계 T6, Plan J20·분석 8.3 제안 4)
// - QR에는 서가 문서 주소(J7, /admin/library/d/{문서 id})만 담는다. 문서 출처 주소는 담지 않는다(쿠키가 없으면 404).
// - 서가 화면은 SVG를 쓴다. 맥 명령(터미널 글자)과 Raycast(이미지)는 T8·T9에서 같은 패키지로 만든다.

import QRCode from 'qrcode';
import { libraryDocUrl } from './store';

// 서가 문서 주소의 QR 코드 SVG
// - 오류 정정 M: 화면에서 찍는 용도라 가장 흔한 단계로 둔다
// - 여백 2칸: 어두운 화면에서도 카메라가 테두리를 찾게 한다(흰 바탕은 SVG가 칠한다)
export async function libraryDocQrSvg(siteOrigin: string, docId: string): Promise<string> {
  return QRCode.toString(libraryDocUrl(siteOrigin, docId), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
}
