import React from 'react';
import { Layers, X, Search, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface JoinServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  publicServers: any[];
  serverSearchQuery: string;
  setServerSearchQuery: (query: string) => void;
  loadingServers: boolean;
  joiningServer: any | null;
  setJoiningServer: (server: any | null) => void;
  joinRole: 'choir' | 'admin' | null;
  setJoinRole: (role: 'choir' | 'admin' | null) => void;
  joinNameInput: string;
  setJoinNameInput: (name: string) => void;
  joinPasswordInput: string;
  setJoinPasswordInput: (password: string) => void;
  joinError: string;
  setJoinError: (error: string) => void;
  onSubmit: () => Promise<void>;
}

export default function JoinServerModal({
  isOpen,
  onClose,
  publicServers,
  serverSearchQuery,
  setServerSearchQuery,
  loadingServers,
  joiningServer,
  setJoiningServer,
  joinRole,
  setJoinRole,
  joinNameInput,
  setJoinNameInput,
  joinPasswordInput,
  setJoinPasswordInput,
  joinError,
  setJoinError,
  onSubmit,
}: JoinServerModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-xs z-40 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => {
            onClose();
            setJoiningServer(null);
            setJoinRole(null);
            setJoinError('');
          }}
        >
          <motion.div
            initial={{ y: '20px', opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '20px', opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            role="dialog" aria-modal="true" aria-label="Join Church Server"
            className="bg-[#070708] w-full h-[85vh] md:h-auto md:max-w-md rounded-t-3xl md:rounded-3xl p-5 md:p-6 space-y-4 shadow-2xl border-t md:border border-white/10 text-slate-350 overflow-y-auto pb-safe animate-in fade-in-50 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-1.5">
                <Layers className="h-[18px] w-[18px] text-amber-500" /> Select Church Choir Group
              </h3>
              <button
                onClick={() => {
                  onClose();
                  setJoiningServer(null);
                  setJoinRole(null);
                  setJoinError('');
                }}
                className="p-2 hover:bg-white/5 rounded-full text-slate-400 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {joinError && (
              <div className="p-3 bg-red-500/10 border border-red-550/20 text-red-400 text-[11px] rounded-xl text-center font-bold flex items-center justify-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}

            {joiningServer === null ? (
              <div className="space-y-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-zinc-550" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search church or choir server..."
                    value={serverSearchQuery}
                    onChange={(e) => setServerSearchQuery(e.target.value)}
                    className="block w-full pl-10 pr-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white placeholder-zinc-550 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-xs shadow-inner"
                    aria-label="Search church or choir server"
                  />
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {loadingServers ? (
                    <div className="text-center py-8 text-zinc-550 text-xs font-mono">
                      Loading active servers...
                    </div>
                  ) : (
                    (() => {
                      const filtered = publicServers.filter(s =>
                        s.name.toLowerCase().includes(serverSearchQuery.toLowerCase()) ||
                        s.id.toLowerCase().includes(serverSearchQuery.toLowerCase())
                      );
                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-8 text-zinc-550 text-xs font-sans italic">
                            No servers found. You can type a private server ID below or create a new server!
                          </div>
                        );
                      }
                      return filtered.map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            localStorage.setItem(`dasong_server_name_${s.id}`, s.name);
                            setJoiningServer(s);
                          }}
                          className="w-full p-3.5 bg-zinc-950/50 hover:bg-zinc-950 hover:border-amber-500/30 border border-zinc-850 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group active-touch"
                        >
                          <div>
                            <div className="text-xs font-bold text-white group-hover:text-amber-450 transition-colors">
                              {s.name}
                            </div>
                            <div className="text-[10px] text-zinc-550 font-mono mt-0.5">
                              ID: {s.id}
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-emerald-450 opacity-0 group-hover:opacity-100 transition-opacity">
                            [ Join ]
                          </span>
                        </button>
                      ));
                    })()
                  )}
                </div>

                <div className="pt-3 border-t border-white/5 space-y-2">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold block">
                    Join Private Server (by ID)
                  </span>
                  <div className="flex gap-2">
                    <input
                      id="private-server-id-input"
                      type="text"
                      placeholder="e.g. grace-chapel"
                      className="flex-1 px-3 py-2 border border-zinc-850 bg-zinc-950 rounded-xl text-white outline-none focus:border-amber-500 text-xs font-mono"
                      aria-label="Private server ID"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value.trim().toLowerCase();
                          if (val) {
                            setJoiningServer({ id: val, name: val });
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById('private-server-id-input') as HTMLInputElement;
                        const val = input?.value.trim().toLowerCase();
                        if (val) {
                          setJoiningServer({ id: val, name: val });
                        } else {
                          setJoinError('Please enter a server ID.');
                        }
                      }}
                      className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all active-touch"
                    >
                      Find
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-900 border border-zinc-850 rounded-xl text-center">
                  <span className="text-[10px] font-mono uppercase text-zinc-500">Selected Workspace</span>
                  <h4 className="text-sm font-bold text-white mt-1">{joiningServer.name}</h4>
                  <span className="text-[9px] font-mono text-zinc-555 block mt-0.5">ID: {joiningServer.id}</span>
                </div>

                {joinRole === null ? (
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        setJoinRole('choir');
                        setJoinError('');
                      }}
                      className="w-full flex items-center justify-between p-4 bg-zinc-950 border border-zinc-900 hover:border-amber-500/20 rounded-2xl transition-all text-left outline-none cursor-pointer group active-touch"
                    >
                      <div>
                        <p className="font-bold text-xs text-white flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Join as Choir Member
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1">Read lyrics, build setlists, and suggest songs.</p>
                      </div>
                      <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform">→</span>
                    </button>

                    <button
                      onClick={() => {
                        setJoinRole('admin');
                        setJoinError('');
                      }}
                      className="w-full flex items-center justify-between p-4 bg-zinc-950 border border-zinc-900 hover:border-amber-500/20 rounded-2xl transition-all text-left outline-none cursor-pointer group active-touch"
                    >
                      <div>
                        <p className="font-bold text-xs text-white flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          Login as Admin
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1">Prompts password to unlock libraries management.</p>
                      </div>
                      <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform">→</span>
                    </button>

                    <button
                      onClick={() => {
                        setJoiningServer(null);
                        setJoinRole(null);
                        setJoinError('');
                      }}
                      className="w-full p-2.5 bg-zinc-900 text-zinc-400 hover:text-white text-xs font-bold rounded-xl text-center cursor-pointer transition-colors"
                    >
                      ← Select Different Server
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h4 className="text-xs font-bold text-amber-500 uppercase font-mono tracking-wider">
                        {joinRole === 'admin' ? 'Admin Login' : 'Choir Member Name'}
                      </h4>
                      <button
                        onClick={() => { setJoinRole(null); setJoinError(''); }}
                        className="text-[10px] text-zinc-500 hover:text-white font-bold"
                      >
                        ← Change Role
                      </button>
                    </div>

                    {joinRole === 'admin' ? (
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 block uppercase">Admin Password</label>
                        <input
                          type="password"
                          placeholder="Enter password..."
                          value={joinPasswordInput}
                          onChange={(e) => setJoinPasswordInput(e.target.value)}
                          className="w-full p-2.5 bg-zinc-950 border border-zinc-900 rounded-xl text-white outline-none focus:border-amber-500 text-xs font-mono"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSubmit();
                          }}
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 block uppercase">Your Full Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Dave"
                          value={joinNameInput}
                          onChange={(e) => setJoinNameInput(e.target.value)}
                          className="w-full p-2.5 bg-zinc-950 border border-zinc-900 rounded-xl text-white outline-none focus:border-amber-500 text-xs"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSubmit();
                          }}
                        />
                      </div>
                    )}

                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => { setJoinRole(null); setJoinError(''); }}
                        className="px-4 py-2 text-xs font-semibold bg-white/5 text-slate-300 hover:bg-white/10 rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={onSubmit}
                        className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-full text-xs font-bold transition-all shadow-md cursor-pointer active-touch"
                      >
                        Enter Server
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
