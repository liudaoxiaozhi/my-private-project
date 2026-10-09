// app/api/admin/preview/route.ts —— 编辑器的预览：用和网站一样的渲染管线把 Markdown 转成 HTML
import { adminRoute, fail, json, readJson } from '../../../../lib/server/admin/api';
import { renderArticle } from '../../../../lib/markdown';

export const POST = adminRoute(async (req: Request) => {
  const { markdown } = await readJson<{ markdown?: unknown }>(req);
  if (typeof markdown !== 'string') return fail('缺少内容', 400);
  if (markdown.length > 500_000) return fail('内容太长了', 413);
  const { html, wordCount, readingMinutes } = await renderArticle(markdown);
  return json({ html, wordCount, readingMinutes });
});
