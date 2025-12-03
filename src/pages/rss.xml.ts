// RSS 피드 생성 - Firebase에서 포스트 가져오기
export const prerender = false; // SSR로 동적 생성

import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

// Firestore REST API로 포스트 가져오기
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${import.meta.env.PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`;

interface RSSPost {
  title: string;
  description: string;
  pubDate: Date;
  slug: string;
}

function parseFirestoreValue(value: any): any {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return parseInt(value.integerValue);
  if (value.timestampValue !== undefined) return new Date(value.timestampValue);
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }
  return null;
}

async function getPublishedPostsForRSS(): Promise<RSSPost[]> {
  try {
    const queryUrl = `${FIRESTORE_BASE_URL}:runQuery`;

    const response = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'posts' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
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
          orderBy: [{ field: { fieldPath: 'pubDate' }, direction: 'DESCENDING' }],
          limit: 50,
        },
      }),
    });

    if (!response.ok) return [];

    const results = await response.json();

    return results
      .filter((r: any) => r.document)
      .map((r: any) => {
        const fields = r.document.fields;
        return {
          title: parseFirestoreValue(fields.title) || '',
          description: parseFirestoreValue(fields.description) || '',
          pubDate: parseFirestoreValue(fields.pubDate) || new Date(),
          slug: parseFirestoreValue(fields.slug) || '',
        };
      });
  } catch (error) {
    console.error('RSS fetch error:', error);
    return [];
  }
}

export async function GET(context: APIContext) {
  const posts = await getPublishedPostsForRSS();

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site || 'https://cruz-lab.vercel.app',
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: post.pubDate,
      link: `/blog/${post.slug}/`,
    })),
  });
}
