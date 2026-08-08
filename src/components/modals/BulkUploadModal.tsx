import React from 'react';
import { Database, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import BulkUpload from '../BulkUpload';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetEventIdForAdd: string | null;
  syncSongsList: () => Promise<void>;
  linkSongsToEvent: (eventId: string, songIds: string[]) => Promise<void>;
}

export default function BulkUploadModal({
  isOpen,
  onClose,
  targetEventIdForAdd,
  syncSongsList,
  linkSongsToEvent,
}: BulkUploadModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-xs z-40 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={onClose}
        >
          <motion.div
            id="bulk-upload-modal" role="dialog" aria-modal="true" aria-label="Bulk Lyrics Import Wizard"
            initial={{ y: '20px', opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '20px', opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="bg-[#12131A] w-full h-full md:h-auto md:max-w-4xl rounded-md p-5 md:p-6 space-y-4 shadow-lg border border-[#1E202B] text-zinc-300 overflow-y-auto pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1E202B] pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-1.5 font-sans">
                <Database className="h-5 w-5 text-amber-500" /> Bulk Lyrics Import Wizard
              </h3>
              <button
                onClick={onClose}
                className="p-2 hover:bg-[#1A1C26] rounded text-zinc-400 cursor-pointer border border-[#1E202B] hover:text-white transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <BulkUpload onSuccess={async (importedSongIds) => {
              await syncSongsList();
              if (targetEventIdForAdd && importedSongIds && importedSongIds.length > 0) {
                await linkSongsToEvent(targetEventIdForAdd, importedSongIds);
              }
            }} />

            <div className="flex gap-2 justify-end pt-3 border-t border-[#1E202B] pb-6 md:pb-0">
              <button
                type="button"
                onClick={onClose}
                className="premium-btn-secondary px-5 py-2 rounded text-xs font-bold"
              >
                Done / Close Wizard
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
