// Supabase Edge Function: send-push
// 배포 위치: supabase/functions/send-push/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const VAPID_PUBLIC  = 'BKWzJf5mFTh57wdROQ5yHXPF--qDhm5mrO-wjyArI8XGSlbWmS8Ag-HxtCWesW_NNHxfbRIrh_RfrjIDuVeMm3Q'
const VAPID_PRIVATE = 'jpFIMi3qwv6R1jZy1-723sYT-fZUafv0K70_HSco2Ck'
const VAPID_SUBJECT = 'mailto:admin@babyhaus.kr'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*' } })
  }
  try {
    const { subscription, title, body } = await req.json()
    // webpush via fetch to push service
    const payload = JSON.stringify({ title, body })
    // Build VAPID auth header
    const pushEndpoint = subscription.endpoint
    // Use web-push compatible approach
    const response = await fetch(pushEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'TTL': '86400',
      },
      body: payload,
    })
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
    })
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status:500, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' } })
  }
})
