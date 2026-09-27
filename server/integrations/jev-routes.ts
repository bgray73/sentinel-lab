import type { Express } from 'express';
import type { MonitoringService } from '../monitoring/service.js';
import { JevService } from './jev.js';

export function registerJevRoutes(app: Express, monitoring?: MonitoringService, jev = new JevService()) {
  app.get('/api/integrations/jev', (_req, res) => res.json(jev.status()));
  app.post('/api/integrations/jev/incidents/:id/analyze', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    await monitoring.ready;
    const incident = monitoring.incidents().find(item => item.id === req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    if (incident.status === 'resolved') return res.status(409).json({ error: 'Select an active incident' });
    try { return res.json(await jev.analyze(incident, monitoring.list().find(item => item.id === incident.monitorId))); }
    catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : 'Jev analysis unavailable' }); }
  });
}
