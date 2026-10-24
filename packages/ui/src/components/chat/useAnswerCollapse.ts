import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '@finagent/core';

/** Flatten renderer wrappers, keeping paragraphs, tables and financial blocks intact. */
function answerBlocks(element: HTMLElement): HTMLElement[] {
  return Array.from(element.children).flatMap((child) => {
    if (!(child instanceof HTMLElement)) return [];
    return child.classList.contains('markdown-content') ? answerBlocks(child) : [child];
  });
}

function previewHeight(element: HTMLElement): number | null {
  const bounds = element.getBoundingClientRect();
  const markdown = element.querySelector('.markdown-content') ?? element;
  const lineHeight = Number.parseFloat(getComputedStyle(markdown).lineHeight) || 30;
  if (bounds.height <= Math.max(360, lineHeight * 12)) return null;
  const target = Math.round(lineHeight * 9);
  const blocks = answerBlocks(element).filter((block) => block.getBoundingClientRect().height > 0);
  let last = -1;
  for (let index = 0; index < blocks.length; index += 1) {
    if (blocks[index].getBoundingClientRect().bottom - bounds.top > target) break;
    last = index;
  }
  // Do not leave a new section heading or separator dangling after the preview.
  while (last > 0 && /^(H[1-6]|HR)$/.test(blocks[last].tagName)) last -= 1;
  const onlyHeading = last === 0 && /^H[1-6]$/.test(blocks[0].tagName);
  const next = blocks[last + 1];
  if ((last === -1 || onlyHeading) && next && /^(P|BLOCKQUOTE)$/.test(next.tagName)) {
    // Bound unusually long paragraphs by rendered lines, without slicing Markdown.
    const start = next.getBoundingClientRect().top - bounds.top;
    return Math.min(bounds.height, start + Math.max(1, Math.floor((target - start) / lineHeight)) * lineHeight);
  }
  // Oversized tables/charts move below the fold as a whole.
  return last >= 0 ? Math.ceil(blocks[last].getBoundingClientRect().bottom - bounds.top) : 0;
}

export function useAnswerCollapse({ message, enabled, expanded, onExpandedChange }: {
  message: Message;
  enabled: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const contentId = useId();
  const turnRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const pendingScroll = useRef<{ scroller: HTMLElement; scrollTop: number; collapsing: boolean } | null>(null);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!enabled || !element) return;
    let active = true;
    const measure = () => { if (active) setHeight(previewHeight(element)); };
    measure();
    // Observe unclipped inner content, avoiding resize loops when its parent folds.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    element.addEventListener('load', measure, true);
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => {
      active = false;
      observer?.disconnect();
      element.removeEventListener('load', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [message, enabled]);

  const collapsible = enabled && height !== null;
  const collapsed = collapsible && !expanded;

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element || !collapsed || height === null) return;
    const cutoff = element.getBoundingClientRect().top + height;
    const concealed: HTMLElement[] = [];
    const conceal = (node: HTMLElement) => {
      if (node.hasAttribute('inert') || node.hasAttribute('aria-hidden')) return;
      node.setAttribute('inert', '');
      node.setAttribute('aria-hidden', 'true');
      concealed.push(node);
    };
    // Clipping alone leaves offscreen links/buttons in keyboard and screen-reader order.
    for (const block of answerBlocks(element)) {
      const bounds = block.getBoundingClientRect();
      if (bounds.top >= cutoff - 0.5) conceal(block);
      else if (bounds.bottom > cutoff) {
        for (const target of Array.from(block.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]'))) {
          if (target.getBoundingClientRect().bottom > cutoff) conceal(target);
        }
      }
    }
    return () => {
      for (const node of concealed) {
        node.removeAttribute('inert');
        node.removeAttribute('aria-hidden');
      }
    };
  }, [collapsed, height, message]);

  useLayoutEffect(() => {
    const pending = pendingScroll.current;
    const turn = turnRef.current;
    if (!pending || !turn) return;
    pendingScroll.current = null;
    if (pending.collapsing) {
      turn.querySelector<HTMLButtonElement>('[data-testid="answer-toggle"]')?.focus({ preventScroll: true });
      pending.scroller.scrollTop += turn.getBoundingClientRect().top - pending.scroller.getBoundingClientRect().top - 16;
    } else pending.scroller.scrollTop = pending.scrollTop;
  }, [expanded]);

  const toggle = () => {
    const scroller = turnRef.current?.closest<HTMLElement>('.trail-agent-body');
    if (scroller) pendingScroll.current = { scroller, scrollTop: scroller.scrollTop, collapsing: expanded };
    onExpandedChange(!expanded);
  };
  return { contentId, turnRef, contentRef, collapsible, collapsed, height, toggle };
}
