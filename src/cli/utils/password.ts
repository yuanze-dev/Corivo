/**
 * 密码输入工具
 *
 * 提供隐藏的密码输入功能
 */

import * as readline from 'node:readline';

/**
 * 读取隐藏的密码输入
 *
 * 使用TTY原始模式隐藏输入字符
 *
 * @param prompt - 提示文本
 * @returns 用户输入的密码
 */
export function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    // 检查是否在TTY环境中
    if (!process.stdin.isTTY) {
      // 非TTY环境（如测试、管道），使用普通读取
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(prompt, (password: string) => {
        rl.close();
        resolve(password);
      });
      return;
    }

    // TTY环境：使用原始模式隐藏输入
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';
    const onData = (char: string) => {
      const code = char.charCodeAt(0);

      if (code === 13) { // Enter
        stdout.write('\n');
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        resolve(password);
      } else if (code === 3) { // Ctrl+C
        stdout.write('^C\n');
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        process.exit(1);
      } else if (code === 127 || code === 8) { // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
        }
      } else if (code >= 32) { // 可打印字符
        password += char;
      }
    };

    stdin.on('data', onData);
  });
}
