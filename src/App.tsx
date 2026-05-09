/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';

// --- TYPES ---
interface LogEntry {
  period: string;
  level: number;
  pred: string | null;
  opp: string;
  actual: string;
  status: 'WIN' | 'LOSS';
  win: boolean;
}

export default function App() {
  const [isAdminPath, setIsAdminPath] = useState(window.location.pathname === '/x/on/top/desh/server');
  const [isLogged, setIsLogged] = useState(false);
  const [notice, setNotice] = useState('');
  const [showNotice, setShowNotice] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);

  // --- LIFTED STATE FOR PERSISTENCE ---
  const [period, setPeriod] = useState<string>('LOADING...');
  const [countdown, setCountdown] = useState<number>(30);
  const [prediction, setPrediction] = useState<string>('ANALYZING');
  const [oppNumbers, setOppNumbers] = useState<number[]>([]);
  const [level, setLevel] = useState<number>(1);
  const [stats, setStats] = useState({ wins: 0, losses: 0, total: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [resultsAnim, setResultsAnim] = useState<{ visible: boolean, isWin: boolean, num: number } | null>(null);

  // Dragging state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const lastIdRef = useRef<string | null>(null);
  const savedPredictionRef = useRef<string | null>(null);
  const savedOppsRef = useRef<number[]>([]);

  // Constants
  const LOGO_URL = "https://i.postimg.cc/j54Pp4Cv/20260423-075533.png";

  const getDeviceId = () => {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  };

  const handleLogin = async () => {
    try {
      const response = await fetch('/api/validate-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          key: accessKey.trim(),
          deviceId: getDeviceId()
        }),
      });

      if (response.ok) {
        setIsLogged(true);
        // Fetch notice after login
        fetchNotice();
      } else {
        const data = await response.json();
        setLoginError(`✗ ${data.error || 'INVALID KEY'}`);
        setAccessKey('');
      }
    } catch (err) {
      setLoginError('✗ CONNECTION ERROR');
    }
  };

  const fetchNotice = async () => {
    try {
      const res = await fetch('/api/notice');
      const data = await res.json();
      if (data.notice) {
        setNotice(data.notice);
        setShowNotice(true);
      }
    } catch (e) {
      console.error("Notice Fetch Error:", e);
    }
  };

  useEffect(() => {
    // Check if we should show admin
    const handlePath = () => {
      setIsAdminPath(window.location.pathname === '/x/on/top/desh/server');
    };
    window.addEventListener('popstate', handlePath);
    return () => window.removeEventListener('popstate', handlePath);
  }, []);

  // Dragging handlers
  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const isInteractive = (e.target as HTMLElement).closest('button, a, input, table');
    if (isInteractive) return;

    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartPos.current = { x: clientX - position.x, y: clientY - position.y };
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      
      setPosition({
        x: clientX - dragStartPos.current.x,
        y: clientY - dragStartPos.current.y
      });
    };

    const handleEnd = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, position]);

  // Removed useEffect for localStorage auth check

  // --- SYNC LOGIC AT APP LEVEL ---
  useEffect(() => {
    if (!isLogged) return;

    const timer = setInterval(() => {
      const now = new Date();
      const sec = 30 - (now.getSeconds() % 30);
      setCountdown(sec);
    }, 1000);

    const sync = async () => {
      try {
        const res = await fetch(`https://mastermindteam.top/api/wingo/30s.json?ts=${Date.now()}`);
        if (!res.ok) return;
        const json = await res.json();
        const latest = json.data.list[0];

        // Check if a new period has settled
        if (lastIdRef.current && lastIdRef.current !== latest.issueNumber) {
          const num = parseInt(latest.number);
          const size = num >= 5 ? "BIG" : "SMALL";
          
          // Use refs to check against the prediction that was active for THIS settled period
          const wasWin = (savedPredictionRef.current === size) || savedOppsRef.current.includes(num);
          
          setResultsAnim({ visible: true, isWin: wasWin, num });
          setTimeout(() => setResultsAnim(null), 2800);

          setStats(prev => ({
            wins: wasWin ? prev.wins + 1 : prev.wins,
            losses: !wasWin ? prev.losses + 1 : prev.losses,
            total: prev.total + 1
          }));

          // Level Logic: If win, reset to 1. If loss, increment level (Max 3, then reset)
          setLevel(prevLvl => {
            if (wasWin) return 1;
            return prevLvl >= 3 ? 1 : prevLvl + 1;
          });

          setLogs(prev => [
            {
              period: latest.issueNumber.slice(-6),
              level: level, // Log the level that was used for this bet
              pred: savedPredictionRef.current,
              opp: savedOppsRef.current.join(','),
              actual: `${size} (${num})`,
              status: wasWin ? 'WIN' : 'LOSS',
              win: wasWin
            },
            ...prev
          ].slice(0, 20));
        }

        // Update tracking ID
        lastIdRef.current = latest.issueNumber;

        // --- FUSIGURO PREDICTION LOGIC (Always generate for the NEXT issue) ---
        const results = json.data.list;
        const numbersData = results.map((r: any) => parseInt(r.number));
        const patternData = numbersData.map((n: number) => n >= 5 ? 'B' : 'S');

        let nextPred: string;
        let calculatedTopTwo: number[] = [];

        let dragonType = patternData[0];
        let streak = 1;
        for (let i = 1; i < 10; i++) {
          if (patternData[i] === dragonType) streak++;
          else break;
        }

        if (streak >= 5) {
          nextPred = dragonType === 'B' ? 'BIG' : 'SMALL';
        } else {
          let bigScore = 0;
          let smallScore = 0;
          const recent = patternData.slice(0, 10).reverse().join('');
          if (/BBBB/.test(recent)) smallScore += 3;
          if (/SSSS/.test(recent)) bigScore += 3;
          
          const bigCount = patternData.filter((p: string) => p === 'B').length;
          const smallCount = patternData.filter((p: string) => p === 'S').length;
          bigScore += bigCount;
          smallScore += smallCount;

          nextPred = bigScore > smallScore ? 'BIG' : 'SMALL';
        }

        const topGroup = nextPred === 'BIG' ? numbersData.filter((n: number) => n >= 5) : numbersData.filter((n: number) => n <= 4);
        const freq: Record<number, number> = {};
        topGroup.forEach((n: number) => freq[n] = (freq[n] || 0) + 1);
        calculatedTopTwo = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(e => parseInt(e[0]));

        setPrediction(nextPred);
        setOppNumbers(calculatedTopTwo);
        
        // Save the prediction that will apply to the NEXT settled result
        savedPredictionRef.current = nextPred;
        savedOppsRef.current = calculatedTopTwo;

        // Show last 6 digits of the NEXT period
        setPeriod(String(BigInt(latest.issueNumber) + 1n).slice(-6));

      } catch(e) {
        console.error("Sync Error:", e);
      }
    };

    sync();
    const syncInterval = setInterval(sync, 4000);

    return () => {
      clearInterval(timer);
      clearInterval(syncInterval);
    };
  }, [isLogged, level]);


  if (isAdminPath) {
    return <AdminPanel />;
  }

  if (!isLogged) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#020b12] z-[10000] font-['Rajdhani']">
        <div className="relative w-full max-w-[360px] p-[1px] rounded-[28px] overflow-hidden">
          <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_20%,#00ffe7_40%,#00ff88_60%,transparent_80%)] animate-spin duration-[4s] linear-infinite" />
          <div className="relative z-10 bg-[#020e1a]/97 p-10 rounded-[26px] text-center backdrop-blur-3xl border border-[#00ffe7]/10">
            <div className="flex flex-col items-center gap-3 mb-8">
              <div className="relative w-24 h-24 bg-black/40 rounded-2xl flex items-center justify-center overflow-hidden shadow-[0_0_20px_rgba(0,255,231,0.4)] border border-[#00ffe7]/20">
                <img src={LOGO_URL} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div>
                <h1 className="font-['Bebas_Neue'] text-3xl tracking-[5px] bg-gradient-to-r from-[#00ffe7] via-white to-[#00ff88] bg-clip-text text-transparent uppercase text-white" style={{fontFamily: "'Bebas Neue', cursive"}}>DESHCLUB AI</h1>
                <p className="text-[9px] text-[#3a6a7a] font-bold tracking-[3px] font-['Space_Mono'] uppercase flex items-center justify-center gap-2">
                  <span className="w-7 h-[1px] bg-gradient-to-r from-transparent to-[#00ffe7]/40" />
                  PREMIUM SIGNAL SYSTEM
                  <span className="w-7 h-[1px] bg-gradient-to-l from-transparent to-[#00ffe7]/40" />
                </p>
              </div>
            </div>
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00ffe7]/40">🔑</span>
              <input 
                type="text" 
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="ENTER ACCESS KEY" 
                className="w-full py-4 pl-12 pr-5 bg-[#00ffe7]/3 border border-[#00ffe7]/15 rounded-xl text-white font-['Space_Mono'] text-sm outline-none focus:border-[#00ffe7]/50 focus:bg-[#00ffe7]/6 transition-all tracking-[2px]"
              />
            </div>
            <button 
              onClick={handleLogin}
              className="w-full py-4 bg-gradient-to-br from-[#00ffe7]/15 to-[#00ff88]/10 border border-[#00ffe7]/35 rounded-xl text-[#00ffe7] font-['Bebas_Neue'] text-lg tracking-[5px] cursor-pointer hover:bg-[#00ffe7]/12 hover:border-[#00ffe7] hover:text-white hover:shadow-[0_0_30px_rgba(0,255,231,0.25)] transition-all active:scale-95 uppercase"
              style={{fontFamily: "'Bebas Neue', cursive"}}
            >
              UNLOCK ACCESS
            </button>
            <div className="flex gap-2 mt-4">
              <a 
                href="https://t.me/ERROR_404_SYSTEM" 
                target="_blank" 
                rel="noreferrer"
                className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 font-['Rajdhani'] text-[10px] font-bold tracking-[1px] hover:bg-white/10 transition-all uppercase"
              >
                Contact Developer
              </a>
              <a 
                href="https://t.me/DESHCLUB_AI_COMMUNITY" 
                target="_blank" 
                rel="noreferrer"
                className="flex-1 py-3 bg-[#0088ff]/10 border border-[#0088ff]/30 rounded-xl text-[#0088ff] font-['Rajdhani'] text-[10px] font-bold tracking-[1px] hover:bg-[#0088ff]/20 transition-all uppercase"
              >
                Join Telegram
              </a>
            </div>
            {loginError && <p className="mt-3 text-[11px] font-bold text-[#ff2d55] tracking-[1px] font-['Space_Mono']">{loginError}</p>}
            <div className="mt-5 text-[9px] text-[#1a3a4a] tracking-[2px] font-semibold uppercase">AUTHORIZED USERS ONLY · ENCRYPTED ACCESS</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#020b12] fixed top-0 left-0">
      <iframe src="https://deshclub1.com/#/register?invitationCode=62568100651" className="w-full h-full border-none z-0" />
      
      {/* PERSISTENT PANEL (ONLY CSS Hiding) */}
      <div className={isMinimized ? 'hidden' : 'block'}>
        <SignalUI 
          period={period}
          countdown={countdown}
          prediction={prediction}
          oppNumbers={oppNumbers}
          level={level}
          stats={stats}
          logs={logs}
          resultsAnim={resultsAnim}
          position={position}
          onDragStart={onDragStart}
          onMinimize={() => setIsMinimized(true)}
        />
      </div>

      {isMinimized && (
        <div 
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-8 right-5 w-[65px] h-[65px] bg-black border-2 border-[#00ffe7] rounded-full flex items-center justify-center z-[9998] shadow-[0_0_25px_rgba(0,255,231,0.5)] cursor-pointer animate-pulse overflow-hidden"
        >
          <img src={LOGO_URL} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center font-['Bebas_Neue'] text-[10px] font-bold text-white tracking-[1px]">
            ▼PANEL
          </div>
        </div>
      )}

      {/* NOTICE MODAL */}
      {showNotice && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
          <div className="bg-[#020e1a] border border-[#00ffe7]/30 p-8 rounded-3xl max-w-md w-full shadow-[0_0_50px_rgba(0,255,231,0.2)]">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">📢</span>
              <h2 className="text-[#00ffe7] font-['Bebas_Neue'] text-2xl tracking-wider">SYSTEM NOTICE</h2>
            </div>
            <p className="text-white/80 font-['Rajdhani'] text-lg leading-relaxed mb-6 whitespace-pre-wrap">
              {notice}
            </p>
            <button 
              onClick={() => setShowNotice(false)}
              className="w-full py-4 bg-[#00ffe7]/10 border border-[#00ffe7]/50 rounded-xl text-[#00ffe7] font-['Bebas_Neue'] text-lg tracking-[3px] hover:bg-[#00ffe7]/20 transition-all uppercase"
            >
              UNDERSTOOD
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- ADMIN PANEL COMPONENT ---
function AdminPanel() {
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [keys, setKeys] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [deviceLimit, setDeviceLimit] = useState('1');
  const [duration, setDuration] = useState('24'); // 24 hours
  const [status, setStatus] = useState('');

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/admin/keys', {
        headers: { 'x-admin-password': password }
      });
      const data = await res.json();
      if (data.keys) {
        setKeys(data.keys);
      }
    } catch (e) {}
  };

  const handleAdminLogin = () => {
    if (password === '#ff00ff') {
      setIsAdmin(true);
      fetchKeys();
      fetch('/api/notice').then(r => r.json()).then(d => setNotice(d.notice));
    } else {
      setStatus('INVALID PASSWORD');
    }
  };

  const generateKey = async () => {
    try {
      const res = await fetch('/api/admin/generate-key', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password 
        },
        body: JSON.stringify({ deviceLimit, durationHours: duration })
      });
      if (res.ok) {
        fetchKeys();
        setStatus('KEY GENERATED SUCCESSFULLY');
      }
    } catch (e) {
      setStatus('GENERATION FAILED');
    }
  };

  const toggleBlock = async (id: number, currentStatus: boolean) => {
    try {
      await fetch('/api/admin/toggle-block', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password 
        },
        body: JSON.stringify({ id, isBlocked: !currentStatus })
      });
      fetchKeys();
    } catch (e) {}
  };

  const deleteKey = async (id: number) => {
    if (!confirm('Are you sure you want to delete this key?')) return;
    try {
      await fetch(`/api/admin/delete-key/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password }
      });
      fetchKeys();
    } catch (e) {}
  };

  const updateNotice = async () => {
    try {
      const res = await fetch('/api/admin/update-notice', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password 
        },
        body: JSON.stringify({ notice })
      });
      if (res.ok) setStatus('NOTICE UPDATED');
    } catch (e) {}
  };

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 bg-[#020b12] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#020e1a] border border-white/10 p-10 rounded-3xl shadow-2xl">
          <h1 className="text-white font-['Bebas_Neue'] text-3xl tracking-widest text-center mb-8 uppercase">Admin Gate</h1>
          <input 
            type="password" 
            placeholder="ENTER ADMIN PASSWORD"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
            className="w-full py-4 px-6 bg-white/5 border border-white/20 rounded-xl text-white font-mono mb-6 outline-none focus:border-[#ff00ff]"
          />
          <button 
            onClick={handleAdminLogin}
            className="w-full py-4 bg-[#ff00ff] text-white font-['Bebas_Neue'] text-xl rounded-xl tracking-widest"
          >
            LOGIN
          </button>
          {status && <p className="text-red-500 text-center mt-4 font-mono text-sm">{status}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020b12] text-white p-8 font-['Rajdhani']">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-6">
          <h1 className="text-4xl font-['Bebas_Neue'] tracking-widest text-[#00ffe7]">ADMIN PANEL <span className="text-white/30 font-mono text-sm ml-4">VERSION-X-DESHCLUB</span></h1>
          <div className="flex gap-4">
            <button onClick={() => window.location.reload()} className="px-6 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all font-bold">REFRESH</button>
            <button onClick={() => setIsAdmin(false)} className="px-6 py-2 bg-red-500/20 border border-red-500/50 text-red-500 rounded-lg font-bold">LOGOUT</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          {/* Key Generator */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
            <h2 className="text-2xl font-['Bebas_Neue'] mb-6 tracking-wide text-[#00ffe7]">Key Generator</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-white/50 mb-2 uppercase tracking-widest">Device Limit</label>
                <div className="grid grid-cols-3 gap-2">
                  {['1', '3', '5'].map(l => (
                    <button 
                      key={l}
                      onClick={() => setDeviceLimit(l)}
                      className={`py-3 rounded-xl border transition-all font-bold ${deviceLimit === l ? 'bg-[#00ffe7] text-black border-[#00ffe7]' : 'bg-transparent border-white/10 text-white/50'}`}
                    >
                      {l} DEV
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-white/50 mb-2 uppercase tracking-widest">Duration</label>
                <select 
                  value={duration} 
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full py-4 px-4 bg-black/40 border border-white/10 rounded-xl outline-none"
                >
                  <option value="1">1 HOUR</option>
                  <option value="72">3 DAYS</option>
                  <option value="120">5 DAYS</option>
                  <option value="168">7 DAYS</option>
                  <option value="720">1 MONTH</option>
                </select>
              </div>
              <button 
                onClick={generateKey}
                className="w-full py-4 bg-gradient-to-r from-[#00ffe7] to-[#00ff88] text-black font-['Bebas_Neue'] text-xl rounded-xl tracking-widest hover:scale-105 active:scale-95 transition-all"
              >
                GENERATE NEW KEY
              </button>
            </div>
          </div>

          {/* User Stats */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
            <h2 className="text-2xl font-['Bebas_Neue'] mb-6 tracking-wide text-[#00ffe7]">System Stats</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/40 p-6 rounded-2xl border border-white/5 text-center">
                <div className="text-3xl font-bold font-mono text-[#00ffe7]">{keys.length}</div>
                <div className="text-[10px] font-bold text-white/30 tracking-widest uppercase mt-1">Total Keys</div>
              </div>
              <div className="bg-black/40 p-6 rounded-2xl border border-white/5 text-center">
                <div className="text-3xl font-bold font-mono text-[#00ff88]">{keys.filter(k => (k.device_ids?.length || 0) > 0).length}</div>
                <div className="text-[10px] font-bold text-white/30 tracking-widest uppercase mt-1">Active Users</div>
              </div>
            </div>
          </div>

          {/* Notice Manager */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
            <h2 className="text-2xl font-['Bebas_Neue'] mb-6 tracking-wide text-[#00ffe7]">Notice Box</h2>
            <textarea 
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
              placeholder="Enter notice message for users..."
              className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 outline-none resize-none mb-4 font-['Rajdhani']"
            />
            <button 
              onClick={updateNotice}
              className="w-full py-4 bg-white/10 border border-white/20 rounded-xl font-['Bebas_Neue'] text-xl tracking-widest hover:bg-white/20 transition-all"
            >
              UPDATE NOTICE
            </button>
          </div>
        </div>

        {/* Keys List */}
        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-8 border-b border-white/10 bg-white/2">
            <h2 className="text-2xl font-['Bebas_Neue'] tracking-wide">License Management</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/3 text-[10px] text-white/40 uppercase font-bold tracking-widest font-mono">
                  <th className="px-8 py-5">Access Key</th>
                  <th className="px-8 py-5">Devices</th>
                  <th className="px-8 py-5">Expires</th>
                  <th className="px-8 py-5">Status</th>
                  <th className="px-8 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-8 py-6 font-mono text-sm">
                      <span className="text-[#00ffe7]">{k.key}</span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold">{k.device_ids?.length || 0} / {k.device_limit} USED</span>
                        <div className="w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-[#00ffe7]" style={{ width: `${((k.device_ids?.length || 0) / k.device_limit) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-xs text-white/50 font-mono">
                      {new Date(k.expires_at).toLocaleString()}
                    </td>
                    <td className="px-8 py-6">
                      {k.is_blocked ? (
                        <span className="px-3 py-1 bg-red-500/10 text-red-500 text-[10px] font-bold rounded-full border border-red-500/30">BLOCKED</span>
                      ) : (
                        <span className="px-3 py-1 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-full border border-green-500/30">ACTIVE</span>
                      )}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => toggleBlock(k.id, k.is_blocked)}
                          className={`px-4 py-2 rounded-lg text-[10px] font-bold border transition-all ${k.is_blocked ? 'bg-[#00ffe7]/20 border-[#00ffe7]/50 text-[#00ffe7]' : 'bg-orange-500/20 border-orange-500/50 text-orange-500'}`}
                        >
                          {k.is_blocked ? 'UNBLOCK' : 'BLOCK'}
                        </button>
                        <button 
                          onClick={() => deleteKey(k.id)}
                          className="px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-500 rounded-lg text-[10px] font-bold"
                        >
                          DELETE
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {status && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#00ffe7] text-black px-8 py-4 rounded-full font-bold shadow-2xl animate-bounce">
          {status}
        </div>
      )}
    </div>
  );
}

// --- UI COMPONENT ---
function SignalUI({ period, countdown, prediction, oppNumbers, level, stats, logs, resultsAnim, onMinimize, position, onDragStart }: any) {
  return (
    <>
      <div 
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        className="fixed top-[10%] right-[10px] w-[300px] bg-[#020a12]/98 rounded-[22px] z-[9999] shadow-[0_0_0_1px_rgba(0,255,231,0.12),0_0_50px_rgba(0,255,231,0.08),0_30px_80px_rgba(0,0,0,0.9)] backdrop-blur-3xl overflow-hidden font-['Rajdhani'] cursor-grab active:cursor-grabbing"
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00ffe7] to-transparent animate-pulse" />
        
        {/* Corners */}
        <div className="absolute top-[6px] left-[6px] w-[14px] h-[14px] border-t border-l border-[#00ffe7]/40 rounded-tl-[3px]" />
        <div className="absolute top-[6px] right-[6px] w-[14px] h-[14px] border-t border-r border-[#00ffe7]/40 rounded-tr-[3px]" />
        <div className="absolute bottom-[6px] left-[6px] w-[14px] h-[14px] border-b border-l border-[#00ffe7]/40 rounded-bl-[3px]" />
        <div className="absolute bottom-[6px] right-[6px] w-[14px] h-[14px] border-b border-r border-[#00ffe7]/40 rounded-br-[3px]" />

        <div className="flex items-center justify-between p-[13px_16px_11px]">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-[7px] h-[7px] bg-[#00ff88] rounded-full shadow-[0_0_8px_#00ff88]" />
            </div>
            <span className="font-['Bebas_Neue'] text-sm text-[#00ffe7] tracking-[2px]">DESHCLUB AI</span>
          </div>
          <div className="flex gap-1">
            <span className="text-[8px] font-bold px-2 py-[3px] rounded-full font-['Space_Mono'] bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88]">LIVE</span>
            <span className="text-[8px] font-bold px-2 py-[3px] rounded-full font-['Space_Mono'] bg-[#00aaff]/10 border border-[#00aaff]/25 text-[#7ecfff]">PERM</span>
          </div>
        </div>

        <div className="flex items-center justify-between p-[10px_16px_8px] bg-black/20 border-b border-[#00ffe7]/6">
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] text-[#2a5a6a] font-bold tracking-[2px] font-['Space_Mono']">NEXT PERIOD (6 DIGIT)</span>
            <span className="font-['Space_Mono'] text-[11px] text-[#7ecfff] font-bold tracking-[1px]">{period}</span>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className={`font-['Bebas_Neue'] text-[22px] leading-none text-shadow-[0_0_15px_rgba(0,255,231,0.5)] ${countdown <= 10 ? 'text-[#ff2d55]' : 'text-[#00ffe7]'}`}>
              {countdown}
            </div>
            <div className="text-[8px] text-[#2a5a6a] tracking-[2px] font-bold">SECONDS</div>
          </div>
        </div>

        <div className="p-[14px_16px_10px]">
          <div className="flex items-center justify-center mb-3">
            {[1, 2, 3].map((l) => (
              <div 
                key={l}
                className={`flex-1 p-[6px_4px] text-center font-['Bebas_Neue'] text-[12px] tracking-[2px] border border-white/7 transition-all
                  ${l === 1 ? 'rounded-l-[10px]' : ''} 
                  ${l === 3 ? 'rounded-r-[10px]' : 'border-r-0'}
                  ${level === l ? (
                    l === 1 ? 'bg-[#00ff88]/12 border-[#00ff88]/35 text-[#00ff88] shadow-[0_0_15px_rgba(0,255,136,0.2)]' :
                    l === 2 ? 'bg-[#ffd700]/10 border-[#ffd700]/35 text-[#ffd700] shadow-[0_0_15px_rgba(255,215,0,0.2)]' :
                    'bg-[#ff2d55]/12 border-[#ff2d55]/35 text-[#ff2d55] shadow-[0_0_15px_rgba(255,45,85,0.2)]'
                  ) : 'text-[#2a4a5a]'}
                `}
              >
                L{l} · {l === 1 ? 'SAFE' : l === 2 ? 'RISKY' : 'HIGH'}
              </div>
            ))}
          </div>

          <div className="text-center relative mb-3">
            <div className={`font-['Bebas_Neue'] text-[52px] tracking-[6px] leading-none transition-all
              ${prediction === 'BIG' ? 'text-[#ff2d55] drop-shadow-[0_0_20px_rgba(255,45,85,0.9)]' : 
                prediction === 'SMALL' ? 'text-[#00ff88] drop-shadow-[0_0_20px_rgba(0,255,136,0.9)]' : 
                'text-[#2a4a5a] text-[20px] py-4'
              }`}
            >
              {prediction}
            </div>
            {/* WINGO 1MIN REMOVED */}
          </div>
        </div>

        <div className="px-4 pb-[10px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[8px] text-[#2a5a6a] font-bold tracking-[2px] font-['Space_Mono'] uppercase">NUMBERS</span>
            <span className="text-[8px] text-[#3a6a7a] font-bold">{oppNumbers.length}/2 ACTIVE</span>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <div 
                key={n}
                className={`aspect-square rounded-[7px] flex items-center justify-center font-['Space_Mono'] text-[10px] font-bold border transition-all
                  ${oppNumbers.includes(n) 
                    ? 'bg-[#00ffe7]/10 border-[#00ffe7]/40 text-[#00ffe7] shadow-[0_0_10px_rgba(0,255,231,0.25)] scale-[1.08]' 
                    : 'bg-white/3 border-white/7 text-[#2a4a5a]'
                  }
                `}
              >
                {n}
              </div>
            ))}
          </div>
        </div>

        <div className="p-[10px_16px_10px] border-t border-[#00ffe7]/6">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[8px] text-[#2a5a6a] font-bold tracking-[2px] font-['Space_Mono']">SIGNAL ACCURACY</span>
            <span className="font-['Bebas_Neue'] text-[18px] text-[#00ff88] drop-shadow-[0_0_10px_rgba(0,255,136,0.5)]">99%</span>
          </div>
          <div className="h-1 bg-white/4 rounded-full overflow-hidden">
            <div className="h-full w-[99%] bg-gradient-to-r from-[#00ff88] to-[#00ffe7]" />
          </div>
          <div className="flex justify-around mt-2">
            <div className="text-center">
              <span className="font-['Bebas_Neue'] text-xl leading-none text-[#00ff88]">{stats.wins}</span>
              <div className="text-[7px] text-[#2a5a6a] tracking-[2px] font-bold font-['Space_Mono']">WINS</div>
            </div>
            <div className="w-[1px] bg-[#00ffe7]/8" />
            <div className="text-center">
              <span className="font-['Bebas_Neue'] text-xl leading-none text-[#ff2d55]">{stats.losses}</span>
              <div className="text-[7px] text-[#2a5a6a] tracking-[2px] font-bold font-['Space_Mono']">LOSSES</div>
            </div>
            <div className="w-[1px] bg-[#00ffe7]/8" />
            <div className="text-center">
              <span className="font-['Bebas_Neue'] text-xl leading-none text-[#5a8a9a]">{stats.total}</span>
              <div className="text-[7px] text-[#2a5a6a] tracking-[2px] font-bold font-['Space_Mono']">TOTAL</div>
            </div>
          </div>
        </div>

        <div className="px-4 pb-[10px]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[8px] text-[#2a5a6a] font-bold tracking-[3px] font-['Space_Mono'] uppercase">SIGNAL HISTORY</span>
            <div className="flex-1 h-[1px] bg-gradient-to-r from-[#00ffe7]/15 to-transparent" />
          </div>
          <div className="bg-black/30 border border-[#00ffe7]/8 rounded-[10px] overflow-hidden max-h-[120px] overflow-y-auto">
            <table className="w-full text-center border-collapse">
              <thead className="sticky top-0 bg-[#020a12] z-10">
                <tr className="bg-[#00ffe7]/2 text-[7px] text-[#2a4a5a] uppercase font-['Space_Mono']">
                  <th className="p-2 border-none">PERIOD</th>
                  <th className="p-2 border-none">LVL</th>
                  <th className="p-2 border-none">PRED</th>
                  <th className="p-2 border-none">RESULT</th>
                  <th className="p-2 border-none">STATUS</th>
                </tr>
              </thead>
              <tbody className="text-[9px] font-['Space_Mono'] text-[#4a6a7a]">
                {logs.map((log: LogEntry, idx: number) => (
                  <tr key={idx} className="border-b border-white/3 hover:bg-[#00ffe7]/2 transition-colors">
                    <td className="p-2 border-none">{log.period}</td>
                    <td className={`p-2 border-none font-bold ${log.level === 1 ? 'text-[#00ff88]' : log.level === 2 ? 'text-[#ffd700]' : 'text-[#ff2d55]'}`}>L{log.level}</td>
                    <td className={`p-2 border-none font-bold ${log.pred === 'BIG' ? 'text-[#ff2d55]' : 'text-[#00ff88]'}`}>{log.pred}</td>
                    <td className={`p-2 border-none font-bold ${log.actual.includes('BIG') ? 'text-[#ff2d55]' : 'text-[#00ff88]'}`}>{log.actual}</td>
                    <td className={`p-2 border-none font-bold ${log.win ? 'text-[#00ff88]' : 'text-[#ff2d55]'}`}>{log.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-4 pb-4 flex flex-col gap-2">
          <button 
            onClick={onMinimize}
            className="w-full p-2 bg-transparent border border-white/5 rounded-lg text-[#1a3a4a] text-[8px] font-bold tracking-[2px] font-['Space_Mono'] hover:text-[#3a6a7a] hover:border-[#00ffe7]/8 transition-all"
          >
            ▼ MINIMIZE PANEL
          </button>
        </div>
      </div>

      {resultsAnim?.visible && (
        <div className="fixed inset-0 z-[11000] flex flex-col items-center justify-center bg-black/88 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="relative mb-5 flex items-center justify-center">
            {[1, 2, 3, 4].map((i) => (
              <div 
                key={i} 
                className={`absolute rounded-full border-[1.5px] border-transparent animate-ping`}
                style={{
                  width: `${80 + i * 50}px`,
                  height: `${80 + i * 50}px`,
                  borderColor: resultsAnim.isWin ? '#00ff88' : '#ff2d55',
                  animationDelay: `${i * 150}ms`,
                  animationDuration: '1.5s'
                }}
              />
            ))}
            <div className={`font-['Bebas_Neue'] text-[80px] tracking-[10px] relative z-10 drop-shadow-[0_0_60px_#00ff88] ${resultsAnim.isWin ? 'text-[#00ff88] animate-bounce' : 'text-[#ff2d55] animate-pulse'}`} style={{fontFamily: "'Bebas Neue', cursive"}}>
              {resultsAnim.isWin ? 'WIN 🏆' : 'LEVEL UP ⚡'}
            </div>
          </div>
          <div className="font-['Bebas_Neue'] text-[28px] tracking-[3px] text-white/50" style={{fontFamily: "'Bebas Neue', cursive"}}>RESULT: {resultsAnim.num}</div>
          <p className="font-['Space_Mono'] text-[10px] tracking-[5px] font-bold mt-4 text-white/40">DESHCLUB AI</p>
        </div>
      )}
    </>
  );
}
