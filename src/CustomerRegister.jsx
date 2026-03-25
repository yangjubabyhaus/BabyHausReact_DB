import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { genId, genCode, buildGifts, fmtDate, today, todayKST } from './utils'

const STEPS = ['유형 선택', '정보 입력', '완료']

// ── Step2Form: 외부 정의 → keystroke마다 re-mount 방지 ──
function Step2Form({ selType, selStore, loading, onBack, onSubmit }) {
  const ip = selType === 'pregnant'
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [addr, setAddr] = useState('')
  const [addr2, setAddr2] = useState('')
  const [child, setChild] = useState('')
  const [date, setDate] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [err, setErr] = useState('')
  const todayDate = todayKST()

  const fmtPhone = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 3) return d
    if (d.length <= 7) return d.slice(0,3)+'-'+d.slice(3)
    return d.slice(0,3)+'-'+d.slice(3,7)+'-'+d.slice(7)
  }

  const addrSearch = () => {
    if (typeof daum !== 'undefined' && daum.Postcode) {
      new daum.Postcode({ oncomplete: (d) => {
        setAddr(d.userSelectedType === 'R' ? d.roadAddress : d.jibunAddress)
      }}).open()
    } else {
      setErr('주소 검색은 배포 후 사용 가능합니다. 직접 입력해주세요.')
    }
  }

  const submit = async () => {
    if (!name||!phone||!addr||!child||!date) { setErr('모든 필수 항목을 입력해주세요.'); return }
    if (!agreed) { setErr('개인정보 수집·이용에 동의해주세요.'); return }
    setErr('')
    await onSubmit({ name, phone, addr, addr2, child, date, agreed, setErr })
  }

  return (
    <div className="card" style={{ animation:'fadeUp .3s ease' }}>
      <div className="sec-title">📝 정보 입력</div>
      {ip
        ? <div className="info-box">ℹ️ 출산 예정일 기준으로 등록됩니다. 출산 후 인증코드로 실제 출산일을 <strong>1회</strong> 수정하실 수 있어요.</div>
        : <div className="warn-box">⚠️ 아이의 생년월일은 등록 후 <strong>수정이 불가</strong>합니다. 정확하게 입력해주세요.</div>
      }
      {err && <div className="warn-box">⚠️ {err}</div>}
      <div className="form-group">
        <label className="form-label">보호자 성함 <span className="req">*</span></label>
        <input className="form-input" type="text" placeholder="예) 김민지" value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/>
      </div>
      <div className="form-group">
        <label className="form-label">연락처 <span className="req">*</span></label>
        <input className="form-input" type="tel" placeholder="010-0000-0000" value={phone} onChange={e=>setPhone(fmtPhone(e.target.value))} maxLength={13}/>
      </div>
      <div className="form-group">
        <label className="form-label">배송 주소 <span className="req">*</span></label>
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <input className="form-input" type="text" placeholder="주소 검색을 눌러주세요" value={addr} readOnly onClick={addrSearch} style={{ flex:1, cursor:'pointer', background:'var(--cream2)' }}/>
          <button className="btn btn-primary" onClick={addrSearch}>🔍 검색</button>
        </div>
        <input className="form-input" type="text" placeholder="상세주소 (동·호수)" value={addr2} onChange={e=>setAddr2(e.target.value)}/>
      </div>
      <div className="form-group">
        <label className="form-label">아이 이름 <span className="req">*</span></label>
        <input className="form-input" type="text" placeholder="예) 민준" value={child} onChange={e=>setChild(e.target.value)}/>
      </div>
      <div className="form-group">
        <label className="form-label">{ip ? '출산 예정일' : '아이 생년월일'} <span className="req">*</span></label>
        <input className="form-input" type="date" value={date}
          max={ip ? undefined : todayDate}
          min={ip ? todayDate : undefined}
          onChange={e=>setDate(e.target.value)}/>
        <div style={{fontSize:12,color:'var(--light)',marginTop:4}}>
          {ip ? '오늘 이전 날짜는 선택할 수 없습니다' : '오늘 이후 날짜는 선택할 수 없습니다'}
        </div>
      </div>
      <label style={{ display:'flex', alignItems:'flex-start', gap:12, padding:14, background:'var(--cream)', borderRadius:'var(--radius-sm)', cursor:'pointer', margin:'16px 0' }}>
        <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{ width:20, height:20, marginTop:2, accentColor:'var(--sage)', flexShrink:0 }}/>
        <span style={{ fontSize:13, color:'var(--dark)', lineHeight:1.7 }}>
          개인정보 수집·이용에 동의합니다.<br/>
          <strong>수집 항목:</strong> 이름, 연락처, 주소, 아이 정보<br/>
          <strong>이용 목적:</strong> 회원 가입, 서비스 제공, 고객 상담, 마케팅 정보발신
        </span>
      </label>
      <div style={{ display:'flex', gap:10 }}>
        <button className="btn btn-secondary" style={{ flex:1, padding:15 }} onClick={onBack}>← 이전</button>
        <button className="btn btn-primary" style={{ flex:2, padding:15, fontSize:15 }} onClick={submit} disabled={loading}>
          {loading ? '등록 중...' : '✅ 등록 완료'}
        </button>
      </div>
    </div>
  )
}

// ── CorrectMode: 외부 정의 → keystroke마다 re-mount 방지 ──
// 자체 state를 가지므로 부모 리렌더링에 영향받지 않음
function CorrectModeForm({ onReset }) {
  const [cCode, setCCode] = useState('')
  const [cDate, setCDate] = useState('')
  const [correctState, setCorrectState] = useState('input')
  const [correctCustomer, setCorrectCustomer] = useState(null)
  const [cErr, setCErr] = useState('')
  const [loading, setLoading] = useState(false)

  const doCorrectLookup = async () => {
    if (!cCode || cCode.length !== 8) { setCErr('8자리 인증코드를 입력해주세요.'); return }
    if (!cDate) { setCErr('실제 출산일을 선택해주세요.'); return }
    setCErr('')
    const { data, error } = await supabase.from('customers').select('*')
      .eq('verificationCode', cCode.toUpperCase())
      .eq('type', 'pregnant')
      .eq('deleted', false)
    if (error || !data?.length) { setCErr('유효하지 않은 인증코드입니다.'); return }
    const c = data[0]
    if (c.birthDateModified) { setCErr('이미 사용된 인증코드입니다. (1회만 가능)'); return }
    setCorrectCustomer({ c, newDate: cDate })
    setCorrectState('confirm')
  }

  const doCorrectFinal = async () => {
    const { c, newDate } = correctCustomer
    const gifts = buildGifts('pregnant', newDate)
    const oldGifts = c.gifts || []
    const mergedGifts = gifts.map(ng => {
      const old = oldGifts.find(og => og.label === ng.label)
      return old && old.sent ? { ...ng, sent: true } : ng
    })
    setLoading(true)
    const { error } = await supabase.from('customers').update({
      actualBirthDate: newDate,
      birthDateModified: true,
      gifts: mergedGifts
    }).eq('id', c.id)
    setLoading(false)
    if (error) { setCErr('수정 중 오류가 발생했습니다. 다시 시도해주세요.'); return }
    setCorrectCustomer({ ...correctCustomer, updated: { ...c, actualBirthDate: newDate, gifts: mergedGifts } })
    setCorrectState('done')
  }

  if (correctState === 'confirm') {
    const { c, newDate } = correctCustomer
    return (
      <div className="card" style={{ animation:'fadeUp .3s ease' }}>
        <div className="sec-title">✅ 정보를 확인해주세요</div>
        <div className="warn-box">⚠️ 출산일 수정은 <strong>1회만 가능</strong>합니다.</div>
        <div style={{ background:'var(--cream2)', borderRadius:'var(--radius-sm)', padding:14, margin:'12px 0' }}>
          <div style={{ fontSize:12, color:'var(--mid)', marginBottom:4 }}>등록된 출산 예정일</div>
          <div style={{ fontSize:16, fontWeight:700 }}>{fmtDate(c.dueDate)}</div>
        </div>
        <div style={{ textAlign:'center', fontSize:24, margin:'8px 0' }}>↓</div>
        <div style={{ background:'var(--sage-light)', border:'2px solid var(--sage)', borderRadius:'var(--radius-sm)', padding:14, margin:'12px 0' }}>
          <div style={{ fontSize:12, color:'var(--sage-dark)', marginBottom:4 }}>변경할 실제 출산일</div>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--sage-dark)' }}>{fmtDate(newDate)}</div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:16 }}>
          <button className="btn btn-secondary" style={{ flex:1, padding:13 }} onClick={() => setCorrectState('input')}>← 다시 입력</button>
          <button className="btn btn-coral" style={{ flex:1, padding:13 }} onClick={doCorrectFinal} disabled={loading}>{loading ? '처리 중...' : '✅ 수정 확정'}</button>
        </div>
      </div>
    )
  }

  if (correctState === 'done') {
    const { updated } = correctCustomer
    return (
      <div className="card" style={{ animation:'fadeUp .3s ease', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🎊</div>
        <div style={{ fontFamily:'var(--font-serif)', fontSize:19, fontWeight:700, marginBottom:8 }}>출산일이 수정됐어요!</div>
        <div style={{ fontSize:14, color:'var(--mid)', lineHeight:1.7 }}>{updated.name}님, 축하드립니다 🌸<br/>{updated.childName}(이)의 탄생을 진심으로 축하해요</div>
        <div style={{ background:'var(--sage-light)', border:'2px solid var(--sage)', borderRadius:'var(--radius-sm)', padding:14, margin:'16px 0', textAlign:'left' }}>
          <div style={{ fontSize:12, color:'var(--sage-dark)', marginBottom:4 }}>등록된 실제 출산일</div>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--sage-dark)' }}>{fmtDate(updated.actualBirthDate)}</div>
        </div>
        <div style={{ background:'var(--cream)', borderRadius:'var(--radius-sm)', padding:14, margin:'12px 0', textAlign:'left' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--mid)', marginBottom:9 }}>🎁 수정된 선물 일정</div>
          {updated.gifts.map((g,i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'center', padding:'7px 0', borderBottom:i<updated.gifts.length-1?'1px solid var(--cream2)':'none', fontSize:13 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--sage)', flexShrink:0 }}/>
              <div style={{ color:'var(--mid)', minWidth:90 }}>{fmtDate(g.date)}</div>
              <div>{g.label}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-secondary" style={{ width:'100%', marginTop:8, padding:13 }} onClick={onReset}>처음으로</button>
      </div>
    )
  }

  return (
    <div className="card" style={{ animation:'fadeUp .3s ease' }}>
      <div className="sec-title">🔑 실제 출산일 수정</div>
      <div className="info-box">ℹ️ 등록 시 받으신 <strong>8자리 인증코드</strong>와 실제 출산일을 입력해주세요.</div>
      {cErr && <div className="warn-box">⚠️ {cErr}</div>}
      <div className="form-group">
        <label className="form-label">인증코드 8자리 <span className="req">*</span></label>
        <input className="form-input" type="text" placeholder="예) AB3X9K2M" maxLength={8}
          style={{ fontFamily:'monospace', letterSpacing:6, fontSize:20, textAlign:'center', textTransform:'uppercase', fontWeight:700 }}
          value={cCode} onChange={e => setCCode(e.target.value.toUpperCase())}/>
      </div>
      <div className="form-group">
        <label className="form-label">실제 출산일 <span className="req">*</span></label>
        <input className="form-input" type="date" value={cDate}
          max={todayKST()}
          onChange={e => setCDate(e.target.value)}/>
        <div style={{fontSize:12,color:'var(--light)',marginTop:4}}>오늘 이후 날짜는 선택할 수 없습니다</div>
      </div>
      <button className="btn btn-coral" style={{ width:'100%', padding:15, fontSize:16 }} onClick={doCorrectLookup} disabled={loading}>
        {loading ? '확인 중...' : '다음으로 →'}
      </button>
    </div>
  )
}

// ── Main Component ──
export default function CustomerRegister() {
  const [mode, setMode] = useState('register')
  const [step, setStep] = useState(1)
  const [selStore, setSelStore] = useState('')
  const [selType, setSelType] = useState(null)
  const [fd, setFd] = useState({})
  const [loading, setLoading] = useState(false)
  // CorrectMode가 리셋될 때 key를 바꿔서 완전 초기화
  const [correctKey, setCorrectKey] = useState(0)

  // 카카오 주소 API 로드
  useEffect(() => {
    if (document.getElementById('daum-postcode-script')) return
    const script = document.createElement('script')
    script.id = 'daum-postcode-script'
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    script.async = true
    document.head.appendChild(script)
  }, [])

  const switchMode = (m) => {
    setMode(m); setStep(1); setSelStore(''); setSelType(null); setFd({})
    setCorrectKey(k => k + 1)
  }

  const handleSubmit = async ({ name, phone, addr, addr2, child, date, agreed, setErr }) => {
    const fullAddr = addr2 ? `${addr} ${addr2}` : addr
    const ip = selType === 'pregnant'
    const code = ip ? genCode() : null
    const gifts = buildGifts(selType, date)
    const customer = {
      id: genId(), type: selType, store: selStore,
      name, phone, address: fullAddr, childName: child,
      ...(ip
        ? { dueDate: date, actualBirthDate: null, birthDateModified: false, verificationCode: code }
        : { birthDate: date }
      ),
      registeredAt: todayKST(), gifts, deleted: false
    }
    setLoading(true)
    const { data: existing } = await supabase.from('customers').select('id').eq('phone', phone).eq('deleted', false)
    if (existing?.length) {
      setLoading(false)
      setErr('이미 등록된 전화번호입니다. 매장 직원에게 문의해주세요.')
      return
    }
    const { error } = await supabase.from('customers').insert([customer])
    setLoading(false)
    if (error) { setErr('저장 중 오류가 발생했습니다. 다시 시도해주세요.'); console.error(error); return }
    setFd({ saved: customer })
    setStep(3)
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(145deg,#fdf8f2 0%,#f0ebe0 50%,#e8f2eb 100%)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'32px 16px 80px' }}>
      <div style={{ width:'100%', maxWidth:540 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:22, fontWeight:700, color:'var(--dark)' }}>BABY HAÜS</div>
          <div style={{ fontSize:13, color:'var(--mid)', marginTop:5, lineHeight:1.6 }}>소중한 아이의 성장을 함께합니다<br/>정보를 등록하시면 특별한 선물을 드려요 🎁</div>
        </div>
        <div style={{ display:'flex', gap:4, background:'rgba(45,42,38,.07)', padding:4, borderRadius:14, marginBottom:22 }}>
          {[{id:'register',label:'📝 처음 등록하기'},{id:'correct',label:'🔑 출산일 수정하기'}].map(m => (
            <button key={m.id} onClick={() => switchMode(m.id)} style={{
              flex:1, padding:'10px', border:'none', borderRadius:11, cursor:'pointer', fontSize:13,
              background: mode===m.id ? 'var(--white)' : 'transparent',
              color: mode===m.id ? 'var(--dark)' : 'var(--mid)',
              fontWeight: mode===m.id ? 700 : 400,
              boxShadow: mode===m.id ? '0 2px 8px rgba(45,42,38,.10)' : 'none',
              transition:'all .18s'
            }}>{m.label}</button>
          ))}
        </div>
        {mode === 'register' && (
          <>
            <StepIndicator step={step}/>
            {step === 1 && <Step1 selStore={selStore} setSelStore={setSelStore} selType={selType} setSelType={setSelType} onNext={() => setStep(2)}/>}
            {step === 2 && <Step2Form selType={selType} selStore={selStore} loading={loading} onBack={() => setStep(1)} onSubmit={handleSubmit}/>}
            {step === 3 && <Step3 fd={fd} onReset={() => switchMode('register')}/>}
          </>
        )}
        {mode === 'correct' && <CorrectModeForm key={correctKey} onReset={() => switchMode('register')}/>}
        <div style={{ textAlign:'center', fontSize:12, color:'var(--light)', marginTop:18 }}>
          개인정보는 베이비하우스 서비스제공 목적으로만 사용됩니다
        </div>
      </div>
    </div>
  )
}

// ── StepIndicator: 외부 정의 ──
function StepIndicator({ step }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:22 }}>
      {STEPS.map((lbl, i) => {
        const n = i + 1, isDone = n < step, isActive = n === step
        return (
          <React.Fragment key={n}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, flex:1, maxWidth:90 }}>
              <div style={{
                width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:12, fontWeight:700,
                background: isDone ? 'var(--sage-dark)' : isActive ? 'var(--sage)' : 'var(--cream2)',
                color: (isDone||isActive) ? '#fff' : 'var(--light)',
                boxShadow: isActive ? '0 4px 12px rgba(122,171,138,.4)' : 'none', transition:'all .3s'
              }}>{isDone ? '✓' : n}</div>
              <div style={{ fontSize:10, color: isActive ? 'var(--sage-dark)' : 'var(--light)', fontWeight: isActive ? 600 : 400 }}>{lbl}</div>
            </div>
            {i < STEPS.length-1 && <div style={{ flex:1, height:2, background: n<step?'var(--sage)':'var(--cream2)', maxWidth:36, transition:'background .3s' }}/>}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Step1: 외부 정의 ──
function Step1({ selStore, setSelStore, selType, setSelType, onNext }) {
  return (
    <div className="card" style={{ animation:'fadeUp .3s ease' }}>
      <div className="sec-title">🏪 방문하신 매장을 선택해주세요</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13, marginBottom:20 }}>
        {[{id:'dobong',label:'도봉점',color:'#3b5bdb',bg:'#e8f0fe'},{id:'yangju',label:'양주점',color:'#7048e8',bg:'#f3e8ff'}].map(s => (
          <div key={s.id} onClick={() => setSelStore(s.id)} style={{
            padding:'20px 12px', border:`2.5px solid ${selStore===s.id?s.color:'var(--cream2)'}`,
            borderRadius:'var(--radius)', cursor:'pointer', textAlign:'center',
            background: selStore===s.id ? s.bg : 'var(--cream)', transition:'all .22s'
          }}>
            <div style={{ fontSize:36, marginBottom:9 }}>🏪</div>
            <div style={{ fontWeight:700, fontSize:15, color: selStore===s.id ? s.color : 'var(--dark)' }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div className="sec-title" style={{ marginTop:4 }}>💬 어떤 경우에 해당하시나요?</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13, marginBottom:18 }}>
        {[
          {id:'pregnant',icon:'🤰',title:'임산부예요',desc:'출산 예정일 기준 등록\n실제 생일 1회 수정 가능'},
          {id:'normal',icon:'👶',title:'아이가 있어요',desc:'실제 생년월일로 등록\n생일 수정 불가'}
        ].map(t => (
          <div key={t.id} onClick={() => setSelType(t.id)} style={{
            padding:'20px 12px', border:`2.5px solid ${selType===t.id?'var(--sage)':'var(--cream2)'}`,
            borderRadius:'var(--radius)', cursor:'pointer', textAlign:'center',
            background: selType===t.id ? 'var(--sage-light)' : 'var(--cream)', transition:'all .22s'
          }}>
            <div style={{ fontSize:36, marginBottom:9 }}>{t.icon}</div>
            <div style={{ fontWeight:700, fontSize:15 }}>{t.title}</div>
            <div style={{ fontSize:11, color:'var(--mid)', marginTop:4, lineHeight:1.5, whiteSpace:'pre-line' }}>{t.desc}</div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" style={{ width:'100%', padding:15, fontSize:16 }}
        disabled={!selType||!selStore} onClick={onNext}>
        다음으로 →
      </button>
    </div>
  )
}

// ── Step3: 외부 정의 ──
function Step3({ fd, onReset }) {
  const c = fd.saved; if (!c) return null
  const ip = c.type === 'pregnant'
  const base = ip ? c.dueDate : c.birthDate
  return (
    <div className="card" style={{ animation:'fadeUp .3s ease', textAlign:'center' }}>
      <div style={{ width:72, height:72, background:'var(--sage-light)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 16px', animation:'pop .5s cubic-bezier(.175,.885,.32,1.275)' }}>🎉</div>
      <div style={{ fontFamily:'var(--font-serif)', fontSize:21, fontWeight:700, marginBottom:7 }}>등록이 완료됐어요!</div>
      <div style={{ fontSize:14, color:'var(--mid)', lineHeight:1.7 }}>{c.name}님, 환영합니다 🌿<br/>{c.childName}(이)의 소중한 순간을 함께하겠습니다</div>
      <div style={{ background:'var(--cream)', borderRadius:'var(--radius-sm)', padding:14, margin:'14px 0', textAlign:'left' }}>
        {[['보호자',c.name],['연락처',c.phone],['아이 이름',c.childName],[ip?'출산 예정일':'생년월일',fmtDate(base)],['배송 주소',c.address]].map(([k,v])=>(
          <div key={k} style={{ display:'flex', padding:'8px 0', borderBottom:'1px solid var(--cream2)', fontSize:13 }}>
            <span style={{ width:95, color:'var(--mid)', flexShrink:0 }}>{k}</span>
            <span style={{ fontWeight:600 }}>{v}</span>
          </div>
        ))}
      </div>
      {ip && (
        <div style={{ background:'var(--dark)', borderRadius:'var(--radius-sm)', padding:18, margin:'18px 0' }}>
          <div style={{ fontSize:11, color:'var(--light)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:7 }}>🔑 출산일 수정 인증코드</div>
          <div style={{ fontFamily:'monospace', fontSize:26, fontWeight:700, letterSpacing:8, color:'var(--gold)' }}>{c.verificationCode}</div>
          <div style={{ fontSize:12, color:'var(--light)', marginTop:8, lineHeight:1.6 }}>출산 후 "출산일 수정하기" 탭에서 사용하세요<br/>코드는 1회만 사용 가능합니다 — 꼭 보관해주세요!</div>
        </div>
      )}
      <div style={{ background:'var(--cream)', borderRadius:'var(--radius-sm)', padding:14, margin:'12px 0', textAlign:'left' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--mid)', marginBottom:9 }}>🎁 예정된 선물 일정</div>
        {c.gifts.map((g,i) => (
          <div key={i} style={{ display:'flex', gap:10, alignItems:'center', padding:'7px 0', borderBottom:i<c.gifts.length-1?'1px solid var(--cream2)':'none', fontSize:13 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--sage)', flexShrink:0 }}/>
            <div style={{ color:'var(--mid)', minWidth:90 }}>{fmtDate(g.date)}</div>
            <div>{g.label}</div>
          </div>
        ))}
      </div>
      <button className="btn btn-secondary" style={{ width:'100%', marginTop:8, padding:14 }} onClick={onReset}>처음으로 돌아가기</button>
    </div>
  )
}
