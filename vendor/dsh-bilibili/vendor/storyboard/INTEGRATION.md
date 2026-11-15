# Source provenance

Vendored dsh-video-storyboard 0.4.4 from https://github.com/SAOS-3624/dsh-video-storyboard, npm tarball verified during source review. Original src and MIT notices are preserved. Only the local pipeline and transcript matching are used by the Bilibili wrapper; no extra global tools are registered. The worker receives local media and supplied Bilibili subtitles. Cloud/local ASR service startup and OCR are disabled. Worker process/cache are isolated per caller; the parent owns cancellation and deadlines. No account credentials are passed to this worker.
