type Colorizer = (text: string) => string;

export interface BannerOptions {
  subtitle?: string;
  width?: number;
  color?: Colorizer;
}

const DEFAULT_WIDTH = 42;

const center = (text: string, width: number): string => {
  if (text.length >= width) {
    return text;
  }

  const totalPadding = width - text.length;
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return `${' '.repeat(leftPadding)}${text}${' '.repeat(rightPadding)}`;
};

export function renderBanner(title: string, options: BannerOptions = {}): string {
  const { subtitle, width = DEFAULT_WIDTH, color } = options;
  const line = '═'.repeat(width);
  const applyColor = color ?? ((value: string) => value);

  const lines = [
    '',
    applyColor(line),
    applyColor(center(title, width)),
    applyColor(line),
  ];

  if (subtitle) {
    lines.push('', subtitle);
  }

  lines.push('');

  return lines.join('\n');
}

export function printBanner(title: string, options: BannerOptions = {}): void {
  console.log(renderBanner(title, options));
}
