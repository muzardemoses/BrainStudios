import { Router, type IRouter } from 'express';
import healthRouter from './health';
import videoRouter from '../video/routes';
const router: IRouter = Router();
router.use(healthRouter);
// Legacy movie routes are intentionally unmounted: they were unauthenticated
// and do not belong to the new product. Their tables remain untouched.
router.use(videoRouter);
export default router;
