// api/send-push.js - Vercel Serverless Function
import webpush from 'web-push'

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC || 'BKWzJf5mFTh57wdROQ5yHXPF--qDhm5mrO-wjyArI8XGSlbWmS8Ag-HxtCWesW_NNHxfbRIrh_RfrjIDuVeMm3Q'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'jpFIMi3qwv6R1jZy1-723sYT-fZUafv0K70_HSco2Ck'

webpush.setVapidDetails('mailto:admin@babyhaus.kr', VAPID_PUBLIC, VAPID_PRIVATE)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { subscription, title, body, tag } = req.body
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' })
    }

    const payload = JSON.stringify({ title, body, tag })
    await webpush.sendNotification(subscription, payload)
    res.status(200).json({ ok: true })
  } catch (e) {
    if (e.statusCode === 410 || e.statusCode === 404) {
      return res.status(410).json({ error: 'Subscription expired' })
    }
    console.error('Push error:', e.statusCode || e.message)
    res.status(500).json({ error: e.message })
  }
}
