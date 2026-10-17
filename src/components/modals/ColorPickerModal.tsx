import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Palette, X, Copy, Check, Sparkles, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  HSV,
  RGB,
  HSL,
  hsvToRgb,
  rgbToHex,
  hexToRgb,
  rgbToHsv,
  rgbToHsl,
  hexToHsv,
  hsvToHex,
  hslToHsv,
  applyAccentThemeColor
} from '../../utils/colorUtils';

interface ColorPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentColorHex: string;
  onColorChange: (hex: string) => void;
  title?: string;
  defaultColor?: string;
  resetLabel?: string;
  disableGlobalThemeAccent?: boolean;
}

const PRESET_PALETTES = [
  { name: 'Pure Black', hex: '#000000' },
  { name: 'Pure White', hex: '#FFFFFF' },
  { name: 'Gold Amber', hex: '#F59E0B' },
  { name: 'Worship Emerald', hex: '#10B981' },
  { name: 'Electric Cyan', hex: '#06B6D4' },
  { name: 'Royal Purple', hex: '#A855F7' },
  { name: 'Deep Crimson', hex: '#F43F5E' },
  { name: 'Sunset Orange', hex: '#F97316' },
  { name: 'Cobalt Blue', hex: '#3B82F6' },
  { name: 'Ruby Rose', hex: '#EC4899' },
  { name: 'Warm Gold', hex: '#EAB308' },
  { name: 'Teal Grace', hex: '#14B8A6' },
];

export default function ColorPickerModal({
  isOpen,
  onClose,
  currentColorHex,
  onColorChange,
  title = 'Colour picker',
  defaultColor = '#F59E0B',
  resetLabel = 'Reset to Gold Amber',
  disableGlobalThemeAccent = false,
}: ColorPickerModalProps) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(currentColorHex || defaultColor));
  const [activeFormat, setActiveFormat] = useState<'hex' | 'rgb' | 'hsl'>('hex');
  const [hexInput, setHexInput] = useState<string>(currentColorHex || defaultColor);
  const [copied, setCopied] = useState(false);

  const satValRef = useRef<HTMLDivElement>(null);
  const hueSliderRef = useRef<HTMLDivElement>(null);
  const isDraggingSatVal = useRef(false);
  const isDraggingHue = useRef(false);

  // Sync state if currentColorHex prop changes from outside
  useEffect(() => {
    if (currentColorHex) {
      setHsv(hexToHsv(currentColorHex));
      setHexInput(currentColorHex.toUpperCase());
    }
  }, [currentColorHex]);

  const currentRgb: RGB = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const currentHex: string = rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b);
  const currentHsl: HSL = rgbToHsl(currentRgb.r, currentRgb.g, currentRgb.b);

  // Update color in real-time
  const updateColorFromHsv = useCallback((newHsv: HSV) => {
    setHsv(newHsv);
    const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
    setHexInput(hex);
    onColorChange(hex);
    if (!disableGlobalThemeAccent) {
      applyAccentThemeColor(hex);
    }
  }, [onColorChange, disableGlobalThemeAccent]);

  // Handle 2D Saturation / Value Canvas Mouse & Touch
  const handleSatValMove = useCallback((clientX: number, clientY: number) => {
    if (!satValRef.current) return;
    const rect = satValRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

    const s = Math.round((x / rect.width) * 100);
    const v = Math.round((1 - y / rect.height) * 100);

    updateColorFromHsv({ ...hsv, s, v });
  }, [hsv, updateColorFromHsv]);

  // Handle Hue Slider Mouse & Touch
  const handleHueMove = useCallback((clientX: number) => {
    if (!hueSliderRef.current) return;
    const rect = hueSliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const h = Math.round((x / rect.width) * 360) % 360;

    updateColorFromHsv({ ...hsv, h });
  }, [hsv, updateColorFromHsv]);

  // Global mouse/touch move and up handlers for smooth dragging outside element bounds
  useEffect(() => {
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if (isDraggingSatVal.current) {
        e.preventDefault();
        handleSatValMove(clientX, clientY);
      } else if (isDraggingHue.current) {
        e.preventDefault();
        handleHueMove(clientX);
      }
    };

    const handlePointerUp = () => {
      isDraggingSatVal.current = false;
      isDraggingHue.current = false;
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: false });
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [handleSatValMove, handleHueMove]);

  // Copy Color string to clipboard
  const handleCopy = () => {
    let textToCopy = currentHex;
    if (activeFormat === 'rgb') textToCopy = `rgb(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b})`;
    if (activeFormat === 'hsl') textToCopy = `hsl(${currentHsl.h}, ${currentHsl.s}%, ${currentHsl.l}%)`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  // Handle direct Hex input
  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexInput(val);
    const parsedRgb = hexToRgb(val);
    if (parsedRgb) {
      const newHsv = rgbToHsv(parsedRgb.r, parsedRgb.g, parsedRgb.b);
      setHsv(newHsv);
      const cleanHex = val.startsWith('#') ? val.toUpperCase() : `#${val.toUpperCase()}`;
      onColorChange(cleanHex);
      if (!disableGlobalThemeAccent) {
        applyAccentThemeColor(val.startsWith('#') ? val : `#${val}`);
      }
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
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4 select-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="bg-[#12131A] w-full max-w-lg rounded-2xl p-4 sm:p-6 space-y-4 shadow-2xl border border-[#1E202B] text-zinc-300 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1E202B] pb-3">
              <div className="flex items-center gap-2.5">
                <div 
                  className="w-8 h-8 rounded-xl flex items-center justify-center border shadow-md transition-colors"
                  style={{
                    backgroundColor: currentHex,
                    borderColor: 'rgba(255,255,255,0.2)'
                  }}
                >
                  <Palette className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white tracking-tight leading-none">{title}</h3>
                  <p className="text-[11px] font-mono text-zinc-400 mt-1 uppercase tracking-wider">{currentHex}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  className="p-2 hover:bg-[#1A1C26] rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer border border-[#1E202B]"
                  title="Copy color code"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-[#1A1C26] rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer border border-[#1E202B]"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Main Saturation / Value 2D Box + Preview (Google Style Layout) */}
            <div className="relative w-full flex flex-col sm:flex-row h-52 sm:h-60 rounded-xl overflow-hidden border border-[#1E202B] shadow-inner">
              {/* Left Color Preview Swatch */}
              <div
                className="h-16 sm:h-full sm:w-28 flex items-center justify-center shrink-0 border-b sm:border-b-0 sm:border-r border-black/30 relative"
                style={{ backgroundColor: currentHex }}
              >
                <span className="text-[11px] font-mono font-black text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] uppercase tracking-wider">
                  {currentHex}
                </span>
              </div>

              {/* 2D Saturation / Value Gradient Canvas */}
              <div
                ref={satValRef}
                onMouseDown={(e) => {
                  isDraggingSatVal.current = true;
                  handleSatValMove(e.clientX, e.clientY);
                }}
                onTouchStart={(e) => {
                  isDraggingSatVal.current = true;
                  handleSatValMove(e.touches[0].clientX, e.touches[0].clientY);
                }}
                className="relative flex-1 w-full h-full cursor-crosshair touch-none select-none"
                style={{
                  backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                }}
              >
                {/* Horizontal white gradient */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(to right, #ffffff, transparent)'
                  }}
                />
                {/* Vertical black gradient */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(to bottom, transparent, #000000)'
                  }}
                />

                {/* Draggable Circle Picker Indicator */}
                <div
                  className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_6px_rgba(0,0,0,0.9),inset_0_0_2px_rgba(0,0,0,0.6)] pointer-events-none transition-transform"
                  style={{
                    left: `${hsv.s}%`,
                    top: `${100 - hsv.v}%`,
                    backgroundColor: currentHex
                  }}
                />
              </div>
            </div>

            {/* Hue Rainbow Slider Bar */}
            <div className="space-y-1 pt-1">
              <div
                ref={hueSliderRef}
                onMouseDown={(e) => {
                  isDraggingHue.current = true;
                  handleHueMove(e.clientX);
                }}
                onTouchStart={(e) => {
                  isDraggingHue.current = true;
                  handleHueMove(e.touches[0].clientX);
                }}
                className="relative h-6 w-full rounded-full cursor-pointer touch-none shadow-inner border border-white/10"
                style={{
                  background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
                }}
              >
                {/* Circular Draggable Hue Thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.8)] pointer-events-none"
                  style={{
                    left: `${(hsv.h / 360) * 100}%`,
                    backgroundColor: `hsl(${hsv.h}, 100%, 50%)`
                  }}
                />
              </div>
            </div>

            {/* Format Tabs & Value Inputs */}
            <div className="bg-[#090A0F] p-3 rounded-xl border border-[#1E202B] space-y-2.5">
              {/* Format selection */}
              <div className="flex items-center justify-between border-b border-[#1E202B] pb-2">
                <div className="flex items-center gap-1">
                  {(['hex', 'rgb', 'hsl'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setActiveFormat(fmt)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                        activeFormat === fmt
                          ? 'bg-[#1A1C26] text-white border border-white/20'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleCopy}
                  className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* Dynamic Inputs based on activeFormat */}
              {activeFormat === 'hex' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-zinc-500 font-bold">HEX</span>
                  <input
                    type="text"
                    value={hexInput}
                    onChange={handleHexInputChange}
                    placeholder="#RRGGBB"
                    className="flex-1 px-3 py-1.5 bg-[#12131A] border border-[#1E202B] rounded-lg text-xs font-mono text-white outline-none focus:border-white/40"
                  />
                </div>
              )}

              {activeFormat === 'rgb' && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-zinc-500 font-bold">R</span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={currentRgb.r}
                      onChange={(e) => {
                        const r = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
                        const newHsv = rgbToHsv(r, currentRgb.g, currentRgb.b);
                        updateColorFromHsv(newHsv);
                      }}
                      className="w-full px-2 py-1.5 bg-[#12131A] border border-[#1E202B] rounded-lg text-xs font-mono text-white outline-none text-center"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-zinc-500 font-bold">G</span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={currentRgb.g}
                      onChange={(e) => {
                        const g = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
                        const newHsv = rgbToHsv(currentRgb.r, g, currentRgb.b);
                        updateColorFromHsv(newHsv);
                      }}
                      className="w-full px-2 py-1.5 bg-[#12131A] border border-[#1E202B] rounded-lg text-xs font-mono text-white outline-none text-center"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-zinc-500 font-bold">B</span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={currentRgb.b}
                      onChange={(e) => {
                        const b = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
                        const newHsv = rgbToHsv(currentRgb.r, currentRgb.g, b);
                        updateColorFromHsv(newHsv);
                      }}
                      className="w-full px-2 py-1.5 bg-[#12131A] border border-[#1E202B] rounded-lg text-xs font-mono text-white outline-none text-center"
                    />
                  </div>
                </div>
              )}

              {activeFormat === 'hsl' && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-zinc-500 font-bold">H</span>
                    <input
                      type="number"
                      min={0}
                      max={360}
                      value={currentHsl.h}
                      onChange={(e) => {
                        const h = Math.max(0, Math.min(360, parseInt(e.target.value, 10) || 0));
                        const newHsv = hslToHsv(h, currentHsl.s, currentHsl.l);
                        updateColorFromHsv(newHsv);
                      }}
                      className="w-full px-2 py-1.5 bg-[#12131A] border border-[#1E202B] rounded-lg text-xs font-mono text-white outline-none text-center"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-zinc-500 font-bold">S%</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={currentHsl.s}
                      onChange={(e) => {
                        const s = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                        const newHsv = hslToHsv(currentHsl.h, s, currentHsl.l);
                        updateColorFromHsv(newHsv);
                      }}
                      className="w-full px-2 py-1.5 bg-[#12131A] border border-[#1E202B] rounded-lg text-xs font-mono text-white outline-none text-center"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-zinc-500 font-bold">L%</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={currentHsl.l}
                      onChange={(e) => {
                        const l = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                        const newHsv = hslToHsv(currentHsl.h, currentHsl.s, l);
                        updateColorFromHsv(newHsv);
                      }}
                      className="w-full px-2 py-1.5 bg-[#12131A] border border-[#1E202B] rounded-lg text-xs font-mono text-white outline-none text-center"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Presets Chips */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" /> Presets & Quick Swatches
              </span>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_PALETTES.map((p) => {
                  const isSelected = currentHex.toUpperCase() === p.hex.toUpperCase();
                  return (
                    <button
                      key={p.hex}
                      onClick={() => {
                        const newHsv = hexToHsv(p.hex);
                        updateColorFromHsv(newHsv);
                      }}
                      className={`h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer border relative group ${
                        isSelected ? 'border-white scale-105 shadow-md' : 'border-white/10 hover:border-white/40'
                      }`}
                      style={{ backgroundColor: p.hex }}
                      title={p.name}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[#1E202B]">
              <button
                onClick={() => {
                  const defaultHsv = hexToHsv(defaultColor);
                  updateColorFromHsv(defaultHsv);
                }}
                className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{resetLabel}</span>
              </button>

              <button
                onClick={onClose}
                className="px-5 py-2 bg-white text-black font-bold text-xs rounded-xl shadow-lg hover:bg-zinc-200 transition-all cursor-pointer active-touch"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
