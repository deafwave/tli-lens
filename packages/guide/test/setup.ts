import { afterEach } from 'vitest';

// One event-loop turn after each test: back-to-back synchronous tests (modes.test.ts, ~20 s each) otherwise starve the worker of the
// turn it needs to read vitest's RPC replies, and its 60 s timer fails the run with "Timeout calling onTaskUpdate".
afterEach(() => new Promise<void>(r => setImmediate(r)));
