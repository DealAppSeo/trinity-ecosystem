import { X, Copy, Twitter, Linkedin, Check } from 'lucide-react';
import { useState } from 'react';
import QRCode from 'react-qr-code';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  url?: string;
}

export function ShareModal({ isOpen, onClose, title = 'Trinity Dashboard', url }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  
  const shareUrl = url || window.location.href;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTwitterShare = () => {
    const text = `Check out my ${title} on Trinity AI Swarm!`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  const handleLinkedInShare = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass rounded-2xl p-6 w-full max-w-md border border-white/20 glow-violet">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="space-y-6">
          <div>
            <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Share {title}
            </h3>
            <p className="text-sm text-gray-400">
              Share your autonomous AI swarm with the world
            </p>
          </div>

          {/* QR Code */}
          <div className="flex justify-center p-6 glass-light rounded-xl">
            <div className="bg-white p-4 rounded-lg">
              <QRCode value={shareUrl} size={180} />
            </div>
          </div>

          {/* URL Copy */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Share Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-4 py-2 rounded-lg glass-light border border-white/10 text-sm text-gray-300 focus:outline-none focus:border-violet-500"
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/50 transition-colors flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-green-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span className="text-sm">Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Social Share Buttons */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Share on Social</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleTwitterShare}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 border border-[#1DA1F2]/50 transition-colors"
              >
                <Twitter className="w-5 h-5 text-[#1DA1F2]" />
                <span className="text-sm font-medium">Twitter</span>
              </button>
              <button
                onClick={handleLinkedInShare}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#0A66C2]/20 hover:bg-[#0A66C2]/30 border border-[#0A66C2]/50 transition-colors"
              >
                <Linkedin className="w-5 h-5 text-[#0A66C2]" />
                <span className="text-sm font-medium">LinkedIn</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
