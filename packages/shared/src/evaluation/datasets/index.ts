// Embedded benchmark datasets (spec §22). Add new datasets here to ship with the app.
import type { EmbeddedDataset } from '../datasets.ts';
import { trailAgentV1Dataset } from './trail-agent-v1.ts';

export const embeddedDatasets: EmbeddedDataset[] = [
  {
    id: 'trail-agent-v1',
    version: '1.0.0',
    load: () => trailAgentV1Dataset,
  },
];