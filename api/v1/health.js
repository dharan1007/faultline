import { handleHealth } from '../../server/api-handlers.js';
import { toVercelRoute } from '../../server/vercel-adapter.js';

export default toVercelRoute(handleHealth,{maxBytes:1024});
