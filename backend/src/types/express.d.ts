import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: {
        user_id: string;
        phone: string;
        type: string;
        iat?: number;
        exp?: number;
      };
      language?: 'ar' | 'fr' | 'en';
      startTime?: number;
    }
  }
}