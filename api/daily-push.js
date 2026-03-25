// api/daily-push.js
// Vercel Cron Job: 매일 UTC 01:00 (KST 10:00) 실행
// vercel.json의 crons 설정으로 자동 실행됨

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const SUPABASE_URL  = process.env.SUPABASE_URL || 'https://bbitqqtibpkzoijgvylo.supabase.co'
const SUPABASE_KEY  = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiaXRxcXRpYnBrem9pamd2eWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzYzOTQsImV4cCI6MjA4OTkxMjM5NH0.MXoSMJCv7KmCt57KHVCOTRBIwbr8r-f8VBKlHE7v6pc'
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC || 'BKWzJf5mFTh57wdROQ5yHXPF--qDhm5mrO-wjyArI8XGSlbWmS8Ag-HxtCWesW_NNHxfbRIrh_RfrjIDuVeMm3Q'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'jpFIMi3qwv6R1jZy1-723sYT-fZUafv0K70_HSco2Ck'

webpush.setVapidDetails('mailto:admin@babyhaus.kr', VAPID_PUBLIC, VAPID_PRIVATE)

export const maxDuration = 30

// KST 기준 오늘 날짜까지의 일수 차이 계산
function daysUntilKST(dateStr) {
  if (!dateStr) return null
  const [ty, tm, td] = dateStr.split('-').map(Number)
  const targetMs = Date.UTC(ty, tm - 1, td)
  // 현재 KST 날짜
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const todayStr = kst.toISOString().split('T')[0]
  const [ny, nm, nd] = todayStr.split('-').map(Number)
  const todayMs = Date.UTC(ny, nm - 1, nd)
  return Math.round((targetMs - todayMs) / 86400000)
}

export default async function handler(req, res) {
  // Vercel Cron은 GET으로 호출 + CRON_SECRET 헤더 검증
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Vercel Cron 인증 (CRON_SECRET 환경변수가 설정된 경우)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

    // 전체 고객 조회 (삭제되지 않은)
    const { data: custs, error: custErr } = await sb.from('customers').select('*').eq('deleted', false)
    if (custErr) {
      console.error('Customer fetch error:', custErr)
      return res.status(500).json({ error: 'Failed to fetch customers' })
    }
    if (!custs?.length) return res.status(200).json({ ok: true, sent: 0, reason: 'no customers' })

    const urgent = []

    custs.forEach(c => {
      const gifts = Array.isArray(c.gifts) ? c.gifts : []
      gifts.forEach(g => {
        if (!g.sent && g.date) {
          const d = daysUntilKST(g.date)
          if (d !== null && d >= 0 && d <= 10) urgent.push({ c, g, d })
        }
      })
    })

    if (!urgent.length) return res.status(200).json({ ok: true, sent: 0, reason: 'no urgent gifts' })

    // 푸시 구독 조회
    const { data: subs, error: subErr } = await sb.from('push_subscriptions').select('id, subscription')
    if (subErr) {
      console.error('Subscription fetch error:', subErr)
      return res.status(500).json({ error: 'Failed to fetch subscriptions' })
    }
    if (!subs?.length) return res.status(200).json({ ok: true, sent: 0, reason: 'no subscriptions' })

    // 메시지 구성
    const names = [...new Set(urgent.map(x => x.c.name))].slice(0, 3).join(', ')
    const title  = '🎁 선물 발송 알림 · BABY HAÜS'
    const body   = `D-10 이내 ${urgent.length}건 · ${names}${urgent.length > 3 ? ' 외' : ''}`
    const payload = JSON.stringify({ title, body, tag: 'gift-reminder' })

    let sent = 0, failed = 0
    const expiredIds = []

    for (const row of subs) {
      try {
        await webpush.sendNotification(row.subscription, payload)
        sent++
      } catch(e) {
        // 410 = 만료된 구독 → 삭제 대상에 추가
        if (e.statusCode === 410 || e.statusCode === 404) {
          expiredIds.push(row.id)
        }
        failed++
        console.warn(`Push failed for sub ${row.id}:`, e.statusCode || e.message)
      }
    }

    // 만료된 구독 일괄 삭제
    if (expiredIds.length > 0) {
      await sb.from('push_subscriptions').delete().in('id', expiredIds)
      console.log(`Removed ${expiredIds.length} expired subscriptions`)
    }

    console.log(`Daily push: ${sent} sent, ${failed} failed, ${urgent.length} urgent gifts`)
    return res.status(200).json({ ok: true, sent, failed, urgentCount: urgent.length })

  } catch(e) {
    console.error('Daily push error:', e)
    return res.status(500).json({ error: e.message })
  }
}
