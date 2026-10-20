import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  Activity, Award, BookOpen, CalendarDays, Check, ChevronRight,
  Coins, Database, Dumbbell, Flame, GraduationCap, LayoutDashboard, LogOut,
  Plus, RefreshCw, Settings, ShieldCheck, Sparkles, Target, Trash2, Wallet,
  X, Zap, Search, Pencil, Languages, Code2, Brain, HeartPulse, BriefcaseBusiness,
} from 'lucide-react';

type Profile = { id: string; display_name: string; avatar: string; total_xp: number; coins: number };
type Mission = { id: string; user_id: string; title: string; category: string; difficulty: string; duration_minutes: number; mission_type: string; due_date: string; note: string; completed: boolean; completed_at: string | null; created_at: string; recurrence_id: string | null };
type Reward = { id: string; user_id: string; title: string; description: string; icon: string; cost: number; active: boolean };
type Transaction = { id: string; event_type: string; xp_delta: number; coins_delta: number; label: string; created_at: string };
type Tab = 'dashboard' | 'missions' | 'status' | 'rewards' | 'history' | 'settings';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase: SupabaseClient | null = url && anonKey && !url.includes('YOUR_PROJECT_ID') && !anonKey.includes('YOUR_SUPABASE')
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

const difficulty: Record<string, { label: string; xp: number; coins: number }> = {
  easy: { label: 'Easy', xp: 10, coins: 3 }, normal: { label: 'Normal', xp: 25, coins: 6 },
  hard: { label: 'Hard', xp: 50, coins: 12 }, elite: { label: 'Elite', xp: 100, coins: 25 },
};
const categories: Record<string, { label: string; icon: typeof Brain; color: string }> = {
  learning: { label: 'Học tập', icon: BookOpen, color: '#aa91ff' },
  programming: { label: 'Lập trình', icon: Code2, color: '#67aaff' },
  language: { label: 'Ngoại ngữ', icon: Languages, color: '#55e1ed' },
  health: { label: 'Sức khỏe', icon: HeartPulse, color: '#48d9a4' },
  discipline: { label: 'Kỷ luật', icon: Flame, color: '#ffc96b' },
  finance: { label: 'Tài chính', icon: Wallet, color: '#ffae7a' },
  personal: { label: 'Cá nhân', icon: Sparkles, color: '#ff8ba2' },
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const localDateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const isOverdue = (mission: Mission) => !mission.completed && mission.due_date < today();
const dueDayOffset = (date: string) => Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86400000);
const fmtDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
const levelInfo = (totalXp: number) => {
  let level = 1; let remaining = Math.max(0, totalXp); let need = 100;
  while (remaining >= need) { remaining -= need; level += 1; need = 100 + (level - 1) * 50; }
  return { level, into: remaining, need, percent: Math.min(100, remaining / need * 100) };
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'done' | 'overdue' | 'daily' | 'weekly'>('all');
  const [showMissionForm, setShowMissionForm] = useState(false);
  const [editing, setEditing] = useState<Mission | null>(null);
  const [missionForm, setMissionForm] = useState({ title: '', category: 'learning', difficulty: 'normal', duration_minutes: 30, mission_type: 'daily', due_date: today(), note: '' });
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [rewardForm, setRewardForm] = useState({ title: '', description: '', icon: '🎁', cost: 50 });
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase || !session?.user) return;
    setLoading(true); setError('');
    try {
      const [p, m, r, t] = await Promise.all([
        supabase.from('profiles').select('id,display_name,avatar,total_xp,coins').eq('id', session.user.id).single(),
        supabase.from('missions').select('*').order('due_date', { ascending: true }).order('created_at', { ascending: false }),
        supabase.from('rewards').select('*').eq('active', true).order('created_at', { ascending: false }),
        supabase.from('reward_transactions').select('id,event_type,xp_delta,coins_delta,label,created_at').order('created_at', { ascending: false }).limit(30),
      ]);
      const firstError = p.error || m.error || r.error || t.error;
      if (firstError) throw firstError;
      setProfile(p.data as Profile); setProfileName((p.data as Profile).display_name);
      setMissions((m.data || []) as Mission[]); setRewards((r.data || []) as Reward[]); setTransactions((t.data || []) as Transaction[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể tải dữ liệu. Kiểm tra migration và quyền truy cập.');
    } finally { setLoading(false); }
  }, [session?.user?.id]);

  useEffect(() => { if (session?.user) void refresh(); else { setProfile(null); setMissions([]); setRewards([]); setTransactions([]); } }, [session?.user?.id, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const todayMissions = useMemo(() => missions.filter(m => m.due_date === today() && m.mission_type === 'daily'), [missions]);
  const dueSoonMissions = useMemo(() => missions.filter(m => !m.completed && dueDayOffset(m.due_date) >= 0 && dueDayOffset(m.due_date) <= 1), [missions]);
  const completeCount = missions.filter(m => m.completed).length;
  const currentLevel = levelInfo(profile?.total_xp || 0);
  const streakInfo = useMemo(() => {
    const dates = new Set(missions.filter(m => m.completed && m.completed_at).map(m => localDateKey(new Date(m.completed_at as string))));
    let current = 0;
    const cursor = new Date(`${today()}T12:00:00`);
    while (dates.has(localDateKey(cursor))) {
      current += 1; cursor.setDate(cursor.getDate() - 1);
    }
    if (!current) {
      cursor.setTime(new Date(`${today()}T12:00:00`).getTime());
      cursor.setDate(cursor.getDate() - 1);
      while (dates.has(localDateKey(cursor))) {
        current += 1; cursor.setDate(cursor.getDate() - 1);
      }
    }
    const ordered = [...dates].sort();
    let best = 0; let run = 0; let previous = '';
    for (const date of ordered) {
      const next = previous ? new Date(`${previous}T12:00:00`) : null;
      if (next) { next.setDate(next.getDate() + 1); run = localDateKey(next) === date ? run + 1 : 1; } else run = 1;
      previous = date; best = Math.max(best, run);
    }
    return { current, best };
  }, [missions]);
  const weeklyProgress = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { key, label: date.toLocaleDateString('vi-VN', { weekday: 'short' }).replace('.', ''), count: missions.filter(m => m.completed && m.completed_at && localDateKey(new Date(m.completed_at)) === key).length };
  }), [missions]);
  const filteredMissions = missions.filter(m => {
    const f = filter === 'all' || (filter === 'open' && !m.completed) || (filter === 'done' && m.completed) || (filter === 'overdue' && isOverdue(m)) || m.mission_type === filter;
    return f && `${m.title} ${m.note} ${categories[m.category]?.label || ''}`.toLowerCase().includes(search.toLowerCase());
  });

  async function submitAuth(e: FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setError(''); setNotice(''); setBusyId('auth');
    try {
      if (authMode === 'signup') {
        const { data, error: signupError } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`, data: { display_name: authName.trim() || 'Player', avatar: (authName.trim() || 'P').slice(0, 1).toUpperCase() } } });
        if (signupError) throw signupError;
        if (!data.session) setNotice('Tài khoản đã được tạo. Hãy kiểm tra email để xác nhận trước khi đăng nhập.');
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (loginError) throw loginError;
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể xác thực.'); }
    finally { setBusyId(''); }
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) { setError(signOutError.message); return; }
    setTab('dashboard'); setNotice('Bạn đã đăng xuất.');
  }

  function openNewMission() {
    setEditing(null); setMissionForm({ title: '', category: 'learning', difficulty: 'normal', duration_minutes: 30, mission_type: 'daily', due_date: today(), note: '' }); setShowMissionForm(true);
  }
  function openEditMission(m: Mission) {
    if (m.completed) return;
    setEditing(m); setMissionForm({ title: m.title, category: m.category, difficulty: m.difficulty, duration_minutes: m.duration_minutes, mission_type: m.mission_type, due_date: m.due_date, note: m.note || '' }); setShowMissionForm(true);
  }
  async function saveMission(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !missionForm.title.trim()) return;
    setBusyId(editing?.id || 'new-mission'); setError(''); setNotice('');
    try {
      const payload = { title: missionForm.title.trim(), category: missionForm.category, difficulty: missionForm.difficulty, duration_minutes: Number(missionForm.duration_minutes), mission_type: missionForm.mission_type, due_date: missionForm.due_date, note: missionForm.note.trim() };
      const result = editing
        ? await supabase.from('missions').update(payload).eq('id', editing.id).eq('user_id', session.user.id)
        : await supabase.from('missions').insert({ ...payload, user_id: session.user.id, recurrence_id: crypto.randomUUID() });
      if (result.error) throw result.error;
      setShowMissionForm(false); setEditing(null); setNotice(editing ? 'Đã cập nhật nhiệm vụ.' : 'Đã tạo nhiệm vụ.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể lưu nhiệm vụ.'); }
    finally { setBusyId(''); }
  }

  async function deleteMission(m: Mission) {
    if (!supabase || m.completed || !confirm(`Xóa nhiệm vụ “${m.title}”?`)) return;
    setBusyId(m.id); setError('');
    try { const { error: delError } = await supabase.from('missions').delete().eq('id', m.id); if (delError) throw delError; setNotice('Đã xóa nhiệm vụ.'); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể xóa nhiệm vụ.'); }
    finally { setBusyId(''); }
  }

  async function completeMission(m: Mission) {
    if (!supabase || m.completed) return;
    setBusyId(m.id); setError(''); setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc('complete_mission', { p_mission_id: m.id });
      if (rpcError) throw rpcError;
      const result = data as { already_completed?: boolean; xp_awarded?: number; coins_awarded?: number };
      setNotice(result.already_completed ? 'Nhiệm vụ này đã được nhận thưởng trước đó.' : `Nhiệm vụ hoàn thành! +${result.xp_awarded || 0} EXP · +${result.coins_awarded || 0} coins.`);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể hoàn thành nhiệm vụ.'); }
    finally { setBusyId(''); }
  }

  function openNewReward() {
    setEditingReward(null); setRewardForm({ title: '', description: '', icon: '🎁', cost: 50 }); setShowRewardForm(true);
  }
  function openEditReward(reward: Reward) {
    setEditingReward(reward); setRewardForm({ title: reward.title, description: reward.description, icon: reward.icon, cost: reward.cost }); setShowRewardForm(true);
  }
  async function saveReward(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !rewardForm.title.trim()) return;
    setBusyId(editingReward?.id || 'new-reward'); setError('');
    try {
      const payload = { title: rewardForm.title.trim(), description: rewardForm.description.trim(), icon: rewardForm.icon.trim() || '🎁', cost: Number(rewardForm.cost) };
      const result = editingReward
        ? await supabase.from('rewards').update(payload).eq('id', editingReward.id).eq('user_id', session.user.id)
        : await supabase.from('rewards').insert({ ...payload, user_id: session.user.id, active: true });
      if (result.error) throw result.error;
      setShowRewardForm(false); setEditingReward(null); setRewardForm({ title: '', description: '', icon: '🎁', cost: 50 }); setNotice(editingReward ? 'Đã cập nhật phần thưởng.' : 'Đã thêm phần thưởng.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể thêm phần thưởng.'); }
    finally { setBusyId(''); }
  }
  async function archiveReward(reward: Reward) {
    if (!supabase || !session?.user || !confirm(`Ẩn phần thưởng “${reward.title}”?`)) return;
    setBusyId(reward.id); setError('');
    try {
      const { error: archiveError } = await supabase.from('rewards').update({ active: false }).eq('id', reward.id).eq('user_id', session.user.id);
      if (archiveError) throw archiveError;
      setNotice('Đã ẩn phần thưởng.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể ẩn phần thưởng.'); }
    finally { setBusyId(''); }
  }

  async function redeemReward(reward: Reward) {
    if (!supabase || !profile) return;
    if (profile.coins < reward.cost) { setError('Bạn chưa có đủ coins để đổi phần thưởng này.'); return; }
    if (!confirm(`Đổi “${reward.title}” với ${reward.cost} coins?`)) return;
    setBusyId(reward.id); setError(''); setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc('redeem_reward', { p_reward_id: reward.id, p_request_id: crypto.randomUUID() });
      if (rpcError) throw rpcError;
      const result = data as { coins_spent?: number; label?: string };
      setNotice(`Đã đổi ${result.label || reward.title}. -${result.coins_spent || reward.cost} coins.`); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể đổi phần thưởng.'); }
    finally { setBusyId(''); }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user) return;
    setBusyId('profile'); setError('');
    try {
      const name = profileName.trim().slice(0, 35) || 'Player';
      const { error: updateError } = await supabase.from('profiles').update({ display_name: name, avatar: name.slice(0, 1).toUpperCase() }).eq('id', session.user.id);
      if (updateError) throw updateError;
      setNotice('Đã lưu hồ sơ nhân vật.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể lưu hồ sơ.'); }
    finally { setBusyId(''); }
  }

  if (!supabase) return <SetupScreen />;
  if (!authReady) return <div className="center-screen"><div className="loader-orb"><Sparkles size={25}/></div><p>Đang khởi tạo hệ thống...</p></div>;
  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} name={authName} setName={setAuthName} busy={busyId === 'auth'} error={error} notice={notice} onSubmit={submitAuth}/>;

  const navItems: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard }, { id: 'missions', label: 'Nhiệm vụ', icon: Target },
    { id: 'status', label: 'Chỉ số nhân vật', icon: Zap }, { id: 'rewards', label: 'Cửa hàng thưởng', icon: Award },
    { id: 'history', label: 'Lịch sử', icon: Activity }, { id: 'settings', label: 'Cài đặt', icon: Settings },
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><CoreMark/><div><b>PERSONAL SYSTEM</b><span>REAL LIFE · LEVEL UP</span></div></div>
      <div className="side-caption">MAIN SYSTEM</div>
      <nav>{navItems.map(item => <button key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}><item.icon size={17}/>{item.label}{item.id === 'missions' && <span className="nav-badge">{missions.filter(m => !m.completed).length}</span>}</button>)}</nav>
      <div className="sidebar-spacer"/><div className="core-card"><div className="core-top"><span className="live-dot"/> CORE SYSTEM <span>ONLINE</span></div><p>Tiến bộ thực tế, từng nhiệm vụ một.</p></div>
      <button className="nav-item signout" onClick={signOut}><LogOut size={17}/> Đăng xuất</button>
    </aside>

    <main className="main-area">
      <header className="topbar"><div><div className="crumb">PERSONAL SYSTEM <ChevronRight size={13}/> <strong>{navItems.find(n => n.id === tab)?.label}</strong></div><div className="mobile-brand"><CoreMark size="tiny"/> PERSONAL SYSTEM</div></div><div className="top-actions"><span className="date-chip"><CalendarDays size={14}/>{new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'short',year:'numeric'})}</span><span className="coin-chip"><Coins size={15}/>{profile?.coins ?? 0} COINS</span><div className="user-avatar">{(profile?.avatar || 'P').slice(0,1)}</div></div></header>
      <div className="page-wrap">
        {(error || notice) && <div className={`flash ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}><span>{error || notice}</span><div className="flash-actions">{error && <button className="text-button" onClick={() => void refresh()} disabled={loading}>Thử lại</button>}<button onClick={() => {setError('');setNotice('');}} aria-label="Đóng"><X size={15}/></button></div></div>}
        {loading && <div className="loading-line"><span/>Đang đồng bộ dữ liệu...</div>}
        {tab === 'dashboard' && <>
          <PageHeading eyebrow="SYSTEM OVERVIEW" title={`Chào mừng trở lại, ${profile?.display_name || 'Player'}.`} subtitle="Một ngày mới, một cơ hội để tiến thêm một bước." action={<button className="btn primary" onClick={openNewMission}><Plus size={16}/> Tạo nhiệm vụ</button>}/>
          <div className="stats-grid">
            <Stat icon={Zap} label="EXP TÍCH LŨY" value={(profile?.total_xp || 0).toLocaleString('vi-VN')} sub={`${currentLevel.into} EXP tới cấp tiếp theo`} color="cyan"/>
            <Stat icon={Target} label="NHIỆM VỤ HÔM NAY" value={`${todayMissions.filter(m=>m.completed).length} / ${todayMissions.length}`} sub={`${todayMissions.length ? Math.round(todayMissions.filter(m=>m.completed).length/todayMissions.length*100) : 0}% hoàn thành`} color="blue"/>
            <Stat icon={Coins} label="COINS CÓ SẴN" value={profile?.coins ?? 0} sub="Dùng để đổi phần thưởng" color="gold"/>
            <Stat icon={Flame} label="NHIỆM VỤ ĐÃ XONG" value={completeCount} sub="Tiếp tục xây thói quen" color="green"/>
            <Stat icon={CalendarDays} label="STREAK HIỆN TẠI" value={`${streakInfo.current} ngày`} sub={`Kỷ lục: ${streakInfo.best} ngày`} color="violet"/>
            <Stat icon={CalendarDays} label="SẮP ĐẾN HẠN" value={dueSoonMissions.length} sub="Hôm nay và ngày mai" color="orange"/>
          </div>
          <section className="panel weekly-panel"><PanelHead title="NHỊP ĐỘ 7 NGÀY" subtitle="Số nhiệm vụ đã hoàn thành mỗi ngày"/><div className="weekly-bars">{weeklyProgress.map(day=><div className="weekly-day" key={day.key}><span className="weekly-count">{day.count || ''}</span><div className="weekly-bar"><span style={{height:`${Math.min(100, day.count * 25)}%`}}/></div><small>{day.label}</small></div>)}</div></section>
          <div className="dashboard-grid">
            <section className="panel"><PanelHead title="NHIỆM VỤ HÔM NAY" subtitle="Hoàn thành để nhận EXP và coins" action={<button className="text-button" onClick={()=>setTab('missions')}>TẤT CẢ <ChevronRight size={13}/></button>}/>
              <div className="progress-section"><div className="progress-label"><span>Tiến độ hôm nay</span><b>{todayMissions.filter(m=>m.completed).length}/{todayMissions.length}</b></div><div className="progress-track"><span style={{width:`${todayMissions.length ? todayMissions.filter(m=>m.completed).length/todayMissions.length*100 : 0}%`}}/></div></div>
              <div className="mission-list">{todayMissions.length ? todayMissions.map(m=><MissionRow key={m.id} mission={m} busy={busyId===m.id} onComplete={()=>completeMission(m)} onEdit={()=>openEditMission(m)} onDelete={()=>deleteMission(m)}/>) : <Empty icon={Target} title="Chưa có nhiệm vụ hôm nay" text="Tạo một thử thách nhỏ đầu tiên của bạn." action={<button className="btn primary" onClick={openNewMission}><Plus size={15}/> Tạo nhiệm vụ</button>}/>}</div>
            </section>
            <div className="right-stack"><section className="panel character-panel"><div className="panel-eyebrow">CHARACTER STATUS <span className="rank-pill">{currentLevel.level < 3?'RANK E':currentLevel.level < 5?'RANK D':currentLevel.level < 8?'RANK C':currentLevel.level < 12?'RANK B':'RANK A'}</span></div><div className="character-info"><CoreMark size="hero"/><div className="character-name"><b>{profile?.display_name}</b><span>AWAKENED USER · LEVEL {String(currentLevel.level).padStart(2,'0')}</span></div><strong className="level-value">{String(currentLevel.level).padStart(2,'0')}</strong></div><div className="progress-label"><span>EXP tiến tới cấp tiếp theo</span><b>{currentLevel.into}/{currentLevel.need}</b></div><div className="progress-track"><span style={{width:`${currentLevel.percent}%`}}/></div><div className="split-note"><span>TỔNG EXP <b>{profile?.total_xp || 0}</b></span><span>{Math.round(currentLevel.percent)}% TO NEXT LEVEL</span></div></section>
              <section className="panel"><PanelHead title="BẮT ĐẦU TỪ MỘT VIỆC NHỎ" subtitle="Gợi ý để giữ nhịp ổn định"/><div className="tip-box"><Sparkles size={18}/><p>Đặt một nhiệm vụ đủ nhỏ để hoàn thành ngay hôm nay. Tính nhất quán quan trọng hơn một ngày hoàn hảo.</p></div></section></div>
          </div>
        </>}

        {tab === 'missions' && <><PageHeading eyebrow="MISSION CONTROL" title="Quản lý nhiệm vụ" subtitle="Tạo, cập nhật và hoàn thành nhiệm vụ. Mỗi nhiệm vụ chỉ nhận thưởng một lần." action={<button className="btn primary" onClick={openNewMission}><Plus size={16}/> Tạo nhiệm vụ</button>}/>
          <section className="panel"><PanelHead title="MISSION LOG" subtitle={`${missions.length} nhiệm vụ trong hệ thống`}/><div className="toolbar"><div className="search-field"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm nhiệm vụ..."/></div><select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">Tất cả</option><option value="open">Chưa hoàn thành</option><option value="overdue">Quá hạn</option><option value="done">Đã hoàn thành</option><option value="daily">Hằng ngày</option><option value="weekly">Hằng tuần</option></select></div><div className="mission-list">{filteredMissions.length?filteredMissions.map(m=><MissionRow key={m.id} mission={m} busy={busyId===m.id} onComplete={()=>completeMission(m)} onEdit={()=>openEditMission(m)} onDelete={()=>deleteMission(m)}/>):<Empty icon={Target} title="Không có nhiệm vụ phù hợp" text="Thử thay đổi bộ lọc hoặc tạo nhiệm vụ mới."/>}</div></section>
        </>}

        {tab === 'status' && <><PageHeading eyebrow="CHARACTER PROFILE" title="Chỉ số nhân vật" subtitle="Theo dõi nỗ lực đã ghi nhận. Các chỉ số trong bản khởi đầu là thước đo game hóa, không phải đánh giá khoa học."/><div className="stats-grid"><Stat icon={Zap} label="LEVEL" value={currentLevel.level} sub={`${currentLevel.into}/${currentLevel.need} EXP ở cấp này`} color="cyan"/><Stat icon={Award} label="TỔNG EXP" value={profile?.total_xp ?? 0} sub="Tích lũy từ nhiệm vụ" color="blue"/><Stat icon={Coins} label="COINS" value={profile?.coins ?? 0} sub="Số dư hiện tại" color="gold"/><Stat icon={Check} label="HOÀN THÀNH" value={completeCount} sub="Nhiệm vụ đã được ghi nhận" color="green"/></div><div className="attribute-grid">{Object.entries({INT:{title:'Trí tuệ',desc:'Học tập và giải quyết vấn đề',icon:Brain},WIS:{title:'Minh triết',desc:'Đọc hiểu và phản tư',icon:GraduationCap},DISC:{title:'Kỷ luật',desc:'Duy trì cam kết',icon:Flame},VIT:{title:'Sức sống',desc:'Vận động và nghỉ ngơi',icon:Dumbbell},CHA:{title:'Giao tiếp',desc:'Ngoại ngữ và diễn đạt',icon:Languages},FIN:{title:'Tài chính',desc:'Quản lý chi tiêu',icon:BriefcaseBusiness}}).map(([code,a],i)=>{const Icon=a.icon;const value=Math.min(100,10+missions.filter(m=>m.completed && (i===0?['learning','programming','language'].includes(m.category):i===1?['learning','finance'].includes(m.category):i===2?['discipline','programming','health'].includes(m.category):i===3?m.category==='health':i===4?m.category==='language':m.category==='finance')).length*7);return <div className="panel attribute-card" key={code}><div className="attribute-top"><div className={`stat-icon color-${['cyan','violet','gold','green','blue','orange'][i]}`}><Icon size={19}/></div><div><b>{code} · {a.title}</b><span>{a.desc}</span></div><strong>{value}</strong></div><div className="progress-track"><span style={{width:`${value}%`}}/></div><small>{value}/100 · tăng theo nhiệm vụ đã hoàn thành</small></div>})}</div></>}

        {tab === 'rewards' && <><PageHeading eyebrow="REWARD EXCHANGE" title="Cửa hàng phần thưởng" subtitle="Thêm phần thưởng của riêng bạn và đổi bằng coins tích lũy." action={<button className="btn primary" onClick={openNewReward}><Plus size={16}/> Thêm phần thưởng</button>}/><div className="wallet-banner"><div className="wallet-icon"><Wallet size={21}/></div><div><b>SỐ DƯ PHẦN THƯỞNG</b><span>Coins kiếm được từ các nhiệm vụ đã hoàn thành</span></div><strong><Coins size={19}/>{profile?.coins ?? 0}</strong></div><div className="reward-grid">{rewards.map(r=><article className="panel reward-card" key={r.id}><div className="reward-illustration">{r.icon || <Award size={34}/>}</div><div className="reward-content"><b>{r.title}</b><p>{r.description || 'Tự thưởng sau một nỗ lực đáng ghi nhận.'}</p><div className="reward-bottom"><strong><Coins size={15}/>{r.cost}</strong><button className="btn secondary" disabled={busyId===r.id || (profile?.coins||0)<r.cost} onClick={()=>redeemReward(r)}>{busyId===r.id?'Đang xử lý':'Đổi thưởng'}</button></div><div className="reward-actions"><button className="row-action-button" onClick={()=>openEditReward(r)}>Sửa</button><button className="row-action-button danger-action" onClick={()=>archiveReward(r)} disabled={busyId===r.id}>Ẩn</button></div></div></article>)}</div>{!rewards.length&&<Empty icon={Award} title="Cửa hàng chưa có phần thưởng" text="Thêm phần thưởng đầu tiên để tạo động lực." action={<button className="btn primary" onClick={openNewReward}><Plus size={15}/> Thêm phần thưởng</button>}/>}</>}

        {tab === 'history' && <><PageHeading eyebrow="ACTIVITY LOG" title="Lịch sử giao dịch" subtitle="Các khoản EXP và coins được ghi ở phía cơ sở dữ liệu."/><section className="panel"><PanelHead title="TRANSACTION HISTORY" subtitle={`${transactions.length} giao dịch gần nhất`}/><div className="mission-list">{transactions.map(t=><div className="transaction-row" key={t.id}><div className="transaction-icon">{t.event_type==='mission_reward'?<Zap size={17}/>:<Award size={17}/>}</div><div className="transaction-info"><b>{t.label}</b><span>{fmtDate(t.created_at)} · {t.event_type==='mission_reward'?'Nhiệm vụ':'Đổi thưởng'}</span></div><div className="transaction-values">{t.xp_delta!==0&&<span className="xp-value">+{t.xp_delta} EXP</span>}<span className={t.coins_delta<0?'spent-value':'coin-value'}>{t.coins_delta>0?'+':''}{t.coins_delta} coins</span></div></div>)}{!transactions.length&&<Empty icon={Activity} title="Chưa có lịch sử" text="Hoàn thành một nhiệm vụ hoặc đổi phần thưởng để bắt đầu ghi nhận."/>}</div></section></>}

        {tab === 'settings' && <><PageHeading eyebrow="SYSTEM CONFIGURATION" title="Cài đặt hệ thống" subtitle="Quản lý hồ sơ và phiên đăng nhập của bạn."/><div className="settings-grid"><section className="panel setting-panel"><PanelHead title="HỒ SƠ NHÂN VẬT" subtitle="Thông tin đồng bộ qua Supabase"/><form className="setting-form" onSubmit={saveProfile}><label>Tên nhân vật<input value={profileName} maxLength={35} onChange={e=>setProfileName(e.target.value)} required/></label><label>Email tài khoản<input value={session.user.email || ''} disabled/></label><button className="btn primary" disabled={busyId==='profile'}>{busyId==='profile'?'Đang lưu...':'Lưu hồ sơ'}</button></form></section><section className="panel setting-panel"><PanelHead title="BẢO MẬT & DỮ LIỆU" subtitle="Thông tin quan trọng"/><div className="security-note"><ShieldCheck size={19}/><p>Database dùng Row Level Security để người dùng chỉ truy cập dữ liệu của chính họ. EXP, coins và giao dịch được xử lý bởi database function; không đặt service-role key ở frontend.</p></div><div className="security-note"><Database size={19}/><p>Dữ liệu được lưu trên Supabase và có thể sử dụng sau khi đăng nhập từ thiết bị khác. Hãy bật xác nhận email và cấu hình URL chuyển hướng trong phần Authentication trước khi phát hành.</p></div><button className="btn danger" onClick={signOut}><LogOut size={16}/> Đăng xuất</button></section></div></>}
        <footer className="app-footer">PERSONAL SYSTEM <span>•</span> Tiến bộ thực tế, từng nhiệm vụ một.</footer>
      </div>
    </main>

    {showMissionForm && <Modal title={editing ? 'Chỉnh sửa nhiệm vụ' : 'Tạo nhiệm vụ mới'} onClose={()=>setShowMissionForm(false)}><form className="modal-form" onSubmit={saveMission}><label className="full">Tên nhiệm vụ<input value={missionForm.title} maxLength={90} onChange={e=>setMissionForm({...missionForm,title:e.target.value})} placeholder="Ví dụ: Học tiếng Trung 30 phút" required/></label><label>Danh mục<select value={missionForm.category} onChange={e=>setMissionForm({...missionForm,category:e.target.value})}>{Object.entries(categories).map(([k,v])=><option value={k} key={k}>{v.label}</option>)}</select></label><label>Độ khó<select value={missionForm.difficulty} onChange={e=>setMissionForm({...missionForm,difficulty:e.target.value})}>{Object.entries(difficulty).map(([k,v])=><option value={k} key={k}>{v.label} · {v.xp} EXP / {v.coins} coins</option>)}</select></label><label>Thời lượng (phút)<input type="number" min={1} max={1440} value={missionForm.duration_minutes} onChange={e=>setMissionForm({...missionForm,duration_minutes:Number(e.target.value)})} required/></label><label>Loại nhiệm vụ<select value={missionForm.mission_type} onChange={e=>setMissionForm({...missionForm,mission_type:e.target.value})}><option value="daily">Hằng ngày</option><option value="weekly">Hằng tuần</option></select></label><label>Ngày dự kiến<input type="date" value={missionForm.due_date} onChange={e=>setMissionForm({...missionForm,due_date:e.target.value})} required/></label><label className="full">Ghi chú<textarea maxLength={220} rows={3} value={missionForm.note} onChange={e=>setMissionForm({...missionForm,note:e.target.value})} placeholder="Tiêu chí hoàn thành (không bắt buộc)"/></label><div className="modal-actions full"><button type="button" className="btn secondary" onClick={()=>setShowMissionForm(false)}>Hủy</button><button className="btn primary" disabled={busyId==='new-mission'||Boolean(editing&&busyId===editing.id)}>{busyId==='new-mission'||(editing&&busyId===editing.id)?'Đang lưu...':editing?'Lưu thay đổi':'Tạo nhiệm vụ'}</button></div></form></Modal>}
    {showRewardForm && <Modal title={editingReward ? 'Chỉnh sửa phần thưởng' : 'Thêm phần thưởng'} onClose={()=>setShowRewardForm(false)}><form className="modal-form" onSubmit={saveReward}><label className="full">Tên phần thưởng<input value={rewardForm.title} maxLength={90} onChange={e=>setRewardForm({...rewardForm,title:e.target.value})} required placeholder="Ví dụ: Giải trí 30 phút"/></label><label>Biểu tượng<input value={rewardForm.icon} maxLength={8} onChange={e=>setRewardForm({...rewardForm,icon:e.target.value})}/></label><label>Giá coins<input type="number" min={1} max={1000000} value={rewardForm.cost} onChange={e=>setRewardForm({...rewardForm,cost:Number(e.target.value)})} required/></label><label className="full">Mô tả<textarea maxLength={220} rows={3} value={rewardForm.description} onChange={e=>setRewardForm({...rewardForm,description:e.target.value})}/></label><div className="modal-actions full"><button type="button" className="btn secondary" onClick={()=>setShowRewardForm(false)}>Hủy</button><button className="btn primary" disabled={busyId==='new-reward'||Boolean(editingReward&&busyId===editingReward.id)}>{busyId==='new-reward'||(editingReward&&busyId===editingReward.id)?'Đang lưu...':editingReward?'Lưu thay đổi':'Thêm phần thưởng'}</button></div></form></Modal>}
  </div>;
}

function SetupScreen() {
  return <div className="center-screen"><div className="setup-card"><CoreMark size="large"/><div className="eyebrow">SYSTEM INITIALIZATION</div><h1>Chưa kết nối backend</h1><p>Ứng dụng đã sẵn sàng để dùng Supabase. Hãy tạo project, chạy migration SQL và cấu hình hai biến môi trường theo file <code>.env.example</code>.</p><ol><li>Tạo project Supabase của bạn.</li><li>Chạy file <code>supabase/migrations/20261019000000_initial.sql</code> trong SQL Editor.</li><li>Sao chép Project URL và publishable/anon key vào file <code>.env</code>.</li><li>Chạy lại <code>npm run dev</code>.</li></ol><div className="setup-security"><ShieldCheck size={18}/> Không dùng service_role key trong frontend.</div></div></div>;
}
function AuthScreen(props: { mode: 'login'|'signup'; setMode: (v:'login'|'signup')=>void; email:string; setEmail:(v:string)=>void; password:string; setPassword:(v:string)=>void; name:string; setName:(v:string)=>void; busy:boolean; error:string; notice:string; onSubmit:(e:FormEvent)=>void }) {
  return <div className="auth-layout"><div className="auth-backdrop"><div className="auth-glow glow-one"/><div className="auth-glow glow-two"/><div className="auth-slogan"><div className="brand"><CoreMark/><div><b>PERSONAL SYSTEM</b><span>REAL LIFE · LEVEL UP</span></div></div><div className="eyebrow">YOUR LIFE. YOUR QUEST.</div><h1>Không cần trở thành người khác.<br/><em>Hãy nâng cấp chính mình.</em></h1><p>Mỗi nhiệm vụ hoàn thành là một bước tiến có thể nhìn thấy. Bắt đầu từ hôm nay.</p><div className="slogan-stats"><div><Zap/><b>EXP</b><span>Tích lũy nỗ lực</span></div><div><Award/><b>LEVEL UP</b><span>Nhìn thấy tiến bộ</span></div><div><ShieldCheck/><b>PRIVATE</b><span>Dữ liệu riêng tư</span></div></div></div></div><div className="auth-panel"><form className="auth-form" onSubmit={props.onSubmit}><div className="eyebrow">ACCESS CONTROL</div><h2>{props.mode==='login'?'Đăng nhập hệ thống':'Tạo tài khoản'}</h2><p>{props.mode==='login'?'Tiếp tục hành trình nâng cấp bản thân.':'Thiết lập hồ sơ cá nhân để bắt đầu.'}</p>{props.error&&<div className="flash is-error">{props.error}</div>}{props.notice&&<div className="flash is-success">{props.notice}</div>}{props.mode==='signup'&&<label>Tên hiển thị<input value={props.name} maxLength={35} onChange={e=>props.setName(e.target.value)} placeholder="Tên nhân vật" required/></label>}<label>Email<input type="email" value={props.email} onChange={e=>props.setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required/></label><label>Mật khẩu<input type="password" minLength={8} value={props.password} onChange={e=>props.setPassword(e.target.value)} placeholder="Ít nhất 8 ký tự" autoComplete={props.mode==='login'?'current-password':'new-password'} required/></label><button className="btn primary auth-submit" disabled={props.busy}>{props.busy?'Đang xác thực...':props.mode==='login'?'Đăng nhập ↗':'Tạo tài khoản ↗'}</button><div className="auth-switch">{props.mode==='login'?'Chưa có tài khoản?':'Đã có tài khoản?'} <button type="button" onClick={()=>props.setMode(props.mode==='login'?'signup':'login')}>{props.mode==='login'?'Đăng ký':'Đăng nhập'}</button></div><small>Bằng việc sử dụng ứng dụng, bạn đồng ý lưu dữ liệu nhiệm vụ và tiến độ trong cơ sở dữ liệu riêng của tài khoản.</small></form></div></div>;
}
function PageHeading({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:ReactNode}) {return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;}
function CoreMark({size='default'}:{size?:'tiny'|'default'|'hero'|'large'}) {return <span className={`core-mark core-mark-${size}`} aria-hidden="true"><span/></span>;}
function Stat({icon:Icon,label,value,sub,color}:{icon:typeof Zap;label:string;value:ReactNode;sub:string;color:string}) {return <div className="panel stat-card"><div className="stat-label">{label}<span className={`stat-icon color-${color}`}><Icon size={17}/></span></div><div className="stat-value">{value}</div><div className="stat-sub">{sub}</div></div>;}
function PanelHead({title,subtitle,action}:{title:string;subtitle:string;action?:ReactNode}) {return <div className="panel-head"><div><b>{title}</b><span>{subtitle}</span></div>{action}</div>;}
function MissionRow({mission,busy,onComplete,onEdit,onDelete}:{mission:Mission;busy:boolean;onComplete:()=>void;onEdit:()=>void;onDelete:()=>void}) {
  const cat=categories[mission.category]||categories.personal;const diff=difficulty[mission.difficulty]||difficulty.normal;const Icon=cat.icon;
  const overdue = isOverdue(mission);
  return <div className={`mission-row ${mission.completed?'is-complete':''} ${overdue?'is-overdue':''}`}><button className={`mission-check ${mission.completed?'checked':''}`} aria-label="Hoàn thành nhiệm vụ" disabled={mission.completed||busy} onClick={onComplete}>{mission.completed?<Check size={14}/>:busy?<RefreshCw size={14} className="spin"/>:null}</button><div className="mission-detail"><b>{mission.title}</b><div className="mission-meta"><span style={{color:cat.color}}><Icon size={12}/>{cat.label}</span><span>{mission.duration_minutes} phút</span><span>{diff.label}</span><span>{mission.mission_type==='weekly'?'Hằng tuần':'Hằng ngày'}</span><span className={overdue?'due-overdue':''}>{overdue?'Quá hạn':`Hạn ${fmtDate(mission.due_date)}`}</span></div>{mission.note&&<p>{mission.note}</p>}</div><div className="mission-reward"><b>+{diff.xp}</b><span>EXP</span><small><Coins size={11}/> +{diff.coins}</small></div>{!mission.completed&&<div className="row-actions"><button title="Chỉnh sửa" aria-label="Chỉnh sửa" onClick={onEdit}><Pencil size={14}/></button><button title="Xóa" aria-label="Xóa" onClick={onDelete}><Trash2 size={14}/></button></div>}</div>;
}
function Empty({icon:Icon,title,text,action}:{icon:typeof Target;title:string;text:string;action?:ReactNode}) {return <div className="empty-state"><div className="empty-icon"><Icon size={23}/></div><b>{title}</b><p>{text}</p>{action}</div>;}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>('input, select, textarea')
      || modalRef.current?.querySelector<HTMLElement>('button');
    firstFocusable?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  return <div className="modal-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><div className="eyebrow">SYSTEM INPUT</div><h2 id="modal-title">{title}</h2></div><button type="button" className="close-btn" onClick={onClose} aria-label="Đóng"><X size={18}/></button></div>{children}</div></div>;
}
