const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const http = require('http')
http.createServer((a,b)=>b.end('BOT ON')).listen(process.env.PORT||3000)

async function start(){
 if(fs.existsSync('auth') && !fs.existsSync('auth/creds.json')){
   fs.rmSync('auth',{recursive:true,force:true})
 }
 const { state, saveCreds } = await useMultiFileAuthState('auth')
 const sock = makeWASocket({auth: state, logger: P({level:'silent'}), printQRInTerminal:false})
 sock.ev.on('creds.update', saveCreds)
 let sudahMinta = false
 sock.ev.on('connection.update', async (u)=>{
   if(u.connection==='connecting' && !state.creds.registered && !sudahMinta){
     sudahMinta=true
     setTimeout(async()=>{
       try{
         const kode = await sock.requestPairingCode('6285161112562')
         console.log('KODE PAIRING BOS:', kode)
       }catch(e){ console.log('GAGAL:', e.message); sudahMinta=false }
     },5000)
   }
   if(u.connection==='open') console.log('BOT AKTIF')
   if(u.connection==='close'){ console.log('CLOSE'); setTimeout(start,3000) }
 })
}
start()
