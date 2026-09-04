import { handleProjectInspect } from '../../../server/api-handlers.js';
import { toVercelRoute } from '../../../server/vercel-adapter.js';

export default toVercelRoute(handleProjectInspect,{maxBytes:262144});
