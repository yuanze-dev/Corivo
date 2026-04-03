import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TokenLifecycleService } from '../application/auth/token-lifecycle-service.js';
import '../types.js';

export function createAuthPreHandler(tokenLifecycleService: TokenLifecycleService) {
  return async function authPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = tokenLifecycleService.authenticateBearer(req.headers.authorization);
    if (!result.ok) {
      if (result.code === 'UNAUTHORIZED') {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }
      reply.code(401).send({ error: 'Invalid or expired token' });
      return;
    }
    req.identityId = result.identityId;
  };
}
