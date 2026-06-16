// Server-side Supabase client for Vercel API routes.
// Uses the same env vars as the frontend (VITE_ prefix is fine on the server too).
// The _ prefix means Vercel does NOT expose this as a serverless function endpoint.

/* global process */

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

export const db = (url && key) ? createClient(url, key) : null;
