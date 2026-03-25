import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { fmtDate, daysUntil, effDate, effType, getGifts, can, STORE_LABEL } from '../utils'
import CustomerDetail from './CustomerDetail'
import { useToast } from './AdminApp'

function AlertItem({ item, onDetail }) {
  const { c, g, d } = item
  let cls = 'dd-green', txt = `D-${d}`
  if (d < 0) { cls='dd-red'; txt=`D+${Math.abs(d)}` }
  else if (d === 0) { cls='dd-red'; txt='오늘!' }
  else if (d <= 3) cls='dd-red'
  else if (d <= 7) cls='dd-gold'
  return (
    <div className="ai" onClick={() => onDetail(c.id)}>
      <div className={`ai-av ${effType(c)==='pregnant'?'av-p':'av-n'}`}>{effType(c)==='pregnant'?'🤰':'👶'}</div>
      <div className="ai-info">
        <div className="ai-name">{c.name} · {c.childName||'-'} <span className={`badge badge-${c.store}`}>{STORE_LABEL[c.store]||c.store}</span></div>
        <div className="ai-detail">{g.label}</div>
        <div className="ai-detail">📅 {fmtDate(g.date)}</div>
      </div>
      <span className={`dday ${cls}`}>{txt}</span>
    </div>
  )
}

export default function Dashboard({ user, onGoList }) {
  const [custs, setCusts] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState(null)
  const showToast = useToast()

  const load = useCallback(async () => {
    let q = supabase.from('customers').select('*').eq('deleted', false)
    if (!can(user.role, 'viewAll')) q = q.eq('store', user.store)
    const { data } = await q
    setCusts(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const canSee = (c) => can(user.role, 'viewAll') || c.store === user.store
    const ch = supabase.channel(`dash-${user.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'customers' }, (payload) => {
        const c = payload.new
        if (!c || c.deleted || !canSee(c)) return
        setCusts(prev => prev.find(x => x.id === c.id) ? prev : [...prev, c])
      })
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'customers' }, (payload) => {
        const c = payload.new
        if (!c) return
        if (c.deleted) {
          setCusts(prev => prev.filter(x => x.id !== c.id))
        } else {
          setCusts(prev => {
            const exists = prev.find(x => x.id === c.id)
            if (exists) return prev.map(x => x.id === c.id ? c : x)
            if (canSee(c)) return [...prev, c]
            return prev
          })
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [user])

  // 미발송 + D-day가 min~max 범위에 있는 선물 조회
  const getUpcoming = useCallback((min, max) => {
    const r = []
    custs.forEach(c => getGifts(c).forEach(g => {
      const d = daysUntil(g.date)
      if (d !== null && d >= min && d <= max && !g.sent) r.push({ c, g, d })
    }))
    return r.sort((a,b) => a.d - b.d)
  }, [custs])

  // 발송 기한이 지난 미발송 선물 (d < 0)
  const getOverdue = useCallback(() => {
    const r = []
    custs.forEach(c => getGifts(c).forEach(g => {
      const d = daysUntil(g.date)
      if (d !== null && d < 0 && !g.sent) r.push({ c, g, d })
    }))
    return r.sort((a,b) => b.d - a.d) // 가장 최근 지난것 먼저
  }, [custs])

  const u10 = getUpcoming(0, 10)
  const u30 = getUpcoming(11, 30)
  const overdue = getOverdue()

  if (loading) return <div style={{ textAlign:'center', padding:60, color:'var(--light)' }}>불러오는 중...</div>

  return (
    <>
      {/* 통계 카드 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <div className="card" onClick={() => onGoList()} style={{ gridColumn:'1/-1', cursor:'pointer', transition:'all .18s' }}
          onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'}
          onMouseOut={e=>e.currentTarget.style.transform='none'}>
          <div style={{ fontSize:24, marginBottom:8 }}>👥</div>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:28, fontWeight:700 }}>{custs.length}</div>
          <div style={{ fontSize:12, color:'var(--mid)', marginTop:2 }}>담당 고객{!can(user.role,'viewAll')?` · ${STORE_LABEL[user.store]}`:''}</div>
          <div style={{ fontSize:11, color:'var(--light)', marginTop:6 }}>목록 보기 →</div>
        </div>
        <div className="card" onClick={() => onGoList('10')} style={{ cursor:'pointer', background:'var(--coral-light)', transition:'all .18s' }}
          onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'}
          onMouseOut={e=>e.currentTarget.style.transform='none'}>
          <div style={{ fontSize:24, marginBottom:8 }}>🚨</div>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:28, fontWeight:700, color:'var(--coral)' }}>{u10.length}</div>
          <div style={{ fontSize:12, color:'var(--mid)', marginTop:2 }}>D-10 이내 발송</div>
          <div style={{ fontSize:11, color:'rgba(232,133,106,.6)', marginTop:6 }}>보기 →</div>
        </div>
        <div className="card" onClick={() => onGoList('30')} style={{ cursor:'pointer', background:'var(--gold-light)', transition:'all .18s' }}
          onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'}
          onMouseOut={e=>e.currentTarget.style.transform='none'}>
          <div style={{ fontSize:24, marginBottom:8 }}>🎁</div>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:28, fontWeight:700, color:'var(--gold)' }}>{u30.length}</div>
          <div style={{ fontSize:12, color:'var(--mid)', marginTop:2 }}>D-11~30 발송</div>
          <div style={{ fontSize:11, color:'rgba(201,168,76,.6)', marginTop:6 }}>보기 →</div>
        </div>
      </div>

      {/* 기한 지난 미발송 */}
      {overdue.length > 0 && (
        <div className="card" style={{ borderTop:'3px solid #c0392b', marginBottom:14 }}>
          <div className="sec-title" style={{ color:'#c0392b' }}>⚠️ 기한 지난 미발송 ({overdue.length}건)</div>
          {overdue.map((item,i) => <AlertItem key={`o${i}`} item={item} onDetail={setDetailId}/>)}
        </div>
      )}

      {/* 알림 섹션 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:22 }} className="alert-grid-r">
        <div className="card" style={{ borderTop:'3px solid var(--coral)' }}>
          <div className="sec-title">🚨 D-10 이내 발송 예정</div>
          {u10.length ? u10.map((item,i) => <AlertItem key={i} item={item} onDetail={setDetailId}/>) : <div className="empty">📭 없음</div>}
        </div>
        <div className="card" style={{ borderTop:'3px solid var(--gold)' }}>
          <div className="sec-title">📅 D-11~30 발송 예정</div>
          {u30.length ? u30.map((item,i) => <AlertItem key={i} item={item} onDetail={setDetailId}/>) : <div className="empty">📭 없음</div>}
        </div>
      </div>

      {detailId && <CustomerDetail id={detailId} onClose={() => { setDetailId(null); load() }} showToast={showToast}/>}

      <style>{`
        .ai{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--cream2);cursor:pointer;}
        .ai:last-child{border-bottom:none;}
        .ai:hover{background:var(--cream);margin:0 -4px;padding:10px 4px;border-radius:6px;}
        .ai-av{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
        .av-p{background:var(--coral-light);}
        .av-n{background:var(--sage-light);}
        .ai-info{flex:1;min-width:0;}
        .ai-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .ai-detail{font-size:11px;color:var(--mid);margin-top:1px;}
        .empty{text-align:center;padding:20px;color:var(--light);font-size:13px;}
        @media(max-width:480px){.alert-grid-r{grid-template-columns:1fr!important;}}
      `}</style>
    </>
  )
}
