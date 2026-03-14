const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Configuration
const locales = require('./locales.json').locales;

function getVoPath(audioDir, lang, index, text) {
    const localeData = locales[lang];
    const voice = localeData.voice;
    let finalInput = text;
    let isSsml = false;

    if (text === 'PreTab') {
        const ipa = 'priː tæb';
        finalInput = `<speak><phoneme alphabet="ipa" ph="${ipa}">PreTab</phoneme></speak>`;
        isSsml = true;
    }

    // MANDATORY HASH RULE: text + voice + ssml_status
    const hashData = finalInput + voice + (isSsml ? '_ssml' : '');
    const hash = crypto.createHash('md5').update(hashData).digest('hex').substring(0, 8);
    return path.join(audioDir, `vo_${lang}_${index}_${hash}.mp3`);
}

async function recordPromo(localeKey) {
    const localeData = locales[localeKey];
    if (!localeData) return;

    console.log(`\n--- Recording PreTab Promo (V4 MASTER): ${localeKey.toUpperCase()} ---`);
    const outputDir = path.join(__dirname, '../../assets/store/video');
    const audioDir = path.join(__dirname, '../../assets/store/audio');
    const tempDir = path.join(__dirname, 'temp');
    
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const videoPath = path.join(tempDir, `video_${localeKey}.mp4`);
    const finalPath = path.join(outputDir, `promo_${localeKey}.mp4`);
    const music = path.join(__dirname, 'assets/mklr_music.mp3');

    const extensionPath = path.resolve('../../src');
    if (fs.existsSync(videoPath)) {
        console.log(`Raw video already exists at ${videoPath}. Skipping recording phase.`);
    } else {
        const browser = await puppeteer.launch({
            headless: false,
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`,
                '--window-size=1280,820',
                '--enable-gpu',
                '--use-angle'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        const recorder = new PuppeteerScreenRecorder(page, {
            fps: 60,
            width: 1280,
            height: 720,
        });

        // Wait for extension background
        await page.waitForTimeout(3000);

        const targets = await browser.targets();
        const extensionTarget = targets.find(t => t.url().includes('chrome-extension://'));
        if (!extensionTarget) {
            console.error('Extension NOT found!');
            await browser.close();
            return;
        }
        const extensionId = new URL(extensionTarget.url()).hostname;
        const optionsUrl = `chrome-extension://${extensionId}/options.html`;

        // --- FLASH FIX: Initialize Language before recording ---
        console.log(`Initializing language: ${localeKey}`);
        await page.goto(optionsUrl, { waitUntil: 'networkidle2' });
        await page.evaluate((lang) => {
            return new Promise((resolve) => {
                chrome.storage.local.set({ language: lang }, () => { resolve(); });
            });
        }, localeKey);
        await page.waitForTimeout(500);

        // --- 0-2s: Intro Sequence (Rotating Logo) ---
        await page.goto('about:blank');
        await page.evaluate(() => {
            document.body.style.margin = '0';
            document.body.style.background = 'white';
            document.body.style.display = 'flex';
            document.body.style.justifyContent = 'center';
            document.body.style.alignItems = 'center';
            document.body.style.height = '100vh';
            
            const logo = document.createElement('img');
            logo.id = 'intro-logo';
            logo.style.width = '240px';
            logo.style.height = '240px';
            logo.style.opacity = '0';
            logo.style.transform = 'rotate(-180deg) scale(0.5)';
            logo.style.transition = 'all 1.5s cubic-bezier(0.2, 0.8, 0.2, 1)';
            document.body.appendChild(logo);
        });

        const logoBase64 = fs.readFileSync(path.join(extensionPath, 'icons/logo300.png'), { encoding: 'base64' });

        console.log('Recording started...');
        await recorder.start(videoPath);
        const recStartTime = Date.now();
        
        const waitToMark = async (targetSeconds) => {
            const elapsed = (Date.now() - recStartTime) / 1000;
            const remaining = targetSeconds - elapsed;
            if (remaining > 0) {
                await page.waitForTimeout(remaining * 1000);
            }
        };

        await page.evaluate((b64) => {
            const img = document.getElementById('intro-logo');
            img.src = `data:image/png;base64,${b64}`;
            setTimeout(() => { 
                img.style.opacity = '1'; 
                img.style.transform = 'rotate(0deg) scale(1)';
            }, 100);
        }, logoBase64);
        
        await waitToMark(2.0);
        
        // Navigate to Options
        await page.goto(optionsUrl, { waitUntil: 'networkidle2' });

        try {
            // --- 2-10s: Phase 1 (Light Mode Showcase) ---
            console.log('Phase 1: Feature Showcase (Light)');
            await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
            
            await page.waitForSelector('#mruToggle');
            await page.waitForTimeout(1000);
            await page.evaluate(() => document.querySelector('#mruToggle').parentElement.querySelector('.slider').click());
            await page.waitForTimeout(1500);
            await page.evaluate(() => document.querySelector('#mruToggle').parentElement.querySelector('.slider').click());
            
            await waitToMark(10.0);

            // --- 10-18s: Phase 2 (Dark Mode & Queue) ---
            console.log('Phase 2: Transition & Queue (Dark)');
            await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
            await page.waitForTimeout(1500);
            
            await page.waitForSelector('#queueToggle');
            await page.evaluate(() => document.querySelector('#queueToggle').parentElement.querySelector('.slider').click());
            await page.waitForTimeout(1500);
            await page.evaluate(() => document.querySelector('#queueToggle').parentElement.querySelector('.slider').click());
            
            await waitToMark(18.0);

            // --- 18-30s: Phase 3 Overlay & 24s Sync Outro ---
            console.log('Phase 3: Blurred Overlay & Feature Cycle');
            await page.evaluate((features, brandName, b64) => {
                const overlay = document.createElement('div');
                overlay.id = 'promo-overlay-final';
                overlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    backdrop-filter: blur(15px); background: rgba(0,0,0,0.4);
                    display: flex; flex-direction: column; justify-content: center;
                    align-items: center; color: white; border: none;
                    z-index: 2147483647; transition: opacity 0.5s;
                    text-align: center; padding: 40px; box-sizing: border-box;
                    font-family: sans-serif;
                `;
                overlay.innerHTML = `<div id="text-wrapper" style="width: 80%; display: flex; flex-direction: column; justify-content: center; align-items: center;"><div id="feature-title" style="font-size: min(10vw, 4.2rem); font-weight: 900; line-height: 1.2; transition: all 0.4s ease-out; opacity: 0; transform: translateY(20px); text-shadow: 0 4px 30px rgba(0,0,0,0.5);"></div></div>`;
                document.documentElement.appendChild(overlay);
                
                const container = document.getElementById('feature-title');
                const wrapper = document.getElementById('text-wrapper');
                
                const showFeature = (idx) => {
                    if (idx < 3) {
                        container.innerText = features[idx] || "";
                        container.style.opacity = '1';
                        container.style.transform = 'translateY(0)';
                        setTimeout(() => {
                            container.style.opacity = '0';
                            container.style.transform = 'translateY(-10px)';
                            setTimeout(() => showFeature(idx + 1), 400);
                        }, 1500);
                    }
                };
                showFeature(0);

                // 24.0s Outro Reveal
                setTimeout(() => {
                    wrapper.innerHTML = '';
                    const logo = document.createElement('img');
                    logo.src = `data:image/png;base64,${b64}`;
                    logo.style.width = '280px';
                    logo.style.height = '280px';
                    logo.style.marginBottom = '20px';
                    logo.style.transition = 'all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                    logo.style.transform = 'scale(0.8) translateY(20px)';
                    logo.style.opacity = '0';
                    
                    const title = document.createElement('h1');
                    title.innerText = brandName;
                    title.style.fontSize = 'min(15vw, 8rem)';
                    title.style.fontWeight = '600';
                    title.style.letterSpacing = '-0.02em';
                    title.style.color = 'white'; 
                    title.style.margin = '0';
                    title.style.opacity = '0';
                    title.style.transition = 'all 0.8s ease-out';
                    title.style.transform = 'translateY(10px) scale(1.05)';
                    
                    wrapper.appendChild(logo);
                    wrapper.appendChild(title);
                    setTimeout(() => {
                        logo.style.opacity = '1';
                        logo.style.transform = 'scale(1) translateY(0)';
                        title.style.opacity = '1';
                        title.style.transform = 'translateY(0) scale(1.1)'; 
                    }, 100);
                }, 6000);
            }, localeData.features, localeData.script[localeData.script.length - 1].replace(/\.$/, ''), logoBase64);
            
            await page.waitForTimeout(12000);

        } finally {
            await recorder.stop();
            await browser.close();
        }
    }

    // Audio Mastering
    const masterGain = 2.0;

    let filterComplex = `[1:a]volume=0.8[bg_music];`;
    let voMixInputStr = '';
    for (let i = 0; i < localeData.script.length; i++) {
        const delay = Math.round(offsets[i] * 1000);
        filterComplex += `[${i + 2}:a]adelay=${delay}|${delay}[v${i}];`;
        voMixInputStr += `[v${i}]`;
    }
    filterComplex += `${voMixInputStr}amix=inputs=${localeData.script.length}:normalize=0:dropout_transition=0,volume=${masterGain * localeData.script.length}[allvo_raw];`;
    filterComplex += `[allvo_raw]asplit=2[allvo_duck][allvo_mix];`;
    filterComplex += `[bg_music][allvo_duck]sidechaincompress=threshold=0.1:ratio=20:release=200:attack=15[ducked];`;
    filterComplex += `[ducked][allvo_mix]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[final_audio]`;

    const voInputs = localeData.script.map((text, i) => `-i "${getVoPath(audioDir, localeKey, i, text)}"`).join(' ');
    const cmd = `ffmpeg -y -i "${videoPath}" -i "${music}" ${voInputs} -filter_complex "${filterComplex}" -map 0:v -map "[final_audio]" -c:v libx264 -pix_fmt yuv420p -r 60 -b:a 192k -ar 44100 "${finalPath}"`;

    try { execSync(cmd); console.log(`Final video saved: ${finalPath}`); } 
    catch (err) { console.error('FFmpeg error:', err.message); }
}

async function run() {
    const targetLocales = ['de'];
    for (const key of targetLocales) { await recordPromo(key); }
}

run();
