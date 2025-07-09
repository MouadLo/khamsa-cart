export interface User {
    user_id: string;
    name: string;
    phone: string;
    email?: string;
    type: "customer" | "admin" | "manager" | "delivery";
    is_guest: boolean;
    is_active: boolean;
}
export interface AuthenticatedRequest extends Request {
    user: User;
}
