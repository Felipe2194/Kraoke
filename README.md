# Kraoke 🎤

Creador automático de karaoke: subís una canción y la web separa la voz de la música y transcribe la letra sincronizada palabra por palabra. **Todo corre en el navegador**: la canción nunca sale de tu computadora y no hay servidor de procesamiento.

## Qué entrega

- **Solo la voz** (acapella, WAV)
- **Solo la música** (pista instrumental, WAV)
- **Todo el paquete** (ZIP con ambas pistas + letra `.lrc` con tiempos por palabra + `.txt`)
- **Karaoke web**: sala en pantalla completa con la letra iluminándose al ritmo, voz guía opcional
- **Video karaoke**: MP4 (720p/1080p) generado en el navegador con WebCodecs

## Cómo funciona

| Paso | Tecnología |
| --- | --- |
| Separación voz/música | [HTDemucs](https://github.com/facebookresearch/demucs) en ONNX vía [`demucs-web`](https://github.com/timcsy/demucs-web) + ONNX Runtime Web (WebGPU, o WASM si no hay GPU) |
| Letra con tiempos | Whisper (`onnx-community/whisper-{base,small}_timestamped`) con [Transformers.js](https://github.com/huggingface/transformers.js), solo sobre los tramos con voz |
| Detección de idioma | Un paso del decoder de Whisper sobre los tokens de idioma |
| Video | Canvas + [Mediabunny](https://mediabunny.dev) (H.264/AAC) |
| Persistencia | IndexedDB (canciones y pistas) y Cache API (modelos) |

Los modelos se descargan la primera vez (~180 MB el separador, ~80–250 MB Whisper) y quedan en caché.

El sitio necesita *cross-origin isolation* (`COOP: same-origin`, `COEP: credentialless`) para que ONNX Runtime use varios hilos; está configurado en `next.config.ts`.

## Requisitos

Chrome o Edge de escritorio actualizados. En celulares el procesamiento suele quedarse sin memoria.

## Desarrollo

```bash
npm install
npm run dev
```

## Deploy

Es una app Next.js estándar: importá el repo en Vercel y listo, no hace falta configurar variables de entorno.
