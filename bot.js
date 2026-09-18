const fs = require('fs')
if(fs.existsSync('auth') && !fs.existsSync('auth/creds.json')){
  fs.rmSync('auth',{recursive:true,force:true})
}
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys')
const P = require('pino')
const ExcelJS = require('exceljs')
const http = require('http')
http.createServer((a,b)=>b.end('ON')).listen(process.env.PORT||3000)

const NOMOR_BOT = '6285161112562'
const FILE_EXCEL = 'rekap.xlsx'
let lagiPairing = false

async function start(){
 if(fs.existsSync('rekap.xlsx')==false){
   const wb = new ExcelJS.Workbook()
   const ws = wb.addWorksheet('Rekap')
   ws.addRow(['Waktu','Pengirim','IMEI'])
   await wb.xlsx.writeFile('rekap.xlsx')
 }
 const { version } = await fetchLatestBaileysVersion()
 const { state, saveCreds } = await useMultiFileAuthState('auth')
 const sock = makeWASocket({version, auth: state, logger: P({level:'silent'}), printQRInTerminal:false, browser:['Bot','Chrome','1.0']})
 sock.ev.on('creds.update', saveCreds)

 if(!state.creds.registered && !lagiPairing){
   lagiPairing = true
   await delay(4000)
   try{
     const kode = await sock.requestPairingCode(NOMOR_BOT)
     console.log(`\nKODE PAIRING BOS: ${kode}\nJANGAN REDEPLOY SELAMA 90 DETIK! CEPAT MASUKIN DI HP!\n`)
     // kasih waktu 90 detik buat input, baru boleh reconnect
     await delay(90000)
     lagiPairing = false
     if(!state.creds.registered){
       console.log('Belum berhasil, bikin kode baru...')
       start()
     }
   }catch(e){ console.log('Gagal',e.message); lagiPairing=false; await delay(10000); start() }
 }

 sock.ev.on('connection.update', async u=>{
   if(u.connection==='open'){ console.log('BOT AKTIF FINAL'); lagiPairing=false }
   if(u.connection==='close' && state.creds.registered){
     console.log('CLOSE, reconnect...')
     await delay(5000); start()
   }
   // kalau belum registered dan lagi pairing, JANGAN reconnect dulu!
 })
}
start()
