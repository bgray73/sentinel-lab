import { resolve } from 'node:path';
import { createApp } from './app.js';
import { Store } from './store.js';

const port = Number(process.env.PORT || 4100);
const store = new Store(process.env.DATABASE_PATH || resolve('data/sentinel.db'));
createApp(store).listen(port, '0.0.0.0', () => console.log(`Sentinel API listening on port ${port}`));
