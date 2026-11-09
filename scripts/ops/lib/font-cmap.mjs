// 글꼴 파일(OTF·TTF)이 그릴 수 있는 글자(코드 포인트) 집합을 읽는다 (재건 4단계 D13)
// - OG 글꼴 서브셋 스크립트가 원본 글꼴과 서브셋의 글자 범위를 견줄 때 쓴다.
// - sfnt의 cmap 표에서 유니코드 하위 표(형식 4, 12)만 읽는다. 다른 형식은 건너뛴다.
// - 의존성 없이 Buffer만 쓴다. 글꼴을 고치지 않는다(읽기만).

// cmap 하위 표 형식 4: 16비트 범위 묶음
function readFormat4(buf, offset, out) {
  const segCountX2 = buf.readUInt16BE(offset + 6);
  const segCount = segCountX2 / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + segCountX2 + 2;
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;
  for (let i = 0; i < segCount; i += 1) {
    const end = buf.readUInt16BE(endCodes + i * 2);
    const start = buf.readUInt16BE(startCodes + i * 2);
    const delta = buf.readInt16BE(idDeltas + i * 2);
    const rangeOffsetPos = idRangeOffsets + i * 2;
    const rangeOffset = buf.readUInt16BE(rangeOffsetPos);
    for (let code = start; code <= end && code !== 0xffff; code += 1) {
      let glyph;
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        const glyphPos = rangeOffsetPos + rangeOffset + (code - start) * 2;
        glyph = buf.readUInt16BE(glyphPos);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(code);
    }
  }
}

// cmap 하위 표 형식 12: 32비트 범위 묶음
function readFormat12(buf, offset, out) {
  const groups = buf.readUInt32BE(offset + 12);
  for (let i = 0; i < groups; i += 1) {
    const base = offset + 16 + i * 12;
    const start = buf.readUInt32BE(base);
    const end = buf.readUInt32BE(base + 4);
    const startGlyph = buf.readUInt32BE(base + 8);
    for (let code = start; code <= end; code += 1) {
      if (startGlyph + (code - start) !== 0) out.add(code);
    }
  }
}

// 글꼴 파일 Buffer → 그릴 수 있는 코드 포인트 Set
export function readCmapCodePoints(buf) {
  const numTables = buf.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    if (buf.toString('latin1', record, record + 4) === 'cmap')
      cmapOffset = buf.readUInt32BE(record + 8);
  }
  if (cmapOffset < 0) throw new Error('cmap 표가 없습니다');
  const out = new Set();
  const subtables = buf.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < subtables; i += 1) {
    const record = cmapOffset + 4 + i * 8;
    const platform = buf.readUInt16BE(record);
    const encoding = buf.readUInt16BE(record + 2);
    // 유니코드 하위 표만: (0, *) 또는 (3, 1)·(3, 10)
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    const offset = cmapOffset + buf.readUInt32BE(record + 4);
    const format = buf.readUInt16BE(offset);
    if (format === 4) readFormat4(buf, offset, out);
    else if (format === 12) readFormat12(buf, offset, out);
  }
  return out;
}
