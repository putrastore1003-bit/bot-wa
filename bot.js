const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const ExcelJS = require('exceljs')
const http = require('http')

// biar Railway gak nganggap crash
http.createServer((a,b)=>b.end('BOT FINAL ON')).listen(process.env.PORT||3000)

const NOMOR_BOT = '6285161112562' // ganti kalau beda
const ADMIN = ['62895410444340@s.whatsapp.net'] // nomor admin penerima rekap
const FILE_EXCEL = 'rekap.xlsx'

async function initExcel(){
  if(!fs.existsSync(FILE_EXCEL)){
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Rekap')
    ws.addRow(['Waktu','Pengirim','Pesan','No IMEI'])
    await wb.xlsx.writeFile(FILE_EXCEL)
  }
}

async function start(){
 await initExcel()
 const { state, saveCreds } = await useMultiFileAuthState('auth')
 const sock = makeWASocket({
   auth: state,
   logger: P({level:'silent'}),
   printQRInTerminal: false, // MATIIN QR, PAKAI PAIRING
   browser: ['Bot WA Final','Chrome','1.0']
 })
 sock.ev.on('creds.update', saveCreds)

 let mintaKode = false
 sock.ev.on('connection.update', async (u)=>{
   const { connection } = u
   if(connection==='connecting' && !state.creds.registered && !mintaKode){
     mintaKode = true
     await delay(4000)
     try{
       const kode = await sock.requestPairingCode(NOMOR_BOT)
       console.log(`KODE PAIRING BOS: ${kode}`)
       console.log('Masukkan di WA > Perangkat Tertaut > Tautkan dg nomor telp')
     }catch(e){
       console.log('Gagal minta kode:', e.message)
       mintaKode = false
     }
   }
   if(connection==='open'){
     console.log('BOT AKTIF FINAL')
     mintaKode = false
   }
   if(connection==='close'){
     console.log('CLOSE, reconnect...')
     setTimeout(start, 3000)
   }
 })

 // FITUR REKAP IMEI
 sock.ev.on('messages.upsert', async ({messages})=>{
   try{
     const m = messages[0]
     if(!m.message || m.key.fromMe) return
     const text = m.message.conversation || m.message.extendedTextMessage?.text || ''
     if(!text) return

     // cari IMEI 15 digit
     const imeiMatch = text.match(/\b\d{15}\b/g)
     if(imeiMatch){
       const wb = new ExcelJS.Workbook()
       await wb.xlsx.readFile(FILE_EXCEL)
       const ws = wb.getWorksheet('Rekap')
       const pengirim = m.pushName || m.key.remoteJid
       for(const imei of imeiMatch){
         ws.addRow([new Date().toLocaleString('id-ID'), pengirim, text, imei])
       }
       await wb.xlsx.writeFile(FILE_EXCEL)
       
       await sock.sendMessage(m.key.remoteJid, {text: `✅ IMEI ${imeiMatch.join(', ')} dicatat bos!`})
       
       // forward ke admin
       for(const adm of ADMIN){
         await sock.sendMessage(adm, {text: `IMEI Baru dari ${pengirim}:\n${imeiMatch.join('\n')}\nPesan: ${text}`})
       }
     }
   }catch(e){ console.log('Error msg:', e.message) }
 })
}
start()
