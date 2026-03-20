import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    identityId?: string;
  }
}
