import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 블로그 포스트 컬렉션
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      heroImage: image().optional(),
      tags: z.array(z.string()).default([]),
    }),
});

// 프로젝트 컬렉션
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
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
});

export const collections = { blog, projects };
