import '@milkdown/kit/prose/view/style/prosemirror.css';
import '@milkdown/kit/prose/tables/style/tables.css';
import { defaultValueCtx, Editor, editorViewCtx, rootCtx } from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history } from '@milkdown/kit/plugin/history';
import { commonmark, headingIdGenerator, imageSchema } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { Plugin } from '@milkdown/kit/prose/state';
import { $prose, $view, getMarkdown } from '@milkdown/kit/utils';

export const slugify = (text) =>
  text.trim().toLowerCase().replace(/[^\p{Letter}\p{Number}\s-]/gu, '').replace(/\s+/g, '-');

const onDocChange = (callback) =>
  $prose(() => new Plugin({ view: () => ({ update: (view, previous) => view.state.doc.eq(previous.doc) || callback() }) }));

const imageResolvedAgainst = (fileUrl) =>
  $view(imageSchema.node, () => (node) => {
    const img = document.createElement('img');
    img.src = new URL(node.attrs.src, fileUrl).href;
    img.alt = node.attrs.alt;
    if (node.attrs.title) img.title = node.attrs.title;
    return { dom: img };
  });

export async function createEditor(root, markdown, { fileUrl, onChange }) {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
      ctx.set(headingIdGenerator.key, (node) => slugify(node.textContent));
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(clipboard)
    .use(onDocChange(onChange))
    .use(imageResolvedAgainst(fileUrl))
    .create();
  return {
    markdown: () => editor.action(getMarkdown()),
    text: () => editor.action((ctx) => ctx.get(editorViewCtx).state.doc.textContent),
    destroy: () => editor.destroy(),
  };
}
