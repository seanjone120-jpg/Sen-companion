/* ============================================================
   SUPABASE CLIENT CONFIG
   Replace the two values below with your own project's values.
   Find them in: Supabase Dashboard → Project Settings → API
   ============================================================ */

const SUPABASE_URL = 'https://vjcgqqclrejflhqbahaj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CBeX9Hf2Ty3Qy3v9K0Hd0A_pAcB5bOl';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
