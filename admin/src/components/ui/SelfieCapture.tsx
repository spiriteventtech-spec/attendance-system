import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Spinner } from './index';

interface SelfieCaptureProps {
  onCapture: (base64Image: string) => void;
  onCancel: () => void;
}

export const SelfieCapture: React.FC<SelfieCaptureProps> = ({ onCapture, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedImg, setCapturedImg] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);

  const startCamera = useCallback(async () => {
    try {
      setIsStarting(true);
      setError(null);
      
      // Delay slightly to ensure UI is ready (helps on some mobile browsers)
      await new Promise(resolve => setTimeout(resolve, 300));

      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Explicitly call play to handle browsers with stricter auto-play policies
        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn('Auto-play failed, waiting for user interaction or metadata', e);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Could not access camera. Please check permissions.');
      setIsStarting(false);
    }
  }, []);

  const onVideoCanPlay = () => {
    setIsStarting(false);
  };

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        stream.removeTrack(track);
      });
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Use video dimensions for capture
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const context = canvas.getContext('2d');
      if (context) {
        // Clear mirrored effect for the final capture if desired, 
        // but AWS Rekognition doesn't care about flip.
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImg(base64);
        stopCamera();
      }
    }
  };

  const handleRetake = () => {
    setCapturedImg(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedImg) {
      onCapture(capturedImg);
    }
  };

  return (
    <div className="flex flex-col items-center bg-black/95 text-white p-6 rounded-[40px] w-full max-w-md mx-auto overflow-hidden relative shadow-premium border border-white/10">
      <div className="flex justify-between items-center w-full mb-6 px-2">
        <h3 className="font-bold text-white tracking-tight flex items-center gap-2.5">
          <div className="p-1.5 bg-[#007AFF] rounded-lg shadow-lg shadow-[#007AFF]/20">
            <Camera size={14} className="text-white" />
          </div>
          Identity Verification
        </h3>
        <button onClick={onCancel} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full transition-all active:scale-90">
          <X size={16} />
        </button>
      </div>

      <div className="relative w-full aspect-[4/5] bg-[#1C1C1E] rounded-[32px] overflow-hidden shadow-2xl border border-white/5 flex items-center justify-center">
        {error ? (
          <div className="text-center p-8 space-y-4 animate-in fade-in zoom-in duration-300">
             <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto">
                <X size={32} />
             </div>
             <div className="space-y-1">
                <p className="text-base font-bold text-white">Access Denied</p>
                <p className="text-xs text-white/50 font-medium px-4">{error}</p>
             </div>
             <button onClick={startCamera} className="bg-white text-black px-6 py-2.5 rounded-full text-xs font-bold shadow-xl active:scale-95 transition-transform">
               Request Authorization
             </button>
          </div>
        ) : capturedImg ? (
          <img src={capturedImg} alt="Captured selfie" className="w-full h-full object-cover animate-in fade-in duration-500" />
        ) : (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              onCanPlay={onVideoCanPlay}
              className={`w-full h-full object-cover ${isStarting ? 'opacity-0' : 'opacity-100'} transition-opacity duration-700 transform -scale-x-100`} 
            />
            {isStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1C1C1E] gap-4">
                <Spinner size="lg" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 animate-pulse">Initializing Lenses...</p>
              </div>
            )}
            
            {/* Overlay guidelines */}
            {!isStarting && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center animate-in fade-in duration-1000">
                <div className="w-[70%] h-[60%] border-2 border-dashed border-white/20 rounded-[120px] mb-12 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-center justify-center text-white/10">
                   <div className="w-[10%] h-[10%] border border-white/10 rounded-full"></div>
                </div>
              </div>
            )}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="w-full mt-8 flex justify-center gap-4">
        {capturedImg ? (
          <>
            <button 
              onClick={handleRetake}
              className="px-6 py-3 rounded-full font-semibold text-sm bg-white/10 hover:bg-white/20 transition-all flex items-center gap-2 flex-1 justify-center"
            >
              <RefreshCw size={16} /> Retake
            </button>
            <button 
              onClick={handleConfirm}
              className="px-6 py-3 rounded-full font-semibold text-sm bg-[#34C759] hover:bg-[#2FB350] text-white transition-all flex items-center gap-2 flex-1 justify-center"
            >
              <CheckCircle2 size={16} /> Use Photo
            </button>
          </>
        ) : (
          !error && (
            <button 
              onClick={handleCapture}
              disabled={isStarting}
              className="w-16 h-16 rounded-full border-4 border-white/30 p-1 flex items-center justify-center disabled:opacity-50 transition-transform active:scale-95"
            >
              <div className="w-full h-full bg-white rounded-full"></div>
            </button>
          )
        )}
      </div>
    </div>
  );
};
