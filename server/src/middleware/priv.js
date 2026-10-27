import { ah } from '../utils/ah.js';
import { isUnlocked } from '../utils/pin.js';

// sets req.privOk = true when private folders may be opened (no PIN configured, or PIN entered)
export const privGate = ah(async (req, res, next) => { req.privOk = await isUnlocked(req); next(); });
