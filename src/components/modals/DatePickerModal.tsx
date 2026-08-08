import React, { useState } from 'react';
import { Calendar, Clock, X, Check, FileText } from 'lucide-react';

interface DatePickerModalProps {
  songName: string;
  onSave: (data: { scheduledDate: string; notes?: string }) => void;
  onClose: () => void;
}

export const DatePickerModal: React.FC<DatePickerModalProps> = ({ songName, onSave, onClose }) => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Get today's date in YYYY-MM-DD format for min attribute
  const getMinDate = (): string => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleSave = () => {
    if (!selectedDate) {
      alert('Please select a practice date');
      return;
    }
    onSave({ scheduledDate: selectedDate, notes: notes.trim() || undefined });
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#12131A] border border-[#1E202B] rounded-2xl shadow-2xl p-6 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient background accent */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#1E202B] pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest uppercase text-amber-500 font-bold block">
                PRACTICE SCHEDULE
              </span>
              <h2 className="text-base font-bold text-white tracking-wide truncate max-w-[250px] mt-0.5">
                {songName}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Date Input */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              Practice Date <span className="text-amber-500">*</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={getMinDate()}
              className="w-full p-3 bg-[#1A1C26] border border-[#272A37] focus:border-amber-500/60 rounded-xl text-xs font-mono text-white focus:outline-none transition-all cursor-pointer shadow-inner"
            />
          </div>

          {/* Notes Input */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-500" />
              Optional Practice Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Focus on bridge chords, practice key transposition"
              rows={3}
              className="w-full p-3 bg-[#1A1C26] border border-[#272A37] focus:border-amber-500/60 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none transition-all resize-none shadow-inner"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 border border-amber-400 rounded-xl transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            Save to Schedule
          </button>
        </div>
      </div>
    </div>
  );
};
