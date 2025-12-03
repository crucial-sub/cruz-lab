// Firebase Firestore REST API를 사용한 서버사이드 포스트 조회
// SSR에서 SEO 메타데이터를 위해 사용

export interface PostMeta {
  id: string;
  title: string;
  description: string;
  heroImage: string;
  tags: string[];
  slug: string;
  pubDate: string;
  readingTime: number;
}

// Firestore REST API 기본 URL
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${import.meta.env.PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Firestore 문서 값을 JavaScript 값으로 변환
function parseFirestoreValue(value: any): any {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return parseInt(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }
  if (value.mapValue !== undefined) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
      result[k] = parseFirestoreValue(v);
    }
    return result;
  }
  return null;
}

// Firestore 문서를 PostMeta로 변환
function documentToPostMeta(doc: any): PostMeta | null {
  if (!doc.fields) return null;

  const fields = doc.fields;
  const name = doc.name as string;
  const id = name.split('/').pop() || '';

  return {
    id,
    title: parseFirestoreValue(fields.title) || '',
    description: parseFirestoreValue(fields.description) || '',
    heroImage: parseFirestoreValue(fields.heroImage) || '',
    tags: parseFirestoreValue(fields.tags) || [],
    slug: parseFirestoreValue(fields.slug) || id,
    pubDate: parseFirestoreValue(fields.pubDate) || new Date().toISOString(),
    readingTime: parseFirestoreValue(fields.readingTime) || 0,
  };
}

// slug로 포스트 메타데이터 가져오기 (서버사이드용)
export async function getPostMetaBySlug(slug: string): Promise<PostMeta | null> {
  try {
    // Firestore REST API 쿼리
    const queryUrl = `${FIRESTORE_BASE_URL}:runQuery`;

    const response = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'posts' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: 'slug' },
                    op: 'EQUAL',
                    value: { stringValue: slug },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: 'status' },
                    op: 'EQUAL',
                    value: { stringValue: 'published' },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: 'isPublic' },
                    op: 'EQUAL',
                    value: { booleanValue: true },
                  },
                },
              ],
            },
          },
          limit: 1,
        },
      }),
    });

    if (!response.ok) {
      console.error('Firestore query failed:', response.status);
      return null;
    }

    const results = await response.json();

    // 결과가 없는 경우
    if (!results || results.length === 0 || !results[0].document) {
      return null;
    }

    return documentToPostMeta(results[0].document);
  } catch (error) {
    console.error('Error fetching post meta:', error);
    return null;
  }
}
