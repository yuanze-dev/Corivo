/**
 * SemVer 工具函数
 * 简单的语义化版本比较
 */

/**
 * 解析版本字符串
 */
export function parseSemVer(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * 比较两个版本
 * 返回值: 1 = a > b, 0 = a == b, -1 = a < b
 */
export function compareSemVer(a: string, b: string): number {
  const va = parseSemVer(a);
  const vb = parseSemVer(b);

  if (!va || !vb) return 0;

  if (va.major !== vb.major) {
    return va.major > vb.major ? 1 : -1;
  }

  if (va.minor !== vb.minor) {
    return va.minor > vb.minor ? 1 : -1;
  }

  if (va.patch !== vb.patch) {
    return va.patch > vb.patch ? 1 : -1;
  }

  return 0;
}

/**
 * SemVer 类型
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export default { parseSemVer, compareSemVer };
