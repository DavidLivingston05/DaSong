import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, Flame, AlertCircle, Copy, Check, Globe, Link, Save, ArrowRight, Clipboard, Sparkles } from 'lucide-react';
import { Song } from '../types';
import { saveSongsBatch } from '../lib/db';
import { parseTwoLineChords } from '../utils/lyricsParser';
import { stripChords } from '../utils/chordTransposer';

interface BulkUploadProps {
  onSuccess: (importedSongIds?: string[]) => void;
}

export default function BulkUpload({ onSuccess }: BulkUploadProps) {
  const [activeImportTab, setActiveImportTab] = useState<'file' | 'paste' | 'url'>('file');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number; stage: string }>({ current: 0, total: 0, stage: '' });
  const [importStats, setImportStats] = useState<{ imported: number; timeMs: number } | null>(null);
  
  // Custom multi-song text pasting area
  const [bulkTextArea, setBulkTextArea] = useState<string>('');
  const [hasCopiedTemplate, setHasCopiedTemplate] = useState<boolean>(false);

  // URL lyrics scraping states
  const [scrapeUrl, setScrapeUrl] = useState<string>('');
  const [scrapeLoading, setScrapeLoading] = useState<boolean>(false);
  const [scrapePreview, setScrapePreview] = useState<{ title: string; author: string; category: string; bpm: number; lyrics: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sampleTemplate = `Title: Cornerstone
Author: Hillsong Worship
Key: C
BPM: 72
Category: Contemporary Worship

Lyrics:
My hope is built on nothing less
Than Jesus' blood and righteousness
I dare not trust the sweetest frame
But wholly lean on Jesus' name

---

Title: Victory in Jesus
Author: E.M. Bartlett
Key: G
BPM: 92
Category: Classic Hymn

Lyrics:
I heard an old, old story,
How a Savior came from glory
How He gave His life on Calvary
To save a wretch like me`;

  const copyTemplate = () => {
    navigator.clipboard.writeText(sampleTemplate);
    setHasCopiedTemplate(true);
    setTimeout(() => setHasCopiedTemplate(false), 2000);
  };

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

  const parseSongContent = (fileName: string, content: string): Song => {
    const lines = content.split('\n');
    let title = fileName;
    let author = 'Unknown Author';
    let key = 'G';
    let bpm = 75;
    let category = 'Uploaded General';
    let lyricsLines: string[] = [];
    let isReadingLyrics = false;

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
        lyricsLines = lines.slice(i);
        break;
      }
    }

    if (lyricsLines.length === 0) {
      lyricsLines = lines;
    }

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
    const batchSize = 150;
    const processedSongs: Song[] = [];

    setProgress({ current: 0, total: totalCount, stage: 'Reading flat lyrics TXT files...' });

    for (let i = 0; i < totalCount; i += 50) {
      const chunk = textFiles.slice(i, i + 50);
      const readResults = await Promise.all(chunk.map(file => readFileText(file)));
      
      for (const res of readResults) {
        processedSongs.push(parseSongContent(res.name, res.text));
      }
      
      setProgress(p => ({ ...p, current: Math.min(i + 50, totalCount) }));
    }

    try {
      setProgress({ current: 0, total: processedSongs.length, stage: 'Writing directly into local Database store...' });
      
      for (let i = 0; i < processedSongs.length; i += batchSize) {
        const batch = processedSongs.slice(i, i + batchSize);
        await saveSongsBatch(batch);
        
        setProgress(p => ({ ...p, current: Math.min(i + batchSize, processedSongs.length) }));
      }

      const elapsed = performance.now() - startTime;
      setImportStats({ imported: processedSongs.length, timeMs: Math.round(elapsed) });
      setLoading(false);
      onSuccess(processedSongs.map(s => s.id));
    } catch (err: any) {
      console.error(err);
      alert('Failed to sync uploaded songs to cloud database: ' + (err.message || err));
      setLoading(false);
    }
  };

  const handleBulkTextAreaImport = async () => {
    if (!bulkTextArea.trim()) return;

    setLoading(true);
    setImportStats(null);
    const startTime = performance.now();
    
    const chunks = bulkTextArea.split(/^-{3,}\s*$/m).map(c => c.trim()).filter(Boolean);
    const importedSongs: Song[] = [];

    setProgress({ current: 0, total: chunks.length, stage: 'Parsing bulk script notation...' });

    for (let i = 0; i < chunks.length; i++) {
      const item = chunks[i];
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
      onSuccess(importedSongs.map(s => s.id));
    } catch (err: any) {
      console.error(err);
      alert('Failed to sync pasted songs to cloud database: ' + (err.message || err));
      setLoading(false);
    }
  };

  // URL lyrics scraper handler
  const handleScrapeUrl = async () => {
    if (!scrapeUrl.trim()) return;
    setScrapeLoading(true);
    setScrapePreview(null);
    setImportStats(null);

    try {
      const response = await fetch('/api/lyrics/scrape-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to fetch song from URL.');
      }

      const data = await response.json();
      
      // Auto-format two-line chords to bracket chords and then strip all chords on the fly!
      const formattedLyrics = stripChords(parseTwoLineChords(data.lyrics || ''));

      setScrapePreview({
        title: data.title || 'Scraped Song',
        author: 'Unknown Artist',
        category: 'Worship',
        bpm: 75,
        lyrics: formattedLyrics
      });
    } catch (err: any) {
      console.error(err);
      alert('Error fetching lyrics from URL: ' + err.message);
    } finally {
      setScrapeLoading(false);
    }
  };

  const handleSaveScrapedSong = async () => {
    if (!scrapePreview) return;
    setLoading(true);
    const startTime = performance.now();

    const newSong: Song = {
      id: `song-${Date.now()}`,
      title: scrapePreview.title,
      author: scrapePreview.author,
      key: 'G',
      bpm: scrapePreview.bpm,
      category: scrapePreview.category,
      lyrics: scrapePreview.lyrics,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      await saveSongsBatch([newSong]);
      const elapsed = performance.now() - startTime;
      setImportStats({ imported: 1, timeMs: Math.round(elapsed) });
      setScrapePreview(null);
      setScrapeUrl('');
      setLoading(false);
      onSuccess([newSong.id]);
    } catch (err: any) {
      console.error(err);
      alert('Failed saving song: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Import Tab Switcher Switch */}
      <div className="flex bg-[#09090b] p-1 rounded-2xl max-w-md select-none">
        <button
          type="button"
          onClick={() => { setActiveImportTab('file'); setImportStats(null); }}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeImportTab === 'file'
              ? 'bg-amber-600 text-white font-bold shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            <span>File Import</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => { setActiveImportTab('paste'); setImportStats(null); }}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeImportTab === 'paste'
              ? 'bg-amber-600 text-white font-bold shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Clipboard className="h-3.5 w-3.5" />
            <span>Script Paste</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => { setActiveImportTab('url'); setImportStats(null); }}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeImportTab === 'url'
              ? 'bg-amber-600 text-white font-bold shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            <span>Paste Web URL</span>
          </div>
        </button>
      </div>

      {/* Tabs panels representation */}
      {activeImportTab === 'file' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-8 flex flex-col space-y-4">
            <label className="text-sm font-semibold text-slate-350">
              Bulk Multi-TXT Upload
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 min-h-[220px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? 'border-amber-500 bg-amber-500/5'
                  : 'border-white/[0.08] bg-[#09090b]/40 hover:bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="h-8 w-8 text-amber-500 mb-3" />
              <h4 className="font-semibold text-white text-sm">
                Drag & Drop Lyrics TXT Files
              </h4>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                Drop multiple files at once. The app will extract song configurations automatically.
              </p>
              <span className="mt-4 px-3 py-1.5 bg-amber-500/10 text-amber-400 text-xs font-bold rounded-xl">
                Select Files
              </span>
            </div>
            {loading && (
              <div className="bg-[#09090b] rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-semibold text-white animate-pulse">{progress.stage}</span>
                  <span className="text-amber-500">{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all duration-100"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="md:col-span-4 bg-[#09090b]/30 rounded-2xl p-5 flex flex-col justify-center text-center">
            <FileText className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <h5 className="font-bold text-xs text-slate-300 uppercase tracking-wider">File Requirements</h5>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Files must be in plain <code className="font-mono text-slate-400 font-bold bg-white/5 px-1 py-0.5 rounded">.txt</code> format. You can optionally include metadata keys like <code className="text-amber-500/90 font-mono">Title:</code> and <code className="text-amber-500/90 font-mono">Author:</code> on the first few lines of the text.
            </p>
          </div>
        </div>
      )}

      {activeImportTab === 'paste' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-8 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-350">
                Bulk Text Script Paste
              </label>
              <button
                type="button"
                onClick={copyTemplate}
                className="text-[10px] text-amber-500/70 hover:text-amber-400 font-semibold flex items-center gap-1 cursor-pointer bg-amber-500/5 px-2 py-1 rounded border border-amber-500/10"
              >
                {hasCopiedTemplate ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                Copy Template Script
              </button>
            </div>
            <textarea
              value={bulkTextArea}
              onChange={(e) => setBulkTextArea(e.target.value)}
              placeholder={`Paste multiple songs. Divide them with "---" (three dashes) on an empty line. e.g.

Title: Cornerstone
Author: Hillsong
Lyrics:
My hope is built on nothing less`}
              className="w-full min-h-[220px] rounded-2xl border border-white/10 p-3.5 font-mono text-xs bg-[#09090b] text-slate-300 outline-none focus:border-amber-500"
            />
            <button
              onClick={handleBulkTextAreaImport}
              disabled={!bulkTextArea.trim() || loading}
              className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                bulkTextArea.trim() && !loading
                  ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-md'
                  : 'bg-white/5 text-slate-600 cursor-not-allowed'
              }`}
            >
              <FileText className="h-4 w-4" /> Run Bulk Parser Script
            </button>
          </div>
          <div className="md:col-span-4 bg-[#09090b]/30 border border-white/5 rounded-2xl p-5 flex flex-col justify-center text-center">
            <Flame className="h-8 w-8 text-amber-500/60 mx-auto mb-2" />
            <h5 className="font-bold text-xs text-slate-300 uppercase tracking-wider">Fast Multi-Script</h5>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Paste your entire lyrics document here. Split different songs with a triple dash separator <code className="font-mono bg-white/5 px-1 py-0.5 rounded text-amber-500 font-bold">---</code> line to import dozens of sheets instantly!
            </p>
          </div>
        </div>
      )}

      {activeImportTab === 'url' && (
        <div className="space-y-4">
          <div className="flex flex-col space-y-2.5 text-left">
            <label className="text-sm font-semibold text-slate-350 flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-amber-500" /> Fetch Songs & Lyrics from Web URL
            </label>
            <p className="text-[11px] text-slate-500 max-w-2xl mt-0.5 leading-relaxed">
              Paste the URL of any song lyrics page (e.g. from AZLyrics, Genius, or similar). We will fetch, clean, and format the lyrics automatically!
            </p>
            <div className="flex gap-2 items-center mt-2">
              <div className="relative flex-1">
                <Link className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="url"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="Paste lyrics page URL (e.g. https://www.azlyrics.com/lyrics/...)"
                  className="w-full pl-10 pr-4 py-3 text-xs rounded-xl border border-white/[0.04] bg-[#09090b] text-white placeholder-slate-600 outline-none focus:border-amber-500 font-sans"
                />
              </div>
              <button
                type="button"
                onClick={handleScrapeUrl}
                disabled={!scrapeUrl.trim() || scrapeLoading}
                className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs px-5 py-3 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-30 disabled:cursor-not-allowed shrink-0 h-11"
              >
                {scrapeLoading ? 'Fetching...' : 'Fetch Lyrics'}
                <ArrowRight className="h-3.5 w-3.5 stroke-[3]" />
              </button>
            </div>
          </div>

          {/* URL Scraped Preview Editor Form */}
          {scrapePreview && (
            <div className="bg-[#050506] rounded-2xl p-5 space-y-4 shadow-[0_0_20px_rgba(245,158,11,0.04)] animate-in slide-in-from-bottom-2 duration-300">
              <h4 className="font-bold text-xs text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Preview Scraped Lyric Sheet
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">Song Title</label>
                  <input
                    type="text"
                    value={scrapePreview.title}
                    onChange={(e) => setScrapePreview(p => p ? { ...p, title: e.target.value } : null)}
                    className="w-full text-xs p-2.5 rounded-xl bg-[#09090B] text-white outline-none focus:border-amber-500 font-sans font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">Author / Artist</label>
                  <input
                    type="text"
                    value={scrapePreview.author}
                    onChange={(e) => setScrapePreview(p => p ? { ...p, author: e.target.value } : null)}
                    className="w-full text-xs p-2.5 rounded-xl bg-[#09090B] text-white outline-none focus:border-amber-500 font-sans"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">Category</label>
                  <select
                    value={scrapePreview.category}
                    onChange={(e) => setScrapePreview(p => p ? { ...p, category: e.target.value } : null)}
                    className="w-full text-xs p-2.5 rounded-xl bg-[#09090B] text-white outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="Worship">Contemporary Worship</option>
                    <option value="Classic">Classic Lyric</option>
                    <option value="Praise & Thanksgiving">Praise & Thanksgiving</option>
                    <option value="Christmas">Christmas Carol</option>
                    <option value="Gospel">Gospel Music</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">Tempo BPM</label>
                  <input
                    type="number"
                    value={scrapePreview.bpm}
                    onChange={(e) => setScrapePreview(p => p ? { ...p, bpm: parseInt(e.target.value) || 72 } : null)}
                    className="w-full text-xs p-2.5 rounded-xl bg-[#09090B] text-white outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">
                  <span>Lyrics Sheet Preview</span>
                </label>
                <textarea
                  value={scrapePreview.lyrics}
                  onChange={(e) => setScrapePreview(p => p ? { ...p, lyrics: e.target.value } : null)}
                  rows={8}
                  className="w-full text-xs p-3.5 rounded-xl bg-[#09090B] text-slate-200 font-mono outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-2 justify-end border-t border-white/[0.03] pt-3.5">
                <button
                  type="button"
                  onClick={() => setScrapePreview(null)}
                  className="px-4 py-2 text-xs font-semibold bg-white/5 text-slate-400 hover:bg-white/10 rounded-xl cursor-pointer"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSaveScrapedSong}
                  className="px-5 py-2 text-xs text-black font-extrabold bg-amber-500 hover:bg-amber-400 rounded-xl flex items-center gap-1 shadow-md cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" /> Save to Library
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success Stat Reporting */}
      {importStats && (
        <div className="bg-[#0b1710] rounded-2xl p-4 flex items-center gap-3.5 text-emerald-400 select-none animate-in fade-in duration-200">
          <CheckCircle className="h-8 w-8 text-emerald-500 flex-shrink-0" />
          <div className="text-left">
            <h5 className="font-bold text-sm text-white">Import Successful!</h5>
            <p className="text-xs text-slate-400 mt-0.5">
              Successfully parsed and saved <strong className="text-amber-500 font-mono">{importStats.imported}</strong> song(s) into your local IndexedDB library in <strong className="text-amber-500 font-mono">{importStats.timeMs}ms</strong>.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
