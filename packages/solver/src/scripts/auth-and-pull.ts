import { fetchToken } from '../auth/remote-token.js';

async function main(): Promise<void> {
  const serverUrl = 'http://47.85.108.113:3141';
  const identityId = 'id_04db07be7aa3cdf0'
  const sharedSecret =
    '14889a2e1bcbf2a6f29e6e65b0132f9988c5f3d4cc5d016f1f064978231dc2d6'

  const token = await fetchToken({
    serverUrl,
    identityId,
    sharedSecret,
  });

  console.log(`TOKEN=${token}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
