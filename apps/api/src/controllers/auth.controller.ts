import { Request, Response, NextFunction } from 'express';
import { EmailAlreadyRegisteredError, InvalidCredentialsError, loginUser, registerUser } from '../services/auth.service';
import { HttpError } from '../middleware/errorHandler';
import { camelizeKeys } from '../utils/serialization';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await registerUser(req.body);
    res.status(201).json(camelizeKeys(result));
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) {
      next(new HttpError(409, error.message));
      return;
    }
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await loginUser(req.body);
    res.status(200).json(camelizeKeys(result));
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      next(new HttpError(401, error.message));
      return;
    }
    next(error);
  }
}
