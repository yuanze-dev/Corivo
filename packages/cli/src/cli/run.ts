import chalk from 'chalk';
import { createProgram } from './index.js';

const program = createProgram();

program.parseAsync().catch((error) => {
  if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
});
