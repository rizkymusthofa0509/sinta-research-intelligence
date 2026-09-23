import { Router } from 'express';
import { count, journalProfile, meta, search, searchStream } from '../controllers/searchController.js';

const router = Router();

router.get('/search', search);
router.get('/search/stream', searchStream);
router.get('/meta', meta);
router.get('/journal-profile', journalProfile);
router.get('/count', count);

export default router;
