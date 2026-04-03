import type { Block } from '../models/index.js';
import { ConflictDetector, type ConflictReminder } from '../engine/conflict-detector.js';

export function detectConflictReminder(
  newContent: string,
  existingBlocks: Block[],
): ConflictReminder | null {
  const detector = new ConflictDetector();
  return detector.detect(newContent, existingBlocks);
}
