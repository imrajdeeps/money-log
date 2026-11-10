// Serves the e2e build (npm run e2e:build) together with the stand-in Supabase API on one origin, for browser checks.
import { fileURLToPath } from 'node:url';
import { startMock } from './mock-supabase.ts';

const dir = fileURLToPath(new URL('../../dist-e2e/', import.meta.url));
const mock = await startMock({ staticDir: dir, port: 54380 });
console.log(`Money Log e2e server on ${mock.url}  (sign-in code: ${mock.state.otp})`);
