import chalk from 'chalk';

export const theme = {
  green:  chalk.hex('#3fb950'),
  blue:   chalk.hex('#58a6ff'),
  amber:  chalk.hex('#d29922'),
  red:    chalk.hex('#f85149'),
  purple: chalk.hex('#bc8cff'),
  cyan:   chalk.hex('#39c5cf'),
  dim:    chalk.hex('#484f58'),
  white:  chalk.hex('#f0f6fc'),
  fg:     chalk.hex('#c9d1d9'),
} as const;

/** Map block status → color name for ink <Text color="..."> */
export function statusColor(status: string): string {
  switch (status) {
    case 'active':   return 'green';
    case 'cooling':  return 'yellow';
    case 'cold':     return 'blue';
    case 'archived': return 'gray';
    default:         return 'white';
  }
}

/** Map annotation nature → color name */
export function annotationColor(annotation: string): string {
  if (annotation.startsWith('决策')) return 'green';
  if (annotation.startsWith('事实')) return 'blue';
  if (annotation.startsWith('知识')) return 'yellow';
  if (annotation.startsWith('指令')) return 'magenta';
  return 'gray';
}
