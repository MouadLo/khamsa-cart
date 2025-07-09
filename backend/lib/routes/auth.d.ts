import { Request, Response, NextFunction } from "express";
declare const router: import("express-serve-static-core").Router;
declare function authenticateToken(req: Request, res: Response, next: NextFunction): void;
export { authenticateToken };
export default router;
