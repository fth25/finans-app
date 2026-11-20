function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export async function onRequestPost({ request, env }) {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/+$/, '');
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get('Authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Hesap silme servisi yapılandırılmamış.' }, 503);
  }
  if (!accessToken) {
    return jsonResponse({ error: 'Oturum açmanız gerekiyor.' }, 401);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!userResponse.ok) {
    return jsonResponse({ error: 'Oturum doğrulanamadı. Yeniden giriş yapın.' }, 401);
  }

  const user = await userResponse.json();
  if (
    typeof user.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
  ) {
    return jsonResponse({ error: 'Hesap bilgisi doğrulanamadı.' }, 502);
  }

  const deleteResponse = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  );

  if (!deleteResponse.ok) {
    console.error('Supabase account deletion failed:', deleteResponse.status);
    return jsonResponse({ error: 'Hesap silinemedi. Lütfen daha sonra tekrar deneyin.' }, 502);
  }

  return jsonResponse({ ok: true });
}
