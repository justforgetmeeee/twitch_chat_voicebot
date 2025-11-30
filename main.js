const tmi = require('tmi.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const speaker = require('speaker');

const CONFIG = {
    channel: 'weakling14',
    pythonPath: getPythonPath(),
    ffmpegPath: getFFmpegPath(),
    sileroScript: path.join(__dirname, 'silero_tts.py'),
    speechSpeed: 1.0,
    maxMessageLength: 300,
    minMessageLength: 3,
    readUsername: false,
    queueDelay: 300,
    volume: 0.2,
    sileroVoice: 'aidar',
    ignoreCommands: true,
    ignoreBots: true,
    ignoreLinks: true,
    ignoredUsers: ['nightbot','streamelements','moobot','streamlabs','fossabot','wizebot'],
};

function getPythonPath() {
    const p = [
        path.join(__dirname,'venv','Scripts','python.exe'),
        path.join(__dirname,'.venv','Scripts','python.exe'),
        path.join(__dirname,'env','Scripts','python.exe'),
        path.join(__dirname,'venv','bin','python'),
        path.join(__dirname,'.venv','bin','python'),
        path.join(__dirname,'env','bin','python'),
        'python3','python'
    ];
    for (const x of p) if (fs.existsSync(x)) return x;
    return process.platform==='win32'?'python':'python3';
}

function getFFmpegPath() {
    const p = [
        path.join(__dirname,'ffmpeg','ffmpeg.exe'),
        path.join(__dirname,'ffmpeg','ffmpeg'),
        'ffmpeg'
    ];
    for (const x of p) if (fs.existsSync(x)) return x;
    return 'ffmpeg';
}

function numberToRussianWords(n) {
    n = n.replace(/\s/g,'').trim();
    if (!n) return '';
    const o=['','один','два','три','четыре','пять','шесть','семь','восемь','девять'];
    const of=['','одна','две','три','четыре','пять','шесть','семь','восемь','девять'];
    const t=['','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
    const d=['','десять','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
    const s=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
    const th=['тысяча','тысячи','тысяч'];
    const m=['миллион','миллиона','миллионов'];
    const b=['миллиард','миллиарда','миллиардов'];
    const w=(n,a)=>n%100>=11&&n%100<=19?a[2]:n%10===1?a[0]:n%10>=2&&n%10<=4?a[1]:a[2];
    const l=(num,f=false)=>{
        let r='';const base=f?of:o;
        if(num>=100){r+=s[Math.floor(num/100)]+' ';num%=100}
        if(num>=11&&num<=19){r+=t[num-10]+' ';}
        else{if(num>=10){r+=d[Math.floor(num/10)]+' ';num%=10}
        if(num>0)r+=base[num]+' ';}
        return r.trim();
    };
    const c=num=>{
        if(num===0)return'ноль';
        let neg=num<0;if(neg)num=-num;
        let res='';
        if(num>=1e9){const p=Math.floor(num/1e9);res+=l(p)+' '+w(p,b)+' ';num%=1e9}
        if(num>=1e6){const p=Math.floor(num/1e6);res+=l(p)+' '+w(p,m)+' ';num%=1e6}
        if(num>=1000){const p=Math.floor(num/1000);res+=l(p,true)+' '+w(p,th)+' ';num%=1000}
        if(num>0)res+=l(num)+' ';
        return (neg?'минус ':'')+res.trim();
    };
    return c(parseInt(n,10));
}

class SileroTTSV5 {
    constructor(c){this.config=c;this.isReading=false;this.queue=[];this.stats={totalMessages:0,totalSkipped:0,totalRead:0}}

    cleanText(text){
        text=text.replace(/https?:\/\/\S+/g,'');
        text=text.replace(/@\w+/g,'');

        text=text.replace(/[\u{1F600}-\u{1F64F}]/gu,'');
        text=text.replace(/[\u{1F300}-\u{1F5FF}]/gu,'');
        text=text.replace(/[\u{1F680}-\u{1F6FF}]/gu,'');
        text=text.replace(/[\u{1F1E0}-\u{1F1FF}]/gu,'');
        text=text.replace(/[\u{2600}-\u{26FF}]/gu,'');
        text=text.replace(/[\u{2700}-\u{27BF}]/gu,'');
        text=text.replace(/[\u{1F900}-\u{1F9FF}]/gu,'');

        text=text.replace(/:[a-zA-Z0-9_]+:/g,'');

        text=text.replace(/\b\d+\b/g,m=>{const n=parseInt(m,10);return n>=0&&n<=9999999999?numberToRussianWords(m):m});
        text=text.replace(/\b\d{1,3}([.,\s]\d{3})+\b/g,m=>numberToRussianWords(m.replace(/[.,\s]/g,'')));

        text=text.replace(/[^\wа-яА-ЯёЁ\s\.\,\!\?\-0-9]/g,'');
        text=text.replace(/\s+/g,' ').trim();

        if(text.length>this.config.maxMessageLength)text=text.substring(0,this.config.maxMessageLength);
        if(text && !/[.!?]$/.test(text))text+='.';
        return text||'';
    }

    async speak(text,username=null){
        let t=this.cleanText(text);
        if(!t||t.length<this.config.minMessageLength){this.stats.totalSkipped++;return}
        if(username&&this.config.readUsername)t=`${username} пишет: ${t}`;

        return new Promise((res,rej)=>{
            const py=spawn(this.config.pythonPath,[this.config.sileroScript],{cwd:__dirname,env:{...process.env,PYTHONUNBUFFERED:'1',PYTHONIOENCODING:'utf-8'}});
            py.stdin.write(JSON.stringify({text:t,speaker:this.config.sileroVoice}));py.stdin.end();

            const ff=spawn(this.config.ffmpegPath,['-f','s16le','-ar','24000','-ac','1','-i','pipe:0','-af',`volume=${this.config.volume}`,'-f','s16le','-ar','22050','-ac','1','pipe:1']);
            const spk=new speaker({channels:1,bitDepth:16,sampleRate:22050});

            py.stdout.pipe(ff.stdin);
            ff.stdout.pipe(spk);

            py.stderr.on('data',d=>console.log(d.toString().trim()));
            spk.on('close',()=>{this.stats.totalRead++;res()});
            py.on('error',rej);
            py.on('close',c=>{if(c!==0&&c!==null)rej(new Error(`Python exit ${c}`))});
        });
    }

    async addToQueue(t,u){this.queue.push({text:t,username:u});if(!this.isReading)await this.processQueue()}
    async processQueue(){
        if(this.isReading||this.queue.length===0)return;
        this.isReading=true;
        while(this.queue.length>0){
            const i=this.queue.shift();
            try{await this.speak(i.text,i.username);
                if(this.queue.length>0)await new Promise(r=>setTimeout(r,this.config.queueDelay));
            }catch(e){console.error(e)}
        }
        this.isReading=false;
    }
    clearQueue(){this.queue=[]}
    getStats(){return this.stats}
}

class TwitchTTSBot{
    constructor(c){this.config=c;this.tts=new SileroTTSV5(c);this.connected=false;
        this.client=new tmi.Client({channels:[c.channel]});this.setup()}
    setup(){
        this.client.on('connected',()=>{this.connected=true;console.log(`Подключено к ${this.config.channel} | Голос: ${this.config.sileroVoice} | Громкость: ${Math.round(this.config.volume*100)}%`)});
        this.client.on('message',async(ch,tags,msg,self)=>{
            if(self)return;
            const u=tags['display-name']||tags.username;
            this.tts.stats.totalMessages++;
            if(this.shouldIgnore(msg,u))return;
            console.log(`${u} >> ${msg}`);
            await this.tts.addToQueue(msg,u);
        });
        this.client.on('disconnected',r=>{this.connected=false;console.log('Отключено:',r)});
    }
    shouldIgnore(m,u){
        if(this.config.ignoreCommands&&m.startsWith('!')){this.tts.stats.totalSkipped++;return true}
        if(this.config.ignoreBots&&this.config.ignoredUsers.includes(u.toLowerCase())){this.tts.stats.totalSkipped++;return true}
        if(this.config.ignoreLinks&&/https?:\/\//.test(m)){this.tts.stats.totalSkipped++;return true}
        if(m.length<this.config.minMessageLength){this.tts.stats.totalSkipped++;return true}
        return false;
    }
    async start(){await this.client.connect()}
    stop(){
        const s=this.tts.getStats();
        console.log('\nСТАТИСТИКА');
        console.log(`Всего: ${s.totalMessages} | Озвучено: ${s.totalRead} | Пропущено: ${s.totalSkipped}`);
        this.tts.clearQueue();this.client.disconnect();
    }
}

const bot = new TwitchTTSBot(CONFIG);
bot.start();

process.on('SIGINT',()=>{bot.stop();process.exit(0)});
process.on('uncaughtException',e=>{console.error('Ошибка:',e);bot.stop();process.exit(1)});