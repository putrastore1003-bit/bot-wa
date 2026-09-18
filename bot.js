const fs = require('fs')
if(fs.existsSync('auth') && !fs.existsSync('auth/creds.json')){
  fs.rmSync('auth',{recursive:true,force:true})
}const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const ExcelJS = require('exceljs')
const http = require('http')
http.createServer((a,b)=>b.end('BOT FINAL ON')).listen(process.env.PORT||3000)

const NOMOR_BOT = '6285161112562'
const ADMIN = ['62895410444340@s.whatsapp.net']
const FILE_EXCEL = 'rekap.xlsx'

async function initExcel(){
  if(!fs.existsSync(FILE_EXCEL)){
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Rekap')
    ws.addRow(['Waktu','Pengirim','Pesan','IMEI'])
    await wb.xlsx.writeFile(FILE_EXCEL)
  }
}

async function start(){
 await initExcel()
 const { version } = await fetchLatestBaileysVersion()
 const { state, saveCreds } = await useMultiFileAuthState('auth')
 const sock = makeWASocket({
   version,
   auth: state,
   logger: P({level:'silent'}),
   printQRInTerminal: false,
   browser: ['Bot Final','Chrome','1.0']
 })
 sock.ev.on('creds.update', saveCreds)

 if(!state.creds.registered){
   await delay(5000)
   try{
     const kode = await sock.requestPairingCode(NOMOR_BOT)
     console.log('============================')
     console.log(`KODE PAIRING BOS: ${kode}`)
     console.log('Kode tahan 60 detik, masukin sekarang!')
     console.log('WA > Perangkat Tertaut > Tautkan dg nomor telp')
     console.log('============================')
   }catch(e){
     console.log('Gagal minta kode:', e.message)
   }
 }

 sock.ev.on('connection.update', async (u)=>{
   if(u.connection==='open'){
     console.log('BOT AKTIF FINAL')
   }
   if(u.connection==='close'){
     const registered = state.creds.registered
     console.log(`CLOSE, registered=${registered}, tunggu 10 detik...`)
     // kalau belum pairing, kasih waktu 60 detik jangan langsung reconnect
     await delay(registered? 3000 : 15000)
     start()
   }
 })

 sock.ev.on('messages.upsert', async ({messages})=>{
   const m = messages[0]
   if(!m?.message || m.key.fromMe) return
   const text = m.message.conversation || m.message.extendedTextMessage?.text || ''
   const imei = text.match(/\b\d{15}\b/g)
   if(imei){
     try{
       const wb = new ExcelJS.Workbook()
       await wb.xlsx.readFile(FILE_EXCEL)
       const ws = wb.getWorksheet('Rekap')
       ws.addRow([new Date().toLocaleString('id-ID'), m.pushName||m.key.remoteJid, text, imei.join(',')])
       await wb.xlsx.writeFile(FILE_EXCEL)
       await sock.sendMessage(m.key.remoteJid, {text: `✅ IMEI ${imei.join(', ')} dicatat!`})
       for(const a of ADMIN) await sock.sendMessage(a, {text: `IMEI Baru dari ${m.pushName}: ${imei.join(', ')}`})
     }catch(e){ console.log(e.message) }
   }
 })
}
start()
