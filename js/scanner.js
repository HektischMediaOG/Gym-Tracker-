// Barcode-Scanner über die Kamera. Nutzt den im Browser eingebauten BarcodeDetector
// (Chrome auf Android); wo es den nicht gibt, bleibt die manuelle Eingabe.

let stream = null;
let timer = null;

export function scannerSupported() {
  return 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
}

export async function startScanner(video, onCode) {
  stopScanner();
  const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  let busy = false;
  timer = setInterval(async () => {
    if (busy || video.readyState < 2) return;
    busy = true;
    try {
      const codes = await detector.detect(video);
      const hit = codes.find((c) => /^\d{8,14}$/.test(c.rawValue));
      if (hit) {
        stopScanner();
        navigator.vibrate?.(60);
        onCode(hit.rawValue);
      }
    } catch {
      /* einzelne Frames dürfen fehlschlagen */
    } finally {
      busy = false;
    }
  }, 250);
}

export function stopScanner() {
  clearInterval(timer);
  timer = null;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}
