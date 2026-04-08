/**
 * Identity module
 *
 * Provides platform-fingerprint-based user identification and cross-device association.
 *
 * Sub-modules:
 * - fingerprint: fingerprint collection and matching
 * - identity: identity lifecycle management
 * - collector: dynamic fingerprint collector
 * - auth: identity authentication (highest trust level)
 */

export * from './fingerprint.js';
export * from './identity.js';
export * from './collector.js';
export * from './auth.js';
