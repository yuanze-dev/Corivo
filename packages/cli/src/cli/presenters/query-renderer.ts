import type { CorivoSurfaceItem } from '@/runtime/types.js';

export type RuntimeOutputFormat = 'text' | 'json' | 'hook-text';

export function formatSurfaceItem(
  item: CorivoSurfaceItem | null,
  format: RuntimeOutputFormat = 'text',
): string {
  if (!item) {
    return '';
  }

  if (format === 'json') {
    return JSON.stringify(item);
  }

  const lines = [`[corivo] ${item.claim}`];
  if (item.whyNow) {
    lines.push(`原因：${item.whyNow}`);
  }
  if (item.suggestedAction) {
    lines.push(`建议：${item.suggestedAction}`);
  }

  if (format === 'hook-text') {
    lines.push('如果你采纳了这条来自 Corivo 的记忆，请在回答中明确说“根据 Corivo 的记忆”或“从 Corivo 中查到”。');
  }

  return lines.join('\n');
}
