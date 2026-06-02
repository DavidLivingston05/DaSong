import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, Flame, AlertCircle, Copy, Check, Grid } from 'lucide-react';
import { Song } from '../types';
import { saveSongsBatch } from '../lib/db';

interface BulkUploadProps {
  onSuccess: () => void;
}

export default function BulkUpload({ onSuccess }: BulkUploadProps) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number; stage: string }>({ current: 0, total: 0, stage: '' });
  const [importStats, setImportStats] = useState<{ imported: number; timeMs: number } | null>(null);
  
  // Custom multi-song text pasting area
  const [bulkTextArea, setBulkTextArea] = useState<string>('');
  const [hasCopiedTemplate, setHasCopiedTemplate] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sampleTemplate = `Title: Cornerstone
Author: Hillsong Worship
Key: C
BPM: 72
Category: Contemporary Worship

Lyrics:
[C] My hope is built on nothing less
Than [F] Jesus' blood and [G] righteousness
I [Am] dare not trust the [G] sweetest frame
But [F] wholly [G] lean on [C] Jesus' name

---

Title: Victory in Jesus
Author: E.M. Bartlett
Key: G
BPM: 92
Category: Classic Hymn

Lyrics:
[G] I heard an old, old story,
How [C] a Savior came from [G] glory
How He [G] gave His life on [Em] Calvary
To [A7] save a wretch like [D] me`;

  const copyTemplate = () => {
    navigator.clipboard.writeText(sampleTemplate);
    setHasCopiedTemplate(true);
    setTimeout(() => setHasCopiedTemplate(false), 2000);
  };

  // Safe file reader helper wrapped in promise
  const readFileText = (file: File): Promise<{ name: string; text: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          name: file.name.replace(/\.[^/.]+$/, ''), // Strip extension
          text: e.target?.result as string || ''
        });
      };
      reader.onerror = () => resolve({ name: file.name, text: '' });
      reader.readAsText(file);
    });
  };

  // Custom parser to load lyrics files intelligently
  const parseSongContent = (fileName: string, content: string): Song => {
    const lines = content.split('\n');
    let title = fileName;
    let author = 'Unknown Author';
    let key = 'G';
    let bpm = 75;
    let category = 'Uploaded General';
    let lyricsLines: string[] = [];
    let isReadingLyrics = false;

    // Read metadata at top (first 10 lines) if patterns match
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const titleMatch = line.match(/^(?:Title|Name)\s*:\s*(.+)$/i);
      const authorMatch = line.match(/^(?:Author|Artist|Composer|Writer)\s*:\s*(.+)$/i);
      const keyMatch = line.match(/^(?:Key|Chord Key)\s*:\s*([A-G][b#]?)$/i);
      const bpmMatch = line.match(/^(?:Bpm|Tempo)\s*:\s*(\d+)$/i);
      const catMatch = line.match(/^(?:Category|Genre|Theme)\s*:\s*(.+)$/i);

      if (titleMatch) {
        title = titleMatch[1].trim();
      } else if (authorMatch) {
        author = authorMatch[1].trim();
      } else if (keyMatch) {
        key = keyMatch[1].trim();
      } else if (bpmMatch) {
        bpm = parseInt(bpmMatch[1], 10) || 75;
      } else if (catMatch) {
        category = catMatch[1].trim();
      } else if (line.toLowerCase().startsWith('lyrics:')) {
        isReadingLyrics = true;
      } else if (!line.includes(':') || isReadingLyrics) {
        // Simple heuristic: once we hit a line that doesn't have metadata format, or 'lyrics:' was triggered,
        // we collect lyrics from here onwards
        lyricsLines = lines.slice(i);
        break;
      }
    }

    if (lyricsLines.length === 0) {
      lyricsLines = lines;
    }

    // Clean lyrics lines of header tags
    const lyrics = lyricsLines.join('\n').trim();

    return {
      id: `song-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      title: title || fileName,
      author,
      key,
      bpm,
      category,
      lyrics,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  // High performance Batch Processing Loops
  const processFiles = async (files: File[]) => {
    const textFiles = files.filter(f => f.name.endsWith('.txt'));
    if (textFiles.length === 0) {
      alert('Please drop or select valid .txt configuration files containing lyrics.');
      return;
    }

    setLoading(true);
    setImportStats(null);
    const startTime = performance.now();
    const totalCount = textFiles.length;
    const batchSize = 150; // Performance sweet-spot
    const processedSongs: Song[] = [];

    setProgress({ current: 0, total: totalCount, stage: 'Reading flat lyrics TXT files...' });

    // 1. Process and parse files in parallel batches of 50 for superb speed
    for (let i = 0; i < totalCount; i += 50) {
      const chunk = textFiles.slice(i, i + 50);
      const readResults = await Promise.all(chunk.map(file => readFileText(file)));
      
      for (const res of readResults) {
        processedSongs.push(parseSongContent(res.name, res.text));
      }
      
      setProgress(p => ({ ...p, current: Math.min(i + 50, totalCount) }));
    }

    try {
      // 2. Multi-insert save batches into IndexedDB transaction
      setProgress({ current: 0, total: processedSongs.length, stage: 'Writing directly into local Database store...' });
      
      for (let i = 0; i < processedSongs.length; i += batchSize) {
        const batch = processedSongs.slice(i, i + batchSize);
        await saveSongsBatch(batch);
        
        setProgress(p => ({ ...p, current: Math.min(i + batchSize, processedSongs.length) }));
      }

      const elapsed = performance.now() - startTime;
      setImportStats({ imported: processedSongs.length, timeMs: Math.round(elapsed) });
      setLoading(false);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      alert('Failed to sync uploaded songs to cloud database: ' + (err.message || err));
      setLoading(false);
    }
  };

  // Parse bulk paste multiline strings divided by '---'
  const handleBulkTextAreaImport = async () => {
    if (!bulkTextArea.trim()) return;

    setLoading(true);
    setImportStats(null);
    const startTime = performance.now();
    
    // Split songs by custom triple dash
    const chunks = bulkTextArea.split(/^-{3,}\s*$/m).map(c => c.trim()).filter(Boolean);
    const importedSongs: Song[] = [];

    setProgress({ current: 0, total: chunks.length, stage: 'Parsing bulk script notation...' });

    for (let i = 0; i < chunks.length; i++) {
      const item = chunks[i];
      // Grab first lines for potential titles or generate simple ID
      const lines = item.split('\n');
      const song = parseSongContent(`Scripted Hymn ${i+1}`, item);
      importedSongs.push(song);
    }

    try {
      setProgress({ current: 0, total: importedSongs.length, stage: 'Storing in high-performance local table...' });
      
      const batchSize = 100;
      for (let i = 0; i < importedSongs.length; i += batchSize) {
        const batch = importedSongs.slice(i, i + batchSize);
        await saveSongsBatch(batch);
      }

      const elapsed = performance.now() - startTime;
      setImportStats({ imported: importedSongs.length, timeMs: Math.round(elapsed) });
      setLoading(false);
      setBulkTextArea('');
      onSuccess();
    } catch (err: any) {
      console.error(err);
      alert('Failed to sync pasted songs to cloud database: ' + (err.message || err));
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      
      {/* File Drop Drag Box */}
      <div className="lg:col-span-6 flex flex-col space-y-4">
        <label id="drag-drop-label" className="text-sm font-serif font-bold text-amber-950/80 dark:text-stone-300">
          Bulk Multi-TXT Upload
        </label>
        
        <div
          id="lyrics-drop-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex-1 min-h-[220px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? 'border-amber-700 bg-amber-500/10 scale-[1.01]'
              : 'border-amber-900/15 bg-amber-50/50 dark:border-white/10 dark:bg-stone-900/30 hover:bg-amber-500/5'
          }`}
        >
          <input
            id="multi-file-input"
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt"
            onChange={handleFileChange}
            className="hidden"
          />
          
          <div className="h-12 w-12 rounded-full bg-amber-950/5 flex items-center justify-center mb-3 dark:bg-white/5">
            <Upload className="h-6 w-6 text-amber-800 dark:text-amber-400" />
          </div>
          
          <h4 className="font-serif font-semibold text-amber-950 text-base dark:text-stone-100">
            Drag & Drop Lyrics TXT Files
          </h4>
          <p className="text-xs text-amber-900/60 dark:text-stone-400 mt-1.5 max-w-xs mx-auto">
            Drop hundreds of lyrics files at once (e.g., <code className="font-mono bg-amber-950/5 px-1 rounded dark:bg-white/5">AmazingGrace.txt</code>). We will partition tags automatically!
          </p>
          <span className="mt-4 px-3 py-1 bg-amber-900/5 text-xs text-amber-900 font-semibold rounded-lg dark:bg-white/5 dark:text-amber-300 border border-amber-950/5">
            Select TXT Files
          </span>
        </div>

        {/* Loading Display */}
        {loading && (
          <div className="bg-amber-500/5 border border-amber-950/10 rounded-2xl p-4 space-y-3 dark:bg-stone-900 dark:border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-950 dark:text-stone-100 flex items-center gap-1.5 animate-pulse">
                <Flame className="h-4 w-4 animate-bounce text-amber-600" /> {progress.stage}
              </span>
              <span className="font-mono text-amber-900 dark:text-amber-400">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full bg-amber-950/5 h-2 rounded-full overflow-hidden dark:bg-white/5">
              <div
                className="bg-amber-700 h-full rounded-full transition-all duration-100"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Success Stat Reporting */}
        {importStats && (
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 flex items-center gap-3.5 text-emerald-900 dark:text-emerald-300 dark:bg-emerald-950/10">
            <CheckCircle className="h-8 w-8 text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
            <div>
              <h5 className="font-serif font-semibold text-sm">Successfully Loaded to Library!</h5>
              <p className="text-xs text-emerald-800/80 dark:text-stone-300 mt-0.5">
                Successfully stored <strong className="font-mono">{importStats.imported}</strong> songs in IndexedDB in <strong className="font-mono">{importStats.timeMs}ms</strong>. They are searchable immediately.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Copy Paste Script Mode */}
      <div className="lg:col-span-6 flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <label id="bulk-paste-label" className="text-sm font-serif font-bold text-amber-950/80 dark:text-stone-300">
            Bulk Text Script Paste
          </label>
          <button
            onClick={copyTemplate}
            className="text-xs text-amber-900/60 hover:text-amber-950 font-medium flex items-center gap-1.5 dark:text-stone-400 dark:hover:text-amber-200"
          >
            {hasCopiedTemplate ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            Copy Template Example
          </button>
        </div>

        <div className="flex-1 flex flex-col relative">
          <textarea
            id="bulk-text-area"
            value={bulkTextArea}
            onChange={(e) => setBulkTextArea(e.target.value)}
            placeholder={`Paste multiple songs. Divide them with "---" (three dashes) on an empty line. Follow this standard syntax:

Title: Grace Greater Than Our Sin
Author: Julia H. Johnston
Key: G
BPM: 76
Category: Classic Hymn

Lyrics:
[G] Marvelous grace of our [C] loving [G] Lord,
Grace that [G] exceeds our sin and our [D7] guilt`}
            className="flex-1 min-h-[220px] rounded-2xl border border-amber-950/10 p-3.5 font-mono text-xs bg-stone-50 text-amber-950 dark:bg-stone-900 dark:border-white/10 dark:text-stone-200 outline-none focus:border-amber-700"
          />
          
          <button
            id="bulk-text-import-submit"
            onClick={handleBulkTextAreaImport}
            disabled={!bulkTextArea.trim() || loading}
            className={`cursor-pointer mt-3 w-full py-2.5 rounded-xl font-serif text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-2 ${
              bulkTextArea.trim() && !loading
                ? 'bg-amber-900 hover:bg-amber-800 active:scale-98 text-white hover:shadow-md'
                : 'bg-stone-300 dark:bg-stone-800 text-stone-500 cursor-not-allowed'
            }`}
          >
            <FileText className="h-4 w-4" /> Run Bulk Parser Script
          </button>
        </div>
      </div>

    </div>
  );
}
