"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { CirclePause, Download, Mic, Trash } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  timerClassName?: string;
  onSave?: (blob: Blob) => unknown;
  onPause?: (blob: Blob) => unknown;
  onReset?: () => unknown;
};

type Record = {
  id: number;
  name: string;
  file: any;
};

let recordingChunks: BlobPart[] = [];
let timerTimeout: NodeJS.Timeout;

// Utility function to pad a number with leading zeros
const padWithLeadingZeros = (num: number, length: number): string => {
  return String(num).padStart(length, "0");
};

// Utility function to download a blob
const downloadBlob = (blob: Blob) => {
  const downloadLink = document.createElement("a");
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = `audio_${new Date().getMilliseconds()}.wav`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
};

export const AudioRecorderWithVisualizer = ({
  className,
  timerClassName,
  onSave,
  onPause,
  onReset,
}: Props) => {
  const { theme } = useTheme();
  // States
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isRecordingFinished, setIsRecordingFinished] =
    useState<boolean>(false);
  const [timer, setTimer] = useState<number>(0);
  const [currentRecord, setCurrentRecord] = useState<Record>({
    id: -1,
    name: "",
    file: null,
  });
  // Calculate the hours, minutes, and seconds from the timer
  const hours = Math.floor(timer / 3600);
  const minutes = Math.floor((timer % 3600) / 60);
  const seconds = timer % 60;

  // Split the hours, minutes, and seconds into individual digits
  const [hourLeft, hourRight] = useMemo(
    () => padWithLeadingZeros(hours, 2).split(""),
    [hours],
  );
  const [minuteLeft, minuteRight] = useMemo(
    () => padWithLeadingZeros(minutes, 2).split(""),
    [minutes],
  );
  const [secondLeft, secondRight] = useMemo(
    () => padWithLeadingZeros(seconds, 2).split(""),
    [seconds],
  );
  // Refs
  const mediaRecorderRef = useRef<{
    stream: MediaStream | null;
    analyser: AnalyserNode | null;
    mediaRecorder: MediaRecorder | null;
    audioContext: AudioContext | null;
  }>({
    stream: null,
    analyser: null,
    mediaRecorder: null,
    audioContext: null,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<any>(null);

  function startRecording() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({
          audio: true,
        })
        .then((stream) => {
          setIsRecording(true);
          // ============ Analyzing ============
          const AudioContext = window.AudioContext;
          const audioCtx = new AudioContext();
          const analyser = audioCtx.createAnalyser();
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);
          mediaRecorderRef.current = {
            stream,
            analyser,
            mediaRecorder: null,
            audioContext: audioCtx,
          };

          mediaRecorderRef.current.mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current.mediaRecorder.start(100);
          recordingChunks = [];

          // ============ Recording ============
          mediaRecorderRef.current.mediaRecorder.ondataavailable = (e) => {
            recordingChunks.push(e.data);
          };
        })
        .catch((error) => {
          console.error(error);
        });
    }
  }
  function pauseRecording() {
    const recorder = mediaRecorderRef.current.mediaRecorder;

    if (!recorder) {
      return;
    }

    recorder.onpause = () => {
      if (onPause) {
        const recordBlob = new Blob(recordingChunks, {
          type: "audio/wav",
        });
        onPause(recordBlob);
      }
    };

    recorder.pause();

    setIsRecording(false);
    setIsPaused(true);
    setIsRecordingFinished(false);
  }
  function resumeRecording() {
    const recorder = mediaRecorderRef.current.mediaRecorder;

    if (!recorder) {
      return;
    }

    recorder.resume();

    setIsRecording(true);
    setIsPaused(false);
    setIsRecordingFinished(false);
  }
  function stopRecording() {
    const recorder = mediaRecorderRef.current.mediaRecorder;

    if (!recorder) {
      return;
    }

    recorder.onstop = () => {
      const recordBlob = new Blob(recordingChunks, {
        type: "audio/wav",
      });

      if (onSave) {
        onSave(recordBlob);
      } else {
        downloadBlob(recordBlob);
      }

      // @Anurag-Kochar-1 Not sure why this is here?
      setCurrentRecord({
        ...currentRecord,
        file: window.URL.createObjectURL(recordBlob),
      });
      recordingChunks = [];
    };

    recorder.stop();

    setIsRecording(false);
    setIsPaused(false);
    setIsRecordingFinished(true);
    setTimer(0);
    clearTimeout(timerTimeout);
  }
  function resetRecording() {
    const { mediaRecorder, stream, analyser, audioContext } =
      mediaRecorderRef.current;

    if (onReset) {
      onReset();
    }

    if (mediaRecorder) {
      mediaRecorder.onstop = () => {
        recordingChunks = [];
      };
      mediaRecorder.stop();
    } else {
      alert("recorder instance is null!");
    }

    // Stop the web audio context and the analyser node
    if (analyser) {
      analyser.disconnect();
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (audioContext) {
      audioContext.close();
    }
    setIsRecording(false);
    setIsPaused(false);
    setIsRecordingFinished(true);
    setTimer(0);
    clearTimeout(timerTimeout);

    // Clear the animation frame and canvas
    cancelAnimationFrame(animationRef.current || 0);
    const canvas = canvasRef.current;
    if (canvas) {
      const canvasCtx = canvas.getContext("2d");
      if (canvasCtx) {
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;
        canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
      }
    }
  }

  const handleSubmit = () => {
    stopRecording();
  };

  // Effect to update the timer every second
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerTimeout = setTimeout(() => {
        setTimer(timer + 1);
      }, 1000);
    }
    return () => clearTimeout(timerTimeout);
  }, [isRecording, isPaused, timer]);

  // Visualizer
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    const drawWaveform = (dataArray: Uint8Array) => {
      if (!canvasCtx) return;
      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
      canvasCtx.fillStyle = "#939393";

      const barWidth = 1;
      const spacing = 1;
      const maxBarHeight = HEIGHT / 2.5;
      const numBars = Math.floor(WIDTH / (barWidth + spacing));

      for (let i = 0; i < numBars; i++) {
        const barHeight = Math.pow(dataArray[i] / 128.0, 8) * maxBarHeight;
        const x = (barWidth + spacing) * i;
        const y = HEIGHT / 2 - barHeight / 2;
        canvasCtx.fillRect(x, y, barWidth, barHeight);
      }
    };

    const visualizeVolume = () => {
      if (
        !mediaRecorderRef.current?.stream?.getAudioTracks()[0]?.getSettings()
          .sampleRate
      )
        return;
      const bufferLength =
        (mediaRecorderRef.current?.stream?.getAudioTracks()[0]?.getSettings()
          .sampleRate as number) / 100;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!isRecording) {
          cancelAnimationFrame(animationRef.current || 0);
          return;
        }
        animationRef.current = requestAnimationFrame(draw);
        mediaRecorderRef.current?.analyser?.getByteTimeDomainData(dataArray);
        drawWaveform(dataArray);
      };

      draw();
    };

    if (isRecording || isPaused) {
      visualizeVolume();
    } else {
      if (canvasCtx) {
        canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
      }
      cancelAnimationFrame(animationRef.current || 0);
    }

    return () => {
      cancelAnimationFrame(animationRef.current || 0);
    };
  }, [isRecording, isPaused, theme]);

  return (
    <div className="block">
      <div
        className={cn(
          "flex h-16 rounded-md relative w-full items-center justify-center gap-2 max-w-5xl",
          {
            "border p-1": isRecording || isPaused,
            "border-none p-0": !isRecording,
          },
          className,
        )}
      >
        {isRecording || isPaused ? (
          <Timer
            hourLeft={hourLeft}
            hourRight={hourRight}
            minuteLeft={minuteLeft}
            minuteRight={minuteRight}
            secondLeft={secondLeft}
            secondRight={secondRight}
            timerClassName={timerClassName}
          />
        ) : null}
        <canvas
          ref={canvasRef}
          className={`h-full w-full bg-background ${
            !isRecording && !isPaused ? "hidden" : "flex"
          }`}
        />
        <div className="flex gap-2">
          {/* ========== Pause recording button ========== */}
          {isRecording && !isPaused ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={pauseRecording}
                    size={"icon"}
                    variant={"secondary"}
                  >
                    <CirclePause size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="m-2">
                  <span> Pause recording</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {/* ========== Resume recording button ========== */}
          {!isRecording && isPaused ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={resumeRecording}
                    size={"icon"}
                    variant={"secondary"}
                  >
                    <Mic size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="m-2">
                  <span> Resume recording</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {/* ========== Delete recording button ========== */}
          {isRecording || isPaused ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={resetRecording}
                    size={"icon"}
                    variant={"destructive"}
                  >
                    <Trash size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="m-2">
                  <span> Reset recording</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}

          {/* ========== Start and send recording button ========== */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {!isRecording && !isPaused ? (
                  <Button onClick={() => startRecording()} size={"icon"}>
                    <Mic size={15} />
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} size={"icon"}>
                    <Download size={15} />
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent className="m-2">
                <span>
                  {" "}
                  {!isRecording && !isPaused
                    ? "Start recording"
                    : "Download recording"}{" "}
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

const Timer = React.memo(
  ({
    hourLeft,
    hourRight,
    minuteLeft,
    minuteRight,
    secondLeft,
    secondRight,
    timerClassName,
  }: {
    hourLeft: string;
    hourRight: string;
    minuteLeft: string;
    minuteRight: string;
    secondLeft: string;
    secondRight: string;
    timerClassName?: string;
  }) => {
    return (
      <div
        className={cn(
          "items-center -top-12 left-0 absolute justify-center gap-0.5 border p-1.5 rounded-md font-mono font-medium text-foreground flex",
          timerClassName,
        )}
      >
        <span className="rounded-md bg-background p-0.5 text-foreground">
          {hourLeft}
        </span>
        <span className="rounded-md bg-background p-0.5 text-foreground">
          {hourRight}
        </span>
        <span>:</span>
        <span className="rounded-md bg-background p-0.5 text-foreground">
          {minuteLeft}
        </span>
        <span className="rounded-md bg-background p-0.5 text-foreground">
          {minuteRight}
        </span>
        <span>:</span>
        <span className="rounded-md bg-background p-0.5 text-foreground">
          {secondLeft}
        </span>
        <span className="rounded-md bg-background p-0.5 text-foreground ">
          {secondRight}
        </span>
      </div>
    );
  },
);
Timer.displayName = "Timer";
