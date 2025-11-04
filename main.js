const tmi = require('tmi.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const speaker = require('speaker');


const CONFIG = {
    channel: '',
    
    pythonPath: getPythonPath(),
    ffmpegPath: getFFmpegPath(),
    sileroScript: path.join(__dirname, 'silero_tts.py'),
    

    
    speechSpeed: 1.0,           // Скорость речи 
    maxMessageLength: 300,      // Максимальная длина сообщения
    minMessageLength: 3,        // Минимальная длина
    readUsername: false,        // Читать имя пользователя
    queueDelay: 300,            // Задержка между сообщениями (мс)
    volume: 0.2,                // Громкость (0.0-1.0)
    
    sileroVoice: 'aidar',       // aidar, baya, kseniya, xenia, eugene, random
    
    ignoreCommands: true,
    ignoreBots: true,
    ignoreLinks: true,
    
    ignoredUsers: [
        'nightbot',
        'streamelements', 
        'moobot',
        'streamlabs',
        'fossabot',
        'wizebot',
    ],
};

function getPythonPath() {
    const platform = process.platform;
    const possiblePaths = [
        path.join(__dirname, 'venv', 'Scripts', 'python.exe'),
        path.join(__dirname, '.venv', 'Scripts', 'python.exe'),
        path.join(__dirname, 'env', 'Scripts', 'python.exe'),
        path.join(__dirname, 'venv', 'bin', 'python'),
        path.join(__dirname, '.venv', 'bin', 'python'),
        path.join(__dirname, 'env', 'bin', 'python'),
        'python3',
        'python'
    ];
    for (const p of possiblePaths) {
        try {
            if (fs.existsSync(p) || (platform === 'win32' && fs.existsSync(p.replace('.exe', '')))) {
                return p;
            }
        } catch (error) {
            continue;
        }
    }
    
    console.log('Python из venv не найден. Будет использован системный Python');
    return platform === 'win32' ? 'python' : 'python3';
}
function getFFmpegPath() {
    const platform = process.platform;
    
    const possiblePaths = [
        path.join(__dirname, 'ffmpeg', 'ffmpeg.exe'),
        path.join(__dirname, 'ffmpeg', 'ffmpeg'),        
        'ffmpeg'
    ];
    
    for (const ffmpegPath of possiblePaths) {
        try {
            if (fs.existsSync(ffmpegPath)) {
                return ffmpegPath;
            }
        } catch (error) {
            continue;
        }
    }
    
    console.log('Локальный FFmpeg не найден, использую системный');
    return 'ffmpeg';
}

class SileroTTSV5 {
    constructor(config) {
        this.config = config;
        this.isReading = false;
        this.queue = [];
        this.stats = {
            totalMessages: 0,
            totalSkipped: 0,
            totalRead: 0,
        };
    }

    cleanText(text) {
        text = text.replace(/:\w+:/g, '');
        text = text.replace(/https?:\/\/\S+/g, '');
        text = text.replace(/@\w+/g, '');
        
        const language = this.detectTextLanguage(text);
        
        if (language === 'english' || language === 'mixed') {
            const originalText = text;
            text = this.transliterateToRussian(text);
        }
        
        const onlyDigitsAndSpaces = /^[\d\s\.\,\!\?\-]+$/.test(text);
        if (onlyDigitsAndSpaces) {
            text = this.convertNumbersToWords(text);
        }
        
        text = text.replace(/\b(\d+)\b/g, (match) => {
            if (match.length <= 4) {
                return match.split('').join(' ');
            }
            return match;
        });
        
        text = text.replace(/\s+/g, ' ').trim();
        
        text = text.replace(/[^\wа-яА-ЯёЁ\s\.\,\!\?\-0-9]/g, '');
        
        if (text.length > this.config.maxMessageLength) {
            text = text.substring(0, this.config.maxMessageLength);
            console.log(`Текст обрезан до ${this.config.maxMessageLength} символов`);
        }
        
        if (!text || text.replace(/[^\wа-яА-ЯёЁ]/g, '').length === 0) {
            console.log('Текст пустой после очистки');
            return '';
        }
        
        if (text && !text.match(/[.!?]$/)) {
            text += '.';
        }
        
        return text;
    }


    convertNumbersToWords(text) {
        const numberWords = {
            '0': 'ноль', '1': 'один', '2': 'два', '3': 'три', '4': 'четыре',
            '5': 'пять', '6': 'шесть', '7': 'семь', '8': 'восемь', '9': 'девять'
        };
        
        return text.split('').map(char => {
            return numberWords[char] || char;
        }).join(' ');
    }


    transliterateToRussian(text) {
        const translitMap = {
            'a': 'а', 'b': 'б', 'c': 'к', 'd': 'д', 'e': 'е', 'f': 'ф', 'g': 'г', 
            'h': 'х', 'i': 'и', 'j': 'дж', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н',
            'o': 'о', 'p': 'п', 'q': 'к', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у',
            'v': 'в', 'w': 'в', 'x': 'кс', 'y': 'й', 'z': 'з',
            'A': 'А', 'B': 'Б', 'C': 'К', 'D': 'Д', 'E': 'Е', 'F': 'Ф', 'G': 'Г',
            'H': 'Х', 'I': 'И', 'J': 'Дж', 'K': 'К', 'L': 'Л', 'M': 'М', 'N': 'Н',
            'O': 'О', 'P': 'П', 'Q': 'К', 'R': 'Р', 'S': 'С', 'T': 'Т', 'U': 'У',
            'V': 'В', 'W': 'В', 'X': 'Кс', 'Y': 'Й', 'Z': 'З',
            'ch': 'ч', 'sh': 'ш', 'zh': 'ж', 'th': 'т', 'ph': 'ф', 'kh': 'х',
            'ts': 'ц', 'ya': 'я', 'yo': 'ё', 'ye': 'е', 'yu': 'ю', 'zh': 'ж',
            'Ch': 'Ч', 'Sh': 'Ш', 'Zh': 'Ж', 'Th': 'Т', 'Ph': 'Ф', 'Kh': 'Х',
            'Ts': 'Ц', 'Ya': 'Я', 'Yo': 'Ё', 'Ye': 'Е', 'Yu': 'Ю', 'Zh': 'Ж',
            'CH': 'Ч', 'SH': 'Ш', 'ZH': 'Ж', 'TH': 'Т', 'PH': 'Ф', 'KH': 'Х',
            'TS': 'Ц', 'YA': 'Я', 'YO': 'Ё', 'YE': 'Е', 'YU': 'Ю', 'ZH': 'Ж'
        };

        let result = text;
        const doubleLetters = Object.keys(translitMap).filter(key => key.length === 2);
        doubleLetters.forEach(combo => {
            result = result.replace(new RegExp(combo, 'gi'), translitMap[combo]);
        });

        result = result.split('').map(char => {
            return translitMap[char] || char;
        }).join('');

        return result;
    }
    detectTextLanguage(text) {
        const russianLetters = /[а-яА-ЯёЁ]/;
        const englishLetters = /[a-zA-Z]/;
        
        const hasRussian = russianLetters.test(text);
        const hasEnglish = englishLetters.test(text);
        
        if (hasRussian && !hasEnglish) {
            return 'russian';
        } else if (!hasRussian && hasEnglish) {
            return 'english';
        } else if (hasRussian && hasEnglish) {
            return 'mixed';
        } else {
            return 'other';
        }
    }


    async speak(text, username = null) {
        const cleanedText = this.cleanText(text);
        
        if (!cleanedText || cleanedText.length < this.config.minMessageLength) {
            this.stats.totalSkipped++;
            console.log(`Пропущено: слишком короткое сообщение`);
            return;
        }

        let textToSpeak = cleanedText;
        if (username && this.config.readUsername) {
            textToSpeak = `${username} пишет: ${cleanedText}`;
        }

        return new Promise((resolve, reject) => {
            try {
                const python = spawn(this.config.pythonPath, [this.config.sileroScript], {
                    cwd: __dirname,
                    env: {
                        ...process.env,
                        PYTHONUNBUFFERED: '1',
                        PYTHONIOENCODING: 'utf-8'
                    }
                });
                
                const params = {
                    text: textToSpeak,
                    speaker: this.config.sileroVoice
                };
                
                python.stdin.write(JSON.stringify(params));
                python.stdin.end();
                
                const ffmpeg = spawn('ffmpeg', [
                    '-f', 's16le',
                    '-ar', '24000',
                    '-ac', '1',
                    '-i', 'pipe:0',
                    '-af', `volume=${this.config.volume}`,
                    '-f', 's16le',
                    '-ar', '22050',
                    '-ac', '1',
                    'pipe:1'
                ]);
                
                const speakerInstance = new speaker({
                    channels: 1,
                    bitDepth: 16,
                    sampleRate: 22050
                });
                
                python.stdout.pipe(ffmpeg.stdin);
                ffmpeg.stdout.pipe(speakerInstance);
                
                let stderrOutput = '';
                python.stderr.on('data', (data) => {
                    const chunk = data.toString();
                    stderrOutput += chunk;
                    console.log(chunk.trim());
                });
                
                ffmpeg.stderr.on('data', (data) => {
                });
                
                speakerInstance.on('close', () => {
                    this.stats.totalRead++;
                    resolve();
                });
                
                python.on('error', (err) => {
                    console.error('❌ Ошибка Python процесса:', err.message);
                    reject(err);
                });
                
                python.on('close', (code) => {
                    if (code !== 0 && code !== null) {
                        const error = new Error(`Python process exited with code ${code}`);
                        if (stderrOutput) {
                            error.stderr = stderrOutput;
                        }
                        reject(error);
                    }
                });
                
            } catch (error) {
                console.error('Ошибка при озвучке:', error.message);
                reject(error);
            }
        });
    }

    async addToQueue(text, username) {
        this.queue.push({ text, username });        
        if (!this.isReading) {
            await this.processQueue();
        }
    }

    async processQueue() {
        if (this.isReading || this.queue.length === 0) {
            return;
        }

        this.isReading = true;

        while (this.queue.length > 0) {
            const { text, username } = this.queue.shift();
            try {
                await this.speak(text, username);
                if (this.queue.length > 0) {
                    await new Promise(resolve => 
                        setTimeout(resolve, this.config.queueDelay)
                    );
                }
            } catch (error) {
                console.error('Ошибка при озвучке:', error.message);
                if (error.stderr) {
                    console.error('stderr:', error.stderr);
                }
            }
        }

        this.isReading = false;
    }

    clearQueue() {
        const cleared = this.queue.length;
        this.queue = [];
        console.log(`Очищено ${cleared} сообщений из очереди`);
    }

    getStats() {
        return this.stats;
    }
}


class TwitchTTSBot {
    constructor(config) {
        this.config = config;
        this.tts = new SileroTTSV5(config);
        this.connected = false;
        
        this.client = new tmi.Client({
            channels: [config.channel]
        });

        this.setupHandlers();
    }

    setupHandlers() {
        this.client.on('connected', (addr, port) => {
            this.connected = true;
            console.log(`Канал: ${this.config.channel}`);
            console.log(`Голос Silero: ${this.config.sileroVoice}`);
            console.log(`Скорость речи: ${this.config.speechSpeed}x`);
            console.log(`Громкость: ${Math.round(this.config.volume * 100)}%`);
            console.log(`Читать имена: ${this.config.readUsername ? 'Да' : 'Нет'}\n`);
        });

        this.client.on('message', async (channel, tags, message, self) => {
            if (self) return;

            const username = tags['display-name'] || tags['username'];
            this.tts.stats.totalMessages++;
            
            if (this.shouldIgnoreMessage(message, username, tags)) {
                return;
            }

            console.log(`${username}>> ${message}`);

            await this.tts.addToQueue(message, username);
        });

        this.client.on('disconnected', (reason) => {
            this.connected = false;
            console.log(`\nОтключено от Twitch: ${reason}`);
        });

        this.client.on('reconnect', () => {
            console.log('Переподключение к Twitch...');
        });

        this.client.on('error', (err) => {
            console.error('Ошибка Twitch:', err.message);
        });
    }

    shouldIgnoreMessage(message, username, tags) {
        if (this.config.ignoreCommands && message.startsWith('!')) {
            console.log(`Пропущено: команда от ${username}`);
            this.tts.stats.totalSkipped++;
            return true;
        }

        if (this.config.ignoreBots && 
            this.config.ignoredUsers.includes(username.toLowerCase())) {
            console.log(`Пропущено: бот ${username}`);
            this.tts.stats.totalSkipped++;
            return true;
        }

        if (this.config.ignoreLinks && 
            (message.includes('http://') || message.includes('https://'))) {
            console.log(`Пропущено: ссылка от ${username}`);
            this.tts.stats.totalSkipped++;
            return true;
        }

        if (message.length < this.config.minMessageLength) {
            console.log(`Пропущено: слишком короткое от ${username}`);
            this.tts.stats.totalSkipped++;
            return true;
        }

        return false;
    }

    async start() {        
        try {
            await this.client.connect();
        } catch (error) {
            console.error('Ошибка подключения к Twitch:', error.message);
            process.exit(1);
        }
    }

    stop() {
        console.log('\nОстановка бота...');
        
        const stats = this.tts.getStats();
        console.log('\nСТАТИСТИКА:');
        console.log(`Всего сообщений: ${stats.totalMessages}`);
        console.log(`Озвучено: ${stats.totalRead}`);
        console.log(`Пропущено: ${stats.totalSkipped}`);
        
        this.tts.clearQueue();
        this.client.disconnect();
        console.log('Бот остановлен\n');
    }

    showStats() {
        const stats = this.tts.getStats();
        console.log('\nСТАТИСТИКА:');
        console.log(`Всего сообщений: ${stats.totalMessages}`);
        console.log(`Озвучено: ${stats.totalRead}`);
        console.log(`Пропущено: ${stats.totalSkipped}`);
        console.log(`В очереди: ${this.tts.queue.length}`);
        console.log(`Статус: ${this.connected ? 'Подключен' : 'Отключен'}\n`);
    }

    clearQueue() {
        this.tts.clearQueue();
    }

    setSpeed(speed) {
        if (speed < 0.5 || speed > 2.0) {
            console.log('Скорость должна быть от 0.5 до 2.0');
            return;
        }
        this.config.speechSpeed = speed;
        this.tts.config.speechSpeed = speed;
        console.log(`Скорость речи изменена на ${speed}x`);
    }
    
    setVoice(voice) {
        const validVoices = ['aidar', 'baya', 'kseniya', 'xenia', 'eugene', 'random'];
        if (validVoices.includes(voice.toLowerCase())) {
            this.config.sileroVoice = voice.toLowerCase();
            this.tts.config.sileroVoice = voice.toLowerCase();
            console.log(`Голос изменен на: ${voice}`);
        } else {
            console.log(`Неверный голос. Доступные: ${validVoices.join(', ')}`);
        }
    }
    
    setVolume(volume) {
        if (volume < 0 || volume > 1) {
            console.log('Громкость должна быть от 0.0 до 1.0');
            return;
        }
        this.config.volume = volume;
        this.tts.config.volume = volume;
        console.log(`Громкость изменена на: ${Math.round(volume * 100)}%`);
    }
    
}

try {
    require.resolve('speaker');
} catch (error) {
    console.error('npm install speaker');
    process.exit(1);
}

try {
    require.resolve('tmi.js');
} catch (error) {
    console.error('npm install tmi.js');
    process.exit(1);
}

try {
    const { execSync } = require('child_process');
    execSync('ffmpeg -version', { stdio: 'ignore' });

} catch (error) {
    process.exit(1);
}

const bot = new TwitchTTSBot(CONFIG);

bot.start();


process.on('SIGINT', () => {
    bot.stop();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('Критическая ошибка:', err);
    bot.stop();
    process.exit(1);
});

