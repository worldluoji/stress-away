/**
 * API helper: 从服务端会话 cookie 解析当前用户身份。
 * 每个需要鉴权的 API route 顶部调用（await getAuthContext(request)）。
 * 注意：绝不信任客户端自报的 uid 头——身份唯一来源是验签后的会话。
 */
import { getCurrentUser, type UserRole } from './user-auth';

export interface AuthContext {
  uid: string | null;
  deviceId: string | null;
  role: UserRole | null;
  isLoggedIn: boolean;
}

export async function getAuthContext(request: Request): Promise<AuthContext> {
  const user = await getCurrentUser();
  const deviceId = request.headers.get('x-device-id') || null;

  return {
    uid: user?.id ?? null,
    deviceId,
    role: user?.role ?? null,
    isLoggedIn: !!user,
  };
}
