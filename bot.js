const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const http = require('http')
const QRCode = require('qrcode')

let lastQR = ''

const server = http.createServer(async (req,res)=>{
  if(req.url==='/qr' && lastQR){
    const qrImage = await QRCode.toDataURL(lastQR)
    res.writeHead(200,{'Content-Type':'text/html'})
    res.end(`<h2>Scan QR ini pakai WA Bot</h2><img src="${qrImage}" width="300"/><br><p>Refresh kalau ganti</p><script>setTimeout(()=>location.reload(),15000)</script>`)
  } else {
    res.end('Buka /qr untuk lihat QR')
  }
})
server.listen(process.env.PORT||3000)

async function start(){
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({version, auth: state, logger: P({level:'silent'}), printQRInTerminal: false, browser:['Bot','Chrome','1.0']})
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', u=>{
    const { qr, connection } = u
    if(qr){
      lastQR = qr
      console.log('QR BARU MUNCUL, BUKA: https://'+process.env.RAILWAY_PUBLIC_DOMAIN+'/qr')
    }
    if(connection==='open') console.log('BOT AKTIF QR - BERHASIL!')
    if(connection==='close') setTimeout(start,5000)
  })
}
start()
