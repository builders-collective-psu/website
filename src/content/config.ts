import { defineCollection, z } from "astro:content";

/**
 * Blog posts: one Markdown file per post in src/content/blog/. The file name
 * becomes the URL (/blog/<file-name>). Set `draft: true` to keep a post off
 * the site while it is being written.
 */
const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    author: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
