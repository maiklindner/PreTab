const textToSpeech = require('@google-cloud/text-to-speech');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = '/Users/maik/Documents/GitHub/Extension-Conventions/keys/gen-lang-client-0215910193-063beb19bcc9.json';
const client = new textToSpeech.TextToSpeechClient({ keyFilename: KEY_PATH });
const locales = require('./locales.json').locales;
const audioDir = path.join(__dirname, '../../assets/store/audio');

if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

async function generateVo(lang, index, text) {
    const localeData = locales[lang];
    const voice = localeData.voice;
    let isSsml = false;
    let finalInput = text;
    if (text === 'PreTab' && lang === 'de') {
        finalInput = 'PreTab.';
    }

    // BRANDING PHONATION
    if (text === 'PreTab') {
        const ipa = 'priː tæb';
        finalInput = `<speak><phoneme alphabet="ipa" ph="${ipa}">PreTab</phoneme></speak>`;
        isSsml = true;
    }

    // MANDATORY HASH RULE: text + voice + ssml_status
    // This ensures regeneration if pronunciation (SSML) or voice changes.
    const hashData = finalInput + voice + (isSsml ? '_ssml' : '');
    const hash = crypto.createHash('md5').update(hashData).digest('hex').substring(0, 8);
    
    const fileName = `vo_${lang}_${index}_${hash}.mp3`;
    const filePath = path.join(audioDir, fileName);

    if (fs.existsSync(filePath)) {
        console.log(`Skipping (already exists): ${fileName}`);
        return;
    }

    console.log(`Generating audio: "${text.substring(0, 30)}..." (${lang} with ${voice})${isSsml ? ' [SSML]' : ''}`);
    
    const request = {
        input: isSsml ? { ssml: finalInput } : { text: finalInput },
        voice: { 
            languageCode: localeData.flag.split('=')[1], 
            name: voice 
        },
        audioConfig: { 
            audioEncoding: 'MP3',
            // Note: Chirp3-HD does not support pitch/speakingRate
            ...(voice.includes('Chirp3-HD') ? {} : { pitch: 0, speakingRate: 1 })
        },
    };

    try {
        const [response] = await client.synthesizeSpeech(request);
        await fs.promises.writeFile(filePath, response.audioContent, 'binary');
        console.log(`Saved: ${filePath}`);
    } catch (err) {
        console.error(`Error generating audio for ${lang}:`, err.message);
    }
}

async function run() {
    const targetLocales = ['en', 'de', 'ja', 'es', 'fr', 'pt_BR', 'zh_CN'];
    for (const lang of targetLocales) {
        const data = locales[lang];
        if (data) {
            console.log(`Finalizing all ${lang} audio segments with ${data.voice}...`);
            for (let i = 0; i < data.script.length; i++) {
                await generateVo(lang, i, data.script[i]);
            }
        }
    }
}

run();
