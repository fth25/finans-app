function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export async function onRequestGet({ env }) {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/+$/, '');
  const supabaseAnonKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase bağlantı ayarları tamamlanmamış.' }, 503);
  }

  return jsonResponse({ supabaseUrl, supabaseAnonKey });
}
