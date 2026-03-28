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
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      setError(err.message || 'Could not access camera. Please check permissions.');
    } finally {
      setIsStarting(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
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
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const context = canvas.getContext('2d');
      if (context) {
        // Draw the video frame to the canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Convert to base64 JPEG
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
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
    <div className="flex flex-col items-center bg-black/95 text-white p-6 rounded-[32px] w-full max-w-sm mx-auto overflow-hidden relative shadow-2xl">
      <div className="flex justify-between items-center w-full mb-6">
        <h3 className="font-semibold text-white tracking-tight flex items-center gap-2">
          <Camera size={18} />
          Identity Verification
        </h3>
        <button onClick={onCancel} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="relative w-full aspect-[3/4] bg-black rounded-2xl overflow-hidden shadow-inner border border-white/10 flex items-center justify-center">
        {error ? (
          <div className="text-center p-6 space-y-4">
             <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <X size={24} />
             </div>
             <p className="text-sm text-white/70 font-medium">{error}</p>
             <button onClick={startCamera} className="bg-white text-black px-4 py-2 rounded-full text-sm font-semibold">
               Try Again
             </button>
          </div>
        ) : capturedImg ? (
          <img src={capturedImg} alt="Captured selfie" className="w-full h-full object-cover" />
        ) : (
          <>
            {isStarting && <Spinner size="lg" />}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={`w-full h-full object-cover ${isStarting ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300 transform -scale-x-100`} 
            />
            {/* Overlay guidelines */}
            {!isStarting && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[60%] h-[50%] border-2 border-dashed border-white/30 rounded-[100px] mb-12 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"></div>
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
