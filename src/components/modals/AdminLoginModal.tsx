import React, { useState } from 'react';
import { ShieldCheck, X, AlertCircle, KeyRound, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { authAdmin } from '../../lib/db';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

export default function AdminLoginModal({
  isOpen,
  onClose,
  onLoginSuccess,
}: AdminLoginModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter the administrator password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await authAdmin(password);
      if (res.success) {
        if (res.token) {
          localStorage.setItem('dasong_admin_token', res.token);
        }
        localStorage.setItem('dasong_user_role', 'admin');
        localStorage.setItem('dasong_user_name', 'Administrator');
        setPassword('');
        setError('');
        onLoginSuccess();
        onClose();
      } else {
        setError(res.error || 'Incorrect administrator password.');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => {
            setError('');
            setPassword('');
            onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="bg-[#12131A] w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl border border-[#1E202B] text-zinc-300 relative select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1E202B] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-500">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white leading-tight">Admin Login</h3>
                  <p className="text-[11px] text-zinc-500">Unlock full editing, song creation & library management</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setError('');
                  setPassword('');
                  onClose();
                }}
                className="p-1.5 hover:bg-[#1A1C26] rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-550/20 text-red-400 text-xs rounded-xl flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                  Admin Password
                </label>
                <input
                  type="password"
                  placeholder="Enter administrator password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  className="w-full p-3 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs font-mono tracking-widest transition-all"
                />
              </div>

              <div className="flex gap-2.5 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setPassword('');
                    onClose();
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active-touch"
                >
                  {loading ? (
                    <span>Verifying...</span>
                  ) : (
                    <>
                      <Check className="h-4 w-4 stroke-[3]" />
                      <span>Authenticate</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
