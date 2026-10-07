import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(root,'copilot-site'));
process.argv=[process.execPath,path.join(root,'copilot-site','scripts','run-framework.mjs'),'dev'];
await import('./copilot-site/scripts/run-framework.mjs');
