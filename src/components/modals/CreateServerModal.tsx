import React from 'react';
import { Plus, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CreateServerForm {
  id: string;
  name: string;
  adminPassword: string;
  showOnPublicList: boolean;
}

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  createForm: CreateServerForm;
  setCreateForm: React.Dispatch<React.SetStateAction<CreateServerForm>>;
  createError: string;
  setCreateError: (error: string) => void;
  creatingServerStatus: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
}

export default function CreateServerModal({
  isOpen,
  onClose,
  createForm,
  setCreateForm,
  createError,
  setCreateError,
  creatingServerStatus,
  onSubmit,
}: CreateServerModalProps) {
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
            setCreateError('');
          }}
        >
          <motion.div
            initial={{ y: '20px', opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '20px', opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            role="dialog" aria-modal="true" aria-label="Add New Server Workspace"
            className="bg-[#070708] w-full h-auto md:max-w-md rounded-t-3xl md:rounded-3xl p-5 md:p-6 space-y-4 shadow-2xl border-t md:border border-white/10 text-slate-350 overflow-y-auto pb-safe animate-in fade-in-50 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-1.5">
                <Plus className="h-[18px] w-[18px] text-amber-500" /> Create Choir Group Workspace
              </h3>
              <button
                onClick={() => {
                  onClose();
                  setCreateError('');
                }}
                className="p-2 hover:bg-white/5 rounded-full text-slate-400 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-500/10 border border-red-550/20 text-red-400 text-[11px] rounded-xl text-center font-bold flex items-center justify-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Server ID (Alphanumeric, dashes, lowercase only) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. city-church-choir"
                  value={createForm.id}
                  onChange={(e) => setCreateForm(p => ({ ...p, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                  className="w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 font-mono"
                />
                <span className="text-[9px] text-zinc-550 block mt-1">This forms your unique workspace identifier.</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Church / Choir Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. City Church Praise Team"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Admin Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Create admin password..."
                  value={createForm.adminPassword}
                  onChange={(e) => setCreateForm(p => ({ ...p, adminPassword: e.target.value }))}
                  className="w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 font-mono tracking-widest"
                />
              </div>

              <div className="flex items-center gap-2 pt-1 select-none">
                <input
                  id="checkbox-show-list"
                  type="checkbox"
                  checked={createForm.showOnPublicList}
                  onChange={(e) => setCreateForm(p => ({ ...p, showOnPublicList: e.target.checked }))}
                  className="w-4 h-4 rounded border-zinc-800 bg-zinc-950 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                />
                <label htmlFor="checkbox-show-list" className="text-xs text-zinc-400 cursor-pointer">
                  Show this workspace in the public servers directory
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setCreateError('');
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-white/5 text-slate-300 hover:bg-white/10 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingServerStatus}
                  className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-full text-xs font-bold transition-all shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {creatingServerStatus ? 'Creating...' : 'Create Server'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
