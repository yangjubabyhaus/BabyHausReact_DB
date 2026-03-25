import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from './AdminApp'
import { fmtDate, daysUntil, effType, getGifts, can, STORE_LABEL, genCode, todayKST } from '../utils'

export default function CustomerDetail({ id, onClose, showToast }) {
  const { user } = useAuth()
  const [c, setC] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showDelete, setShowDelete] = useState(false)

  const reload = async () => {
    const { data } = await supabase.from('customers').select('*').eq('id', id).single()
    setC(data)
    setLoading(false)
  }

  useEffect(() => { reload() }, [id])

  if (loading) return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ textAlign:'center', padding:40, color:'var(--light)' }} onClick={e=>e.stopPropagation()}>불러오는 중...</div>
    </div>
  )
  if (!c) return null

  const gifts = getGifts(c)
  const isPreg = effType(c) === 'pregnant'
  const canMark = can(user.role, 'markSent')
  const canDel  = can(user.role, 'deleteCust')

  // 선물 발송 완료 처리 — 인덱스 기반으로 정확히 처리
  const markSent = async (giftIndex) => {
    // gifts가 DB에 아직 없는 경우(getGifts가 buildGifts로 생성한 경우)를 대비해
    // 항상 현재 gifts 배열을 DB에 저장
    const newGifts = gifts.map((g, i) => i === giftIndex ? { ...g, sent: true } : g)
    const { error } = await supabase.from('customers').update({ gifts: newGifts }).eq('id', c.id)
    if (error) {
      showToast('오류가 발생했습니다. 다시 시도해주세요.', '❌')
      return
    }
    setC({ ...c, gifts: newGifts })
    showToast('발송 완료 처리됐습니다', '✅')
  }

  // 발송 완료 취소 (실수로 눌렀을 때)
  const unmarkSent = async (giftIndex) => {
    const newGifts = gifts.map((g, i) => i === giftIndex ? { ...g, sent: false } : g)
    const { error } = await supabase.from('customers').update({ gifts: newGifts }).eq('id', c.id)
    if (error) {
      showToast('오류가 발생했습니다.', '❌')
      return
    }
    setC({ ...c, gifts: newGifts })
    showToast('발송 완료가 취소됐습니다', '↩️')
  }

  const softDelete = async () => {
    const { error } = await supabase.from('customers').update({ deleted: true, deletedAt: todayKST() }).eq('id', c.id)
    if (error) {
      showToast('삭제 중 오류가 발생했습니다.', '❌')
      return
    }
    showToast('고객 정보가 삭제됐습니다', '🗑️')
    onClose()
  }

  const reissueCode = async () => {
    const newCode = genCode()
    const { error } = await supabase.from('customers').update({ verificationCode: newCode, birthDateModified: false }).eq('id', c.id)
    if (error) {
      showToast('코드 재발급 중 오류가 발생했습니다.', '❌')
      return
    }
    setC({ ...c, verificationCode: newCode, birthDateModified: false })
    showToast(`새 코드 발급: ${newCode}`, '🔑')
  }

  const copyCode = (code) => {
    if (navigator.clipboard && location.protocol === 'https:') {
      navigator.clipboard.writeText(code).then(() => showToast(`코드 복사됨: ${code}`, '📋'))
    } else {
      const ta = document.createElement('textarea'); ta.value = code
      ta.style.cssText = 'position:fixed;top:-9999px;opacity:0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      try { document.execCommand('copy'); showToast(`코드 복사됨: ${code}`, '📋') }
      catch { showToast(`인증코드: ${code}`, '🔑') }
      document.body.removeChild(ta)
    }
  }

  if (showDelete) return (
    <div className="overlay" onClick={() => setShowDelete(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">🗑️ 고객 삭제</div>
        <div style={{ fontSize:15, marginBottom:8 }}><strong>{c.name}</strong> 고객을 삭제하시겠습니까?</div>
        <div style={{ fontSize:13, color:'var(--mid)', marginBottom:20 }}>목록에서 즉시 숨김 처리됩니다.</div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setShowDelete(false)}>← 취소</button>
          <button className="btn btn-coral" onClick={softDelete}>삭제 확인</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{isPreg?'🤰':'👶'} {c.name} 고객 상세</div>
        {[
          ['매장', <span className={`badge badge-${c.store}`}>{STORE_LABEL[c.store]||c.store}</span>],
          ['유형', <span className={`badge badge-${effType(c)}`}>{effType(c)==='pregnant'?'임산부':'일반'}</span>],
          ['고객명', c.name],
          ['연락처', c.phone||'-'],
          ['주소', c.address||'-'],
          ['아이 이름', c.childName||'-'],
          ['등록일', fmtDate(c.registeredAt)],
          ...(isPreg ? [
            ['출산예정일', fmtDate(c.dueDate)],
            ['실제출산일', c.actualBirthDate ? fmtDate(c.actualBirthDate) : <span style={{color:'var(--light)'}}>미수정 (고객 직접 수정)</span>],
          ] : [
            ['생년월일', fmtDate(c.birthDate)],
          ])
        ].map(([k,v],i) => (
          <div key={i} className="dr"><span className="dk">{k}</span><span className="dv">{v}</span></div>
        ))}

        {/* 인증코드 */}
        {c.type === 'pregnant' && (
          <div className="dr">
            <span className="dk">인증코드</span>
            <span className="dv" style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              {c.birthDateModified
                ? <><span style={{ fontFamily:'monospace', color:'var(--light)', textDecoration:'line-through' }}>{c.verificationCode||'-'}</span><span style={{ fontSize:11, color:'var(--light)' }}>🔒 사용 완료</span></>
                : <><span style={{ fontFamily:'monospace', letterSpacing:3, color:'var(--gold)', fontSize:16, fontWeight:700 }}>{c.verificationCode||'-'}</span>
                   <button className="btn btn-sm btn-secondary" onClick={() => copyCode(c.verificationCode)}>📋 복사</button>
                   <button className="btn btn-sm btn-gold" onClick={reissueCode}>🔄 재발급</button>
                  </>
              }
            </span>
          </div>
        )}

        {/* 선물 일정 */}
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:11 }}>🎁 선물 발송 일정</div>
          <div className="gift-tl">
            {gifts.map((g, i) => {
              const d = daysUntil(g.date)
              const isPast = d !== null && d < 0
              const isUpcoming = d !== null && d >= 0 && d <= 10
              const cls = g.sent ? 'done' : isUpcoming ? 'upcom' : ''
              const stat = g.sent
                ? <span style={{ fontSize:11, color:'var(--sage)', marginLeft:6 }}>✅ 발송 완료</span>
                : isUpcoming ? <span style={{ fontSize:11, color:'var(--coral)', marginLeft:5 }}>🚨 {d===0?'오늘!':'D-'+d}</span>
                : isPast ? <span style={{ fontSize:11, color:'var(--light)', marginLeft:5 }}>⏰ 지남 ({Math.abs(d)}일 전)</span>
                : (d !== null ? <span style={{ fontSize:11, color:'var(--mid)', marginLeft:5 }}>D-{d}</span> : null)
              return (
                <div key={i} className={`gs ${cls}`}>
                  <div className="gs-date">{fmtDate(g.date)}{stat}</div>
                  <div className="gs-lbl">{g.label}</div>
                  {/* 발송 완료 처리 버튼: 마스터/매니저 + 미발송 + 날짜가 지났거나 10일 이내 */}
                  {canMark && !g.sent && d !== null && d <= 10 && (
                    <button className="btn btn-sm btn-primary" style={{ marginTop:5 }} onClick={() => markSent(i)}>
                      ✅ 발송 완료 처리
                    </button>
                  )}
                  {/* 발송 완료 취소 버튼: 마스터만 */}
                  {g.sent && user.role === 'master' && (
                    <button className="btn btn-sm btn-secondary" style={{ marginTop:5 }} onClick={() => unmarkSent(i)}>
                      ↩️ 발송 취소
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="modal-footer">
          {canDel && <button className="btn btn-danger btn-sm" onClick={() => setShowDelete(true)}>삭제</button>}
          <button className="btn btn-secondary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
