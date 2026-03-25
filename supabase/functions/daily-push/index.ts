// Supabase Edge Function: daily-push
// 매일 아침 10시(KST) 실행 → 10일 내 발송 예정 고객 푸시 알림

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VERCEL_URL   = 'https://baby-haus-react-db.vercel.app'

serve(async () => {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  // 10일 내 발송 예정 고객 조회
  const { data: custs } = await sb.from('customers').select('*').eq('deleted', false)
  const today = new Date(); today.setHours(0,0,0,0)
  const urgent: any[] = []

  custs?.forEach((c: any) => {
    const gifts = Array.isArray(c.gifts) ? c.gifts : []
    gifts.forEach((g: any) => {
      if (!g.sent && g.date) {
        const d = Math.round((new Date(g.date).getTime() - today.getTime()) / 86400000)
        if (d >= 0 && d <= 10) urgent.push({ c, g, d })
      }
    })
  })

  if (urgent.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }))
  }

  // 푸시 구독 목록 조회
  const { data: subs } = await sb.from('push_subscriptions').select('subscription')
  if (!subs?.length) return new Response(JSON.stringify({ ok: true, sent: 0 }))

  // 메시지 구성
  const names = [...new Set(urgent.map((x: any) => x.c.name))].slice(0, 3).join(', ')
  const title = '🎁 선물 발송 알림 · BABY HAÜS'
  const body  = `D-10 이내 발송 예정 ${urgent.length}건 · ${names}${urgent.length > 3 ? ' 외' : ''}`

  // Vercel API로 푸시 발송
  const results = await Promise.allSettled(
    subs.map(row =>
      fetch(`${VERCEL_URL}/api/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: row.subscription, title, body, tag: 'gift-reminder' })
      })
    )
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  return new Response(JSON.stringify({ ok: true, sent, total: subs.length }))
})
