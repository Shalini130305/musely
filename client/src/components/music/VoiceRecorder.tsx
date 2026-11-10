import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2, Check, AlertCircle } from 'lucide-react';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface VoiceRecorderProps {
  onRecorded: (result: { audioUrl: string; duration: number }) => void;
  onCancel?: () => void;
}

export function VoiceRecorder({ onRecorded, onCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioPreviewRef.current) audioPreviewRef.current.pause();
    };
  }, []);

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('Voice recording is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);

        // Stop all audio tracks to turn off mic indicator
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Mic access error:', err);
      toast.error('Microphone access denied. Please grant permission in your browser.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const togglePreviewPlay = () => {
    if (!recordedUrl) return;
    if (!audioPreviewRef.current) {
      audioPreviewRef.current = new Audio(recordedUrl);
      audioPreviewRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioPreviewRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPreviewRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleUploadAndSave = async () => {
    if (!recordedBlob) return;
    try {
      setIsUploading(true);
      const formData = new FormData();
      const ext = recordedBlob.type.includes('mp4') ? 'm4a' : 'webm';
      formData.append('audio', recordedBlob, `voice-note.${ext}`);
      formData.append('duration', String(duration));

      const { data } = await api.post('/music/voice-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onRecorded({
        audioUrl: data.audioUrl,
        duration: data.duration || duration,
      });
      toast.success('Voice note attached!');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  const resetRecording = () => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    setRecordedBlob(null);
    setRecordedUrl(null);
    setDuration(0);
    setIsPlaying(false);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="p-4 rounded-2xl bg-[#141418] border border-[#303039] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          <Mic className="w-4 h-4 text-[#FF4F9A]" />
          Record Voice Note
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] text-[#757582] hover:text-white"
          >
            Cancel
          </button>
        )}
      </div>

      {!recordedBlob ? (
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md',
                isRecording
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-[#FF4F9A] hover:bg-[#FF72AD] text-white'
              )}
            >
              {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
            </button>
            <div>
              <p className="text-xs font-bold text-white">
                {isRecording ? 'Recording in progress...' : 'Click to start recording'}
              </p>
              <p className="text-[11px] text-[#757582]">
                {isRecording ? `Timer: ${formatTime(duration)}` : 'Up to 2 minutes of crystal-clear voice audio'}
              </p>
            </div>
          </div>

          {isRecording && (
            <button
              type="button"
              onClick={stopRecording}
              className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-semibold text-white transition-colors shrink-0"
            >
              Done Recording
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 py-1">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={togglePreviewPlay}
              className="w-9 h-9 rounded-full bg-[#26262E] hover:bg-[#303039] text-[#FF4F9A] flex items-center justify-center transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <div>
              <span className="text-xs font-bold text-white block">Preview Voice Note</span>
              <span className="text-[10px] text-[#757582]">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetRecording}
              className="p-2 rounded-xl text-[#757582] hover:text-rose-400 hover:bg-[#26262E] transition-colors"
              title="Delete and re-record"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleUploadAndSave}
              disabled={isUploading}
              className="px-4 py-1.5 rounded-xl bg-[#FF4F9A] hover:bg-[#FF72AD] text-xs font-semibold text-white shadow-pink-glow transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {isUploading ? 'Uploading...' : 'Attach Audio'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
