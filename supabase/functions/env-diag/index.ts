Deno.serve(() => {
  const sr = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const ak = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  return new Response(JSON.stringify({
    sr_len: sr.length, sr_prefix: sr.slice(0, 8),
    ak_len: ak.length, ak_prefix: ak.slice(0, 8),
    keys: Object.keys(Deno.env.toObject()).filter(k => k.startsWith('SUPABASE')),
  }));
});
