import NextAuth from 'next-auth';

import { authConfig } from '@/app/(auth)/auth.config';

// Auth is handled by NextAuth. Supabase is used as a data/Edge Function
// client only — not for session management — so updateSession is not called here.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ['/', '/:id', '/api/:path*', '/login', '/register'],
};
