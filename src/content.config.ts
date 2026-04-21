import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 블로그 포스트 컬렉션
const blog = defineCollection({
  loader: glob({ base: './content/posts', pattern: '**/*.{md,mdx}' }),
  schema: () =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      heroImage: z.string().optional(),
      heroVideo: z.string().optional(),
      tags: z.array(z.string()).default([]),
      slug: z.string().optional(),
      readingTime: z.number().optional(),
      isPublic: z.boolean().default(true),
    }),
});

// 프로젝트 메타데이터 컬렉션: 카드, 대표 이미지, 기술 스택만 담당한다.
// 실제 프로젝트 글 본문은 projectPosts 컬렉션을 단일 출처로 사용한다.
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      longDescription: z.string().optional(),
      overviewLabel: z.string().optional(),
      overviewTitle: z.string().optional(),
      overviewDescription: z.string().optional(),
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
});

const projectPosts = defineCollection({
  loader: glob({ base: './src/content/project-posts', pattern: '**/*.{md,mdx}' }),
  schema: () =>
    z.object({
      title: z.string(),
      description: z.string(),
      project: z.string(),
      order: z.number().default(1),
      chapterLabel: z.string().optional(),
      status: z.enum(['draft', 'published']).default('published'),
    }),
});

export const collections = { blog, projects, projectPosts };
