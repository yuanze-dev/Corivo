import { describe, expect, it } from 'vitest';
import { renderBanner } from '../../src/utils/banner.js';

describe('renderBanner', () => {
  it('renders a centered banner with subtitle', () => {
    const output = renderBanner('Getting to know you...', {
      subtitle: 'Let me take a look at your workspace...',
    });

    expect(output).toBe(
      [
        '',
        '══════════════════════════════════════════',
        '          Getting to know you...          ',
        '══════════════════════════════════════════',
        '',
        'Let me take a look at your workspace...',
        '',
      ].join('\n')
    );
  });

  it('renders a banner without subtitle spacing noise', () => {
    const output = renderBanner('Corivo Update');

    expect(output).toBe(
      [
        '',
        '══════════════════════════════════════════',
        '              Corivo Update               ',
        '══════════════════════════════════════════',
        '',
      ].join('\n')
    );
  });

  it('supports custom widths for wider command headers', () => {
    const output = renderBanner('Corivo Status', { width: 55 });

    expect(output).toBe(
      [
        '',
        '═══════════════════════════════════════════════════════',
        '                     Corivo Status                     ',
        '═══════════════════════════════════════════════════════',
        '',
      ].join('\n')
    );
  });
});
