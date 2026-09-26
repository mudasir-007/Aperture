// apps/api/src/routes/auth.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { registerUser, loginUser, getCurrentUser } from '../services/auth.service';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate'; // Your custom middleware

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  organizationName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Use the validate middleware here
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const result = await registerUser(req.body); // req.body is now validated
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const result = await loginUser(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await getCurrentUser(req.user!.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;