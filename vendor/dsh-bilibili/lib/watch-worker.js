var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// Upstream calls never need a visible console on Windows. This patch is confined
// to this disposable worker process, before any upstream module is imported.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';
const spawn = childProcess.spawn, execFile = childProcess.execFile;
childProcess.spawn = ((command, args, options) => spawn(command, args, { ...options, windowsHide: true }));
childProcess.execFile = ((...args) => {
    if (Array.isArray(args[1])) {
        if (typeof args[2] === 'object' && args[2] !== null)
            args[2] = { ...args[2], windowsHide: true };
        else
            args.splice(2, 0, { windowsHide: true });
    }
    return execFile(...args);
});
childProcess.execFile[promisify.custom] = (...args) => new Promise((resolve, reject) => childProcess.execFile(...args, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr })));
syncBuiltinESMExports();
let input = '';
for await (const chunk of process.stdin)
    input += chunk.toString();
const options = JSON.parse(input);
try {
    const { runStoryboard } = await import(__rewriteRelativeImportExtension(new URL('../vendor/storyboard/src/pipeline.js', import.meta.url).href));
    const result = await runStoryboard({ ...options, transcript: 'off', asrKey: null, ocr: false, sourceHash: false, audioStrip: false, frameConcurrency: 2, refineBursts: options.action === 'zoom', cache: true, sheets: 1, encode: true });
    const cells = result.sheets.flatMap((s) => s.cells.map((c) => ({ i: c.i, from: c.t_start, to: c.t_end, frame: c.t_frame, sub: c.sub, text: c.text ?? '' })));
    const images = [];
    for (const [i, sheet] of result.sheets.entries()) {
        const file = join(options.output, 'sheet-' + i + '.png');
        await writeFile(file, sheet.png);
        images.push({ file, width: sheet.width, height: sheet.height });
    }
    process.stdout.write(JSON.stringify({ images, cells, from: result.window.from, to: result.window.to, cached: result.cached, cuts: result.cuts.length, transcript: result.transcript?.source ?? 'none' }));
}
catch (error) {
    process.stderr.write(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
