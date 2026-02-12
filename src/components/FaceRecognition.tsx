import { useEffect, useRef, useState } from 'react';
import { FaceDetection, type Results } from "@mediapipe/face_detection";
import './FaceRecognition.css';

const FaceRecognition = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const faceDetectorRef = useRef<FaceDetection | null>(null);
    const detectionStartTimeRef = useRef<number | null>(null);
    const isCameraRunningRef = useRef<boolean>(false);
    const requestRef = useRef<number | null>(null);

    const cameraStartTimeRef = useRef<number>(0);
    const isCapturingRef = useRef<boolean>(false);

    const REQUIRED_DURATION = 1500;
    const WARM_UP_TIME = 2000;

    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [isModelLoading, setIsModelLoading] = useState(true);
    const [statusMessage, setStatusMessage] = useState("Iniciando cámara...");

    useEffect(() => {
        const faceDetector = new FaceDetection({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
        });

        faceDetector.setOptions({
            model: "short",
            minDetectionConfidence: 0.6,
        });

        faceDetector.onResults(onResults);
        faceDetectorRef.current = faceDetector;

        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "user", width: 640, height: 480 }
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play();

                        cameraStartTimeRef.current = Date.now();
                        isCameraRunningRef.current = true;
                        isCapturingRef.current = false;

                        setIsModelLoading(false);
                        setStatusMessage("Prepárate...");
                        processVideo();
                    };
                }
            } catch (err) {
                console.error("Error al acceder a la cámara:", err);
                setIsModelLoading(false);
                setStatusMessage("Error de cámara");
            }
        };

        startCamera();

        return () => {
            stopEverything();
        };
    }, []);

    const stopEverything = () => {
        isCameraRunningRef.current = false;
        if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
        if (faceDetectorRef.current) faceDetectorRef.current.close();

        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
        }
    };

    const processVideo = async () => {
        if (!isCameraRunningRef.current || !videoRef.current || !faceDetectorRef.current) return;

        if (videoRef.current.readyState === 4 && videoRef.current.videoWidth > 0) {
            try {
                await faceDetectorRef.current.send({ image: videoRef.current });
            } catch (error) {
                console.error("Error en detección:", error);
            }
        }

        requestRef.current = requestAnimationFrame(processVideo);
    };

    const onResults = (results: Results) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;

        if (!canvas || !video || video.videoWidth === 0) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        const width = canvas.width;
        const height = canvas.height;
        const now = Date.now();

        ctx.drawImage(video, 0, 0, width, height);

        const timeSinceStart = now - cameraStartTimeRef.current;
        if (timeSinceStart < WARM_UP_TIME) {
            drawMask(ctx, width, height, false);
            return;
        }

        let progress = 0;

        if (isCapturingRef.current || capturedImage) return;

        if (results.detections.length > 0) {
            const detection = results.detections[0];
            const keypoints = detection.landmarks;
            const box = detection.boundingBox;

            if (keypoints) {
                const eyeDiffY = Math.abs(keypoints[0].y - keypoints[1].y);
                const noseOffset = Math.abs(((keypoints[0].x + keypoints[1].x) / 2) - keypoints[2].x);
                const isFrontal = eyeDiffY < 0.12 && noseOffset < 0.12;

                const centerXDiff = Math.abs(box.xCenter - 0.5);
                const centerYDiff = Math.abs(box.yCenter - 0.5);
                const isCentered = centerXDiff < 0.2 && centerYDiff < 0.25;

                if (isFrontal && isCentered) {
                    if (detectionStartTimeRef.current === null) {
                        detectionStartTimeRef.current = now;
                    }
                    const elapsed = now - detectionStartTimeRef.current;
                    progress = Math.min(elapsed / REQUIRED_DURATION, 1.0);

                    if (elapsed >= REQUIRED_DURATION) {
                        captureImage();
                    }
                } else {
                    detectionStartTimeRef.current = null;
                    progress = 0;
                }
            }
        } else {
            detectionStartTimeRef.current = null;
            progress = 0;
        }

        drawMask(ctx, width, height, true, progress);
    };

    const drawMask = (ctx: CanvasRenderingContext2D, width: number, height: number, isActive: boolean, progress: number = 0) => {
        const centerX = width / 2;
        const centerY = height / 2;
        const minDim = Math.min(width, height);

        const radiusX = minDim * 0.22;
        const radiusY = minDim * 0.33;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);

        ctx.fillStyle = isActive ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.85)";
        ctx.fillStyle = isActive ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.85)";
        ctx.fill("evenodd");
        ctx.restore();


        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.lineWidth = 4;

        ctx.strokeStyle = isActive ? "rgba(255, 255, 255, 0.3)" : "rgba(100, 100, 100, 0.5)";
        ctx.stroke();

        if (isActive && progress > 0) {
            const a = radiusY;
            const b = radiusX;
            const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

            ctx.beginPath();
            ctx.ellipse(centerX, centerY, radiusY, radiusX, -Math.PI / 2, 0, 2 * Math.PI);

            ctx.lineCap = "round";
            ctx.lineWidth = 6;
            ctx.strokeStyle = "#00FF00";

            ctx.setLineDash([perimeter * progress, perimeter]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    };

    const captureImage = () => {
        if (isCapturingRef.current) return;
        isCapturingRef.current = true;

        const canvas = canvasRef.current;
        if (canvas) {
            isCameraRunningRef.current = false;
            const imageBase64 = canvas.toDataURL("image/jpeg", 0.9);
            setCapturedImage(imageBase64);
            setStatusMessage("¡Identidad Capturada!");
        }
    };

    const handleRetry = () => {
        setCapturedImage(null);
        setStatusMessage("Reiniciando...");

        isCapturingRef.current = false;
        detectionStartTimeRef.current = null;
        cameraStartTimeRef.current = Date.now();
        isCameraRunningRef.current = true;

        processVideo();
    };

    return (
        <div className="face-recognition-wrapper">
            {isModelLoading && <div className="face-recognition-loader">Cargando IA...</div>}
            {!isModelLoading && !capturedImage && <div className="face-recognition-status">{statusMessage}</div>}

            <div className="face-recognition-container">
                {capturedImage ? (
                    <img src={capturedImage} alt="Captured" className="face-recognition-image-result" />
                ) : (
                    <>
                        <video ref={videoRef} className="face-recognition-video-hidden" playsInline muted autoPlay />
                        <canvas ref={canvasRef} className="face-recognition-canvas" />
                    </>
                )}
            </div>

            {capturedImage && (
                <div className="face-recognition-controls">
                    <h3>Identidad Capturada</h3>
                    <button onClick={handleRetry} className="face-recognition-retry-btn">Intentar de nuevo</button>
                </div>
            )}
        </div>
    );
};

export default FaceRecognition;