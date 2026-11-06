import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 프로젝트 메타와 프로젝트 포스트를 같은 컬렉션 안에서 관리한다.
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.discriminatedUnion('entryType', [
      z.object({
        entryType: z.literal('project'),
        title: z.string(),
        description: z.string(),
        longDescription: z.string().optional(),
        image: image(),
        tags: z.array(z.string()).default([]),
        tech: z.array(z.string()).default([]),
        github: z.string().url().optional(),
        demo: z.string().url().optional(),
        featured: z.boolean().default(false),
        order: z.number().default(0),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      }),
      z.object({
        entryType: z.literal('post'),
        title: z.string(),
        description: z.string(),
        project: z.string(),
        order: z.number().default(1),
        chapterLabel: z.string().optional(),
        status: z.enum(['draft', 'published']).default('published'),
      }),
    ]),
});

// 블로그 글은 Firestore에서 읽는다(src/lib/content-posts.ts). 여기에는 프로젝트 글만 둔다.
export const collections = { projects };
