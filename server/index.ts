import { resolve } from 'node:path';
import { createApp } from './app.js';
import { MonitoringService } from './monitoring/service.js';
import { Store } from './store.js';

const port = Number(process.env.PORT || 4100);
const store = new Store(process.env.DATABASE_PATH || resolve('data/sentinel.db'));
const monitoring = new MonitoringService();
createApp(store, monitoring).listen(port, '0.0.0.0', () => console.log(`Sentinel API listening on port ${port}`));
