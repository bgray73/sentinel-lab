import { resolve } from 'node:path';
import { createApp } from './app.js';
import { MonitoringService } from './monitoring/service.js';
import { Store } from './store.js';
import {TelemetryService} from './telemetry/service.js';
import { CmdbService } from './cmdb/service.js';
import { LokiService } from './logging/service.js';

const port = Number(process.env.PORT || 4100);
const store = new Store(process.env.DATABASE_PATH || resolve('data/sentinel.db'));
const monitoring = new MonitoringService();
const telemetry=new TelemetryService();
const cmdb = new CmdbService(process.env, monitoring);
const logs = new LokiService();
createApp(store, monitoring, telemetry, cmdb, logs).listen(port, '0.0.0.0', () => console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'sentinel-api', message: 'api_started', port })));
