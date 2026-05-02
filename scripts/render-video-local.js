#!/usr/bin/env node
/**
 * render-video-local.js — HTML → MP4 via local Playwright
 * 
 * Fallback when global playwright npm install fails (permission issues).
 * Uses /opt/data/node_modules/playwright (pre-installed).
 * 
 * Usage: node render-video-local.js <html_file> [--duration=8] [--trim=1.5] [--width=1280] [--height=720]
 */

const { chromium } = require('/opt/data/node_modules/playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROMIUM = '/opt/data/.agent-browser/browsers/chromium_headless_shell-1217/chrome-linux/headless_shell';
const FFMPEG = '/opt/data/.agent-browser/browsers/ffmpeg-1011/ffmpeg-linux';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { duration: 8, trim: 1.5, width: 1280, height: 720 };
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=');
      if (k === 'duration') opts.duration = parseFloat(v);
      else if (k === 'trim') opts.trim = parseFloat(v);
      else if (k === 'width') opts.width = parseInt(v);
      else if (k === 'height') opts.height = parseInt(v);
    } else if (!arg.startsWith('--')) {
      opts.html = arg;
    }
  }
  return opts;
}

async function render(opts) {
  const { html, duration, trim, width, height } = opts;
  if (!html) { console.error('Usage: node render-video-local.js <html_file>'); process.exit(1); }
  const htmlPath = path.resolve(html);
  const dir = path.dirname(htmlPath);
  const base = path.basename(htmlPath, '.html');

  console.log(`🎬 Recording: ${html}`);
  console.log(`   Duration: ${duration}s | Trim: ${trim}s | Resolution: ${width}×${height}`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer']
  });

  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir, duration: duration + trim + 2 }
  });

  const page = await context.newPage();
  await page.goto(`file://${htmlPath}`);
  await page.waitForTimeout((duration + trim) * 1000);

  const videoPath = await context.close();
  await browser.close();

  // Find recorded webm
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.webm'));
  if (!files.length) { console.error('❌ No webm recorded'); process.exit(1); }
  const webmPath = path.join(dir, files[0]);
  const mp4Path = path.join(dir, `${base}.mp4`);

  console.log(`📦 Recording done → ${webmPath}`);
  console.log(`🎞️  Converting to MP4...`);

  // Convert webm → mp4 (H.264, 25fps)
  execSync(`${FFMPEG} -y -i "${webmPath}" -ss ${trim} -t ${duration} `
    + `-r 25 -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p `
    + `-c:a aac -b:a 128k "${mp4Path}" 2>/dev/null`);

  fs.unlinkSync(webmPath);
  const size = (fs.statSync(mp4Path).size / 1024).toFixed(0);
  console.log(`✅ Done: ${mp4Path} (${size} KB)`);
}

render(parseArgs()).catch(e => { console.error(e); process.exit(1); });
