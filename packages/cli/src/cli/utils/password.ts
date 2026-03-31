/**
 * Password input utility
 *
 * Provides hidden (masked) password input for interactive terminal sessions.
 */

import * as readline from 'node:readline';

/**
 * Read hidden password input
 *
 * Hide input characters using TTY raw mode
 *
 * @param prompt - prompt text
 * @param options - options
 * @param options.allowEmpty - whether to allow empty passwords (for non-interactive environments)
 * @returns The password entered by the user
 */
export function readPassword(prompt: string, options: { allowEmpty?: boolean } = {}): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    // Check if you are in a TTY environment
    if (!process.stdin.isTTY) {
      // Non-TTY environments (such as tests, pipelines, Claude Code)
      if (options.allowEmpty) {
        // Allow empty passwords, return to default
        resolve('');
        return;
      }
      // Otherwise try a normal read
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

    // TTY environment: hide input using raw mode
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
      } else if (code >= 32) { // Printable characters
        password += char;
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Read y/n to confirm input
 *
 * @param prompt - prompt text (without [y/N])
 * @param defaultNo - whether the default value is No (true = pressing Enter treats No)
 */
export function readConfirm(prompt: string, defaultNo = true): Promise<boolean> {
  return new Promise((resolve) => {
    const hint = defaultNo ? '[y/N]' : '[Y/n]';
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${prompt} ${hint}: `, (answer: string) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (defaultNo) {
        resolve(normalized === 'y' || normalized === 'yes');
      } else {
        resolve(normalized !== 'n' && normalized !== 'no');
      }
    });
  });
}
