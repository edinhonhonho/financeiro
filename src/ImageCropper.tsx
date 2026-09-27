import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const BOX = 280;
const OUTPUT = 400;

interface ImageCropperProps {
  /** Imagem (data URL) a enquadrar. Quando nula o diálogo fica fechado. */
  src: string | null;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

/** Enquadra uma imagem num quadrado: arraste para posicionar, slider para o zoom. */
export function ImageCropper({ src, onCancel, onConfirm }: ImageCropperProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    if (!src) { setImg(null); return; }
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = src;
  }, [src]);

  const baseScale = img ? BOX / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const dispW = img ? img.naturalWidth * scale : BOX;
  const dispH = img ? img.naturalHeight * scale : BOX;

  const clamp = (o: { x: number; y: number }, w = dispW, h = dispH) => {
    const maxX = Math.max(0, (w - BOX) / 2);
    const maxY = Math.max(0, (h - BOX) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
  };

  const handleZoom = (z: number) => {
    setZoom(z);
    if (img) {
      const s = baseScale * z;
      setOffset(o => clamp(o, img.naturalWidth * s, img.naturalHeight * s));
    }
  };

  const handleConfirm = () => {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const left = BOX / 2 + offset.x - dispW / 2;
    const top = BOX / 2 + offset.y - dispH / 2;
    ctx.drawImage(img, -left / scale, -top / scale, BOX / scale, BOX / scale, 0, 0, OUTPUT, OUTPUT);
    onConfirm(canvas.toDataURL('image/jpeg', 0.85));
  };

  return (
    <Dialog open={!!src} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm rounded-[2rem] border-none shadow-deep p-6 bg-[#F6F4FD] dark:bg-[#0B0A2E] z-[90]">
        <DialogHeader>
          <DialogTitle className="font-heading font-normal tracking-tighter text-xl">Enquadrar foto</DialogTitle>
          <DialogDescription className="text-xs">Arraste para posicionar e use o controle para ampliar.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-5">
          <div
            className="relative overflow-hidden rounded-3xl bg-slate-200 dark:bg-[#16133F] touch-none cursor-grab active:cursor-grabbing select-none"
            style={{ width: BOX, height: BOX }}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              setOffset(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }));
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          >
            {img && (
              <img
                src={img.src}
                alt=""
                draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{
                  width: dispW,
                  height: dispH,
                  left: BOX / 2 + offset.x - dispW / 2,
                  top: BOX / 2 + offset.y - dispH / 2
                }}
              />
            )}
            <div className="absolute inset-0 rounded-3xl ring-2 ring-white/70 pointer-events-none" />
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
            aria-label="Zoom"
          />
          <div className="flex gap-3 w-full">
            <button type="button" onClick={onCancel} className="flex-1 h-12 rounded-full bg-secondary text-secondary-foreground font-medium text-sm">
              Cancelar
            </button>
            <button type="button" onClick={handleConfirm} disabled={!img} className="flex-1 h-12 rounded-full bg-primary text-white font-medium text-sm disabled:opacity-40">
              Usar foto
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
