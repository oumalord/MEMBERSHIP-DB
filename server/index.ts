import { createServer } from 'node:http';
import { handle, init } from './app';

const PORT = Number(process.env.API_PORT || 8787);

await init();
createServer(handle).listen(PORT, '127.0.0.1', () => console.log(`KGGA API listening on http://127.0.0.1:${PORT}`));
