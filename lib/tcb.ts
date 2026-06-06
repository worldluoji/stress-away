/**
 * Tencent CloudBase Auth Integration
 *
 * Frontend: init TCB app, get auth instance for login/logout
 * Backend: verify session cookie, extract uid
 */

import cloudbase from '@cloudbase/js-sdk';

// ==================== Types ====================

export interface TCBUser {
  id: string;
  username?: string;
  email?: string;
  phone?: string;
  isAnonymous: boolean;
  createdAt?: number;
  updateAt?: number;
  customUserId?: string;
}

export interface TCBSession {
  openId?: string;
  uid?: string;
  user?: TCBUser;
  accessToken?: string;
}

// Lazy singleton - only initialize on client side
let _app: ReturnType<typeof cloudbase.init> | null = null;
let _auth: ReturnType<ReturnType<typeof cloudbase.init>['auth']> | null = null;

function getApp() {
  if (typeof window === 'undefined') {
    throw new Error('TCB SDK only available on client side');
  }
  if (!_app) {
    const envId = process.env.NEXT_PUBLIC_TCB_ENV_ID;
    if (!envId) {
      throw new Error('NEXT_PUBLIC_TCB_ENV_ID not set');
    }
    _app = cloudbase.init({
      env: envId,
      accessKey: process.env.NEXT_PUBLIC_TCB_ACCESS_KEY || '',
    });
    _auth = _app.auth();
  }
  return _app;
}

export function getAuth() {
  getApp(); // ensure initialized
  if (!_auth) throw new Error('TCB auth not initialized');
  return _auth;
}

// ==================== Auth Operations (Client-side) ====================

/**
 * Check if user is currently logged in
 */
export async function getCurrentUser(): Promise<TCBUser | null> {
  if (typeof window === 'undefined') return null;
  try {
    const auth = getAuth();
    const { data } = await auth.getSession();
    if (data?.session?.user) {
      return data.session.user as unknown as TCBUser;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Send email verification code for registration
 * Returns the verifyOtp function to complete registration
 */
export async function sendEmailCode(
  email: string,
  password: string
): Promise<(code: string) => Promise<{ user: TCBUser; uid: string }>> {
  const auth = getAuth();
  const { data, error } = await auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  if (!data?.verifyOtp) throw new Error('Invalid email registration response');

  // Return a function that calls the verifyOtp from signUp response
  return async (code: string) => {
    const result = await data.verifyOtp!({ token: code });
    if (result.error) throw new Error(result.error.message);
    if (!result.data?.user) throw new Error('Verification failed');
    return { user: result.data.user as unknown as TCBUser, uid: result.data.user.id };
  };
}

/**
 * Password login (email or username)
 */
export async function signInWithPassword(
  identifier: string, // email or username
  password: string
): Promise<{ user: TCBUser; uid: string }> {
  const auth = getAuth();
  const { data, error } = await auth.signInWithPassword({
    username: identifier,
    password,
  });
  if (error || !data?.user) {
    throw new Error(error?.message || 'Login failed');
  }
  return { user: data.user as unknown as TCBUser, uid: data.user.id };
}

/**
 * Log out
 */
export async function signOut(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const auth = getAuth();
    await auth.signOut();
  } catch {
    // ignore
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(
  callback: (user: TCBUser | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const auth = getAuth();
  const handler = auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      callback((session as unknown as TCBSession)?.user as unknown as TCBUser || null);
    } else if (event === 'SIGNED_OUT') {
      callback(null);
    }
  });
  return () => { try { handler.data.subscription.unsubscribe(); } catch {} };
}