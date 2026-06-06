'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface ShareCardProps {
  content: string;
  scenario?: string;
  onClose: () => void;
}

interface CardStyle {
  bgColor: string;
  accentColor: string;
  textColor: string;
  secondaryText: string;
}

const CARD_STYLES: CardStyle[] = [
  { bgColor: '#1a1a2e', accentColor: '#e94560', textColor: '#ffffff', secondaryText: '#8e8e93' },
  { bgColor: '#f0f4f8', accentColor: '#007AFF', textColor: '#1a1a2e', secondaryText: '#64748b' },
  { bgColor: '#fefce8', accentColor: '#d97706', textColor: '#292524', secondaryText: '#a8a29e' },
];

export function ShareCard({ content, scenario, onClose }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedStyle, setSelectedStyle] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [copying, setCopying] = useState(false);

  // Clean content: remove markdown headers, trim
  const cleanContent = content
    .replace(/## [^\\n]+\\n/g, '')  // remove section headers
    .replace(/\\n{3,}/g, '\n\n')     // collapse multiple newlines
    .trim();

  // Parse sections: mild version vs sharp version
  const parseSections = (text: string) => {
    let mild = '';
    let sharp = '';

    const mildMatch = text.match(/温和版[：:][\s\S]*?(?=犀利版|刺版本|$)/);
    const sharpMatch = text.match(/犀利版[：:][\s\S]*?(?=法律|行动|心态|温和版|$)/i);

    if (mildMatch) mild = mildMatch[0].replace(/温和版[：:]\s*/, '').trim();
    if (sharpMatch) sharp = sharpMatch[0].replace(/犀利版[：:]\s*/, '').trim();

    return { mild, sharp };
  };

  const { mild, sharp } = parseSections(cleanContent);
  const hasContent = mild || sharp;
  const fallbackContent = !hasContent ? cleanContent.slice(0, 300) : '';

  const drawCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const style = CARD_STYLES[selectedStyle];
    const width = 540;
    const height = 720;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = style.bgColor;
    ctx.fillRect(0, 0, width, height);

    // Accent bar at top
    ctx.fillStyle = style.accentColor;
    ctx.fillRect(0, 0, width, 8);

    // Title area
    ctx.fillStyle = style.accentColor;
    ctx.font = 'bold 24px sans-serif';
    const title = scenario ? scenario.replace(/^场景[：:]\s*/, '').trim() : '职场回复精选';
    ctx.fillText(title, 32, 60);

    ctx.fillStyle = style.secondaryText;
    ctx.font = '14px sans-serif';
    ctx.fillText('来自 StressAway', 32, 85);

    // Scenario tag if exists
    let yPos = 120;
    if (scenario) {
      ctx.fillStyle = style.accentColor + '33';
      ctx.fillRect(32, yPos - 20, scenario.length * 14 + 24, 32);
      ctx.fillStyle = style.accentColor;
      ctx.font = '13px sans-serif';
      ctx.fillText(`场景：${scenario}`, 44, yPos + 2);
      yPos += 50;
    }

    // Divider
    ctx.strokeStyle = style.secondaryText + '44';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(32, yPos);
    ctx.lineTo(width - 32, yPos);
    ctx.stroke();
    yPos += 24;

    // Content
    ctx.fillStyle = style.textColor;
    ctx.font = '16px sans-serif';

    const maxWidth = width - 64;
    const lineHeight = 26;
    const wrapText = (text: string, x: number, startY: number, maxW: number) => {
      let y = startY;
      const paragraphs = text.split('\n\n');

      for (const para of paragraphs) {
        if (para.startsWith('温和') || para.startsWith('犀利') || para.startsWith('刺版')) continue;
        if (para.length < 5) continue;

        const lines = para.split('\n');
        for (const line of lines) {
          if (!line.trim()) { y += 10; continue; }
          const words = line.split('');
          let currentLine = '';
          for (const char of words) {
            const testLine = currentLine + char;
            if (ctx.measureText(testLine).width > maxW && currentLine) {
              ctx.fillText(currentLine, x, y);
              currentLine = char;
              y += lineHeight;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) {
            ctx.fillText(currentLine, x, y);
            y += lineHeight;
          }
        }
        y += 8;
      }
      return y;
    };

    if (mild) {
      ctx.fillStyle = style.secondaryText;
      ctx.font = '12px sans-serif';
      ctx.fillText('温和版', 32, yPos);
      yPos += 18;

      ctx.fillStyle = style.textColor;
      ctx.font = '15px sans-serif';
      const wrappedMild = mild.length > 200 ? mild.slice(0, 200) + '...' : mild;
      const mildLines = wrappedMild.split('\n');
      for (const line of mildLines) {
        if (!line.trim()) { yPos += 8; continue; }
        ctx.fillText(line.trim().slice(0, 36), 32, yPos);
        yPos += 22;
      }
      yPos += 12;
    }

    if (sharp && yPos < 580) {
      ctx.fillStyle = style.secondaryText;
      ctx.font = '12px sans-serif';
      ctx.fillText('犀利版', 32, yPos);
      yPos += 18;

      ctx.fillStyle = style.textColor;
      ctx.font = '15px sans-serif';
      const wrappedSharp = sharp.length > 200 ? sharp.slice(0, 200) + '...' : sharp;
      const sharpLines = wrappedSharp.split('\n');
      for (const line of sharpLines) {
        if (!line.trim()) { yPos += 8; continue; }
        ctx.fillText(line.trim().slice(0, 36), 32, yPos);
        yPos += 22;
      }
    }

    // Fallback: if no mild/sharp parsed, show raw content
    if (!mild && !sharp && fallbackContent) {
      ctx.fillStyle = style.textColor;
      ctx.font = '15px sans-serif';
      const lines = fallbackContent.split('\n');
      for (const line of lines) {
        if (!line.trim()) { yPos += 8; continue; }
        ctx.fillText(line.trim().slice(0, 36), 32, yPos);
        yPos += 22;
        if (yPos > 600) break;
      }
    }

    // Footer
    const footerY = height - 40;
    ctx.fillStyle = style.secondaryText + '88';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('StressAway · 职场压力倾诉助手', width / 2, footerY);
    ctx.textAlign = 'left';
  }, [selectedStyle, cleanContent, mild, sharp, scenario, fallbackContent]);

  useEffect(() => {
    drawCard();
  }, [drawCard]);

  useEffect(() => {
    if (generated) {
      const canvas = canvasRef.current;
      if (canvas) {
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'fanpua-share.png';
        link.href = url;
        link.click();
      }
    }
  }, [generated]);

  const handleGenerate = () => {
    drawCard();
    setGenerated(true);
  };

  const handleCopyText = async () => {
    setCopying(true);
    // Format content for copying
    let text = '【职场回复精选】\n\n';
    if (mild) text += `温和版：\n"${mild.slice(0, 300)}"\n\n`;
    if (sharp) text += `犀利版：\n"${sharp.slice(0, 300)}"\n\n`;
    if (!mild && !sharp && fallbackContent) text += `${fallbackContent}\n\n`;
    text += '—— StressAway';

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
    setTimeout(() => setCopying(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-[--card-bg] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[--border]">
          <h2 className="text-lg font-semibold text-[--foreground]">分享回复</h2>
          <button onClick={onClose} className="p-1 text-[--foreground-tertiary] hover:text-[--foreground]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Style selector */}
        <div className="px-5 py-3 border-b border-[--border]">
          <p className="text-xs text-[--foreground-tertiary] mb-2">选择风格</p>
          <div className="flex gap-2">
            {CARD_STYLES.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelectedStyle(i)}
                className={`w-8 h-8 rounded-lg border-2 transition-all ${
                  selectedStyle === i ? 'border-[#007AFF] scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: s.bgColor }}
              />
            ))}
          </div>
        </div>

        {/* Preview canvas */}
        <div className="p-4 flex justify-center">
          <canvas
            ref={canvasRef}
            className="rounded-xl shadow-lg"
            style={{ width: 270, height: 360 }}
          />
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={handleCopyText}
            className="flex-1 py-3 bg-gray-100 dark:bg-[--background-secondary] text-[--foreground] rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-[--background-tertiary] transition-colors"
          >
            {copying ? '已复制' : '复制文字'}
          </button>
          <button
            onClick={handleGenerate}
            className="flex-1 py-3 bg-[#007AFF] text-white rounded-xl text-sm font-medium hover:bg-[#007AFF]/90 transition-all active:scale-[0.98]"
          >
            保存图片
          </button>
        </div>
      </div>
    </div>
  );
}